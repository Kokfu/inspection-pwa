import assert from "node:assert/strict";
import test from "node:test";
import { configuredDryWetRiserOutlets } from "../src/dryWetRiser/dryWetRiserRepository.js";
import { dryWetRiserLayoutLocation, dryWetRiserLayoutRows, dryWetRiserSetupStep, hasSavedDryWetRiserLayout, savedDryWetRiserLayout, startDryWetRiserRows } from "../src/dryWetRiser/dryWetRiserLayout.js";
import type { DryWetRiserInspectionRecord } from "../src/dryWetRiser/dryWetRiserTypes.js";

/** Phase 3 (Dry/Wet Riser, V7): which step a Draft needs, what the saved layout is, and what starting does to the outlets. */

const location = (key: string, rows?: Array<{ assetReference: string; locationText: string }>, count?: number) => ({
  id: `l-${key}`, enabledSystemId: "e1", zoneId: null, key, displayName: key === "general" ? "General" : key, presetRowCount: count ?? (rows ? rows.length : 1), rowPreset: rows ? { rows } : {}, sortOrder: 1
});
const system = (locations: ReturnType<typeof location>[]) => ({ enabledSystemId: "e1", systemKey: "dry_wet_riser", displayName: "Riser", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations, systemConfiguration: { riserMode: "dry" } }) as never;
const saved = [{ assetReference: "R-1", locationText: "Lobby" }, { assetReference: "R-2", locationText: "Roof" }];
const v7 = (sys: ReturnType<typeof system>) => ({
  schemaVersion: 2, mode: "dry", comments: "", riserOutlets: configuredDryWetRiserOutlets(sys, true),
  checklist: { water_level: { result: null, remarks: "" }, pump_house_clean: { result: null, remarks: "" } },
  measurements: { jockey_psi: { values: { cut_in: null, cut_out: null }, unit: "PSI", result: null, remarks: "" }, duty_psi: { values: { cut_in: null }, unit: "PSI", result: null, remarks: "" }, standby_psi: { values: { cut_in: null }, unit: "PSI", result: null, remarks: "" } }
});
const recordFor = (sys: ReturnType<typeof system>, mutate: (responses: any) => void = () => undefined, status = "Draft"): DryWetRiserInspectionRecord => {
  const responses = v7(sys); mutate(responses);
  return { syncStatus: status, inspectionSnapshot: { system: sys }, responses } as never;
};

test("only a customer with exactly one location gets the automatic flow", () => {
  assert.equal(dryWetRiserLayoutLocation(system([location("general")]))?.key, "general");
  assert.equal(dryWetRiserLayoutLocation(system([])), undefined);
  assert.equal(dryWetRiserLayoutLocation(system([location("general"), location("annex")])), undefined);
});

test("the saved layout is what the form pre-fills; a default location has none", () => {
  assert.deepEqual(savedDryWetRiserLayout(system([location("general", saved)])), saved);
  assert.equal(hasSavedDryWetRiserLayout(system([location("general", saved)])), true);
  assert.equal(hasSavedDryWetRiserLayout(system([location("general")])), false);
  assert.equal(hasSavedDryWetRiserLayout(system([location("general", undefined, 3)])), true);
  assert.deepEqual(savedDryWetRiserLayout(system([location("general"), location("annex")])), []);
});

test("the setup step follows the persisted content only", () => {
  assert.equal(dryWetRiserSetupStep(recordFor(system([location("general")]))), "count");
  assert.equal(dryWetRiserSetupStep(recordFor(system([location("general", saved)]))), "confirm");
  assert.equal(dryWetRiserSetupStep(recordFor(system([location("general", saved), location("annex")]))), null, "several locations");
  assert.equal(dryWetRiserSetupStep(recordFor(system([location("general", saved)]), () => undefined, "Pending")), null, "a submitted record");
  assert.equal(dryWetRiserSetupStep(recordFor(system([location("general", saved)]), (r) => { r.comments = "x"; })), null, "a comment");
  assert.equal(dryWetRiserSetupStep(recordFor(system([location("general", saved)]), (r) => { r.checklist.water_level.result = "good"; })), null, "a checklist answer");
  assert.equal(dryWetRiserSetupStep(recordFor(system([location("general", saved)]), (r) => { r.checklist.pump_house_clean.remarks = "dirty"; })), null, "a checklist remark");
  assert.equal(dryWetRiserSetupStep(recordFor(system([location("general", saved)]), (r) => { r.measurements.duty_psi.values.cut_in = 70; })), null, "a measurement");
  assert.equal(dryWetRiserSetupStep(recordFor(system([location("general", saved)]), (r) => { r.measurements.jockey_psi.result = "good"; })), null, "a measurement result");
  assert.equal(dryWetRiserSetupStep(recordFor(system([location("general", saved)]), (r) => { r.riserOutlets[0].doorResult = "good"; })), null, "an outlet result");
  assert.equal(dryWetRiserSetupStep(recordFor(system([location("general", saved)]), (r) => { r.riserOutlets[1].remarks = "loose"; })), null, "an outlet remark");
  assert.equal(dryWetRiserSetupStep(recordFor(system([location("general", saved)]), (r) => { r.riserOutlets.push({ ...r.riserOutlets[0], source: "technician", rowUuid: "x" }); })), null, "an outlet was added");
  assert.equal(dryWetRiserSetupStep(recordFor(system([location("general", saved)]), (r) => { r.schemaVersion = 1; })), null, "legacy responses keep their flow");
});

test("starting a first visit keeps the configured outlet and adds blank outlets up to the count", () => {
  const responses = recordFor(system([location("general")])).responses;
  const started = startDryWetRiserRows(responses, { total: 4 });
  assert.deepEqual(started.riserOutlets.map((row) => row.source), ["configured", "technician", "technician", "technician"]);
  assert.deepEqual(started.riserOutlets.map((row) => row.sortOrder), [1, 2, 3, 4]);
  assert.deepEqual(started.riserOutlets[0], responses.riserOutlets[0], "the configured outlet is untouched (the server requires it exactly as frozen)");
  assert.deepEqual(started.riserOutlets.slice(1).map((row) => [row.configuredLocationId, row.locationText, row.assetReference]), [[null, "", ""], [null, "", ""], [null, "", ""]]);
  assert.equal(startDryWetRiserRows(responses, { total: 0 }).riserOutlets.length, 1, "configured outlets can never be removed");
  assert.equal(responses.riserOutlets.length, 1, "the input is not modified");
});

test("starting with a saved layout appends the extra outlets after the pre-filled ones", () => {
  const responses = recordFor(system([location("general", saved)])).responses;
  const started = startDryWetRiserRows(responses, { extra: 2 });
  assert.deepEqual(started.riserOutlets.map((row) => [row.source, row.locationText]), [["configured", "Lobby"], ["configured", "Roof"], ["technician", ""], ["technician", ""]]);
  assert.equal(startDryWetRiserRows(responses, { extra: 0 }).riserOutlets.length, 2);
});

test("the layout proposed is every outlet, including the ones added during the visit", () => {
  const started = startDryWetRiserRows(recordFor(system([location("general", saved)])).responses, { extra: 1 });
  started.riserOutlets[2]!.locationText = "Basement";
  assert.deepEqual(dryWetRiserLayoutRows(started), [...saved, { assetReference: "", locationText: "Basement" }]);
});
