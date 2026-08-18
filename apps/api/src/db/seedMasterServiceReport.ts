import type { Pool, PoolClient } from "pg";
import {
  automaticSprinklerPsiEvidencePolicyCode,
  automaticSprinklerPsiEvidencePolicyId,
  automaticSprinklerPsiEvidencePolicySha256,
  automaticSprinklerPsiEvidencePolicyV1
} from "../inspections/evidence/automaticSprinklerPsiEvidencePolicyV1.js";
import { masterServiceReportV1 } from "../inspections/templates/masterServiceReportV1.js";
import { masterServiceReportV2 } from "../inspections/templates/masterServiceReportV2.js";
import { masterServiceReportV3 } from "../inspections/templates/masterServiceReportV3.js";
import { masterServiceReportV4 } from "../inspections/templates/masterServiceReportV4.js";
import { masterServiceReportV5 } from "../inspections/templates/masterServiceReportV5.js";
import { parseDryWetRiserSystemConfiguration } from "../inspections/dryWetRiserConfiguration.js";

const demoRiserCustomerId = "00000000-0000-4000-8000-000000000810";
const demoRiserRevisionId = "00000000-0000-4000-8000-000000000811";
const demoRiserEnabledSystemId = "00000000-0000-4000-8000-000000000812";
const demoRiserJobId = "00000000-0000-4000-8000-000000000819";

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
const demoPhotoSprinklerCustomerId = "00000000-0000-4000-8000-000000000720";
const demoPhotoSprinklerRevisionId = "00000000-0000-4000-8000-000000000721";
const demoPhotoSprinklerEnabledSystemId = "00000000-0000-4000-8000-000000000722";
const demoHydrantCustomerId = "00000000-0000-4000-8000-000000000730";
const demoHydrantRevisionId = "00000000-0000-4000-8000-000000000731";
const demoHydrantEnabledSystemId = "00000000-0000-4000-8000-000000000732";
const demoHydrantZoneId = "00000000-0000-4000-8000-000000000733";
const demoHydrantLocationId = "00000000-0000-4000-8000-000000000734";
const demoSingleJobId = "00000000-0000-4000-8000-000000000580";
const demoMultiJobId = "00000000-0000-4000-8000-000000000590";
const demoCo2JobId = "00000000-0000-4000-8000-000000000679";
const demoSprinklerJobId = "00000000-0000-4000-8000-000000000709";
const demoPhotoSprinklerJobId = "00000000-0000-4000-8000-000000000729";
const demoHydrantJobId = "00000000-0000-4000-8000-000000000739";
const demoWetChemicalCustomerId = "00000000-0000-4000-8000-000000000740";
const demoWetChemicalRevisionId = "00000000-0000-4000-8000-000000000741";
const demoWetChemicalEnabledSystemId = "00000000-0000-4000-8000-000000000742";
const demoWetChemicalZoneId = "00000000-0000-4000-8000-000000000743";
const demoWetChemicalLocationId = "00000000-0000-4000-8000-000000000744";
const demoWetChemicalJobId = "00000000-0000-4000-8000-000000000749";
const demoPortableCustomerId = "00000000-0000-4000-8000-000000000750";
const demoPortableRevisionId = "00000000-0000-4000-8000-000000000751";
const demoPortableEnabledSystemId = "00000000-0000-4000-8000-000000000752";
const demoPortableJobId = "00000000-0000-4000-8000-000000000759";
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
const demoPhotoSprinklerCustomer = {
  id: demoPhotoSprinklerCustomerId,
  code: "DEMO-SPRINKLER-PHOTO",
  name: "Demo Sprinkler Photo Evidence Client",
  revisionId: demoPhotoSprinklerRevisionId
} as const;
const demoHydrantCustomer = {
  id: demoHydrantCustomerId,
  code: "DEMO-HYDRANT",
  name: "Demo Hydrant Client",
  revisionId: demoHydrantRevisionId
} as const;
const demoWetChemicalCustomer = {
  id: demoWetChemicalCustomerId,
  code: "DEMO-WET-CHEMICAL",
  name: "Demo Wet Chemical Client",
  revisionId: demoWetChemicalRevisionId
} as const;
const demoPortableCustomer = {
  id: demoPortableCustomerId,
  code: "DEMO-PORTABLE-FIRE-EXTINGUISHER",
  name: "Demo Portable Fire Extinguisher",
  revisionId: demoPortableRevisionId
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
    .filter(([, child]) => child !== undefined)
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

type MasterServiceReportTemplate = typeof masterServiceReportV1 | typeof masterServiceReportV2 | typeof masterServiceReportV3 | typeof masterServiceReportV4 | typeof masterServiceReportV5;

async function assertPublishedMasterServiceReportTemplateMetadata(
  client: PoolClient,
  label: string,
  template: MasterServiceReportTemplate
) {
  const storedTemplate = await client.query<Record<string, unknown>>(
    `
      SELECT
        id,
        code,
        name,
        version,
        selection_policy AS "selectionPolicy",
        header_definition AS "headerDefinition",
        report_boilerplate AS "reportBoilerplate",
        publication_status AS "publicationStatus"
      FROM master_service_report_templates
      WHERE id = $1
    `,
    [template.id]
  );
  assertFixtureFields(`${label} template`, storedTemplate.rows[0], {
    id: template.id,
    code: template.code,
    name: template.name,
    version: template.version,
    selectionPolicy: template.selectionPolicy,
    headerDefinition: template.header,
    reportBoilerplate: template.reportBoilerplate,
    publicationStatus: "published"
  });
}

export async function assertPublishedMasterServiceReportTemplate(
  client: PoolClient,
  label: string,
  template: MasterServiceReportTemplate
) {
  await assertPublishedMasterServiceReportTemplateMetadata(client, label, template);
  const storedSystems = await client.query<Record<string, unknown>>(
    `
      SELECT
        template_version_id AS "templateId",
        system_key AS "key",
        display_name AS "displayName",
        sort_order AS "sortOrder",
        definition_status AS "definitionStatus",
        definition
      FROM master_service_report_systems
      WHERE template_version_id = $1
      ORDER BY sort_order, system_key
    `,
    [template.id]
  );
  const expectedSystems = template.systems
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key));
  if (storedSystems.rowCount !== expectedSystems.length) {
    throw new Error(`${label} system membership differs from the tracked definition`);
  }
  storedSystems.rows.forEach((system, index) => {
    const expected = expectedSystems[index];
    assertFixtureFields(`${label} system ${expected.key}`, system, {
      templateId: template.id,
      key: expected.key,
      displayName: expected.displayName,
      sortOrder: expected.sortOrder,
      definitionStatus: expected.definitionStatus,
      definition: expected
    });
  });
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
  evidencePolicyId: string | null;
  evidencePolicyCode: string | null;
  evidencePolicyVersion: number | null;
  evidencePolicySchemaVersion: number | null;
  evidencePolicyDefinition: unknown;
  evidencePolicySha256: string | null;
  systemConfiguration: unknown;
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

  await insertFixture("Published Master V2 template", client.query(`INSERT INTO master_service_report_templates (id, code, name, version, selection_policy, header_definition, report_boilerplate, publication_status) VALUES ($1,$2,$3,$4,$5,$6,$7,'published') ON CONFLICT (id) DO NOTHING`, [masterServiceReportV2.id, masterServiceReportV2.code, masterServiceReportV2.name, masterServiceReportV2.version, masterServiceReportV2.selectionPolicy, JSON.stringify(masterServiceReportV2.header), JSON.stringify(masterServiceReportV2.reportBoilerplate)]));
  await assertPublishedMasterServiceReportTemplateMetadata(client, "Published Master V2", masterServiceReportV2);
  for (const system of masterServiceReportV2.systems) {
    await client.query(`INSERT INTO master_service_report_systems (template_version_id, system_key, display_name, sort_order, definition_status, definition) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (template_version_id, system_key) DO NOTHING`, [masterServiceReportV2.id, system.key, system.displayName, system.sortOrder, system.definitionStatus, JSON.stringify(system)]);
    const verified = await client.query<{ matches: boolean }>(`SELECT display_name=$3 AND sort_order=$4 AND definition_status=$5 AND definition=$6::jsonb AS matches FROM master_service_report_systems WHERE template_version_id=$1 AND system_key=$2`, [masterServiceReportV2.id, system.key, system.displayName, system.sortOrder, system.definitionStatus, JSON.stringify(system)]);
    if (verified.rowCount !== 1 || !verified.rows[0].matches) throw new Error(`Published Master V2 system ${system.key} differs from the tracked definition`);
  }
  await assertPublishedMasterServiceReportTemplate(client, "Published Master V2", masterServiceReportV2);

  await insertFixture("Published Master V3 template", client.query(
    `INSERT INTO master_service_report_templates
      (id, code, name, version, selection_policy, header_definition, report_boilerplate, publication_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'published') ON CONFLICT (id) DO NOTHING`,
    [masterServiceReportV3.id, masterServiceReportV3.code, masterServiceReportV3.name,
      masterServiceReportV3.version, masterServiceReportV3.selectionPolicy,
      JSON.stringify(masterServiceReportV3.header), JSON.stringify(masterServiceReportV3.reportBoilerplate)]
  ));
  await assertPublishedMasterServiceReportTemplateMetadata(client, "Published Master V3", masterServiceReportV3);
  for (const system of masterServiceReportV3.systems) {
    await client.query(
      `INSERT INTO master_service_report_systems
        (template_version_id, system_key, display_name, sort_order, definition_status, definition)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (template_version_id, system_key) DO NOTHING`,
      [masterServiceReportV3.id, system.key, system.displayName, system.sortOrder,
        system.definitionStatus, JSON.stringify(system)]
    );
  }
  await assertPublishedMasterServiceReportTemplate(client, "Published Master V3", masterServiceReportV3);
  await insertFixture("Published Master V4 template", client.query(
    `INSERT INTO master_service_report_templates
      (id, code, name, version, selection_policy, header_definition, report_boilerplate, publication_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'published') ON CONFLICT (id) DO NOTHING`,
    [masterServiceReportV4.id, masterServiceReportV4.code, masterServiceReportV4.name,
      masterServiceReportV4.version, masterServiceReportV4.selectionPolicy,
      JSON.stringify(masterServiceReportV4.header), JSON.stringify(masterServiceReportV4.reportBoilerplate)]
  ));
  await assertPublishedMasterServiceReportTemplateMetadata(client, "Published Master V4", masterServiceReportV4);
  for (const system of masterServiceReportV4.systems) {
    await client.query(
      `INSERT INTO master_service_report_systems
        (template_version_id, system_key, display_name, sort_order, definition_status, definition)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (template_version_id, system_key) DO NOTHING`,
      [masterServiceReportV4.id, system.key, system.displayName, system.sortOrder,
        system.definitionStatus, JSON.stringify(system)]
    );
  }
  await assertPublishedMasterServiceReportTemplate(client, "Published Master V4", masterServiceReportV4);
  await insertFixture("Published Master V5 template", client.query(
    `INSERT INTO master_service_report_templates (id,code,name,version,selection_policy,header_definition,report_boilerplate,publication_status) VALUES ($1,$2,$3,$4,$5,$6,$7,'published') ON CONFLICT (id) DO NOTHING`,
    [masterServiceReportV5.id, masterServiceReportV5.code, masterServiceReportV5.name, masterServiceReportV5.version, masterServiceReportV5.selectionPolicy, JSON.stringify(masterServiceReportV5.header), JSON.stringify(masterServiceReportV5.reportBoilerplate)]
  ));
  await assertPublishedMasterServiceReportTemplateMetadata(client, "Published Master V5", masterServiceReportV5);
  for (const system of masterServiceReportV5.systems) await client.query(
    `INSERT INTO master_service_report_systems (template_version_id,system_key,display_name,sort_order,definition_status,definition) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (template_version_id,system_key) DO NOTHING`,
    [masterServiceReportV5.id, system.key, system.displayName, system.sortOrder, system.definitionStatus, JSON.stringify(system)]
  );
  await assertPublishedMasterServiceReportTemplate(client, "Published Master V5", masterServiceReportV5);
}

