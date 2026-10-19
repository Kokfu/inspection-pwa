import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { pool } from "../db/pool.js";
import { requireRole } from "../middleware/requireRole.js";
import { createServiceVisitHandler } from "../routes/inspectionJobs.js";
import { syncRouter } from "../routes/sync.js";
import { stagedEvidenceRouter } from "../routes/stagedEvidence.js";
import { isOfflineServiceVisitCreateResponse, type OfflineServiceVisitCreateRequest } from "./offlineServiceVisitContract.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;

test("offline service visits: authoritative creation, receipts, refusals, races and dependent sync", { skip: !databaseUrl }, async t => {
  const url = new URL(databaseUrl!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/phase6_seed_integration");
  assert.equal(process.env.NODE_ENV, "test"); assert.equal(process.env.DATABASE_URL, databaseUrl);
  const database = new pg.Pool({ connectionString: databaseUrl });
  const lock = await database.connect();
  await lock.query("SELECT pg_advisory_lock(819276)");
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(database);
    const users = (await database.query<{ id: number }>(`INSERT INTO users(username,password_hash,role)
      VALUES ('offline-a','unused','inspector'),('offline-b','unused','inspector') RETURNING id`)).rows;
    const actor = Number(users[0]!.id), foreign = Number(users[1]!.id);
    const customerId = randomUUID(), siteId = randomUUID(), revisionId = randomUUID();
    const templateId = (await database.query<{ id: string }>("SELECT id FROM master_service_report_templates WHERE version=7")).rows[0]!.id;
    await database.query("INSERT INTO customers(id,customer_code,display_name) VALUES($1,'OFFLINE-2A','Offline Customer')", [customerId]);
    await database.query("INSERT INTO customer_sites(id,customer_id,site_code,display_name) VALUES($1,$2,'OFFLINE-SITE','Server Site')", [siteId, customerId]);
    await database.query(`INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status)
      VALUES($1,$2,$3,1,'active')`, [revisionId, customerId, templateId]);
    await database.query(`INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order)
      VALUES($1,$2,$3,'hose_reel',1)`, [randomUUID(), revisionId, templateId]);
    const app = express(); app.use(express.json());
    app.use((request, _response, next) => {
      const who = request.header("x-test-actor");
      if (who !== "none") request.currentUser = { id: who === "foreign" ? foreign : actor, username: "offline", role: "inspector" };
      next();
    });
    app.post("/inspection-jobs/service-visits", requireRole("admin", "inspector"),
      createServiceVisitHandler({ database, writeAudit: async () => undefined }));
    app.use(syncRouter); app.use(stagedEvidenceRouter);
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    const post = (body: unknown, who = "owner", route = "/inspection-jobs/service-visits") => fetch(`${origin}${route}`, {
      method: "POST", headers: { "content-type": "application/json", "x-test-actor": who }, body: JSON.stringify(body)
    });
    const sample = (): OfflineServiceVisitCreateRequest => ({ clientJobUuid: randomUUID(), customerId, siteId,
      systemKeys: ["hose_reel"], configurationRevisionId: revisionId, configurationRevision: 1,
      deviceCreatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      visitDate: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10), arrivalTime: "09:25", serviceCallNumber: "SC-2A" });
    const count = async (uuid: string) => Number((await database.query<{ n: string }>("SELECT count(*) AS n FROM inspection_jobs WHERE id=$1", [uuid])).rows[0]!.n);
    const refusal = async (input: unknown, code: string, status: number) => {
      const response = await post(input); assert.equal(response.status, status);
      const body = await response.json() as { error: string; message: string };
      assert.equal(body.error, code); assert.equal(typeof body.message, "string");
      assert.deepEqual(Object.keys(body).sort(), ["error", "message"]);
    };
    try {
      await t.test("exact UUID and visit-date number; server-built snapshot; exact retry and altered-content refusal", async () => {
        const input = sample(); const response = await post(input); assert.equal(response.status, 201);
        const receipt: unknown = await response.json(); assert.ok(isOfflineServiceVisitCreateResponse(receipt));
        assert.equal(receipt.jobId, input.clientJobUuid); assert.equal(receipt.idempotent, false);
        const row = (await database.query(`SELECT configuration_snapshot AS snapshot, created_on_device_at AS device,
          service_date::text AS date, to_char(service_time,'HH24:MI') AS time,
          creation_request_id AS request FROM inspection_jobs WHERE id=$1`, [input.clientJobUuid])).rows[0];
        assert.equal(row.snapshot.site.displayName, "Server Site"); assert.equal(row.snapshot.template.version, 7);
        assert.equal(row.device.toISOString(), input.deviceCreatedAt); assert.equal(row.date, input.visitDate);
        assert.equal(row.time, input.arrivalTime); assert.equal(row.request, input.clientJobUuid);
        const retry = await post(input); assert.equal(retry.status, 200);
        assert.deepEqual(await retry.json(), { ...receipt, idempotent: true });
        for (const changed of [ { customerId: randomUUID() }, { siteId: randomUUID() }, { systemKeys: ["hydrant"] },
          { configurationRevision: 2 }, { configurationRevisionId: randomUUID() }, { arrivalTime: "10:15" },
          { serviceCallNumber: null }, { deviceCreatedAt: new Date(Date.now()).toISOString() },
          { visitDate: new Date().toISOString().slice(0, 10) } ]) {
          await refusal({ ...input, ...changed }, "IDEMPOTENCY_MISMATCH", 409);
        }
        const other = await post(input, "foreign"); assert.equal(other.status, 404);
        assert.equal((await other.json()).error, "JOB_NOT_FOUND"); assert.equal(await count(input.clientJobUuid), 1);
        // A replay must acknowledge the original even when current setup is no longer usable.
        await database.query("UPDATE customers SET is_active=false WHERE id=$1", [customerId]);
        assert.equal((await post(input)).status, 200);
        await database.query("UPDATE customers SET is_active=true WHERE id=$1", [customerId]);
      });
      await t.test("service call number report limit is enforced before persistence and rejection keeps UUID retryable", async () => {
        const input = { ...sample(), serviceCallNumber: "X".repeat(80) };
        assert.equal((await post(input)).status, 201);
        assert.equal((await post(input)).status, 200);
        const stored = await database.query("SELECT service_call_number FROM inspection_jobs WHERE id=$1", [input.clientJobUuid]);
        assert.equal(stored.rows[0].service_call_number, input.serviceCallNumber);
        for (const length of [81, 100]) {
          const rejected = { ...sample(), serviceCallNumber: "X".repeat(length) };
          await refusal(rejected, "INVALID_OFFLINE_SERVICE_VISIT_REQUEST", 400);
          assert.equal(await count(rejected.clientJobUuid), 0);
          assert.equal((await post({ ...rejected, serviceCallNumber: "SC-corrected" })).status, 201);
        }
      });
      await t.test("authentication and strict 1A validation", async () => {
        assert.equal((await post(sample(), "none")).status, 401);
        const stale = sample();
        const staleResponse = await fetch(`${origin}/inspection-jobs/service-visits`, { method: "POST",
          headers: { "content-type": "application/json", "x-expected-user-id": String(foreign) }, body: JSON.stringify(stale) });
        assert.equal(staleResponse.status, 409); assert.equal((await staleResponse.json()).error, "IDENTITY_MISMATCH");
        assert.equal(await count(stale.clientJobUuid), 0);
        for (const input of [{ ...sample(), extra: true }, { ...sample(), configurationRevision: "1" },
          { ...sample(), clientJobUuid: "bad" }, { ...sample(), deviceCreatedAt: "2026-02-30T00:00:00.000Z" },
          { ...sample(), systemKeys: ["unknown"] }]) await refusal(input, "INVALID_OFFLINE_SERVICE_VISIT_REQUEST", 400);
      });
      await t.test("inactive/missing customer or site, stale revision and changed systems refuse without writes", async () => {
        await database.query("UPDATE customers SET is_active=false WHERE id=$1", [customerId]);
        await refusal(sample(), "CUSTOMER_INACTIVE", 409);
        await database.query("UPDATE customers SET is_active=true WHERE id=$1", [customerId]);
        await database.query("UPDATE customer_sites SET is_active=false WHERE id=$1", [siteId]);
        await refusal(sample(), "SITE_INACTIVE", 409);
        await database.query("UPDATE customer_sites SET is_active=true WHERE id=$1", [siteId]);
        for (const [change, code, status] of [
          [{ customerId: randomUUID() }, "CUSTOMER_NOT_FOUND", 404], [{ siteId: randomUUID() }, "SITE_NOT_FOUND", 404],
          [{ configurationRevisionId: randomUUID() }, "CONFIGURATION_CHANGED", 409],
          [{ configurationRevision: 2 }, "CONFIGURATION_CHANGED", 409], [{ systemKeys: ["hydrant"] }, "CONFIGURATION_CHANGED", 409]
        ] as const) { const input = { ...sample(), ...change }; await refusal(input, code, status); assert.equal(await count(input.clientJobUuid), 0); }
      });
      await t.test("device timestamp and visit date limits; failure leaves UUID retryable", async () => {
        const input = sample();
        for (const days of [3, -32]) {
          const timestamp = new Date(Date.now() + days * 86_400_000).toISOString();
          const code = days > 0 ? "DEVICE_DATE_IN_FUTURE" : "DEVICE_DATE_TOO_OLD";
          await refusal({ ...input, deviceCreatedAt: timestamp }, code, 422);
          await refusal({ ...input, visitDate: timestamp.slice(0, 10) }, code, 422);
          assert.equal(await count(input.clientJobUuid), 0);
        }
        assert.equal((await post(input)).status, 201);
        for (const milliseconds of [86_400_000 - 60_000, -30 * 86_400_000 + 60_000]) {
          const timestamp = new Date(Date.now() + milliseconds).toISOString();
          const visitDate = new Date(Date.parse(timestamp) + 8 * 3_600_000).toISOString().slice(0, 10);
          assert.equal((await post({ ...sample(), deviceCreatedAt: timestamp, visitDate })).status, 201,
            "dates inside the one-day / thirty-day bounds remain usable");
        }
      });
      await t.test("concurrent duplicate creates have one job; changed concurrent payload conflicts", async () => {
        const input = sample(); const responses = await Promise.all(Array.from({ length: 5 }, () => post(input)));
        assert.deepEqual(responses.map(r => r.status).sort(), [200, 200, 200, 200, 201]);
        const receipts = await Promise.all(responses.map(r => r.json()));
        assert.equal(new Set(receipts.map(r => r.visitNumber)).size, 1); assert.equal(await count(input.clientJobUuid), 1);
        const race = sample(); const outcomes = await Promise.all([post(race), post({ ...race, arrivalTime: "11:20" })]);
        assert.deepEqual(outcomes.map(r => r.status).sort(), [201, 409]); assert.equal(await count(race.clientJobUuid), 1);
      });
      await t.test("form-instance and single-system sync wait for missing visit; foreign visit remains refused", async () => {
        const jobId = randomUUID();
        for (const entityType of ["masterSystemFormInstance", "masterSystemInspection"]) {
          const entityId = randomUUID();
          const response = await post({ items: [{ entityId, entityType, payload: { clientUuid: entityId, jobId } }] }, "owner", "/sync");
          assert.equal(response.status, 200);
          assert.deepEqual(await response.json(), { acceptedIds: [], duplicateIds: [], failed: [{ id: entityId,
            code: "VISIT_NOT_YET_CREATED", message: "Create and confirm this visit before syncing its forms or photos." }] });
        }
        const waitingId = randomUUID(), readyId = randomUUID();
        const mixed = await post({ items: [
          { entityId: waitingId, entityType: "masterSystemFormInstance", payload: { clientUuid: waitingId, jobId } },
          { operationId: randomUUID(), entityId: readyId, entityType: "testRecord", action: "create",
            payload: { clientUuid: readyId, title: "Independent sync item", notes: "", createdAt: new Date().toISOString() } }
        ] }, "owner", "/sync");
        const mixedResult = await mixed.json();
        assert.deepEqual(mixedResult.acceptedIds, [readyId]);
        assert.deepEqual(mixedResult.duplicateIds, []);
        assert.equal(mixedResult.failed.length, 1); assert.equal(mixedResult.failed[0].id, waitingId);
        assert.equal(mixedResult.failed[0].code, "VISIT_NOT_YET_CREATED");
        const input = sample(); await post(input);
        const response = await post({ items: [{ entityId: randomUUID(), entityType: "masterSystemFormInstance",
          payload: { clientUuid: randomUUID(), jobId: input.clientJobUuid } }] }, "foreign", "/sync");
        assert.equal(response.status, 404); assert.deepEqual(await response.json(), { error: "JOB_NOT_FOUND" });
      });
      await t.test("V7 photo staging waits for missing visit and still refuses foreign technicians", async () => {
        const stage = async (jobId: string, who = "owner") => {
          const form = new FormData(); form.set("jobId", jobId); form.set("photoUuid", randomUUID());
          form.set("file", new Blob([new Uint8Array([1, 2, 3])]), "photo.jpg");
          return fetch(`${origin}/v7-evidence/stage`, { method: "POST", headers: { "x-test-actor": who }, body: form });
        };
        const missing = await stage(randomUUID()); assert.equal(missing.status, 409);
        assert.deepEqual(await missing.json(), { error: "VISIT_NOT_YET_CREATED" });
        const input = sample(); await post(input);
        assert.equal((await stage(input.clientJobUuid, "foreign")).status, 404);
        assert.equal((await stage(randomUUID(), "none")).status, 401);
        assert.equal((await database.query("SELECT count(*) AS n FROM staged_inspection_evidence")).rows[0].n, "0");
      });
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  } finally {
    await lock.query("SELECT pg_advisory_unlock(819276)"); lock.release(); await database.end(); await pool.end();
  }
});
