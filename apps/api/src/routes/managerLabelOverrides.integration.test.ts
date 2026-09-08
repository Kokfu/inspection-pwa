import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import type { Server } from "node:http";
import express from "express";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { createServiceVisit } from "../jobs/serviceVisits.js";
import { applyLabelOverrides, collectResolvedLabelPaths } from "../inspections/labelOverrides.js";
import { resolveCo2Controls } from "../inspections/templates/co2DefinitionControls.js";
import { createManagerCustomersRouter, ManagerCustomerError } from "./managerCustomers.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
const demoCo2CustomerId = "00000000-0000-4000-8000-000000000670";
const seedCo2JobId = "00000000-0000-4000-8000-000000000679";
const overridePath = "chargerAndBatteries.main_supply";
const overrideLabel = "Primary Mains Feed";

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("Manager label-override save versions the map, freezes it into new jobs only, and renders per job", { skip: !databaseUrl }, async () => {
  assert.equal(new URL(databaseUrl!).pathname, "/phase6_seed_integration", "label-override integration only permits its dedicated database");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const userId = (await pool.query<{ id: number }>(
      "INSERT INTO users(username,password_hash,role) VALUES('label-override-manager','x','admin') RETURNING id"
    )).rows[0]!.id;
    await pool.query("UPDATE customers SET is_demo=false WHERE id=$1", [demoCo2CustomerId]);
    const site = (await pool.query<{ id: string; display_name: string }>(
      "SELECT id, display_name FROM customer_sites WHERE customer_id=$1 AND is_active=true ORDER BY site_code LIMIT 1", [demoCo2CustomerId]
    )).rows[0]!;
    assert.ok(site, "demo CO2 customer must have an active site");

    // "Job before" — a copy of the seed CO2 job, frozen while no override exists.
    const jobBeforeId = randomUUID();
    await pool.query(`INSERT INTO inspection_jobs(
        id, template_id, master_template_version_id, job_reference, title, status, is_sample,
        technician_visible, customer_id, customer_configuration_revision_id, configuration_snapshot, site_id, service_date
      ) SELECT $1, template_id, master_template_version_id, $2, title, 'open', false, true,
        customer_id, customer_configuration_revision_id, configuration_snapshot, site_id, service_date
      FROM inspection_jobs WHERE id=$3`, [jobBeforeId, `SV-LOBEFORE-${jobBeforeId.slice(0, 8)}`, seedCo2JobId]);

    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { request.currentUser = { id: userId, username: "label-override-manager", role: "admin" }; next(); });
    app.use(createManagerCustomersRouter(pool));
    app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      if (error instanceof ManagerCustomerError) response.status(error.status).json({ error: error.code, message: error.message });
      else response.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : String(error) });
    });
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    const call = (method: "GET" | "PUT", path: string, body?: unknown) => fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined
    });

    try {
      // GET the resolved label tree for the customer's frozen version.
      const treeResponse = await call("GET", `/manager/customers/${demoCo2CustomerId}/systems/co2_fire_extinguisher/label-overrides`);
      assert.equal(treeResponse.status, 200);
      const tree = await treeResponse.json() as { labels: Array<{ path: string; definitionLabel: string; effectiveLabel: string; overridden: boolean }>; overrides: Record<string, string> };
      const target = tree.labels.find((entry) => entry.path === overridePath);
      assert.ok(target, "resolved tree exposes chargerAndBatteries.main_supply");
      assert.equal(target!.overridden, false);
      assert.deepEqual(tree.overrides, {});
      const definitionLabel = target!.definitionLabel;
      assert.notEqual(definitionLabel, overrideLabel);

      // Unknown path and over-long value are rejected; nothing is written.
      const activeBefore = (await pool.query<{ id: string }>("SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [demoCo2CustomerId])).rows[0]!.id;
      assert.equal((await call("PUT", `/manager/customers/${demoCo2CustomerId}/systems/co2_fire_extinguisher/label-overrides`, { labelOverrides: { "not.a.real.path": "X" } })).status, 400);
      assert.equal((await call("PUT", `/manager/customers/${demoCo2CustomerId}/systems/co2_fire_extinguisher/label-overrides`, { labelOverrides: { [overridePath]: "y".repeat(201) } })).status, 400);
      assert.equal((await pool.query<{ id: string }>("SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [demoCo2CustomerId])).rows[0]!.id, activeBefore, "rejected writes create no revision");

      // Valid save.
      const save = await call("PUT", `/manager/customers/${demoCo2CustomerId}/systems/co2_fire_extinguisher/label-overrides`, { labelOverrides: { [overridePath]: `  ${overrideLabel}  ` } });
      assert.equal(save.status, 200, JSON.stringify(await save.clone().json()));
      const saved = await save.json() as { labels: Array<{ path: string; effectiveLabel: string; overridden: boolean }>; overrides: Record<string, string> };
      assert.deepEqual(saved.overrides, { [overridePath]: overrideLabel }, "value is trimmed and stored");
      assert.equal(saved.labels.find((entry) => entry.path === overridePath)!.effectiveLabel, overrideLabel);

      // Revision bump: previous superseded, new active carries the map on co2 only.
      const revisions = await pool.query<{ status: string; overrides: Record<string, string>; systemKey: string }>(
        `SELECT revision.status, enabled.label_overrides AS overrides, enabled.system_key AS "systemKey"
         FROM customer_configuration_revisions revision
         INNER JOIN customer_enabled_systems enabled ON enabled.configuration_revision_id = revision.id
         WHERE revision.customer_id=$1 ORDER BY revision.revision, enabled.sort_order`, [demoCo2CustomerId]);
      const active = revisions.rows.filter((row) => row.status === "active");
      const superseded = revisions.rows.filter((row) => row.status === "superseded");
      assert.ok(superseded.length >= 1 && superseded.every((row) => Object.keys(row.overrides).length === 0), "previous revision has no overrides and is superseded");
      assert.equal(active.length, 1);
      assert.deepEqual(active[0]!.overrides, { [overridePath]: overrideLabel });
      assert.equal(active[0]!.systemKey, "co2_fire_extinguisher");
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='manager_customer_label_overrides_updated' AND actor_user_id=$1", [userId])).rows[0]!.n, 1);
    } finally { await close(server); }

    // Freeze: a job created AFTER the save carries the override in its snapshot.
    const visitClient = await pool.connect();
    let jobAfterId: string;
    try {
      jobAfterId = (await createServiceVisit(visitClient, { requestId: randomUUID(), customerId: demoCo2CustomerId, siteId: site.id, systemKeys: ["co2_fire_extinguisher"] }, userId)).id;
    } finally { visitClient.release(); }

    const frozen = async (jobId: string) => (await pool.query<{ labelOverrides: unknown; templateId: string }>(
      `SELECT master_template_version_id AS "templateId",
        (SELECT s.system->'labelOverrides' FROM jsonb_array_elements(configuration_snapshot->'enabledSystems') s(system)
          WHERE s.system->>'systemKey'='co2_fire_extinguisher' LIMIT 1) AS "labelOverrides"
       FROM inspection_jobs WHERE id=$1`, [jobId])).rows[0]!;
    const before = await frozen(jobBeforeId);
    const after = await frozen(jobAfterId);
    assert.equal(before.labelOverrides, null, "job created before the save has no frozen override");
    assert.deepEqual(after.labelOverrides, { [overridePath]: overrideLabel }, "job created after the save freezes the override");

    // Accepted-Detail render: the exact `configuration_snapshot` join + applyLabelOverrides
    // the route uses. New job renders the override; old job renders the definition label.
    const definitionFor = async (templateId: string) => (await pool.query<{ definition: unknown }>(
      "SELECT definition FROM master_service_report_systems WHERE template_version_id=$1 AND system_key='co2_fire_extinguisher'", [templateId]
    )).rows[0]!.definition;
    const renderLabel = async (jobId: string) => {
      const job = await frozen(jobId);
      const version = Number((await pool.query<{ version: number }>("SELECT version FROM master_service_report_templates WHERE id=$1", [job.templateId])).rows[0]!.version);
      const controls = resolveCo2Controls(await definitionFor(job.templateId), "MFE-FSSR", version);
      const rendered = applyLabelOverrides(controls, job.labelOverrides) as ReturnType<typeof resolveCo2Controls>;
      return rendered.chargerAndBatteries.find((item) => item.key === "main_supply")!.label;
    };
    const beforeControls = resolveCo2Controls(await definitionFor(before.templateId), "MFE-FSSR", 1);
    const definitionMainSupplyLabel = beforeControls.chargerAndBatteries.find((item) => item.key === "main_supply")!.label;
    assert.equal(await renderLabel(jobAfterId), overrideLabel, "new job Accepted Detail renders the override");
    assert.equal(await renderLabel(jobBeforeId), definitionMainSupplyLabel, "old job Accepted Detail renders the definition label");
    assert.ok(collectResolvedLabelPaths(beforeControls).some((entry) => entry.path === overridePath));

    // The revision bump forward-copies the rest of the CO2 authority untouched.
    const authority = async (status: "active" | "superseded") => (await pool.query<{ zones: number; locations: number; config: string }>(
      `SELECT
         (SELECT count(*)::int FROM customer_system_zones z JOIN customer_enabled_systems e ON e.id=z.enabled_system_id
            JOIN customer_configuration_revisions r ON r.id=e.configuration_revision_id
           WHERE r.customer_id=$1 AND r.status=$2 AND e.system_key='co2_fire_extinguisher') AS zones,
         (SELECT count(*)::int FROM customer_system_locations l JOIN customer_enabled_systems e ON e.id=l.enabled_system_id
            JOIN customer_configuration_revisions r ON r.id=e.configuration_revision_id
           WHERE r.customer_id=$1 AND r.status=$2 AND e.system_key='co2_fire_extinguisher') AS locations,
         (SELECT e.system_configuration::text FROM customer_enabled_systems e
            JOIN customer_configuration_revisions r ON r.id=e.configuration_revision_id
           WHERE r.customer_id=$1 AND r.status=$2 AND e.system_key='co2_fire_extinguisher') AS config`,
      [demoCo2CustomerId, status])).rows[0]!;
    const supersededAuthority = await authority("superseded");
    const activeAuthority = await authority("active");
    assert.ok(supersededAuthority.zones > 0 && supersededAuthority.locations > 0, "seed CO2 authority is non-trivial");
    assert.deepEqual(activeAuthority, supersededAuthority, "label edit forward-copies zones, locations and system_configuration unchanged");
  } finally { await pool.end(); }
});

test("label-override endpoints: auth, unsupported system, blank-map clear, and no snapshot key when unset", { skip: !databaseUrl }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const userId = (await pool.query<{ id: number }>(
      "INSERT INTO users(username,password_hash,role) VALUES('lo-auth','x','admin') RETURNING id"
    )).rows[0]!.id;
    await pool.query("UPDATE customers SET is_demo=false WHERE id=$1", [demoCo2CustomerId]);

    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { const role = request.headers["x-role"]; if (role === "admin" || role === "inspector") request.currentUser = { id: userId, username: String(role), role }; next(); });
    app.use(createManagerCustomersRouter(pool));
    app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      if (error instanceof ManagerCustomerError) response.status(error.status).json({ error: error.code });
      else response.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : String(error) });
    });
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    const call = (method: "GET" | "PUT", path: string, role?: "admin" | "inspector", body?: unknown) => fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { ...(role ? { "x-role": role } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const co2Path = `/manager/customers/${demoCo2CustomerId}/systems/co2_fire_extinguisher/label-overrides`;

    try {
      // Auth: admin-only, both verbs.
      for (const [method, body] of [["GET", undefined], ["PUT", { labelOverrides: {} }]] as const) {
        assert.equal((await call(method, co2Path, undefined, body)).status, 401, `${method} unauthenticated`);
        assert.equal((await call(method, co2Path, "inspector", body)).status, 403, `${method} inspector`);
      }
      // Unsupported system: no resolver, 404 before any write.
      const hydrantPath = `/manager/customers/${demoCo2CustomerId}/systems/hydrant/label-overrides`;
      assert.equal((await call("GET", hydrantPath, "admin")).status, 404);
      assert.equal((await call("PUT", hydrantPath, "admin", { labelOverrides: { anything: "x" } })).status, 404);
      // Malformed body key rejected.
      assert.equal((await call("PUT", co2Path, "admin", { labelOverrides: {}, extra: 1 })).status, 400);

      // Save, then clear with {} and re-save — reversible.
      assert.equal((await call("PUT", co2Path, "admin", { labelOverrides: { [overridePath]: overrideLabel } })).status, 200);
      const cleared = await call("PUT", co2Path, "admin", { labelOverrides: {} });
      assert.equal(cleared.status, 200);
      assert.deepEqual((await cleared.json() as { overrides: Record<string, string> }).overrides, {}, "{} clears the override");
      const storedAfterClear = (await pool.query<{ o: Record<string, string> }>(
        `SELECT e.label_overrides AS o FROM customer_enabled_systems e
           JOIN customer_configuration_revisions r ON r.id=e.configuration_revision_id
          WHERE r.customer_id=$1 AND r.status='active' AND e.system_key='co2_fire_extinguisher'`, [demoCo2CustomerId]
      )).rows[0]!.o;
      assert.deepEqual(storedAfterClear, {}, "cleared override is persisted as an empty object");
      assert.equal((await call("PUT", co2Path, "admin", { labelOverrides: { [overridePath]: overrideLabel } })).status, 200, "re-save after clear");
    } finally { await close(server); }

    // P1-1 guard: makSiti's active revision is a seeded V5 with Fire Alarm and no
    // override. A job created for it after migration 027 must carry NO
    // `labelOverrides` key on ANY frozen enabled system, so the strict historical
    // Fire Alarm V3-V5 / Portable acceptors still see the exact pre-027 `system`
    // shape.
    const makSitiId = "00000000-0000-4000-8000-000000000830";
    const makSitiSiteId = "00000000-0000-4000-8000-000000000832";
    const makSitiVersion = Number((await pool.query<{ version: number }>(
      `SELECT template.version FROM customer_configuration_revisions revision
        JOIN master_service_report_templates template ON template.id = revision.template_version_id
       WHERE revision.customer_id=$1 AND revision.status='active'`, [makSitiId])).rows[0]!.version);
    assert.ok(makSitiVersion >= 3 && makSitiVersion <= 5, `makSiti seed must be a strict-historical version (got ${makSitiVersion})`);

    const visitClient = await pool.connect();
    let makSitiJobId: string;
    try {
      makSitiJobId = (await createServiceVisit(visitClient, { requestId: randomUUID(), customerId: makSitiId, siteId: makSitiSiteId, systemKeys: ["fire_alarm_detector"] }, userId)).id;
    } finally { visitClient.release(); }

    const systems = (await pool.query<{ systems: Array<Record<string, unknown>> }>(
      "SELECT configuration_snapshot->'enabledSystems' AS systems FROM inspection_jobs WHERE id=$1", [makSitiJobId]
    )).rows[0]!.systems;
    assert.ok(Array.isArray(systems) && systems.length > 0);
    for (const system of systems) {
      assert.ok(!Object.hasOwn(system, "labelOverrides"), `${String(system.systemKey)}: no-override customer must not freeze a labelOverrides key`);
    }
    const fireAlarm = systems.find((system) => system.systemKey === "fire_alarm_detector")!;
    // Simulate exactly the `{ ...system, definition, resolvedControls, repetitionMode }`
    // spread fireAlarmInspectionSync performs, and confirm the historical
    // `exact(system, [...10 keys])` reader (fireAlarmAccepted.ts) would still accept it.
    const spread = { ...fireAlarm, definition: {}, resolvedControls: {}, repetitionMode: "single_with_two_repeatable_tables" };
    assert.deepEqual(
      Object.keys(spread).sort(),
      ["definition", "definitionStatus", "displayName", "enabledSystemId", "locations", "repetitionMode", "resolvedControls", "sortOrder", "systemKey", "zones"],
      "frozen Fire Alarm system, once spread by the acceptor, has exactly the 10 keys the V3-V5 reader asserts"
    );
  } finally { await pool.end(); }
});
