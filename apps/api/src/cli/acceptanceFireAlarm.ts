import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { hashPassword } from "../auth/passwords.js";
import { pool } from "../db/pool.js";
import { masterServiceReportV3, fireAlarmDetectorV3 } from "../inspections/templates/masterServiceReportV3.js";
import { currentUser } from "../middleware/currentUser.js";
import { authRouter } from "../routes/auth.js";
import { inspectionJobsRouter } from "../routes/inspectionJobs.js";
import { checkLegacyOrphanFireAlarm, recoverLegacyOrphanFireAlarm } from "./legacyOrphanFireAlarmRecovery.js";

const runIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fixturePrefix = "ACCEPTANCE-FIRE-";
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const defaultManifestDirectory = resolve(sourceRoot, "runtime", "acceptance-fire-alarm");

type FixtureIds = {
  customerId: string;
  revisionId: string;
  enabledSystemId: string;
  zoneId: string;
  primaryLocationId: string;
  secondaryLocationId: string;
  jobId: string;
};

type Baseline = {
  template: { id: string; code: string; version: number; publicationStatus: string; definition: unknown };
  demoJobs: Array<{ id: string; reference: string; customerId: string | null; revisionId: string | null; snapshot: unknown }>;
};

export type AcceptanceFireAlarmManifest = {
  schemaVersion: 1;
  status: "preparing" | "commit_unknown" | "db_committed" | "verified" | "cleanup_required" | "cleanup_commit_unknown" | "rolled_back" | "cleaned";
  runId: string;
  reference: string;
  actor: { id: number; username: string; role: "inspector" };
  fixture: FixtureIds;
  snapshot: Record<string, unknown>;
  inspection: null | InspectionOwnership;
  baseline: Baseline;
};

export type InspectionOwnership = {
  clientUuid: string; formInstanceId: string; inspectionGroupId: string;
  jobId: string; systemKey: "fire_alarm_detector"; templateId: string; revisionId: string; enabledSystemId: string;
  groupCreatorId: number; syncedById: number; originalCreatorSnapshot: Record<string, unknown>;
  groupCreatedAt: string; acceptedAt: string; performedAt: string; receivedAt: string;
  inspectionSnapshot: Record<string, unknown>; responsePayload: Record<string, unknown>;
  requestFingerprint: string; ownershipFingerprint: string;
};

export type SetupResult = { manifest: AcceptanceFireAlarmManifest; manifestPath: string };
type SetupOptions = {
  password: string;
  manifestDirectory?: string;
  /** Internal validator fault boundary. Never set by the operator CLI. */
  failBeforeCommit?: boolean;
  failAfterCommit?: boolean;
  verificationFault?: "after_auth" | "after_jobs";
  ambiguousCommit?: boolean;
  ambiguousFailureBeforeCommit?: boolean;
};

