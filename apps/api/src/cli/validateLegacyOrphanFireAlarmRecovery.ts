import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPassword } from "../auth/passwords.js";
import { pool } from "../db/pool.js";
import { syncFireAlarmInspections } from "../sync/fireAlarmInspectionSync.js";
import { cleanupAcceptanceFireAlarm, requireExactSyncConfirmation, setupAcceptanceFireAlarm } from "./acceptanceFireAlarm.js";
import {
  checkLegacyOrphanFireAlarm,
  parseLegacyOrphanRecoveryArtifactForTest,
  recoverLegacyOrphanFireAlarm,
  setLegacyOrphanRecoveryTestHooks,
  type LegacyOrphanRecoveryArtifact
} from "./legacyOrphanFireAlarmRecovery.js";

const password = `Legacy-orphan-validator-${randomUUID()}`;
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new Error(message); };
type Setup = Awaited<ReturnType<typeof setupAcceptanceFireAlarm>>;
const validatorRuns: Setup[] = [];

function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const item = value as Record<string, unknown>;
    return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonical(item[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }

function exactReturned(rows: Array<Record<string, unknown>>, expectedIds: Array<string | number>, label: string) {
  const actual = rows.map((row) => String(row.id)).sort(); const expected = expectedIds.map(String).sort();
  assert(actual.length === expected.length && actual.every((id, index) => id === expected[index]), `${label}: exact RETURNING identity mismatch`);
}

async function deleteExact(sql: string, parameters: unknown[], expectedIds: Array<string | number>, label: string) {
  const result = await pool.query(sql, parameters); exactReturned(result.rows, expectedIds, label);
}

async function updateExact(sql: string, parameters: unknown[], expectedIds: Array<string | number>, label: string) {
  const result = await pool.query(sql, parameters); exactReturned(result.rows, expectedIds, label);
}

async function captureRun(run: Setup) {
  const fixture = run.manifest.fixture; const actorId = run.manifest.actor.id;
  const [actor, customer, revision, system, zone, locations, job, groups, forms, sessions, audits] = await Promise.all([
    pool.query("SELECT id,username,role,is_active FROM users WHERE id=$1", [actorId]),
    pool.query("SELECT id,customer_code,display_name,is_demo,is_active FROM customers WHERE id=$1", [fixture.customerId]),
    pool.query("SELECT id,customer_id,template_version_id,revision,status FROM customer_configuration_revisions WHERE id=$1", [fixture.revisionId]),
    pool.query("SELECT id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration,evidence_policy_id FROM customer_enabled_systems WHERE id=$1", [fixture.enabledSystemId]),
    pool.query("SELECT id,enabled_system_id,zone_key,display_name,sort_order FROM customer_system_zones WHERE id=$1", [fixture.zoneId]),
    pool.query("SELECT id,enabled_system_id,zone_id,location_key,display_name,preset_row_count,row_preset,sort_order FROM customer_system_locations WHERE id=ANY($1::uuid[]) ORDER BY id", [[fixture.primaryLocationId, fixture.secondaryLocationId]]),
    pool.query("SELECT id,master_template_version_id,job_reference,title,status,is_sample,customer_id,customer_configuration_revision_id,configuration_snapshot FROM inspection_jobs WHERE id=$1", [fixture.jobId]),
    pool.query("SELECT id,job_id,system_key,created_by_user_id,created_at,updated_at FROM master_system_inspections WHERE job_id=$1 ORDER BY id", [fixture.jobId]),
    pool.query("SELECT instance.* FROM master_system_form_instances instance INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id WHERE inspection.job_id=$1 ORDER BY instance.id", [fixture.jobId]),
    pool.query("SELECT id,user_id,created_at,expires_at,revoked_at FROM user_sessions WHERE user_id=$1 ORDER BY id", [actorId]),
    pool.query("SELECT id,actor_user_id,action,entity_type,entity_id,result,reason,created_at FROM audit_events WHERE actor_user_id=$1 ORDER BY id", [actorId])
  ]);
  const snapshot = { actor: actor.rows, customer: customer.rows, revision: revision.rows, system: system.rows, zone: zone.rows,
    locations: locations.rows, job: job.rows, groups: groups.rows, forms: forms.rows, sessions: sessions.rows, audits: audits.rows };
  for (const [key, rows] of Object.entries(snapshot)) assert(rows.length > 0 || key === "groups" || key === "forms", `Run capture is missing ${key}`);
  const entityFingerprints = Object.fromEntries(Object.entries(snapshot).map(([key, rows]) => [key, fingerprint(rows)]));
  return { snapshot, entityFingerprints, fingerprint: fingerprint(snapshot) };
}

function payload(run: Setup) {
  const { manifest } = run; const { fixture, snapshot } = manifest; const clientUuid = randomUUID();
  const response = () => ({ result: "good", remarks: "" });
  return { operationId: randomUUID(), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: {
    clientUuid, jobId: fixture.jobId, systemKey: "fire_alarm_detector", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1,
    originalCreatorSnapshot: { source: "device_reported", userId: manifest.actor.id, username: manifest.actor.username, role: "inspector", capturedAt: "2026-08-10T00:00:00.000Z" },
    masterTemplate: { id: "00000000-0000-4000-8000-000000000803", code: "MFE-FSSR", version: 3 }, configuration: { revisionId: fixture.revisionId, revisionNumber: 1 }, inspectionSnapshot: snapshot,
    responses: { schemaVersion: 1, controlPanelLocation: "Acceptance Panel", primaryDeviceRows: [{ rowUuid: randomUUID(), source: "configured", configuredLocationId: fixture.primaryLocationId, configuredRowOrdinal: 1, zoneSnapshot: { id: fixture.zoneId, displayName: "Acceptance Zone" }, locationSnapshot: { id: fixture.primaryLocationId, displayName: "Acceptance Main Panel" }, displaySequence: 1, assetReference: `${manifest.reference}-P`, alarmZone: "Acceptance Zone", location: "Acceptance Main Panel", manualCallPoint: "normal", flowSwitch: "test", heatDetector: "normal", smokeDetector: "isolation", remarks: "" }], chargerAndBatteries: { main_supply: response(), battery: response(), charger: response() }, mainFunctionKeys: { main_alarm_reset: response(), lamp_test: response(), evacuate: response(), ac_supply: response(), dc_supply: response(), spka_system: response(), alarm_lift_trip: response(), signal_gas_discharge: response() }, secondaryAlarmDeviceRows: [{ rowUuid: randomUUID(), source: "configured", configuredLocationId: fixture.secondaryLocationId, configuredRowOrdinal: 1, zoneSnapshot: null, locationSnapshot: { id: fixture.secondaryLocationId, displayName: "Acceptance Alarm Bell" }, displaySequence: 1, assetReference: `${manifest.reference}-S`, location: "Acceptance Alarm Bell", alarmBell: "good", manualCallPoint: "poor", remarks: "" }], comments: "Legacy orphan recovery validator" }, performedAt: "2026-08-10T00:00:00.000Z"
  } };
}

async function expectFailure(task: () => Promise<unknown>, message: string) {
  let failure: unknown;
  try { await task(); } catch (error) { failure = error; }
  assert(failure !== undefined, message);
  return failure;
}

async function orphan(directory: string, withInspection = false) {
  const setup = await setupAcceptanceFireAlarm({ password, manifestDirectory: directory });
  validatorRuns.push(setup);
  if (withInspection) {
    const item = payload(setup);
    assert(requireExactSyncConfirmation(await syncFireAlarmInspections([item], setup.manifest.actor.id), item.entityId) === "accepted", "Validator could not create exact acceptance inspection");
  }
  await rm(setup.manifestPath);
  return setup;
}

async function assertExists(run: Setup) {
  assert((await pool.query("SELECT 1 FROM inspection_jobs WHERE id=$1", [run.manifest.fixture.jobId])).rowCount === 1, "Expected validator-owned orphan job is missing");
}

async function assertAbsent(run: Setup) {
  assert((await pool.query("SELECT 1 FROM inspection_jobs WHERE id=$1 OR job_reference=$2", [run.manifest.fixture.jobId, run.manifest.reference])).rowCount === 0, "Recovered validator orphan job remains");
}

async function assertStructuredBlocked(check: Awaited<ReturnType<typeof checkLegacyOrphanFireAlarm>>, code: string) {
  assert(check.ownershipVerdict === "BLOCKED" && check.recoveryStatus === "blocked"
    && check.reasons.some((reason) => reason.code === code) && check.recoveryArtifactPath, `${code} did not return structured BLOCKED state`);
  const artifact = parseLegacyOrphanRecoveryArtifactForTest(JSON.parse(await readFile(check.recoveryArtifactPath, "utf8")));
  assert(artifact.status === "blocked" && artifact.ownershipVerdict === "BLOCKED"
    && artifact.blockedReasons.some((reason) => reason.code === code), `${code} did not persist a non-actionable BLOCKED artifact`);
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), "inspection-legacy-orphan-fire-alarm-validator-"));
  const directory = join(root, "recovery-artifacts"); await mkdir(directory);
  let completed = false;
  try {
    const noInspection = await orphan(directory);
    const noInspectionCheck = await checkLegacyOrphanFireAlarm(noInspection.manifest.runId, directory);
    assert(noInspectionCheck.ownershipVerdict === "SAFE_TO_RECOVER" && noInspectionCheck.inspectionGroupCount === 0 && noInspectionCheck.formInstances.length === 0, "No-inspection orphan was not recoverable");
    await expectFailure(() => recoverLegacyOrphanFireAlarm(noInspection.manifest.runId, directory, { failBeforeCommit: true }), "Pre-COMMIT interruption did not fail");
    await assertExists(noInspection);
    const retry = await recoverLegacyOrphanFireAlarm(noInspection.manifest.runId, directory);
    assert(retry.status === "recovered" && !retry.alreadyRecovered, "Interrupted recovery did not retry idempotently");
    await assertAbsent(noInspection);
    assert((await recoverLegacyOrphanFireAlarm(noInspection.manifest.runId, directory)).alreadyRecovered, "Recovered orphan retry was not an idempotent no-op");
    const recoveredCheck = await checkLegacyOrphanFireAlarm(noInspection.manifest.runId, directory);
    assert(recoveredCheck.recoveryStatus === "recovered" && recoveredCheck.jobId === noInspection.manifest.fixture.jobId
      && recoveredCheck.customerId === noInspection.manifest.fixture.customerId && recoveredCheck.actorId === noInspection.manifest.actor.id,
    "Recovered dry-run report lost reconstructed exact IDs");

    const runA = await orphan(directory, true); const runB = await orphan(directory, true);
    const runBBefore = await captureRun(runB);
    assert(runBBefore.snapshot.actor.length === 1 && runBBefore.snapshot.customer.length === 1 && runBBefore.snapshot.revision.length === 1
      && runBBefore.snapshot.system.length === 1 && runBBefore.snapshot.zone.length === 1 && runBBefore.snapshot.locations.length === 2
      && runBBefore.snapshot.job.length === 1 && runBBefore.snapshot.groups.length === 1 && runBBefore.snapshot.forms.length === 1
      && runBBefore.snapshot.sessions.length > 0 && runBBefore.snapshot.audits.length > 0, "Run B full-entity isolation fixture is incomplete");
    const validInspectionCheck = await checkLegacyOrphanFireAlarm(runA.manifest.runId, directory);
    assert(validInspectionCheck.ownershipVerdict === "SAFE_TO_RECOVER" && validInspectionCheck.inspectionGroupCount === 1 && validInspectionCheck.formInstances.length === 1, "Exact acceptance inspection orphan was not recoverable");
    const artifactPath = validInspectionCheck.recoveryArtifactPath!; const authoritativeArtifact = await readFile(artifactPath, "utf8");
    const tampered = JSON.parse(authoritativeArtifact) as LegacyOrphanRecoveryArtifact; tampered.artifactFingerprint = "0".repeat(64);
    await writeFile(artifactPath, JSON.stringify(tampered), "utf8");
    await expectFailure(() => recoverLegacyOrphanFireAlarm(runA.manifest.runId, directory), "Tampered recovery artifact was accepted");
    await writeFile(artifactPath, authoritativeArtifact, "utf8");
    assert(parseLegacyOrphanRecoveryArtifactForTest(JSON.parse(authoritativeArtifact)).runId === runA.manifest.runId, "Authoritative recovery artifact parser rejected valid evidence");
    await expectFailure(() => recoverLegacyOrphanFireAlarm(runA.manifest.runId, directory, { failAfterCommit: true }), "Post-COMMIT interruption did not fail");
    await recoverLegacyOrphanFireAlarm(runA.manifest.runId, directory);
    await assertAbsent(runA); await assertExists(runB);
    const runBAfter = await captureRun(runB);
    assert(runBAfter.fingerprint === runBBefore.fingerprint && canonical(runBAfter.snapshot) === canonical(runBBefore.snapshot), "Run A recovery changed one or more exact Run B entities");
    for (const [entity, beforeFingerprint] of Object.entries(runBBefore.entityFingerprints)) {
      assert(runBAfter.entityFingerprints[entity] === beforeFingerprint, `Run A recovery changed Run B ${entity} IDs or evidence fingerprint`);
    }
    await checkLegacyOrphanFireAlarm(runB.manifest.runId, directory); await recoverLegacyOrphanFireAlarm(runB.manifest.runId, directory); await assertAbsent(runB);

    const secondActorRun = await orphan(directory, true);
    const secondActorUsername = `validation-second-actor-${randomUUID()}`;
    const secondActorResult = await pool.query(`INSERT INTO users(username,password_hash,role,is_active) VALUES($1,$2,'inspector',true) RETURNING id`, [secondActorUsername, await hashPassword(password)]);
    const secondActorId = Number(secondActorResult.rows[0].id); const foreignFormId = randomUUID(); const foreignClientUuid = randomUUID();
    await pool.query(`INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,zone_id,location_id,zone_snapshot,location_snapshot,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,original_creator_snapshot,synced_by_user_id) SELECT $1,inspection_group_id,$2,'foreign',zone_id,location_id,zone_snapshot,location_snapshot,2,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,$3,status,performed_at,$4,$5 FROM master_system_form_instances instance INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id WHERE inspection.job_id=$6`, [foreignFormId, foreignClientUuid, "e".repeat(64), { source: "device_reported", userId: secondActorId, username: secondActorUsername, role: "inspector", capturedAt: "2026-08-10T00:00:00.000Z" }, secondActorId, secondActorRun.manifest.fixture.jobId]);
    const secondActorCheck = await checkLegacyOrphanFireAlarm(secondActorRun.manifest.runId, directory);
    assert(secondActorCheck.ownershipVerdict === "BLOCKED" && secondActorCheck.reasons.some((reason) => reason.code === "INSPECTION_CHILD_COUNT_MISMATCH"), "Second-actor same-job inspection was not blocked");
    await deleteExact("DELETE FROM master_system_form_instances WHERE id=$1 RETURNING id", [foreignFormId], [foreignFormId], "foreign same-job form cleanup");
    await deleteExact("DELETE FROM users WHERE id=$1 RETURNING id", [secondActorId], [secondActorId], "foreign same-job actor cleanup");
    await checkLegacyOrphanFireAlarm(secondActorRun.manifest.runId, directory); await recoverLegacyOrphanFireAlarm(secondActorRun.manifest.runId, directory);

    const foreignAuditRun = await orphan(directory);
    const foreignAuditSafe = await checkLegacyOrphanFireAlarm(foreignAuditRun.manifest.runId, directory);
    const foreignAuditSafeArtifact = await readFile(foreignAuditSafe.recoveryArtifactPath!, "utf8");
    const foreignAuditUsername = `validation-foreign-audit-${randomUUID()}`;
    const foreignAuditActor = await pool.query(`INSERT INTO users(username,password_hash,role,is_active) VALUES($1,$2,'inspector',true) RETURNING id`, [foreignAuditUsername, await hashPassword(password)]);
    const foreignAuditActorId = Number(foreignAuditActor.rows[0].id);
    const foreignAudit = await pool.query(`INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,result,reason) VALUES($1,'sync_write','inspectionJob',$2,'success','validator foreign fixture write') RETURNING id`, [foreignAuditActorId, foreignAuditRun.manifest.fixture.jobId]);
    const foreignAuditId = Number(foreignAudit.rows[0].id);
    const foreignAuditCheck = await checkLegacyOrphanFireAlarm(foreignAuditRun.manifest.runId, directory);
    assert(foreignAuditCheck.ownershipVerdict === "BLOCKED" && foreignAuditCheck.reasons.some((reason) => reason.code === "FOREIGN_FIXTURE_AUDIT_ACTIVITY"), "Foreign actor exact-fixture audit write was not blocked");
    await expectFailure(() => recoverLegacyOrphanFireAlarm(foreignAuditRun.manifest.runId, directory), "Foreign fixture audit evidence reached destructive recovery");
    assert((await pool.query("SELECT 1 FROM audit_events WHERE id=$1 AND actor_user_id=$2", [foreignAuditId, foreignAuditActorId])).rowCount === 1, "Foreign actor audit evidence was not preserved");
    await assertExists(foreignAuditRun);
    await deleteExact("DELETE FROM audit_events WHERE id=$1 AND actor_user_id=$2 RETURNING id", [foreignAuditId, foreignAuditActorId], [foreignAuditId], "foreign fixture audit cleanup");
    await checkLegacyOrphanFireAlarm(foreignAuditRun.manifest.runId, directory);

    const actorTargetBaseline = await captureRun(foreignAuditRun);
    const actorIdAudit = await pool.query(`INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,result,reason) VALUES($1,'sync_write','user',$2,'success','validator foreign actor-id target') RETURNING id`, [foreignAuditActorId, String(foreignAuditRun.manifest.actor.id)]);
    const actorIdAuditId = Number(actorIdAudit.rows[0].id);
    const actorIdAuditCheck = await checkLegacyOrphanFireAlarm(foreignAuditRun.manifest.runId, directory);
    await assertStructuredBlocked(actorIdAuditCheck, "FOREIGN_FIXTURE_AUDIT_ACTIVITY");
    await writeFile(actorIdAuditCheck.recoveryArtifactPath!, foreignAuditSafeArtifact, "utf8");
    await expectFailure(() => recoverLegacyOrphanFireAlarm(foreignAuditRun.manifest.runId, directory), "Stale SAFE artifact bypassed foreign actor-ID target reconstruction");
    const actorIdAfter = await captureRun(foreignAuditRun);
    assert(actorIdAfter.fingerprint === actorTargetBaseline.fingerprint, "Foreign actor-ID target BLOCKED result changed the acceptance fixture");
    assert((await pool.query("SELECT 1 FROM users WHERE id=$1", [foreignAuditRun.manifest.actor.id])).rowCount === 1, "Foreign actor-ID target deleted the acceptance actor");
    assert((await pool.query("SELECT 1 FROM users WHERE id=$1", [foreignAuditActorId])).rowCount === 1, "Foreign actor-ID target deleted the foreign actor");
    assert((await pool.query("SELECT 1 FROM audit_events WHERE id=$1 AND actor_user_id=$2", [actorIdAuditId, foreignAuditActorId])).rowCount === 1, "Foreign actor-ID target audit evidence was not preserved");
    await assertExists(foreignAuditRun);
    await deleteExact("DELETE FROM audit_events WHERE id=$1 AND actor_user_id=$2 RETURNING id", [actorIdAuditId, foreignAuditActorId], [actorIdAuditId], "foreign actor-ID target audit cleanup");
    await checkLegacyOrphanFireAlarm(foreignAuditRun.manifest.runId, directory);

    const actorUsernameAudit = await pool.query(`INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,result,reason) VALUES($1,'sync_write','user',$2,'success','validator foreign actor-username target') RETURNING id`, [foreignAuditActorId, foreignAuditRun.manifest.actor.username]);
    const actorUsernameAuditId = Number(actorUsernameAudit.rows[0].id);
    const actorUsernameAuditCheck = await checkLegacyOrphanFireAlarm(foreignAuditRun.manifest.runId, directory);
    await assertStructuredBlocked(actorUsernameAuditCheck, "FOREIGN_FIXTURE_AUDIT_ACTIVITY");
    await expectFailure(() => recoverLegacyOrphanFireAlarm(foreignAuditRun.manifest.runId, directory), "Foreign actor-username target reached destructive recovery");
    const actorUsernameAfter = await captureRun(foreignAuditRun);
    assert(actorUsernameAfter.fingerprint === actorTargetBaseline.fingerprint, "Foreign actor-username target BLOCKED result changed the acceptance fixture");
    assert((await pool.query("SELECT 1 FROM users WHERE id=$1", [foreignAuditRun.manifest.actor.id])).rowCount === 1, "Foreign actor-username target deleted the acceptance actor");
    assert((await pool.query("SELECT 1 FROM users WHERE id=$1", [foreignAuditActorId])).rowCount === 1, "Foreign actor-username target deleted the foreign actor");
    assert((await pool.query("SELECT 1 FROM audit_events WHERE id=$1 AND actor_user_id=$2", [actorUsernameAuditId, foreignAuditActorId])).rowCount === 1, "Foreign actor-username target audit evidence was not preserved");
    await assertExists(foreignAuditRun);
    await deleteExact("DELETE FROM audit_events WHERE id=$1 AND actor_user_id=$2 RETURNING id", [actorUsernameAuditId, foreignAuditActorId], [actorUsernameAuditId], "foreign actor-username target audit cleanup");
    await checkLegacyOrphanFireAlarm(foreignAuditRun.manifest.runId, directory);

    const unrelatedActorIdAudit = await pool.query(`INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,result,reason) VALUES($1,'sync_write','user',$2,'success','validator unrelated actor-id target') RETURNING id`, [foreignAuditActorId, String(foreignAuditActorId)]);
    const unrelatedActorUsernameAudit = await pool.query(`INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,result,reason) VALUES($1,'sync_write','user',$2,'success','validator unrelated actor-username target') RETURNING id`, [foreignAuditActorId, foreignAuditUsername]);
    const unrelatedActorIdAuditId = Number(unrelatedActorIdAudit.rows[0].id);
    const unrelatedActorUsernameAuditId = Number(unrelatedActorUsernameAudit.rows[0].id);
    const unrelatedActorTargetCheck = await checkLegacyOrphanFireAlarm(foreignAuditRun.manifest.runId, directory);
    assert(unrelatedActorTargetCheck.ownershipVerdict === "SAFE_TO_RECOVER", "Unrelated exact actor ID/username targets falsely blocked recovery");

    const unexpectedAudit = await pool.query(`INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,result,reason) VALUES($1,'configuration_write','configurationRevision',$2,'success','validator unexpected actor activity') RETURNING id`, [foreignAuditRun.manifest.actor.id, foreignAuditRun.manifest.fixture.revisionId]);
    const unexpectedAuditId = Number(unexpectedAudit.rows[0].id);
    const unexpectedAuditCheck = await checkLegacyOrphanFireAlarm(foreignAuditRun.manifest.runId, directory);
    assert(unexpectedAuditCheck.ownershipVerdict === "BLOCKED" && unexpectedAuditCheck.reasons.some((reason) => reason.code === "AUDIT_ACTIVITY_UNPROVEN"), "Unexpected acceptance-actor audit activity was not blocked");
    await deleteExact("DELETE FROM audit_events WHERE id=$1 AND actor_user_id=$2 RETURNING id", [unexpectedAuditId, foreignAuditRun.manifest.actor.id], [unexpectedAuditId], "unexpected actor audit cleanup");
    await checkLegacyOrphanFireAlarm(foreignAuditRun.manifest.runId, directory); await recoverLegacyOrphanFireAlarm(foreignAuditRun.manifest.runId, directory);
    assert((await pool.query("SELECT 1 FROM users WHERE id=$1", [foreignAuditActorId])).rowCount === 1, "Unrelated actor target control deleted the foreign actor");
    assert((await pool.query("SELECT 1 FROM audit_events WHERE id=ANY($1::bigint[])", [[unrelatedActorIdAuditId, unrelatedActorUsernameAuditId]])).rowCount === 2, "Unrelated actor target control deleted foreign audit evidence");
    await deleteExact("DELETE FROM audit_events WHERE id=ANY($1::bigint[]) AND actor_user_id=$2 RETURNING id", [[unrelatedActorIdAuditId, unrelatedActorUsernameAuditId], foreignAuditActorId], [unrelatedActorIdAuditId, unrelatedActorUsernameAuditId], "unrelated actor target audit cleanup");
    await deleteExact("DELETE FROM users WHERE id=$1 RETURNING id", [foreignAuditActorId], [foreignAuditActorId], "foreign audit actor cleanup");

    const unrelatedWriteRun = await orphan(directory); const legacyInspectionId = randomUUID();
    await pool.query(`INSERT INTO inspections(id,client_uuid,job_id,template_id,template_version,template_snapshot,header,performed_at,created_by_user_id) VALUES($1,$2,'00000000-0000-4000-8000-000000000410','00000000-0000-4000-8000-000000000401',1,'{}'::jsonb,'{}'::jsonb,now(),$3)`, [legacyInspectionId, randomUUID(), unrelatedWriteRun.manifest.actor.id]);
    const unrelatedWriteCheck = await checkLegacyOrphanFireAlarm(unrelatedWriteRun.manifest.runId, directory);
    assert(unrelatedWriteCheck.ownershipVerdict === "BLOCKED" && unrelatedWriteCheck.reasons.some((reason) => reason.code === "ACTOR_UNRELATED_WRITE"), "Acceptance actor unrelated-job write was not blocked");
    await deleteExact("DELETE FROM inspections WHERE id=$1 RETURNING id", [legacyInspectionId], [legacyInspectionId], "unrelated legacy inspection cleanup");
    await checkLegacyOrphanFireAlarm(unrelatedWriteRun.manifest.runId, directory); await recoverLegacyOrphanFireAlarm(unrelatedWriteRun.manifest.runId, directory);

    const sameJobLegacyRun = await orphan(directory); await checkLegacyOrphanFireAlarm(sameJobLegacyRun.manifest.runId, directory);
    const sameJobLegacyId = randomUUID();
    await pool.query(`INSERT INTO inspections(id,client_uuid,job_id,template_id,template_version,template_snapshot,header,performed_at,created_by_user_id) VALUES($1,$2,$3,'00000000-0000-4000-8000-000000000401',1,'{}'::jsonb,'{}'::jsonb,now(),$4)`, [sameJobLegacyId, randomUUID(), sameJobLegacyRun.manifest.fixture.jobId, sameJobLegacyRun.manifest.actor.id]);
    const sameJobLegacyCheck = await checkLegacyOrphanFireAlarm(sameJobLegacyRun.manifest.runId, directory);
    assert(sameJobLegacyCheck.ownershipVerdict === "BLOCKED" && sameJobLegacyCheck.reasons.some((reason) => reason.code === "LEGACY_INSPECTION_PRESENT"), "Same-job legacy inspection activity was not blocked");
    await expectFailure(() => recoverLegacyOrphanFireAlarm(sameJobLegacyRun.manifest.runId, directory), "Same-job legacy inspection reached recovery deletion");
    assert((await pool.query("SELECT 1 FROM inspections WHERE id=$1", [sameJobLegacyId])).rowCount === 1, "Blocked same-job legacy inspection evidence was deleted");
    await deleteExact("DELETE FROM inspections WHERE id=$1 RETURNING id", [sameJobLegacyId], [sameJobLegacyId], "same-job legacy inspection cleanup");
    await checkLegacyOrphanFireAlarm(sameJobLegacyRun.manifest.runId, directory); await recoverLegacyOrphanFireAlarm(sameJobLegacyRun.manifest.runId, directory);

    const attachmentRun = await orphan(directory, true); const attachmentForm = (await pool.query(`SELECT instance.id FROM master_system_form_instances instance INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id WHERE inspection.job_id=$1`, [attachmentRun.manifest.fixture.jobId])).rows[0];
    const policy = (await pool.query("SELECT id FROM inspection_evidence_policies ORDER BY id LIMIT 1")).rows[0];
    assert(attachmentForm && policy, "Photo-evidence prerequisite is unavailable for attachment blocker validation");
    const attachmentId = randomUUID(); const attachmentClientUuid = randomUUID(); const replicationClient = await pool.connect();
    try {
      await replicationClient.query("SET session_replication_role = replica");
      await replicationClient.query(`INSERT INTO inspection_attachments(id,client_uuid,form_instance_id,evidence_policy_id,field_path,capture_source,storage_relative_path,source_sha256,stored_sha256,request_fingerprint,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,captured_at,uploaded_by_user_id) VALUES($1,$2,$3,$4,'photo.panel','camera',$5,$6,$6,$6,'image/jpeg',1,1,1,1,1,1,now(),$7)`, [attachmentId, attachmentClientUuid, attachmentForm.id, policy.id, `validator/${attachmentClientUuid}.jpg`, "a".repeat(64), attachmentRun.manifest.actor.id]);
    } finally { await replicationClient.query("SET session_replication_role = origin").catch(() => undefined); replicationClient.release(); }
    const attachmentCheck = await checkLegacyOrphanFireAlarm(attachmentRun.manifest.runId, directory);
    assert(attachmentCheck.ownershipVerdict === "BLOCKED" && attachmentCheck.attachmentCount === 1 && attachmentCheck.reasons.some((reason) => reason.code === "ATTACHMENTS_PRESENT"), "Attachment-bearing orphan was not blocked");
    await deleteExact("DELETE FROM inspection_attachments WHERE id=$1 RETURNING id", [attachmentId], [attachmentId], "attachment blocker cleanup");
    await checkLegacyOrphanFireAlarm(attachmentRun.manifest.runId, directory); await recoverLegacyOrphanFireAlarm(attachmentRun.manifest.runId, directory);

    const malformedRun = await orphan(directory, true); const malformedSafe = await checkLegacyOrphanFireAlarm(malformedRun.manifest.runId, directory);
    const malformedArtifactPath = malformedSafe.recoveryArtifactPath!; const copiedSafeArtifact = await readFile(malformedArtifactPath, "utf8");
    const malformedStored = (await pool.query(`SELECT instance.id,instance.inspection_snapshot AS "inspectionSnapshot",instance.response_payload AS "responsePayload",instance.original_creator_snapshot AS "creatorSnapshot",instance.request_fingerprint AS "requestFingerprint" FROM master_system_form_instances instance INNER JOIN master_system_inspections inspection ON inspection.id=instance.inspection_group_id WHERE inspection.job_id=$1`, [malformedRun.manifest.fixture.jobId])).rows[0];
    assert(malformedStored, "Malformed-evidence validator fixture has no form instance");
    await updateExact("UPDATE master_system_form_instances SET inspection_snapshot=jsonb_set(inspection_snapshot,'{acceptedAt}',to_jsonb($2::text),false) WHERE id=$1 RETURNING id", [malformedStored.id, "not-a-timestamp"], [malformedStored.id], "malformed acceptedAt setup");
    const malformedTimestamp = await checkLegacyOrphanFireAlarm(malformedRun.manifest.runId, directory);
    await assertStructuredBlocked(malformedTimestamp, "MALFORMED_INSPECTION_TIMESTAMP");
    await expectFailure(() => recoverLegacyOrphanFireAlarm(malformedRun.manifest.runId, directory), "Malformed timestamp reached destructive recovery");
    assert((await pool.query("SELECT 1 FROM master_system_form_instances WHERE id=$1", [malformedStored.id])).rowCount === 1, "Malformed timestamp evidence was deleted");
    await writeFile(malformedArtifactPath, copiedSafeArtifact, "utf8");
    await expectFailure(() => recoverLegacyOrphanFireAlarm(malformedRun.manifest.runId, directory), "Stale SAFE artifact bypassed malformed persisted timestamp reconstruction");
    await assertStructuredBlocked(await checkLegacyOrphanFireAlarm(malformedRun.manifest.runId, directory), "MALFORMED_INSPECTION_TIMESTAMP");
    await updateExact("UPDATE master_system_form_instances SET inspection_snapshot=$2 WHERE id=$1 RETURNING id", [malformedStored.id, malformedStored.inspectionSnapshot], [malformedStored.id], "acceptedAt restoration");
    assert((await checkLegacyOrphanFireAlarm(malformedRun.manifest.runId, directory)).ownershipVerdict === "SAFE_TO_RECOVER", "Restored timestamp evidence did not regain SAFE state");

    await updateExact("UPDATE master_system_form_instances SET response_payload='{}'::jsonb WHERE id=$1 RETURNING id", [malformedStored.id], [malformedStored.id], "malformed response setup");
    await assertStructuredBlocked(await checkLegacyOrphanFireAlarm(malformedRun.manifest.runId, directory), "MALFORMED_STORED_FIRE_ALARM_DETAIL");
    await updateExact("UPDATE master_system_form_instances SET response_payload=$2 WHERE id=$1 RETURNING id", [malformedStored.id, malformedStored.responsePayload], [malformedStored.id], "response restoration");
    await checkLegacyOrphanFireAlarm(malformedRun.manifest.runId, directory);

    await updateExact("UPDATE master_system_form_instances SET original_creator_snapshot=jsonb_set(original_creator_snapshot,'{capturedAt}',to_jsonb($2::text),false) WHERE id=$1 RETURNING id", [malformedStored.id, "invalid"], [malformedStored.id], "malformed creator setup");
    await assertStructuredBlocked(await checkLegacyOrphanFireAlarm(malformedRun.manifest.runId, directory), "MALFORMED_CREATOR_SNAPSHOT");
    await updateExact("UPDATE master_system_form_instances SET original_creator_snapshot=$2 WHERE id=$1 RETURNING id", [malformedStored.id, malformedStored.creatorSnapshot], [malformedStored.id], "creator restoration");
    await checkLegacyOrphanFireAlarm(malformedRun.manifest.runId, directory);

    await updateExact("UPDATE master_system_form_instances SET request_fingerprint=$2 WHERE id=$1 RETURNING id", [malformedStored.id, "z".repeat(64)], [malformedStored.id], "invalid fingerprint setup");
    await assertStructuredBlocked(await checkLegacyOrphanFireAlarm(malformedRun.manifest.runId, directory), "INVALID_REQUEST_FINGERPRINT");
    await updateExact("UPDATE master_system_form_instances SET request_fingerprint=$2 WHERE id=$1 RETURNING id", [malformedStored.id, malformedStored.requestFingerprint], [malformedStored.id], "fingerprint restoration");
    await checkLegacyOrphanFireAlarm(malformedRun.manifest.runId, directory); await recoverLegacyOrphanFireAlarm(malformedRun.manifest.runId, directory);

    const incompleteRun = await orphan(directory); const incompleteGroup = randomUUID();
    await pool.query(`INSERT INTO master_system_inspections(id,job_id,system_key,created_by_user_id) VALUES($1,$2,'fire_alarm_detector',$3)`, [incompleteGroup, incompleteRun.manifest.fixture.jobId, incompleteRun.manifest.actor.id]);
    const incompleteCheck = await checkLegacyOrphanFireAlarm(incompleteRun.manifest.runId, directory);
    assert(incompleteCheck.ownershipVerdict === "BLOCKED" && incompleteCheck.reasons.some((reason) => reason.code === "INSPECTION_CHILD_COUNT_MISMATCH"), "Incomplete inspection tree was not blocked");
    await deleteExact("DELETE FROM master_system_inspections WHERE id=$1 RETURNING id", [incompleteGroup], [incompleteGroup], "incomplete group cleanup");
    await checkLegacyOrphanFireAlarm(incompleteRun.manifest.runId, directory); await recoverLegacyOrphanFireAlarm(incompleteRun.manifest.runId, directory);

    const mismatchedRun = await orphan(directory);
    const initialSafe = await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);
    assert(initialSafe.ownershipVerdict === "SAFE_TO_RECOVER" && initialSafe.recoveryStatus === "checked", "Mismatch matrix fixture was not initially SAFE");
    const mismatchArtifactPath = initialSafe.recoveryArtifactPath!; const staleSafeArtifact = await readFile(mismatchArtifactPath, "utf8");
    await pool.query("UPDATE customers SET display_name='Foreign customer' WHERE id=$1", [mismatchedRun.manifest.fixture.customerId]);
    const mismatchCheck = await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);
    assert(mismatchCheck.ownershipVerdict === "BLOCKED" && mismatchCheck.reasons.some((reason) => reason.code === "CUSTOMER_IDENTITY_MISMATCH"), "Foreign/mismatched customer identity was not blocked");
    const blockedArtifact = parseLegacyOrphanRecoveryArtifactForTest(JSON.parse(await readFile(mismatchArtifactPath, "utf8")));
    assert(blockedArtifact.status === "blocked" && blockedArtifact.ownershipVerdict === "BLOCKED"
      && blockedArtifact.blockedReasons.some((reason) => reason.code === "CUSTOMER_IDENTITY_MISMATCH"), "SAFE artifact was not atomically superseded by BLOCKED state");
    await expectFailure(() => recoverLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory), "Authoritative BLOCKED artifact was actionable");
    await assertExists(mismatchedRun);
    await writeFile(mismatchArtifactPath, staleSafeArtifact, "utf8");
    await expectFailure(() => recoverLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory), "Copied-aside stale SAFE artifact bypassed fresh database reconstruction");
    const reblocked = await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);
    assert(reblocked.recoveryStatus === "blocked" && reblocked.ownershipVerdict === "BLOCKED", "Stale SAFE artifact was not re-invalidated by check");
    await pool.query("UPDATE customers SET display_name='Acceptance Fire Alarm V3' WHERE id=$1", [mismatchedRun.manifest.fixture.customerId]);
    assert((await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory)).ownershipVerdict === "SAFE_TO_RECOVER", "Restored customer identity did not require and regain full SAFE reconstruction");

    await pool.query("UPDATE customer_configuration_revisions SET status='superseded' WHERE id=$1", [mismatchedRun.manifest.fixture.revisionId]);
    const revisionMismatch = await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);
    assert(revisionMismatch.ownershipVerdict === "BLOCKED" && revisionMismatch.reasons.some((reason) => reason.code === "CONFIGURATION_IDENTITY_MISMATCH"), "Modified revision identity was not blocked");
    await pool.query("UPDATE customer_configuration_revisions SET status='active' WHERE id=$1", [mismatchedRun.manifest.fixture.revisionId]);
    await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);
    const duplicateRevisionFailure = await expectFailure(() => pool.query(`INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,'00000000-0000-4000-8000-000000000803',1,'superseded')`, [randomUUID(), mismatchedRun.manifest.fixture.customerId]), "Schema allowed duplicate customer revision number");
    assert(typeof duplicateRevisionFailure === "object" && duplicateRevisionFailure !== null && (duplicateRevisionFailure as { code?: string }).code === "23505", "Duplicate revision invariant did not fail through the unique schema constraint");
    const secondRevisionId = randomUUID();
    await pool.query(`INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,'00000000-0000-4000-8000-000000000803',2,'superseded')`, [secondRevisionId, mismatchedRun.manifest.fixture.customerId]);
    const duplicateRevisionCheck = await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);
    assert(duplicateRevisionCheck.ownershipVerdict === "BLOCKED" && duplicateRevisionCheck.reasons.some((reason) => reason.code === "CONFIGURATION_IDENTITY_MISMATCH"), "Reachable second-revision ambiguity was not blocked");
    await deleteExact("DELETE FROM customer_configuration_revisions WHERE id=$1 RETURNING id", [secondRevisionId], [secondRevisionId], "second revision cleanup");
    await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);

    await pool.query("UPDATE customer_system_zones SET zone_key='foreign-zone' WHERE id=$1", [mismatchedRun.manifest.fixture.zoneId]);
    const zoneMismatch = await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);
    assert(zoneMismatch.ownershipVerdict === "BLOCKED" && zoneMismatch.reasons.some((reason) => reason.code === "ZONE_IDENTITY_MISMATCH"), "Modified zone identity was not blocked");
    await pool.query("UPDATE customer_system_zones SET zone_key='acceptance-zone' WHERE id=$1", [mismatchedRun.manifest.fixture.zoneId]);
    await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);
    const extraZoneId = randomUUID();
    await pool.query("INSERT INTO customer_system_zones(id,enabled_system_id,zone_key,display_name,sort_order) VALUES($1,$2,'foreign-zone','Foreign Zone',2)", [extraZoneId, mismatchedRun.manifest.fixture.enabledSystemId]);
    const duplicateZoneCheck = await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);
    assert(duplicateZoneCheck.ownershipVerdict === "BLOCKED" && duplicateZoneCheck.reasons.some((reason) => reason.code === "ZONE_COUNT_MISMATCH"), "Duplicate/unexpected zone was not blocked");
    await deleteExact("DELETE FROM customer_system_zones WHERE id=$1 RETURNING id", [extraZoneId], [extraZoneId], "unexpected zone cleanup");
    await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);

    await pool.query("UPDATE customer_system_locations SET row_preset=$2 WHERE id=$1", [mismatchedRun.manifest.fixture.primaryLocationId, { fireAlarmTable: "primary", assetReference: "FOREIGN-ASSET" }]);
    const locationMismatch = await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);
    assert(locationMismatch.ownershipVerdict === "BLOCKED" && locationMismatch.reasons.some((reason) => reason.code === "LOCATION_IDENTITY_MISMATCH"), "Modified location run binding was not blocked");
    await pool.query("UPDATE customer_system_locations SET row_preset=$2 WHERE id=$1", [mismatchedRun.manifest.fixture.primaryLocationId, { fireAlarmTable: "primary", assetReference: `${mismatchedRun.manifest.reference}-P` }]);
    await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);
    const extraLocationId = randomUUID();
    await pool.query(`INSERT INTO customer_system_locations(id,enabled_system_id,zone_id,location_key,display_name,preset_row_count,row_preset,sort_order) VALUES($1,$2,NULL,'unexpected','Unexpected',1,$3,3)`, [extraLocationId, mismatchedRun.manifest.fixture.enabledSystemId, { fireAlarmTable: "secondary", assetReference: `${mismatchedRun.manifest.reference}-X` }]);
    const extraLocationCheck = await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);
    assert(extraLocationCheck.ownershipVerdict === "BLOCKED" && extraLocationCheck.reasons.some((reason) => reason.code === "LOCATION_COUNT_MISMATCH"), "Unexpected configured location was not blocked");
    await deleteExact("DELETE FROM customer_system_locations WHERE id=$1 RETURNING id", [extraLocationId], [extraLocationId], "unexpected location cleanup");
    await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);
    await pool.query("UPDATE customer_enabled_systems SET system_configuration=$2 WHERE id=$1", [mismatchedRun.manifest.fixture.enabledSystemId, { foreign: true }]);
    const systemMismatch = await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);
    assert(systemMismatch.ownershipVerdict === "BLOCKED" && systemMismatch.reasons.some((reason) => reason.code === "ENABLED_SYSTEM_IDENTITY_MISMATCH"), "Modified enabled-system identity was not blocked");
    await pool.query("UPDATE customer_enabled_systems SET system_configuration='{}'::jsonb WHERE id=$1", [mismatchedRun.manifest.fixture.enabledSystemId]);
    await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);
    const extraSystemId = randomUUID();
    await pool.query(`INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,'00000000-0000-4000-8000-000000000803','hose_reel',2,'{}'::jsonb)`, [extraSystemId, mismatchedRun.manifest.fixture.revisionId]);
    const extraSystemCheck = await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);
    assert(extraSystemCheck.ownershipVerdict === "BLOCKED" && extraSystemCheck.reasons.some((reason) => reason.code === "ENABLED_SYSTEM_IDENTITY_MISMATCH"), "Duplicate/unexpected enabled system was not blocked");
    await deleteExact("DELETE FROM customer_enabled_systems WHERE id=$1 RETURNING id", [extraSystemId], [extraSystemId], "unexpected system cleanup");
    await checkLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory); await recoverLegacyOrphanFireAlarm(mismatchedRun.manifest.runId, directory);

    await expectFailure(() => checkLegacyOrphanFireAlarm("not-a-uuid", directory), "Malformed run ID was accepted");
    const missing = await checkLegacyOrphanFireAlarm(randomUUID(), directory);
    assert(missing.ownershipVerdict === "BLOCKED" && missing.reasons.some((reason) => reason.code === "NOT_FOUND") && missing.recoveryArtifactPath === null, "Missing orphan was not a non-destructive not-found result");

    const deleteMismatchRun = await orphan(directory); const deleteMismatchCheck = await checkLegacyOrphanFireAlarm(deleteMismatchRun.manifest.runId, directory);
    const deleteMismatchArtifact = parseLegacyOrphanRecoveryArtifactForTest(JSON.parse(await readFile(deleteMismatchCheck.recoveryArtifactPath!, "utf8")));
    assert(deleteMismatchArtifact.deletionPlan.sessionIds.length > 0, "Exact DELETE verification fixture has no disposable session");
    setLegacyOrphanRecoveryTestHooks({ beforeDelete: async (client, artifact) => {
      const deleted = await client.query("DELETE FROM user_sessions WHERE id=$1 AND user_id=$2 RETURNING id", [artifact.deletionPlan.sessionIds[0], artifact.actor.id]);
      exactReturned(deleted.rows, [artifact.deletionPlan.sessionIds[0]], "fault-injected session delete");
    } });
    const deleteFailure = await expectFailure(() => recoverLegacyOrphanFireAlarm(deleteMismatchRun.manifest.runId, directory), "DELETE RETURNING mismatch did not rollback recovery");
    assert(deleteFailure instanceof Error && deleteFailure.message.includes("DELETE RETURNING exact identity mismatch"), "DELETE mismatch did not report the exact target set");
    setLegacyOrphanRecoveryTestHooks({}); await assertExists(deleteMismatchRun);
    assert((await pool.query("SELECT 1 FROM user_sessions WHERE id=$1", [deleteMismatchArtifact.deletionPlan.sessionIds[0]])).rowCount === 1, "DELETE mismatch rollback did not restore the exact session");
    await recoverLegacyOrphanFireAlarm(deleteMismatchRun.manifest.runId, directory);

    const postCommitProofRun = await orphan(directory); await checkLegacyOrphanFireAlarm(postCommitProofRun.manifest.runId, directory);
    const replacementHash = await hashPassword(password);
    setLegacyOrphanRecoveryTestHooks({ afterCommit: async (artifact) => { await pool.query(`INSERT INTO users(id,username,password_hash,role,is_active) VALUES($1,$2,$3,'inspector',true)`, [artifact.actor.id, artifact.actor.username, replacementHash]); } });
    const proofFailure = await expectFailure(() => recoverLegacyOrphanFireAlarm(postCommitProofRun.manifest.runId, directory), "Fresh post-COMMIT absence proof was not enforced");
    assert(proofFailure instanceof Error && proofFailure.message.includes("Fresh post-COMMIT proof"), "Post-COMMIT absence failure was not explicit");
    setLegacyOrphanRecoveryTestHooks({});
    await deleteExact("DELETE FROM users WHERE id=$1 RETURNING id", [postCommitProofRun.manifest.actor.id], [postCommitProofRun.manifest.actor.id], "post-COMMIT injected actor cleanup");
    assert((await recoverLegacyOrphanFireAlarm(postCommitProofRun.manifest.runId, directory)).alreadyRecovered, "Post-COMMIT recovery retry did not resolve exact absence idempotently");

    const normal = await setupAcceptanceFireAlarm({ password, manifestDirectory: directory });
    validatorRuns.push(normal);
    await expectFailure(() => checkLegacyOrphanFireAlarm(normal.manifest.runId, directory), "Recovery mode accepted a run with a normal manifest");
    await cleanupAcceptanceFireAlarm(normal.manifest.runId, directory); await cleanupAcceptanceFireAlarm(normal.manifest.runId, directory);
    assert((await pool.query("SELECT 1 FROM inspection_jobs WHERE id=$1", [normal.manifest.fixture.jobId])).rowCount === 0, "Normal manifest cleanup semantics regressed");

    completed = true;
    console.log(JSON.stringify({ status: "PASS", noInspectionRecoverable: true, exactInspectionRecoverable: true,
      staleSafeSupersededByBlockedArtifact: true, staleSafeCopyRejectedByFreshReconstruction: true,
      structuredMalformedTimestampBlocked: true, structuredMalformedDetailBlocked: true, structuredMalformedCreatorBlocked: true,
      structuredInvalidFingerprintBlocked: true, secondActorBlocked: true, unrelatedActorWriteBlocked: true,
      foreignFixtureAuditBlockedAndPreserved: true, unexpectedActorAuditBlocked: true, sameJobLegacyInspectionBlocked: true,
      attachmentBlocked: true, incompleteTreeBlocked: true, revisionMismatchAndAmbiguityBlocked: true,
      duplicateRevisionConstraintAsserted: true, systemMismatchAndDuplicateBlocked: true, zoneMismatchAndDuplicateBlocked: true,
      locationMismatchAndExtraBlocked: true, malformedAndMissingRunRejected: true,
      foreignActorIdTargetBlockedAndPreserved: true, foreignActorUsernameTargetBlockedAndPreserved: true,
      unrelatedActorIdAndUsernameTargetsNotBlocked: true, staleSafeActorTargetRejectedByFreshReconstruction: true,
      exactDeleteReturningRollback: true, interruptedRetry: true, freshPostCommitProof: true, artifactTamperingBlocked: true,
      fullRunABEntityFingerprintIsolation: true, validatorFailureIdentityDiagnostics: true, normalManifestCleanupUnchanged: true }));
  } finally {
    setLegacyOrphanRecoveryTestHooks({});
    if (!completed) {
      const possiblyRemaining = [];
      for (const run of validatorRuns) {
        let exactRowsPresent: boolean | "unverified" = "unverified";
        try {
          const proof = await pool.query(`SELECT (SELECT count(*) FROM users WHERE id=$1)+(SELECT count(*) FROM customers WHERE id=$2)+(SELECT count(*) FROM inspection_jobs WHERE id=$3) AS count`, [run.manifest.actor.id, run.manifest.fixture.customerId, run.manifest.fixture.jobId]);
          exactRowsPresent = Number(proof.rows[0]?.count ?? 0) > 0;
        } catch { exactRowsPresent = "unverified"; }
        if (exactRowsPresent !== false) possiblyRemaining.push({ runId: run.manifest.runId, actorId: run.manifest.actor.id,
          customerId: run.manifest.fixture.customerId, jobId: run.manifest.fixture.jobId, exactRowsPresent });
      }
      console.error(JSON.stringify({ status: "VALIDATOR_FAILED", validatorTempArtifactPath: root, possiblyRemainingFixtures: possiblyRemaining }));
    }
    await pool.end();
    if (completed) await rm(root, { recursive: true, force: true });
    else console.error(`Legacy orphan validator artifacts preserved at ${root}`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
