import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV7 } from "../../api/src/inspections/templates/masterServiceReportV7";
import { resolveAutomaticSprinklerControls } from "../../api/src/inspections/templates/automaticSprinklerDefinitionControls";
import { applyLabelOverrides, overriddenLabel } from "../src/inspections/labelOverrides";
import { labelOverrideSystemKeys } from "../src/manager/managerApi";
import { resolvePublishedAutomaticSprinklerControls } from "../src/automaticSprinkler/automaticSprinklerDefinition";
import { parseServerAutomaticSprinklerDetail } from "../src/automaticSprinkler/serverAutomaticSprinklerApi";
import type { AutomaticSprinklerV7ChecklistKey } from "../src/automaticSprinkler/automaticSprinklerTypes";

const v7Definition = masterServiceReportV7.systems.find((system) => system.key === "automatic_sprinkler")!;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const v7TemplateId = "00000000-0000-4000-8000-000000000807";
const checklistPath = "checklist.testRunFirePump.trfp_jockey_pump";
const valuePath = "measurements.jockey_pump_pressure.values.cut_in";
const overrides = { [checklistPath]: "Jockey Pump (30 min run)", [valuePath]: "Cut-In Reading" } as const;

const webControls = resolvePublishedAutomaticSprinklerControls(v7Definition, "MFE-FSSR", 7);
const v7ChecklistKeys = [
  ...webControls.checklist.waterTank, ...webControls.checklist.pumpHouse,
  ...webControls.checklist.mainAlarmValve, ...webControls.checklist.testRunFirePump
].map((item) => item.key) as AutomaticSprinklerV7ChecklistKey[];

function v7Responses() {
  return {
    schemaVersion: 2,
    checklist: Object.fromEntries(v7ChecklistKeys.map((key) => [key, { result: "good", remarks: "" }])),
    measurements: {
      jockey_pump_pressure: { values: { cut_in: 80, cut_out: 90 }, unit: "PSI", result: "good", remarks: "" },
      duty_pump_cut_in: { values: { value: 80 }, unit: "PSI", result: "good", remarks: "" },
      standby_pump_cut_in: { values: { value: 80 }, unit: "PSI", result: "good", remarks: "" },
      water_supply_gauge: { values: { value: 80 }, unit: "PSI", result: "good", remarks: "" },
      installation_gauge: { values: { value: 80 }, unit: "PSI", result: "good", remarks: "" }
    },
    comments: ""
  };
}

function v7Detail(displayLabelOverrides?: unknown) {
  return {
    clientUuid: id(1), serverFormInstanceId: id(2), jobId: id(3), jobReference: "ASP-V7", jobTitle: "Sprinkler V7",
    customerName: "Sprinkler Customer", systemKey: "automatic_sprinkler", systemLabel: "Automatic Sprinkler System",
    instanceKey: "primary", zoneId: null, locationId: null, displaySequence: 1, status: "submitted",
    performedAt: "2026-09-04T00:00:00.000000Z", receivedAt: "2026-09-04T00:00:01.000000Z",
    template: { id: v7TemplateId, code: "MFE-FSSR", version: 7 },
    configuration: { revisionId: id(4), revisionNumber: 1 },
    responses: v7Responses(), displayControls: null,
    ...(displayLabelOverrides === undefined ? {} : { displayLabelOverrides }),
    deviceReportedCreatorUsername: null, verifiedOriginalCreatorUsername: null, syncedByUsername: "tech"
  };
}

test("automatic_sprinkler is on the web Manager label-override allow-list", () => {
  assert.ok(labelOverrideSystemKeys.has("automatic_sprinkler"));
  assert.ok(!labelOverrideSystemKeys.has("fire_alarm_detector"));
});

test("the canonical technician-form paths address the V7 resolved tree", () => {
  // `labelAt` in AutomaticSprinklerInspectionForm builds exactly these paths.
  const shown = (path: string, definitionLabel: string) => overriddenLabel(overrides, path, definitionLabel);
  const jockey = webControls.checklist.testRunFirePump.find((item) => item.key === "trfp_jockey_pump")!;
  const duty = webControls.checklist.testRunFirePump.find((item) => item.key === "trfp_duty_pump")!;
  const measurement = webControls.measurements.find((row) => row.key === "jockey_pump_pressure")!;
  const cutIn = measurement.values.find((value) => value.key === "cut_in")!;
  const cutOut = measurement.values.find((value) => value.key === "cut_out")!;
  assert.equal(shown(`checklist.testRunFirePump.${jockey.key}`, jockey.label), overrides[checklistPath]);
  assert.equal(shown(`checklist.testRunFirePump.${duty.key}`, duty.label), duty.label);
  assert.equal(shown(`measurements.jockey_pump_pressure.values.${cutIn.key}`, cutIn.label), overrides[valuePath]);
  assert.equal(shown(`measurements.jockey_pump_pressure.values.${cutOut.key}`, cutOut.label), cutOut.label);
  assert.equal(shown("measurements.jockey_pump_pressure", measurement.label), measurement.label);
  // The canonical tree the keys / gates / evidence paths come from is untouched.
  assert.equal(jockey.label, "Jockey Pump");
  assert.deepEqual(webControls.measurements.map((row) => row.key), ["jockey_pump_pressure", "duty_pump_cut_in", "standby_pump_cut_in", "water_supply_gauge", "installation_gauge"]);
});

