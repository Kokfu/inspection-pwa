import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import Busboy from "busboy";
import type { Request } from "express";
import type { PoolClient } from "pg";
import { attachmentMaxBytes, attachmentPaths, createAttachmentTempPath, moveNormalizedAttachment, normalizeAttachmentImage, verifyAttachmentFile } from "../../attachments/attachmentStorage.js";
import { pool } from "../../db/pool.js";
import { resolveV7EvidenceContract, type V7EvidenceSystemKey } from "./v7EvidenceContracts.js";

type Fields = Record<string, string>;
type RecordValue = Record<string, unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = /^[0-9a-f]{64}$/;
const canonicalUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const fields = new Set(["photoUuid", "inspectionClientUuid", "jobId", "systemKey", "fieldPath", "masterTemplateId", "masterTemplateVersion", "contractSha256", "captureSource", "capturedAt", "sha256", "sizeBytes", "width", "height"]);
const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const canonicalize = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonicalize).join(",")}]` : isRecord(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}` : JSON.stringify(value);

export class V7EvidenceError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

function positive(value: string | undefined, name: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new V7EvidenceError(400, "VALIDATION_ERROR", `${name} is invalid`);
  return parsed;
}

async function parseMultipart(request: Request) {
  const sourcePath = await createAttachmentTempPath(); const received: Fields = {}; let count = 0; let truncated = false; let invalidFile = false; let limited = false; const writes: Promise<void>[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      let parser: ReturnType<typeof Busboy>;
      try { parser = Busboy({ headers: request.headers, limits: { files: 1, fields: fields.size, parts: fields.size + 2, fileSize: attachmentMaxBytes, fieldNameSize: 100, fieldSize: 500, headerPairs: 50 } }); }
      catch { reject(new V7EvidenceError(400, "VALIDATION_ERROR", "Multipart upload is invalid")); return; }
      const abort = (error: Error) => { parser.destroy(error); reject(error); };
      parser.on("field", (name, value, info) => { if (info.nameTruncated || info.valueTruncated || !fields.has(name) || name in received) abort(new V7EvidenceError(400, "VALIDATION_ERROR", "Multipart fields are invalid")); else received[name] = value; });
      parser.on("fieldsLimit", () => { limited = true; }); parser.on("filesLimit", () => { limited = true; }); parser.on("partsLimit", () => { limited = true; });
      parser.on("file", (name, file, info) => { count += 1; if (name !== "file" || count > 1 || info.mimeType !== "image/jpeg") { invalidFile = true; file.resume(); return; } file.on("limit", () => { truncated = true; }); writes.push(pipeline(file, createWriteStream(sourcePath, { flags: "wx" }))); });
      parser.on("error", reject); parser.on("close", () => { void Promise.all(writes).then(() => resolve(), reject); });
      void pipeline(request, new Transform({ transform(chunk, _encoding, callback) { callback(null, chunk); } }), parser).catch(reject);
    });
    if (count !== 1 || invalidFile || truncated || limited || Object.keys(received).length !== fields.size) throw new V7EvidenceError(400, "VALIDATION_ERROR", "A complete JPEG upload is required");
    return { sourcePath, received };
  } catch (error) { await unlink(sourcePath).catch(() => undefined); throw error; }
}

