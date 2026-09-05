import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import type { AttachmentCaptureSource, InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import type {
  DryWetRiserInspectionRecord,
  DryWetRiserV7ChecklistKey,
  DryWetRiserV7MeasurementKey,
  RiserOutletResultColumn,
  V7DryWetRiserResponses
} from "./dryWetRiserTypes";

export type DryWetRiserV7FieldPath =
  | `dry_wet_riser_checks.${DryWetRiserV7ChecklistKey}`
  | `dry_wet_riser_measurements.${DryWetRiserV7MeasurementKey}`
  | `riser_outlet.riser_outlet_rows.rows.${string}.${RiserOutletResultColumn}`;

export const isDryWetRiserV7EvidenceFinding = (value: unknown) => value === "not_good" || value === "complete_repair";

const checklistKeys: readonly DryWetRiserV7ChecklistKey[] = [
  "saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions",
  "pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator",
  "battery_charger_failure_alarm", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start",
  "test_and_gate_valve_positions"
];
const measurementKeys: readonly DryWetRiserV7MeasurementKey[] = ["jockey_psi", "duty_psi", "standby_psi"];
export const riserOutletResultFields: readonly RiserOutletResultColumn[] = ["canvasHoseAt2Result", "diffuserNozzleResult", "landingValveResult", "crandleResult", "doorResult"];
const rowFieldLabels: Readonly<Record<RiserOutletResultColumn, string>> = { canvasHoseAt2Result: "Canvas Hose ×2", diffuserNozzleResult: "Diffuser Nozzle", landingValveResult: "Landing Valve", crandleResult: "Crandle", doorResult: "Door" };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : isRecord(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);

export function v7RequiredDryWetRiserFieldPaths(responses: V7DryWetRiserResponses): DryWetRiserV7FieldPath[] {
  const paths: DryWetRiserV7FieldPath[] = [];
  for (const key of checklistKeys) if (isDryWetRiserV7EvidenceFinding(responses.checklist[key]?.result)) paths.push(`dry_wet_riser_checks.${key}`);
  for (const key of measurementKeys) if (isDryWetRiserV7EvidenceFinding(responses.measurements[key].result)) paths.push(`dry_wet_riser_measurements.${key}`);
  for (const row of responses.riserOutlets) for (const field of riserOutletResultFields) if (isDryWetRiserV7EvidenceFinding(row[field])) paths.push(`riser_outlet.riser_outlet_rows.rows.${row.rowUuid}.${field}`);
  return paths.sort();
}

export async function listDryWetRiserV7Photos(inspectionClientUuid: string) {
  return (await localDatabase.inspectionAttachments.where("inspectionClientUuid").equals(inspectionClientUuid).toArray())
    .filter((item) => item.systemKey === "dry_wet_riser" && item.protocolVersion === 7);
}

export function v7DryWetRiserManifest(attachments: InspectionAttachmentRecord[], responses: V7DryWetRiserResponses) {
  const required = new Set(v7RequiredDryWetRiserFieldPaths(responses));
  return attachments.filter((item) => item.systemKey === "dry_wet_riser" && item.protocolVersion === 7 && required.has(item.fieldPath as DryWetRiserV7FieldPath))
    .map((item) => ({ photoUuid: item.photoUuid, fieldPath: item.fieldPath, sourceSha256: item.sha256 }))
    .sort((left, right) => left.fieldPath.localeCompare(right.fieldPath));
}

export function v7DryWetRiserEvidenceOutbox(attachment: InspectionAttachmentRecord): SyncOutboxItem {
  return { operationId: crypto.randomUUID(), entityType: "v7StagedEvidence", entityId: attachment.photoUuid, action: "create", payload: { inspectionClientUuid: attachment.inspectionClientUuid, systemKey: "dry_wet_riser", fieldPath: attachment.fieldPath, protocolVersion: 7 }, createdAt: attachment.localCreatedAt, attempts: 0, status: "Pending", activeKey: `v7StagedEvidence:create:${attachment.photoUuid}` };
}

export function v7DryWetRiserSubmissionIssues(record: DryWetRiserInspectionRecord, responses: V7DryWetRiserResponses, attachments: InspectionAttachmentRecord[]): string[] {
  if (record.masterTemplate.version !== 7) return [];
  const issues: string[] = [];
  if (responses.schemaVersion !== 2) return ["Dry/Wet Riser V7 response schema is invalid"];
  for (const key of checklistKeys) if (isDryWetRiserV7EvidenceFinding(responses.checklist[key]?.result) && !responses.checklist[key]?.remarks.trim()) issues.push(`${key} requires its own Remark`);
  for (const key of measurementKeys) if (isDryWetRiserV7EvidenceFinding(responses.measurements[key].result) && !responses.measurements[key].remarks.trim()) issues.push(`${key} requires its own Remark`);
  for (const row of responses.riserOutlets) for (const field of riserOutletResultFields) if (isDryWetRiserV7EvidenceFinding(row[field]) && !row.fieldRemarks?.[field]?.trim()) issues.push(`${rowFieldLabels[field]} requires its own Remark`);
  const required = v7RequiredDryWetRiserFieldPaths(responses);
  const photos = attachments.filter((item) => item.systemKey === "dry_wet_riser" && item.protocolVersion === 7);
  const attached = new Set(photos.map((item) => item.fieldPath));
  for (const path of required) if (!attached.has(path)) issues.push(`${path} requires its own Photo`);
  const first = new Map<string, string>();
  for (const photo of photos.filter((item) => required.includes(item.fieldPath as DryWetRiserV7FieldPath)).sort((left, right) => left.fieldPath.localeCompare(right.fieldPath))) {
    const prior = first.get(photo.sha256);
    if (prior) issues.push(`${prior} and ${photo.fieldPath} use the same photo; each finding needs its own photo`);
    else first.set(photo.sha256, photo.fieldPath);
  }
  return issues;
}

export async function saveDryWetRiserV7Photo(values: { record: DryWetRiserInspectionRecord; fieldPath: DryWetRiserV7FieldPath; captureSource: AttachmentCaptureSource; blob: Blob; mimeType: "image/jpeg"; sizeBytes: number; width: number; height: number; sha256: string; capturedAt?: string }) {
  if (values.record.masterTemplate.version !== 7 || values.record.syncStatus !== "Draft") throw new Error("V7 evidence can only be changed in a Dry/Wet Riser V7 Draft");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(values.record.inspectionSnapshot.system.definition)));
  const contractSha256 = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  const now = new Date().toISOString();
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.inspectionAttachments, async () => {
    const live = await localDatabase.masterSystemInspections.get(values.record.clientUuid) as DryWetRiserInspectionRecord | undefined;
    if (!live || live.systemKey !== "dry_wet_riser" || live.masterTemplate.version !== 7 || live.syncStatus !== "Draft") throw new Error("Dry/Wet Riser V7 Draft changed before evidence was saved");
    const held = await listDryWetRiserV7Photos(live.clientUuid);
    const clash = held.find((item) => item.sha256 === values.sha256 && item.fieldPath !== values.fieldPath);
    if (clash) throw new Error(`This photo is already attached to ${clash.fieldPath}. Each finding needs its own photo.`);
    const existing = held.find((item) => item.fieldPath === values.fieldPath);
    await localDatabase.inspectionAttachments.put({ photoUuid: existing?.photoUuid ?? crypto.randomUUID(), inspectionClientUuid: live.clientUuid, systemKey: "dry_wet_riser", fieldPath: values.fieldPath, evidencePolicyId: "v7-shared-evidence", evidencePolicyVersion: 7, captureSource: values.captureSource, blob: values.blob, mimeType: values.mimeType, sizeBytes: values.sizeBytes, width: values.width, height: values.height, sha256: values.sha256, capturedAt: values.capturedAt ?? now, localCreatedAt: existing?.localCreatedAt ?? now, localUpdatedAt: now, syncStatus: "Draft", protocolVersion: 7, masterTemplateId: live.masterTemplate.id, contractSha256 });
  });
}
