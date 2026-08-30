import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import type { Pool, PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { isCompatibleSystemContract, isImplementedSystemKey } from "../inspections/templates/systemContractCompatibility.js";
import { requireRole } from "../middleware/requireRole.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const customerCatalogVersion = 6;
const locationDependentSystemKeys = new Set(["co2_fire_extinguisher", "wet_chemical"]);
// These contracts need structural information that the small shared-customer
// creation command intentionally does not collect. The API, not the browser,
// is the capability authority for this initial-format choice.
const initialStructureRequiredSystemKeys = new Set([...locationDependentSystemKeys, "dry_wet_riser"]);

type Database = Pick<Pool, "connect" | "query">;
type CatalogSystem = { key: string; displayName: string; sortOrder: number; definitionStatus: unknown; definition: unknown };
type EnabledSystem = { id: string; key: string; displayName: string; sortOrder: number; systemConfiguration: unknown; evidencePolicyId: string | null };
type Zone = { id: string; enabledSystemId: string; key: string; displayName: string; sortOrder: number };
type Location = { id: string; enabledSystemId: string; zoneId: string | null; key: string; displayName: string; presetRowCount: number; rowPreset: unknown; sortOrder: number };
type SupportedSystem = Pick<CatalogSystem, "key" | "displayName" | "sortOrder"> & { assignable: boolean; unavailableReason?: string };
type CustomerCreationInput = { requestId: string; displayName: string; siteDisplayName: string; systemKeys: string[]; fingerprint: string };

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
  const body = exactBody(value, ["requestId", "displayName", "siteDisplayName", "systemKeys"]);
  if (typeof body.requestId !== "string" || !uuidPattern.test(body.requestId)) {
    throw new ManagerCustomerError("INVALID_REQUEST", "requestId must be a valid UUID.");
  }
  const displayName = requiredText(body.displayName, "displayName");
  const siteDisplayName = requiredText(body.siteDisplayName, "siteDisplayName");
  const keys = systemKeys(body.systemKeys);
  const fingerprint = createHash("sha256").update(JSON.stringify({
    displayName: displayName.toLocaleLowerCase("en-US"),
    siteDisplayName: siteDisplayName.toLocaleLowerCase("en-US"),
    systemKeys: [...keys].sort()
  })).digest("hex");
  return { requestId: body.requestId, displayName, siteDisplayName, systemKeys: keys, fingerprint };
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

async function loadConfiguration(client: Pick<PoolClient, "query">, customerId: string) {
  const revisionResult = await client.query<{ id: string; revision: number; templateId: string }>(`
    SELECT id, revision, template_version_id AS "templateId" FROM customer_configuration_revisions
    WHERE customer_id = $1 AND status = 'active'`, [customerId]);
  const revision = revisionResult.rows[0];
  if (!revision) throw new ManagerCustomerError("CUSTOMER_CONFIGURATION_NOT_FOUND", "Customer configuration was not found.", 404);
  const enabledResult = await client.query<EnabledSystem>(`
    SELECT enabled.id, enabled.system_key AS key, system.display_name AS "displayName", enabled.sort_order AS "sortOrder",
      enabled.system_configuration AS "systemConfiguration", enabled.evidence_policy_id AS "evidencePolicyId"
    FROM customer_enabled_systems enabled
    INNER JOIN master_service_report_systems system ON system.template_version_id = enabled.template_version_id AND system.system_key = enabled.system_key
    WHERE enabled.configuration_revision_id = $1 ORDER BY enabled.sort_order`, [revision.id]);
  const ids = enabledResult.rows.map((system) => system.id);
  const zones = ids.length === 0 ? [] : (await client.query<Zone>(`SELECT id, enabled_system_id AS "enabledSystemId", zone_key AS key, display_name AS "displayName", sort_order AS "sortOrder" FROM customer_system_zones WHERE enabled_system_id = ANY($1::uuid[]) ORDER BY enabled_system_id, sort_order`, [ids])).rows;
  const locations = ids.length === 0 ? [] : (await client.query<Location>(`SELECT id, enabled_system_id AS "enabledSystemId", zone_id AS "zoneId", location_key AS key, display_name AS "displayName", preset_row_count AS "presetRowCount", row_preset AS "rowPreset", sort_order AS "sortOrder" FROM customer_system_locations WHERE enabled_system_id = ANY($1::uuid[]) ORDER BY enabled_system_id, sort_order`, [ids])).rows;
  return { revision, enabled: enabledResult.rows, zones, locations };
}

export async function loadManagerCustomer(customerId: string, database: Pick<Pool, "query"> = pool) {
  const customerResult = await database.query<{ id: string; code: string; displayName: string }>(`
    SELECT id, customer_code AS code, display_name AS "displayName" FROM customers
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
      enabledSystems: config.enabled.map(({ id, systemConfiguration: _configuration, evidencePolicyId: _policy, ...system }) => ({
        ...system,
        zones: config.zones.filter((zone) => zone.enabledSystemId === id),
        locations: config.locations.filter((location) => location.enabledSystemId === id)
      }))
    },
    supportedSystems: catalog
  };
}

export async function listManagerCustomers(database: Pick<Pool, "query"> = pool) {
  const result = await database.query<{ id: string }>(`SELECT id FROM customers WHERE is_active = true AND is_demo = false ORDER BY display_name, id`);
  return Promise.all(result.rows.map(({ id }) => loadManagerCustomer(id, database)));
}

async function copySelectedConfiguration(client: PoolClient, customerId: string, keys: string[]) {
  const current = await loadConfiguration(client, customerId);
  const supported = await requireSupportedKeys(client, keys);
  assertLocationDependentAssignments(keys, current);
  const newRevisionId = randomUUID();
  await client.query(`UPDATE customer_configuration_revisions SET status = 'superseded' WHERE id = $1`, [current.revision.id]);
  await client.query(`INSERT INTO customer_configuration_revisions (id, customer_id, template_version_id, revision, status) VALUES ($1, $2, (SELECT id FROM master_service_report_templates WHERE code = 'MFE-FSSR' AND version = $3 AND publication_status = 'published'), $4, 'active')`, [newRevisionId, customerId, customerCatalogVersion, current.revision.revision + 1]);
  const oldByKey = new Map(current.enabled.map((system) => [system.key, system]));
  for (const [index, catalogSystem] of supported.entries()) {
    const old = oldByKey.get(catalogSystem.key);
    const enabledId = randomUUID();
    await client.query(`INSERT INTO customer_enabled_systems (id, configuration_revision_id, template_version_id, system_key, sort_order, system_configuration, evidence_policy_id) VALUES ($1, $2, (SELECT id FROM master_service_report_templates WHERE code = 'MFE-FSSR' AND version = $3), $4, $5, $6, $7)`, [enabledId, newRevisionId, customerCatalogVersion, catalogSystem.key, index + 1, JSON.stringify(old?.systemConfiguration ?? {}), old?.evidencePolicyId ?? null]);
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
  const customerId = randomUUID();
  const code = `CUST-${customerId.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const inserted = await client.query<{ id: string }>(`
    INSERT INTO customers (id, customer_code, display_name, is_demo, is_active)
    VALUES ($1,$2,$3,false,true)
    ON CONFLICT ((lower(btrim(display_name)))) WHERE is_active DO NOTHING
    RETURNING id`, [customerId, code, input.displayName]);
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
  router.get("/manager/customers", requireRole("admin"), async (_request, response, next) => {
    try { response.setHeader("Cache-Control", "private, no-store"); response.json({ customers: await listManagerCustomers(database) }); } catch (error) { next(error); }
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
      const body = exactBody(request.body, ["displayName", "siteDisplayName", "systemKeys"]);
      const displayName = requiredText(body.displayName, "displayName"); const siteDisplayName = requiredText(body.siteDisplayName, "siteDisplayName"); const keys = systemKeys(body.systemKeys);
      await client.query("BEGIN"); await requireSupportedKeys(client, keys);
      assertLocationDependentAssignments(keys, { revision: { id: "", revision: 0, templateId: "" }, enabled: [], zones: [], locations: [] });
      const duplicate = await client.query(`SELECT id FROM customers WHERE is_active = true AND lower(btrim(display_name)) = lower(btrim($1)) LIMIT 1 FOR UPDATE`, [displayName]);
      if (duplicate.rows[0]) throw new ManagerCustomerError("CUSTOMER_NAME_CONFLICT", "An active customer already uses this display name.", 409);
      const customerId = randomUUID(); const code = `CUST-${customerId.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
      await client.query(`INSERT INTO customers (id, customer_code, display_name, is_demo, is_active) VALUES ($1,$2,$3,false,true)`, [customerId, code, displayName]);
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
      const body = exactBody(request.body, ["systemKeys"]); const keys = systemKeys(body.systemKeys); await client.query("BEGIN");
      const owner = await client.query(`SELECT id FROM customers WHERE id=$1 AND is_active=true AND is_demo=false FOR UPDATE`, [customerId]);
      if (!owner.rows[0]) throw new ManagerCustomerError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
      const revisionId = await copySelectedConfiguration(client, customerId, keys);
      await audit(client, request.currentUser!.id, "manager_customer_configuration_activated", "customer_configuration_revision", revisionId); await client.query("COMMIT");
      response.status(201).json({ customer: await loadManagerCustomer(customerId, database) });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); } finally { client?.release(); }
  });
  return router;
}

export const managerCustomersRouter = createManagerCustomersRouter();
