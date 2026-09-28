import assert from "node:assert/strict";
import test from "node:test";
import { deriveLocationProposalState, type LocationProposalDecisionEvent } from "./locationProposal.js";

const event = (overrides: Partial<LocationProposalDecisionEvent>): LocationProposalDecisionEvent => ({
  id: "00000000-0000-4000-8000-000000000001",
  decision: "approved",
  note: null,
  decidedBy: "review-lead",
  decidedByRole: "supervisor",
  decidedAt: "2026-09-20T10:00:00.000Z",
  sequence: 1,
  requestId: "00000000-0000-4000-8000-0000000000e1",
  resultingRevisionId: "00000000-0000-4000-8000-0000000000f1",
  ...overrides
});

test("no decisions: pending", () => {
  const state = deriveLocationProposalState([]);
  assert.equal(state.status, "pending");
  assert.equal(state.decision, null);
});

test("one approved decision: approved, carries who and the resulting revision", () => {
  const state = deriveLocationProposalState([event({})]);
  assert.equal(state.status, "approved");
  assert.equal(state.decision?.decidedBy, "review-lead");
  assert.equal(state.decision?.resultingRevisionId, "00000000-0000-4000-8000-0000000000f1");
});

test("one rejected decision: rejected, resultingRevisionId is null", () => {
  const state = deriveLocationProposalState([event({ decision: "rejected", note: "Not enough detail", resultingRevisionId: null })]);
  assert.equal(state.status, "rejected");
  assert.equal(state.decision?.note, "Not enough detail");
  assert.equal(state.decision?.resultingRevisionId, null);
});

test("same-millisecond ordering: highest `sequence`, not array position, is authoritative", () => {
  // Both decisions are terminal in practice, so this never happens for one proposal in production --
  // this test only proves the derivation does not silently trust array order or timestamp equality,
  // mirroring reportApproval.test.ts's equivalent defensive case.
  const events = [
    event({ id: "...2", sequence: 2, decision: "rejected", decidedBy: "second", note: "duplicate submit race", decidedAt: "2026-09-20T10:00:00.000Z", resultingRevisionId: null }),
    event({ sequence: 1, decision: "approved", decidedBy: "first", decidedAt: "2026-09-20T10:00:00.000Z" })
  ];
  const state = deriveLocationProposalState(events);
  assert.equal(state.status, "rejected");
  assert.equal(state.decision?.decidedBy, "second");
});
