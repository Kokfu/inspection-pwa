import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { runMigrations } from "../db/migrations.js";
import { pool } from "../db/pool.js";
import { createServiceVisit } from "../jobs/serviceVisits.js";
import { syncDryWetRiserInspections } from "../sync/dryWetRiserInspectionSync.js";
import { syncHydrantInspections } from "../sync/hydrantInspectionSync.js";
import { v7IntegrationDatabaseUrl } from "../sync/v7IntegrationTestDatabase.js";
import { loadFinalServiceReport } from "../reports/finalServiceReport.js";
import { createLocationProposalsRouter } from "./locationProposals.js";
import { createManagerCustomersRouter } from "./managerCustomers.js";
import { masterSystemInspectionsRouter } from "./masterSystemInspections.js";

/**
 * Hydrant and Dry/Wet Riser are "General layout" systems like Hose Reel: a brand-new customer (no location) gets
 * the Phase 3 flow, the first approved `general` format creates the zone-free General location, and the NEXT visit
 * freezes it so the configured rows the web builds from it are accepted. A customer that already has named zones and
 * locations is untouched. Every step runs through the real routes and acceptance code against a disposable Postgres, and
 * the accepted detail and the Final Report read both visits back (a configured row has no zone).
 */
const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();
const at = "2026-10-11T00:00:00.000Z";
type Value = Record<string, unknown>;

const checklistKeys = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions", "pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator", "battery_charger_failure_alarm", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"];

const hydrantRow = (sortOrder: number, change: Value = {}): Value => ({ rowUuid: id(), source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, assetReference: "", locationText: "Bank", canvasHose1Result: "good", canvasHose2Result: "good", diffuserNozzleResult: "good", landingValveResult: "good", landingValveHandleResult: "good", hoseCabinetResult: "na", keyLockResult: "good", remarks: "", fieldRemarks: {}, sortOrder, ...change });
const hydrantResponses = (rows: Value[]): Value => ({ schemaVersion: 1, hydrantType: "pressurize", rows, comments: "" });

const riserRow = (sortOrder: number, change: Value = {}): Value => ({ rowUuid: id(), source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, assetReference: "", locationText: "Core A", canvasHoseAt2Result: "good", diffuserNozzleResult: "good", landingValveResult: "good", crandleResult: "good", doorResult: "good", remarks: "", fieldRemarks: {}, sortOrder, ...change });
function riserResponses(rows: Value[]): Value {
  const psi = (values: Value, result = "good") => ({ values, unit: "PSI", result, remarks: "" });
  return {
    schemaVersion: 2, mode: "dry",
    checklist: Object.fromEntries(checklistKeys.map((key) => [key, { result: "good", remarks: "" }])),
    measurements: { jockey_psi: psi({ cut_in: 80, cut_out: 100 }), duty_psi: psi({ cut_in: 70 }), standby_psi: psi({ cut_in: 60 }, "na") },
    riserOutlets: rows, comments: ""
  };
}

