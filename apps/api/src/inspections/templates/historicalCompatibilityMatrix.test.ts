import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { validateFireAlarmHistoricalPayload } from "../fireAlarmAccepted.js";
import { parseV6EvidenceManifest } from "../evidence/fireAlarmV6Evidence.js";
import { masterServiceReportV1 } from "./masterServiceReportV1.js";
import { masterServiceReportV2 } from "./masterServiceReportV2.js";
import { fireAlarmDetectorV3, masterServiceReportV3 } from "./masterServiceReportV3.js";
import { masterServiceReportV4 } from "./masterServiceReportV4.js";
import { masterServiceReportV5 } from "./masterServiceReportV5.js";
import { masterServiceReportV6 } from "./masterServiceReportV6.js";
import { resolveFireAlarmControls, resolveFireAlarmV6Controls } from "./fireAlarmDefinitionControls.js";
import { isCompatibleSystemContract } from "./systemContractCompatibility.js";

const uuid = () => randomUUID();
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}` : JSON.stringify(value);
const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
const templates = [masterServiceReportV1, masterServiceReportV2, masterServiceReportV3, masterServiceReportV4, masterServiceReportV5] as const;
const published = [
  [1, "00000000-0000-4000-8000-000000000501", "347b56418a2127e7ffb3f777ecb9ce8439785a3d184ca02396e37c2ccca25ec9"],
  [2, "00000000-0000-4000-8000-000000000802", "370dadc8677d228bb92218077fe807ed44f36959acf51c95131d64c26ee7de2e"],
  [3, "00000000-0000-4000-8000-000000000803", "575ec40b625eba83b823b2f7f8bcc994f2809d7fac0ce5da19eac455233df5ae"],
  [4, "00000000-0000-4000-8000-000000000804", "7a9140d848ed11658344d2b682904bec75ddecafc082c6fc281228e5160311b2"],
  [5, "00000000-0000-4000-8000-000000000805", "d70a5f085da862b5ea286419e16db6cbced8f53a2390b9a3a3f2ddc9ab4c2c11"]
] as const;

const checklist = (result: "good" | "poor", remarks = "") => ({ result, remarks });
function historicalResponse(result: "good" | "poor" = "poor") {
  return { schemaVersion: 1, controlPanelLocation: "Historical panel", primaryDeviceRows: [{ rowUuid: uuid(), source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, displaySequence: 1, assetReference: "", alarmZone: "Zone A", location: "Lobby", manualCallPoint: "normal", flowSwitch: "test", heatDetector: "isolation", smokeDetector: "normal", remarks: "Historical row remark" }], chargerAndBatteries: { main_supply: checklist("good"), battery: checklist(result, result === "poor" ? "Historical poor needs no V6 photo" : ""), charger: checklist("good") }, mainFunctionKeys: { main_alarm_reset: checklist("good"), lamp_test: checklist("good"), evacuate: checklist("good"), ac_supply: checklist("good"), dc_supply: checklist("good"), spka_system: checklist("good"), alarm_lift_trip: checklist("good"), signal_gas_discharge: checklist("good") }, secondaryAlarmDeviceRows: [], comments: "Historical comments" };
}
function historicalSnapshot(template: typeof masterServiceReportV1 | typeof masterServiceReportV3 | typeof masterServiceReportV4 | typeof masterServiceReportV5, definition: unknown) {
  const jobId = uuid(), revisionId = uuid(), enabledSystemId = uuid(); const controls = resolveFireAlarmControls(definition, "MFE-FSSR", template.version);
  return { schemaVersion: 1, acceptedAt: "2026-08-28T00:00:00.000Z", job: { id: jobId, reference: `HIST-${template.version}`, title: "Historical Fire Alarm" }, customer: { id: uuid(), code: "HIST", displayName: "Historical Customer" }, configuration: { revisionId, revisionNumber: 1 }, template: { id: template.id, code: "MFE-FSSR", version: template.version }, system: { enabledSystemId, systemKey: "fire_alarm_detector", displayName: "Fire Alarm / Detector System", sortOrder: 5, definitionStatus: "confirmed", zones: [], locations: [], definition, resolvedControls: controls, repetitionMode: "single_with_two_repeatable_tables" }, instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null } };
}

test("published V1-V5 constants remain frozen and V6 is selected only by its frozen identity", () => {
  for (const [index, template] of templates.entries()) { const [version, id, expectedHash] = published[index]!; assert.equal(template.version, version); assert.equal(template.id, id); assert.equal(template.code, "MFE-FSSR"); assert.notEqual(template.id, masterServiceReportV6.id); assert.ok(template.systems.length > 0); if (expectedHash) assert.equal(hash(template), expectedHash, `V${version} canonical published template hash`); }
  assert.equal(isCompatibleSystemContract("fire_alarm_detector", "confirmed", fireAlarmDetectorV3, { id: masterServiceReportV3.id, version: 3 }), true, "V3 remains the frozen historical Fire Alarm contract source");
  for (const template of [masterServiceReportV4, masterServiceReportV5]) { assert.equal(isCompatibleSystemContract("fire_alarm_detector", "confirmed", fireAlarmDetectorV3, { id: template.id, version: template.version }), false, `V${template.version} does not rewrite V3's historical Fire Alarm contract identity`); assert.doesNotThrow(() => resolveFireAlarmControls(fireAlarmDetectorV3, "MFE-FSSR", template.version)); }
  assert.deepEqual(resolveFireAlarmV6Controls(masterServiceReportV6.systems.find((system) => system.key === "fire_alarm_detector")!).chargerAndBatteries[0]?.result.options.map((option) => option.value), ["good", "poor", "not_relevant"]);
});

