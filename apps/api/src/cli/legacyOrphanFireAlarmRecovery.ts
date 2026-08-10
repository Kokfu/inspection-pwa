import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { validateStoredFireAlarmDetail } from "../inspections/fireAlarmAccepted.js";
import { fireAlarmDetectorV3, masterServiceReportV3 } from "../inspections/templates/masterServiceReportV3.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256Pattern = /^[0-9a-f]{64}$/;
const fixturePrefix = "ACCEPTANCE-FIRE-";
const artifactType = "legacy_orphan_fire_alarm_recovery";
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const defaultManifestDirectory = resolve(sourceRoot, "runtime", "acceptance-fire-alarm");

type Queryable = Pick<PoolClient, "query">;
type ArtifactStatus = "checked" | "blocked" | "recovery_commit_unknown" | "recovered";
export type RecoveryBlockReason = { code: string; message: string };
type FixtureIds = {
  customerId: string; revisionId: string; enabledSystemId: string; zoneId: string;
  primaryLocationId: string; secondaryLocationId: string; jobId: string;
};
type ActorEvidence = { id: number; username: string; role: "inspector"; isActive: true };
type SessionEvidence = { id: number; createdAt: string; expiresAt: string; revokedAt: string | null };
type AuditEvidence = {
  id: number; action: string; entityType: string | null; entityId: string | null;
  result: string; reason: string | null; createdAt: string;
};
type InspectionEvidence = {
  inspectionGroupId: string; formInstanceId: string; clientUuid: string;
  jobId: string; systemKey: "fire_alarm_detector"; groupCreatorId: number;
  templateId: string; revisionId: string; instanceKey: "primary";
  displaySequence: 1; status: "submitted"; syncedById: number;
  originalCreatedByUserId: null; originalCreatorSnapshot: Record<string, unknown>;
  groupCreatedAt: string; groupUpdatedAt: string; acceptedAt: string;
  performedAt: string; receivedAt: string; instanceUpdatedAt: string;
  inspectionSnapshot: Record<string, unknown>; responsePayload: Record<string, unknown>;
  requestFingerprint: string; ownershipFingerprint: string;
};
type Baseline = {
  template: { id: string; code: "MFE-FSSR"; version: 3; publicationStatus: "published"; definitionSha256: string };
  demoJobs: Array<{ id: string; reference: string; customerId: string | null; revisionId: string | null; snapshotSha256: string }>;
};
type DeletionPlan = {
  inspectionFormInstanceIds: string[]; inspectionGroupIds: string[]; jobIds: string[];
  locationIds: string[]; zoneIds: string[]; enabledSystemIds: string[]; revisionIds: string[];
  customerIds: string[]; sessionIds: number[]; auditEventIds: number[]; actorIds: number[];
};

export type LegacyOrphanRecoveryArtifact = {
  schemaVersion: 1;
  artifactType: typeof artifactType;
  status: ArtifactStatus;
  ownershipVerdict: "SAFE_TO_RECOVER" | "BLOCKED";
  blockedReasons: RecoveryBlockReason[];
  runId: string;
  reference: string;
  reconstructedAt: string;
  recoveredAt: string | null;
  actor: ActorEvidence;
  fixture: FixtureIds;
  configurationSnapshot: Record<string, unknown>;
  inspections: InspectionEvidence[];
  sessions: SessionEvidence[];
  auditEvents: AuditEvidence[];
  deletionPlan: DeletionPlan;
  baseline: Baseline;
  artifactFingerprint: string;
};

export type LegacyOrphanRecoveryCheck = {
  runId: string;
  jobId: string | null;
  customerId: string | null;
  revisionId: string | null;
  enabledSystemId: string | null;
  actorId: number | null;
  inspectionGroupCount: number;
  formInstances: Array<{ id: string; clientUuid: string }>;
  attachmentCount: number;
  sessionCount: number;
  auditCount: number;
  ownershipVerdict: "SAFE_TO_RECOVER" | "BLOCKED";
  reasons: RecoveryBlockReason[];
  recoveryArtifactPath: string | null;
  recoveryStatus: ArtifactStatus | null;
};

type Reconstruction = {
  report: LegacyOrphanRecoveryCheck;
  artifact?: LegacyOrphanRecoveryArtifact;
};
type RecoveryOptions = {
  failBeforeCommit?: boolean;
  failAfterCommit?: boolean;
};
type RecoveryTestHooks = {
  beforeDelete?: (client: Queryable, artifact: LegacyOrphanRecoveryArtifact) => Promise<void>;
  afterCommit?: (artifact: LegacyOrphanRecoveryArtifact) => Promise<void>;
};

let testHooks: RecoveryTestHooks = {};
/** Test-only fault hooks. Operator CLI callers never set these. */
export function setLegacyOrphanRecoveryTestHooks(hooks: RecoveryTestHooks) { testHooks = hooks; }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function same(left: unknown, right: unknown) {
  return canonicalJson(left) === canonicalJson(right);
}

function sha256(value: unknown) {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

function iso(value: unknown) {
  const result = value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
  assert(!Number.isNaN(Date.parse(result)), "Recovery evidence contains an invalid timestamp");
  return result;
}

function tryIso(value: unknown) {
  try { return iso(value); } catch { return undefined; }
}

function addReason(reasons: RecoveryBlockReason[], code: string, message: string) {
  if (!reasons.some((reason) => reason.code === code && reason.message === message)) reasons.push({ code, message });
}

function validIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}

function validateRunId(runId: string) {
  if (!uuidPattern.test(runId)) throw new Error("Legacy orphan recovery run ID must be one exact UUID");
}

function manifestDirectory(directory?: string) {
  return resolve(directory ?? process.env.ACCEPTANCE_FIRE_ALARM_MANIFEST_DIR
    ?? (process.env.NODE_ENV === "production" ? "/srv/operational/acceptance-fire-alarm" : defaultManifestDirectory));
}

function normalManifestPath(runId: string, directory?: string) {
  validateRunId(runId);
  return resolve(manifestDirectory(directory), `${runId}.json`);
}

export function legacyOrphanRecoveryArtifactPath(runId: string, directory?: string) {
  validateRunId(runId);
  return resolve(manifestDirectory(directory), `legacy-orphan-recovery-${runId}.json`);
}

async function assertNormalManifestAbsent(runId: string, directory?: string) {
  try {
    await readFile(normalManifestPath(runId, directory), "utf8");
    throw new Error("A normal acceptance manifest exists for this run; use normal manifest-based cleanup");
  } catch (error) {
    if (record(error) && error.code === "ENOENT") return;
    throw error;
  }
}

function expectedSnapshot(runId: string, ids: FixtureIds) {
  return {
    schemaVersion: 1,
    customer: { id: ids.customerId, code: `${fixturePrefix}${runId}`, displayName: "Acceptance Fire Alarm V3" },
    configuration: { revisionId: ids.revisionId, revisionNumber: 1 },
    template: { id: masterServiceReportV3.id, code: "MFE-FSSR", name: masterServiceReportV3.name, version: 3 },
    enabledSystems: [{
      enabledSystemId: ids.enabledSystemId, systemKey: "fire_alarm_detector", displayName: "Fire Alarm / Detector System",
      sortOrder: 5, definitionStatus: "confirmed",
      zones: [{ id: ids.zoneId, enabledSystemId: ids.enabledSystemId, key: "acceptance-zone", displayName: "Acceptance Zone", sortOrder: 1 }],
      locations: [{
        id: ids.primaryLocationId, enabledSystemId: ids.enabledSystemId, zoneId: ids.zoneId,
        key: "primary-panel", displayName: "Acceptance Main Panel", presetRowCount: 1,
        rowPreset: { fireAlarmTable: "primary", assetReference: `${fixturePrefix}${runId}-P` }, sortOrder: 1
      }, {
        id: ids.secondaryLocationId, enabledSystemId: ids.enabledSystemId, zoneId: null,
        key: "secondary-bell", displayName: "Acceptance Alarm Bell", presetRowCount: 1,
        rowPreset: { fireAlarmTable: "secondary", assetReference: `${fixturePrefix}${runId}-S` }, sortOrder: 2
      }]
    }]
  };
}

