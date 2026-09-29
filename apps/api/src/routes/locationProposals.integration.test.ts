import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { runMigrations } from "../db/migrations.js";
import { pool } from "../db/pool.js";
import { v7IntegrationDatabaseUrl } from "../sync/v7IntegrationTestDatabase.js";
import { createLocationProposalsRouter } from "./locationProposals.js";
import { createManagerCustomersRouter } from "./managerCustomers.js";

/**
 * Location proposal patches: a technician-drafted PATCH ("add-location" to name a brand-new location,
 * or "update-format" to replace an existing location's row count + per-row content), reviewed by a
 * Supervisor/Admin, and (on Approve) merged into the customer's CURRENT configuration fresh at
 * decision time and written through the exact same path a Manager's own PUT locations edit uses. This
 * test drives the real HTTP routes against a disposable Postgres -- never a mocked derivation -- and
 * proves: idempotent submission, one-pending-per-target (not per-system, so two different locations of
 * the same system can be pending together), role gating, terminal decisions, Approve producing a real
 * versioned configuration that merges cleanly, and append-only storage.
 */
const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();

const addPatch = (locationKey: string, displayName: string, zoneKey: string) =>
  ({ kind: "add-location" as const, locationKey, displayName, zoneKey, newZone: null });
const addPatchNewZone = (locationKey: string, displayName: string, zoneKey: string, zoneDisplayName: string) =>
  ({ kind: "add-location" as const, locationKey, displayName, zoneKey: null, newZone: { key: zoneKey, displayName: zoneDisplayName } });
const formatPatch = (locationKey: string, rows: Array<{ alarmZone: string; location: string }>) =>
  ({ kind: "update-format" as const, locationKey, rows });

