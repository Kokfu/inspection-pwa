import type { Pool, PoolClient } from "pg";
import { masterServiceReportV1 } from "../inspections/templates/masterServiceReportV1.js";

const demoSingleCustomerId = "00000000-0000-4000-8000-000000000510";
const demoSingleRevisionId = "00000000-0000-4000-8000-000000000511";
const demoMultiCustomerId = "00000000-0000-4000-8000-000000000520";
const demoMultiRevisionId = "00000000-0000-4000-8000-000000000521";
const demoSingleJobId = "00000000-0000-4000-8000-000000000580";
const demoMultiJobId = "00000000-0000-4000-8000-000000000590";

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
  const templateVerified = await client.query<{ matches: boolean }>(
    `SELECT code = $2 AND name = $3 AND version = $4 AND selection_policy = $5
      AND header_definition = $6::jsonb AND report_boilerplate = $7::jsonb AS matches
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
  await client.query(
    `
      INSERT INTO inspection_jobs (
        id, template_id, master_template_version_id, job_reference, title,
        status, is_sample, customer_id, customer_configuration_revision_id,
        configuration_snapshot
      )
      VALUES ($1, NULL, $2, $3, $4, 'open', true, $5, $6, $7)
      ON CONFLICT DO NOTHING
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
  );
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
}

export async function seedMasterServiceReport(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seedTemplate(client);
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
