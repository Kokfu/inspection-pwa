import assert from "node:assert/strict";
import test from "node:test";
import { deriveDashboardSystemCondition, deriveSystemCondition, effectiveFieldsForAcceptedReportInstance, sectionRemarkLines, type FinalReportSection } from "./finalServiceReport.js";

const section = (...values: string[]): FinalReportSection => ({
  systemKey: "co2_fire_extinguisher", label: "CO2", evidence: [],
  fields: values.map((value, index) => ({ label: `Field ${index + 1}`, value, depth: 0 }))
});

test("only result controls affect condition when remarks contain status words", () => {
  const fromResponse = (result: string, remarks: string) => {
    const { fields } = effectiveFieldsForAcceptedReportInstance("co2_fire_extinguisher", { schemaVersion: 1 },
      { checks: { cylinder: { result, remarks } }, comments: remarks }, null, []);
    return [{ systemKey: "co2_fire_extinguisher", label: "CO2", fields, evidence: [] }] as FinalReportSection[];
  };
  const naWithGoodComment = fromResponse("na", "Good");
  assert.equal(deriveDashboardSystemCondition(naWithGoodComment), "na");
  assert.deepEqual(deriveSystemCondition(naWithGoodComment), { condition: "GOOD CONDITIONS", conditionDetail: "" });
  const goodWithPoorComment = fromResponse("good", "Poor");
  assert.equal(deriveDashboardSystemCondition(goodWithPoorComment), "passed");
  assert.deepEqual(deriveSystemCondition(goodWithPoorComment), { condition: "GOOD CONDITIONS", conditionDetail: "" });
  assert.deepEqual(sectionRemarkLines(goodWithPoorComment[0]!), [], "free text does not become a PDF finding");
  assert.deepEqual(Object.keys(goodWithPoorComment[0]!.fields[0]!), ["label", "value", "depth"], "result metadata does not change report JSON");
  const historicalRow = effectiveFieldsForAcceptedReportInstance("dry_wet_riser", { schemaVersion: 1 },
    { rows: [{ canvasHoseAt2Result: "poor", remarks: "Good" }] }, null, []);
  assert.equal(deriveDashboardSystemCondition([{ systemKey: "dry_wet_riser", label: "Riser", fields: historicalRow.fields, evidence: [] }]), "notOk");
});

test("dashboard alone distinguishes all N/A while Final Report remains three-state", () => {
  const allNa = [section("Site A", "No Need Checking / N.A.", "Not Relevant")];
  assert.equal(deriveDashboardSystemCondition(allNa), "na");
  assert.deepEqual(deriveSystemCondition(allNa), { condition: "GOOD CONDITIONS", conditionDetail: "" });
  assert.equal(deriveDashboardSystemCondition([section("No Need Checking / N.A."), section("Good")]), "passed");
  assert.equal(deriveDashboardSystemCondition([section("Good", "Not Good")]), "notOk");
  assert.equal(deriveDashboardSystemCondition([section("Complete Repair")]), "notOk");
  assert.equal(deriveDashboardSystemCondition([section("Site A")]), "passed");
});
