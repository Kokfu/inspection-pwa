import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLocationProposalPatch, parseLocationConfigurationInput, parseLocationProposalPatch, type LocationConfigurationInput
} from "./locationConfiguration.js";

const base: LocationConfigurationInput = {
  zones: [{ key: "zone-a", displayName: "Zone A", sortOrder: 1 }],
  locations: [{ key: "loc-a", displayName: "Location A", zoneId: "zone-a", presetRowCount: 2, rowPreset: {}, sortOrder: 1 }]
};

test("parseLocationProposalPatch: add-location requires exactly one of zoneKey / newZone", () => {
  assert.equal(parseLocationProposalPatch({ kind: "add-location", locationKey: "x", displayName: "X", zoneKey: null, newZone: null }), undefined, "neither set");
  assert.equal(parseLocationProposalPatch({
    kind: "add-location", locationKey: "x", displayName: "X", zoneKey: "zone-a", newZone: { key: "z", displayName: "Z" }
  }), undefined, "both set");
  const withZoneKey = parseLocationProposalPatch({ kind: "add-location", locationKey: "x", displayName: "X", zoneKey: "zone-a", newZone: null });
  assert.deepEqual(withZoneKey, { kind: "add-location", locationKey: "x", displayName: "X", zoneKey: "zone-a", newZone: null });
  const withNewZone = parseLocationProposalPatch({ kind: "add-location", locationKey: "x", displayName: "X", zoneKey: null, newZone: { key: "z", displayName: "Z" } });
  assert.deepEqual(withNewZone, { kind: "add-location", locationKey: "x", displayName: "X", zoneKey: null, newZone: { key: "z", displayName: "Z" } });
});

test("parseLocationProposalPatch: update-format requires at least one row, allows empty row text", () => {
  assert.equal(parseLocationProposalPatch({ kind: "update-format", locationKey: "loc-a", rows: [] }), undefined, "no rows");
  assert.equal(parseLocationProposalPatch({ kind: "update-format", locationKey: "loc-a", rows: [{ alarmZone: "A" }] }), undefined, "row missing location");
  const parsed = parseLocationProposalPatch({ kind: "update-format", locationKey: "loc-a", rows: [{ alarmZone: "", location: "" }, { alarmZone: "Zone A", location: "Zone A Room" }] });
  assert.deepEqual(parsed, { kind: "update-format", locationKey: "loc-a", rows: [{ alarmZone: "", location: "" }, { alarmZone: "Zone A", location: "Zone A Room" }] });
});

test("parseLocationProposalPatch: unknown kind or extra keys refused", () => {
  assert.equal(parseLocationProposalPatch({ kind: "delete-location", locationKey: "x" }), undefined);
  assert.equal(parseLocationProposalPatch({ kind: "update-format", locationKey: "loc-a", rows: [{ alarmZone: "a", location: "b" }], extra: 1 }), undefined);
});

test("applyLocationProposalPatch update-format: replaces the target location's count+rowPreset, leaves everything else byte-identical", () => {
  const patch = { kind: "update-format" as const, locationKey: "loc-a", rows: [{ alarmZone: "Zone A", location: "Zone A Room" }, { alarmZone: "Zone B", location: "Zone B Room" }] };
  const merged = applyLocationProposalPatch(base, patch)!;
  assert.equal(merged.locations[0]!.presetRowCount, 2);
  assert.deepEqual(merged.locations[0]!.rowPreset, { rows: patch.rows });
  assert.equal(merged.locations[0]!.key, "loc-a");
  assert.equal(merged.locations[0]!.displayName, "Location A");
  assert.equal(merged.locations[0]!.zoneId, "zone-a");
  assert.deepEqual(merged.zones, base.zones);
});

test("applyLocationProposalPatch update-format: unknown locationKey is refused", () => {
  const patch = { kind: "update-format" as const, locationKey: "ghost", rows: [{ alarmZone: "a", location: "b" }] };
  assert.equal(applyLocationProposalPatch(base, patch), undefined);
});

