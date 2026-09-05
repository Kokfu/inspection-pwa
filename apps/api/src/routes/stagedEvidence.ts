import { Router } from "express";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { auditLog } from "../audit/auditLog.js";
import { loadConfig } from "../config/env.js";
import { pool } from "../db/pool.js";
import { stageFireAlarmV6Evidence, V6EvidenceError } from "../inspections/evidence/fireAlarmV6Evidence.js";
import { stageV7Evidence, V7EvidenceError } from "../inspections/evidence/v7StagedEvidence.js";
import { requireRole } from "../middleware/requireRole.js";

export const stagedEvidenceRouter = Router();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
stagedEvidenceRouter.post("/v6-evidence/stage", requireRole("admin", "inspector"), async (request, response, next) => {
  try {
    const result = await stageFireAlarmV6Evidence(request, request.currentUser!.id);
    await auditLog({ actorUserId: request.currentUser!.id, action: "v6_evidence_stage", entityType: "stagedEvidence", entityId: result.photoUuid, result: "success", reason: result.outcome });
    response.status(result.outcome === "staged" ? 201 : 200).json(result);
  } catch (error) {
    if (error instanceof V6EvidenceError) {
      await auditLog({ actorUserId: request.currentUser?.id, action: "v6_evidence_stage", entityType: "stagedEvidence", result: "failure", reason: error.code }).catch(() => undefined);
      response.status(error.status).json({ error: error.code, message: error.message }); return;
    }
    next(error);
  }
});
stagedEvidenceRouter.post("/v7-evidence/stage", requireRole("admin", "inspector"), async (request, response, next) => {
  try {
    const result = await stageV7Evidence(request, request.currentUser!.id);
    await auditLog({ actorUserId: request.currentUser!.id, action: "v7_evidence_stage", entityType: "stagedEvidence", entityId: result.photoUuid, result: "success", reason: result.outcome });
    response.status(result.outcome === "staged" ? 201 : 200).json(result);
  } catch (error) {
    if (error instanceof V7EvidenceError) {
      await auditLog({ actorUserId: request.currentUser?.id, action: "v7_evidence_stage", entityType: "stagedEvidence", result: "failure", reason: error.code }).catch(() => undefined);
      response.status(error.status).json({ error: error.code, message: error.message }); return;
    }
    next(error);
  }
});

/** Accepted-history read path. It intentionally excludes staged/unbound files. */
stagedEvidenceRouter.get("/v6-evidence/accepted", requireRole("admin", "inspector"), async (request, response, next) => {
  try {
    const inspectionClientUuid = request.query.inspectionClientUuid;
    if (typeof inspectionClientUuid !== "string" || !uuid.test(inspectionClientUuid)) { response.status(400).json({ error: "INVALID_INSPECTION_ID" }); return; }
    const result = await pool.query(`SELECT evidence.photo_uuid AS "photoUuid", evidence.system_key AS "systemKey", evidence.field_path AS "fieldPath", evidence.source_sha256 AS "sourceSha256", evidence.stored_sha256 AS "storedSha256", evidence.mime_type AS "mimeType", evidence.stored_size_bytes AS "sizeBytes", evidence.width, evidence.height, evidence.form_instance_id AS "formInstanceId"
      FROM staged_inspection_evidence evidence
      INNER JOIN master_system_form_instances form ON form.id=evidence.form_instance_id AND form.client_uuid=$1 AND form.status='submitted'
      INNER JOIN master_system_inspections inspection ON inspection.id=form.inspection_group_id AND inspection.system_key='fire_alarm_detector'
      INNER JOIN inspection_jobs job ON job.id=inspection.job_id
      WHERE evidence.inspection_client_uuid=$1 AND evidence.status='accepted'
        AND ($2::text='admin' OR job.technician_visible=true)
      ORDER BY evidence.field_path, evidence.photo_uuid`, [inspectionClientUuid, request.currentUser!.role]);
    response.json({ evidence: result.rows });
  } catch (error) { next(error); }
});

stagedEvidenceRouter.get("/v6-evidence/accepted/:photoUuid/content", requireRole("admin", "inspector"), async (request, response, next) => {
  try {
    const photoUuid = request.params.photoUuid;
    if (typeof photoUuid !== "string" || !uuid.test(photoUuid)) { response.status(400).json({ error: "INVALID_ATTACHMENT_ID" }); return; }
    const result = await pool.query<{ storage_relative_path: string }>(`SELECT evidence.storage_relative_path
      FROM staged_inspection_evidence evidence
      INNER JOIN master_system_form_instances form ON form.id=evidence.form_instance_id AND form.status='submitted'
      INNER JOIN master_system_inspections inspection ON inspection.id=form.inspection_group_id AND inspection.system_key='fire_alarm_detector'
      INNER JOIN inspection_jobs job ON job.id=inspection.job_id
      WHERE evidence.photo_uuid=$1 AND evidence.status='accepted'
        AND ($2::text='admin' OR job.technician_visible=true)`, [photoUuid, request.currentUser!.role]);
    const existing = result.rows[0];
    if (!existing) { response.status(404).json({ error: "ACCEPTED_EVIDENCE_NOT_FOUND" }); return; }
    const uploadsRoot = path.resolve(loadConfig().uploadsPath);
    const filePath = path.resolve(uploadsRoot, ...existing.storage_relative_path.split("/"));
    if (!filePath.startsWith(`${uploadsRoot}${path.sep}`)) { response.status(404).json({ error: "ACCEPTED_EVIDENCE_NOT_FOUND" }); return; }
    await stat(filePath);
    response.setHeader("Content-Type", "image/jpeg"); response.setHeader("X-Content-Type-Options", "nosniff"); response.setHeader("Content-Disposition", "inline"); response.setHeader("Cache-Control", "private, no-store");
    createReadStream(filePath).on("error", next).pipe(response);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") { response.status(404).json({ error: "ACCEPTED_EVIDENCE_FILE_MISSING" }); return; }
    next(error);
  }
});

