import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import Busboy from "busboy";
import { Router, type Request } from "express";
import type { PoolClient } from "pg";
import { auditLog } from "../audit/auditLog.js";
import {
  attachmentMaxBytes,
  attachmentPaths,
  createAttachmentTempPath,
  moveNormalizedAttachment,
  normalizeAttachmentImage,
  verifyAttachmentFile
} from "../attachments/attachmentStorage.js";
import { loadConfig } from "../config/env.js";
import { pool } from "../db/pool.js";
import { requireRole } from "../middleware/requireRole.js";

type Fields = Record<string, string>;
type UploadFailureCode =
  | "VALIDATION_ERROR"
  | "PARENT_NOT_SYNCED"
  | "EVIDENCE_NOT_ALLOWED"
  | "IDEMPOTENCY_CONFLICT"
  | "ATTACHMENT_FIELD_OCCUPIED"
  | "ATTACHMENT_STORAGE_INTEGRITY_ERROR"
  | "ATTACHMENT_STORAGE_ERROR"
  | "IMAGE_INVALID";

class UploadError extends Error {
  constructor(
    readonly status: number,
    readonly code: UploadFailureCode,
    message: string
  ) {
    super(message);
  }
}

type ParentRow = {
  formInstanceId: string;
  inspectionClientUuid: string;
  systemKey: string;
  evidencePolicyId: string | null;
  evidencePolicyVersion: number | null;
  evidencePolicySnapshot: unknown;
  evidencePolicySha256: string | null;
};

type ExistingRow = {
  serverAttachmentId: string;
  clientUuid: string;
  requestFingerprint: string;
  sourceSha256: string;
  storedSha256: string;
  fieldPath: string;
  captureSource: "camera" | "gallery" | "unknown";
  mimeType: "image/jpeg";
  sizeBytes: number;
  width: number;
  height: number;
  capturedAt: string;
  receivedAt: string;
  storageRelativePath: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const shaPattern = /^[0-9a-f]{64}$/;
const allowedFields = new Set([
  "photoUuid",
  "inspectionClientUuid",
  "fieldPath",
  "captureSource",
  "capturedAt",
  "sha256",
  "sizeBytes",
  "width",
  "height"
]);
const multipartPartLimit = allowedFields.size + 1;
const multipartBodyLimit = attachmentMaxBytes + 32 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePositiveInteger(value: string | undefined, name: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new UploadError(400, "VALIDATION_ERROR", `${name} is invalid`);
  }
  return parsed;
}

async function parseMultipartUpload(request: Request) {
  const contentLength = Number(request.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > multipartBodyLimit) {
    throw new UploadError(413, "VALIDATION_ERROR", "Multipart upload exceeds the total request limit");
  }
  const fields: Fields = {};
  const sourcePath = await createAttachmentTempPath();
  let fileCount = 0;
  let fileTruncated = false;
  const writes: Promise<void>[] = [];

  try {
    await new Promise<void>((resolve, reject) => {
      let parser: ReturnType<typeof Busboy>;
      try {
        parser = Busboy({
          headers: request.headers,
          limits: {
            files: 1,
            fields: allowedFields.size,
            // Busboy emits partsLimit when the counter reaches the configured
            // value, so one sentinel slot enforces an actual maximum of 10.
            parts: multipartPartLimit + 1,
            fileSize: attachmentMaxBytes,
            fieldNameSize: 100,
            fieldSize: 500,
            headerPairs: 50
          }
        });
      } catch {
        reject(new UploadError(400, "VALIDATION_ERROR", "Multipart upload is invalid"));
        return;
      }
      const abort = (error: UploadError) => {
        parser.destroy(error);
        reject(error);
      };
      parser.on("field", (name, value, info) => {
        if (
          info.nameTruncated
          || info.valueTruncated
          || !allowedFields.has(name)
          || name in fields
        ) {
          abort(new UploadError(400, "VALIDATION_ERROR", "Multipart fields are invalid"));
          return;
        }
        fields[name] = value;
      });
      parser.on("file", (name, file) => {
        fileCount += 1;
        if (name !== "file" || fileCount > 1) {
          file.resume();
          abort(new UploadError(400, "VALIDATION_ERROR", "Exactly one image file is required"));
          return;
        }
        file.on("limit", () => {
          fileTruncated = true;
        });
        writes.push(pipeline(file, createWriteStream(sourcePath, { flags: "wx" })));
      });
      parser.on("filesLimit", () =>
        abort(new UploadError(400, "VALIDATION_ERROR", "Exactly one image file is required"))
      );
      parser.on("fieldsLimit", () =>
        abort(new UploadError(400, "VALIDATION_ERROR", "Too many multipart fields"))
      );
      parser.on("partsLimit", () =>
        abort(new UploadError(400, "VALIDATION_ERROR", "Too many multipart parts"))
      );
      parser.on("error", reject);
      parser.on("close", async () => {
        try {
          await Promise.all(writes);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      let receivedBytes = 0;
      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          receivedBytes += chunk.length;
          if (receivedBytes > multipartBodyLimit) {
            callback(new UploadError(
              413,
              "VALIDATION_ERROR",
              "Multipart upload exceeds the total request limit"
            ));
            return;
          }
          callback(null, chunk);
        }
      });
      void pipeline(request, limiter, parser).catch((error) => reject(error));
    });
    if (fileCount !== 1 || fileTruncated) {
      throw new UploadError(
        400,
        fileTruncated ? "IMAGE_INVALID" : "VALIDATION_ERROR",
        fileTruncated ? "Image exceeds the 2 MB upload limit" : "Exactly one image file is required"
      );
    }
    if (Object.keys(fields).length !== allowedFields.size) {
      throw new UploadError(400, "VALIDATION_ERROR", "Required multipart fields are missing");
    }
    return { fields, sourcePath };
  } catch (error) {
    await unlink(sourcePath).catch(() => undefined);
    throw error;
  }
}

