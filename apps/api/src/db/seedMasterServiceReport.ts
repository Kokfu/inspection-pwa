import type { Pool, PoolClient } from "pg";
import { masterServiceReportV1 } from "../inspections/templates/masterServiceReportV1.js";

const demoSingleCustomerId = "00000000-0000-4000-8000-000000000510";
const demoSingleRevisionId = "00000000-0000-4000-8000-000000000511";
const demoMultiCustomerId = "00000000-0000-4000-8000-000000000520";
const demoMultiRevisionId = "00000000-0000-4000-8000-000000000521";
const demoCo2CustomerId = "00000000-0000-4000-8000-000000000670";
const demoCo2RevisionId = "00000000-0000-4000-8000-000000000671";
const demoCo2EnabledSystemId = "00000000-0000-4000-8000-000000000672";
const demoSprinklerCustomerId = "00000000-0000-4000-8000-000000000700";
const demoSprinklerRevisionId = "00000000-0000-4000-8000-000000000701";
const demoSprinklerEnabledSystemId = "00000000-0000-4000-8000-000000000702";
const demoSingleJobId = "00000000-0000-4000-8000-000000000580";
const demoMultiJobId = "00000000-0000-4000-8000-000000000590";
const demoCo2JobId = "00000000-0000-4000-8000-000000000679";
const demoSprinklerJobId = "00000000-0000-4000-8000-000000000709";
const demoCo2Customer = {
  id: demoCo2CustomerId,
  code: "DEMO-CO2-MULTI-ZONE-ACCEPT",
  name: "Demo CO2 Multi-Zone Client",
  revisionId: demoCo2RevisionId
} as const;
const demoSprinklerCustomer = {
  id: demoSprinklerCustomerId,
  code: "DEMO-AUTOMATIC-SPRINKLER",
  name: "Demo Automatic Sprinkler Client",
  revisionId: demoSprinklerRevisionId
} as const;
const demoCo2Zones = [
  { id: "00000000-0000-4000-8000-000000000681", key: "zone-1", name: "Zone 1", sortOrder: 1 },
  { id: "00000000-0000-4000-8000-000000000682", key: "zone-2", name: "Zone 2", sortOrder: 2 },
  { id: "00000000-0000-4000-8000-000000000683", key: "zone-3", name: "Zone 3", sortOrder: 3 }
] as const;
const demoCo2Locations = [
  { id: "00000000-0000-4000-8000-000000000691", zoneId: demoCo2Zones[0].id, key: "room-a", name: "Room A", sortOrder: 1 },
  { id: "00000000-0000-4000-8000-000000000692", zoneId: demoCo2Zones[0].id, key: "room-b", name: "Room B", sortOrder: 2 },
  { id: "00000000-0000-4000-8000-000000000693", zoneId: demoCo2Zones[0].id, key: "room-c", name: "Room C", sortOrder: 3 },
  { id: "00000000-0000-4000-8000-000000000694", zoneId: demoCo2Zones[0].id, key: "room-d", name: "Room D", sortOrder: 4 },
  { id: "00000000-0000-4000-8000-000000000695", zoneId: demoCo2Zones[1].id, key: "room-e", name: "Room E", sortOrder: 5 },
  { id: "00000000-0000-4000-8000-000000000696", zoneId: demoCo2Zones[2].id, key: "room-f", name: "Room F", sortOrder: 6 }
] as const;

function comparable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(comparable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${comparable(child)}`)
    .join(",")}}`;
}

function assertFixtureFields(
  entity: string,
  actual: Record<string, unknown> | undefined,
  expected: Record<string, unknown>
) {
  if (!actual) throw new Error(`${entity} is missing from the deterministic seed`);
  const mismatches = Object.entries(expected)
    .filter(([field, expectedValue]) => comparable(actual[field]) !== comparable(expectedValue))
    .map(([field, expectedValue]) => `${field}: expected ${comparable(expectedValue)}, found ${comparable(actual[field])}`);
  if (mismatches.length > 0) {
    throw new Error(`${entity} differs from the deterministic seed (${mismatches.join("; ")})`);
  }
}

async function insertFixture(entity: string, operation: Promise<unknown>) {
  try {
    await operation;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      const detail = "detail" in error && typeof error.detail === "string" ? ` (${error.detail})` : "";
      throw new Error(`${entity} conflicts with an existing deterministic fixture identity${detail}`, { cause: error });
    }
    throw error;
  }
}

type SnapshotCustomerRow = {
  id: string;
  code: string;
  displayName: string;
};

type SnapshotConfigurationRow = {
  revisionId: string;
  revisionNumber: number;
  templateId: string;
  templateCode: string;
  templateName: string;
  templateVersion: number;
};