test("an accepted V7 detail forwards the frozen override map and never a controls tree", () => {
  const overridden = parseServerAutomaticSprinklerDetail(v7Detail(overrides));
  assert.ok(overridden, "an overridden V7 detail must parse");
  assert.equal(overridden!.templateVersion, 7);
  assert.equal(overridden!.displayControls, null, "a V7 sprinkler never carries a controls tree");
  assert.deepEqual(overridden!.displayLabelOverrides, overrides);
  // Response keys and measurement identity are untouched by the display map.
  assert.deepEqual(Object.keys(overridden!.responses.measurements), ["jockey_pump_pressure", "duty_pump_cut_in", "standby_pump_cut_in", "water_supply_gauge", "installation_gauge"]);

  // A job with no frozen map: the key is absent and the detail still parses.
  const plain = parseServerAutomaticSprinklerDetail(v7Detail());
  assert.ok(plain);
  assert.equal(plain!.displayControls, null);
  assert.equal(plain!.displayLabelOverrides, undefined);
});

test("only the renamed canonical paths substitute — every other caption is left alone", () => {
  // The defect this replaced: shipping a whole re-derived controls tree made the
  // accepted view show DEFINITION wording for all 23 fields as soon as any single
  // override existed. `overriddenLabel` is per-node, so an unnamed path is a no-op.
  const parsed = parseServerAutomaticSprinklerDetail(v7Detail(overrides))!;
  const shown = (path: string, caption: string) => overriddenLabel(parsed.displayLabelOverrides, path, caption);
  assert.equal(shown(checklistPath, "Jockey Pump"), overrides[checklistPath]);
  assert.equal(shown(valuePath, "Cut In"), overrides[valuePath]);
  // Captions whose definition label is worded differently must NOT drift to it.
  for (const [path, caption] of [
    ["checklist.waterTank.drain_and_stop_valve_positions", "Drain Valve Closed and Stop Valves Open"],
    ["checklist.pumpHouse.battery_serviceable", "Battery in Good Serviceable Condition"],
    ["checklist.mainAlarmValve.alarm_gong", "Alarm Gong in Function"],
    ["checklist.testRunFirePump.trfp_duty_pump", "Duty Pump"],
    ["measurements.jockey_pump_pressure", "Jockey Pump"],
    ["measurements.water_supply_gauge", "Water Supply Gauge"],
    ["measurements.jockey_pump_pressure.values.cut_out", "Cut Out"]
  ] as const) assert.equal(shown(path, caption), caption, `${path} must keep its own caption`);
});

test("an unusable override map degrades to no overrides and never fails the detail", () => {
  // Display-only data must never turn an immutable accepted record into
  // "Server inspection is currently unavailable".
  for (const junk of [null, "nope", 0, [], true, {}]) {
    const parsed = parseServerAutomaticSprinklerDetail(v7Detail(junk));
    assert.ok(parsed, `${JSON.stringify(junk)}: the accepted detail must still parse`);
    assert.equal(parsed!.displayLabelOverrides, undefined);
    assert.equal(parsed!.responses.schemaVersion, 2);
  }
  // Individual bad entries are skipped; usable siblings survive.
  const mixed = parseServerAutomaticSprinklerDetail(v7Detail({
    [checklistPath]: "Renamed", [valuePath]: "   ", "some.path": 42, "other.path": "x".repeat(201)
  }));
  assert.ok(mixed);
  assert.deepEqual(mixed!.displayLabelOverrides, { [checklistPath]: "Renamed" });
  // Over the entry cap the whole map is refused rather than truncated.
  const huge = Object.fromEntries(Array.from({ length: 301 }, (_, i) => [`checklist.waterTank.k${i}`, "X"]));
  assert.equal(parseServerAutomaticSprinklerDetail(v7Detail(huge))!.displayLabelOverrides, undefined);
  // A malformed RESPONSE payload still fails closed - only labels degrade.
  const badResponses = v7Detail(overrides) as Record<string, unknown>;
  (badResponses.responses as { schemaVersion: number }).schemaVersion = 1;
  assert.equal(parseServerAutomaticSprinklerDetail(badResponses), undefined);
});

test("a stray controls tree on a V7 sprinkler detail is refused", () => {
  // The V7 branch has no tree by construction; one appearing means the payload
  // is not what this client understands, so it must not be rendered.
  const withTree = v7Detail(overrides) as Record<string, unknown>;
  withTree.displayControls = { schemaVersion: 1 };
  assert.equal(parseServerAutomaticSprinklerDetail(withTree), undefined);
});
