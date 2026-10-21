import assert from "node:assert/strict";
import test from "node:test";
import { isBlankDraft, isNewServiceVisitDraft, newVisitDraft } from "../src/jobs/newServiceVisitDraft";

test("OA-7: a fresh draft is blank, valid, and carries its own identities", () => {
  const draft = newVisitDraft();
  assert.equal(isNewServiceVisitDraft(draft), true);
  assert.equal(isBlankDraft(draft), true);
  assert.notEqual(draft.requestId, draft.localJobUuid);
  assert.notEqual(newVisitDraft().requestId, draft.requestId);
});

test("OA-7: any choice or a started create makes the draft worth keeping", () => {
  assert.equal(isBlankDraft({ ...newVisitDraft(), customerId: "c" }), false);
  assert.equal(isBlankDraft({ ...newVisitDraft(), systemKeys: ["hose_reel"] }), false);
  assert.equal(isBlankDraft({ ...newVisitDraft(), serviceCallNumber: " 7 " }), false);
  assert.equal(isBlankDraft({ ...newVisitDraft(), serviceCallNumber: "   " }), true);
  assert.equal(isBlankDraft({ ...newVisitDraft(), sending: true }), false);
});

test("OA-7: malformed saved drafts are refused", () => {
  const good = newVisitDraft("c");
  assert.equal(isNewServiceVisitDraft(null), false);
  assert.equal(isNewServiceVisitDraft({ ...good, schemaVersion: 2 }), false);
  assert.equal(isNewServiceVisitDraft({ ...good, requestId: "not-a-uuid" }), false);
  assert.equal(isNewServiceVisitDraft({ ...good, systemKeys: [1] }), false);
  assert.equal(isNewServiceVisitDraft({ ...good, arrivalTime: "9:5" }), false);
  assert.equal(isNewServiceVisitDraft({ ...good, sending: "yes" }), false);
  assert.equal(isNewServiceVisitDraft({ ...good, arrivalTime: "09:05" }), true);
});
