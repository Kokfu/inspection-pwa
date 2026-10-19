import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture, systems, setResult } from "./fieldCatalogFixtures.test-support.js";
import { readFindingParts, type R } from "./fieldCatalogReaders.js";
import { configurationCatalogFields, layoutRowUuid, orderCatalog, serviceCatalogFields } from "./fieldCatalog.js";
import type { PreviousVisit } from "./previousVisits.js";
import { legacyFireAlarmV7Fixture } from "./historicalFixtures.test-support.js";

const visit: PreviousVisit = { kind: "service", visitId: randomUUID(), visitNumber: "SV-20261012-1", visitDate: "2026-10-12", createdAt: "2026-10-12T00:00:00.000Z", createdByUserId: 1 };
for (const system of systems) test(`${system}: all results, stable repeated units, no measurements or quantities`, () => {
  const f = fixture(system);
  // Repeatable row tables retain UUID identity even when their display order changes.
  const collection = system === "fire_alarm_detector" ? "secondaryAlarmDeviceRows" : system === "dry_wet_riser" ? "riserOutlets" : "rows";
  const rows = f.response[collection];
  if (Array.isArray(rows)) {
    const second = structuredClone(rows[0]) as R;
    second.rowUuid = randomUUID();
    second[system === "fire_alarm_detector" ? "displaySequence" : "sortOrder"] = 2;
    rows.push(second);
    if (system === "fire_intercom") for (let i = 3; i <= 4; i++) rows.push({ ...structuredClone(second), rowUuid: randomUUID(), sortOrder: i });
  }
  const paths = f.adapter.derivePhotoFieldPaths(f.response)!;
  const all = [...paths.required, ...paths.optional];
  assert.ok(all.length > 2);
  all.forEach((path, i) => setResult(system, f.response, path, i === 0 ? "not_good" : i % 2 ? "good" : "na"));
  const scope = f.adapter.derivePhotoFieldPaths(f.response)!;
  if ("evidenceManifest" in f.snapshot) f.snapshot.evidenceManifest = scope.required.map(fieldPath => ({ fieldPath, photoUuid: randomUUID(), sourceSha256: "a".repeat(64) }));
  const read = readFindingParts(f.row);
  assert.equal(read.parts.length, all.length);
  assert.ok(read.parts.some(p => p.result === "good")); assert.ok(read.parts.some(p => p.result === "na"));
  const photo = { photoUuid: randomUUID(), fieldPath: "", sourceSha256: "a".repeat(64), storedSha256: "b".repeat(64), sizeBytes: 100, width: 2, height: 2, storageRelativePath: "private.jpg" };
  const parts = read.parts.map(p => ({ ...p, beforePhoto: p.result === "good" && p.fieldPath === read.parts.find(v => v.result === "good")?.fieldPath ? photo : null }));
  const fields = orderCatalog(serviceCatalogFields(f.row, parts, visit));
  assert.ok(fields.length > 0);
  assert.equal(fields[0]!.before!.result, "not_good");
  assert.ok(fields.some(p => p.before?.result === "good" && p.before.photo));
  assert.ok(fields.some(p => p.before?.result === "good" && !p.before.photo));
  assert.ok(fields.every(p => !p.identity.sectionKey.includes("measurement")));
  if (Array.isArray(rows)) {
    const rowIds = new Set(fields.map(p => p.identity.rowUuid).filter(Boolean));
    assert.equal(rowIds.size, rows.length);
    const oldIdentities = fields.map(p => JSON.stringify(p.identity)).sort();
    rows.reverse().forEach((row, i) => row[system === "fire_alarm_detector" ? "displaySequence" : "sortOrder"] = i + 1);
    const reRead = readFindingParts(f.row);
    assert.deepEqual(serviceCatalogFields(f.row, reRead.parts.map(p => ({ ...p, beforePhoto: null })), visit).map(p => JSON.stringify(p.identity)).sort(), oldIdentities);
  } else if (["co2_fire_extinguisher", "wet_chemical", "fm200_fire_suppression"].includes(system)) {
    const other = structuredClone(f.row), locationId = randomUUID();
    other.locationId = locationId;
    const snapshot = other.inspectionSnapshot as R;
    const instance = snapshot.instance as R;
    instance.location = { id: locationId, displayName: "Second Room" }; instance.instanceKey = `location:${locationId}`; other.instanceKey = instance.instanceKey;
    const combined = orderCatalog([...fields, ...serviceCatalogFields(other, parts, visit)]);
    assert.equal(new Set(combined.map(p => p.identity.locationId)).size, 2);
  }
  const locations = [{ id: randomUUID(), zoneId: null, displayName: "Room", presetRowCount: 2,
    rowPreset: system === "fire_alarm_detector" ? { fireAlarmTable: "secondary", rows: [{ assetReference: "A", location: "Floor 1" }, { assetReference: "B", location: "Floor 2" }] }
      : ["fire_intercom", "smoke_ventilation"].includes(system) ? { rows: [{ assetReference: "A" }, { assetReference: "B" }] }
      : system === "hose_reel" ? { rows: [{ assetReference: "A", locationText: "Floor 1", drumType: "swing" }, { assetReference: "B", locationText: "Floor 2", drumType: "fixed" }] }
      : { rows: [{ assetReference: "A", locationText: "Floor 1" }, { assetReference: "B", locationText: "Floor 2" }] } }];
  const configured = configurationCatalogFields({ systemKey: system, displayName: system, definition: f.definition }, locations, [], randomUUID(), String(f.row.templateId));
  assert.ok(configured.length > 0); assert.ok(configured.every(v => v.before === null));
  if (configured.some(v => v.identity.rowUuid)) assert.equal(new Set(configured.map(v => v.identity.rowUuid).filter(Boolean)).size, 2);
  for (const version of [1, 2, 3, 4, 5, 6]) {
    const bad = structuredClone(f.row); ((bad.inspectionSnapshot as R).template as R).version = version;
    assert.throws(() => readFindingParts(bad), /invalid/);
  }
});