function artifactWithoutFingerprint(artifact: LegacyOrphanRecoveryArtifact) {
  const { artifactFingerprint: _discarded, ...body } = artifact;
  return body;
}

function sealArtifact(artifact: Omit<LegacyOrphanRecoveryArtifact, "artifactFingerprint">): LegacyOrphanRecoveryArtifact {
  return { ...structuredClone(artifact), artifactFingerprint: sha256(artifact) };
}

function validIdArray(value: unknown, numeric = false) {
  return Array.isArray(value) && value.every((item) => numeric
    ? Number.isSafeInteger(item) && Number(item) > 0
    : typeof item === "string" && uuidPattern.test(item))
    && new Set(value.map(String)).size === value.length;
}

function parseArtifact(value: unknown): LegacyOrphanRecoveryArtifact {
  const topKeys = ["schemaVersion", "artifactType", "status", "ownershipVerdict", "blockedReasons", "runId", "reference", "reconstructedAt", "recoveredAt", "actor", "fixture", "configurationSnapshot", "inspections", "sessions", "auditEvents", "deletionPlan", "baseline", "artifactFingerprint"];
  if (!record(value) || !exactKeys(value, topKeys) || value.schemaVersion !== 1 || value.artifactType !== artifactType
    || !["checked", "blocked", "recovery_commit_unknown", "recovered"].includes(String(value.status))
    || (value.ownershipVerdict !== "SAFE_TO_RECOVER" && value.ownershipVerdict !== "BLOCKED") || !Array.isArray(value.blockedReasons)
    || typeof value.runId !== "string" || !uuidPattern.test(value.runId)
    || value.reference !== `${fixturePrefix}${value.runId}` || !validIso(value.reconstructedAt)
    || !(value.recoveredAt === null || validIso(value.recoveredAt)) || !record(value.actor) || !record(value.fixture)
    || !record(value.configurationSnapshot) || !Array.isArray(value.inspections) || !Array.isArray(value.sessions)
    || !Array.isArray(value.auditEvents) || !record(value.deletionPlan) || !record(value.baseline)
    || typeof value.artifactFingerprint !== "string" || !sha256Pattern.test(value.artifactFingerprint)) {
    throw new Error("Legacy orphan recovery artifact is malformed or tampered");
  }
  const artifact = value as unknown as LegacyOrphanRecoveryArtifact;
  const blockedReasonsValid = artifact.blockedReasons.every((reason) => record(reason) && exactKeys(reason, ["code", "message"])
    && typeof reason.code === "string" && /^[A-Z][A-Z0-9_]{2,100}$/.test(reason.code)
    && typeof reason.message === "string" && reason.message.length > 0 && reason.message.length <= 500);
  if (!blockedReasonsValid || (artifact.status === "blocked"
    ? artifact.ownershipVerdict !== "BLOCKED" || artifact.blockedReasons.length === 0 || artifact.recoveredAt !== null
    : artifact.ownershipVerdict !== "SAFE_TO_RECOVER" || artifact.blockedReasons.length !== 0)) {
    throw new Error("Legacy orphan recovery artifact verdict is malformed or tampered");
  }
  if (!exactKeys(artifact.actor as unknown as Record<string, unknown>, ["id", "username", "role", "isActive"])
    || !Number.isSafeInteger(artifact.actor.id) || artifact.actor.id <= 0
    || artifact.actor.username !== `acceptance-fire-${artifact.runId}` || artifact.actor.role !== "inspector" || artifact.actor.isActive !== true
    || !exactKeys(artifact.fixture as unknown as Record<string, unknown>, ["customerId", "revisionId", "enabledSystemId", "zoneId", "primaryLocationId", "secondaryLocationId", "jobId"])
    || !Object.values(artifact.fixture).every((id) => uuidPattern.test(id))
    || !same(artifact.configurationSnapshot, expectedSnapshot(artifact.runId, artifact.fixture))) {
    throw new Error("Legacy orphan recovery fixture identity is malformed or tampered");
  }
  if (artifact.inspections.length > 1 || !artifact.inspections.every(validInspectionEvidence)
    || !artifact.sessions.every((session) => record(session) && exactKeys(session, ["id", "createdAt", "expiresAt", "revokedAt"])
      && Number.isSafeInteger(session.id) && session.id > 0 && validIso(session.createdAt) && validIso(session.expiresAt)
      && (session.revokedAt === null || validIso(session.revokedAt)))
    || !artifact.auditEvents.every((event) => record(event) && exactKeys(event, ["id", "action", "entityType", "entityId", "result", "reason", "createdAt"])
      && Number.isSafeInteger(event.id) && event.id > 0 && typeof event.action === "string"
      && (event.entityType === null || typeof event.entityType === "string") && (event.entityId === null || typeof event.entityId === "string")
      && typeof event.result === "string" && (event.reason === null || typeof event.reason === "string") && validIso(event.createdAt))) {
    throw new Error("Legacy orphan recovery activity evidence is malformed or tampered");
  }
  if (artifact.inspections.some((inspection) => inspection.jobId !== artifact.fixture.jobId
    || inspection.templateId !== masterServiceReportV3.id || inspection.revisionId !== artifact.fixture.revisionId
    || inspection.groupCreatorId !== artifact.actor.id || inspection.syncedById !== artifact.actor.id)) {
    throw new Error("Legacy orphan recovery inspection binding is malformed or tampered");
  }
  const plan = artifact.deletionPlan as unknown as Record<string, unknown>;
  const planKeys = ["inspectionFormInstanceIds", "inspectionGroupIds", "jobIds", "locationIds", "zoneIds", "enabledSystemIds", "revisionIds", "customerIds", "sessionIds", "auditEventIds", "actorIds"];
  if (!exactKeys(plan, planKeys) || !planKeys.every((key) => validIdArray(plan[key], key === "sessionIds" || key === "auditEventIds" || key === "actorIds"))) {
    throw new Error("Legacy orphan recovery deletion plan is malformed or tampered");
  }
  const expectedPlan: DeletionPlan = {
    inspectionFormInstanceIds: artifact.inspections.map((item) => item.formInstanceId),
    inspectionGroupIds: artifact.inspections.map((item) => item.inspectionGroupId), jobIds: [artifact.fixture.jobId],
    locationIds: [artifact.fixture.primaryLocationId, artifact.fixture.secondaryLocationId], zoneIds: [artifact.fixture.zoneId],
    enabledSystemIds: [artifact.fixture.enabledSystemId], revisionIds: [artifact.fixture.revisionId], customerIds: [artifact.fixture.customerId],
    sessionIds: artifact.sessions.map((item) => item.id), auditEventIds: artifact.auditEvents.map((item) => item.id), actorIds: [artifact.actor.id]
  };
  if (!same(artifact.deletionPlan, expectedPlan) || !validBaseline(artifact.baseline)
    || artifact.artifactFingerprint !== sha256(artifactWithoutFingerprint(artifact))
    || (artifact.status === "recovered") !== (artifact.recoveredAt !== null)) {
    throw new Error("Legacy orphan recovery artifact fingerprint or binding is malformed or tampered");
  }
  return artifact;
}