async function seedDryWetRiserFixture(client: PoolClient) {
  await insertFixture("Dry Wet Riser customer", client.query(`INSERT INTO customers (id,customer_code,display_name,is_demo) VALUES ($1,'DEMO-DRY-WET-RISER','Demo Dry Wet Riser Client',true) ON CONFLICT (id) DO NOTHING`, [demoRiserCustomerId]));
  await insertFixture("Dry Wet Riser revision", client.query(`INSERT INTO customer_configuration_revisions (id,customer_id,template_version_id,revision,status) VALUES ($1,$2,$3,1,'active') ON CONFLICT (id) DO NOTHING`, [demoRiserRevisionId,demoRiserCustomerId,masterServiceReportV2.id]));
  await insertFixture("Dry Wet Riser enabled system", client.query(`INSERT INTO customer_enabled_systems (id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES ($1,$2,$3,'dry_wet_riser',1,$4) ON CONFLICT (id) DO NOTHING`, [demoRiserEnabledSystemId,demoRiserRevisionId,masterServiceReportV2.id,JSON.stringify({riserMode:"dry"})]));
  const locations = [["00000000-0000-4000-8000-000000000813","ground","Block A / Ground Floor",2,"DW-001"],["00000000-0000-4000-8000-000000000814","first","Block A / First Floor",1,"DW-003"]] as const;
  for (const [id,key,name,count,asset] of locations) await insertFixture(`Dry Wet Riser location ${name}`, client.query(`INSERT INTO customer_system_locations (id,enabled_system_id,zone_id,location_key,display_name,preset_row_count,row_preset,sort_order) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`, [id,demoRiserEnabledSystemId,key,name,count,JSON.stringify({assetReference:asset}), count === 2 ? 1 : 2]));
  const snapshot = await buildJobConfigurationSnapshot(client,demoRiserCustomerId,demoRiserRevisionId);
  await insertFixture("Dry Wet Riser job", client.query(`INSERT INTO inspection_jobs (id,template_id,master_template_version_id,job_reference,title,status,is_sample,customer_id,customer_configuration_revision_id,configuration_snapshot) VALUES ($1,NULL,$2,'DEMO-JOB-DRY-WET-RISER-001','Demo Dry Wet Riser Job','open',true,$3,$4,$5) ON CONFLICT (id) DO NOTHING`, [demoRiserJobId,masterServiceReportV2.id,demoRiserCustomerId,demoRiserRevisionId,JSON.stringify(snapshot)]));
  const check = await client.query<{ count:number }>(`SELECT count(*)::int AS count FROM customer_system_locations WHERE enabled_system_id=$1`,[demoRiserEnabledSystemId]);
  if (check.rows[0]?.count !== 2) throw new Error("Dry Wet Riser fixture has an incomplete location set");
  await assertDryWetRiserFixture(client, snapshot);
}

