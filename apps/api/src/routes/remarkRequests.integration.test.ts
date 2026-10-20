import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { runMigrations } from "../db/migrations.js";
import { pool } from "../db/pool.js";
import { v7IntegrationDatabaseUrl } from "../sync/v7IntegrationTestDatabase.js";
import { createRemarkRequestsRouter } from "./remarkRequests.js";
import { createSectionRemarksRouter } from "./sectionRemarks.js";

const databaseUrl = v7IntegrationDatabaseUrl();
// This suite drops schemas, so enforce the host as well as the shared port/config guard.
if (databaseUrl) assert.equal(new URL(databaseUrl).hostname, "127.0.0.1");
const id = () => randomUUID();
const section = "checklist.waterTank.saj_main_water_supply";
const otherSection = "checklist.waterTank.water_level";
const system = "automatic_sprinkler";

test("R2 remark requests: migration, authority, auth, retries, races and legacy compatibility", { skip: !databaseUrl }, async (t) => {
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const template = (await pool.query("SELECT id FROM master_service_report_templates ORDER BY version DESC LIMIT 1")).rows[0].id;
    const actors: Record<string, { id: number; username: string; role: "inspector" | "admin" | "supervisor" }> = {};
    for (const [name, role] of [["techA", "inspector"], ["techB", "inspector"], ["admin", "admin"], ["supervisor", "supervisor"]] as const) {
      actors[name] = { id: (await pool.query("INSERT INTO users(username,password_hash,role) VALUES($1,'x',$2) RETURNING id::int", [name, role])).rows[0].id, username: name, role };
    }
    const customer = async () => {
      const customerId = id(), revision = id();
      await pool.query("INSERT INTO customers(id,customer_code,display_name) VALUES($1,$2,$2)", [customerId, `R2-${customerId}`]);
      await pool.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customerId, template]);
      return { customerId, revision };
    };
    const one = await customer(), two = await customer();
    const job = async (owner: typeof one, actor: string, systems = [system], sample = false) => {
      const jobId = id();
      await pool.query(`INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,
        customer_id,customer_configuration_revision_id,configuration_snapshot,service_date,created_by_user_id)
        VALUES($1,$2,$3,'R2 visit','open',$4,true,$5,$6,$7,'2026-10-20',$8)`,
      [jobId, template, `R2-${jobId}`, sample, owner.customerId, owner.revision,
        { enabledSystems: systems.map((systemKey) => ({ systemKey })) }, actors[actor]!.id]);
      return jobId;
    };
    const jobA = await job(one, "techA"), jobB = await job(two, "techB");
    const wrongSystem = await job(two, "techA", ["hose_reel"]);
    const sample = await job(two, "techA", [system], true);
    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { const actor = actors[request.header("x-test-actor") ?? ""]; if (actor) request.currentUser = actor; next(); });
    app.use(createRemarkRequestsRouter(pool)); app.use(createSectionRemarksRouter(pool));
    app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(500).json({ error: String(error) }));
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    const call = (path: string, actor: string | undefined = "techA", method = "GET", input?: unknown, headers = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers: { "content-type": "application/json", ...(actor ? { "x-test-actor": actor } : {}), ...headers },
      ...(input === undefined ? {} : { body: JSON.stringify(input) })
    });
    const path = (owner = one, systemKey = system) => `/technician/customers/${owner.customerId}/systems/${systemKey}/remark-requests`;
    const create = (wording: string, options: { actor?: string; owner?: typeof one; id?: string; sectionKey?: string; jobId?: string } = {}) => call(path(options.owner), options.actor ?? "techA", "POST", {
      id: options.id ?? id(), sectionKey: options.sectionKey ?? section, wording, ...(options.jobId ? { jobId: options.jobId } : {})
    });
    const decide = (requestId: string, input: unknown = { decision: "approved" }, actor = "admin") => call(`/manager/remark-requests/${requestId}/decision`, actor, "POST", input);
    const expect = async (response: Response, status: number, error?: string) => {
      const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result));
      if (error) assert.equal(result.error, error); return result;
    };
    const count = async (table: string, where = "true", params: unknown[] = []) => (await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, params)).rows[0].n;
    try {
      await t.test("cold migration creates three tables; rerun preserves legacy rows", async () => {
        for (const table of ["section_remark_requests", "section_remark_request_decisions", "approved_section_remarks"]) {
          assert.equal((await pool.query("SELECT to_regclass($1) IS NOT NULL AS exists", [table])).rows[0].exists, true);
        }
        const legacyId = id();
        await expect(await call(`/technician/customers/${one.customerId}/systems/${system}/section-remarks`, "techA", "POST", { id: legacyId, sectionKey: "comments", wording: "Legacy Comments preserved", jobId: jobA }), 201);
        const before = (await pool.query("SELECT * FROM service_section_remarks WHERE id=$1", [legacyId])).rows;
        // Recreate only R2's tables to exercise a forward upgrade with a populated 049 table.
        await pool.query(`DROP TABLE approved_section_remarks; DROP TABLE section_remark_request_decisions;
          DROP TABLE section_remark_requests; DROP FUNCTION section_remark_request_decisions_append_only()`);
        await runMigrations(pool);
        assert.deepEqual((await pool.query("SELECT * FROM service_section_remarks WHERE id=$1", [legacyId])).rows, before);
        await runMigrations(pool);
        assert.deepEqual((await pool.query("SELECT * FROM service_section_remarks WHERE id=$1", [legacyId])).rows, before);
      });
      const first = id();
      await t.test("create/replay confirm exact UUID and normalized immutable request", async () => {
        const input = { id: first.toUpperCase(), sectionKey: section, wording: "  New   supply valve wording  ", jobId: jobA };
        const created = await expect(await call(path(), "techA", "POST", input), 201);
        assert.equal(created.requestedId, input.id); assert.equal(created.request.id, first);
        assert.equal(created.request.wording, "New supply valve wording");
        assert.equal(created.request.status, "pending"); assert.equal(created.request.decision, null);
        assert.equal(created.duplicate, false); assert.equal(created.request.createFingerprint, undefined);
        const replay = await expect(await call(path(), "techA", "POST", input), 200);
        assert.equal(replay.requestedId, input.id); assert.equal(replay.duplicate, true);
        assert.deepEqual(replay.request, created.request);
        assert.equal(await count("section_remark_requests", "id=$1", [first]), 1);
      });
      await t.test("same UUID changed body, job, scope or submitting account = 409", async () => {
        for (const patch of [{ wording: "Changed wording" }, { jobId: jobB }, { sectionKey: otherSection }]) {
          await expect(await call(path(), "techA", "POST", { id: first, sectionKey: section, wording: "New supply valve wording", jobId: jobA, ...patch }), 409, "IDEMPOTENCY_CONFLICT");
        }
        await expect(await create("New supply valve wording", { id: first, actor: "techB", owner: two, jobId: jobB }), 409, "IDEMPOTENCY_CONFLICT");
      });
      await t.test("pending duplicate across customers returns only existing id/wording; no choice leakage", async () => {
        const duplicate = await expect(await create("new SUPPLY valve wording", { actor: "techB", owner: two }), 409, "DUPLICATE_PENDING");
        assert.deepEqual(duplicate.existing, { id: first, wording: "New supply valve wording" });
        const choices = await expect(await call(`/systems/${system}/approved-section-remarks`, "techB"), 200);
        assert.deepEqual(choices.remarks, []);
        const own = await expect(await call("/technician/remark-requests", "techB"), 200);
        assert.deepEqual(own.requests, []);
      });
      await t.test("catalog duplicate, Comments, unknown sections/systems and malformed input fail closed", async () => {
        await expect(await create(" battery   SPOILT "), 409, "DUPLICATE_CATALOG");
        for (const patch of [{ sectionKey: "comments" }, { sectionKey: "unknown" }, { wording: "a\nb" }, { wording: "\u200Bhidden" }, { wording: "ab" }, { wording: "x".repeat(301) }, { id: "bad" }, { jobId: null }, { extra: true }]) {
          await expect(await call(path(), "techA", "POST", { id: id(), sectionKey: section, wording: "Valid request", ...patch }), 400, "INVALID_REMARK_REQUEST");
        }
        await expect(await call(path(one, "hose_reel"), "techA", "POST", { id: id(), sectionKey: section, wording: "Unknown system" }), 400);
      });
      await t.test("create auth and exact scope match legacy; expected-actor guard rejects stale accounts", async () => {
        await expect(await call(path(), "", "POST", {}), 401);
        await expect(await call(path(), "techA", "POST", { id: id(), sectionKey: section, wording: "Stale account" }, { "x-expected-user-id": String(actors.techB!.id) }), 409, "IDENTITY_MISMATCH");
        await expect(await create("Foreign visit", { jobId: jobB }), 404);
        await expect(await create("Wrong system", { owner: two, jobId: wrongSystem }), 404);
        await expect(await create("Sample visit", { owner: two, jobId: sample }), 404);
        for (const actor of ["admin", "supervisor"]) await expect(await create(`Form filled by ${actor}`, { actor, jobId: jobA }), 201);
        const inactive = await customer(); await job(inactive, "techA");
        await pool.query("UPDATE customers SET is_active=false WHERE id=$1", [inactive.customerId]);
        await expect(await create("Inactive customer", { owner: inactive }), 404);
        await pool.query("UPDATE customers SET is_active=true,is_demo=true WHERE id=$1", [inactive.customerId]);
        await expect(await create("Demo customer", { owner: inactive }), 404);
      });
      await t.test("route auth matrix covers every review/read/deactivate route", async () => {
        const routes = [
          ["/manager/remark-requests", "GET"], [`/manager/remark-requests/${first}`, "GET"],
          [`/manager/remark-requests/${first}/decision`, "POST"], ["/manager/section-remarks", "GET"],
          [`/manager/section-remarks/approved/${id()}/deactivate`, "POST"], [`/manager/section-remarks/legacy/${id()}/deactivate`, "POST"]
        ];
        for (const [route, method] of routes) {
          await expect(await call(route!, "", method, method === "POST" ? {} : undefined), 401);
          await expect(await call(route!, "techA", method, method === "POST" ? {} : undefined), 403);
          for (const actor of ["admin", "supervisor"]) {
            const response = await call(route!, actor, method, method === "POST" ? {} : undefined);
            assert.equal([200, 400, 404].includes(response.status), true, `${actor}: ${route} ${response.status}`);
          }
        }
        for (const route of ["/technician/remark-requests", `/systems/${system}/approved-section-remarks`]) await expect(await call(route, ""), 401);
      });
      await t.test("two technicians concurrently requesting one wording create exactly one pending row", async () => {
        const results = await Promise.all([create("Concurrent technicians", { jobId: jobA }), create("CONCURRENT TECHNICIANS", { actor: "techB", owner: two, jobId: jobB })]);
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        assert.equal(await count("section_remark_requests", "lower(wording)='concurrent technicians'"), 1);
      });
      await t.test("concurrent same-UUID creates replay, cross-section changed body conflicts", async () => {
        const same = id();
        assert.deepEqual((await Promise.all([create("Concurrent UUID", { id: same }), create("Concurrent UUID", { id: same })])).map((r) => r.status).sort(), [200, 201]);
        const different = id();
        assert.deepEqual((await Promise.all([create("UUID cross scope", { id: different }), create("UUID cross scope", { id: different, sectionKey: otherSection })])).map((r) => r.status).sort(), [201, 409]);
      });
      await t.test("approve edited wording becomes choice for every customer, original text is retained", async () => {
        const result = await expect(await decide(first, { decision: "approved", approvedWording: "  Approved  replacement wording ", note: "Edited for clarity" }, "supervisor"), 201);
        assert.equal(result.request.wording, "New supply valve wording");
        assert.equal(result.request.decision.approvedWording, "Approved replacement wording");
        assert.equal(result.request.decision.reviewerRole, "supervisor");
        assert.equal(result.request.status, "approved");
        const choicesA = await expect(await call(`/systems/${system}/approved-section-remarks`), 200);
        const choicesB = await expect(await call(`/systems/${system}/approved-section-remarks`, "techB"), 200);
        assert.deepEqual(choicesA, choicesB); assert.equal(choicesA.remarks[0].wording, "Approved replacement wording");
        assert.equal(choicesA.remarks[0].sectionKey, section); assert.equal(choicesA.remarks[0].customerId, undefined);
        await expect(await create("APPROVED replacement wording", { actor: "techB", owner: two }), 409, "DUPLICATE_APPROVED");
        await expect(await create("Approved replacement wording", { sectionKey: otherSection }), 201);
        assert.equal((await expect(await call("/technician/remark-requests"), 200)).requests.find((r: { id: string }) => r.id === first).status, "approved");
      });
      await t.test("second decision is always 409, no second decision row", async () => {
        for (const actor of ["admin", "supervisor"]) await expect(await decide(first, { decision: "approved" }, actor), 409, "REMARK_REQUEST_ALREADY_DECIDED");
        assert.equal(await count("section_remark_request_decisions", "request_id=$1", [first]), 1);
      });
      await t.test("two reviewers deciding one request yield one terminal event and one choice", async () => {
        const request = (await expect(await create("Concurrent reviewers"), 201)).request;
        const results = await Promise.all([decide(request.id), decide(request.id, { decision: "rejected", note: "Reject concurrent attempt" }, "supervisor")]);
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        assert.equal(await count("section_remark_request_decisions", "request_id=$1", [request.id]), 1);
        const record = (await expect(await call(`/manager/remark-requests/${request.id}`, "admin"), 200)).request;
        assert.equal(await count("approved_section_remarks", "source_request_id=$1", [request.id]), record.status === "approved" ? 1 : 0);
      });
      await t.test("concurrent edited approvals of different requests create one active wording, loser stays pending", async () => {
        const a = (await expect(await create("Race edit A"), 201)).request.id;
        const b = (await expect(await create("Race edit B", { owner: two, actor: "techB" }), 201)).request.id;
        const results = await Promise.all([decide(a, { decision: "approved", approvedWording: "Same edited choice" }), decide(b, { decision: "approved", approvedWording: "SAME EDITED CHOICE" }, "supervisor")]);
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        assert.equal(await count("approved_section_remarks", "lower(wording)='same edited choice' AND active"), 1);
        assert.equal(await count("section_remark_request_decisions", "request_id=ANY($1::uuid[])", [[a, b]]), 1);
        const loser = results[0]!.status === 409 ? a : b;
        assert.equal((await expect(await call(`/manager/remark-requests/${loser}`, "supervisor"), 200)).request.status, "pending");
      });
      await t.test("rejection requires note; malformed decisions fail closed; rejected text and notice persist", async () => {
        const request = (await expect(await create("Reject this wording"), 201)).request;
        for (const input of [{ decision: "rejected" }, { decision: "rejected", note: "ok" }, { decision: "unknown" }, { decision: "approved", approvedWording: null }, { decision: "approved", approvedWording: "a\nb" }, { decision: "approved", extra: true }, { decision: "rejected", note: "Reason", approvedWording: "Other" }]) await expect(await decide(request.id, input), 400);
        const rejected = await expect(await decide(request.id, { decision: "rejected", note: "Not reusable wording" }), 201);
        assert.equal(rejected.request.wording, request.wording); assert.equal(rejected.request.decision.note, "Not reusable wording");
        const own = await expect(await call("/technician/remark-requests"), 200);
        assert.equal(own.requests.find((r: { id: string }) => r.id === request.id).status, "rejected");
        await expect(await create("Reject this wording"), 201); // rejected wording is allowed to be requested again
      });
      await t.test("replay after decision and deleted visit returns exact existing request", async () => {
        const disposableJob = await job(one, "techA"), requestId = id();
        await expect(await create("Request survives visit deletion", { id: requestId, jobId: disposableJob }), 201);
        await expect(await decide(requestId, { decision: "rejected", note: "Not suitable" }), 201);
        await pool.query("DELETE FROM inspection_jobs WHERE id=$1", [disposableJob]);
        const replay = await expect(await create("Request survives visit deletion", { id: requestId, jobId: disposableJob }), 200);
        assert.equal(replay.requestedId, requestId); assert.equal(replay.request.status, "rejected");
      });
      await t.test("decision log refuses UPDATE/DELETE/TRUNCATE; unique request constraint blocks second insert", async () => {
        for (const sql of ["UPDATE section_remark_request_decisions SET note='Tampered'", "DELETE FROM section_remark_request_decisions", "TRUNCATE section_remark_request_decisions"]) await assert.rejects(pool.query(sql), /append-only/);
        await assert.rejects(pool.query(`INSERT INTO section_remark_request_decisions(id,request_id,decision,reviewer_user_id,reviewer_role,note)
          VALUES($1,$2,'rejected',$3,'admin','Second event')`, [id(), first, actors.admin!.id]), /unique/);
      });
      await t.test("audit failure rolls back request and approval atomically", async () => {
        const pending = (await expect(await create("Rollback approval request"), 201)).request.id;
        await pool.query(`CREATE FUNCTION r2_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF NEW.action IN ('section_remark_requested','section_remark_approved') THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$;
          CREATE TRIGGER r2_test_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION r2_test_audit_failure()`);
        try {
          const failedId = id(); await expect(await create("Rollback create request", { id: failedId }), 500);
          assert.equal(await count("section_remark_requests", "id=$1", [failedId]), 0);
          await expect(await decide(pending), 500);
          assert.equal(await count("approved_section_remarks", "source_request_id=$1", [pending]), 0);
          assert.equal(await count("section_remark_request_decisions", "request_id=$1", [pending]), 0);
        } finally { await pool.query("DROP TRIGGER r2_test_audit_failure ON audit_events; DROP FUNCTION r2_test_audit_failure()"); }
        await expect(await decide(pending), 201);
      });
      await t.test("filters pending/decided and detail derive server status, invalid filters refused", async () => {
        for (const status of ["pending", "approved", "rejected", "decided", "all"]) {
          const result = await expect(await call(`/manager/remark-requests?status=${status}`, "supervisor"), 200);
          for (const request of result.requests) assert.equal(status === "all" || (status === "decided" ? request.status !== "pending" : request.status === status), true);
        }
        await expect(await call("/manager/remark-requests?status=bad", "admin"), 400);
        await expect(await call("/manager/remark-requests?status[]=pending", "admin"), 400);
        await expect(await call(`/manager/remark-requests/${id()}`, "admin"), 404);
      });
      await t.test("deactivate approved and legacy choices, status/log/request text remain unchanged", async () => {
        const all = await expect(await call("/manager/section-remarks", "supervisor"), 200);
        const approved = all.approvedRemarks.find((r: { sourceRequestId: string }) => r.sourceRequestId === first);
        const before = (await pool.query("SELECT * FROM section_remark_request_decisions WHERE request_id=$1", [first])).rows;
        const ownBefore = (await expect(await call("/technician/remark-requests"), 200)).requests;
        await expect(await call(`/manager/section-remarks/approved/${approved.id}/deactivate`, "supervisor", "POST", {}), 200);
        await expect(await call(`/manager/section-remarks/approved/${approved.id}/deactivate`, "admin", "POST", {}), 200);
        assert.equal((await expect(await call(`/systems/${system}/approved-section-remarks`), 200)).remarks.some((r: { id: string }) => r.id === approved.id), false);
        assert.deepEqual((await pool.query("SELECT * FROM section_remark_request_decisions WHERE request_id=$1", [first])).rows, before);
        assert.deepEqual((await expect(await call("/technician/remark-requests"), 200)).requests, ownBefore);
        const legacy = all.legacyRemarks[0];
        assert.equal(legacy.customerId, one.customerId);
        assert.equal((await expect(await call(`/customers/${two.customerId}/section-remarks`, "techB"), 200)).remarks.length, 0);
        await expect(await call(`/manager/section-remarks/legacy/${legacy.id}/deactivate`, "admin", "POST", {}), 200);
        assert.equal((await expect(await call(`/customers/${one.customerId}/section-remarks`), 200)).remarks.length, 0);
        const queuedId = id(), legacyPath = `/technician/customers/${one.customerId}/systems/${system}/section-remarks`;
        for (const status of [201, 200]) {
          const result = await expect(await call(legacyPath, "techA", "POST", { id: queuedId, sectionKey: section, wording: "Old phone queued remark", jobId: jobA }), status);
          assert.equal(result.requestedId, queuedId); assert.equal(result.remark.customerId, one.customerId);
        }
      });
      await t.test("database active unique index is a backstop", async () => {
        const source = (await expect(await create("Unique backstop request"), 201)).request.id;
        const existing = (await pool.query("SELECT * FROM approved_section_remarks WHERE active LIMIT 1")).rows[0];
        await assert.rejects(pool.query("INSERT INTO approved_section_remarks(id,system_key,section_key,wording,source_request_id) VALUES($1,$2,$3,$4,$5)", [id(), existing.system_key, existing.section_key, existing.wording.toUpperCase(), source]), /unique/);
      });
      await t.test("decisions/deactivation do not write inspection, template, report or catalog tables", async () => {
        const source = (await expect(await create("Authority isolation proof"), 201)).request.id;
        const protectedTables = ["inspection_jobs", "inspections", "master_system_inspections", "master_system_form_instances",
          "master_service_report_templates", "service_common_remarks", "final_service_reports", "repair_visits"];
        const present: string[] = [];
        await pool.query(`CREATE FUNCTION r2_protect_authority() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          RAISE EXCEPTION 'R2 must not write authority table %',TG_TABLE_NAME; END $$`);
        try {
          for (const table of protectedTables) {
            if ((await pool.query("SELECT to_regclass($1) IS NOT NULL AS exists", [table])).rows[0].exists) {
              await pool.query(`CREATE TRIGGER r2_protect_authority BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON ${table}
                FOR EACH STATEMENT EXECUTE FUNCTION r2_protect_authority()`);
              present.push(table);
            }
          }
          const approved = await expect(await decide(source), 201);
          assert.equal(approved.request.status, "approved");
          const remark = (await pool.query("SELECT id FROM approved_section_remarks WHERE source_request_id=$1", [source])).rows[0];
          await expect(await call(`/manager/section-remarks/approved/${remark.id}/deactivate`, "admin", "POST", {}), 200);
          const reject = (await expect(await create("Authority rejection proof"), 201)).request.id;
          await expect(await decide(reject, { decision: "rejected", note: "Authority unchanged" }), 201);
        } finally {
          for (const table of present) await pool.query(`DROP TRIGGER r2_protect_authority ON ${table}`);
          await pool.query("DROP FUNCTION r2_protect_authority()");
        }
      });
    } finally { server.close(); await once(server, "close"); }
  } finally { await pool.end(); }
});
