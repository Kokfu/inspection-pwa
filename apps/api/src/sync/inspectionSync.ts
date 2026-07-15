import { pool } from "../db/pool.js";
import type { SyncFailure, SyncResult } from "./testRecordSync.js";

type SyncRequestItem = {
  operationId: unknown;
  entityType: unknown;
  entityId: unknown;
  action: unknown;
  payload: unknown;
};

type InspectionPayload = {
  clientUuid: string;
  jobId: string;
  templateId: string;
  templateVersion: number;
  header: {
    title: string;
    locationNotes: string;
    performedAt: string;
  };
  responses: Array<{
    templateItemId: string;
    value: string;
    remarks: string;
    sortOrder: number;
  }>;
};

type TemplateItemRow = {
  section_id: string;
  section_name: string;
  section_sort_order: number;
  item_id: string;
  label: string;
  response_type: "status" | "number" | "text";
  required: boolean;
  options: unknown;
  item_sort_order: number;
};

type CanonicalTemplateSnapshot = {
  templateId: string;
  templateVersion: number;
  templateName: string;
  sections: Array<{
    sectionId: string;
    sectionName: string;
    sortOrder: number;
    items: Array<{
      itemId: string;
      label: string;
      responseType: "status" | "number" | "text";
      required: boolean;
      sortOrder: number;
      options: string[];
    }>;
  }>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function failure(id: string, code: string, message: string): SyncFailure {
  return { id, code, message };
}

function stringOptions(value: unknown): string[] {
  return Array.isArray(value) && value.every((option) => typeof option === "string")
    ? value
    : [];
}

function validateItem(item: SyncRequestItem): {
  payload?: InspectionPayload;
  failure?: SyncFailure;
} {
  const fallbackId = typeof item.entityId === "string" ? item.entityId : "unknown";

  if (!isUuid(item.operationId)) {
    return { failure: failure(fallbackId, "VALIDATION_ERROR", "operationId must be a UUID") };
  }
  if (item.entityType !== "inspection" || item.action !== "create") {
    return { failure: failure(fallbackId, "VALIDATION_ERROR", "Inspection action is unsupported") };
  }
  if (!isUuid(item.entityId) || !isRecord(item.payload)) {
    return { failure: failure(fallbackId, "VALIDATION_ERROR", "Inspection payload is invalid") };
  }

  const { clientUuid, jobId, templateId, templateVersion, header, responses } = item.payload;
  if (!isUuid(clientUuid) || clientUuid !== item.entityId || !isUuid(jobId) || !isUuid(templateId)) {
    return { failure: failure(item.entityId, "VALIDATION_ERROR", "Inspection identifiers are invalid") };
  }
  if (typeof templateVersion !== "number" || !Number.isInteger(templateVersion) || templateVersion < 1) {
    return { failure: failure(item.entityId, "VALIDATION_ERROR", "Template data is invalid") };
  }
  if (!isRecord(header) || typeof header.title !== "string" || header.title.trim().length === 0 || header.title.length > 200 || typeof header.locationNotes !== "string" || header.locationNotes.length > 1000 || typeof header.performedAt !== "string" || Number.isNaN(Date.parse(header.performedAt))) {
    return { failure: failure(item.entityId, "VALIDATION_ERROR", "Inspection header is invalid") };
  }
  if (!Array.isArray(responses) || responses.length === 0 || responses.length > 25) {
    return { failure: failure(item.entityId, "VALIDATION_ERROR", "Inspection responses are invalid") };
  }

  const normalizedResponses: InspectionPayload["responses"] = [];
  for (const response of responses) {
    if (!isRecord(response) || !isUuid(response.templateItemId) || typeof response.value !== "string" || response.value.trim().length === 0 || response.value.length > 500 || typeof response.remarks !== "string" || response.remarks.length > 1000 || typeof response.sortOrder !== "number" || !Number.isInteger(response.sortOrder) || response.sortOrder < 0) {
      return { failure: failure(item.entityId, "VALIDATION_ERROR", "Inspection response is invalid") };
    }
    normalizedResponses.push({
      templateItemId: response.templateItemId,
      value: response.value.trim(),
      remarks: response.remarks,
      sortOrder: response.sortOrder
    });
  }

  if (new Set(normalizedResponses.map((response) => response.templateItemId)).size !== normalizedResponses.length) {
    return { failure: failure(item.entityId, "VALIDATION_ERROR", "Inspection response items must be unique") };
  }

  return {
    payload: {
      clientUuid,
      jobId,
      templateId,
      templateVersion,
      header: {
        title: header.title.trim(),
        locationNotes: header.locationNotes,
        performedAt: header.performedAt
      },
      responses: normalizedResponses
    }
  };
}

function buildCanonicalSnapshot(
  templateId: string,
  templateVersion: number,
  templateName: string,
  items: TemplateItemRow[]
): CanonicalTemplateSnapshot {
  const sections = new Map<string, CanonicalTemplateSnapshot["sections"][number]>();
  for (const item of items) {
    const section = sections.get(item.section_id) ?? {
      sectionId: item.section_id,
      sectionName: item.section_name,
      sortOrder: item.section_sort_order,
      items: []
    };
    section.items.push({
      itemId: item.item_id,
      label: item.label,
      responseType: item.response_type,
      required: item.required,
      sortOrder: item.item_sort_order,
      options: stringOptions(item.options)
    });
    sections.set(item.section_id, section);
  }

  return {
    templateId,
    templateVersion,
    templateName,
    sections: [...sections.values()]
  };
}

function responseValueIsValid(response: InspectionPayload["responses"][number], item: TemplateItemRow) {
  if (item.response_type === "status") {
    const options = stringOptions(item.options);
    return options.length > 0 && options.includes(response.value);
  }
  if (item.response_type === "number") {
    return Number.isFinite(Number(response.value));
  }
  return item.response_type === "text";
}

export async function syncInspections(items: SyncRequestItem[], actorUserId?: number): Promise<SyncResult> {
  const result: SyncResult = { acceptedIds: [], duplicateIds: [], failed: [] };

  for (const item of items) {
    const validation = validateItem(item);
    if (validation.failure || !validation.payload) {
      result.failed.push(validation.failure ?? failure("unknown", "VALIDATION_ERROR", "Invalid inspection"));
      continue;
    }

    const payload = validation.payload;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query("SELECT 1 FROM inspections WHERE client_uuid = $1", [payload.clientUuid]);
      if (existing.rowCount !== 0) {
        await client.query("ROLLBACK");
        result.duplicateIds.push(payload.clientUuid);
        continue;
      }

      const jobAndTemplate = await client.query<{ template_id: string; version: number; name: string }>(
        `
          SELECT job.template_id, template.version, template.name
          FROM inspection_jobs job
          INNER JOIN inspection_templates template ON template.id = job.template_id
          WHERE job.id = $1 AND job.status = 'open'
        `,
        [payload.jobId]
      );
      if (jobAndTemplate.rowCount !== 1 || jobAndTemplate.rows[0].template_id !== payload.templateId || jobAndTemplate.rows[0].version !== payload.templateVersion) {
        await client.query("ROLLBACK");
        result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Inspection job or template is unavailable"));
        continue;
      }

      const templateItems = await client.query<TemplateItemRow>(
        `
          SELECT
            section.id AS section_id,
            section.title AS section_name,
            section.sort_order AS section_sort_order,
            item.id AS item_id,
            item.label,
            item.response_type,
            item.required,
            item.options,
            item.sort_order AS item_sort_order
          FROM inspection_template_sections section
          INNER JOIN inspection_template_items item ON item.section_id = section.id
          WHERE section.template_id = $1
          ORDER BY section.sort_order, item.sort_order
        `,
        [payload.templateId]
      );
      if (templateItems.rowCount === 0) {
        await client.query("ROLLBACK");
        result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Inspection template has no checklist items"));
        continue;
      }

      const itemById = new Map(templateItems.rows.map((templateItem) => [templateItem.item_id, templateItem]));
      const suppliedIds = new Set(payload.responses.map((response) => response.templateItemId));
      const requiredItemsArePresent = templateItems.rows
        .filter((templateItem) => templateItem.required)
        .every((templateItem) => suppliedIds.has(templateItem.item_id));
      const responsesAreValid = requiredItemsArePresent && payload.responses.every((response) => {
        const templateItem = itemById.get(response.templateItemId);
        return templateItem !== undefined && responseValueIsValid(response, templateItem);
      });
      if (!responsesAreValid) {
        await client.query("ROLLBACK");
        result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Inspection checklist responses are incomplete or invalid"));
        continue;
      }

      const canonicalSnapshot = buildCanonicalSnapshot(
        payload.templateId,
        payload.templateVersion,
        jobAndTemplate.rows[0].name,
        templateItems.rows
      );
      const insert = await client.query(
        `
          INSERT INTO inspections (
            id, client_uuid, job_id, template_id, template_version,
            template_snapshot, header, performed_at, created_by_user_id
          )
          VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (client_uuid) DO NOTHING
          RETURNING id
        `,
        [
          payload.clientUuid,
          payload.jobId,
          payload.templateId,
          payload.templateVersion,
          canonicalSnapshot,
          payload.header,
          payload.header.performedAt,
          actorUserId ?? null
        ]
      );
      if (insert.rowCount === 0) {
        await client.query("ROLLBACK");
        result.duplicateIds.push(payload.clientUuid);
        continue;
      }

      for (const response of payload.responses) {
        const templateItem = itemById.get(response.templateItemId);
        if (!templateItem) {
          throw new Error("Validated template item is missing");
        }
        await client.query(
          `
            INSERT INTO inspection_responses (
              inspection_id, template_item_id, response_value, remarks, sort_order
            )
            VALUES ($1, $2, $3, $4, $5)
          `,
          [payload.clientUuid, response.templateItemId, response.value, response.remarks, templateItem.item_sort_order]
        );
      }

      await client.query("COMMIT");
      result.acceptedIds.push(payload.clientUuid);
    } catch {
      await client.query("ROLLBACK").catch(() => undefined);
      result.failed.push(failure(payload.clientUuid, "SERVER_ERROR", "Inspection could not be saved"));
    } finally {
      client.release();
    }
  }

  return result;
}