function validInspectionEvidence(value: unknown): value is InspectionEvidence {
  if (!record(value) || !exactKeys(value, ["inspectionGroupId", "formInstanceId", "clientUuid", "jobId", "systemKey", "groupCreatorId", "templateId", "revisionId", "instanceKey", "displaySequence", "status", "syncedById", "originalCreatedByUserId", "originalCreatorSnapshot", "groupCreatedAt", "groupUpdatedAt", "acceptedAt", "performedAt", "receivedAt", "instanceUpdatedAt", "inspectionSnapshot", "responsePayload", "requestFingerprint", "ownershipFingerprint"])) return false;
  const uuidKeys = ["inspectionGroupId", "formInstanceId", "clientUuid", "jobId", "templateId", "revisionId"];
  const timeKeys = ["groupCreatedAt", "groupUpdatedAt", "acceptedAt", "performedAt", "receivedAt", "instanceUpdatedAt"];
  if (!uuidKeys.every((key) => typeof value[key] === "string" && uuidPattern.test(value[key] as string))
    || value.systemKey !== "fire_alarm_detector" || value.instanceKey !== "primary" || value.displaySequence !== 1
    || value.status !== "submitted" || !Number.isSafeInteger(value.groupCreatorId) || Number(value.groupCreatorId) <= 0
    || !Number.isSafeInteger(value.syncedById) || Number(value.syncedById) <= 0 || value.originalCreatedByUserId !== null
    || !record(value.originalCreatorSnapshot) || !record(value.inspectionSnapshot) || !record(value.responsePayload)
    || !timeKeys.every((key) => validIso(value[key])) || typeof value.requestFingerprint !== "string" || !sha256Pattern.test(value.requestFingerprint)
    || typeof value.ownershipFingerprint !== "string" || !sha256Pattern.test(value.ownershipFingerprint)) return false;
  const { ownershipFingerprint, ...evidence } = value as unknown as InspectionEvidence;
  return ownershipFingerprint === sha256(evidence);
}

function validBaseline(value: Baseline) {
  return record(value) && exactKeys(value as unknown as Record<string, unknown>, ["template", "demoJobs"])
    && record(value.template) && exactKeys(value.template as unknown as Record<string, unknown>, ["id", "code", "version", "publicationStatus", "definitionSha256"])
    && value.template.id === masterServiceReportV3.id && value.template.code === "MFE-FSSR" && value.template.version === 3
    && value.template.publicationStatus === "published" && sha256Pattern.test(value.template.definitionSha256)
    && Array.isArray(value.demoJobs) && value.demoJobs.length > 0
    && value.demoJobs.every((job) => record(job) && exactKeys(job, ["id", "reference", "customerId", "revisionId", "snapshotSha256"])
      && uuidPattern.test(job.id) && typeof job.reference === "string"
      && (job.customerId === null || uuidPattern.test(job.customerId)) && (job.revisionId === null || uuidPattern.test(job.revisionId))
      && sha256Pattern.test(job.snapshotSha256))
    && new Set(value.demoJobs.map((job) => job.id)).size === value.demoJobs.length;
}

async function readBaseline(client: Queryable): Promise<Baseline> {
  const template = await client.query(`SELECT template.id,template.code,template.version,template.publication_status AS "publicationStatus",system.definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.id=$1 AND system.system_key='fire_alarm_detector'`, [masterServiceReportV3.id]);
  assert(template.rowCount === 1, "MFE-FSSR V3 Fire Alarm template prerequisite is unavailable");
  const row = template.rows[0];
  assert(row.code === "MFE-FSSR" && row.version === 3 && row.publicationStatus === "published" && same(row.definition, fireAlarmDetectorV3), "MFE-FSSR V3 Fire Alarm template prerequisite is not exact");
  const jobs = await client.query(`SELECT id,job_reference AS reference,customer_id AS "customerId",customer_configuration_revision_id AS "revisionId",configuration_snapshot AS snapshot FROM inspection_jobs WHERE is_sample=true AND position($1 in job_reference)<>1 ORDER BY id`, [fixturePrefix]);
  const baseline: Baseline = {
    template: { id: row.id, code: "MFE-FSSR", version: 3, publicationStatus: "published", definitionSha256: sha256(row.definition) },
    demoJobs: jobs.rows.map((job) => ({ id: job.id, reference: job.reference, customerId: job.customerId, revisionId: job.revisionId, snapshotSha256: sha256(job.snapshot) }))
  };
  assert(validBaseline(baseline), "Unrelated demo baseline is unavailable or malformed");
  return baseline;
}

async function verifyBaseline(client: Queryable, expected: Baseline) {
  assert(same(await readBaseline(client), expected), "Unrelated demo or MFE-FSSR V3 template data changed during legacy orphan recovery");
}

function computeRequestFingerprint(inspection: Omit<InspectionEvidence, "ownershipFingerprint">) {
  const accepted = inspection.inspectionSnapshot;
  assert(record(accepted.job) && record(accepted.customer) && record(accepted.configuration) && record(accepted.template) && record(accepted.system), "Accepted inspection snapshot cannot be fingerprinted");
  const system = structuredClone(accepted.system); delete system.definition; delete system.resolvedControls; delete system.repetitionMode;
  const authority = { job: accepted.job, customer: accepted.customer, configuration: accepted.configuration, template: accepted.template, system };
  return sha256({ clientUuid: inspection.clientUuid, jobId: inspection.jobId, systemKey: "fire_alarm_detector", instanceKey: "primary",
    configuredZoneId: null, configuredLocationId: null, displaySequence: 1, authority, responses: inspection.responsePayload,
    performedAt: inspection.performedAt, originalCreatorSnapshot: inspection.originalCreatorSnapshot, actorUserId: inspection.syncedById });
}

function reportSkeleton(runId: string): LegacyOrphanRecoveryCheck {
  return { runId, jobId: null, customerId: null, revisionId: null, enabledSystemId: null, actorId: null,
    inspectionGroupCount: 0, formInstances: [], attachmentCount: 0, sessionCount: 0, auditCount: 0,
    ownershipVerdict: "BLOCKED", reasons: [], recoveryArtifactPath: null, recoveryStatus: null };
}

function reportFromArtifact(artifact: LegacyOrphanRecoveryArtifact, path: string): LegacyOrphanRecoveryCheck {
  return { runId: artifact.runId, jobId: artifact.fixture.jobId, customerId: artifact.fixture.customerId,
    revisionId: artifact.fixture.revisionId, enabledSystemId: artifact.fixture.enabledSystemId, actorId: artifact.actor.id,
    inspectionGroupCount: artifact.inspections.length,
    formInstances: artifact.inspections.map((inspection) => ({ id: inspection.formInstanceId, clientUuid: inspection.clientUuid })),
    attachmentCount: 0, sessionCount: artifact.sessions.length, auditCount: artifact.auditEvents.length,
    ownershipVerdict: artifact.ownershipVerdict, reasons: structuredClone(artifact.blockedReasons), recoveryArtifactPath: path, recoveryStatus: artifact.status };
}

