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

// Seeded V1 CO2 demo customer: co2_fire_extinguisher enabled with 3 zones + 6 locations.
const demoCo2CustomerId = "00000000-0000-4000-8000-000000000670";
const demoCo2SiteId = "00000000-0000-4000-8000-000000000663";
// Frozen V7 demo customer: fire_alarm_detector / co2 (1 zone + 1 location) /
// wet_chemical (1 zone + 1 location) / hydrant / hose_reel / automatic_sprinkler /
// dry_wet_riser.
const demoV7CustomerId = "00000000-0000-4000-8000-000000000900";
// Operational V5 customer WITHOUT co2_fire_extinguisher — used for the fresh-enable path.
const makSitiId = "00000000-0000-4000-8000-000000000830";
const makSitiSiteId = "00000000-0000-4000-8000-000000000832";

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function systemOf(snapshot: unknown, systemKey: string) {
  const systems = (snapshot as { enabledSystems?: Array<Record<string, unknown>> }).enabledSystems ?? [];
  return systems.find((entry) => entry.systemKey === systemKey);
}

const submission = {
  zones: [
    { key: "mgr-zone-a", displayName: "Manager Zone A", sortOrder: 1 },
    { key: "mgr-zone-b", displayName: "Manager Zone B", sortOrder: 2 }
  ],
  locations: [
    { key: "mgr-loc-1", displayName: "Manager Location 1", zoneId: "mgr-zone-a", presetRowCount: 2 },
    { key: "mgr-loc-2", displayName: "Manager Location 2", zoneId: "mgr-zone-b", presetRowCount: 3 }
  ]
};

