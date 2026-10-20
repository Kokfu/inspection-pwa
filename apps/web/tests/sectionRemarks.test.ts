import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeSectionRemarks, parseSectionRemarkConfirmation, parseSectionRemarkOutboxPayload, parseSectionRemarks,
  SectionRemarkNotConfirmedError, sectionRemarkChoices, swapCanonicalSectionRemark, validSectionRemark, type SectionRemark
} from "../src/inspectionControls/sectionRemarks";

/** CR-07 device-side rules that need no IndexedDB: shape validation, merge, canonical swap and the exact-id confirmation. */
const customerId = "11000000-0000-4000-8000-000000000001";
const otherCustomerId = "11000000-0000-4000-8000-000000000002";
const id = (n: number) => `22000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sectionA = "checklist.waterTank.saj_main_water_supply";
const sectionB = "checklist.waterTank.water_level";
const remark = (n: number, wording: string, section = sectionA, customer = customerId): SectionRemark =>
  ({ id: id(n), customerId: customer, systemKey: "automatic_sprinkler", sectionKey: section, wording });

test("validSectionRemark is strict: exact keys, uuids, allowlisted keys and already-normalised text", () => {
  assert.equal(validSectionRemark(remark(1, "Main valve needs repair")), true);
  for (const bad of [
    { ...remark(1, "Main valve"), extra: 1 }, { ...remark(1, "Main valve"), id: "nope" }, { ...remark(1, "Main valve"), customerId: "nope" },
    { ...remark(1, "Main valve"), systemKey: "smoke_ventilation" }, remark(1, "Main valve", "checklist.waterTank.nope"),
    remark(1, "  padded  "), remark(1, "two  spaces"), remark(1, "ab"), remark(1, "x".repeat(301)), remark(1, "line\nbreak"),
    { id: id(1) }, null, [], "text", 7
  ]) assert.equal(validSectionRemark(bad), false, JSON.stringify(bad));
});

test("parseSectionRemarks fails closed on any malformed element, foreign customer or repeated id", () => {
  const good = [remark(1, "First remark"), remark(2, "Second remark", sectionB)];
  assert.deepEqual(parseSectionRemarks(good, customerId), good);
  assert.deepEqual(parseSectionRemarks(good, customerId.toUpperCase()), good);
  assert.throws(() => parseSectionRemarks([...good, { ...remark(3, "Third remark"), extra: true }], customerId), /malformed/);
  assert.throws(() => parseSectionRemarks([...good, remark(3, "Foreign one", sectionA, otherCustomerId)], customerId), /malformed/);
  assert.throws(() => parseSectionRemarks([...good, remark(1, "Repeated id value")], customerId), /malformed/);
  assert.throws(() => parseSectionRemarks({ remarks: good }, customerId), /malformed/);
  assert.throws(() => parseSectionRemarks("nope", customerId), /malformed/);
});

test("mergeSectionRemarks keeps pending items the server list lacks and drops those it already holds", () => {
  const remote = [remark(1, "Server remark")];
  const pending = remark(2, "Pending on this device");
  assert.deepEqual(mergeSectionRemarks(remote, [pending]).map((item) => item.id), [id(1), id(2)]);
  assert.deepEqual(mergeSectionRemarks(remote, [remark(1, "Server remark")]).map((item) => item.id), [id(1)], "same id");
  assert.deepEqual(mergeSectionRemarks(remote, [remark(9, "SERVER   remark".replace(/\s+/g, " "))]).map((item) => item.id), [id(1)], "same text, different id: not shown twice");
  assert.deepEqual(mergeSectionRemarks(remote, [remark(9, "Server remark", sectionB)]).map((item) => item.id), [id(1), id(9)], "same text in another section stays");
  assert.deepEqual(mergeSectionRemarks([], [pending, pending]).map((item) => item.id), [id(2)], "a repeated pending item is shown once");
});

test("sectionRemarkChoices offers a remark only in its own section", () => {
  const all = [remark(1, "In water supply"), remark(2, "In water level", sectionB), remark(3, "In comments", "comments")];
  assert.deepEqual(sectionRemarkChoices(all, "automatic_sprinkler", sectionA).map((item) => item.wording), ["In water supply"]);
  assert.deepEqual(sectionRemarkChoices(all, "automatic_sprinkler", "comments").map((item) => item.wording), ["In comments"]);
  assert.deepEqual(sectionRemarkChoices(all, "hose_reel", sectionA), []);
});

test("swapCanonicalSectionRemark replaces the local id in place, or drops it when the canonical row is already listed", () => {
  const list = [remark(1, "Before"), remark(2, "Local text"), remark(3, "After")];
  const canonical = remark(7, "Local text");
  assert.deepEqual(swapCanonicalSectionRemark(list, id(2), canonical).map((item) => item.id), [id(1), id(7), id(3)]);
  assert.deepEqual(swapCanonicalSectionRemark([...list, canonical], id(2), canonical).map((item) => item.id), [id(1), id(3), id(7)]);
  assert.deepEqual(swapCanonicalSectionRemark(list, id(99), canonical).map((item) => item.id), [id(1), id(2), id(3), id(7)], "an unknown local id just adds the canonical row");
});

test("parseSectionRemarkOutboxPayload accepts the queued shape and refuses a mismatched or malformed one", () => {
  const sent = remark(1, "Queued remark");
  assert.deepEqual(parseSectionRemarkOutboxPayload({ ...sent, jobId: id(50) }, id(1)), { ...sent, jobId: id(50) });
  assert.deepEqual(parseSectionRemarkOutboxPayload(sent, id(1)), sent);
  assert.equal(parseSectionRemarkOutboxPayload(sent, id(2)), undefined, "payload id must be the entity id");
  assert.equal(parseSectionRemarkOutboxPayload({ ...sent, jobId: "nope" }, id(1)), undefined);
  assert.equal(parseSectionRemarkOutboxPayload({ ...sent, extra: true }, id(1)), undefined);
  assert.equal(parseSectionRemarkOutboxPayload(null, id(1)), undefined);
});

const reply = (extra: Record<string, unknown> = {}) => ({ requestedId: id(1), duplicate: false, merged: false, remark: remark(1, "Queued remark"), ...extra });

test("a reply confirms the remark only when it echoes the exact requested UUID", () => {
  const sent = remark(1, "Queued remark");
  assert.deepEqual(parseSectionRemarkConfirmation(reply(), sent), { remark: sent, merged: false, duplicate: false });
  assert.deepEqual(parseSectionRemarkConfirmation(reply({ duplicate: true }), sent).duplicate, true);
  // HTTP 200 with a body that does not echo the id is NOT a confirmation.
  for (const body of [{}, { ok: true }, { remark: sent }, { requestedId: id(2), duplicate: false, merged: false, remark: sent }, { ...reply(), requestedId: undefined }, null, "ok", [], { ...reply(), requestedId: `${id(1)} ` }]) {
    assert.throws(() => parseSectionRemarkConfirmation(body, sent), SectionRemarkNotConfirmedError, JSON.stringify(body));
  }
});

test("a merged reply is accepted with the canonical id, but only for the same customer, section and text", () => {
  const sent = remark(1, "Queued remark");
  const canonical = remark(9, "queued REMARK");
  const confirmation = parseSectionRemarkConfirmation(reply({ merged: true, remark: canonical }), sent);
  assert.equal(confirmation.remark.id, id(9)); assert.equal(confirmation.merged, true);
  assert.throws(() => parseSectionRemarkConfirmation(reply({ merged: false, remark: canonical }), sent), SectionRemarkNotConfirmedError, "a different id without merged:true");
  assert.throws(() => parseSectionRemarkConfirmation(reply({ merged: true, remark: remark(9, "queued REMARK", sectionB) }), sent), SectionRemarkNotConfirmedError, "other section");
  assert.throws(() => parseSectionRemarkConfirmation(reply({ merged: true, remark: remark(9, "queued REMARK", sectionA, otherCustomerId) }), sent), SectionRemarkNotConfirmedError, "other customer");
  assert.throws(() => parseSectionRemarkConfirmation(reply({ merged: true, remark: remark(9, "Different text entirely") }), sent), SectionRemarkNotConfirmedError, "other wording");
  assert.throws(() => parseSectionRemarkConfirmation(reply({ remark: { ...sent, extra: 1 } }), sent), SectionRemarkNotConfirmedError, "malformed canonical row");
  assert.throws(() => parseSectionRemarkConfirmation(reply({ merged: "yes" }), sent), SectionRemarkNotConfirmedError, "flags must be booleans");
});