/** V7 session ownership is keyed by the per-location inspectionClientUuid. */
async function reserveV7EvidenceSession(client: PoolClient, values: { inspectionClientUuid: string; jobId: string; systemKey: V7EvidenceSystemKey; templateId: string; contractSha256: string; actorUserId: number }) {
  const jobResult = await client.query<{ master_template_version_id: string; configuration_snapshot: unknown }>(`SELECT master_template_version_id,configuration_snapshot FROM inspection_jobs WHERE id=$1 AND status='open' AND technician_visible=true FOR UPDATE`, [values.jobId]);
  const job = jobResult.rows[0]; const snapshot = isRecord(job?.configuration_snapshot) ? job.configuration_snapshot : undefined;
  const template = snapshot && isRecord(snapshot.template) ? snapshot.template : undefined;
  const enabled = snapshot && Array.isArray(snapshot.enabledSystems) ? snapshot.enabledSystems.find((item) => isRecord(item) && item.systemKey === values.systemKey && item.definitionStatus === "confirmed") : undefined;
  if (!job || !template || template.id !== values.templateId || template.version !== 7 || job.master_template_version_id !== values.templateId || !enabled) throw new V7EvidenceError(403, "JOB_ACCESS_DENIED", "This open Job is not available for V7 staged evidence");
  const definitionResult = await client.query<{ definition: unknown; definition_status: string }>(`SELECT definition,definition_status FROM master_service_report_systems WHERE template_version_id=$1 AND system_key=$2`, [values.templateId, values.systemKey]);
  const adapter = definitionResult.rowCount === 1 && definitionResult.rows[0].definition_status === "confirmed" ? resolveV7EvidenceContract({ systemKey: values.systemKey, templateId: values.templateId, templateVersion: 7, definition: definitionResult.rows[0].definition, contractSha256: values.contractSha256 }) : undefined;
  if (!adapter) throw new V7EvidenceError(409, "CONTRACT_MISMATCH", "The frozen V7 evidence contract is unavailable or changed");
  const existing = await client.query<{ job_id: string; system_key: string; master_template_version_id: string; master_template_version: number; system_contract_sha256: string; reserved_by_user_id: string }>(`SELECT job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id FROM inspection_evidence_reservations WHERE inspection_client_uuid=$1 FOR UPDATE`, [values.inspectionClientUuid]);
  if (existing.rowCount) {
    const row = existing.rows[0]!;
    if (row.job_id !== values.jobId || row.system_key !== values.systemKey || row.master_template_version_id !== values.templateId || row.master_template_version !== 7 || row.system_contract_sha256 !== values.contractSha256 || row.reserved_by_user_id !== String(values.actorUserId)) throw new V7EvidenceError(409, "EVIDENCE_NOT_STAGED", "This V7 evidence session belongs to different authority");
    return adapter;
  }
  await client.query(`INSERT INTO inspection_evidence_reservations(inspection_client_uuid,job_id,system_key,master_template_version_id,master_template_version,system_contract_sha256,reserved_by_user_id) VALUES($1,$2,$3,$4,7,$5,$6)`, [values.inspectionClientUuid, values.jobId, values.systemKey, values.templateId, values.contractSha256, values.actorUserId]);
  return adapter;
}

