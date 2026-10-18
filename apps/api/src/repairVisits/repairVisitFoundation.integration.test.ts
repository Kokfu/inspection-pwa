import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { pool } from "../db/pool.js";

const url = process.env.SEED_INTEGRATION_DATABASE_URL;
assert.ok(url, "Cold disposable DB is required; a skip is not a pass");
assert.equal(process.env.NODE_ENV, "test");
assert.equal(process.env.DATABASE_URL, url);
assert.equal(new URL(url).hostname, "127.0.0.1");
assert.equal(new URL(url).port, "55432");
assert.equal(new URL(url).pathname, "/phase6_seed_integration");

test("cold 001-052 -> 053/054, replay, strict constraints, evidence binding and append-only events", async () => {
  const db = new pg.Pool({ connectionString: url });
  const lock = await db.connect(); await lock.query("SELECT pg_advisory_lock(819276)");
  try {
    await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await runMigrations(db, { repairVisitMigrationTarget: 52 });
    assert.equal((await db.query("SELECT to_regclass('repair_visits') AS name")).rows[0].name, null);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='inspection_jobs' AND column_name='created_on_device_at'")).rows[0].n, 0);
    const sqls = await Promise.all(["053_offline_service_visits.sql", "054_repair_visits.sql"].map(name => readFile(new URL(`../../migrations/${name}`, import.meta.url), "utf8")));
    for (const sql of sqls) await db.query(sql);
    const actor = (await db.query("INSERT INTO users(username,password_hash,role) VALUES('rv-fixture','fixture','inspector') RETURNING id")).rows[0].id;
    const customer = "00000000-0000-4000-8000-000000000750", site = "00000000-0000-4000-8000-000000000755";
    const revision = (await db.query("SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND status='active'", [customer])).rows[0].id;
    const visit = randomUUID(), item = randomUUID(), photo = randomUUID(), event = randomUUID();
    const hash = "a".repeat(64);
    const insertVisit = (id: string, number: string, status = "draft") => db.query(`INSERT INTO repair_visits
      (client_uuid,visit_number,customer_id,site_id,created_by_user_id,configuration_revision_id,arrival_time,visit_date,created_on_device_at,request_fingerprint,status)
      VALUES($1,$2,$3,$4,$5,$6,'11:00','2026-10-19','2026-10-19T03:00:00Z',$7,$8)`, [id,number,customer,site,actor,revision,hash,status]);
    await insertVisit(visit, "RV-20261019-1");
    await assert.rejects(() => insertVisit(visit, "RV-20261019-2"), { code: "23505" });
    await assert.rejects(() => insertVisit(randomUUID(), "RV-20261019-1"), { code: "23505" });
    await assert.rejects(() => insertVisit(randomUUID(), "RV-20261019-3", "bogus"), { code: "23514" });
    await assert.rejects(() => insertVisit(randomUUID(), "RV-20261019-4", "approved"), { code: "23514" });
    await assert.rejects(() => db.query("UPDATE repair_visits SET previous_service_visit_id=$1 WHERE client_uuid=$2", ["00000000-0000-4000-8000-000000000759", visit]), { code: "23514" });
    await assert.rejects(() => db.query("UPDATE repair_visits SET previous_visit_kind='repair',previous_repair_visit_id=client_uuid WHERE client_uuid=$1", [visit]), { code: "23514" });
    // Evidence can be staged before the item exists; accepted binding is restrictive and visit-scoped.
    const stage = (id: string, version = 1) => db.query(`INSERT INTO repair_visit_photos(photo_uuid,visit_uuid,item_uuid,revision,uploader_user_id,request_fingerprint,
      source_sha256,stored_sha256,storage_relative_path,mime_type,size_bytes,width,height,capture_source,captured_at,status)
      VALUES($1,$2,$3,$6,$4,$5,$5,$5,$1::uuid::text,'image/jpeg',100,2,2,'camera',now(),'staged')`, [id,visit,item,actor,hash,version]);
    await stage(photo);
    await assert.rejects(() => stage(randomUUID()), { code: "23505" });
    const insertItem = (id: string, row: string | null, outcome = "done_repair") => db.query(`INSERT INTO repair_visit_items
      (client_uuid,visit_uuid,system_key,row_uuid,section_key,field_key,system_label,unit_label,section_label,field_label,outcome,remark,sort_order)
      VALUES($1,$2,'hydrant',$3,'set','valve','Hydrant','Unit','Set','Valve',$4,'Replaced',0)`, [id,visit,row,outcome]);
    await insertItem(item, item);
    await assert.rejects(() => insertItem(randomUUID(), item), { code: "23505" });
    await insertItem(randomUUID(), null); // singleton system-level field
    await assert.rejects(() => insertItem(randomUUID(), null), { code: "23505" });
    await assert.rejects(() => insertItem(randomUUID(), randomUUID(), "complete_repair"), { code: "23514" });
    await insertItem(randomUUID(), randomUUID(), "not_done");
    await assert.rejects(() => db.query("UPDATE repair_visit_photos SET status='accepted' WHERE photo_uuid=$1", [photo]), { code: "23514" });
    await db.query("UPDATE repair_visit_photos SET status='accepted',bound_item_uuid=item_uuid,accepted_at=now() WHERE photo_uuid=$1", [photo]);
    await assert.rejects(() => db.query("DELETE FROM repair_visit_items WHERE client_uuid=$1", [item]), { code: "23503" });
    const replacement = randomUUID();
    await stage(replacement, 2); // evidence-first replacement keeps old binding until submit
    await assert.rejects(() => db.query("UPDATE repair_visit_photos SET status='accepted',bound_item_uuid=item_uuid,accepted_at=now() WHERE photo_uuid=$1", [replacement]), { code: "23505" });
    const transaction = await db.connect();
    try {
      await transaction.query("BEGIN");
      await transaction.query("UPDATE repair_visit_photos SET status='superseded' WHERE photo_uuid=$1", [photo]);
      await transaction.query("UPDATE repair_visit_photos SET status='accepted',bound_item_uuid=item_uuid,accepted_at=now() WHERE photo_uuid=$1", [replacement]);
      await transaction.query("COMMIT");
    } catch (error) { await transaction.query("ROLLBACK"); throw error; }
    finally { transaction.release(); }
    await db.query(`INSERT INTO repair_visit_events(client_uuid,visit_uuid,revision,event_type,actor_user_id,reason,request_fingerprint)
      VALUES($1,$2,1,'returned',$3,'Please revise',$4)`, [event,visit,actor,hash]);
    await assert.rejects(() => db.query("UPDATE repair_visit_events SET reason='changed' WHERE client_uuid=$1", [event]));
    await assert.rejects(() => db.query("DELETE FROM repair_visit_events WHERE client_uuid=$1", [event]));
    await assert.rejects(() => db.query("TRUNCATE repair_visit_events"));
    await assert.rejects(() => db.query(`INSERT INTO repair_visit_events(client_uuid,visit_uuid,revision,event_type,actor_user_id,request_fingerprint)
      VALUES($1,$2,2,'returned',$3,$4)`, [randomUUID(),visit,actor,hash]), { code: "23514" });
    await assert.rejects(() => db.query("DELETE FROM repair_visits WHERE client_uuid=$1", [visit]), { code: "23503" });
    await db.query("INSERT INTO repair_report_number_year_counters VALUES(2026,3)");
    assert.equal((await db.query("SELECT nextval('repair_visit_reference_sequence') AS n")).rows[0].n, "1");
    for (const sql of sqls) await db.query(sql);
    await runMigrations(db);
    assert.equal((await db.query("SELECT last_sequence FROM repair_report_number_year_counters WHERE report_year=2026")).rows[0].last_sequence, "3");
    assert.equal((await db.query("SELECT nextval('repair_visit_reference_sequence') AS n")).rows[0].n, "2");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM repair_visits WHERE client_uuid=$1", [visit])).rows[0].n, 1);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM repair_visit_events WHERE client_uuid=$1", [event])).rows[0].n, 1);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM inspection_jobs WHERE created_on_device_at IS NOT NULL")).rows[0].n, 0);
  } finally { await lock.query("SELECT pg_advisory_unlock(819276)"); lock.release(); await db.end(); await pool.end(); }
});
