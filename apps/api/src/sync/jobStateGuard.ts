import { pool } from "../db/pool.js";
import type { SyncFailure } from "./testRecordSync.js";

type UnknownRecord = Record<string, unknown>;
type SyncItem = { entityType?: unknown; entityId?: unknown; payload?: unknown };
type Queryable = { query(text: string, values?: unknown[]): Promise<{ rows: UnknownRecord[] }> };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const jobEntityTypes = new Set([
  "inspection",
  "masterSystemInspection",
  "masterSystemFormInstance"
]);

function record(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function guardCompletedJobSyncItems<T extends SyncItem>(
  items: T[],
  queryable: Queryable = pool
) {
  const candidates = items.flatMap((item) => {
    if (!jobEntityTypes.has(String(item.entityType)) || !record(item.payload)
      || typeof item.payload.jobId !== "string" || !uuidPattern.test(item.payload.jobId)
      || typeof item.entityId !== "string" || !uuidPattern.test(item.entityId)) return [];
    return [{ item, jobId: item.payload.jobId, entityId: item.entityId }];
  });
  if (candidates.length === 0) {
    return { dispatchable: items, duplicateIds: [] as string[], failed: [] as SyncFailure[] };
  }
  const jobIds = [...new Set(candidates.map((candidate) => candidate.jobId))];
  const closed = await queryable.query(
    "SELECT id FROM inspection_jobs WHERE id = ANY($1::uuid[]) AND status = 'closed'",
    [jobIds]
  );
  const closedIds = new Set(closed.rows.map((row) => String(row.id)));
  const closedCandidates = candidates.filter((candidate) => closedIds.has(candidate.jobId));
  if (closedCandidates.length === 0) {
    return { dispatchable: items, duplicateIds: [] as string[], failed: [] as SyncFailure[] };
  }
  const entityIds = [...new Set(closedCandidates.map((candidate) => candidate.entityId))];
  const accepted = await queryable.query(
    `SELECT inspection.job_id, instance.client_uuid AS id
       FROM master_system_form_instances instance
       INNER JOIN master_system_inspections inspection
         ON inspection.id = instance.inspection_group_id
       WHERE inspection.job_id = ANY($1::uuid[])
         AND instance.client_uuid = ANY($2::uuid[])
         AND instance.status = 'submitted'
     UNION
     SELECT inspection.job_id, inspection.client_uuid AS id
       FROM inspections inspection
       WHERE inspection.job_id = ANY($1::uuid[])
         AND inspection.client_uuid = ANY($2::uuid[])`,
    [[...closedIds], entityIds]
  );
  const acceptedIds = new Set(accepted.rows.map((row) => `${String(row.job_id)}:${String(row.id)}`));
  // Accepted UUIDs must still reach their system handler so its canonical
  // fingerprint can distinguish an exact retry from altered data.
  const staleCandidates = closedCandidates.filter(
    (candidate) => !acceptedIds.has(`${candidate.jobId}:${candidate.entityId}`)
  );
  const blocked = new Set(staleCandidates.map((candidate) => candidate.item));
  return {
    dispatchable: items.filter((item) => !blocked.has(item)),
    duplicateIds: [] as string[],
    failed: staleCandidates
      .map((candidate) => ({
        id: candidate.entityId,
        code: "JOB_CLOSED",
        message: "This job is completed; the local record was retained and needs review"
      }))
  };
}
