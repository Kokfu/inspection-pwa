import { Router } from "express";
import { pool } from "../db/pool.js";
import { parseDryWetRiserSystemConfiguration } from "../inspections/dryWetRiserConfiguration.js";
import { validStoredDryWetRiser } from "../inspections/dryWetRiserAccepted.js";
import { requireRole } from "../middleware/requireRole.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const supportedSystemKeys = new Set([
  "hose_reel",
  "co2_fire_extinguisher",
  "automatic_sprinkler", "dry_wet_riser"
]);
const pageSize = 100;
const cursorTimestamp = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/;

function isCanonicalCursorTimestamp(value: string) {
  if (!cursorTimestamp.test(value)) return false;
  const [year, month, day, hour, minute, second] = value.slice(0, 19).split(/[-T:]/).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute && date.getUTCSeconds() === second;
}

function decodeCursor(value: unknown): { performedAt: string; clientUuid: string } | undefined {
  if (typeof value !== "string" || value.length > 256) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
    const decoded = Buffer.from(value, "base64url");
    if (decoded.length > 192) return undefined;
    const parsed: unknown = JSON.parse(decoded.toString("utf8"));
    if (!parsed || typeof parsed !== "object") return undefined;
    const cursor = parsed as { performedAt?: unknown; clientUuid?: unknown };
    if (Object.keys(cursor).length !== 2 || !("performedAt" in cursor) || !("clientUuid" in cursor)) return undefined;
    return typeof cursor.performedAt === "string" && isCanonicalCursorTimestamp(cursor.performedAt)
      && typeof cursor.clientUuid === "string" && uuidPattern.test(cursor.clientUuid)
      ? { performedAt: cursor.performedAt, clientUuid: cursor.clientUuid }
      : undefined;
  } catch { return undefined; }
}

function encodeCursor(row: { performedAt: string; clientUuid: string }) {
  return Buffer.from(JSON.stringify({ performedAt: row.performedAt, clientUuid: row.clientUuid })).toString("base64url");
}
export const masterSystemInspectionsRouter = Router();

masterSystemInspectionsRouter.get(
  "/dry-wet-riser-inspections/:clientUuid",
  requireRole("admin", "inspector"),
  async (request, response, next) => {
    try {
      const clientUuid = request.params.clientUuid;
      if (typeof clientUuid !== "string" || !uuidPattern.test(clientUuid)) {
        response.status(400).json({ error: "INVALID_INSPECTION_ID" });
        return;
      }
      const result = await pool.query(`
        SELECT instance.client_uuid AS "clientUuid", instance.id AS "serverFormInstanceId",
          job.id AS "jobId", job.job_reference AS "jobReference", job.title AS "jobTitle",
          customer.id AS "customerId", customer.customer_code AS "customerCode",
          customer.display_name AS "customerName", inspection.system_key AS "systemKey",
          instance.status, instance.performed_at AS "performedAt", instance.received_at AS "receivedAt",
          instance.response_payload AS responses,
          instance.inspection_snapshot->'template' AS template,
          instance.inspection_snapshot->'configuration' AS configuration,
          instance.inspection_snapshot->'system' AS "systemSnapshot",
          instance.inspection_snapshot #> '{system,systemConfiguration}' AS "systemConfiguration",
          instance.original_creator_snapshot->>'username' AS "deviceReportedCreatorUsername",
          creator.username AS "verifiedOriginalCreatorUsername", syncer.username AS "syncedByUsername"
        FROM master_system_form_instances instance
        INNER JOIN master_system_inspections inspection ON inspection.id = instance.inspection_group_id
        INNER JOIN inspection_jobs job ON job.id = inspection.job_id
        INNER JOIN customers customer ON customer.id = job.customer_id
        LEFT JOIN users creator ON creator.id = instance.original_created_by_user_id
        INNER JOIN users syncer ON syncer.id = instance.synced_by_user_id
        WHERE instance.client_uuid = $1 AND instance.status = 'submitted'
          AND inspection.system_key = 'dry_wet_riser'`,
        [clientUuid]
      );
      const inspection = result.rows[0];
      if (!inspection || !parseDryWetRiserSystemConfiguration(inspection.systemConfiguration) || !validStoredDryWetRiser(inspection.responses, inspection.systemSnapshot, inspection.systemConfiguration)) {
        response.status(404).json({ error: "INSPECTION_NOT_FOUND" });
        return;
      }
      response.json({ inspection: { ...inspection, systemLabel: "Dry / Wet Riser System" } });
    } catch (error) {
      next(error);
    }
  }
);

