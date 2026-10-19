import assert from "node:assert/strict";
import test from "node:test";
import { isLocationProposal, parseLocationProposalList, loadLocationProposal, loadLocationProposals, decideLocationProposal } from "../src/manager/managerApi.js";
import { loadTechnicianLocationProposals, withdrawTechnicianLocationProposal, submitTechnicianLocationProposal } from "../src/referenceData/referenceDataApi.js";
import { reviewerRoleLabel } from "../src/manager/roleAccess.js";

const id = "10000000-0000-4000-8000-000000000001", customerId = "20000000-0000-4000-8000-000000000001";
const jobId = "30000000-0000-4000-8000-000000000001", requestId = "40000000-0000-4000-8000-000000000001";
const patch = { kind: "update-format" as const, locationKey: "general", rows: [{ assetReference: "Fan 1" }, { assetReference: "Fan 2" }] };
const pending = { id, customerId, customerDisplayName: "Customer", systemKey: "smoke_ventilation", systemDisplayName: "Smoke Ventilation",
  jobId, jobReference: "SV-1", submittedByUserId: 7, submittedBy: "Technician", submittedByRole: "inspector", submittedAt: "2026-10-19T00:00:00.000Z",
  payload: patch, status: "pending", decision: null, edited: false };
const event = { id, requestId, decision: "approved", note: null, decidedBy: "Reviewer", decidedByRole: "supervisor",
  decidedAt: "2026-10-19T01:00:00.000Z", sequence: 1, resultingRevisionId: customerId, appliedPatch: null };
const approved = { ...pending, status: "approved", decision: event };
const withdrawn = { ...pending, status: "withdrawn", decision: { ...event, decision: "withdrawn", decidedByRole: "inspector", resultingRevisionId: null } };
const counts = { pending: 1, approved: 0, rejected: 0, withdrawn: 0 };
async function withResponse<T>(data: unknown, run: () => Promise<T>, check?: (url: string, init?: RequestInit) => void): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { check?.(String(url), init); return new Response(JSON.stringify(data), { status: 200 }); };
  try { return await run(); } finally { globalThis.fetch = original; }
}

test("W0 strict proposal validation preserves unreadable rows for malformed identities, statuses, patches and decisions", () => {
  for (const valid of [pending, approved, withdrawn, { ...approved, edited: true, decision: { ...event, appliedPatch: { ...patch, rows: [patch.rows[0]] } } }]) {
    assert.equal(isLocationProposal(valid), true);
  }
  for (const invalid of [
    { ...pending, systemDisplayName: undefined }, { ...pending, jobReference: 7 }, { ...pending, id: "bad" },
    { ...pending, submittedAt: "2026-02-30T00:00:00.000Z" }, { ...pending, status: "other" },
    { ...pending, status: "approved" }, { ...pending, decision: event }, { ...approved, status: "rejected" },
    { ...pending, edited: true }, { ...approved, decision: { ...event, appliedPatch: undefined } },
    { ...approved, decision: { ...event, resultingRevisionId: null } }, { ...approved, decision: { ...event, decidedByRole: "inspector" } },
    { ...withdrawn, decision: { ...withdrawn.decision, decidedByRole: "admin" } },
    { ...pending, payload: { ...patch, systemKey: "smoke_ventilation" } },
    { ...approved, edited: true, decision: { ...event, appliedPatch: { ...patch, locationKey: "other" } } },
    { ...approved, edited: true, decision: { ...event, appliedPatch: { ...patch, rows: [...patch.rows, patch.rows[0]] } } },
    { ...approved, decision: { ...event, unexpected: true } }, { ...pending, unexpected: true }
  ]) {
    const parsed = parseLocationProposalList([pending, invalid]);
    assert.equal(parsed.proposals.length, 1, JSON.stringify(invalid)); assert.equal(parsed.unreadable.length, 1);
  }
  assert.equal(reviewerRoleLabel("inspector"), "Technician");
});

