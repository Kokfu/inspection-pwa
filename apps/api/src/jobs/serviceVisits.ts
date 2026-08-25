import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { isCompatibleSystemContract, isImplementedSystemKey } from "../inspections/templates/systemContractCompatibility.js";
import { parseDryWetRiserSystemConfiguration } from "../inspections/dryWetRiserConfiguration.js";

type Queryable = Pick<PoolClient, "query">;

export type CreateServiceVisitInput = {
  requestId: string;
  customerId: string;
  siteId: string;
  serviceDate: string;
  // Malaysian site-local wall-clock time in 24-hour HH:MM form. It is not an
  // audit instant and therefore intentionally has no browser timezone.
  serviceTime: string;
  systemKeys: string[];
};

type CustomerRow = { id: string; code: string; displayName: string };
type SiteRow = { id: string; customerId: string; displayName: string };
type ConfigurationRow = {
  revisionId: string; revisionNumber: number; templateId: string;
  templateCode: string; templateName: string; templateVersion: number;
};
type SystemRow = {
  enabledSystemId: string; systemKey: string; displayName: string; sortOrder: number;
  definitionStatus: "confirmed"; definition: unknown;
  evidencePolicyId: string | null; evidencePolicyCode: string | null;
  evidencePolicyVersion: number | null; evidencePolicySchemaVersion: number | null;
  evidencePolicyDefinition: unknown; evidencePolicySha256: string | null;
  systemConfiguration: unknown;
};
type ZoneRow = { id: string; enabledSystemId: string; key: string; displayName: string; sortOrder: number };
type LocationRow = {
  id: string; enabledSystemId: string; zoneId: string | null; key: string;
  displayName: string; presetRowCount: number; rowPreset: unknown; sortOrder: number;
  zoneEnabledSystemId: string | null;
};

export type CreatedServiceVisit = {
  id: string;
  idempotent: boolean;
};

export class ServiceVisitError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameSystems(snapshot: unknown, requested: string[]) {
  if (!record(snapshot) || !Array.isArray(snapshot.enabledSystems)) return false;
  const actual = snapshot.enabledSystems.map((value) => record(value) ? value.systemKey : undefined);
  return actual.length === requested.length
    && new Set(actual).size === actual.length
    && actual.every((key) => typeof key === "string" && requested.includes(key));
}

async function activeConfiguration(client: Queryable, customerId: string) {
  const result = await client.query<ConfigurationRow>(`
    SELECT revision.id AS "revisionId", revision.revision AS "revisionNumber",
      template.id AS "templateId", template.code AS "templateCode",
      template.name AS "templateName", template.version AS "templateVersion"
    FROM customer_configuration_revisions revision
    INNER JOIN master_service_report_templates template ON template.id = revision.template_version_id
    WHERE revision.customer_id = $1 AND revision.status = 'active'
    FOR SHARE`, [customerId]);
  return result.rows[0];
}

async function selectedSystems(client: Queryable, revisionId: string, selected: string[]) {
  const result = await client.query<SystemRow>(`
    SELECT enabled.id AS "enabledSystemId", enabled.system_key AS "systemKey",
      system.display_name AS "displayName", enabled.sort_order AS "sortOrder",
      system.definition_status AS "definitionStatus", system.definition,
      policy.id AS "evidencePolicyId", policy.code AS "evidencePolicyCode",
      policy.version AS "evidencePolicyVersion", policy.schema_version AS "evidencePolicySchemaVersion",
      policy.definition AS "evidencePolicyDefinition", policy.definition_sha256 AS "evidencePolicySha256",
      enabled.system_configuration AS "systemConfiguration"
    FROM customer_enabled_systems enabled
    INNER JOIN master_service_report_systems system
      ON system.template_version_id = enabled.template_version_id AND system.system_key = enabled.system_key
    LEFT JOIN inspection_evidence_policies policy ON policy.id = enabled.evidence_policy_id
    WHERE enabled.configuration_revision_id = $1
      AND enabled.system_key = ANY($2::text[])
      AND system.definition_status = 'confirmed'
    ORDER BY enabled.sort_order, enabled.system_key
    FOR SHARE OF enabled`, [revisionId, selected]);
  if (result.rows.length !== selected.length) {
    throw new ServiceVisitError("SYSTEM_NOT_AVAILABLE", "One or more selected fire systems are not enabled for this customer.");
  }
  for (const system of result.rows) {
    if (!isImplementedSystemKey(system.systemKey) || !isCompatibleSystemContract(
      system.systemKey, system.definitionStatus, system.definition
    )) {
      throw new ServiceVisitError("SYSTEM_NOT_SUPPORTED", "A selected fire system is not supported for service visits.");
    }
    if (system.systemKey === "dry_wet_riser" && !parseDryWetRiserSystemConfiguration(system.systemConfiguration)) {
      throw new ServiceVisitError("CONFIGURATION_INVALID", "Dry/Wet Riser configuration is invalid.", 409);
    }
  }
  return result.rows;
}

