import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireRole } from "../middleware/requireRole.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TemplateRow = {
  id: string;
  code: string;
  name: string;
  version: number;
  selectionPolicy: "preset_only";
  headerDefinition: unknown;
  reportBoilerplate: unknown;
};

type SystemRow = {
  key: string;
  displayName: string;
  sortOrder: number;
  definitionStatus: "confirmed" | "requires_confirmation";
  definition: unknown;
};

type CustomerRow = {
  id: string;
  code: string;
  displayName: string;
  isDemo: boolean;
};

type ConfigurationRow = {
  configurationId: string;
  revision: number;
  templateId: string;
  templateCode: string;
  templateName: string;
  templateVersion: number;
  selectionPolicy: "preset_only";
};

type EnabledSystemRow = {
  id: string;
  key: string;
  displayName: string;
  sortOrder: number;
  definitionStatus: "confirmed";
};

type ZoneRow = {
  id: string;
  enabledSystemId: string;
  key: string;
  displayName: string;
  sortOrder: number;
};

type LocationRow = {
  id: string;
  enabledSystemId: string;
  zoneId: string | null;
  key: string;
  displayName: string;
  presetRowCount: number;
  rowPreset: unknown;
  sortOrder: number;
};

export const inspectionReferenceRouter = Router();

inspectionReferenceRouter.get(
  "/inspection-catalog",
  requireRole("admin", "inspector"),
  async (_request, response, next) => {
    try {
      const templateResult = await pool.query<TemplateRow>(`
        SELECT
          id,
          code,
          name,
          version,
          selection_policy AS "selectionPolicy",
          header_definition AS "headerDefinition",
          report_boilerplate AS "reportBoilerplate"
        FROM master_service_report_templates
        WHERE code = 'MFE-FSSR'
          AND version = 1
          AND publication_status = 'published'
        LIMIT 1
      `);
      const template = templateResult.rows[0];
      if (!template) {
        response.status(404).json({ error: "INSPECTION_CATALOG_NOT_FOUND" });
        return;
      }

      const systemsResult = await pool.query<SystemRow>(
        `
          SELECT
            system_key AS "key",
            display_name AS "displayName",
            sort_order AS "sortOrder",
            definition_status AS "definitionStatus",
            definition
          FROM master_service_report_systems
          WHERE template_version_id = $1
          ORDER BY sort_order
        `,
        [template.id]
      );

      response.json({
        template: {
          ...template,
          systems: systemsResult.rows
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

inspectionReferenceRouter.get(
  "/customers",
  requireRole("admin", "inspector"),
  async (_request, response, next) => {
    try {
      const result = await pool.query<CustomerRow>(`
        SELECT
          id,
          customer_code AS "code",
          display_name AS "displayName",
          is_demo AS "isDemo"
        FROM customers
        WHERE is_active = true
        ORDER BY display_name, id
      `);
      response.json({ customers: result.rows });
    } catch (error) {
      next(error);
    }
  }
);

inspectionReferenceRouter.get(
  "/customers/:id/configuration",
  requireRole("admin", "inspector"),
  async (request, response, next) => {
    try {
      const customerId = request.params.id;
      if (typeof customerId !== "string" || !uuidPattern.test(customerId)) {
        response.status(400).json({ error: "INVALID_CUSTOMER_ID" });
        return;
      }

      const customerResult = await pool.query<CustomerRow>(
        `
          SELECT
            id,
            customer_code AS "code",
            display_name AS "displayName",
            is_demo AS "isDemo"
          FROM customers
          WHERE id = $1 AND is_active = true
          LIMIT 1
        `,
        [customerId]
      );
      const customer = customerResult.rows[0];
      if (!customer) {
        response.status(404).json({ error: "CUSTOMER_NOT_FOUND" });
        return;
      }

      const configurationResult = await pool.query<ConfigurationRow>(
        `
          SELECT
            revision.id AS "configurationId",
            revision.revision,
            template.id AS "templateId",
            template.code AS "templateCode",
            template.name AS "templateName",
            template.version AS "templateVersion",
            template.selection_policy AS "selectionPolicy"
          FROM customer_configuration_revisions revision
          INNER JOIN master_service_report_templates template
            ON template.id = revision.template_version_id
          WHERE revision.customer_id = $1
            AND revision.status = 'active'
          LIMIT 1
        `,
        [customerId]
      );
      const configuration = configurationResult.rows[0];
      if (!configuration) {
        response.status(404).json({ error: "CUSTOMER_CONFIGURATION_NOT_FOUND" });
        return;
      }

      const enabledResult = await pool.query<EnabledSystemRow>(
        `
          SELECT
            enabled.id,
            enabled.system_key AS "key",
            system.display_name AS "displayName",
            enabled.sort_order AS "sortOrder",
            system.definition_status AS "definitionStatus"
          FROM customer_enabled_systems enabled
          INNER JOIN master_service_report_systems system
            ON system.template_version_id = enabled.template_version_id
           AND system.system_key = enabled.system_key
          WHERE enabled.configuration_revision_id = $1
          ORDER BY enabled.sort_order
        `,
        [configuration.configurationId]
      );
      const enabledIds = enabledResult.rows.map((system) => system.id);

      const zonesResult = enabledIds.length === 0
        ? { rows: [] as ZoneRow[] }
        : await pool.query<ZoneRow>(
            `
              SELECT
                id,
                enabled_system_id AS "enabledSystemId",
                zone_key AS "key",
                display_name AS "displayName",
                sort_order AS "sortOrder"
              FROM customer_system_zones
              WHERE enabled_system_id = ANY($1::uuid[])
              ORDER BY enabled_system_id, sort_order
            `,
            [enabledIds]
          );
      const locationsResult = enabledIds.length === 0
        ? { rows: [] as LocationRow[] }
        : await pool.query<LocationRow>(
            `
              SELECT
                id,
                enabled_system_id AS "enabledSystemId",
                zone_id AS "zoneId",
                location_key AS "key",
                display_name AS "displayName",
                preset_row_count AS "presetRowCount",
                row_preset AS "rowPreset",
                sort_order AS "sortOrder"
              FROM customer_system_locations
              WHERE enabled_system_id = ANY($1::uuid[])
              ORDER BY enabled_system_id, sort_order
            `,
            [enabledIds]
          );

      response.json({
        customer,
        configuration: {
          ...configuration,
          enabledSystems: enabledResult.rows.map((system) => ({
            ...system,
            zones: zonesResult.rows.filter((zone) => zone.enabledSystemId === system.id),
            locations: locationsResult.rows.filter(
              (location) => location.enabledSystemId === system.id
            )
          }))
        }
      });
    } catch (error) {
      next(error);
    }
  }
);
