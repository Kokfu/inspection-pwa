import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import express from "express";
import * as c from "./repairVisitContract.js";
import * as s from "../jobs/offlineServiceVisitContract.js";
import { repairVisitReadsRouter } from "../routes/repairVisitReads.js";
import { repairVisitWritesRouter } from "../routes/repairVisitWrites.js";

const uuid = "10000000-0000-4000-8000-000000000001", other = "20000000-0000-4000-8000-000000000002";
const timestamp = "2026-10-19T03:00:00.000Z", hash = "a".repeat(64);
const previous = { kind: "service", visitId: other };
const identity = { systemKey: "hydrant", rowUuid: uuid, locationId: null, zoneId: null, sectionKey: "hydrant_set", fieldKey: "landing_valve" };
const photo = { photoUuid: uuid, sourceSha256: hash, storedSha256: hash, sizeBytes: 100, width: 1, height: 1 };
const before = { previousVisit: previous, visitNumber: "SV-20261018-1", visitDate: "2026-10-18", result: "not_good", remark: "Leaking", photo };
const item = { clientUuid: uuid, visitUuid: other, identity, systemLabel: "Hydrant", unitLabel: "Unit 1", sectionLabel: "Hydrant set", fieldLabel: "Landing valve", before, outcome: "done_repair", remark: "Replaced", photoUuid: uuid, sortOrder: 0 };
const visit = { clientUuid: uuid, visitNumber: "RV-20261019-1", customerId: uuid, siteId: uuid, createdByUserId: 1, configurationRevisionId: uuid,
  serviceCallNumber: null, arrivalTime: "11:00", visitDate: "2026-10-19", deviceCreatedAt: timestamp, previousVisit: previous, status: "draft", revision: 1,
  reportNumber: null, approvedByUserId: null, approvedAt: null, createdAt: timestamp, updatedAt: timestamp };
const event = { clientUuid: uuid, visitUuid: other, revision: 1, type: "returned", actorUserId: 1, reason: "Please revise", occurredAt: timestamp, requestFingerprint: hash };
const request = { clientJobUuid: uuid, customerId: uuid, siteId: uuid, systemKeys: ["hydrant"], configurationRevisionId: uuid, configurationRevision: 1,
  deviceCreatedAt: timestamp, visitDate: "2026-10-19", arrivalTime: "11:00", serviceCallNumber: null };
const response = { clientJobUuid: uuid, jobId: uuid, visitNumber: "SV-20261019-1", configurationRevisionId: uuid, deviceCreatedAt: timestamp, visitDate: "2026-10-19", arrivalTime: "11:00", idempotent: false };

