import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { hashPassword } from "../auth/passwords.js";
import { pool } from "../db/pool.js";
import { masterServiceReportV3 } from "../inspections/templates/masterServiceReportV3.js";
import { currentUser } from "../middleware/currentUser.js";
import { authRouter } from "../routes/auth.js";
import { syncRouter } from "../routes/sync.js";
import { classifyFireAlarmUniqueViolationForTest, setFireAlarmSyncTestBoundaryHook, syncFireAlarmInspections } from "../sync/fireAlarmInspectionSync.js";

type ValidationCase = { customerId: string; revisionId: string; enabledId: string; zoneId: string; primaryLocationId: string; secondaryLocationId: string; jobId: string; snapshot: any };
const runId = randomUUID();
const prefix = `VALIDATION-FIRE-${runId}-`;
const actorUsername = `validation-fire-${runId}`;
const actorPassword = `Fire-alarm-validation-${randomUUID()}`;
const report: Record<string, unknown> = {}; let actorUserId: number | undefined;
const createdCases: ValidationCase[] = [];
const createdActors: Array<{ id: number; username: string }> = [];
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const code = (result: any) => result.failed?.[0]?.code;
type OwnedListener = { server: Server; baseUrl: string; ownerRunId: string; stopped: boolean };

function createValidationApp() {
  const app = express();
  app.disable("x-powered-by"); app.use(express.json({ limit: "1mb" }));
  app.get("/validation/health", (_request, response) => response.json({ status: "ok", ownerRunId: runId }));
  app.use(currentUser); app.use(authRouter); app.use(syncRouter);
  app.use((_request, response) => response.status(404).json({ error: "NOT_FOUND" }));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    console.error("Owned Fire Alarm validation listener error", error);
    response.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  });
  return app;
}

async function startOwnedListener(port = 0): Promise<OwnedListener> {
  const server = createServer(createValidationApp());
  await new Promise<void>((resolve, reject) => {
    const failed = (error: Error) => { server.off("listening", ready); reject(error); };
    const ready = () => { server.off("error", failed); resolve(); };
    server.once("error", failed); server.once("listening", ready); server.listen(port, "127.0.0.1");
  });
  const address = server.address() as AddressInfo | null;
  if (!address) { server.close(); throw new Error("Owned Fire Alarm validation listener has no address"); }
  return { server, baseUrl: `http://127.0.0.1:${address.port}`, ownerRunId: runId, stopped: false };
}

async function stopOwnedListener(listener: OwnedListener) {
  if (listener.stopped) return;
  await new Promise<void>((resolve, reject) => listener.server.close((error) => error ? reject(error) : resolve()));
  listener.stopped = true;
}

function throwWithPrimaryPrecedence(primaryError: unknown, cleanupError: unknown, reportSecondary = (error: unknown) => console.error("Secondary Fire Alarm validator cleanup failure", error)) {
  if (primaryError !== undefined) {
    if (cleanupError !== undefined) reportSecondary(cleanupError);
    throw primaryError;
  }
  if (cleanupError !== undefined) throw cleanupError;
}

function validateErrorPrecedence() {
  const primary = new Error("controlled primary"); const cleanupFailure = new Error("controlled cleanup"); let secondary: unknown;
  throwWithPrimaryPrecedence(undefined, undefined);
  let primaryThrown = false; try { throwWithPrimaryPrecedence(primary, undefined); } catch (error) { primaryThrown = true; assert(error === primary, "primary-only precedence failed"); } assert(primaryThrown, "primary-only precedence did not throw");
  let cleanupThrown = false; try { throwWithPrimaryPrecedence(undefined, cleanupFailure); } catch (error) { cleanupThrown = true; assert(error === cleanupFailure, "cleanup-only precedence failed"); } assert(cleanupThrown, "cleanup-only precedence did not throw");
  let combinedThrown = false; try { throwWithPrimaryPrecedence(primary, cleanupFailure, (error) => { secondary = error; }); } catch (error) { combinedThrown = true; assert(error === primary && secondary === cleanupFailure, "combined error precedence failed"); } assert(combinedThrown, "combined precedence did not throw");
  report.errorPrecedence = ["success/success", "failure/success", "success/failure", "failure/failure-primary-preserved"];
}

