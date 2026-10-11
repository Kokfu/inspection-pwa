import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { runMigrations } from "../db/migrations.js";
import { pool } from "../db/pool.js";
import { v7IntegrationDatabaseUrl } from "../sync/v7IntegrationTestDatabase.js";
import { createSectionRemarksRouter, sectionRemarkCap } from "./sectionRemarks.js";
import { createServiceCommonRemarksRouter } from "./serviceCommonRemarks.js";

/**
 * CR-07 Phase 1 (disposable Postgres on 127.0.0.1:55432 only; a SKIP is not a PASS). Drives the real HTTP routes:
 * create / replay / id-conflict / same-text merge / concurrency, every validation rejection, the section and
 * customer scope, the uniform-404 authorisation matrix, audit rows, cold + re-run migration, and the untouched
 * global common-remarks endpoint.
 */
const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();
const sectionA = "checklist.waterTank.saj_main_water_supply";
const sectionB = "checklist.waterTank.water_level";
const comments = "comments";
const lineFeed = String.fromCharCode(10);

test("section remarks: scope, idempotency, merge, validation, auth, audit, migration", { skip: !databaseUrl }, async (t) => {
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(pool);
    const table = await pool.query<{ exists: boolean }>("SELECT to_regclass('public.service_section_remarks') IS NOT NULL AS exists");
    assert.equal(table.rows[0]?.exists, true, "migration 049 created the table");

    const template = (await pool.query<{ id: string }>("SELECT id FROM master_service_report_templates WHERE code='MFE-FSSR' AND publication_status='published' ORDER BY version DESC LIMIT 1")).rows[0]!;
    const customer = async (name: string, flags: { demo?: boolean; active?: boolean } = {}) => {
      const customerId = id();
      await pool.query("INSERT INTO customers(id,customer_code,display_name,is_demo,is_active) VALUES($1,$2,$3,$4,$5)", [customerId, `SR-${customerId}`, name, flags.demo ?? false, flags.active ?? true]);
      const revision = id();
      await pool.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [revision, customerId, template.id]);
      return { customerId, revision };
    };
    const user = async (username: string, role: string) => (await pool.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x',$2) RETURNING id::int AS id", [username, role])).rows[0]!.id;
    const job = async (owner: { customerId: string; revision: string }, createdBy: number, options: { systems?: string[]; sample?: boolean } = {}) => {
      const jobId = id();
      const systems = (options.systems ?? ["automatic_sprinkler"]).map((systemKey) => ({ enabledSystemId: id(), systemKey, displayName: systemKey, sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [] }));
      const snapshot = { schemaVersion: 1, customer: { id: owner.customerId, code: "SR", displayName: "SR" }, configuration: { revisionId: owner.revision, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", name: "MFE", version: 7 }, enabledSystems: systems };
      await pool.query("INSERT INTO inspection_jobs(id,master_template_version_id,job_reference,title,status,is_sample,technician_visible,customer_id,customer_configuration_revision_id,configuration_snapshot,service_date,created_by_user_id) VALUES($1,$2,$3,'Section Remarks','open',$4,true,$5,$6,$7,'2026-10-10',$8)",
        [jobId, template.id, `SR-JOB-${jobId}`, options.sample ?? false, owner.customerId, owner.revision, snapshot, createdBy]);
      return jobId;
    };

    const techA = await user("sr-tech-a", "inspector"), techB = await user("sr-tech-b", "inspector"), techC = await user("sr-tech-c", "inspector");
    const supervisor = await user("sr-super", "supervisor"), admin = await user("sr-admin", "admin");
    const actors: Record<string, { id: number; username: string; role: "admin" | "inspector" | "supervisor" }> = {
      techA: { id: techA, username: "sr-tech-a", role: "inspector" }, techB: { id: techB, username: "sr-tech-b", role: "inspector" },
      techC: { id: techC, username: "sr-tech-c", role: "inspector" },
      supervisor: { id: supervisor, username: "sr-super", role: "supervisor" }, admin: { id: admin, username: "sr-admin", role: "admin" }
    };

    const one = await customer("Section Remarks One"), two = await customer("Section Remarks Two");
    const demo = await customer("Section Remarks Demo", { demo: true }), inactive = await customer("Section Remarks Inactive", { active: false });
    const jobA1 = await job(one, techA), jobA2 = await job(two, techA), jobB1 = await job(one, techB);
    const jobHoseOnly = await job(one, techC, { systems: ["hose_reel"] });
    const sampleJob = await job(two, techC, { sample: true });
    const jobDemo = await job(demo, techA), jobInactive = await job(inactive, techA);

    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { const actor = actors[request.header("x-test-actor") ?? ""]; if (actor) request.currentUser = actor; next(); });
    app.use(createSectionRemarksRouter(pool)); app.use(createServiceCommonRemarksRouter(pool));
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const { port } = server.address() as { port: number };
    const call = (path: string, actor: string | undefined, method = "GET", body?: unknown, headers: Record<string, string> = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers: { "content-type": "application/json", ...(actor ? { "x-test-actor": actor } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const postPath = (owner: { customerId: string }, systemKey = "automatic_sprinkler") => `/technician/customers/${owner.customerId}/systems/${systemKey}/section-remarks`;
    const create = (actor: string, owner: { customerId: string }, body: Record<string, unknown>, systemKey?: string) => call(postPath(owner, systemKey), actor, "POST", body);
    const rows = async (owner: { customerId: string }) => (await pool.query<{ id: string; section_key: string; wording: string }>("SELECT id, section_key, wording FROM service_section_remarks WHERE customer_id=$1 ORDER BY created_at, id", [owner.customerId])).rows;
    const reject = async (response: Response, status: number, error?: string) => {
      const text = await response.clone().text();
      assert.equal(response.status, status, text);
      if (error) assert.equal((JSON.parse(text) as { error: string }).error, error, text);
    };

    try {
      const firstId = id();
      await t.test("create 201, replay of the same id and content is 200 duplicate, both echo the requested id", async () => {
        const created = await create("techA", one, { id: firstId, sectionKey: sectionA, wording: "Main supply valve needs repair", jobId: jobA1 });
        assert.equal(created.status, 201, await created.clone().text());
        const body = await created.json() as { requestedId: string; duplicate: boolean; merged: boolean; remark: Record<string, unknown> };
        assert.deepEqual(body, { requestedId: firstId, duplicate: false, merged: false, remark: { id: firstId, customerId: one.customerId, systemKey: "automatic_sprinkler", sectionKey: sectionA, wording: "Main supply valve needs repair" } });
        const replay = await create("techA", one, { id: firstId, sectionKey: sectionA, wording: "Main supply valve needs repair", jobId: jobA1 });
        assert.equal(replay.status, 200);
        const replayBody = await replay.json() as { requestedId: string; duplicate: boolean; merged: boolean; remark: { id: string } };
        assert.equal(replayBody.duplicate, true); assert.equal(replayBody.merged, false);
        assert.equal(replayBody.requestedId, firstId); assert.equal(replayBody.remark.id, firstId);
        assert.equal((await rows(one)).length, 1, "a replay creates no second row");
        const stored = await pool.query("SELECT job_id, created_by_user_id::int AS by FROM service_section_remarks WHERE id=$1", [firstId]);
        assert.equal(stored.rows[0].job_id, jobA1); assert.equal(stored.rows[0].by, techA);
      });

      await t.test("the same id with different content is 409 IDEMPOTENCY_CONFLICT and changes nothing", async () => {
        await reject(await create("techA", one, { id: firstId, sectionKey: sectionA, wording: "Something else entirely" }), 409, "IDEMPOTENCY_CONFLICT");
        await reject(await create("techA", one, { id: firstId, sectionKey: sectionB, wording: "Main supply valve needs repair" }), 409, "IDEMPOTENCY_CONFLICT");
        assert.deepEqual((await rows(one)).map((row) => row.wording), ["Main supply valve needs repair"]);
        // The same id aimed at another customer is also bound to different content.
        await reject(await create("techA", two, { id: firstId, sectionKey: sectionA, wording: "Main supply valve needs repair" }), 409, "IDEMPOTENCY_CONFLICT");
      });

      await t.test("the same text under a different id merges onto the canonical row (never 409), case and spacing insensitive", async () => {
        for (const wording of ["Main supply valve needs repair", "  main SUPPLY   valve needs repair ", "MAIN SUPPLY VALVE NEEDS REPAIR"]) {
          const requested = id();
          const merged = await create("techB", one, { id: requested, sectionKey: sectionA, wording, jobId: jobB1 });
          assert.equal(merged.status, 200, await merged.clone().text());
          const body = await merged.json() as { requestedId: string; duplicate: boolean; merged: boolean; remark: { id: string; wording: string } };
          assert.equal(body.merged, true); assert.equal(body.duplicate, false);
          assert.equal(body.requestedId, requested, "the REQUESTED id is echoed");
          assert.equal(body.remark.id, firstId, "the canonical row is returned");
          assert.equal(body.remark.wording, "Main supply valve needs repair");
        }
        assert.equal((await rows(one)).length, 1);
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM service_section_remarks WHERE id <> $1 AND customer_id=$2", [firstId, one.customerId])).rows[0].n, 0);
      });

      await t.test("two concurrent POSTs of the same text make exactly one row", async () => {
        const wording = "Concurrent remark about the pump";
        const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => create(index % 2 ? "techA" : "techB", one, { id: id(), sectionKey: sectionB, wording })));
        const statuses = responses.map((response) => response.status).sort();
        assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 200, 201], await Promise.all(responses.map((response) => response.clone().text())).then((all) => all.join(" | ")));
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM service_section_remarks WHERE customer_id=$1 AND section_key=$2", [one.customerId, sectionB])).rows[0].n, 1);
        const sameId = id();
        const same = await Promise.all(Array.from({ length: 5 }, () => create("techA", one, { id: sameId, sectionKey: comments, wording: "Concurrent replay of one id" })));
        assert.deepEqual(same.map((response) => response.status).sort(), [200, 200, 200, 200, 201]);
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM service_section_remarks WHERE id=$1", [sameId])).rows[0].n, 1);
      });

      await t.test("sections and customers are independent: the same text lives separately", async () => {
        const wording = "Independent wording across scopes";
        for (const [actor, owner, section] of [["techA", one, sectionA], ["techA", one, sectionB], ["techA", one, comments], ["techA", two, sectionA]] as const) {
          const response = await create(actor, owner, { id: id(), sectionKey: section, wording });
          assert.equal(response.status, 201, `${section} ${await response.clone().text()}`);
        }
        const forOne = (await rows(one)).filter((row) => row.wording === wording).map((row) => row.section_key).sort();
        assert.deepEqual(forOne, [comments, sectionA, sectionB].sort());
        assert.equal((await rows(two)).filter((row) => row.wording === wording).length, 1);
      });

      await t.test("validation rejects control, hidden and bidi characters, short and long text, unknown keys and ids", async () => {
        const base = (extra: Record<string, unknown>) => ({ id: id(), sectionKey: sectionA, wording: "Valid wording here", ...extra });
        const before = (await rows(one)).length;
        const bad: Array<[string, Record<string, unknown>]> = [
          ["newline", { wording: `line one${lineFeed}line two` }], ["carriage return", { wording: "line one\rline two" }], ["tab", { wording: "tab\there" }],
          ["NUL", { wording: "nul\u0000here" }], ["C1 control", { wording: "c1\u0085here" }],
          ["zero-width space", { wording: "zero\u{200B}width" }], ["zero-width joiner", { wording: "zero\u{200D}width" }], ["LRM", { wording: "lrm\u{200E}here" }], ["RLM", { wording: "rlm\u{200F}here" }],
          ["bidi override RLO", { wording: "text \u{202E}reversed" }], ["bidi embedding LRE", { wording: "text\u{202A}here" }], ["bidi isolate", { wording: "text\u{2066}here\u{2069}" }], ["BOM", { wording: "bom\u{FEFF}here" }],
          ["word joiner", { wording: "word\u{2060}joiner" }], ["lone surrogate", { wording: "lone\uD800surrogate" }],
          ["too short (2)", { wording: "ab" }], ["only spaces", { wording: "     " }], ["short after collapse", { wording: "a\u{A0}\u{A0}\u{A0}  " }], ["too long (301)", { wording: "x".repeat(301) }],
          ["not a string", { wording: 12345 }], ["missing wording", { wording: undefined }], ["extra key", { extra: true }], ["role smuggling key", { createdByUserId: 1 }],
          ["bad id", { id: "not-a-uuid" }], ["missing id", { id: undefined }], ["bad jobId", { jobId: "nope" }], ["null jobId", { jobId: null }],
          ["unknown section", { sectionKey: "checklist.waterTank.not_a_row" }], ["section of another shape", { sectionKey: "comments.extra" }],
          ["injection-looking section", { sectionKey: "x'; DROP TABLE users;--" }], ["missing section", { sectionKey: undefined }]
        ];
        for (const [name, extra] of bad) {
          const response = await create("techA", one, base(extra));
          assert.equal(response.status, 400, `${name}: ${await response.clone().text()}`);
          assert.equal((await response.json() as { error: string }).error, "INVALID_SECTION_REMARK", name);
        }
        await reject(await call(postPath(one), "techA", "POST", ["not", "an", "object"]), 400, "INVALID_SECTION_REMARK");
        await reject(await create("techA", one, base({}), "hose_reel"), 400, "INVALID_SECTION_REMARK");
        await reject(await create("techA", one, base({}), "not_a_system"), 400, "INVALID_SECTION_REMARK");
        await reject(await call("/technician/customers/not-a-uuid/systems/automatic_sprinkler/section-remarks", "techA", "POST", base({})), 400, "INVALID_SECTION_REMARK");
        assert.equal((await rows(one)).length, before, "no rejected request stored anything");
        // Boundaries that must be accepted: exactly 3 and exactly 300 characters, and normalisation on the way in.
        const three = await create("techA", one, base({ sectionKey: comments, wording: "abc" })); assert.equal(three.status, 201, await three.clone().text());
        const longest = await create("techA", one, base({ sectionKey: comments, wording: "y".repeat(300) })); assert.equal(longest.status, 201, await longest.clone().text());
        const nfc = await create("techA", one, base({ sectionKey: comments, wording: "  Café   au   lait  " }));
        assert.equal(nfc.status, 201, await nfc.clone().text());
        assert.equal((await nfc.json() as { remark: { wording: string } }).remark.wording, "Café au lait", "NFC + collapsed whitespace + trimmed");
        const emoji = await create("techA", one, base({ sectionKey: comments, wording: "\u{1F600}\u{1F600}\u{1F600}" }));
        assert.equal(emoji.status, 201, "three emoji are three characters (code points), as PostgreSQL counts them");
        const twoEmoji = await create("techA", one, base({ sectionKey: comments, wording: "\u{1F600}\u{1F600}" })); assert.equal(twoEmoji.status, 400);
      });

      await t.test("a section holds at most 50 active remarks; replays and merges still succeed at the cap", async () => {
        const capSection = "checklist.pumpHouse.pump_house_clean";
        const firstCapId = id();
        for (let index = 0; index < sectionRemarkCap; index += 1) {
          const response = await create("techA", one, { id: index === 0 ? firstCapId : id(), sectionKey: capSection, wording: `Cap remark number ${index}` });
          assert.equal(response.status, 201, `${index}: ${await response.clone().text()}`);
        }
        await reject(await create("techA", one, { id: id(), sectionKey: capSection, wording: "One remark too many" }), 409, "SECTION_REMARK_LIMIT_REACHED");
        assert.equal((await create("techA", one, { id: firstCapId, sectionKey: capSection, wording: "Cap remark number 0" })).status, 200, "replay at the cap");
        assert.equal((await create("techB", one, { id: id(), sectionKey: capSection, wording: "cap remark NUMBER 7" })).status, 200, "merge at the cap");
        assert.equal((await create("techA", one, { id: id(), sectionKey: "checklist.pumpHouse.pumps_auto_start", wording: "One remark too many" })).status, 201, "another section is unaffected");
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM service_section_remarks WHERE customer_id=$1 AND section_key=$2", [one.customerId, capSection])).rows[0].n, sectionRemarkCap);
      });

      await t.test("authorisation: uniform 404 for everything out of scope; admin and supervisor allowed; identity mismatch refused", async () => {
        const body = (extra: Record<string, unknown> = {}) => ({ id: id(), sectionKey: sectionA, wording: "Authorisation probe remark", ...extra });
        await reject(await create("", one, body()), 401);
        await reject(await call(`/customers/${one.customerId}/section-remarks`, undefined), 401);
        const notFoundBodies = new Set<string>();
        const probes: Array<[string, Response]> = [
          ["technician with no job for the customer", await create("techC", two, body())],
          ["technician whose job lacks the system", await create("techC", one, body({ jobId: jobHoseOnly }))],
          ["technician with only a sample job", await create("techC", two, body({ jobId: sampleJob }))],
          ["another technician's job id", await create("techB", one, body({ jobId: jobA1 }))],
          ["a job of a different customer", await create("techA", one, body({ jobId: jobA2 }))],
          ["unknown customer", await call(postPath({ customerId: id() }), "techA", "POST", body())],
          ["demo customer (technician)", await create("techA", demo, body({ jobId: jobDemo }))],
          ["inactive customer (technician)", await create("techA", inactive, body({ jobId: jobInactive }))],
          ["demo customer (admin)", await create("admin", demo, body())],
          ["inactive customer (supervisor)", await create("supervisor", inactive, body())],
          ["admin with a job of another customer", await create("admin", one, body({ jobId: jobA2 }))]
        ];
        for (const [name, response] of probes) {
          assert.equal(response.status, 404, `${name}: ${await response.clone().text()}`);
          notFoundBodies.add(await response.text());
        }
        assert.equal(notFoundBodies.size, 1, `every out-of-scope answer is the same 404 body: ${[...notFoundBodies].join(" || ")}`);
        const adminCreate = await create("admin", one, body({ sectionKey: sectionB, wording: "Admin added remark" })); assert.equal(adminCreate.status, 201, await adminCreate.clone().text());
        const supervisorCreate = await create("supervisor", one, body({ sectionKey: sectionB, wording: "Supervisor added remark", jobId: jobA1 })); assert.equal(supervisorCreate.status, 201, await supervisorCreate.clone().text());
        const secondTechnician = await create("techB", one, body({ sectionKey: sectionB, wording: "Second technician remark", jobId: jobB1 })); assert.equal(secondTechnician.status, 201, await secondTechnician.clone().text());
        const mismatch = await call(postPath(one), "techA", "POST", body({ wording: "Identity mismatch remark" }), { "x-expected-user-id": String(techB) });
        await reject(mismatch, 409, "IDENTITY_MISMATCH");
        const matching = await call(postPath(one), "techA", "POST", body({ wording: "Identity match remark" }), { "x-expected-user-id": String(techA) });
        assert.equal(matching.status, 201, await matching.clone().text());
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM service_section_remarks WHERE wording='Identity mismatch remark'")).rows[0].n, 0);
      });

      await t.test("GET returns only that customer's active rows, shared across its technicians, never another customer's", async () => {
        const get = async (actor: string, owner: { customerId: string }) => call(`/customers/${owner.customerId}/section-remarks`, actor);
        const forB = await get("techB", one);
        assert.equal(forB.status, 200);
        assert.equal(forB.headers.get("cache-control"), "private, no-store");
        const bodyB = await forB.json() as { remarks: Array<{ id: string; customerId: string; systemKey: string; sectionKey: string; wording: string }> };
        assert.ok(bodyB.remarks.some((remark) => remark.id === firstId), "a second technician of the same customer sees the first technician's remark");
        assert.ok(bodyB.remarks.every((remark) => remark.customerId === one.customerId), "never another customer's row");
        assert.deepEqual(Object.keys(bodyB.remarks[0]!).sort(), ["customerId", "id", "sectionKey", "systemKey", "wording"]);
        assert.equal(bodyB.remarks.length, (await rows(one)).length);
        const forTwo = await (await get("techA", two)).json() as { remarks: Array<{ customerId: string }> };
        assert.ok(forTwo.remarks.length > 0 && forTwo.remarks.every((remark) => remark.customerId === two.customerId));
        await reject(await get("techC", two), 404, "SECTION_REMARK_SCOPE_NOT_FOUND");
        await reject(await get("techA", demo), 404, "SECTION_REMARK_SCOPE_NOT_FOUND");
        await reject(await call(`/customers/${id()}/section-remarks`, "admin"), 404, "SECTION_REMARK_SCOPE_NOT_FOUND");
        await reject(await call("/customers/not-a-uuid/section-remarks", "admin"), 400, "INVALID_SECTION_REMARK");
        assert.equal((await get("admin", one)).status, 200);
        assert.equal((await get("supervisor", two)).status, 200);
        await pool.query("UPDATE service_section_remarks SET active=false WHERE id=$1", [firstId]);
        const afterDeactivate = await (await get("techA", one)).json() as { remarks: Array<{ id: string }> };
        assert.ok(!afterDeactivate.remarks.some((remark) => remark.id === firstId), "inactive rows are not returned");
        await pool.query("UPDATE service_section_remarks SET active=true WHERE id=$1", [firstId]);
      });

      await t.test("audit rows are written for created remarks only", async () => {
        const audited = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_events WHERE action='service_section_remark_created' AND entity_type='service_section_remark' AND result='success'");
        const stored = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM service_section_remarks");
        assert.equal(audited.rows[0]!.n, stored.rows[0]!.n, "one audit row per stored remark, none for replays or merges");
        const row = await pool.query("SELECT actor_user_id::int AS actor FROM audit_events WHERE action='service_section_remark_created' AND entity_id=$1", [firstId]);
        assert.equal(row.rows[0].actor, techA);
        const refused = await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='service_section_remark_create' AND reason='IDENTITY_MISMATCH'");
        assert.ok(refused.rows[0].n >= 1, "the identity mismatch left a failure audit row");
      });

      await t.test("the global /service-common-remarks endpoint is unchanged and carries no section remark", async () => {
        const response = await call("/service-common-remarks", "techA");
        assert.equal(response.status, 200);
        const body = await response.json() as { remarks: Array<Record<string, unknown>> };
        assert.ok(body.remarks.length > 0);
        for (const remark of body.remarks) assert.deepEqual(Object.keys(remark).sort(), ["active", "detailLabel", "detailOptions", "id", "systemKey", "wording"]);
        const sectionWordings = new Set((await rows(one)).map((row) => row.wording));
        assert.ok(!body.remarks.some((remark) => sectionWordings.has(String(remark.wording))), "no section-scoped wording leaks into the global list");
        const columnsNow = await pool.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name='service_common_remarks' ORDER BY ordinal_position");
        assert.deepEqual(columnsNow.rows.map((row) => row.column_name), ["id", "system_key", "wording", "detail_label", "detail_options", "create_fingerprint", "active", "created_by", "created_at", "updated_at"]);
      });
    } finally { server.close(); await once(server, "close"); }

    // Migration: cold install (above), then a database that is exactly at 048 (no section table), then re-runs.
    await pool.query("INSERT INTO service_section_remarks(id,customer_id,system_key,section_key,wording,created_by_user_id,create_fingerprint) VALUES($1,$2,'automatic_sprinkler',$3,'Survives a re-run',$4,$5)", [id(), one.customerId, sectionA, techA, "f".repeat(64)]);
    await runMigrations(pool); await runMigrations(pool);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM service_section_remarks WHERE wording='Survives a re-run'")).rows[0].n, 1, "re-running the migrations keeps the data");
    await pool.query("DROP TABLE service_section_remarks");
    await runMigrations(pool);
    const index = await pool.query("SELECT indexdef FROM pg_indexes WHERE indexname='service_section_remarks_active_wording'");
    assert.match(index.rows[0].indexdef, /UNIQUE.*\(customer_id, system_key, section_key, lower\(wording\)\).*WHERE active/);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM service_section_remarks")).rows[0].n, 0, "recreated from the 048 state with no seed and no backfill");
    await assert.rejects(pool.query("INSERT INTO service_section_remarks(id,customer_id,system_key,section_key,wording,created_by_user_id,create_fingerprint) VALUES($1,$2,'automatic_sprinkler','comments','ab',$3,$4)", [id(), one.customerId, techA, "f".repeat(64)]), /check constraint/);
  } finally { await pool.end(); }
});
