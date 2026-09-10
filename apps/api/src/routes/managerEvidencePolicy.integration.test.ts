import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import type { Server } from "node:http";
import express from "express";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import {
  automaticSprinklerPsiEvidencePolicyCode,
  automaticSprinklerPsiEvidencePolicyId,
  automaticSprinklerPsiEvidencePolicySha256,
  automaticSprinklerPsiEvidencePolicyV1
} from "../inspections/evidence/automaticSprinklerPsiEvidencePolicyV1.js";
import { createServiceVisit } from "../jobs/serviceVisits.js";
import { syncAutomaticSprinklerInspections } from "../sync/automaticSprinklerInspectionSync.js";
import { createManagerCustomersRouter, ManagerCustomerError } from "./managerCustomers.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;

// V1 automatic_sprinkler demo customer with NO evidence policy assigned.
const demoSprinklerCustomerId = "00000000-0000-4000-8000-000000000700";
const demoSprinklerSiteId = "00000000-0000-4000-8000-000000000703";
// V1 automatic_sprinkler demo customer with the PSI policy ALREADY assigned.
const demoPhotoSprinklerCustomerId = "00000000-0000-4000-8000-000000000720";
const demoPhotoSprinklerSiteId = "00000000-0000-4000-8000-000000000723";
// V7 automatic_sprinkler demo customer (several enabled systems).
const demoV7CustomerId = "00000000-0000-4000-8000-000000000900";
const demoV7SiteId = "00000000-0000-4000-8000-000000000909";
// Operational V5 customer WITHOUT automatic_sprinkler — used for the fresh-enable path.
const makSitiId = "00000000-0000-4000-8000-000000000830";

const policyLabel = `${automaticSprinklerPsiEvidencePolicyCode} v1`;
const evidencePolicyField = { key: "evidencePolicyId", label: "Evidence policy", control: "select", required: false };
const checklistKeys = [
  "saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions",
  "pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator",
  "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions",
  "breaching_inlet", "alarm_gong", "flow_meter_valve_positions", "trfp_jockey_pump", "trfp_duty_pump", "trfp_standby_pump"
];

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function evidencePolicyOf(snapshot: unknown, systemKey: string) {
  const systems = (snapshot as { enabledSystems?: Array<Record<string, unknown>> }).enabledSystems ?? [];
  return systems.find((entry) => entry.systemKey === systemKey);
}

function v7Responses() {
  return {
    schemaVersion: 2,
    checklist: Object.fromEntries(checklistKeys.map((key) => [key, { result: "good", remarks: "" }])),
    measurements: {
      jockey_pump_pressure: { values: { cut_in: 80, cut_out: 100 }, unit: "PSI", result: "good", remarks: "" },
      duty_pump_cut_in: { values: { value: 70 }, unit: "PSI", result: "good", remarks: "" },
      standby_pump_cut_in: { values: { value: 60 }, unit: "PSI", result: "good", remarks: "" },
      water_supply_gauge: { values: { value: 90 }, unit: "PSI", result: "good", remarks: "" },
      installation_gauge: { values: { value: 95 }, unit: "PSI", result: "good", remarks: "" }
    },
    comments: ""
  };
}