async function cleanupCases(cases: ValidationCase[]) {
  if (!cases.length) return;
  const jobIds = cases.map((item) => item.jobId); const enabledIds = cases.map((item) => item.enabledId);
  const revisionIds = cases.map((item) => item.revisionId); const customerIds = cases.map((item) => item.customerId);
  await pool.query("DELETE FROM master_system_form_instances WHERE inspection_group_id IN (SELECT id FROM master_system_inspections WHERE job_id=ANY($1::uuid[]))", [jobIds]);
  await pool.query("DELETE FROM master_system_inspections WHERE job_id=ANY($1::uuid[])", [jobIds]);
  await pool.query("DELETE FROM inspection_jobs WHERE id=ANY($1::uuid[])", [jobIds]);
  await pool.query("DELETE FROM customer_system_locations WHERE enabled_system_id=ANY($1::uuid[])", [enabledIds]);
  await pool.query("DELETE FROM customer_system_zones WHERE enabled_system_id=ANY($1::uuid[])", [enabledIds]);
  await pool.query("DELETE FROM customer_enabled_systems WHERE id=ANY($1::uuid[])", [enabledIds]);
  await pool.query("DELETE FROM customer_configuration_revisions WHERE id=ANY($1::uuid[])", [revisionIds]);
  await pool.query("DELETE FROM customers WHERE id=ANY($1::uuid[])", [customerIds]);
}

async function cleanupActor(id: number, username: string) {
  await pool.query("DELETE FROM audit_events WHERE actor_user_id=$1", [id]);
  await pool.query("DELETE FROM user_sessions WHERE user_id=$1", [id]);
  await pool.query("DELETE FROM users WHERE id=$1 AND username=$2", [id, username]);
}

async function createActor(username: string, password: string) {
  const actor = await pool.query<{ id: number }>("INSERT INTO users(username,password_hash,role,is_active) VALUES($1,$2,'inspector',true) RETURNING id", [username, await hashPassword(password)]);
  const id = Number(actor.rows[0]?.id); assert(Number.isSafeInteger(id) && id > 0, `isolated validation actor ${username} was not created`);
  createdActors.push({ id, username }); return id;
}

async function createCase(mutateSnapshot?: (snapshot: any) => void, identityPrefix = prefix): Promise<ValidationCase> {
  const item: ValidationCase = { customerId: randomUUID(), revisionId: randomUUID(), enabledId: randomUUID(), zoneId: randomUUID(), primaryLocationId: randomUUID(), secondaryLocationId: randomUUID(), jobId: randomUUID(), snapshot: undefined };
  const primary = { id: item.primaryLocationId, enabledSystemId: item.enabledId, zoneId: item.zoneId, key: "panel-zone", displayName: "Level 1 Lobby", presetRowCount: 1, rowPreset: { fireAlarmTable: "primary", assetReference: "FA-01" }, sortOrder: 1 };
  const secondary = { id: item.secondaryLocationId, enabledSystemId: item.enabledId, zoneId: null, key: "bell", displayName: "Level 2 Corridor", presetRowCount: 1, rowPreset: { fireAlarmTable: "secondary", assetReference: "AB-01" }, sortOrder: 2 };
  item.snapshot = { schemaVersion: 1, customer: { id: item.customerId, code: `${identityPrefix}${item.jobId}`, displayName: "Disposable Fire Alarm Validation" }, configuration: { revisionId: item.revisionId, revisionNumber: 1 }, template: { id: masterServiceReportV3.id, code: "MFE-FSSR", name: masterServiceReportV3.name, version: 3 }, enabledSystems: [{ enabledSystemId: item.enabledId, systemKey: "fire_alarm_detector", displayName: "Fire Alarm / Detector System", sortOrder: 5, definitionStatus: "confirmed", zones: [{ id: item.zoneId, enabledSystemId: item.enabledId, key: "zone-1", displayName: "Zone 1", sortOrder: 1 }], locations: [primary, secondary] }] };
  mutateSnapshot?.(item.snapshot);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,$3,true)", [item.customerId, item.snapshot.customer.code, item.snapshot.customer.displayName]);
    await client.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [item.revisionId, item.customerId, masterServiceReportV3.id]);
    await client.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'fire_alarm_detector',1,'{}'::jsonb)", [item.enabledId, item.revisionId, masterServiceReportV3.id]);
    await client.query("INSERT INTO customer_system_zones(id,enabled_system_id,zone_key,display_name,sort_order) VALUES($1,$2,'zone-1','Zone 1',1)", [item.zoneId, item.enabledId]);
    await client.query("INSERT INTO customer_system_locations(id,enabled_system_id,zone_id,location_key,display_name,preset_row_count,row_preset,sort_order) VALUES($1,$2,$3,'panel-zone','Level 1 Lobby',1,$4,1),($5,$2,NULL,'bell','Level 2 Corridor',1,$6,2)", [item.primaryLocationId, item.enabledId, item.zoneId, primary.rowPreset, item.secondaryLocationId, secondary.rowPreset]);
    await client.query("INSERT INTO inspection_jobs(id,template_id,master_template_version_id,job_reference,title,status,is_sample,customer_id,customer_configuration_revision_id,configuration_snapshot) VALUES($1,NULL,$2,$3,'Disposable Fire Alarm Validation','open',true,$4,$5,$6)", [item.jobId, masterServiceReportV3.id, `${prefix}${item.jobId}`, item.customerId, item.revisionId, item.snapshot]);
    await client.query("COMMIT"); createdCases.push(item); return item;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