function safeMetadata(row: ExistingRow) {
  return {
    serverAttachmentId: row.serverAttachmentId,
    photoUuid: row.clientUuid,
    fieldPath: row.fieldPath,
    captureSource: row.captureSource,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    sourceSha256: row.sourceSha256,
    storedSha256: row.storedSha256,
    capturedAt: row.capturedAt,
    receivedAt: row.receivedAt
  };
}

async function verifyStoredAttachment(row: ExistingRow) {
  const integrity = await verifyAttachmentFile({
    storageRelativePath: row.storageRelativePath,
    storedSizeBytes: row.sizeBytes,
    storedSha256: row.storedSha256
  });
  if (!integrity.ok) {
    throw new UploadError(
      500,
      "ATTACHMENT_STORAGE_INTEGRITY_ERROR",
      `Stored attachment failed integrity verification (${integrity.reason})`
    );
  }
}

async function loadExistingByPhotoUuid(
  photoUuid: string,
  client?: PoolClient
) {
  const result = await (client ?? pool).query<ExistingRow>(
    `SELECT id AS "serverAttachmentId", client_uuid AS "clientUuid",
        request_fingerprint AS "requestFingerprint", source_sha256 AS "sourceSha256",
        stored_sha256 AS "storedSha256", field_path AS "fieldPath",
        capture_source AS "captureSource", mime_type AS "mimeType",
        stored_size_bytes AS "sizeBytes", width, height,
        captured_at AS "capturedAt", received_at AS "receivedAt",
        storage_relative_path AS "storageRelativePath"
       FROM inspection_attachments WHERE client_uuid = $1`,
    [photoUuid]
  );
  return result.rows[0];
}

export async function resolveAttachmentCommitOutcome(
  photoUuid: string,
  requestFingerprint: string
) {
  const resolved = await loadExistingByPhotoUuid(photoUuid);
  if (!resolved) return undefined;
  if (resolved.requestFingerprint !== requestFingerprint) {
    throw new UploadError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "Photo UUID was already accepted with different content"
    );
  }
  await verifyStoredAttachment(resolved);
  return resolved;
}

function pointAllowed(snapshot: unknown, fieldPath: string) {
  if (!isRecord(snapshot) || !isRecord(snapshot.points)) return false;
  const point = snapshot.points[fieldPath];
  return isRecord(point)
    && point.allowed === true
    && point.required === false
    && point.maxCount === 1;
}