type CleanupOptions = { failBeforeCommit?: boolean; failAfterCommit?: boolean };
type ProbeResult = { outcome: "rows_present"; count: number } | { outcome: "rows_absent"; count: 0 } | { outcome: "indeterminate"; error: unknown };
type AcceptanceTestHooks = {
  beforeManifestReread?: (temporaryPath: string, authoritativePath: string) => Promise<void>;
  probe?: (phase: "setup_recovery" | "cleanup_preflight" | "cleanup_postcommit", actual: ProbeResult) => Promise<ProbeResult>;
  afterCleanupCommit?: (manifest: AcceptanceFireAlarmManifest) => Promise<void>;
};
let testHooks: AcceptanceTestHooks = {};
/** Test-only fault hooks. Production callers never set these. */
export function setAcceptanceFireAlarmTestHooks(hooks: AcceptanceTestHooks) { testHooks = hooks; }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function jsonEqual(left: unknown, right: unknown) {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function manifestDirectory(directory?: string) {
  return resolve(directory ?? process.env.ACCEPTANCE_FIRE_ALARM_MANIFEST_DIR
    ?? (process.env.NODE_ENV === "production" ? "/srv/operational/acceptance-fire-alarm" : defaultManifestDirectory));
}

function manifestPath(runId: string, directory?: string) {
  validateRunId(runId);
  return resolve(manifestDirectory(directory), `${runId}.json`);
}

function validateRunId(runId: string) {
  if (!runIdPattern.test(runId)) throw new Error("Acceptance run ID must be a UUID");
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deterministicUuid(runId: string, label: keyof FixtureIds) {
  const bytes = createHash("sha256").update(`acceptance-fire-alarm:${runId}:${label}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function fixtureIds(runId: string): FixtureIds {
  return {
    customerId: deterministicUuid(runId, "customerId"),
    revisionId: deterministicUuid(runId, "revisionId"),
    enabledSystemId: deterministicUuid(runId, "enabledSystemId"),
    zoneId: deterministicUuid(runId, "zoneId"),
    primaryLocationId: deterministicUuid(runId, "primaryLocationId"),
    secondaryLocationId: deterministicUuid(runId, "secondaryLocationId"),
    jobId: deterministicUuid(runId, "jobId")
  };
}

function validFixtureIds(value: unknown, runId: string): value is FixtureIds {
  return record(value) && exactKeys(value, ["customerId", "revisionId", "enabledSystemId", "zoneId", "primaryLocationId", "secondaryLocationId", "jobId"])
    && jsonEqual(value, fixtureIds(runId));
}

const manifestStatuses: AcceptanceFireAlarmManifest["status"][] = ["preparing", "commit_unknown", "db_committed", "verified", "cleanup_required", "cleanup_commit_unknown", "rolled_back", "cleaned"];
const statusTransitions: Record<AcceptanceFireAlarmManifest["status"], AcceptanceFireAlarmManifest["status"][]> = {
  preparing: ["preparing", "commit_unknown", "db_committed", "rolled_back"],
  commit_unknown: ["commit_unknown", "db_committed", "rolled_back"],
  db_committed: ["db_committed", "verified", "cleanup_required"],
  verified: ["verified", "cleanup_required"],
  cleanup_required: ["cleanup_required", "cleanup_commit_unknown", "cleaned"],
  cleanup_commit_unknown: ["cleanup_commit_unknown", "cleanup_required", "cleaned"],
  rolled_back: ["rolled_back", "cleaned"], cleaned: ["cleaned"]
};

function ownershipFingerprint(value: Omit<InspectionOwnership, "ownershipFingerprint">) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function computeAcceptanceRequestFingerprint(evidence: Omit<InspectionOwnership, "ownershipFingerprint">) {
  const accepted = evidence.inspectionSnapshot; assert(record(accepted.job) && record(accepted.customer) && record(accepted.configuration)
    && record(accepted.template) && record(accepted.system), "Accepted inspection snapshot cannot produce a request fingerprint");
  const system = structuredClone(accepted.system); delete system.definition; delete system.resolvedControls; delete system.repetitionMode;
  const authority = { job: accepted.job, customer: accepted.customer, configuration: accepted.configuration, template: accepted.template, system };
  return createHash("sha256").update(canonicalJson({ clientUuid: evidence.clientUuid, jobId: evidence.jobId, systemKey: "fire_alarm_detector",
    instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, authority,
    responses: evidence.responsePayload, performedAt: evidence.performedAt, originalCreatorSnapshot: evidence.originalCreatorSnapshot,
    actorUserId: evidence.syncedById })).digest("hex");
}

export function sealAcceptanceInspectionOwnership(evidence: Omit<InspectionOwnership, "ownershipFingerprint">): InspectionOwnership {
  return { ...structuredClone(evidence), ownershipFingerprint: ownershipFingerprint(evidence) };
}

function validInspectionOwnership(value: unknown): value is InspectionOwnership {
  if (!record(value) || !exactKeys(value, ["clientUuid", "formInstanceId", "inspectionGroupId", "jobId", "systemKey", "templateId", "revisionId", "enabledSystemId", "groupCreatorId", "syncedById", "originalCreatorSnapshot", "groupCreatedAt", "acceptedAt", "performedAt", "receivedAt", "inspectionSnapshot", "responsePayload", "requestFingerprint", "ownershipFingerprint"])) return false;
  const uuidKeys = ["clientUuid", "formInstanceId", "inspectionGroupId", "jobId", "templateId", "revisionId", "enabledSystemId"];
  const timestampKeys = ["groupCreatedAt", "acceptedAt", "performedAt", "receivedAt"];
  if (!uuidKeys.every((key) => typeof value[key] === "string" && runIdPattern.test(value[key] as string))
    || value.systemKey !== "fire_alarm_detector" || !Number.isSafeInteger(value.groupCreatorId) || Number(value.groupCreatorId) <= 0
    || !Number.isSafeInteger(value.syncedById) || Number(value.syncedById) <= 0
    || !timestampKeys.every((key) => typeof value[key] === "string" && new Date(value[key] as string).toISOString() === value[key])
    || !record(value.originalCreatorSnapshot) || !record(value.inspectionSnapshot) || !record(value.responsePayload)
    || typeof value.requestFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(value.requestFingerprint)
    || typeof value.ownershipFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(value.ownershipFingerprint)) return false;
  const { ownershipFingerprint: actual, ...evidence } = value as unknown as InspectionOwnership;
  try { return evidence.requestFingerprint === computeAcceptanceRequestFingerprint(evidence) && actual === ownershipFingerprint(evidence); }
  catch { return false; }
}

function validateManifest(value: unknown): AcceptanceFireAlarmManifest {
  if (!record(value) || !exactKeys(value, ["schemaVersion", "status", "runId", "reference", "actor", "fixture", "snapshot", "inspection", "baseline"])
    || value.schemaVersion !== 1 || !manifestStatuses.includes(value.status as AcceptanceFireAlarmManifest["status"])
    || typeof value.runId !== "string" || !runIdPattern.test(value.runId)
    || value.reference !== `${fixturePrefix}${value.runId}` || !record(value.actor)
    || !exactKeys(value.actor, ["id", "username", "role"])
    || !Number.isSafeInteger(value.actor.id) || Number(value.actor.id) <= 0
    || value.actor.username !== `acceptance-fire-${value.runId}` || value.actor.role !== "inspector"
    || !validFixtureIds(value.fixture, value.runId) || !record(value.snapshot) || !record(value.baseline)
    || !(value.inspection === null || validInspectionOwnership(value.inspection))) {
    throw new Error("Acceptance manifest is malformed or tampered");
  }
  const baseline = value.baseline as unknown as Baseline;
  if (!exactKeys(baseline, ["template", "demoJobs"]) || !record(baseline.template)
    || !exactKeys(baseline.template, ["id", "code", "version", "publicationStatus", "definition"])
    || baseline.template.id !== masterServiceReportV3.id || baseline.template.code !== "MFE-FSSR"
    || baseline.template.version !== 3 || baseline.template.publicationStatus !== "published"
    || !jsonEqual(baseline.template.definition, fireAlarmDetectorV3) || !Array.isArray(baseline.demoJobs)
    || !baseline.demoJobs.every((job) => record(job) && exactKeys(job, ["id", "reference", "customerId", "revisionId", "snapshot"])
      && typeof job.id === "string" && runIdPattern.test(job.id) && typeof job.reference === "string"
      && (job.customerId === null || (typeof job.customerId === "string" && runIdPattern.test(job.customerId)))
      && (job.revisionId === null || (typeof job.revisionId === "string" && runIdPattern.test(job.revisionId)))
      && (job.snapshot === null || record(job.snapshot)))
    || new Set(baseline.demoJobs.map((job) => String((job as Record<string, unknown>).id))).size !== baseline.demoJobs.length
    || !jsonEqual(value.snapshot, fixtureSnapshot(value.runId, value.fixture))) throw new Error("Acceptance manifest baseline or snapshot is malformed or tampered");
  const manifest = value as unknown as AcceptanceFireAlarmManifest;
  if (manifest.inspection) {
    const owned = manifest.inspection; const creator = owned.originalCreatorSnapshot; const accepted = owned.inspectionSnapshot;
    if (owned.jobId !== manifest.fixture.jobId || owned.templateId !== masterServiceReportV3.id || owned.revisionId !== manifest.fixture.revisionId
      || owned.enabledSystemId !== manifest.fixture.enabledSystemId || owned.groupCreatorId !== manifest.actor.id || owned.syncedById !== manifest.actor.id
      || !exactKeys(creator, ["source", "userId", "username", "role", "capturedAt"]) || creator.source !== "device_reported"
      || creator.userId !== manifest.actor.id || creator.username !== manifest.actor.username || creator.role !== "inspector"
      || !record(accepted.job) || accepted.job.id !== manifest.fixture.jobId || !record(accepted.configuration)
      || accepted.configuration.revisionId !== manifest.fixture.revisionId || !record(accepted.system)
      || accepted.system.systemKey !== "fire_alarm_detector" || accepted.system.enabledSystemId !== manifest.fixture.enabledSystemId
      || accepted.acceptedAt !== owned.acceptedAt) throw new Error("Acceptance inspection manifest binding is malformed or tampered");
  }
  return manifest;
}

/** Test boundary for the exact authoritative parser used by publication and cleanup. */
export function parseAcceptanceManifestForTest(value: unknown) { return validateManifest(structuredClone(value)); }

function validateStatusTransition(previous: AcceptanceFireAlarmManifest | undefined, next: AcceptanceFireAlarmManifest) {
  if (!previous) { assert(next.status === "preparing", "Initial acceptance manifest must be preparing"); return; }
  assert(previous.runId === next.runId && previous.reference === next.reference && jsonEqual(previous.actor, next.actor)
    && jsonEqual(previous.fixture, next.fixture) && jsonEqual(previous.snapshot, next.snapshot) && jsonEqual(previous.baseline, next.baseline), "Acceptance manifest immutable identity changed");
  assert(statusTransitions[previous.status].includes(next.status), `Invalid acceptance manifest status transition ${previous.status} -> ${next.status}`);
  if (previous.inspection) assert(jsonEqual(previous.inspection, next.inspection), "Acceptance inspection ownership cannot be replaced or removed");
  else if (next.inspection) assert(next.status === "cleanup_required" || next.status === "cleanup_commit_unknown", "Acceptance inspection ownership may only be captured during cleanup recovery");
}

async function readManifest(runId: string, directory?: string) {
  const path = manifestPath(runId, directory);
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(path, "utf8")); }
  catch { throw new Error("Acceptance manifest is missing or unreadable"); }
  const manifest = validateManifest(parsed);
  assert(manifest.runId === runId, "Acceptance manifest run identity does not match its filename");
  return { manifest, path };
}

async function writeManifest(path: string, manifest: AcceptanceFireAlarmManifest) {
  const intended = validateManifest(structuredClone(manifest));
  assert(basename(path) === `${intended.runId}.json`, "Acceptance manifest filename does not match run identity");
  let previous: AcceptanceFireAlarmManifest | undefined;
  try { previous = validateManifest(JSON.parse(await readFile(path, "utf8"))); }
  catch (error) {
    if (!(record(error) && error.code === "ENOENT")) throw new Error("Existing acceptance manifest is unreadable or tampered");
  }
  if (previous) assert(previous.runId === intended.runId, "Existing acceptance manifest filename/run binding is invalid");
  validateStatusTransition(previous, intended);
  const contents = `${JSON.stringify(intended, null, 2)}\n`;
  if (/password|token|secret/i.test(contents)) throw new Error("Acceptance manifest must not contain credentials");
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(contents, "utf8");
      await file.sync();
    } finally { await file.close(); }
    await testHooks.beforeManifestReread?.(temporary, path);
    let reread: AcceptanceFireAlarmManifest;
    try { reread = validateManifest(JSON.parse(await readFile(temporary, "utf8"))); }
    catch { throw new Error("Temporary acceptance manifest failed authoritative validation"); }
    assert(reread.runId === intended.runId && reread.status === intended.status && jsonEqual(reread, intended), "Temporary acceptance manifest differs from intended publication");
    await rename(temporary, path);
    const directory = await open(dirname(path), "r");
    try { await directory.sync(); }
    finally { await directory.close(); }
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

/** Test-only entry point for the exact production publication boundary. */
export async function publishAcceptanceManifestForTest(path: string, manifest: AcceptanceFireAlarmManifest) { await writeManifest(path, manifest); }

function fixtureSnapshot(runId: string, ids: FixtureIds) {
  const primary = {
    id: ids.primaryLocationId, enabledSystemId: ids.enabledSystemId, zoneId: ids.zoneId,
    key: "primary-panel", displayName: "Acceptance Main Panel", presetRowCount: 1,
    rowPreset: { fireAlarmTable: "primary", assetReference: `${fixturePrefix}${runId}-P` }, sortOrder: 1
  };
  const secondary = {
    id: ids.secondaryLocationId, enabledSystemId: ids.enabledSystemId, zoneId: null,
    key: "secondary-bell", displayName: "Acceptance Alarm Bell", presetRowCount: 1,
    rowPreset: { fireAlarmTable: "secondary", assetReference: `${fixturePrefix}${runId}-S` }, sortOrder: 2
  };
  return {
    schemaVersion: 1,
    customer: { id: ids.customerId, code: `${fixturePrefix}${runId}`, displayName: "Acceptance Fire Alarm V3" },
    configuration: { revisionId: ids.revisionId, revisionNumber: 1 },
    template: { id: masterServiceReportV3.id, code: "MFE-FSSR", name: masterServiceReportV3.name, version: 3 },
    enabledSystems: [{
      enabledSystemId: ids.enabledSystemId, systemKey: "fire_alarm_detector",
      displayName: "Fire Alarm / Detector System", sortOrder: 5, definitionStatus: "confirmed",
      zones: [{ id: ids.zoneId, enabledSystemId: ids.enabledSystemId, key: "acceptance-zone", displayName: "Acceptance Zone", sortOrder: 1 }],
      locations: [primary, secondary]
    }]
  };
}

async function readBaseline(client: { query: Function }): Promise<Baseline> {
  const template = await client.query(`SELECT id,code,version,publication_status AS "publicationStatus",definition FROM master_service_report_templates template INNER JOIN master_service_report_systems system ON system.template_version_id=template.id WHERE template.id=$1 AND system.system_key='fire_alarm_detector'`, [masterServiceReportV3.id]);
  assert(template.rowCount === 1, "MFE-FSSR V3 Fire Alarm template prerequisite is unavailable");
  const row = template.rows[0];
  assert(row.code === "MFE-FSSR" && row.version === 3 && row.publicationStatus === "published" && jsonEqual(row.definition, fireAlarmDetectorV3), "MFE-FSSR V3 Fire Alarm definition prerequisite is not exact");
  const demoJobs = await client.query(`SELECT id,job_reference AS reference,customer_id AS "customerId",customer_configuration_revision_id AS "revisionId",configuration_snapshot AS snapshot FROM inspection_jobs WHERE is_sample=true AND position($1 in job_reference)<>1 ORDER BY id`, [fixturePrefix]);
  return { template: { id: row.id, code: row.code, version: row.version, publicationStatus: row.publicationStatus, definition: row.definition }, demoJobs: demoJobs.rows };
}

async function verifyBaseline(client: { query: Function }, baseline: Baseline) {
  const current = await readBaseline(client);
  assert(jsonEqual(current, baseline), "Unrelated demo or V3 template data changed during acceptance fixture lifecycle");
}

async function assertFixtureIdentity(client: { query: Function }, manifest: AcceptanceFireAlarmManifest) {
  const { fixture, runId, reference, actor } = manifest;
  const customer = await client.query(`SELECT id,customer_code AS code,display_name AS name,is_demo AS "isDemo",is_active AS "isActive" FROM customers WHERE id=$1`, [fixture.customerId]);
  assert(customer.rowCount === 1 && customer.rows[0].code === reference && customer.rows[0].name === "Acceptance Fire Alarm V3" && customer.rows[0].isDemo === true && customer.rows[0].isActive === true, "Acceptance customer identity does not match manifest");
  const revision = await client.query(`SELECT customer_id AS "customerId",template_version_id AS "templateId",revision,status FROM customer_configuration_revisions WHERE id=$1`, [fixture.revisionId]);
  assert(revision.rowCount === 1 && revision.rows[0].customerId === fixture.customerId && revision.rows[0].templateId === masterServiceReportV3.id && revision.rows[0].revision === 1 && revision.rows[0].status === "active", "Acceptance configuration identity does not match manifest");
  const enabled = await client.query(`SELECT configuration_revision_id AS "revisionId",template_version_id AS "templateId",system_key AS "systemKey",sort_order AS "sortOrder",system_configuration AS configuration FROM customer_enabled_systems WHERE id=$1`, [fixture.enabledSystemId]);
  assert(enabled.rowCount === 1 && enabled.rows[0].revisionId === fixture.revisionId && enabled.rows[0].templateId === masterServiceReportV3.id && enabled.rows[0].systemKey === "fire_alarm_detector" && enabled.rows[0].sortOrder === 1 && jsonEqual(enabled.rows[0].configuration, {}), "Acceptance Fire Alarm configuration identity does not match manifest");
  const snapshot = fixtureSnapshot(runId, fixture);
  const locations = await client.query(`SELECT id,enabled_system_id AS "enabledSystemId",zone_id AS "zoneId",location_key AS key,display_name AS "displayName",preset_row_count AS "presetRowCount",row_preset AS "rowPreset",sort_order AS "sortOrder" FROM customer_system_locations WHERE enabled_system_id=$1 ORDER BY sort_order`, [fixture.enabledSystemId]);
  assert(locations.rowCount === 2 && jsonEqual(locations.rows, snapshot.enabledSystems[0].locations), "Acceptance Fire Alarm configured routing does not match manifest");
  const zones = await client.query(`SELECT id,enabled_system_id AS "enabledSystemId",zone_key AS key,display_name AS "displayName",sort_order AS "sortOrder" FROM customer_system_zones WHERE enabled_system_id=$1 ORDER BY sort_order`, [fixture.enabledSystemId]);
  assert(zones.rowCount === 1 && jsonEqual(zones.rows, snapshot.enabledSystems[0].zones), "Acceptance Fire Alarm zone identity does not match manifest");
  const job = await client.query(`SELECT job_reference AS reference,title,status,is_sample AS "isSample",customer_id AS "customerId",customer_configuration_revision_id AS "revisionId",master_template_version_id AS "templateId",configuration_snapshot AS snapshot FROM inspection_jobs WHERE id=$1`, [fixture.jobId]);
  assert(job.rowCount === 1 && job.rows[0].reference === reference && job.rows[0].title === "Acceptance Fire Alarm V3" && job.rows[0].status === "open" && job.rows[0].isSample === true && job.rows[0].customerId === fixture.customerId && job.rows[0].revisionId === fixture.revisionId && job.rows[0].templateId === masterServiceReportV3.id && jsonEqual(job.rows[0].snapshot, snapshot), "Acceptance job identity does not match manifest");
  const user = await client.query(`SELECT username,role,is_active AS "isActive" FROM users WHERE id=$1`, [actor.id]);
  assert(user.rowCount === 1 && user.rows[0].username === actor.username && user.rows[0].role === actor.role && user.rows[0].isActive === true, "Acceptance actor identity does not match manifest");
}

async function assertNoUnrelatedActorWrites(client: { query: Function }, manifest: AcceptanceFireAlarmManifest) {
  const actorId = manifest.actor.id;
  const masterWrites = await client.query(`SELECT 1 FROM master_system_inspections inspection LEFT JOIN master_system_form_instances instance ON instance.inspection_group_id=inspection.id WHERE inspection.job_id<>$1 AND (inspection.created_by_user_id=$2 OR instance.original_created_by_user_id=$2 OR instance.synced_by_user_id=$2) LIMIT 1`, [manifest.fixture.jobId, actorId]);
  const legacyWrites = await client.query(`SELECT 1 FROM inspections WHERE job_id<>$1 AND created_by_user_id=$2 LIMIT 1`, [manifest.fixture.jobId, actorId]);
  const attachmentWrites = await client.query(`SELECT 1 FROM inspection_attachments attachment INNER JOIN master_system_form_instances instance ON instance.id=attachment.form_instance_id INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id WHERE inspection.job_id<>$1 AND attachment.uploaded_by_user_id=$2 LIMIT 1`, [manifest.fixture.jobId, actorId]);
  assert(masterWrites.rowCount === 0 && legacyWrites.rowCount === 0 && attachmentWrites.rowCount === 0, "Acceptance actor has activity on an unrelated job; cleanup aborted");
}

async function ownedRowsCount(client: { query: Function }, manifest: AcceptanceFireAlarmManifest) {
  const result = await client.query(`SELECT (SELECT count(*) FROM customers WHERE id=$1)+(SELECT count(*) FROM customer_configuration_revisions WHERE id=$2)+(SELECT count(*) FROM customer_enabled_systems WHERE id=$3)+(SELECT count(*) FROM customer_system_zones WHERE id=$4)+(SELECT count(*) FROM customer_system_locations WHERE id=ANY($5::uuid[]))+(SELECT count(*) FROM inspection_jobs WHERE id=$6)+(SELECT count(*) FROM master_system_inspections WHERE job_id=$6)+(SELECT count(*) FROM master_system_form_instances instance INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id WHERE inspection.job_id=$6)+(SELECT count(*) FROM inspections WHERE job_id=$6)+(SELECT count(*) FROM inspection_attachments attachment INNER JOIN master_system_form_instances instance ON instance.id=attachment.form_instance_id INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id WHERE inspection.job_id=$6)+(SELECT count(*) FROM users WHERE id=$7)+(SELECT count(*) FROM user_sessions WHERE user_id=$7)+(SELECT count(*) FROM audit_events WHERE actor_user_id=$7) AS count`, [manifest.fixture.customerId, manifest.fixture.revisionId, manifest.fixture.enabledSystemId, manifest.fixture.zoneId, [manifest.fixture.primaryLocationId, manifest.fixture.secondaryLocationId], manifest.fixture.jobId, manifest.actor.id]);
  return Number(result.rows[0]?.count ?? 0);
}

async function probeOwnedRows(manifest: AcceptanceFireAlarmManifest, phase: "setup_recovery" | "cleanup_preflight" | "cleanup_postcommit"): Promise<ProbeResult> {
  let actual: ProbeResult;
  try {
    const client = await pool.connect();
    try { const count = await ownedRowsCount(client, manifest); actual = count === 0 ? { outcome: "rows_absent", count: 0 } : { outcome: "rows_present", count }; }
    finally { client.release(); }
  } catch (error) { actual = { outcome: "indeterminate", error }; }
  return testHooks.probe ? testHooks.probe(phase, actual) : actual;
}

async function discoverOwnedInspection(client: { query: Function }, manifest: AcceptanceFireAlarmManifest) {
  const result = await client.query(`SELECT inspection.id AS "inspectionGroupId",inspection.job_id AS "jobId",inspection.system_key AS "systemKey",inspection.created_by_user_id AS "groupCreatorId",inspection.created_at AS "groupCreatedAt",instance.id AS "formInstanceId",instance.client_uuid AS "clientUuid",instance.master_template_version_id AS "templateId",instance.customer_configuration_revision_id AS "revisionId",instance.instance_key AS "instanceKey",instance.zone_id AS "zoneId",instance.location_id AS "locationId",instance.display_sequence AS "displaySequence",instance.snapshot_schema_version AS "snapshotSchemaVersion",instance.inspection_snapshot AS "inspectionSnapshot",instance.response_schema_version AS "responseSchemaVersion",instance.response_payload AS "responsePayload",instance.request_fingerprint AS "requestFingerprint",instance.status,instance.performed_at AS "performedAt",instance.original_created_by_user_id AS "creatorId",instance.original_creator_snapshot AS "creatorSnapshot",instance.synced_by_user_id AS "syncedById",instance.received_at AS "receivedAt" FROM master_system_inspections inspection LEFT JOIN master_system_form_instances instance ON instance.inspection_group_id=inspection.id WHERE inspection.job_id=$1 ORDER BY inspection.id,instance.id`, [manifest.fixture.jobId]);
  if (result.rowCount === 0) {
    assert(manifest.inspection === null, "Recorded acceptance inspection is missing; cleanup aborted");
    return null;
  }
  assert(result.rowCount === 1, "ACTIVE_INSPECTION_EXISTS: acceptance job has foreign or incomplete Fire Alarm activity; cleanup aborted");
  const row = result.rows[0];
  assert(row.jobId === manifest.fixture.jobId && row.systemKey === "fire_alarm_detector" && Number(row.groupCreatorId) === manifest.actor.id && row.formInstanceId && row.clientUuid
    && row.templateId === masterServiceReportV3.id && row.revisionId === manifest.fixture.revisionId
    && row.instanceKey === "primary" && row.zoneId === null && row.locationId === null && row.displaySequence === 1
    && row.snapshotSchemaVersion === 1 && row.responseSchemaVersion === 1 && row.status === "submitted"
    && row.creatorId === null && Number(row.syncedById) === manifest.actor.id && record(row.creatorSnapshot)
    && exactKeys(row.creatorSnapshot, ["source", "userId", "username", "role", "capturedAt"])
    && row.creatorSnapshot.source === "device_reported" && row.creatorSnapshot.userId === manifest.actor.id
    && row.creatorSnapshot.username === manifest.actor.username && row.creatorSnapshot.role === "inspector"
    && typeof row.creatorSnapshot.capturedAt === "string" && record(row.inspectionSnapshot) && record(row.responsePayload)
    && typeof row.inspectionSnapshot.acceptedAt === "string"
    && record(row.inspectionSnapshot.job) && row.inspectionSnapshot.job.id === manifest.fixture.jobId
    && record(row.inspectionSnapshot.configuration) && row.inspectionSnapshot.configuration.revisionId === manifest.fixture.revisionId
    && record(row.inspectionSnapshot.system) && row.inspectionSnapshot.system.systemKey === "fire_alarm_detector"
    && row.inspectionSnapshot.system.enabledSystemId === manifest.fixture.enabledSystemId
    && typeof row.requestFingerprint === "string" && /^[0-9a-f]{64}$/.test(row.requestFingerprint), "Acceptance inspection ownership cannot be proven; cleanup aborted");
  const iso = (value: unknown) => value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
  const evidence: Omit<InspectionOwnership, "ownershipFingerprint"> = {
    clientUuid: String(row.clientUuid), formInstanceId: String(row.formInstanceId), inspectionGroupId: String(row.inspectionGroupId),
    jobId: row.jobId, systemKey: "fire_alarm_detector", templateId: row.templateId, revisionId: row.revisionId,
    enabledSystemId: manifest.fixture.enabledSystemId, groupCreatorId: Number(row.groupCreatorId), syncedById: Number(row.syncedById),
    originalCreatorSnapshot: row.creatorSnapshot, groupCreatedAt: iso(row.groupCreatedAt), acceptedAt: iso(row.inspectionSnapshot.acceptedAt),
    performedAt: iso(row.performedAt), receivedAt: iso(row.receivedAt), inspectionSnapshot: row.inspectionSnapshot,
    responsePayload: row.responsePayload, requestFingerprint: row.requestFingerprint
  };
  const discovered = sealAcceptanceInspectionOwnership(evidence);
  assert(validInspectionOwnership(discovered), "Acceptance inspection ownership evidence is malformed");
  if (manifest.inspection) assert(jsonEqual(manifest.inspection, discovered), "Acceptance inspection identity differs from manifest; cleanup aborted");
  return discovered;
}

function sameIds(actual: unknown[], expected: unknown[]) {
  return actual.map(String).sort().join(",") === expected.map(String).sort().join(",");
}

export function requireExactSyncConfirmation(result: { acceptedIds?: unknown; duplicateIds?: unknown; failed?: unknown }, clientUuid: string) {
  assert(runIdPattern.test(clientUuid) && record(result) && exactKeys(result, ["acceptedIds", "duplicateIds", "failed"])
    && Array.isArray(result.acceptedIds) && Array.isArray(result.duplicateIds) && Array.isArray(result.failed), "Sync confirmation response is malformed");
  const accepted = result.acceptedIds; const duplicates = result.duplicateIds; const failed = result.failed;
  assert([...accepted, ...duplicates].every((id) => typeof id === "string" && runIdPattern.test(id))
    && new Set(accepted).size === accepted.length && new Set(duplicates).size === duplicates.length, "Sync confirmation membership is malformed or duplicated");
  const parsedFailures = failed.every((entry) => record(entry) && exactKeys(entry, ["id", "code", "message"])
    && typeof entry.id === "string" && runIdPattern.test(entry.id) && typeof entry.code === "string" && entry.code.length > 0
    && typeof entry.message === "string" && entry.message.length > 0);
  assert(parsedFailures && new Set(failed.map((entry) => (entry as Record<string, unknown>).id)).size === failed.length
    && failed.length === 0, "Successful acceptance sync confirmation must have no failed entries");
  const acceptedMatch = accepted.length === 1 && accepted[0] === clientUuid && duplicates.length === 0;
  const duplicateMatch = duplicates.length === 1 && duplicates[0] === clientUuid && accepted.length === 0;
  assert(acceptedMatch || duplicateMatch, "Sync response did not exclusively confirm the exact acceptance UUID");
  return acceptedMatch ? "accepted" as const : "duplicate" as const;
}

async function createVerificationServer() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(currentUser); app.use(authRouter); app.use(inspectionJobsRouter);
  app.use((_request, response) => response.status(404).json({ error: "NOT_FOUND" }));
  const server = createServer(app);
  await new Promise<void>((resolvePromise, reject) => {
    const onError = (error: Error) => { server.off("listening", onListening); reject(error); };
    const onListening = () => { server.off("error", onError); resolvePromise(); };
    server.once("error", onError); server.once("listening", onListening); server.listen(0, "127.0.0.1");
  });
  const address = server.address() as AddressInfo | null;
  assert(address !== null, "Acceptance verification listener did not start");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server) {
  await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
}

export async function verifyActorLoginAndJob(manifest: AcceptanceFireAlarmManifest, password: string, fault?: "after_auth" | "after_jobs") {
  const listener = await createVerificationServer();
  try {
    const login = await fetch(`${listener.baseUrl}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: manifest.actor.username, password }) });
    const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
    assert(login.status === 200 && typeof cookie === "string", "Disposable acceptance actor could not authenticate");
    if (fault === "after_auth") throw new Error("Controlled acceptance authentication verification failure");
    const jobs = await fetch(`${listener.baseUrl}/inspection-jobs`, { headers: { Cookie: cookie } });
    const body = await jobs.json() as { jobs?: Array<{ id?: unknown; reference?: unknown; configurationSnapshot?: unknown }> };
    const matches = Array.isArray(body.jobs) ? body.jobs.filter((job) => job.id === manifest.fixture.jobId && job.reference === manifest.reference) : [];
    assert(jobs.status === 200 && matches.length === 1, "Normal Jobs API did not return exactly one acceptance job match");
    const target = matches[0];
    const systems = record(target.configurationSnapshot) ? target.configurationSnapshot.enabledSystems : undefined;
    assert(Array.isArray(systems) && systems.length === 1 && record(systems[0]) && systems[0].systemKey === "fire_alarm_detector" && systems[0].definitionStatus === "confirmed", "Normal Jobs API acceptance target does not have exact Fire Alarm V3 configuration");
    if (fault === "after_jobs") throw new Error("Controlled acceptance Jobs API verification failure");
  } finally { await closeServer(listener.server); }
}