test("layout identity survives reorder; duplicate labels retain distinct units; PFE excluded", () => {
  const f = fixture("hydrant"), revision = randomUUID(), locationId = randomUUID();
  const rows = [{ assetReference: "A", locationText: "Floor 1" }, { assetReference: "B", locationText: "Floor 2" }];
  const location = { id: locationId, zoneId: null, displayName: "Room", presetRowCount: 2, rowPreset: { rows } };
  const read = () => configurationCatalogFields({ systemKey: "hydrant", displayName: "Hydrant", definition: f.definition }, [location], [], revision, String(f.row.templateId));
  const ids = read().map(v => JSON.stringify(v.identity)).sort(); rows.reverse(); assert.deepEqual(read().map(v => JSON.stringify(v.identity)).sort(), ids);
  assert.equal(layoutRowUuid(revision, locationId, "A", "Floor 1"), layoutRowUuid(revision, locationId, "A", "Floor 1"));
  rows[1] = { ...rows[0]! };
  assert.equal(new Set(read().map(field => field.identity.rowUuid)).size, 2);
  assert.deepEqual(configurationCatalogFields({ systemKey: "portable_fire_extinguisher" }, [], [], revision, String(f.row.templateId)), []);
});

test("unnamed configured units and duplicate layouts preserve their UUID set across reads and reorder", () => {
  for (const systemKey of ["hydrant", "hose_reel", "dry_wet_riser", "smoke_ventilation", "fire_intercom", "fire_rated_roller_shutter", "fire_alarm_detector"]) {
    const f = fixture(systemKey), revision = randomUUID();
    const location = { id: randomUUID(), zoneId: null, displayName: "Room", presetRowCount: 3,
      rowPreset: systemKey === "fire_alarm_detector" ? { fireAlarmTable: "secondary" } : {} };
    const system = { systemKey, displayName: systemKey, definition: f.definition };
    const read = () => configurationCatalogFields(system, [location], [], revision, String(f.row.templateId));
    const identities = read().map(field => JSON.stringify(field.identity)).sort();
    assert.equal(new Set(read().map(field => field.identity.rowUuid).filter(Boolean)).size, 3, systemKey);
    assert.deepEqual(read().map(field => JSON.stringify(field.identity)).sort(), identities);
  }
  const f = fixture("hydrant"), revision = randomUUID();
  const rows = [{ assetReference: "A", locationText: "Room" }, { assetReference: "B", locationText: "Room" }, { assetReference: "A", locationText: "Room" }];
  const location = { id: randomUUID(), zoneId: null, displayName: "Room", presetRowCount: 3, rowPreset: { rows } };
  const read = () => configurationCatalogFields({ systemKey: "hydrant", displayName: "Hydrant", definition: f.definition }, [location], [], revision, String(f.row.templateId));
  const identities = read().map(field => JSON.stringify(field.identity)).sort();
  rows.reverse();
  assert.deepEqual(read().map(field => JSON.stringify(field.identity)).sort(), identities);
  rows.splice(0, rows.length, rows[1]!, rows[0]!, rows[2]!);
  assert.deepEqual(read().map(field => JSON.stringify(field.identity)).sort(), identities);
  location.rowPreset.rows = [{ assetReference: "A", locationText: "Room" }];
  assert.throws(read, /invalid/, "malformed row counts must still fail closed");
});

