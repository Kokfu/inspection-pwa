import assert from "node:assert/strict";
import test from "node:test";
import { parseDryWetRiserSystemConfiguration } from "./dryWetRiserConfiguration.js";

test("Dry/Wet Riser configuration accepts only the authoritative dry and wet forms", () => {
  assert.deepEqual(parseDryWetRiserSystemConfiguration({ riserMode: "dry" }), { riserMode: "dry" });
  assert.deepEqual(parseDryWetRiserSystemConfiguration({ riserMode: "wet" }), { riserMode: "wet" });
});

test("Dry/Wet Riser configuration fails closed for malformed JSON", () => {
  for (const value of [undefined, null, [], {}, { riserMode: null }, { riserMode: "other" }, { riserMode: "dry", extra: true }]) {
    assert.equal(parseDryWetRiserSystemConfiguration(value), undefined);
  }
});