test("Manager locations GET/PUT versions the zone/location set, freezes it into new jobs only, and rejects malformed payloads", { skip: !databaseUrl }, async () => {
  assert.equal(new URL(databaseUrl!).pathname, "/phase6_seed_integration", "locations integration only permits its dedicated database");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const userId = (await pool.query<{ id: number }>(
      "INSERT INTO users(username,password_hash,role) VALUES('locations-manager','x','admin') RETURNING id"
    )).rows[0]!.id;
    await pool.query("UPDATE customers SET is_demo=false WHERE id = ANY($1)", [[demoCo2CustomerId, demoV7CustomerId]]);

    // A job cloned BEFORE the PUT freezes the seeded 3 zones / 6 locations.
    const beforeClient = await pool.connect();
    let jobBeforeId: string;
    try {
      jobBeforeId = (await createServiceVisit(beforeClient, { requestId: randomUUID(), customerId: demoCo2CustomerId, siteId: demoCo2SiteId, systemKeys: ["co2_fire_extinguisher"] }, userId)).id;
    } finally { beforeClient.release(); }

    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { request.currentUser = { id: userId, username: "locations-manager", role: "admin" }; next(); });
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
    const co2Path = `/manager/customers/${demoCo2CustomerId}/systems/co2_fire_extinguisher/locations`;

    let activatedRevisionId: string;
    try {
      // GET on the seeded CO2 customer: its 3 zones + 6 locations.
      const seededGet = await call("GET", co2Path);
      assert.equal(seededGet.status, 200, JSON.stringify(await seededGet.clone().json()));
      const seeded = await seededGet.json() as { systemKey: string; templateVersion: number; zones: Array<Record<string, unknown>>; locations: Array<Record<string, unknown>> };
      assert.equal(seeded.systemKey, "co2_fire_extinguisher");
      assert.equal(seeded.zones.length, 3, "seeded CO2 has 3 zones");
      assert.equal(seeded.locations.length, 6, "seeded CO2 has 6 locations");
      assert.ok(seeded.locations.every((location) => typeof location.zoneId === "string"), "seeded CO2 locations all carry a zone");

      // GET on the V7 CO2 customer: its single zone + single location.
      const v7Get = await call("GET", `/manager/customers/${demoV7CustomerId}/systems/co2_fire_extinguisher/locations`);
      assert.equal(v7Get.status, 200, JSON.stringify(await v7Get.clone().json()));
      const v7 = await v7Get.json() as { templateVersion: number; zones: unknown[]; locations: unknown[] };
      assert.equal(v7.templateVersion, 7);
      assert.equal(v7.zones.length, 1);
      assert.equal(v7.locations.length, 1);

      // GET on makSiti (CO2 not enabled): posture returns empty zones/locations.
      const notEnabledGet = await call("GET", `/manager/customers/${makSitiId}/systems/co2_fire_extinguisher/locations`);
      assert.equal(notEnabledGet.status, 200, JSON.stringify(await notEnabledGet.clone().json()));
      const notEnabled = await notEnabledGet.json() as { systemKey: string; zones: unknown[]; locations: unknown[] };
      assert.deepEqual(notEnabled.zones, []);
      assert.deepEqual(notEnabled.locations, []);

      // Malformed payloads are rejected and create NO revision.
      const revisionCount = async () => (await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM customer_configuration_revisions WHERE customer_id=$1", [demoCo2CustomerId])).rows[0]!.n;
      const countBefore = await revisionCount();
      const activeBefore = (await pool.query<{ id: string }>("SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [demoCo2CustomerId])).rows[0]!.id;
      const bad: Array<{ zones: unknown[]; locations: unknown[] }> = [
        { zones: submission.zones, locations: [{ key: "x", displayName: "X", zoneId: "not-a-zone", presetRowCount: 1 }] },
        { zones: [submission.zones[0], { ...submission.zones[1], key: "mgr-zone-a" }], locations: submission.locations },
        { zones: submission.zones, locations: [{ ...submission.locations[0], presetRowCount: 0 }] },
        { zones: submission.zones, locations: [{ ...submission.locations[0], presetRowCount: 99999 }] }
      ];
      for (const payload of bad) {
        const response = await call("PUT", co2Path, payload);
        assert.equal(response.status, 400, JSON.stringify(payload));
        assert.equal((await response.json() as { error: string }).error, "INVALID_LOCATION_CONFIGURATION");
      }
      assert.equal((await call("PUT", co2Path, { zones: submission.zones, locations: submission.locations, extra: 1 })).status, 400, "unknown body key rejected");
      assert.equal(await revisionCount(), countBefore, "rejected writes create no revision");
      assert.equal((await pool.query<{ id: string }>("SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [demoCo2CustomerId])).rows[0]!.id, activeBefore, "rejected writes leave the active revision untouched");

      // Valid PUT: replace the CO2 authority with the 2-zone / 2-location set.
      const put = await call("PUT", co2Path, { zones: submission.zones, locations: submission.locations });
      assert.equal(put.status, 200, JSON.stringify(await put.clone().json()));
      const saved = await put.json() as { systemKey: string; templateVersion: number; zones: Array<Record<string, unknown>>; locations: Array<Record<string, unknown>>; customer: { configuration: { id: string; revision: number } } };
      assert.equal(saved.systemKey, "co2_fire_extinguisher");
      assert.equal(saved.zones.length, 2);
      assert.equal(saved.locations.length, 2);
      assert.deepEqual(saved.zones.map((zone) => zone.key), ["mgr-zone-a", "mgr-zone-b"]);
      assert.deepEqual(saved.locations.map((location) => location.displayName), ["Manager Location 1", "Manager Location 2"]);
      activatedRevisionId = saved.customer.configuration.id;
    } finally { await close(server); }

    // Versioning: previous revision superseded; the new active carries exactly
    // the submitted zones/locations on co2_fire_extinguisher.
    const revisions = await pool.query<{ status: string; revision: number }>(
      "SELECT status, revision FROM customer_configuration_revisions WHERE customer_id=$1 ORDER BY revision", [demoCo2CustomerId]
    );
    assert.ok(revisions.rows.some((row) => row.status === "superseded"), "the previous revision is superseded");
    assert.equal(revisions.rows.filter((row) => row.status === "active").length, 1, "exactly one active revision");

    const activeRows = await pool.query<{ zoneKey: string | null; zoneName: string | null; zoneSort: number | null; locKey: string; locName: string; rows: number; locSort: number; zoneMatches: boolean }>(
      `SELECT zone.zone_key AS "zoneKey", zone.display_name AS "zoneName", zone.sort_order AS "zoneSort",
         location.location_key AS "locKey", location.display_name AS "locName",
         location.preset_row_count AS rows, location.sort_order AS "locSort",
         (zone.enabled_system_id = enabled.id) AS "zoneMatches"
       FROM customer_system_locations location
       INNER JOIN customer_enabled_systems enabled ON enabled.id = location.enabled_system_id
       INNER JOIN customer_configuration_revisions revision ON revision.id = enabled.configuration_revision_id
       LEFT JOIN customer_system_zones zone ON zone.id = location.zone_id
       WHERE revision.customer_id=$1 AND revision.status='active' AND enabled.system_key='co2_fire_extinguisher'
       ORDER BY location.sort_order`, [demoCo2CustomerId]
    );
    assert.deepEqual(activeRows.rows.map((row) => ({ locKey: row.locKey, locName: row.locName, rows: row.rows, locSort: row.locSort, zoneKey: row.zoneKey, zoneMatches: row.zoneMatches })), [
      { locKey: "mgr-loc-1", locName: "Manager Location 1", rows: 2, locSort: 1, zoneKey: "mgr-zone-a", zoneMatches: true },
      { locKey: "mgr-loc-2", locName: "Manager Location 2", rows: 3, locSort: 2, zoneKey: "mgr-zone-b", zoneMatches: true }
    ], "the active CO2 rows match the submission exactly, each pointing at its submitted zone of the same system");
    const activeZones = await pool.query<{ zone_key: string; display_name: string; sort_order: number }>(
      `SELECT zone.zone_key, zone.display_name, zone.sort_order FROM customer_system_zones zone
       INNER JOIN customer_enabled_systems enabled ON enabled.id = zone.enabled_system_id
       INNER JOIN customer_configuration_revisions revision ON revision.id = enabled.configuration_revision_id
       WHERE revision.customer_id=$1 AND revision.status='active' AND enabled.system_key='co2_fire_extinguisher'
       ORDER BY zone.sort_order`, [demoCo2CustomerId]
    );
    assert.deepEqual(activeZones.rows, [
      { zone_key: "mgr-zone-a", display_name: "Manager Zone A", sort_order: 1 },
      { zone_key: "mgr-zone-b", display_name: "Manager Zone B", sort_order: 2 }
    ]);

    // Forward-copy: co2 label_overrides / system_configuration / evidence_policy_id
    // unchanged (superseded == active).
    const authority = async (status: "active" | "superseded") => (await pool.query<{ labels: string; config: string; policy: string | null }>(
      `SELECT enabled.label_overrides::text AS labels, enabled.system_configuration::text AS config, enabled.evidence_policy_id AS policy
       FROM customer_enabled_systems enabled
       INNER JOIN customer_configuration_revisions revision ON revision.id = enabled.configuration_revision_id
       WHERE revision.customer_id=$1 AND revision.status=$2 AND enabled.system_key='co2_fire_extinguisher'`, [demoCo2CustomerId, status]
    )).rows[0]!;
    assert.deepEqual(await authority("active"), await authority("superseded"), "locations edit forward-copies label_overrides / system_configuration / evidence_policy_id unchanged");

    assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='manager_customer_locations_updated' AND entity_type='customer_configuration_revision' AND entity_id=$1", [activatedRevisionId])).rows[0]!.n, 1, "the PUT wrote exactly one audit row against its own revision");

    // Freeze: the pre-PUT job keeps its 3 zones / 6 locations; a new job carries
    // the submitted 2 zones / 2 locations.
    const afterClient = await pool.connect();
    let jobAfterId: string;
    try {
      jobAfterId = (await createServiceVisit(afterClient, { requestId: randomUUID(), customerId: demoCo2CustomerId, siteId: demoCo2SiteId, systemKeys: ["co2_fire_extinguisher"] }, userId)).id;
    } finally { afterClient.release(); }
    const snapshotOf = async (jobId: string) => (await pool.query<{ snapshot: unknown }>(
      "SELECT configuration_snapshot AS snapshot FROM inspection_jobs WHERE id=$1", [jobId]
    )).rows[0]!.snapshot;
    const before = systemOf(await snapshotOf(jobBeforeId), "co2_fire_extinguisher")! as { zones: unknown[]; locations: unknown[] };
    assert.equal(before.zones.length, 3, "a job created before the PUT keeps its frozen 3 zones");
    assert.equal(before.locations.length, 6, "a job created before the PUT keeps its frozen 6 locations");
    const after = systemOf(await snapshotOf(jobAfterId), "co2_fire_extinguisher")! as { zones: Array<Record<string, unknown>>; locations: Array<Record<string, unknown>> };
    assert.equal(after.zones.length, 2, "a job created after the PUT freezes the submitted 2 zones");
    assert.deepEqual(after.locations.map((location) => location.displayName), ["Manager Location 1", "Manager Location 2"], "a job created after the PUT freezes the submitted locations");
  } finally { await pool.end(); }
});

test("locations endpoints: auth matrix, unsupported system", { skip: !databaseUrl }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const userId = (await pool.query<{ id: number }>(
      "INSERT INTO users(username,password_hash,role) VALUES('locations-auth','x','admin') RETURNING id"
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
      headers: { ...(role ? { "x-role": role } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const co2Path = `/manager/customers/${demoCo2CustomerId}/systems/co2_fire_extinguisher/locations`;
    const validBody = { zones: submission.zones, locations: submission.locations };

    try {
      for (const [method, body] of [["GET", undefined], ["PUT", validBody]] as const) {
        assert.equal((await call(method, co2Path, undefined, body)).status, 401, `${method} unauthenticated`);
        assert.equal((await call(method, co2Path, "inspector", body)).status, 403, `${method} inspector`);
      }

      // Unsupported system: 404 LOCATIONS_UNSUPPORTED_SYSTEM before any write.
      const hydrantPath = `/manager/customers/${demoCo2CustomerId}/systems/hydrant/locations`;
      const hydrantGet = await call("GET", hydrantPath, "admin");
      assert.equal(hydrantGet.status, 404);
      assert.equal((await hydrantGet.json() as { error: string }).error, "LOCATIONS_UNSUPPORTED_SYSTEM");
      const hydrantPut = await call("PUT", hydrantPath, "admin", validBody);
      assert.equal(hydrantPut.status, 404);
      assert.equal((await hydrantPut.json() as { error: string }).error, "LOCATIONS_UNSUPPORTED_SYSTEM");
    } finally { await close(server); }
  } finally { await pool.end(); }
});

test("locations PUT fresh-enables a location-dependent system and unblocks its Assigned Services checkbox", { skip: !databaseUrl }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const userId = (await pool.query<{ id: number }>(
      "INSERT INTO users(username,password_hash,role) VALUES('locations-fresh','x','admin') RETURNING id"
    )).rows[0]!.id;

    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { request.currentUser = { id: userId, username: "locations-fresh", role: "admin" }; next(); });
    app.use(createManagerCustomersRouter(pool));
    app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      if (error instanceof ManagerCustomerError) response.status(error.status).json({ error: error.code, message: error.message });
      else response.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : String(error) });
    });
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    const call = (method: "GET" | "PUT" | "POST", path: string, body?: unknown) => fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body)
    });

    try {
      const configPath = `/manager/customers/${makSitiId}/configuration`;
      const before = await (await call("GET", configPath)).json() as { supportedSystems: Array<{ key: string; assignable: boolean; unavailableReason?: string }> };
      const co2Before = before.supportedSystems.find((system) => system.key === "co2_fire_extinguisher")!;
      assert.equal(co2Before.assignable, false, "co2 is unassignable before locations are defined");
      assert.equal(co2Before.unavailableReason, "Location configuration required");

      // configuration-revisions with co2 but NO locations still 409s.
      const currentKeys = (await pool.query<{ key: string }>(
        `SELECT enabled.system_key AS key FROM customer_enabled_systems enabled
         INNER JOIN customer_configuration_revisions revision ON revision.id = enabled.configuration_revision_id
         WHERE revision.customer_id=$1 AND revision.status='active' ORDER BY enabled.sort_order`, [makSitiId]
      )).rows.map((row) => row.key);
      assert.equal((await call("POST", `/manager/customers/${makSitiId}/configuration-revisions`, { systemKeys: ["hose_reel", "co2_fire_extinguisher"] })).status, 409, "co2 without locations is still rejected");

      // PUT locations for co2 on makSiti (no co2 enabled) -> fresh-enable.
      const put = await call("PUT", `/manager/customers/${makSitiId}/systems/co2_fire_extinguisher/locations`, { zones: submission.zones, locations: submission.locations });
      assert.equal(put.status, 200, JSON.stringify(await put.clone().json()));
      const saved = await put.json() as { zones: unknown[]; locations: unknown[]; customer: { configuration: { enabledSystems: Array<{ key: string }> }; supportedSystems: Array<{ key: string; assignable: boolean }> } };
      assert.equal(saved.zones.length, 2);
      assert.equal(saved.locations.length, 2);
      assert.ok(saved.customer.configuration.enabledSystems.some((system) => system.key === "co2_fire_extinguisher"), "co2 is now enabled");
      assert.equal(saved.customer.supportedSystems.find((system) => system.key === "co2_fire_extinguisher")!.assignable, true, "co2 checkbox is now unblocked");

      // GET configuration confirms the flip.
      const after = await (await call("GET", configPath)).json() as { supportedSystems: Array<{ key: string; assignable: boolean; unavailableReason?: string }> };
      const co2After = after.supportedSystems.find((system) => system.key === "co2_fire_extinguisher")!;
      assert.equal(co2After.assignable, true);
      assert.ok(!("unavailableReason" in co2After) || co2After.unavailableReason === undefined);

      // A follow-up configuration-revisions that keeps co2 succeeds (no 409) and
      // carries the forward-copied zones/locations.
      const followUp = await call("POST", `/manager/customers/${makSitiId}/configuration-revisions`, { systemKeys: [...currentKeys, "co2_fire_extinguisher"] });
      assert.equal(followUp.status, 201, JSON.stringify(await followUp.clone().json()));
      const co2Rows = await pool.query<{ zones: number; locations: number }>(
        `SELECT
           (SELECT count(*)::int FROM customer_system_zones zone INNER JOIN customer_enabled_systems enabled ON enabled.id=zone.enabled_system_id
              INNER JOIN customer_configuration_revisions revision ON revision.id=enabled.configuration_revision_id
             WHERE revision.customer_id=$1 AND revision.status='active' AND enabled.system_key='co2_fire_extinguisher') AS zones,
           (SELECT count(*)::int FROM customer_system_locations location INNER JOIN customer_enabled_systems enabled ON enabled.id=location.enabled_system_id
              INNER JOIN customer_configuration_revisions revision ON revision.id=enabled.configuration_revision_id
             WHERE revision.customer_id=$1 AND revision.status='active' AND enabled.system_key='co2_fire_extinguisher') AS locations`,
        [makSitiId]
      );
      assert.deepEqual(co2Rows.rows[0], { zones: 2, locations: 2 }, "the follow-up revision forward-copies the CO2 zones/locations");
    } finally { await close(server); }
  } finally { await pool.end(); }
});

