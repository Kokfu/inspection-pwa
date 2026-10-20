import assert from "node:assert/strict";
import test from "node:test";
import { appendCommonRemark, appendOtherRemark, replaceRemark, singleRemarkSelection } from "../src/inspectionControls/remarkFormatting";

test("multiple selected remarks retain their service wording and dependent detail", () => {
  const first = appendCommonRemark("", "Battery spoilt", "12V x 12AH", 2000);
  assert.equal(first, "Battery spoilt — 12V x 12AH");
  const second = appendCommonRemark(first, "Lot malfunction charger card, need to repair", "Starter panel for Duty pump", 2000);
  assert.equal(second, "Battery spoilt — 12V x 12AH\nLot malfunction charger card, need to repair — Starter panel for Duty pump");
  assert.equal(appendCommonRemark(second + "\nTechnician note", "25mm ball valve spoilt", "", 2000).split("\n").length, 4);
});

const choices = [{ id: "battery", wording: "Battery spoilt", detailOptions: ["12V x 12AH"] }, { id: "valve", wording: "Valve spoilt", detailOptions: [] }];

test("single remark replaces, clears, and writes Others without appending", () => {
  let value = "Old line\nSecond line";
  value = replaceRemark("Valve spoilt", "", 100);
  assert.equal(value, "Valve spoilt");
  assert.equal(singleRemarkSelection(value, choices).id, "valve");
  value = replaceRemark("Typed note", "", 100);
  assert.equal(value, "Typed note");
  assert.equal(singleRemarkSelection(value, choices).id, "others");
  assert.equal(replaceRemark("", "", 100), "");
  assert.equal(singleRemarkSelection("", choices).id, "");
  assert.throws(() => replaceRemark("Too long", "", 3), /exceeds 3/);
});

test("single detail uses exact stored wording and restores both choices", () => {
  const value = replaceRemark("Battery spoilt", "12V x 12AH", 100);
  assert.equal(value, "Battery spoilt — 12V x 12AH");
  assert.deepEqual(singleRemarkSelection(value, choices), { id: "battery", detail: "12V x 12AH", legacy: false });
  assert.equal(singleRemarkSelection("Battery spoilt — unknown", choices).id, "others");
});

test("legacy multi-line is detected without changing its text", () => {
  const value = "First remark\nSecond remark";
  assert.deepEqual(singleRemarkSelection(value, choices), { id: "", detail: "", legacy: true });
  assert.equal(value, "First remark\nSecond remark");
  assert.equal(replaceRemark("Chosen replacement", "", 100), "Chosen replacement");
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
