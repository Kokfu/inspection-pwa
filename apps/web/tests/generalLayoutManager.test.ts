import assert from "node:assert/strict";
import test from "node:test";
import { isGeneralLayout, loadLocationProposals, loadManagerLocations, ManagerApiError, offersAddLocation } from "../src/manager/managerApi.js";
import { generalLayoutKey, layoutLocationKey } from "../src/inspectionControls/rowLayout.js";

/** Hydrant and Dry/Wet Riser save one zone-free "General layout" (I-62): what the Manager screens and the technician's
 *  Add-location entry do with it, and the 250-row cap their proposals share with the server (I-61). */

const general = { id: "l1", enabledSystemId: "e1", zoneId: null, key: "general", displayName: "General", presetRowCount: 3, rowPreset: { rows: [] }, sortOrder: 1 };
const zoned = { id: "l2", enabledSystemId: "e1", zoneId: "z1", key: "loc-a", displayName: "Location A", presetRowCount: 2, rowPreset: {}, sortOrder: 1 };
const zone = { id: "z1", enabledSystemId: "e1", key: "zone-a", displayName: "Zone A", sortOrder: 1 };

async function load(systemKey: string, body: Record<string, unknown>) {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ systemKey, templateVersion: 7, ...body }), { status: 200 });
  try { return await loadManagerLocations("c1", systemKey); } finally { globalThis.fetch = oldFetch; }
}

test("the Manager editor reads a Hydrant / Dry-Wet-Riser General layout and still reads the zoned shape", async () => {
  for (const systemKey of ["hydrant", "dry_wet_riser"]) {
    const result = await load(systemKey, { zones: [], locations: [general] });
    assert.equal(result.locations[0]!.zoneId, null);
    assert.equal(isGeneralLayout(systemKey, result.zones, result.locations), true, systemKey);
    const zonedResult = await load(systemKey, { zones: [zone], locations: [zoned] });
    assert.equal(isGeneralLayout(systemKey, zonedResult.zones, zonedResult.locations), false, systemKey);
  }
});

test("a location without a zone is still an authority failure for every other system and for any mix", async () => {
  for (const systemKey of ["co2_fire_extinguisher", "wet_chemical", "fm200_fire_suppression"]) {
    await assert.rejects(load(systemKey, { zones: [], locations: [general] }), (error) => error instanceof ManagerApiError && error.kind === "unavailable", systemKey);
  }
  await assert.rejects(load("hydrant", { zones: [zone], locations: [general] }), ManagerApiError, "General layout has no zones");
  await assert.rejects(load("hydrant", { zones: [zone], locations: [zoned, general] }), ManagerApiError, "never mixed with a zoned location");
  await assert.rejects(load("hydrant", { zones: [], locations: [{ ...general, key: "annex" }] }), ManagerApiError, "the zone-free location must be the General one");
  await assert.rejects(load("hydrant", { zones: [], locations: [general, { ...general, id: "l9" }] }), ManagerApiError, "only one General location");
});

test("Add location is not offered for a General layout, and still is for zoned or empty Hydrant / Riser and the other zoned systems", () => {
  const entry = (systemKey: string, zones: unknown[], locations: Array<{ key: string; zoneId: unknown }>) => ({ systemKey, zones, locations });
  assert.equal(offersAddLocation(entry("hydrant", [], [general])), false);
  assert.equal(offersAddLocation(entry("dry_wet_riser", [], [general])), false);
  assert.equal(offersAddLocation(entry("hydrant", [zone], [zoned])), true);
  assert.equal(offersAddLocation(entry("dry_wet_riser", [], [])), true);
  assert.equal(offersAddLocation(entry("co2_fire_extinguisher", [], [])), true);
  assert.equal(offersAddLocation(entry("hose_reel", [], [])), false, "zone-free services save their layout from the form");
});

test("the layout is saved under the customer's one location, or 'general' when there is none", () => {
  assert.equal(generalLayoutKey, "general");
  assert.equal(layoutLocationKey({ zones: [], locations: [] }), "general");
  assert.equal(layoutLocationKey({ zones: [], locations: [{ key: "lobby" }] }), "lobby");
  assert.equal(layoutLocationKey({ zones: [{}], locations: [] }), undefined);
  assert.equal(layoutLocationKey({ zones: [{}], locations: [{ key: "a" }, { key: "b" }] }), undefined);
});

test("Admin inbox reads a General-layout proposal and refuses more than 250 rows for Hydrant and Dry/Wet Riser", async () => {
  const oldFetch = globalThis.fetch;
  const row = (index: number) => ({ assetReference: `R-${index}`, locationText: `Place ${index}` });
  const proposal = (systemKey: string, count: number) => ({
    id: crypto.randomUUID(), customerId: crypto.randomUUID(), customerDisplayName: "Test Customer", systemKey, jobId: crypto.randomUUID(),
    submittedByUserId: 1, submittedBy: "Technician", submittedByRole: "inspector", submittedAt: "2026-10-11T00:00:00.000Z",
    payload: { kind: "update-format", locationKey: "general", rows: Array.from({ length: count }, (_, index) => row(index)) }, status: "pending", decision: null
  });
  try {
    for (const systemKey of ["hydrant", "dry_wet_riser"]) {
      const accepted = [proposal(systemKey, 250)];
      globalThis.fetch = async () => new Response(JSON.stringify({ proposals: accepted }), { status: 200 });
      assert.deepEqual((await loadLocationProposals("pending")).proposals.length, 1, `${systemKey}: 250 rows`);
      const tooMany = [proposal(systemKey, 251)];
      globalThis.fetch = async () => new Response(JSON.stringify({ proposals: tooMany }), { status: 200 });
      const result = await loadLocationProposals("pending");
      assert.deepEqual(result.proposals, [], `${systemKey}: 251 rows is not a decidable proposal`);
      assert.equal(result.unreadable.length, 1);
    }
    // CO2 keeps its larger zoned cap.
    const co2 = { ...proposal("co2_fire_extinguisher", 0), payload: { kind: "update-format", locationKey: "loc-a", rows: Array.from({ length: 300 }, () => ({ alarmZone: "Z", location: "L" })) } };
    globalThis.fetch = async () => new Response(JSON.stringify({ proposals: [co2] }), { status: 200 });
    assert.equal((await loadLocationProposals("pending")).proposals.length, 1);
  } finally { globalThis.fetch = oldFetch; }
});
