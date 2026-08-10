import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { hashPassword } from "../auth/passwords.js";
import { pool } from "../db/pool.js";
import { syncFireAlarmInspections } from "../sync/fireAlarmInspectionSync.js";
import { cleanupAcceptanceFireAlarm, computeAcceptanceRequestFingerprint, parseAcceptanceManifestForTest, publishAcceptanceManifestForTest, requireExactSyncConfirmation, retryAcceptanceFireAlarmSetup, sealAcceptanceInspectionOwnership, setAcceptanceFireAlarmTestHooks, setupAcceptanceFireAlarm, verifyActorLoginAndJob, type AcceptanceFireAlarmManifest, type InspectionOwnership } from "./acceptanceFireAlarm.js";

const password = `Acceptance-validator-${randomUUID()}`;
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function payload(run: Awaited<ReturnType<typeof setupAcceptanceFireAlarm>>, actor = run.manifest.actor) {
  const { manifest } = run; const { fixture, snapshot } = manifest; const clientUuid = randomUUID();
  const response = () => ({ result: "good", remarks: "" });
  return { operationId: randomUUID(), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: {
    clientUuid, jobId: fixture.jobId, systemKey: "fire_alarm_detector", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1,
    originalCreatorSnapshot: { source: "device_reported", userId: actor.id, username: actor.username, role: "inspector", capturedAt: "2026-08-10T00:00:00.000Z" },
    masterTemplate: { id: "00000000-0000-4000-8000-000000000803", code: "MFE-FSSR", version: 3 }, configuration: { revisionId: fixture.revisionId, revisionNumber: 1 }, inspectionSnapshot: snapshot,
    responses: { schemaVersion: 1, controlPanelLocation: "Acceptance Panel", primaryDeviceRows: [{ rowUuid: randomUUID(), source: "configured", configuredLocationId: fixture.primaryLocationId, configuredRowOrdinal: 1, zoneSnapshot: { id: fixture.zoneId, displayName: "Acceptance Zone" }, locationSnapshot: { id: fixture.primaryLocationId, displayName: "Acceptance Main Panel" }, displaySequence: 1, assetReference: `${manifest.reference}-P`, alarmZone: "Acceptance Zone", location: "Acceptance Main Panel", manualCallPoint: "normal", flowSwitch: "test", heatDetector: "normal", smokeDetector: "isolation", remarks: "" }], chargerAndBatteries: { main_supply: response(), battery: response(), charger: response() }, mainFunctionKeys: { main_alarm_reset: response(), lamp_test: response(), evacuate: response(), ac_supply: response(), dc_supply: response(), spka_system: response(), alarm_lift_trip: response(), signal_gas_discharge: response() }, secondaryAlarmDeviceRows: [{ rowUuid: randomUUID(), source: "configured", configuredLocationId: fixture.secondaryLocationId, configuredRowOrdinal: 1, zoneSnapshot: null, locationSnapshot: { id: fixture.secondaryLocationId, displayName: "Acceptance Alarm Bell" }, displaySequence: 1, assetReference: `${manifest.reference}-S`, location: "Acceptance Alarm Bell", alarmBell: "good", manualCallPoint: "poor", remarks: "" }], comments: "Acceptance validator" }, performedAt: "2026-08-10T00:00:00.000Z"
  } };
}

async function manifests(directory: string) {
  return (await readdir(directory)).filter((name) => name.endsWith(".json"));
}

async function manifestWithStatus(directory: string, status: AcceptanceFireAlarmManifest["status"]) {
  const matches: Array<{ runId: string; path: string; manifest: AcceptanceFireAlarmManifest }> = [];
  for (const name of await manifests(directory)) {
    const path = join(directory, name); const manifest = JSON.parse(await readFile(path, "utf8")) as AcceptanceFireAlarmManifest;
    if (manifest.status === status) matches.push({ runId: name.slice(0, -5), path, manifest });
  }
  assert(matches.length === 1, `Expected exactly one ${status} recovery manifest`); return matches[0];
}

async function expectFailed(task: () => Promise<unknown>, message: string) {
  let failure: unknown; try { await task(); } catch (error) { failure = error; } assert(failure !== undefined, message); return failure;
}

