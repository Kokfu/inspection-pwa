import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { isCompatibleSystemContract, isImplementedSystemKey } from "../inspections/templates/systemContractCompatibility.js";
import { parseDryWetRiserSystemConfiguration } from "../inspections/dryWetRiserConfiguration.js";
import { siteNameKey, siteNameKeySql } from "../inspections/siteProposal.js";

type Queryable = Pick<PoolClient, "query">;

/** CR-02: a site the technician typed because it is not in the customer's list (name and address already normalised). */
export type NewSiteInput = { displayName: string; address: string | null };

export type CreateServiceVisitInput = {
  requestId: string;
  customerId: string;
  systemKeys: string[];
  serviceCallNumber?: string | null;
  arrivalTime?: string | null;
  departureTime?: string | null;
} & ({ siteId: string; newSite?: undefined } | { siteId?: undefined; newSite: NewSiteInput });

type CustomerRow = {
  id: string; code: string; displayName: string; contactPhone: string | null; contactPerson: string | null;
  fax: string | null; contractNumber: string | null; serviceFrequency: string | null;
};
type SiteRow = { id: string; customerId: string; displayName: string; address: string | null };
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
  labelOverrides: unknown;
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
  constructor(readonly code: string, message: string, readonly status = 400, readonly details?: Record<string, unknown>) { super(message); }
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

type CoverFields = { serviceCallNumber: string | null; arrivalTime: string | null; departureTime: string | null };

// Absent, null and blank all mean "not provided", mirroring the route's parser, so a
// retry is compared against exactly what the first request stored.
function coverText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? null : trimmed;
}

function coverFields(input: CreateServiceVisitInput): CoverFields {
  return {
    serviceCallNumber: coverText(input.serviceCallNumber),
    arrivalTime: coverText(input.arrivalTime),
    departureTime: coverText(input.departureTime)
  };
}

// A replay is idempotent only when every client-supplied value matches the stored visit.
function sameReplay(row: Record<string, unknown>, input: CreateServiceVisitInput, cover: CoverFields) {
  // A typed site is compared by its normalised name: the visit may have reused another technician's pending site
  // of the same name (owner decision D2), whose stored address is the first submitter's, not this request's.
  const sameSite = input.newSite
    ? typeof row.siteDisplayName === "string" && siteNameKey(row.siteDisplayName) === siteNameKey(input.newSite.displayName)
    : row.siteId === input.siteId;
  return row.customerId === input.customerId && sameSite
    && sameSystems(row.configurationSnapshot, input.systemKeys)
    && row.serviceCallNumber === cover.serviceCallNumber
    && row.arrivalTime === cover.arrivalTime
    && row.departureTime === cover.departureTime;
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
      enabled.system_configuration AS "systemConfiguration",
      enabled.label_overrides AS "labelOverrides"
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
    if (system.systemKey === "co2_fire_extinguisher" || system.systemKey === "wet_chemical" || system.systemKey === "fm200_fire_suppression") {
      const locations = locationsResult.rows.filter((location) => location.enabledSystemId === system.enabledSystemId);
      if (locations.some((location) => location.zoneId === null
        || location.zoneEnabledSystemId !== system.enabledSystemId)) {
        throw new ServiceVisitError("CONFIGURATION_INVALID", `${system.displayName} has an invalid configured location/zone relationship.`, 409);
      }
    }
  }
  return {
    schemaVersion: 1,
    customer,
    site: { id: site.id, displayName: site.displayName, address: site.address },
    configuration: { revisionId: configuration.revisionId, revisionNumber: configuration.revisionNumber },
    template: { id: configuration.templateId, code: configuration.templateCode, name: configuration.templateName, version: configuration.templateVersion },
    enabledSystems: systems.map((system) => {
      const configuredZones = zonesResult.rows.filter((zone) => zone.enabledSystemId === system.enabledSystemId);
      const configuredLocations = locationsResult.rows.filter((location) => location.enabledSystemId === system.enabledSystemId);
      const useGeneralLocation = (system.systemKey === "co2_fire_extinguisher" || system.systemKey === "wet_chemical" || system.systemKey === "fm200_fire_suppression") && configuredLocations.length === 0;
      const generalZoneId = useGeneralLocation ? randomUUID() : "";
      const { evidencePolicyId, evidencePolicyCode, evidencePolicyVersion, evidencePolicySchemaVersion,
        evidencePolicyDefinition, evidencePolicySha256, systemConfiguration, labelOverrides, definition: _definition, ...base } = system;
      return {
        ...base,
        // Label-only, per-customer, frozen at job creation. Never feeds
        // `canonical(definition)` / `contractSha256`, response keys, evidence
        // paths or the manifest. Emitted ONLY when a non-empty map exists (like
        // `systemConfiguration` below) so a customer with no override produces a
        // snapshot byte-identical to `e30c649` — this is what keeps historical
        // acceptors that assert an exact `system` shape (Fire Alarm V3-V5,
        // Portable Fire Extinguisher) from regressing. A missing map falls back
        // to the definition label at render time.
        ...(record(labelOverrides) && Object.keys(labelOverrides).length > 0 ? { labelOverrides } : {}),
        ...(base.systemKey === "dry_wet_riser" ? { systemConfiguration: parseDryWetRiserSystemConfiguration(systemConfiguration) } : {}),
        ...(evidencePolicyId ? { evidencePolicy: { id: evidencePolicyId, code: evidencePolicyCode,
          version: evidencePolicyVersion, schemaVersion: evidencePolicySchemaVersion,
          definition: evidencePolicyDefinition, definitionSha256: evidencePolicySha256 } } : {}),
        zones: useGeneralLocation ? [{ id: generalZoneId, enabledSystemId: system.enabledSystemId, key: "general", displayName: "General", sortOrder: 1 }] : configuredZones,
        locations: useGeneralLocation ? [{ id: randomUUID(), enabledSystemId: system.enabledSystemId, zoneId: generalZoneId, key: "general", displayName: "General", presetRowCount: 1, rowPreset: {}, sortOrder: 1 }] : configuredLocations
      };
    })
  };
}