test("Manager evidence-policy GET/PUT versions the assignment, freezes it into new jobs only, clears it, and rejects bad ids", { skip: !databaseUrl }, async () => {
  assert.equal(new URL(databaseUrl!).pathname, "/phase6_seed_integration", "evidence-policy integration only permits its dedicated database");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const userId = (await pool.query<{ id: number }>(
      "INSERT INTO users(username,password_hash,role) VALUES('evidence-policy-manager','x','admin') RETURNING id"
    )).rows[0]!.id;
    await pool.query("UPDATE customers SET is_demo=false WHERE id = ANY($1)", [[demoSprinklerCustomerId, demoPhotoSprinklerCustomerId]]);

    // A job cloned BEFORE the PUT — the plain customer has no policy, so it
    // freezes NO evidencePolicy key.
    const beforeClient = await pool.connect();
    let jobBeforeId: string;
    try {
      jobBeforeId = (await createServiceVisit(beforeClient, { requestId: randomUUID(), customerId: demoSprinklerCustomerId, siteId: demoSprinklerSiteId, systemKeys: ["automatic_sprinkler"] }, userId)).id;
    } finally { beforeClient.release(); }

    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { request.currentUser = { id: userId, username: "evidence-policy-manager", role: "admin" }; next(); });
    app.use(createManagerCustomersRouter(pool));
    app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      if (error instanceof ManagerCustomerError) response.status(error.status).json({ error: error.code, message: error.message });
      else response.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : String(error) });
    });
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    const call = (method: "GET" | "PUT", path: string, body?: unknown) => fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body)
    });
    const plainPath = `/manager/customers/${demoSprinklerCustomerId}/systems/automatic_sprinkler/evidence-policy`;
    const photoPath = `/manager/customers/${demoPhotoSprinklerCustomerId}/systems/automatic_sprinkler/evidence-policy`;

    let assignedRevisionId: string;
    try {
      // GET on the photo customer: the PSI id, plus a single published option.
      const photoGet = await call("GET", photoPath);
      assert.equal(photoGet.status, 200, JSON.stringify(await photoGet.clone().json()));
      const photo = await photoGet.json() as { systemKey: string; field: unknown; policies: Array<Record<string, unknown>>; evidencePolicyId: string | null };
      assert.equal(photo.systemKey, "automatic_sprinkler");
      assert.deepEqual(photo.field, evidencePolicyField);
      assert.equal(photo.evidencePolicyId, automaticSprinklerPsiEvidencePolicyId);
      assert.deepEqual(photo.policies, [{ id: automaticSprinklerPsiEvidencePolicyId, code: automaticSprinklerPsiEvidencePolicyCode, version: 1, label: policyLabel }]);

      // GET on the plain customer: no assignment, same one-entry list.
      const plainGet = await call("GET", plainPath);
      assert.equal(plainGet.status, 200, JSON.stringify(await plainGet.clone().json()));
      const plain = await plainGet.json() as { policies: Array<Record<string, unknown>>; evidencePolicyId: string | null };
      assert.equal(plain.evidencePolicyId, null);
      assert.deepEqual(plain.policies, [{ id: automaticSprinklerPsiEvidencePolicyId, code: automaticSprinklerPsiEvidencePolicyCode, version: 1, label: policyLabel }]);

      // Assign the PSI policy to the plain customer.
      const assign = await call("PUT", plainPath, { evidencePolicyId: automaticSprinklerPsiEvidencePolicyId });
      assert.equal(assign.status, 200, JSON.stringify(await assign.clone().json()));
      const assigned = await assign.json() as { evidencePolicyId: string | null; field: unknown; policies: unknown; systemKey: string; customer: { configuration: { id: string; revision: number } } };
      assert.equal(assigned.evidencePolicyId, automaticSprinklerPsiEvidencePolicyId);
      assert.deepEqual(assigned.field, evidencePolicyField);
      assert.deepEqual(assigned.policies, [{ id: automaticSprinklerPsiEvidencePolicyId, code: automaticSprinklerPsiEvidencePolicyCode, version: 1, label: policyLabel }]);
      assert.ok(typeof assigned.customer.configuration.revision === "number");
      assignedRevisionId = assigned.customer.configuration.id;

      // Bad ids create NO revision.
      const revisionCount = async () => (await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM customer_configuration_revisions WHERE customer_id=$1", [demoSprinklerCustomerId])).rows[0]!.n;
      const countBefore = await revisionCount();
      for (const bad of [randomUUID(), 5, "not-a-uuid"]) {
        const response = await call("PUT", plainPath, { evidencePolicyId: bad });
        assert.equal(response.status, 400, `${JSON.stringify(bad)} rejected`);
        assert.equal((await response.json() as { error: string }).error, "INVALID_EVIDENCE_POLICY");
      }
      assert.equal((await call("PUT", plainPath, { evidencePolicyId: automaticSprinklerPsiEvidencePolicyId, extra: 1 })).status, 400, "unknown body key rejected");
      assert.equal(await revisionCount(), countBefore, "rejected writes create no revision");
      assert.equal((await pool.query<{ id: string }>("SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [demoSprinklerCustomerId])).rows[0]!.id, assignedRevisionId, "rejected writes leave the active revision untouched");

      // Clear the PSI policy from the photo customer.
      const cleared = await call("PUT", photoPath, { evidencePolicyId: null });
      assert.equal(cleared.status, 200, JSON.stringify(await cleared.clone().json()));
      assert.equal((await cleared.json() as { evidencePolicyId: string | null }).evidencePolicyId, null);
    } finally { await close(server); }

    // Versioning: the plain customer's previous revision is superseded, the new
    // active carries the id on automatic_sprinkler.
    const rows = await pool.query<{ status: string; systemKey: string; policy: string | null }>(
      `SELECT revision.status, enabled.system_key AS "systemKey", enabled.evidence_policy_id AS policy
       FROM customer_configuration_revisions revision
       INNER JOIN customer_enabled_systems enabled ON enabled.configuration_revision_id = revision.id
       WHERE revision.customer_id=$1 ORDER BY revision.revision, enabled.sort_order`, [demoSprinklerCustomerId]);
    assert.ok(rows.rows.some((row) => row.status === "superseded"), "the previous revision is superseded");
    for (const row of rows.rows.filter((row) => row.status === "active")) {
      assert.equal(row.policy, row.systemKey === "automatic_sprinkler" ? automaticSprinklerPsiEvidencePolicyId : null, `${row.systemKey} evidence_policy_id`);
    }
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='manager_customer_evidence_policy_updated' AND entity_type='customer_configuration_revision' AND entity_id=$1", [assignedRevisionId])).rows[0]!.n, 1, "the assign wrote exactly one audit row against its own revision");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='manager_customer_evidence_policy_updated' AND actor_user_id=$1", [userId])).rows[0]!.n, 2, "one audit row for the assign, one for the photo-customer clear");

    // Forward-copy: label_overrides / system_configuration / zones / locations on
    // automatic_sprinkler are unchanged (superseded == active).
    const authority = async (status: "active" | "superseded") => (await pool.query<{ zones: number; locations: number; labels: string; config: string }>(
      `SELECT
         (SELECT count(*)::int FROM customer_system_zones z JOIN customer_enabled_systems e ON e.id=z.enabled_system_id
            JOIN customer_configuration_revisions r ON r.id=e.configuration_revision_id
           WHERE r.customer_id=$1 AND r.status=$2 AND e.system_key='automatic_sprinkler') AS zones,
         (SELECT count(*)::int FROM customer_system_locations l JOIN customer_enabled_systems e ON e.id=l.enabled_system_id
            JOIN customer_configuration_revisions r ON r.id=e.configuration_revision_id
           WHERE r.customer_id=$1 AND r.status=$2 AND e.system_key='automatic_sprinkler') AS locations,
         (SELECT e.label_overrides::text FROM customer_enabled_systems e
            JOIN customer_configuration_revisions r ON r.id=e.configuration_revision_id
           WHERE r.customer_id=$1 AND r.status=$2 AND e.system_key='automatic_sprinkler') AS labels,
         (SELECT e.system_configuration::text FROM customer_enabled_systems e
            JOIN customer_configuration_revisions r ON r.id=e.configuration_revision_id
           WHERE r.customer_id=$1 AND r.status=$2 AND e.system_key='automatic_sprinkler') AS config`,
      [demoSprinklerCustomerId, status])).rows[0]!;
    assert.deepEqual(await authority("active"), await authority("superseded"), "evidence-policy edit forward-copies zones, locations, label_overrides and system_configuration unchanged");

    // The photo customer's clear leaves evidence_policy_id NULL on the new revision.
    assert.equal(
      (await pool.query<{ policy: string | null }>(
        `SELECT enabled.evidence_policy_id AS policy FROM customer_enabled_systems enabled
           JOIN customer_configuration_revisions revision ON revision.id = enabled.configuration_revision_id
          WHERE revision.customer_id=$1 AND revision.status='active' AND enabled.system_key='automatic_sprinkler'`,
        [demoPhotoSprinklerCustomerId]
      )).rows[0]!.policy,
      null,
      "the cleared assignment persists as NULL"
    );

    // Freeze: a job created AFTER the assign freezes the resolved policy; the
    // pre-assign job carries no evidencePolicy key. A job on the cleared photo
    // customer also carries no key.
    const visitAfter = async (customerId: string, siteId: string) => {
      const client = await pool.connect();
      try { return (await createServiceVisit(client, { requestId: randomUUID(), customerId, siteId, systemKeys: ["automatic_sprinkler"] }, userId)).id; }
      finally { client.release(); }
    };
    const jobAfterId = await visitAfter(demoSprinklerCustomerId, demoSprinklerSiteId);
    const jobPhotoClearedId = await visitAfter(demoPhotoSprinklerCustomerId, demoPhotoSprinklerSiteId);

    const snapshotOf = async (jobId: string) => (await pool.query<{ snapshot: unknown }>(
      "SELECT configuration_snapshot AS snapshot FROM inspection_jobs WHERE id=$1", [jobId]
    )).rows[0]!.snapshot;
    const before = evidencePolicyOf(await snapshotOf(jobBeforeId), "automatic_sprinkler")!;
    assert.ok(!Object.hasOwn(before, "evidencePolicy"), "a job created before the assign freezes NO evidencePolicy key");
    const after = evidencePolicyOf(await snapshotOf(jobAfterId), "automatic_sprinkler")!;
    assert.deepEqual(after.evidencePolicy, {
      id: automaticSprinklerPsiEvidencePolicyId,
      code: automaticSprinklerPsiEvidencePolicyCode,
      version: 1,
      schemaVersion: 1,
      definition: automaticSprinklerPsiEvidencePolicyV1,
      definitionSha256: automaticSprinklerPsiEvidencePolicySha256
    }, "a job created after the assign freezes the resolved evidence policy");
    const photoCleared = evidencePolicyOf(await snapshotOf(jobPhotoClearedId), "automatic_sprinkler")!;
    assert.ok(!Object.hasOwn(photoCleared, "evidencePolicy"), "a job on the cleared customer freezes NO evidencePolicy key");
  } finally { await pool.end(); }
});