function assertExactReturnedIds(rows: Array<Record<string, unknown>>, expectedIds: Array<string | number>, label: string) {
  const actual = rows.map((row) => String(row.id)).sort(); const expected = expectedIds.map(String).sort();
  assert(actual.length === expected.length && actual.every((id, index) => id === expected[index]), `${label}: DELETE RETURNING identity mismatch; expected=${expected.join(",")} actual=${actual.join(",")}`);
}

function reseal(ownership: InspectionOwnership, mutate: (evidence: Omit<InspectionOwnership, "ownershipFingerprint">) => void) {
  const cloned = structuredClone(ownership); const { ownershipFingerprint: _discarded, ...evidence } = cloned; mutate(evidence);
  return sealAcceptanceInspectionOwnership(evidence);
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), "inspection-acceptance-fire-alarm-validator-"));
  const directory = join(root, "manifests"); const isolatedOperational = join(root, "operational-equivalent");
  await mkdir(directory); await mkdir(isolatedOperational);
  const sentinelPath = join(isolatedOperational, "manual-manifest-sentinel.json"); const sentinel = "{\"manual\":\"must-survive\"}\n";
  await writeFile(sentinelPath, sentinel, "utf8");
  const manifestRoot = `${resolve(directory)}${sep}`;
  const hooks = (extra: any = {}) => setAcceptanceFireAlarmTestHooks({ ...extra, beforeManifestReread: async (temporary: string, authoritative: string) => {
    assert(resolve(authoritative).startsWith(manifestRoot), "Validator attempted manifest publication outside run-owned temp storage");
    assert(!resolve(temporary).startsWith(`${resolve(isolatedOperational)}${sep}`), "Validator touched the isolated operational equivalent");
    await extra.beforeManifestReread?.(temporary, authoritative);
  } });
  hooks();
  let completed = false;
  try {
    await expectFailed(() => setupAcceptanceFireAlarm({ password, manifestDirectory: directory, failBeforeCommit: true }), "True rollback setup failure did not fail");
    const rollback = await manifestWithStatus(directory, "rolled_back");
    const rollbackCount = await pool.query(`SELECT (SELECT count(*) FROM users WHERE id=$1)+(SELECT count(*) FROM customers WHERE id=$2)+(SELECT count(*) FROM customer_configuration_revisions WHERE id=$3)+(SELECT count(*) FROM customer_enabled_systems WHERE id=$4)+(SELECT count(*) FROM customer_system_locations WHERE id=ANY($5::uuid[]))+(SELECT count(*) FROM inspection_jobs WHERE id=$6) AS count`, [rollback.manifest.actor.id, rollback.manifest.fixture.customerId, rollback.manifest.fixture.revisionId, rollback.manifest.fixture.enabledSystemId, [rollback.manifest.fixture.primaryLocationId, rollback.manifest.fixture.secondaryLocationId], rollback.manifest.fixture.jobId]);
    assert(Number(rollbackCount.rows[0].count) === 0, "True setup rollback left deterministic run-owned rows"); await cleanupAcceptanceFireAlarm(rollback.runId, directory);

    hooks({ probe: async (phase: string, actual: any) => phase === "setup_recovery" ? { outcome: "indeterminate", error: new Error("controlled probe outage") } : actual });
    await expectFailed(() => setupAcceptanceFireAlarm({ password, manifestDirectory: directory, ambiguousCommit: true }), "Ambiguous committed setup did not fail");
    const committedUnknown = await manifestWithStatus(directory, "commit_unknown");
    assert((await pool.query("SELECT 1 FROM inspection_jobs WHERE id=$1", [committedUnknown.manifest.fixture.jobId])).rowCount === 1, "Ambiguous COMMIT did not actually persist rows");
    await expectFailed(() => retryAcceptanceFireAlarmSetup(committedUnknown.runId, directory, password), "Unresolved setup retry was not blocked");
    assert((await manifestWithStatus(directory, "commit_unknown")).runId === committedUnknown.runId, "Unresolved manifest was not preserved");
    hooks(); await retryAcceptanceFireAlarmSetup(committedUnknown.runId, directory, password); await cleanupAcceptanceFireAlarm(committedUnknown.runId, directory);

    hooks({ probe: async (phase: string, actual: any) => phase === "setup_recovery" ? { outcome: "indeterminate", error: new Error("controlled probe outage") } : actual });
    await expectFailed(() => setupAcceptanceFireAlarm({ password, manifestDirectory: directory, ambiguousFailureBeforeCommit: true }), "Ambiguous failed COMMIT did not fail");
    const absentUnknown = await manifestWithStatus(directory, "commit_unknown");
    assert((await pool.query("SELECT 1 FROM inspection_jobs WHERE id=$1", [absentUnknown.manifest.fixture.jobId])).rowCount === 0, "Failed COMMIT unexpectedly persisted its job");
    hooks(); await cleanupAcceptanceFireAlarm(absentUnknown.runId, directory);

    await expectFailed(() => setupAcceptanceFireAlarm({ password, manifestDirectory: directory, verificationFault: "after_auth" }), "Post-commit authentication failure did not fail");
    const postCommit = await manifestWithStatus(directory, "db_committed"); await cleanupAcceptanceFireAlarm(postCommit.runId, directory);
    await expectFailed(() => setupAcceptanceFireAlarm({ password, manifestDirectory: directory, verificationFault: "after_jobs" }), "Post-commit Jobs API verification failure did not fail");
    const postJobs = await manifestWithStatus(directory, "db_committed"); await cleanupAcceptanceFireAlarm(postJobs.runId, directory);

    const a = await setupAcceptanceFireAlarm({ password, manifestDirectory: directory });
    const b = await setupAcceptanceFireAlarm({ password, manifestDirectory: directory });
    assert(a.manifest.reference !== b.manifest.reference && a.manifest.fixture.jobId !== b.manifest.fixture.jobId, "Acceptance runs are not disjoint");
    await verifyActorLoginAndJob(a.manifest, password); await verifyActorLoginAndJob(b.manifest, password);
    const submitted = payload(a); const sync = await syncFireAlarmInspections([submitted], a.manifest.actor.id);
    assert(requireExactSyncConfirmation(sync, submitted.entityId) === "accepted", "Exact Fire Alarm acceptance UUID was not accepted");
    const duplicate = await syncFireAlarmInspections([submitted], a.manifest.actor.id); assert(requireExactSyncConfirmation(duplicate, submitted.entityId) === "duplicate", "Exact Fire Alarm duplicate UUID was not reported");
    const foreignUuid = randomUUID(); const validFailure = { id: foreignUuid, code: "VALIDATION_ERROR", message: "controlled" };
    await expectFailed(async () => requireExactSyncConfirmation({ acceptedIds: [], duplicateIds: [], failed: [] }, submitted.entityId), "Missing exact sync membership was accepted");
    await expectFailed(async () => requireExactSyncConfirmation({ acceptedIds: [submitted.entityId, foreignUuid], duplicateIds: [], failed: [] }, submitted.entityId), "Extra accepted UUID was accepted");
    await expectFailed(async () => requireExactSyncConfirmation({ acceptedIds: [], duplicateIds: [submitted.entityId, foreignUuid], failed: [] }, submitted.entityId), "Extra duplicate UUID was accepted");
    await expectFailed(async () => requireExactSyncConfirmation({ acceptedIds: [foreignUuid], duplicateIds: [submitted.entityId], failed: [] }, submitted.entityId), "Foreign accepted UUID alongside expected duplicate was accepted");
    await expectFailed(async () => requireExactSyncConfirmation({ acceptedIds: [submitted.entityId], duplicateIds: [foreignUuid], failed: [] }, submitted.entityId), "Foreign duplicate UUID alongside expected accepted was accepted");
    await expectFailed(async () => requireExactSyncConfirmation({ acceptedIds: [submitted.entityId], duplicateIds: [submitted.entityId], failed: [] }, submitted.entityId), "Ambiguous dual sync membership was accepted");
    await expectFailed(async () => requireExactSyncConfirmation({ acceptedIds: ["not-a-uuid"], duplicateIds: [], failed: [] }, submitted.entityId), "Malformed accepted membership was accepted");
    await expectFailed(async () => requireExactSyncConfirmation({ acceptedIds: [submitted.entityId], duplicateIds: [], failed: [validFailure] }, submitted.entityId), "Foreign failed entry was accepted");
    await expectFailed(async () => requireExactSyncConfirmation({ acceptedIds: [submitted.entityId], duplicateIds: [], failed: [{ ...validFailure, id: "not-a-uuid" }] }, submitted.entityId), "Malformed failed UUID was accepted");
    await expectFailed(async () => requireExactSyncConfirmation({ acceptedIds: [submitted.entityId], duplicateIds: [], failed: [{ id: submitted.entityId, code: "CONFLICT", message: "controlled" }] }, submitted.entityId), "Conflicting expected failed entry was accepted");
    await expectFailed(async () => requireExactSyncConfirmation({ acceptedIds: [submitted.entityId], duplicateIds: [], failed: [validFailure, validFailure] }, submitted.entityId), "Duplicate failed entries were accepted");
    await expectFailed(async () => requireExactSyncConfirmation({ acceptedIds: [submitted.entityId], duplicateIds: [], failed: [{ id: foreignUuid }] }, submitted.entityId), "Malformed failed entry was accepted");
    const secondUsername = `acceptance-validator-second-${randomUUID()}`; const second = await pool.query<{ id: number }>(`INSERT INTO users(username,password_hash,role,is_active) VALUES($1,$2,'inspector',true) RETURNING id`, [secondUsername, await hashPassword(password)]);
    const secondActor = { id: Number(second.rows[0].id), username: secondUsername, role: "inspector" as const };
    const secondResult = await syncFireAlarmInspections([payload(a, secondActor)], secondActor.id);
    assert(secondResult.failed.length === 1 && secondResult.failed[0].code === "ACTIVE_INSPECTION_EXISTS", "Second actor same-job submission was not preserved by production sync");
    const cleanupRollbackFailure = await expectFailed(() => cleanupAcceptanceFireAlarm(a.manifest.runId, directory, { failBeforeCommit: true }), "Cleanup pre-commit interruption did not fail");
    assert(cleanupRollbackFailure instanceof Error && cleanupRollbackFailure.message === "Controlled acceptance cleanup failure before commit", `Cleanup did not reach its controlled pre-commit failure boundary: ${cleanupRollbackFailure instanceof Error ? cleanupRollbackFailure.message : String(cleanupRollbackFailure)}`);
    const afterRollback = JSON.parse(await readFile(a.manifestPath, "utf8")) as AcceptanceFireAlarmManifest; assert(afterRollback.status === "cleanup_required" && afterRollback.inspection?.clientUuid === submitted.entityId && /^[0-9a-f]{64}$/.test(afterRollback.inspection.ownershipFingerprint), "Cleanup rollback did not preserve exact inspection recovery identity");

    const authoritativeText = await readFile(a.manifestPath, "utf8");
    const submittedB = payload(b); assert(requireExactSyncConfirmation(await syncFireAlarmInspections([submittedB], b.manifest.actor.id), submittedB.entityId) === "accepted", "Run B foreign ownership fixture was not accepted");
    await expectFailed(() => cleanupAcceptanceFireAlarm(b.manifest.runId, directory, { failBeforeCommit: true }), "Run B ownership capture boundary did not fail");
    const bCaptured = JSON.parse(await readFile(b.manifestPath, "utf8")) as AcceptanceFireAlarmManifest;
    assert(bCaptured.inspection, "Run B independent ownership evidence was not captured"); const bInspection = bCaptured.inspection!;
    const redirected = structuredClone(afterRollback);
    redirected.inspection = reseal(afterRollback.inspection!, (evidence) => {
      evidence.formInstanceId = bInspection.formInstanceId; evidence.inspectionGroupId = bInspection.inspectionGroupId;
    });
    assert(parseAcceptanceManifestForTest(redirected).inspection?.formInstanceId === bInspection.formInstanceId, "Authoritative parser did not accept self-consistent foreign-ID manifest test case");
    await writeFile(a.manifestPath, JSON.stringify(redirected), "utf8"); await expectFailed(() => cleanupAcceptanceFireAlarm(a.manifest.runId, directory), "Self-consistent foreign ownership redirection reached deletion");
    assert((await pool.query("SELECT 1 FROM master_system_form_instances WHERE id=ANY($1::uuid[])", [[afterRollback.inspection!.formInstanceId, bInspection.formInstanceId]])).rowCount === 2, "Self-consistent redirection deleted acceptance or foreign inspection data");
    assert(await readFile(a.manifestPath, "utf8") === JSON.stringify(redirected), "Self-consistent redirection did not preserve recovery evidence"); await writeFile(a.manifestPath, authoritativeText, "utf8");

    const snapshotRedirected = structuredClone(afterRollback);
    snapshotRedirected.inspection = reseal(afterRollback.inspection!, (evidence) => {
      evidence.inspectionSnapshot = structuredClone(evidence.inspectionSnapshot); evidence.responsePayload = structuredClone(evidence.responsePayload);
      (evidence.inspectionSnapshot.job as Record<string, unknown>).title = "Self-consistent foreign accepted snapshot";
      evidence.responsePayload.comments = "Self-consistent foreign response"; evidence.requestFingerprint = computeAcceptanceRequestFingerprint(evidence);
    });
    assert(parseAcceptanceManifestForTest(snapshotRedirected).inspection?.requestFingerprint === snapshotRedirected.inspection.requestFingerprint, "Authoritative parser did not accept self-consistent snapshot/fingerprint test case");
    await writeFile(a.manifestPath, JSON.stringify(snapshotRedirected), "utf8"); await expectFailed(() => cleanupAcceptanceFireAlarm(a.manifest.runId, directory), "Self-consistent accepted snapshot/fingerprint tampering reached deletion");
    assert((await pool.query("SELECT 1 FROM master_system_form_instances WHERE id=ANY($1::uuid[])", [[afterRollback.inspection!.formInstanceId, bInspection.formInstanceId]])).rowCount === 2, "Self-consistent snapshot tampering deleted inspection data"); await writeFile(a.manifestPath, authoritativeText, "utf8");

    for (const mutate of [(value: any) => { value.inspection.inspectionSnapshot.acceptedAt = "2026-08-10T01:00:00.000Z"; }, (value: any) => { value.inspection.ownershipFingerprint = "0".repeat(64); }, (value: any) => { value.fixture.jobId = randomUUID(); }]) {
      const tampered = structuredClone(afterRollback); mutate(tampered); await writeFile(a.manifestPath, JSON.stringify(tampered), "utf8");
      await expectFailed(() => cleanupAcceptanceFireAlarm(a.manifest.runId, directory), "Syntactically valid manifest tampering was accepted"); await writeFile(a.manifestPath, authoritativeText, "utf8");
    }
    const originalResponse = afterRollback.inspection!.responsePayload; const originalSnapshot = afterRollback.inspection!.inspectionSnapshot; const originalRequestFingerprint = afterRollback.inspection!.requestFingerprint;
    await pool.query(`UPDATE master_system_form_instances SET response_payload=jsonb_set(response_payload,'{comments}','\"changed-after-capture\"'::jsonb) WHERE id=$1`, [afterRollback.inspection!.formInstanceId]);
    await expectFailed(() => cleanupAcceptanceFireAlarm(a.manifest.runId, directory), "Changed accepted response payload was not rejected");
    await pool.query(`UPDATE master_system_form_instances SET response_payload=$2 WHERE id=$1`, [afterRollback.inspection!.formInstanceId, originalResponse]);
    await pool.query(`UPDATE master_system_form_instances SET inspection_snapshot=jsonb_set(inspection_snapshot,'{acceptedAt}','\"2026-08-10T02:00:00.000Z\"'::jsonb) WHERE id=$1`, [afterRollback.inspection!.formInstanceId]);
    await expectFailed(() => cleanupAcceptanceFireAlarm(a.manifest.runId, directory), "Changed accepted inspection snapshot was not rejected");
    await pool.query(`UPDATE master_system_form_instances SET inspection_snapshot=$2 WHERE id=$1`, [afterRollback.inspection!.formInstanceId, originalSnapshot]);
    await pool.query(`UPDATE master_system_form_instances SET request_fingerprint=$2 WHERE id=$1`, [afterRollback.inspection!.formInstanceId, "f".repeat(64)]);
    await expectFailed(() => cleanupAcceptanceFireAlarm(a.manifest.runId, directory), "Changed production request fingerprint was not rejected");
    await pool.query(`UPDATE master_system_form_instances SET request_fingerprint=$2 WHERE id=$1`, [afterRollback.inspection!.formInstanceId, originalRequestFingerprint]);

    const foreignClientUuid = randomUUID(); const foreignInstanceId = randomUUID();
    await pool.query(`INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,zone_id,location_id,zone_snapshot,location_snapshot,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,original_creator_snapshot,synced_by_user_id) SELECT $1,inspection_group_id,$2,'foreign',zone_id,location_id,zone_snapshot,location_snapshot,2,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,$3,status,performed_at,$4,$5 FROM master_system_form_instances WHERE id=$6`, [foreignInstanceId, foreignClientUuid, "e".repeat(64), { source: "device_reported", userId: secondActor.id, username: secondActor.username, role: "inspector", capturedAt: "2026-08-10T00:00:00.000Z" }, secondActor.id, afterRollback.inspection!.formInstanceId]);
    await expectFailed(() => cleanupAcceptanceFireAlarm(a.manifest.runId, directory), "Same-job foreign actor activity was swept");
    assert((await pool.query(`SELECT 1 FROM master_system_form_instances WHERE id=ANY($1::uuid[])`, [[afterRollback.inspection!.formInstanceId, foreignInstanceId]])).rowCount === 2 && (await pool.query("SELECT 1 FROM inspection_jobs WHERE id=$1", [a.manifest.fixture.jobId])).rowCount === 1 && (await pool.query("SELECT 1 FROM users WHERE id=ANY($1::bigint[])", [[a.manifest.actor.id, secondActor.id]])).rowCount === 2, "Failed same-job cleanup deleted protected evidence");
    const deletedForeign = await pool.query(`DELETE FROM master_system_form_instances WHERE id=$1 AND client_uuid=$2 AND synced_by_user_id=$3 RETURNING id,client_uuid AS "clientUuid",synced_by_user_id AS "syncedById"`, [foreignInstanceId, foreignClientUuid, secondActor.id]);
    assertExactReturnedIds(deletedForeign.rows, [foreignInstanceId], "foreign same-job child cleanup");
    assert(deletedForeign.rows[0].clientUuid === foreignClientUuid && Number(deletedForeign.rows[0].syncedById) === secondActor.id, "Foreign child DELETE RETURNING business identity mismatch");
    await cleanupAcceptanceFireAlarm(a.manifest.runId, directory);
    const bJob = await pool.query(`SELECT 1 FROM inspection_jobs WHERE id=$1 AND job_reference=$2`, [b.manifest.fixture.jobId, b.manifest.reference]); assert(bJob.rowCount === 1, "Run A cleanup affected run B");
    const missingActorDelete = await pool.query(`DELETE FROM users WHERE id=$1 AND username=$2 RETURNING id,username`, [-1, secondActor.username]);
    await expectFailed(async () => assertExactReturnedIds(missingActorDelete.rows, [secondActor.id], "missing actor target proof"), "Missing expected DELETE target was not detected");
    assert((await pool.query("SELECT 1 FROM users WHERE id=$1 AND username=$2", [secondActor.id, secondActor.username])).rowCount === 1, "Missing-target DELETE changed the expected actor");
    const deletedSecondActor = await pool.query(`DELETE FROM users WHERE id=$1 AND username=$2 RETURNING id,username`, [secondActor.id, secondActor.username]);
    assertExactReturnedIds(deletedSecondActor.rows, [secondActor.id], "second actor cleanup"); assert(deletedSecondActor.rows[0].username === secondActor.username, "Second actor DELETE RETURNING username mismatch");
    assert((await pool.query("SELECT 1 FROM users WHERE id=$1 AND username=$2", [b.manifest.actor.id, b.manifest.actor.username])).rowCount === 1, "Exact actor deletion silently removed an extra run-owned actor");
    const incomplete = await setupAcceptanceFireAlarm({ password, manifestDirectory: directory }); const incompleteGroup = randomUUID();
    await pool.query(`INSERT INTO master_system_inspections(id,job_id,system_key,created_by_user_id) VALUES($1,$2,'fire_alarm_detector',$3)`, [incompleteGroup, incomplete.manifest.fixture.jobId, incomplete.manifest.actor.id]);
    await expectFailed(() => cleanupAcceptanceFireAlarm(incomplete.manifest.runId, directory), "Incomplete parent-only inspection was swept");
    assert((await pool.query("SELECT 1 FROM master_system_inspections WHERE id=$1", [incompleteGroup])).rowCount === 1, "Incomplete activity was deleted");
    const deletedIncomplete = await pool.query("DELETE FROM master_system_inspections WHERE id=$1 AND job_id=$2 AND created_by_user_id=$3 RETURNING id,job_id AS \"jobId\",created_by_user_id AS \"creatorId\"", [incompleteGroup, incomplete.manifest.fixture.jobId, incomplete.manifest.actor.id]);
    assertExactReturnedIds(deletedIncomplete.rows, [incompleteGroup], "incomplete parent cleanup"); assert(deletedIncomplete.rows[0].jobId === incomplete.manifest.fixture.jobId && Number(deletedIncomplete.rows[0].creatorId) === incomplete.manifest.actor.id, "Incomplete parent DELETE RETURNING ownership mismatch"); await cleanupAcceptanceFireAlarm(incomplete.manifest.runId, directory);

    const c = await setupAcceptanceFireAlarm({ password, manifestDirectory: directory });
    await expectFailed(() => cleanupAcceptanceFireAlarm(c.manifest.runId, directory, { failAfterCommit: true }), "Cleanup post-commit interruption did not fail");
    await cleanupAcceptanceFireAlarm(c.manifest.runId, directory); await cleanupAcceptanceFireAlarm(c.manifest.runId, directory);

    const unavailable = await setupAcceptanceFireAlarm({ password, manifestDirectory: directory });
    hooks({ probe: async (phase: string, actual: any) => phase === "cleanup_postcommit" ? { outcome: "indeterminate", error: new Error("controlled post-commit outage") } : actual });
    await expectFailed(() => cleanupAcceptanceFireAlarm(unavailable.manifest.runId, directory), "Unavailable post-commit absence proof was accepted");
    assert((await manifestWithStatus(directory, "cleanup_commit_unknown")).runId === unavailable.manifest.runId, "Cleanup unresolved state was not durable"); hooks();
    await cleanupAcceptanceFireAlarm(unavailable.manifest.runId, directory); await cleanupAcceptanceFireAlarm(unavailable.manifest.runId, directory);

    const remaining = await setupAcceptanceFireAlarm({ password, manifestDirectory: directory }); const replacementHash = await hashPassword(password);
    hooks({ afterCleanupCommit: async (manifest: AcceptanceFireAlarmManifest) => { await pool.query(`INSERT INTO users(id,username,password_hash,role,is_active) VALUES($1,$2,$3,'inspector',true)`, [manifest.actor.id, manifest.actor.username, replacementHash]); } });
    await expectFailed(() => cleanupAcceptanceFireAlarm(remaining.manifest.runId, directory), "Unexpected post-commit owned row was accepted"); hooks();
    assert((await pool.query("SELECT 1 FROM users WHERE id=$1", [remaining.manifest.actor.id])).rowCount === 1, "Post-commit remaining-row injection did not execute");
    const deletedRemaining = await pool.query("DELETE FROM users WHERE id=$1 AND username=$2 AND role='inspector' RETURNING id,username", [remaining.manifest.actor.id, remaining.manifest.actor.username]);
    assertExactReturnedIds(deletedRemaining.rows, [remaining.manifest.actor.id], "post-commit injected actor cleanup"); assert(deletedRemaining.rows[0].username === remaining.manifest.actor.username, "Post-commit actor DELETE RETURNING username mismatch"); await cleanupAcceptanceFireAlarm(remaining.manifest.runId, directory);

    const valid = JSON.parse(await readFile(b.manifestPath, "utf8")) as AcceptanceFireAlarmManifest;
    for (const mutate of [
      (value: any) => { value.actor.id = a.manifest.actor.id; },
      (value: any) => { value.fixture.jobId = a.manifest.fixture.jobId; },
      (value: any) => { value.fixture.customerId = a.manifest.fixture.customerId; },
      (value: any) => { value.fixture.primaryLocationId = a.manifest.fixture.primaryLocationId; },
      (value: any) => { value.snapshot.customer.code = "tampered"; },
      (value: any) => { value.status = "active"; }
    ]) {
      const tampered = structuredClone(valid); mutate(tampered); await writeFile(b.manifestPath, JSON.stringify(tampered), "utf8"); await expectFailed(() => cleanupAcceptanceFireAlarm(b.manifest.runId, directory), "Well-formed manifest tampering was accepted");
    }
    await writeFile(b.manifestPath, JSON.stringify(valid), "utf8");
    const priorPublication = await readFile(b.manifestPath, "utf8");
    hooks({ beforeManifestReread: async (temporary: string) => { await writeFile(temporary, "{", "utf8"); } });
    await expectFailed(() => publishAcceptanceManifestForTest(b.manifestPath, valid), "Truncated temporary manifest was published"); hooks();
    assert(await readFile(b.manifestPath, "utf8") === priorPublication, "Failed temp publication replaced the authoritative manifest");
    hooks({ beforeManifestReread: async (temporary: string) => { const foreign = structuredClone(valid) as any; foreign.fixture.customerId = randomUUID(); await writeFile(temporary, JSON.stringify(foreign), "utf8"); } });
    await expectFailed(() => publishAcceptanceManifestForTest(b.manifestPath, valid), "Valid-looking foreign temp ID was published"); hooks();
    await expectFailed(() => publishAcceptanceManifestForTest(join(directory, `${randomUUID()}.json`), valid), "Filename/run mismatch was published");
    hooks({ beforeManifestReread: async () => { throw new Error("controlled interruption before rename"); } });
    await expectFailed(() => publishAcceptanceManifestForTest(b.manifestPath, valid), "Interrupted manifest update did not fail"); hooks();
    assert(await readFile(b.manifestPath, "utf8") === priorPublication, "Interrupted manifest update replaced authoritative contents");
    const manifestText = await readFile(b.manifestPath, "utf8"); assert(!manifestText.includes(password) && !/password|token|secret/i.test(manifestText), "Manifest contains a credential");
    let malformed = false; try { await cleanupAcceptanceFireAlarm("not-a-uuid", directory); } catch { malformed = true; } assert(malformed, "Malformed run ID was accepted");
    const malformedPath = join(directory, `${randomUUID()}.json`); await writeFile(malformedPath, "{", "utf8"); await expectFailed(() => cleanupAcceptanceFireAlarm(malformedPath.slice(-41, -5), directory), "Malformed JSON was accepted");
    await cleanupAcceptanceFireAlarm(b.manifest.runId, directory); await cleanupAcceptanceFireAlarm(b.manifest.runId, directory);
    assert(await readFile(sentinelPath, "utf8") === sentinel, "Validator touched isolated operational-equivalent manifests");
    completed = true;
    console.log(JSON.stringify({ status: "PASS", setupRollback: true, ambiguousCommitProbeRecovery: true, ambiguousFailedCommitProbeRecovery: true, strictManifestPublication: true, inspectionSnapshotFingerprint: true, selfConsistentManifestRedirectionRejectedByDatabase: true, acceptedAndDuplicateExactSetMatrix: true, failedEntryStrictnessMatrix: true, exactDeleteReturningProofs: true, missingDeleteTargetDetected: true, sameJobSecondActorProtected: true, partialChildrenFailClosed: true, cleanupPostCommitProof: true, cleanupRetry: true, runIsolation: true, operationalDirectoryIsolation: true, noCredentialPersistence: true }));
  } finally {
    setAcceptanceFireAlarmTestHooks({});
    await pool.end();
    if (completed) await rm(root, { recursive: true, force: true });
    else console.error(`Validator recovery artifacts preserved at ${root}`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
