import assert from "node:assert/strict";
import test from "node:test";
import { buildLabelOverrideFormLayout, type FormLayoutField } from "./labelOverrideFormLayout.js";
import { collectResolvedLabelPaths } from "./labelOverrides.js";
import { resolveAutomaticSprinklerControls } from "./templates/automaticSprinklerDefinitionControls.js";
import { resolveCo2Controls } from "./templates/co2DefinitionControls.js";
import { resolveHoseReelControls } from "./templates/definitionControls.js";
import { masterServiceReportV1 } from "./templates/masterServiceReportV1.js";
import { masterServiceReportV4 } from "./templates/masterServiceReportV4.js";
import { masterServiceReportV7 } from "./templates/masterServiceReportV7.js";
import type { MasterServiceReportDefinition } from "./templates/templateTypes.js";

const definitionOf = (template: MasterServiceReportDefinition, key: string) => {
  const system = template.systems.find((candidate) => candidate.key === key);
  assert.ok(system, `${key} is published`);
  return system;
};

const cases = [
  { name: "hose_reel V7", systemKey: "hose_reel", controls: () => resolveHoseReelControls(definitionOf(masterServiceReportV7, "hose_reel"), "MFE-FSSR", 7),
    headings: ["Water Tank", "Pump House", "Test Run Fire Pump 30 Minutes", "Hose Reel Drums"] },
  { name: "hose_reel V1", systemKey: "hose_reel", controls: () => resolveHoseReelControls(definitionOf(masterServiceReportV1, "hose_reel"), "MFE-FSSR", 1),
    headings: ["Water Tank", "Pump House", "Hose Reel Drums"] },
  { name: "co2 V7", systemKey: "co2_fire_extinguisher", controls: () => resolveCo2Controls(definitionOf(masterServiceReportV7, "co2_fire_extinguisher"), "MFE-FSSR", 7),
    headings: ["Control Panel", "Detector Table", "Charger & Batteries", "Physical Outlook", "Main Function Keys"] },
  { name: "wet_chemical V7", systemKey: "wet_chemical", controls: () => resolveCo2Controls(definitionOf(masterServiceReportV7, "wet_chemical"), "MFE-FSSR", 7),
    headings: ["Control Panel", "Detector Table", "Charger & Batteries", "Physical Outlook", "Main Function Keys"] },
  { name: "wet_chemical V4", systemKey: "wet_chemical", controls: () => resolveCo2Controls(definitionOf(masterServiceReportV4, "wet_chemical"), "MFE-FSSR", 4),
    headings: ["Control Panel", "Detector Table", "Charger & Batteries", "Physical Outlook", "Main Function Keys"] },
  { name: "automatic_sprinkler V7", systemKey: "automatic_sprinkler", controls: () => resolveAutomaticSprinklerControls(definitionOf(masterServiceReportV7, "automatic_sprinkler"), "MFE-FSSR", 7),
    headings: ["Water Tank", "Pump House", "Main Alarm Valve", "Test Run Fire Pump 30 Minutes"] },
  { name: "automatic_sprinkler V1", systemKey: "automatic_sprinkler", controls: () => resolveAutomaticSprinklerControls(definitionOf(masterServiceReportV1, "automatic_sprinkler"), "MFE-FSSR", 1),
    headings: ["Water Tank", "Pump House", "Main Alarm Valve"] }
] as const;

for (const testCase of cases) {
  test(`form layout for ${testCase.name} places every label path exactly once, in technician-form sections`, () => {
    const controls = testCase.controls();
    const before = JSON.stringify(controls);
    const layout = buildLabelOverrideFormLayout(testCase.systemKey, controls);
    assert.equal(JSON.stringify(controls), before, "layout builder must not mutate the resolved tree");

    const labelPaths = collectResolvedLabelPaths(controls).map((entry) => entry.path);
    const layoutPaths = layout.sections.flatMap((section) => section.fields.map((field) => field.path));
    assert.deepEqual([...layoutPaths].sort(), [...labelPaths].sort(), "layout covers exactly the label paths");
    assert.equal(new Set(layoutPaths).size, layoutPaths.length, "no path placed twice");
    assert.deepEqual(layout.sections.map((section) => section.heading), [...testCase.headings]);
    assert.ok(layout.sections.every((section) => section.fields.length > 0), "no empty sections");
    assert.ok(!layout.sections.some((section) => section.key === "other"), "published trees need no fallback section");

    const byPath = new Map<string, FormLayoutField>(layout.sections.flatMap((section) => section.fields.map((field) => [field.path, field] as const)));
    for (const field of byPath.values()) {
      if (field.control === "measurement_value") {
        assert.ok(field.parentPath && byPath.get(field.parentPath)?.control === "measurement", `${field.path} has a measurement parent`);
        assert.equal(typeof field.unit, "string");
      } else {
        assert.equal(field.parentPath, null);
      }
      if (field.control === "checklist_item" || field.control === "measurement") {
        assert.ok(field.result && field.result.options.length > 0, `${field.path} carries its result vocabulary`);
        assert.equal(field.remarks, true);
      }
    }
  });
}

