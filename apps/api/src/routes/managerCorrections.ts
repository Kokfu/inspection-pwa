import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import type { Pool, PoolClient } from "pg";
import type { UserRole } from "../auth/authTypes.js";
import {
  acceptableNewValue, acceptedRowIsValid, applyCorrections, canonicalJson, correctableSystems, correctableValue, effectivePayloadIsValid,
  listCorrectableFields, type Json, type StoredCorrection
} from "../corrections/inspectionCorrections.js";
import { pool } from "../db/pool.js";
import { requireRoleAudited } from "../middleware/requireRole.js";

/** T5a: supervisor/admin corrections to Accepted V7 inspections (docs/autopilot/designs/T5.md §3.3). */
export class CorrectionError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxChanges = 50;

type Database = Pick<Pool, "query" | "connect">;
type Queryable = Pick<Pool | PoolClient, "query">;

/** The accepted row in the shape the Accepted Detail validators read, plus correction bookkeeping. */
async function loadAcceptedRow(database: Queryable, clientUuid: string) {
  const result = await database.query(`
    SELECT instance.client_uuid AS "clientUuid", instance.id AS "serverFormInstanceId",
      job.id AS "jobId", job.job_reference AS "jobReference", job.title AS "jobTitle",
      customer.display_name AS "customerName", inspection.system_key AS "systemKey",
      instance.instance_key AS "instanceKey", instance.zone_id AS "zoneId", instance.location_id AS "locationId",
      instance.display_sequence AS "displaySequence", instance.status,
      to_char(instance.performed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "performedAt",
      to_char(instance.received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "receivedAt",
      instance.master_template_version_id AS "templateId",
      instance.customer_configuration_revision_id AS "configurationRevisionId",
      instance.inspection_snapshot AS "inspectionSnapshot", instance.response_payload AS responses,
      instance.original_creator_snapshot->>'username' AS "deviceReportedCreatorUsername",
      creator.username AS "verifiedOriginalCreatorUsername", syncer.username AS "syncedByUsername",
      template.version AS "templateVersion", job.is_sample AS "isSample"
    FROM master_system_form_instances instance
    INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id
    INNER JOIN inspection_jobs job ON job.id=inspection.job_id
    INNER JOIN customers customer ON customer.id=job.customer_id
    INNER JOIN master_service_report_templates template ON template.id=instance.master_template_version_id
    LEFT JOIN users creator ON creator.id=instance.original_created_by_user_id
    INNER JOIN users syncer ON syncer.id=instance.synced_by_user_id
    WHERE instance.client_uuid=$1 AND instance.status='submitted'`, [clientUuid]);
  const found = result.rows[0] as Record<string, unknown> | undefined;
  if (!found || found.isSample === true) throw new CorrectionError("INSPECTION_NOT_FOUND", "Accepted inspection was not found.", 404);
  // The Accepted Detail validators check the row's key set exactly, so the bookkeeping columns are kept
  // out of the row they see.
  const { templateVersion, isSample: _isSample, ...row } = found;
  return { row, templateVersion };
}

/** Corrections are for V7 records of the systems in `correctableSystems`; everything else fails closed. */
export function supportedRow(accepted: { row: Record<string, unknown>; templateVersion: unknown }) {
  return accepted.templateVersion === 7 && correctableSystems.has(String(accepted.row.systemKey));
}

type CorrectionRow = {
  id: string; fieldPath: string; sequence: number; previousValue: Json; newValue: Json; reason: string;
  correctedBy: string; correctedByRole: "admin" | "supervisor"; correctedAt: string; requestId: string; requestFingerprint: string;
};