function fingerprint(values: {
  photoUuid: string;
  inspectionClientUuid: string;
  evidencePolicyId: string;
  evidencePolicyVersion: number;
  fieldPath: string;
  sourceSha256: string;
  sourceSizeBytes: number;
  sourceWidth: number;
  sourceHeight: number;
  captureSource: string;
  capturedAt: string;
}) {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

function uploadFailure(error: unknown) {
  if (error instanceof UploadError) return error;
  if (error instanceof Error && (
    error.message === "IMAGE_SIZE_INVALID"
    || error.message === "IMAGE_DIMENSIONS_INVALID"
    || error.message === "NORMALIZED_IMAGE_INVALID"
  )) {
    return new UploadError(400, "IMAGE_INVALID", "Image content is invalid or outside safe limits");
  }
  return undefined;
}

export const inspectionAttachmentsRouter = Router();

inspectionAttachmentsRouter.post(
  "/inspection-attachments",
  requireRole("admin", "inspector"),
  async (request, response, next) => {
    let sourcePath: string | undefined;
    let normalizedTempPath: string | undefined;
    let finalPath: string | undefined;
    let finalFilePrepared = false;
    let photoUuid = "unknown";
    try {
      const parsed = await parseMultipartUpload(request);
      sourcePath = parsed.sourcePath;
      const { fields } = parsed;
      photoUuid = fields.photoUuid;
      const inspectionClientUuid = fields.inspectionClientUuid;
      const fieldPath = fields.fieldPath;
      const captureSource = fields.captureSource;
      const capturedAt = fields.capturedAt;
      const claimedSize = parsePositiveInteger(fields.sizeBytes, "sizeBytes");
      const claimedWidth = parsePositiveInteger(fields.width, "width");
      const claimedHeight = parsePositiveInteger(fields.height, "height");
      if (
        !uuidPattern.test(photoUuid)
        || !uuidPattern.test(inspectionClientUuid)
        || typeof fieldPath !== "string"
        || !["camera", "gallery", "unknown"].includes(captureSource)
        || Number.isNaN(Date.parse(capturedAt))
        || !shaPattern.test(fields.sha256)
      ) {
        throw new UploadError(400, "VALIDATION_ERROR", "Attachment identity or metadata is invalid");
      }

      const parentResult = await pool.query<ParentRow>(
        `SELECT instance.id AS "formInstanceId",
            instance.client_uuid AS "inspectionClientUuid",
            parent.system_key AS "systemKey",
            instance.evidence_policy_id AS "evidencePolicyId",
            instance.evidence_policy_version AS "evidencePolicyVersion",
            instance.evidence_policy_snapshot AS "evidencePolicySnapshot",
            instance.evidence_policy_sha256 AS "evidencePolicySha256"
           FROM master_system_form_instances instance
           INNER JOIN master_system_inspections parent
             ON parent.id = instance.inspection_group_id
           WHERE instance.client_uuid = $1 AND instance.status = 'submitted'`,
        [inspectionClientUuid]
      );
      const parent = parentResult.rows[0];
      if (!parent) {
        throw new UploadError(409, "PARENT_NOT_SYNCED", "Parent inspection has not been accepted");
      }
      if (
        parent.systemKey !== "automatic_sprinkler"
        || !parent.evidencePolicyId
        || parent.evidencePolicyVersion !== 1
        || !parent.evidencePolicySha256
        || !pointAllowed(parent.evidencePolicySnapshot, fieldPath)
      ) {
        throw new UploadError(403, "EVIDENCE_NOT_ALLOWED", "Photo evidence is not enabled for this field");
      }

      const normalized = await normalizeAttachmentImage(sourcePath).catch(() => {
        throw new UploadError(
          400,
          "IMAGE_INVALID",
          "Image content is invalid or outside safe limits"
        );
      });
      normalizedTempPath = normalized.normalizedTempPath;
      if (
        fields.sha256 !== normalized.sourceSha256
        || claimedSize !== normalized.sourceSizeBytes
        || claimedWidth !== normalized.sourceWidth
        || claimedHeight !== normalized.sourceHeight
      ) {
        throw new UploadError(400, "VALIDATION_ERROR", "Claimed image metadata does not match the uploaded image");
      }

      const requestFingerprint = fingerprint({
        photoUuid,
        inspectionClientUuid,
        evidencePolicyId: parent.evidencePolicyId,
        evidencePolicyVersion: parent.evidencePolicyVersion,
        fieldPath,
        sourceSha256: normalized.sourceSha256,
        sourceSizeBytes: normalized.sourceSizeBytes,
        sourceWidth: normalized.sourceWidth,
        sourceHeight: normalized.sourceHeight,
        captureSource,
        capturedAt
      });
      const existing = await loadExistingByPhotoUuid(photoUuid);
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          throw new UploadError(409, "IDEMPOTENCY_CONFLICT", "Photo UUID was already accepted with different content");
        }
        await verifyStoredAttachment(existing);
        await auditLog({
          actorUserId: request.currentUser?.id,
          action: "inspection_attachment_upload",
          entityType: "inspectionAttachment",
          entityId: photoUuid,
          result: "success",
          reason: "duplicate"
        });
        response.json({ outcome: "duplicate", attachment: safeMetadata(existing) });
        return;
      }

      const storage = attachmentPaths(inspectionClientUuid, photoUuid);
      finalPath = storage.finalPath;
      const client = await pool.connect();
      let commitAttempted = false;
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
          [inspectionClientUuid, photoUuid]
        );
        const lockedExisting = await loadExistingByPhotoUuid(photoUuid, client);
        if (lockedExisting) {
          await client.query("ROLLBACK");
          if (lockedExisting.requestFingerprint !== requestFingerprint) {
            throw new UploadError(
              409,
              "IDEMPOTENCY_CONFLICT",
              "Photo UUID was already accepted with different content"
            );
          }
          await verifyStoredAttachment(lockedExisting);
          await auditLog({
            actorUserId: request.currentUser?.id,
            action: "inspection_attachment_upload",
            entityType: "inspectionAttachment",
            entityId: photoUuid,
            result: "success",
            reason: "duplicate"
          }).catch(() => undefined);
          response.json({ outcome: "duplicate", attachment: safeMetadata(lockedExisting) });
          return;
        }

        const existingCanonicalFile = await stat(finalPath).then(
          (metadata) => metadata.isFile(),
          () => false
        );
        if (existingCanonicalFile) {
          const orphanIntegrity = await verifyAttachmentFile({
            storageRelativePath: storage.relativePath,
            storedSizeBytes: normalized.storedSizeBytes,
            storedSha256: normalized.storedSha256
          });
          if (!orphanIntegrity.ok) {
            throw new UploadError(
              409,
              "ATTACHMENT_STORAGE_INTEGRITY_ERROR",
              "A conflicting canonical attachment file already exists"
            );
          }
          finalFilePrepared = true;
        } else {
          await moveNormalizedAttachment(normalizedTempPath, finalPath);
          finalFilePrepared = true;
          normalizedTempPath = undefined;
        }

        const inserted = await client.query<ExistingRow>(
          `INSERT INTO inspection_attachments (
            id, client_uuid, form_instance_id, evidence_policy_id, field_path,
            capture_source, storage_relative_path, source_sha256, stored_sha256,
            request_fingerprint, mime_type, source_size_bytes, source_width,
            source_height, stored_size_bytes, width, height, captured_at,
            uploaded_by_user_id
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'image/jpeg',$11,$12,$13,$14,$15,$16,$17,$18
          )
          RETURNING id AS "serverAttachmentId", client_uuid AS "clientUuid",
            request_fingerprint AS "requestFingerprint", source_sha256 AS "sourceSha256",
            stored_sha256 AS "storedSha256", field_path AS "fieldPath",
            capture_source AS "captureSource", mime_type AS "mimeType",
            stored_size_bytes AS "sizeBytes", width, height,
            captured_at AS "capturedAt", received_at AS "receivedAt",
            storage_relative_path AS "storageRelativePath"`,
          [
            randomUUID(),
            photoUuid,
            parent.formInstanceId,
            parent.evidencePolicyId,
            fieldPath,
            captureSource,
            storage.relativePath,
            normalized.sourceSha256,
            normalized.storedSha256,
            requestFingerprint,
            normalized.sourceSizeBytes,
            normalized.sourceWidth,
            normalized.sourceHeight,
            normalized.storedSizeBytes,
            normalized.width,
            normalized.height,
            capturedAt,
            request.currentUser?.id
          ]
        );
        commitAttempted = true;
        await client.query("COMMIT");
        const attachment = inserted.rows[0];
        await auditLog({
          actorUserId: request.currentUser?.id,
          action: "inspection_attachment_upload",
          entityType: "inspectionAttachment",
          entityId: photoUuid,
          result: "success",
          reason: "accepted"
        }).catch(() => undefined);
        response.status(201).json({
          outcome: "accepted",
          attachment: safeMetadata(attachment)
        });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        if (finalFilePrepared) {
          const resolved = await resolveAttachmentCommitOutcome(
            photoUuid,
            requestFingerprint
          ).catch((resolutionError) => {
            if (resolutionError instanceof UploadError) throw resolutionError;
            return undefined;
          });
          if (resolved) {
            await auditLog({
              actorUserId: request.currentUser?.id,
              action: "inspection_attachment_upload",
              entityType: "inspectionAttachment",
              entityId: photoUuid,
              result: "success",
              reason: commitAttempted ? "ambiguous_commit_resolved" : "duplicate"
            }).catch(() => undefined);
            response.json({ outcome: "duplicate", attachment: safeMetadata(resolved) });
            return;
          }
          if (isRecord(error) && error.code === "23505") {
            throw new UploadError(
              409,
              "ATTACHMENT_FIELD_OCCUPIED",
              "This PSI field already has a different photo"
            );
          }
          throw new UploadError(
            503,
            "ATTACHMENT_STORAGE_ERROR",
            "Attachment transaction outcome is retryable; the canonical file was retained for reconciliation"
          );
        }
        if (isRecord(error) && error.code === "23505") {
          const conflict = await loadExistingByPhotoUuid(photoUuid);
          if (conflict) {
            throw new UploadError(409, "IDEMPOTENCY_CONFLICT", "Photo UUID was already accepted with different content");
          }
          throw new UploadError(
            409,
            "ATTACHMENT_FIELD_OCCUPIED",
            "This PSI field already has a different photo"
          );
        }
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      const failure = uploadFailure(error);
      if (!failure) {
        next(error);
        return;
      }
      await auditLog({
        actorUserId: request.currentUser?.id,
        action: "inspection_attachment_upload",
        entityType: "inspectionAttachment",
        entityId: photoUuid,
        result: "failure",
        reason: failure.code
      }).catch(() => undefined);
      response.status(failure.status).json({
        error: failure.code,
        message: failure.message
      });
    } finally {
      if (sourcePath) await unlink(sourcePath).catch(() => undefined);
      if (normalizedTempPath) await unlink(normalizedTempPath).catch(() => undefined);
    }
  }
);