export async function stageV7Evidence(request: Request, actorUserId: number) {
  let sourcePath: string | undefined; let normalizedPath: string | undefined; let moved = false;
  try {
    const parsed = await parseMultipart(request); sourcePath = parsed.sourcePath; const f = parsed.received;
    const systemKey = f.systemKey as V7EvidenceSystemKey; const claimed = { size: positive(f.sizeBytes, "sizeBytes"), width: positive(f.width, "width"), height: positive(f.height, "height") };
    if (!uuid.test(f.photoUuid) || !uuid.test(f.inspectionClientUuid) || !uuid.test(f.jobId) || (systemKey !== "co2_fire_extinguisher" && systemKey !== "wet_chemical" && systemKey !== "fire_alarm_detector") || !uuid.test(f.masterTemplateId) || f.masterTemplateVersion !== "7" || !hash.test(f.contractSha256) || !hash.test(f.sha256) || !["camera", "gallery", "unknown"].includes(f.captureSource) || !canonicalUtc.test(f.capturedAt) || new Date(f.capturedAt).toISOString() !== f.capturedAt) throw new V7EvidenceError(400, "VALIDATION_ERROR", "V7 staged evidence identity or metadata is invalid");
    const image = await normalizeAttachmentImage(sourcePath).catch(() => { throw new V7EvidenceError(400, "IMAGE_INVALID", "Image content is invalid or outside safe limits"); }); normalizedPath = image.normalizedTempPath;
    if (image.sourceSha256 !== f.sha256 || image.sourceSizeBytes !== claimed.size || image.sourceWidth !== claimed.width || image.sourceHeight !== claimed.height) throw new V7EvidenceError(400, "VALIDATION_ERROR", "Claimed image metadata does not match the uploaded image");
    const fingerprint = createHash("sha256").update(canonicalize({ photoUuid: f.photoUuid, inspectionClientUuid: f.inspectionClientUuid, jobId: f.jobId, systemKey, fieldPath: f.fieldPath, masterTemplateId: f.masterTemplateId, contractSha256: f.contractSha256, sourceSha256: image.sourceSha256, storedSha256: image.storedSha256, captureSource: f.captureSource, capturedAt: f.capturedAt })).digest("hex");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const adapter = await reserveV7EvidenceSession(client, { inspectionClientUuid: f.inspectionClientUuid, jobId: f.jobId, systemKey, templateId: f.masterTemplateId, contractSha256: f.contractSha256, actorUserId });
      if (!adapter.isCanonicalFieldPath(f.fieldPath)) throw new V7EvidenceError(400, "VALIDATION_ERROR", "V7 evidence field path is not permitted by the frozen contract");
      const existing = await client.query<{ request_fingerprint: string; inspection_client_uuid: string; uploader_user_id: number; stored_sha256: string; storage_relative_path: string; stored_size_bytes: number }>(`SELECT request_fingerprint,inspection_client_uuid,uploader_user_id,stored_sha256,storage_relative_path,stored_size_bytes FROM staged_inspection_evidence WHERE photo_uuid=$1 FOR UPDATE`, [f.photoUuid]);
      if (existing.rowCount) {
        await client.query("ROLLBACK"); const row = existing.rows[0]!;
        if (row.request_fingerprint !== fingerprint || row.inspection_client_uuid !== f.inspectionClientUuid || row.uploader_user_id !== actorUserId) throw new V7EvidenceError(409, "IDEMPOTENCY_CONFLICT", "Photo UUID was already staged with different immutable evidence");
        const integrity = await verifyAttachmentFile({ storageRelativePath: row.storage_relative_path, storedSizeBytes: row.stored_size_bytes, storedSha256: row.stored_sha256 });
        if (!integrity.ok) throw new V7EvidenceError(500, "ATTACHMENT_STORAGE_INTEGRITY_ERROR", "Stored staged evidence failed integrity verification");
        return { outcome: "duplicate" as const, photoUuid: f.photoUuid, fieldPath: f.fieldPath, sourceSha256: image.sourceSha256, storedSha256: image.storedSha256 };
      }
      const storage = attachmentPaths(f.inspectionClientUuid, f.photoUuid); if (await stat(storage.finalPath).then((value) => value.isFile(), () => false)) throw new V7EvidenceError(409, "ATTACHMENT_STORAGE_INTEGRITY_ERROR", "A conflicting canonical evidence file already exists");
      await moveNormalizedAttachment(normalizedPath, storage.finalPath); moved = true; normalizedPath = undefined;
      await client.query(`INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status) VALUES($1,$2,$3,$4,$5,$6,7,$7,$8,$9,$10,$11,'image/jpeg',$12,$13,$14,$15,$16,$17,$18,'staged')`, [f.photoUuid, f.inspectionClientUuid, f.jobId, systemKey, f.fieldPath, f.masterTemplateId, f.contractSha256, actorUserId, fingerprint, image.sourceSha256, image.storedSha256, image.sourceSizeBytes, image.sourceWidth, image.sourceHeight, image.storedSizeBytes, image.width, image.height, storage.relativePath]);
      await client.query("COMMIT");
      return { outcome: "staged" as const, photoUuid: f.photoUuid, fieldPath: f.fieldPath, sourceSha256: image.sourceSha256, storedSha256: image.storedSha256 };
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); if (isRecord(error) && error.code === "23505") throw new V7EvidenceError(409, "EVIDENCE_FIELD_OCCUPIED", "This V7 evidence field already has a different staged photo"); throw error; } finally { client.release(); }
  } finally { if (sourcePath) await unlink(sourcePath).catch(() => undefined); if (normalizedPath) await unlink(normalizedPath).catch(() => undefined); if (moved) { /* retained staging binary is reconciled after a DB outage */ } }
}
