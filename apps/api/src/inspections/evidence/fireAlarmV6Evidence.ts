import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import Busboy from "busboy";
import type { Request } from "express";
import type { PoolClient } from "pg";
import { attachmentMaxBytes, attachmentPaths, createAttachmentTempPath, moveNormalizedAttachment, normalizeAttachmentImage, verifyAttachmentFile } from "../../attachments/attachmentStorage.js";
import { pool } from "../../db/pool.js";

type RecordValue = Record<string, unknown>;
type UploadFields = Record<string, string>;
export type EvidenceManifestEntry = { photoUuid: string; fieldPath: string; sourceSha256: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = /^[0-9a-f]{64}$/;
const canonicalUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const uploadFields = new Set(["photoUuid", "inspectionClientUuid", "jobId", "systemKey", "fieldPath", "masterTemplateId", "masterTemplateVersion", "contractSha256", "captureSource", "capturedAt", "sha256", "sizeBytes", "width", "height"]);
const checklistFields = new Set([
  "charger_batteries.charger_battery_checks.main_supply",
  "charger_batteries.charger_battery_checks.battery",
  "charger_batteries.charger_battery_checks.charger",
  "main_function_key.function_checks.main_alarm_reset",
  "main_function_key.function_checks.lamp_test",
  "main_function_key.function_checks.evacuate",
  "main_function_key.function_checks.ac_supply",
  "main_function_key.function_checks.dc_supply",
  "main_function_key.function_checks.spka_system",
  "main_function_key.function_checks.alarm_lift_trip",
  "main_function_key.function_checks.signal_gas_discharge"
]);
const secondaryPath = /^alarm_devices\.alarm_device_rows\.rows\.([0-9a-f-]{36})\.(alarm_bell|manual_call_point)$/;

export class V6EvidenceError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const canonicalize = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonicalize).join(",")}]` : isRecord(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}` : JSON.stringify(value);
export const fireAlarmV6ContractSha256 = (definition: unknown) => createHash("sha256").update(canonicalize(definition)).digest("hex");

export function isFireAlarmV6EvidenceFieldPath(fieldPath: unknown): fieldPath is string {
  if (typeof fieldPath !== "string") return false;
  if (checklistFields.has(fieldPath)) return true;
  const row = secondaryPath.exec(fieldPath);
  return !!row && uuid.test(row[1]);
}

export function parseV6EvidenceManifest(value: unknown): EvidenceManifestEntry[] | undefined {
  if (!Array.isArray(value) || value.length > 250) return undefined;
  const paths = new Set<string>(); const photos = new Set<string>(); const hashes = new Set<string>();
  const parsed: EvidenceManifestEntry[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || Object.keys(entry).length !== 3 || !uuid.test(String(entry.photoUuid))
      || !isFireAlarmV6EvidenceFieldPath(entry.fieldPath) || !hash.test(String(entry.sourceSha256))
      || paths.has(entry.fieldPath as string) || photos.has(entry.photoUuid as string) || hashes.has(entry.sourceSha256 as string)) return undefined;
    paths.add(entry.fieldPath as string); photos.add(entry.photoUuid as string); hashes.add(entry.sourceSha256 as string);
    parsed.push({ photoUuid: entry.photoUuid as string, fieldPath: entry.fieldPath as string, sourceSha256: entry.sourceSha256 as string });
  }
  return parsed.sort((a, b) => a.fieldPath.localeCompare(b.fieldPath));
}

async function parseMultipart(request: Request) {
  const sourcePath = await createAttachmentTempPath(); const fields: UploadFields = {}; let count = 0; let truncated = false; let invalidFile = false; let limitsExceeded = false; const writes: Promise<void>[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      let parser: ReturnType<typeof Busboy>;
      try { parser = Busboy({ headers: request.headers, limits: { files: 1, fields: uploadFields.size, parts: uploadFields.size + 2, fileSize: attachmentMaxBytes, fieldNameSize: 100, fieldSize: 500, headerPairs: 50 } }); }
      catch { reject(new V6EvidenceError(400, "VALIDATION_ERROR", "Multipart upload is invalid")); return; }
      const abort = (error: Error) => { parser.destroy(error); reject(error); };
      parser.on("field", (name, value, info) => { if (info.nameTruncated || info.valueTruncated || !uploadFields.has(name) || name in fields) abort(new V6EvidenceError(400, "VALIDATION_ERROR", "Multipart fields are invalid")); else fields[name] = value; }); parser.on("fieldsLimit", () => { limitsExceeded = true; }); parser.on("filesLimit", () => { limitsExceeded = true; }); parser.on("partsLimit", () => { limitsExceeded = true; });
      parser.on("file", (name, file, info) => { count += 1; if (name !== "file" || count > 1 || info.mimeType !== "image/jpeg") { invalidFile = true; file.resume(); return; } file.on("limit", () => { truncated = true; }); writes.push(pipeline(file, createWriteStream(sourcePath, { flags: "wx" }))); });
      parser.on("error", reject); parser.on("close", () => { void Promise.all(writes).then(() => resolve(), reject); });
      void pipeline(request, new Transform({ transform(chunk, _encoding, callback) { callback(null, chunk); } }), parser).catch(reject);
    });
    if (count !== 1 || invalidFile || truncated || limitsExceeded || Object.keys(fields).length !== uploadFields.size) throw new V6EvidenceError(400, "VALIDATION_ERROR", "A complete JPEG upload is required");
    return { fields, sourcePath };
  } catch (error) { await unlink(sourcePath).catch(() => undefined); throw error; }
}