inspectionAttachmentsRouter.get(
  "/inspection-attachments",
  requireRole("admin", "inspector"),
  async (request, response, next) => {
    try {
      const inspectionClientUuid = request.query.inspectionClientUuid;
      if (typeof inspectionClientUuid !== "string" || !uuidPattern.test(inspectionClientUuid)) {
        response.status(400).json({ error: "INVALID_INSPECTION_ID" });
        return;
      }
      const result = await pool.query<ExistingRow>(
        `SELECT attachment.id AS "serverAttachmentId",
            attachment.client_uuid AS "clientUuid",
            attachment.request_fingerprint AS "requestFingerprint",
            attachment.source_sha256 AS "sourceSha256",
            attachment.stored_sha256 AS "storedSha256",
            attachment.field_path AS "fieldPath",
            attachment.capture_source AS "captureSource",
            attachment.mime_type AS "mimeType",
            attachment.stored_size_bytes AS "sizeBytes",
            attachment.width, attachment.height,
            attachment.captured_at AS "capturedAt",
            attachment.received_at AS "receivedAt",
            attachment.storage_relative_path AS "storageRelativePath"
           FROM inspection_attachments attachment
           INNER JOIN master_system_form_instances instance
             ON instance.id = attachment.form_instance_id
           WHERE instance.client_uuid = $1
           ORDER BY attachment.field_path`,
        [inspectionClientUuid]
      );
      response.json({ attachments: result.rows.map(safeMetadata) });
    } catch (error) {
      next(error);
    }
  }
);

