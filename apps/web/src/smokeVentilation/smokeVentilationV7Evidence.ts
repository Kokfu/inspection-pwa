import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import type { AttachmentCaptureSource, InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import type { ResultControlDefinition } from "../inspectionControls/definitionTypes";
import {
  smokeVentilationChecklistFields,
  smokeVentilationRowColumns,
  type SmokeVentilationChecklistKey,
  type SmokeVentilationInspectionRecord,
  type SmokeVentilationResponses,
  type SmokeVentilationRowColumn
} from "./smokeVentilationTypes";

export type SmokeVentilationChecklistFieldPath = `smoke_ventilation_checks.${SmokeVentilationChecklistKey}`;
export type SmokeVentilationRowFieldPath = `fan_schedule.fan_schedule_rows.rows.${string}.${typeof smokeVentilationRowColumns[number][1]}`;
export type SmokeVentilationV7FieldPath = SmokeVentilationChecklistFieldPath | SmokeVentilationRowFieldPath;

export const isSmokeVentilationV7EvidenceFinding = (value: unknown) => value === "not_good" || value === "complete_repair";
const now = () => new Date().toISOString();
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const labels: Record<string, string> = { good: "Good", not_good: "Not Good", complete_repair: "Complete Repair", na: "N.A." };

function resultDefinition(field: unknown): ResultControlDefinition | undefined {
  if (!isRecord(field) || field.control !== "good_poor" || !Array.isArray(field.allowedValues)
    || field.allowedValues.length === 0 || !field.allowedValues.every((value) => typeof value === "string")
    || new Set(field.allowedValues).size !== field.allowedValues.length) return undefined;
  return { type: "single_select", required: true, options: field.allowedValues.map((value) => ({ value: value as string, label: labels[value as string] ?? value as string })) };
}

/** The frozen V7 definition, not a hard-coded client list, decides each field's result values. */
export function resolveSmokeVentilationChecklistDefinitions(definition: unknown): Record<SmokeVentilationChecklistKey, ResultControlDefinition> | undefined {
  if (!isRecord(definition) || !Array.isArray(definition.sections)) return undefined;
  const sections: Record<string, [string, string]> = {
    main_power_supply_ac: ["power_supply", "power_supply_checks"],
    secondary_essential_supply_dc: ["power_supply", "power_supply_checks"],
    cb_battery: ["charger_batteries", "charger_battery_checks"],
    cb_charger: ["charger_batteries", "charger_battery_checks"],
    mfk_main_alarm_reset: ["main_function_key", "function_checks"],
    mfk_lamp_test: ["main_function_key", "function_checks"],
    mfk_evacuate: ["main_function_key", "function_checks"],
    mfk_signal_alarm_to_mfap: ["main_function_key", "function_checks"]
  };
  const definitions = {} as Record<SmokeVentilationChecklistKey, ResultControlDefinition>;
  for (const [key] of smokeVentilationChecklistFields) {
    const [sectionKey, blockKey] = sections[key]!;
    const section = definition.sections.find((value) => isRecord(value) && value.key === sectionKey);
    const block = isRecord(section) && Array.isArray(section.blocks) ? section.blocks.find((value) => isRecord(value) && value.key === blockKey) : undefined;
    const field = isRecord(block) && Array.isArray(block.items) ? block.items.find((value) => isRecord(value) && value.key === key) : undefined;
    const resolved = resultDefinition(field);
    if (!resolved) return undefined;
    definitions[key] = resolved;
  }
  return definitions;
}

export function resolveSmokeVentilationRowResultDefinitions(definition: unknown): Record<SmokeVentilationRowColumn, ResultControlDefinition> | undefined {
  if (!isRecord(definition) || !Array.isArray(definition.sections)) return undefined;
  const section = definition.sections.find((value) => isRecord(value) && value.key === "fan_schedule");
  const block = isRecord(section) && Array.isArray(section.blocks) ? section.blocks.find((value) => isRecord(value) && value.key === "fan_schedule_rows") : undefined;
  if (!isRecord(block) || !Array.isArray(block.columns)) return undefined;
  const definitions = {} as Record<SmokeVentilationRowColumn, ResultControlDefinition>;
  for (const [responseKey, wireKey] of smokeVentilationRowColumns) {
    const field = block.columns.find((value) => isRecord(value) && value.key === wireKey);
    const resolved = resultDefinition(field);
    if (!resolved) return undefined;
    definitions[responseKey] = resolved;
  }
  return definitions;
}

export function v7RequiredSmokeVentilationFieldPaths(responses: SmokeVentilationResponses): SmokeVentilationV7FieldPath[] {
  const paths: SmokeVentilationV7FieldPath[] = [];
  for (const [key] of smokeVentilationChecklistFields) {
    if (isSmokeVentilationV7EvidenceFinding(responses.checklist[key]?.result)) paths.push(`smoke_ventilation_checks.${key}`);
  }
  for (const row of responses.rows) for (const [responseKey, wireKey] of smokeVentilationRowColumns) {
    if (isSmokeVentilationV7EvidenceFinding(row[responseKey])) paths.push(`fan_schedule.fan_schedule_rows.rows.${row.rowUuid}.${wireKey}`);
  }
  return paths.sort();
}

export async function listSmokeVentilationV7Photos(inspectionClientUuid: string) {
  return (await localDatabase.inspectionAttachments.where("inspectionClientUuid").equals(inspectionClientUuid).toArray())
    .filter((item) => item.systemKey === "smoke_ventilation" && item.protocolVersion === 7);
}

export function v7SmokeVentilationManifest(attachments: InspectionAttachmentRecord[], responses: SmokeVentilationResponses) {
  const required = new Set(v7RequiredSmokeVentilationFieldPaths(responses));
  return attachments.filter((item) => item.systemKey === "smoke_ventilation" && item.protocolVersion === 7 && required.has(item.fieldPath as SmokeVentilationV7FieldPath))
    .map((item) => ({ photoUuid: item.photoUuid, fieldPath: item.fieldPath, sourceSha256: item.sha256 }))
    .sort((left, right) => left.fieldPath.localeCompare(right.fieldPath));
}

export function v7SmokeVentilationEvidenceOutbox(attachment: InspectionAttachmentRecord): SyncOutboxItem {
  return { operationId: crypto.randomUUID(), entityType: "v7StagedEvidence", entityId: attachment.photoUuid, action: "create", payload: { inspectionClientUuid: attachment.inspectionClientUuid, systemKey: "smoke_ventilation", fieldPath: attachment.fieldPath, protocolVersion: 7 }, createdAt: attachment.localCreatedAt, attempts: 0, status: "Pending", activeKey: `v7StagedEvidence:create:${attachment.photoUuid}` };
}

/** The server rejects source-hash reuse inside a job+system. Refuse it before
 * a local Pending record can be stranded behind an impossible acceptance. */
export function duplicateSmokeVentilationV7PhotoIssues(attachments: InspectionAttachmentRecord[], requiredFieldPaths: readonly string[]) {
  const required = new Set(requiredFieldPaths); const issues: string[] = []; const firstUse = new Map<string, string>();
  for (const attachment of attachments.filter((item) => item.systemKey === "smoke_ventilation" && item.protocolVersion === 7 && required.has(item.fieldPath)).slice().sort((left, right) => left.fieldPath.localeCompare(right.fieldPath))) {
    const earlier = firstUse.get(attachment.sha256);
    if (earlier) issues.push(`${earlier} and ${attachment.fieldPath} use the same photo; each finding needs its own photo`);
    else firstUse.set(attachment.sha256, attachment.fieldPath);
  }
  return issues;
}

export function v7SmokeVentilationSubmissionIssues(record: SmokeVentilationInspectionRecord, responses: SmokeVentilationResponses, attachments: InspectionAttachmentRecord[]) {
  const checklistDefinitions = resolveSmokeVentilationChecklistDefinitions(record.inspectionSnapshot.system.definition);
  const rowDefinitions = resolveSmokeVentilationRowResultDefinitions(record.inspectionSnapshot.system.definition);
  if (!checklistDefinitions || !rowDefinitions) return ["Smoke Ventilation V7 definition is unavailable or malformed"];
  // The paper source marks no field on this page mandatory (docs/paper-forms/smoke-ventilation.md);
  // Control Panel No. / Location / Date Tested stay optional text, matching the
  // template's `required: false`. Only the result fields, which the V7 evidence
  // model itself needs a definite value from, are enforced here.
  const issues: string[] = [];
  for (const [key, label] of smokeVentilationChecklistFields) {
    const entry = responses.checklist[key];
    if (!checklistDefinitions[key].options.some((option) => option.value === entry?.result)) issues.push(`${label} result is required`);
    if (isSmokeVentilationV7EvidenceFinding(entry?.result) && !entry?.remarks.trim()) issues.push(`${label} requires its own Remark`);
  }
  if (!responses.rows.length) issues.push("At least one Fan Schedule row is required");
  for (const [rowIndex, row] of responses.rows.entries()) {
    if (!isRecord(row.fieldRemarks)) issues.push(`Fan Schedule row ${rowIndex + 1} field remarks are invalid`);
    for (const [responseKey, , label] of smokeVentilationRowColumns) {
      const value = row[responseKey];
      if (!rowDefinitions[responseKey].options.some((option) => option.value === value)) issues.push(`Fan Schedule row ${rowIndex + 1} ${label} result is required`);
      if (isSmokeVentilationV7EvidenceFinding(value) && (!isRecord(row.fieldRemarks) || typeof row.fieldRemarks[responseKey] !== "string" || !row.fieldRemarks[responseKey]!.trim())) issues.push(`Fan Schedule row ${rowIndex + 1} ${label} requires its own Remark`);
    }
  }
  const required = v7RequiredSmokeVentilationFieldPaths(responses);
  const attachedFields = new Set(attachments.filter((item) => item.systemKey === "smoke_ventilation" && item.protocolVersion === 7).map((item) => item.fieldPath));
  for (const fieldPath of required) if (!attachedFields.has(fieldPath)) issues.push(`${fieldPath} requires its own Photo`);
  issues.push(...duplicateSmokeVentilationV7PhotoIssues(attachments, required));
  return issues;
}

export async function v7SmokeVentilationContractSha256(definition: unknown) {
  const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}` : JSON.stringify(value);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(definition)));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function saveSmokeVentilationV7Photo(values: { record: SmokeVentilationInspectionRecord; fieldPath: SmokeVentilationV7FieldPath; captureSource: AttachmentCaptureSource; blob: Blob; mimeType: "image/jpeg"; sizeBytes: number; width: number; height: number; sha256: string; capturedAt?: string }) {
  if (values.record.syncStatus !== "Draft") throw new Error("V7 evidence can only be changed in a Smoke Ventilation Draft");
  const contractSha256 = await v7SmokeVentilationContractSha256(values.record.inspectionSnapshot.system.definition);
  await localDatabase.transaction("rw", localDatabase.masterSystemInspections, localDatabase.inspectionAttachments, async () => {
    const live = await localDatabase.masterSystemInspections.get(values.record.clientUuid) as SmokeVentilationInspectionRecord | undefined;
    if (!live || live.systemKey !== "smoke_ventilation" || live.syncStatus !== "Draft") throw new Error("Smoke Ventilation Draft changed before evidence was saved");
    const held = await localDatabase.inspectionAttachments.where("inspectionClientUuid").equals(live.clientUuid).toArray();
    const clash = held.find((item) => item.systemKey === "smoke_ventilation" && item.protocolVersion === 7 && item.sha256 === values.sha256 && item.fieldPath !== values.fieldPath);
    if (clash) throw new Error(`This photo is already attached to ${clash.fieldPath}. Each finding needs its own photo.`);
    const existing = held.find((item) => item.systemKey === "smoke_ventilation" && item.protocolVersion === 7 && item.fieldPath === values.fieldPath);
    const timestamp = now();
    await localDatabase.inspectionAttachments.put({ photoUuid: existing?.photoUuid ?? crypto.randomUUID(), inspectionClientUuid: live.clientUuid, systemKey: "smoke_ventilation", fieldPath: values.fieldPath, evidencePolicyId: "v7-shared-evidence", evidencePolicyVersion: 7, captureSource: values.captureSource, blob: values.blob, mimeType: values.mimeType, sizeBytes: values.sizeBytes, width: values.width, height: values.height, sha256: values.sha256, capturedAt: values.capturedAt ?? timestamp, localCreatedAt: existing?.localCreatedAt ?? timestamp, localUpdatedAt: timestamp, syncStatus: "Draft", protocolVersion: 7, masterTemplateId: live.masterTemplate.id, contractSha256 });
  });
}