test("hose reel V7: pump house holds checklist then both measurements with values; drums are a repeatable table", () => {
  const layout = buildLabelOverrideFormLayout("hose_reel", resolveHoseReelControls(definitionOf(masterServiceReportV7, "hose_reel"), "MFE-FSSR", 7));
  const pump = layout.sections.find((section) => section.key === "pump_house")!;
  const measurementPaths = pump.fields.filter((field) => field.control === "measurement").map((field) => field.path);
  assert.deepEqual(measurementPaths, ["measurements.jockey_pump_pressure", "measurements.standby_pump_cut_in"]);
  assert.ok(pump.fields.findIndex((field) => field.control === "measurement") > pump.fields.findIndex((field) => field.control === "checklist_item"));
  const drums = layout.sections.find((section) => section.key === "hose_reel_drums")!;
  assert.deepEqual(drums.repeatable, { rowHeading: "Drum" });
  assert.ok(drums.fields.every((field) => field.control === "result_column" && field.path.startsWith("repeatableRows.resultColumns.")));
});

test("co2 V7: detector status columns are multi-select, panel location and row texts are text controls", () => {
  const layout = buildLabelOverrideFormLayout("co2_fire_extinguisher", resolveCo2Controls(definitionOf(masterServiceReportV7, "co2_fire_extinguisher"), "MFE-FSSR", 7));
  const detector = layout.sections.find((section) => section.key === "detector_table")!;
  assert.deepEqual(detector.fields.map((field) => [field.path, field.control]), [
    ["detectorRows.alarmZone", "text"], ["detectorRows.location", "text"],
    ["detectorRows.heatDetector", "result_column"], ["detectorRows.smokeDetector", "result_column"]
  ]);
  assert.ok(detector.fields.filter((field) => field.control === "result_column").every((field) => field.result?.type === "multi_select"));
  assert.deepEqual(layout.sections[0]!.fields.map((field) => [field.path, field.control]), [["controlPanelLocation", "text"]]);
});

test("automatic sprinkler V7: sections follow the resolver layout, interleaving measurements", () => {
  const controls = resolveAutomaticSprinklerControls(definitionOf(masterServiceReportV7, "automatic_sprinkler"), "MFE-FSSR", 7);
  const layout = buildLabelOverrideFormLayout("automatic_sprinkler", controls);
  const topLevel = (key: string) => layout.sections.find((section) => section.key === key)!.fields
    .filter((field) => field.control !== "measurement_value").map((field) => field.path.split(".").pop());
  assert.deepEqual(topLevel("pump_house"), controls.layout.pumpHouse.map((row) => row.key));
  assert.deepEqual(topLevel("main_alarm_valve"), controls.layout.mainAlarmValve.map((row) => row.key));
  const values = layout.sections.find((section) => section.key === "pump_house")!.fields
    .filter((field) => field.parentPath === "measurements.jockey_pump_pressure").map((field) => [field.path, field.unit]);
  assert.deepEqual(values, [
    ["measurements.jockey_pump_pressure.values.cut_in", "PSI"],
    ["measurements.jockey_pump_pressure.values.cut_out", "PSI"]
  ]);
});

test("unknown label paths fall back to an 'Other fields' section and malformed input never throws", () => {
  const layout = buildLabelOverrideFormLayout("hose_reel", { extra: { key: "stray", label: "Stray field" } });
  assert.deepEqual(layout, { sections: [{ key: "other", heading: "Other fields", repeatable: null, fields: [
    { path: "extra", control: "text", parentPath: null, result: null, unit: null, remarks: false }
  ] }] });
  assert.deepEqual(buildLabelOverrideFormLayout("fire_alarm_detector", null), { sections: [] });
});