type SnapshotSystemRow = {
  enabledSystemId: string;
  systemKey: string;
  displayName: string;
  sortOrder: number;
  definitionStatus: "confirmed";
};

type SnapshotZoneRow = {
  id: string;
  enabledSystemId: string;
  key: string;
  displayName: string;
  sortOrder: number;
};

type SnapshotLocationRow = {
  id: string;
  enabledSystemId: string;
  zoneId: string | null;
  key: string;
  displayName: string;
  presetRowCount: number;
  rowPreset: unknown;
  sortOrder: number;
};

async function seedTemplate(client: PoolClient) {
  await insertFixture("Published Master V1 template", client.query(
    `
      INSERT INTO master_service_report_templates (
        id, code, name, version, selection_policy,
        header_definition, report_boilerplate, publication_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'published')
      ON CONFLICT (id) DO NOTHING
    `,
    [
      masterServiceReportV1.id,
      masterServiceReportV1.code,
      masterServiceReportV1.name,
      masterServiceReportV1.version,
      masterServiceReportV1.selectionPolicy,
      JSON.stringify(masterServiceReportV1.header),
      JSON.stringify(masterServiceReportV1.reportBoilerplate)
    ]
  ));
  const templateVerified = await client.query<{ matches: boolean }>(
    `SELECT code = $2 AND name = $3 AND version = $4 AND selection_policy = $5
      AND header_definition = $6::jsonb AND report_boilerplate = $7::jsonb
      AND publication_status = 'published' AS matches
     FROM master_service_report_templates WHERE id = $1`,
    [
      masterServiceReportV1.id,
      masterServiceReportV1.code,
      masterServiceReportV1.name,
      masterServiceReportV1.version,
      masterServiceReportV1.selectionPolicy,
      JSON.stringify(masterServiceReportV1.header),
      JSON.stringify(masterServiceReportV1.reportBoilerplate)
    ]
  );
  if (templateVerified.rowCount !== 1 || !templateVerified.rows[0].matches) {
    throw new Error("Published Master V1 template differs from the tracked definition");
  }

  for (const system of masterServiceReportV1.systems) {
    await client.query(
      `
        INSERT INTO master_service_report_systems (
          template_version_id, system_key, display_name,
          sort_order, definition_status, definition
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (template_version_id, system_key) DO NOTHING
      `,
      [
        masterServiceReportV1.id,
        system.key,
        system.displayName,
        system.sortOrder,
        system.definitionStatus,
        JSON.stringify(system)
      ]
    );
    const verified = await client.query<{ matches: boolean }>(
      `SELECT display_name = $3 AND sort_order = $4 AND definition_status = $5
        AND definition = $6::jsonb AS matches
       FROM master_service_report_systems
       WHERE template_version_id = $1 AND system_key = $2`,
      [masterServiceReportV1.id, system.key, system.displayName, system.sortOrder, system.definitionStatus, JSON.stringify(system)]
    );
    if (verified.rowCount !== 1 || !verified.rows[0].matches) {
      throw new Error(`Published Master V1 system ${system.key} differs from the tracked definition`);
    }
  }
}

async function seedCustomer(
  client: PoolClient,
  customer: { id: string; code: string; name: string; revisionId: string }
) {
  await insertFixture(`Demo customer ${customer.code}`, client.query(
    `
      INSERT INTO customers (id, customer_code, display_name, is_demo)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (id) DO NOTHING
    `,
    [customer.id, customer.code, customer.name]
  ));
  const storedCustomer = await client.query<Record<string, unknown>>(
    `SELECT id, customer_code AS code, display_name AS name, is_demo AS "isDemo", is_active AS "isActive"
       FROM customers WHERE id = $1`,
    [customer.id]
  );
  assertFixtureFields(`Demo customer ${customer.code}`, storedCustomer.rows[0], {
    id: customer.id,
    code: customer.code,
    name: customer.name,
    isDemo: true,
    isActive: true
  });
  await insertFixture(`Demo configuration revision ${customer.revisionId}`, client.query(
    `
      INSERT INTO customer_configuration_revisions (
        id, customer_id, template_version_id, revision, status
      )
      VALUES ($1, $2, $3, 1, 'active')
      ON CONFLICT (id) DO NOTHING
    `,
    [customer.revisionId, customer.id, masterServiceReportV1.id]
  ));
  const storedRevision = await client.query<Record<string, unknown>>(
    `SELECT id, customer_id AS "customerId", template_version_id AS "templateVersionId",
        revision, status
       FROM customer_configuration_revisions WHERE id = $1`,
    [customer.revisionId]
  );
  assertFixtureFields(`Demo configuration revision ${customer.revisionId}`, storedRevision.rows[0], {
    id: customer.revisionId,
    customerId: customer.id,
    templateVersionId: masterServiceReportV1.id,
    revision: 1,
    status: "active"
  });
  const activeRevisions = await client.query<{ id: string }>(
    `SELECT id FROM customer_configuration_revisions
      WHERE customer_id = $1 AND status = 'active' ORDER BY id`,
    [customer.id]
  );
  if (activeRevisions.rowCount !== 1 || activeRevisions.rows[0]?.id !== customer.revisionId) {
    throw new Error(`Demo customer ${customer.code} must have exactly its deterministic active configuration revision`);
  }
}

