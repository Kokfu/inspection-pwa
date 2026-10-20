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

// The browser modules are loaded by file URL (a variable path, so the API compiler never pulls web sources into its build)
// and typed by hand: only the exports this contract needs.
type Local = { id: string; customerId: string; systemKey: "automatic_sprinkler"; sectionKey: string; wording: string; createdAt: string; jobId?: string };
type Row = { id: string; status: string; wording: string; decision: { reviewerRole: string; approvedWording: string | null; note: string | null } | null };
type Approved = { id: string; sectionKey: string; wording: string; active: boolean };
const webRoot = "../../../web/src";
const store = await import(new URL(`${webRoot}/inspectionControls/remarkRequests.ts`, import.meta.url).href) as {
  parseRemarkRequestConfirmation: (body: unknown, sent: Local) => { request: Row; duplicate: boolean };
  parseRemarkRequests: (value: unknown) => Row[];
  parseApprovedSectionRemarks: (value: unknown, systemKey: string) => Approved[];
  approvedChoicesForSection: (all: Approved[], systemKey: string, sectionKey: string) => Approved[];
};
const client = await import(new URL(`${webRoot}/manager/remarkRequestsApi.ts`, import.meta.url).href) as {
  loadRemarkRequests: (status: string) => Promise<Row[]>;
  loadRemarkRequest: (id: string) => Promise<Row>;
  decideRemarkRequest: (id: string, input: Record<string, unknown>) => Promise<Row>;
  loadSectionRemarks: () => Promise<{ approvedRemarks: Approved[]; legacyRemarks: Array<{ id: string; customerDisplayName: string; wording: string; active: boolean }> }>;
  deactivateApprovedRemark: (id: string) => Promise<void>;
  deactivateLegacyRemark: (id: string) => Promise<void>;
  loadPendingRemarkRequestCount: () => Promise<number>;
  RemarkRequestApiError: new (...args: never[]) => Error & { kind: string; code?: string; status: number };
};

/**
 * R3 contract (API side of the web<->API pair): the browser's strict parsers and the Admin/Manager client accept what the REAL R2 router
 * returns (create, replay, review lists, detail, decisions, approved choices, section-remark management) and refuse what the server
 * refuses. Needs the disposable Postgres on 127.0.0.1:55432 (SEED_INTEGRATION_DATABASE_URL); without it this test is a SKIP, which is
 * not a PASS.
 */
const databaseUrl = v7IntegrationDatabaseUrl();
const sectionKey = "checklist.waterTank.saj_main_water_supply";
const otherSection = "checklist.waterTank.water_level";

