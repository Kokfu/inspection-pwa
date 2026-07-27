import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireRole } from "../middleware/requireRole.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const supportedSystemKeys = new Set([
  "hose_reel",
  "co2_fire_extinguisher",
  "automatic_sprinkler"
]);

export const masterSystemInspectionsRouter = Router();

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
      if (
        (jobId !== undefined && !uuidPattern.test(jobId))
        || (systemKey !== undefined && !supportedSystemKeys.has(systemKey))
        || jobIds.length > 100
        || jobIds.some((value) => !uuidPattern.test(value))
      ) {
        response.status(400).json({ error: "INVALID_INSPECTION_FILTER" });
        return;
      }

      const values: unknown[] = [];
      const filters: string[] = [];
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
      const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const result = await pool.query(`
        SELECT instance.client_uuid AS "clientUuid", job.id AS "jobId",
          job.job_reference AS "jobReference", job.title AS "jobTitle",
          customer.display_name AS "customerName", inspection.system_key AS "systemKey",
          instance.instance_key AS "instanceKey", instance.zone_snapshot->>'displayName' AS "zoneName",
          instance.location_snapshot->>'displayName' AS "locationName", instance.status,
          instance.performed_at AS "performedAt", instance.received_at AS "receivedAt",
          instance.original_creator_snapshot->>'username' AS "deviceReportedCreatorUsername",
          creator.username AS "verifiedOriginalCreatorUsername",
          syncer.username AS "syncedByUsername"
        FROM master_system_form_instances instance
        INNER JOIN master_system_inspections inspection ON inspection.id = instance.inspection_group_id
        INNER JOIN inspection_jobs job ON job.id = inspection.job_id
        INNER JOIN customers customer ON customer.id = job.customer_id
        LEFT JOIN users creator ON creator.id = instance.original_created_by_user_id
        INNER JOIN users syncer ON syncer.id = instance.synced_by_user_id
        ${where}
        ORDER BY instance.performed_at DESC, instance.client_uuid ASC
        LIMIT 100
      `, values);
      response.json({ inspections: result.rows });
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