async function reconstruct(client: Queryable, runId: string): Promise<Reconstruction> {
  validateRunId(runId);
  const reference = `${fixturePrefix}${runId}`; const username = `acceptance-fire-${runId}`;
  const report = reportSkeleton(runId); const reasons = report.reasons;
  const jobs = await client.query(`SELECT id,template_id AS "legacyTemplateId",master_template_version_id AS "templateId",job_reference AS reference,title,status,is_sample AS "isSample",customer_id AS "customerId",customer_configuration_revision_id AS "revisionId",configuration_snapshot AS snapshot FROM inspection_jobs WHERE job_reference=$1`, [reference]);
  if (jobs.rowCount === 0) { addReason(reasons, "NOT_FOUND", "No job has the exact acceptance run reference"); return { report }; }
  if (jobs.rowCount !== 1) { addReason(reasons, "JOB_DUPLICATED", "Exact acceptance job identity is not unique"); return { report }; }
  const job = jobs.rows[0]; report.jobId = job.id; report.customerId = job.customerId; report.revisionId = job.revisionId;
  if (!uuidPattern.test(String(job.id)) || job.reference !== reference || job.legacyTemplateId !== null || job.templateId !== masterServiceReportV3.id
    || job.title !== "Acceptance Fire Alarm V3" || job.status !== "open" || job.isSample !== true
    || !uuidPattern.test(String(job.customerId)) || !uuidPattern.test(String(job.revisionId)) || !record(job.snapshot)) {
    addReason(reasons, "JOB_IDENTITY_MISMATCH", "Job is not the exact open MFE-FSSR V3 acceptance fixture");
  }
  const customers = await client.query(`SELECT id,customer_code AS code,display_name AS name,is_demo AS "isDemo",is_active AS "isActive" FROM customers WHERE customer_code=$1`, [reference]);
  const customer = customers.rows[0];
  if (customers.rowCount !== 1 || !customer || customer.id !== job.customerId || customer.code !== reference
    || customer.name !== "Acceptance Fire Alarm V3" || customer.isDemo !== true || customer.isActive !== true) {
    addReason(reasons, "CUSTOMER_IDENTITY_MISMATCH", "Exact demo acceptance customer ownership is not proven");
  }
  const revisions = customer ? await client.query(`SELECT id,customer_id AS "customerId",template_version_id AS "templateId",revision,status FROM customer_configuration_revisions WHERE customer_id=$1 ORDER BY id`, [customer.id]) : { rowCount: 0, rows: [] };
  const revision = revisions.rows[0];
  if (revisions.rowCount !== 1 || !revision || revision.id !== job.revisionId || revision.customerId !== customer?.id
    || revision.templateId !== masterServiceReportV3.id || revision.revision !== 1 || revision.status !== "active") {
    addReason(reasons, "CONFIGURATION_IDENTITY_MISMATCH", "Customer must have exactly one active V3 revision linked to the job");
  }
  const systems = revision ? await client.query(`SELECT id,configuration_revision_id AS "revisionId",template_version_id AS "templateId",system_key AS "systemKey",sort_order AS "sortOrder",system_configuration AS configuration,evidence_policy_id AS "evidencePolicyId" FROM customer_enabled_systems WHERE configuration_revision_id=$1 ORDER BY id`, [revision.id]) : { rowCount: 0, rows: [] };
  const system = systems.rows[0];
  if (systems.rowCount !== 1 || !system || system.revisionId !== revision?.id || system.templateId !== masterServiceReportV3.id
    || system.systemKey !== "fire_alarm_detector" || system.sortOrder !== 1 || !same(system.configuration, {}) || system.evidencePolicyId !== null) {
    addReason(reasons, "ENABLED_SYSTEM_IDENTITY_MISMATCH", "Revision must have exactly one unmodified Fire Alarm enabled system");
  } else report.enabledSystemId = system.id;
  const zones = system ? await client.query(`SELECT id,enabled_system_id AS "enabledSystemId",zone_key AS key,display_name AS "displayName",sort_order AS "sortOrder" FROM customer_system_zones WHERE enabled_system_id=$1 ORDER BY sort_order,id`, [system.id]) : { rowCount: 0, rows: [] };
  const locations = system ? await client.query(`SELECT id,enabled_system_id AS "enabledSystemId",zone_id AS "zoneId",location_key AS key,display_name AS "displayName",preset_row_count AS "presetRowCount",row_preset AS "rowPreset",sort_order AS "sortOrder" FROM customer_system_locations WHERE enabled_system_id=$1 ORDER BY sort_order,id`, [system.id]) : { rowCount: 0, rows: [] };
  const actors = await client.query(`SELECT id,username,role,is_active AS "isActive" FROM users WHERE username=$1`, [username]);
  const actorRow = actors.rows[0];
  if (actors.rowCount !== 1 || !actorRow || !Number.isSafeInteger(Number(actorRow.id)) || Number(actorRow.id) <= 0
    || actorRow.username !== username || actorRow.role !== "inspector" || actorRow.isActive !== true) {
    addReason(reasons, "ACTOR_IDENTITY_MISMATCH", "Exact active disposable acceptance inspector is not proven");
  } else report.actorId = Number(actorRow.id);

  let ids: FixtureIds | undefined;
  if (customer && revision && system && zones.rowCount === 1 && locations.rowCount === 2) {
    ids = { customerId: customer.id, revisionId: revision.id, enabledSystemId: system.id, zoneId: zones.rows[0].id,
      primaryLocationId: locations.rows[0].id, secondaryLocationId: locations.rows[1].id, jobId: job.id };
    const expected = expectedSnapshot(runId, ids);
    if (!same(zones.rows, expected.enabledSystems[0].zones)) addReason(reasons, "ZONE_IDENTITY_MISMATCH", "Exact acceptance-zone configuration is not proven");
    if (!same(locations.rows, expected.enabledSystems[0].locations)) addReason(reasons, "LOCATION_IDENTITY_MISMATCH", "Exact primary/secondary run-bound row presets are not proven");
    if (!same(job.snapshot, expected)) addReason(reasons, "JOB_SNAPSHOT_MISMATCH", "Authoritative acceptance configuration snapshot is not exact");
  } else {
    if (zones.rowCount !== 1) addReason(reasons, "ZONE_COUNT_MISMATCH", "Expected exactly one acceptance zone");
    if (locations.rowCount !== 2) addReason(reasons, "LOCATION_COUNT_MISMATCH", "Expected exactly two configured acceptance locations");
  }

  const groups = await client.query(`SELECT id,job_id AS "jobId",system_key AS "systemKey",created_by_user_id AS "creatorId",created_at AS "createdAt",updated_at AS "updatedAt" FROM master_system_inspections WHERE job_id=$1 ORDER BY id`, [job.id]);
  const groupCount = groups.rowCount ?? groups.rows.length;
  report.inspectionGroupCount = groupCount;
  const allForms = groupCount === 0
    ? { rowCount: 0, rows: [] as Array<Record<string, unknown>> }
    : await client.query(`SELECT id,inspection_group_id AS "groupId",client_uuid AS "clientUuid",instance_key AS "instanceKey",zone_id AS "zoneId",location_id AS "locationId",zone_snapshot AS "zoneSnapshot",location_snapshot AS "locationSnapshot",display_sequence AS "displaySequence",master_template_version_id AS "templateId",customer_configuration_revision_id AS "revisionId",snapshot_schema_version AS "snapshotSchemaVersion",inspection_snapshot AS "inspectionSnapshot",response_schema_version AS "responseSchemaVersion",response_payload AS "responsePayload",request_fingerprint AS "requestFingerprint",status,performed_at AS "performedAt",original_created_by_user_id AS "originalCreatedByUserId",original_creator_snapshot AS "originalCreatorSnapshot",synced_by_user_id AS "syncedById",received_at AS "receivedAt",updated_at AS "updatedAt" FROM master_system_form_instances WHERE inspection_group_id=ANY($1::uuid[]) ORDER BY inspection_group_id,id`, [groups.rows.map((group) => group.id)]);
  report.formInstances = allForms.rows.map((form) => ({ id: String(form.id), clientUuid: String(form.clientUuid) }));
  const legacyInspections = await client.query(`SELECT id,created_by_user_id AS "creatorId" FROM inspections WHERE job_id=$1 ORDER BY id`, [job.id]);
  if (legacyInspections.rowCount !== 0) addReason(reasons, "LEGACY_INSPECTION_PRESENT", "Non-master inspection activity exists on the acceptance job");
  if (groupCount > 1) addReason(reasons, "INSPECTION_GROUP_COUNT_MISMATCH", "More than one inspection tree exists");

  const inspectionEvidence: InspectionEvidence[] = [];
  if (groups.rowCount === 1 && ids && actorRow) {
    const group = groups.rows[0];
    const formRows = allForms.rows.filter((form) => form.groupId === group.id);
    const forms = { rowCount: formRows.length, rows: formRows };
    if (forms.rowCount !== 1) addReason(reasons, "INSPECTION_CHILD_COUNT_MISMATCH", "Inspection tree must contain exactly one complete form instance");
    if (forms.rowCount === 1) {
      const form = forms.rows[0];
      const creator = form.originalCreatorSnapshot;
      const inspectionSnapshot = record(form.inspectionSnapshot) ? form.inspectionSnapshot : undefined;
      const responsePayload = record(form.responsePayload) ? form.responsePayload : undefined;
      const timestamps = {
        performedAt: tryIso(form.performedAt), receivedAt: tryIso(form.receivedAt), groupCreatedAt: tryIso(group.createdAt),
        groupUpdatedAt: tryIso(group.updatedAt), acceptedAt: inspectionSnapshot ? tryIso(inspectionSnapshot.acceptedAt) : undefined,
        instanceUpdatedAt: tryIso(form.updatedAt)
      };
      const timestampsValid = Object.values(timestamps).every((value) => value !== undefined);
      if (!timestampsValid) addReason(reasons, "MALFORMED_INSPECTION_TIMESTAMP", "Persisted inspection timestamp evidence is missing or unparseable");
      const creatorValid = record(creator) && exactKeys(creator, ["source", "userId", "username", "role", "capturedAt"])
        && creator.source === "device_reported" && Number.isSafeInteger(creator.userId) && Number(creator.userId) === Number(actorRow.id)
        && creator.username === username && creator.role === "inspector" && validIso(creator.capturedAt);
      if (!creatorValid) addReason(reasons, "MALFORMED_CREATOR_SNAPSHOT", "Original creator snapshot is malformed or does not prove the exact acceptance actor");
      if (!inspectionSnapshot || !responsePayload) addReason(reasons, "MALFORMED_STORED_FIRE_ALARM_DETAIL", "Stored Fire Alarm snapshot or response payload is not a JSON object");
      const requestFingerprintValid = typeof form.requestFingerprint === "string" && sha256Pattern.test(form.requestFingerprint);
      if (!requestFingerprintValid) addReason(reasons, "INVALID_REQUEST_FINGERPRINT", "Stored Fire Alarm request fingerprint is malformed");
      if (timestampsValid && creatorValid && inspectionSnapshot && responsePayload && requestFingerprintValid) {
        const performedAt = timestamps.performedAt!; const receivedAt = timestamps.receivedAt!;
        let storedDetail: ReturnType<typeof validateStoredFireAlarmDetail>;
        try {
          storedDetail = validateStoredFireAlarmDetail({
            jobId: job.id, jobReference: job.reference, jobTitle: job.title, customerId: customer?.id, customerCode: customer?.code,
            customerName: customer?.name, configurationRevisionId: revision?.id, templateId: masterServiceReportV3.id,
            performedAt: performedAt.replace(/\.([0-9]{3})Z$/, ".$1000Z"), receivedAt: receivedAt.replace(/\.([0-9]{3})Z$/, ".$1000Z"),
            inspectionSnapshot, originalCreatorSnapshot: creator, responses: responsePayload
          });
        } catch { storedDetail = undefined; }
        if (!storedDetail) addReason(reasons, "MALFORMED_STORED_FIRE_ALARM_DETAIL", "Stored Fire Alarm detail failed strict accepted-detail validation");
        const evidenceWithoutFingerprint: Omit<InspectionEvidence, "ownershipFingerprint"> = {
          inspectionGroupId: String(group.id), formInstanceId: String(form.id), clientUuid: String(form.clientUuid), jobId: String(group.jobId),
          systemKey: "fire_alarm_detector", groupCreatorId: Number(group.creatorId), templateId: String(form.templateId),
          revisionId: String(form.revisionId), instanceKey: "primary", displaySequence: 1, status: "submitted",
          syncedById: Number(form.syncedById), originalCreatedByUserId: null, originalCreatorSnapshot: creator,
          groupCreatedAt: timestamps.groupCreatedAt!, groupUpdatedAt: timestamps.groupUpdatedAt!, acceptedAt: timestamps.acceptedAt!,
          performedAt, receivedAt, instanceUpdatedAt: timestamps.instanceUpdatedAt!, inspectionSnapshot, responsePayload,
          requestFingerprint: form.requestFingerprint
        };
        const expected = expectedSnapshot(runId, ids);
        const expectedAccepted = {
          schemaVersion: 1, acceptedAt: timestamps.acceptedAt, job: { id: ids.jobId, reference, title: "Acceptance Fire Alarm V3" },
          customer: expected.customer, configuration: expected.configuration,
          template: { id: masterServiceReportV3.id, code: "MFE-FSSR", version: 3 },
          system: { ...expected.enabledSystems[0], definition: fireAlarmDetectorV3,
            resolvedControls: record(inspectionSnapshot.system) ? inspectionSnapshot.system.resolvedControls : undefined,
            repetitionMode: "single_with_two_repeatable_tables" },
          instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null }
        };
        let requestMatches = false;
        try { requestMatches = computeRequestFingerprint(evidenceWithoutFingerprint) === form.requestFingerprint; } catch { requestMatches = false; }
        if (!requestMatches) addReason(reasons, "INVALID_REQUEST_FINGERPRINT", "Stored Fire Alarm request fingerprint does not match authoritative ownership evidence");
        const exactInspection = group.jobId === ids.jobId && group.systemKey === "fire_alarm_detector" && Number(group.creatorId) === Number(actorRow.id)
          && form.groupId === group.id && uuidPattern.test(String(form.id)) && uuidPattern.test(String(form.clientUuid))
          && form.instanceKey === "primary" && form.zoneId === null && form.locationId === null && form.zoneSnapshot === null && form.locationSnapshot === null
          && form.displaySequence === 1 && form.templateId === masterServiceReportV3.id && form.revisionId === ids.revisionId
          && form.snapshotSchemaVersion === 1 && form.responseSchemaVersion === 1 && form.status === "submitted"
          && form.originalCreatedByUserId === null && Number(form.syncedById) === Number(actorRow.id)
          && storedDetail !== undefined && same(inspectionSnapshot, expectedAccepted) && requestMatches
          && timestamps.groupCreatedAt === timestamps.groupUpdatedAt && timestamps.receivedAt === timestamps.instanceUpdatedAt
          && Date.parse(timestamps.groupCreatedAt!) <= Date.parse(timestamps.receivedAt!);
        if (!exactInspection) addReason(reasons, "INSPECTION_OWNERSHIP_UNPROVEN", "Persisted Fire Alarm tree is incomplete, modified, or not owned by the exact acceptance actor/job/configuration");
        else inspectionEvidence.push({ ...evidenceWithoutFingerprint, ownershipFingerprint: sha256(evidenceWithoutFingerprint) });
      }
    }
  } else if (groups.rowCount === 1) {
    addReason(reasons, "INSPECTION_OWNERSHIP_UNPROVEN", "Fixture identity is incomplete, so inspection ownership cannot be reconstructed");
  }

  const attachments = await client.query(`SELECT attachment.id FROM inspection_attachments attachment INNER JOIN master_system_form_instances instance ON instance.id=attachment.form_instance_id INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id WHERE inspection.job_id=$1 ORDER BY attachment.id`, [job.id]);
  report.attachmentCount = attachments.rowCount ?? attachments.rows.length;
  if (attachments.rowCount !== 0) addReason(reasons, "ATTACHMENTS_PRESENT", "Recovery never deletes attachment evidence");

  let sessions: SessionEvidence[] = []; let auditEvents: AuditEvidence[] = [];
  if (actorRow) {
    const actorId = Number(actorRow.id);
    const foreignMaster = await client.query(`SELECT inspection.id FROM master_system_inspections inspection LEFT JOIN master_system_form_instances instance ON instance.inspection_group_id=inspection.id WHERE inspection.job_id<>$1 AND (inspection.created_by_user_id=$2 OR instance.original_created_by_user_id=$2 OR instance.synced_by_user_id=$2) LIMIT 1`, [job.id, actorId]);
    const foreignLegacy = await client.query(`SELECT id FROM inspections WHERE job_id<>$1 AND created_by_user_id=$2 LIMIT 1`, [job.id, actorId]);
    const foreignAttachments = await client.query(`SELECT attachment.id FROM inspection_attachments attachment INNER JOIN master_system_form_instances instance ON instance.id=attachment.form_instance_id INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id WHERE inspection.job_id<>$1 AND attachment.uploaded_by_user_id=$2 LIMIT 1`, [job.id, actorId]);
    if (foreignMaster.rowCount || foreignLegacy.rowCount || foreignAttachments.rowCount) addReason(reasons, "ACTOR_UNRELATED_WRITE", "Disposable actor has persisted activity outside the exact acceptance job");
    const sessionRows = await client.query(`SELECT id,created_at AS "createdAt",expires_at AS "expiresAt",revoked_at AS "revokedAt" FROM user_sessions WHERE user_id=$1 ORDER BY id`, [actorId]);
    sessions = sessionRows.rows.flatMap((row) => {
      const id = Number(row.id); const createdAt = tryIso(row.createdAt); const expiresAt = tryIso(row.expiresAt);
      const parsedRevokedAt = row.revokedAt === null ? null : tryIso(row.revokedAt);
      if (!Number.isSafeInteger(id) || id <= 0 || !createdAt || !expiresAt || row.revokedAt !== null && !parsedRevokedAt) {
        addReason(reasons, "MALFORMED_SESSION_EVIDENCE", "Acceptance actor session evidence is malformed or unparseable"); return [];
      }
      const revokedAt: string | null = parsedRevokedAt ?? null;
      return [{ id, createdAt, expiresAt, revokedAt }];
    });
    report.sessionCount = sessions.length;
    const auditRows = await client.query(`SELECT id,action,entity_type AS "entityType",entity_id AS "entityId",result,reason,created_at AS "createdAt" FROM audit_events WHERE actor_user_id=$1 ORDER BY id`, [actorId]);
    auditEvents = auditRows.rows.flatMap((row) => {
      const id = Number(row.id); const createdAt = tryIso(row.createdAt);
      if (!Number.isSafeInteger(id) || id <= 0 || !createdAt || typeof row.action !== "string"
        || !(row.entityType === null || typeof row.entityType === "string") || !(row.entityId === null || typeof row.entityId === "string")
        || typeof row.result !== "string" || !(row.reason === null || typeof row.reason === "string")) {
        addReason(reasons, "MALFORMED_AUDIT_EVIDENCE", "Acceptance actor audit evidence is malformed or unparseable"); return [];
      }
      return [{ id, action: row.action, entityType: row.entityType, entityId: row.entityId, result: row.result, reason: row.reason, createdAt }];
    });
    const syncEvents = auditEvents.filter((event) => event.action === "sync_write");
    const receivedAt = inspectionEvidence[0]?.receivedAt;
    const allowedSync = syncEvents.length === 0 || syncEvents.length === 1 && inspectionEvidence.length === 1 && receivedAt !== undefined
      && syncEvents[0].entityType === "sync" && syncEvents[0].entityId === null && syncEvents[0].result === "success"
      && syncEvents[0].reason === "accepted=1; duplicate=0; failed=0"
      && Date.parse(syncEvents[0].createdAt) >= Date.parse(receivedAt) && Date.parse(syncEvents[0].createdAt) - Date.parse(receivedAt) <= 300_000;
    const allowedReadOnly = auditEvents.filter((event) => event.action !== "sync_write").every((event) =>
      (event.action === "login" || event.action === "logout") && event.entityType === "user"
      && event.entityId === String(actorId) && (event.result === "success" || event.result === "failure"));
    if (!allowedSync || !allowedReadOnly) addReason(reasons, "AUDIT_ACTIVITY_UNPROVEN", "Actor audit history cannot be limited to exact acceptance login/logout and one exact accepted sync");
    const fixtureTargets = [...new Set([
      String(actorId), username, job.id, reference, customer?.id, revision?.id, system?.id, ...zones.rows.map((zone) => zone.id),
      ...locations.rows.map((location) => location.id), ...groups.rows.map((group) => group.id),
      ...allForms.rows.flatMap((form) => [form.id, form.clientUuid])
    ].filter((value): value is string => typeof value === "string" && value.length > 0))];
    const targetedRows = fixtureTargets.length === 0 ? { rows: [] as Array<Record<string, unknown>> }
      : await client.query(`SELECT id,actor_user_id AS "actorUserId",action,entity_type AS "entityType",entity_id AS "entityId",result,reason,created_at AS "createdAt" FROM audit_events WHERE entity_id=ANY($1::text[]) ORDER BY id`, [fixtureTargets]);
    const foreignTargeted = targetedRows.rows.filter((row) => Number(row.actorUserId) !== actorId);
    if (foreignTargeted.length > 0) {
      const exactIds = foreignTargeted.map((row) => String(row.id)).join(",");
      addReason(reasons, "FOREIGN_FIXTURE_AUDIT_ACTIVITY", `Foreign actor audit events target exact fixture identities; auditEventIds=${exactIds}`);
    }
    report.auditCount = new Set([...auditEvents.map((event) => event.id), ...targetedRows.rows.map((row) => Number(row.id))]).size;
  }

  if (!ids || !actorRow || reasons.length > 0) return { report };
  const actor: ActorEvidence = { id: Number(actorRow.id), username, role: "inspector", isActive: true };
  const baseline = await readBaseline(client);
  const deletionPlan: DeletionPlan = {
    inspectionFormInstanceIds: inspectionEvidence.map((item) => item.formInstanceId), inspectionGroupIds: inspectionEvidence.map((item) => item.inspectionGroupId),
    jobIds: [ids.jobId], locationIds: [ids.primaryLocationId, ids.secondaryLocationId], zoneIds: [ids.zoneId], enabledSystemIds: [ids.enabledSystemId],
    revisionIds: [ids.revisionId], customerIds: [ids.customerId], sessionIds: sessions.map((item) => item.id), auditEventIds: auditEvents.map((item) => item.id), actorIds: [actor.id]
  };
  const artifact = sealArtifact({ schemaVersion: 1, artifactType, status: "checked", ownershipVerdict: "SAFE_TO_RECOVER", blockedReasons: [],
    runId, reference, reconstructedAt: new Date().toISOString(), recoveredAt: null,
    actor, fixture: ids, configurationSnapshot: expectedSnapshot(runId, ids), inspections: inspectionEvidence, sessions, auditEvents, deletionPlan, baseline });
  report.ownershipVerdict = "SAFE_TO_RECOVER";
  return { report, artifact };
}

