import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import type { AttachmentCaptureSource, InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import type { FireAlarmInspectionRecord, FireAlarmResponses } from "./fireAlarmTypes";
import { v6ContractSha256 } from "./fireAlarmV6Evidence";

export type FireAlarmV7FieldPath = `charger_batteries.charger_battery_checks.${"main_supply" | "battery" | "charger"}` | `main_function_key.function_checks.${"main_alarm_reset" | "lamp_test" | "evacuate" | "ac_supply" | "dc_supply" | "spka_system" | "alarm_lift_trip" | "signal_gas_discharge"}` | `alarm_devices.alarm_device_rows.rows.${string}.${"alarm_bell" | "manual_call_point"}`;
const now = () => new Date().toISOString();
const checklistGroups: Array<[keyof Pick<FireAlarmResponses, "chargerAndBatteries" | "mainFunctionKeys">, string]> = [["chargerAndBatteries", "charger_batteries.charger_battery_checks"], ["mainFunctionKeys", "main_function_key.function_checks"]];
const deviceStates = ["normal", "test", "isolation"] as const;
export function isCanonicalV7DeviceStates(value: unknown): value is typeof deviceStates[number][] {
  return Array.isArray(value) && value.length > 0 && value.length <= deviceStates.length
    && value.every((item, index) => typeof item === "string" && deviceStates.includes(item as typeof deviceStates[number])
      && (index === 0 || deviceStates.indexOf(value[index - 1] as typeof deviceStates[number]) < deviceStates.indexOf(item as typeof deviceStates[number])));
}

export function v7RequiredFireAlarmFieldPaths(responses: FireAlarmResponses): FireAlarmV7FieldPath[] {
  const paths: FireAlarmV7FieldPath[] = [];
  for (const [group, prefix] of checklistGroups) for (const [key, value] of Object.entries(responses[group])) if (value.result === "poor") paths.push(`${prefix}.${key}` as FireAlarmV7FieldPath);
  for (const row of responses.secondaryAlarmDeviceRows) { if (row.alarmBell === "poor") paths.push(`alarm_devices.alarm_device_rows.rows.${row.rowUuid}.alarm_bell`); if (row.manualCallPoint === "poor") paths.push(`alarm_devices.alarm_device_rows.rows.${row.rowUuid}.manual_call_point`); }
  return paths.sort();
}
export async function listFireAlarmV7Photos(inspectionClientUuid: string) { return (await localDatabase.inspectionAttachments.where("inspectionClientUuid").equals(inspectionClientUuid).toArray()).filter((item) => item.systemKey === "fire_alarm_detector" && item.protocolVersion === 7); }
export function v7FireAlarmManifest(attachments: InspectionAttachmentRecord[], responses: FireAlarmResponses) { const currentPoor = new Set(v7RequiredFireAlarmFieldPaths(responses)); return attachments.filter((item) => item.protocolVersion === 7 && currentPoor.has(item.fieldPath as FireAlarmV7FieldPath)).map((item) => ({ photoUuid: item.photoUuid, fieldPath: item.fieldPath, sourceSha256: item.sha256 })).sort((left, right) => left.fieldPath.localeCompare(right.fieldPath)); }
export function v7FireAlarmEvidenceOutbox(attachment: InspectionAttachmentRecord): SyncOutboxItem { return { operationId: crypto.randomUUID(), entityType: "v7StagedEvidence", entityId: attachment.photoUuid, action: "create", payload: { inspectionClientUuid: attachment.inspectionClientUuid, systemKey: "fire_alarm_detector", fieldPath: attachment.fieldPath, protocolVersion: 7 }, createdAt: attachment.localCreatedAt, attempts: 0, status: "Pending", activeKey: `v7StagedEvidence:create:${attachment.photoUuid}` }; }
// These structural checks mirror the server's V7 acceptance validator
// (apps/api/src/sync/fireAlarmV7Acceptance.ts `validResponses`).  Without them the
// form queues a submission the server rejects with a non-retryable VALIDATION_ERROR,
// which offline means the technician's work is stranded in the outbox.
export function v7FireAlarmSubmissionIssues(responses: FireAlarmResponses, attachments: InspectionAttachmentRecord[]) {
  const issues: string[] = [];
  if (!responses.controlPanelLocation.trim()) issues.push("Control Panel Location is required");
  if (responses.primaryDeviceRows.length < 1) issues.push("At least one primary detector/device row is required");
  responses.primaryDeviceRows.forEach((row, index) => {
    if (!row.alarmZone.trim() || !row.location.trim()
      || ![row.manualCallPoint, row.flowSwitch, row.heatDetector, row.smokeDetector].every(isCanonicalV7DeviceStates)) {
      issues.push(`Primary row ${index + 1} requires Alarm Zone, Location and at least one Normal/Test/Isolation tick for all four controls`);
    }
  });
  for (const [group, prefix] of checklistGroups) for (const [key, field] of Object.entries(responses[group])) {
    if (field.result !== "good" && field.result !== "poor" && field.result !== "not_relevant") issues.push(`${prefix}.${key} result is required`);
    if (field.result === "poor" && !field.remarks.trim()) issues.push(`${prefix}.${key} requires its own Remark`);
  }
  responses.secondaryAlarmDeviceRows.forEach((row, index) => {
    if (!row.location.trim() || ![row.alarmBell, row.manualCallPoint].every((result) => result === "good" || result === "poor" || result === "not_relevant")) {
      issues.push(`Alarm-device row ${index + 1} requires Location and both results`);
    }
  });
  for (const row of responses.secondaryAlarmDeviceRows) for (const key of ["alarmBell", "manualCallPoint"] as const) if (row[key] === "poor" && !row.fieldRemarks?.[key]?.trim()) issues.push(`Alarm-device row ${row.displaySequence} requires its own ${key === "alarmBell" ? "Alarm Bell" : "Manual Call Point"} Remark`);
  const fields = new Set(attachments.filter((attachment) => attachment.protocolVersion === 7).map((attachment) => attachment.fieldPath));
  for (const fieldPath of v7RequiredFireAlarmFieldPaths(responses)) if (!fields.has(fieldPath)) issues.push(`${fieldPath} requires its own Photo`);
  return issues;
}
export async function saveFireAlarmV7Photo(values: { record: FireAlarmInspectionRecord; fieldPath: FireAlarmV7FieldPath; captureSource: AttachmentCaptureSource; blob: Blob; mimeType: "image/jpeg"; sizeBytes: number; width: number; height: number; sha256: string; capturedAt?: string }) {
  if (values.record.masterTemplate.version !== 7 || values.record.syncStatus !== "Draft") throw new Error("V7 evidence can only be changed in a Fire Alarm V7 Draft");
  const contractSha256 = await v6ContractSha256(values.record.inspectionSnapshot.system.definition);
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.inspectionAttachments, async () => {
    const live = await localDatabase.masterSystemInspections.get(values.record.clientUuid);
    if (!live || live.systemKey !== "fire_alarm_detector" || live.masterTemplate.version !== 7 || live.syncStatus !== "Draft") throw new Error("Fire Alarm V7 Draft changed before evidence was saved");
    const existing = await localDatabase.inspectionAttachments.where("[inspectionClientUuid+fieldPath]").equals([live.clientUuid, values.fieldPath]).first(); const timestamp = now();
    await localDatabase.inspectionAttachments.put({ photoUuid: existing?.photoUuid ?? crypto.randomUUID(), inspectionClientUuid: live.clientUuid, systemKey: "fire_alarm_detector", fieldPath: values.fieldPath, evidencePolicyId: "v7-shared-evidence", evidencePolicyVersion: 7, captureSource: values.captureSource, blob: values.blob, mimeType: values.mimeType, sizeBytes: values.sizeBytes, width: values.width, height: values.height, sha256: values.sha256, capturedAt: values.capturedAt ?? timestamp, localCreatedAt: existing?.localCreatedAt ?? timestamp, localUpdatedAt: timestamp, syncStatus: "Draft", protocolVersion: 7, masterTemplateId: live.masterTemplate.id, contractSha256 });
  });
}
