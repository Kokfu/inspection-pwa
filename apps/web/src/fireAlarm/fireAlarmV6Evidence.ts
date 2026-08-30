import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import type { AttachmentCaptureSource, InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import { fireAlarmClientDispatch } from "../referenceData/systemContractCompatibility";
import type { FireAlarmEvidenceManifestEntry, FireAlarmInspectionRecord, FireAlarmResponses } from "./fireAlarmTypes";

export type FireAlarmV6FieldPath =
  | "charger_batteries.charger_battery_checks.main_supply"
  | "charger_batteries.charger_battery_checks.battery"
  | "charger_batteries.charger_battery_checks.charger"
  | `main_function_key.function_checks.${"main_alarm_reset" | "lamp_test" | "evacuate" | "ac_supply" | "dc_supply" | "spka_system" | "alarm_lift_trip" | "signal_gas_discharge"}`
  | `alarm_devices.alarm_device_rows.rows.${string}.${"alarm_bell" | "manual_call_point"}`;

const now = () => new Date().toISOString();
export async function v6ContractSha256(definition: unknown) {
  const canon = (value: unknown): string => Array.isArray(value) ? `[${value.map(canon).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${canon((value as Record<string, unknown>)[key])}`).join(",")}}` : JSON.stringify(value);
  const bytes = new TextEncoder().encode(canon(definition)); const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
export async function saveFireAlarmV6Photo(values: { record: FireAlarmInspectionRecord; fieldPath: FireAlarmV6FieldPath; captureSource: AttachmentCaptureSource; blob: Blob; mimeType: "image/jpeg"; sizeBytes: number; width: number; height: number; sha256: string; capturedAt?: string }) {
  if (fireAlarmClientDispatch(values.record.masterTemplate) !== "v6" || values.record.syncStatus !== "Draft") throw new Error("V6 evidence can only be changed in a Fire Alarm Draft");
  const contractSha256 = await v6ContractSha256(values.record.inspectionSnapshot.system.definition);
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.inspectionAttachments, async () => {
    const live = await localDatabase.masterSystemInspections.get(values.record.clientUuid);
    if (!live || live.systemKey !== "fire_alarm_detector" || live.syncStatus !== "Draft") throw new Error("Fire Alarm Draft changed before evidence was saved");
    const existing = await localDatabase.inspectionAttachments.where("[inspectionClientUuid+fieldPath]").equals([values.record.clientUuid, values.fieldPath]).first();
    const timestamp = now();
    const attachment: InspectionAttachmentRecord = { photoUuid: existing?.photoUuid ?? crypto.randomUUID(), inspectionClientUuid: values.record.clientUuid, systemKey: "fire_alarm_detector", fieldPath: values.fieldPath, evidencePolicyId: "v6-staged-evidence", evidencePolicyVersion: 6, captureSource: values.captureSource, blob: values.blob, mimeType: values.mimeType, sizeBytes: values.sizeBytes, width: values.width, height: values.height, sha256: values.sha256, capturedAt: values.capturedAt ?? timestamp, localCreatedAt: existing?.localCreatedAt ?? timestamp, localUpdatedAt: timestamp, syncStatus: "Draft", protocolVersion: 6, masterTemplateId: values.record.masterTemplate.id, contractSha256 };
    await localDatabase.inspectionAttachments.put(attachment);
  });
  const attachment = await localDatabase.inspectionAttachments.where("[inspectionClientUuid+fieldPath]").equals([values.record.clientUuid, values.fieldPath]).first();
  if (!attachment) throw new Error("Saved V6 evidence could not be reloaded"); return attachment;
}
export async function listFireAlarmV6Photos(inspectionClientUuid: string) { return (await localDatabase.inspectionAttachments.where("inspectionClientUuid").equals(inspectionClientUuid).toArray()).filter((item) => item.systemKey === "fire_alarm_detector" && item.protocolVersion === 6); }
export function v6Manifest(attachments: InspectionAttachmentRecord[]): FireAlarmEvidenceManifestEntry[] { return attachments.map((item) => ({ photoUuid: item.photoUuid, fieldPath: item.fieldPath, sourceSha256: item.sha256 })).sort((a, b) => a.fieldPath.localeCompare(b.fieldPath)); }
export function v6EvidenceOutbox(attachment: InspectionAttachmentRecord): SyncOutboxItem { return { operationId: crypto.randomUUID(), entityType: "v6StagedEvidence", entityId: attachment.photoUuid, action: "create", payload: { photoUuid: attachment.photoUuid, inspectionClientUuid: attachment.inspectionClientUuid, jobId: "", systemKey: "fire_alarm_detector", fieldPath: attachment.fieldPath }, createdAt: attachment.localCreatedAt, attempts: 0, status: "Pending", activeKey: `v6StagedEvidence:create:${attachment.photoUuid}` }; }
export function v6RequiredFieldPaths(responses: FireAlarmResponses): FireAlarmV6FieldPath[] {
  const result: FireAlarmV6FieldPath[] = [];
  const groups: Array<[Record<string, { result: string | null }>, string]> = [[responses.chargerAndBatteries, "charger_batteries.charger_battery_checks"], [responses.mainFunctionKeys, "main_function_key.function_checks"]];
  for (const [group, prefix] of groups) Object.entries(group).forEach(([key, item]) => { if (item.result === "poor") result.push(`${prefix}.${key}` as FireAlarmV6FieldPath); });
  responses.secondaryAlarmDeviceRows.forEach((row) => { if (row.alarmBell === "poor") result.push(`alarm_devices.alarm_device_rows.rows.${row.rowUuid}.alarm_bell`); if (row.manualCallPoint === "poor") result.push(`alarm_devices.alarm_device_rows.rows.${row.rowUuid}.manual_call_point`); });
  return result;
}
export function v6SubmissionIssues(responses: FireAlarmResponses, attachments: InspectionAttachmentRecord[]) {
  const issues: string[] = [];
  if (!responses.controlPanelLocation.trim()) issues.push("Control Panel Location is required");
  if (responses.primaryDeviceRows.length < 1) issues.push("At least one primary detector/device row is required");
  responses.primaryDeviceRows.forEach((row, index) => {
    if (!row.alarmZone.trim() || !row.location.trim()
      || ![row.manualCallPoint, row.flowSwitch, row.heatDetector, row.smokeDetector]
        .every((result) => result === "normal" || result === "test" || result === "isolation")) {
      issues.push(`Primary row ${index + 1} requires Alarm Zone, Location and all four Normal/Test/Isolation results`);
    }
  });
  for (const [group, label] of [[responses.chargerAndBatteries, "Charger & Batteries"], [responses.mainFunctionKeys, "Main Function Key"]] as const) {
    Object.entries(group).forEach(([key, field]) => {
      if (field.result !== "good" && field.result !== "poor" && field.result !== "not_relevant") issues.push(`${label}: ${key.replaceAll("_", " ")} result is required`);
      if (field.result === "poor" && !field.remarks.trim()) issues.push(`${label}: ${key.replaceAll("_", " ")} requires its own Remark`);
    });
  }
  responses.secondaryAlarmDeviceRows.forEach((row, index) => {
    if (!row.location.trim() || ![row.alarmBell, row.manualCallPoint].every((result) => result === "good" || result === "poor" || result === "not_relevant")) {
      issues.push(`Secondary row ${index + 1} requires Location and both results`);
    }
    (["alarmBell", "manualCallPoint"] as const).forEach((key) => { if (row[key] === "poor" && !row.fieldRemarks?.[key]?.trim()) issues.push(`Secondary row ${index + 1}: ${key === "alarmBell" ? "Alarm Bell" : "Manual Call Point"} requires its own Remark`); });
  });
  const photos = new Set(attachments.map((attachment) => attachment.fieldPath));
  v6RequiredFieldPaths(responses).forEach((path) => { if (!photos.has(path)) issues.push(`${path} requires its own Photo`); });
  return issues;
}