test("location proposal patches: add-location + update-format, independent pending targets, terminal decisions, real merge at approve, append-only", { skip: !databaseUrl }, async () => {
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(pool);
    const table = await pool.query<{ exists: boolean }>(`SELECT to_regclass('public.customer_location_proposals') IS NOT NULL AS exists`);
    assert.equal(table.rows[0]?.exists, true);

    const customer = id();
    await pool.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Location Proposal Patch Co',false)", [customer, `LPP-${customer}`]);
    const revision = id();
    const template = (await pool.query<{ id: string }>("SELECT id FROM master_service_report_templates WHERE code='MFE-FSSR' AND publication_status='published' ORDER BY version DESC LIMIT 1")).rows[0]!;
    await pool.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);

    const user = async (username: string, role: string) => (await pool.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x',$2) RETURNING id::int AS id", [username, role])).rows[0]!.id;
    const inspector = await user("lpp-tech", "inspector");
    const supervisor = await user("lpp-review", "supervisor"), admin = await user("lpp-admin", "admin");

    const actors: Record<string, { id: number; username: string; role: "admin" | "inspector" | "supervisor" }> = {
      inspector: { id: inspector, username: "lpp-tech", role: "inspector" },
      supervisor: { id: supervisor, username: "lpp-review", role: "supervisor" },
      admin: { id: admin, username: "lpp-admin", role: "admin" }
    };
    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { const actor = actors[request.header("x-test-actor") ?? ""]; if (actor) request.currentUser = actor; next(); });
    app.use(createLocationProposalsRouter(pool)); app.use(createManagerCustomersRouter(pool));
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const { port } = server.address() as { port: number };
    const call = (path: string, actor: string | undefined, method = "GET", body?: unknown) => fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers: { "content-type": "application/json", ...(actor ? { "x-test-actor": actor } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });

    // The customer has co2_fire_extinguisher with no locations yet (General fallback), so a job for
    // this system freezes zero locations -- exactly the scenario a fresh "add-location" targets.
    const co2Job = id();
    const co2Snapshot = {
      schemaVersion: 1, customer: { id: customer, code: `LPP-${customer}`, displayName: "Location Proposal Patch Co" },
      configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE", version: 7 },
      enabledSystems: [{ enabledSystemId: id(), systemKey: "co2_fire_extinguisher", displayName: "CO2", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [] }]
    };
    await pool.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date,created_by_user_id) VALUES($1,$2,$3,'Patch Test','open',false,true,$4,$5,$6,'2026-09-29',$7)",
      [co2Job, template.id, `LPP-JOB-${co2Job}`, customer, revision, co2Snapshot, inspector]);

    const submitPath = `/technician/customers/${customer}/systems/co2_fire_extinguisher/location-proposals`;
    const submit = (actor: string, patch: unknown) => call(submitPath, actor, "POST", { id: id(), jobId: co2Job, patch });
    const decide = (proposalId: string, actor: string, body: unknown) => call(`/manager/location-proposals/${proposalId}/decision`, actor, "POST", body);
    const proposalCount = async () => (await pool.query("SELECT count(*)::int AS n FROM customer_location_proposals")).rows[0].n as number;
    const activeLocations = async () => (await pool.query<{ key: string; rows: number }>(
      `SELECT location.location_key AS key, location.preset_row_count AS rows
       FROM customer_system_locations location
       INNER JOIN customer_enabled_systems enabled ON enabled.id = location.enabled_system_id
       INNER JOIN customer_configuration_revisions revision ON revision.id = enabled.configuration_revision_id
       WHERE revision.customer_id=$1 AND revision.status='active' AND enabled.system_key='co2_fire_extinguisher'
       ORDER BY location.sort_order`, [customer]
    )).rows;

    try {
      // Auth matrix.
      assert.equal((await submit("", addPatchNewZone("tnb-room", "TNB Room", "zone-tnb", "TNB Zone"))).status, 401);
      assert.equal((await submit("supervisor", addPatchNewZone("tnb-room", "TNB Room", "zone-tnb", "TNB Zone"))).status, 403);
      assert.equal((await call("/manager/location-proposals", "inspector")).status, 403);

      // Unsupported system: 404.
      const unsupportedAttempt = await call(`/technician/customers/${customer}/systems/fire_alarm/location-proposals`, "inspector", "POST", { id: id(), jobId: co2Job, patch: addPatchNewZone("x", "X", "zx", "ZX") });
      assert.equal(unsupportedAttempt.status, 404);

      // Malformed patch: 400, no row.
      assert.equal((await submit("inspector", { kind: "add-location", locationKey: "x", displayName: "X", zoneKey: null, newZone: null })).status, 400, "neither zoneKey nor newZone");
      assert.equal(await proposalCount(), 0);

      // First "add-location" proposal (a brand-new named location, no real data yet).
      const tnbPatch = addPatchNewZone("tnb-room", "TNB Room", "zone-tnb", "TNB Zone");
      const tnbSubmit = await submit("inspector", tnbPatch);
      assert.equal(tnbSubmit.status, 201, await tnbSubmit.clone().text());
      const tnbBody = await tnbSubmit.json() as { proposal: { id: string; status: string; payload: { kind: string; locationKey: string } } };
      assert.equal(tnbBody.proposal.status, "pending");
      assert.equal(tnbBody.proposal.payload.kind, "add-location");
      const tnbProposalId = tnbBody.proposal.id;

      // A SECOND proposal targeting a DIFFERENT location of the same system may be pending
      // simultaneously -- the whole point of per-target (not per-system) pending uniqueness.
      const dustPatch = addPatchNewZone("dust-room", "Dust Room", "zone-dust", "Dust Zone");
      const dustSubmit = await submit("inspector", dustPatch);
      assert.equal(dustSubmit.status, 201, await dustSubmit.clone().text());
      const dustProposalId = (await dustSubmit.json() as { proposal: { id: string } }).proposal.id;

      // But a SECOND proposal for the SAME target while one is pending is refused.
      const dustAgain = await submit("inspector", addPatch("dust-room", "Dust Room Again", "zone-dust"));
      assert.equal(dustAgain.status, 409);
      assert.equal((await dustAgain.json() as { error: string }).error, "LOCATION_PROPOSAL_ALREADY_PENDING");

      // Approve TNB Room first.
      const tnbApprove = await decide(tnbProposalId, "supervisor", { requestId: id(), decision: "approved" });
      assert.equal(tnbApprove.status, 201, await tnbApprove.clone().text());
      const tnbApproveBody = await tnbApprove.json() as { proposal: { status: string; decision: { resultingRevisionId: string | null } } };
      assert.equal(tnbApproveBody.proposal.status, "approved");
      assert.ok(tnbApproveBody.proposal.decision.resultingRevisionId);
      assert.deepEqual((await activeLocations()).map((row) => row.key), ["tnb-room"]);

      // Approve Dust Room SECOND: this must not clobber TNB Room, which the SECOND approval's own
      // fresh read of "current configuration" must already include.
      const dustApprove = await decide(dustProposalId, "admin", { requestId: id(), decision: "approved" });
      assert.equal(dustApprove.status, 201, await dustApprove.clone().text());
      assert.deepEqual((await activeLocations()).map((row) => row.key).sort(), ["dust-room", "tnb-room"], "both locations survive sequential independent approval");

      // Now propose an "update-format" patch for TNB Room, capturing real detector-row content.
      const tnbFormat = formatPatch("tnb-room", [{ alarmZone: "Zone A", location: "Zone A Room" }, { alarmZone: "Zone B", location: "Zone B Room" }]);
      const formatSubmit = await submit("inspector", tnbFormat);
      assert.equal(formatSubmit.status, 201, await formatSubmit.clone().text());
      const formatProposalId = (await formatSubmit.json() as { proposal: { id: string } }).proposal.id;

      // Reject requires a note.
      assert.equal((await decide(formatProposalId, "supervisor", { requestId: id(), decision: "rejected" })).status, 400);

      const formatApprove = await decide(formatProposalId, "supervisor", { requestId: id(), decision: "approved" });
      assert.equal(formatApprove.status, 201, await formatApprove.clone().text());
      const afterFormat = await activeLocations();
      assert.equal(afterFormat.find((row) => row.key === "tnb-room")?.rows, 2, "presetRowCount now reflects rows.length");
      const storedRowPreset = await pool.query<{ rowPreset: { rows: unknown[] } }>(
        `SELECT location.row_preset AS "rowPreset" FROM customer_system_locations location
         INNER JOIN customer_enabled_systems enabled ON enabled.id = location.enabled_system_id
         INNER JOIN customer_configuration_revisions revision ON revision.id = enabled.configuration_revision_id
         WHERE revision.customer_id=$1 AND revision.status='active' AND location.location_key='tnb-room'`, [customer]
      );
      assert.deepEqual(storedRowPreset.rows[0]!.rowPreset.rows, tnbFormat.rows, "the exact typed row content is now the customer's saved format");
      assert.deepEqual(afterFormat.find((row) => row.key === "dust-room"), { key: "dust-room", rows: 1 }, "dust-room untouched by TNB's format update");

      // update-format against a location that no longer exists (typo / renamed) is refused at Approve,
      // even though the patch parsed fine at submission time.
      const ghostFormatSubmit = await submit("inspector", formatPatch("ghost-location", [{ alarmZone: "a", location: "b" }]));
      assert.equal(ghostFormatSubmit.status, 201);
      const ghostProposalId = (await ghostFormatSubmit.json() as { proposal: { id: string } }).proposal.id;
      const ghostApprove = await decide(ghostProposalId, "admin", { requestId: id(), decision: "approved" });
      assert.equal(ghostApprove.status, 409);
      assert.equal((await ghostApprove.json() as { error: string }).error, "LOCATION_PROPOSAL_TARGET_INVALID");

      // Terminal: a second decision on an already-decided proposal is refused outright.
      const secondDecision = await decide(tnbProposalId, "admin", { requestId: id(), decision: "rejected", note: "too late" });
      assert.equal(secondDecision.status, 409);
      assert.equal((await secondDecision.json() as { error: string }).error, "LOCATION_PROPOSAL_ALREADY_DECIDED");

      // Reject path, with note, produces no resulting revision.
      const rejectPatch = formatPatch("dust-room", [{ alarmZone: "c", location: "d" }]);
      const rejectSubmit = await submit("inspector", rejectPatch);
      const rejectProposalId = (await rejectSubmit.json() as { proposal: { id: string } }).proposal.id;
      const rejected = await decide(rejectProposalId, "admin", { requestId: id(), decision: "rejected", note: "Not enough detail yet" });
      assert.equal(rejected.status, 201, await rejected.clone().text());
      const rejectedBody = await rejected.json() as { proposal: { status: string; decision: { note: string; resultingRevisionId: string | null } } };
      assert.equal(rejectedBody.proposal.status, "rejected");
      assert.equal(rejectedBody.proposal.decision.resultingRevisionId, null);

      // Roller Shutter uses one shared, zone-free layout. No add-location proposal is needed:
      // first update-format creates General, and the next one updates the same real DB row.
      const shutterJob = id();
      const shutterSnapshot = { ...co2Snapshot, enabledSystems: [{ ...co2Snapshot.enabledSystems[0],
        enabledSystemId: id(), systemKey: "fire_rated_roller_shutter", displayName: "Fire Rated Roller Shutter" }] };
      await pool.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date,created_by_user_id) VALUES($1,$2,$3,'Roller Shutter Format Test','open',false,true,$4,$5,$6,'2026-09-29',$7)",
        [shutterJob, template.id, `LPP-SHUTTER-${shutterJob}`, customer, revision, shutterSnapshot, inspector]);
      const shutterPath = `/technician/customers/${customer}/systems/fire_rated_roller_shutter/location-proposals`;
      const shutterRows = [{ assetReference: "RS-01", locationText: "North lobby" }, { assetReference: "RS-02", locationText: "Loading bay" }];
      const submitShutter = (rows: typeof shutterRows) => call(shutterPath, "inspector", "POST", {
        id: id(), jobId: shutterJob, patch: { kind: "update-format", locationKey: "general", rows }
      });
      assert.equal((await call(shutterPath, "inspector", "POST", { id: id(), jobId: shutterJob,
        patch: { kind: "add-location", locationKey: "general", displayName: "General", zoneKey: null, newZone: { key: "general", displayName: "General" } } })).status, 400);
      const firstShutter = await submitShutter(shutterRows);
      assert.equal(firstShutter.status, 201, await firstShutter.clone().text());
      const firstShutterId = (await firstShutter.json() as { proposal: { id: string } }).proposal.id;
      const firstShutterApproval = await decide(firstShutterId, "supervisor", { requestId: id(), decision: "approved" });
      assert.equal(firstShutterApproval.status, 201, await firstShutterApproval.clone().text());
      const storedShutter = async () => (await pool.query<{ key: string; zoneId: string | null; count: number; preset: { rows: typeof shutterRows } }>(`
        SELECT location.location_key AS key, location.zone_id AS "zoneId", location.preset_row_count AS count,
          location.row_preset AS preset
        FROM customer_system_locations location
        JOIN customer_enabled_systems enabled ON enabled.id=location.enabled_system_id
        JOIN customer_configuration_revisions revision ON revision.id=enabled.configuration_revision_id
        WHERE revision.customer_id=$1 AND revision.status='active' AND enabled.system_key='fire_rated_roller_shutter'`, [customer])).rows;
      assert.deepEqual(await storedShutter(), [{ key: "general", zoneId: null, count: 2, preset: { rows: shutterRows } }]);
      const nextRows = [{ assetReference: "RS-03", locationText: "Plant room" }];
      const secondShutter = await submitShutter(nextRows);
      assert.equal(secondShutter.status, 201, await secondShutter.clone().text());
      const secondShutterId = (await secondShutter.json() as { proposal: { id: string } }).proposal.id;
      const secondShutterApproval = await decide(secondShutterId, "admin", { requestId: id(), decision: "approved" });
      assert.equal(secondShutterApproval.status, 201, await secondShutterApproval.clone().text());
      assert.deepEqual(await storedShutter(), [{ key: "general", zoneId: null, count: 1, preset: { rows: nextRows } }]);

      const hoseJob = id();
      const hoseSnapshot = { ...co2Snapshot, enabledSystems: [{ ...co2Snapshot.enabledSystems[0],
        enabledSystemId: id(), systemKey: "hose_reel", displayName: "Hose Reel" }] };
      await pool.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date,created_by_user_id) VALUES($1,$2,$3,'Hose Reel Format Test','open',false,true,$4,$5,$6,'2026-09-29',$7)",
        [hoseJob, template.id, `LPP-HOSE-${hoseJob}`, customer, revision, hoseSnapshot, inspector]);
      const hosePath = `/technician/customers/${customer}/systems/hose_reel/location-proposals`;
      const hoseRows = [{ assetReference: "HR-01", locationText: "North lobby", drumType: "swing" },
        { assetReference: "HR-02", locationText: "Loading bay", drumType: "fixed" }];
      const submitHose = (rows: typeof hoseRows) => call(hosePath, "inspector", "POST", {
        id: id(), jobId: hoseJob, patch: { kind: "update-format", locationKey: "general", rows }
      });
      const firstHose = await submitHose(hoseRows);
      assert.equal(firstHose.status, 201, await firstHose.clone().text());
      const firstHoseId = (await firstHose.json() as { proposal: { id: string } }).proposal.id;
      assert.equal((await decide(firstHoseId, "supervisor", { requestId: id(), decision: "approved" })).status, 201);
      const storedHose = async () => (await pool.query<{ key: string; zoneId: string | null; count: number; preset: { rows: typeof hoseRows } }>(`
        SELECT location.location_key AS key, location.zone_id AS "zoneId", location.preset_row_count AS count,
          location.row_preset AS preset
        FROM customer_system_locations location
        JOIN customer_enabled_systems enabled ON enabled.id=location.enabled_system_id
        JOIN customer_configuration_revisions revision ON revision.id=enabled.configuration_revision_id
        WHERE revision.customer_id=$1 AND revision.status='active' AND enabled.system_key='hose_reel'`, [customer])).rows;
      assert.deepEqual(await storedHose(), [{ key: "general", zoneId: null, count: 2, preset: { rows: hoseRows } }]);
      const nextHoseRows = [{ assetReference: "HR-03", locationText: "Plant", drumType: "swing" }];
      const secondHose = await submitHose(nextHoseRows);
      assert.equal(secondHose.status, 201, await secondHose.clone().text());
      const secondHoseId = (await secondHose.json() as { proposal: { id: string } }).proposal.id;
      assert.equal((await decide(secondHoseId, "admin", { requestId: id(), decision: "approved" })).status, 201);
      assert.deepEqual(await storedHose(), [{ key: "general", zoneId: null, count: 1, preset: { rows: nextHoseRows } }]);

      // Hydrant and Dry/Wet Riser: unlike Roller Shutter/Hose Reel, these are NOT zone-free -- a
      // real named location (with a zone) must exist via add-location before update-format may
      // target it, exactly the same two-step flow already proven above for CO2's tnb-room.
      for (const systemKey of ["hydrant", "dry_wet_riser"] as const) {
        // Dry/Wet Riser (unlike every other location-configurable system) may only be newly enabled
        // together with its own `systemConfiguration.riserMode` (`assertDryWetRiserAssignments`,
        // pre-existing and out of this task's scope) -- so a technician's own "add-location" proposal
        // cannot be the FIRST thing that enables it for a customer. A Manager sets the riser mode via
        // the normal configuration-revisions save first, exactly as production requires.
        if (systemKey === "dry_wet_riser") {
          const currentlyEnabled = (await pool.query<{ key: string }>(
            `SELECT enabled.system_key AS key FROM customer_enabled_systems enabled
             INNER JOIN customer_configuration_revisions rev ON rev.id = enabled.configuration_revision_id
             WHERE rev.customer_id = $1 AND rev.status = 'active'`, [customer]
          )).rows.map((row) => row.key);
          const enableRiser = await call(`/manager/customers/${customer}/configuration-revisions`, "admin", "POST", {
            systemKeys: [...new Set([...currentlyEnabled, "dry_wet_riser"])],
            systemConfiguration: { dry_wet_riser: { riserMode: "wet" } }
          });
          assert.equal(enableRiser.status, 201, await enableRiser.clone().text());
        }
        const repeatableJob = id();
        const repeatableSnapshot = { ...co2Snapshot, enabledSystems: [{ ...co2Snapshot.enabledSystems[0],
          enabledSystemId: id(), systemKey, displayName: systemKey }] };
        await pool.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date,created_by_user_id) VALUES($1,$2,$3,$4,'open',false,true,$5,$6,$7,'2026-09-29',$8)",
          [repeatableJob, template.id, `LPP-${systemKey}-${repeatableJob}`, `${systemKey} Format Test`, customer, revision, repeatableSnapshot, inspector]);
        const repeatablePath = `/technician/customers/${customer}/systems/${systemKey}/location-proposals`;
        const locationKey = `${systemKey}-loc`;

        const addFirst = await call(repeatablePath, "inspector", "POST", { id: id(), jobId: repeatableJob, patch: addPatchNewZone(locationKey, "Location A", `${systemKey}-zone`, "Zone A") });
        assert.equal(addFirst.status, 201, await addFirst.clone().text());
        const addFirstId = (await addFirst.json() as { proposal: { id: string } }).proposal.id;
        const addFirstApprove = await decide(addFirstId, "supervisor", { requestId: id(), decision: "approved" });
        assert.equal(addFirstApprove.status, 201, await addFirstApprove.clone().text());

        const repeatableRows = [{ assetReference: "REF-01", locationText: "North wall" }, { assetReference: "REF-02", locationText: "South wall" }];
        const submitFormat = (rows: typeof repeatableRows) => call(repeatablePath, "inspector", "POST", {
          id: id(), jobId: repeatableJob, patch: { kind: "update-format", locationKey, rows }
        });
        const firstFormat = await submitFormat(repeatableRows);
        assert.equal(firstFormat.status, 201, await firstFormat.clone().text());
        const firstFormatId = (await firstFormat.json() as { proposal: { id: string } }).proposal.id;
        assert.equal((await decide(firstFormatId, "admin", { requestId: id(), decision: "approved" })).status, 201);

        const storedRepeatable = async () => (await pool.query<{ count: number; preset: { rows: typeof repeatableRows } }>(`
          SELECT location.preset_row_count AS count, location.row_preset AS preset
          FROM customer_system_locations location
          JOIN customer_enabled_systems enabled ON enabled.id=location.enabled_system_id
          JOIN customer_configuration_revisions revision ON revision.id=enabled.configuration_revision_id
          WHERE revision.customer_id=$1 AND revision.status='active' AND enabled.system_key=$2 AND location.location_key=$3`, [customer, systemKey, locationKey])).rows;
        assert.deepEqual(await storedRepeatable(), [{ count: 2, preset: { rows: repeatableRows } }], systemKey);

        // A second update-format REPLACES the row content in place -- the customer's other
        // (co2 tnb-room / dust-room, roller shutter, hose reel) locations proven above stay untouched.
        const nextRepeatableRows = [{ assetReference: "REF-03", locationText: "Plant room" }];
        const secondFormat = await submitFormat(nextRepeatableRows);
        assert.equal(secondFormat.status, 201, await secondFormat.clone().text());
        const secondFormatId = (await secondFormat.json() as { proposal: { id: string } }).proposal.id;
        assert.equal((await decide(secondFormatId, "supervisor", { requestId: id(), decision: "approved" })).status, 201);
        assert.deepEqual(await storedRepeatable(), [{ count: 1, preset: { rows: nextRepeatableRows } }], systemKey);

        // Still not zone-free: update-format against a location that doesn't exist yet is refused,
        // not implicitly turned into a General location the way Roller Shutter/Hose Reel behave.
        const ghostSubmit = await call(repeatablePath, "inspector", "POST", { id: id(), jobId: repeatableJob, patch: { kind: "update-format", locationKey: `${systemKey}-ghost`, rows: [{ assetReference: "x", locationText: "y" }] } });
        assert.equal(ghostSubmit.status, 201);
        const ghostSubmitId = (await ghostSubmit.json() as { proposal: { id: string } }).proposal.id;
        const ghostDecision = await decide(ghostSubmitId, "admin", { requestId: id(), decision: "approved" });
        assert.equal(ghostDecision.status, 409, systemKey);
        assert.equal((await ghostDecision.json() as { error: string }).error, "LOCATION_PROPOSAL_TARGET_INVALID");
      }

      // Fire Alarm: zone-free like Roller Shutter/Hose Reel, but with TWO independent pseudo-locations
      // ("general-primary" / "general-secondary", one per repeatable table) instead of one --
      // add-location stays refused, and each pseudo-location's first approved update-format
      // bootstraps it without disturbing the other.
      {
        const fireAlarmJob = id();
        const fireAlarmSnapshot = { ...co2Snapshot, enabledSystems: [{ ...co2Snapshot.enabledSystems[0],
          enabledSystemId: id(), systemKey: "fire_alarm_detector", displayName: "fire_alarm_detector" }] };
        await pool.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date,created_by_user_id) VALUES($1,$2,$3,'Fire Alarm Format Test','open',false,true,$4,$5,$6,'2026-09-29',$7)",
          [fireAlarmJob, template.id, `LPP-fire-alarm-${fireAlarmJob}`, customer, revision, fireAlarmSnapshot, inspector]);
        const fireAlarmPath = `/technician/customers/${customer}/systems/fire_alarm_detector/location-proposals`;

        const addRefused = await call(fireAlarmPath, "inspector", "POST", { id: id(), jobId: fireAlarmJob, patch: addPatchNewZone("general-primary", "X", "fa-zone", "Zone") });
        assert.equal(addRefused.status, 400, await addRefused.clone().text());

        const primaryRows = [{ assetReference: "FA-01", alarmZone: "Zone A", location: "Level 1 Lobby" }, { assetReference: "FA-02", alarmZone: "Zone B", location: "Level 2 Corridor" }];
        const submitPrimary = (rows: typeof primaryRows) => call(fireAlarmPath, "inspector", "POST", {
          id: id(), jobId: fireAlarmJob, patch: { kind: "update-format", locationKey: "general-primary", rows }
        });
        const firstPrimary = await submitPrimary(primaryRows);
        assert.equal(firstPrimary.status, 201, await firstPrimary.clone().text());
        const firstPrimaryId = (await firstPrimary.json() as { proposal: { id: string } }).proposal.id;
        assert.equal((await decide(firstPrimaryId, "supervisor", { requestId: id(), decision: "approved" })).status, 201);

        const secondaryRows = [{ assetReference: "FA-10", location: "Guard House Panel" }];
        const submitSecondary = (rows: typeof secondaryRows) => call(fireAlarmPath, "inspector", "POST", {
          id: id(), jobId: fireAlarmJob, patch: { kind: "update-format", locationKey: "general-secondary", rows }
        });
        const firstSecondary = await submitSecondary(secondaryRows);
        assert.equal(firstSecondary.status, 201, await firstSecondary.clone().text());
        const firstSecondaryId = (await firstSecondary.json() as { proposal: { id: string } }).proposal.id;
        assert.equal((await decide(firstSecondaryId, "admin", { requestId: id(), decision: "approved" })).status, 201);

        const storedFireAlarm = async () => (await pool.query<{ key: string; count: number; preset: unknown }>(`
          SELECT location.location_key AS key, location.preset_row_count AS count, location.row_preset AS preset
          FROM customer_system_locations location
          JOIN customer_enabled_systems enabled ON enabled.id=location.enabled_system_id
          JOIN customer_configuration_revisions revision ON revision.id=enabled.configuration_revision_id
          WHERE revision.customer_id=$1 AND revision.status='active' AND enabled.system_key='fire_alarm_detector'
          ORDER BY location.location_key`, [customer])).rows;
        assert.deepEqual(await storedFireAlarm(), [
          { key: "general-primary", count: 2, preset: { fireAlarmTable: "primary", rows: primaryRows } },
          { key: "general-secondary", count: 1, preset: { fireAlarmTable: "secondary", rows: secondaryRows } }
        ]);

        // A second update-format against general-primary replaces its rows in place, preserves
        // fireAlarmTable (losing it would make the next visit's form throw), and leaves
        // general-secondary completely untouched.
        const nextPrimaryRows = [{ assetReference: "FA-99", alarmZone: "Zone C", location: "Roof Plant Room" }];
        const secondPrimary = await submitPrimary(nextPrimaryRows);
        assert.equal(secondPrimary.status, 201, await secondPrimary.clone().text());
        const secondPrimaryId = (await secondPrimary.json() as { proposal: { id: string } }).proposal.id;
        assert.equal((await decide(secondPrimaryId, "supervisor", { requestId: id(), decision: "approved" })).status, 201);
        assert.deepEqual(await storedFireAlarm(), [
          { key: "general-primary", count: 1, preset: { fireAlarmTable: "primary", rows: nextPrimaryRows } },
          { key: "general-secondary", count: 1, preset: { fireAlarmTable: "secondary", rows: secondaryRows } }
        ]);

        // A secondary-shaped row ({assetReference, location}, no alarmZone) submitted against
        // general-primary is refused at submit time, not silently accepted or cross-applied.
        const crossShape = await call(fireAlarmPath, "inspector", "POST", { id: id(), jobId: fireAlarmJob, patch: { kind: "update-format", locationKey: "general-primary", rows: secondaryRows } });
        assert.equal(crossShape.status, 400, await crossShape.clone().text());
      }
    } finally { await close(server); }

    // Append-only at the database level.
    await assert.rejects(pool.query("UPDATE customer_location_proposals SET system_key='hydrant'"), /append-only/);
    await assert.rejects(pool.query("DELETE FROM customer_location_proposals"), /append-only/);
    await assert.rejects(pool.query("UPDATE customer_location_proposal_decisions SET decision='rejected'"), /append-only/);
    await assert.rejects(pool.query("DELETE FROM customer_location_proposal_decisions"), /append-only/);
  } finally { await pool.end(); }
});

async function close(server: import("node:http").Server) {
  server.close(); await once(server, "close");
}