async function seedEnabledSystem(
  client: PoolClient,
  id: string,
  revisionId: string,
  systemKey: string,
  sortOrder: number
) {
  await insertFixture(`Demo enabled system ${id}`, client.query(
    `
      INSERT INTO customer_enabled_systems (
        id, configuration_revision_id, template_version_id, system_key, sort_order
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO NOTHING
    `,
    [id, revisionId, masterServiceReportV1.id, systemKey, sortOrder]
  ));
  const stored = await client.query<Record<string, unknown>>(
    `SELECT enabled.id, enabled.configuration_revision_id AS "configurationRevisionId",
        enabled.template_version_id AS "templateVersionId", enabled.system_key AS "systemKey",
        enabled.sort_order AS "sortOrder", system.definition_status AS "definitionStatus"
       FROM customer_enabled_systems enabled
       INNER JOIN master_service_report_systems system
         ON system.template_version_id = enabled.template_version_id
        AND system.system_key = enabled.system_key
       WHERE enabled.id = $1`,
    [id]
  );
  assertFixtureFields(`Demo enabled system ${id}`, stored.rows[0], {
    id,
    configurationRevisionId: revisionId,
    templateVersionId: masterServiceReportV1.id,
    systemKey,
    sortOrder,
    definitionStatus: "confirmed"
  });
}

async function seedZone(
  client: PoolClient,
  id: string,
  enabledSystemId: string,
  zoneKey: string,
  displayName: string,
  sortOrder: number
) {
  await insertFixture(`Demo zone ${id}`, client.query(
    `
      INSERT INTO customer_system_zones (
        id, enabled_system_id, zone_key, display_name, sort_order
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO NOTHING
    `,
    [id, enabledSystemId, zoneKey, displayName, sortOrder]
  ));
  const stored = await client.query<Record<string, unknown>>(
    `SELECT zone.id, zone.enabled_system_id AS "enabledSystemId",
        enabled.configuration_revision_id AS "configurationRevisionId",
        zone.zone_key AS key, zone.display_name AS name, zone.sort_order AS "sortOrder"
       FROM customer_system_zones zone
       INNER JOIN customer_enabled_systems enabled ON enabled.id = zone.enabled_system_id
       WHERE zone.id = $1`,
    [id]
  );
  assertFixtureFields(`Demo zone ${id}`, stored.rows[0], {
    id,
    enabledSystemId,
    key: zoneKey,
    name: displayName,
    sortOrder
  });
}

