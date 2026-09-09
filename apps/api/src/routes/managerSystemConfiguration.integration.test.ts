import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import type { Server } from "node:http";
import express from "express";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { createServiceVisit } from "../jobs/serviceVisits.js";
import { createManagerCustomersRouter, ManagerCustomerError } from "./managerCustomers.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
// Frozen V7 demo customer: dry_wet_riser enabled (sort 7, { riserMode: "dry" }),
// plus fire_alarm_detector / co2 / wet_chemical (both with zone+location) /
// hydrant / hose_reel / automatic_sprinkler.
const demoV7CustomerId = "00000000-0000-4000-8000-000000000900";
const demoV7SiteId = "00000000-0000-4000-8000-000000000909";
// Operational V5 customer WITHOUT dry_wet_riser — used for the fresh-enable path.
const makSitiId = "00000000-0000-4000-8000-000000000830";
const makSitiSiteId = "00000000-0000-4000-8000-000000000832";

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function riserModeOf(snapshot: unknown, systemKey: string) {
  const systems = (snapshot as { enabledSystems?: Array<Record<string, unknown>> }).enabledSystems ?? [];
  const system = systems.find((entry) => entry.systemKey === systemKey);
  return system?.systemConfiguration as { riserMode?: string } | undefined;
}

test("Manager system-configuration save versions the map, freezes it into new jobs only", { skip: !databaseUrl }, async () => {
  assert.equal(new URL(databaseUrl!).pathname, "/phase6_seed_integration", "system-configuration integration only permits its dedicated database");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const userId = (await pool.query<{ id: number }>(
      "INSERT INTO users(username,password_hash,role) VALUES('system-configuration-manager','x','admin') RETURNING id"
    )).rows[0]!.id;
    await pool.query("UPDATE customers SET is_demo=false WHERE id=$1", [demoV7CustomerId]);

    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { request.currentUser = { id: userId, username: "system-configuration-manager", role: "admin" }; next(); });
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
    const configPath = `/manager/customers/${demoV7CustomerId}/systems/dry_wet_riser/system-configuration`;

    // A job cloned BEFORE the PUT freezes the current { riserMode: "dry" }.
    const visitBeforeClient = await pool.connect();
    let jobBeforeId: string;
    try {
      jobBeforeId = (await createServiceVisit(visitBeforeClient, { requestId: randomUUID(), customerId: demoV7CustomerId, siteId: demoV7SiteId, systemKeys: ["dry_wet_riser", "hydrant"] }, userId)).id;
    } finally { visitBeforeClient.release(); }

    try {
      // GET returns the server-authoritative schema + the stored configuration.
      const getResponse = await call("GET", configPath);
      assert.equal(getResponse.status, 200, JSON.stringify(await getResponse.clone().json()));
      const got = await getResponse.json() as { systemKey: string; templateVersion: number; schema: { fields: Array<Record<string, unknown>> }; configuration: Record<string, unknown> };
      assert.equal(got.systemKey, "dry_wet_riser");
      assert.equal(got.templateVersion, 7);
      assert.deepEqual(got.configuration, { riserMode: "dry" });
      assert.deepEqual(got.schema, {
        fields: [{
          key: "riserMode", label: "Riser mode", control: "select", required: true,
          options: [{ value: "dry", label: "Dry" }, { value: "wet", label: "Wet" }]
        }]
      });

      // Invalid payloads are rejected and create NO revision.
      const activeBefore = (await pool.query<{ id: string }>("SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [demoV7CustomerId])).rows[0]!.id;
      assert.equal((await call("PUT", configPath, { systemConfiguration: { riserMode: "damp" } })).status, 400);
      assert.equal((await call("PUT", configPath, { systemConfiguration: { riserMode: "wet", extra: 1 } })).status, 400);
      assert.equal((await call("PUT", configPath, { systemConfiguration: {}, other: 1 })).status, 400);
      assert.equal((await pool.query<{ id: string }>("SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [demoV7CustomerId])).rows[0]!.id, activeBefore, "rejected writes create no revision");

      // Valid save.
      const save = await call("PUT", configPath, { systemConfiguration: { riserMode: "wet" } });
      assert.equal(save.status, 200, JSON.stringify(await save.clone().json()));
      const saved = await save.json() as { systemKey: string; templateVersion: number; schema: unknown; configuration: Record<string, unknown>; customer: { configuration: { revision: number } } };
      assert.deepEqual(saved.configuration, { riserMode: "wet" });
      assert.equal(saved.systemKey, "dry_wet_riser");
      assert.deepEqual(saved.schema, got.schema);
      assert.ok(typeof saved.customer.configuration.revision === "number");
    } finally { await close(server); }

    // Revision bump: previous superseded keeps { riserMode: "dry" }; the new
    // active revision carries { riserMode: "wet" } on dry_wet_riser only.
    const rows = await pool.query<{ status: string; systemKey: string; config: Record<string, unknown> }>(
      `SELECT revision.status, enabled.system_key AS "systemKey", enabled.system_configuration AS config
       FROM customer_configuration_revisions revision
       INNER JOIN customer_enabled_systems enabled ON enabled.configuration_revision_id = revision.id
       WHERE revision.customer_id=$1 ORDER BY revision.revision, enabled.sort_order`, [demoV7CustomerId]);
    const superseded = rows.rows.filter((row) => row.status === "superseded");
    const active = rows.rows.filter((row) => row.status === "active");
    assert.deepEqual(superseded.find((row) => row.systemKey === "dry_wet_riser")!.config, { riserMode: "dry" });
    for (const row of active) {
      assert.deepEqual(
        row.config,
        row.systemKey === "dry_wet_riser" ? { riserMode: "wet" } : {},
        `${row.systemKey} system_configuration`
      );
    }
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='manager_customer_system_configuration_updated' AND actor_user_id=$1", [userId])).rows[0]!.n, 1);

    // label_overrides / zones / locations forward-copied unchanged (CO2 authority).
    const authority = async (status: "active" | "superseded") => (await pool.query<{ zones: number; locations: number; labels: string }>(
      `SELECT
         (SELECT count(*)::int FROM customer_system_zones z JOIN customer_enabled_systems e ON e.id=z.enabled_system_id
            JOIN customer_configuration_revisions r ON r.id=e.configuration_revision_id
           WHERE r.customer_id=$1 AND r.status=$2 AND e.system_key='co2_fire_extinguisher') AS zones,
         (SELECT count(*)::int FROM customer_system_locations l JOIN customer_enabled_systems e ON e.id=l.enabled_system_id
            JOIN customer_configuration_revisions r ON r.id=e.configuration_revision_id
           WHERE r.customer_id=$1 AND r.status=$2 AND e.system_key='co2_fire_extinguisher') AS locations,
         (SELECT e.label_overrides::text FROM customer_enabled_systems e
            JOIN customer_configuration_revisions r ON r.id=e.configuration_revision_id
           WHERE r.customer_id=$1 AND r.status=$2 AND e.system_key='co2_fire_extinguisher') AS labels`,
      [demoV7CustomerId, status])).rows[0]!;
    const supersededAuthority = await authority("superseded");
    const activeAuthority = await authority("active");
    assert.ok(supersededAuthority.zones > 0 && supersededAuthority.locations > 0, "seed CO2 authority is non-trivial");
    assert.deepEqual(activeAuthority, supersededAuthority, "system_configuration edit forward-copies zones, locations and label_overrides unchanged");

    // Freeze: a job created AFTER the save carries { riserMode: "wet" } for
    // dry_wet_riser and NO systemConfiguration key on hydrant.
    const visitAfterClient = await pool.connect();
    let jobAfterId: string;
    try {
      jobAfterId = (await createServiceVisit(visitAfterClient, { requestId: randomUUID(), customerId: demoV7CustomerId, siteId: demoV7SiteId, systemKeys: ["dry_wet_riser", "hydrant"] }, userId)).id;
    } finally { visitAfterClient.release(); }

    const snapshotOf = async (jobId: string) => (await pool.query<{ snapshot: unknown }>(
      "SELECT configuration_snapshot AS snapshot FROM inspection_jobs WHERE id=$1", [jobId]
    )).rows[0]!.snapshot;
    const beforeSnapshot = await snapshotOf(jobBeforeId);
    const afterSnapshot = await snapshotOf(jobAfterId);
    assert.deepEqual(riserModeOf(beforeSnapshot, "dry_wet_riser"), { riserMode: "dry" }, "job created before the save keeps the old frozen systemConfiguration");
    assert.deepEqual(riserModeOf(afterSnapshot, "dry_wet_riser"), { riserMode: "wet" }, "job created after the save freezes the new systemConfiguration");
    const afterSystems = (afterSnapshot as { enabledSystems: Array<Record<string, unknown>> }).enabledSystems;
    const hydrant = afterSystems.find((entry) => entry.systemKey === "hydrant")!;
    assert.ok(!Object.hasOwn(hydrant, "systemConfiguration"), "a non-dry_wet_riser system freezes NO systemConfiguration key");
  } finally { await pool.end(); }
});

test("system-configuration endpoints: auth matrix, unsupported system, system-not-enabled, malformed body", { skip: !databaseUrl }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const userId = (await pool.query<{ id: number }>(
      "INSERT INTO users(username,password_hash,role) VALUES('sc-auth','x','admin') RETURNING id"
    )).rows[0]!.id;
    await pool.query("UPDATE customers SET is_demo=false WHERE id=$1", [demoV7CustomerId]);

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
    const riserPath = `/manager/customers/${demoV7CustomerId}/systems/dry_wet_riser/system-configuration`;

    try {
      // Auth: admin-only, both verbs.
      for (const [method, body] of [["GET", undefined], ["PUT", { systemConfiguration: { riserMode: "wet" } }]] as const) {
        assert.equal((await call(method, riserPath, undefined, body)).status, 401, `${method} unauthenticated`);
        assert.equal((await call(method, riserPath, "inspector", body)).status, 403, `${method} inspector`);
      }

      // Unsupported system: 404 before any write.
      const co2Path = `/manager/customers/${demoV7CustomerId}/systems/co2_fire_extinguisher/system-configuration`;
      assert.equal((await call("GET", co2Path, "admin")).status, 404);
      const co2Put = await call("PUT", co2Path, "admin", { systemConfiguration: { anything: 1 } });
      assert.equal(co2Put.status, 404);
      assert.equal((await co2Put.json() as { error: string }).error, "SYSTEM_CONFIGURATION_UNSUPPORTED_SYSTEM");

      // Supported key but system not enabled for this customer.
      const notEnabled = await call("GET", `/manager/customers/${makSitiId}/systems/dry_wet_riser/system-configuration`, "admin");
      assert.equal(notEnabled.status, 404);
      assert.equal((await notEnabled.json() as { error: string }).error, "SYSTEM_NOT_ENABLED");

      // Malformed body key rejected.
      assert.equal((await call("PUT", riserPath, "admin", { systemConfiguration: { riserMode: "wet" }, extra: 1 })).status, 400);
    } finally { await close(server); }
  } finally { await pool.end(); }
});

test("configuration-revisions enables dry_wet_riser atomically with an inline systemConfiguration", { skip: !databaseUrl }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const userId = (await pool.query<{ id: number }>(
      "INSERT INTO users(username,password_hash,role) VALUES('sc-revision','x','admin') RETURNING id"
    )).rows[0]!.id;

    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { request.currentUser = { id: userId, username: "sc-revision", role: "admin" }; next(); });
    app.use(createManagerCustomersRouter(pool));
    app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      if (error instanceof ManagerCustomerError) response.status(error.status).json({ error: error.code, message: error.message });
      else response.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : String(error) });
    });
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    const call = (path: string, body: unknown) => fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const revisionsPath = `/manager/customers/${makSitiId}/configuration-revisions`;

    try {
      const activeBefore = (await pool.query<{ id: string }>("SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [makSitiId])).rows[0]!.id;

      // WITHOUT an inline riserMode: still RISER_MODE_REQUIRED, no revision.
      const missing = await call(revisionsPath, { systemKeys: ["hose_reel", "dry_wet_riser"] });
      assert.equal(missing.status, 400);
      assert.equal((await missing.json() as { error: string }).error, "RISER_MODE_REQUIRED");
      assert.equal((await pool.query<{ id: string }>("SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [makSitiId])).rows[0]!.id, activeBefore, "rejected activation creates no revision");

      // Inline systemConfiguration for a key not in systemKeys / not supported -> 400.
      assert.equal((await call(revisionsPath, { systemKeys: ["hose_reel", "dry_wet_riser"], systemConfiguration: { hose_reel: { riserMode: "wet" } } })).status, 400);
      assert.equal((await call(revisionsPath, { systemKeys: ["hose_reel", "dry_wet_riser"], systemConfiguration: { dry_wet_riser: { riserMode: "sideways" } } })).status, 400);
      assert.equal((await pool.query<{ id: string }>("SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [makSitiId])).rows[0]!.id, activeBefore, "invalid inline systemConfiguration creates no revision");

      // WITH an inline riserMode: one atomic revision that enables + configures.
      const enabled = await call(revisionsPath, { systemKeys: ["hose_reel", "dry_wet_riser"], systemConfiguration: { dry_wet_riser: { riserMode: "wet" } } });
      assert.equal(enabled.status, 201, JSON.stringify(await enabled.clone().json()));
      const activeRows = await pool.query<{ systemKey: string; config: Record<string, unknown> }>(
        `SELECT enabled.system_key AS "systemKey", enabled.system_configuration AS config
         FROM customer_enabled_systems enabled
         INNER JOIN customer_configuration_revisions revision ON revision.id = enabled.configuration_revision_id
         WHERE revision.customer_id=$1 AND revision.status='active' ORDER BY enabled.sort_order`, [makSitiId]);
      assert.deepEqual(activeRows.rows.map((row) => row.systemKey).sort(), ["dry_wet_riser", "hose_reel"]);
      assert.deepEqual(activeRows.rows.find((row) => row.systemKey === "dry_wet_riser")!.config, { riserMode: "wet" });
      assert.deepEqual(activeRows.rows.find((row) => row.systemKey === "hose_reel")!.config, {});

      // A new job freezes the riserMode.
      const visitClient = await pool.connect();
      let jobId: string;
      try {
        jobId = (await createServiceVisit(visitClient, { requestId: randomUUID(), customerId: makSitiId, siteId: makSitiSiteId, systemKeys: ["dry_wet_riser"] }, userId)).id;
      } finally { visitClient.release(); }
      const snapshot = (await pool.query<{ snapshot: unknown }>("SELECT configuration_snapshot AS snapshot FROM inspection_jobs WHERE id=$1", [jobId])).rows[0]!.snapshot;
      assert.deepEqual(riserModeOf(snapshot, "dry_wet_riser"), { riserMode: "wet" });
    } finally { await close(server); }
  } finally { await pool.end(); }
});
