import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { parseServerFireAlarmDetail } from "../src/fireAlarm/serverFireAlarmApi";

const ids = { 3: "00000000-0000-4000-8000-000000000803", 4: "00000000-0000-4000-8000-000000000804", 5: "00000000-0000-4000-8000-000000000805", 6: "00000000-0000-4000-8000-000000000806" } as const;
const v6Hash = "deec720d8b9bebd4cca552748bfda24a5e4d99f5c13f22c0eee7e50f5cc8755d";
const result = (value: "good" | "poor" | "not_relevant", remarks = "") => ({ result: value, remarks });
function detail(version: 3 | 4 | 5 | 6) {
  const clientUuid = randomUUID(), jobId = randomUUID(), secondaryUuid = randomUUID();
  const v6 = version === 6;
  return {
    clientUuid, serverFormInstanceId: randomUUID(), jobId, jobReference: `TUPLE-V${version}`, jobTitle: "Accepted Fire Alarm", customerId: randomUUID(), customerCode: "TEST", customerName: "Test Customer", systemKey: "fire_alarm_detector", systemLabel: "Fire Alarm / Detector System", instanceKey: "primary", zoneId: null, locationId: null, displaySequence: 1, status: "submitted", performedAt: "2026-08-28T00:00:00.000000Z", receivedAt: "2026-08-28T00:01:00.000000Z",
    template: { id: ids[version], code: "MFE-FSSR", version }, configuration: { revisionId: randomUUID(), revisionNumber: 1 },
    contract: { masterTemplateId: ids[version], masterTemplateVersion: version, responseSchemaVersion: v6 ? 2 : 1, snapshotSchemaVersion: v6 ? 2 : 1, systemContractSha256: v6 ? v6Hash : null },
    responses: { schemaVersion: v6 ? 2 : 1, controlPanelLocation: "Panel", primaryDeviceRows: [{ rowUuid: randomUUID(), source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, displaySequence: 1, assetReference: "P-1", alarmZone: "A", location: "Lobby", manualCallPoint: "normal", flowSwitch: "test", heatDetector: "isolation", smokeDetector: "normal", remarks: "Primary" }], chargerAndBatteries: { main_supply: result("good"), battery: result(v6 ? "poor" : "good", v6 ? "Battery remark" : ""), charger: result(v6 ? "not_relevant" : "good") }, mainFunctionKeys: { main_alarm_reset: result("good"), lamp_test: result("good"), evacuate: result("good"), ac_supply: result("good"), dc_supply: result("good"), spka_system: result("good"), alarm_lift_trip: result("good"), signal_gas_discharge: result("good") }, secondaryAlarmDeviceRows: [{ rowUuid: secondaryUuid, source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, displaySequence: 1, assetReference: "S-1", location: "Lobby", alarmBell: v6 ? "poor" : "good", manualCallPoint: v6 ? "not_relevant" : "good", remarks: "General row remark", ...(v6 ? { fieldRemarks: { alarmBell: "Bell remark" } } : {}) }], comments: "Accepted comments" },
    deviceReportedCreatorUsername: null, verifiedOriginalCreatorUsername: null, syncedByUsername: "server-tech"
  } as any;
}
const parsed = (value: any) => parseServerFireAlarmDetail(value, value.clientUuid, value.jobId);

test("accepted-detail tuple selects V3/V4/V5 historical parsing and exact V6 parsing", () => {
  for (const version of [3, 4, 5] as const) { const value = detail(version); const accepted = parsed(value); assert.ok(accepted, `V${version} historical tuple`); assert.equal(accepted.responses.schemaVersion, 1); assert.equal(accepted.responses.secondaryAlarmDeviceRows[0]?.fieldRemarks, undefined); }
  const v6 = parsed(detail(6)); assert.ok(v6); assert.equal(v6.responses.schemaVersion, 2); assert.equal(v6.contract.systemContractSha256, v6Hash);
});

test("accepted-detail tuple rejects impossible historical/V6 combinations before parser fallback", () => {
  const v5 = detail(5); v5.contract.responseSchemaVersion = 2; (v5.responses as any).schemaVersion = 2; assert.equal(parsed(v5), undefined, "V5 + schema v2");
  const v6Legacy = detail(6); v6Legacy.contract.responseSchemaVersion = 1; (v6Legacy.responses as any).schemaVersion = 1; assert.equal(parsed(v6Legacy), undefined, "V6 + schema v1");
  const wrongSnapshot = detail(6); wrongSnapshot.contract.snapshotSchemaVersion = 1; assert.equal(parsed(wrongSnapshot), undefined, "V6 wrong snapshot schema");
  const wrongHash = detail(6); wrongHash.contract.systemContractSha256 = "a".repeat(64); assert.equal(parsed(wrongHash), undefined, "V6 wrong contract identity");
  const historicalV6 = detail(3); historicalV6.contract.masterTemplateId = ids[6]; historicalV6.contract.masterTemplateVersion = 6; historicalV6.contract.responseSchemaVersion = 2; historicalV6.contract.snapshotSchemaVersion = 2; historicalV6.contract.systemContractSha256 = v6Hash; assert.equal(parsed(historicalV6), undefined, "historical detail + V6 identity");
  const unknown = detail(3); unknown.contract.masterTemplateId = randomUUID(); unknown.template.id = unknown.contract.masterTemplateId; assert.equal(parsed(unknown), undefined, "unknown tuple identity");
});

test("V6 fieldRemarks are exact and Poor values require their own non-blank remark", () => {
  assert.ok(parsed(detail(6)), "valid V6 Poor fieldRemarks");
  const missing = detail(6); delete missing.responses.secondaryAlarmDeviceRows[0].fieldRemarks; assert.equal(parsed(missing), undefined, "Poor missing own fieldRemark");
  const whitespace = detail(6); whitespace.responses.secondaryAlarmDeviceRows[0].fieldRemarks.alarmBell = "  "; assert.equal(parsed(whitespace), undefined, "Poor whitespace fieldRemark");
  const unknown = detail(6); unknown.responses.secondaryAlarmDeviceRows[0].fieldRemarks.extra = "x"; assert.equal(parsed(unknown), undefined, "unknown fieldRemarks key");
  const nonString = detail(6); nonString.responses.secondaryAlarmDeviceRows[0].fieldRemarks.alarmBell = 42; assert.equal(parsed(nonString), undefined, "non-string fieldRemarks value");
  const generalOnly = detail(6); delete generalOnly.responses.secondaryAlarmDeviceRows[0].fieldRemarks; generalOnly.responses.secondaryAlarmDeviceRows[0].remarks = "General does not satisfy Poor"; assert.equal(parsed(generalOnly), undefined, "row remarks cannot satisfy Poor");
  const good = detail(6); good.responses.secondaryAlarmDeviceRows[0].alarmBell = "good"; good.responses.secondaryAlarmDeviceRows[0].manualCallPoint = "good"; delete good.responses.secondaryAlarmDeviceRows[0].fieldRemarks; assert.ok(parsed(good), "Good does not require a field remark");
  const notRelevant = detail(6); notRelevant.responses.secondaryAlarmDeviceRows[0].alarmBell = "not_relevant"; notRelevant.responses.secondaryAlarmDeviceRows[0].manualCallPoint = "not_relevant"; delete notRelevant.responses.secondaryAlarmDeviceRows[0].fieldRemarks; assert.ok(parsed(notRelevant), "Not Relevant does not require a field remark");
});