async function seedLocation(
  client: PoolClient,
  values: {
    id: string;
    enabledSystemId: string;
    zoneId?: string;
    key: string;
    name: string;
    rowCount: number;
    assetReference: string;
    sortOrder: number;
  }
) {
  await insertFixture(`Demo location ${values.id}`, client.query(
    `
      INSERT INTO customer_system_locations (
        id, enabled_system_id, zone_id, location_key, display_name,
        preset_row_count, row_preset, sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      values.id,
      values.enabledSystemId,
      values.zoneId ?? null,
      values.key,
      values.name,
      values.rowCount,
      JSON.stringify({ assetReference: values.assetReference }),
      values.sortOrder
    ]
  ));
  const stored = await client.query<Record<string, unknown>>(
    `SELECT location.id, location.enabled_system_id AS "enabledSystemId",
        enabled.configuration_revision_id AS "configurationRevisionId",
        location.zone_id AS "zoneId", location.location_key AS key,
        location.display_name AS name, location.preset_row_count AS "rowCount",
        location.row_preset AS "rowPreset", location.sort_order AS "sortOrder"
       FROM customer_system_locations location
       INNER JOIN customer_enabled_systems enabled ON enabled.id = location.enabled_system_id
       WHERE location.id = $1`,
    [values.id]
  );
  assertFixtureFields(`Demo location ${values.id}`, stored.rows[0], {
    id: values.id,
    enabledSystemId: values.enabledSystemId,
    zoneId: values.zoneId ?? null,
    key: values.key,
    name: values.name,
    rowCount: values.rowCount,
    rowPreset: { assetReference: values.assetReference },
    sortOrder: values.sortOrder
  });
}

async function assertCo2FixtureMembership(client: PoolClient) {
  const enabledSystems = await client.query<Record<string, unknown>>(
    `SELECT enabled.id, enabled.configuration_revision_id AS "configurationRevisionId",
        enabled.template_version_id AS "templateVersionId", enabled.system_key AS "systemKey",
        enabled.sort_order AS "sortOrder", system.definition_status AS "definitionStatus"
       FROM customer_enabled_systems enabled
       INNER JOIN master_service_report_systems system
         ON system.template_version_id = enabled.template_version_id
        AND system.system_key = enabled.system_key
       WHERE enabled.configuration_revision_id = $1
       ORDER BY enabled.sort_order, enabled.id`,
    [demoCo2RevisionId]
  );
  if (enabledSystems.rowCount !== 1) {
    throw new Error(`CO2 demo configuration must contain exactly one enabled system; found ${enabledSystems.rowCount}`);
  }
  assertFixtureFields("CO2 demo enabled system membership", enabledSystems.rows[0], {
    id: demoCo2EnabledSystemId,
    configurationRevisionId: demoCo2RevisionId,
    templateVersionId: masterServiceReportV1.id,
    systemKey: "co2_fire_extinguisher",
    sortOrder: 1,
    definitionStatus: "confirmed"
  });

  const zones = await client.query<Record<string, unknown>>(
    `SELECT zone.id, zone.enabled_system_id AS "enabledSystemId",
        enabled.configuration_revision_id AS "configurationRevisionId",
        zone.zone_key AS key, zone.display_name AS name, zone.sort_order AS "sortOrder"
       FROM customer_system_zones zone
       INNER JOIN customer_enabled_systems enabled ON enabled.id = zone.enabled_system_id
       WHERE zone.enabled_system_id = $1
       ORDER BY zone.sort_order, zone.id`,
    [demoCo2EnabledSystemId]
  );
  if (zones.rowCount !== demoCo2Zones.length) {
    throw new Error(`CO2 demo configuration must contain exactly ${demoCo2Zones.length} zones; found ${zones.rowCount}`);
  }
  demoCo2Zones.forEach((expected, index) => {
    assertFixtureFields(`CO2 demo zone ${expected.name}`, zones.rows[index], {
      id: expected.id,
      enabledSystemId: demoCo2EnabledSystemId,
      configurationRevisionId: demoCo2RevisionId,
      key: expected.key,
      name: expected.name,
      sortOrder: expected.sortOrder
    });
  });

  const locations = await client.query<Record<string, unknown>>(
    `SELECT location.id, location.enabled_system_id AS "enabledSystemId",
        enabled.configuration_revision_id AS "configurationRevisionId",
        location.zone_id AS "zoneId", location.location_key AS key,
        location.display_name AS name, location.preset_row_count AS "rowCount",
        location.row_preset AS "rowPreset", location.sort_order AS "sortOrder"
       FROM customer_system_locations location
       INNER JOIN customer_enabled_systems enabled ON enabled.id = location.enabled_system_id
       WHERE location.enabled_system_id = $1
       ORDER BY location.sort_order, location.id`,
    [demoCo2EnabledSystemId]
  );
  if (locations.rowCount !== demoCo2Locations.length) {
    throw new Error(`CO2 demo configuration must contain exactly ${demoCo2Locations.length} locations; found ${locations.rowCount}`);
  }
  demoCo2Locations.forEach((expected, index) => {
    assertFixtureFields(`CO2 demo location ${expected.name}`, locations.rows[index], {
      id: expected.id,
      enabledSystemId: demoCo2EnabledSystemId,
      configurationRevisionId: demoCo2RevisionId,
      zoneId: expected.zoneId,
      key: expected.key,
      name: expected.name,
      rowCount: 1,
      rowPreset: { assetReference: "" },
      sortOrder: expected.sortOrder
    });
  });
  const distribution = demoCo2Zones.map((zone) =>
    locations.rows.filter((location) => location.zoneId === zone.id).length
  );
  if (distribution.join("/") !== "4/1/1") {
    throw new Error(`CO2 demo location distribution must be 4/1/1; found ${distribution.join("/")}`);
  }
}

async function assertSprinklerFixtureMembership(client: PoolClient) {
  const enabledSystems = await client.query<Record<string, unknown>>(
    `SELECT enabled.id, enabled.configuration_revision_id AS "configurationRevisionId",
        enabled.template_version_id AS "templateVersionId", enabled.system_key AS "systemKey",
        enabled.sort_order AS "sortOrder", system.definition_status AS "definitionStatus"
       FROM customer_enabled_systems enabled
       INNER JOIN master_service_report_systems system
         ON system.template_version_id = enabled.template_version_id
        AND system.system_key = enabled.system_key
       WHERE enabled.configuration_revision_id = $1
       ORDER BY enabled.sort_order, enabled.id`,
    [demoSprinklerRevisionId]
  );
  if (enabledSystems.rowCount !== 1) {
    throw new Error(`Automatic Sprinkler demo configuration must contain exactly one enabled system; found ${enabledSystems.rowCount}`);
  }
  assertFixtureFields("Automatic Sprinkler demo enabled system membership", enabledSystems.rows[0], {
    id: demoSprinklerEnabledSystemId,
    configurationRevisionId: demoSprinklerRevisionId,
    templateVersionId: masterServiceReportV1.id,
    systemKey: "automatic_sprinkler",
    sortOrder: 1,
    definitionStatus: "confirmed"
  });

  const zones = await client.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM customer_system_zones WHERE enabled_system_id = $1",
    [demoSprinklerEnabledSystemId]
  );
  const locations = await client.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM customer_system_locations WHERE enabled_system_id = $1",
    [demoSprinklerEnabledSystemId]
  );
  if (zones.rows[0]?.count !== 0 || locations.rows[0]?.count !== 0) {
    throw new Error("Automatic Sprinkler demo configuration must have zero zones and zero locations");
  }
}

async function seedDemoConfigurations(client: PoolClient) {
  await seedCustomer(client, {
    id: demoSingleCustomerId,
    code: "DEMO-SINGLE-ZONE",
    name: "Demo Single-Zone Client",
    revisionId: demoSingleRevisionId
  });
  await seedCustomer(client, {
    id: demoMultiCustomerId,
    code: "DEMO-MULTI-ZONE",
    name: "Demo Multi-Zone Client",
    revisionId: demoMultiRevisionId
  });
  await seedCustomer(client, demoCo2Customer);
  await seedCustomer(client, demoSprinklerCustomer);

  const singleSystems = [
    ["00000000-0000-4000-8000-000000000531", "hose_reel"],
    ["00000000-0000-4000-8000-000000000532", "fire_alarm_detector"],
    ["00000000-0000-4000-8000-000000000533", "portable_fire_extinguisher"]
  ] as const;
  for (const [index, [id, key]] of singleSystems.entries()) {
    await seedEnabledSystem(client, id, demoSingleRevisionId, key, index + 1);
  }
  await seedLocation(client, {
    id: "00000000-0000-4000-8000-000000000534",
    enabledSystemId: singleSystems[0][0],
    key: "main-floor",
    name: "Main Floor",
    rowCount: 3,
    assetReference: "HR-01 to HR-03",
    sortOrder: 1
  });

  const multiSystems = [
    ["00000000-0000-4000-8000-000000000541", "automatic_sprinkler"],
    ["00000000-0000-4000-8000-000000000542", "hose_reel"],
    ["00000000-0000-4000-8000-000000000543", "fire_alarm_detector"],
    ["00000000-0000-4000-8000-000000000544", "hydrant"],
    ["00000000-0000-4000-8000-000000000545", "co2_fire_extinguisher"],
    ["00000000-0000-4000-8000-000000000546", "wet_chemical"]
  ] as const;
  for (const [index, [id, key]] of multiSystems.entries()) {
    await seedEnabledSystem(client, id, demoMultiRevisionId, key, index + 1);
  }

  const zones = [
    ["00000000-0000-4000-8000-000000000551", "zone-1", "Zone 1"],
    ["00000000-0000-4000-8000-000000000552", "zone-2", "Zone 2"],
    ["00000000-0000-4000-8000-000000000553", "zone-3", "Zone 3"]
  ] as const;
  for (const [index, [id, key, name]] of zones.entries()) {
    await seedZone(client, id, multiSystems[1][0], key, name, index + 1);
    await seedLocation(client, {
      id: `00000000-0000-4000-8000-00000000056${index + 1}`,
      enabledSystemId: multiSystems[1][0],
      zoneId: id,
      key: `${key}-service-area`,
      name: `${name} Service Area`,
      rowCount: index + 2,
      assetReference: `HR-${index + 1}01`,
      sortOrder: index + 1
    });
  }

  await seedEnabledSystem(client, demoCo2EnabledSystemId, demoCo2RevisionId, "co2_fire_extinguisher", 1);
  for (const zone of demoCo2Zones) {
    await seedZone(client, zone.id, demoCo2EnabledSystemId, zone.key, zone.name, zone.sortOrder);
  }
  for (const location of demoCo2Locations) {
    await seedLocation(client, {
      id: location.id,
      enabledSystemId: demoCo2EnabledSystemId,
      zoneId: location.zoneId,
      key: location.key,
      name: location.name,
      rowCount: 1,
      assetReference: "",
      sortOrder: location.sortOrder
    });
  }
  await assertCo2FixtureMembership(client);
  await seedEnabledSystem(
    client,
    demoSprinklerEnabledSystemId,
    demoSprinklerRevisionId,
    "automatic_sprinkler",
    1
  );
  await assertSprinklerFixtureMembership(client);
}

async function buildJobConfigurationSnapshot(
  client: PoolClient,
  customerId: string,
  revisionId: string
) {
  const customerResult = await client.query<SnapshotCustomerRow>(
    `
      SELECT id, customer_code AS code, display_name AS "displayName"
      FROM customers
      WHERE id = $1
    `,
    [customerId]
  );
  const configurationResult = await client.query<SnapshotConfigurationRow>(
    `
      SELECT
        revision.id AS "revisionId",
        revision.revision AS "revisionNumber",
        template.id AS "templateId",
        template.code AS "templateCode",
        template.name AS "templateName",
        template.version AS "templateVersion"
      FROM customer_configuration_revisions revision
      INNER JOIN master_service_report_templates template
        ON template.id = revision.template_version_id
      WHERE revision.id = $1 AND revision.customer_id = $2
    `,
    [revisionId, customerId]
  );
  const systemsResult = await client.query<SnapshotSystemRow>(
    `
      SELECT
        enabled.id AS "enabledSystemId",
        enabled.system_key AS "systemKey",
        system.display_name AS "displayName",
        enabled.sort_order AS "sortOrder",
        system.definition_status AS "definitionStatus"
      FROM customer_enabled_systems enabled
      INNER JOIN master_service_report_systems system
        ON system.template_version_id = enabled.template_version_id
       AND system.system_key = enabled.system_key
      WHERE enabled.configuration_revision_id = $1
        AND system.definition_status = 'confirmed'
      ORDER BY enabled.sort_order
    `,
    [revisionId]
  );
  const enabledSystemIds = systemsResult.rows.map((system) => system.enabledSystemId);
  const zonesResult = enabledSystemIds.length === 0
    ? { rows: [] as SnapshotZoneRow[] }
    : await client.query<SnapshotZoneRow>(
        `
          SELECT
            id,
            enabled_system_id AS "enabledSystemId",
            zone_key AS key,
            display_name AS "displayName",
            sort_order AS "sortOrder"
          FROM customer_system_zones
          WHERE enabled_system_id = ANY($1::uuid[])
          ORDER BY enabled_system_id, sort_order
        `,
        [enabledSystemIds]
      );
  const locationsResult = enabledSystemIds.length === 0
    ? { rows: [] as SnapshotLocationRow[] }
    : await client.query<SnapshotLocationRow>(
        `
          SELECT
            id,
            enabled_system_id AS "enabledSystemId",
            zone_id AS "zoneId",
            location_key AS key,
            display_name AS "displayName",
            preset_row_count AS "presetRowCount",
            row_preset AS "rowPreset",
            sort_order AS "sortOrder"
          FROM customer_system_locations
          WHERE enabled_system_id = ANY($1::uuid[])
          ORDER BY enabled_system_id, sort_order
        `,
        [enabledSystemIds]
      );

  const customer = customerResult.rows[0];
  const configuration = configurationResult.rows[0];
  if (!customer || !configuration) {
    throw new Error("Demo job configuration is unavailable");
  }

  return {
    schemaVersion: 1,
    customer,
    configuration: {
      revisionId: configuration.revisionId,
      revisionNumber: configuration.revisionNumber
    },
    template: {
      id: configuration.templateId,
      code: configuration.templateCode,
      name: configuration.templateName,
      version: configuration.templateVersion
    },
    enabledSystems: systemsResult.rows.map((system) => ({
      ...system,
      zones: zonesResult.rows.filter((zone) => zone.enabledSystemId === system.enabledSystemId),
      locations: locationsResult.rows.filter(
        (location) => location.enabledSystemId === system.enabledSystemId
      )
    }))
  };
}

async function assertExistingCo2FixtureBeforeSeed(client: PoolClient) {
  const footprint = await client.query<{ count: number }>(
    `SELECT (
        (SELECT count(*) FROM customers
          WHERE id = $1 OR customer_code = $2)
        + (SELECT count(*) FROM customer_configuration_revisions WHERE id = $3)
        + (SELECT count(*) FROM customer_enabled_systems WHERE id = $4)
        + (SELECT count(*) FROM customer_system_zones WHERE enabled_system_id = $4)
        + (SELECT count(*) FROM customer_system_locations WHERE enabled_system_id = $4)
        + (SELECT count(*) FROM inspection_jobs
          WHERE id = $5 OR job_reference = $6)
      )::integer AS count`,
    [
      demoCo2CustomerId,
      demoCo2Customer.code,
      demoCo2RevisionId,
      demoCo2EnabledSystemId,
      demoCo2JobId,
      "DEMO-JOB-CO2-ACCEPT-001"
    ]
  );
  if ((footprint.rows[0]?.count ?? 0) === 0) return;

  const customer = await client.query<Record<string, unknown>>(
    `SELECT id, customer_code AS code, display_name AS name,
        is_demo AS "isDemo", is_active AS "isActive"
       FROM customers WHERE id = $1`,
    [demoCo2CustomerId]
  );
  assertFixtureFields("Existing CO2 demo customer", customer.rows[0], {
    id: demoCo2CustomerId,
    code: demoCo2Customer.code,
    name: demoCo2Customer.name,
    isDemo: true,
    isActive: true
  });

  const revision = await client.query<Record<string, unknown>>(
    `SELECT id, customer_id AS "customerId", template_version_id AS "templateVersionId",
        revision, status
       FROM customer_configuration_revisions WHERE id = $1`,
    [demoCo2RevisionId]
  );
  assertFixtureFields("Existing CO2 demo configuration revision", revision.rows[0], {
    id: demoCo2RevisionId,
    customerId: demoCo2CustomerId,
    templateVersionId: masterServiceReportV1.id,
    revision: 1,
    status: "active"
  });
  await assertCo2FixtureMembership(client);

  const snapshot = await buildJobConfigurationSnapshot(client, demoCo2CustomerId, demoCo2RevisionId);
  const job = await client.query<Record<string, unknown>>(
    `SELECT id, template_id AS "templateId",
        master_template_version_id AS "masterTemplateVersionId",
        job_reference AS reference, title, status, is_sample AS "isSample",
        customer_id AS "customerId",
        customer_configuration_revision_id AS "configurationRevisionId",
        configuration_snapshot AS snapshot
       FROM inspection_jobs WHERE id = $1`,
    [demoCo2JobId]
  );
  assertFixtureFields("Existing CO2 demo job", job.rows[0], {
    id: demoCo2JobId,
    templateId: null,
    masterTemplateVersionId: masterServiceReportV1.id,
    reference: "DEMO-JOB-CO2-ACCEPT-001",
    title: "Demo CO2 Multi-Zone Job",
    status: "open",
    isSample: true,
    customerId: demoCo2CustomerId,
    configurationRevisionId: demoCo2RevisionId,
    snapshot
  });
}

export async function assertExistingSprinklerFixtureBeforeSeed(client: PoolClient) {
  const footprint = await client.query<{ count: number }>(
    `SELECT (
        (SELECT count(*) FROM customers WHERE id = $1 OR customer_code = $2)
        + (SELECT count(*) FROM customer_configuration_revisions WHERE id = $3)
        + (SELECT count(*) FROM customer_enabled_systems WHERE id = $4)
        + (SELECT count(*) FROM customer_system_zones WHERE enabled_system_id = $4)
        + (SELECT count(*) FROM customer_system_locations WHERE enabled_system_id = $4)
        + (SELECT count(*) FROM inspection_jobs WHERE id = $5 OR job_reference = $6)
      )::integer AS count`,
    [
      demoSprinklerCustomerId,
      demoSprinklerCustomer.code,
      demoSprinklerRevisionId,
      demoSprinklerEnabledSystemId,
      demoSprinklerJobId,
      "DEMO-JOB-SPRINKLER-001"
    ]
  );
  if ((footprint.rows[0]?.count ?? 0) === 0) return;

  const customer = await client.query<Record<string, unknown>>(
    `SELECT id, customer_code AS code, display_name AS name,
        is_demo AS "isDemo", is_active AS "isActive"
       FROM customers WHERE id = $1`,
    [demoSprinklerCustomerId]
  );
  assertFixtureFields("Existing Automatic Sprinkler demo customer", customer.rows[0], {
    id: demoSprinklerCustomerId,
    code: demoSprinklerCustomer.code,
    name: demoSprinklerCustomer.name,
    isDemo: true,
    isActive: true
  });
  const revision = await client.query<Record<string, unknown>>(
    `SELECT id, customer_id AS "customerId", template_version_id AS "templateVersionId",
        revision, status
       FROM customer_configuration_revisions WHERE id = $1`,
    [demoSprinklerRevisionId]
  );
  assertFixtureFields("Existing Automatic Sprinkler demo configuration revision", revision.rows[0], {
    id: demoSprinklerRevisionId,
    customerId: demoSprinklerCustomerId,
    templateVersionId: masterServiceReportV1.id,
    revision: 1,
    status: "active"
  });
  await assertSprinklerFixtureMembership(client);

  const snapshot = await buildJobConfigurationSnapshot(
    client,
    demoSprinklerCustomerId,
    demoSprinklerRevisionId
  );
  const job = await client.query<Record<string, unknown>>(
    `SELECT id, template_id AS "templateId",
        master_template_version_id AS "masterTemplateVersionId",
        job_reference AS reference, title, status, is_sample AS "isSample",
        customer_id AS "customerId",
        customer_configuration_revision_id AS "configurationRevisionId",
        configuration_snapshot AS snapshot
       FROM inspection_jobs WHERE id = $1`,
    [demoSprinklerJobId]
  );
  assertFixtureFields("Existing Automatic Sprinkler demo job", job.rows[0], {
    id: demoSprinklerJobId,
    templateId: null,
    masterTemplateVersionId: masterServiceReportV1.id,
    reference: "DEMO-JOB-SPRINKLER-001",
    title: "Demo Automatic Sprinkler Job",
    status: "open",
    isSample: true,
    customerId: demoSprinklerCustomerId,
    configurationRevisionId: demoSprinklerRevisionId,
    snapshot
  });
}

async function seedDemoJob(
  client: PoolClient,
  values: {
    id: string;
    reference: string;
    title: string;
    customerId: string;
    revisionId: string;
  }
) {
  const snapshot = await buildJobConfigurationSnapshot(
    client,
    values.customerId,
    values.revisionId
  );
  await insertFixture(`Demo job ${values.reference}`, client.query(
    `
      INSERT INTO inspection_jobs (
        id, template_id, master_template_version_id, job_reference, title,
        status, is_sample, customer_id, customer_configuration_revision_id,
        configuration_snapshot
      )
      VALUES ($1, NULL, $2, $3, $4, 'open', true, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      values.id,
      masterServiceReportV1.id,
      values.reference,
      values.title,
      values.customerId,
      values.revisionId,
      JSON.stringify(snapshot)
    ]
  ));
  const verified = await client.query<{ matches: boolean }>(
    `SELECT job_reference = $2 AND title = $3 AND status = 'open' AND is_sample = true
       AND template_id IS NULL
       AND customer_id = $4 AND customer_configuration_revision_id = $5
       AND master_template_version_id = $6 AND configuration_snapshot = $7::jsonb AS matches
     FROM inspection_jobs WHERE id = $1`,
    [
      values.id,
      values.reference,
      values.title,
      values.customerId,
      values.revisionId,
      masterServiceReportV1.id,
      JSON.stringify(snapshot)
    ]
  );
  if (verified.rowCount !== 1 || !verified.rows[0].matches) {
    throw new Error(`Demo job ${values.reference} differs from the deterministic seed`);
  }
  if (values.id === demoCo2JobId) {
    const jobs = await client.query<{ id: string }>(
      `SELECT id FROM inspection_jobs
        WHERE customer_configuration_revision_id = $1
        ORDER BY id`,
      [demoCo2RevisionId]
    );
    if (jobs.rowCount !== 1 || jobs.rows[0]?.id !== demoCo2JobId) {
      throw new Error(`CO2 demo configuration must have exactly its deterministic job; found ${jobs.rowCount}`);
    }
  }
  if (values.id === demoSprinklerJobId) {
    const jobs = await client.query<{ id: string }>(
      `SELECT id FROM inspection_jobs
        WHERE customer_configuration_revision_id = $1
        ORDER BY id`,
      [demoSprinklerRevisionId]
    );
    if (jobs.rowCount !== 1 || jobs.rows[0]?.id !== demoSprinklerJobId) {
      throw new Error(`Automatic Sprinkler demo configuration must have exactly its deterministic job; found ${jobs.rowCount}`);
    }
  }
}

