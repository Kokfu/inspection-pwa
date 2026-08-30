import assert from "node:assert/strict";
import test from "node:test";
import { isFireAlarmV6EvidenceFieldPath, parseV6EvidenceManifest } from "./fireAlarmV6Evidence.js";

const uuid = "71000000-0000-4000-8000-000000000001";
const hash = "a".repeat(64);
test("V6 evidence manifest is immutable, field-specific, and excludes Normal/Test/Isolation", () => {
  const row = `alarm_devices.alarm_device_rows.rows.${uuid}.alarm_bell`;
  assert.equal(isFireAlarmV6EvidenceFieldPath("charger_batteries.charger_battery_checks.battery"), true);
  assert.equal(isFireAlarmV6EvidenceFieldPath(row), true);
  assert.equal(isFireAlarmV6EvidenceFieldPath(`fire_alarm_control_panel.device_rows.rows.${uuid}.manual_call_point`), false);
  const manifest = parseV6EvidenceManifest([{ photoUuid: uuid, fieldPath: row, sourceSha256: hash }]);
  assert.deepEqual(manifest, [{ photoUuid: uuid, fieldPath: row, sourceSha256: hash }]);
  assert.equal(parseV6EvidenceManifest([{ photoUuid: uuid, fieldPath: row, sourceSha256: hash }, { photoUuid: "71000000-0000-4000-8000-000000000002", fieldPath: row, sourceSha256: "b".repeat(64) }]), undefined);
  assert.equal(parseV6EvidenceManifest([{ photoUuid: uuid, fieldPath: "charger_batteries.charger_battery_checks.main_supply", sourceSha256: hash }, { photoUuid: uuid, fieldPath: "main_function_key.function_checks.lamp_test", sourceSha256: "b".repeat(64) }]), undefined, "one photo UUID cannot satisfy two fields");
  assert.equal(parseV6EvidenceManifest([{ photoUuid: uuid, fieldPath: "charger_batteries.charger_battery_checks.main_supply", sourceSha256: hash }, { photoUuid: "71000000-0000-4000-8000-000000000002", fieldPath: "main_function_key.function_checks.lamp_test", sourceSha256: hash }]), undefined, "one source hash cannot satisfy two fields");
});
