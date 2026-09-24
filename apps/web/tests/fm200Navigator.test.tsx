import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SystemNavigator } from "../src/jobs/SystemNavigator";
import type { JobSystemSnapshot } from "../src/jobs/jobTypes";

const system = {
  enabledSystemId: "00000000-0000-4000-8000-000000000001",
  systemKey: "fm200_fire_suppression",
  displayName: "FM200 System",
  sortOrder: 1,
  definitionStatus: "confirmed",
  zones: [],
  locations: []
} as JobSystemSnapshot;

test("legacy FM200 visit with no frozen location offers a new visit instead of an unusable Open action", () => {
  const html = renderToStaticMarkup(<SystemNavigator system={system} progress="Not Started" onBack={() => undefined} onOpenSuppressionLocations={() => undefined} onNewServiceVisit={() => undefined} />);
  assert.match(html, /created without FM200 locations/);
  assert.match(html, /Start New Service Visit/);
  assert.doesNotMatch(html, /Open FM200 Locations/);
});

test("configured FM200 visit exposes its location entry", () => {
  const configured = { ...system, locations: [{ id: "00000000-0000-4000-8000-000000000002", enabledSystemId: system.enabledSystemId, zoneId: null, key: "panel", displayName: "FM200 Panel", sortOrder: 1, presetRowCount: 1, rowPreset: {} }] } as JobSystemSnapshot;
  const html = renderToStaticMarkup(<SystemNavigator system={configured} progress="Not Started" onBack={() => undefined} onOpenSuppressionLocations={() => undefined} />);
  assert.match(html, /FM200 Panel/);
  assert.match(html, /Open FM200 Locations/);
  assert.doesNotMatch(html, /Start New Service Visit/);
});