/**
 * CR-02: resolve a typed site inside the visit's transaction (the caller already holds the customer row FOR UPDATE).
 * An ACTIVE site of the same normalised name refuses the request (409, nothing written) so the technician picks it;
 * a PENDING one (any technician, same customer) is reused and no second proposal is made (D2); otherwise a new
 * INACTIVE site and its proposal are inserted. Serialised per (customer, name) so two technicians typing the same
 * name at once end with one site and one proposal.
 */
async function resolveTypedSite(
  client: Queryable, customerId: string, typed: NewSiteInput, actorUserId: number, jobId: string
): Promise<SiteRow> {
  const key = siteNameKey(typed.displayName);
  await client.query("SELECT pg_advisory_xact_lock(hashtext('site_proposal_name:' || $1 || ':' || $2))", [customerId, key]);
  const active = await client.query<{ id: string }>(`SELECT id FROM customer_sites
    WHERE customer_id = $1 AND is_active = true AND ${siteNameKeySql("display_name")} = $2 LIMIT 1`, [customerId, key]);
  if (active.rows[0]) {
    throw new ServiceVisitError("SITE_ALREADY_EXISTS", "A site with this name already exists for this customer. Choose it from the list.", 409,
      { existingSiteId: active.rows[0].id });
  }
  const pending = await client.query<SiteRow>(`SELECT site.id, site.customer_id AS "customerId",
      site.display_name AS "displayName", site.address
    FROM customer_sites site
    INNER JOIN customer_site_proposals proposal ON proposal.site_id = site.id
    WHERE site.customer_id = $1 AND site.is_active = false AND ${siteNameKeySql("site.display_name")} = $2
      AND NOT EXISTS (SELECT 1 FROM customer_site_proposal_decisions decision WHERE decision.proposal_id = proposal.id)
    ORDER BY proposal.submitted_at, proposal.id LIMIT 1 FOR UPDATE OF site`, [customerId, key]);
  if (pending.rows[0]) return pending.rows[0];
  const siteId = randomUUID();
  const code = `SITE-${siteId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  await client.query(`INSERT INTO customer_sites (id, customer_id, site_code, display_name, address, is_active)
    VALUES ($1, $2, $3, $4, $5, false)`, [siteId, customerId, code, typed.displayName, typed.address]);
  const proposalId = randomUUID();
  await client.query(`INSERT INTO customer_site_proposals
    (id, customer_id, site_id, job_id, submitted_by_user_id, submitted_by_role, proposed_display_name, proposed_address)
    VALUES ($1, $2, $3, $4, $5, 'inspector', $6, $7)`, [proposalId, customerId, siteId, jobId, actorUserId, typed.displayName, typed.address]);
  await client.query(`INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, result)
    VALUES ($1, 'site_proposal_submitted', 'customer_site_proposal', $2, 'success')`, [actorUserId, proposalId]);
  return { id: siteId, customerId, displayName: typed.displayName, address: typed.address };
}

export async function createServiceVisit(
  client: PoolClient, input: CreateServiceVisitInput, actorUserId: number, actorRole?: string
): Promise<CreatedServiceVisit> {
  // Only a technician proposes a site; an Admin adds sites through the Manager screen. Fail closed on an unknown role.
  if (input.newSite && actorRole !== "inspector") {
    throw new ServiceVisitError("NEW_SITE_NOT_ALLOWED", "Only a technician can propose a new site while creating a service visit.", 403);
  }
  const cover = coverFields(input);
  await client.query("BEGIN");
  try {
    // One typed-site request at a time per (actor, request id): a double submit waits here, then replays below.
    if (input.newSite) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('service_visit_new_site:' || $1 || ':' || $2))", [String(actorUserId), input.requestId]);
    }
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
        job.configuration_snapshot AS "configurationSnapshot",
        job.service_call_number AS "serviceCallNumber",
        to_char(job.arrival_time, 'HH24:MI') AS "arrivalTime",
        to_char(job.departure_time, 'HH24:MI') AS "departureTime"
      FROM inspection_jobs job INNER JOIN customer_sites site ON site.id = job.site_id
      WHERE job.creation_request_id = $1 AND job.created_by_user_id = $2 FOR UPDATE`, [input.requestId, actorUserId]);
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (!sameReplay(row, input, cover)) {
        throw new ServiceVisitError("IDEMPOTENCY_MISMATCH", "This create request was already used for another service visit.", 409);
      }
      await client.query("COMMIT");
      return { id: row.id as string, idempotent: true };
    }

    const customerResult = await client.query<CustomerRow>(`SELECT id, customer_code AS code,
      display_name AS "displayName", contact_phone AS "contactPhone", contact_person AS "contactPerson",
      fax, contract_number AS "contractNumber", service_frequency AS "serviceFrequency"
      FROM customers WHERE id = $1 AND is_active = true ${input.newSite ? "FOR UPDATE" : "FOR SHARE"}`, [input.customerId]);
    const customer = customerResult.rows[0];
    if (!customer) throw new ServiceVisitError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
    const id = randomUUID();
    let site: SiteRow | undefined;
    if (input.newSite) {
      site = await resolveTypedSite(client, customer.id, input.newSite, actorUserId, id);
    } else {
      const siteResult = await client.query<SiteRow>(`SELECT id, customer_id AS "customerId",
        display_name AS "displayName", address FROM customer_sites
        WHERE id = $1 AND customer_id = $2 AND is_active = true FOR SHARE`, [input.siteId, input.customerId]);
      site = siteResult.rows[0];
      if (!site) throw new ServiceVisitError("SITE_NOT_FOUND", "Site was not found for the selected customer.", 404);
    }
    const configuration = await activeConfiguration(client, customer.id);
    if (!configuration) throw new ServiceVisitError("CONFIGURATION_NOT_FOUND", "Customer configuration is unavailable.", 409);
    const systems = await selectedSystems(client, configuration.revisionId, input.systemKeys);
    const snapshot = await buildSnapshot(client, customer, site, configuration, systems);
    // created_at keeps PostgreSQL's immutable, unambiguous creation instant.
    // The retained date/time compatibility columns are derived from that same
    // server transaction in Malaysia wall-clock form, never from the client.
    const creationClock = await client.query<{ serviceDate: string; serviceTime: string }>(`
      SELECT to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') AS "serviceDate",
        to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'HH24:MI') AS "serviceTime"`);
    const createdSchedule = creationClock.rows[0];
    if (!createdSchedule) throw new Error("Database creation clock is unavailable");
    const referenceSequence = await client.query<{ next: string }>("SELECT nextval('service_visit_reference_sequence')::text AS next");
    const reference = `SV-${createdSchedule.serviceDate.replace(/-/g, "")}-${referenceSequence.rows[0]!.next}`;
    const inserted = await client.query(`
      INSERT INTO inspection_jobs (
        id, template_id, master_template_version_id, job_reference, title, status, is_sample,
        customer_id, customer_configuration_revision_id, configuration_snapshot,
        site_id, service_date, service_time, creation_request_id, created_by_user_id,
        service_call_number, arrival_time, departure_time
      ) VALUES ($1, NULL, $2, $3, $4, 'open', false, $5, $6, $7, $8, $9::date, $10::time, $11, $12, $13, $14::time, $15::time)
      ON CONFLICT (created_by_user_id, creation_request_id) WHERE creation_request_id IS NOT NULL DO NOTHING
      RETURNING id`,
      [id, configuration.templateId, reference, site.displayName, customer.id, configuration.revisionId,
        JSON.stringify(snapshot), site.id, createdSchedule.serviceDate, createdSchedule.serviceTime, input.requestId, actorUserId,
        cover.serviceCallNumber, cover.arrivalTime, cover.departureTime]);
    if (inserted.rowCount === 0) {
      // A typed-site request must leave no orphan site or proposal behind: undo everything this transaction did,
      // then read the winning visit outside it. (The advisory lock above makes this unreachable in practice.)
      if (input.newSite) await client.query("ROLLBACK");
      const concurrent = await client.query(`
        SELECT job.id, job.job_reference AS reference, job.title, job.created_at AS "createdAt",
          job.service_date::text AS "serviceDate", job.site_id AS "siteId",
          to_char(job.service_time, 'HH24:MI') AS "serviceTime",
          site.display_name AS "siteDisplayName", job.customer_id AS "customerId",
          job.configuration_snapshot AS "configurationSnapshot",
          job.service_call_number AS "serviceCallNumber",
          to_char(job.arrival_time, 'HH24:MI') AS "arrivalTime",
          to_char(job.departure_time, 'HH24:MI') AS "departureTime"
        FROM inspection_jobs job INNER JOIN customer_sites site ON site.id = job.site_id
        WHERE job.creation_request_id = $1 AND job.created_by_user_id = $2`, [input.requestId, actorUserId]);
      const row = concurrent.rows[0];
      if (!row || !sameReplay(row, input, cover)) {
        throw new ServiceVisitError("IDEMPOTENCY_MISMATCH", "This create request was already used for another service visit.", 409);
      }
      if (!input.newSite) await client.query("COMMIT");
      return { id: row.id as string, idempotent: true };
    }
    await client.query("COMMIT");
    return { id: inserted.rows[0]!.id as string, idempotent: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
