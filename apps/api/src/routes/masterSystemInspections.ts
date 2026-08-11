import { Router } from "express";
import { pool } from "../db/pool.js";
import { parseDryWetRiserSystemConfiguration } from "../inspections/dryWetRiserConfiguration.js";
import { validStoredDryWetRiser } from "../inspections/dryWetRiserAccepted.js";
import { validateStoredFireAlarmDetail } from "../inspections/fireAlarmAccepted.js";
import { requireRole } from "../middleware/requireRole.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const supportedSystemKeys = new Set([
  "hose_reel",
  "co2_fire_extinguisher",
  "wet_chemical",
  "automatic_sprinkler", "dry_wet_riser", "fire_alarm_detector", "hydrant"
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
  "/fire-alarm-inspections/:clientUuid",
  requireRole("admin", "inspector"),
  async (request, response, next) => {
    try {
      const clientUuid=request.params.clientUuid;
      if(typeof clientUuid!=="string"||!uuidPattern.test(clientUuid)){response.status(400).json({error:"INVALID_INSPECTION_ID"});return;}
      const result=await pool.query(`SELECT instance.client_uuid AS "clientUuid",instance.id AS "serverFormInstanceId",instance.inspection_group_id AS "inspectionGroupId",inspection.id AS "parentId",job.id AS "jobId",job.job_reference AS "jobReference",job.title AS "jobTitle",customer.id AS "customerId",customer.customer_code AS "customerCode",customer.display_name AS "customerName",inspection.system_key AS "systemKey",instance.instance_key AS "instanceKey",instance.zone_id AS "zoneId",instance.location_id AS "locationId",instance.display_sequence AS "displaySequence",instance.status,to_char(instance.performed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "performedAt",to_char(instance.received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "receivedAt",instance.master_template_version_id AS "templateId",instance.customer_configuration_revision_id AS "configurationRevisionId",instance.inspection_snapshot AS "inspectionSnapshot",instance.response_payload AS responses,instance.original_creator_snapshot AS "originalCreatorSnapshot",instance.original_creator_snapshot->>'username' AS "deviceReportedCreatorUsername",creator.username AS "verifiedOriginalCreatorUsername",syncer.username AS "syncedByUsername" FROM master_system_form_instances instance INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id INNER JOIN inspection_jobs job ON job.id=inspection.job_id INNER JOIN customers customer ON customer.id=job.customer_id LEFT JOIN users creator ON creator.id=instance.original_created_by_user_id INNER JOIN users syncer ON syncer.id=instance.synced_by_user_id WHERE instance.client_uuid=$1 AND instance.status='submitted' AND inspection.system_key='fire_alarm_detector'`,[clientUuid]);
      const row=result.rows[0] as Record<string,unknown>|undefined;
      if(!row){response.status(404).json({error:"INSPECTION_NOT_FOUND"});return;}
      const stored=validateStoredFireAlarmDetail(row);
      if(!stored||row.inspectionGroupId!==row.parentId||row.systemKey!=="fire_alarm_detector"||row.instanceKey!=="primary"||row.zoneId!==null||row.locationId!==null||row.displaySequence!==1||row.status!=="submitted"||typeof row.syncedByUsername!=="string"||!row.syncedByUsername){response.status(500).json({error:"INVALID_STORED_INSPECTION"});return;}
      response.json({inspection:{clientUuid:row.clientUuid,serverFormInstanceId:row.serverFormInstanceId,jobId:row.jobId,jobReference:row.jobReference,jobTitle:row.jobTitle,customerId:row.customerId,customerCode:row.customerCode,customerName:row.customerName,systemKey:"fire_alarm_detector",systemLabel:"Fire Alarm / Detector System",instanceKey:"primary",zoneId:null,locationId:null,displaySequence:1,status:"submitted",performedAt:row.performedAt,receivedAt:row.receivedAt,template:stored.template,configuration:stored.configuration,responses:stored.responses,deviceReportedCreatorUsername:row.deviceReportedCreatorUsername,verifiedOriginalCreatorUsername:row.verifiedOriginalCreatorUsername,syncedByUsername:row.syncedByUsername}});
    } catch(error){next(error);}
  }
);

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
      const locationId = typeof request.query.locationId === "string"
        ? request.query.locationId
        : undefined;
      const jobIds = typeof request.query.jobIds === "string"
        ? request.query.jobIds.split(",").filter(Boolean)
        : [];
      const cursor = request.query.cursor === undefined ? undefined : decodeCursor(request.query.cursor);
      if (
        (jobId !== undefined && !uuidPattern.test(jobId))
        || (systemKey !== undefined && !supportedSystemKeys.has(systemKey))
        || (locationId !== undefined && !uuidPattern.test(locationId))
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
      if (locationId) {
        values.push(locationId);
        filters.push(`instance.location_id = $${values.length}`);
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
          syncer.username AS "syncedByUsername",
          evidence."evidenceState", evidence."requiredEvidenceCount",
          evidence."confirmedEvidenceCount"
        FROM master_system_form_instances instance
        INNER JOIN master_system_inspections inspection ON inspection.id = instance.inspection_group_id
        INNER JOIN inspection_jobs job ON job.id = inspection.job_id
        LEFT JOIN users creator ON creator.id = instance.original_created_by_user_id
        INNER JOIN users syncer ON syncer.id = instance.synced_by_user_id
        LEFT JOIN LATERAL (
          SELECT
            CASE
              WHEN inspection.system_key <> 'automatic_sprinkler' THEN NULL
              WHEN instance.evidence_policy_id IS NULL
                AND instance.evidence_policy_version IS NULL
                AND instance.evidence_policy_snapshot IS NULL
                AND instance.evidence_policy_sha256 IS NULL
                AND attachment_counts.total_attachments = 0
                THEN 'not-required'
              WHEN policy.valid_policy IS NOT TRUE THEN 'invalid'
              WHEN policy.required_count = 0 AND attachment_counts.total_attachments = 0
                THEN 'not-required'
              WHEN attachment_counts.invalid_required_count > 0
                OR attachment_counts.required_attachment_count <> attachment_counts.distinct_required_field_count
                THEN 'invalid'
              WHEN attachment_counts.confirmed_required_count = policy.required_count
                THEN 'complete'
              ELSE 'pending'
            END AS "evidenceState",
            CASE WHEN inspection.system_key = 'automatic_sprinkler'
              AND instance.evidence_policy_id IS NULL
              AND instance.evidence_policy_version IS NULL
              AND instance.evidence_policy_snapshot IS NULL
              AND instance.evidence_policy_sha256 IS NULL
              THEN 0
              WHEN policy.valid_policy IS TRUE THEN policy.required_count ELSE 0 END AS "requiredEvidenceCount",
            CASE WHEN inspection.system_key = 'automatic_sprinkler'
              AND instance.evidence_policy_id IS NULL
              AND instance.evidence_policy_version IS NULL
              AND instance.evidence_policy_snapshot IS NULL
              AND instance.evidence_policy_sha256 IS NULL
              THEN 0
              WHEN policy.valid_policy IS TRUE THEN attachment_counts.confirmed_required_count ELSE 0 END AS "confirmedEvidenceCount"
          FROM LATERAL (
            SELECT
              instance.evidence_policy_id IS NOT NULL
                AND instance.evidence_policy_version IS NOT NULL
                AND instance.evidence_policy_snapshot IS NOT NULL
                AND instance.evidence_policy_sha256 IS NOT NULL
                AND frozen.id IS NOT NULL
                AND jsonb_typeof(instance.evidence_policy_snapshot) = 'object'
                AND instance.evidence_policy_snapshot->>'systemKey' = 'automatic_sprinkler'
                AND jsonb_typeof(instance.evidence_policy_snapshot->'points') = 'object'
                AND NOT EXISTS (
                  SELECT 1 FROM jsonb_each(instance.evidence_policy_snapshot->'points') point(field_path, definition)
                  WHERE jsonb_typeof(definition) <> 'object'
                    OR definition->'allowed' <> 'true'::jsonb
                    OR jsonb_typeof(definition->'required') <> 'boolean'
                    OR definition->'maxCount' <> '1'::jsonb
                ) AS valid_policy,
              COALESCE((SELECT count(*)::int
                FROM jsonb_each(instance.evidence_policy_snapshot->'points') point(field_path, definition)
                WHERE definition->'required' = 'true'::jsonb), 0) AS required_count
            FROM inspection_evidence_policies frozen
            WHERE frozen.id = instance.evidence_policy_id
              AND frozen.version = instance.evidence_policy_version
              AND frozen.definition = instance.evidence_policy_snapshot
              AND frozen.definition_sha256 = instance.evidence_policy_sha256
              AND frozen.system_key = 'automatic_sprinkler'
          ) policy
          RIGHT JOIN LATERAL (
            SELECT count(*)::int AS total_attachments
            FROM inspection_attachments attachment
            WHERE attachment.form_instance_id = instance.id
          ) attachment_counts_base ON TRUE
          LEFT JOIN LATERAL (
            SELECT
              attachment_counts_base.total_attachments,
              COALESCE(count(attachment.client_uuid), 0)::int AS required_attachment_count,
              COALESCE(count(DISTINCT attachment.field_path), 0)::int AS distinct_required_field_count,
              COALESCE(count(*) FILTER (WHERE
                attachment.evidence_policy_id = instance.evidence_policy_id
                AND attachment.mime_type = 'image/jpeg'
                AND attachment.source_sha256 ~ '^[0-9a-f]{64}$'
                AND attachment.stored_sha256 ~ '^[0-9a-f]{64}$'
                AND attachment.source_size_bytes BETWEEN 1 AND 2097152
                AND attachment.stored_size_bytes BETWEEN 1 AND 2097152
                AND attachment.source_width BETWEEN 1 AND 1600
                AND attachment.source_height BETWEEN 1 AND 1600
                AND attachment.width BETWEEN 1 AND 1600
                AND attachment.height BETWEEN 1 AND 1600
              ), 0)::int AS confirmed_required_count,
              COALESCE(count(*) FILTER (WHERE NOT (
                attachment.evidence_policy_id = instance.evidence_policy_id
                AND attachment.mime_type = 'image/jpeg'
                AND attachment.source_sha256 ~ '^[0-9a-f]{64}$'
                AND attachment.stored_sha256 ~ '^[0-9a-f]{64}$'
                AND attachment.source_size_bytes BETWEEN 1 AND 2097152
                AND attachment.stored_size_bytes BETWEEN 1 AND 2097152
                AND attachment.source_width BETWEEN 1 AND 1600
                AND attachment.source_height BETWEEN 1 AND 1600
                AND attachment.width BETWEEN 1 AND 1600
                AND attachment.height BETWEEN 1 AND 1600
              )), 0)::int AS invalid_required_count
            FROM inspection_attachments attachment
            INNER JOIN jsonb_each(COALESCE(instance.evidence_policy_snapshot->'points', '{}'::jsonb)) point(field_path, definition)
              ON attachment.field_path = point.field_path
              AND definition->'required' = 'true'::jsonb
            WHERE attachment.form_instance_id = instance.id
          ) attachment_counts ON TRUE
        ) evidence ON inspection.system_key = 'automatic_sprinkler'
        ${where}
        ORDER BY instance.performed_at DESC, instance.client_uuid ASC
        LIMIT ${pageSize + 1}
      `, values);
      const hasMore = result.rows.length > pageSize;
      const inspections = result.rows.slice(0, pageSize).map((row) => {
        if (row.systemKey !== "automatic_sprinkler") {
          const { evidenceState, requiredEvidenceCount, confirmedEvidenceCount, ...summary } = row;
          return summary;
        }
        return row;
      });
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
            to_char(instance.performed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "performedAt",
            to_char(instance.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "receivedAt",
            instance.response_payload AS responses,
            instance.inspection_snapshot #> '{system,resolvedControls}' AS "displayControls",
            instance.original_creator_snapshot->>'username'
              AS "deviceReportedCreatorUsername",
            creator.username AS "verifiedOriginalCreatorUsername",
            syncer.username AS "syncedByUsername",
            instance.evidence_policy_id AS "evidencePolicyId",
            instance.evidence_policy_version AS "evidencePolicyVersion",
            instance.evidence_policy_snapshot AS "evidencePolicyDefinition",
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
