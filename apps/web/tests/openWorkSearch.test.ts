import assert from "node:assert/strict";
import test from "node:test";
import { matchesOpenWork } from "../src/jobs/OpenWorkSection";

test("local matching searches every displayed identity independently, ignoring case", () => {
  const fields = ["Acme Engineering", "North Depot", "Annual service", "SV-184"];
  for (const query of ["acme", "north depot", "annual", "sv-184"]) assert.equal(matchesOpenWork(query, fields), true);
  assert.equal(matchesOpenWork("rv-184", fields), false);
});
test("legacy repairs can omit cached names; RV matching and empty search still work", () => {
  assert.equal(matchesOpenWork("rv-63", [undefined, null, "RV-63"]), true);
  assert.equal(matchesOpenWork("missing", [undefined, null, "RV-63"]), false);
  assert.equal(matchesOpenWork("", ["Customer"]), true);
});
