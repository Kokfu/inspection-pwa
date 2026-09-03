import assert from "node:assert/strict";
import test from "node:test";
import { v7EvidenceManifest, v7EvidenceOutbox, v7RequiredFieldPaths } from "../src/co2/v7Evidence.ts";
import { v7FireAlarmEvidenceOutbox, v7FireAlarmManifest, v7RequiredFireAlarmFieldPaths } from "../src/fireAlarm/fireAlarmV7Evidence.ts";

const hash = (char: string) => char.repeat(64);
const attachment = (fieldPath: string, suffix: string) => ({ photoUuid: `00000000-0000-4000-8000-0000000000${suffix}`, inspectionClientUuid: "00000000-0000-4000-8000-000000000090", systemKey: "co2_fire_extinguisher", localCreatedAt: "2026-09-02T00:00:00.000Z", fieldPath, sha256: hash(suffix), protocolVersion: 7 });
const suppressionResponses = (resultA: "not_good" | "good" | "complete_repair" | "na", cylinder: string): any => ({ chargerAndBatteries: { main_supply: { result: resultA, remarks: "A" }, battery: { result: "good", remarks: "" }, charger: { result: "good", remarks: "" } }, physicalOutlook: { [cylinder]: { result: "complete_repair", remarks: "B" } }, mainFunctionKeys: { lamp_test: { result: "good", remarks: "" } } });
const fireResponses = (resultA: "not_good" | "good" | "complete_repair" | "na"): any => ({ chargerAndBatteries: { main_supply: { result: resultA, remarks: "A" }, battery: { result: "good", remarks: "" }, charger: { result: "good", remarks: "" } }, mainFunctionKeys: { main_alarm_reset: { result: "good", remarks: "" } }, secondaryAlarmDeviceRows: [{ rowUuid: "00000000-0000-4000-8000-000000000099", alarmBell: "not_good", manualCallPoint: "good", fieldRemarks: { alarmBell: "B" } }] });

test("V7 stale-draft evidence matrix keeps only current Poor fields and freezes Pending authority", () => {
  for (const [system, cylinder] of [["CO2", "co2_cylinder"], ["Wet Chemical", "wet_chemical_cylinder"]] as const) {
    const fieldB = `physical_outlook.physical_outlook_checks.${cylinder}`;
    const photos = [attachment("charger_batteries.charger_battery_checks.main_supply", system === "CO2" ? "01" : "11"), attachment(fieldB, system === "CO2" ? "02" : "12")];
    for (const next of ["good", "na"] as const) {
      const responses = suppressionResponses(next, cylinder);
      const manifest = v7EvidenceManifest(photos as never, responses);
      assert.deepEqual(manifest.map((item) => item.fieldPath), [fieldB], `${system} Poor→${next} excludes stale photo from frozen manifest/outbox`);
      assert.deepEqual(v7RequiredFieldPaths(responses), [fieldB]);
      assert.deepEqual(manifest.map((item) => v7EvidenceOutbox(photos.find((photo) => photo.photoUuid === item.photoUuid)! as never).entityId), [photos[1]!.photoUuid], `${system} submits/stages no stale-evidence outbox item`);
    }
    const pending = structuredClone({ responses: suppressionResponses("not_good", cylinder), evidenceManifest: v7EvidenceManifest(photos as never, suppressionResponses("not_good", cylinder)) });
    assert.equal(pending.responses.chargerAndBatteries.main_supply.result, "not_good", `${system} frozen Pending response is immutable under later Draft edits`);
    assert.equal(pending.evidenceManifest.length, 2, `${system} frozen Pending manifest is immutable under later Draft edits`);
  }
  const rowUuid = "00000000-0000-4000-8000-000000000099";
  const firePhotos = [attachment("charger_batteries.charger_battery_checks.main_supply", "03"), attachment(`alarm_devices.alarm_device_rows.rows.${rowUuid}.alarm_bell`, "04")];
  for (const next of ["good", "na"] as const) {
    const responses = fireResponses(next); const manifest = v7FireAlarmManifest(firePhotos as never, responses);
    assert.deepEqual(manifest.map((item) => item.fieldPath), [`alarm_devices.alarm_device_rows.rows.${rowUuid}.alarm_bell`], `Fire Alarm Poor→${next} excludes stale photo from frozen manifest/outbox`);
    assert.deepEqual(v7RequiredFireAlarmFieldPaths(responses), [`alarm_devices.alarm_device_rows.rows.${rowUuid}.alarm_bell`]);
    assert.deepEqual(manifest.map((item) => v7FireAlarmEvidenceOutbox(firePhotos.find((photo) => photo.photoUuid === item.photoUuid)! as never).entityId), [firePhotos[1]!.photoUuid], "Fire Alarm submits/stages no stale-evidence outbox item");
  }
  const firePending = structuredClone({ responses: fireResponses("not_good"), evidenceManifest: v7FireAlarmManifest(firePhotos as never, fireResponses("not_good")) });
  assert.equal(firePending.responses.chargerAndBatteries.main_supply.result, "not_good");
  assert.equal(firePending.evidenceManifest.length, 2, "Fire Alarm frozen Pending retains the original two-Poor evidence authority");
});