/** V7 accepted evidence is readable only through a submitted per-location form. */
stagedEvidenceRouter.get("/v7-evidence/accepted", requireRole("admin", "inspector"), async (request, response, next) => {
  try {
    const inspectionClientUuid = request.query.inspectionClientUuid;
    if (typeof inspectionClientUuid !== "string" || !uuid.test(inspectionClientUuid)) { response.status(400).json({ error: "INVALID_INSPECTION_ID" }); return; }
    const result = await pool.query(`SELECT evidence.photo_uuid AS "photoUuid",evidence.system_key AS "systemKey",evidence.field_path AS "fieldPath",evidence.source_sha256 AS "sourceSha256",evidence.stored_sha256 AS "storedSha256",evidence.mime_type AS "mimeType",evidence.stored_size_bytes AS "sizeBytes",evidence.width,evidence.height,evidence.form_instance_id AS "formInstanceId"
      FROM staged_inspection_evidence evidence
      INNER JOIN master_system_form_instances form ON form.id=evidence.form_instance_id AND form.client_uuid=$1 AND form.status='submitted'
      INNER JOIN master_system_inspections inspection ON inspection.id=form.inspection_group_id AND inspection.system_key IN ('co2_fire_extinguisher','wet_chemical','fire_alarm_detector','hydrant','hose_reel','automatic_sprinkler','dry_wet_riser')
      INNER JOIN inspection_jobs job ON job.id=inspection.job_id
      WHERE evidence.inspection_client_uuid=$1 AND evidence.master_template_version=7 AND evidence.status='accepted'
        AND ($2::text='admin' OR (job.technician_visible=true AND form.synced_by_user_id=$3))
      ORDER BY evidence.field_path,evidence.photo_uuid`, [inspectionClientUuid, request.currentUser!.role, request.currentUser!.id]);
    response.json({ evidence: result.rows });
  } catch (error) { next(error); }
});

stagedEvidenceRouter.get("/v7-evidence/accepted/:photoUuid/content", requireRole("admin", "inspector"), async (request, response, next) => {
  try {
    const photoUuid = request.params.photoUuid;
    if (typeof photoUuid !== "string" || !uuid.test(photoUuid)) { response.status(400).json({ error: "INVALID_ATTACHMENT_ID" }); return; }
    const result = await pool.query<{ storage_relative_path: string }>(`SELECT evidence.storage_relative_path FROM staged_inspection_evidence evidence
      INNER JOIN master_system_form_instances form ON form.id=evidence.form_instance_id AND form.status='submitted'
      INNER JOIN master_system_inspections inspection ON inspection.id=form.inspection_group_id AND inspection.system_key IN ('co2_fire_extinguisher','wet_chemical','fire_alarm_detector','hydrant','hose_reel','automatic_sprinkler','dry_wet_riser')
      INNER JOIN inspection_jobs job ON job.id=inspection.job_id
      WHERE evidence.photo_uuid=$1 AND evidence.master_template_version=7 AND evidence.status='accepted'
        AND ($2::text='admin' OR (job.technician_visible=true AND form.synced_by_user_id=$3))`, [photoUuid, request.currentUser!.role, request.currentUser!.id]);
    const existing = result.rows[0];
    if (!existing) { response.status(404).json({ error: "ACCEPTED_EVIDENCE_NOT_FOUND" }); return; }
    const uploadsRoot = path.resolve(loadConfig().uploadsPath); const filePath = path.resolve(uploadsRoot, ...existing.storage_relative_path.split("/"));
    if (!filePath.startsWith(`${uploadsRoot}${path.sep}`)) { response.status(404).json({ error: "ACCEPTED_EVIDENCE_NOT_FOUND" }); return; }
    await stat(filePath); response.setHeader("Content-Type", "image/jpeg"); response.setHeader("X-Content-Type-Options", "nosniff"); response.setHeader("Content-Disposition", "inline"); response.setHeader("Cache-Control", "private, no-store");
    createReadStream(filePath).on("error", next).pipe(response);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") { response.status(404).json({ error: "ACCEPTED_EVIDENCE_FILE_MISSING" }); return; }
    next(error);
  }
});