test("configuration-revisions accepts an inline locations map that fresh-enables and configures a system atomically", { skip: !databaseUrl }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const userId = (await pool.query<{ id: number }>(
      "INSERT INTO users(username,password_hash,role) VALUES('locations-revision','x','admin') RETURNING id"
    )).rows[0]!.id;

    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { request.currentUser = { id: userId, username: "locations-revision", role: "admin" }; next(); });
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

      // Inline locations for a key not in systemKeys / not location-configurable /
      // with a dangling zoneId -> 400, no revision.
      assert.equal((await call(revisionsPath, { systemKeys: ["hose_reel", "co2_fire_extinguisher"], locations: { wet_chemical: { zones: submission.zones, locations: submission.locations } } })).status, 400);
      assert.equal((await call(revisionsPath, { systemKeys: ["hose_reel", "co2_fire_extinguisher"], locations: { hose_reel: { zones: submission.zones, locations: submission.locations } } })).status, 400);
      assert.equal((await call(revisionsPath, { systemKeys: ["hose_reel", "co2_fire_extinguisher"], locations: { co2_fire_extinguisher: { zones: submission.zones, locations: [{ key: "x", displayName: "X", zoneId: "ghost", presetRowCount: 1 }] } } })).status, 400);
      assert.equal((await pool.query<{ id: string }>("SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [makSitiId])).rows[0]!.id, activeBefore, "invalid inline locations creates no revision");

      // Enable co2 fresh AND define its zones/locations in one revision.
      const enabled = await call(revisionsPath, { systemKeys: ["hose_reel", "co2_fire_extinguisher"], locations: { co2_fire_extinguisher: { zones: submission.zones, locations: submission.locations } } });
      assert.equal(enabled.status, 201, JSON.stringify(await enabled.clone().json()));
      const activeRows = await pool.query<{ systemKey: string; zones: number; locations: number }>(
        `SELECT enabled.system_key AS "systemKey",
           (SELECT count(*)::int FROM customer_system_zones z WHERE z.enabled_system_id = enabled.id) AS zones,
           (SELECT count(*)::int FROM customer_system_locations l WHERE l.enabled_system_id = enabled.id) AS locations
         FROM customer_enabled_systems enabled
         INNER JOIN customer_configuration_revisions revision ON revision.id = enabled.configuration_revision_id
         WHERE revision.customer_id=$1 AND revision.status='active' ORDER BY enabled.sort_order`, [makSitiId]
      );
      assert.deepEqual(activeRows.rows.map((row) => row.systemKey).sort(), ["co2_fire_extinguisher", "hose_reel"]);
      assert.deepEqual(activeRows.rows.find((row) => row.systemKey === "co2_fire_extinguisher"), { systemKey: "co2_fire_extinguisher", zones: 2, locations: 2 });
      assert.deepEqual(activeRows.rows.find((row) => row.systemKey === "hose_reel"), { systemKey: "hose_reel", zones: 0, locations: 0 });

      // A body with only systemKeys stays byte-unchanged in behaviour.
      assert.equal((await call(revisionsPath, { systemKeys: ["hose_reel"] })).status, 201);
    } finally { await close(server); }
  } finally { await pool.end(); }
});