test("W0 counts, detail and edit confirmations fail closed", async () => {
  const inbox = await withResponse({ proposals: [pending], counts }, () => loadLocationProposals("pending"));
  assert.deepEqual(inbox.counts, counts);
  for (const bad of [undefined, { ...counts, pending: -1 }, { ...counts, pending: "1" }, { ...counts, unexpected: 1 }]) {
    await assert.rejects(withResponse({ proposals: [pending], counts: bad }, () => loadLocationProposals()));
  }
  await assert.rejects(withResponse({ proposals: [approved], counts }, () => loadLocationProposals("pending")));
  const location = { key: "general", displayName: "General", zoneId: null, sortOrder: 1, presetRowCount: 2, rowPreset: { rows: patch.rows } };
  const detail = { ...pending, currentLocation: location, currentRows: patch.rows, availableZones: [], mergeable: true };
  assert.deepEqual(await withResponse({ proposal: detail }, () => loadLocationProposal(id)), detail);
  for (const bad of [{ ...pending }, { ...detail, currentLocation: { ...location, key: "other" } },
    { ...detail, currentRows: [] }, { ...detail, mergeable: false }, { ...detail, mergeable: { reason: "" } },
    { ...detail, currentRows: [{ unknown: "field" }] }, { ...detail, id: customerId },
    { ...detail, availableZones: undefined }, { ...detail, availableZones: null },
    { ...detail, availableZones: [{ key: "zone" }] },
    { ...detail, availableZones: [{ key: "", displayName: "Zone" }] },
    { ...detail, availableZones: [{ key: "zone", displayName: " " }] },
    { ...detail, availableZones: [{ key: "zone", displayName: "Zone", extra: true }] },
    { ...detail, availableZones: [{ key: "zone", displayName: "Zone" }, { key: "zone", displayName: "Duplicate" }] },
    { ...detail, currentLocation: { ...location, zoneId: "missing-zone" } }]) {
    await assert.rejects(withResponse({ proposal: bad }, () => loadLocationProposal(id)));
  }
  const zoned = { ...detail, systemKey: "co2_fire_extinguisher", systemDisplayName: "CO2",
    payload: { kind: "add-location", locationKey: "new-room", displayName: "New room", zoneKey: "zone-a", newZone: null },
    currentLocation: null, currentRows: [], availableZones: [{ key: "zone-a", displayName: "Existing Zone A" }] };
  assert.deepEqual(await withResponse({ proposal: zoned }, () => loadLocationProposal(id)), zoned);
  const edited = { ...approved, edited: true, decision: { ...event, appliedPatch: { ...patch, rows: [patch.rows[0]!] } } };
  assert.deepEqual(await withResponse({ proposal: edited }, () => decideLocationProposal(id, { requestId, decision: "approved", appliedPatch: edited.decision.appliedPatch }), (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)).appliedPatch, edited.decision.appliedPatch);
  }), edited);
  await assert.rejects(withResponse({ proposal: { ...approved, decision: { ...event, requestId: customerId } } }, () => decideLocationProposal(id, { requestId, decision: "approved" })));
});

test("W0 technician reads, withdrawals and submission require exact server confirmations", async () => {
  const list = await withResponse({ proposals: [withdrawn, { ...pending, payload: {} }] }, () => loadTechnicianLocationProposals(jobId));
  assert.equal(list.proposals[0]?.status, "withdrawn"); assert.equal(list.unreadable.length, 1);
  await assert.rejects(withResponse({ proposals: [pending] }, () => loadTechnicianLocationProposals(customerId)));
  assert.deepEqual(await withResponse({ proposal: withdrawn }, () => withdrawTechnicianLocationProposal(id, requestId, 7), (_url, init) => {
    assert.equal(init?.cache, "no-store"); assert.equal((init?.headers as Record<string, string>)["X-Expected-User-Id"], "7");
    assert.deepEqual(JSON.parse(String(init?.body)), { requestId });
  }), withdrawn);
  for (const bad of [pending, { ...withdrawn, id: customerId }, { ...withdrawn, submittedByUserId: 8 },
    { ...withdrawn, decision: { ...withdrawn.decision, requestId: customerId } }]) {
    await assert.rejects(withResponse({ proposal: bad }, () => withdrawTechnicianLocationProposal(id, requestId, 7)));
  }
  const submit = () => submitTechnicianLocationProposal(customerId, "smoke_ventilation", { id, jobId, patch }, 7);
  assert.deepEqual(await withResponse({ proposal: pending }, submit), { id, status: "pending" });
  for (const bad of [{ id, status: "pending" }, { ...pending, id: customerId }, { ...pending, jobId: id },
    { ...pending, customerId: id }, { ...pending, submittedByUserId: 8 }]) {
    await assert.rejects(withResponse({ proposal: bad }, submit));
  }
});
