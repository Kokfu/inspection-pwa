import type { Pool, PoolClient } from "pg";
import { masterServiceReportV1 } from "../inspections/templates/masterServiceReportV1.js";

const demoSingleCustomerId = "00000000-0000-4000-8000-000000000510";
const demoSingleRevisionId = "00000000-0000-4000-8000-000000000511";
const demoMultiCustomerId = "00000000-0000-4000-8000-000000000520";
const demoMultiRevisionId = "00000000-0000-4000-8000-000000000521";

async function seedTemplate(client: PoolClient) {
  await client.query(
    `
      INSERT INTO master_service_report_templates (
        id, code, name, version, selection_policy,
        header_definition, report_boilerplate, publication_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'published')
      ON CONFLICT DO NOTHING
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
  );

  for (const system of masterServiceReportV1.systems) {
    await client.query(
      `
        INSERT INTO master_service_report_systems (
          template_version_id, system_key, display_name,
          sort_order, definition_status, definition
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (template_version_id, system_key) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          sort_order = EXCLUDED.sort_order,
          definition_status = EXCLUDED.definition_status,
          definition = EXCLUDED.definition
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
  }
}

async function seedCustomer(
  client: PoolClient,
  customer: { id: string; code: string; name: string; revisionId: string }
) {
  await client.query(
    `
      INSERT INTO customers (id, customer_code, display_name, is_demo)
      VALUES ($1, $2, $3, true)
      ON CONFLICT DO NOTHING
    `,
    [customer.id, customer.code, customer.name]
  );
  await client.query(
    `
      INSERT INTO customer_configuration_revisions (
        id, customer_id, template_version_id, revision, status
      )
      VALUES ($1, $2, $3, 1, 'active')
      ON CONFLICT DO NOTHING
    `,
    [customer.revisionId, customer.id, masterServiceReportV1.id]
  );
}

async function seedEnabledSystem(
  client: PoolClient,
  id: string,
  revisionId: string,
  systemKey: string,
  sortOrder: number
) {
  await client.query(
    `
      INSERT INTO customer_enabled_systems (
        id, configuration_revision_id, template_version_id, system_key, sort_order
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
    `,
    [id, revisionId, masterServiceReportV1.id, systemKey, sortOrder]
  );
}

async function seedZone(
  client: PoolClient,
  id: string,
  enabledSystemId: string,
  zoneKey: string,
  displayName: string,
  sortOrder: number
) {
  await client.query(
    `
      INSERT INTO customer_system_zones (
        id, enabled_system_id, zone_key, display_name, sort_order
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
    `,
    [id, enabledSystemId, zoneKey, displayName, sortOrder]
  );
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
  await client.query(
    `
      INSERT INTO customer_system_locations (
        id, enabled_system_id, zone_id, location_key, display_name,
        preset_row_count, row_preset, sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT DO NOTHING
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
  );
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
}

export async function seedMasterServiceReport(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seedTemplate(client);
    await seedDemoConfigurations(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