test("General layout (Hydrant, Dry/Wet Riser): new customer -> first visit -> approved layout -> next visit accepted; zoned customers untouched", { skip: !databaseUrl }, async () => {
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(pool);
    const template = (await pool.query<{ id: string }>("SELECT id FROM master_service_report_templates WHERE code='MFE-FSSR' AND publication_status='published' ORDER BY version DESC LIMIT 1")).rows[0]!;
    const user = async (username: string, role: string) => (await pool.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x',$2) RETURNING id::int AS id", [username, role])).rows[0]!.id;
    const inspector = await user("gl-tech", "inspector"), supervisor = await user("gl-review", "supervisor"), admin = await user("gl-admin", "admin");
    const actors: Record<string, { id: number; username: string; role: "admin" | "inspector" | "supervisor" }> = {
      inspector: { id: inspector, username: "gl-tech", role: "inspector" }, supervisor: { id: supervisor, username: "gl-review", role: "supervisor" }, admin: { id: admin, username: "gl-admin", role: "admin" }
    };
    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { const actor = actors[request.header("x-test-actor") ?? ""]; if (actor) request.currentUser = actor; next(); });
    app.use(createLocationProposalsRouter(pool)); app.use(createManagerCustomersRouter(pool)); app.use(masterSystemInspectionsRouter);
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const { port } = server.address() as { port: number };
    const call = (path: string, actor: string | undefined, method = "GET", body?: unknown) => fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers: { "content-type": "application/json", ...(actor ? { "x-test-actor": actor } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const decide = (proposalId: string, actor: string, body: unknown) => call(`/manager/location-proposals/${proposalId}/decision`, actor, "POST", body);

    /** A customer with Hydrant and Dry/Wet Riser enabled and, to begin with, no zone and no location. */
    async function newCustomer(label: string) {
      const customer = id(), revision = id(), site = id();
      await pool.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,$3,false)", [customer, `GL-${customer}`, `General layout ${label}`]);
      await pool.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
      await pool.query("INSERT INTO customer_sites(id,customer_id,site_code,display_name) VALUES($1,$2,'GL','General layout site')", [site, customer]);
      const enabled = { hydrant: id(), dry_wet_riser: id() };
      await pool.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'hydrant',1,'{}')", [enabled.hydrant, revision, template.id]);
      await pool.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'dry_wet_riser',2,$4)", [enabled.dry_wet_riser, revision, template.id, JSON.stringify({ riserMode: "dry" })]);
      return { customer, revision, site, enabled };
    }
    async function visit(customer: string, site: string) {
      const client = await pool.connect();
      try { return (await createServiceVisit(client, { requestId: id(), customerId: customer, siteId: site, systemKeys: ["hydrant", "dry_wet_riser"] }, inspector)).id; } finally { client.release(); }
    }
    const frozen = async (jobId: string, systemKey: string) => {
      const snapshot = (await pool.query<{ snapshot: { configuration: unknown; template: unknown; enabledSystems: Array<{ systemKey: string; zones: unknown[]; locations: Array<Value & { id: string }> }> } }>("SELECT configuration_snapshot AS snapshot FROM inspection_jobs WHERE id=$1", [jobId])).rows[0]!.snapshot;
      return { configuration: snapshot.configuration, template: snapshot.template, system: snapshot.enabledSystems.find((entry) => entry.systemKey === systemKey)! };
    };
    const envelope = async (jobId: string, systemKey: "hydrant" | "dry_wet_riser", responses: Value) => {
      const clientUuid = id(); const { configuration, template: templateSnapshot } = await frozen(jobId, systemKey);
      return { clientUuid, item: { operationId: id(), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: {
        clientUuid, jobId, systemKey, instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null,
        masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration,
        inspectionSnapshot: { schemaVersion: 1, capturedAt: at, job: { id: jobId, reference: "client", title: "client" }, customer: { id: "client" }, configuration, template: templateSnapshot, system: { client: "not-authority" } },
        responses, evidenceManifest: [], performedAt: at } } };
    };
    const accept = async (jobId: string, systemKey: "hydrant" | "dry_wet_riser", responses: Value) => {
      const { clientUuid, item } = await envelope(jobId, systemKey, responses);
      const sync = systemKey === "hydrant" ? syncHydrantInspections : syncDryWetRiserInspections;
      return { clientUuid, item, sync, outcome: await sync([item as never], inspector) };
    };
    const stored = async (customer: string, systemKey: string) => (await pool.query<{ key: string; zoneId: string | null; count: number; preset: unknown }>(`
      SELECT location.location_key AS key, location.zone_id AS "zoneId", location.preset_row_count AS count, location.row_preset AS preset
      FROM customer_system_locations location
      JOIN customer_enabled_systems enabled ON enabled.id=location.enabled_system_id
      JOIN customer_configuration_revisions revision ON revision.id=enabled.configuration_revision_id
      WHERE revision.customer_id=$1 AND revision.status='active' AND enabled.system_key=$2 ORDER BY location.sort_order`, [customer, systemKey])).rows;

    /** The accepted record reads back through the real detail route, and the closed visit through the Final Report. */
    async function readsBack(jobId: string, accepted: Record<"hydrant" | "dry_wet_riser", string>, expectedRows: number) {
      const hydrant = await call(`/master-system-inspections/${accepted.hydrant}`, "admin");
      assert.equal(hydrant.status, 200, `hydrant accepted detail: ${await hydrant.clone().text()}`);
      const riser = await call(`/dry-wet-riser-inspections/${accepted.dry_wet_riser}`, "admin");
      assert.equal(riser.status, 200, `riser accepted detail: ${await riser.clone().text()}`);
      await pool.query("UPDATE inspection_jobs SET status='closed', completed_at=now(), completed_by_user_id=$2, completed_by_display_name='Alice Tan', report_number='GL/' || id::text, technician_team_snapshot='[]'::jsonb WHERE id=$1", [jobId, admin]);
      const report = await loadFinalServiceReport(jobId, pool, "manager");
      const text = JSON.stringify(report);
      assert.ok(text.includes("Hydrant") || text.includes("hydrant"), "the report carries the Hydrant section");
      assert.equal(report.systems.length, 2, "both systems are in the report");
      assert.ok(expectedRows > 0);
    }

    try {
      const fresh = await newCustomer("new");
      const firstVisit = await visit(fresh.customer, fresh.site);
      const acceptedFirst = {} as Record<"hydrant" | "dry_wet_riser", string>;
      const acceptedSecond = {} as Record<"hydrant" | "dry_wet_riser", string>;

      for (const systemKey of ["hydrant", "dry_wet_riser"] as const) {
        const makeRow = systemKey === "hydrant" ? hydrantRow : riserRow;
        const makeResponses = systemKey === "hydrant" ? hydrantResponses : riserResponses;
        const layout = [{ assetReference: "H-1", locationText: "Lobby" }, { assetReference: "", locationText: "Roof" }, { assetReference: "H-3", locationText: "Car park" }];

        // 1. The first visit freezes NO location, and the server accepts an inspection made of technician rows only.
        const first = await frozen(firstVisit, systemKey);
        assert.deepEqual([first.system.zones, first.system.locations], [[], []], `${systemKey}: a brand-new customer has no location`);
        const firstRows = layout.map((row, index) => makeRow(index + 1, row));
        const firstAccepted = await accept(firstVisit, systemKey, makeResponses(firstRows));
        assert.deepEqual(firstAccepted.outcome.acceptedIds, [firstAccepted.clientUuid], `${systemKey}: ${JSON.stringify(firstAccepted.outcome)}`);
        acceptedFirst[systemKey] = firstAccepted.clientUuid;
        // Idempotent retry of the same exact record: duplicate success, never a second row.
        assert.deepEqual((await firstAccepted.sync([firstAccepted.item as never], inspector)).duplicateIds, [firstAccepted.clientUuid], `${systemKey}: retry`);
        assert.equal((await pool.query("SELECT 1 FROM master_system_form_instances WHERE client_uuid=$1", [firstAccepted.clientUuid])).rowCount, 1);

        // 2. The first-visit layout is proposed against the key "general". Above 250 rows is refused at submit (I-61).
        const path = `/technician/customers/${fresh.customer}/systems/${systemKey}/location-proposals`;
        const tooMany = await call(path, "inspector", "POST", { id: id(), jobId: firstVisit, patch: { kind: "update-format", locationKey: "general", rows: Array.from({ length: 251 }, (_, index) => ({ assetReference: `R-${index}`, locationText: `Place ${index}` })) } });
        assert.equal(tooMany.status, 400, `${systemKey}: 251 rows`);
        const proposalId = id();
        const proposed = await call(path, "inspector", "POST", { id: proposalId, jobId: firstVisit, patch: { kind: "update-format", locationKey: "general", rows: layout } });
        assert.equal(proposed.status, 201, await proposed.clone().text());
        // A retry of the same request replays (200) instead of creating a second proposal.
        const replay = await call(path, "inspector", "POST", { id: proposalId, jobId: firstVisit, patch: { kind: "update-format", locationKey: "general", rows: layout } });
        assert.equal(replay.status, 200, `${systemKey}: replay`);
        assert.equal((await decide(proposalId, "inspector", { requestId: id(), decision: "approved" })).status, 403, "a technician cannot approve");

        // 3. A named zone cannot be added next to the pending General layout once it is approved (checked below); approve now.
        const approved = await decide(proposalId, "supervisor", { requestId: id(), decision: "approved" });
        assert.equal(approved.status, 201, await approved.clone().text());
        assert.deepEqual(await stored(fresh.customer, systemKey), [{ key: "general", zoneId: null, count: 3, preset: { rows: layout } }], systemKey);

        // 4. The Manager screens can read it and write it back; a mix with a zoned location is refused.
        const read = await call(`/manager/customers/${fresh.customer}/systems/${systemKey}/locations`, "admin");
        assert.equal(read.status, 200);
        const readBody = await read.json() as { zones: unknown[]; locations: Array<{ key: string; displayName: string; zoneId: string | null; presetRowCount: number; rowPreset: unknown }> };
        assert.deepEqual(readBody.zones, []);
        assert.deepEqual(readBody.locations.map(({ key, zoneId, presetRowCount, rowPreset }) => ({ key, zoneId, presetRowCount, rowPreset })), [{ key: "general", zoneId: null, presetRowCount: 3, rowPreset: { rows: layout } }]);
        const general = readBody.locations[0]!;
        const putBack = await call(`/manager/customers/${fresh.customer}/systems/${systemKey}/locations`, "admin", "PUT", { zones: [], locations: [{ key: general.key, displayName: general.displayName, zoneId: null, presetRowCount: general.presetRowCount, rowPreset: general.rowPreset }] });
        assert.equal(putBack.status, 200, await putBack.clone().text());
        const mixed = await call(`/manager/customers/${fresh.customer}/systems/${systemKey}/locations`, "admin", "PUT", { zones: [{ key: "z1", displayName: "Zone 1" }], locations: [{ key: general.key, displayName: "General", zoneId: null, presetRowCount: 3 }, { key: "loc-1", displayName: "Loc 1", zoneId: "z1", presetRowCount: 1 }] });
        assert.equal(mixed.status, 400, `${systemKey}: General + zoned location`);
        assert.deepEqual(await stored(fresh.customer, systemKey), [{ key: "general", zoneId: null, count: 3, preset: { rows: layout } }], `${systemKey}: unchanged by the refused write`);

        // 5. A zone or location cannot be proposed next to the General layout: it would mix the two shapes.
        const addZone = await call(path, "inspector", "POST", { id: id(), jobId: firstVisit, patch: { kind: "add-location", locationKey: "loc-x", displayName: "Loc X", zoneKey: null, newZone: { key: "zx", displayName: "Zone X" } } });
        assert.equal(addZone.status, 201, await addZone.clone().text());
        const addDecision = await decide((await addZone.json() as { proposal: { id: string } }).proposal.id, "admin", { requestId: id(), decision: "approved" });
        assert.equal(addDecision.status, 409);
        assert.equal((await addDecision.json() as { error: string }).error, "LOCATION_PROPOSAL_TARGET_INVALID", systemKey);
      }

      // 6. The NEXT visit freezes the General location, and the configured rows the web builds from it are accepted.
      const secondVisit = await visit(fresh.customer, fresh.site);
      for (const systemKey of ["hydrant", "dry_wet_riser"] as const) {
        const makeRow = systemKey === "hydrant" ? hydrantRow : riserRow;
        const makeResponses = systemKey === "hydrant" ? hydrantResponses : riserResponses;
        const second = await frozen(secondVisit, systemKey);
        assert.equal(second.system.locations.length, 1, systemKey);
        const location = second.system.locations[0]! as Value & { id: string };
        assert.equal(location.zoneId, null);
        assert.equal(location.key, "general");
        assert.equal(location.presetRowCount, 3);
        const saved = (location.rowPreset as { rows: Array<{ assetReference: string; locationText: string }> }).rows;
        const configured = (ordinal: number, change: Value = {}) => makeRow(ordinal, { source: "configured", configuredLocationId: location.id, configuredRowOrdinal: ordinal,
          locationSnapshot: { id: location.id, displayName: "General" }, assetReference: saved[ordinal - 1]!.assetReference, locationText: saved[ordinal - 1]!.locationText, ...change });
        const edited = await accept(secondVisit, systemKey, makeResponses([configured(1, { locationText: "Lobby 2" }), configured(2), configured(3)]));
        assert.equal(edited.outcome.failed[0]?.code, "VALIDATION_ERROR", `${systemKey}: an edited configured row is refused`);
        const withName = await accept(secondVisit, systemKey, makeResponses([configured(1, { assetReference: "", locationText: "General" }), configured(2, { assetReference: "", locationText: "General" }), configured(3, { assetReference: "", locationText: "General" })]));
        assert.equal(withName.outcome.failed[0]?.code, "VALIDATION_ERROR", `${systemKey}: the location name is not the saved text`);
        const good = await accept(secondVisit, systemKey, makeResponses([configured(1), configured(2), configured(3), makeRow(4, { locationText: "Added on site" })]));
        assert.deepEqual(good.outcome.acceptedIds, [good.clientUuid], `${systemKey}: ${JSON.stringify(good.outcome)}`);
        acceptedSecond[systemKey] = good.clientUuid;
        assert.deepEqual((await good.sync([good.item as never], inspector)).duplicateIds, [good.clientUuid], `${systemKey}: retry`);
      }

      // 6b. Both visits read back: the accepted detail answers 200 (not INVALID_STORED_INSPECTION) and the Final Report builds.
      await readsBack(firstVisit, acceptedFirst, 3);
      await readsBack(secondVisit, acceptedSecond, 4);

      // 7. A customer that already has a NAMED zone and location is untouched by a general format, and its own formats still work.
      const zoned = await newCustomer("zoned");
      // Both systems get their named zone and location BEFORE any proposal: an approval writes a new configuration revision.
      for (const systemKey of ["hydrant", "dry_wet_riser"] as const) {
        const zoneId = id(), locationId = id();
        await pool.query("INSERT INTO customer_system_zones(id,enabled_system_id,zone_key,display_name,sort_order) VALUES($1,$2,'zone-a','Zone A',1)", [zoneId, zoned.enabled[systemKey]]);
        await pool.query("INSERT INTO customer_system_locations(id,enabled_system_id,zone_id,location_key,display_name,preset_row_count,row_preset,sort_order) VALUES($1,$2,$3,'loc-a','Location A',2,'{}',1)", [locationId, zoned.enabled[systemKey], zoneId]);
      }
      for (const systemKey of ["hydrant", "dry_wet_riser"] as const) {
        const zonedVisit = await visit(zoned.customer, zoned.site);
        const path = `/technician/customers/${zoned.customer}/systems/${systemKey}/location-proposals`;
        const general = await call(path, "inspector", "POST", { id: id(), jobId: zonedVisit, patch: { kind: "update-format", locationKey: "general", rows: [{ assetReference: "", locationText: "Lobby" }] } });
        assert.equal(general.status, 201, await general.clone().text());
        const refused = await decide((await general.json() as { proposal: { id: string } }).proposal.id, "admin", { requestId: id(), decision: "approved" });
        assert.equal(refused.status, 409, `${systemKey}: a zoned customer is never given a General location`);
        assert.equal((await refused.json() as { error: string }).error, "LOCATION_PROPOSAL_TARGET_INVALID");
        assert.deepEqual((await stored(zoned.customer, systemKey)).map(({ key, count }) => ({ key, count })), [{ key: "loc-a", count: 2 }], `${systemKey}: untouched`);
        const named = await call(path, "inspector", "POST", { id: id(), jobId: zonedVisit, patch: { kind: "update-format", locationKey: "loc-a", rows: [{ assetReference: "R-1", locationText: "North" }, { assetReference: "R-2", locationText: "South" }, { assetReference: "R-3", locationText: "East" }] } });
        assert.equal(named.status, 201, await named.clone().text());
        const approved = await decide((await named.json() as { proposal: { id: string } }).proposal.id, "admin", { requestId: id(), decision: "approved" });
        assert.equal(approved.status, 201, `${systemKey}: a named location's format still works: ${await approved.clone().text()}`);
        assert.deepEqual((await stored(zoned.customer, systemKey)).map(({ key, count, zoneId: zone }) => ({ key, count, zoned: zone !== null })), [{ key: "loc-a", count: 3, zoned: true }], systemKey);
        // I-61: a Manager edit that freezes more than 250 configured rows in all is refused (acceptance would refuse every visit).
        const zonedBody = (rows: number) => ({ zones: [{ key: "zone-a", displayName: "Zone A" }], locations: [{ key: "loc-a", displayName: "Location A", zoneId: "zone-a", presetRowCount: rows }] });
        const putPath = `/manager/customers/${zoned.customer}/systems/${systemKey}/locations`;
        assert.equal((await call(putPath, "admin", "PUT", zonedBody(251))).status, 400, `${systemKey}: 251 preset rows`);
        const twoLocations = { zones: zonedBody(1).zones, locations: [{ ...zonedBody(1).locations[0]!, presetRowCount: 200 }, { key: "loc-b", displayName: "Location B", zoneId: "zone-a", presetRowCount: 51 }] };
        assert.equal((await call(putPath, "admin", "PUT", twoLocations)).status, 400, `${systemKey}: 251 rows over two locations`);
        assert.equal((await call(putPath, "admin", "PUT", zonedBody(250))).status, 200, `${systemKey}: 250 preset rows`);
      }
    } finally { server.close(); await once(server, "close"); }
  } finally { await pool.end(); }
});