test("Roller Shutter format: strict row keys, implicit zone-free General, then update in place", () => {
  const first = { kind: "update-format" as const, locationKey: "general", rows: [
    { assetReference: "RS-01", locationText: "North lobby" },
    { assetReference: "RS-02", locationText: "Loading bay" }
  ] };
  assert.deepEqual(parseLocationProposalPatch(first, "fire_rated_roller_shutter"), first);
  assert.equal(parseLocationProposalPatch({ ...first, rows: [{ ...first.rows[0], alarmZone: "wrong" }] }, "fire_rated_roller_shutter"), undefined);
  assert.equal(parseLocationProposalPatch(first, "co2_fire_extinguisher"), undefined);
  assert.equal(parseLocationProposalPatch({ ...first, locationKey: "another" }, "fire_rated_roller_shutter"), undefined);
  const initial: LocationConfigurationInput = { zones: [], locations: [] };
  const created = applyLocationProposalPatch(initial, first, "fire_rated_roller_shutter")!;
  assert.deepEqual(created, { zones: [], locations: [{ key: "general", displayName: "General", zoneId: null,
    presetRowCount: 2, rowPreset: { rows: first.rows }, sortOrder: 1 }] });
  const second = { ...first, rows: [{ assetReference: "RS-03", locationText: "Plant room" }] };
  const updated = applyLocationProposalPatch(created, second, "fire_rated_roller_shutter")!;
  assert.equal(updated.locations.length, 1);
  assert.deepEqual(updated.locations[0], { ...created.locations[0], presetRowCount: 1, rowPreset: { rows: second.rows } });
  const submitted = { zones: [], locations: updated.locations.map(({ sortOrder: _sortOrder, ...location }) => location) };
  assert.deepEqual(parseLocationConfigurationInput(submitted, "fire_rated_roller_shutter"), updated);
  assert.equal(parseLocationConfigurationInput(submitted), undefined, "zone-requiring systems still reject null zones");
  assert.equal(applyLocationProposalPatch(initial, first), undefined, "other systems cannot implicitly create a format target");
});

test("Roller Shutter configuration permits one zone-free General layout only", () => {
  const general = { key: "general", displayName: "General", zoneId: null, presetRowCount: 1, rowPreset: {} };
  assert.ok(parseLocationConfigurationInput({ zones: [], locations: [general] }, "fire_rated_roller_shutter"));
  assert.equal(parseLocationConfigurationInput({ zones: [], locations: [general, { ...general, key: "second" }] }, "fire_rated_roller_shutter"), undefined);
  assert.equal(parseLocationConfigurationInput({ zones: [], locations: [{ ...general, key: "other" }] }, "fire_rated_roller_shutter"), undefined);
  assert.equal(parseLocationConfigurationInput({ zones: [], locations: [{ ...general, presetRowCount: 251 }] }, "fire_rated_roller_shutter"), undefined);
});

test("Hose Reel format creates one zone-free General location and updates it in place", () => {
  const first = { kind: "update-format" as const, locationKey: "general", rows: [
    { assetReference: "HR-01", locationText: "North lobby", drumType: "swing" },
    { assetReference: "HR-02", locationText: "Loading bay", drumType: "fixed" }
  ] };
  assert.deepEqual(parseLocationProposalPatch(first, "hose_reel"), first);
  for (const invalid of [
    { ...first, locationKey: "other" },
    { ...first, rows: [{ ...first.rows[0], drumType: "other" }] },
    { ...first, rows: [{ ...first.rows[0], unexpected: "x" }] },
    { ...first, rows: [{ ...first.rows[0], locationText: "" }] }
  ]) assert.equal(parseLocationProposalPatch(invalid, "hose_reel"), undefined);
  assert.equal(parseLocationProposalPatch({ kind: "add-location", locationKey: "general", displayName: "General", zoneKey: null, newZone: { key: "x", displayName: "X" } }, "hose_reel"), undefined);
  const initial: LocationConfigurationInput = { zones: [], locations: [] };
  const created = applyLocationProposalPatch(initial, first, "hose_reel")!;
  assert.deepEqual(created.locations, [{ key: "general", displayName: "General", zoneId: null,
    presetRowCount: 2, rowPreset: { rows: first.rows }, sortOrder: 1 }]);
  const second = { ...first, rows: [{ assetReference: "HR-03", locationText: "Plant", drumType: "" }] };
  const updated = applyLocationProposalPatch(created, second, "hose_reel")!;
  assert.deepEqual(updated.locations[0], { ...created.locations[0], presetRowCount: 1, rowPreset: { rows: second.rows } });
  assert.deepEqual(parseLocationConfigurationInput({ zones: [], locations: updated.locations.map(({ sortOrder: _sortOrder, ...location }) => location) }, "hose_reel"), updated);
  assert.equal(applyLocationProposalPatch(initial, first), undefined);
});

