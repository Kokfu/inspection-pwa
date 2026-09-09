import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { resolveAutomaticSprinklerControls } from "./automaticSprinklerDefinitionControls.js";
import { masterServiceReportV1 } from "./masterServiceReportV1.js";
import { masterServiceReportV2 } from "./masterServiceReportV2.js";
import { masterServiceReportV3 } from "./masterServiceReportV3.js";
import { masterServiceReportV4 } from "./masterServiceReportV4.js";
import { masterServiceReportV5 } from "./masterServiceReportV5.js";
import { masterServiceReportV6 } from "./masterServiceReportV6.js";
import { masterServiceReportV7 } from "./masterServiceReportV7.js";
import type { MasterServiceReportDefinition } from "./templateTypes.js";

const sprinkler = (template: MasterServiceReportDefinition) =>
  template.systems.find((system) => system.key === "automatic_sprinkler");

/**
 * Pinned digest of `JSON.stringify(resolveAutomaticSprinklerControls(V1 definition,
 * "MFE-FSSR", 1))` as produced BEFORE the V7 fork (commit 5d86ace). The V7 fork is
 * additive only: every historical version must still serialise to these exact bytes,
 * key order included.
 */
const historicalDigest = "9635824630d591b6f3f2a103deaa862157c47d0ec5d582a598272719ea520d56";

test("V1-V6 Automatic Sprinkler controls are byte-identical to the pre-V7-fork resolver", () => {
  const historical = [
    [1, masterServiceReportV1], [2, masterServiceReportV2], [3, masterServiceReportV3],
    [4, masterServiceReportV4], [5, masterServiceReportV5], [6, masterServiceReportV6]
  ] as const;
  for (const [version, template] of historical) {
    // V2 republishes only the systems it changed, so its catalog carries no
    // Automatic Sprinkler entry - a V2 customer still resolves V1's definition.
    const definition = sprinkler(template) ?? sprinkler(masterServiceReportV1);
    const controls = resolveAutomaticSprinklerControls(definition, "MFE-FSSR", version);
    const serialised = JSON.stringify(controls);
    assert.equal(
      createHash("sha256").update(serialised).digest("hex"), historicalDigest,
      `V${version} Automatic Sprinkler controls changed`
    );
    assert.equal(controls.source.templateVersion, 1);
    assert.deepEqual(Object.keys(controls.checklist), ["waterTank", "pumpHouse", "mainAlarmValve"]);
    assert.deepEqual(Object.keys(controls.layout), ["waterTank", "pumpHouse", "mainAlarmValve"]);
    assert.equal(controls.checklist.testRunFirePump, undefined);
    assert.equal(controls.layout.testRunFirePump, undefined);
    for (const item of [...controls.checklist.waterTank, ...controls.checklist.pumpHouse, ...controls.checklist.mainAlarmValve, ...controls.measurements]) {
      assert.deepEqual(item.result.options.map((option) => option.value), ["good", "poor"]);
    }
  }
});

test("the V7 fork resolves the four-state tree with the Test Run Fire Pump block", () => {
  const controls = resolveAutomaticSprinklerControls(sprinkler(masterServiceReportV7), "MFE-FSSR", 7);
  assert.equal(controls.source.templateVersion, 7);
  assert.equal(controls.source.templateCode, "MFE-FSSR");
  assert.equal(controls.source.systemKey, "automatic_sprinkler");
  assert.equal(controls.repetitionMode, "single");
  assert.deepEqual(Object.keys(controls.checklist), ["waterTank", "pumpHouse", "mainAlarmValve", "testRunFirePump"]);
  assert.deepEqual(Object.keys(controls.layout), ["waterTank", "pumpHouse", "mainAlarmValve", "testRunFirePump"]);
  assert.deepEqual(
    controls.checklist.testRunFirePump!.map((item) => item.key),
    ["trfp_jockey_pump", "trfp_duty_pump", "trfp_standby_pump"]
  );
  assert.deepEqual(
    controls.checklist.testRunFirePump!.map((item) => item.label),
    ["Jockey Pump", "Duty Pump", "Standby Pump"]
  );
  assert.deepEqual(
    controls.layout.testRunFirePump,
    [{ kind: "checklist", key: "trfp_jockey_pump" }, { kind: "checklist", key: "trfp_duty_pump" }, { kind: "checklist", key: "trfp_standby_pump" }]
  );
  // Four-state result model everywhere a Good/Poor control exists.
  const every = [
    ...controls.checklist.waterTank, ...controls.checklist.pumpHouse,
    ...controls.checklist.mainAlarmValve, ...controls.checklist.testRunFirePump!,
    ...controls.measurements
  ];
  assert.equal(every.length, 4 + 8 + 3 + 3 + 5);
  for (const item of every) {
    assert.deepEqual(item.result.options.map((option) => option.value), ["good", "not_good", "complete_repair", "na"]);
    assert.deepEqual(item.result.options.map((option) => option.label), ["Good", "Not Good", "Complete Repair", "N.A."]);
    assert.equal(item.result.type, "single_select");
    assert.equal(item.result.required, true);
  }
  // Measurement identity, response keys and PSI units are untouched by the fork.
  assert.deepEqual(controls.measurements.map((row) => row.key), ["jockey_pump_pressure", "duty_pump_cut_in", "standby_pump_cut_in", "water_supply_gauge", "installation_gauge"]);
  assert.deepEqual(controls.measurements[0]!.values.map((value) => value.key), ["cut_in", "cut_out"]);
  assert.ok(controls.measurements.slice(1).every((row) => row.values.length === 1 && row.values[0]!.key === "value"));
  assert.ok(controls.measurements.every((row) => row.values.every((value) => value.unit === "PSI")));
  assert.deepEqual(controls.comments, { policy: "optional", maxLength: 4000 });
});

test("a V7 definition is rejected by the historical fork and a V1 definition by the V7 fork", () => {
  assert.throws(() => resolveAutomaticSprinklerControls(sprinkler(masterServiceReportV7), "MFE-FSSR", 1));
  assert.throws(() => resolveAutomaticSprinklerControls(sprinkler(masterServiceReportV1), "MFE-FSSR", 7));
});

test("the V7 fork keeps the canonical label paths the Manager editor addresses", async () => {
  const { collectResolvedLabelPaths } = await import("../labelOverrides.js");
  const paths = collectResolvedLabelPaths(resolveAutomaticSprinklerControls(sprinkler(masterServiceReportV7), "MFE-FSSR", 7)).map((entry) => entry.path);
  for (const expected of [
    "checklist.waterTank.saj_main_water_supply",
    "checklist.pumpHouse.pumps_auto_start",
    "checklist.mainAlarmValve.alarm_gong",
    "checklist.testRunFirePump.trfp_jockey_pump",
    "checklist.testRunFirePump.trfp_duty_pump",
    "checklist.testRunFirePump.trfp_standby_pump",
    "measurements.jockey_pump_pressure",
    "measurements.jockey_pump_pressure.values.cut_in",
    "measurements.jockey_pump_pressure.values.cut_out",
    "measurements.installation_gauge.values.value"
  ]) assert.ok(paths.includes(expected), `missing label path ${expected}`);
  // `layout` rows carry no `label`, so the added V7 layout section adds no path.
  assert.ok(!paths.some((path) => path.startsWith("layout.")));
});