function payload(item: ValidationCase, clientUuid = randomUUID()): any {
  const timestamp = "2026-08-06T00:00:00.000Z"; const response = () => ({ result: "good", remarks: "" });
  return { operationId: randomUUID(), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: { clientUuid, jobId: item.jobId, systemKey: "fire_alarm_detector", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: masterServiceReportV3.id, code: "MFE-FSSR", version: 3 }, configuration: { revisionId: item.revisionId, revisionNumber: 1 }, inspectionSnapshot: structuredClone(item.snapshot), responses: { schemaVersion: 1, controlPanelLocation: "Ground Floor Panel", primaryDeviceRows: [{ rowUuid: randomUUID(), source: "configured", configuredLocationId: item.primaryLocationId, configuredRowOrdinal: 1, zoneSnapshot: { id: item.zoneId, displayName: "Zone 1" }, locationSnapshot: { id: item.primaryLocationId, displayName: "Level 1 Lobby" }, displaySequence: 1, assetReference: "FA-01", alarmZone: "Zone 1", location: "Level 1 Lobby", manualCallPoint: "normal", flowSwitch: "test", heatDetector: "isolation", smokeDetector: "normal", remarks: "" }], chargerAndBatteries: { main_supply: response(), battery: response(), charger: response() }, mainFunctionKeys: { main_alarm_reset: response(), lamp_test: response(), evacuate: response(), ac_supply: response(), dc_supply: response(), spka_system: response(), alarm_lift_trip: response(), signal_gas_discharge: response() }, secondaryAlarmDeviceRows: [{ rowUuid: randomUUID(), source: "configured", configuredLocationId: item.secondaryLocationId, configuredRowOrdinal: 1, zoneSnapshot: null, locationSnapshot: { id: item.secondaryLocationId, displayName: "Level 2 Corridor" }, displaySequence: 1, assetReference: "AB-01", location: "Level 2 Corridor", alarmBell: "good", manualCallPoint: "poor", remarks: "" }], comments: "Validated" }, performedAt: timestamp } };
}
const submit = (item: any) => syncFireAlarmInspections([item], actorUserId);
async function reject(name: string, mutate: (item: any, source: ValidationCase) => void | Promise<void>) {
  const source = await createCase(); const item = payload(source); await mutate(item, source); const result = await submit(item);
  assert(code(result) === "VALIDATION_ERROR", `${name} was not rejected: ${JSON.stringify(result)}`);
  const parentCount = (await pool.query("SELECT 1 FROM master_system_inspections WHERE job_id=$1", [source.jobId])).rowCount;
  assert(parentCount === 0, `${name} left partial database state`);
}
async function rejectFrozenSnapshot(name: string, mutate: (snapshot: any) => void) {
  const source = await createCase(mutate); const item = payload(source); const result = await submit(item);
  assert(code(result) === "VALIDATION_ERROR", `${name} was not rejected: ${JSON.stringify(result)}`);
  assert((await pool.query("SELECT 1 FROM master_system_inspections WHERE job_id=$1", [source.jobId])).rowCount === 0, `${name} left partial database state`);
}

async function counts(jobId: string) {
  const result = await pool.query<{ parents: number; children: number }>("SELECT (SELECT count(*)::int FROM master_system_inspections WHERE job_id=$1) parents,(SELECT count(*)::int FROM master_system_form_instances f JOIN master_system_inspections i ON i.id=f.inspection_group_id WHERE i.job_id=$1) children", [jobId]);
  return result.rows[0];
}

async function deterministicRace(boundary: "beforeParentInsert" | "beforeChildInsert", left: any, right: any) {
  let reached = 0; let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  setFireAlarmSyncTestBoundaryHook(async (point) => {
    if (point !== boundary) return;
    reached += 1; if (reached === 2) release(); await ready;
  });
  try { const results = await Promise.all([submit(left), submit(right)]); assert(reached === 2, `both Fire Alarm transactions did not reach ${boundary}`); return results; }
  finally { setFireAlarmSyncTestBoundaryHook(undefined); }
}