function positive(value: string | undefined, name: string) { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed <= 0) throw new V6EvidenceError(400, "VALIDATION_ERROR", `${name} is invalid`); return parsed; }

// PostgreSQL BIGINT values are returned by node-postgres as strings by default.
// Keep that boundary explicit so a retry by the same authenticated Technician
// is not falsely treated as a cross-actor reservation conflict.
type Reservation = { inspection_client_uuid: string; job_id: string; system_key: string; master_template_version_id: string; system_contract_sha256: string; reserved_by_user_id: string };

/** Locks/creates an inspection-session reservation after loading only current
 * technician-visible, open Job authority. */
export async function reserveFireAlarmV6Session(client: PoolClient, values: { inspectionClientUuid: string; jobId: string; systemKey: string; masterTemplateId: string; contractSha256: string; actorUserId: number }) {
  const jobResult = await client.query<{ id: string; master_template_version_id: string; configuration_snapshot: unknown }>(
    `SELECT id, master_template_version_id, configuration_snapshot FROM inspection_jobs WHERE id=$1 AND status='open' AND technician_visible=true FOR UPDATE`, [values.jobId]);
  const job = jobResult.rows[0];
  const snapshotTemplate = isRecord(job?.configuration_snapshot) && isRecord(job.configuration_snapshot.template) ? job.configuration_snapshot.template : undefined;
  if (!job || values.systemKey !== "fire_alarm_detector" || job.master_template_version_id !== values.masterTemplateId || snapshotTemplate?.version !== 6) throw new V6EvidenceError(403, "JOB_ACCESS_DENIED", "This open Job is not currently available for V6 evidence");
  const definition = await client.query<{ definition: unknown; definition_status: string }>(`SELECT definition, definition_status FROM master_service_report_systems WHERE template_version_id=$1 AND system_key='fire_alarm_detector'`, [values.masterTemplateId]);
  if (definition.rowCount !== 1 || definition.rows[0].definition_status !== "confirmed" || fireAlarmV6ContractSha256(definition.rows[0].definition) !== values.contractSha256) throw new V6EvidenceError(409, "CONTRACT_MISMATCH", "The frozen V6 Fire Alarm contract is unavailable or changed");
  const existing = await client.query<Reservation>(`SELECT * FROM inspection_evidence_reservations WHERE inspection_client_uuid=$1 FOR UPDATE`, [values.inspectionClientUuid]);
  if (existing.rowCount) {
    const row = existing.rows[0];
    if (row.job_id !== values.jobId || row.system_key !== values.systemKey || row.master_template_version_id !== values.masterTemplateId || row.system_contract_sha256 !== values.contractSha256 || row.reserved_by_user_id !== String(values.actorUserId)) throw new V6EvidenceError(409, "EVIDENCE_NOT_STAGED", "Each manifest photo must be staged by this inspection session");
    return row;
  }
  await client.query(`INSERT INTO inspection_evidence_reservations(inspection_client_uuid,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id) VALUES($1,$2,$3,$4,6,$5,$6)`, [values.inspectionClientUuid, values.jobId, values.systemKey, values.masterTemplateId, values.contractSha256, values.actorUserId]);
  return { inspection_client_uuid: values.inspectionClientUuid, job_id: values.jobId, system_key: values.systemKey, master_template_version_id: values.masterTemplateId, system_contract_sha256: values.contractSha256, reserved_by_user_id: values.actorUserId };
}

