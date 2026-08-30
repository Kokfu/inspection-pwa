import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { pool } from "../db/pool.js";

type UnknownRecord = Record<string, unknown>;

export type CompletionUnitStatus = "accepted" | "incomplete";
export type CompletionIncompleteReason =
  | "ACCEPTED_INSPECTION_MISSING"
  | "EVIDENCE_PENDING"
  | "EVIDENCE_INVALID"
  | "CONFIGURATION_INVALID"
  | "SYSTEM_NOT_SUPPORTED";

export type JobCompletionUnit = {
  authorityKey: string;
  label: string;
  status: CompletionUnitStatus;
  reason?: CompletionIncompleteReason;
};

export type JobCompletionSystem = {
  systemKey: string;
  systemLabel: string;
  status: CompletionUnitStatus;
  units: JobCompletionUnit[];
};

export type JobCompletion = {
  jobId: string;
  jobStatus: "open" | "closed";
  eligible: boolean;
  checkedAt: string;
  requiredUnitCount: number;
  acceptedUnitCount: number;
  completedAt: string | null;
  completedBy: { id: number; username: string } | null;
  systems: JobCompletionSystem[];
};

export type CompletionJobRow = {
  id: string;
  status: "open" | "closed";
  configuration_snapshot: unknown;
  completed_at: string | Date | null;
  completed_by_user_id: string | number | null;
  completed_by_username: string | null;
  completed_by_display_name: string | null;
};

export type AcceptedAuthorityRow = {
  system_key: string;
  instance_key: string;
  zone_id: string | null;
  location_id: string | null;
  display_sequence: number;
  client_uuid: string;
  evidence_policy_id: string | null;
  evidence_policy_version: number | null;
  evidence_policy_snapshot: unknown;
  evidence_policy_sha256: string | null;
  evidence_policy_matches: boolean | null;
  attachment_field_path: string | null;
  attachment_evidence_policy_id: string | null;
  attachment_mime_type: string | null;
  attachment_source_sha256: string | null;
  attachment_stored_sha256: string | null;
  attachment_source_size_bytes: number | null;
  attachment_stored_size_bytes: number | null;
  attachment_source_width: number | null;
  attachment_source_height: number | null;
  attachment_width: number | null;
  attachment_height: number | null;
};

type Queryable = {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
};

type Connectable = {
  connect(): Promise<PoolClient>;
};

let testRaceBarrier: (() => Promise<void>) | undefined;
/** Test-only in-process synchronization; production leaves this undefined. */
export function setJobCompletionTestBarrier(barrier: (() => Promise<void>) | undefined) { testRaceBarrier = barrier; }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const singleAuthoritySystems = new Set([
  "automatic_sprinkler",
  "dry_wet_riser",
  "hose_reel",
  "fire_alarm_detector",
  "hydrant",
  "portable_fire_extinguisher"
]);
const perLocationSystems = new Set(["co2_fire_extinguisher", "wet_chemical"]);

