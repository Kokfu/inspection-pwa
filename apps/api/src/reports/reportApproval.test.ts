import assert from "node:assert/strict";
import test from "node:test";
import { deriveReportApproval, type ReportApprovalEvent } from "./reportApproval.js";

const event = (overrides: Partial<ReportApprovalEvent>): ReportApprovalEvent => ({
  id: "00000000-0000-4000-8000-000000000001",
  decision: "approved",
  note: null,
  decidedBy: "review-lead",
  decidedByRole: "supervisor",
  decidedAt: "2026-09-20T10:00:00.000Z",
  sequence: 1,
  requestId: "00000000-0000-4000-8000-0000000000e1",
  ...overrides
});

test("open job: not_applicable regardless of events", () => {
  const state = deriveReportApproval("open", [event({})], "2026-09-21T00:00:00.000Z");
  assert.equal(state.status, "not_applicable");
  assert.equal(state.decidedBy, null);
});

test("closed job, no events: awaiting_approval", () => {
  const state = deriveReportApproval("closed", [], null);
  assert.equal(state.status, "awaiting_approval");
  assert.equal(state.decidedBy, null);
  assert.equal(state.correctedAfterApproval, false);
});

test("closed job, latest event approved, no later correction: approved", () => {
  const state = deriveReportApproval("closed", [event({})], null);
  assert.equal(state.status, "approved");
  assert.equal(state.decidedBy, "review-lead");
  assert.equal(state.decidedByRole, "supervisor");
  assert.equal(state.correctedAfterApproval, false);
});

test("closed job, latest event withdrawn: awaiting_approval, carries who withdrew", () => {
  const events = [
    event({ sequence: 1, decision: "approved", decidedBy: "review-lead" }),
    event({ id: "...2", sequence: 2, decision: "withdrawn", decidedBy: "the-admin", decidedByRole: "admin", note: "Wrong system listed", decidedAt: "2026-09-20T11:00:00.000Z" })
  ];
  const state = deriveReportApproval("closed", events, null);
  assert.equal(state.status, "awaiting_approval");
  assert.equal(state.decidedBy, "the-admin");
  assert.equal(state.decidedByRole, "admin");
  assert.equal(state.note, "Wrong system listed");
  assert.equal(state.correctedAfterApproval, false);
});

test("approved-then-corrected: a correction after the approval reverts to awaiting_approval", () => {
  const events = [event({ decidedAt: "2026-09-20T10:00:00.000Z" })];
  const state = deriveReportApproval("closed", events, "2026-09-20T10:00:00.001Z");
  assert.equal(state.status, "awaiting_approval");
  assert.equal(state.correctedAfterApproval, true);
  // Who approved (and when) is still surfaced, even though the state reverted.
  assert.equal(state.decidedBy, "review-lead");
});

test("approved, correction BEFORE the approval: stays approved", () => {
  const events = [event({ decidedAt: "2026-09-20T10:00:00.000Z" })];
  const state = deriveReportApproval("closed", events, "2026-09-20T09:59:59.999Z");
  assert.equal(state.status, "approved");
  assert.equal(state.correctedAfterApproval, false);
});

test("same-millisecond ordering: `sequence`, not timestamp equality, decides the latest event", () => {
  // Both events share a timestamp (a fast double-submit); sequence 2 is authoritative regardless.
  const events = [
    event({ sequence: 1, decision: "approved", decidedBy: "first", decidedAt: "2026-09-20T10:00:00.000Z" }),
    event({ id: "...2", sequence: 2, decision: "withdrawn", decidedBy: "second", decidedByRole: "admin", note: "duplicate submit", decidedAt: "2026-09-20T10:00:00.000Z" })
  ];
  const state = deriveReportApproval("closed", events, null);
  assert.equal(state.status, "awaiting_approval");
  assert.equal(state.decidedBy, "second");
});

test("events out of array order still resolve by highest sequence, not array position", () => {
  const events = [
    event({ id: "...2", sequence: 2, decision: "withdrawn", decidedBy: "second", decidedByRole: "admin", note: "reverted", decidedAt: "2026-09-20T11:00:00.000Z" }),
    event({ sequence: 1, decision: "approved", decidedBy: "first", decidedAt: "2026-09-20T10:00:00.000Z" })
  ];
  const state = deriveReportApproval("closed", events, null);
  assert.equal(state.status, "awaiting_approval");
  assert.equal(state.decidedBy, "second");
});