async function loadCorrections(database: Queryable, where: "form" | "job", id: string): Promise<Array<CorrectionRow & { formInstanceId: string }>> {
  const result = await database.query(`
    SELECT correction.id, correction.form_instance_id AS "formInstanceId", correction.field_path AS "fieldPath",
      correction.sequence, correction.previous_value AS "previousValue", correction.new_value AS "newValue",
      correction.reason, actor.username AS "correctedBy", correction.corrected_by_role AS "correctedByRole",
      to_char(correction.corrected_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "correctedAt",
      correction.request_id AS "requestId", correction.request_fingerprint AS "requestFingerprint"
    FROM inspection_corrections correction
    INNER JOIN users actor ON actor.id=correction.corrected_by_user_id
    WHERE ${where === "form" ? "correction.form_instance_id" : "correction.job_id"}=$1
    ORDER BY correction.corrected_at, correction.field_path, correction.sequence`, [id]);
  return result.rows as Array<CorrectionRow & { formInstanceId: string }>;
}

const publicCorrection = ({ requestFingerprint: _fingerprint, formInstanceId: _form, ...correction }: CorrectionRow & { formInstanceId?: string }) => correction;

function parseCorrectionBody(body: unknown) {
  const invalid = (message: string) => new CorrectionError("INVALID_CORRECTION_REQUEST", message, 400);
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw invalid("Request body is invalid.");
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some((key) => !["requestId", "reason", "changes"].includes(key))) throw invalid("Request body is invalid.");
  if (typeof value.requestId !== "string" || !uuidPattern.test(value.requestId)) throw invalid("A request ID is required.");
  if (typeof value.reason !== "string" || value.reason.trim().length < 3 || value.reason.trim().length > 500) throw invalid("A reason of 3–500 characters is required.");
  if (!Array.isArray(value.changes) || value.changes.length < 1 || value.changes.length > maxChanges) throw invalid(`Between 1 and ${maxChanges} changes are required.`);
  const paths = new Set<string>();
  const changes = value.changes.map((change) => {
    if (typeof change !== "object" || change === null || Array.isArray(change)
      || Object.keys(change).length !== 3 || !["fieldPath", "expectedCurrentValue", "newValue"].every((key) => Object.hasOwn(change, key))) throw invalid("Each change needs fieldPath, expectedCurrentValue and newValue.");
    const { fieldPath, expectedCurrentValue, newValue } = change as Record<string, unknown>;
    if (typeof fieldPath !== "string" || fieldPath.length > 300 || paths.has(fieldPath)) throw invalid("Each change needs one field path of at most 300 characters.");
    paths.add(fieldPath);
    return { fieldPath, expectedCurrentValue: expectedCurrentValue as Json, newValue: newValue as Json };
  });
  return { requestId: value.requestId.toLowerCase(), reason: value.reason.trim(), changes };
}