export async function setupAcceptanceFireAlarm(options: SetupOptions): Promise<SetupResult> {
  assert(typeof options.password === "string" && options.password.length >= 12, "ACCEPTANCE_FIRE_ALARM_PASSWORD must be at least 12 characters");
  const runId = randomUUID(); const ids = fixtureIds(runId);
  const reference = `${fixturePrefix}${runId}`; const username = `acceptance-fire-${runId}`; const path = manifestPath(runId, options.manifestDirectory);
  const client = await pool.connect(); let manifest: AcceptanceFireAlarmManifest | undefined; let committed = false; let manifestPublished = false;
  try {
    await client.query("BEGIN");
    const baseline = await readBaseline(client);
    const snapshot = fixtureSnapshot(runId, ids);
    const actorResult = await client.query(`INSERT INTO users(username,password_hash,role,is_active) VALUES($1,$2,'inspector',true) RETURNING id`, [username, await hashPassword(options.password)]);
    const actorId = Number(actorResult.rows[0]?.id); assert(Number.isSafeInteger(actorId) && actorId > 0, "Disposable acceptance actor was not created");
    await client.query(`INSERT INTO customers(id,customer_code,display_name,is_demo,is_active) VALUES($1,$2,'Acceptance Fire Alarm V3',true,true)`, [ids.customerId, reference]);
    await client.query(`INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')`, [ids.revisionId, ids.customerId, masterServiceReportV3.id]);
    await client.query(`INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'fire_alarm_detector',1,'{}'::jsonb)`, [ids.enabledSystemId, ids.revisionId, masterServiceReportV3.id]);
    await client.query(`INSERT INTO customer_system_zones(id,enabled_system_id,zone_key,display_name,sort_order) VALUES($1,$2,'acceptance-zone','Acceptance Zone',1)`, [ids.zoneId, ids.enabledSystemId]);
    await client.query(`INSERT INTO customer_system_locations(id,enabled_system_id,zone_id,location_key,display_name,preset_row_count,row_preset,sort_order) VALUES($1,$2,$3,'primary-panel','Acceptance Main Panel',1,$4,1),($5,$2,NULL,'secondary-bell','Acceptance Alarm Bell',1,$6,2)`, [ids.primaryLocationId, ids.enabledSystemId, ids.zoneId, snapshot.enabledSystems[0].locations[0].rowPreset, ids.secondaryLocationId, snapshot.enabledSystems[0].locations[1].rowPreset]);
    await client.query(`INSERT INTO inspection_jobs(id,template_id,master_template_version_id,job_reference,title,status,is_sample,customer_id,customer_configuration_revision_id,configuration_snapshot) VALUES($1,NULL,$2,$3,'Acceptance Fire Alarm V3','open',true,$4,$5,$6)`, [ids.jobId, masterServiceReportV3.id, reference, ids.customerId, ids.revisionId, snapshot]);
    manifest = { schemaVersion: 1, status: "preparing", runId, reference, actor: { id: actorId, username, role: "inspector" }, fixture: ids, snapshot, inspection: null, baseline };
    await assertFixtureIdentity(client, manifest);
    await writeManifest(path, manifest);
    manifestPublished = true;
    if (options.failBeforeCommit) throw new Error("Controlled acceptance setup failure before commit");
    if (options.ambiguousFailureBeforeCommit) throw new Error("Acceptance COMMIT failed with an ambiguous outcome");
    await client.query("COMMIT");
    committed = true;
    if (options.ambiguousCommit) throw new Error(`Acceptance commit outcome was ambiguous; run cleanup ${runId}`);
    manifest = { ...manifest, status: "db_committed" }; await writeManifest(path, manifest);
    if (options.failAfterCommit) throw new Error(`Acceptance fixture committed but unverified; run cleanup ${runId}`);
    await verifyActorLoginAndJob(manifest, options.password, options.verificationFault);
    manifest = { ...manifest, status: "verified" }; await writeManifest(path, manifest);
    return { manifest, manifestPath: path };
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    if (!manifest || !manifestPublished) throw error;
    if (committed && !options.ambiguousCommit) {
      await writeManifest(path, { ...manifest, status: "db_committed" });
      throw new Error(`Acceptance fixture is committed but unverified; retry setup ${manifest.runId} or cleanup ${manifest.runId}`);
    }
    const probe = await probeOwnedRows(manifest, "setup_recovery");
    if (probe.outcome === "indeterminate") {
      await writeManifest(path, { ...manifest, status: "commit_unknown" });
      throw new Error(`Acceptance commit outcome remains unresolved; retry setup or cleanup ${manifest.runId}`);
    }
    if (probe.outcome === "rows_present") {
      await writeManifest(path, { ...manifest, status: "db_committed" });
      throw new Error(`Acceptance fixture is committed but unverified; retry setup ${manifest.runId} or cleanup ${manifest.runId}`);
    }
    await writeManifest(path, { ...manifest, status: "rolled_back" });
    throw error;
  } finally { client.release(); }
}

