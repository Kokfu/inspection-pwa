import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import type { Pool, PoolClient } from "pg";
import { loadConfig } from "../config/env.js";
import { pool } from "../db/pool.js";
import { parseDryWetRiserSystemConfiguration } from "../inspections/dryWetRiserConfiguration.js";
import {
  evidencePolicyAssignableSystemKeys,
  parseEvidencePolicyIdInput
} from "../inspections/evidencePolicyAssignment.js";
import { buildLabelOverrideFormLayout } from "../inspections/labelOverrideFormLayout.js";
import { collectResolvedLabelPaths, resolvedLabelPathSet } from "../inspections/labelOverrides.js";
import {
  locationConfigurableSystemKeys,
  parseLocationConfigurationInput,
  type LocationConfigurationInput
} from "../inspections/locationConfiguration.js";
import {
  parseSystemConfiguration,
  systemConfigurationSchema,
  systemConfigurationSystemKeys
} from "../inspections/systemConfiguration.js";
import { resolveAutomaticSprinklerControls } from "../inspections/templates/automaticSprinklerDefinitionControls.js";
import { resolveCo2Controls } from "../inspections/templates/co2DefinitionControls.js";
import { resolveHoseReelControls } from "../inspections/templates/definitionControls.js";
import { resolveFireAlarmControls, resolveFireAlarmV6Controls } from "../inspections/templates/fireAlarmDefinitionControls.js";
import { isCompatibleSystemContract, isImplementedSystemKey } from "../inspections/templates/systemContractCompatibility.js";
import type { UserRole } from "../auth/authTypes.js";
import { requireRoleAudited } from "../middleware/requireRole.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const customerCatalogVersion = loadConfig().customerCatalogVersion;
const locationDependentSystemKeys = new Set(["co2_fire_extinguisher", "wet_chemical"]);
// Systems whose per-customer display labels a Manager may override. Bounded to
// the systems that expose a server-side resolved-controls tree — the canonical
// path grammar (see `labelOverrides.ts`) is that tree's own object path, so a
// system without a resolver has no addressable label node here. Storage
// (`label_overrides` column), forward-copy and job freeze stay system-agnostic,
// so this set can widen later without a data migration.
//
// `fire_alarm_detector` is deliberately NOT here yet: its V6 acceptor folds the
// frozen `configuration_snapshot` system entry (which would carry
// `label_overrides`) into the request fingerprint AND `fireAlarmV6Acceptance.ts`
// is on the DO-NOT-MODIFY list, so a display-only map cannot be kept out of that
// hash. Its web technician form also renders labels from a separate resolver.
//
// `automatic_sprinkler` rejoined in slice 1a-iii: `resolveAutomaticSprinklerControls`
// now forks on `templateVersion === 7` (four-state result control plus the
// `test_run_fire_pump_checks` block), so a V7 customer resolves an addressable
// tree instead of 409ing `SYSTEM_DEFINITION_UNRESOLVABLE`.
//
// Fire Alarm re-joins with its own dedicated slice. The storage / forward-copy /
// freeze layer stays system-agnostic, so widening this set needs no data migration.
const labelOverrideSystemKeys = new Set([
  "hose_reel", "co2_fire_extinguisher", "wet_chemical", "automatic_sprinkler"
]);
const labelOverrideMaxEntries = 300;
const labelOverrideMaxValueLength = 200;

/** Resolve a system's controls tree for a given published MFE-FSSR version. */
function resolveSystemControls(systemKey: string, definition: unknown, templateVersion: number): unknown {
  if (systemKey === "hose_reel") return resolveHoseReelControls(definition, "MFE-FSSR", templateVersion);
  if (systemKey === "co2_fire_extinguisher" || systemKey === "wet_chemical") {
    return resolveCo2Controls(definition, "MFE-FSSR", templateVersion);
  }
  if (systemKey === "fire_alarm_detector") {
    return templateVersion === 6 || templateVersion === 7
      ? resolveFireAlarmV6Controls(definition, templateVersion)
      : resolveFireAlarmControls(definition, "MFE-FSSR", templateVersion);
  }
  if (systemKey === "automatic_sprinkler") return resolveAutomaticSprinklerControls(definition, "MFE-FSSR", templateVersion);
  throw new ManagerCustomerError("LABEL_OVERRIDES_UNSUPPORTED_SYSTEM", "Label overrides are not supported for this system.", 404);
}

type LabelOverrideMap = Record<string, string>;

/** Validate a client label-override map against the system's real label nodes. */
function parseLabelOverrideMap(value: unknown, validPaths: Set<string>): LabelOverrideMap {
  if (!object(value)) {
    throw new ManagerCustomerError("INVALID_REQUEST", "labelOverrides must be an object.");
  }
  const entries = Object.entries(value);
  if (entries.length > labelOverrideMaxEntries) {
    throw new ManagerCustomerError("LABEL_OVERRIDES_TOO_LARGE", `At most ${labelOverrideMaxEntries} label overrides are allowed.`);
  }
  const parsed: LabelOverrideMap = {};
  for (const [path, label] of entries) {
    if (!validPaths.has(path)) {
      throw new ManagerCustomerError("UNKNOWN_LABEL_PATH", `Unknown label path: ${path}`);
    }
    if (typeof label !== "string" || label.trim().length === 0 || label.trim().length > labelOverrideMaxValueLength) {
      throw new ManagerCustomerError("INVALID_LABEL_OVERRIDE", `Label override for ${path} must be 1-${labelOverrideMaxValueLength} characters.`);
    }
    parsed[path] = label.trim();
  }
  return parsed;
}

/**
 * Validate the optional `systemConfiguration` body key on
 * `POST .../configuration-revisions`. Every entry's key must be BOTH in the
 * request's `systemKeys` and in `systemConfigurationSystemKeys`, and must parse
 * (`parseSystemConfiguration`). Returns the normalised map, or `undefined` when
 * the key is absent — making "enable dry_wet_riser + set riserMode" one atomic
 * revision.
 */
function parseConfigurationRevisionSystemConfiguration(
  value: unknown, keys: string[]
): Map<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!object(value)) {
    throw new ManagerCustomerError("INVALID_SYSTEM_CONFIGURATION", "systemConfiguration must be an object.");
  }
  const requested = new Set(keys);
  const map = new Map<string, unknown>();
  for (const [systemKey, configuration] of Object.entries(value)) {
    if (!requested.has(systemKey) || !systemConfigurationSystemKeys.has(systemKey)) {
      throw new ManagerCustomerError("INVALID_SYSTEM_CONFIGURATION", `systemConfiguration is not permitted for ${systemKey}.`);
    }
    const parsed = parseSystemConfiguration(systemKey, configuration);
    if (!parsed) {
      throw new ManagerCustomerError("INVALID_SYSTEM_CONFIGURATION", `systemConfiguration for ${systemKey} is invalid.`);
    }
    map.set(systemKey, parsed);
  }
  return map;
}

/**
 * Validate the optional `evidencePolicy` body key on
 * `POST .../configuration-revisions`. Every entry's key must be BOTH in the
 * request's `systemKeys` and in `evidencePolicyAssignableSystemKeys`, and every
 * value must parse (`parseEvidencePolicyIdInput` — a UUID string or `null`).
 * Mirrors `parseConfigurationRevisionSystemConfiguration`. Returns the map of
 * `systemKey -> (policyId | null)`, or `undefined` when the key is absent. Each
 * non-null id is additionally checked against `inspection_evidence_policies` by
 * the caller while holding the transaction — never relying on the DB trigger to
 * 500.
 */
function parseConfigurationRevisionEvidencePolicy(
  value: unknown, keys: string[]
): Map<string, string | null> | undefined {
  if (value === undefined) return undefined;
  if (!object(value)) {
    throw new ManagerCustomerError("INVALID_EVIDENCE_POLICY", "evidencePolicy must be an object.");
  }
  const requested = new Set(keys);
  const map = new Map<string, string | null>();
  for (const [systemKey, policyId] of Object.entries(value)) {
    if (!requested.has(systemKey) || !evidencePolicyAssignableSystemKeys.has(systemKey)) {
      throw new ManagerCustomerError("INVALID_EVIDENCE_POLICY", `evidencePolicy is not permitted for ${systemKey}.`);
    }
    const parsed = parseEvidencePolicyIdInput(policyId);
    if (!parsed) {
      throw new ManagerCustomerError("INVALID_EVIDENCE_POLICY", `evidencePolicy for ${systemKey} is invalid.`);
    }
    map.set(systemKey, parsed.evidencePolicyId);
  }
  return map;
}
/**
 * Validate the optional `locations` body key on
 * `POST .../configuration-revisions`. Every entry's key must be BOTH in the
 * request's `systemKeys` and in `locationConfigurableSystemKeys`, and every value
 * must parse (`parseLocationConfigurationInput` — which itself checks every
 * `location.zoneId` resolves within that system's own submitted zones). Mirrors
 * `parseConfigurationRevisionSystemConfiguration` exactly. Returns the map of
 * `systemKey -> { zones, locations }`, or `undefined` when the key is absent —
 * making "enable co2_fire_extinguisher + define its zones/locations" one atomic
 * revision.
 */
