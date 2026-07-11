import { pool } from "../db/pool.js";

type SyncRequestItem = {
  operationId: unknown;
  entityType: unknown;
  entityId: unknown;
  action: unknown;
  payload: unknown;
};

type TestRecordPayload = {
  clientUuid: string;
  title: string;
  notes: string;
  createdAt: string;
};

export type SyncFailure = {
  id: string;
  code: string;
  message: string;
};

export type SyncResult = {
  acceptedIds: string[];
  duplicateIds: string[];
  failed: SyncFailure[];
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
  payload?: TestRecordPayload;
  failure?: SyncFailure;
} {
  const fallbackId =
    typeof item.entityId === "string" ? item.entityId : "unknown";

  if (!isUuid(item.operationId)) {
    return {
      failure: failure(fallbackId, "VALIDATION_ERROR", "operationId must be a UUID")
    };
  }

  if (item.entityType !== "testRecord") {
    return {
      failure: failure(fallbackId, "VALIDATION_ERROR", "entityType is unsupported")
    };
  }

  if (item.action !== "create") {
    return {
      failure: failure(fallbackId, "VALIDATION_ERROR", "action is unsupported")
    };
  }

  if (!isUuid(item.entityId)) {
    return {
      failure: failure(fallbackId, "VALIDATION_ERROR", "entityId must be a UUID")
    };
  }

  if (!isRecord(item.payload)) {
    return {
      failure: failure(item.entityId, "VALIDATION_ERROR", "payload is required")
    };
  }

  const { clientUuid, title, notes, createdAt } = item.payload;

  if (!isUuid(clientUuid) || clientUuid !== item.entityId) {
    return {
      failure: failure(
        item.entityId,
        "VALIDATION_ERROR",
        "payload.clientUuid must match entityId"
      )
    };
  }

  if (typeof title !== "string" || title.trim().length === 0) {
    return {
      failure: failure(item.entityId, "VALIDATION_ERROR", "Title is required")
    };
  }

  if (title.length > 200) {
    return {
      failure: failure(
        item.entityId,
        "VALIDATION_ERROR",
        "Title must be 200 characters or fewer"
      )
    };
  }

  if (typeof notes !== "string" || notes.length > 4000) {
    return {
      failure: failure(
        item.entityId,
        "VALIDATION_ERROR",
        "Notes must be 4000 characters or fewer"
      )
    };
  }

  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) {
    return {
      failure: failure(
        item.entityId,
        "VALIDATION_ERROR",
        "createdAt must be a valid timestamp"
      )
    };
  }

  return {
    payload: {
      clientUuid,
      title: title.trim(),
      notes,
      createdAt
    }
  };
}

export async function syncTestRecords(items: SyncRequestItem[]): Promise<SyncResult> {
  const result: SyncResult = {
    acceptedIds: [],
    duplicateIds: [],
    failed: []
  };

  for (const item of items) {
    const validation = validateItem(item);
    if (validation.failure) {
      result.failed.push(validation.failure);
      continue;
    }

    const payload = validation.payload;
    if (!payload) {
      result.failed.push(failure("unknown", "VALIDATION_ERROR", "Invalid payload"));
      continue;
    }

    const insert = await pool.query<{ inserted: boolean }>(
      `
        INSERT INTO test_records (client_uuid, title, notes, created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (client_uuid) DO NOTHING
        RETURNING true AS inserted;
      `,
      [payload.clientUuid, payload.title, payload.notes, payload.createdAt]
    );

    if (insert.rowCount === 1) {
      result.acceptedIds.push(payload.clientUuid);
    } else {
      result.duplicateIds.push(payload.clientUuid);
    }
  }

  return result;
}