test("evidence-policy endpoints: auth matrix, unsupported system, system-not-enabled", { skip: !databaseUrl }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const userId = (await pool.query<{ id: number }>(
      "INSERT INTO users(username,password_hash,role) VALUES('ep-auth','x','admin') RETURNING id"
    )).rows[0]!.id;
    await pool.query("UPDATE customers SET is_demo=false WHERE id=$1", [demoSprinklerCustomerId]);

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
      headers: { ...(role ? { "x-role": role } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const sprinklerPath = `/manager/customers/${demoSprinklerCustomerId}/systems/automatic_sprinkler/evidence-policy`;

    try {
      // Auth: admin-only, both verbs.
      for (const [method, body] of [["GET", undefined], ["PUT", { evidencePolicyId: null }]] as const) {
        assert.equal((await call(method, sprinklerPath, undefined, body)).status, 401, `${method} unauthenticated`);
        assert.equal((await call(method, sprinklerPath, "inspector", body)).status, 403, `${method} inspector`);
      }

      // Unsupported system: 404 before any write.
      const co2Path = `/manager/customers/${demoSprinklerCustomerId}/systems/co2_fire_extinguisher/evidence-policy`;
      assert.equal((await call("GET", co2Path, "admin")).status, 404);
      const co2Get = await call("GET", co2Path, "admin");
      assert.equal((await co2Get.json() as { error: string }).error, "EVIDENCE_POLICY_UNSUPPORTED_SYSTEM");
      const co2Put = await call("PUT", co2Path, "admin", { evidencePolicyId: null });
      assert.equal(co2Put.status, 404);
      assert.equal((await co2Put.json() as { error: string }).error, "EVIDENCE_POLICY_UNSUPPORTED_SYSTEM");

      // Supported key but system not enabled for this customer.
      const notEnabled = await call("GET", `/manager/customers/${makSitiId}/systems/automatic_sprinkler/evidence-policy`, "admin");
      assert.equal(notEnabled.status, 404);
      assert.equal((await notEnabled.json() as { error: string }).error, "SYSTEM_NOT_ENABLED");
      const notEnabledPut = await call("PUT", `/manager/customers/${makSitiId}/systems/automatic_sprinkler/evidence-policy`, "admin", { evidencePolicyId: null });
      assert.equal(notEnabledPut.status, 404);
      assert.equal((await notEnabledPut.json() as { error: string }).error, "SYSTEM_NOT_ENABLED");
    } finally { await close(server); }
  } finally { await pool.end(); }
});