function parseConfigurationRevisionLocations(
  value: unknown, keys: string[]
): Map<string, LocationConfigurationInput> | undefined {
  if (value === undefined) return undefined;
  if (!object(value)) {
    throw new ManagerCustomerError("INVALID_LOCATION_CONFIGURATION", "locations must be an object.");
  }
  const requested = new Set(keys);
  const map = new Map<string, LocationConfigurationInput>();
  for (const [systemKey, configuration] of Object.entries(value)) {
    if (!requested.has(systemKey) || !locationConfigurableSystemKeys.has(systemKey)) {
      throw new ManagerCustomerError("INVALID_LOCATION_CONFIGURATION", `locations is not permitted for ${systemKey}.`);
    }
    const parsed = parseLocationConfigurationInput(configuration);
    if (!parsed) {
      throw new ManagerCustomerError("INVALID_LOCATION_CONFIGURATION", `locations for ${systemKey} is invalid.`);
    }
    map.set(systemKey, parsed);
  }
  return map;
}
// These contracts need structural information that the small shared-customer
// creation command intentionally does not collect. The API, not the browser,
// is the capability authority for this initial-format choice.
const initialStructureRequiredSystemKeys = new Set([...locationDependentSystemKeys, "dry_wet_riser"]);

type Database = Pick<Pool, "connect" | "query">;
type CatalogSystem = { key: string; displayName: string; sortOrder: number; definitionStatus: unknown; definition: unknown };
type EnabledSystem = { id: string; key: string; displayName: string; sortOrder: number; systemConfiguration: unknown; evidencePolicyId: string | null; labelOverrides: unknown };
type Zone = { id: string; enabledSystemId: string; key: string; displayName: string; sortOrder: number };
type Location = { id: string; enabledSystemId: string; zoneId: string | null; key: string; displayName: string; presetRowCount: number; rowPreset: unknown; sortOrder: number };
type SupportedSystem = Pick<CatalogSystem, "key" | "displayName" | "sortOrder"> & { assignable: boolean; unavailableReason?: string };
type CustomerCreationInput = {
  requestId: string; displayName: string; siteDisplayName: string; systemKeys: string[];
  contactPhone: string | null; contactPerson: string | null; fingerprint: string;
};

export class ManagerCustomerError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactBody(value: unknown, keys: readonly string[]) {
  if (!object(value) || Object.keys(value).some((key) => !keys.includes(key))) {
    throw new ManagerCustomerError("INVALID_REQUEST", "Request body is invalid.");
  }
  return value;
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 160) {
    throw new ManagerCustomerError("INVALID_REQUEST", `${field} must be between 1 and 160 characters.`);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string, maxLength: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim().length > maxLength) {
    throw new ManagerCustomerError("INVALID_REQUEST", `${field} must be at most ${maxLength} characters.`);
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function systemKeys(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32 || value.some((key) => typeof key !== "string")) {
    throw new ManagerCustomerError("INVALID_SYSTEM_KEYS", "Select one or more supported services.");
  }
  const keys = value.map((key) => key.trim());
  if (keys.some((key) => key.length === 0) || new Set(keys).size !== keys.length) {
    throw new ManagerCustomerError("INVALID_SYSTEM_KEYS", "Selected services must be unique valid system keys.");
  }
  return keys;
}

function parseCustomerCreation(value: unknown): CustomerCreationInput {
  const body = exactBody(value, ["requestId", "displayName", "siteDisplayName", "systemKeys", "contactPhone", "contactPerson"]);
  if (typeof body.requestId !== "string" || !uuidPattern.test(body.requestId)) {
    throw new ManagerCustomerError("INVALID_REQUEST", "requestId must be a valid UUID.");
  }
  const displayName = requiredText(body.displayName, "displayName");
  const siteDisplayName = requiredText(body.siteDisplayName, "siteDisplayName");
  const keys = systemKeys(body.systemKeys);
  const contactPhone = optionalText(body.contactPhone, "contactPhone", 40);
  const contactPerson = optionalText(body.contactPerson, "contactPerson", 160);
  const fingerprint = createHash("sha256").update(JSON.stringify({
    displayName: displayName.toLocaleLowerCase("en-US"),
    siteDisplayName: siteDisplayName.toLocaleLowerCase("en-US"),
    systemKeys: [...keys].sort(),
    contactPhone: contactPhone?.toLocaleLowerCase("en-US") ?? null,
    contactPerson: contactPerson?.toLocaleLowerCase("en-US") ?? null
  })).digest("hex");
  return { requestId: body.requestId, displayName, siteDisplayName, systemKeys: keys, contactPhone, contactPerson, fingerprint };
}

async function loadSupportedCatalog(database: Pick<PoolClient, "query">): Promise<CatalogSystem[]> {
  const result = await database.query<CatalogSystem>(`
    SELECT system.system_key AS key, system.display_name AS "displayName", system.sort_order AS "sortOrder",
      system.definition_status AS "definitionStatus", system.definition
    FROM master_service_report_systems system
    INNER JOIN master_service_report_templates template ON template.id = system.template_version_id
    WHERE template.code = 'MFE-FSSR' AND template.version = $1 AND template.publication_status = 'published'
    ORDER BY system.sort_order, system.system_key`, [customerCatalogVersion]);
  const supported = result.rows.filter((system) => isImplementedSystemKey(system.key)
    && isCompatibleSystemContract(system.key, system.definitionStatus, system.definition));
  if (supported.length === 0) throw new Error("The supported service catalog is unavailable");
  return supported;
}

async function requireSupportedKeys(client: PoolClient, keys: string[]) {
  const catalog = await loadSupportedCatalog(client);
  const allowed = new Set(catalog.map((system) => system.key));
  if (keys.some((key) => !allowed.has(key))) {
    throw new ManagerCustomerError("UNSUPPORTED_SYSTEM_KEY", "One or more selected services are not currently supported.");
  }
  return catalog.filter((system) => keys.includes(system.key));
}

function hasValidLocationAuthority(system: EnabledSystem, configuration: Awaited<ReturnType<typeof loadConfiguration>>) {
  const zones = new Set(configuration.zones.filter((zone) => zone.enabledSystemId === system.id).map((zone) => zone.id));
  const locations = configuration.locations.filter((location) => location.enabledSystemId === system.id);
  return locations.length > 0 && locations.every((location) => location.zoneId !== null && zones.has(location.zoneId));
}

function presentSupportedSystems(catalog: CatalogSystem[], configuration: Awaited<ReturnType<typeof loadConfiguration>>): SupportedSystem[] {
  const enabledByKey = new Map(configuration.enabled.map((system) => [system.key, system]));
  return catalog.map(({ key, displayName, sortOrder }) => {
    const existing = enabledByKey.get(key);
    const assignable = !locationDependentSystemKeys.has(key) || Boolean(existing && hasValidLocationAuthority(existing, configuration));
    return {
      key, displayName, sortOrder, assignable,
      ...(assignable ? {} : { unavailableReason: "Location configuration required" })
    };
  });
}

function assertLocationDependentAssignments(keys: string[], configuration: Awaited<ReturnType<typeof loadConfiguration>>) {
  const enabledByKey = new Map(configuration.enabled.map((system) => [system.key, system]));
  for (const key of keys) {
    if (!locationDependentSystemKeys.has(key)) continue;
    const existing = enabledByKey.get(key);
    if (!existing || !hasValidLocationAuthority(existing, configuration)) {
      throw new ManagerCustomerError("LOCATION_CONFIGURATION_REQUIRED", "Selected service requires valid existing location configuration.", 409);
    }
  }
}

