import assert from "node:assert/strict";
import test from "node:test";
import { isLocalVisitReference, LOCAL_VISIT_REFERENCE, presentLocalVisit, refusalReason, withConfirmedReference } from "../src/jobs/offlineServiceVisitStore.js";
import { receiptConfirmsRequest } from "../src/jobs/offlineServiceVisitSync.js";
import { buildLocalVisitJob, buildOfflineVisitRequest, deviceDateString, OfflineVisitUnavailableError } from "../src/jobs/offlineServiceVisitLocal.js";
import type { LocalOfflineServiceVisit, OfflineServiceVisitCreateRequest } from "../src/jobs/offlineServiceVisitTypes.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const request: OfflineServiceVisitCreateRequest = {
  clientJobUuid: uuid(1), customerId: uuid(2), siteId: uuid(3), systemKeys: ["hose_reel"], configurationRevisionId: uuid(4), configurationRevision: 2,
  deviceCreatedAt: "2026-10-19T02:03:04.000Z", visitDate: "2026-10-19", arrivalTime: "10:03", serviceCallNumber: null
};
const configuration = (locations: number, key = "hose_reel") => ({
  customer: { id: uuid(2), code: "C", displayName: "Customer", isDemo: false },
  configuration: { configurationId: uuid(4), revision: 2, templateId: uuid(5), templateCode: "T", templateName: "Template", templateVersion: 7, selectionPolicy: "preset_only" as const,
    enabledSystems: [{ id: uuid(6), key, displayName: "System", sortOrder: 1, definitionStatus: "confirmed" as const,
      zones: [{ id: uuid(7), enabledSystemId: uuid(6), key: "z", displayName: "Z", sortOrder: 1 }],
      locations: Array.from({ length: locations }, (_, i) => ({ id: uuid(10 + i), enabledSystemId: uuid(6), zoneId: uuid(7), key: `l${i}`, displayName: `L${i}`, presetRowCount: 1, rowPreset: {}, sortOrder: i + 1 })) }] }
});
const input = (config = configuration(1), systemKeys = ["hose_reel"]) => ({ customer: config.customer, site: { id: uuid(3), customerId: uuid(2), code: "S", displayName: "Site" },
  configuration: config, systemKeys, serviceCallNumber: "  ", arrivalTime: "10:03", now: new Date("2026-10-19T02:03:04.000Z"), clientJobUuid: uuid(1) });
const visit = (patch: Partial<LocalOfflineServiceVisit>): LocalOfflineServiceVisit => ({ clientJobUuid: uuid(1), createdByUserId: 1, request,
  job: buildLocalVisitJob(input(), request), syncStatus: "Pending", localCreatedAt: "", localUpdatedAt: "", ...patch });

test("the placeholder is the owner's wording and is recognised exactly", () => {
  assert.equal(LOCAL_VISIT_REFERENCE, "SV number given when synced");
  assert.equal(isLocalVisitReference(LOCAL_VISIT_REFERENCE), true);
  assert.equal(isLocalVisitReference("SV-20261019-3"), false);
});

test("a receipt confirms only the exact UUID and values that were sent", () => {
  const receipt = { clientJobUuid: request.clientJobUuid, jobId: request.clientJobUuid, visitNumber: "SV-20261019-3", configurationRevisionId: request.configurationRevisionId,
    deviceCreatedAt: request.deviceCreatedAt, visitDate: request.visitDate, arrivalTime: request.arrivalTime, idempotent: false };
  assert.equal(receiptConfirmsRequest(receipt, request), true);
  assert.equal(receiptConfirmsRequest({ ...receipt, clientJobUuid: uuid(9), jobId: uuid(9) }, request), false);
  assert.equal(receiptConfirmsRequest({ ...receipt, jobId: uuid(9) }, request), false);
  assert.equal(receiptConfirmsRequest({ ...receipt, configurationRevisionId: uuid(9) }, request), false);
  assert.equal(receiptConfirmsRequest({ ...receipt, arrivalTime: "11:00" }, request), false);
});

test("statuses map to the card wording; refusals read as Needs attention with a reason", () => {
  assert.deepEqual(presentLocalVisit(visit({})), { label: "Pending sync", tone: "pending", reason: undefined });
  assert.equal(presentLocalVisit(visit({ syncStatus: "Syncing" })).label, "Syncing");
  const failed = presentLocalVisit(visit({ syncStatus: "Failed", lastSyncError: refusalReason("SITE_INACTIVE", "x") }));
  assert.equal(failed.label, "Needs attention");
  assert.match(failed.reason ?? "", /no longer active/);
  assert.equal(presentLocalVisit(visit({ syncStatus: "Conflict" })).label, "Needs attention");
  assert.match(refusalReason("SOMETHING_NEW", "Server said no"), /Server said no/);
  assert.match(refusalReason(undefined, undefined), /refused/);
});

test("a confirmed receipt replaces the placeholder in a stale cached job, and only the placeholder", () => {
  const job = buildLocalVisitJob(input(), request);
  const synced = visit({ syncStatus: "Synced", receipt: { clientJobUuid: request.clientJobUuid, jobId: request.clientJobUuid, visitNumber: "SV-20261019-3", configurationRevisionId: request.configurationRevisionId,
    deviceCreatedAt: request.deviceCreatedAt, visitDate: request.visitDate, arrivalTime: request.arrivalTime, idempotent: false } });
  assert.equal(withConfirmedReference(job, synced).reference, "SV-20261019-3");
  assert.equal(withConfirmedReference({ ...job, reference: "SV-20261019-9" }, synced).reference, "SV-20261019-9");
  assert.equal(withConfirmedReference(job, visit({})).reference, LOCAL_VISIT_REFERENCE);
});

test("the request carries the device date, time and configuration revision; a blank call number is null", () => {
  const built = buildOfflineVisitRequest(input());
  assert.deepEqual(built, { ...request, serviceCallNumber: null });
  assert.equal(deviceDateString(new Date(2026, 9, 9)), "2026-10-09");
});

test("the local job has the server's shape: ids from the downloaded setup, a placeholder reference, open status", () => {
  const job = buildLocalVisitJob(input(), request);
  assert.equal(job.id, request.clientJobUuid);
  assert.equal(job.status, "open");
  assert.equal(job.reference, LOCAL_VISIT_REFERENCE);
  assert.equal(job.configurationSnapshot.configuration.revisionId, uuid(4));
  assert.equal(job.configurationSnapshot.enabledSystems[0]!.enabledSystemId, uuid(6));
  assert.equal(job.configurationSnapshot.enabledSystems[0]!.locations[0]!.id, uuid(10));
  assert.equal(job.site?.id, uuid(3));
});

test("a system missing from the downloaded setup, or a suppression system without locations, fails closed", () => {
  assert.throws(() => buildLocalVisitJob(input(configuration(1), ["hydrant"]), request), OfflineVisitUnavailableError);
  assert.throws(() => buildLocalVisitJob(input(configuration(0, "co2_fire_extinguisher"), ["co2_fire_extinguisher"]), request), /connected to the server/);
  assert.doesNotThrow(() => buildLocalVisitJob(input(configuration(0, "hose_reel"), ["hose_reel"]), request));
});