function immutableEvidence(artifact: LegacyOrphanRecoveryArtifact) {
  return { runId: artifact.runId, reference: artifact.reference, actor: artifact.actor, fixture: artifact.fixture,
    configurationSnapshot: artifact.configurationSnapshot, inspections: artifact.inspections, sessions: artifact.sessions,
    auditEvents: artifact.auditEvents, deletionPlan: artifact.deletionPlan, baseline: artifact.baseline };
}

async function readArtifact(runId: string, directory?: string) {
  const path = legacyOrphanRecoveryArtifactPath(runId, directory);
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(path, "utf8")); }
  catch { throw new Error("Legacy orphan recovery artifact is missing, unreadable, or tampered; run recover-orphan-check first"); }
  const artifact = parseArtifact(parsed);
  assert(artifact.runId === runId && basename(path) === `legacy-orphan-recovery-${runId}.json`, "Legacy orphan recovery artifact filename/run binding is invalid");
  return { artifact, path };
}

async function writeArtifact(path: string, next: LegacyOrphanRecoveryArtifact) {
  const intended = parseArtifact(structuredClone(next));
  assert(basename(path) === `legacy-orphan-recovery-${intended.runId}.json`, "Legacy orphan recovery artifact filename/run binding is invalid");
  let previous: LegacyOrphanRecoveryArtifact | undefined;
  try { previous = parseArtifact(JSON.parse(await readFile(path, "utf8"))); }
  catch (error) {
    if (!(record(error) && error.code === "ENOENT")) throw new Error("Existing legacy orphan recovery artifact is unreadable or tampered");
  }
  if (previous) {
    const evidenceChanged = !same(immutableEvidence(previous), immutableEvidence(intended));
    const authoritativeSafeRefresh = intended.status === "checked" && intended.ownershipVerdict === "SAFE_TO_RECOVER"
      && (previous.status === "checked" || previous.status === "blocked");
    assert(!evidenceChanged || authoritativeSafeRefresh, "Legacy orphan recovery immutable evidence changed outside a full SAFE check refresh");
    const transitions: Record<ArtifactStatus, ArtifactStatus[]> = {
      checked: ["checked", "blocked", "recovery_commit_unknown", "recovered"],
      blocked: ["blocked", "checked"],
      recovery_commit_unknown: ["blocked", "recovery_commit_unknown", "recovered"],
      recovered: ["blocked", "recovered"]
    };
    assert(transitions[previous.status].includes(intended.status), `Invalid legacy orphan recovery artifact transition ${previous.status} -> ${intended.status}`);
  } else assert(intended.status === "checked", "Initial legacy orphan recovery artifact must be checked");
  const contents = `${JSON.stringify(intended, null, 2)}\n`;
  assert(!/password|token|secret/i.test(contents), "Legacy orphan recovery artifact must not contain credentials");
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(contents, "utf8"); await file.sync(); } finally { await file.close(); }
    const reread = parseArtifact(JSON.parse(await readFile(temporary, "utf8")));
    assert(same(reread, intended), "Temporary legacy orphan recovery artifact differs from intended publication");
    await rename(temporary, path);
    const directoryHandle = await open(dirname(path), "r");
    try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
  } finally { await rm(temporary, { force: true }).catch(() => undefined); }
}