function assertDryWetRiserAssignments(
  keys: string[],
  configuration: Awaited<ReturnType<typeof loadConfiguration>>,
  systemConfigurationBySystemKey?: ReadonlyMap<string, unknown>
) {
  if (!keys.includes("dry_wet_riser")) return;
  // The about-to-be-written config wins over the forward-copied current row, so
  // "enable dry_wet_riser + set riserMode" in one revision passes this guard.
  const pending = systemConfigurationBySystemKey?.get("dry_wet_riser");
  const existing = configuration.enabled.find((system) => system.key === "dry_wet_riser");
  const resolved = parseDryWetRiserSystemConfiguration(pending)
    ?? (existing ? parseDryWetRiserSystemConfiguration(existing.systemConfiguration) : undefined);
  if (!resolved) {
    throw new ManagerCustomerError(
      "RISER_MODE_REQUIRED",
      "dry_wet_riser.systemConfiguration.riserMode must be either dry or wet."
    );
  }
}

/**
 * A copy of `current` in which every system named in `pending` has its enabled
 * row + zones + locations replaced by SUBMITTED authority (synthetic
 * `pending:*` ids — never persisted). Passing this to the unchanged
 * `assertLocationDependentAssignments` lets "enable co2_fire_extinguisher +
 * define its zones/locations" pass the guard in one revision, exactly as
 * `assertDryWetRiserAssignments` already honours `systemConfigurationBySystemKey`.
 * With no `pending`, `current` is returned untouched.
 */
function withPendingLocationAuthority(
  current: Awaited<ReturnType<typeof loadConfiguration>>,
  pending?: ReadonlyMap<string, LocationConfigurationInput>
) {
  if (!pending || pending.size === 0) return current;
  const overridden = new Set(pending.keys());
  const keptEnabled = current.enabled.filter((system) => !overridden.has(system.key));
  const keptIds = new Set(keptEnabled.map((system) => system.id));
  const enabled = [...keptEnabled];
  const zones = current.zones.filter((zone) => keptIds.has(zone.enabledSystemId));
  const locations = current.locations.filter((location) => keptIds.has(location.enabledSystemId));
  for (const [key, submission] of pending) {
    const syntheticId = `pending:${key}`;
    enabled.push({
      id: syntheticId, key, displayName: key, sortOrder: 0,
      systemConfiguration: {}, evidencePolicyId: null, labelOverrides: {}
    });
    const zoneIdByKey = new Map<string, string>();
    for (const zone of submission.zones) {
      const zoneId = `pending-zone:${key}:${zone.key}`;
      zoneIdByKey.set(zone.key, zoneId);
      zones.push({ id: zoneId, enabledSystemId: syntheticId, key: zone.key, displayName: zone.displayName, sortOrder: zone.sortOrder });
    }
    for (const location of submission.locations) {
      locations.push({
        id: `pending-location:${key}:${location.key}`, enabledSystemId: syntheticId,
        zoneId: zoneIdByKey.get(location.zoneId) ?? null, key: location.key, displayName: location.displayName,
        presetRowCount: location.presetRowCount, rowPreset: location.rowPreset, sortOrder: location.sortOrder
      });
    }
  }
  return { revision: current.revision, enabled, zones, locations };
}

async function loadConfiguration(client: Pick<PoolClient, "query">, customerId: string) {
  const revisionResult = await client.query<{ id: string; revision: number; templateId: string }>(`
    SELECT id, revision, template_version_id AS "templateId" FROM customer_configuration_revisions
    WHERE customer_id = $1 AND status = 'active'`, [customerId]);
  const revision = revisionResult.rows[0];
  if (!revision) throw new ManagerCustomerError("CUSTOMER_CONFIGURATION_NOT_FOUND", "Customer configuration was not found.", 404);
  const enabledResult = await client.query<EnabledSystem>(`
    SELECT enabled.id, enabled.system_key AS key, system.display_name AS "displayName", enabled.sort_order AS "sortOrder",
      enabled.system_configuration AS "systemConfiguration", enabled.evidence_policy_id AS "evidencePolicyId",
      enabled.label_overrides AS "labelOverrides"
    FROM customer_enabled_systems enabled
    INNER JOIN master_service_report_systems system ON system.template_version_id = enabled.template_version_id AND system.system_key = enabled.system_key
    WHERE enabled.configuration_revision_id = $1 ORDER BY enabled.sort_order`, [revision.id]);
  const ids = enabledResult.rows.map((system) => system.id);
  const zones = ids.length === 0 ? [] : (await client.query<Zone>(`SELECT id, enabled_system_id AS "enabledSystemId", zone_key AS key, display_name AS "displayName", sort_order AS "sortOrder" FROM customer_system_zones WHERE enabled_system_id = ANY($1::uuid[]) ORDER BY enabled_system_id, sort_order`, [ids])).rows;
  const locations = ids.length === 0 ? [] : (await client.query<Location>(`SELECT id, enabled_system_id AS "enabledSystemId", zone_id AS "zoneId", location_key AS key, display_name AS "displayName", preset_row_count AS "presetRowCount", row_preset AS "rowPreset", sort_order AS "sortOrder" FROM customer_system_locations WHERE enabled_system_id = ANY($1::uuid[]) ORDER BY enabled_system_id, sort_order`, [ids])).rows;
  return { revision, enabled: enabledResult.rows, zones, locations };
}

export async function loadManagerCustomer(customerId: string, database: Pick<Pool, "query"> = pool) {
  const customerResult = await database.query<{ id: string; code: string; displayName: string; nextServiceDueDate: string | null; contactPhone: string | null; contactPerson: string | null }>(`
    SELECT id, customer_code AS code, display_name AS "displayName", next_service_due_date::text AS "nextServiceDueDate",
      contact_phone AS "contactPhone", contact_person AS "contactPerson" FROM customers
    WHERE id = $1 AND is_active = true AND is_demo = false`, [customerId]);
  const customer = customerResult.rows[0];
  if (!customer) return undefined;
  const sitesResult = await database.query<{ id: string; code: string; displayName: string }>(`
    SELECT id, site_code AS code, display_name AS "displayName" FROM customer_sites
    WHERE customer_id = $1 AND is_active = true ORDER BY display_name, id`, [customerId]);
  const config = await loadConfiguration(database as PoolClient, customerId);
  const catalog = presentSupportedSystems(await loadSupportedCatalog(database as PoolClient), config);
  return {
    customer,
    sites: sitesResult.rows,
    configuration: {
      id: config.revision.id,
      revision: config.revision.revision,
      enabledSystems: config.enabled.map(({ id, systemConfiguration, evidencePolicyId, labelOverrides, ...system }) => ({
        ...system,
        systemConfiguration: object(systemConfiguration) ? systemConfiguration : {},
        // Response-only: the string | null column value. The editor GET resolves
        // its own code/version — this does NOT join the policy table.
        evidencePolicyId: evidencePolicyId ?? null,
        labelOverrides: object(labelOverrides) ? labelOverrides : {},
        zones: config.zones.filter((zone) => zone.enabledSystemId === id),
        locations: config.locations.filter((location) => location.enabledSystemId === id)
      }))
    },
    supportedSystems: catalog
  };
}

/** The read-only customer view a supervisor receives from the customer list (T4). */
export function supervisorCustomerSummary(value: NonNullable<Awaited<ReturnType<typeof loadManagerCustomer>>>) {
  return {
    customer: { id: value.customer.id, code: value.customer.code, displayName: value.customer.displayName },
    sites: value.sites.map((site) => ({ id: site.id, code: site.code, displayName: site.displayName })),
    supportedSystems: value.supportedSystems.map((system) => ({ key: system.key, displayName: system.displayName, sortOrder: system.sortOrder }))
  };
}

export async function listManagerCustomers(database: Pick<Pool, "query"> = pool) {
  const result = await database.query<{ id: string }>(`SELECT id FROM customers WHERE is_active = true AND is_demo = false ORDER BY display_name, id`);
  return Promise.all(result.rows.map(({ id }) => loadManagerCustomer(id, database)));
}

