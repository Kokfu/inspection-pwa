import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { runMigrations } from "../db/migrations.js";
import { pool } from "../db/pool.js";
import { v7IntegrationDatabaseUrl } from "../sync/v7IntegrationTestDatabase.js";
import { syncCo2FormInstances } from "../sync/co2FormInstanceSync.js";
import { inspectionJobsRouter } from "./inspectionJobs.js";
import { createManagerServiceVisitsRouter } from "./managerServiceVisits.js";
import { createReportApprovalsRouter } from "./reportApprovals.js";

/**
 * T6: report approval is an append-only decision log; the report's state is always derived, never
 * read off a mutable column, so this test drives the real HTTP routes against a disposable Postgres
 * and checks the derivation against a real accepted V7 record and a real correction row — never a
 * mocked derivation.
 */
const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();
const time = "2026-09-01T00:00:00.000Z";

test("report approval: derived state, idempotency, roles, audit, append-only, interacts with corrections and the PDF gate", { skip: !databaseUrl }, async () => {
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(pool);
    await runMigrations(pool); // 033 replay: table present, nothing re-applied
    const reportApprovalsTable = await pool.query<{ exists: boolean }>(`SELECT to_regclass('public.report_approvals') IS NOT NULL AS exists`);
    assert.equal(reportApprovalsTable.rows[0]?.exists, true);

    const template = (await pool.query<{ id: string }>("SELECT template.id FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.version=7 AND system.system_key='wet_chemical'")).rows[0]!;
    const customer = id(), revision = id(), enabled = id(), zone = id(), location = id(), job = id(), client = id(), detectorRow = id();
    await pool.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Report Approval V7',true)", [customer, `RA-${customer}`]);
    await pool.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customer, template.id]);
    await pool.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'wet_chemical',1,'{}')", [enabled, revision, template.id]);
    await pool.query("INSERT INTO customer_system_zones(id,enabled_system_id,zone_key,display_name,sort_order) VALUES($1,$2,'k','Kitchen',1)", [zone, enabled]);
    await pool.query("INSERT INTO customer_system_locations(id,enabled_system_id,zone_id,location_key,display_name,sort_order) VALUES($1,$2,$3,'a','Kitchen A',1)", [location, enabled, zone]);
    const system = { enabledSystemId: enabled, systemKey: "wet_chemical", displayName: "Wet Chemical", sortOrder: 1, definitionStatus: "confirmed", zones: [{ id: zone, key: "k", displayName: "Kitchen", sortOrder: 1 }], locations: [{ id: location, zoneId: zone, key: "a", displayName: "Kitchen A", sortOrder: 1 }] };
    const snapshot = { schemaVersion: 1, customer: { id: customer, code: `RA-${customer}`, displayName: "Report Approval V7" }, site: { id: id(), displayName: "Site" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 }, enabledSystems: [system] };
    await pool.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date) VALUES($1,$2,$3,'Report Approval V7','open',false,true,$4,$5,$6,'2026-09-05')", [job, template.id, `RA-${job}`, customer, revision, snapshot]);
    const good = (keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, { result: "good", remarks: "" }]));
    const responses = { controlPanelLocation: "Kitchen A", detectorRows: [{ rowUuid: detectorRow, displaySequence: 1, alarmZone: "Kitchen", location: "Kitchen A", heatDetectorStatus: ["normal"], smokeDetectorStatus: ["normal"], remarks: "" }], chargerAndBatteries: good(["main_supply", "battery", "charger"]), physicalOutlook: good(["wet_chemical_cylinder", "electric_actuator", "manual_release_key", "alarm_bell", "twin_flashing_light", "manual_pull_station", "high_pressure_hose", "discharge_nozzle"]), mainFunctionKeys: good(["main_alarm_reset", "lamp_test", "evacuate", "ac_supply", "dc_supply", "signal_alarm_to_mfap"]), comments: "" };
    const item = { operationId: id(), entityType: "masterSystemFormInstance", entityId: client, action: "create", payload: { clientUuid: client, jobId: job, systemKey: "wet_chemical", instanceKey: `location:${location}`, configuredZoneId: zone, configuredLocationId: location, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: template.id, code: "MFE-FSSR", version: 7 }, configuration: { revisionId: revision, revisionNumber: 1 }, inspectionSnapshot: { schemaVersion: 2, capturedAt: time, job: { id: job, reference: "client", title: "client" }, customer: snapshot.customer, configuration: snapshot.configuration, template: snapshot.template, system: { client: "not-authority" }, instance: { instanceKey: `location:${location}`, displaySequence: 1 } }, responses, evidenceManifest: [], performedAt: time } };
    const user = async (username: string, role: string) => (await pool.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x',$2) RETURNING id::int AS id", [username, role])).rows[0]!.id;
    const inspector = await user("ra-tech", "inspector"), supervisor = await user("ra-review", "supervisor"), admin = await user("ra-admin", "admin");
    await pool.query("UPDATE inspection_jobs SET created_by_user_id=$1 WHERE id=$2", [inspector, job]);
    assert.deepEqual((await syncCo2FormInstances([item], inspector)).acceptedIds, [client]);

    const actors: Record<string, { id: number; username: string; role: "admin" | "inspector" | "supervisor" }> = {
      supervisor: { id: supervisor, username: "ra-review", role: "supervisor" }, admin: { id: admin, username: "ra-admin", role: "admin" },
      inspector: { id: inspector, username: "ra-tech", role: "inspector" }
    };
    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { const actor = actors[request.header("x-test-actor") ?? ""]; if (actor) request.currentUser = actor; next(); });
    app.use(createReportApprovalsRouter(pool)); app.use(createManagerServiceVisitsRouter({ database: pool })); app.use(inspectionJobsRouter);
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const { port } = server.address() as { port: number };
    const call = (path: string, actor: string, method = "GET", body?: unknown) => fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { "content-type": "application/json", "x-test-actor": actor }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const post = (actor: string, body: unknown) => call(`/manager/service-visits/${job}/report-approval`, actor, "POST", body);
    const get = (actor: string) => call(`/manager/service-visits/${job}/report-approval`, actor);
    const eventsCount = async () => (await pool.query("SELECT count(*)::int AS n FROM report_approvals")).rows[0].n as number;
    try {
      // Open visit: approving is refused.
      assert.equal((await post("supervisor", { requestId: id(), decision: "approved", expectedStatus: "awaiting_approval" })).status, 409);
      const openRefusal = await post("supervisor", { requestId: id(), decision: "approved", expectedStatus: "awaiting_approval" });
      assert.equal((await openRefusal.json() as { error: string }).error, "REPORT_NOT_READY");

      // Close the visit (direct SQL, mirroring the corrections integration test's precedent).
      await pool.query("UPDATE inspection_jobs SET status='closed',completed_at=now(),completed_by_user_id=$2,completed_by_display_name='ra' WHERE id=$1", [job, inspector]);

      // No events yet: awaiting_approval.
      const initial = await (await get("supervisor")).json() as { reportApproval: { status: string }; events: unknown[] };
      assert.equal(initial.reportApproval.status, "awaiting_approval");
      assert.deepEqual(initial.events, []);

      // PDF gate: an awaiting-approval visit with no corrections is refused specifically as
      // REPORT_NOT_APPROVED (not masked by the corrections gate, since none exist yet).
      const pdfBeforeApproval = await call(`/manager/service-visits/${job}/final-report.pdf`, "admin");
      assert.equal(pdfBeforeApproval.status, 409, "removing the REPORT_NOT_APPROVED gate would make this line pass with a 200 instead");
      assert.equal((await pdfBeforeApproval.json() as { error: string }).error, "REPORT_NOT_APPROVED");

      // A technician never approves (falls out of requireRole).
      assert.equal((await post("inspector", { requestId: id(), decision: "approved", expectedStatus: "awaiting_approval" })).status, 403);
      assert.equal(await eventsCount(), 0);

      // Supervisor approves.
      const approveRequestId = id();
      const approved = await post("supervisor", { requestId: approveRequestId, decision: "approved", expectedStatus: "awaiting_approval" });
      assert.equal(approved.status, 201, await approved.clone().text());
      const approvedBody = await approved.json() as { reportApproval: { status: string; decidedBy: string; decidedByRole: string } };
      assert.equal(approvedBody.reportApproval.status, "approved");
      assert.equal(approvedBody.reportApproval.decidedBy, "ra-review");
      assert.equal(approvedBody.reportApproval.decidedByRole, "supervisor");
      assert.equal((await pool.query("SELECT reason FROM audit_events WHERE action='report.approve'")).rows.length, 1);

      // Idempotent replay of the same request.
      const replay = await post("supervisor", { requestId: approveRequestId, decision: "approved", expectedStatus: "awaiting_approval" });
      assert.equal(replay.status, 200);
      assert.equal(await eventsCount(), 1);
      // A different body under the same request ID is refused.
      const reused = await post("supervisor", { requestId: approveRequestId, decision: "approved", expectedStatus: "approved" });
      assert.equal(reused.status, 409);
      assert.equal((await reused.json() as { error: string }).error, "APPROVAL_REQUEST_REUSED");

      // Stale expectedStatus: the screen still thinks it is awaiting approval.
      const stale = await post("admin", { requestId: id(), decision: "approved", expectedStatus: "awaiting_approval" });
      assert.equal(stale.status, 409);
      assert.equal((await stale.json() as { error: string }).error, "REPORT_APPROVAL_CONFLICT");
      assert.equal(await eventsCount(), 1);

      // The Manager list/detail and the technician completion endpoint agree with the same derived state.
      const listed = await (await call("/manager/service-visits", "admin")).json() as { serviceVisits: Array<{ id: string; reportApproval: { status: string } }> };
      assert.equal(listed.serviceVisits.find((visit) => visit.id === job)?.reportApproval.status, "approved");
      const detail = await (await call(`/manager/service-visits/${job}`, "admin")).json() as { serviceVisit: { reportApproval: { status: string } } };
      assert.equal(detail.serviceVisit.reportApproval.status, "approved");
      const completion = await (await call(`/inspection-jobs/${job}/completion`, "inspector")).json() as { reportApproval: { status: string } };
      assert.equal(completion.reportApproval.status, "approved");

      // PDF gate: refuses while unapproved / approved elsewhere; approved now, so it must not be REPORT_NOT_APPROVED.
      const pdfNow = await call(`/manager/service-visits/${job}/final-report.pdf`, "admin");
      if (pdfNow.status === 409) assert.notEqual((await pdfNow.json() as { error: string }).error, "REPORT_NOT_APPROVED");

      // A supervisor may never withdraw.
      const supervisorWithdraw = await post("supervisor", { requestId: id(), decision: "withdrawn", note: "Trying to withdraw", expectedStatus: "approved" });
      assert.equal(supervisorWithdraw.status, 403);
      assert.equal((await supervisorWithdraw.json() as { error: string }).error, "REPORT_APPROVAL_WITHDRAW_FORBIDDEN");
      assert.equal(await eventsCount(), 1);

      // Withdrawal requires a note.
      assert.equal((await post("admin", { requestId: id(), decision: "withdrawn", expectedStatus: "approved" })).status, 400);
      assert.equal((await post("admin", { requestId: id(), decision: "withdrawn", note: "xx", expectedStatus: "approved" })).status, 400, "note below 3 chars");
      assert.equal((await post("admin", { requestId: id(), decision: "withdrawn", note: "x".repeat(501), expectedStatus: "approved" })).status, 400, "note over 500 chars");
      assert.equal(await eventsCount(), 1);

      // Admin withdraws with a note.
      const withdrawn = await post("admin", { requestId: id(), decision: "withdrawn", note: "Wrong customer contact listed", expectedStatus: "approved" });
      assert.equal(withdrawn.status, 201, await withdrawn.clone().text());
      const withdrawnBody = await withdrawn.json() as { reportApproval: { status: string; decidedByRole: string; note: string } };
      assert.equal(withdrawnBody.reportApproval.status, "awaiting_approval");
      assert.equal(withdrawnBody.reportApproval.decidedByRole, "admin");
      assert.equal(withdrawnBody.reportApproval.note, "Wrong customer contact listed");
      assert.equal((await pool.query("SELECT reason FROM audit_events WHERE action='report.withdraw'")).rows.length, 1);

      // Re-approve.
      const reapproved = await post("supervisor", { requestId: id(), decision: "approved", expectedStatus: "awaiting_approval" });
      assert.equal(reapproved.status, 201);
      assert.equal((await reapproved.json() as { reportApproval: { status: string } }).reportApproval.status, "approved");

      // A correction recorded after this approval reverts the derived state, and the PDF is refused again.
      const formInstance = (await pool.query<{ id: string }>("SELECT id FROM master_system_form_instances WHERE client_uuid=$1", [client])).rows[0]!;
      // The row's timestamp must sort after the approval's `decidedAt`; `now()` at insert time
      // satisfies that as long as the two calls are not literally the same millisecond, so pace it.
      await new Promise((resolve) => setTimeout(resolve, 5));
      await pool.query(`INSERT INTO inspection_corrections
        (id, form_instance_id, job_id, system_key, field_path, sequence, previous_value, new_value, reason, corrected_by_user_id, corrected_by_role, request_id, request_fingerprint)
        VALUES ($1,$2,$3,'wet_chemical','controlPanelLocation',1,'"Kitchen A"'::jsonb,'"Kitchen B"'::jsonb,'Site walkthrough correction',$4,'supervisor',$5,$6)`,
      [id(), formInstance.id, job, supervisor, id(), "x".repeat(64)]);
      const revertedState = await (await get("admin")).json() as { reportApproval: { status: string; correctedAfterApproval: boolean } };
      assert.equal(revertedState.reportApproval.status, "awaiting_approval");
      assert.equal(revertedState.reportApproval.correctedAfterApproval, true);
      const pdfAfterCorrection = await call(`/manager/service-visits/${job}/final-report.pdf`, "admin");
      assert.equal(pdfAfterCorrection.status, 409, "removing the correction-after-approval check from the derived state would make this line pass with a 200 instead");
      assert.ok(["FINAL_REPORT_HAS_CORRECTIONS", "REPORT_NOT_APPROVED"].includes((await pdfAfterCorrection.json() as { error: string }).error));

      // Approving again with the stale "approved" expectation is refused; the caller must re-read state first.
      const staleAfterCorrection = await post("supervisor", { requestId: id(), decision: "approved", expectedStatus: "approved" });
      assert.equal(staleAfterCorrection.status, 409);
    } finally { server.close(); await once(server, "close"); }

    // Append-only at the database level: removing the trigger would make these three assertions fail.
    await assert.rejects(pool.query("UPDATE report_approvals SET decision='withdrawn'"), /append-only/);
    await assert.rejects(pool.query("DELETE FROM report_approvals"), /append-only/);
    await assert.rejects(pool.query("TRUNCATE report_approvals"), /append-only/);
  } finally { await pool.end(); }
});