export function parseLegacyOrphanRecoveryArtifactForTest(value: unknown) {
  return parseArtifact(structuredClone(value));
}

async function publishBlockedArtifact(path: string, existing: LegacyOrphanRecoveryArtifact, reasons: RecoveryBlockReason[]) {
  assert(reasons.length > 0, "Blocked recovery artifact requires an exact structured reason");
  const blocked = sealArtifact({ ...artifactWithoutFingerprint(existing), status: "blocked", ownershipVerdict: "BLOCKED",
    blockedReasons: structuredClone(reasons), reconstructedAt: new Date().toISOString(), recoveredAt: null });
  await writeArtifact(path, blocked);
  return blocked;
}

export async function checkLegacyOrphanFireAlarm(runId: string, directory?: string): Promise<LegacyOrphanRecoveryCheck> {
  validateRunId(runId);
  await assertNormalManifestAbsent(runId, directory);
  const path = legacyOrphanRecoveryArtifactPath(runId, directory);
  let existing: LegacyOrphanRecoveryArtifact | undefined;
  try { existing = (await readArtifact(runId, directory)).artifact; }
  catch (error) {
    try { await readFile(path, "utf8"); throw error; } catch (readError) {
      if (!(record(readError) && readError.code === "ENOENT")) throw error;
    }
  }
  if (existing?.status === "recovered") {
    const client = await pool.connect();
    try {
      try { await verifyExactAbsence(client, existing); await verifyBaseline(client, existing.baseline); }
      catch {
        const reasons = [{ code: "RECOVERED_STATE_INVALID", message: "Recovered artifact cannot prove current exact absence and baseline integrity" }];
        const blocked = await publishBlockedArtifact(path, existing, reasons);
        return reportFromArtifact(blocked, path);
      }
    }
    finally { client.release(); }
    return reportFromArtifact(existing, path);
  }
  const client = await pool.connect();
  try {
    const reconstructed = await reconstruct(client, runId);
    if (!reconstructed.artifact) {
      if (existing) {
        if (existing.status === "recovery_commit_unknown" && reconstructed.report.reasons.some((reason) => reason.code === "NOT_FOUND")) {
          try {
            await verifyExactAbsence(client, existing); await verifyBaseline(client, existing.baseline);
            const recovered = sealArtifact({ ...artifactWithoutFingerprint(existing), status: "recovered", ownershipVerdict: "SAFE_TO_RECOVER",
              blockedReasons: [], recoveredAt: new Date().toISOString() });
            await writeArtifact(path, recovered); return reportFromArtifact(recovered, path);
          } catch { /* Partial or unrelated state is published as BLOCKED below. */ }
        }
        const blocked = await publishBlockedArtifact(path, existing, reconstructed.report.reasons);
        return { ...reconstructed.report, recoveryArtifactPath: path, recoveryStatus: blocked.status };
      }
      return reconstructed.report;
    }
    if (existing) {
      if (existing.status === "blocked" || existing.status === "checked") await writeArtifact(path, reconstructed.artifact);
      else assert(same(immutableEvidence(existing), immutableEvidence(reconstructed.artifact)), "Database ownership differs from the recovery-commit evidence; recovery blocked");
    } else await writeArtifact(path, reconstructed.artifact);
    return { ...reconstructed.report, recoveryArtifactPath: path,
      recoveryStatus: existing?.status === "recovery_commit_unknown" ? "recovery_commit_unknown" : "checked" };
  } finally { client.release(); }
}