masterSystemInspectionsRouter.get(
  "/master-system-inspections",
  requireRole("admin", "inspector"),
  async (request, response, next) => {
    try {
      const jobId = typeof request.query.jobId === "string"
        ? request.query.jobId
        : undefined;
      const systemKey = typeof request.query.systemKey === "string"
        ? request.query.systemKey
        : undefined;
      const jobIds = typeof request.query.jobIds === "string"
        ? request.query.jobIds.split(",").filter(Boolean)
        : [];
      const cursor = request.query.cursor === undefined ? undefined : decodeCursor(request.query.cursor);
      if (
        (jobId !== undefined && !uuidPattern.test(jobId))
        || (systemKey !== undefined && !supportedSystemKeys.has(systemKey))
        || jobIds.length > 100
        || jobIds.some((value) => !uuidPattern.test(value))
        || (request.query.cursor !== undefined && !cursor)
      ) {
        response.status(400).json({ error: "INVALID_INSPECTION_FILTER" });
        return;
      }

      const values: unknown[] = [];
      // Progress summaries intentionally include only accepted records.
      const filters: string[] = ["instance.status = 'submitted'"];
      if (jobId) {
        values.push(jobId);
        filters.push(`job.id = $${values.length}`);
      }
      if (systemKey) {
        values.push(systemKey);
        filters.push(`inspection.system_key = $${values.length}`);
      }
      if (jobIds.length > 0) {
        values.push(jobIds);
        filters.push(`job.id = ANY($${values.length}::uuid[])`);
      }
      if (cursor) {
        values.push(cursor.performedAt, cursor.clientUuid);
        filters.push(`(
          instance.performed_at < $${values.length - 1}::timestamptz
          OR (
            instance.performed_at = $${values.length - 1}::timestamptz
            AND instance.client_uuid > $${values.length}::uuid
          )
        )`);
      }
      const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const result = await pool.query(`
        SELECT instance.client_uuid AS "clientUuid", job.id AS "jobId",
          inspection.system_key AS "systemKey", instance.instance_key AS "instanceKey", instance.status,
          instance.zone_id AS "zoneId", instance.location_id AS "locationId",
          instance.display_sequence AS "displaySequence",
          to_char(
            instance.performed_at AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
          ) AS "performedAt",
          instance.original_creator_snapshot->>'username' AS "deviceReportedCreatorUsername",
          creator.username AS "verifiedOriginalCreatorUsername",
          syncer.username AS "syncedByUsername"
        FROM master_system_form_instances instance
        INNER JOIN master_system_inspections inspection ON inspection.id = instance.inspection_group_id
        INNER JOIN inspection_jobs job ON job.id = inspection.job_id
        LEFT JOIN users creator ON creator.id = instance.original_created_by_user_id
        INNER JOIN users syncer ON syncer.id = instance.synced_by_user_id
        ${where}
        ORDER BY instance.performed_at DESC, instance.client_uuid ASC
        LIMIT ${pageSize + 1}
      `, values);
      const hasMore = result.rows.length > pageSize;
      const inspections = result.rows.slice(0, pageSize);
      response.json({
        inspections,
        hasMore,
        nextCursor: hasMore ? encodeCursor(inspections[inspections.length - 1]) : null
      });
    } catch (error) {
      next(error);
    }
  }
);

masterSystemInspectionsRouter.get(
  "/master-system-inspections/:clientUuid",
  requireRole("admin", "inspector"),
  async (request, response, next) => {
    try {
      const clientUuid = request.params.clientUuid;
      if (typeof clientUuid !== "string" || !uuidPattern.test(clientUuid)) {
        response.status(400).json({ error: "INVALID_INSPECTION_ID" });
        return;
      }
      const result = await pool.query(
        `SELECT instance.client_uuid AS "clientUuid",
            instance.id AS "serverFormInstanceId",
            job.id AS "jobId", job.job_reference AS "jobReference",
            job.title AS "jobTitle", customer.display_name AS "customerName",
            inspection.system_key AS "systemKey",
            COALESCE((
              SELECT configured.system->>'displayName'
              FROM jsonb_array_elements(job.configuration_snapshot->'enabledSystems')
                AS configured(system)
              WHERE configured.system->>'systemKey' = inspection.system_key
              LIMIT 1
            ), inspection.system_key) AS "systemLabel",
            instance.instance_key AS "instanceKey", instance.status,
            instance.performed_at AS "performedAt",
            instance.received_at AS "receivedAt",
            instance.response_payload AS responses,
            instance.inspection_snapshot #> '{system,resolvedControls}' AS "displayControls",
            instance.original_creator_snapshot->>'username'
              AS "deviceReportedCreatorUsername",
            creator.username AS "verifiedOriginalCreatorUsername",
            syncer.username AS "syncedByUsername",
            instance.evidence_policy_id AS "evidencePolicyId",
            instance.evidence_policy_version AS "evidencePolicyVersion",
            instance.evidence_policy_sha256 AS "evidencePolicySha256"
          FROM master_system_form_instances instance
          INNER JOIN master_system_inspections inspection
            ON inspection.id = instance.inspection_group_id
          INNER JOIN inspection_jobs job ON job.id = inspection.job_id
          INNER JOIN customers customer ON customer.id = job.customer_id
          LEFT JOIN users creator ON creator.id = instance.original_created_by_user_id
          INNER JOIN users syncer ON syncer.id = instance.synced_by_user_id
          WHERE instance.client_uuid = $1
            AND instance.status = 'submitted'`,
        [clientUuid]
      );
      const inspection = result.rows[0];
      if (!inspection) {
        response.status(404).json({ error: "INSPECTION_NOT_FOUND" });
        return;
      }
      response.json({ inspection });
    } catch (error) {
      next(error);
    }
  }
);
