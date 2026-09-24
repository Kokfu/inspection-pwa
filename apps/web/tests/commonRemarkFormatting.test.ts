import assert from "node:assert/strict";
import test from "node:test";
import { appendCommonRemark, appendOtherRemark } from "../src/inspectionControls/remarkFormatting";

test("multiple selected remarks retain their service wording and dependent detail", () => {
  const first = appendCommonRemark("", "Battery spoilt", "12V x 12AH", 2000);
  assert.equal(first, "Battery spoilt — 12V x 12AH");
  const second = appendCommonRemark(first, "Lot malfunction charger card, need to repair", "Starter panel for Duty pump", 2000);
  assert.equal(second, "Battery spoilt — 12V x 12AH\nLot malfunction charger card, need to repair — Starter panel for Duty pump");
  assert.equal(appendCommonRemark(second + "\nTechnician note", "25mm ball valve spoilt", "", 2000).split("\n").length, 4);
});

test("Others updates the final remark without losing selected remarks", () => {
  const base = appendCommonRemark("", "Battery spoilt", "12V x 12AH", 2000);
  assert.equal(appendOtherRemark(base, "Custom technician note", 2000), "Battery spoilt — 12V x 12AH\nCustom technician note");
  assert.equal(appendOtherRemark(base, "", 2000), base);
});

test("selection and Others respect the existing remark limit", () => {
  assert.throws(() => appendCommonRemark("Existing", "Battery spoilt", "", 15));
  assert.throws(() => appendOtherRemark("Existing", "Long custom note", 15));
});