async function resolveCommitState(manifest: AcceptanceFireAlarmManifest, path: string) {
  if (manifest.status !== "preparing" && manifest.status !== "commit_unknown") return manifest;
  const probe = await probeOwnedRows(manifest, "setup_recovery");
  if (probe.outcome === "indeterminate") {
    const unresolved = { ...manifest, status: "commit_unknown" as const }; await writeManifest(path, unresolved);
    throw new Error(`Acceptance commit outcome remains unresolved; retry later ${manifest.runId}`);
  }
  const resolved = { ...manifest, status: probe.outcome === "rows_present" ? "db_committed" as const : "rolled_back" as const };
  await writeManifest(path, resolved); return resolved;
}

export async function retryAcceptanceFireAlarmSetup(runId: string, directory: string | undefined, password: string) {
  const loaded = await readManifest(runId, directory); const manifest = await resolveCommitState(loaded.manifest, loaded.path);
  assert(manifest.status === "db_committed" || manifest.status === "verified", "Only a proven committed acceptance run can be retried");
  const client = await pool.connect(); try { await assertFixtureIdentity(client, manifest); } finally { client.release(); }
  await verifyActorLoginAndJob(manifest, password);
  const verified = { ...manifest, status: "verified" as const }; await writeManifest(loaded.path, verified);
  return { manifest: verified, manifestPath: loaded.path };
}