function exactReturned(rows: Array<Record<string, unknown>>, expectedIds: Array<string | number>, label: string) {
  const actual = rows.map((row) => String(row.id)).sort(); const expected = expectedIds.map(String).sort();
  assert(actual.length === expected.length && actual.every((id, index) => id === expected[index]), `${label}: DELETE RETURNING exact identity mismatch; expected=${expected.join(",")} actual=${actual.join(",")}`);
}

async function deleteExact(client: Queryable, sql: string, parameters: unknown[], expectedIds: Array<string | number>, label: string) {
  const result = await client.query(sql, parameters);
  exactReturned(result.rows, expectedIds, label);
}

async function executeDeletion(client: Queryable, artifact: LegacyOrphanRecoveryArtifact) {
  for (const inspection of artifact.inspections) {
    await deleteExact(client, `DELETE FROM master_system_form_instances WHERE id=$1 AND client_uuid=$2 AND inspection_group_id=$3 AND original_created_by_user_id IS NULL AND synced_by_user_id=$4 RETURNING id`, [inspection.formInstanceId, inspection.clientUuid, inspection.inspectionGroupId, artifact.actor.id], [inspection.formInstanceId], "inspection form instance");
  }
  for (const inspection of artifact.inspections) {
    await deleteExact(client, `DELETE FROM master_system_inspections WHERE id=$1 AND job_id=$2 AND system_key='fire_alarm_detector' AND created_by_user_id=$3 RETURNING id`, [inspection.inspectionGroupId, artifact.fixture.jobId, artifact.actor.id], [inspection.inspectionGroupId], "inspection group");
  }
  await deleteExact(client, `DELETE FROM inspection_jobs WHERE id=$1 AND customer_id=$2 AND customer_configuration_revision_id=$3 AND master_template_version_id=$4 AND job_reference=$5 RETURNING id`, [artifact.fixture.jobId, artifact.fixture.customerId, artifact.fixture.revisionId, masterServiceReportV3.id, artifact.reference], [artifact.fixture.jobId], "inspection job");
  for (const locationId of artifact.deletionPlan.locationIds) {
    await deleteExact(client, `DELETE FROM customer_system_locations WHERE id=$1 AND enabled_system_id=$2 RETURNING id`, [locationId, artifact.fixture.enabledSystemId], [locationId], "configured location");
  }
  await deleteExact(client, `DELETE FROM customer_system_zones WHERE id=$1 AND enabled_system_id=$2 RETURNING id`, [artifact.fixture.zoneId, artifact.fixture.enabledSystemId], [artifact.fixture.zoneId], "configured zone");
  await deleteExact(client, `DELETE FROM customer_enabled_systems WHERE id=$1 AND configuration_revision_id=$2 AND template_version_id=$3 AND system_key='fire_alarm_detector' RETURNING id`, [artifact.fixture.enabledSystemId, artifact.fixture.revisionId, masterServiceReportV3.id], [artifact.fixture.enabledSystemId], "enabled system");
  await deleteExact(client, `DELETE FROM customer_configuration_revisions WHERE id=$1 AND customer_id=$2 AND template_version_id=$3 AND revision=1 AND status='active' RETURNING id`, [artifact.fixture.revisionId, artifact.fixture.customerId, masterServiceReportV3.id], [artifact.fixture.revisionId], "configuration revision");
  await deleteExact(client, `DELETE FROM customers WHERE id=$1 AND customer_code=$2 AND display_name='Acceptance Fire Alarm V3' AND is_demo=true RETURNING id`, [artifact.fixture.customerId, artifact.reference], [artifact.fixture.customerId], "customer");
  for (const auditId of artifact.deletionPlan.auditEventIds) {
    await deleteExact(client, `DELETE FROM audit_events WHERE id=$1 AND actor_user_id=$2 RETURNING id`, [auditId, artifact.actor.id], [auditId], "audit event");
  }
  for (const sessionId of artifact.deletionPlan.sessionIds) {
    await deleteExact(client, `DELETE FROM user_sessions WHERE id=$1 AND user_id=$2 RETURNING id`, [sessionId, artifact.actor.id], [sessionId], "actor session");
  }
  await deleteExact(client, `DELETE FROM users WHERE id=$1 AND username=$2 AND role='inspector' AND is_active=true RETURNING id`, [artifact.actor.id, artifact.actor.username], [artifact.actor.id], "acceptance actor");
}

