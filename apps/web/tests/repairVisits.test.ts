import assert from "node:assert/strict";
import test from "node:test";
import { fingerprint as apiFingerprint } from "../../api/src/repairVisits/repairVisitWriteContract.js";
import { canonicalJson, malaysiaDay, requestFingerprint } from "../src/repairVisits/repairVisitCanon.js";
import {
  createReceiptConfirms, parseCatalogFields, parseCreateReceipt, parseCurrentCatalog, parseEventReceipt, parsePhotoReceipt, parsePreviousVisitList,
  parseVisitDetail, photoReceiptConfirms, RepairVisitContractError, submitReceiptConfirms
} from "../src/repairVisits/repairVisitParsers.js";
import {
  beforePhotoCacheKey, catalogCacheKey, groupCatalog, isEditable, isUnstarted, itemProblems, needsRepair, nextSubmitRevision, presentRepairVisit,
  submitReadiness, visitNumberText, RV_NUMBER_PLACEHOLDER
} from "../src/repairVisits/repairVisitPresentation.js";
import { latestReturnReason, reconcile } from "../src/repairVisits/repairVisitRefresh.js";
import type {
  LocalRepairVisit, LocalRepairVisitItem, LocalRepairVisitPhoto, RepairCatalogField, RepairVisit, RepairVisitCreateRequest, RepairVisitEvent,
  RepairVisitPhotoMetadata, RepairVisitSubmitBody
} from "../src/repairVisits/repairVisitTypes.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (c: string) => c.repeat(64);
const identity = (n: number, section = "tank", field = "valve") => ({ systemKey: "automatic_sprinkler" as const, rowUuid: uuid(n), locationId: null, zoneId: null, sectionKey: section, fieldKey: field });
const field = (n: number, result: "not_good" | "good" | "na" | "not_done" = "good", over: Partial<RepairCatalogField> = {}): RepairCatalogField => ({
  identity: identity(n, `sec${n % 2}`, `f${n}`), systemLabel: "Automatic Sprinkler", unitLabel: `Unit ${n % 3}`, sectionLabel: `Section ${n % 2}`, fieldLabel: `Field ${n}`,
  before: { previousVisit: { kind: result === "not_done" ? "repair" : "service", visitId: uuid(900) }, visitNumber: result === "not_done" ? "RV-20261011-3" : "SV-20261011-94", visitDate: "2026-10-11", result, remark: "x", photo: null },
  ...over
});

test("canonical JSON and fingerprint are byte-identical to the API's own fingerprint", async () => {
  const sample = { z: 1, a: [{ y: null, b: "é€" }, 3], nested: { k: false, j: undefined, i: { b: 2, a: 1 } }, actorId: 7 };
  assert.equal(await requestFingerprint(sample), apiFingerprint(sample));
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  const create: RepairVisitCreateRequest = { clientUuid: uuid(1), customerId: uuid(2), siteId: uuid(3), configurationRevisionId: uuid(4), deviceCreatedAt: null, visitDate: "2026-10-19",
    arrivalTime: "10:05", serviceCallNumber: null, previousVisit: { kind: "service", visitId: uuid(5) }, items: [{ clientUuid: uuid(6), identity: identity(7) }] };
  assert.equal(await requestFingerprint({ actorId: 9, ...create }), apiFingerprint({ actorId: 9, ...create }));
});

test("the visit day is the Malaysia calendar day of the instant, not the device zone", () => {
  assert.equal(malaysiaDay(new Date("2026-10-18T16:30:00.000Z")), "2026-10-19");
  assert.equal(malaysiaDay(new Date("2026-10-18T15:59:59.000Z")), "2026-10-18");
});

