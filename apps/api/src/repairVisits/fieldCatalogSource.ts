import type { Pool, PoolClient } from "pg";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { loadConfig } from "../config/env.js";
import { readFindingParts, resolveRepairField, record, invalidSource, isLegacyFireAlarmCatalog, legacyFireAlarmCatalog, type R, type FindingPart } from "./fieldCatalogReaders.js";
import { applyCorrections, type Json, type StoredCorrection } from "../corrections/correctionApplication.js";
import { resolveV7EvidenceContract } from "../inspections/evidence/v7EvidenceContracts.js";
import { v7DisplayLabelLookup } from "../reports/finalServiceReport.js";
export type Queryable = Pick<Pool | PoolClient, "query">;
export const fingerprint = (v: unknown): string => createHash("sha256").update(canonical(v)).digest("hex");
function canonical(v: unknown): string { return Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : record(v) ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v); }

/** Same exact row as Accepted Detail; extra historical Fire Alarm metadata stays separate. */
export async function loadRepairSource(db: Queryable, formId: string) {
  const result = await db.query(`SELECT i.client_uuid AS "clientUuid",i.id AS "serverFormInstanceId",
    j.id AS "jobId",j.job_reference AS "jobReference",j.title AS "jobTitle",c.display_name AS "customerName",
    p.system_key AS "systemKey",i.instance_key AS "instanceKey",i.zone_id AS "zoneId",i.location_id AS "locationId",
    i.display_sequence AS "displaySequence",i.status,
    to_char(i.performed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "performedAt",
    to_char(i.received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "receivedAt",
    i.master_template_version_id AS "templateId",i.customer_configuration_revision_id AS "configurationRevisionId",
    i.inspection_snapshot AS "inspectionSnapshot",i.response_payload AS responses,
    i.original_creator_snapshot->>'username' AS "deviceReportedCreatorUsername",creator.username AS "verifiedOriginalCreatorUsername",
    syncer.username AS "syncedByUsername",c.id AS "customerId",c.customer_code AS "customerCode",
    i.inspection_group_id AS "inspectionGroupId",i.original_creator_snapshot AS "originalCreatorSnapshot",
    t.version AS "storedVersion",j.configuration_snapshot AS "jobSnapshot"
    FROM master_system_form_instances i JOIN master_system_inspections p ON p.id=i.inspection_group_id
    JOIN inspection_jobs j ON j.id=p.job_id JOIN customers c ON c.id=j.customer_id
    JOIN master_service_report_templates t ON t.id=i.master_template_version_id
    LEFT JOIN users creator ON creator.id=i.original_created_by_user_id JOIN users syncer ON syncer.id=i.synced_by_user_id
    WHERE i.id=$1 AND i.status='submitted' AND j.is_sample=false`, [formId]);
  const raw = result.rows[0] as R | undefined;
  if (!raw) return invalidSource();
  const { customerId,customerCode,inspectionGroupId,originalCreatorSnapshot,storedVersion,jobSnapshot,...common } = raw;
  const row = raw.systemKey === "fire_alarm_detector" ? { ...common,customerId,customerCode,inspectionGroupId,originalCreatorSnapshot } : common;
  const snap = row.inspectionSnapshot;
  if (!record(snap) || !record(snap.template) || snap.template.version !== storedVersion
    || !record(jobSnapshot) || !record(jobSnapshot.template) || jobSnapshot.template.id !== snap.template.id
    || jobSnapshot.template.version !== storedVersion || !record(jobSnapshot.configuration) || !record(snap.configuration)
    || jobSnapshot.configuration.revisionId !== snap.configuration.revisionId) return invalidSource();
  const frozenSystem = Array.isArray(jobSnapshot.enabledSystems) ? jobSnapshot.enabledSystems.find(s => record(s) && s.systemKey === row.systemKey) : undefined;
  return { row, site: jobSnapshot.site ?? null, frozenSystem };
}

export type BeforePhoto = { photoUuid: string; fieldPath: string; sourceSha256: string; storedSha256: string; sizeBytes: number; width: number; height: number; storageRelativePath: string };
export async function readBeforeBytes(photo: BeforePhoto): Promise<Buffer> {
  try {
    const root = await realpath(path.resolve(loadConfig().uploadsPath));
    const target = await realpath(path.resolve(root, ...photo.storageRelativePath.split("/")));
    if (!target.startsWith(`${root}${path.sep}`)) return invalidSource();
    const bytes = await readFile(target);
    if (bytes.length !== photo.sizeBytes || bytes.length > 2 * 1024 * 1024 || createHash("sha256").update(bytes).digest("hex") !== photo.storedSha256) return invalidSource();
    const meta = await sharp(bytes, { failOn: "warning", limitInputPixels: 40_000_000 }).metadata();
    if (meta.format !== "jpeg" || meta.width !== photo.width || meta.height !== photo.height || (meta.pages ?? 1) !== 1) return invalidSource();
    await sharp(bytes, { failOn: "warning", limitInputPixels: 40_000_000 }).raw().toBuffer();
    return bytes;
  } catch { return invalidSource(); }
}

