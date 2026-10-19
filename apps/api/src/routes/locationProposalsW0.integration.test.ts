import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { createTechnicianLocationProposalsRouter } from "./technicianLocationProposals.js";
import { listLocationProposals } from "../inspections/locationProposal.js";
import { runMigrations } from "../db/migrations.js";
import { pool } from "../db/pool.js";
import { v7IntegrationDatabaseUrl } from "../sync/v7IntegrationTestDatabase.js";
import { createLocationProposalsRouter } from "./locationProposals.js";
import { createManagerCustomersRouter } from "./managerCustomers.js";

/** W0 contract regressions against the disposable database only. */
const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();

const addPatch = (locationKey: string, displayName: string, zoneKey: string) =>
  ({ kind: "add-location" as const, locationKey, displayName, zoneKey, newZone: null });
const addPatchNewZone = (locationKey: string, displayName: string, zoneKey: string, zoneDisplayName: string) =>
  ({ kind: "add-location" as const, locationKey, displayName, zoneKey: null, newZone: { key: zoneKey, displayName: zoneDisplayName } });
const formatPatch = (locationKey: string, rows: Array<{ alarmZone: string; location: string }>) =>
  ({ kind: "update-format" as const, locationKey, rows });

test("W0 edited approvals, withdrawal, read-back, SQL filtering, races and migration preservation", { skip: !databaseUrl }, async () => {
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
    const otherInspector = await user("w0-other-tech", "inspector");
    const supervisor = await user("lpp-review", "supervisor"), admin = await user("lpp-admin", "admin");

    const actors: Record<string, { id: number; username: string; role: "admin" | "inspector" | "supervisor" }> = {
      other: { id: otherInspector, username: "w0-other-tech", role: "inspector" },
      inspector: { id: inspector, username: "lpp-tech", role: "inspector" },
      supervisor: { id: supervisor, username: "lpp-review", role: "supervisor" },
      admin: { id: admin, username: "lpp-admin", role: "admin" }
    };
    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { const actor = actors[request.header("x-test-actor") ?? ""]; if (actor) request.currentUser = actor; next(); });
    app.use(createLocationProposalsRouter(pool)); app.use(createTechnicianLocationProposalsRouter(pool)); app.use(createManagerCustomersRouter(pool));
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
    try {
      const proposal = async (patch: unknown) => {
        const response = await submit("inspector", patch);
        assert.equal(response.status, 201, await response.clone().text());
        return (await response.json()).proposal;
      };
      const withdraw = (proposalId: string, actor = "inspector", requestId = id()) => call(`/technician/location-proposals/${proposalId}/withdraw`, actor, "POST", { requestId });
      const detail = async (proposalId: string) => {
        const response = await call(`/manager/location-proposals/${proposalId}`, "supervisor");
        assert.equal(response.status, 200, await response.clone().text());
        return (await response.json()).proposal;
      };
      const a = await proposal(addPatchNewZone("a", "Original", "za", "Zone A"));
      assert.equal(a.jobReference, `LPP-JOB-${co2Job}`);
      assert.equal(a.systemDisplayName, (await pool.query("SELECT display_name FROM master_service_report_systems WHERE template_version_id=$1 AND system_key='co2_fire_extinguisher'", [template.id])).rows[0].display_name);
      assert.equal((await detail(a.id)).mergeable, true);
      assert.equal((await detail(a.id)).currentLocation, null);
      assert.deepEqual((await detail(a.id)).currentRows, []);
      assert.deepEqual((await detail(a.id)).availableZones, [], "a new system has no live zones");
      const readPath = `/technician/location-proposals?jobId=${co2Job}`;
      assert.equal((await call(readPath, undefined)).status, 401);
      assert.equal((await call(readPath, "supervisor")).status, 403);
      assert.equal((await call('/technician/location-proposals?jobId=bad', "inspector")).status, 400);
      assert.equal((await call(readPath + '&unknown=x', "inspector")).status, 400);
      assert.deepEqual((await (await call(readPath, "other")).json()).proposals, []);
      const read = await call(readPath, "inspector");
      assert.equal(read.headers.get("cache-control"), "private, no-store");
      assert.deepEqual((await read.json()).proposals.map((p: { id: string }) => p.id), [a.id]);
      assert.equal((await withdraw(a.id, "other")).status, 404);
      assert.equal((await withdraw(a.id, "")).status, 401);
      assert.equal((await withdraw(a.id, "supervisor")).status, 403);
      const appliedPatch = addPatchNewZone("a", "Edited name", "za", "Edited zone");
      const editBody = { requestId: id(), decision: "approved", appliedPatch };
      for (const invalid of [ { ...appliedPatch, kind: "wrong" }, { ...appliedPatch, locationKey: "other" },
        { ...appliedPatch, systemKey: "hydrant" }, { kind: "update-format", locationKey: "a", rows: [{ alarmZone: "A", location: "X" }] } ]) {
        assert.equal((await decide(a.id, "supervisor", { ...editBody, appliedPatch: invalid })).status, 400);
      }
      assert.equal((await decide(a.id, "supervisor", { ...editBody, decision: "rejected", note: "Rejected" })).status, 400);
      const approval = await decide(a.id, "supervisor", editBody);
      assert.equal(approval.status, 201, await approval.clone().text());
      const approved = (await approval.json()).proposal;
      assert.equal(approved.edited, true);
      assert.equal(approved.payload.displayName, "Original");
      assert.deepEqual(approved.decision.appliedPatch, appliedPatch);
      assert.equal((await detail(a.id)).currentLocation.displayName, "Edited name");
      assert.deepEqual((await detail(a.id)).availableZones, [{ key: "za", displayName: "Edited zone" }], "live zone keys and names come from the current customer/system configuration");
      assert.ok((await detail(a.id)).mergeable.reason.includes("decided"));
      assert.equal((await decide(a.id, "admin", editBody)).status, 200);
      assert.equal((await decide(a.id, "supervisor", { ...editBody, appliedPatch: { ...appliedPatch, displayName: "Other" } })).status, 409);
      assert.equal((await withdraw(a.id)).status, 409);
      assert.equal((await withdraw(a.id, "inspector", editBody.requestId)).status, 409);
      const rows = [{ alarmZone: "A", location: "Lobby" }, { alarmZone: "B", location: "Hall" }];
      const f = await proposal(formatPatch("a", rows));
      const fBody = { requestId: id(), decision: "approved", appliedPatch: formatPatch("a", [{ alarmZone: "C", location: "Changed" }]) };
      assert.equal((await decide(f.id, "admin", { ...fBody, appliedPatch: formatPatch("a", [...rows, rows[0]!]) })).status, 400);
      assert.equal((await decide(f.id, "admin", fBody)).status, 201);
      assert.deepEqual((await detail(f.id)).currentRows, fBody.appliedPatch.rows);
      assert.equal((await decide(f.id, "admin", fBody)).status, 200);
      assert.equal((await decide(f.id, "admin", { ...fBody, appliedPatch: formatPatch("a", rows) })).status, 409);
      const rejected = await proposal(formatPatch("a", rows));
      assert.equal((await decide(rejected.id, "admin", { requestId: id(), decision: "rejected", note: "Please revise this" })).status, 201);
      const resubmitted = await proposal(formatPatch("a", rows));
      const withdrawId = id();
      assert.equal((await withdraw(resubmitted.id, "inspector", withdrawId)).status, 201);
      const replay = await withdraw(resubmitted.id.toUpperCase(), "inspector", withdrawId);
      assert.equal(replay.status, 200);
      const withdrawn = (await replay.json()).proposal;
      assert.equal(withdrawn.status, "withdrawn"); assert.equal(withdrawn.edited, false);
      assert.equal(withdrawn.decision.decidedByRole, "inspector"); assert.equal(withdrawn.decision.appliedPatch, null);
      assert.equal((await withdraw(resubmitted.id)).status, 409);
      assert.equal((await decide(resubmitted.id, "admin", { requestId: id(), decision: "approved" })).status, 409);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE entity_id=$1 AND action='technician_location_proposal_withdrawn'", [resubmitted.id])).rows[0].n, 1);
      const rollback = await proposal(formatPatch("a", rows));
      const revisionBeforeRollback = (await pool.query("SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [customer])).rows[0].id;
      await pool.query(`CREATE FUNCTION w0_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.reason = 'W0_FORCE_ROLLBACK' THEN RAISE EXCEPTION 'W0 injected audit failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER w0_reject_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION w0_reject_audit();`);
      try {
        assert.equal((await decide(rollback.id, "admin", { requestId: id(), decision: "approved", note: "W0_FORCE_ROLLBACK" })).status, 500);
        assert.equal((await pool.query("SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [customer])).rows[0].id, revisionBeforeRollback);
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM customer_location_proposal_decisions WHERE proposal_id=$1", [rollback.id])).rows[0].n, 0);
      } finally { await pool.query("DROP TRIGGER w0_reject_audit ON audit_events; DROP FUNCTION w0_reject_audit();"); }
      // Failed transaction leaves pending data intact, and stale-tab writes cannot change it.
      const stale = await fetch(`http://127.0.0.1:${port}/technician/location-proposals/${rollback.id}/withdraw`, {
        method: "POST", headers: { "content-type": "application/json", "x-test-actor": "inspector", "x-expected-user-id": String(otherInspector) },
        body: JSON.stringify({ requestId: id() })
      });
      assert.equal(stale.status, 409); assert.equal((await stale.json()).error, "IDENTITY_MISMATCH");
      assert.equal((await detail(rollback.id)).status, "pending");
      assert.equal((await withdraw(rollback.id)).status, 201);
      const unchanged = await proposal(formatPatch("a", rows));
      const unchangedApproval = await decide(unchanged.id, "admin", { requestId: id(), decision: "approved", appliedPatch: formatPatch("a", rows) });
      assert.equal(unchangedApproval.status, 201);
      const unchangedBody = (await unchangedApproval.json()).proposal;
      assert.equal(unchangedBody.edited, false); assert.equal(unchangedBody.decision.appliedPatch, null);
      const race = await proposal(formatPatch("a", rows)); // resubmit after withdrawal
      const raceResult = await Promise.all([decide(race.id.toUpperCase(), "admin", { requestId: id(), decision: "approved" }), withdraw(race.id)]);
      assert.deepEqual(raceResult.map((r) => r.status).sort(), [201, 409]);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM customer_location_proposal_decisions WHERE proposal_id=$1", [race.id])).rows[0].n, 1);
      // Repeated races cover both terminal outcomes, with no duplicate revision/audit decision.
      for (let attempt = 0; attempt < 4; attempt++) {
        const racing = await proposal(formatPatch("a", rows));
        const responses = await Promise.all([withdraw(racing.id), decide(racing.id, "supervisor", { requestId: id(), decision: "approved" })]);
        assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
      }
      const missing = await proposal(formatPatch("missing", rows));
      assert.match((await detail(missing.id)).mergeable.reason, /no longer exists/);
      const collision = await proposal(addPatchNewZone("a", "A", "new-zone", "New"));
      assert.match((await detail(collision.id)).mergeable.reason, /location.*already exists/);
      const zoneMissing = await proposal(addPatch("b", "B", "missing-zone"));
      assert.match((await detail(zoneMissing.id)).mergeable.reason, /zone no longer exists/);
      const zoneCollision = await proposal(addPatchNewZone("c", "C", "za", "Zone A"));
      assert.match((await detail(zoneCollision.id)).mergeable.reason, /zone.*already exists/);
      // Historical malformed submissions remain visible, cannot be approved, and can still be rejected unchanged.
      const unreadableId = id(), unreadablePayload = { zones: [], locations: [] };
      await pool.query(`INSERT INTO customer_location_proposals(id,customer_id,system_key,job_id,submitted_by_user_id,submitted_by_role,payload)
        VALUES($1,$2,'co2_fire_extinguisher',$3,$4,'inspector',$5)`, [unreadableId, customer, co2Job, inspector, unreadablePayload]);
      assert.match((await detail(unreadableId)).mergeable.reason, /cannot be read/);
      assert.equal((await decide(unreadableId, "admin", { requestId: id(), decision: "approved" })).status, 409);
      const rejectUnreadable = await decide(unreadableId, "admin", { requestId: id(), decision: "rejected", note: "Legacy submission cannot be read" });
      assert.equal(rejectUnreadable.status, 201);
      assert.deepEqual((await rejectUnreadable.json()).proposal.payload, unreadablePayload);
      // All status tabs are filtered by SQL, counts remain over the entire inbox.
      for (const status of ["pending", "approved", "rejected", "withdrawn"] as const) {
        let queryCount = 0;
        const queryable = { query: async (sql: string, params: unknown[]) => {
          queryCount++; assert.ok(sql.includes("p.status = $1")); assert.equal(params[0], status);
          return pool.query(sql, params);
        } } as unknown as Pick<typeof pool, "query">;
        const listed = await listLocationProposals(queryable, status);
        assert.equal(queryCount, 1); assert.ok(listed.proposals.every((p) => p.status === status));
        const http = await call(`/manager/location-proposals?status=${status}`, "admin");
        assert.equal(http.status, 200);
        const body = await http.json(); assert.deepEqual(body.counts, listed.counts);
        assert.equal(body.proposals.length, listed.counts[status]);
      }
      assert.equal((await call('/manager/location-proposals?status=unknown', "admin")).status, 400);
      assert.equal((await call('/manager/location-proposals?extra=x', "admin")).status, 400);
      const own = (await (await call(readPath, "inspector")).json()).proposals;
      assert.ok(own.some((p: { status: string }) => p.status === "withdrawn"));
      assert.ok(own.every((p: { submittedByUserId: number }) => p.submittedByUserId === inspector));
      assert.equal((await call(`/technician/location-proposals/${missing.id}/withdraw`, "inspector", "POST", { requestId: id(), extra: true })).status, 400);
      assert.equal((await call(`/technician/location-proposals/${missing.id}/withdraw`, "inspector", "POST", { requestId: id() })).status, 201);
      // Re-applying startup to populated data must not alter immutable proposals/decisions.
      const before = (await pool.query("SELECT jsonb_agg(to_jsonb(d) ORDER BY id) AS rows FROM customer_location_proposal_decisions d")).rows[0].rows;
      await runMigrations(pool);
      assert.deepEqual((await pool.query("SELECT jsonb_agg(to_jsonb(d) ORDER BY id) AS rows FROM customer_location_proposal_decisions d")).rows[0].rows, before);
      await assert.rejects(pool.query("UPDATE customer_location_proposal_decisions SET note='changed'"), /append-only/);
      await assert.rejects(pool.query("TRUNCATE customer_location_proposal_decisions"), /append-only/);
    } finally { server.close(); await once(server, "close"); }
  } finally { await pool.end(); }
});