test("the web request parsers and the manager client accept the real API replies end to end", { skip: !databaseUrl }, async () => {
  const realFetch = globalThis.fetch;
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(pool);
    const template = (await pool.query<{ id: string }>("SELECT id FROM master_service_report_templates WHERE code='MFE-FSSR' AND publication_status='published' ORDER BY version DESC LIMIT 1")).rows[0]!;
    const customerId = randomUUID(), revision = randomUUID(), jobId = randomUUID();
    await pool.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Contract Co',false)", [customerId, `CT-${customerId}`]);
    await pool.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customerId, template.id]);
    const addUser = async (name: string, role: string) => (await pool.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x',$2) RETURNING id::int AS id", [name, role])).rows[0]!.id;
    const users = { tech: { id: await addUser("contract-tech", "inspector"), username: "contract-tech", role: "inspector" },
      admin: { id: await addUser("contract-manager", "admin"), username: "contract-manager", role: "admin" },
      supervisor: { id: await addUser("contract-admin", "supervisor"), username: "contract-admin", role: "supervisor" } } as const;
    const snapshot = { schemaVersion: 1, customer: { id: customerId, code: "CT", displayName: "CT" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE", version: 7 },
      enabledSystems: [{ enabledSystemId: randomUUID(), systemKey: "automatic_sprinkler", displayName: "Sprinkler", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [] }] };
    await pool.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date,created_by_user_id) VALUES($1,$2,$3,'Contract','open',false,true,$4,$5,$6,'2026-10-10',$7)",
      [jobId, template.id, `CT-JOB-${jobId}`, customerId, revision, snapshot, users.tech.id]);

    let acting: keyof typeof users = "tech";
    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { request.currentUser = users[acting]; next(); });
    app.use("/api", createRemarkRequestsRouter(pool));
    app.use("/api", createSectionRemarksRouter(pool));
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const { port } = server.address() as { port: number };
    // The web client uses relative /api paths; send them to the real router under test.
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => realFetch(new URL(String(input), `http://127.0.0.1:${port}`), init)) as typeof fetch;
    try {
      const base = `http://127.0.0.1:${port}/api`;
      const create = (sent: Local) => realFetch(`${base}/technician/customers/${customerId}/systems/automatic_sprinkler/remark-requests`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: sent.id, sectionKey: sent.sectionKey, wording: sent.wording, jobId }) });
      const local = (wording: string, section = sectionKey): Local => ({ id: randomUUID(), customerId, systemKey: "automatic_sprinkler", sectionKey: section, wording, createdAt: new Date().toISOString(), jobId });

      // ---- create, exact replay, upper-case receipt, and a reply that belongs to another request.
      const first = local("Gate valve is leaking");
      const created = await create(first);
      assert.equal(created.status, 201);
      const confirmation = store.parseRemarkRequestConfirmation(await created.json(), first);
      assert.deepEqual([confirmation.duplicate, confirmation.request.status], [false, "pending"]);
      const replay = await create(first);
      assert.equal(replay.status, 200);
      assert.equal(store.parseRemarkRequestConfirmation(await replay.json(), first).duplicate, true);
      const loud = local("Float switch is stuck", otherSection); loud.id = loud.id.toUpperCase();
      const loudReply = await create(loud);
      assert.equal(loudReply.status, 201);
      assert.equal(store.parseRemarkRequestConfirmation(await loudReply.json(), loud).request.id, loud.id.toLowerCase());
      const stranger = local("Something else entirely");
      const strangerReply = await (await create(stranger)).json();
      assert.throws(() => store.parseRemarkRequestConfirmation(strangerReply, first), "a reply to another request must not confirm this one");

      // ---- the technician's own read-back.
      const own = await realFetch(`${base}/technician/remark-requests`);
      assert.equal(own.status, 200);
      const ownRows = store.parseRemarkRequests(((await own.json()) as { requests: unknown }).requests);
      assert.equal(ownRows.length, 3);

      // ---- Manager (admin): list, detail, edited approval; the client validates every reply.
      acting = "admin";
      assert.equal(await client.loadPendingRemarkRequestCount(), 3);
      assert.deepEqual((await client.loadRemarkRequests("pending")).map((row) => row.status), ["pending", "pending", "pending"]);
      assert.equal((await client.loadRemarkRequest(first.id)).wording, "Gate valve is leaking");
      const approved = await client.decideRemarkRequest(first.id, { decision: "approved", approvedWording: "Main gate valve is leaking", note: "Wording tidied" });
      assert.deepEqual([approved.status, approved.decision?.reviewerRole, approved.decision?.approvedWording], ["approved", "admin", "Main gate valve is leaking"]);
      // ---- Admin (supervisor): plain approval and a rejection with a note.
      acting = "supervisor";
      const plain = await client.decideRemarkRequest(loud.id.toLowerCase(), { decision: "approved" });
      assert.deepEqual([plain.status, plain.decision?.reviewerRole, plain.decision?.approvedWording], ["approved", "supervisor", "Float switch is stuck"]);
      const rejected = await client.decideRemarkRequest(stranger.id, { decision: "rejected", note: "Already covered elsewhere" });
      assert.deepEqual([rejected.status, rejected.decision?.note, rejected.decision?.approvedWording], ["rejected", "Already covered elsewhere", null]);
      assert.equal((await client.loadRemarkRequests("decided")).length, 3);
      assert.equal((await client.loadRemarkRequests("approved")).length, 2);
      assert.equal((await client.loadRemarkRequests("rejected")).length, 1);
      assert.equal(await client.loadPendingRemarkRequestCount(), 0);
      // A decision is terminal: the server's own refusal reaches the page with its code.
      const again = await client.decideRemarkRequest(first.id, { decision: "rejected", note: "Changed my mind" }).then(() => undefined, (error: unknown) => error as { kind: string; code?: string; status: number; message: string });
      assert.deepEqual([again?.kind, again?.code, again?.status], ["domain", "REMARK_REQUEST_ALREADY_DECIDED", 409]);
      assert.match(again?.message ?? "", /already been decided/);

      // ---- The technician list of approved choices: active only, this section only, every customer.
      acting = "tech";
      const choices = await realFetch(`${base}/systems/automatic_sprinkler/approved-section-remarks`);
      assert.equal(choices.status, 200);
      const approvedList = store.parseApprovedSectionRemarks(((await choices.json()) as { remarks: unknown }).remarks, "automatic_sprinkler");
      assert.deepEqual(store.approvedChoicesForSection(approvedList, "automatic_sprinkler", sectionKey).map((row) => row.wording), ["Main gate valve is leaking"]);
      assert.deepEqual(store.approvedChoicesForSection(approvedList, "automatic_sprinkler", otherSection).map((row) => row.wording), ["Float switch is stuck"]);
      // The server itself refuses a duplicate of an approved choice, with a readable message (what the row shows).
      const duplicate = await create(local("main GATE valve is leaking"));
      const duplicateBody = await duplicate.json() as { error: string; message: string };
      assert.deepEqual([duplicate.status, duplicateBody.error], [409, "DUPLICATE_APPROVED"]);
      assert.ok(duplicateBody.message.length > 10);

      // ---- Section-remark management: approved + legacy CR-07, deactivation.
      const legacy = await realFetch(`${base}/technician/customers/${customerId}/systems/automatic_sprinkler/section-remarks`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: randomUUID(), sectionKey: otherSection, wording: "Older customer remark", jobId }) });
      assert.equal(legacy.status, 201);
      acting = "admin";
      const lists = await client.loadSectionRemarks();
      assert.equal(lists.approvedRemarks.length, 2);
      assert.deepEqual(lists.legacyRemarks.map((row) => [row.customerDisplayName, row.wording, row.active]), [["Contract Co", "Older customer remark", true]]);
      await client.deactivateApprovedRemark(lists.approvedRemarks.find((row) => row.sectionKey === sectionKey)!.id);
      await client.deactivateLegacyRemark(lists.legacyRemarks[0]!.id);
      const after = await client.loadSectionRemarks();
      assert.deepEqual(after.approvedRemarks.map((row) => row.active).sort(), [false, true]);
      assert.equal(after.legacyRemarks[0]!.active, false);
      acting = "tech";
      const remaining = store.parseApprovedSectionRemarks(((await (await realFetch(`${base}/systems/automatic_sprinkler/approved-section-remarks`)).json()) as { remarks: unknown }).remarks, "automatic_sprinkler");
      assert.deepEqual(remaining.map((row) => row.wording), ["Float switch is stuck"]);

      // ---- A technician is refused by the review routes, and the client calls that an authority failure.
      const refused = await client.loadRemarkRequests("pending").then(() => undefined, (error: unknown) => error as { kind: string; status: number });
      assert.deepEqual([refused?.kind, refused?.status], ["authorization", 403]);
    } finally { server.close(); await once(server, "close"); }
  } finally { globalThis.fetch = realFetch; await pool.end(); }
});