export async function extractRepairSource(db: Queryable, formId: string) {
  const { row, site, frozenSystem } = await loadRepairSource(db, formId);
  const extracted = readFindingParts(row);
  const bound = await db.query(`SELECT photo_uuid AS "photoUuid",field_path AS "fieldPath",source_sha256 AS "sourceSha256",
    stored_sha256 AS "storedSha256",stored_size_bytes AS "sizeBytes",width,height,storage_relative_path AS "storageRelativePath",
    inspection_client_uuid AS "clientUuid",job_id AS "jobId",system_key AS "systemKey",master_template_version_id AS "templateId",
    master_template_version AS version,system_contract_sha256 AS "contractSha256"
    FROM staged_inspection_evidence WHERE form_instance_id=$1 AND status='accepted' ORDER BY field_path`, [formId]);
  if (extracted.manifest && bound.rows.length !== extracted.manifest.length) return invalidSource();
  const photos = new Map<string, BeforePhoto>();
  for (const raw of bound.rows as Array<BeforePhoto & R>) {
    const entry = extracted.manifest ? extracted.manifest.find(m => m.photoUuid === raw.photoUuid && m.fieldPath === raw.fieldPath && m.sourceSha256 === raw.sourceSha256)
      : extracted.allowedPaths?.includes(raw.fieldPath);
    if (!entry || photos.has(raw.fieldPath) || raw.clientUuid !== row.clientUuid || raw.jobId !== row.jobId || raw.systemKey !== row.systemKey
      || raw.templateId !== row.templateId || raw.version !== extracted.version || raw.contractSha256 !== extracted.contractSha256) return invalidSource();
    const photo: BeforePhoto = { photoUuid: raw.photoUuid,fieldPath: raw.fieldPath,sourceSha256: raw.sourceSha256,storedSha256: raw.storedSha256,
      sizeBytes: raw.sizeBytes,width: raw.width,height: raw.height,storageRelativePath: raw.storageRelativePath };
    await readBeforeBytes(photo);
    photos.set(raw.fieldPath,photo);
  }
  if (extracted.requiredPaths.some(p => !photos.has(p))) return invalidSource();
  const snapshot = row.inspectionSnapshot as R;
  const corrections = await db.query(`SELECT field_path AS "fieldPath",sequence,new_value AS "newValue" FROM inspection_corrections WHERE form_instance_id=$1 ORDER BY sequence`, [formId]);
  let parts = extracted.parts;
  if (corrections.rows.length) {
    let effective: Json;
    try { effective = applyCorrections(row.responses as Json, corrections.rows as StoredCorrection[]); } catch { return invalidSource(); }
    if (!record(effective)) return invalidSource();
    if (isLegacyFireAlarmCatalog(row)) {
      parts = legacyFireAlarmCatalog(row, effective).parts;
    } else {
      const adapter = resolveV7EvidenceContract({ systemKey: row.systemKey, templateId: row.templateId, templateVersion: 7,
        definition: (snapshot.system as R).definition, contractSha256: extracted.contractSha256 });
      const paths = adapter?.derivePhotoFieldPaths(effective);
      if (!adapter || !paths) return invalidSource();
      parts = [];
      for (const fieldPath of [...paths.required, ...paths.optional]) {
        const field = resolveRepairField(String(row.systemKey), effective, fieldPath), caption = adapter.acceptedEvidenceCaption(fieldPath);
        if (!field || !caption) return invalidSource();
        if (field.result === "complete_repair") continue;
        if (!["good", "not_good", "na"].includes(String(field.result)) || field.remark !== undefined && typeof field.remark !== "string") return invalidSource();
        const [sectionLabel, ...labels] = caption.split(" - ");
        parts.push({ ...field, fieldPath, result: field.result as FindingPart["result"], remark: typeof field.remark === "string" ? field.remark : "", caption, sectionLabel: sectionLabel!, fieldLabel: labels.join(" - ") || caption });
      }
    }
    row.responses = effective;
  }
  const displayLabels = v7DisplayLabelLookup(String(row.systemKey), snapshot, frozenSystem);
  return { row, parts: parts.map(part => ({ ...part,
    fieldLabel: displayLabels?.display.get(part.responsePath.endsWith(".result") ? part.responsePath.split(".").at(-2)! : part.responsePath.split(".").at(-1)!) ?? part.fieldLabel,
    sourceClientUuid: row.clientUuid, jobId: row.jobId, systemKey: row.systemKey,
    sourceJob: {id:row.jobId,reference:row.jobReference,title:row.jobTitle},
    formInstanceId: formId, instanceKey: row.instanceKey, locationId: row.locationId, zoneId: row.zoneId,
    template: snapshot.template, configuration: snapshot.configuration, contractSha256: extracted.contractSha256,
    customer: snapshot.customer, site, system: (snapshot.system as R).displayName ?? row.systemKey,
    instance: snapshot.instance ?? null, beforePhoto: photos.get(part.fieldPath) ?? null,
    beforePhotoMissing: !photos.has(part.fieldPath), beforePhotoLabel: photos.has(part.fieldPath) ? "Original Before photo" : "Historical finding: no original Before photo" })) };
}
