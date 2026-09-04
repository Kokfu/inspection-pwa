import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import type { AttachmentCaptureSource, InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import type { ResultControlDefinition } from "../inspectionControls/definitionTypes";
import { hydrantResultColumns, type HydrantInspectionRecord, type HydrantResultColumn, type HydrantResponses } from "./hydrantTypes";

export type HydrantV7FieldPath = `hydrant_set.hydrant_rows.rows.${string}.${typeof hydrantResultColumns[number][1]}`;
export const isHydrantV7EvidenceFinding = (value: unknown) => value === "not_good" || value === "complete_repair";
const now = () => new Date().toISOString();
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const labels: Record<string, string> = { good: "Good", not_good: "Not Good", complete_repair: "Complete Repair", na: "N.A." };
export const historicalHydrantResultDefinition: ResultControlDefinition = { type: "single_select", required: true, options: [{ value: "good", label: "Good" }, { value: "poor", label: "Poor" }] };

/** The frozen V7 definition, not a hard-coded client list, decides each column's result values. */
export function resolveHydrantV7ResultDefinitions(definition: unknown): Record<HydrantResultColumn, ResultControlDefinition> | undefined {
  if (!isRecord(definition) || !Array.isArray(definition.sections)) return undefined;
  const section = definition.sections.find((value) => isRecord(value) && value.key === "hydrant_set");
  const block = isRecord(section) && Array.isArray(section.blocks) ? section.blocks.find((value) => isRecord(value) && value.key === "hydrant_rows") : undefined;
  if (!isRecord(block) || !Array.isArray(block.columns)) return undefined;
  const definitions = {} as Record<HydrantResultColumn, ResultControlDefinition>;
  for (const [responseKey, wireKey] of hydrantResultColumns) {
    const field = block.columns.find((value) => isRecord(value) && value.key === wireKey);
    if (!isRecord(field) || field.control !== "good_poor" || !Array.isArray(field.allowedValues)
      || field.allowedValues.length === 0 || !field.allowedValues.every((value) => typeof value === "string")
      || new Set(field.allowedValues).size !== field.allowedValues.length) return undefined;
    definitions[responseKey] = {
      type: "single_select",
      required: true,
      options: field.allowedValues.map((value) => ({ value: value as string, label: labels[value as string] ?? value as string }))
    };
  }
  return definitions;
}

export function v7RequiredHydrantFieldPaths(responses: HydrantResponses): HydrantV7FieldPath[] {
  const paths: HydrantV7FieldPath[] = [];
  for (const row of responses.rows) for (const [responseKey, wireKey] of hydrantResultColumns) {
    if (isHydrantV7EvidenceFinding(row[responseKey])) paths.push(`hydrant_set.hydrant_rows.rows.${row.rowUuid}.${wireKey}`);
  }
  return paths.sort();
}

export async function listHydrantV7Photos(inspectionClientUuid: string) {
  return (await localDatabase.inspectionAttachments.where("inspectionClientUuid").equals(inspectionClientUuid).toArray())
    .filter((item) => item.systemKey === "hydrant" && item.protocolVersion === 7);
}

export function v7HydrantManifest(attachments: InspectionAttachmentRecord[], responses: HydrantResponses) {
  const required = new Set(v7RequiredHydrantFieldPaths(responses));
  return attachments.filter((item) => item.systemKey === "hydrant" && item.protocolVersion === 7 && required.has(item.fieldPath as HydrantV7FieldPath))
    .map((item) => ({ photoUuid: item.photoUuid, fieldPath: item.fieldPath, sourceSha256: item.sha256 }))
    .sort((left, right) => left.fieldPath.localeCompare(right.fieldPath));
}

export function v7HydrantEvidenceOutbox(attachment: InspectionAttachmentRecord): SyncOutboxItem {
  return { operationId: crypto.randomUUID(), entityType: "v7StagedEvidence", entityId: attachment.photoUuid, action: "create", payload: { inspectionClientUuid: attachment.inspectionClientUuid, systemKey: "hydrant", fieldPath: attachment.fieldPath, protocolVersion: 7 }, createdAt: attachment.localCreatedAt, attempts: 0, status: "Pending", activeKey: `v7StagedEvidence:create:${attachment.photoUuid}` };
}

export function v7HydrantSubmissionIssues(record: HydrantInspectionRecord, responses: HydrantResponses, attachments: InspectionAttachmentRecord[]) {
  if (record.masterTemplate.version !== 7) return [];
  const definitions = resolveHydrantV7ResultDefinitions(record.inspectionSnapshot.system.definition);
  if (!definitions) return ["Hydrant V7 definition is unavailable or malformed"];
  const issues: string[] = [];
  for (const [rowIndex, row] of responses.rows.entries()) {
    if (!isRecord(row.fieldRemarks)) issues.push(`Hydrant row ${rowIndex + 1} field remarks are invalid`);
    for (const [responseKey, _wireKey, label] of hydrantResultColumns) {
      const value = row[responseKey];
      if (!definitions[responseKey].options.some((option) => option.value === value)) issues.push(`Hydrant row ${rowIndex + 1} ${label} result is required`);
      if (isHydrantV7EvidenceFinding(value) && (!isRecord(row.fieldRemarks) || typeof row.fieldRemarks[responseKey] !== "string" || !row.fieldRemarks[responseKey].trim())) issues.push(`Hydrant row ${rowIndex + 1} ${label} requires its own Remark`);
    }
  }
  const required = v7RequiredHydrantFieldPaths(responses);
  const attachedFields = new Set(attachments.filter((item) => item.systemKey === "hydrant" && item.protocolVersion === 7).map((item) => item.fieldPath));
  for (const fieldPath of required) if (!attachedFields.has(fieldPath)) issues.push(`${fieldPath} requires its own Photo`);
  issues.push(...duplicateHydrantV7PhotoIssues(attachments, required));
  return issues;
}

/** The server rejects source-hash reuse inside a job+system. Refuse it before
 * a local Pending record can be stranded behind an impossible acceptance. */
export function duplicateHydrantV7PhotoIssues(attachments: InspectionAttachmentRecord[], requiredFieldPaths: readonly string[]) {
  const required = new Set(requiredFieldPaths); const issues: string[] = []; const firstUse = new Map<string, string>();
  for (const attachment of attachments.filter((item) => item.systemKey === "hydrant" && item.protocolVersion === 7 && required.has(item.fieldPath)).slice().sort((left, right) => left.fieldPath.localeCompare(right.fieldPath))) {
    const earlier = firstUse.get(attachment.sha256);
    if (earlier) issues.push(`${earlier} and ${attachment.fieldPath} use the same photo; each finding needs its own photo`);
    else firstUse.set(attachment.sha256, attachment.fieldPath);
  }
  return issues;
}

export async function v7HydrantContractSha256(definition: unknown) {
  const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}` : JSON.stringify(value);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(definition)));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function saveHydrantV7Photo(values: { record: HydrantInspectionRecord; fieldPath: HydrantV7FieldPath; captureSource: AttachmentCaptureSource; blob: Blob; mimeType: "image/jpeg"; sizeBytes: number; width: number; height: number; sha256: string; capturedAt?: string }) {
  if (values.record.masterTemplate.version !== 7 || values.record.syncStatus !== "Draft") throw new Error("V7 evidence can only be changed in a Hydrant V7 Draft");
  const contractSha256 = await v7HydrantContractSha256(values.record.inspectionSnapshot.system.definition);
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.inspectionAttachments, async () => {
    const live = await localDatabase.masterSystemInspections.get(values.record.clientUuid) as HydrantInspectionRecord | undefined;
    if (!live || live.systemKey !== "hydrant" || live.masterTemplate.version !== 7 || live.syncStatus !== "Draft") throw new Error("Hydrant V7 Draft changed before evidence was saved");
    const held = await localDatabase.inspectionAttachments.where("inspectionClientUuid").equals(live.clientUuid).toArray();
    const clash = held.find((item) => item.systemKey === "hydrant" && item.protocolVersion === 7 && item.sha256 === values.sha256 && item.fieldPath !== values.fieldPath);
    if (clash) throw new Error(`This photo is already attached to ${clash.fieldPath}. Each finding needs its own photo.`);
    const existing = held.find((item) => item.systemKey === "hydrant" && item.protocolVersion === 7 && item.fieldPath === values.fieldPath);
    const timestamp = now();
    await localDatabase.inspectionAttachments.put({ photoUuid: existing?.photoUuid ?? crypto.randomUUID(), inspectionClientUuid: live.clientUuid, systemKey: "hydrant", fieldPath: values.fieldPath, evidencePolicyId: "v7-shared-evidence", evidencePolicyVersion: 7, captureSource: values.captureSource, blob: values.blob, mimeType: values.mimeType, sizeBytes: values.sizeBytes, width: values.width, height: values.height, sha256: values.sha256, capturedAt: values.capturedAt ?? timestamp, localCreatedAt: existing?.localCreatedAt ?? timestamp, localUpdatedAt: timestamp, syncStatus: "Draft", protocolVersion: 7, masterTemplateId: live.masterTemplate.id, contractSha256 });
  });
}
