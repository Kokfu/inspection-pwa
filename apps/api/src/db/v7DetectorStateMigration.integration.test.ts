import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { masterServiceReportV6 } from "../inspections/templates/masterServiceReportV6.js";
import { masterServiceReportV7 } from "../inspections/templates/masterServiceReportV7.js";
import { runMigrations } from "./migrations.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
const v7TemplateId = "00000000-0000-4000-8000-000000000807";
const targetSystemKeys = [
  "fire_alarm_detector",
  "co2_fire_extinguisher",
  "wet_chemical"
] as const;

type PreviousSystem = {
  key: string;
  displayName: string;
  sortOrder: number;
  definitionStatus: string;
};

type PreviousV7Template = {
  id: string;
  code: string;
  name: string;
  version: number;
  selectionPolicy: string;
  header: unknown;
  reportBoilerplate: unknown;
  systems: readonly PreviousSystem[];
};

async function previousCommitV7Template(): Promise<PreviousV7Template> {
  const source = execFileSync(
    "git",
    ["show", "5bc968d:apps/api/src/inspections/templates/masterServiceReportV7.ts"],
    { cwd: process.cwd(), encoding: "utf8" }
  )
    .replace(
      'import { masterServiceReportV6 } from "./masterServiceReportV6.js";',
      `import { masterServiceReportV6 } from ${JSON.stringify(
        pathToFileURL(`${process.cwd()}/src/inspections/templates/masterServiceReportV6.ts`).href
      )};`
    )
    .replace(/^import type .*\n/m, "")
    .replace(" as const satisfies MasterServiceReportDefinition;", ";")
    .replaceAll(": SystemDefinition", "")
    .replaceAll(" as const", "");
  const module = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  return module.masterServiceReportV7 as PreviousV7Template;
}

async function seedPreviousCommitV7(pool: pg.Pool, template: PreviousV7Template) {
  await pool.query(
    `INSERT INTO master_service_report_templates
      (id, code, name, version, selection_policy, header_definition, report_boilerplate, publication_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'published')`,
    [
      template.id,
      template.code,
      template.name,
      template.version,
      template.selectionPolicy,
      JSON.stringify(template.header),
      JSON.stringify(template.reportBoilerplate)
    ]
  );
  for (const system of template.systems) {
    await pool.query(
      `INSERT INTO master_service_report_systems
        (template_version_id, system_key, display_name, sort_order, definition_status, definition)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        template.id,
        system.key,
        system.displayName,
        system.sortOrder,
        system.definitionStatus,
        JSON.stringify(system)
      ]
    );
  }
}

function detectorControls(definition: unknown): string[] {
  if (!definition || typeof definition !== "object") return [];
  const sections = (definition as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((section) => {
    if (!section || typeof section !== "object") return [];
    const blocks = (section as { blocks?: unknown }).blocks;
    if (!Array.isArray(blocks)) return [];
    return blocks.flatMap((block) => {
      if (!block || typeof block !== "object") return [];
      const columns = (block as { columns?: unknown }).columns;
      return Array.isArray(columns)
        ? columns.flatMap((column) =>
          column && typeof column === "object" && typeof (column as { control?: unknown }).control === "string"
            ? [(column as { control: string }).control]
            : []
        )
        : [];
    });
  });
}

function databaseJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

test("migration 019 upgrades the previous commit V7 seed before the current seed assertion", {
  skip: !databaseUrl
}, async () => {
  assert.equal(new URL(databaseUrl!).port, "55432", "upgrade test requires the disposable PostgreSQL port");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool, { seed: false });

    const previous = await previousCommitV7Template();
    await seedPreviousCommitV7(pool, previous);
    const oldRows = await pool.query<{ system_key: string; definition: unknown }>(
      `SELECT system_key, definition
       FROM master_service_report_systems
       WHERE template_version_id = $1 AND system_key = ANY($2::text[])
       ORDER BY system_key`,
      [v7TemplateId, targetSystemKeys]
    );
    assert.equal(oldRows.rowCount, targetSystemKeys.length);
    for (const row of oldRows.rows) {
      assert.ok(detectorControls(row.definition).includes("normal_test_isolation"), `${row.system_key} is the previous single-value contract`);
      assert.ok(!detectorControls(row.definition).includes("normal_test_isolation_multi"));
    }

    // This is the application startup order: migrations first, then the seed's
    // strict published-template assertion. It must not crash-loop an existing runtime.
    await runMigrations(pool);

    const upgradedRows = await pool.query<{ system_key: string; definition: unknown }>(
      `SELECT system_key, definition
       FROM master_service_report_systems
       WHERE template_version_id = $1 AND system_key = ANY($2::text[])
       ORDER BY system_key`,
      [v7TemplateId, targetSystemKeys]
    );
    assert.equal(upgradedRows.rowCount, targetSystemKeys.length);
    for (const row of upgradedRows.rows) {
      const expected = masterServiceReportV7.systems.find((system) => system.key === row.system_key);
      assert.deepEqual(row.definition, databaseJson(expected), `${row.system_key} is upgraded to the current V7 contract`);
      assert.ok(detectorControls(row.definition).includes("normal_test_isolation_multi"));
      assert.ok(!detectorControls(row.definition).includes("normal_test_isolation"));
    }

    const historicalV6 = await pool.query<{ definition: unknown }>(
      `SELECT definition FROM master_service_report_systems
       WHERE template_version_id = $1 AND system_key = 'fire_alarm_detector'`,
      [masterServiceReportV6.id]
    );
    assert.deepEqual(historicalV6.rows[0]?.definition, databaseJson(masterServiceReportV6.systems.find(
      (system) => system.key === "fire_alarm_detector"
    )));
    assert.ok(detectorControls(historicalV6.rows[0]?.definition).includes("normal_test_isolation"));
    assert.ok(!detectorControls(historicalV6.rows[0]?.definition).includes("normal_test_isolation_multi"));
  } finally {
    await pool.end();
  }
});