test("configuration-revisions assigns an evidence policy inline while enabling the system", { skip: !databaseUrl }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const userId = (await pool.query<{ id: number }>(
      "INSERT INTO users(username,password_hash,role) VALUES('ep-revision','x','admin') RETURNING id"
    )).rows[0]!.id;

    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { request.currentUser = { id: userId, username: "ep-revision", role: "admin" }; next(); });
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

      // Inline evidencePolicy for a key not in systemKeys / not assignable / not published -> 400, no revision.
      assert.equal((await call(revisionsPath, { systemKeys: ["hose_reel", "automatic_sprinkler"], evidencePolicy: { fire_alarm_detector: automaticSprinklerPsiEvidencePolicyId } })).status, 400);
      assert.equal((await call(revisionsPath, { systemKeys: ["hose_reel", "automatic_sprinkler"], evidencePolicy: { hose_reel: automaticSprinklerPsiEvidencePolicyId } })).status, 400);
      assert.equal((await call(revisionsPath, { systemKeys: ["hose_reel", "automatic_sprinkler"], evidencePolicy: { automatic_sprinkler: randomUUID() } })).status, 400);
      assert.equal((await pool.query<{ id: string }>("SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [makSitiId])).rows[0]!.id, activeBefore, "invalid inline evidencePolicy creates no revision");

      // Enable automatic_sprinkler fresh AND assign the PSI policy in one revision.
      const enabled = await call(revisionsPath, { systemKeys: ["hose_reel", "automatic_sprinkler"], evidencePolicy: { automatic_sprinkler: automaticSprinklerPsiEvidencePolicyId } });
      assert.equal(enabled.status, 201, JSON.stringify(await enabled.clone().json()));
      const activeRows = await pool.query<{ systemKey: string; policy: string | null }>(
        `SELECT enabled.system_key AS "systemKey", enabled.evidence_policy_id AS policy
         FROM customer_enabled_systems enabled
         INNER JOIN customer_configuration_revisions revision ON revision.id = enabled.configuration_revision_id
         WHERE revision.customer_id=$1 AND revision.status='active' ORDER BY enabled.sort_order`, [makSitiId]);
      assert.deepEqual(activeRows.rows.map((row) => row.systemKey).sort(), ["automatic_sprinkler", "hose_reel"]);
      assert.equal(activeRows.rows.find((row) => row.systemKey === "automatic_sprinkler")!.policy, automaticSprinklerPsiEvidencePolicyId);
      assert.equal(activeRows.rows.find((row) => row.systemKey === "hose_reel")!.policy, null);

      // A body with only systemKeys stays byte-unchanged in behaviour.
      assert.equal((await call(revisionsPath, { systemKeys: ["hose_reel"] })).status, 201);
    } finally { await close(server); }
  } finally { await pool.end(); }
});