async function buildSnapshot(
  client: Queryable, customer: CustomerRow, site: SiteRow,
  configuration: ConfigurationRow, systems: SystemRow[]
) {
  const ids = systems.map((system) => system.enabledSystemId);
  const [zonesResult, locationsResult] = await Promise.all([
    client.query<ZoneRow>(`SELECT id, enabled_system_id AS "enabledSystemId", zone_key AS key,
      display_name AS "displayName", sort_order AS "sortOrder"
      FROM customer_system_zones WHERE enabled_system_id = ANY($1::uuid[])
      ORDER BY enabled_system_id, sort_order`, [ids]),
    client.query<LocationRow>(`SELECT location.id, location.enabled_system_id AS "enabledSystemId",
      location.zone_id AS "zoneId", location.location_key AS key,
      location.display_name AS "displayName", location.preset_row_count AS "presetRowCount",
      location.row_preset AS "rowPreset", location.sort_order AS "sortOrder",
      zone.enabled_system_id AS "zoneEnabledSystemId"
      FROM customer_system_locations location
      LEFT JOIN customer_system_zones zone ON zone.id = location.zone_id
      WHERE location.enabled_system_id = ANY($1::uuid[])
      ORDER BY location.enabled_system_id, location.sort_order`, [ids])
  ]);
  for (const system of systems) {
    if (system.systemKey === "co2_fire_extinguisher" || system.systemKey === "wet_chemical") {
      const locations = locationsResult.rows.filter((location) => location.enabledSystemId === system.enabledSystemId);
      if (locations.length === 0) {
        throw new ServiceVisitError("CONFIGURATION_INVALID", `${system.displayName} requires configured locations.`, 409);
      }
      if (locations.some((location) => location.zoneId === null
        || location.zoneEnabledSystemId !== system.enabledSystemId)) {
        throw new ServiceVisitError("CONFIGURATION_INVALID", `${system.displayName} has an invalid configured location/zone relationship.`, 409);
      }
    }
  }
  return {
    schemaVersion: 1,
    customer,
    site: { id: site.id, displayName: site.displayName },
    configuration: { revisionId: configuration.revisionId, revisionNumber: configuration.revisionNumber },
    template: { id: configuration.templateId, code: configuration.templateCode, name: configuration.templateName, version: configuration.templateVersion },
    enabledSystems: systems.map((system) => {
      const { evidencePolicyId, evidencePolicyCode, evidencePolicyVersion, evidencePolicySchemaVersion,
        evidencePolicyDefinition, evidencePolicySha256, systemConfiguration, definition: _definition, ...base } = system;
      return {
        ...base,
        ...(base.systemKey === "dry_wet_riser" ? { systemConfiguration: parseDryWetRiserSystemConfiguration(systemConfiguration) } : {}),
        ...(evidencePolicyId ? { evidencePolicy: { id: evidencePolicyId, code: evidencePolicyCode,
          version: evidencePolicyVersion, schemaVersion: evidencePolicySchemaVersion,
          definition: evidencePolicyDefinition, definitionSha256: evidencePolicySha256 } } : {}),
        zones: zonesResult.rows.filter((zone) => zone.enabledSystemId === system.enabledSystemId),
        locations: locationsResult.rows.filter((location) => location.enabledSystemId === system.enabledSystemId)
      };
    })
  };
}