export async function cleanupAcceptanceFireAlarm(runId: string, directory?: string, options: CleanupOptions = {}) {
  const loaded = await readManifest(runId, directory); const path = loaded.path;
  let manifest = await resolveCommitState(loaded.manifest, path);
  if (manifest.status === "cleaned") {
    const proof = await probeOwnedRows(manifest, "cleanup_postcommit");
    assert(proof.outcome === "rows_absent", "Cleaned acceptance manifest cannot be confirmed absent"); return;
  }
  if (manifest.status === "db_committed" || manifest.status === "verified") {
    manifest = { ...manifest, status: "cleanup_required" }; await writeManifest(path, manifest);
  }
  assert(manifest.status === "cleanup_required" || manifest.status === "cleanup_commit_unknown" || manifest.status === "rolled_back", "Acceptance manifest is not eligible for cleanup");
  const preflight = await probeOwnedRows(manifest, "cleanup_preflight");
  if (preflight.outcome === "indeterminate") throw new Error("Acceptance cleanup preflight is indeterminate; recovery manifest preserved");
  if (preflight.outcome === "rows_absent") {
    const baselineClient = await pool.connect(); try { await verifyBaseline(baselineClient, manifest.baseline); } finally { baselineClient.release(); }
    const finalProof = await probeOwnedRows(manifest, "cleanup_postcommit");
    assert(finalProof.outcome === "rows_absent", "Acceptance cleanup cannot finalize without a fresh exact absence proof");
    await writeManifest(path, { ...manifest, status: "cleaned" }); return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertFixtureIdentity(client, manifest);
    await assertNoUnrelatedActorWrites(client, manifest);
    const legacyInspections = await client.query(`SELECT id,created_by_user_id AS "creatorId" FROM inspections WHERE job_id=$1`, [manifest.fixture.jobId]);
    assert(legacyInspections.rowCount === 0, "ACTIVE_INSPECTION_EXISTS: acceptance job has foreign legacy activity; cleanup aborted");
    const inspection = await discoverOwnedInspection(client, manifest);
    if (inspection && manifest.inspection === null) { manifest = { ...manifest, inspection }; await writeManifest(path, manifest); }
    const attachments = await client.query(`SELECT count(*)::int AS count FROM inspection_attachments attachment INNER JOIN master_system_form_instances instance ON instance.id=attachment.form_instance_id INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id WHERE inspection.job_id=$1`, [manifest.fixture.jobId]);
    assert(attachments.rows[0]?.count === 0, "Fire Alarm acceptance fixture unexpectedly has attachment rows; cleanup aborted");
    if (inspection) {
      const deletedForm = await client.query(`DELETE FROM master_system_form_instances WHERE id=$1 AND client_uuid=$2 AND inspection_group_id=$3 AND original_created_by_user_id IS NULL AND synced_by_user_id=$4 RETURNING id,client_uuid`, [inspection.formInstanceId, inspection.clientUuid, inspection.inspectionGroupId, manifest.actor.id]);
      assert(deletedForm.rowCount === 1 && deletedForm.rows[0].id === inspection.formInstanceId && deletedForm.rows[0].client_uuid === inspection.clientUuid, "Acceptance form deletion did not match the recorded identity");
      const deletedGroup = await client.query(`DELETE FROM master_system_inspections WHERE id=$1 AND job_id=$2 AND system_key='fire_alarm_detector' AND created_by_user_id=$3 RETURNING id`, [inspection.inspectionGroupId, manifest.fixture.jobId, manifest.actor.id]);
      assert(deletedGroup.rowCount === 1 && deletedGroup.rows[0].id === inspection.inspectionGroupId, "Acceptance inspection-group deletion did not match the recorded identity");
    }
    const deletedJob = await client.query(`DELETE FROM inspection_jobs WHERE id=$1 AND customer_id=$2 AND customer_configuration_revision_id=$3 AND job_reference=$4 RETURNING id`, [manifest.fixture.jobId, manifest.fixture.customerId, manifest.fixture.revisionId, manifest.reference]); assert(deletedJob.rowCount === 1 && deletedJob.rows[0].id === manifest.fixture.jobId, "Acceptance job deletion did not match");
    const deletedLocations = await client.query(`DELETE FROM customer_system_locations WHERE id=ANY($1::uuid[]) AND enabled_system_id=$2 RETURNING id`, [[manifest.fixture.primaryLocationId, manifest.fixture.secondaryLocationId], manifest.fixture.enabledSystemId]); assert(deletedLocations.rowCount === 2 && sameIds(deletedLocations.rows.map((row: { id: string }) => row.id), [manifest.fixture.primaryLocationId, manifest.fixture.secondaryLocationId]), "Acceptance location deletion did not match");
    const deletedZone = await client.query(`DELETE FROM customer_system_zones WHERE id=$1 AND enabled_system_id=$2 RETURNING id`, [manifest.fixture.zoneId, manifest.fixture.enabledSystemId]); assert(deletedZone.rowCount === 1 && deletedZone.rows[0].id === manifest.fixture.zoneId, "Acceptance zone deletion did not match");
    const deletedSystem = await client.query(`DELETE FROM customer_enabled_systems WHERE id=$1 AND configuration_revision_id=$2 AND system_key='fire_alarm_detector' RETURNING id`, [manifest.fixture.enabledSystemId, manifest.fixture.revisionId]); assert(deletedSystem.rowCount === 1 && deletedSystem.rows[0].id === manifest.fixture.enabledSystemId, "Acceptance system deletion did not match");
    const deletedRevision = await client.query(`DELETE FROM customer_configuration_revisions WHERE id=$1 AND customer_id=$2 AND template_version_id=$3 RETURNING id`, [manifest.fixture.revisionId, manifest.fixture.customerId, masterServiceReportV3.id]); assert(deletedRevision.rowCount === 1 && deletedRevision.rows[0].id === manifest.fixture.revisionId, "Acceptance revision deletion did not match");
    const deletedCustomer = await client.query(`DELETE FROM customers WHERE id=$1 AND customer_code=$2 RETURNING id`, [manifest.fixture.customerId, manifest.reference]); assert(deletedCustomer.rowCount === 1 && deletedCustomer.rows[0].id === manifest.fixture.customerId, "Acceptance customer deletion did not match");
    const auditIds = (await client.query(`SELECT id FROM audit_events WHERE actor_user_id=$1`, [manifest.actor.id])).rows.map((row: { id: number }) => row.id);
    const deletedAudit = await client.query(`DELETE FROM audit_events WHERE actor_user_id=$1 RETURNING id`, [manifest.actor.id]); assert(sameIds(deletedAudit.rows.map((row: { id: number }) => row.id), auditIds), "Acceptance audit deletion did not match");
    const sessionIds = (await client.query(`SELECT id FROM user_sessions WHERE user_id=$1`, [manifest.actor.id])).rows.map((row: { id: number }) => row.id);
    const deletedSessions = await client.query(`DELETE FROM user_sessions WHERE user_id=$1 RETURNING id`, [manifest.actor.id]); assert(sameIds(deletedSessions.rows.map((row: { id: number }) => row.id), sessionIds), "Acceptance session deletion did not match");
    const deletedUser = await client.query(`DELETE FROM users WHERE id=$1 AND username=$2 AND role='inspector' RETURNING id`, [manifest.actor.id, manifest.actor.username]); assert(deletedUser.rowCount === 1 && Number(deletedUser.rows[0].id) === manifest.actor.id, "Acceptance actor deletion did not match");
    assert(await ownedRowsCount(client, manifest) === 0, "Acceptance cleanup did not remove all exact owned rows");
    await verifyBaseline(client, manifest.baseline);
    if (options.failBeforeCommit) throw new Error("Controlled acceptance cleanup failure before commit");
    await client.query("COMMIT");
    if (options.failAfterCommit) throw new Error("Controlled acceptance cleanup failure after commit");
    await testHooks.afterCleanupCommit?.(manifest);
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { client.release(); }
  const postCommit = await probeOwnedRows(manifest, "cleanup_postcommit");
  if (postCommit.outcome !== "rows_absent") {
    await writeManifest(path, { ...manifest, status: "cleanup_commit_unknown" });
    throw new Error(postCommit.outcome === "indeterminate" ? "Acceptance cleanup committed but post-commit absence proof is unavailable" : "Acceptance cleanup committed but run-owned rows remain");
  }
  await writeManifest(path, { ...manifest, status: "cleaned" });
}

async function main() {
  const [mode, runId] = process.argv.slice(2);
  if (mode === "setup" && runId === undefined) {
    const result = await setupAcceptanceFireAlarm({ password: process.env.ACCEPTANCE_FIRE_ALARM_PASSWORD ?? "" });
    console.log(JSON.stringify({ runId: result.manifest.runId, jobId: result.manifest.fixture.jobId, jobReference: result.manifest.reference, username: result.manifest.actor.username, pwaUrl: "https://localhost/", cleanupCommand: `npm run acceptance-fire-alarm -- cleanup ${result.manifest.runId}`, manifestPath: result.manifestPath }, null, 2));
    return;
  }
  if (mode === "setup" && typeof runId === "string" && process.argv.length === 4) {
    const retried = await retryAcceptanceFireAlarmSetup(runId, undefined, process.env.ACCEPTANCE_FIRE_ALARM_PASSWORD ?? ""); const verified = retried.manifest; const path = retried.manifestPath;
    console.log(JSON.stringify({ runId: verified.runId, jobId: verified.fixture.jobId, jobReference: verified.reference, username: verified.actor.username, pwaUrl: "https://localhost/", cleanupCommand: `npm run acceptance-fire-alarm -- cleanup ${verified.runId}`, manifestPath: path }, null, 2)); return;
  }
  if (mode === "cleanup" && typeof runId === "string" && process.argv.length === 4) {
    await cleanupAcceptanceFireAlarm(runId); console.log(JSON.stringify({ runId, status: "cleaned" })); return;
  }
  if (mode === "recover-orphan-check" && typeof runId === "string" && process.argv.length === 4) {
    const result = await checkLegacyOrphanFireAlarm(runId); console.log(JSON.stringify(result, null, 2));
    if (result.ownershipVerdict !== "SAFE_TO_RECOVER") process.exitCode = 2;
    return;
  }
  if (mode === "recover-orphan" && typeof runId === "string" && process.argv.length === 4) {
    const result = await recoverLegacyOrphanFireAlarm(runId); console.log(JSON.stringify({ runId, ...result }, null, 2)); return;
  }
  throw new Error("Usage: npm run acceptance-fire-alarm -- setup [run-id] | cleanup <run-id> | recover-orphan-check <run-id> | recover-orphan <run-id>");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => pool.end());
}
