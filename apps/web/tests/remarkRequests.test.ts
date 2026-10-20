import assert from "node:assert/strict";
import test from "node:test";
import {
  approvedChoicesForSection, isApprovedSectionRemark, isRemarkRequest, isRequestableSection, parseApprovedSectionRemarks, parseLocalRemarkRequests,
  parseRemarkRequestConfirmation, parseRemarkRequestOutboxPayload, parseRemarkRequests, RemarkRequestNotConfirmedError,
  type ApprovedSectionRemark, type LocalRemarkRequest, type RemarkRequest
} from "../src/inspectionControls/remarkRequests";
import { requestableSectionKeys, sectionDisplayLabel } from "../src/inspectionControls/remarkSectionLabels";
import { isManagerRole, reviewerRoleLabel, supervisorAllowsRoute } from "../src/manager/roleAccess";

/** R3 device-side rules that need no IndexedDB: strict shapes, whole-list rejection, exact-UUID confirmation, labels and access. */
const id = (n: number) => `33000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const customer = id(900);
const sectionSaj = "checklist.waterTank.saj_main_water_supply";
const sectionLevel = "checklist.waterTank.water_level";
const at = "2026-10-20T08:00:00.000Z";

const pending = (n: number, wording = "Gate valve is leaking", sectionKey = sectionSaj): RemarkRequest => ({
  id: id(n), systemKey: "automatic_sprinkler", sectionKey, wording, customerId: customer, customerDisplayName: "Sprinkler Customer",
  jobId: id(800), jobReference: "SV-1", requestedByUserId: 7, requestedBy: "Technician One", createdAt: at, status: "pending", decision: null
});
const decided = (n: number, kind: "approved" | "rejected", extra: Partial<NonNullable<RemarkRequest["decision"]>> = {}): RemarkRequest => ({
  ...pending(n), status: kind,
  decision: { id: id(n + 100), decision: kind, reviewerUserId: 4, reviewer: "Reviewer", reviewerRole: "admin", note: kind === "rejected" ? "Not needed here" : null, approvedWording: kind === "approved" ? "Gate valve is leaking" : null, createdAt: at, ...extra }
});
const approved = (n: number, wording: string, sectionKey = sectionSaj, active = true): ApprovedSectionRemark =>
  ({ id: id(n), systemKey: "automatic_sprinkler", sectionKey, wording, active, sourceRequestId: id(n + 500) });
const local = (n: number, extra: Partial<LocalRemarkRequest> = {}): LocalRemarkRequest =>
  ({ id: id(n), customerId: customer, systemKey: "automatic_sprinkler", sectionKey: sectionSaj, wording: "Gate valve is leaking", createdAt: at, ...extra });

test("only checklist and measurement rows can be requested; the Comments box and the plain-text services cannot", () => {
  assert.equal(isRequestableSection("automatic_sprinkler", sectionSaj), true);
  assert.equal(isRequestableSection("automatic_sprinkler", "measurements.jockey_pump_pressure"), true);
  assert.equal(isRequestableSection("automatic_sprinkler", "comments"), false);
  assert.equal(isRequestableSection("automatic_sprinkler", "checklist.waterTank.nope"), false);
  // R4: Hose Reel has a Water Tank > S.A.J row of its own; its Comments box and a Sprinkler-only row are not requestable.
  assert.equal(isRequestableSection("hose_reel", sectionSaj), true);
  assert.equal(isRequestableSection("hose_reel", "comments"), false);
  assert.equal(isRequestableSection("hose_reel", "measurements.duty_pump_cut_in"), false);
  assert.equal(isRequestableSection("fm200_fire_suppression", "physicalOutlook.pilot_cylinder"), true);
  assert.equal(isRequestableSection("hydrant", sectionSaj), false);
  for (const plainText of ["wet_chemical", "dry_wet_riser", "smoke_ventilation", "fire_intercom", "fire_rated_roller_shutter"]) {
    assert.equal(isRequestableSection(plainText, sectionSaj), false, plainText);
    assert.equal(isRequestableSection(plainText, "comments"), false, plainText);
  }
});

test("isRemarkRequest is strict: exact keys, normalised text and a decision that matches its status", () => {
  for (const good of [pending(1), decided(2, "approved"), decided(3, "rejected"), decided(4, "approved", { approvedWording: "Gate valve leaks" }), { ...pending(5), jobId: null, jobReference: null }]) {
    assert.equal(isRemarkRequest(good), true, JSON.stringify(good));
  }
  for (const bad of [
    { ...pending(1), extra: true }, { ...pending(1), id: "nope" }, { ...pending(1), systemKey: "smoke_ventilation" }, pending(1, "Gate valve", "comments"),
    pending(1, "  padded  "), pending(1, "ab"), { ...pending(1), status: "withdrawn" }, { ...pending(1), createdAt: "yesterday" },
    { ...pending(1), decision: decided(1, "approved").decision },
    { ...decided(1, "approved"), decision: null },
    { ...decided(1, "approved"), decision: { ...decided(1, "rejected").decision } },
    decided(1, "rejected", { note: null }), decided(1, "rejected", { note: "   " }), decided(1, "rejected", { approvedWording: "Gate valve is leaking" }),
    decided(1, "approved", { approvedWording: " padded " }), decided(1, "approved", { reviewerRole: "inspector" as unknown as "admin" }),
    { ...decided(1, "approved"), decision: { ...decided(1, "approved").decision, extra: 1 } },
    { ...pending(1), requestedByUserId: 0 }, { ...pending(1), customerDisplayName: "" }, null, [], "text", 7
  ]) assert.equal(isRemarkRequest(bad), false, JSON.stringify(bad));
});

test("parseRemarkRequests rejects the WHOLE list on any malformed element or repeated id", () => {
  const good = [pending(1), decided(2, "approved"), decided(3, "rejected")];
  assert.deepEqual(parseRemarkRequests(good), good);
  assert.throws(() => parseRemarkRequests([...good, { ...pending(4), extra: true }]), /malformed/);
  assert.throws(() => parseRemarkRequests([...good, pending(1, "Another wording")]), /malformed/);
  assert.throws(() => parseRemarkRequests([...good, { ...pending(4), id: id(2).toUpperCase() }]), /malformed/);
  assert.throws(() => parseRemarkRequests({ requests: good }), /malformed/);
  assert.throws(() => parseRemarkRequests("nope"), /malformed/);
  assert.throws(() => parseRemarkRequests(Array.from({ length: 2001 }, (_, index) => pending(index + 1000))), /malformed/);
});

test("the technician list of approved choices accepts only ACTIVE rows of the asked system and fails closed on anything else", () => {
  const good = [approved(1, "Gate valve leaks"), approved(2, "Gate valve seized", sectionLevel)];
  assert.deepEqual(parseApprovedSectionRemarks(good, "automatic_sprinkler"), good);
  assert.deepEqual(parseApprovedSectionRemarks([], "automatic_sprinkler"), []);
  assert.throws(() => parseApprovedSectionRemarks([...good, approved(3, "Inactive one", sectionSaj, false)], "automatic_sprinkler"), /malformed/);
  assert.throws(() => parseApprovedSectionRemarks(good, "hose_reel"), /malformed/);
  assert.throws(() => parseApprovedSectionRemarks([...good, { ...approved(3, "Extra key"), extra: 1 }], "automatic_sprinkler"), /malformed/);
  assert.throws(() => parseApprovedSectionRemarks([...good, approved(1, "Repeated id value")], "automatic_sprinkler"), /malformed/);
  assert.throws(() => parseApprovedSectionRemarks([...good, approved(4, "GATE VALVE LEAKS")], "automatic_sprinkler"), /malformed/);
  assert.throws(() => parseApprovedSectionRemarks([...good, approved(5, "On comments", "comments")], "automatic_sprinkler"), /malformed/);
  assert.throws(() => parseApprovedSectionRemarks({ remarks: good }, "automatic_sprinkler"), /malformed/);
  assert.equal(isApprovedSectionRemark({ ...approved(1, "Gate valve leaks"), active: "yes" }), false);
});

test("a row is offered the approved remarks of its OWN section only, whichever customer it is for", () => {
  const all = [approved(1, "Gate valve leaks"), approved(2, "Level float stuck", sectionLevel), approved(3, "Old one", sectionSaj, false)];
  assert.deepEqual(approvedChoicesForSection(all, "automatic_sprinkler", sectionSaj).map((item) => item.wording), ["Gate valve leaks"]);
  assert.deepEqual(approvedChoicesForSection(all, "automatic_sprinkler", sectionLevel).map((item) => item.wording), ["Level float stuck"]);
  assert.deepEqual(approvedChoicesForSection(all, "automatic_sprinkler", "checklist.waterTank.automatic_refilling_facilities"), []);
  assert.deepEqual(approvedChoicesForSection(all, "hose_reel", sectionSaj), []);
});

test("local request entries and outbox payloads are strict, and the outbox entity id must equal the request id", () => {
  assert.deepEqual(parseLocalRemarkRequests([local(1), local(2, { jobId: id(800) })]), [local(1), local(2, { jobId: id(800) })]);
  assert.throws(() => parseLocalRemarkRequests([local(1), local(1)]), /malformed/);
  assert.throws(() => parseLocalRemarkRequests([{ ...local(1), extra: 1 }]), /malformed/);
  assert.throws(() => parseLocalRemarkRequests([local(1, { sectionKey: "comments" })]), /malformed/);
  assert.throws(() => parseLocalRemarkRequests("nope"), /malformed/);
  assert.deepEqual(parseRemarkRequestOutboxPayload(local(1, { jobId: id(800) }), id(1)), local(1, { jobId: id(800) }));
  assert.equal(parseRemarkRequestOutboxPayload(local(1), id(2)), undefined);
  assert.equal(parseRemarkRequestOutboxPayload({ ...local(1), jobId: "nope" }, id(1)), undefined);
  assert.equal(parseRemarkRequestOutboxPayload({ ...local(1), wording: " padded " }, id(1)), undefined);
});

test("a request is confirmed ONLY by a reply that echoes the exact UUID and the same content", () => {
  const sent = local(1, { jobId: id(800) });
  const reply = (over: Record<string, unknown> = {}, request: RemarkRequest = pending(1)) => ({ requestedId: sent.id, duplicate: false, request, ...over });
  const ok = parseRemarkRequestConfirmation(reply(), sent);
  assert.equal(ok.request.id, sent.id);
  assert.equal(ok.duplicate, false);
  assert.equal(parseRemarkRequestConfirmation(reply({ duplicate: true }, decided(1, "approved")), sent).duplicate, true);
  // The receipt echoes the submitted string; an upper-case submission is echoed upper case and still matches.
  const upper = local(1, { id: id(1).toUpperCase() });
  assert.equal(parseRemarkRequestConfirmation({ requestedId: upper.id, duplicate: false, request: { ...pending(1), jobId: null, jobReference: null } }, upper).request.id, id(1));
  // The echo is compared as the exact submitted string: a case-folded echo is NOT the receipt that was sent.
  const lettered = local(1, { id: "33000000-0000-4000-8000-00000000000a" });
  assert.throws(() => parseRemarkRequestConfirmation({ requestedId: lettered.id.toUpperCase(), duplicate: false, request: { ...pending(1), id: lettered.id, jobId: null, jobReference: null } }, lettered), RemarkRequestNotConfirmedError);
  for (const [name, body] of [
    ["a different echoed id", reply({ requestedId: id(2) })],
    ["no echo", { duplicate: false, request: pending(1) }], ["an extra key", reply({ extra: 1 })], ["no duplicate flag", reply({ duplicate: "no" })],
    ["a different request id", reply({}, pending(2))], ["a different wording", reply({}, pending(1, "Something else"))],
    ["a different section", reply({}, pending(1, "Gate valve is leaking", sectionLevel))], ["a different customer", reply({}, { ...pending(1), customerId: id(901) })],
    ["a different visit", reply({}, { ...pending(1), jobId: id(801) })], ["a missing visit", reply({}, { ...pending(1), jobId: null, jobReference: null })],
    ["a malformed request", reply({}, { ...pending(1), status: "weird" } as unknown as RemarkRequest)], ["a body that is not an object", "ok"], ["null", null]
  ] as const) {
    assert.throws(() => parseRemarkRequestConfirmation(body, sent), RemarkRequestNotConfirmedError, name);
  }
});

test("every requestable Sprinkler section has a readable label, Comments is not requestable, unknown keys fall back to the key", () => {
  const keys = requestableSectionKeys("automatic_sprinkler");
  assert.equal(keys.length, 4 + 8 + 3 + 3 + 5);
  assert.equal(keys.includes("comments"), false);
  for (const key of keys) {
    const label = sectionDisplayLabel(key);
    assert.notEqual(label, key, key);
    assert.match(label, /›/, key);
  }
  assert.equal(sectionDisplayLabel(sectionSaj), "Water Tank › S.A.J Main Water Supply");
  assert.equal(sectionDisplayLabel("measurements.jockey_pump_pressure"), "Pressure and gauges › Jockey Correct Cut In / Cut Out");
  assert.equal(sectionDisplayLabel("checklist.waterTank.unknown_row"), "checklist.waterTank.unknown_row");
  assert.equal(sectionDisplayLabel("checklist.nowhere.water_level"), "checklist.nowhere.water_level");
});

test("the Remark requests page is open to Admin (supervisor) and Manager (admin) only", () => {
  assert.equal(supervisorAllowsRoute("manager-remark-requests"), true);
  assert.equal(isManagerRole("admin"), true);
  assert.equal(isManagerRole("supervisor"), true);
  assert.equal(isManagerRole("inspector"), false);
  assert.equal(reviewerRoleLabel("admin"), "Manager");
  assert.equal(reviewerRoleLabel("supervisor"), "Admin");
});