export async function createServiceVisit(
  client: PoolClient, input: CreateServiceVisitInput, actorUserId: number
): Promise<CreatedServiceVisit> {
  await client.query("BEGIN");
  try {
    // A 010-era row has no server-owned proof of its creator. Never bind it to
    // a caller or expose it merely because the caller knows its request UUID.
    const unresolvedLegacy = await client.query(`
      SELECT job.id
      FROM inspection_jobs job
      WHERE job.creation_request_id = $1 AND job.created_by_user_id IS NULL
      FOR UPDATE`, [input.requestId]);
    if (unresolvedLegacy.rows[0]) {
      throw new ServiceVisitError(
        "IDEMPOTENCY_LEGACY_UNRESOLVED",
        "A previous service-visit retry cannot be safely verified. Refresh My Service Jobs and contact an administrator; do not create it again.",
        409
      );
    }

    const existing = await client.query(`
      SELECT job.id, job.job_reference AS reference, job.title, job.created_at AS "createdAt",
        job.service_date::text AS "serviceDate", job.site_id AS "siteId",
        to_char(job.service_time, 'HH24:MI') AS "serviceTime",
        site.display_name AS "siteDisplayName", job.customer_id AS "customerId",
        job.configuration_snapshot AS "configurationSnapshot"
      FROM inspection_jobs job INNER JOIN customer_sites site ON site.id = job.site_id
      WHERE job.creation_request_id = $1 AND job.created_by_user_id = $2 FOR UPDATE`, [input.requestId, actorUserId]);
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (row.customerId !== input.customerId || row.siteId !== input.siteId
        || row.serviceDate !== input.serviceDate || row.serviceTime !== input.serviceTime
        || !sameSystems(row.configurationSnapshot, input.systemKeys)) {
        throw new ServiceVisitError("IDEMPOTENCY_MISMATCH", "This create request was already used for another service visit.", 409);
      }
      await client.query("COMMIT");
      return { id: row.id as string, idempotent: true };
    }

    const customerResult = await client.query<CustomerRow>(`SELECT id, customer_code AS code,
      display_name AS "displayName" FROM customers WHERE id = $1 AND is_active = true FOR SHARE`, [input.customerId]);
    const customer = customerResult.rows[0];
    if (!customer) throw new ServiceVisitError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
    const siteResult = await client.query<SiteRow>(`SELECT id, customer_id AS "customerId",
      display_name AS "displayName" FROM customer_sites
      WHERE id = $1 AND customer_id = $2 AND is_active = true FOR SHARE`, [input.siteId, input.customerId]);
    const site = siteResult.rows[0];
    if (!site) throw new ServiceVisitError("SITE_NOT_FOUND", "Site was not found for the selected customer.", 404);
    const configuration = await activeConfiguration(client, customer.id);
    if (!configuration) throw new ServiceVisitError("CONFIGURATION_NOT_FOUND", "Customer configuration is unavailable.", 409);
    const systems = await selectedSystems(client, configuration.revisionId, input.systemKeys);
    const snapshot = await buildSnapshot(client, customer, site, configuration, systems);
    const referenceSequence = await client.query<{ next: string }>("SELECT nextval('service_visit_reference_sequence')::text AS next");
    const reference = `SV-${input.serviceDate.replace(/-/g, "")}-${referenceSequence.rows[0]!.next}`;
    const id = randomUUID();
    const inserted = await client.query(`
      INSERT INTO inspection_jobs (
        id, template_id, master_template_version_id, job_reference, title, status, is_sample,
        customer_id, customer_configuration_revision_id, configuration_snapshot,
        site_id, service_date, service_time, creation_request_id, created_by_user_id
      ) VALUES ($1, NULL, $2, $3, $4, 'open', false, $5, $6, $7, $8, $9::date, $10::time, $11, $12)
      ON CONFLICT (created_by_user_id, creation_request_id) WHERE creation_request_id IS NOT NULL DO NOTHING
      RETURNING id`,
      [id, configuration.templateId, reference, site.displayName, customer.id, configuration.revisionId,
        JSON.stringify(snapshot), site.id, input.serviceDate, input.serviceTime, input.requestId, actorUserId]);
    if (inserted.rowCount === 0) {
      const concurrent = await client.query(`
        SELECT job.id, job.job_reference AS reference, job.title, job.created_at AS "createdAt",
          job.service_date::text AS "serviceDate", job.site_id AS "siteId",
          to_char(job.service_time, 'HH24:MI') AS "serviceTime",
          site.display_name AS "siteDisplayName", job.customer_id AS "customerId",
          job.configuration_snapshot AS "configurationSnapshot"
        FROM inspection_jobs job INNER JOIN customer_sites site ON site.id = job.site_id
        WHERE job.creation_request_id = $1 AND job.created_by_user_id = $2`, [input.requestId, actorUserId]);
      const row = concurrent.rows[0];
      if (!row || row.customerId !== input.customerId || row.siteId !== input.siteId
        || row.serviceDate !== input.serviceDate || row.serviceTime !== input.serviceTime
        || !sameSystems(row.configurationSnapshot, input.systemKeys)) {
        throw new ServiceVisitError("IDEMPOTENCY_MISMATCH", "This create request was already used for another service visit.", 409);
      }
      await client.query("COMMIT");
      return { id: row.id as string, idempotent: true };
    }
    await client.query("COMMIT");
    return { id: inserted.rows[0]!.id as string, idempotent: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
