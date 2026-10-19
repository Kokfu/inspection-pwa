import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { removeRetiredRepairPhotoFiles } from "../attachments/attachmentStorage.js";
import { runMigrations } from "./migrations.js";
import { pool } from "./pool.js";

const url = process.env.SEED_INTEGRATION_DATABASE_URL;
assert.ok(url, "Cold disposable DB is required; a skip is not a pass");
assert.equal(process.env.NODE_ENV, "test");
assert.equal(process.env.DATABASE_URL, url);
assert.equal(new URL(url).hostname, "127.0.0.1");
assert.equal(new URL(url).port, "55432");
assert.equal(new URL(url).pathname, "/phase6_seed_integration");

const retiredTables = ["repair_exports", "repair_approvals", "repair_finding_reviews", "staged_repair_evidence", "repair_records", "repair_work_orders", "repair_findings"];
const retiredFunctions = ["repair_append_only", "repair_cycle_guard", "repair_finding_identity_guard", "repair_work_order_guard"];
const exists = async (db: pg.Pool, name: string) => (await db.query("SELECT to_regclass($1) IS NOT NULL AS found", [`public.${name}`])).rows[0].found as boolean;
const rowCounts = async (db: pg.Pool) => {
  const names = (await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(r => r.table_name as string);
  const counts: Record<string, number> = {};
  for (const name of names) counts[name] = (await db.query(`SELECT count(*)::int AS n FROM "${name}"`)).rows[0].n;
  return counts;
};
const fileExists = (file: string) => stat(file).then(() => true, () => false);

test("cold 001-054 with old repair test rows -> 055 drops only the old repair tables and files; replay is a no-op", async () => {
  const db = new pg.Pool({ connectionString: url });
  const lock = await db.connect(); await lock.query("SELECT pg_advisory_lock(819276)");
  const uploads = await mkdtemp(path.join(tmpdir(), "rv-5a-")); process.env.UPLOADS_PATH = uploads;
  try {
    await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await runMigrations(db, { repairVisitMigrationTarget: 54 });
    for (const name of retiredTables) assert.equal(await exists(db, name), true, `${name} exists before 055`);

    // Old repair test rows. Replica mode skips the foreign keys and append-only guards, which is only
    // needed to build rows without a full accepted service visit behind them.
    const actor = (await db.query("INSERT INTO users(username,password_hash,role) VALUES('rv-5a-fixture','fixture','inspector') RETURNING id")).rows[0].id;
    const [finding, order, record, photo, job, form] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const hash = "b".repeat(64), oldRelative = `repairs/${record}/${photo}.jpg`;
    const client = await db.connect();
    try {
      await client.query("SET session_replication_role = replica");
      await client.query("INSERT INTO repair_findings(id,form_instance_id,job_id,system_key,field_path,original_metadata,source_fingerprint) VALUES($1,$2,$3,'hydrant','a.b','{}',$4)", [finding, form, job, hash]);
      await client.query("INSERT INTO repair_work_orders(id,job_id,system_key,assigned_to_user_id,created_by_user_id) VALUES($1,$2,'hydrant',$3,$3)", [order, job, actor]);
      await client.query("INSERT INTO repair_records(client_uuid,finding_id,work_order_id,job_id,system_key,cycle_sequence,remark,performed_at,submitted_by_user_id,source_revision,manifest,request_fingerprint) VALUES($1,$2,$3,$4,'hydrant',1,'Replaced',now(),$5,$6,'[{}]',$6)", [record, finding, order, job, actor, hash]);
      await client.query("INSERT INTO staged_repair_evidence(photo_uuid,repair_uuid,finding_id,work_order_id,job_id,system_key,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,metadata,storage_relative_path,status,bound_repair_uuid) VALUES($1,$2,$3,$4,$5,'hydrant',$6,$7,$7,$7,'{}',$8,'accepted',$2)", [photo, record, finding, order, job, actor, hash, oldRelative]);
      await client.query("INSERT INTO repair_approvals(id,repair_uuid,decision,decided_by_user_id,decided_by_role,sequence,request_id,request_fingerprint) VALUES($1,$2,'approved',$3,'admin',1,$1,$4)", [randomUUID(), record, actor, hash]);
      await client.query("INSERT INTO repair_finding_reviews(id,finding_id,source_revision,decision,reason,decided_by_user_id,decided_by_role,sequence,request_id,request_fingerprint) VALUES($1,$2,$3,'eligible','Fixture review',$4,'admin',1,$1,$3)", [randomUUID(), finding, hash, actor]);
      await client.query("INSERT INTO repair_exports(id,request_id,request_fingerprint,actor_user_id,job_id,system_key,selection,issued_at,presentation,pdf,pdf_sha256) VALUES($1,$1,$2,$3,$4,'hydrant','[{}]',now(),'x','\\x25','"+hash+"')", [randomUUID(), hash, actor, job]);
    } finally { await client.query("SET session_replication_role = DEFAULT"); client.release(); }

    // Files: the old photo (must go), an unrelated inspection photo and a new-style repair visit file (must stay).
    const write = async (relative: string) => { const file = path.join(uploads, ...relative.split("/")); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, "jpeg"); return file; };
    const oldFile = await write(oldRelative);
    const visitRelative = `repairs/${randomUUID()}/${randomUUID()}.jpg`, visitFile = await write(visitRelative);
    const inspectionFile = await write(`inspections/${randomUUID()}.jpg`);

    const before = await rowCounts(db);
    for (const name of retiredTables) assert.ok(before[name] >= 1, `${name} has a test row`);

    await runMigrations(db); // applies 055

    const after = await rowCounts(db);
    for (const name of retiredTables) { assert.equal(await exists(db, name), false, `${name} dropped`); delete before[name]; }
    assert.deepEqual(after, before, "every other table keeps its exact row count and nothing else was dropped");
    const functions = (await db.query("SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname = ANY($1::text[])", [retiredFunctions])).rows;
    assert.deepEqual(functions, [], "old repair functions dropped");
    for (const name of ["repair_visits", "repair_visit_items", "repair_visit_photos", "repair_visit_events", "repair_report_number_year_counters"]) assert.equal(await exists(db, name), true, `${name} untouched`);
    assert.equal(await fileExists(oldFile), false, "old repair photo file removed");
    assert.equal(await fileExists(path.dirname(oldFile)), false, "its empty folder is removed");
    assert.equal(await fileExists(visitFile), true, "a repair visit file is never removed");
    assert.equal(await fileExists(inspectionFile), true, "inspection photos are never removed");

    // Replay: startup after 055 must not recreate the old tables (051/052 stay applied history only).
    await runMigrations(db);
    for (const name of retiredTables) assert.equal(await exists(db, name), false, `${name} stays dropped after a restart`);
    assert.deepEqual(await rowCounts(db), after);
    assert.equal((await readFile(visitFile, "utf8")), "jpeg");
  } finally {
    await lock.query("SELECT pg_advisory_unlock(819276)"); lock.release(); await db.end(); await pool.end();
    await rm(uploads, { recursive: true, force: true });
  }
});

test("retired repair photo removal only touches exact well-formed paths inside the uploads folder", async () => {
  const uploads = await mkdtemp(path.join(tmpdir(), "rv-5a-paths-")); process.env.UPLOADS_PATH = uploads;
  const fakeDatabase = { query: async () => ({ rows: [] }) } as unknown as pg.Pool;
  try {
    const outside = path.join(uploads, "..", `rv-5a-outside-${randomUUID()}.jpg`); await writeFile(outside, "x");
    const inspection = path.join(uploads, "inspections", "keep.jpg"); await mkdir(path.dirname(inspection), { recursive: true }); await writeFile(inspection, "x");
    const result = await removeRetiredRepairPhotoFiles(fakeDatabase, ["repairs/../../" + path.basename(outside), "inspections/keep.jpg", "repairs/not-a-uuid/photo.jpg", "/etc/passwd"]);
    assert.deepEqual(result.removed, []);
    assert.equal(result.skipped.length, 4);
    assert.equal(await fileExists(outside), true);
    assert.equal(await fileExists(inspection), true);
    await rm(outside, { force: true });
  } finally { await rm(uploads, { recursive: true, force: true }); }
});
