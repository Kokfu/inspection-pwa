import Busboy from "busboy";
import { Readable } from "node:stream";
import type { Request } from "express";
import { attachmentMaxBytes } from "../attachments/attachmentStorage.js";
import { pool } from "../db/pool.js";
import { technicianOwns } from "./technicianOwnership.js";

export class OwnershipUploadError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

/** Bounded preflight preserves the historical multipart validators unchanged. */
export async function ownedMultipart(request: Request, kind: "job" | "form"): Promise<Request> {
  if (request.currentUser?.role === "admin") return request;
  const bodyLimit = attachmentMaxBytes + (kind === "form" ? 32 : 64) * 1024;
  const oversized = () => new OwnershipUploadError(kind === "form" ? 413 : 400, "VALIDATION_ERROR");
  const contentLength = Number(request.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > bodyLimit) throw oversized();
  const chunks: Buffer[] = [];
  let size = 0;
  // Drain oversized bodies without retaining them. Breaking an async iterator
  // destroys IncomingMessage and turns a deterministic response into ECONNRESET.
  await new Promise<void>((resolve, reject) => {
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= bodyLimit) chunks.push(Buffer.from(chunk));
    });
    request.on("end", resolve); request.on("error", reject);
    request.on("aborted", () => reject(new OwnershipUploadError(400, "VALIDATION_ERROR")));
  });
  if (size > bodyLimit) throw oversized();
  const body = Buffer.concat(chunks);
  let identity: string | undefined;
  let photoUuid: string | undefined;
  let invalid = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const parser = Busboy({ headers: request.headers,
        limits: { fields: 30, files: 1, parts: 32, fieldSize: 500, fileSize: attachmentMaxBytes } });
      parser.on("field", (name, value, info) => {
        if (name === "photoUuid") {
          if (photoUuid !== undefined || info.valueTruncated) invalid = true;
          photoUuid = value;
        }
        if (name === (kind === "job" ? "jobId" : "inspectionClientUuid")) {
          if (identity !== undefined || info.valueTruncated) invalid = true;
          identity = value;
        }
      });
      parser.on("file", (_name, stream) => stream.resume());
      for (const event of ["fieldsLimit", "filesLimit", "partsLimit"]) parser.on(event, () => { invalid = true; });
      parser.on("error", reject);
      parser.on("close", resolve);
      parser.end(body);
    });
  } catch { throw new OwnershipUploadError(400, "VALIDATION_ERROR"); }
  if (invalid) throw new OwnershipUploadError(400, "VALIDATION_ERROR");
  if (!await technicianOwns(request, kind, identity)) throw new OwnershipUploadError(404, "JOB_NOT_FOUND");
  if (photoUuid && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(photoUuid)) {
    const existing = await pool.query(`SELECT job.id FROM inspection_jobs job JOIN (
      SELECT job_id FROM staged_inspection_evidence WHERE photo_uuid=$1
      UNION SELECT parent.job_id FROM inspection_attachments photo
        JOIN master_system_form_instances form ON form.id=photo.form_instance_id
        JOIN master_system_inspections parent ON parent.id=form.inspection_group_id WHERE photo.client_uuid=$1
    ) evidence ON evidence.job_id=job.id WHERE job.created_by_user_id IS DISTINCT FROM $2`,[photoUuid,request.currentUser!.id]);
    if (existing.rows.length) throw new OwnershipUploadError(404, "JOB_NOT_FOUND");
  }
  return Object.assign(Readable.from([body]), { headers: request.headers, currentUser: request.currentUser }) as Request;
}
