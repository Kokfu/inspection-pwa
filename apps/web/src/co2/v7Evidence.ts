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
export function v7SubmissionIssues(record: MasterSystemFormInstanceRecord, responses: Co2Responses, attachments: InspectionAttachmentRecord[], siblings: readonly V7SiblingEvidence[] = []) {
  if (record.masterTemplate.version !== 7) return [];
  const issues: string[] = [];
  for (const [group, prefix] of groups) for (const [key, value] of Object.entries(responses[group])) {
    if (isEvidenceFinding(value.result) && !value.remarks.trim()) issues.push(`${prefix}.${key} requires its own Remark`);
  }
  const required = v7RequiredFieldPaths(responses);
  const fields = new Set(attachments.filter((item) => item.protocolVersion === 7).map((item) => item.fieldPath));
  for (const fieldPath of required) if (!fields.has(fieldPath)) issues.push(`${fieldPath} requires its own Photo`);
  issues.push(...duplicateV7PhotoIssues(attachments, required));
  issues.push(...crossInstanceV7PhotoIssues(attachments, required, siblings));
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
/** One other location-instance of the same system in the same Job, reduced to
 * exactly what the duplicate decision needs.  Kept pure/serialisable so the
 * decision can be unit-tested without IndexedDB. */
export type V7SiblingEvidence = {
  clientUuid: string;
  locationLabel: string;
  requiredFieldPaths: readonly string[];
  attachments: ReadonlyArray<Pick<InspectionAttachmentRecord, "fieldPath" | "sha256"> & { protocolVersion?: 6 | 7 }>;
};

const siblingFindingPhotos = (siblings: readonly V7SiblingEvidence[]) =>
  siblings.flatMap((sibling) => {
    // Only a sibling's *currently required* paths are staged for acceptance; a
    // photo left on a field reverted to good/na is stale, excluded from that
    // sibling's manifest, and must not block this location (G9).
    const required = new Set(sibling.requiredFieldPaths);
    return sibling.attachments
      .filter((item) => item.protocolVersion === 7 && required.has(item.fieldPath))
      .map((item) => ({ locationLabel: sibling.locationLabel, fieldPath: item.fieldPath, sha256: item.sha256 }));
  });

/** G9: server evidence uniqueness is `jobId + systemKey`, but one Job can hold
 * several location-instances of one system.  The in-instance guard above cannot
 * see them, so the same photo on two locations only failed at acceptance with a
 * retryable EVIDENCE_CONFLICT the outbox can never clear. */
export function crossInstanceV7PhotoIssues(
  attachments: readonly (Pick<InspectionAttachmentRecord, "fieldPath" | "sha256"> & { protocolVersion?: 6 | 7 })[],
  requiredFieldPaths: readonly string[],
  siblings: readonly V7SiblingEvidence[]
) {
  const required = new Set<string>(requiredFieldPaths);
  const elsewhere = siblingFindingPhotos(siblings);
  const issues: string[] = [];
  for (const attachment of attachments
    .filter((item) => item.protocolVersion === 7 && required.has(item.fieldPath))
    .slice()
    .sort((left, right) => left.fieldPath.localeCompare(right.fieldPath))) {
    const clash = elsewhere.find((item) => item.sha256 === attachment.sha256);
    if (clash) issues.push(`${attachment.fieldPath} and ${clash.fieldPath} at ${clash.locationLabel} use the same photo; each finding needs its own photo`);
  }
  return issues;
}

/** Capture-time twin of the above: refuse the photo before it is stored. */
export function crossInstanceV7PhotoClash(sha256: string, siblings: readonly V7SiblingEvidence[]) {
  return siblingFindingPhotos(siblings).find((item) => item.sha256 === sha256);
}

export function v7InstanceLocationLabel(record: Pick<MasterSystemFormInstanceRecord, "inspectionSnapshot" | "displaySequence">) {
  return record.inspectionSnapshot?.instance?.location?.displayName || `Location ${record.displaySequence}`;
}

/** Impure half: the Job+systemKey join.  `groupKey` is `${jobId}:${systemKey}`
 * (co2Repository) and is indexed on masterSystemFormInstances (Dexie v9), as is
 * inspectionClientUuid on inspectionAttachments — so this is two indexed hops,
 * no table scan and no schema change.  Safe to call inside an existing `rw`
 * transaction provided both tables are in its scope. */
type IndexedReader<T> = { where(index: string): { equals(value: string): { toArray(): Promise<T[]> } } };
/** The two indexed tables the join needs. `localDatabase` satisfies it; tests
 * substitute an in-memory reader because this repo has no fake-indexeddb. */
export type V7EvidenceSource = {
  masterSystemFormInstances: IndexedReader<MasterSystemFormInstanceRecord>;
  inspectionAttachments: IndexedReader<InspectionAttachmentRecord>;
};
export async function collectV7SiblingEvidence(record: Pick<MasterSystemFormInstanceRecord, "clientUuid" | "groupKey">, source: V7EvidenceSource = localDatabase) {
  const siblings = (await source.masterSystemFormInstances.where("groupKey").equals(record.groupKey).toArray())
    // Every sibling counts regardless of syncStatus: an already-Accepted sibling
    // is precisely the row the server refuses against.
    .filter((item) => item.clientUuid !== record.clientUuid && item.masterTemplate.version === 7)
    .sort((left, right) => left.displaySequence - right.displaySequence);
  const collected: V7SiblingEvidence[] = [];
  for (const sibling of siblings) {
    collected.push({
      clientUuid: sibling.clientUuid,
      locationLabel: v7InstanceLocationLabel(sibling),
      requiredFieldPaths: v7RequiredFieldPaths(sibling.responses),
      attachments: (await source.inspectionAttachments.where("inspectionClientUuid").equals(sibling.clientUuid).toArray()).filter((item) => item.protocolVersion === 7)
    });
  }
  return collected;
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
    // Both tables are in this transaction's scope, so the sibling join is safe here.
    const elsewhere = crossInstanceV7PhotoClash(values.sha256, await collectV7SiblingEvidence(live));
    if (elsewhere) throw new Error(`This photo is already attached to ${elsewhere.fieldPath} at ${elsewhere.locationLabel}. Each finding needs its own photo.`);
    const existing = held.find((item) => item.fieldPath === values.fieldPath);
    const timestamp = now();
    await localDatabase.inspectionAttachments.put({ photoUuid: existing?.photoUuid ?? crypto.randomUUID(), inspectionClientUuid: live.clientUuid, systemKey: live.systemKey, fieldPath: values.fieldPath, evidencePolicyId: "v7-shared-evidence", evidencePolicyVersion: 7, captureSource: values.captureSource, blob: values.blob, mimeType: values.mimeType, sizeBytes: values.sizeBytes, width: values.width, height: values.height, sha256: values.sha256, capturedAt: values.capturedAt ?? timestamp, localCreatedAt: existing?.localCreatedAt ?? timestamp, localUpdatedAt: timestamp, syncStatus: "Draft", protocolVersion: 7, masterTemplateId: live.masterTemplate.id, contractSha256 });
  });
}
export function v7EvidenceManifest(attachments: InspectionAttachmentRecord[], responses: Co2Responses) { const currentPoor = new Set(v7RequiredFieldPaths(responses)); return attachments.filter((item) => item.protocolVersion === 7 && currentPoor.has(item.fieldPath as V7SuppressionFieldPath)).map((item) => ({ photoUuid: item.photoUuid, fieldPath: item.fieldPath, sourceSha256: item.sha256 })).sort((a, b) => a.fieldPath.localeCompare(b.fieldPath)); }
export function v7EvidenceOutbox(attachment: InspectionAttachmentRecord): SyncOutboxItem { return { operationId: crypto.randomUUID(), entityType: "v7StagedEvidence", entityId: attachment.photoUuid, action: "create", payload: { inspectionClientUuid: attachment.inspectionClientUuid, systemKey: attachment.systemKey, fieldPath: attachment.fieldPath, protocolVersion: 7 }, createdAt: attachment.localCreatedAt, attempts: 0, status: "Pending", activeKey: `v7StagedEvidence:create:${attachment.photoUuid}` }; }
