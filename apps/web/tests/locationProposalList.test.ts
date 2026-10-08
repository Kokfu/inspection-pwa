import assert from "node:assert/strict";
import test from "node:test";
import { ManagerApiError, parseLocationProposalList } from "../src/manager/managerApi.js";

/**
 * I-24: one proposal the client cannot read (for example a legacy row without `payload.kind`) used to make the whole list
 * "unavailable" and throw the Manager back to the role chooser. Each row is now parsed on its own: readable proposals are
 * shown, an unreadable one is reported (never approved, rejected or silently dropped), and a malformed envelope still fails closed.
 */
const good = (id: string, over: Record<string, unknown> = {}) => ({
  id, customerId: "c-1", customerDisplayName: `Customer ${id}`, systemKey: "smoke_ventilation", jobId: "j-1",
  submittedByUserId: 5, submittedBy: "Technician1", submittedByRole: "inspector", submittedAt: "2026-10-08T00:00:00.000Z",
  payload: { kind: "update-format", locationKey: "general", rows: [{ assetReference: "Fan 1" }] }, status: "pending", decision: null, ...over
});
const legacy = { id: "p-legacy", customerId: "c-1", customerDisplayName: "28/9/2026 All Services", systemKey: "fm200_fire_suppression", jobId: "j-0",
  submittedByUserId: 439, submittedBy: "Technician1", submittedByRole: "inspector", submittedAt: "2026-09-28T18:10:05.637Z",
  payload: { zones: [{ key: "z", sortOrder: 1, displayName: "1" }], locations: [] }, status: "pending", decision: null };

test("readable proposals are returned even when another row is unreadable", () => {
  const result = parseLocationProposalList([good("p-1"), legacy, good("p-2")]);
  assert.deepEqual(result.proposals.map((proposal) => proposal.id), ["p-1", "p-2"]);
  assert.equal(result.unreadable.length, 1);
  assert.equal(result.unreadable[0]!.id, "p-legacy");
  assert.equal(result.unreadable[0]!.customerDisplayName, "28/9/2026 All Services");
  assert.equal(result.unreadable[0]!.systemKey, "fm200_fire_suppression");
});

test("an unreadable row never becomes a proposal that can be decided", () => {
  const result = parseLocationProposalList([legacy]);
  assert.deepEqual(result.proposals, []);
  assert.equal(result.unreadable.length, 1);
});

test("a row with no usable id or text is still counted, with no invented details", () => {
  const result = parseLocationProposalList([{ payload: 7 }, null, "text", 42]);
  assert.equal(result.proposals.length, 0);
  assert.equal(result.unreadable.length, 4);
  for (const row of result.unreadable) { assert.equal(row.id, undefined); assert.equal(row.customerDisplayName, undefined); }
});

test("a malformed envelope (not an array) still fails closed", () => {
  for (const bad of [undefined, null, {}, "x", 5]) {
    assert.throws(() => parseLocationProposalList(bad), (error: unknown) => error instanceof ManagerApiError && error.kind === "unavailable");
  }
});

test("an empty list is an empty result", () => {
  assert.deepEqual(parseLocationProposalList([]), { proposals: [], unreadable: [] });
});