test("historical Fire Alarm V3/V4/V5 accepts Good/Poor and rejects V6 widening without V6 evidence", () => {
  for (const template of [masterServiceReportV3, masterServiceReportV4, masterServiceReportV5]) {
    const snapshot = historicalSnapshot(template, fireAlarmDetectorV3); const poor = historicalResponse("poor");
    assert.equal(validateFireAlarmHistoricalPayload(snapshot, poor), true, `V${template.version} accepted Poor remains grandfathered without manifest, fieldRemarks, staged evidence, or schema v2`);
    const notRelevant = structuredClone(poor) as any; notRelevant.chargerAndBatteries.battery.result = "not_relevant"; assert.equal(validateFireAlarmHistoricalPayload(snapshot, notRelevant), false, `V${template.version} Good/Poor rejects not_relevant`);
    const invalidDevice = structuredClone(poor) as any; invalidDevice.primaryDeviceRows[0].manualCallPoint = "not_relevant"; assert.equal(validateFireAlarmHistoricalPayload(snapshot, invalidDevice), false, `V${template.version} Normal/Test/Isolation rejects not_relevant`);
    assert.equal((poor.secondaryAlarmDeviceRows[0] as any)?.fieldRemarks, undefined, `V${template.version} historical row shape has no V6 fieldRemarks`);
  }
});

test("V2 Dry/Wet and malformed V6 remain isolated from historical Fire Alarm parsing", () => {
  const dryWet = masterServiceReportV2.systems.find((system) => system.key === "dry_wet_riser")!; assert.equal(isCompatibleSystemContract("dry_wet_riser", "confirmed", dryWet, { id: masterServiceReportV2.id, version: 2 }), true); assert.ok(canonical(dryWet).includes('"allowedValues":["good","poor"]'), "V2's frozen Good/Poor fields retain only their historical tokens");
  const malformedV6Snapshot = { schemaVersion: 2, template: { id: masterServiceReportV6.id, code: "MFE-FSSR", version: 6 }, system: { definition: masterServiceReportV6.systems.find((system) => system.key === "fire_alarm_detector") } }; assert.equal(validateFireAlarmHistoricalPayload(malformedV6Snapshot, { schemaVersion: 1 }), false, "malformed V6 cannot fall back to a V1-V5 Fire Alarm parser"); assert.equal(parseV6EvidenceManifest([{ photoUuid: uuid(), fieldPath: "charger_batteries.charger_battery_checks.battery", sourceSha256: "bad" }]), undefined, "malformed V6 evidence manifest fails closed");
});