async function seedDemoJobs(client: PoolClient) {
  await seedDemoJob(client, {
    id: demoSingleJobId,
    reference: "DEMO-JOB-SINGLE-001",
    title: "Demo Single-Zone Job",
    customerId: demoSingleCustomerId,
    revisionId: demoSingleRevisionId
  });
  await seedDemoJob(client, {
    id: demoMultiJobId,
    reference: "DEMO-JOB-MULTI-001",
    title: "Demo Multi-Zone Job",
    customerId: demoMultiCustomerId,
    revisionId: demoMultiRevisionId
  });
  await seedDemoJob(client, {
    id: demoCo2JobId,
    reference: "DEMO-JOB-CO2-ACCEPT-001",
    title: "Demo CO2 Multi-Zone Job",
    customerId: demoCo2CustomerId,
    revisionId: demoCo2RevisionId
  });
  await seedDemoJob(client, {
    id: demoSprinklerJobId,
    reference: "DEMO-JOB-SPRINKLER-001",
    title: "Demo Automatic Sprinkler Job",
    customerId: demoSprinklerCustomerId,
    revisionId: demoSprinklerRevisionId
  });
}

export async function seedMasterServiceReport(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seedTemplate(client);
    await assertExistingCo2FixtureBeforeSeed(client);
    await assertExistingSprinklerFixtureBeforeSeed(client);
    await seedDemoConfigurations(client);
    await seedDemoJobs(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
