import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import express from "express";
import type { Server } from "node:http";
import test from "node:test";
import pg from "pg";
import { requireRole } from "../middleware/requireRole.js";
import { runMigrations } from "../db/migrations.js";
import { loadCanonicalInspectionJob } from "../routes/inspectionJobs.js";
import { createServiceVisitHandler } from "../routes/inspectionJobs.js";
import { createServiceVisit, ServiceVisitError } from "./serviceVisits.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
const customerId = "00000000-0000-4000-8000-000000000750";
const siteId = "00000000-0000-4000-8000-000000000755";
const requestId = "51000000-0000-4000-8000-000000000001";
const legacyJobId = "52000000-0000-4000-8000-000000000001";
const portableSeedJobId = "00000000-0000-4000-8000-000000000759";

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function retryThroughRoute(database: pg.Pool, actorUserId: number, body: unknown) {
  const audits: Array<{ action: string; result: string; reason?: string }> = [];
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.currentUser = { id: actorUserId, username: "service-visit-a", role: "inspector" };
    next();
  });
  app.post("/inspection-jobs/service-visits", requireRole("admin", "inspector"), createServiceVisitHandler({
    database,
    writeAudit: async (event) => { audits.push({ action: event.action, result: event.result, reason: event.reason }); }
  }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/inspection-jobs/service-visits`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    return { response, audits };
  } finally {
    await closeServer(server);
  }
}

test("PostgreSQL 010 -> 011 -> 012 upgrade fails unresolved legacy retries closed and preserves modern idempotency", {
  skip: !databaseUrl
}, async () => {
  assert.equal(new URL(databaseUrl!).pathname, "/phase6_seed_integration");
  const database = new pg.Pool({ connectionString: databaseUrl });
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(database, { serviceVisitMigrationTarget: 10 });
    const users = await database.query<{ id: number }>(`
      INSERT INTO users (username, password_hash, role) VALUES
        ('service-visit-a', 'not-used', 'inspector'), ('service-visit-b', 'not-used', 'inspector')
      RETURNING id`);
    const [actorA, actorB] = users.rows.map((row) => Number(row.id));
    assert.ok(actorA); assert.ok(actorB);

    // This is the exact shape made by migration 010: a request id with no
    // server-owned creator. Its snapshot comes from authoritative seed data.
    await database.query(`
      INSERT INTO inspection_jobs (
        id, template_id, master_template_version_id, job_reference, title, status, is_sample,
        customer_id, customer_configuration_revision_id, configuration_snapshot,
        site_id, service_date, creation_request_id
      )
      SELECT $1, template_id, master_template_version_id, 'SV-20260818-legacy',
        'Legacy unresolved service visit', 'open', false, customer_id,
        customer_configuration_revision_id, configuration_snapshot, $2, $3::date, $4
      FROM inspection_jobs WHERE id = $5`,
      [legacyJobId, siteId, "2026-08-18", requestId, portableSeedJobId]
    );
    assert.equal((await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM inspection_jobs WHERE creation_request_id = $1",
      [requestId]
    )).rows[0]?.count, "1");

    await database.query(await readFile(new URL("../../migrations/011_service_visit_idempotency_actor_scope.sql", import.meta.url), "utf8"));
    await database.query(await readFile(new URL("../../migrations/012_service_visit_legacy_idempotency.sql", import.meta.url), "utf8"));
    await database.query(await readFile(new URL("../../migrations/015_service_visit_schedule_time.sql", import.meta.url), "utf8"));
    assert.equal((await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM inspection_jobs WHERE creation_request_id = $1 AND created_by_user_id IS NULL",
      [requestId]
    )).rows[0]?.count, "1");

    await assert.rejects(() => database.query(`
      INSERT INTO inspection_jobs (
        id, template_id, master_template_version_id, job_reference, title, status, is_sample,
        customer_id, customer_configuration_revision_id, configuration_snapshot,
        site_id, service_date, creation_request_id
      )
      SELECT '52000000-0000-4000-8000-000000000002', template_id, master_template_version_id,
        'SV-20260818-no-actor', 'Rejected no-actor service visit', 'open', false, customer_id,
        customer_configuration_revision_id, configuration_snapshot, $1, '2026-08-18'::date,
        '51000000-0000-4000-8000-000000000099'
      FROM inspection_jobs WHERE id = $2`, [siteId, portableSeedJobId]), /authenticated creator/);

    const legacyRetry = await retryThroughRoute(database, actorA!, {
      requestId, customerId, siteId, systemKeys: ["portable_fire_extinguisher"]
    });
    const legacyResponse = legacyRetry.response;
    assert.equal(legacyResponse.status, 409);
    assert.deepEqual(await legacyResponse.json(), {
      error: "IDEMPOTENCY_LEGACY_UNRESOLVED",
      message: "A previous service-visit retry cannot be safely verified. Refresh My Service Jobs and contact an administrator; do not create it again."
    });
    assert.equal((await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM inspection_jobs WHERE creation_request_id = $1", [requestId]
    )).rows[0]?.count, "1");
    assert.deepEqual(legacyRetry.audits, [{ action: "service_visit_create", result: "failure", reason: "IDEMPOTENCY_LEGACY_UNRESOLVED" }]);

    const input = { requestId, customerId, siteId, systemKeys: ["portable_fire_extinguisher"] };
    const modernInput = { ...input, requestId: "51000000-0000-4000-8000-000000000002" };
    const routeInput = { ...input, requestId: "51000000-0000-4000-8000-000000000004" };
    const rejectedBackdate = await retryThroughRoute(database, actorA!, {
      ...routeInput, serviceDate: "2020-01-01", serviceTime: "00:01"
    });
    assert.equal(rejectedBackdate.response.status, 400, "the production route rejects browser-controlled creation time");
    assert.equal((await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM inspection_jobs WHERE creation_request_id = $1", [routeInput.requestId]
    )).rows[0]?.count, "0");
    const routeCreated = await retryThroughRoute(database, actorA!, routeInput);
    assert.equal(routeCreated.response.status, 201);
    const routeCreatedJob = (await routeCreated.response.json() as { job: { id: string; createdAt: string } }).job;
    await database.query("SELECT pg_sleep(0.02)");
    const routeReplay = await retryThroughRoute(database, actorA!, routeInput);
    assert.equal(routeReplay.response.status, 200);
    const routeReplayJob = (await routeReplay.response.json() as { job: { id: string; createdAt: string } }).job;
    assert.equal(routeReplayJob.id, routeCreatedJob.id, "an HTTP retry keeps the original Job");
    assert.equal(routeReplayJob.createdAt, routeCreatedJob.createdAt, "an HTTP retry keeps the original database creation timestamp");
    assert.equal((await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM inspection_jobs WHERE created_by_user_id=$1 AND creation_request_id=$2",
      [actorA, routeInput.requestId]
    )).rows[0]?.count, "1");
    const client = await database.connect();
    const created = await createServiceVisit(client, modernInput, actorA!);
    client.release();
    assert.equal(created.idempotent, false);
    const stored = await database.query<{ createdAt: string; serviceDate: string; serviceTime: string; expectedDate: string; expectedTime: string }>(`
      SELECT created_at::text AS "createdAt", service_date::text AS "serviceDate",
        to_char(service_time, 'HH24:MI') AS "serviceTime",
        to_char(created_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') AS "expectedDate",
        to_char(created_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'HH24:MI') AS "expectedTime"
      FROM inspection_jobs WHERE id=$1`, [created.id]);
    assert.equal(stored.rows[0]?.serviceDate, stored.rows[0]?.expectedDate);
    assert.equal(stored.rows[0]?.serviceTime, stored.rows[0]?.expectedTime);
    await assert.rejects(() => database.query("UPDATE inspection_jobs SET service_time='10:30'::time WHERE id=$1", [created.id]), /schedule is immutable/);
    await assert.rejects(() => database.query("UPDATE inspection_jobs SET service_date='2026-08-19'::date WHERE id=$1", [created.id]), /schedule is immutable/);
    await database.query("SELECT pg_sleep(0.02)");
    const replayClient = await database.connect();
    assert.deepEqual(await createServiceVisit(replayClient, modernInput, actorA!), { id: created.id, idempotent: true });
    replayClient.release();
    assert.equal((await database.query<{ createdAt: string }>("SELECT created_at::text AS \"createdAt\" FROM inspection_jobs WHERE id=$1", [created.id])).rows[0]?.createdAt, stored.rows[0]?.createdAt, "retry keeps the original database creation instant");
    await assert.rejects(async () => {
      const alteredClient = await database.connect();
      try { await createServiceVisit(alteredClient, { ...modernInput, systemKeys: ["hose_reel"] }, actorA!); }
      finally { alteredClient.release(); }
    }, (error: unknown) => error instanceof ServiceVisitError && error.code === "IDEMPOTENCY_MISMATCH");
    const actorBClient = await database.connect();
    const actorBVisit = await createServiceVisit(actorBClient, modernInput, actorB!);
    actorBClient.release();
    assert.notEqual(actorBVisit.id, created.id, "another actor cannot replay Actor A's job");
    const count = await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM inspection_jobs WHERE creation_request_id = $1", [requestId]
    );
    assert.equal(count.rows[0]?.count, "1");
    const modernCount = await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM inspection_jobs WHERE creation_request_id = $1", [modernInput.requestId]
    );
    assert.equal(modernCount.rows[0]?.count, "2");
    const concurrentInput = { ...modernInput, requestId: "51000000-0000-4000-8000-000000000003" };
    const concurrentlyCreate = async () => {
      const concurrentClient = await database.connect();
      try { return await createServiceVisit(concurrentClient, concurrentInput, actorA!); }
      finally { concurrentClient.release(); }
    };
    const [firstConcurrent, secondConcurrent] = await Promise.all([concurrentlyCreate(), concurrentlyCreate()]);
    assert.equal(firstConcurrent.id, secondConcurrent.id, "concurrent exact retry resolves to one job");
    const concurrentCount = await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM inspection_jobs WHERE created_by_user_id = $1 AND creation_request_id = $2",
      [actorA, concurrentInput.requestId]
    );
    assert.equal(concurrentCount.rows[0]?.count, "1");
    await database.query(
      "UPDATE inspection_jobs SET status = 'closed', completed_at = $2, completed_by_user_id = $3, completed_by_display_name = $4 WHERE id = $1",
      [created.id, "2026-08-18T12:00:00.000Z", actorA, "service-visit-a"]
    );
    const canonical = await loadCanonicalInspectionJob(created.id, database);
    assert.equal(canonical?.status, "closed");
    assert.equal(canonical?.completion.completedAt, "2026-08-18T12:00:00.000Z");
    assert.equal(canonical?.completion.completedBy?.id, actorA);
  } finally {
    await database.end();
  }
});

test("service call number, arrival, and departure persist on real PostgreSQL and are readable by the final-report cover query", {
  skip: !databaseUrl
}, async () => {
  assert.equal(new URL(databaseUrl!).pathname, "/phase6_seed_integration");
  const database = new pg.Pool({ connectionString: databaseUrl });
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(database);
    const users = await database.query<{ id: number }>(`
      INSERT INTO users (username, password_hash, role) VALUES ('cover-fields-tech', 'not-used', 'inspector') RETURNING id`);
    const actor = Number(users.rows[0]!.id);

    const withCoverFields = await retryThroughRoute(database, actor, {
      requestId: "51000000-0000-4000-8000-000000000010", customerId, siteId, systemKeys: ["portable_fire_extinguisher"],
      serviceCallNumber: "SC-7734", arrivalTime: "09:15", departureTime: "11:45"
    });
    assert.equal(withCoverFields.response.status, 201);
    const withCoverFieldsJob = (await withCoverFields.response.json() as { job: { id: string } }).job;
    assert.deepEqual((await database.query(`
      SELECT service_call_number AS "serviceCallNumber", to_char(arrival_time, 'HH24:MI') AS "arrivalTime", to_char(departure_time, 'HH24:MI') AS "departureTime"
      FROM inspection_jobs WHERE id = $1`, [withCoverFieldsJob.id])).rows[0],
      { serviceCallNumber: "SC-7734", arrivalTime: "09:15", departureTime: "11:45" },
      "cover fields persist exactly as sent through the real HTTP route"
    );
    // Same SELECT shape finalServiceReport.ts uses to read these columns for the PDF cover.
    assert.deepEqual((await database.query(`
      SELECT job.service_call_number, to_char(job.arrival_time, 'HH24:MI') AS arrival_time, to_char(job.departure_time, 'HH24:MI') AS departure_time
      FROM inspection_jobs job WHERE job.id = $1`, [withCoverFieldsJob.id])).rows[0],
      { service_call_number: "SC-7734", arrival_time: "09:15", departure_time: "11:45" },
      "finalServiceReport.ts's own SELECT shape reads the same values back"
    );

    // Omitted entirely: all three stay null, matching "no header field is mandatory".
    const withoutCoverFields = await retryThroughRoute(database, actor, {
      requestId: "51000000-0000-4000-8000-000000000011", customerId, siteId, systemKeys: ["portable_fire_extinguisher"]
    });
    assert.equal(withoutCoverFields.response.status, 201);
    const withoutCoverFieldsJob = (await withoutCoverFields.response.json() as { job: { id: string } }).job;
    assert.deepEqual((await database.query(`
      SELECT service_call_number AS "serviceCallNumber", arrival_time AS "arrivalTime", departure_time AS "departureTime"
      FROM inspection_jobs WHERE id = $1`, [withoutCoverFieldsJob.id])).rows[0],
      { serviceCallNumber: null, arrivalTime: null, departureTime: null }
    );

    // Malformed arrival time is rejected before any row is written.
    const malformed = await retryThroughRoute(database, actor, {
      requestId: "51000000-0000-4000-8000-000000000012", customerId, siteId, systemKeys: ["portable_fire_extinguisher"], arrivalTime: "24:99"
    });
    assert.equal(malformed.response.status, 400);
    assert.equal((await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM inspection_jobs WHERE creation_request_id = $1",
      ["51000000-0000-4000-8000-000000000012"]
    )).rows[0]?.count, "0", "a malformed cover field never reaches the database");
  } finally {
    await database.end();
  }
});
