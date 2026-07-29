import { Router } from "express";
import { pool } from "../db/pool.js";
import { parseDryWetRiserSystemConfiguration } from "../inspections/dryWetRiserConfiguration.js";
import { requireRole } from "../middleware/requireRole.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const supportedSystemKeys = new Set([
  "hose_reel",
  "co2_fire_extinguisher",
  "automatic_sprinkler", "dry_wet_riser"
]);
const waterTankKeys = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions"];
const pumpHouseKeys = ["pump_house_clean", "manual_start_pumps", "jockey_pump_pressure", "duty_pump_cut_in", "standby_pump_cut_in", "standby_pump_service_items", "battery_charging_alternator", "battery_charger_failure_alarm", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"];
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => key in value);
const resultValue = (value: unknown) => value === "good" || value === "poor";
function validDryWetResponse(value: unknown) {
  if (!object(value) || !exactKeys(value, ["schemaVersion", "mode", "waterTank", "pumpHouse", "measurements", "riserOutlets", "comments"]) || value.schemaVersion !== 1 || (value.mode !== "dry" && value.mode !== "wet") || typeof value.comments !== "string" || value.comments.length > 4000 || !object(value.measurements) || !exactKeys(value.measurements, ["jockeyCutIn", "jockeyCutOut", "dutyCutIn", "standbyCutIn", "unit"]) || value.measurements.unit !== "PSI" || ![value.measurements.jockeyCutIn, value.measurements.jockeyCutOut, value.measurements.dutyCutIn, value.measurements.standbyCutIn].every((item) => typeof item === "number" && Number.isFinite(item)) || !Array.isArray(value.riserOutlets)) return false;
  const fixed = (rows: unknown, keys: string[]) => object(rows) && exactKeys(rows, keys) && keys.every((key) => object(rows[key]) && exactKeys(rows[key], ["result", "remarks"]) && resultValue(rows[key].result) && typeof rows[key].remarks === "string" && rows[key].remarks.length <= 2000);
  if (!fixed(value.waterTank, waterTankKeys) || !fixed(value.pumpHouse, pumpHouseKeys)) return false;
  const rowIds = new Set<string>();
  return value.riserOutlets.every((row, index) => {
    const keys = ["rowUuid", "source", "configuredLocationId", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "assetReference", "locationText", "canvasHoseAt2Result", "diffuserNozzleResult", "landingValveResult", "crandleResult", "doorResult", "remarks", "sortOrder"];
    if (!object(row) || !exactKeys(row, keys) || typeof row.rowUuid !== "string" || !uuidPattern.test(row.rowUuid) || rowIds.has(row.rowUuid) || row.sortOrder !== index + 1 || typeof row.assetReference !== "string" || row.assetReference.length > 250 || typeof row.locationText !== "string" || row.locationText.length === 0 || row.locationText.length > 250 || typeof row.remarks !== "string" || row.remarks.length > 2000 || ![row.canvasHoseAt2Result, row.diffuserNozzleResult, row.landingValveResult, row.crandleResult, row.doorResult].every(resultValue)) return false;
    rowIds.add(row.rowUuid);
    return row.source === "technician" ? row.configuredLocationId === null && row.configuredRowOrdinal === null : row.source === "configured" && typeof row.configuredLocationId === "string" && uuidPattern.test(row.configuredLocationId) && Number.isInteger(row.configuredRowOrdinal) && Number(row.configuredRowOrdinal) > 0 && object(row.locationSnapshot) && row.locationSnapshot.id === row.configuredLocationId && typeof row.locationSnapshot.displayName === "string";
  });
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
      if (!inspection || !parseDryWetRiserSystemConfiguration(inspection.systemConfiguration) || !validDryWetResponse(inspection.responses)) {
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
          instance.zone_id AS "zoneId", instance.location_id AS "locationId",
          instance.display_sequence AS "displaySequence",
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