inspectionAttachmentsRouter.get(
  "/inspection-attachments/:photoUuid/content",
  requireRole("admin", "inspector"),
  async (request, response, next) => {
    try {
      const photoUuid = request.params.photoUuid;
      if (typeof photoUuid !== "string" || !uuidPattern.test(photoUuid)) {
        response.status(400).json({ error: "INVALID_ATTACHMENT_ID" });
        return;
      }
      const existing = await loadExistingByPhotoUuid(photoUuid);
      if (!existing) {
        response.status(404).json({ error: "ATTACHMENT_NOT_FOUND" });
        return;
      }
      const uploadsRoot = path.resolve(loadConfig().uploadsPath);
      const filePath = path.resolve(
        uploadsRoot,
        ...existing.storageRelativePath.split("/")
      );
      if (!filePath.startsWith(`${uploadsRoot}${path.sep}`)) {
        response.status(404).json({ error: "ATTACHMENT_NOT_FOUND" });
        return;
      }
      await stat(filePath);
      response.setHeader("Content-Type", "image/jpeg");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Content-Disposition", "inline");
      response.setHeader("Cache-Control", "private, no-store");
      createReadStream(filePath).on("error", next).pipe(response);
    } catch (error) {
      if (isRecord(error) && error.code === "ENOENT") {
        response.status(404).json({ error: "ATTACHMENT_FILE_MISSING" });
        return;
      }
      next(error);
    }
  }
);