const local = (patch: Partial<LocalRepairVisit> = {}): LocalRepairVisit => ({
  clientUuid: uuid(1), visitNumber: null, customerId: uuid(2), siteId: uuid(3), createdByUserId: 5, configurationRevisionId: uuid(4), serviceCallNumber: null, arrivalTime: "10:05",
  visitDate: "2026-10-19", deviceCreatedAt: "2026-10-19T02:05:00.000Z", previousVisit: null, status: "draft", revision: 1, reportNumber: null, approvedByUserId: null, approvedAt: null,
  createdAt: "2026-10-19T02:05:00.000Z", updatedAt: "2026-10-19T02:05:00.000Z", syncStatus: "Pending", localCreatedAt: "", localUpdatedAt: "", origin: "device", createConfirmed: false, ...patch
});
const item = (patch: Partial<LocalRepairVisitItem> = {}): LocalRepairVisitItem => ({ clientUuid: uuid(10), visitUuid: uuid(1), identity: identity(1), systemLabel: "S", unitLabel: "U", sectionLabel: "Sec",
  fieldLabel: "F", before: null, outcome: null, remark: "", photoUuid: null, sortOrder: 0, ...patch });
const photo = (n = 20): LocalRepairVisitPhoto => ({ photoUuid: uuid(n), visitUuid: uuid(1), itemUuid: uuid(10), revision: 1, blob: new Blob(["x"]), sourceSha256: hash("a"), sizeBytes: 1, width: 1, height: 1,
  captureSource: "gallery", capturedAt: "2026-10-19T02:06:00.000Z", syncStatus: "Draft", localUpdatedAt: "" });

test("a card reads as Draft, Pending sync, Syncing, Needs attention, Awaiting approval, Returned or Approved and lands on the right tab", () => {
  assert.deepEqual(presentRepairVisit(local({ syncStatus: "Synced" })), { label: "Draft", tone: "draft", tab: "in-progress" });
  assert.equal(presentRepairVisit(local()).label, "Pending sync");
  assert.equal(presentRepairVisit(local({ syncStatus: "Syncing" })).label, "Syncing");
  const attention = presentRepairVisit(local({ syncStatus: "Conflict", lastSyncError: "Setup changed" }));
  assert.deepEqual([attention.label, attention.reason, attention.tab], ["Needs attention", "Setup changed", "in-progress"]);
  assert.equal(presentRepairVisit(local({ syncStatus: "Failed" })).reason, "The server did not confirm this repair visit.");
  assert.equal(presentRepairVisit(local({ status: "awaiting_approval", syncStatus: "Synced" })).label, "Awaiting approval");
  assert.equal(presentRepairVisit(local({ status: "returned", syncStatus: "Synced" })).label, "Returned");
  assert.deepEqual(presentRepairVisit(local({ status: "approved", syncStatus: "Synced" })), { label: "Approved", tone: "approved", tab: "completed" });
  // A returned visit resubmitted on this device is Pending sync until the server confirms, not Returned.
  assert.equal(presentRepairVisit(local({ status: "returned", syncStatus: "Pending" })).label, "Pending sync");
  assert.equal(visitNumberText(local()), RV_NUMBER_PLACEHOLDER);
  assert.equal(visitNumberText(local({ visitNumber: "RV-20261019-3" })), "RV-20261019-3");
});

test("only an unsubmitted draft or a returned visit created on this device can be edited", () => {
  assert.equal(isEditable(local()), true);
  assert.equal(isEditable(local({ status: "returned" })), true);
  assert.equal(isEditable(local({ status: "awaiting_approval" })), false);
  assert.equal(isEditable(local({ status: "approved" })), false);
  assert.equal(isEditable(local({ origin: "server" })), false);
  const frozen = { visit: local(), items: [], revision: 1 };
  assert.equal(isEditable(local({ frozen })), false);
  assert.equal(nextSubmitRevision({ status: "draft", revision: 1 }), 1);
  assert.equal(nextSubmitRevision({ status: "returned", revision: 1 }), 2);
  assert.equal(nextSubmitRevision({ status: "returned", revision: 4 }), 5);
});