test("frozen earlier Fire Alarm V7 exposes all results without mutating its source or manifest", () => {
  const row = legacyFireAlarmV7Fixture(), original = structuredClone(row);
  const extracted = readFindingParts(row);
  const fields = orderCatalog(serviceCatalogFields(row, extracted.parts.map(part => ({ ...part, beforePhoto: null })), visit));
  assert.equal(fields.length, 13);
  assert.equal(fields.filter(field => field.before?.result === "not_good").length, 10);
  assert.ok(fields.some(field => field.before?.result === "good"));
  assert.ok(fields.some(field => field.before?.result === "na"));
  assert.equal(fields[0]!.before!.result, "not_good");
  assert.equal(extracted.requiredPaths.length, 10);
  assert.deepEqual(row, original);
  for (const change of [
    (r: R) => { (r.inspectionSnapshot as R).evidenceManifest = []; },
    (r: R) => { ((r.responses as R).primaryDeviceRows as R[])[0]!.smokeDetector = ["normal"]; },
    (r: R) => { (((r.responses as R).chargerAndBatteries as R).main_supply as R).result = "not_good"; }
  ]) {
    const bad = structuredClone(row); change(bad); assert.throws(() => readFindingParts(bad), /invalid/);
  }
});

test("Fire Alarm primary detector layouts do not create secondary result fields", () => {
  const f = fixture("fire_alarm_detector"), revision = randomUUID();
  const system = { systemKey: "fire_alarm_detector", displayName: "Fire Alarm", definition: f.definition };
  const fields = configurationCatalogFields(system, [{ id: randomUUID(), zoneId: null, displayName: "Primary", presetRowCount: 1,
    rowPreset: { fireAlarmTable: "primary", rows: [{ assetReference: "D1", alarmZone: "Zone A", location: "Lobby" }] } }], [], revision, String(f.row.templateId));
  assert.ok(fields.length > 0); assert.ok(fields.every(field => field.identity.rowUuid === null));
  assert.ok(fields.every(field => field.identity.sectionKey !== "alarm_devices"));
});

test("current configuration uses customer display labels without changing field identity", () => {
  const f = fixture("co2_fire_extinguisher");
  const fields = configurationCatalogFields({ systemKey: "co2_fire_extinguisher", displayName: "CO2", definition: f.definition,
    labelOverrides: { "chargerAndBatteries.main_supply": "Custom Supply" } }, [], [], randomUUID(), String(f.row.templateId));
  const supply = fields.find(v => v.identity.fieldKey === "main_supply")!;
  assert.equal(supply.fieldLabel, "Custom Supply"); assert.equal(supply.identity.sectionKey, "charger_batteries");
});