test("Fire Alarm format: two independent zone-free pseudo-locations, one per repeatable table", () => {
  const primaryPatch = { kind: "update-format" as const, locationKey: "general-primary", rows: [
    { assetReference: "FA-01", alarmZone: "Zone A", location: "Level 1 Lobby" },
    { assetReference: "FA-02", alarmZone: "Zone B", location: "Level 2 Corridor" }
  ] };
  const secondaryPatch = { kind: "update-format" as const, locationKey: "general-secondary", rows: [
    { assetReference: "FA-10", location: "Guard House Panel" }
  ] };
  assert.deepEqual(parseLocationProposalPatch(primaryPatch, "fire_alarm_detector"), primaryPatch);
  assert.deepEqual(parseLocationProposalPatch(secondaryPatch, "fire_alarm_detector"), secondaryPatch);
  // Secondary's {assetReference, location} shape is refused for general-primary and vice versa.
  assert.equal(parseLocationProposalPatch({ ...primaryPatch, rows: secondaryPatch.rows }, "fire_alarm_detector"), undefined, "secondary shape refused for general-primary");
  assert.equal(parseLocationProposalPatch({ ...secondaryPatch, rows: primaryPatch.rows }, "fire_alarm_detector"), undefined, "primary shape refused for general-secondary");
  // Only the two known pseudo-locations are valid targets -- no technician-named location, no add-location.
  assert.equal(parseLocationProposalPatch({ ...primaryPatch, locationKey: "general" }, "fire_alarm_detector"), undefined);
  assert.equal(parseLocationProposalPatch({ kind: "add-location", locationKey: "general-primary", displayName: "X", zoneKey: null, newZone: { key: "z", displayName: "Z" } }, "fire_alarm_detector"), undefined);

  const initial: LocationConfigurationInput = { zones: [], locations: [] };
  const afterPrimary = applyLocationProposalPatch(initial, primaryPatch, "fire_alarm_detector")!;
  assert.deepEqual(afterPrimary.locations, [{ key: "general-primary", displayName: "General (Primary Devices)", zoneId: null,
    presetRowCount: 2, rowPreset: { fireAlarmTable: "primary", rows: primaryPatch.rows }, sortOrder: 1 }]);
  // Approving the second table's format APPENDS a second location rather than clobbering the first --
  // this is the behavior Roller Shutter/Hose Reel never needed (they have only one pseudo-location).
  const afterBoth = applyLocationProposalPatch(afterPrimary, secondaryPatch, "fire_alarm_detector")!;
  assert.equal(afterBoth.locations.length, 2);
  assert.deepEqual(afterBoth.locations[0], afterPrimary.locations[0], "the primary location is untouched by the secondary approval");
  assert.deepEqual(afterBoth.locations[1], { key: "general-secondary", displayName: "General (Secondary Alarm Devices)", zoneId: null,
    presetRowCount: 1, rowPreset: { fireAlarmTable: "secondary", rows: secondaryPatch.rows }, sortOrder: 2 });

  // A second update-format against an already-bootstrapped location replaces its rows in place and
  // keeps `fireAlarmTable` -- losing that routing would make `fireAlarmRepository.ts`'s
  // `configuredRows()` throw "missing or invalid row routing" on the very next visit.
  const secondPrimaryPatch = { ...primaryPatch, rows: [{ assetReference: "FA-99", alarmZone: "Zone C", location: "Roof Plant Room" }] };
  const updated = applyLocationProposalPatch(afterBoth, secondPrimaryPatch, "fire_alarm_detector")!;
  assert.deepEqual(updated.locations[0], { ...afterBoth.locations[0], presetRowCount: 1, rowPreset: { fireAlarmTable: "primary", rows: secondPrimaryPatch.rows } });
  assert.deepEqual(updated.locations[1], afterBoth.locations[1], "the secondary location is untouched");

  // Round-trips through the Manager's own direct editor validator too (zone-free, capped at 250, two keys).
  const submitted = { zones: [], locations: updated.locations.map(({ sortOrder: _sortOrder, ...location }) => location) };
  assert.deepEqual(parseLocationConfigurationInput(submitted, "fire_alarm_detector"), updated);
  assert.equal(parseLocationConfigurationInput({ zones: [], locations: [{ ...submitted.locations[0]!, key: "third" }] }, "fire_alarm_detector"), undefined, "unknown pseudo-location key refused");
  assert.equal(parseLocationConfigurationInput({ zones: [], locations: [submitted.locations[0]!, submitted.locations[1]!, { ...submitted.locations[0]!, key: "general-primary" }] }, "fire_alarm_detector"), undefined, "more than two locations refused");
});

