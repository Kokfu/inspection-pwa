import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import type { AttachmentCaptureSource, InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import type { AutomaticSprinklerInspectionRecord, AutomaticSprinklerResponses, AutomaticSprinklerV7ChecklistKey, SprinklerMeasurementKey } from "./automaticSprinklerTypes";

export type AutomaticSprinklerV7FieldPath = `automatic_sprinkler_checks.${AutomaticSprinklerV7ChecklistKey}` | `automatic_sprinkler_measurements.${SprinklerMeasurementKey}`;
export const isAutomaticSprinklerV7EvidenceFinding = (value: unknown) => value === "not_good" || value === "complete_repair";
const now = () => new Date().toISOString();
const checklistKeys: readonly AutomaticSprinklerV7ChecklistKey[] = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions", "pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions", "breaching_inlet", "alarm_gong", "flow_meter_valve_positions", "trfp_jockey_pump", "trfp_duty_pump", "trfp_standby_pump"];
const measurementKeys: readonly SprinklerMeasurementKey[] = ["jockey_pump_pressure", "duty_pump_cut_in", "standby_pump_cut_in", "water_supply_gauge", "installation_gauge"];
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : isRecord(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);

export function v7RequiredAutomaticSprinklerFieldPaths(responses: AutomaticSprinklerResponses): AutomaticSprinklerV7FieldPath[] {
  if (responses.schemaVersion !== 2) return [];
  const paths: AutomaticSprinklerV7FieldPath[] = [];
  for (const key of checklistKeys) if (isAutomaticSprinklerV7EvidenceFinding(responses.checklist[key].result)) paths.push(`automatic_sprinkler_checks.${key}`);
  for (const key of measurementKeys) if (isAutomaticSprinklerV7EvidenceFinding(responses.measurements[key].result)) paths.push(`automatic_sprinkler_measurements.${key}`);
  return paths.sort();
}

export async function listAutomaticSprinklerV7Photos(inspectionClientUuid: string) {
  return (await localDatabase.inspectionAttachments.where("inspectionClientUuid").equals(inspectionClientUuid).toArray())
    .filter((item) => item.systemKey === "automatic_sprinkler" && item.protocolVersion === 7);
}

export function v7AutomaticSprinklerManifest(attachments: InspectionAttachmentRecord[], responses: AutomaticSprinklerResponses) {
  const required = new Set(v7RequiredAutomaticSprinklerFieldPaths(responses));
  return attachments.filter((item) => item.systemKey === "automatic_sprinkler" && item.protocolVersion === 7 && required.has(item.fieldPath as AutomaticSprinklerV7FieldPath))
    .map((item) => ({ photoUuid: item.photoUuid, fieldPath: item.fieldPath, sourceSha256: item.sha256 }))
    .sort((left, right) => left.fieldPath.localeCompare(right.fieldPath));
}

export function v7AutomaticSprinklerEvidenceOutbox(attachment: InspectionAttachmentRecord): SyncOutboxItem {
  return { operationId: crypto.randomUUID(), entityType: "v7StagedEvidence", entityId: attachment.photoUuid, action: "create", payload: { inspectionClientUuid: attachment.inspectionClientUuid, systemKey: "automatic_sprinkler", fieldPath: attachment.fieldPath, protocolVersion: 7 }, createdAt: attachment.localCreatedAt, attempts: 0, status: "Pending", activeKey: `v7StagedEvidence:create:${attachment.photoUuid}` };
}

export function v7AutomaticSprinklerSubmissionIssues(record: AutomaticSprinklerInspectionRecord, responses: AutomaticSprinklerResponses, attachments: InspectionAttachmentRecord[]) {
  if (record.masterTemplate.version !== 7) return [];
  const issues: string[] = [];
  if (responses.schemaVersion !== 2) return ["Automatic Sprinkler V7 response schema is invalid"];
  for (const key of checklistKeys) if (isAutomaticSprinklerV7EvidenceFinding(responses.checklist[key].result) && !responses.checklist[key].remarks.trim()) issues.push(`${key} requires its own Remark`);
  for (const key of measurementKeys) if (isAutomaticSprinklerV7EvidenceFinding(responses.measurements[key].result) && !responses.measurements[key].remarks.trim()) issues.push(`${key} requires its own Remark`);
  const required = v7RequiredAutomaticSprinklerFieldPaths(responses);
  const photos = attachments.filter((item) => item.systemKey === "automatic_sprinkler" && item.protocolVersion === 7);
  const attached = new Set(photos.map((item) => item.fieldPath));
  for (const path of required) if (!attached.has(path)) issues.push(`${path} requires its own Photo`);
  const first = new Map<string, string>();
  for (const photo of photos.filter((item) => required.includes(item.fieldPath as AutomaticSprinklerV7FieldPath)).sort((left, right) => left.fieldPath.localeCompare(right.fieldPath))) {
    const prior = first.get(photo.sha256);
    if (prior) issues.push(`${prior} and ${photo.fieldPath} use the same photo; each finding needs its own photo`);
    else first.set(photo.sha256, photo.fieldPath);
  }
  return issues;
}

export async function saveAutomaticSprinklerV7Photo(values: { record: AutomaticSprinklerInspectionRecord; fieldPath: AutomaticSprinklerV7FieldPath; captureSource: AttachmentCaptureSource; blob: Blob; mimeType: "image/jpeg"; sizeBytes: number; width: number; height: number; sha256: string; capturedAt?: string }) {
  if (values.record.masterTemplate.version !== 7 || values.record.syncStatus !== "Draft") throw new Error("V7 evidence can only be changed in an Automatic Sprinkler V7 Draft");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(values.record.inspectionSnapshot.system.definition)));
  const contractSha256 = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.inspectionAttachments, async () => {
    const live = await localDatabase.masterSystemInspections.get(values.record.clientUuid) as AutomaticSprinklerInspectionRecord | undefined;
    if (!live || live.systemKey !== "automatic_sprinkler" || live.masterTemplate.version !== 7 || live.syncStatus !== "Draft") throw new Error("Automatic Sprinkler V7 Draft changed before evidence was saved");
    const held = await listAutomaticSprinklerV7Photos(live.clientUuid);
    const clash = held.find((item) => item.sha256 === values.sha256 && item.fieldPath !== values.fieldPath);
    if (clash) throw new Error(`This photo is already attached to ${clash.fieldPath}. Each finding needs its own photo.`);
    const existing = held.find((item) => item.fieldPath === values.fieldPath); const timestamp = now();
    await localDatabase.inspectionAttachments.put({ photoUuid: existing?.photoUuid ?? crypto.randomUUID(), inspectionClientUuid: live.clientUuid, systemKey: "automatic_sprinkler", fieldPath: values.fieldPath, evidencePolicyId: "v7-shared-evidence", evidencePolicyVersion: 7, captureSource: values.captureSource, blob: values.blob, mimeType: values.mimeType, sizeBytes: values.sizeBytes, width: values.width, height: values.height, sha256: values.sha256, capturedAt: values.capturedAt ?? timestamp, localCreatedAt: existing?.localCreatedAt ?? timestamp, localUpdatedAt: timestamp, syncStatus: "Draft", protocolVersion: 7, masterTemplateId: live.masterTemplate.id, contractSha256 });
  });
}