export async function assertDryWetRiserFixture(client: PoolClient, snapshot: unknown) {
  const customer = await client.query<Record<string, unknown>>(`SELECT id,customer_code AS code,display_name AS name,is_demo AS "isDemo",is_active AS "isActive" FROM customers WHERE id=$1`, [demoRiserCustomerId]);
  assertFixtureFields("Dry Wet Riser customer", customer.rows[0], { id: demoRiserCustomerId, code: "DEMO-DRY-WET-RISER", name: "Demo Dry Wet Riser Client", isDemo: true, isActive: true });
  const revision = await client.query<Record<string, unknown>>(`SELECT id,customer_id AS "customerId",template_version_id AS "templateVersionId",revision,status FROM customer_configuration_revisions WHERE id=$1`, [demoRiserRevisionId]);
  assertFixtureFields("Dry Wet Riser revision", revision.rows[0], { id: demoRiserRevisionId, customerId: demoRiserCustomerId, templateVersionId: masterServiceReportV2.id, revision: 1, status: "active" });
  const enabled = await client.query<Record<string, unknown>>(`SELECT id,configuration_revision_id AS "revisionId",template_version_id AS "templateId",system_key AS "systemKey",sort_order AS "sortOrder",evidence_policy_id AS "evidencePolicyId",system_configuration AS "systemConfiguration" FROM customer_enabled_systems WHERE id=$1`, [demoRiserEnabledSystemId]);
  assertFixtureFields("Dry Wet Riser enabled system", enabled.rows[0], { id: demoRiserEnabledSystemId, revisionId: demoRiserRevisionId, templateId: masterServiceReportV2.id, systemKey: "dry_wet_riser", sortOrder: 1, evidencePolicyId: null, systemConfiguration: { riserMode: "dry" } });
  if (!parseDryWetRiserSystemConfiguration(enabled.rows[0]?.systemConfiguration)) throw new Error("Dry Wet Riser fixture configuration has unsupported keys");
  const membership = await client.query<{ enabled: number; zones: number; locations: number; jobs: number }>(`SELECT (SELECT count(*)::int FROM customer_enabled_systems WHERE configuration_revision_id=$1) AS enabled,(SELECT count(*)::int FROM customer_system_zones WHERE enabled_system_id=$2) AS zones,(SELECT count(*)::int FROM customer_system_locations WHERE enabled_system_id=$2) AS locations,(SELECT count(*)::int FROM inspection_jobs WHERE customer_configuration_revision_id=$1) AS jobs`, [demoRiserRevisionId, demoRiserEnabledSystemId]);
  if (!membership.rows[0] || membership.rows[0].enabled !== 1 || membership.rows[0].zones !== 0 || membership.rows[0].locations !== 2 || membership.rows[0].jobs !== 1) throw new Error("Dry Wet Riser fixture has unexpected members");
  const locations = await client.query<Record<string, unknown>>(`SELECT id,zone_id AS "zoneId",location_key AS key,display_name AS "displayName",preset_row_count AS "presetRowCount",row_preset AS "rowPreset",sort_order AS "sortOrder" FROM customer_system_locations WHERE enabled_system_id=$1 ORDER BY sort_order`, [demoRiserEnabledSystemId]);
  const expectedLocations = [{ id: "00000000-0000-4000-8000-000000000813", zoneId: null, key: "ground", displayName: "Block A / Ground Floor", presetRowCount: 2, rowPreset: { assetReference: "DW-001" }, sortOrder: 1 }, { id: "00000000-0000-4000-8000-000000000814", zoneId: null, key: "first", displayName: "Block A / First Floor", presetRowCount: 1, rowPreset: { assetReference: "DW-003" }, sortOrder: 2 }];
  if (locations.rowCount !== expectedLocations.length) throw new Error("Dry Wet Riser fixture locations differ from the deterministic set");
  locations.rows.forEach((row, index) => assertFixtureFields(`Dry Wet Riser location ${index + 1}`, row, expectedLocations[index]));
  const definition = await client.query<Record<string, unknown>>(`SELECT definition_status AS "definitionStatus",definition FROM master_service_report_systems WHERE template_version_id=$1 AND system_key='dry_wet_riser'`, [masterServiceReportV2.id]);
  assertFixtureFields("Dry Wet Riser V2 definition", definition.rows[0], { definitionStatus: "confirmed", definition: masterServiceReportV2.systems[0] });
  const job = await client.query<Record<string, unknown>>(`SELECT id,master_template_version_id AS "templateId",job_reference AS reference,title,status,is_sample AS "isSample",customer_id AS "customerId",customer_configuration_revision_id AS "revisionId",configuration_snapshot AS snapshot FROM inspection_jobs WHERE id=$1`, [demoRiserJobId]);
  assertFixtureFields("Dry Wet Riser job", job.rows[0], { id: demoRiserJobId, templateId: masterServiceReportV2.id, reference: "DEMO-JOB-DRY-WET-RISER-001", title: "Demo Dry Wet Riser Job", status: "open", isSample: true, customerId: demoRiserCustomerId, revisionId: demoRiserRevisionId, snapshot });
}