function record(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timestamp(value: string | Date | null) {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function incomplete(
  authorityKey: string,
  label: string,
  reason: CompletionIncompleteReason
): JobCompletionUnit {
  return { authorityKey, label, status: "incomplete", reason };
}

function accepted(authorityKey: string, label: string): JobCompletionUnit {
  return { authorityKey, label, status: "accepted" };
}

function validAttachment(row: AcceptedAuthorityRow, policyId: string) {
  const sha = /^[0-9a-f]{64}$/;
  return row.attachment_evidence_policy_id === policyId
    && row.attachment_mime_type === "image/jpeg"
    && typeof row.attachment_source_sha256 === "string" && sha.test(row.attachment_source_sha256)
    && typeof row.attachment_stored_sha256 === "string" && sha.test(row.attachment_stored_sha256)
    && typeof row.attachment_source_size_bytes === "number" && row.attachment_source_size_bytes >= 1 && row.attachment_source_size_bytes <= 2_097_152
    && typeof row.attachment_stored_size_bytes === "number" && row.attachment_stored_size_bytes >= 1 && row.attachment_stored_size_bytes <= 2_097_152
    && typeof row.attachment_source_width === "number" && row.attachment_source_width >= 1 && row.attachment_source_width <= 1600
    && typeof row.attachment_source_height === "number" && row.attachment_source_height >= 1 && row.attachment_source_height <= 1600
    && typeof row.attachment_width === "number" && row.attachment_width >= 1 && row.attachment_width <= 1600
    && typeof row.attachment_height === "number" && row.attachment_height >= 1 && row.attachment_height <= 1600;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (record(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalize(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

type FrozenSprinklerEvidencePolicy = {
  id: string;
  version: number;
  definition: UnknownRecord;
  definitionSha256: string;
};

function frozenSprinklerEvidencePolicy(system: UnknownRecord): FrozenSprinklerEvidencePolicy | null | undefined {
  const policy = system.evidencePolicy;
  if (policy === undefined) return null;
  if (!record(policy)
    || Object.keys(policy).length !== 6
    || typeof policy.id !== "string" || !uuidPattern.test(policy.id)
    || typeof policy.code !== "string" || policy.code.trim().length === 0 || policy.code.length > 160
    || !Number.isSafeInteger(policy.version) || Number(policy.version) < 1 || policy.schemaVersion !== 1
    || !record(policy.definition) || policy.definition.systemKey !== "automatic_sprinkler"
    || typeof policy.definitionSha256 !== "string" || !/^[0-9a-f]{64}$/.test(policy.definitionSha256)) {
    return undefined;
  }
  return {
    id: policy.id,
    version: Number(policy.version),
    definition: policy.definition,
    definitionSha256: policy.definitionSha256
  };
}

function sprinklerEvidenceState(rows: AcceptedAuthorityRow[], system: UnknownRecord) {
  const frozenPolicy = frozenSprinklerEvidencePolicy(system);
  if (frozenPolicy === undefined || new Set(rows.map((row) => row.client_uuid)).size !== 1) return "invalid" as const;
  const attachments = rows.filter((row) => row.attachment_field_path !== null);
  if (frozenPolicy === null) {
    return rows.every((row) => row.evidence_policy_id === null
      && row.evidence_policy_version === null
      && row.evidence_policy_snapshot === null
      && row.evidence_policy_sha256 === null)
      ? "complete" as const
      : "invalid" as const;
  }
  const metadataMatchesFrozenPolicy = rows.every((row) =>
    row.evidence_policy_id === frozenPolicy.id
    && row.evidence_policy_version === frozenPolicy.version
    && row.evidence_policy_sha256 === frozenPolicy.definitionSha256
    && canonicalize(row.evidence_policy_snapshot) === canonicalize(frozenPolicy.definition)
  );
  if (!metadataMatchesFrozenPolicy) return "invalid" as const;
  const points = Object.entries(frozenPolicy.definition.points ?? {});
  if (points.length === 0 && !record(frozenPolicy.definition.points)) return "invalid" as const;
  if (points.some(([, definition]) => !record(definition)
    || definition.allowed !== true
    || typeof definition.required !== "boolean"
    || definition.maxCount !== 1)) return "invalid" as const;
  const requiredFields = points
    .filter(([, definition]) => (definition as UnknownRecord).required === true)
    .map(([fieldPath]) => fieldPath);
  for (const fieldPath of requiredFields) {
    const matches = attachments.filter((row) => row.attachment_field_path === fieldPath);
    if (matches.length > 1 || matches.some((row) => !validAttachment(row, frozenPolicy.id))) {
      return "invalid" as const;
    }
    if (matches.length === 0) return "pending" as const;
  }
  return "complete" as const;
}

function orderedLocations(system: UnknownRecord) {
  if (!Array.isArray(system.locations) || !Array.isArray(system.zones)) return undefined;
  const zones = new Map<string, UnknownRecord>();
  for (const value of system.zones) {
    if (!record(value) || typeof value.id !== "string" || !uuidPattern.test(value.id)
      || typeof value.sortOrder !== "number" || !Number.isInteger(value.sortOrder)) return undefined;
    zones.set(value.id, value);
  }
  const locations: UnknownRecord[] = [];
  const ids = new Set<string>();
  for (const value of system.locations) {
    if (!record(value) || typeof value.id !== "string" || !uuidPattern.test(value.id) || ids.has(value.id)
      || typeof value.displayName !== "string" || value.displayName.trim().length === 0
      || typeof value.sortOrder !== "number" || !Number.isInteger(value.sortOrder)
      || !(value.zoneId === null || typeof value.zoneId === "string" && zones.has(value.zoneId))) return undefined;
    ids.add(value.id);
    locations.push(value);
  }
  return locations.sort((left, right) => {
    const leftZone = typeof left.zoneId === "string" ? Number(zones.get(left.zoneId)?.sortOrder) : Number.MAX_SAFE_INTEGER;
    const rightZone = typeof right.zoneId === "string" ? Number(zones.get(right.zoneId)?.sortOrder) : Number.MAX_SAFE_INTEGER;
    return leftZone - rightZone || Number(left.sortOrder) - Number(right.sortOrder) || String(left.id).localeCompare(String(right.id));
  });
}

export function buildJobCompletion(
  job: CompletionJobRow,
  acceptedRows: AcceptedAuthorityRow[],
  checkedAt = new Date().toISOString()
): JobCompletion {
  const snapshot = record(job.configuration_snapshot) ? job.configuration_snapshot : undefined;
  const enabledSystems = snapshot && Array.isArray(snapshot.enabledSystems) ? snapshot.enabledSystems : undefined;
  const systems: JobCompletionSystem[] = [];
  const seen = new Set<string>();

  if (!enabledSystems || enabledSystems.length === 0) {
    systems.push({
      systemKey: "configuration",
      systemLabel: "Job configuration",
      status: "incomplete",
      units: [incomplete("configuration", "Configuration snapshot", "CONFIGURATION_INVALID")]
    });
  } else {
    for (const value of enabledSystems) {
      if (!record(value) || value.definitionStatus !== "confirmed"
        || typeof value.systemKey !== "string" || typeof value.displayName !== "string"
        || seen.has(value.systemKey)) {
        systems.push({
          systemKey: record(value) && typeof value.systemKey === "string" ? value.systemKey : "unknown",
          systemLabel: record(value) && typeof value.displayName === "string" ? value.displayName : "Invalid configured system",
          status: "incomplete",
          units: [incomplete("configuration", "Configured authority", "CONFIGURATION_INVALID")]
        });
        continue;
      }
      const systemKey = value.systemKey;
      seen.add(systemKey);
      const rows = acceptedRows.filter((row) => row.system_key === systemKey);
      let units: JobCompletionUnit[];
      if (singleAuthoritySystems.has(systemKey)) {
        const matching = rows.filter((row) => row.instance_key === "primary"
          && row.zone_id === null && row.location_id === null && row.display_sequence === 1);
        if (matching.length === 0) {
          units = [incomplete("primary", "Primary inspection", "ACCEPTED_INSPECTION_MISSING")];
        } else if (systemKey === "automatic_sprinkler") {
          const evidence = sprinklerEvidenceState(matching, value);
          units = evidence === "complete"
            ? [accepted("primary", "Primary inspection")]
            : [incomplete("primary", "Primary inspection", evidence === "invalid" ? "EVIDENCE_INVALID" : "EVIDENCE_PENDING")];
        } else {
          units = [accepted("primary", "Primary inspection")];
        }
      } else if (perLocationSystems.has(systemKey)) {
        const locations = orderedLocations(value);
        if (!locations || locations.length === 0) {
          units = [incomplete("configuration", "Configured locations", "CONFIGURATION_INVALID")];
        } else {
          units = locations.map((location, index) => {
            const locationId = location.id as string;
            const zoneId = location.zoneId as string | null;
            const match = rows.some((row) => row.instance_key === `location:${locationId}`
              && row.location_id === locationId && row.zone_id === zoneId
              && row.display_sequence === index + 1);
            const label = location.displayName as string;
            return match
              ? accepted(`location:${locationId}`, label)
              : incomplete(`location:${locationId}`, label, "ACCEPTED_INSPECTION_MISSING");
          });
        }
      } else {
        units = [incomplete("unsupported", "Unsupported configured authority", "SYSTEM_NOT_SUPPORTED")];
      }
      systems.push({
        systemKey,
        systemLabel: value.displayName,
        status: units.every((unit) => unit.status === "accepted") ? "accepted" : "incomplete",
        units
      });
    }
  }

  const units = systems.flatMap((system) => system.units);
  const acceptedUnitCount = units.filter((unit) => unit.status === "accepted").length;
  return {
    jobId: job.id,
    jobStatus: job.status,
    eligible: units.length > 0 && acceptedUnitCount === units.length,
    checkedAt,
    requiredUnitCount: units.length,
    acceptedUnitCount,
    completedAt: timestamp(job.completed_at),
    completedBy: job.completed_by_user_id !== null && job.completed_by_display_name
      ? { id: Number(job.completed_by_user_id), username: job.completed_by_display_name }
      : null,
    systems
  };
}

const jobSelect = `
  SELECT job.id, job.status, job.configuration_snapshot,
    job.completed_at, job.completed_by_user_id, job.completed_by_display_name,
    NULL::text AS completed_by_username
  FROM inspection_jobs job
  WHERE job.id = $1 AND job.master_template_version_id IS NOT NULL`;

const acceptedAuthoritySelect = `
  SELECT inspection.system_key, instance.instance_key, instance.zone_id,
    instance.location_id, instance.display_sequence, instance.client_uuid,
    instance.evidence_policy_id, instance.evidence_policy_version,
    instance.evidence_policy_snapshot, instance.evidence_policy_sha256,
    (policy.id IS NOT NULL
      AND policy.version = instance.evidence_policy_version
      AND policy.definition = instance.evidence_policy_snapshot
      AND policy.definition_sha256 = instance.evidence_policy_sha256
      AND policy.system_key = 'automatic_sprinkler') AS evidence_policy_matches,
    attachment.field_path AS attachment_field_path,
    attachment.evidence_policy_id AS attachment_evidence_policy_id,
    attachment.mime_type AS attachment_mime_type,
    attachment.source_sha256 AS attachment_source_sha256,
    attachment.stored_sha256 AS attachment_stored_sha256,
    attachment.source_size_bytes AS attachment_source_size_bytes,
    attachment.stored_size_bytes AS attachment_stored_size_bytes,
    attachment.source_width AS attachment_source_width,
    attachment.source_height AS attachment_source_height,
    attachment.width AS attachment_width,
    attachment.height AS attachment_height
  FROM master_system_form_instances instance
  INNER JOIN master_system_inspections inspection
    ON inspection.id = instance.inspection_group_id
  LEFT JOIN inspection_evidence_policies policy
    ON policy.id = instance.evidence_policy_id
  LEFT JOIN inspection_attachments attachment
    ON attachment.form_instance_id = instance.id
  WHERE inspection.job_id = $1 AND instance.status = 'submitted'
  ORDER BY inspection.system_key, instance.instance_key, attachment.field_path`;

export async function evaluateJobCompletion(
  queryable: Queryable,
  jobId: string,
  lockedJob?: CompletionJobRow
) {
  const job = lockedJob ?? (await queryable.query<CompletionJobRow>(jobSelect, [jobId])).rows[0];
  if (!job) return undefined;
  const acceptedRows = await queryable.query<AcceptedAuthorityRow>(acceptedAuthoritySelect, [jobId]);
  return buildJobCompletion(job, acceptedRows.rows);
}

export async function loadJobCompletion(jobId: string, queryable: Queryable = pool) {
  return evaluateJobCompletion(queryable, jobId);
}

export type CloseJobResult =
  | { kind: "not-found" }
  | { kind: "incomplete"; completion: JobCompletion }
  | { kind: "closed"; alreadyCompleted: boolean; completion: JobCompletion };

export async function closeInspectionJob(
  jobId: string,
  actor: { id: number; username: string },
  connectable: Connectable = pool as Pool
): Promise<CloseJobResult> {
  const client = await connectable.connect();
  try {
    await client.query("BEGIN");
    const job = (await client.query<CompletionJobRow>(`${jobSelect} FOR UPDATE OF job`, [jobId])).rows[0];
    if (!job) {
      await client.query("ROLLBACK");
      return { kind: "not-found" };
    }
    await testRaceBarrier?.();
    const current = await evaluateJobCompletion(client, jobId, job);
    if (!current) throw new Error("Locked job disappeared during completion evaluation");
    if (job.status === "closed") {
      await client.query("COMMIT");
      return { kind: "closed", alreadyCompleted: true, completion: current };
    }
    if (!current.eligible) {
      await client.query("ROLLBACK");
      return { kind: "incomplete", completion: current };
    }
    const completed = (await client.query<{
      completed_at: string | Date;
      completed_by_user_id: string | number;
    }>(`UPDATE inspection_jobs
         SET status = 'closed', completed_at = now(), completed_by_user_id = $2,
             completed_by_display_name = $3
         WHERE id = $1 AND status = 'open'
         RETURNING completed_at, completed_by_user_id`, [jobId, actor.id, actor.username])).rows[0];
    if (!completed) throw new Error("Open job could not be completed while locked");
    await client.query(
      `INSERT INTO audit_events(actor_user_id, action, entity_type, entity_id, result, reason)
       VALUES($1, 'inspection_job_close', 'inspectionJob', $2, 'success', 'eligible')`,
      [actor.id, jobId]
    );
    await client.query("COMMIT");
    return {
      kind: "closed",
      alreadyCompleted: false,
      completion: {
        ...current,
        jobStatus: "closed",
        completedAt: timestamp(completed.completed_at),
        completedBy: { id: Number(completed.completed_by_user_id), username: actor.username }
      }
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
