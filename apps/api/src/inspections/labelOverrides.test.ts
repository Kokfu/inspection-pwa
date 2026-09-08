import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  applyLabelOverrides,
  collectResolvedLabelPaths,
  resolvedLabelPathSet
} from "./labelOverrides.js";
import { resolveHoseReelControls } from "./templates/definitionControls.js";
import { resolveV7EvidenceContract, v7EvidenceContractSha256 } from "./evidence/v7EvidenceContracts.js";
import { masterServiceReportV7 } from "./templates/masterServiceReportV7.js";

const canonical = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`
    : JSON.stringify(value);
const sha = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

/** A resolved-controls-shaped fixture exercising every label-bearing position. */
function sampleControls() {
  const option = (value: string, label: string) => ({ value, label });
  const result = () => ({ type: "single_select", required: true, options: [option("good", "Good"), option("poor", "Poor")] });
  return {
    schemaVersion: 1,
    source: { templateCode: "MFE-FSSR", templateVersion: 7, systemKey: "hose_reel" },
    controlPanelLocation: { key: "control_panel_location", label: "Control Panel Location", required: true, maxLength: 300 },
    checklist: {
      pumpHouse: [
        { key: "pumps_auto_start", label: "Jockey And Stand-By Pump In Auto Start Position", sortOrder: 1, result: result(), remarks: { policy: "optional", maxLength: 2000 } },
        { key: "battery_serviceable", label: "Battery In Good Serviceable / Function", sortOrder: 2, result: result(), remarks: { policy: "optional", maxLength: 2000 } }
      ]
    },
    measurements: [
      {
        key: "jockey_pump_pressure",
        label: "Jockey Pump Pressure",
        sortOrder: 1,
        values: [
          { key: "cut_in", label: "Cut In", unit: "PSI", required: true },
          { key: "cut_out", label: "Cut Out", unit: "PSI", required: true }
        ],
        result: result(),
        remarks: { policy: "optional", maxLength: 2000 }
      }
    ],
    repeatableRows: {
      resultColumns: [
        { key: "drumResult", label: "Drum", sortOrder: 1, result: result() },
        { key: "hoseResult", label: "Hose", sortOrder: 2, result: result() }
      ],
      remarks: { policy: "optional", maxLength: 2000 }
    },
    comments: { policy: "optional", maxLength: 4000 }
  };
}

test("collectResolvedLabelPaths enumerates every label-bearing node by its resolved-tree path", () => {
  const paths = collectResolvedLabelPaths(sampleControls()).map((entry) => entry.path).sort();
  assert.deepEqual(paths, [
    "checklist.pumpHouse.battery_serviceable",
    "checklist.pumpHouse.pumps_auto_start",
    "controlPanelLocation",
    "measurements.jockey_pump_pressure",
    "measurements.jockey_pump_pressure.values.cut_in",
    "measurements.jockey_pump_pressure.values.cut_out",
    "repeatableRows.resultColumns.drumResult",
    "repeatableRows.resultColumns.hoseResult"
  ]);
  // Result-option labels ({ value, label }, no `key`) are NOT exposed.
  assert.ok(!paths.some((path) => path.includes(".result.")));
});

test("override hit replaces only the addressed label and never mutates the input", () => {
  const input = sampleControls();
  const before = canonical(input);
  const out = applyLabelOverrides(input, { "checklist.pumpHouse.pumps_auto_start": "Pumps Start Automatically" });
  assert.equal(out.checklist.pumpHouse[0]!.label, "Pumps Start Automatically");
  assert.equal(out.checklist.pumpHouse[1]!.label, "Battery In Good Serviceable / Function");
  assert.equal(out.controlPanelLocation.label, "Control Panel Location");
  assert.notEqual(out, input);
  assert.equal(canonical(input), before, "input tree is untouched");
});

test("blank, whitespace-only and absent overrides fall back to the definition label", () => {
  const out = applyLabelOverrides(sampleControls(), {
    "checklist.pumpHouse.pumps_auto_start": "",
    "checklist.pumpHouse.battery_serviceable": "   "
  });
  assert.equal(out.checklist.pumpHouse[0]!.label, "Jockey And Stand-By Pump In Auto Start Position");
  assert.equal(out.checklist.pumpHouse[1]!.label, "Battery In Good Serviceable / Function");
  // A map whose every value is blank is treated as no map at all — same reference back.
  const same = applyLabelOverrides(sampleControls(), { "controlPanelLocation": "" });
  assert.ok(same.controlPanelLocation.label === "Control Panel Location");
});

test("unknown paths are ignored without throwing and change nothing", () => {
  const input = sampleControls();
  const out = applyLabelOverrides(input, {
    "checklist.pumpHouse.does_not_exist": "X",
    "totally.bogus.path": "Y",
    "checklist.pumpHouse.pumps_auto_start.result.options.good": "Fine"
  });
  assert.equal(canonical(out), canonical(input));
});

test("empty / undefined / null override map is a no-op returning the same reference", () => {
  const input = sampleControls();
  assert.equal(applyLabelOverrides(input, {}), input);
  assert.equal(applyLabelOverrides(input, undefined), input);
  assert.equal(applyLabelOverrides(input, null), input);
  assert.equal(applyLabelOverrides(input, "not-an-object"), input);
});

test("nested repeatable-row and measurement-value paths are overridable", () => {
  const out = applyLabelOverrides(sampleControls(), {
    "measurements.jockey_pump_pressure.values.cut_in": "Cut-In Pressure",
    "repeatableRows.resultColumns.drumResult": "Reel Drum"
  });
  assert.equal(out.measurements[0]!.values[0]!.label, "Cut-In Pressure");
  assert.equal(out.measurements[0]!.values[1]!.label, "Cut Out");
  assert.equal(out.repeatableRows.resultColumns[0]!.label, "Reel Drum");
  assert.equal(out.repeatableRows.resultColumns[1]!.label, "Hose");
});

test("against a real resolved definition: override swaps the label, the un-overridden re-resolution is byte-identical", () => {
  const definition = masterServiceReportV7.systems.find((system) => system.key === "hose_reel")!;
  const controls = resolveHoseReelControls(definition, "MFE-FSSR", 7);
  const paths = resolvedLabelPathSet(controls);
  assert.ok(paths.has("checklist.pumpHouse.pumps_auto_start"), "real hose_reel tree exposes the checklist path");

  const overridden = applyLabelOverrides(controls, { "checklist.pumpHouse.pumps_auto_start": "Pumps Start Automatically" });
  const changed = collectResolvedLabelPaths(overridden).find((entry) => entry.path === "checklist.pumpHouse.pumps_auto_start");
  assert.equal(changed?.definitionLabel, "Pumps Start Automatically");

  // The helper must never disturb the frozen-equality authority: a fresh
  // re-resolution (what acceptance re-derivation compares against) is unchanged.
  assert.equal(sha(resolveHoseReelControls(definition, "MFE-FSSR", 7)), sha(controls));
});

test("contract integrity: contractSha256 for every V7 system is byte-identical with and without an override present", () => {
  const v7SystemKeys = [
    "co2_fire_extinguisher", "wet_chemical", "fire_alarm_detector", "hydrant", "hose_reel",
    "automatic_sprinkler", "dry_wet_riser", "smoke_ventilation", "fire_intercom"
  ];
  for (const key of v7SystemKeys) {
    const definition = masterServiceReportV7.systems.find((system) => system.key === key)!;
    const baseline = v7EvidenceContractSha256(definition);

    // An override map exercised against the definition (a large, hostile one:
    // 300 fabricated paths plus a real-looking checklist rename).
    const overrides: Record<string, string> = { "checklist.pumpHouse.pumps_auto_start": "Pumps Start Automatically" };
    for (let i = 0; i < 300; i++) overrides[`fabricated.path.${i}`] = `Renamed ${i}`;
    applyLabelOverrides(definition, overrides);
    applyLabelOverrides({ frozen: structuredClone(definition) }, overrides);

    const afterOverride = v7EvidenceContractSha256(definition);
    assert.equal(afterOverride, baseline, `${key}: contractSha256 changed when an override was applied`);
    assert.ok(
      resolveV7EvidenceContract({
        systemKey: key,
        templateId: masterServiceReportV7.id,
        templateVersion: 7,
        definition,
        contractSha256: afterOverride
      }),
      `${key}: V7 evidence adapter no longer resolves against its own contractSha256`
    );
  }
});
