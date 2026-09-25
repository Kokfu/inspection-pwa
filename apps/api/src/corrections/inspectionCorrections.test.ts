import assert from "node:assert/strict";
import test from "node:test";
import { acceptableNewValue, applyCorrections, correctableValue, listCorrectableFields, parseFieldPath, type Json } from "./inspectionCorrections.js";

const row = "9173e14d-a4ed-4909-9c17-c6451e65db3f";
const payload: Json = {
  controlPanelLocation: "Kitchen A",
  comments: "",
  detectorRows: [{ rowUuid: row, displaySequence: 1, alarmZone: "Kitchen", location: "Kitchen A", heatDetectorStatus: ["normal", "test"], smokeDetectorStatus: ["test"], remarks: "" }],
  chargerAndBatteries: { main_supply: { result: "good", remarks: "" }, battery: { result: "na", remarks: "" } },
  measurements: { jockey: { values: { cut_in: 95, cut_out: null }, unit: "PSI", configuredLocationId: "x" } }
};
const snapshot = { system: { definition: { sections: [{ key: "chargerAndBatteries", label: "Charger & Batteries", items: [{ key: "main_supply", label: "Main Supply" }] }] } } };

test("field paths: dot segments, identity/metadata keys refused, bounded", () => {
  assert.deepEqual(parseFieldPath("chargerAndBatteries.main_supply.result"), ["chargerAndBatteries", "main_supply", "result"]);
  for (const bad of ["", "a..b", "a.b c", `detectorRows.${row}.rowUuid`, "a.configuredLocationId", "a.performedAt", "x.sourceSha256", Array(13).fill("a").join("."), 7]) {
    assert.equal(parseFieldPath(bad), undefined, String(bad));
  }
});

test("correctable fields: strings/numbers/null leaves through objects and rowUuid rows; never arrays or metadata", () => {
  const fields = listCorrectableFields(payload, snapshot);
  const paths = fields.map((field) => field.fieldPath).sort();
  assert.deepEqual(paths, [
    "chargerAndBatteries.battery.remarks", "chargerAndBatteries.battery.result",
    "chargerAndBatteries.main_supply.remarks", "chargerAndBatteries.main_supply.result",
    "comments", "controlPanelLocation",
    `detectorRows.${row}.alarmZone`, `detectorRows.${row}.location`, `detectorRows.${row}.remarks`,
    "measurements.jockey.values.cut_in", "measurements.jockey.values.cut_out"
  ]);
  const result = fields.find((field) => field.fieldPath === "chargerAndBatteries.main_supply.result")!;
  assert.equal(result.kind, "result");
  assert.deepEqual(result.options, ["good", "not_good", "complete_repair", "na"]);
  assert.equal(result.label, "Charger & Batteries › Main Supply › Result");
  assert.equal(fields.find((field) => field.fieldPath === `detectorRows.${row}.remarks`)!.label, "Detector Rows › Row 1 › Remarks");
  assert.equal(correctableValue(payload, `detectorRows.${row}.heatDetectorStatus`), undefined, "N/T/I arrays are never correctable");
  assert.equal(correctableValue(payload, "chargerAndBatteries.main_supply"), undefined, "objects are never replaced");
  assert.equal(correctableValue(payload, "measurements.jockey.unit"), undefined);
  assert.equal(correctableValue(payload, "detectorRows.0.remarks"), undefined, "rows are addressed by rowUuid, not index");
});

test("new values keep the field's kind", () => {
  assert.equal(acceptableNewValue("result", "not_good"), true);
  assert.equal(acceptableNewValue("result", "poor"), false, "the V1-V6 vocabulary is not a V7 result");
  assert.equal(acceptableNewValue("result", null), false);
  assert.equal(acceptableNewValue("text", "x".repeat(4000)), true);
  assert.equal(acceptableNewValue("text", 5), false);
  assert.equal(acceptableNewValue("reading", 101.5), true);
  assert.equal(acceptableNewValue("reading", Number.NaN), false);
  assert.equal(acceptableNewValue("reading", { value: 1 }), false);
});

test("applyCorrections: latest sequence per path wins, other fields and the input are untouched", () => {
  const before = JSON.stringify(payload);
  const effective = applyCorrections(payload, [
    { fieldPath: "chargerAndBatteries.main_supply.result", sequence: 2, newValue: "good" },
    { fieldPath: "chargerAndBatteries.main_supply.result", sequence: 1, newValue: "not_good" },
    { fieldPath: `detectorRows.${row}.remarks`, sequence: 1, newValue: "Cover loose" }
  ]) as Record<string, any>;
  assert.equal(effective.chargerAndBatteries.main_supply.result, "good");
  assert.equal(effective.detectorRows[0].remarks, "Cover loose");
  assert.deepEqual(effective.detectorRows[0].heatDetectorStatus, ["normal", "test"]);
  assert.equal(JSON.stringify(payload), before, "the accepted payload is never mutated");
  assert.throws(() => applyCorrections(payload, [{ fieldPath: "missing.path", sequence: 1, newValue: "x" }]));
});

test("the support gate is closed for non-V7 records and for systems outside the first cut", async () => {
  const { supportedRow } = await import("../routes/managerCorrections.js");
  const check = (systemKey: string, templateVersion: unknown) => supportedRow({ row: { systemKey }, templateVersion });
  assert.equal(check("wet_chemical", 7), true);
  assert.equal(check("wet_chemical", 4), false, "V1-V6 records are read-only");
  assert.equal(check("wet_chemical", "7"), false, "a non-numeric version never passes");
  assert.equal(check("fire_alarm_detector", 7), false, "Fire Alarm V7 keeps its own storage until a follow-up");
  assert.equal(check("portable_fire_extinguisher", 7), false);
});
