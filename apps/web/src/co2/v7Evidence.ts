import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import type { AttachmentCaptureSource, InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import type { Co2Responses, MasterSystemFormInstanceRecord, SuppressionSystemKey } from "./co2Types";

export type V7SuppressionFieldPath =
  | `charger_batteries.charger_battery_checks.${"main_supply" | "battery" | "charger"}`
  | `physical_outlook.physical_outlook_checks.${string}`
  | `main_function_key.function_checks.${"main_alarm_reset" | "lamp_test" | "evacuate" | "ac_supply" | "dc_supply" | "signal_alarm_to_mfap"}`;

const groups: Array<[keyof Pick<Co2Responses, "chargerAndBatteries" | "physicalOutlook" | "mainFunctionKeys">, string]> = [
  ["chargerAndBatteries", "charger_batteries.charger_battery_checks"],
  ["physicalOutlook", "physical_outlook.physical_outlook_checks"],
  ["mainFunctionKeys", "main_function_key.function_checks"]
];
const now = () => new Date().toISOString();
export const isEvidenceFinding = (value: unknown) => value === "not_good" || value === "complete_repair";
export async function v7ContractSha256(definition: unknown) {
  const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}` : JSON.stringify(value);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(definition)));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
export function v7RequiredFieldPaths(responses: Co2Responses) {
  const paths: V7SuppressionFieldPath[] = [];
  for (const [group, prefix] of groups) for (const [key, value] of Object.entries(responses[group])) if (isEvidenceFinding(value.result)) paths.push(`${prefix}.${key}` as V7SuppressionFieldPath);
  return paths.sort();
}
export function v7SubmissionIssues(record: MasterSystemFormInstanceRecord, responses: Co2Responses, attachments: InspectionAttachmentRecord[]) {
  if (record.masterTemplate.version !== 7) return [];
  const issues: string[] = [];
  for (const [group, prefix] of groups) for (const [key, value] of Object.entries(responses[group])) {
    if (isEvidenceFinding(value.result) && !value.remarks.trim()) issues.push(`${prefix}.${key} requires its own Remark`);
  }
  const required = v7RequiredFieldPaths(responses);
  const fields = new Set(attachments.filter((item) => item.protocolVersion === 7).map((item) => item.fieldPath));
  for (const fieldPath of required) if (!fields.has(fieldPath)) issues.push(`${fieldPath} requires its own Photo`);
  issues.push(...duplicateV7PhotoIssues(attachments, required));
  return issues;
}
/** See the Fire Alarm twin: the server refuses one image reused across two
 * findings, so the submit gate has to refuse it first or offline work strands
 * in the outbox (G7). */
export function duplicateV7PhotoIssues(attachments: InspectionAttachmentRecord[], requiredFieldPaths: readonly string[]) {
  const required = new Set<string>(requiredFieldPaths);
  const issues: string[] = []; const firstUse = new Map<string, string>();
  for (const attachment of attachments.filter((item) => item.protocolVersion === 7 && required.has(item.fieldPath)).sort((left, right) => left.fieldPath.localeCompare(right.fieldPath))) {
    const earlier = firstUse.get(attachment.sha256);
    if (earlier) issues.push(`${earlier} and ${attachment.fieldPath} use the same photo; each finding needs its own photo`);
    else firstUse.set(attachment.sha256, attachment.fieldPath);
  }
  return issues;
}
export async function listV7SuppressionPhotos(inspectionClientUuid: string) {
  return (await localDatabase.inspectionAttachments.where("inspectionClientUuid").equals(inspectionClientUuid).toArray()).filter((item) => item.protocolVersion === 7);
}
export async function saveV7SuppressionPhoto(values: { record: MasterSystemFormInstanceRecord; fieldPath: V7SuppressionFieldPath; captureSource: AttachmentCaptureSource; blob: Blob; mimeType: "image/jpeg"; sizeBytes: number; width: number; height: number; sha256: string; capturedAt?: string }) {
  if (values.record.masterTemplate.version !== 7 || values.record.syncStatus !== "Draft") throw new Error("V7 evidence can only be changed in a V7 Draft");
  const contractSha256 = await v7ContractSha256(values.record.inspectionSnapshot.system.definition);
  await localDatabase.transaction("rw", localDatabase.masterSystemFormInstances, localDatabase.inspectionAttachments, async () => {
    const live = await localDatabase.masterSystemFormInstances.get(values.record.clientUuid);
    if (!live || live.clientUuid !== values.record.clientUuid || live.syncStatus !== "Draft" || live.masterTemplate.version !== 7) throw new Error("V7 Draft changed before evidence was saved");
    const held = await localDatabase.inspectionAttachments.where("inspectionClientUuid").equals(live.clientUuid).toArray();
    const clash = held.find((item) => item.protocolVersion === 7 && item.sha256 === values.sha256 && item.fieldPath !== values.fieldPath);
    if (clash) throw new Error(`This photo is already attached to ${clash.fieldPath}. Each finding needs its own photo.`);
    const existing = held.find((item) => item.fieldPath === values.fieldPath);
    const timestamp = now();
    await localDatabase.inspectionAttachments.put({ photoUuid: existing?.photoUuid ?? crypto.randomUUID(), inspectionClientUuid: live.clientUuid, systemKey: live.systemKey, fieldPath: values.fieldPath, evidencePolicyId: "v7-shared-evidence", evidencePolicyVersion: 7, captureSource: values.captureSource, blob: values.blob, mimeType: values.mimeType, sizeBytes: values.sizeBytes, width: values.width, height: values.height, sha256: values.sha256, capturedAt: values.capturedAt ?? timestamp, localCreatedAt: existing?.localCreatedAt ?? timestamp, localUpdatedAt: timestamp, syncStatus: "Draft", protocolVersion: 7, masterTemplateId: live.masterTemplate.id, contractSha256 });
  });
}
export function v7EvidenceManifest(attachments: InspectionAttachmentRecord[], responses: Co2Responses) { const currentPoor = new Set(v7RequiredFieldPaths(responses)); return attachments.filter((item) => item.protocolVersion === 7 && currentPoor.has(item.fieldPath as V7SuppressionFieldPath)).map((item) => ({ photoUuid: item.photoUuid, fieldPath: item.fieldPath, sourceSha256: item.sha256 })).sort((a, b) => a.fieldPath.localeCompare(b.fieldPath)); }
export function v7EvidenceOutbox(attachment: InspectionAttachmentRecord): SyncOutboxItem { return { operationId: crypto.randomUUID(), entityType: "v7StagedEvidence", entityId: attachment.photoUuid, action: "create", payload: { inspectionClientUuid: attachment.inspectionClientUuid, systemKey: attachment.systemKey, fieldPath: attachment.fieldPath, protocolVersion: 7 }, createdAt: attachment.localCreatedAt, attempts: 0, status: "Pending", activeKey: `v7StagedEvidence:create:${attachment.photoUuid}` }; }