async function seedCustomer(
  client: PoolClient,
  customer: { id: string; code: string; name: string; revisionId: string },
  templateVersionId: string = masterServiceReportV1.id
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
    [customer.revisionId, customer.id, templateVersionId]
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
    templateVersionId,
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

async function seedEvidencePolicy(client: PoolClient) {
  await insertFixture("Automatic Sprinkler PSI Evidence Policy V1", client.query(
    `
      INSERT INTO inspection_evidence_policies (
        id, code, version, schema_version, system_key, definition,
        definition_sha256, publication_status
      )
      VALUES ($1, $2, 1, 1, 'automatic_sprinkler', $3, $4, 'published')
      ON CONFLICT (id) DO NOTHING
    `,
    [
      automaticSprinklerPsiEvidencePolicyId,
      automaticSprinklerPsiEvidencePolicyCode,
      JSON.stringify(automaticSprinklerPsiEvidencePolicyV1),
      automaticSprinklerPsiEvidencePolicySha256
    ]
  ));
  const stored = await client.query<Record<string, unknown>>(
    `SELECT id, code, version, schema_version AS "schemaVersion",
        system_key AS "systemKey", definition,
        definition_sha256 AS "definitionSha256",
        publication_status AS "publicationStatus"
       FROM inspection_evidence_policies WHERE id = $1`,
    [automaticSprinklerPsiEvidencePolicyId]
  );
  assertFixtureFields("Automatic Sprinkler PSI Evidence Policy V1", stored.rows[0], {
    id: automaticSprinklerPsiEvidencePolicyId,
    code: automaticSprinklerPsiEvidencePolicyCode,
    version: 1,
    schemaVersion: 1,
    systemKey: "automatic_sprinkler",
    definition: automaticSprinklerPsiEvidencePolicyV1,
    definitionSha256: automaticSprinklerPsiEvidencePolicySha256,
    publicationStatus: "published"
  });
}

async function seedEnabledSystem(
  client: PoolClient,
  id: string,
  revisionId: string,
  systemKey: string,
  sortOrder: number,
  evidencePolicyId: string | null = null,
  templateVersionId: string = masterServiceReportV1.id
) {
  await insertFixture(`Demo enabled system ${id}`, client.query(
    `
      INSERT INTO customer_enabled_systems (
        id, configuration_revision_id, template_version_id, system_key, sort_order,
        evidence_policy_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO NOTHING
    `,
    [id, revisionId, templateVersionId, systemKey, sortOrder, evidencePolicyId]
  ));
  const stored = await client.query<Record<string, unknown>>(
    `SELECT enabled.id, enabled.configuration_revision_id AS "configurationRevisionId",
        enabled.template_version_id AS "templateVersionId", enabled.system_key AS "systemKey",
        enabled.sort_order AS "sortOrder", system.definition_status AS "definitionStatus",
        enabled.evidence_policy_id AS "evidencePolicyId"
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
    templateVersionId,
    systemKey,
    sortOrder,
    definitionStatus: "confirmed",
    evidencePolicyId
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

async function assertPhotoSprinklerFixtureMembership(client: PoolClient) {
  const enabledSystems = await client.query<Record<string, unknown>>(
    `SELECT enabled.id, enabled.configuration_revision_id AS "configurationRevisionId",
        enabled.template_version_id AS "templateVersionId", enabled.system_key AS "systemKey",
        enabled.sort_order AS "sortOrder", system.definition_status AS "definitionStatus",
        enabled.evidence_policy_id AS "evidencePolicyId"
       FROM customer_enabled_systems enabled
       INNER JOIN master_service_report_systems system
         ON system.template_version_id = enabled.template_version_id
        AND system.system_key = enabled.system_key
       WHERE enabled.configuration_revision_id = $1
       ORDER BY enabled.sort_order, enabled.id`,
    [demoPhotoSprinklerRevisionId]
  );
  if (enabledSystems.rowCount !== 1) {
    throw new Error(
      `Photo-enabled sprinkler configuration must contain exactly one enabled system; found ${enabledSystems.rowCount}`
    );
  }
  assertFixtureFields("Photo-enabled sprinkler system membership", enabledSystems.rows[0], {
    id: demoPhotoSprinklerEnabledSystemId,
    configurationRevisionId: demoPhotoSprinklerRevisionId,
    templateVersionId: masterServiceReportV1.id,
    systemKey: "automatic_sprinkler",
    sortOrder: 1,
    definitionStatus: "confirmed",
    evidencePolicyId: automaticSprinklerPsiEvidencePolicyId
  });

  const counts = await client.query<{ zones: number; locations: number }>(
    `SELECT
      (SELECT count(*)::integer FROM customer_system_zones WHERE enabled_system_id = $1) AS zones,
      (SELECT count(*)::integer FROM customer_system_locations WHERE enabled_system_id = $1) AS locations`,
    [demoPhotoSprinklerEnabledSystemId]
  );
  if (counts.rows[0]?.zones !== 0 || counts.rows[0]?.locations !== 0) {
    throw new Error("Photo-enabled sprinkler configuration must have zero zones and zero locations");
  }
}

async function seedDemoConfigurations(client: PoolClient) {
  await seedEvidencePolicy(client);
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
  await seedCustomer(client, demoPhotoSprinklerCustomer);
  await seedCustomer(client, demoHydrantCustomer);
  await seedCustomer(client, demoWetChemicalCustomer, masterServiceReportV4.id);
  await seedCustomer(client, demoPortableCustomer, masterServiceReportV5.id);

  // Sites are minimal master data for the service-visit demo. They are
  // independent of jobs so later visits can reuse the same customer/site.
  const demoSites = [
    ["00000000-0000-4000-8000-000000000820", demoRiserCustomerId],
    ["00000000-0000-4000-8000-000000000561", demoSingleCustomerId],
    ["00000000-0000-4000-8000-000000000562", demoMultiCustomerId],
    ["00000000-0000-4000-8000-000000000663", demoCo2CustomerId],
    ["00000000-0000-4000-8000-000000000703", demoSprinklerCustomerId],
    ["00000000-0000-4000-8000-000000000723", demoPhotoSprinklerCustomerId],
    ["00000000-0000-4000-8000-000000000735", demoHydrantCustomerId],
    ["00000000-0000-4000-8000-000000000745", demoWetChemicalCustomerId],
    ["00000000-0000-4000-8000-000000000755", demoPortableCustomerId]
  ] as const;
  for (const [id, customerId] of demoSites) {
    await seedSite(client, { id, customerId, code: "PRIMARY", name: "Primary Service Site" });
  }

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
  await seedEnabledSystem(
    client,
    demoPhotoSprinklerEnabledSystemId,
    demoPhotoSprinklerRevisionId,
    "automatic_sprinkler",
    1,
    automaticSprinklerPsiEvidencePolicyId
  );
  await assertPhotoSprinklerFixtureMembership(client);
  await seedEnabledSystem(client, demoHydrantEnabledSystemId, demoHydrantRevisionId, "hydrant", 1);
  await seedZone(client, demoHydrantZoneId, demoHydrantEnabledSystemId, "hydrant-zone-a", "Hydrant Zone A", 1);
  await seedLocation(client, {
    id: demoHydrantLocationId,
    enabledSystemId: demoHydrantEnabledSystemId,
    zoneId: demoHydrantZoneId,
    key: "hydrant-main",
    name: "Main Hydrant Bank",
    rowCount: 2,
    assetReference: "HYD-DEMO-01",
    sortOrder: 1
  });
  await seedEnabledSystem(
    client, demoWetChemicalEnabledSystemId, demoWetChemicalRevisionId,
    "wet_chemical", 1, null, masterServiceReportV4.id
  );
  await seedZone(client, demoWetChemicalZoneId, demoWetChemicalEnabledSystemId, "kitchen-a", "Kitchen A", 1);
  await seedLocation(client, {
    id: demoWetChemicalLocationId,
    enabledSystemId: demoWetChemicalEnabledSystemId,
    zoneId: demoWetChemicalZoneId,
    key: "kitchen-hood-a",
    name: "Kitchen Hood A",
    rowCount: 1,
    assetReference: "WC-01",
    sortOrder: 1
  });
  await seedEnabledSystem(client, demoPortableEnabledSystemId, demoPortableRevisionId, "portable_fire_extinguisher", 1, null, masterServiceReportV5.id);
}

async function seedSite(
  client: PoolClient,
  site: { id: string; customerId: string; code: string; name: string }
) {
  await insertFixture(`Demo site ${site.id}`, client.query(
    `INSERT INTO customer_sites (id, customer_id, site_code, display_name, is_active)
     VALUES ($1, $2, $3, $4, true) ON CONFLICT (id) DO NOTHING`,
    [site.id, site.customerId, site.code, site.name]
  ));
  const stored = await client.query<Record<string, unknown>>(
    `SELECT id, customer_id AS "customerId", site_code AS code,
      display_name AS name, is_active AS "isActive"
     FROM customer_sites WHERE id = $1`, [site.id]
  );
  assertFixtureFields(`Demo site ${site.id}`, stored.rows[0], {
    id: site.id, customerId: site.customerId, code: site.code, name: site.name, isActive: true
  });
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
        system.definition_status AS "definitionStatus",
        policy.id AS "evidencePolicyId",
        policy.code AS "evidencePolicyCode",
        policy.version AS "evidencePolicyVersion",
        policy.schema_version AS "evidencePolicySchemaVersion",
        policy.definition AS "evidencePolicyDefinition",
        policy.definition_sha256 AS "evidencePolicySha256"
        ,enabled.system_configuration AS "systemConfiguration"
      FROM customer_enabled_systems enabled
      INNER JOIN master_service_report_systems system
        ON system.template_version_id = enabled.template_version_id
       AND system.system_key = enabled.system_key
      LEFT JOIN inspection_evidence_policies policy
        ON policy.id = enabled.evidence_policy_id
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
  for (const system of systemsResult.rows) {
    if (system.systemKey === "dry_wet_riser") {
      if (!parseDryWetRiserSystemConfiguration(system.systemConfiguration)) {
        throw new Error("Dry/Wet Riser V2 configuration requires exactly riserMode dry or wet");
      }
    }
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
    enabledSystems: systemsResult.rows.map((system) => {
      const {
        evidencePolicyId,
        evidencePolicyCode,
        evidencePolicyVersion,
        evidencePolicySchemaVersion,
        evidencePolicyDefinition,
        evidencePolicySha256,
        systemConfiguration,
        ...baseSystem
      } = system;
      return {
        ...baseSystem,
        ...(baseSystem.systemKey === "dry_wet_riser" ? { systemConfiguration: parseDryWetRiserSystemConfiguration(systemConfiguration) } : {}),
        ...(evidencePolicyId ? {
          evidencePolicy: {
            id: evidencePolicyId,
            code: evidencePolicyCode,
            version: evidencePolicyVersion,
            schemaVersion: evidencePolicySchemaVersion,
            definition: evidencePolicyDefinition,
            definitionSha256: evidencePolicySha256
          }
        } : {}),
        zones: zonesResult.rows.filter((zone) => zone.enabledSystemId === system.enabledSystemId),
        locations: locationsResult.rows.filter(
          (location) => location.enabledSystemId === system.enabledSystemId
        )
      };
    })
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
        job_reference AS reference, title, is_sample AS "isSample",
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
        job_reference AS reference, title, is_sample AS "isSample",
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
    isSample: true,
    customerId: demoSprinklerCustomerId,
    configurationRevisionId: demoSprinklerRevisionId,
    snapshot
  });
}

async function assertExistingPhotoSprinklerFixtureBeforeSeed(client: PoolClient) {
  const footprint = await client.query<{ count: number }>(
    `SELECT (
        (SELECT count(*) FROM inspection_evidence_policies
          WHERE id = $1 OR (code = $2 AND version = 1))
        + (SELECT count(*) FROM customers WHERE id = $3 OR customer_code = $4)
        + (SELECT count(*) FROM customer_configuration_revisions WHERE id = $5)
        + (SELECT count(*) FROM customer_enabled_systems WHERE id = $6)
        + (SELECT count(*) FROM customer_system_zones WHERE enabled_system_id = $6)
        + (SELECT count(*) FROM customer_system_locations WHERE enabled_system_id = $6)
        + (SELECT count(*) FROM inspection_jobs WHERE id = $7 OR job_reference = $8)
      )::integer AS count`,
    [
      automaticSprinklerPsiEvidencePolicyId,
      automaticSprinklerPsiEvidencePolicyCode,
      demoPhotoSprinklerCustomerId,
      demoPhotoSprinklerCustomer.code,
      demoPhotoSprinklerRevisionId,
      demoPhotoSprinklerEnabledSystemId,
      demoPhotoSprinklerJobId,
      "DEMO-JOB-SPRINKLER-PHOTO-001"
    ]
  );
  if ((footprint.rows[0]?.count ?? 0) === 0) return;

  const policy = await client.query<Record<string, unknown>>(
    `SELECT id, code, version, schema_version AS "schemaVersion",
        system_key AS "systemKey", definition,
        definition_sha256 AS "definitionSha256",
        publication_status AS "publicationStatus"
       FROM inspection_evidence_policies WHERE id = $1`,
    [automaticSprinklerPsiEvidencePolicyId]
  );
  assertFixtureFields("Existing Automatic Sprinkler PSI Evidence Policy V1", policy.rows[0], {
    id: automaticSprinklerPsiEvidencePolicyId,
    code: automaticSprinklerPsiEvidencePolicyCode,
    version: 1,
    schemaVersion: 1,
    systemKey: "automatic_sprinkler",
    definition: automaticSprinklerPsiEvidencePolicyV1,
    definitionSha256: automaticSprinklerPsiEvidencePolicySha256,
    publicationStatus: "published"
  });

  const customer = await client.query<Record<string, unknown>>(
    `SELECT id, customer_code AS code, display_name AS name,
        is_demo AS "isDemo", is_active AS "isActive"
       FROM customers WHERE id = $1`,
    [demoPhotoSprinklerCustomerId]
  );
  assertFixtureFields("Existing photo-enabled sprinkler customer", customer.rows[0], {
    id: demoPhotoSprinklerCustomerId,
    code: demoPhotoSprinklerCustomer.code,
    name: demoPhotoSprinklerCustomer.name,
    isDemo: true,
    isActive: true
  });

  const revision = await client.query<Record<string, unknown>>(
    `SELECT id, customer_id AS "customerId", template_version_id AS "templateVersionId",
        revision, status FROM customer_configuration_revisions WHERE id = $1`,
    [demoPhotoSprinklerRevisionId]
  );
  assertFixtureFields("Existing photo-enabled sprinkler configuration", revision.rows[0], {
    id: demoPhotoSprinklerRevisionId,
    customerId: demoPhotoSprinklerCustomerId,
    templateVersionId: masterServiceReportV1.id,
    revision: 1,
    status: "active"
  });
  await assertPhotoSprinklerFixtureMembership(client);

  const snapshot = await buildJobConfigurationSnapshot(
    client,
    demoPhotoSprinklerCustomerId,
    demoPhotoSprinklerRevisionId
  );
  const job = await client.query<Record<string, unknown>>(
    `SELECT id, template_id AS "templateId",
        master_template_version_id AS "masterTemplateVersionId",
        job_reference AS reference, title, status, is_sample AS "isSample",
        customer_id AS "customerId",
        customer_configuration_revision_id AS "configurationRevisionId",
        configuration_snapshot AS snapshot
       FROM inspection_jobs WHERE id = $1`,
    [demoPhotoSprinklerJobId]
  );
  assertFixtureFields("Existing photo-enabled sprinkler job", job.rows[0], {
    id: demoPhotoSprinklerJobId,
    templateId: null,
    masterTemplateVersionId: masterServiceReportV1.id,
    reference: "DEMO-JOB-SPRINKLER-PHOTO-001",
    title: "Demo Automatic Sprinkler Photo Evidence Job",
    status: "open",
    isSample: true,
    customerId: demoPhotoSprinklerCustomerId,
    configurationRevisionId: demoPhotoSprinklerRevisionId,
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
    templateVersionId?: string;
  }
) {
  const templateVersionId = values.templateVersionId ?? masterServiceReportV1.id;
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
      templateVersionId,
      values.reference,
      values.title,
      values.customerId,
      values.revisionId,
      JSON.stringify(snapshot)
    ]
  ));
  const verified = await client.query<{ matches: boolean }>(
    `SELECT job_reference = $2 AND title = $3 AND is_sample = true
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
      templateVersionId,
      JSON.stringify(snapshot)
    ]
  );
  if (verified.rowCount !== 1 || !verified.rows[0].matches) {
    throw new Error(`Demo job ${values.reference} differs from the deterministic seed`);
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
  await seedDemoJob(client, {
    id: demoPhotoSprinklerJobId,
    reference: "DEMO-JOB-SPRINKLER-PHOTO-001",
    title: "Demo Automatic Sprinkler Photo Evidence Job",
    customerId: demoPhotoSprinklerCustomerId,
    revisionId: demoPhotoSprinklerRevisionId
  });
  await seedDemoJob(client, {
    id: demoHydrantJobId,
    reference: "DEMO-JOB-HYDRANT-001",
    title: "Demo Hydrant Job",
    customerId: demoHydrantCustomerId,
    revisionId: demoHydrantRevisionId
  });
  await seedDemoJob(client, {
    id: demoWetChemicalJobId,
    reference: "DEMO-JOB-WET-CHEMICAL-001",
    title: "Demo Wet Chemical Job",
    customerId: demoWetChemicalCustomerId,
    revisionId: demoWetChemicalRevisionId,
    templateVersionId: masterServiceReportV4.id
  });
  await seedDemoJob(client, {
    id: demoPortableJobId,
    reference: "DEMO-JOB-PORTABLE-FIRE-EXTINGUISHER-001",
    title: "Portable Fire Extinguisher",
    customerId: demoPortableCustomerId,
    revisionId: demoPortableRevisionId,
    templateVersionId: masterServiceReportV5.id
  });
}

export async function seedMasterServiceReport(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seedTemplate(client);
    await seedDryWetRiserFixture(client);
    await assertExistingCo2FixtureBeforeSeed(client);
    await assertExistingSprinklerFixtureBeforeSeed(client);
    await assertExistingPhotoSprinklerFixtureBeforeSeed(client);
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
