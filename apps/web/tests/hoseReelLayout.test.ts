import assert from "node:assert/strict";
import test from "node:test";
import { hoseReelLayoutRows, hoseReelSetupStep, savedHoseReelLayout, startHoseReelRows } from "../src/hoseReel/hoseReelLayout.js";
import type { HoseReelResponses, HoseReelRow } from "../src/hoseReel/hoseReelTypes.js";

/** Phase 3 (Hose Reel): which step a Draft needs, what the saved layout is, and what starting does to the drum sections. */

const blankRow = (n: number, source: "configured" | "technician", extra: Partial<HoseReelRow> = {}): HoseReelRow => ({
  rowUuid: `r${n}`, source, configuredLocationId: source === "configured" ? "loc" : null, zoneSnapshot: null, locationSnapshot: null, locationText: source === "configured" ? `Drum ${n}` : "",
  assetReference: null, sortOrder: n, drumResult: null, hoseResult: null, nozzleResult: null, valveResult: null, nozzleBoxResult: null, remarks: "", fieldRemarks: {}, drumType: source === "configured" ? "swing" : null, ...extra
});
const systemWithDrums = (count: number) => ({ enabledSystemId: "e", systemKey: "hose_reel", displayName: "Hose Reel", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: count === 0 ? [] : [{
  id: "l", enabledSystemId: "e", zoneId: null, key: "general", displayName: "General", presetRowCount: count, sortOrder: 1,
  rowPreset: { rows: Array.from({ length: count }, (_, index) => ({ assetReference: "", locationText: `Drum ${index + 1}`, drumType: "swing" })) }
}] }) as never;

const responses = (rows: HoseReelRow[], patch: Partial<HoseReelResponses> = {}): HoseReelResponses => ({
  schemaVersion: 3, drumCount: rows.length, comments: "", rows,
  checklist: { water_level: { result: null, remarks: "" } },
  measurements: { jockey_pump_pressure: { values: { cut_in: null, cut_out: null }, unit: "bar", result: null, remarks: "" }, standby_pump_cut_in: { values: { value: null }, unit: "bar", result: null, remarks: "" } },
  ...patch
}) as never;

test("the setup step: no drums asks how many, untouched saved drums show the layout, real work skips it", () => {
  assert.equal(hoseReelSetupStep({ syncStatus: "Draft", responses: responses([]), system: systemWithDrums(0) }), "count");
  assert.equal(hoseReelSetupStep({ syncStatus: "Draft", responses: responses([blankRow(1, "configured"), blankRow(2, "configured")]), system: systemWithDrums(2) }), "confirm");
  assert.equal(hoseReelSetupStep({ syncStatus: "Pending", responses: responses([]), system: systemWithDrums(0) }), null, "a submitted record");
  assert.equal(hoseReelSetupStep({ syncStatus: "Draft", responses: { ...responses([]), schemaVersion: 2 } as never, system: systemWithDrums(0) }), null, "schema 2 keeps its flow");
  assert.equal(hoseReelSetupStep({ syncStatus: "Draft", responses: responses([blankRow(1, "technician")]), system: systemWithDrums(0) }), null, "a technician drum was added");
  assert.equal(hoseReelSetupStep({ syncStatus: "Draft", responses: responses([], { comments: "x" }), system: systemWithDrums(0) }), null, "a comment");
  const checked = responses([blankRow(1, "configured")]); checked.checklist.water_level!.result = "good";
  assert.equal(hoseReelSetupStep({ syncStatus: "Draft", responses: checked, system: systemWithDrums(1) }), null, "a checklist answer");
  const measured = responses([blankRow(1, "configured")]); measured.measurements.jockey_pump_pressure.values.cut_in = 10;
  assert.equal(hoseReelSetupStep({ syncStatus: "Draft", responses: measured, system: systemWithDrums(1) }), null, "a measurement");
  assert.equal(hoseReelSetupStep({ syncStatus: "Draft", responses: responses([blankRow(1, "configured", { drumResult: "good" })]), system: systemWithDrums(1) }), null, "a drum result");
  assert.equal(hoseReelSetupStep({ syncStatus: "Draft", responses: responses([blankRow(1, "configured", { remarks: "loose" })]), system: systemWithDrums(1) }), null, "a drum remark");
  const edited = (change: Partial<HoseReelRow>) => hoseReelSetupStep({ syncStatus: "Draft", responses: responses([blankRow(1, "configured", change)]), system: systemWithDrums(1) });
  assert.equal(edited({}), "confirm", "the saved drum as it is");
  assert.equal(edited({ drumType: "fixed" }), null, "a corrected drum type is work");
  assert.equal(edited({ locationText: "Boiler room" }), null, "a corrected location is work");
  assert.equal(edited({ assetReference: "HR-9" }), null, "a corrected reference is work");
});

test("starting a first visit creates that many blank drum sections and keeps the count in step", () => {
  const started = startHoseReelRows(responses([]), { total: 3 });
  assert.equal(started.rows.length, 3);
  assert.equal(started.drumCount, 3);
  assert.deepEqual(started.rows.map((row) => [row.source, row.sortOrder, row.locationText, row.drumType]), [["technician", 1, "", null], ["technician", 2, "", null], ["technician", 3, "", null]]);
  assert.equal(new Set(started.rows.map((row) => row.rowUuid)).size, 3);
});

test("starting with a saved layout appends the extra drum sections after the pre-filled ones", () => {
  const start = responses([blankRow(1, "configured"), blankRow(2, "configured")]);
  const started = startHoseReelRows(start, { extra: 2 });
  assert.deepEqual(started.rows.map((row) => row.source), ["configured", "configured", "technician", "technician"]);
  assert.equal(started.drumCount, 4);
  assert.equal(startHoseReelRows(start, { extra: 0 }).rows.length, 2);
  assert.equal(start.rows.length, 2, "the input is not modified");
});

test("the layout proposed is every drum with its type; a missing reference or type is an empty string", () => {
  const rows = [blankRow(1, "configured", { assetReference: "D-1", drumType: "fixed" }), blankRow(2, "technician", { locationText: "Roof" })];
  assert.deepEqual(hoseReelLayoutRows(responses(rows)), [
    { assetReference: "D-1", locationText: "Drum 1", drumType: "fixed" }, { assetReference: "", locationText: "Roof", drumType: "" }
  ]);
});

test("the saved layout is read from the frozen location preset", () => {
  const system = { enabledSystemId: "e", systemKey: "hose_reel", displayName: "Hose Reel", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [{
    id: "l", enabledSystemId: "e", zoneId: null, key: "general", displayName: "General", presetRowCount: 2, sortOrder: 1,
    rowPreset: { rows: [{ assetReference: "D-1", locationText: "Pump room", drumType: "swing" }, { assetReference: "", locationText: "Roof", drumType: "fixed" }] }
  }] } as never;
  assert.deepEqual(savedHoseReelLayout(system), [
    { assetReference: "D-1", locationText: "Pump room", drumType: "swing" }, { assetReference: "", locationText: "Roof", drumType: "fixed" }
  ]);
  assert.deepEqual(savedHoseReelLayout({ ...(system as object), locations: [] } as never), []);
});