async function copySelectedConfiguration(
  client: PoolClient,
  customerId: string,
  keys: string[],
  options: {
    labelOverridesBySystemKey?: ReadonlyMap<string, LabelOverrideMap>;
    systemConfigurationBySystemKey?: ReadonlyMap<string, unknown>;
    evidencePolicyBySystemKey?: ReadonlyMap<string, string | null>;
    zonesLocationsBySystemKey?: ReadonlyMap<string, LocationConfigurationInput>;
  } = {}
) {
  const current = await loadConfiguration(client, customerId);
  const supported = await requireSupportedKeys(client, keys);
  assertLocationDependentAssignments(keys, withPendingLocationAuthority(current, options.zonesLocationsBySystemKey));
  assertDryWetRiserAssignments(keys, current, options.systemConfigurationBySystemKey);
  const newRevisionId = randomUUID();
  await client.query(`UPDATE customer_configuration_revisions SET status = 'superseded' WHERE id = $1`, [current.revision.id]);
  await client.query(`INSERT INTO customer_configuration_revisions (id, customer_id, template_version_id, revision, status) VALUES ($1, $2, (SELECT id FROM master_service_report_templates WHERE code = 'MFE-FSSR' AND version = $3 AND publication_status = 'published'), $4, 'active')`, [newRevisionId, customerId, customerCatalogVersion, current.revision.revision + 1]);
  const oldByKey = new Map(current.enabled.map((system) => [system.key, system]));
  const catalogByKey = new Map(supported.map((system) => [system.key, system]));
  // A per-system edit (label overrides or system_configuration) that leaves the
  // enabled SET unchanged keeps the customer's current enabled-system order; any
  // system-selection change — including enabling `dry_wet_riser` with an inline
  // `system_configuration` — rebuilds in catalog order so the added key is
  // actually inserted, exactly as before.
  const currentKeys = current.enabled.map((system) => system.key);
  const perSystemEdit = Boolean(options.labelOverridesBySystemKey || options.systemConfigurationBySystemKey || options.evidencePolicyBySystemKey || options.zonesLocationsBySystemKey);
  const sameEnabledSet = currentKeys.length === keys.length && keys.every((key) => currentKeys.includes(key));
  const orderedKeys = perSystemEdit && sameEnabledSet ? currentKeys : supported.map((system) => system.key);
  for (const [index, key] of orderedKeys.entries()) {
    const catalogSystem = catalogByKey.get(key)!;
    const old = oldByKey.get(key);
    const enabledId = randomUUID();
    const labelOverrides = options.labelOverridesBySystemKey?.get(key)
      ?? (object(old?.labelOverrides) ? old!.labelOverrides : {});
    const systemConfiguration = options.systemConfigurationBySystemKey?.has(key)
      ? options.systemConfigurationBySystemKey.get(key)
      : (old?.systemConfiguration ?? {});
    // Legacy pre-V7 photo-policy hook; a functional no-op on V7 (see
    // `evidencePolicyAssignment.ts`). `null` is a valid explicit clear.
    const evidencePolicyId = options.evidencePolicyBySystemKey?.has(key)
      ? options.evidencePolicyBySystemKey.get(key) ?? null
      : (old?.evidencePolicyId ?? null);
    await client.query(`INSERT INTO customer_enabled_systems (id, configuration_revision_id, template_version_id, system_key, sort_order, system_configuration, evidence_policy_id, label_overrides) VALUES ($1, $2, (SELECT id FROM master_service_report_templates WHERE code = 'MFE-FSSR' AND version = $3), $4, $5, $6, $7, $8)`, [enabledId, newRevisionId, customerCatalogVersion, catalogSystem.key, index + 1, JSON.stringify(systemConfiguration), evidencePolicyId, JSON.stringify(labelOverrides)]);
    // A submitted zone/location set REPLACES this system's authority (fresh
    // UUIDs, `location.zoneId` mapped through the new-UUID map). Runs before the
    // `!old` short-circuit so a freshly-enabled location-dependent system still
    // gets its zones/locations. Every other system forward-copies unchanged.
    const submittedLocations = options.zonesLocationsBySystemKey?.get(key);
    if (submittedLocations) {
      const submittedZoneIds = new Map<string, string>();
      for (const zone of submittedLocations.zones) {
        const id = randomUUID(); submittedZoneIds.set(zone.key, id);
        await client.query(`INSERT INTO customer_system_zones (id, enabled_system_id, zone_key, display_name, sort_order) VALUES ($1,$2,$3,$4,$5)`, [id, enabledId, zone.key, zone.displayName, zone.sortOrder]);
      }
      for (const location of submittedLocations.locations) {
        await client.query(`INSERT INTO customer_system_locations (id, enabled_system_id, zone_id, location_key, display_name, preset_row_count, row_preset, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [randomUUID(), enabledId, submittedZoneIds.get(location.zoneId) ?? null, location.key, location.displayName, location.presetRowCount, JSON.stringify(location.rowPreset), location.sortOrder]);
      }
      continue;
    }
    if (!old) continue;
    const zoneIds = new Map<string, string>();
    for (const zone of current.zones.filter((value) => value.enabledSystemId === old.id)) {
      const id = randomUUID(); zoneIds.set(zone.id, id);
      await client.query(`INSERT INTO customer_system_zones (id, enabled_system_id, zone_key, display_name, sort_order) VALUES ($1,$2,$3,$4,$5)`, [id, enabledId, zone.key, zone.displayName, zone.sortOrder]);
    }
    for (const location of current.locations.filter((value) => value.enabledSystemId === old.id)) {
      await client.query(`INSERT INTO customer_system_locations (id, enabled_system_id, zone_id, location_key, display_name, preset_row_count, row_preset, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [randomUUID(), enabledId, location.zoneId ? zoneIds.get(location.zoneId) ?? null : null, location.key, location.displayName, location.presetRowCount, JSON.stringify(location.rowPreset), location.sortOrder]);
    }
  }
  return newRevisionId;
}

async function audit(client: PoolClient, actorUserId: number, action: string, entityType: string, entityId: string) {
  await client.query(`INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, result) VALUES ($1,$2,$3,$4,'success')`, [actorUserId, action, entityType, entityId]);
}

async function reserveCustomerCreationRequest(
  client: PoolClient, input: CustomerCreationInput, actorUserId: number
) {
  const reserved = await client.query<{ requestId: string }>(`
    INSERT INTO customer_creation_requests (request_id, request_fingerprint, created_by_user_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (request_id) DO NOTHING
    RETURNING request_id AS "requestId"`, [input.requestId, input.fingerprint, actorUserId]);
  if (reserved.rows[0]) return undefined;
  const existing = await client.query<{ fingerprint: string; customerId: string | null }>(`
    SELECT request_fingerprint AS fingerprint, customer_id AS "customerId"
    FROM customer_creation_requests WHERE request_id = $1 FOR SHARE`, [input.requestId]);
  const row = existing.rows[0];
  if (!row || row.fingerprint !== input.fingerprint) {
    throw new ManagerCustomerError("IDEMPOTENCY_CONFLICT", "This customer creation request ID was already used for different details.", 409);
  }
  if (!row.customerId) {
    throw new ManagerCustomerError("CUSTOMER_CREATION_INCOMPLETE", "Customer creation is still being finalized. Retry shortly with the same request ID.", 409);
  }
  return row.customerId;
}

async function createCustomer(
  client: PoolClient,
  actorUserId: number,
  input: CustomerCreationInput,
  auditAction: "manager_customer_created" | "technician_customer_created",
  afterCustomerInserted?: () => Promise<void> | void
) {
  const replayCustomerId = await reserveCustomerCreationRequest(client, input, actorUserId);
  if (replayCustomerId) return { customerId: replayCustomerId, idempotent: true };
  await requireSupportedKeys(client, input.systemKeys);
  assertLocationDependentAssignments(input.systemKeys, { revision: { id: "", revision: 0, templateId: "" }, enabled: [], zones: [], locations: [] });
  assertDryWetRiserAssignments(input.systemKeys, { revision: { id: "", revision: 0, templateId: "" }, enabled: [], zones: [], locations: [] });
  const customerId = randomUUID();
  const code = `CUST-${customerId.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const inserted = await client.query<{ id: string }>(`
    INSERT INTO customers (id, customer_code, display_name, is_demo, is_active, contact_phone, contact_person)
    VALUES ($1,$2,$3,false,true,$4,$5)
    ON CONFLICT ((lower(btrim(display_name)))) WHERE is_active DO NOTHING
    RETURNING id`, [customerId, code, input.displayName, input.contactPhone, input.contactPerson]);
  if (!inserted.rows[0]) {
    throw new ManagerCustomerError("CUSTOMER_NAME_CONFLICT", "An active customer already uses this display name.", 409);
  }
  await afterCustomerInserted?.();
  await client.query(`INSERT INTO customer_sites (id, customer_id, site_code, display_name, is_active) VALUES ($1,$2,'PRIMARY',$3,true)`, [randomUUID(), customerId, input.siteDisplayName]);
  const revisionId = randomUUID();
  await client.query(`INSERT INTO customer_configuration_revisions (id, customer_id, template_version_id, revision, status) VALUES ($1,$2,(SELECT id FROM master_service_report_templates WHERE code='MFE-FSSR' AND version=$3 AND publication_status='published'),1,'active')`, [revisionId, customerId, customerCatalogVersion]);
  const catalog = await requireSupportedKeys(client, input.systemKeys);
  for (const [index, system] of catalog.entries()) {
    await client.query(`INSERT INTO customer_enabled_systems (id, configuration_revision_id, template_version_id, system_key, sort_order) VALUES ($1,$2,(SELECT id FROM master_service_report_templates WHERE code='MFE-FSSR' AND version=$3),$4,$5)`, [randomUUID(), revisionId, customerCatalogVersion, system.key, index + 1]);
  }
  await audit(client, actorUserId, auditAction, "customer", customerId);
  const completed = await client.query(`UPDATE customer_creation_requests SET customer_id = $2 WHERE request_id = $1 AND customer_id IS NULL`, [input.requestId, customerId]);
  if (completed.rowCount !== 1) throw new Error("Customer creation request completion was lost");
  return { customerId, idempotent: false };
}

export function createManagerCustomersRouter(
  database: Database = pool,
  options: { afterCustomerInserted?: () => Promise<void> | void } = {}
) {
  const router = Router();
  // Every Manager route decision goes through the audited guard (supervisor refusals are logged).
  const requireRole = (...roles: UserRole[]) => requireRoleAudited(database, ...roles);
  router.get("/customers/service-format-options", requireRole("admin", "inspector"), async (_request, response, next) => {
    try {
      const systems = await loadSupportedCatalog(database);
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ systems: systems
        .filter((system) => !initialStructureRequiredSystemKeys.has(system.key))
        .map(({ key, displayName, sortOrder }) => ({ key, displayName, sortOrder })) });
    } catch (error) { next(error); }
  });
  router.post("/customers", requireRole("admin", "inspector"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      client = await database.connect();
      await client.query("BEGIN");
      const input = parseCustomerCreation(request.body);
      const created = await createCustomer(client, request.currentUser!.id, input, "technician_customer_created", options.afterCustomerInserted);
      await client.query("COMMIT");
      response.status(created.idempotent ? 200 : 201).json({ customer: await loadManagerCustomer(created.customerId, database) });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); } finally { client?.release(); }
  });
  router.get("/manager/customers", requireRole("admin", "supervisor"), async (request, response, next) => {
    try {
      response.setHeader("Cache-Control", "private, no-store");
      const customers = await listManagerCustomers(database);
      // A supervisor may search customers for Services Done only: identity, sites and the system
      // catalogue — never configuration, contact details or due dates (T4 design, owner Q1).
      response.json({ customers: request.currentUser?.role === "supervisor" ? customers.flatMap((customer) => customer ? [supervisorCustomerSummary(customer)] : []) : customers });
    } catch (error) { next(error); }
  });
  router.get("/manager/customers/upcoming-service", requireRole("admin"), async (_request, response, next) => {
    try {
      const result = await database.query(`SELECT id, customer_code AS code, display_name AS "displayName", next_service_due_date::text AS "nextServiceDueDate"
        FROM customers WHERE is_active=true AND is_demo=false ORDER BY next_service_due_date ASC NULLS LAST, display_name, id`);
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ customers: result.rows.filter((row) => row.nextServiceDueDate !== null), unscheduledCustomers: result.rows.filter((row) => row.nextServiceDueDate === null) });
    } catch (error) { next(error); }
  });
  router.put("/manager/customers/:customerId/next-service-due-date", requireRole("admin"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const customerId = request.params.customerId;
      if (typeof customerId !== "string" || !uuidPattern.test(customerId)) throw new ManagerCustomerError("INVALID_CUSTOMER_ID", "Customer ID must be a UUID.");
      const value = exactBody(request.body, ["nextServiceDueDate"]).nextServiceDueDate;
      if (value !== null && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)
        || value.startsWith("0000") || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
        || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) {
        throw new ManagerCustomerError("INVALID_NEXT_SERVICE_DUE_DATE", "Use a valid YYYY-MM-DD date or null.");
      }
      client = await database.connect();
      await client.query("BEGIN");
      const result = await client.query(`UPDATE customers SET next_service_due_date=$2 WHERE id=$1 AND is_active=true AND is_demo=false RETURNING id`, [customerId, value]);
      if (!result.rows[0]) throw new ManagerCustomerError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
      await audit(client, request.currentUser!.id, "manager_customer_next_service_due_date_updated", "customer", customerId);
      await client.query("COMMIT");
      response.json({ customer: await loadManagerCustomer(customerId, database) });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); }
    finally { client?.release(); }
  });
  router.put("/manager/customers/:customerId/contact-details", requireRole("admin"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const customerId = request.params.customerId;
      if (typeof customerId !== "string" || !uuidPattern.test(customerId)) throw new ManagerCustomerError("INVALID_CUSTOMER_ID", "Customer ID must be a UUID.");
      const body = exactBody(request.body, ["contactPhone", "contactPerson"]);
      const contactPhone = optionalText(body.contactPhone, "contactPhone", 40);
      const contactPerson = optionalText(body.contactPerson, "contactPerson", 160);
      client = await database.connect();
      await client.query("BEGIN");
      const result = await client.query(`UPDATE customers SET contact_phone=$2, contact_person=$3 WHERE id=$1 AND is_active=true AND is_demo=false RETURNING id`, [customerId, contactPhone, contactPerson]);
      if (!result.rows[0]) throw new ManagerCustomerError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
      await audit(client, request.currentUser!.id, "manager_customer_contact_details_updated", "customer", customerId);
      await client.query("COMMIT");
      response.json({ customer: await loadManagerCustomer(customerId, database) });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); }
    finally { client?.release(); }
  });
  router.get("/manager/customers/:customerId", requireRole("admin"), async (request, response, next) => {
    try {
      const customerId = request.params.customerId;
      if (typeof customerId !== "string" || !uuidPattern.test(customerId)) { response.status(400).json({ error: "INVALID_CUSTOMER_ID" }); return; }
      const customer = await loadManagerCustomer(customerId, database);
      if (!customer) { response.status(404).json({ error: "CUSTOMER_NOT_FOUND" }); return; }
      response.setHeader("Cache-Control", "private, no-store"); response.json({ customer });
    } catch (error) { next(error); }
  });
  router.get("/manager/customers/:customerId/configuration", requireRole("admin"), async (request, response, next) => {
    try {
      const customerId = request.params.customerId;
      if (typeof customerId !== "string" || !uuidPattern.test(customerId)) { response.status(400).json({ error: "INVALID_CUSTOMER_ID" }); return; }
      const customer = await loadManagerCustomer(customerId, database);
      if (!customer) { response.status(404).json({ error: "CUSTOMER_NOT_FOUND" }); return; }
      response.setHeader("Cache-Control", "private, no-store"); response.json({ configuration: customer.configuration, supportedSystems: customer.supportedSystems });
    } catch (error) { next(error); }
  });
  router.post("/manager/customers", requireRole("admin"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      client = await database.connect();
      const body = exactBody(request.body, ["displayName", "siteDisplayName", "systemKeys", "contactPhone", "contactPerson"]);
      const displayName = requiredText(body.displayName, "displayName"); const siteDisplayName = requiredText(body.siteDisplayName, "siteDisplayName"); const keys = systemKeys(body.systemKeys);
      const contactPhone = optionalText(body.contactPhone, "contactPhone", 40); const contactPerson = optionalText(body.contactPerson, "contactPerson", 160);
      await client.query("BEGIN"); await requireSupportedKeys(client, keys);
      assertLocationDependentAssignments(keys, { revision: { id: "", revision: 0, templateId: "" }, enabled: [], zones: [], locations: [] });
      const duplicate = await client.query(`SELECT id FROM customers WHERE is_active = true AND lower(btrim(display_name)) = lower(btrim($1)) LIMIT 1 FOR UPDATE`, [displayName]);
      if (duplicate.rows[0]) throw new ManagerCustomerError("CUSTOMER_NAME_CONFLICT", "An active customer already uses this display name.", 409);
      const customerId = randomUUID(); const code = `CUST-${customerId.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
      await client.query(`INSERT INTO customers (id, customer_code, display_name, is_demo, is_active, contact_phone, contact_person) VALUES ($1,$2,$3,false,true,$4,$5)`, [customerId, code, displayName, contactPhone, contactPerson]);
      await client.query(`INSERT INTO customer_sites (id, customer_id, site_code, display_name, is_active) VALUES ($1,$2,'PRIMARY',$3,true)`, [randomUUID(), customerId, siteDisplayName]);
      const revisionId = randomUUID();
      await client.query(`INSERT INTO customer_configuration_revisions (id, customer_id, template_version_id, revision, status) VALUES ($1,$2,(SELECT id FROM master_service_report_templates WHERE code='MFE-FSSR' AND version=$3 AND publication_status='published'),1,'active')`, [revisionId, customerId, customerCatalogVersion]);
      const catalog = await requireSupportedKeys(client, keys);
      for (const [index, system] of catalog.entries()) await client.query(`INSERT INTO customer_enabled_systems (id, configuration_revision_id, template_version_id, system_key, sort_order) VALUES ($1,$2,(SELECT id FROM master_service_report_templates WHERE code='MFE-FSSR' AND version=$3),$4,$5)`, [randomUUID(), revisionId, customerCatalogVersion, system.key, index + 1]);
      await audit(client, request.currentUser!.id, "manager_customer_created", "customer", customerId); await client.query("COMMIT");
      response.status(201).json({ customer: await loadManagerCustomer(customerId, database) });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); } finally { client?.release(); }
  });
  router.post("/manager/customers/:customerId/sites", requireRole("admin"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      client = await database.connect();
      const customerId = request.params.customerId;
      if (typeof customerId !== "string" || !uuidPattern.test(customerId)) throw new ManagerCustomerError("INVALID_CUSTOMER_ID", "Customer id is invalid.");
      const body = exactBody(request.body, ["displayName"]); const displayName = requiredText(body.displayName, "displayName");
      await client.query("BEGIN"); const owner = await client.query(`SELECT id FROM customers WHERE id=$1 AND is_active=true AND is_demo=false FOR UPDATE`, [customerId]);
      if (!owner.rows[0]) throw new ManagerCustomerError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
      const duplicate = await client.query(`SELECT id FROM customer_sites WHERE customer_id=$1 AND is_active=true AND lower(btrim(display_name))=lower(btrim($2)) LIMIT 1 FOR UPDATE`, [customerId, displayName]);
      if (duplicate.rows[0]) throw new ManagerCustomerError("SITE_NAME_CONFLICT", "An active site already uses this display name.", 409);
      const id = randomUUID(); const code = `SITE-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
      await client.query(`INSERT INTO customer_sites (id, customer_id, site_code, display_name, is_active) VALUES ($1,$2,$3,$4,true)`, [id, customerId, code, displayName]);
      await audit(client, request.currentUser!.id, "manager_customer_site_created", "customer_site", id); await client.query("COMMIT");
      response.status(201).json({ site: { id, code, displayName }, customer: await loadManagerCustomer(customerId, database) });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); } finally { client?.release(); }
  });
  router.post("/manager/customers/:customerId/configuration-revisions", requireRole("admin"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      client = await database.connect();
      const customerId = request.params.customerId;
      if (typeof customerId !== "string" || !uuidPattern.test(customerId)) throw new ManagerCustomerError("INVALID_CUSTOMER_ID", "Customer id is invalid.");
      const body = exactBody(request.body, ["systemKeys", "systemConfiguration", "evidencePolicy", "locations"]); const keys = systemKeys(body.systemKeys);
      const systemConfigurationBySystemKey = parseConfigurationRevisionSystemConfiguration(body.systemConfiguration, keys);
      const evidencePolicyBySystemKey = parseConfigurationRevisionEvidencePolicy(body.evidencePolicy, keys);
      const zonesLocationsBySystemKey = parseConfigurationRevisionLocations(body.locations, keys);
      await client.query("BEGIN");
      const owner = await client.query(`SELECT id FROM customers WHERE id=$1 AND is_active=true AND is_demo=false FOR UPDATE`, [customerId]);
      if (!owner.rows[0]) throw new ManagerCustomerError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
      if (evidencePolicyBySystemKey) {
        for (const [systemKey, policyId] of evidencePolicyBySystemKey) {
          if (policyId === null) continue;
          const match = await client.query(`SELECT 1 FROM inspection_evidence_policies WHERE id = $1 AND system_key = $2 AND publication_status = 'published'`, [policyId, systemKey]);
          if (!match.rows[0]) throw new ManagerCustomerError("INVALID_EVIDENCE_POLICY", `evidencePolicy for ${systemKey} is not a published policy for that system.`);
        }
      }
      const revisionId = await copySelectedConfiguration(client, customerId, keys, {
        ...(systemConfigurationBySystemKey ? { systemConfigurationBySystemKey } : {}),
        ...(evidencePolicyBySystemKey ? { evidencePolicyBySystemKey } : {}),
        ...(zonesLocationsBySystemKey ? { zonesLocationsBySystemKey } : {})
      });
      await audit(client, request.currentUser!.id, "manager_customer_configuration_activated", "customer_configuration_revision", revisionId); await client.query("COMMIT");
      response.status(201).json({ customer: await loadManagerCustomer(customerId, database) });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); } finally { client?.release(); }
  });

  const parseLabelOverrideTarget = (request: { params: Record<string, unknown> }) => {
    const customerId = request.params.customerId;
    const systemKey = request.params.systemKey;
    if (typeof customerId !== "string" || !uuidPattern.test(customerId)) {
      throw new ManagerCustomerError("INVALID_CUSTOMER_ID", "Customer id is invalid.");
    }
    if (typeof systemKey !== "string" || !labelOverrideSystemKeys.has(systemKey)) {
      throw new ManagerCustomerError("LABEL_OVERRIDES_UNSUPPORTED_SYSTEM", "Label overrides are not supported for this system.", 404);
    }
    return { customerId, systemKey };
  };

  // The active revision's frozen template version + published definition +
  // current stored overrides for one enabled system.
  const loadLabelOverrideContext = async (queryable: Pick<PoolClient, "query">, customerId: string, systemKey: string) => {
    const owner = await queryable.query(`SELECT 1 FROM customers WHERE id = $1 AND is_active = true AND is_demo = false`, [customerId]);
    if (!owner.rows[0]) throw new ManagerCustomerError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
    const result = await queryable.query<{ templateVersion: number; definition: unknown; labelOverrides: unknown }>(`
      SELECT template.version AS "templateVersion", system.definition, enabled.label_overrides AS "labelOverrides"
      FROM customer_configuration_revisions revision
      INNER JOIN master_service_report_templates template ON template.id = revision.template_version_id
      INNER JOIN customer_enabled_systems enabled ON enabled.configuration_revision_id = revision.id AND enabled.system_key = $2
      INNER JOIN master_service_report_systems system ON system.template_version_id = revision.template_version_id AND system.system_key = $2
      WHERE revision.customer_id = $1 AND revision.status = 'active'`, [customerId, systemKey]);
    const row = result.rows[0];
    if (!row) throw new ManagerCustomerError("SYSTEM_NOT_ENABLED", "That system is not enabled for this customer.", 404);
    let controls: unknown;
    try {
      controls = resolveSystemControls(systemKey, row.definition, row.templateVersion);
    } catch {
      throw new ManagerCustomerError("SYSTEM_DEFINITION_UNRESOLVABLE", "The frozen definition for this system cannot be resolved.", 409);
    }
    const stored = object(row.labelOverrides) ? row.labelOverrides as Record<string, unknown> : {};
    return { templateVersion: row.templateVersion, controls, stored };
  };

  const labelOverrideTree = (controls: unknown, stored: Record<string, unknown>) =>
    collectResolvedLabelPaths(controls).map((entry) => {
      const override = stored[entry.path];
      const overridden = typeof override === "string" && override.trim().length > 0;
      return {
        path: entry.path,
        key: entry.key,
        definitionLabel: entry.definitionLabel,
        effectiveLabel: overridden ? (override as string).trim() : entry.definitionLabel,
        overridden
      };
    });

  router.get("/manager/customers/:customerId/systems/:systemKey/label-overrides", requireRole("admin"), async (request, response, next) => {
    try {
      const { customerId, systemKey } = parseLabelOverrideTarget(request);
      const context = await loadLabelOverrideContext(database, customerId, systemKey);
      response.setHeader("Cache-Control", "private, no-store");
      response.json({
        systemKey,
        templateVersion: context.templateVersion,
        labels: labelOverrideTree(context.controls, context.stored),
        overrides: context.stored,
        // Additive, read-only display metadata for the Manager's form-shaped
        // editor (section headings, control kinds, result vocabulary, units).
        // GET only: `labels` / `overrides` and the PUT contract are unchanged.
        formLayout: buildLabelOverrideFormLayout(systemKey, context.controls)
      });
    } catch (error) { next(error); }
  });

  router.put("/manager/customers/:customerId/systems/:systemKey/label-overrides", requireRole("admin"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const { customerId, systemKey } = parseLabelOverrideTarget(request);
      const body = exactBody(request.body, ["labelOverrides"]);
      client = await database.connect();
      await client.query("BEGIN");
      const owner = await client.query(`SELECT id FROM customers WHERE id = $1 AND is_active = true AND is_demo = false FOR UPDATE`, [customerId]);
      if (!owner.rows[0]) throw new ManagerCustomerError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
      const context = await loadLabelOverrideContext(client, customerId, systemKey);
      const overrides = parseLabelOverrideMap(body.labelOverrides, resolvedLabelPathSet(context.controls));
      const current = await loadConfiguration(client, customerId);
      const revisionId = await copySelectedConfiguration(
        client,
        customerId,
        current.enabled.map((system) => system.key),
        { labelOverridesBySystemKey: new Map([[systemKey, overrides]]) }
      );
      await audit(client, request.currentUser!.id, "manager_customer_label_overrides_updated", "customer_configuration_revision", revisionId);
      await client.query("COMMIT");
      const refreshed = await loadLabelOverrideContext(database, customerId, systemKey);
      response.status(200).json({
        customer: await loadManagerCustomer(customerId, database),
        systemKey,
        templateVersion: refreshed.templateVersion,
        labels: labelOverrideTree(refreshed.controls, refreshed.stored),
        overrides: refreshed.stored
      });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); } finally { client?.release(); }
  });

  const parseSystemConfigurationTarget = (request: { params: Record<string, unknown> }) => {
    const customerId = request.params.customerId;
    const systemKey = request.params.systemKey;
    if (typeof customerId !== "string" || !uuidPattern.test(customerId)) {
      throw new ManagerCustomerError("INVALID_CUSTOMER_ID", "Customer id is invalid.");
    }
    if (typeof systemKey !== "string" || !systemConfigurationSystemKeys.has(systemKey)) {
      throw new ManagerCustomerError("SYSTEM_CONFIGURATION_UNSUPPORTED_SYSTEM", "Per-customer configuration is not supported for this system.", 404);
    }
    return { customerId, systemKey };
  };

  // The active revision's frozen template version, the server-authoritative form
  // descriptor, and the currently stored `system_configuration` for one enabled
  // system. Resolved exactly like `loadLabelOverrideContext`.
  const loadSystemConfigurationContext = async (queryable: Pick<PoolClient, "query">, customerId: string, systemKey: string) => {
    const owner = await queryable.query(`SELECT 1 FROM customers WHERE id = $1 AND is_active = true AND is_demo = false`, [customerId]);
    if (!owner.rows[0]) throw new ManagerCustomerError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
    const result = await queryable.query<{ templateVersion: number; systemConfiguration: unknown }>(`
      SELECT template.version AS "templateVersion", enabled.system_configuration AS "systemConfiguration"
      FROM customer_configuration_revisions revision
      INNER JOIN master_service_report_templates template ON template.id = revision.template_version_id
      INNER JOIN customer_enabled_systems enabled ON enabled.configuration_revision_id = revision.id AND enabled.system_key = $2
      WHERE revision.customer_id = $1 AND revision.status = 'active'`, [customerId, systemKey]);
    const row = result.rows[0];
    if (!row) throw new ManagerCustomerError("SYSTEM_NOT_ENABLED", "That system is not enabled for this customer.", 404);
    return {
      templateVersion: row.templateVersion,
      schema: systemConfigurationSchema(systemKey),
      stored: object(row.systemConfiguration) ? row.systemConfiguration : {}
    };
  };

  router.get("/manager/customers/:customerId/systems/:systemKey/system-configuration", requireRole("admin"), async (request, response, next) => {
    try {
      const { customerId, systemKey } = parseSystemConfigurationTarget(request);
      const context = await loadSystemConfigurationContext(database, customerId, systemKey);
      response.setHeader("Cache-Control", "private, no-store");
      response.json({
        systemKey,
        templateVersion: context.templateVersion,
        schema: context.schema,
        configuration: context.stored
      });
    } catch (error) { next(error); }
  });

  router.put("/manager/customers/:customerId/systems/:systemKey/system-configuration", requireRole("admin"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const { customerId, systemKey } = parseSystemConfigurationTarget(request);
      const body = exactBody(request.body, ["systemConfiguration"]);
      client = await database.connect();
      await client.query("BEGIN");
      const owner = await client.query(`SELECT id FROM customers WHERE id = $1 AND is_active = true AND is_demo = false FOR UPDATE`, [customerId]);
      if (!owner.rows[0]) throw new ManagerCustomerError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
      await loadSystemConfigurationContext(client, customerId, systemKey);
      const parsed = parseSystemConfiguration(systemKey, body.systemConfiguration);
      if (!parsed) throw new ManagerCustomerError("INVALID_SYSTEM_CONFIGURATION", "The system configuration payload is invalid for this system.");
      const current = await loadConfiguration(client, customerId);
      const revisionId = await copySelectedConfiguration(
        client,
        customerId,
        current.enabled.map((system) => system.key),
        { systemConfigurationBySystemKey: new Map([[systemKey, parsed]]) }
      );
      await audit(client, request.currentUser!.id, "manager_customer_system_configuration_updated", "customer_configuration_revision", revisionId);
      await client.query("COMMIT");
      const refreshed = await loadSystemConfigurationContext(database, customerId, systemKey);
      response.status(200).json({
        customer: await loadManagerCustomer(customerId, database),
        systemKey,
        templateVersion: refreshed.templateVersion,
        schema: refreshed.schema,
        configuration: refreshed.stored
      });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); } finally { client?.release(); }
  });

  // Per-customer `customer_enabled_systems.evidence_policy_id` assignment. This is
  // the LEGACY pre-V7 photo/PSI evidence lifecycle hook and is a functional
  // NO-OP for every customer a Manager can produce today (all on catalog version
  // 7 — the V7 acceptance path never reads `system.evidencePolicy`). The write
  // path + UI exist so the vertical is ready when a V7-era policy catalog does.
  // Mechanism mirrors the `system-configuration` routes exactly. No migration.
  const evidencePolicyField = { key: "evidencePolicyId", label: "Evidence policy", control: "select", required: false } as const;

  const parseEvidencePolicyTarget = (request: { params: Record<string, unknown> }) => {
    const customerId = request.params.customerId;
    const systemKey = request.params.systemKey;
    if (typeof customerId !== "string" || !uuidPattern.test(customerId)) {
      throw new ManagerCustomerError("INVALID_CUSTOMER_ID", "Customer id is invalid.");
    }
    if (typeof systemKey !== "string" || !evidencePolicyAssignableSystemKeys.has(systemKey)) {
      throw new ManagerCustomerError("EVIDENCE_POLICY_UNSUPPORTED_SYSTEM", "Evidence policy assignment is not supported for this system.", 404);
    }
    return { customerId, systemKey };
  };

  // The active revision's frozen template version, the currently stored
  // `evidence_policy_id` for one enabled system, and every published
  // `inspection_evidence_policies` row for that `system_key`. Resolved exactly
  // like `loadSystemConfigurationContext`.
  const loadEvidencePolicyContext = async (queryable: Pick<PoolClient, "query">, customerId: string, systemKey: string) => {
    const owner = await queryable.query(`SELECT 1 FROM customers WHERE id = $1 AND is_active = true AND is_demo = false`, [customerId]);
    if (!owner.rows[0]) throw new ManagerCustomerError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
    const result = await queryable.query<{ templateVersion: number; evidencePolicyId: string | null }>(`
      SELECT template.version AS "templateVersion", enabled.evidence_policy_id AS "evidencePolicyId"
      FROM customer_configuration_revisions revision
      INNER JOIN master_service_report_templates template ON template.id = revision.template_version_id
      INNER JOIN customer_enabled_systems enabled ON enabled.configuration_revision_id = revision.id AND enabled.system_key = $2
      WHERE revision.customer_id = $1 AND revision.status = 'active'`, [customerId, systemKey]);
    const row = result.rows[0];
    if (!row) throw new ManagerCustomerError("SYSTEM_NOT_ENABLED", "That system is not enabled for this customer.", 404);
    const policies = await queryable.query<{ id: string; code: string; version: number }>(`
      SELECT id, code, version FROM inspection_evidence_policies
      WHERE system_key = $1 AND publication_status = 'published'
      ORDER BY code, version`, [systemKey]);
    return {
      templateVersion: row.templateVersion,
      evidencePolicyId: row.evidencePolicyId,
      policies: policies.rows.map((policy) => ({
        id: policy.id, code: policy.code, version: policy.version, label: `${policy.code} v${policy.version}`
      }))
    };
  };

  router.get("/manager/customers/:customerId/systems/:systemKey/evidence-policy", requireRole("admin"), async (request, response, next) => {
    try {
      const { customerId, systemKey } = parseEvidencePolicyTarget(request);
      const context = await loadEvidencePolicyContext(database, customerId, systemKey);
      response.setHeader("Cache-Control", "private, no-store");
      response.json({
        systemKey,
        templateVersion: context.templateVersion,
        field: evidencePolicyField,
        policies: context.policies,
        evidencePolicyId: context.evidencePolicyId
      });
    } catch (error) { next(error); }
  });

  router.put("/manager/customers/:customerId/systems/:systemKey/evidence-policy", requireRole("admin"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const { customerId, systemKey } = parseEvidencePolicyTarget(request);
      const body = exactBody(request.body, ["evidencePolicyId"]);
      const parsed = parseEvidencePolicyIdInput(body.evidencePolicyId);
      if (!parsed) throw new ManagerCustomerError("INVALID_EVIDENCE_POLICY", "evidencePolicyId must be a published evidence policy id or null.");
      client = await database.connect();
      await client.query("BEGIN");
      const owner = await client.query(`SELECT id FROM customers WHERE id=$1 AND is_active AND NOT is_demo FOR UPDATE`, [customerId]);
      if (!owner.rows[0]) throw new ManagerCustomerError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
      await loadEvidencePolicyContext(client, customerId, systemKey);
      if (parsed.evidencePolicyId !== null) {
        // Never rely on the `enforce_enabled_system_evidence_policy` trigger to 500.
        const match = await client.query(`SELECT 1 FROM inspection_evidence_policies WHERE id = $1 AND system_key = $2 AND publication_status = 'published'`, [parsed.evidencePolicyId, systemKey]);
        if (!match.rows[0]) throw new ManagerCustomerError("INVALID_EVIDENCE_POLICY", "That evidence policy is not published for this system.");
      }
      const current = await loadConfiguration(client, customerId);
      const revisionId = await copySelectedConfiguration(
        client,
        customerId,
        current.enabled.map((system) => system.key),
        { evidencePolicyBySystemKey: new Map([[systemKey, parsed.evidencePolicyId]]) }
      );
      await audit(client, request.currentUser!.id, "manager_customer_evidence_policy_updated", "customer_configuration_revision", revisionId);
      await client.query("COMMIT");
      const refreshed = await loadEvidencePolicyContext(database, customerId, systemKey);
      response.status(200).json({
        customer: await loadManagerCustomer(customerId, database),
        systemKey,
        templateVersion: refreshed.templateVersion,
        field: evidencePolicyField,
        policies: refreshed.policies,
        evidencePolicyId: refreshed.evidencePolicyId
      });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); } finally { client?.release(); }
  });

  // Per-customer zone / location configuration for the location-dependent master
  // systems (`co2_fire_extinguisher`, `wet_chemical`). Defining at least one zone
  // + one location here is what flips the system's "Assigned Services" checkbox
  // from disabled ("Location configuration required") to assignable. Mechanism
  // mirrors the `system-configuration` / `evidence-policy` routes exactly. No
  // migration — `customer_system_zones` / `customer_system_locations` exist since
  // migrations 004/006.
  const parseLocationsTarget = (request: { params: Record<string, unknown> }) => {
    const customerId = request.params.customerId;
    const systemKey = request.params.systemKey;
    if (typeof customerId !== "string" || !uuidPattern.test(customerId)) {
      throw new ManagerCustomerError("INVALID_CUSTOMER_ID", "Customer id is invalid.");
    }
    if (typeof systemKey !== "string" || !locationConfigurableSystemKeys.has(systemKey)) {
      throw new ManagerCustomerError("LOCATIONS_UNSUPPORTED_SYSTEM", "Zone/location configuration is not supported for this system.", 404);
    }
    return { customerId, systemKey };
  };

  // The active revision's frozen template version plus the current zones /
  // locations for one system. POSTURE: resolves against the active revision even
  // when the system row is ABSENT (returns `zones: []`, `locations: []`) so a
  // Manager can define them before ticking the box.
  const loadLocationsContext = async (queryable: Pick<PoolClient, "query">, customerId: string, systemKey: string) => {
    const owner = await queryable.query(`SELECT 1 FROM customers WHERE id = $1 AND is_active = true AND is_demo = false`, [customerId]);
    if (!owner.rows[0]) throw new ManagerCustomerError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
    const revision = await queryable.query<{ id: string; templateVersion: number }>(`
      SELECT revision.id, template.version AS "templateVersion"
      FROM customer_configuration_revisions revision
      INNER JOIN master_service_report_templates template ON template.id = revision.template_version_id
      WHERE revision.customer_id = $1 AND revision.status = 'active'`, [customerId]);
    const active = revision.rows[0];
    if (!active) throw new ManagerCustomerError("CUSTOMER_CONFIGURATION_NOT_FOUND", "Customer configuration was not found.", 404);
    const enabled = await queryable.query<{ id: string }>(`
      SELECT id FROM customer_enabled_systems WHERE configuration_revision_id = $1 AND system_key = $2`, [active.id, systemKey]);
    const enabledId = enabled.rows[0]?.id;
    if (!enabledId) return { templateVersion: active.templateVersion, zones: [] as Zone[], locations: [] as Location[] };
    const zones = (await queryable.query<Zone>(`SELECT id, enabled_system_id AS "enabledSystemId", zone_key AS key, display_name AS "displayName", sort_order AS "sortOrder" FROM customer_system_zones WHERE enabled_system_id = $1 ORDER BY sort_order`, [enabledId])).rows;
    const locations = (await queryable.query<Location>(`SELECT id, enabled_system_id AS "enabledSystemId", zone_id AS "zoneId", location_key AS key, display_name AS "displayName", preset_row_count AS "presetRowCount", row_preset AS "rowPreset", sort_order AS "sortOrder" FROM customer_system_locations WHERE enabled_system_id = $1 ORDER BY sort_order`, [enabledId])).rows;
    return { templateVersion: active.templateVersion, zones, locations };
  };

  router.get("/manager/customers/:customerId/systems/:systemKey/locations", requireRole("admin"), async (request, response, next) => {
    try {
      const { customerId, systemKey } = parseLocationsTarget(request);
      const context = await loadLocationsContext(database, customerId, systemKey);
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ systemKey, templateVersion: context.templateVersion, zones: context.zones, locations: context.locations });
    } catch (error) { next(error); }
  });

  router.put("/manager/customers/:customerId/systems/:systemKey/locations", requireRole("admin"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const { customerId, systemKey } = parseLocationsTarget(request);
      const body = exactBody(request.body, ["zones", "locations"]);
      const parsed = parseLocationConfigurationInput({ zones: body.zones, locations: body.locations });
      if (!parsed) throw new ManagerCustomerError("INVALID_LOCATION_CONFIGURATION", "The zone/location payload is invalid for this system.");
      client = await database.connect();
      await client.query("BEGIN");
      const owner = await client.query(`SELECT id FROM customers WHERE id=$1 AND is_active AND NOT is_demo FOR UPDATE`, [customerId]);
      if (!owner.rows[0]) throw new ManagerCustomerError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
      await loadLocationsContext(client, customerId, systemKey);
      // `serviceVisits.ts` buildSnapshot invariant (~:131): every location of a
      // location-dependent system must carry a non-null zone that belongs to the
      // SAME system. `parseLocationConfigurationInput` already guarantees every
      // `location.zoneId` names a submitted zone `key`; assert it here too so the
      // contract is explicit at the write path.
      const submittedZoneKeys = new Set(parsed.zones.map((zone) => zone.key));
      if (parsed.locations.some((location) => !submittedZoneKeys.has(location.zoneId))) {
        throw new ManagerCustomerError("INVALID_LOCATION_CONFIGURATION", "Every location must reference a submitted zone of this system.");
      }
      const current = await loadConfiguration(client, customerId);
      const keys = current.enabled.map((system) => system.key);
      if (!keys.includes(systemKey)) keys.push(systemKey);
      const revisionId = await copySelectedConfiguration(
        client, customerId, keys,
        { zonesLocationsBySystemKey: new Map([[systemKey, parsed]]) }
      );
      await audit(client, request.currentUser!.id, "manager_customer_locations_updated", "customer_configuration_revision", revisionId);
      await client.query("COMMIT");
      const refreshed = await loadLocationsContext(database, customerId, systemKey);
      response.status(200).json({
        customer: await loadManagerCustomer(customerId, database),
        systemKey,
        templateVersion: refreshed.templateVersion,
        zones: refreshed.zones,
        locations: refreshed.locations
      });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); } finally { client?.release(); }
  });
  return router;
}

export const managerCustomersRouter = createManagerCustomersRouter();