export async function stageFireAlarmV6Evidence(request: Request, actorUserId: number) {
  let sourcePath: string | undefined; let normalizedPath: string | undefined; let moved = false;
  try {
    const parsed = await parseMultipart(request); sourcePath = parsed.sourcePath; const f = parsed.fields;
    const claimed = { size: positive(f.sizeBytes, "sizeBytes"), width: positive(f.width, "width"), height: positive(f.height, "height") };
    if (!uuid.test(f.photoUuid) || !uuid.test(f.inspectionClientUuid) || !uuid.test(f.jobId) || f.systemKey !== "fire_alarm_detector" || !isFireAlarmV6EvidenceFieldPath(f.fieldPath) || !uuid.test(f.masterTemplateId) || f.masterTemplateVersion !== "6" || !hash.test(f.contractSha256) || !hash.test(f.sha256) || !["camera", "gallery", "unknown"].includes(f.captureSource) || !canonicalUtc.test(f.capturedAt) || new Date(f.capturedAt).toISOString() !== f.capturedAt) throw new V6EvidenceError(400, "VALIDATION_ERROR", "V6 evidence identity or metadata is invalid");
    const image = await normalizeAttachmentImage(sourcePath).catch(() => { throw new V6EvidenceError(400, "IMAGE_INVALID", "Image content is invalid or outside safe limits"); });
    normalizedPath = image.normalizedTempPath;
    if (image.sourceSha256 !== f.sha256 || image.sourceSizeBytes !== claimed.size || image.sourceWidth !== claimed.width || image.sourceHeight !== claimed.height) throw new V6EvidenceError(400, "VALIDATION_ERROR", "Claimed image metadata does not match the uploaded image");
    const fingerprint = createHash("sha256").update(canonicalize({ photoUuid: f.photoUuid, inspectionClientUuid: f.inspectionClientUuid, jobId: f.jobId, systemKey: f.systemKey, fieldPath: f.fieldPath, masterTemplateId: f.masterTemplateId, contractSha256: f.contractSha256, sourceSha256: image.sourceSha256, storedSha256: image.storedSha256, captureSource: f.captureSource, capturedAt: f.capturedAt })).digest("hex");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await reserveFireAlarmV6Session(client, { inspectionClientUuid: f.inspectionClientUuid, jobId: f.jobId, systemKey: f.systemKey, masterTemplateId: f.masterTemplateId, contractSha256: f.contractSha256, actorUserId });
      const existing = await client.query<{ request_fingerprint: string; stored_sha256: string; storage_relative_path: string; stored_size_bytes: number; inspection_client_uuid: string; uploader_user_id: number }>(`SELECT request_fingerprint,stored_sha256,storage_relative_path,stored_size_bytes,inspection_client_uuid,uploader_user_id FROM staged_inspection_evidence WHERE photo_uuid=$1 FOR UPDATE`, [f.photoUuid]);
      if (existing.rowCount) {
        await client.query("ROLLBACK");
        if (existing.rows[0].request_fingerprint !== fingerprint || existing.rows[0].inspection_client_uuid !== f.inspectionClientUuid || existing.rows[0].uploader_user_id !== actorUserId) throw new V6EvidenceError(409, "IDEMPOTENCY_CONFLICT", "Photo UUID was already staged with different immutable evidence");
        const integrity = await verifyAttachmentFile({ storageRelativePath: existing.rows[0].storage_relative_path, storedSizeBytes: existing.rows[0].stored_size_bytes, storedSha256: existing.rows[0].stored_sha256 });
        if (!integrity.ok) throw new V6EvidenceError(500, "ATTACHMENT_STORAGE_INTEGRITY_ERROR", "Stored staged evidence failed integrity verification");
        return { outcome: "duplicate" as const, photoUuid: f.photoUuid, fieldPath: f.fieldPath, sourceSha256: image.sourceSha256, storedSha256: image.storedSha256 };
      }
      const storage = attachmentPaths(f.inspectionClientUuid, f.photoUuid);
      const existingFile = await stat(storage.finalPath).then((info) => info.isFile(), () => false);
      if (existingFile) throw new V6EvidenceError(409, "ATTACHMENT_STORAGE_INTEGRITY_ERROR", "A conflicting canonical evidence file already exists");
      await moveNormalizedAttachment(normalizedPath, storage.finalPath); moved = true; normalizedPath = undefined;
      await client.query(`INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status) VALUES($1,$2,$3,$4,$5,$6,6,$7,$8,$9,$10,$11,'image/jpeg',$12,$13,$14,$15,$16,$17,$18,'staged')`, [f.photoUuid, f.inspectionClientUuid, f.jobId, f.systemKey, f.fieldPath, f.masterTemplateId, f.contractSha256, actorUserId, fingerprint, image.sourceSha256, image.storedSha256, image.sourceSizeBytes, image.sourceWidth, image.sourceHeight, image.storedSizeBytes, image.width, image.height, storage.relativePath]);
      await client.query("COMMIT");
      return { outcome: "staged" as const, photoUuid: f.photoUuid, fieldPath: f.fieldPath, sourceSha256: image.sourceSha256, storedSha256: image.storedSha256 };
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); if (isRecord(error) && error.code === "23505") throw new V6EvidenceError(409, "EVIDENCE_FIELD_OCCUPIED", "This V6 evidence field already has a different staged photo"); throw error; } finally { client.release(); }
  } finally { if (sourcePath) await unlink(sourcePath).catch(() => undefined); if (normalizedPath) await unlink(normalizedPath).catch(() => undefined); if (moved) { /* retained staging binary is reconciled if a DB outage follows move */ } }
}