test("Roller Shutter current catalog keeps zones bound to distinct stable unit identities", () => {
  const f = fixture("fire_rated_roller_shutter"), revision = randomUUID();
  const rows = [
    { assetReference: "S1", locationText: "Lobby", zoneText: "North" },
    { assetReference: "S1", locationText: "Lobby", zoneText: "South" }
  ];
  const location = { id: randomUUID(), zoneId: null, displayName: "Lobby", presetRowCount: 2, rowPreset: { rows } };
  const read = () => configurationCatalogFields({ systemKey: "fire_rated_roller_shutter", displayName: "Shutter", definition: f.definition }, [location], [], revision, String(f.row.templateId));
  const units = () => read().filter(field => field.identity.fieldKey === "auto_alarm_mode")
    .map(field => [field.unitLabel, field.identity.rowUuid]).sort();
  const original = units();
  assert.deepEqual(original.map(([label]) => label), ["North / S1 / Lobby", "South / S1 / Lobby"]);
  assert.equal(new Set(original.map(([, uuid]) => uuid)).size, 2);
  rows.reverse(); assert.deepEqual(units(), original, "zone-to-UUID binding survives reorder");
  rows.push({ ...rows[0]! }); location.presetRowCount = 3;
  const duplicate = units();
  assert.ok(duplicate.some(([label]) => label === "North / S1 / Lobby"));
  assert.ok(duplicate.some(([label]) => label === "South / S1 / Lobby / Unit 1"));
  assert.ok(duplicate.some(([label]) => label === "South / S1 / Lobby / Unit 2"));
  assert.equal(new Set(duplicate.map(([, uuid]) => uuid)).size, 3);
  rows.reverse(); assert.deepEqual(units(), duplicate);
});

test("Roller Shutter accepted schema-2 zones identify the original rows and their own Before evidence", () => {
  const f = fixture("fire_rated_roller_shutter");
  f.response.schemaVersion = 2;
  const rows = f.response.rows as R[];
  Object.assign(rows[0]!, { assetReference: "S1", locationText: "Lobby", zoneText: "North" });
  rows.push({ ...structuredClone(rows[0]!), rowUuid: randomUUID(), sortOrder: 2, zoneText: "South" });
  f.snapshot.evidenceManifest = f.adapter.derivePhotoFieldPaths(f.response)!.required.map((fieldPath, i) => ({ fieldPath,
    photoUuid: randomUUID(), sourceSha256: i.toString(16).padStart(64, "0") }));
  const original = structuredClone(f.row);
  const parts = readFindingParts(f.row).parts;
  const photoByPath = new Map(parts.map(part => [part.fieldPath, { photoUuid: randomUUID(), sourceSha256: "a".repeat(64), storedSha256: "b".repeat(64),
    fieldPath: part.fieldPath, sizeBytes: 100, width: 2, height: 2, storageRelativePath: "fixture.jpg" }]));
  const fields = serviceCatalogFields(f.row, parts.map(part => ({ ...part, beforePhoto: photoByPath.get(part.fieldPath)! })), visit);
  for (const row of rows) {
    const ownFields = fields.filter(field => field.identity.rowUuid === row.rowUuid);
    assert.equal(ownFields.length, 2);
    assert.ok(ownFields.every(field => field.unitLabel === `${row.zoneText} / S1 / Lobby`));
    assert.ok(ownFields.every(field => field.identity.zoneId === null), "text headings are not configured zone UUIDs");
  }
  for (const part of parts) {
    const field = fields.find(field => field.identity.rowUuid === part.rowUuid && field.identity.fieldKey === part.fieldPath.split(".").at(-1))!;
    assert.equal(field.before?.photo?.photoUuid, photoByPath.get(part.fieldPath)!.photoUuid);
  }
  assert.deepEqual(f.row, original);
  const legacy = fixture("fire_rated_roller_shutter");
  const legacyFields = serviceCatalogFields(legacy.row, readFindingParts(legacy.row).parts.map(part => ({ ...part, beforePhoto: null })), visit);
  assert.ok(legacyFields.every(field => field.unitLabel === "Room"), "schema-1 labels stay unchanged");
});
