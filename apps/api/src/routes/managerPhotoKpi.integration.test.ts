import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import pg from "pg";
import { createManagerPhotoKpiRouter } from "./managerPhotoKpi.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
type Role = "admin" | "supervisor" | "inspector";

test("P4 photo KPI counts every source, NULL, Malaysia month edges and roles on disposable PostgreSQL", { skip: !databaseUrl }, async () => {
  const url = new URL(databaseUrl!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/phase6_seed_integration");
  const database = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await database.query(`CREATE TABLE users (id bigint PRIMARY KEY, username text NOT NULL, display_name text, role text NOT NULL, is_active boolean NOT NULL DEFAULT true, hidden_at timestamptz);
      CREATE TABLE technician_supervisor_assignments (technician_id bigint NOT NULL, supervisor_id bigint NOT NULL, archived_at timestamptz);
      CREATE TABLE audit_events (actor_user_id bigint, action text, entity_type text, entity_id text, result text, reason text);
      CREATE TABLE staged_inspection_evidence (photo_uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(), uploader_user_id bigint NOT NULL, capture_source text, status text NOT NULL, accepted_at timestamptz);
      CREATE TABLE inspection_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), uploaded_by_user_id bigint NOT NULL, capture_source text NOT NULL, received_at timestamptz NOT NULL);
      CREATE TABLE repair_visit_photos (photo_uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(), uploader_user_id bigint NOT NULL, capture_source text NOT NULL, status text NOT NULL, accepted_at timestamptz)`);
    await database.query(`INSERT INTO users(id,username,display_name,role,is_active,hidden_at) VALUES
      (1,'admin1','Manager One','admin',true,NULL),
      (2,'alice','Alice','inspector',true,NULL),
      (3,'bob','Bob','inspector',true,NULL),
      (4,'quiet','Quiet','inspector',true,NULL),
      (5,'gone','Gone','inspector',true,now()),
      (6,'gone2','Gone Two','inspector',false,NULL),
      (7,'sup','Admin Sup','supervisor',true,NULL)`);
    // Admin (supervisor) 7 is assigned to Alice (active) and Bob (archived assignment): sees Alice only.
    await database.query("INSERT INTO technician_supervisor_assignments(technician_id,supervisor_id,archived_at) VALUES(2,7,NULL),(3,7,now())");
    const staged = (user: number, source: string | null, status: string, at: string | null) =>
      database.query("INSERT INTO staged_inspection_evidence(uploader_user_id,capture_source,status,accepted_at) VALUES($1,$2,$3,$4)", [user, source, status, at]);
    const attachment = (user: number, source: string, at: string) =>
      database.query("INSERT INTO inspection_attachments(uploaded_by_user_id,capture_source,received_at) VALUES($1,$2,$3)", [user, source, at]);
    const repair = (user: number, source: string, status: string, at: string | null) =>
      database.query("INSERT INTO repair_visit_photos(uploader_user_id,capture_source,status,accepted_at) VALUES($1,$2,$3,$4)", [user, source, status, at]);

    // Alice, October 2026 (Malaysia): V7 evidence camera x2, gallery x1, NULL source x1 (unknown); staged ignored.
    await staged(2, "camera", "accepted", "2026-10-10T03:00:00Z");
    await staged(2, "camera", "accepted", "2026-10-11T03:00:00Z");
    await staged(2, "gallery", "accepted", "2026-10-12T03:00:00Z");
    await staged(2, null, "accepted", "2026-10-13T03:00:00Z");
    await staged(2, "gallery", "staged", null);
    // Legacy attachment gallery + repair camera, repair superseded/staged ignored.
    await attachment(2, "gallery", "2026-10-14T03:00:00Z");
    await repair(2, "camera", "accepted", "2026-10-15T03:00:00Z");
    await repair(2, "gallery", "superseded", "2026-10-15T01:00:00Z");
    await repair(2, "gallery", "staged", null);
    // Period edges at Malaysia midnight: 2026-09-30T16:00:00Z is 2026-10-01 00:00 in Kuala Lumpur.
    await staged(3, "gallery", "accepted", "2026-09-30T15:59:59.999Z"); // September 23:59:59.999
    await staged(3, "camera", "accepted", "2026-09-30T16:00:00Z"); // October 00:00:00
    await staged(3, "camera", "accepted", "2026-10-31T15:59:59.999Z"); // October 23:59:59.999
    await staged(3, "gallery", "accepted", "2026-10-31T16:00:00Z"); // November 00:00:00
    // Hidden / inactive technicians: only listed when they have photos in the period.
    await staged(5, "gallery", "accepted", "2026-10-02T03:00:00Z");
    await staged(6, "camera", "accepted", "2026-08-02T03:00:00Z");
    // A non-technician account's photo is not part of the technician KPI (it is neither listed nor in the totals).
    await repair(7, "unknown", "accepted", "2026-10-03T03:00:00Z");

    let user: { id: number; username: string; role: Role } | null = { id: 1, username: "admin1", role: "admin" };
    const app = express();
    app.use((request, _response, next) => { if (user) request.currentUser = user; next(); });
    app.use(createManagerPhotoKpiRouter(database, () => new Date("2026-10-20T04:00:00Z")));
    server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/manager/photo-kpi`;
    type Body = { period: string; months: string[]; technicians: Array<{ userId: number; hidden: boolean; camera: number; gallery: number; unknown: number; galleryPercent: number | null; trend: Array<{ month: string; camera: number; gallery: number; unknown: number }> }>; total: { camera: number; gallery: number; unknown: number; galleryPercent: number | null; trend: Array<{ month: string; camera: number; gallery: number; unknown: number }> } };
    const get = async (query: string) => { const res = await fetch(`${base}${query}`); return { status: res.status, cache: res.headers.get("cache-control"), body: await res.json() as Body & { error?: string } }; };
    const row = (body: Body, id: number) => body.technicians.find((item) => item.userId === id);

    const october = await get("?period=2026-10");
    assert.equal(october.status, 200);
    assert.equal(october.cache, "private, no-store");
    assert.deepEqual(october.body.months, ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    // Alice: camera 2 + 1 repair = 3, gallery 1 + 1 attachment = 2, NULL source -> unknown 1, never camera.
    assert.deepEqual(pick(row(october.body, 2)), { camera: 3, gallery: 2, unknown: 1, galleryPercent: 40 });
    // Bob, October: camera 2 (both edges inside), gallery 0 (Sep 23:59 and Nov 00:00 fall outside).
    assert.deepEqual(pick(row(october.body, 3)), { camera: 2, gallery: 0, unknown: 0, galleryPercent: 0 });
    assert.deepEqual(row(october.body, 3)!.trend.map((point) => [point.month, point.camera, point.gallery]), [["2026-05", 0, 0], ["2026-06", 0, 0], ["2026-07", 0, 0], ["2026-08", 0, 0], ["2026-09", 0, 1], ["2026-10", 2, 0]]);
    // Quiet, active and visible: listed with zero and no percentage. Hidden with photos in the period: listed and flagged.
    assert.deepEqual(pick(row(october.body, 4)), { camera: 0, gallery: 0, unknown: 0, galleryPercent: null });
    assert.deepEqual(pick(row(october.body, 5)), { camera: 0, gallery: 1, unknown: 0, galleryPercent: 100 });
    assert.equal(row(october.body, 5)!.hidden, true);
    assert.equal(row(october.body, 2)!.hidden, false);
    // Inactive technician with photos only in August is not listed for October; an admin with no photos is never listed.
    assert.equal(row(october.body, 6), undefined);
    assert.equal(row(october.body, 1), undefined);
    assert.equal(row(october.body, 7), undefined);
    assert.deepEqual({ camera: october.body.total.camera, gallery: october.body.total.gallery, unknown: october.body.total.unknown, galleryPercent: october.body.total.galleryPercent },
      { camera: 5, gallery: 3, unknown: 1, galleryPercent: 37.5 });

    const september = await get("?period=2026-09");
    assert.deepEqual(pick(row(september.body, 3)), { camera: 0, gallery: 1, unknown: 0, galleryPercent: 100 });
    assert.equal(row(september.body, 2)!.camera, 0);
    // The August-only inactive technician appears in August, and is flagged hidden.
    const august = await get("?period=2026-08");
    assert.deepEqual(pick(row(august.body, 6)), { camera: 1, gallery: 0, unknown: 0, galleryPercent: 0 });
    assert.equal(row(august.body, 6)!.hidden, true);
    assert.deepEqual(august.body.months, ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
    // The total trend includes uploaders not listed for the selected month.
    assert.equal(october.body.total.trend.find((point) => point.month === "2026-08")!.camera, 1);

    // All time: includes everyone with photos; trend ends at the current Malaysia month.
    const all = await get("?period=all");
    assert.equal(all.body.period, "all");
    assert.deepEqual(all.body.months, ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    assert.deepEqual(pick(row(all.body, 3)), { camera: 2, gallery: 2, unknown: 0, galleryPercent: 50 });
    assert.deepEqual(pick(row(all.body, 6)), { camera: 1, gallery: 0, unknown: 0, galleryPercent: 0 });
    assert.deepEqual({ camera: all.body.total.camera, gallery: all.body.total.gallery, unknown: all.body.total.unknown }, { camera: 6, gallery: 5, unknown: 1 });

    // "Now" at Malaysia midnight: 2026-09-30T16:00:00Z is already October there.
    const clockApp = express();
    clockApp.use((request, _response, next) => { request.currentUser = { id: 1, username: "a", role: "admin" }; next(); });
    clockApp.use(createManagerPhotoKpiRouter(database, () => new Date("2026-09-30T16:00:00Z")));
    const clockServer = clockApp.listen(0, "127.0.0.1"); await once(clockServer, "listening");
    try {
      const clock = await (await fetch(`http://127.0.0.1:${(clockServer.address() as { port: number }).port}/manager/photo-kpi?period=all`)).json() as Body;
      assert.equal(clock.months.at(-1), "2026-10");
    } finally { await new Promise<void>((resolve) => clockServer.close(() => resolve())); }

    // Strict period validation fails closed.
    for (const bad of ["", "?period=", "?period=2026-13", "?period=2026-00", "?period=2026-1", "?period=ALL", "?period=2026-10-01", "?period=2026-10&x=1", "?period=2026-10&period=2026-09", "?x=1"]) {
      const result = await get(bad);
      assert.equal(result.status, 400, bad);
      assert.equal(result.body.error, "INVALID_PERIOD", bad);
    }

    // Roles: admin and supervisor allowed, technician 403, anonymous 401. The supervisor is not refused, so no denial is audited.
    user = { id: 7, username: "sup", role: "supervisor" };
    const scoped = await get("?period=2026-10");
    assert.equal(scoped.status, 200);
    // Only Alice (active assignment): Bob (archived), hidden Gone and unassigned Quiet are absent; totals are Alice's alone.
    assert.deepEqual(scoped.body.technicians.map((item) => item.userId), [2]);
    assert.deepEqual({ camera: scoped.body.total.camera, gallery: scoped.body.total.gallery, unknown: scoped.body.total.unknown }, { camera: 3, gallery: 2, unknown: 1 });
    assert.equal(scoped.body.total.trend.find((point) => point.month === "2026-08")!.camera, 0);
    assert.equal(scoped.body.total.trend.find((point) => point.month === "2026-09")!.gallery, 0);
    const scopedAll = await get("?period=all");
    assert.deepEqual(scopedAll.body.technicians.map((item) => item.userId), [2]);
    user = { id: 2, username: "alice", role: "inspector" };
    assert.equal((await get("?period=all")).status, 403);
    user = null;
    assert.equal((await get("?period=all")).status, 401);
    assert.equal((await database.query("SELECT 1 FROM audit_events")).rowCount, 0);
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await database.end();
  }
});

function pick(value: { camera: number; gallery: number; unknown: number; galleryPercent: number | null } | undefined) {
  assert.ok(value, "technician row present");
  return { camera: value.camera, gallery: value.gallery, unknown: value.unknown, galleryPercent: value.galleryPercent };
}