const samples: Array<[string, Record<string, unknown>, (v: unknown) => boolean]> = [
  ["previous", previous, c.isRepairVisitPrevious], ["identity", identity, c.isRepairVisitFieldIdentity], ["photo", photo, c.isRepairVisitPhoto],
  ["Before", before, c.isRepairVisitBeforeSnapshot], ["item", item, c.isRepairVisitItem], ["visit", visit, c.isRepairVisit],
  ["event", event, c.isRepairVisitEvent], ["offline request", request, s.isOfflineServiceVisitCreateRequest], ["offline response", response, s.isOfflineServiceVisitCreateResponse]
];
for (const [name, sample, validator] of samples) test(`${name}: valid accepted; unknown/missing keys and bad primitives rejected`, () => {
  assert.equal(validator(sample), true);
  assert.equal(validator({ ...sample, injected: true }), false);
  for (const key of Object.keys(sample)) {
    const missing = { ...sample }; delete missing[key]; assert.equal(validator(missing), false, `${key}: missing`);
    assert.equal(validator({ ...sample, [key]: {} }), false, `${key}: object`);
    assert.equal(validator({ ...sample, [key]: undefined }), false, `${key}: undefined`);
  }
  for (const bad of [null, [], "", 1, true]) assert.equal(validator(bad), false);
});
test("reject nested unknown keys, bad enums, UUIDs, dates, timestamps and non-confirming receipts", () => {
  for (const value of ["junk", "2026-02-30T00:00:00.000Z", "0000-01-01T00:00:00.000Z", "2026-10-19T24:00:00.000Z", "2026-10-19T03:00:00Z"]) {
    assert.equal(c.isRepairVisit({ ...visit, deviceCreatedAt: value }), false);
    assert.equal(c.isRepairVisitEvent({ ...event, occurredAt: value }), false);
    assert.equal(s.isOfflineServiceVisitCreateRequest({ ...request, deviceCreatedAt: value }), false);
    assert.equal(s.isOfflineServiceVisitCreateResponse({ ...response, deviceCreatedAt: value }), false);
  }
  assert.equal(c.isRepairVisitItem({ ...item, identity: { ...identity, extra: 1 } }), false);
  assert.equal(c.isRepairVisitItem({ ...item, before: { ...before, photo: { ...photo, extra: 1 } } }), false);
  assert.equal(c.isRepairVisitFieldIdentity({ ...identity, rowUuid: null }), true);
  assert.equal(c.isRepairVisitFieldIdentity({ ...identity, rowUuid: "bad" }), false);
  assert.equal(c.isRepairVisitFieldIdentity({ ...identity, rowUuid: null, locationId: uuid, zoneId: other }), true);
  assert.equal(c.isRepairVisit({ ...visit, status: "completed" }), false);
  assert.equal(c.isRepairVisitItem({ ...item, outcome: "complete_repair" }), false);
  assert.equal(c.isRepairVisitEvent({ ...event, type: "deleted" }), false);
  assert.equal(c.isRepairVisitEvent({ ...event, reason: null }), false);
  assert.equal(c.isRepairVisitBeforeSnapshot({ ...before, result: "poor" }), false);
  assert.equal(c.isRepairVisitBeforeSnapshot({ ...before, result: "not_done" }), false);
  assert.equal(c.isRepairVisitBeforeSnapshot({ ...before, previousVisit: { kind: "repair", visitId: other }, visitNumber: "RV-20261018-1", result: "not_done" }), true);
  assert.equal(c.isRepairVisit({ ...visit, status: "approved" }), false);
  assert.equal(c.isRepairVisit({ ...visit, status: "approved", reportNumber: "MFE/RR/2026/0001", approvedAt: timestamp, approvedByUserId: 2 }), true);
  assert.equal(c.isRepairVisit({ ...visit, clientUuid: "bad" }), false);
  assert.equal(c.isRepairVisit({ ...visit, visitDate: "2026-02-30" }), false);
  assert.equal(s.isOfflineServiceVisitCreateRequest({ ...request, clientJobUuid: "bad" }), false);
  assert.equal(s.isOfflineServiceVisitCreateRequest({ ...request, systemKeys: ["unknown"] }), false);
  assert.equal(s.isOfflineServiceVisitCreateRequest({ ...request, systemKeys: ["hydrant", "hydrant"] }), false);
  assert.equal(s.isOfflineServiceVisitCreateRequest({ ...request, systemKeys: ["portable_fire_extinguisher"] }), true);
  assert.equal(s.isOfflineServiceVisitCreateResponse({ ...response, jobId: other }), false);
  assert.equal(s.isOfflineServiceVisitCreateResponse({ ...response, visitNumber: "SV-20261018-1" }), false);
  assert.throws(() => c.parseRepairVisit({ ...visit, injected: true }));
  assert.throws(() => s.parseOfflineServiceVisitCreateRequest({ ...request, injected: true }));
  assert.throws(() => s.parseOfflineServiceVisitCreateResponse({ ...response, jobId: other }));
});
test("API/web portable validators remain identical", async () => {
  const api = await readFile(new URL("./repairVisitContract.ts", import.meta.url), "utf8");
  const web = await readFile(new URL("../../../web/src/repairVisits/repairVisitTypes.ts", import.meta.url), "utf8");
  assert.equal(web.split("// Local persistence envelopes")[0].trim(), api.trim());
  const offlineApi = await readFile(new URL("../jobs/offlineServiceVisitContract.ts", import.meta.url), "utf8");
  const offlineWeb = await readFile(new URL("../../../web/src/jobs/offlineServiceVisitTypes.ts", import.meta.url), "utf8");
  assert.equal(offlineWeb.split("export type LocalOfflineServiceVisit")[0].trim(), offlineApi.replace("../repairVisits/repairVisitContract.js", "../repairVisits/repairVisitTypes").trim());
});
test("registered routers: unauthenticated callers are refused and unrelated routes untouched", async () => {
  const app = express();
  app.use((req, _res, next) => { if (req.header("x-test-auth")) req.currentUser = { id: 1, username: "test", role: "inspector" }; next(); });
  app.use(repairVisitReadsRouter, repairVisitWritesRouter);
  app.get("/other", (_req, res) => { res.sendStatus(204); });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) for (const path of ["/repair-visits", "/repair-visits/example"]) {
      // The 1A placeholders became real routes (2B/3A); their behaviour is covered by the integration tests.
      // What stays true here: every repair visit route refuses an unauthenticated caller.
      assert.equal((await fetch(base + path, { method })).status, 401);
    }
    assert.equal((await fetch(base + "/other")).status, 204);
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});
