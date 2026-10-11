import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { runMigrations } from "../db/migrations.js";
import { pool } from "../db/pool.js";
import { v7IntegrationDatabaseUrl } from "../sync/v7IntegrationTestDatabase.js";
import { createSectionRemarksRouter } from "./sectionRemarks.js";

// The browser module is loaded by file URL (a variable path, so the API compiler never pulls web sources into its
// build) and typed by hand: only the three exports this contract needs.
type SectionRemark = { id: string; customerId: string; systemKey: "automatic_sprinkler"; sectionKey: string; wording: string };
const web = await import(new URL("../../../web/src/inspectionControls/sectionRemarks.ts", import.meta.url).href) as {
  parseSectionRemarkConfirmation: (body: unknown, sent: SectionRemark) => { remark: SectionRemark; merged: boolean; duplicate: boolean };
  parseSectionRemarks: (value: unknown, customerId: string) => SectionRemark[];
};
const { parseSectionRemarkConfirmation, parseSectionRemarks } = web;

/**
 * CR-07 contract (API side of the web<->API pair): the browser's strict parsers accept what the REAL API router returns (create, replay, same-text
 * merge, list) and refuse nothing the server legitimately sends. Needs the disposable Postgres on 127.0.0.1:55432
 * (SEED_INTEGRATION_DATABASE_URL); without it this test is a SKIP, which is not a PASS.
 */
const databaseUrl = v7IntegrationDatabaseUrl();
const sectionKey = "checklist.waterTank.saj_main_water_supply";

test("the web confirmation and list parsers accept the real API replies", { skip: !databaseUrl }, async () => {
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(pool);
    const template = (await pool.query<{ id: string }>("SELECT id FROM master_service_report_templates WHERE code='MFE-FSSR' AND publication_status='published' ORDER BY version DESC LIMIT 1")).rows[0]!;
    const customerId = randomUUID(), revision = randomUUID(), jobId = randomUUID();
    await pool.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,'Contract Co',false)", [customerId, `CT-${customerId}`]);
    await pool.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customerId, template.id]);
    const user = (await pool.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES('contract-tech','x','inspector') RETURNING id::int AS id")).rows[0]!.id;
    const snapshot = { schemaVersion: 1, customer: { id: customerId, code: "CT", displayName: "CT" }, configuration: { revisionId: revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE", version: 7 },
      enabledSystems: [{ enabledSystemId: randomUUID(), systemKey: "automatic_sprinkler", displayName: "Sprinkler", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [] }] };
    await pool.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date,created_by_user_id) VALUES($1,$2,$3,'Contract','open',false,true,$4,$5,$6,'2026-10-10',$7)",
      [jobId, template.id, `CT-JOB-${jobId}`, customerId, revision, snapshot, user]);

    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { request.currentUser = { id: user, username: "contract-tech", role: "inspector" }; next(); });
    app.use(createSectionRemarksRouter(pool));
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const { port } = server.address() as { port: number };
    try {
      const post = async (body: Record<string, unknown>) => fetch(`http://127.0.0.1:${port}/technician/customers/${customerId}/systems/automatic_sprinkler/section-remarks`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const sent = (wording: string): SectionRemark => ({ id: randomUUID(), customerId, systemKey: "automatic_sprinkler", sectionKey, wording });
      const asBody = (remark: SectionRemark) => ({ id: remark.id, sectionKey: remark.sectionKey, wording: remark.wording, jobId });

      const first = sent("Main supply valve needs repair");
      const created = await post(asBody(first));
      assert.equal(created.status, 201);
      assert.deepEqual(parseSectionRemarkConfirmation(await created.json(), first), { remark: first, merged: false, duplicate: false });

      const replay = await post(asBody(first));
      assert.equal(replay.status, 200);
      assert.deepEqual(parseSectionRemarkConfirmation(await replay.json(), first), { remark: first, merged: false, duplicate: true });

      const twin = sent("main SUPPLY valve needs repair");
      const merged = await post(asBody(twin));
      assert.equal(merged.status, 200);
      const confirmation = parseSectionRemarkConfirmation(await merged.json(), twin);
      assert.equal(confirmation.merged, true);
      assert.equal(confirmation.remark.id, first.id, "the canonical row, not the requested id");

      // A reply to a DIFFERENT request must never confirm this one.
      const other = sent("Something else entirely");
      const otherReply = await (await post(asBody(other))).json();
      assert.throws(() => parseSectionRemarkConfirmation(otherReply, first));

      const list = await fetch(`http://127.0.0.1:${port}/customers/${customerId}/section-remarks`);
      assert.equal(list.status, 200);
      const rows = parseSectionRemarks(((await list.json()) as { remarks: unknown }).remarks, customerId);
      assert.deepEqual(rows.map((row) => row.wording), ["Main supply valve needs repair", "Something else entirely"]);
    } finally { server.close(); await once(server, "close"); }
  } finally { await pool.end(); }
});