test("a field is complete only with a result, a remark and its own photo; Submit needs every field complete", () => {
  assert.deepEqual(itemProblems(item(), undefined), ["outcome", "remark", "photo"]);
  assert.deepEqual(itemProblems(item({ outcome: "done_repair", remark: "  " }), undefined), ["remark", "photo"]);
  assert.deepEqual(itemProblems(item({ outcome: "not_done", remark: "No access", photoUuid: uuid(20) }), photo(21)), ["photo"], "a photo row for a different UUID does not count");
  assert.deepEqual(itemProblems(item({ outcome: "not_done", remark: "No access", photoUuid: uuid(20) }), photo(20)), []);
  const done = item({ outcome: "done_repair", remark: "Replaced", photoUuid: uuid(20) });
  assert.deepEqual(submitReadiness([done], new Map([[uuid(20), photo(20)]])), { ready: true, total: 1, incomplete: 0 });
  assert.deepEqual(submitReadiness([done, item({ clientUuid: uuid(11) })], new Map([[uuid(20), photo(20)]])), { ready: false, total: 2, incomplete: 1 });
  assert.equal(submitReadiness([], new Map()).ready, false, "at least one field");
  assert.equal(isUnstarted([item(), item()]), true);
  assert.equal(isUnstarted([item({ remark: "x" })]), false);
  assert.equal(isUnstarted([item({ photoUuid: uuid(20) })]), false);
});

test("the picker groups System -> Unit -> Section -> Field with Not Good / Not Done first", () => {
  const fields = [field(1, "not_good"), field(2, "good"), field(3, "not_done"), field(4, "na"), field(5, "good", { systemLabel: "Fire Alarm", identity: { ...identity(5, "z", "d"), systemKey: "fire_alarm_detector" } })];
  assert.deepEqual([needsRepair(fields[0]!), needsRepair(fields[1]!), needsRepair(fields[2]!)], [true, false, true]);
  const systems = groupCatalog(fields);
  assert.deepEqual(systems.map(system => system.label), ["Automatic Sprinkler", "Fire Alarm"]);
  const sprinkler = systems[0]!;
  const flat = sprinkler.units.flatMap(unit => unit.sections.flatMap(section => section.fields.map(entry => entry.fieldLabel)));
  assert.equal(new Set(flat).size, 4, "every field appears exactly once");
  const firstUnit = sprinkler.units[0]!;
  assert.ok(firstUnit.sections.some(section => section.fields.some(needsRepair)), "units holding something to repair come first");
  for (const unit of sprinkler.units) for (const section of unit.sections) {
    const marks = section.fields.map(needsRepair);
    assert.deepEqual(marks, [...marks].sort((a, b) => Number(b) - Number(a)), "within a section the badge fields lead");
  }
});

test("cache keys separate customer, site and previous visit; Before photos are keyed by visit and photo", () => {
  assert.equal(catalogCacheKey(uuid(2), uuid(3), null), `${uuid(2)}|${uuid(3)}|none|none`);
  assert.equal(catalogCacheKey(uuid(2), uuid(3), { kind: "repair", visitId: uuid(8) }), `${uuid(2)}|${uuid(3)}|repair|${uuid(8)}`);
  assert.notEqual(beforePhotoCacheKey({ kind: "service", visitId: uuid(8) }, uuid(9)), beforePhotoCacheKey({ kind: "repair", visitId: uuid(8) }, uuid(9)));
});

// ---- Parsers fail closed ----
test("server responses with unknown keys, bad enums or malformed values are rejected whole", () => {
  const visit = { kind: "service", visitId: uuid(5), visitNumber: "SV-20261011-94", visitDate: "2026-10-11", createdAt: "2026-10-11T03:00:00.000Z", createdByUserId: 5 };
  assert.equal(parsePreviousVisitList({ visits: [visit] }).length, 1);
  for (const broken of [{ ...visit, extra: 1 }, { ...visit, kind: "other" }, { ...visit, visitNumber: "RV-20261011-94" }, { ...visit, createdAt: "2026-10-11" }, { ...visit, visitId: "nope" }]) {
    assert.throws(() => parsePreviousVisitList({ visits: [broken] }), RepairVisitContractError);
  }
  assert.throws(() => parsePreviousVisitList({ visits: [], extra: true }), RepairVisitContractError);
  const fields = [field(1, "not_good")];
  assert.equal(parseCatalogFields(fields).length, 1);
  assert.throws(() => parseCatalogFields([{ ...fields[0], unknown: 1 }]), RepairVisitContractError);
  assert.throws(() => parseCatalogFields([{ ...fields[0], fieldLabel: "" }]), RepairVisitContractError);
  assert.throws(() => parseCatalogFields([{ ...fields[0], identity: { ...fields[0]!.identity, systemKey: "nope" } }]), RepairVisitContractError);
  assert.throws(() => parseCatalogFields([fields[0], fields[0]]), RepairVisitContractError, "the same field twice");
  assert.throws(() => parseCurrentCatalog({ configurationRevisionId: "x", fields }), RepairVisitContractError);
  assert.equal(parseCurrentCatalog({ configurationRevisionId: uuid(4), fields }).configurationRevisionId, uuid(4));
});