async function verifyExactAbsence(client: Queryable, artifact: LegacyOrphanRecoveryArtifact) {
  const result = await client.query(`SELECT
    (SELECT count(*) FROM inspection_jobs WHERE id=$1 OR job_reference=$2)+
    (SELECT count(*) FROM customers WHERE id=$3 OR customer_code=$2)+
    (SELECT count(*) FROM customer_configuration_revisions WHERE id=$4)+
    (SELECT count(*) FROM customer_enabled_systems WHERE id=$5)+
    (SELECT count(*) FROM customer_system_zones WHERE id=$6)+
    (SELECT count(*) FROM customer_system_locations WHERE id=ANY($7::uuid[]))+
    (SELECT count(*) FROM master_system_inspections WHERE job_id=$1 OR id=ANY($8::uuid[]))+
    (SELECT count(*) FROM master_system_form_instances WHERE id=ANY($9::uuid[]) OR inspection_group_id=ANY($8::uuid[]))+
    (SELECT count(*) FROM inspections WHERE job_id=$1)+
    (SELECT count(*) FROM users WHERE id=$10 OR username=$11)+
    (SELECT count(*) FROM user_sessions WHERE id=ANY($12::bigint[]) OR user_id=$10)+
    (SELECT count(*) FROM audit_events WHERE id=ANY($13::bigint[]) OR actor_user_id=$10) AS count`,
  [artifact.fixture.jobId, artifact.reference, artifact.fixture.customerId, artifact.fixture.revisionId, artifact.fixture.enabledSystemId,
    artifact.fixture.zoneId, artifact.deletionPlan.locationIds, artifact.deletionPlan.inspectionGroupIds,
    artifact.deletionPlan.inspectionFormInstanceIds, artifact.actor.id, artifact.actor.username,
    artifact.deletionPlan.sessionIds, artifact.deletionPlan.auditEventIds]);
  assert(Number(result.rows[0]?.count ?? -1) === 0, "Fresh post-COMMIT proof found exact run-owned rows; recovery state remains unresolved");
}

export async function recoverLegacyOrphanFireAlarm(runId: string, directory?: string, options: RecoveryOptions = {}) {
  validateRunId(runId);
  await assertNormalManifestAbsent(runId, directory);
  const loaded = await readArtifact(runId, directory); let artifact = loaded.artifact;
  if (artifact.status === "blocked" || artifact.ownershipVerdict !== "SAFE_TO_RECOVER") {
    throw new Error(`Legacy orphan recovery is BLOCKED by the authoritative artifact: ${artifact.blockedReasons.map((reason) => reason.code).join(",")}`);
  }
  if (artifact.status === "recovered") {
    const client = await pool.connect();
    try { await verifyExactAbsence(client, artifact); await verifyBaseline(client, artifact.baseline); }
    finally { client.release(); }
    return { status: "recovered" as const, alreadyRecovered: true, recoveryArtifactPath: loaded.path };
  }
  const preflight = await pool.connect();
  try {
    try {
      const reconstruction = await reconstruct(preflight, runId);
      if (!reconstruction.artifact) {
        await verifyExactAbsence(preflight, artifact); await verifyBaseline(preflight, artifact.baseline);
        const recovered = sealArtifact({ ...artifactWithoutFingerprint(artifact), status: "recovered", recoveredAt: new Date().toISOString() });
        await writeArtifact(loaded.path, recovered);
        return { status: "recovered" as const, alreadyRecovered: true, recoveryArtifactPath: loaded.path };
      }
      assert(same(immutableEvidence(artifact), immutableEvidence(reconstruction.artifact)), "Fresh database ownership differs from checked recovery artifact");
    } catch (error) {
      if (error instanceof Error && /Fresh post-COMMIT proof/.test(error.message)) throw new Error("Legacy orphan recovery is BLOCKED: database state is missing, partial, or differs from the checked artifact");
      throw error;
    }
  } finally { preflight.release(); }
  artifact = sealArtifact({ ...artifactWithoutFingerprint(artifact), status: "recovery_commit_unknown", recoveredAt: null });
  await writeArtifact(loaded.path, artifact);
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const reconstruction = await reconstruct(client, runId);
    assert(reconstruction.artifact && same(immutableEvidence(artifact), immutableEvidence(reconstruction.artifact)), "Transactional ownership reconstruction differs from checked recovery artifact");
    await testHooks.beforeDelete?.(client, artifact);
    await executeDeletion(client, artifact);
    await verifyExactAbsence(client, artifact);
    await verifyBaseline(client, artifact.baseline);
    if (options.failBeforeCommit) throw new Error("Controlled legacy orphan recovery failure before commit");
    await client.query("COMMIT"); committed = true;
    if (options.failAfterCommit) throw new Error("Controlled legacy orphan recovery failure after commit");
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
  await testHooks.afterCommit?.(artifact);
  const proof = await pool.connect();
  try { await verifyExactAbsence(proof, artifact); await verifyBaseline(proof, artifact.baseline); }
  finally { proof.release(); }
  const recovered = sealArtifact({ ...artifactWithoutFingerprint(artifact), status: "recovered", recoveredAt: new Date().toISOString() });
  await writeArtifact(loaded.path, recovered);
  return { status: "recovered" as const, alreadyRecovered: false, recoveryArtifactPath: loaded.path };
}
