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
 * Location proposal: a technician-drafted zone/location breakdown, reviewed by a Supervisor/Admin,
 * and (on Approve) written through the exact same path a Manager's own PUT locations edit uses. This
 * test drives the real HTTP routes against a disposable Postgres -- never a mocked derivation -- and
 * proves: idempotent submission, one-pending-per-(customer,systemKey), role gating, terminal decisions
 * (no re-decision), Approve producing a real versioned configuration, and append-only storage.
 */
const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();

const submission = {
  zones: [
    { key: "prop-zone-a", displayName: "Proposed Zone A", sortOrder: 1 },
    { key: "prop-zone-b", displayName: "Proposed Zone B", sortOrder: 2 }
  ],
  locations: [
    { key: "prop-loc-1", displayName: "Proposed Location 1", zoneId: "prop-zone-a", presetRowCount: 2 },
    { key: "prop-loc-2", displayName: "Proposed Location 2", zoneId: "prop-zone-b", presetRowCount: 3 }
  ]
};

test("location proposals: submission idempotency, one pending per customer+system, review roles, terminal Approve/Reject, append-only", { skip: !databaseUrl }, async () => {
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(pool);
    const table = await pool.query<{ exists: boolean }>(`SELECT to_regclass('public.customer_location_proposals') IS NOT NULL AS exists`);
    assert.equal(table.rows[0]?.exists, true);

    const customer = id();
    await pool.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Location Proposal Co',false)", [customer, `LP-${customer}`]);
    const revision = id();
    const template = (await pool.query<{ id: string }>("SELECT id FROM master_service_report_templates WHERE code='MFE-FSSR' AND publication_status='published' ORDER BY version DESC LIMIT 1")).rows[0]!;
    await pool.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);

    const user = async (username: string, role: string) => (await pool.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x',$2) RETURNING id::int AS id", [username, role])).rows[0]!.id;
    const inspector = await user("lp-tech", "inspector"), otherInspector = await user("lp-tech-2", "inspector");
    const supervisor = await user("lp-review", "supervisor"), admin = await user("lp-admin", "admin");

    const actors: Record<string, { id: number; username: string; role: "admin" | "inspector" | "supervisor" }> = {
      inspector: { id: inspector, username: "lp-tech", role: "inspector" },
      otherInspector: { id: otherInspector, username: "lp-tech-2", role: "inspector" },
      supervisor: { id: supervisor, username: "lp-review", role: "supervisor" },
      admin: { id: admin, username: "lp-admin", role: "admin" }
    };
    const createJob = async (actorId: number) => {
      const job = id();
      const snapshot = { schemaVersion: 1,
        customer: { id: customer, code: `LP-${customer}`, displayName: "Location Proposal Co" },
        configuration: { revisionId: revision, revisionNumber: 1 },
        template: { id: template.id, code: "MFE-FSSR", version: 7 },
        enabledSystems: [{ systemKey: "co2_fire_extinguisher" }] };
      await pool.query(`INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,
        technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date,created_by_user_id)
        VALUES($1,$2,$3,'Location proposal visit','open',false,true,$4,$5,$6,'2026-09-29',$7)`,
        [job, template.id, `LP-${job}`, customer, revision, snapshot, actorId]);
      return job;
    };
    const jobId = await createJob(inspector);
    const otherJobId = await createJob(otherInspector);
    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { const actor = actors[request.header("x-test-actor") ?? ""]; if (actor) request.currentUser = actor; next(); });
    app.use(createLocationProposalsRouter(pool)); app.use(createManagerCustomersRouter(pool));
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const { port } = server.address() as { port: number };
    const call = (path: string, actor: string | undefined, method = "GET", body?: unknown) => fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers: { "content-type": "application/json", ...(actor ? { "x-test-actor": actor } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const submitPath = `/technician/customers/${customer}/systems/co2_fire_extinguisher/location-proposals`;
    const submit = (actor: string, body: Record<string, unknown>) => call(submitPath, actor, "POST", { jobId, ...body });
    const decide = (proposalId: string, actor: string, body: unknown) => call(`/manager/location-proposals/${proposalId}/decision`, actor, "POST", body);
    const proposalCount = async () => (await pool.query("SELECT count(*)::int AS n FROM customer_location_proposals")).rows[0].n as number;

    try {
      // Auth matrix: unauthenticated / wrong role.
      assert.equal((await submit("", { id: id(), ...submission })).status, 401);
      assert.equal((await submit("supervisor", { id: id(), ...submission })).status, 403, "a supervisor never submits a proposal");
      assert.equal((await call("/manager/location-proposals", "inspector")).status, 403, "a technician never reviews");
      assert.equal((await call("/manager/location-proposals", undefined)).status, 401);

      // Unsupported system: 404 before any write.
      const hydrantPath = `/technician/customers/${customer}/systems/hydrant/location-proposals`;
      const hydrantAttempt = await call(hydrantPath, "inspector", "POST", { id: id(), jobId, ...submission });
      assert.equal(hydrantAttempt.status, 404);
      assert.equal((await hydrantAttempt.json() as { error: string }).error, "LOCATION_PROPOSALS_UNSUPPORTED_SYSTEM");

      // Malformed payload: 400, no row created.
      const bad = await submit("inspector", { id: id(), zones: submission.zones, locations: [{ key: "x", displayName: "X", zoneId: "not-a-zone", presetRowCount: 1 }] });
      assert.equal(bad.status, 400);
      assert.equal(await proposalCount(), 0);
      assert.equal((await submit("inspector", { id: id(), jobId: null, ...submission })).status, 400,
        "a proposal must identify the service visit where the technician drafted it");
      assert.equal((await submit("inspector", { id: id(), jobId: id(), ...submission })).status, 404,
        "a proposal must reference a real visit owned by this technician");
      assert.equal((await submit("otherInspector", { id: id(), ...submission })).status, 404,
        "a technician cannot submit using another technician's visit");
      assert.equal(await proposalCount(), 0);

      // First submission creates a pending proposal.
      const proposalId = id();
      const first = await submit("inspector", { id: proposalId, ...submission });
      assert.equal(first.status, 201, await first.clone().text());
      const firstBody = await first.json() as { proposal: { id: string; status: string; zoneCount: number; locationCount: number; submittedBy: string; submittedByUserId: unknown } };
      assert.equal(firstBody.proposal.status, "pending");
      assert.equal(firstBody.proposal.zoneCount, 2);
      assert.equal(firstBody.proposal.locationCount, 2);
      assert.equal(firstBody.proposal.submittedBy, "lp-tech");
      // Regression: `users.id` is BIGINT; pg returns it as a string unless explicitly cast. The web
      // client's `isLocationProposal` validator requires `Number.isSafeInteger`, so an uncast id here
      // silently fails validation client-side and is misreported as "server data unavailable".
      assert.equal(typeof firstBody.proposal.submittedByUserId, "number");
      assert.equal(firstBody.proposal.submittedByUserId, inspector);
      assert.equal(await proposalCount(), 1);

      // Idempotent replay of the exact same id + content.
      const replay = await submit("inspector", { id: proposalId, ...submission });
      assert.equal(replay.status, 200);
      assert.equal(await proposalCount(), 1);
      assert.equal((await submit("otherInspector", { id: proposalId, jobId: otherJobId, ...submission })).status, 404,
        "another technician cannot replay a proposal UUID");

      // Same id, different content: refused.
      const reused = await submit("inspector", { id: proposalId, zones: submission.zones, locations: [submission.locations[0]] });
      assert.equal(reused.status, 409);
      assert.equal((await reused.json() as { error: string }).error, "LOCATION_PROPOSAL_REQUEST_REUSED");

      // A second, different technician cannot start a second proposal for the same customer+system
      // while one is pending.
      const secondPending = await call(submitPath, "otherInspector", "POST", { id: id(), jobId: otherJobId, ...submission });
      assert.equal(secondPending.status, 409);
      assert.equal((await secondPending.json() as { error: string }).error, "LOCATION_PROPOSAL_ALREADY_PENDING");
      assert.equal(await proposalCount(), 1);

      // Manager list surfaces it as pending; detail matches. Both GET routes -- the ones an actual
      // Manager/Supervisor screen calls -- must also return a numeric submittedByUserId (see the
      // POST regression assertion above for why this matters).
      const listed = await (await call("/manager/location-proposals?status=pending", "admin")).json() as { proposals: Array<{ id: string; submittedByUserId: unknown }> };
      assert.ok(listed.proposals.some((row) => row.id === proposalId));
      assert.equal(typeof listed.proposals.find((row) => row.id === proposalId)?.submittedByUserId, "number");
      const detail = await (await call(`/manager/location-proposals/${proposalId}`, "supervisor")).json() as { proposal: { status: string; submittedByUserId: unknown; payload: { zones: unknown[]; locations: unknown[] } } };
      assert.equal(detail.proposal.status, "pending");
      assert.equal(typeof detail.proposal.submittedByUserId, "number");
      // Stored payload is the server-NORMALISED shape (parseLocationConfigurationInput adds
      // rowPreset/sortOrder), not the raw submission literal.
      assert.deepEqual(detail.proposal.payload.zones.map((zone: any) => zone.key), submission.zones.map((zone) => zone.key));
      assert.deepEqual(detail.proposal.payload.locations.map((location: any) => location.key), submission.locations.map((location) => location.key));

      // Reject requires a note.
      assert.equal((await decide(proposalId, "supervisor", { requestId: id(), decision: "rejected" })).status, 400);
      assert.equal((await decide(proposalId, "supervisor", { requestId: id(), decision: "rejected", note: "xx" })).status, 400, "note below 3 chars");

      // Approve's note is optional.
      const approveRequestId = id();
      const approved = await decide(proposalId, "supervisor", { requestId: approveRequestId, decision: "approved" });
      assert.equal(approved.status, 201, await approved.clone().text());
      const approvedBody = await approved.json() as { proposal: { status: string; decision: { decidedByRole: string; resultingRevisionId: string | null } } };
      assert.equal(approvedBody.proposal.status, "approved");
      assert.equal(approvedBody.proposal.decision.decidedByRole, "supervisor");
      assert.ok(approvedBody.proposal.decision.resultingRevisionId, "approve produced a real configuration revision");
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='location_proposal_approved'")).rows[0].n, 1);

      // The approved revision is now the customer's active co2 zones/locations -- the exact write
      // path a Manager's own PUT would have produced.
      const activeCo2 = await pool.query<{ zoneKey: string; locKey: string }>(
        `SELECT zone.zone_key AS "zoneKey", location.location_key AS "locKey"
         FROM customer_system_locations location
         INNER JOIN customer_system_zones zone ON zone.id = location.zone_id
         INNER JOIN customer_enabled_systems enabled ON enabled.id = location.enabled_system_id
         INNER JOIN customer_configuration_revisions revision ON revision.id = enabled.configuration_revision_id
         WHERE revision.customer_id=$1 AND revision.status='active' AND enabled.system_key='co2_fire_extinguisher'
         ORDER BY location.sort_order`, [customer]
      );
      assert.deepEqual(activeCo2.rows.map((row) => row.locKey), ["prop-loc-1", "prop-loc-2"]);

      // Idempotent replay of the same decision request.
      const decisionReplay = await decide(proposalId, "supervisor", { requestId: approveRequestId, decision: "approved" });
      assert.equal(decisionReplay.status, 200);

      // A different body under the same decision requestId is refused.
      const decisionReused = await decide(proposalId, "admin", { requestId: approveRequestId, decision: "rejected", note: "changed my mind" });
      assert.equal(decisionReused.status, 409);
      assert.equal((await decisionReused.json() as { error: string }).error, "LOCATION_PROPOSAL_DECISION_REQUEST_REUSED");

      // Terminal: a genuinely new decision on an already-decided proposal is refused outright.
      const secondDecision = await decide(proposalId, "admin", { requestId: id(), decision: "rejected", note: "too late, already approved" });
      assert.equal(secondDecision.status, 409);
      assert.equal((await secondDecision.json() as { error: string }).error, "LOCATION_PROPOSAL_ALREADY_DECIDED");

      // Now that the proposal is decided, a fresh proposal for the same customer+system may be submitted.
      const secondProposalId = id();
      const secondSubmit = await submit("otherInspector", { id: secondProposalId, jobId: otherJobId, zones: [submission.zones[0]], locations: [submission.locations[0]] });
      assert.equal(secondSubmit.status, 201, await secondSubmit.clone().text());

      // Reject path, with note.
      const rejected = await decide(secondProposalId, "admin", { requestId: id(), decision: "rejected", note: "Zone names too generic" });
      assert.equal(rejected.status, 201, await rejected.clone().text());
      const rejectedBody = await rejected.json() as { proposal: { status: string; decision: { note: string; resultingRevisionId: string | null } } };
      assert.equal(rejectedBody.proposal.status, "rejected");
      assert.equal(rejectedBody.proposal.decision.note, "Zone names too generic");
      assert.equal(rejectedBody.proposal.decision.resultingRevisionId, null, "reject never produces a configuration revision");

      // A technician may delete an unfinished visit without trying to mutate the
      // immutable proposal's audit context through a cascading FK action.
      await pool.query("DELETE FROM inspection_jobs WHERE id=$1", [otherJobId]);
      assert.equal((await pool.query<{ job_id: string }>("SELECT job_id FROM customer_location_proposals WHERE id=$1", [secondProposalId])).rows[0]?.job_id, otherJobId);

      // Unknown proposal id.
      assert.equal((await call(`/manager/location-proposals/${id()}`, "admin")).status, 404);
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