const visitJson = (patch: Partial<RepairVisit> = {}): RepairVisit => ({
  clientUuid: uuid(1), visitNumber: "RV-20261019-3", customerId: uuid(2), siteId: uuid(3), createdByUserId: 5, configurationRevisionId: uuid(4), serviceCallNumber: null, arrivalTime: "10:05",
  visitDate: "2026-10-19", deviceCreatedAt: "2026-10-19T02:05:00.000Z", previousVisit: null, status: "awaiting_approval", revision: 1, reportNumber: null, approvedByUserId: null, approvedAt: null,
  createdAt: "2026-10-19T02:05:00.000Z", updatedAt: "2026-10-19T02:06:00.000Z", ...patch
});
test("a repair visit read must belong to one visit and carry only known fields", () => {
  const items = [{ ...item({ outcome: "done_repair", remark: "ok", photoUuid: uuid(20), unitLabel: "Pump", systemLabel: "Sprinkler", sectionLabel: "Tank", fieldLabel: "Valve" }) }];
  assert.equal(parseVisitDetail({ visit: visitJson(), items, events: [] }).items.length, 1);
  assert.throws(() => parseVisitDetail({ visit: visitJson(), items: [{ ...items[0], visitUuid: uuid(99) }], events: [] }), RepairVisitContractError);
  assert.throws(() => parseVisitDetail({ visit: { ...visitJson(), extra: 1 }, items, events: [] }), RepairVisitContractError);
});

test("receipts confirm only the exact UUID, the values sent and the server's own fingerprint", async () => {
  const actor = 5;
  const request: RepairVisitCreateRequest = { clientUuid: uuid(1), customerId: uuid(2), siteId: uuid(3), configurationRevisionId: uuid(4), deviceCreatedAt: "2026-10-19T02:05:00.000Z",
    visitDate: "2026-10-19", arrivalTime: "10:05", serviceCallNumber: "SC-1", previousVisit: null, items: [{ clientUuid: uuid(10), identity: identity(1) }] };
  const receipt = parseCreateReceipt({ clientUuid: uuid(1), visitNumber: "RV-20261019-3", configurationRevisionId: uuid(4), deviceCreatedAt: request.deviceCreatedAt,
    visitDate: "2026-10-19", arrivalTime: "10:05", requestFingerprint: apiFingerprint({ actorId: actor, ...request }) });
  assert.equal(await createReceiptConfirms(receipt, request, actor), true);
  assert.equal(await createReceiptConfirms({ ...receipt, clientUuid: uuid(9) }, request, actor), false, "another visit's UUID");
  assert.equal(await createReceiptConfirms({ ...receipt, arrivalTime: "11:00" }, request, actor), false);
  assert.equal(await createReceiptConfirms({ ...receipt, requestFingerprint: hash("0") }, request, actor), false);
  assert.equal(await createReceiptConfirms(receipt, request, 6), false, "fingerprint covers the signed-in technician");
  // Online creation (deviceCreatedAt null): the server's own day and instant are accepted, the rest must still match.
  const online = { ...request, deviceCreatedAt: null };
  const onlineReceipt = { ...receipt, deviceCreatedAt: "2026-10-19T03:00:00.000Z", requestFingerprint: apiFingerprint({ actorId: actor, ...online }) };
  assert.equal(await createReceiptConfirms(onlineReceipt, online, actor), true);

  const metadata: RepairVisitPhotoMetadata = { photoUuid: uuid(20), itemUuid: uuid(10), revision: 1, sourceSha256: hash("a"), sizeBytes: 100, width: 10, height: 10, captureSource: "camera", capturedAt: "2026-10-19T02:06:00.000Z" };
  const photoReceipt = parsePhotoReceipt({ photoUuid: uuid(20), clientUuid: uuid(1), itemUuid: uuid(10), revision: 1, sourceSha256: hash("a"), storedSha256: hash("b"),
    requestFingerprint: apiFingerprint({ actorId: actor, clientUuid: uuid(1), ...metadata }) });
  assert.equal(await photoReceiptConfirms(photoReceipt, uuid(1), metadata, actor), true);
  assert.equal(await photoReceiptConfirms({ ...photoReceipt, photoUuid: uuid(21) }, uuid(1), metadata, actor), false);
  assert.equal(await photoReceiptConfirms(photoReceipt, uuid(2), metadata, actor), false, "another visit");
  assert.equal(await photoReceiptConfirms({ ...photoReceipt, sourceSha256: hash("c") }, uuid(1), metadata, actor), false);

  const body: RepairVisitSubmitBody = { operationUuid: uuid(30), expectedRevision: 1, revision: 1,
    items: [{ clientUuid: uuid(10), identity: identity(1), outcome: "done_repair", remark: "Replaced", photoUuid: uuid(20), sourceSha256: hash("a") }] };
  const event = parseEventReceipt({ operationUuid: uuid(30), clientUuid: uuid(1), revision: 1, event: "submitted", occurredAt: "2026-10-19T02:07:00.000Z",
    requestFingerprint: apiFingerprint({ action: "submit", actorId: actor, clientUuid: uuid(1), ...body }) });
  assert.equal(await submitReceiptConfirms(event, uuid(1), body, actor), true);
  assert.equal(await submitReceiptConfirms({ ...event, operationUuid: uuid(31) }, uuid(1), body, actor), false);
  assert.equal(await submitReceiptConfirms({ ...event, revision: 2 }, uuid(1), body, actor), false);
  assert.equal(await submitReceiptConfirms({ ...event, event: "returned" }, uuid(1), body, actor), false, "a Return event is never a submit confirmation");
  assert.throws(() => parseEventReceipt({ ...event, event: "other" }), RepairVisitContractError);
  assert.throws(() => parseCreateReceipt({ ...receipt, visitNumber: "RV-20260101-3" }), RepairVisitContractError, "RV number must carry the visit day");
});