async function forcedFailure(name: string, thrown: unknown) {
  const source = await createCase(); const item = payload(source);
  setFireAlarmSyncTestBoundaryHook(async (point) => { if (point === "beforeChildInsert") throw thrown; });
  try {
    const result = await submit(item);
    assert(code(result) === "SERVER_ERROR", `${name} was misclassified: ${JSON.stringify(result)}`);
    const remaining = await counts(source.jobId);
    assert(remaining.parents === 0 && remaining.children === 0, `${name} left partial rows: ${JSON.stringify(remaining)}`);
  } finally { setFireAlarmSyncTestBoundaryHook(undefined); }
}

async function proveListenerStartupFailure() {
  const blocker = createServer();
  await new Promise<void>((resolve, reject) => { blocker.once("error", reject); blocker.listen(0, "127.0.0.1", () => resolve()); });
  const port = (blocker.address() as AddressInfo).port; let rejected = false;
  try {
    try { const unexpected = await startOwnedListener(port); await stopOwnedListener(unexpected); }
    catch { rejected = true; }
  } finally { await new Promise<void>((resolve, reject) => blocker.close((error) => error ? reject(error) : resolve())); }
  assert(rejected, "owned listener startup failure did not fail closed");
}

async function httpJson(baseUrl: string, path: string, body: unknown, cookie?: string) {
  return fetch(`${baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
}

async function login(baseUrl: string, username: string, password: string) {
  const response = await httpJson(baseUrl, "/auth/login", { username, password });
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  return { response, cookie };
}

async function proveIgnoredSnapshotAuthority(name: string, mutate: (snapshot: any, marker: string) => void) {
  const source = await createCase(); const item = payload(source); const marker = `FORGED-${name}-${randomUUID()}`;
  mutate(item.payload.inspectionSnapshot, marker);
  const accepted = await submit(item); assert(accepted.acceptedIds[0] === item.entityId, `${name} client snapshot was not safely ignored`);
  const stored = (await pool.query<any>("SELECT inspection_snapshot,response_payload FROM master_system_form_instances WHERE client_uuid=$1", [item.entityId])).rows[0];
  assert(stored.inspection_snapshot.job.id === source.jobId && stored.inspection_snapshot.job.reference === `${prefix}${source.jobId}`
    && stored.inspection_snapshot.customer.id === source.customerId && stored.inspection_snapshot.template.id === masterServiceReportV3.id
    && stored.inspection_snapshot.template.code === "MFE-FSSR" && stored.inspection_snapshot.template.version === 3
    && stored.inspection_snapshot.configuration.revisionId === source.revisionId
    && stored.inspection_snapshot.system.displayName === "Fire Alarm / Detector System"
    && stored.inspection_snapshot.system.repetitionMode === "single_with_two_repeatable_tables"
    && !JSON.stringify(stored).includes(marker), `${name} forged snapshot authority reached stored data`);
  return name;
}

async function proveHttpAuthentication(listener: OwnedListener, otherActorUserId: number, otherUsername: string, otherPassword: string) {
  const health = await fetch(`${listener.baseUrl}/validation/health`); const healthBody = await health.json() as any;
  assert(health.status === 200 && healthBody.ownerRunId === runId, "listener ownership health proof failed");
  const source = await createCase(); const item = payload(source);
  let response = await httpJson(listener.baseUrl, "/sync", { items: [item] });
  assert(response.status === 401, `unauthenticated Fire Alarm sync returned ${response.status}`);
  const invalid = await login(listener.baseUrl, actorUsername, `${actorPassword}-invalid`);
  assert(invalid.response.status === 401 && !invalid.cookie, "invalid run-actor credentials were accepted");
  const other = await login(listener.baseUrl, otherUsername, otherPassword);
  assert(other.response.status === 200 && other.cookie, "other isolated actor could not authenticate as itself");
  const otherMe = await fetch(`${listener.baseUrl}/auth/me`, { headers: { Cookie: other.cookie! } }); const otherBody = await otherMe.json() as any;
  assert(otherMe.status === 200 && otherBody.user.id === otherActorUserId && otherBody.user.id !== actorUserId && otherBody.user.username === otherUsername, "another actor impersonated the run-owned actor");
  const authenticated = await login(listener.baseUrl, actorUsername, actorPassword);
  assert(authenticated.response.status === 200 && authenticated.cookie, "run-owned actor authentication failed");
  const me = await fetch(`${listener.baseUrl}/auth/me`, { headers: { Cookie: authenticated.cookie! } }); const meBody = await me.json() as any;
  assert(me.status === 200 && meBody.user.id === actorUserId && meBody.user.username === actorUsername, "authenticated session is not the run-owned actor");
  response = await httpJson(listener.baseUrl, "/sync", { items: [item] }, authenticated.cookie);
  const body = await response.json() as any;
  assert(response.status === 200 && body.acceptedIds?.length === 1 && body.acceptedIds[0] === item.entityId && body.duplicateIds?.length === 0 && body.failed?.length === 0, "authenticated run-specific Fire Alarm sync lacked exact acceptedIds membership");
  response = await httpJson(listener.baseUrl, "/sync", { items: [item] }, authenticated.cookie); const replay = await response.json() as any;
  assert(response.status === 200 && replay.duplicateIds?.length === 1 && replay.duplicateIds[0] === item.entityId, "authenticated exact replay lacked duplicateIds membership");
  report.httpAuthentication = { ownedLoopbackListener: true, unauthenticatedStatus: 401, invalidCredentialsStatus: 401, authenticatedAcceptedId: item.entityId, authenticatedActorId: actorUserId, otherActorUserId };
}

async function runValidation(listener: OwnedListener) {
    assert(listener.ownerRunId === runId && listener.server.listening, "owned validation listener is unavailable or belongs to another run");
    validateErrorPrecedence();
    actorUserId = await createActor(actorUsername, actorPassword);
    const otherUsername = `validation-fire-other-${runId}`; const otherPassword = `Other-fire-validation-${randomUUID()}`;
    const otherActorUserId = await createActor(otherUsername, otherPassword);
    const cleanupIsolationA = `validation-fire-cleanup-a-${runId}`; const cleanupIsolationB = `validation-fire-cleanup-b-${runId}`;
    const cleanupIsolationAId = await createActor(cleanupIsolationA, `Cleanup-A-${randomUUID()}`);
    const cleanupIsolationBId = await createActor(cleanupIsolationB, `Cleanup-B-${randomUUID()}`);
    await cleanupActor(cleanupIsolationAId, cleanupIsolationA);
    assert((await pool.query("SELECT 1 FROM users WHERE id=$1 AND username=$2", [cleanupIsolationBId, cleanupIsolationB])).rowCount === 1, "one validator actor cleanup deleted another run-owned actor");
    const isolationA = await createCase(undefined, `${prefix}isolation-a-`);
    const isolationB = await createCase(undefined, `VALIDATION-FIRE-${randomUUID()}-`);
    await cleanupCases([isolationA]);
    assert((await pool.query("SELECT 1 FROM customers WHERE id=$1", [isolationB.customerId])).rowCount === 1, "one validator identity deleted another identity's rows");
    report.concurrentCleanupIsolation = true;
    const acceptedCase = await createCase(), first = payload(acceptedCase), accepted = await submit(first);
    assert(accepted.acceptedIds.length === 1 && accepted.acceptedIds[0] === first.entityId && accepted.duplicateIds.length === 0 && accepted.failed.length === 0, "exact acceptedIds membership failed");
    const storedCounts = await pool.query<{ parents: string; children: string }>("SELECT (SELECT count(*) FROM master_system_inspections WHERE job_id=$1)::text parents,(SELECT count(*) FROM master_system_form_instances f JOIN master_system_inspections i ON i.id=f.inspection_group_id WHERE i.job_id=$1)::text children", [acceptedCase.jobId]);
    assert(storedCounts.rows[0].parents === "1" && storedCounts.rows[0].children === "1", "acceptance did not create exactly one parent and child");
    const stored = (await pool.query<any>("SELECT response_payload,inspection_snapshot,synced_by_user_id FROM master_system_form_instances WHERE client_uuid=$1", [first.entityId])).rows[0];
    assert(stored.response_payload.primaryDeviceRows[0].location === "Level 1 Lobby" && stored.inspection_snapshot.job.reference === `${prefix}${acceptedCase.jobId}` && Number(stored.synced_by_user_id) === actorUserId, "server authority or sync provenance was not stored");
    const replay = await submit(first); assert(replay.duplicateIds.length === 1 && replay.duplicateIds[0] === first.entityId && replay.acceptedIds.length === 0, "identical replay was not exact duplicateIds");
    const changed = structuredClone(first); changed.payload.responses.comments = "Changed"; const changedResult = await submit(changed); assert(changedResult.failed[0]?.id === first.entityId && code(changedResult) === "IDEMPOTENCY_CONFLICT", "changed replay conflict failed");
    const competing = payload(acceptedCase); const competingResult = await submit(competing); assert(competingResult.failed[0]?.id === competing.entityId && code(competingResult) === "ACTIVE_INSPECTION_EXISTS", "competing UUID conflict failed");
    const storedFingerprint = (await pool.query<{ request_fingerprint: string }>("SELECT request_fingerprint FROM master_system_form_instances WHERE client_uuid=$1", [first.entityId])).rows[0].request_fingerprint;
    const clientConstraint = await classifyFireAlarmUniqueViolationForTest({ code: "23505", constraint: "master_system_form_instances_client_uuid_key" }, first.entityId, acceptedCase.jobId, storedFingerprint);
    const groupConstraint = await classifyFireAlarmUniqueViolationForTest({ code: "23505", constraint: "master_system_inspections_job_id_system_key_key" }, competing.entityId, acceptedCase.jobId, "competing-fingerprint");
    const childConstraint = await classifyFireAlarmUniqueViolationForTest({ code: "23505", constraint: "master_system_form_instances_inspection_group_id_instance_key_key" }, first.entityId, acceptedCase.jobId, storedFingerprint);
    assert(clientConstraint && "duplicate" in clientConstraint && childConstraint && "duplicate" in childConstraint
      && groupConstraint && "failure" in groupConstraint && groupConstraint.failure?.code === "ACTIVE_INSPECTION_EXISTS", "recognized Fire Alarm constraint classification failed");
    const concurrentCase = await createCase(), left = payload(concurrentCase), right = payload(concurrentCase); const concurrent = await deterministicRace("beforeParentInsert", left, right); const outcomes = concurrent.map((result) => result.acceptedIds.length ? "ACCEPTED" : code(result));
    assert(outcomes.filter((value) => value === "ACCEPTED").length === 1 && outcomes.filter((value) => value === "ACTIVE_INSPECTION_EXISTS").length === 1, `concurrent result failed: ${outcomes}`);
    const sameCase = await createCase(), sameUuid = randomUUID(), sameLeft = payload(sameCase, sameUuid), sameRight = structuredClone(sameLeft); sameRight.operationId = randomUUID();
    const sameResults = await deterministicRace("beforeParentInsert", sameLeft, sameRight); const sameOutcomes = sameResults.map((result) => result.acceptedIds.length ? "ACCEPTED" : result.duplicateIds.length ? "DUPLICATE" : code(result));
    assert(sameOutcomes.filter((value) => value === "ACCEPTED").length === 1 && sameOutcomes.filter((value) => value === "DUPLICATE").length === 1, `same UUID race failed: ${sameOutcomes}`);
    await reject("wrong job identity", (item) => { item.payload.jobId = randomUUID(); });
    await reject("wrong template ID", (item) => { item.payload.masterTemplate.id = randomUUID(); });
    await reject("wrong template code", (item) => { item.payload.masterTemplate.code = "FORGED"; });
    await reject("wrong template version", (item) => { item.payload.masterTemplate.version = 2; });
    await reject("wrong configuration revision ID", (item) => { item.payload.configuration.revisionId = randomUUID(); });
    await reject("wrong configuration revision number", (item) => { item.payload.configuration.revisionNumber = 999; });
    await rejectFrozenSnapshot("disabled/unconfirmed system", (snapshot) => { snapshot.enabledSystems[0].definitionStatus = "requires_confirmation"; });
    await rejectFrozenSnapshot("malformed rowPreset", (snapshot) => { snapshot.enabledSystems[0].locations[0].rowPreset = { fireAlarmTable: "wrong" }; });
    const invalid: Array<[string, (item: any) => void]> = [
      ["missing configured row", (item) => item.payload.responses.primaryDeviceRows.pop()],
      ["additional forged configured row", (item) => item.payload.responses.primaryDeviceRows.push({ ...item.payload.responses.primaryDeviceRows[0], rowUuid: randomUUID(), configuredRowOrdinal: 2, displaySequence: 2 })],
      ["wrong table role", (item) => { item.payload.responses.secondaryAlarmDeviceRows = [item.payload.responses.primaryDeviceRows[0]]; item.payload.responses.primaryDeviceRows = []; }],
      ["wrong configured ordinal", (item) => { item.payload.responses.primaryDeviceRows[0].configuredRowOrdinal = 2; }],
      ["forged configured asset reference", (item) => { item.payload.responses.primaryDeviceRows[0].assetReference = "FORGED"; }],
      ["forged configured snapshot", (item) => { item.payload.responses.primaryDeviceRows[0].locationSnapshot.displayName = "Forged"; }],
      ["forged configured zone snapshot", (item) => { item.payload.responses.primaryDeviceRows[0].zoneSnapshot.displayName = "Forged"; }],
      ["duplicate row UUID", (item) => { item.payload.responses.secondaryAlarmDeviceRows[0].rowUuid = item.payload.responses.primaryDeviceRows[0].rowUuid; }],
      ["technician configured provenance", (item) => { const row = item.payload.responses.primaryDeviceRows[0]; row.source = "technician"; }],
      ["invalid enum", (item) => { item.payload.responses.primaryDeviceRows[0].flowSwitch = "bad"; }],
      ["incomplete required field", (item) => { item.payload.responses.chargerAndBatteries.battery.result = null; }],
      ["extra keys", (item) => { item.payload.responses.extra = true; }],
      ["over-limit string", (item) => { item.payload.responses.comments = "x".repeat(4001); }],
      ["wrong instance", (item) => { item.payload.instanceKey = "wrong"; }],
      ["wrong zone", (item) => { item.payload.configuredZoneId = randomUUID(); }],
      ["wrong location", (item) => { item.payload.configuredLocationId = randomUUID(); }],
      ["wrong sequence", (item) => { item.payload.displaySequence = 2; }]
    ];
    for (const [name, mutate] of invalid) await reject(name, (item) => mutate(item));
    const ignoredAuthorityMutations: Array<[string, (snapshot: any, marker: string) => void]> = [
      ["job reference/title", (snapshot, marker) => { snapshot.job = { id: randomUUID(), reference: marker, title: marker }; }],
      ["customer identity", (snapshot, marker) => { snapshot.customer = { id: randomUUID(), code: marker, displayName: marker }; }],
      ["template identity", (snapshot, marker) => { snapshot.template = { id: randomUUID(), code: marker, name: marker, version: 999 }; }],
      ["configuration identity", (snapshot, marker) => { snapshot.configuration = { revisionId: randomUUID(), revisionNumber: 999, label: marker }; }],
      ["system label", (snapshot, marker) => { snapshot.system = { displayName: marker }; }],
      ["repetition mode", (snapshot, marker) => { snapshot.system = { repetitionMode: marker }; }],
      ["definition labels", (snapshot, marker) => { snapshot.system = { definition: { displayName: marker } }; }],
      ["block labels", (snapshot, marker) => { snapshot.system = { definition: { blocks: [{ label: marker }] } }; }],
      ["field labels", (snapshot, marker) => { snapshot.system = { definition: { fields: [{ label: marker }] } }; }],
      ["allowed-result labels", (snapshot, marker) => { snapshot.system = { definition: { allowedResults: [{ label: marker, value: "good" }] } }; }],
      ["allowed-result values", (snapshot, marker) => { snapshot.system = { definition: { allowedResults: [{ label: "Good", value: marker }] } }; }],
      ["resolved controls", (snapshot, marker) => { snapshot.system = { resolvedControls: { forged: marker } }; }]
    ];
    const authorityMatrix: string[] = [];
    for (const [name, mutate] of ignoredAuthorityMutations) authorityMatrix.push(await proveIgnoredSnapshotAuthority(name, mutate));
    const creatorInvalid: Array<[string, (item: any) => void]> = [
      ["non-canonical creator timestamp", (item) => { item.payload.originalCreatorSnapshot = { source: "device_reported", userId: 1, username: "tech", role: "inspector", capturedAt: "2026-08-06T00:00:00Z" }; }],
      ["invalid creator timestamp", (item) => { item.payload.originalCreatorSnapshot = { source: "device_reported", userId: 1, username: "tech", role: "inspector", capturedAt: "2026-02-30T00:00:00.000Z" }; }],
      ["unsafe creator user ID", (item) => { item.payload.originalCreatorSnapshot = { source: "device_reported", userId: Number.MAX_SAFE_INTEGER + 1, username: "tech", role: "inspector", capturedAt: "2026-08-06T00:00:00.000Z" }; }],
      ["fractional creator user ID", (item) => { item.payload.originalCreatorSnapshot = { source: "device_reported", userId: 1.5, username: "tech", role: "inspector", capturedAt: "2026-08-06T00:00:00.000Z" }; }],
      ["oversized creator username", (item) => { item.payload.originalCreatorSnapshot = { source: "device_reported", userId: 1, username: "x".repeat(161), role: "inspector", capturedAt: "2026-08-06T00:00:00.000Z" }; }],
      ["empty creator username", (item) => { item.payload.originalCreatorSnapshot = { source: "device_reported", userId: 1, username: "   ", role: "inspector", capturedAt: "2026-08-06T00:00:00.000Z" }; }],
      ["extra creator member", (item) => { item.payload.originalCreatorSnapshot = { source: "device_reported", userId: 1, username: "tech", role: "inspector", capturedAt: "2026-08-06T00:00:00.000Z", verified: true }; }],
      ["forged server-owned provenance field", (item) => { item.payload.syncedByUsername = "forged"; }]
    ];
    for (const [name, mutate] of creatorInvalid) await reject(name, mutate);
    const creatorCase = await createCase(), creatorItem = payload(creatorCase); creatorItem.payload.originalCreatorSnapshot = { source: "device_reported", userId: 7, username: "  device technician  ", role: "inspector", capturedAt: "2026-08-06T00:00:00.000Z" };
    assert((await submit(creatorItem)).acceptedIds[0] === creatorItem.entityId, "canonical creator provenance was rejected");
    const storedCreator = (await pool.query<any>("SELECT original_creator_snapshot FROM master_system_form_instances WHERE client_uuid=$1", [creatorItem.entityId])).rows[0].original_creator_snapshot;
    assert(storedCreator.username === "device technician" && (await submit(creatorItem)).duplicateIds[0] === creatorItem.entityId, "creator provenance was not canonicalized before storage/fingerprinting");
    const provenanceRaceCase = await createCase(), provenanceUuid = randomUUID(), provenanceLeft = payload(provenanceRaceCase, provenanceUuid), provenanceRight = structuredClone(provenanceLeft); provenanceRight.operationId = randomUUID();
    provenanceLeft.payload.originalCreatorSnapshot = { source: "device_reported", userId: 7, username: "alpha", role: "inspector", capturedAt: "2026-08-06T00:00:00.000Z" };
    provenanceRight.payload.originalCreatorSnapshot = { source: "device_reported", userId: 7, username: "beta", role: "inspector", capturedAt: "2026-08-06T00:00:00.000Z" };
    const provenanceOutcomes = (await deterministicRace("beforeParentInsert", provenanceLeft, provenanceRight)).map((result) => result.acceptedIds.length ? "ACCEPTED" : code(result));
    assert(provenanceOutcomes.filter((value) => value === "ACCEPTED").length === 1 && provenanceOutcomes.filter((value) => value === "IDEMPOTENCY_CONFLICT").length === 1, `changed canonical provenance race failed: ${provenanceOutcomes}`);
    await forcedFailure("generic child insertion failure", new Error("forced child insert failure"));
    await forcedFailure("unknown unique constraint", { code: "23505", constraint: "unrelated_unique_constraint" });
    await proveHttpAuthentication(listener, otherActorUserId, otherUsername, otherPassword);
    report.acceptance = true; report.duplicateReplay = true; report.changedReplayConflict = true; report.competingUuidConflict = true; report.concurrentDifferentUuid = outcomes; report.concurrentSameUuid = sameOutcomes; report.authorityAndProvenance = true; report.authorityMutationMatrix = authorityMatrix; report.creatorValidation = creatorInvalid.length + 1; report.invalidCases = invalid.length + 8; report.databaseErrorClassification = true; report.recognizedConstraints = ["client UUID -> duplicate", "job/system group -> active conflict", "primary child -> duplicate"]; report.noPartialTransactions = true;
}

async function main() {
  let primaryError: unknown; let cleanupError: unknown; let listener: OwnedListener | undefined;
  try {
    assert(!process.env.VALIDATION_API_URL, "External Fire Alarm validation listeners are not supported; this validator owns its loopback listener");
    await proveListenerStartupFailure(); listener = await startOwnedListener();
    await runValidation(listener);
  } catch (error) { primaryError = error; }
  const cleanupTasks: Array<[string, () => Promise<void>]> = [
    ["owned listener shutdown", async () => { if (listener) { await stopOwnedListener(listener); report.listenerStopped = listener.stopped; } }],
    ["run-owned database cleanup", async () => { await cleanupCases(createdCases); }],
    ...createdActors.map((actor) => [`run-owned actor cleanup (${actor.id})`, async () => { await cleanupActor(actor.id, actor.username); }] as [string, () => Promise<void>]),
    ["database pool shutdown", async () => { await pool.end(); }]
  ];
  for (const [name, task] of cleanupTasks) {
    try { await task(); }
    catch (error) {
      if (cleanupError === undefined) cleanupError = error;
      else console.error(`Additional Fire Alarm cleanup failure (${name})`, error);
    }
  }
  throwWithPrimaryPrecedence(primaryError, cleanupError);
  console.log(JSON.stringify({ status: "PASS", ...report }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