export function createManagerCorrectionsRouter(database: Database = pool) {
  const router = Router();
  const requireRole = (...roles: UserRole[]) => requireRoleAudited(database, ...roles);

  /** The editor view: correctable fields (current effective value + accepted original) and history. */
  router.get("/manager/inspections/:clientUuid/corrections", requireRole("admin", "supervisor"), async (request, response, next) => {
    try {
      const clientUuid = request.params.clientUuid;
      if (typeof clientUuid !== "string" || !uuidPattern.test(clientUuid)) throw new CorrectionError("INVALID_INSPECTION_ID", "Inspection ID is invalid.", 400);
      const accepted = await loadAcceptedRow(database, clientUuid);
      const row = accepted.row;
      const corrections = await loadCorrections(database, "form", String(row.serverFormInstanceId));
      response.setHeader("Cache-Control", "private, no-store");
      const base = { clientUuid: row.clientUuid, jobId: row.jobId, jobReference: row.jobReference, systemKey: row.systemKey, instanceKey: row.instanceKey, corrections: corrections.map(publicCorrection) };
      if (!supportedRow(accepted)) { response.json({ ...base, supported: false, fields: [] }); return; }
      const acceptedPayload = row.responses as Json;
      const effective = applyCorrections(acceptedPayload, corrections);
      const original = new Map(listCorrectableFields(acceptedPayload, row.inspectionSnapshot).map((field) => [field.fieldPath, field.value]));
      const fields = listCorrectableFields(effective, row.inspectionSnapshot).map((field) => ({
        ...field, originalValue: original.has(field.fieldPath) ? original.get(field.fieldPath)! : null,
        corrected: corrections.some((correction) => correction.fieldPath === field.fieldPath)
      }));
      response.json({ ...base, supported: true, fields });
    } catch (error) { next(error); }
  });

  router.post("/manager/inspections/:clientUuid/corrections", requireRole("admin", "supervisor"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const clientUuid = request.params.clientUuid;
      if (typeof clientUuid !== "string" || !uuidPattern.test(clientUuid)) throw new CorrectionError("INVALID_INSPECTION_ID", "Inspection ID is invalid.", 400);
      const input = parseCorrectionBody(request.body);
      // Order-independent: a retry that sends the same changes in another order is the same request.
      const fingerprintChanges = [...input.changes].sort((left, right) => left.fieldPath.localeCompare(right.fieldPath));
      const fingerprint = createHash("sha256").update(canonicalJson({ clientUuid: clientUuid.toLowerCase(), reason: input.reason, changes: fingerprintChanges })).digest("hex");
      const actor = request.currentUser!;
      client = await database.connect();
      await client.query("BEGIN");
      const accepted = await loadAcceptedRow(client, clientUuid);
      const row = accepted.row;
      const formInstanceId = String(row.serverFormInstanceId);
      // Serialise corrections per accepted instance without writing (or row-locking) the accepted row.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('inspection_corrections:' || $1))", [formInstanceId]);
      const existing = await loadCorrections(client, "form", formInstanceId);
      const replay = existing.filter((correction) => correction.requestId === input.requestId);
      if (replay.length) {
        if (replay[0]!.requestFingerprint !== fingerprint) throw new CorrectionError("CORRECTION_REQUEST_REUSED", "This request ID was already used for a different correction.", 409);
        await client.query("COMMIT");
        response.status(200).json({ corrections: replay.map(publicCorrection) });
        return;
      }
      if (!supportedRow(accepted)) throw new CorrectionError("CORRECTION_NOT_SUPPORTED", "Corrections are available for V7 inspections of this system only.", 422);
      const acceptedPayload = row.responses as Json;
      let effective = applyCorrections(acceptedPayload, existing);
      const inserts: Array<{ fieldPath: string; sequence: number; previousValue: Json; newValue: Json }> = [];
      for (const change of input.changes) {
        const current = correctableValue(effective, change.fieldPath);
        if (!current) throw new CorrectionError("FIELD_NOT_CORRECTABLE", `Field ${change.fieldPath} cannot be corrected.`, 400);
        if (canonicalJson(current.value) !== canonicalJson(change.expectedCurrentValue)) {
          throw new CorrectionError("CORRECTION_CONFLICT", "The inspection changed since you opened it. Reload and try again.", 409);
        }
        if (!acceptableNewValue(current.kind, change.newValue)) throw new CorrectionError("INVALID_CORRECTION_VALUE", `The new value for ${change.fieldPath} is not allowed.`, 400);
        if (canonicalJson(change.newValue) === canonicalJson(current.value)) throw new CorrectionError("CORRECTION_NO_CHANGE", `The new value for ${change.fieldPath} is the same as the current value.`, 400);
        const sequence = existing.filter((correction) => correction.fieldPath === change.fieldPath).reduce((max, correction) => Math.max(max, correction.sequence), 0) + 1;
        inserts.push({ fieldPath: change.fieldPath, sequence, previousValue: current.value, newValue: change.newValue });
        effective = applyCorrections(effective, [{ fieldPath: change.fieldPath, sequence, newValue: change.newValue } satisfies StoredCorrection]);
      }
      if (!acceptedRowIsValid(String(row.systemKey), row)) {
        throw new CorrectionError("ACCEPTED_RECORD_UNREADABLE", "This accepted record cannot be read against its frozen form definition, so it cannot be corrected.", 422);
      }
      if (!effectivePayloadIsValid(String(row.systemKey), row, effective)) {
        throw new CorrectionError("CORRECTION_CONTRACT_VIOLATION", "The corrected inspection would not match its frozen form definition.", 422);
      }
      for (const insert of inserts) {
        await client.query(`INSERT INTO inspection_corrections
          (id, form_instance_id, job_id, system_key, field_path, sequence, previous_value, new_value, reason, corrected_by_user_id, corrected_by_role, request_id, request_fingerprint)
          VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13)`,
        [randomUUID(), formInstanceId, row.jobId, row.systemKey, insert.fieldPath, insert.sequence, JSON.stringify(insert.previousValue), JSON.stringify(insert.newValue), input.reason, actor.id, actor.role, input.requestId, fingerprint]);
        await client.query(`INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, result, reason) VALUES ($1,'inspection.correct','form_instance',$2,'success',$3)`,
          [actor.id, formInstanceId, insert.fieldPath]);
      }
      await client.query("COMMIT");
      // Re-read on the connection we already hold; acquiring a second one here would deadlock a saturated pool.
      const stored = (await loadCorrections(client, "form", formInstanceId)).filter((correction) => correction.requestId === input.requestId);
      response.status(201).json({ corrections: stored.map(publicCorrection) });
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => undefined);
      if (typeof error === "object" && error !== null && (error as { code?: string }).code === "23505") {
        next(new CorrectionError("CORRECTION_CONFLICT", "The inspection changed since you opened it. Reload and try again.", 409)); return;
      }
      next(error);
    } finally { client?.release(); }
  });

  /** Every correction on a visit (review screen, Final Report notice). */
  router.get("/manager/service-visits/:jobId/corrections", requireRole("admin", "supervisor"), async (request, response, next) => {
    try {
      const jobId = request.params.jobId;
      if (typeof jobId !== "string" || !uuidPattern.test(jobId)) throw new CorrectionError("INVALID_JOB_ID", "Job ID is invalid.", 400);
      const job = await database.query(`SELECT id FROM inspection_jobs WHERE id=$1 AND is_sample=false`, [jobId]);
      if (!job.rows[0]) throw new CorrectionError("JOB_NOT_FOUND", "Service visit was not found.", 404);
      const rows = await database.query(`
        SELECT correction.form_instance_id AS "formInstanceId", instance.client_uuid AS "clientUuid", correction.system_key AS "systemKey",
          instance.instance_key AS "instanceKey", instance.inspection_snapshot AS "inspectionSnapshot", instance.response_payload AS responses
        FROM inspection_corrections correction
        INNER JOIN master_system_form_instances instance ON instance.id=correction.form_instance_id
        WHERE correction.job_id=$1 GROUP BY correction.form_instance_id, instance.client_uuid, correction.system_key, instance.instance_key, instance.inspection_snapshot, instance.response_payload`, [jobId]);
      const corrections = await loadCorrections(database, "job", jobId);
      const byInstance = new Map((rows.rows as Array<Record<string, unknown>>).map((row) => [String(row.formInstanceId), row]));
      response.setHeader("Cache-Control", "private, no-store");
      response.json({
        corrections: corrections.map((correction) => {
          const instance = byInstance.get(correction.formInstanceId)!;
          const label = listCorrectableFields(instance.responses as Json, instance.inspectionSnapshot).find((field) => field.fieldPath === correction.fieldPath)?.label ?? correction.fieldPath;
          return { ...publicCorrection(correction), clientUuid: instance.clientUuid, systemKey: instance.systemKey, instanceKey: instance.instanceKey, label };
        })
      });
    } catch (error) { next(error); }
  });

  router.use((error: unknown, _request: import("express").Request, response: import("express").Response, next: import("express").NextFunction) => {
    if (error instanceof CorrectionError) { response.status(error.status).json({ error: error.code, message: error.message }); return; }
    next(error);
  });
  return router;
}

export const managerCorrectionsRouter = createManagerCorrectionsRouter();

/** True when any correction exists for the visit (the PDF stays unavailable until the PDF work shows them). */
export async function visitHasCorrections(database: Pick<Pool, "query">, jobId: string) {
  const result = await database.query(`SELECT EXISTS (SELECT 1 FROM inspection_corrections WHERE job_id=$1) AS "hasCorrections"`, [jobId]);
  return result.rows[0]?.hasCorrections === true;
}