// ---- Refresh reconciliation ----
const events = (...list: Array<[RepairVisitEvent["type"], string | null]>): RepairVisitEvent[] => list.map(([type, reason], index) => ({
  clientUuid: uuid(100 + index), visitUuid: uuid(1), revision: 1, type, actorUserId: 9, reason, occurredAt: "2026-10-19T03:00:00.000Z", requestFingerprint: hash("e")
}));
test("a refresh moves a synced visit to Returned (with the reason) or Approved, and never touches work in flight", () => {
  const synced = local({ status: "awaiting_approval", syncStatus: "Synced", createConfirmed: true, visitNumber: "RV-20261019-3" });
  assert.equal(reconcile(synced, visitJson(), undefined), undefined, "nothing changed on the server");
  const returned = reconcile(synced, visitJson({ status: "returned" }), events(["submitted", null], ["returned", "Photo is blurred"]));
  assert.equal(returned?.status, "returned");
  assert.equal(returned?.returnReason, "Photo is blurred");
  const approved = reconcile(synced, visitJson({ status: "approved", reportNumber: "MFE/RR/2026/0001", approvedByUserId: 9, approvedAt: "2026-10-19T04:00:00.000Z" }), undefined);
  assert.deepEqual([approved?.status, approved?.reportNumber, approved?.returnReason], ["approved", "MFE/RR/2026/0001", null]);
  assert.equal(latestReturnReason(events(["returned", "first"], ["resubmitted", null], ["returned", "second"])), "second");
  assert.equal(latestReturnReason(events(["submitted", null])), null);
  const frozen = { visit: synced, items: [], revision: 1 };
  assert.equal(reconcile({ ...synced, frozen }, visitJson({ status: "returned" }), undefined), undefined, "a submission in flight is settled by its own receipt");
  assert.equal(reconcile({ ...synced, syncStatus: "Pending" }, visitJson({ status: "returned" }), undefined), undefined);
  assert.equal(reconcile({ ...synced, createConfirmed: false }, visitJson({ status: "returned" }), undefined), undefined);
  assert.equal(reconcile(synced, visitJson({ status: "returned", createdByUserId: 99 }), undefined), undefined, "another technician's visit");
});
