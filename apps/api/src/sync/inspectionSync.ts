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
  templateSnapshot: Record<string, unknown>;
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

  const { clientUuid, jobId, templateId, templateVersion, templateSnapshot, header, responses } = item.payload;
  if (!isUuid(clientUuid) || clientUuid !== item.entityId || !isUuid(jobId) || !isUuid(templateId)) {
    return { failure: failure(item.entityId, "VALIDATION_ERROR", "Inspection identifiers are invalid") };
  }
  if (typeof templateVersion !== "number" || !Number.isInteger(templateVersion) || templateVersion < 1 || !isRecord(templateSnapshot)) {
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
      templateSnapshot,
      header: {
        title: header.title.trim(),
        locationNotes: header.locationNotes,
        performedAt: header.performedAt
      },
      responses: normalizedResponses
    }
  };
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

      const job = await client.query<{ template_id: string }>(
        "SELECT template_id FROM inspection_jobs WHERE id = $1 AND status = 'open'",
        [payload.jobId]
      );
      if (job.rowCount !== 1 || job.rows[0].template_id !== payload.templateId) {
        await client.query("ROLLBACK");
        result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Inspection job is unavailable"));
        continue;
      }

      const template = await client.query<{ version: number }>(
        "SELECT version FROM inspection_templates WHERE id = $1",
        [payload.templateId]
      );
      const itemIds = payload.responses.map((response) => response.templateItemId);
      const templateItems = await client.query<{ id: string; response_type: string }>(
        `
          SELECT item.id, item.response_type
          FROM inspection_template_items item
          INNER JOIN inspection_template_sections section ON section.id = item.section_id
          WHERE section.template_id = $1 AND item.id = ANY($2::uuid[])
        `,
        [payload.templateId, itemIds]
      );
      if (template.rowCount !== 1 || template.rows[0].version !== payload.templateVersion || templateItems.rowCount !== itemIds.length) {
        await client.query("ROLLBACK");
        result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Inspection template is unavailable"));
        continue;
      }

      const responseTypes = new Map(templateItems.rows.map((item) => [item.id, item.response_type]));
      const hasInvalidValue = payload.responses.some((response) => {
        const responseType = responseTypes.get(response.templateItemId);
        if (responseType === "status") {
          return !["pass", "fail", "not_applicable"].includes(response.value);
        }
        if (responseType === "number") {
          return !Number.isFinite(Number(response.value));
        }
        return responseType !== "text";
      });
      if (hasInvalidValue) {
        await client.query("ROLLBACK");
        result.failed.push(failure(payload.clientUuid, "VALIDATION_ERROR", "Inspection response value is invalid"));
        continue;
      }

      await client.query(
        `
          INSERT INTO inspections (
            id, client_uuid, job_id, template_id, template_version,
            template_snapshot, header, performed_at, created_by_user_id
          )
          VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          payload.clientUuid,
          payload.jobId,
          payload.templateId,
          payload.templateVersion,
          payload.templateSnapshot,
          payload.header,
          payload.header.performedAt,
          actorUserId ?? null
        ]
      );

      for (const response of payload.responses) {
        await client.query(
          `
            INSERT INTO inspection_responses (
              inspection_id, template_item_id, response_value, remarks, sort_order
            )
            VALUES ($1, $2, $3, $4, $5)
          `,
          [payload.clientUuid, response.templateItemId, response.value, response.remarks, response.sortOrder]
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