test("V7 evidence-policy assignment is a functional no-op for the V7 acceptance path", { skip: !databaseUrl }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const userId = (await pool.query<{ id: number }>(
      "INSERT INTO users(username,password_hash,role) VALUES('ep-v7','x','admin') RETURNING id"
    )).rows[0]!.id;
    await pool.query("UPDATE customers SET is_demo=false WHERE id=$1", [demoV7CustomerId]);

    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { request.currentUser = { id: userId, username: "ep-v7", role: "admin" }; next(); });
    app.use(createManagerCustomersRouter(pool));
    app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      if (error instanceof ManagerCustomerError) response.status(error.status).json({ error: error.code, message: error.message });
      else response.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : String(error) });
    });
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    try {
      const put = await fetch(`http://127.0.0.1:${port}/manager/customers/${demoV7CustomerId}/systems/automatic_sprinkler/evidence-policy`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evidencePolicyId: automaticSprinklerPsiEvidencePolicyId })
      });
      assert.equal(put.status, 200, JSON.stringify(await put.clone().json()));
      assert.equal((await put.json() as { evidencePolicyId: string | null }).evidencePolicyId, automaticSprinklerPsiEvidencePolicyId);
    } finally { await close(server); }

    // A NEW V7 automatic_sprinkler job freezes the policy into its snapshot...
    const visitClient = await pool.connect();
    let jobId: string;
    try {
      jobId = (await createServiceVisit(visitClient, { requestId: randomUUID(), customerId: demoV7CustomerId, siteId: demoV7SiteId, systemKeys: ["automatic_sprinkler"] }, userId)).id;
    } finally { visitClient.release(); }
    const snapshot = (await pool.query<{ snapshot: Record<string, unknown>; version: number }>(
      `SELECT job.configuration_snapshot AS snapshot, template.version
         FROM inspection_jobs job
         INNER JOIN master_service_report_templates template ON template.id = job.master_template_version_id
        WHERE job.id=$1`, [jobId]
    )).rows[0]!;
    assert.equal(Number(snapshot.version), 7, "the new job is frozen to MFE-FSSR v7");
    const system = evidencePolicyOf(snapshot.snapshot, "automatic_sprinkler")!;
    assert.deepEqual((system.evidencePolicy as { id: string }).id, automaticSprinklerPsiEvidencePolicyId, "the V7 job snapshot carries the frozen evidence policy");

    // ...but a V7 sprinkler payload still accepts through
    // `acceptAutomaticSprinklerV7Inspection` unchanged — the V7 path never reads
    // `system.evidencePolicy`.
    const config = (snapshot.snapshot as { configuration: { revisionId: string; revisionNumber: number }; template: { id: string } });
    const clientUuid = randomUUID();
    const envelope = {
      operationId: randomUUID(),
      entityType: "masterSystemInspection",
      entityId: clientUuid,
      action: "create",
      payload: {
        clientUuid, jobId, systemKey: "automatic_sprinkler", instanceKey: "primary",
        configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null,
        masterTemplate: { id: config.template.id, code: "MFE-FSSR", version: 7 },
        configuration: { revisionId: config.configuration.revisionId, revisionNumber: config.configuration.revisionNumber },
        inspectionSnapshot: {},
        responses: v7Responses(),
        evidenceManifest: [],
        performedAt: "2026-09-10T00:00:00.000Z"
      }
    };
    const result = await syncAutomaticSprinklerInspections([envelope], userId);
    assert.deepEqual(result.acceptedIds, [clientUuid], JSON.stringify(result));
    assert.equal(result.failed.length, 0, JSON.stringify(result));
  } finally { await pool.end(); }
});
