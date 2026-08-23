import assert from "node:assert/strict";
import test from "node:test";
import { isSafeForAppUpdate, updateInstructionForRoute } from "../src/pwa/updateRoutePolicy.ts";

test("editable and configuration routes never expose an application update action", () => {
  for (const name of [
    "development", "inspection", "new-service-visit", "sprinkler-form", "riser-form",
    "fire-alarm-form", "hydrant-form", "portable-fire-extinguisher-form", "co2-form",
    "wet-chemical-form", "manager-customer"
  ]) {
    assert.equal(isSafeForAppUpdate({ name }), false, name);
  }
  assert.match(updateInstructionForRoute({ name: "co2-form" }), /Save your draft and return to My Service Jobs/);
});

test("navigation and read-only routes allow an explicit update", () => {
  for (const name of ["jobs", "job", "system", "final-report", "manager-home", "manager-service-visit", "manager-final-report"]) {
    assert.equal(isSafeForAppUpdate({ name }), true, name);
  }
  assert.equal(updateInstructionForRoute({ name: "jobs" }), "A newer version of the inspection app is ready.");
});

test("unclassified future routes fail closed until explicitly reviewed", () => {
  assert.equal(isSafeForAppUpdate({ name: "future-unclassified-route" }), false);
});