test("Hydrant / Dry-Wet-Riser format: assetReference/locationText rows accepted, zone-requiring add-location still required (not zone-free)", () => {
  for (const systemKey of ["hydrant", "dry_wet_riser"]) {
    const patch = { kind: "update-format" as const, locationKey: "loc-a", rows: [
      { assetReference: "HY-01", locationText: "North wall" },
      { assetReference: "HY-02", locationText: "South wall" }
    ] };
    assert.deepEqual(parseLocationProposalPatch(patch, systemKey), patch, systemKey);
    // The system's own {alarmZone, location} shape is refused once assetReference/locationText fields apply.
    assert.equal(parseLocationProposalPatch({ kind: "update-format", locationKey: "loc-a", rows: [{ alarmZone: "a", location: "b" }] }, systemKey), undefined, systemKey);
    // Unlike Roller Shutter / Hose Reel, these systems are NOT zone-free: an update-format against a
    // location that does not yet exist must be refused, not implicitly create a General location.
    const empty: LocationConfigurationInput = { zones: [], locations: [] };
    assert.equal(applyLocationProposalPatch(empty, patch, systemKey), undefined, systemKey);
    // The real merge against an existing zoned location works exactly like CO2/FM200.
    const merged = applyLocationProposalPatch(base, patch, systemKey)!;
    assert.equal(merged.locations[0]!.presetRowCount, 2);
    assert.deepEqual(merged.locations[0]!.rowPreset, { rows: patch.rows });
    // add-location (naming a brand-new location) remains available, unlike the zone-free systems.
    const addPatch = { kind: "add-location" as const, locationKey: "loc-b", displayName: "Location B", zoneKey: "zone-a", newZone: null };
    assert.deepEqual(parseLocationProposalPatch(addPatch, systemKey), addPatch, systemKey);
    assert.ok(applyLocationProposalPatch(base, addPatch, systemKey), systemKey);
  }
});

test("applyLocationProposalPatch add-location: appends a new location under an existing zone, leaves existing locations untouched", () => {
  const patch = { kind: "add-location" as const, locationKey: "loc-b", displayName: "Location B", zoneKey: "zone-a", newZone: null };
  const merged = applyLocationProposalPatch(base, patch)!;
  assert.equal(merged.locations.length, 2);
  assert.deepEqual(merged.locations[0], base.locations[0], "existing location A untouched");
  assert.deepEqual(merged.locations[1], { key: "loc-b", displayName: "Location B", zoneId: "zone-a", presetRowCount: 1, rowPreset: {}, sortOrder: 2 });
  assert.deepEqual(merged.zones, base.zones, "no new zone created when zoneKey references an existing one");
});

test("applyLocationProposalPatch add-location: appends a brand-new zone when newZone is given", () => {
  const patch = { kind: "add-location" as const, locationKey: "loc-b", displayName: "Location B", zoneKey: null, newZone: { key: "zone-b", displayName: "Zone B" } };
  const merged = applyLocationProposalPatch(base, patch)!;
  assert.deepEqual(merged.zones, [...base.zones, { key: "zone-b", displayName: "Zone B", sortOrder: 2 }]);
  assert.equal(merged.locations[1]!.zoneId, "zone-b");
});

test("applyLocationProposalPatch add-location: locationKey collision refused", () => {
  const patch = { kind: "add-location" as const, locationKey: "loc-a", displayName: "Duplicate", zoneKey: "zone-a", newZone: null };
  assert.equal(applyLocationProposalPatch(base, patch), undefined);
});

test("applyLocationProposalPatch add-location: unknown zoneKey refused", () => {
  const patch = { kind: "add-location" as const, locationKey: "loc-b", displayName: "Location B", zoneKey: "ghost-zone", newZone: null };
  assert.equal(applyLocationProposalPatch(base, patch), undefined);
});

test("applyLocationProposalPatch add-location: newZone key colliding with an existing zone is refused", () => {
  const patch = { kind: "add-location" as const, locationKey: "loc-b", displayName: "Location B", zoneKey: null, newZone: { key: "zone-a", displayName: "Renamed" } };
  assert.equal(applyLocationProposalPatch(base, patch), undefined);
});

test("applyLocationProposalPatch add-location: works against an empty (not-yet-enabled) system", () => {
  const empty: LocationConfigurationInput = { zones: [], locations: [] };
  const patch = { kind: "add-location" as const, locationKey: "general", displayName: "General", zoneKey: null, newZone: { key: "general", displayName: "General" } };
  const merged = applyLocationProposalPatch(empty, patch)!;
  assert.equal(merged.zones.length, 1);
  assert.equal(merged.locations.length, 1);
});
