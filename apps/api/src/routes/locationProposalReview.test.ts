import assert from "node:assert/strict";
import test from "node:test";
import { deriveLocationProposalState } from "../inspections/locationProposal.js";
import { applyLocationProposalPatch, type LocationConfigurationInput, type LocationProposalPatch } from "../inspections/locationConfiguration.js";
import { proposalMergeFailureReason, validateAppliedLocationProposalPatch } from "./locationProposals.js";

test("withdrawn follows the highest sequence and retains its inspector authority", () => {
  const decision = { id: "id", decision: "withdrawn" as const, note: null, decidedBy: "tech", decidedByRole: "inspector" as const,
    decidedAt: "2026-10-19T00:00:00.000Z", sequence: 2, requestId: "request", resultingRevisionId: null, appliedPatch: null };
  assert.deepEqual(deriveLocationProposalState([decision, { ...decision, sequence: 1, decision: "approved", decidedByRole: "admin" }]), { status: "withdrawn", decision });
});

test("dry-run failure reasons cover every pure merge refusal without mutating live input", () => {
  const location = { key: "a", displayName: "A", zoneId: "zone", presetRowCount: 1, rowPreset: {}, sortOrder: 1 };
  const current = { zones: [{ key: "zone", displayName: "Zone", sortOrder: 1 }], locations: [location] };
  const add = { kind: "add-location" as const, locationKey: "b", displayName: "B", zoneKey: "zone", newZone: null };
  const format = { kind: "update-format" as const, locationKey: "missing", rows: [{ alarmZone: "A", location: "Lobby" }] };
  const cases: Array<[LocationConfigurationInput, LocationProposalPatch, string, RegExp]> = [
    [current, { ...add, locationKey: "a" }, "co2_fire_extinguisher", /location.*already exists/],
    [current, { ...add, zoneKey: "missing" }, "co2_fire_extinguisher", /zone no longer exists/],
    [current, { ...add, zoneKey: null, newZone: { key: "zone", displayName: "Zone" } }, "co2_fire_extinguisher", /zone.*already exists/],
    [{ zones: [], locations: [{ ...location, key: "general", zoneId: null }] }, add, "hydrant", /General layout/],
    [current, format, "co2_fire_extinguisher", /no longer exists/],
    [current, { ...format, locationKey: "general" }, "hydrant", /General layout cannot be created/],
    [{ zones: [], locations: [{ ...location, key: "general-primary", zoneId: null, rowPreset: { fireAlarmTable: "secondary" } }] },
      { ...format, locationKey: "general-primary" }, "fire_alarm_detector", /table configuration/]
  ];
  for (const [state, patch, system, reason] of cases) {
    const before = structuredClone(state);
    assert.equal(applyLocationProposalPatch(state, patch, system), undefined);
    assert.match(proposalMergeFailureReason(state, patch), reason);
    assert.deepEqual(state, before);
  }
});

test("edited patch preserves scope and server parser constraints", () => {
  const original = { kind: "update-format" as const, locationKey: "general", rows: [{ assetReference: "A" }, { assetReference: "B" }] };
  const proposal = { payload: original, systemKey: "smoke_ventilation" };
  assert.deepEqual(validateAppliedLocationProposalPatch({ ...original, rows: [{ assetReference: "Edited" }] }, proposal).kind, "update-format");
  for (const patch of [{ ...original, systemKey: "fire_intercom" }, { ...original, locationKey: "other" },
    { ...original, rows: [] }, { ...original, rows: [...original.rows, original.rows[0]] },
    { ...original, rows: [{ assetReference: "a".repeat(201) }] }, { kind: "other", locationKey: "general" }]) {
    assert.throws(() => validateAppliedLocationProposalPatch(patch, proposal), { code: "INVALID_LOCATION_PROPOSAL_DECISION_REQUEST" });
  }
});
