import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../db/pool.js";
import { syncHydrantInspections } from "./hydrantInspectionSync.js";
import { masterServiceReportV1 } from "../inspections/templates/masterServiceReportV1.js";

type R = Record<string, any>;
type TestSyncItem = { operationId: unknown; entityType: unknown; entityId: unknown; action: unknown; payload: unknown };

let sequence = 1000;
const id = () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
const hydrantDefinition = masterServiceReportV1.systems.find((system) => system.key === "hydrant")!;

type JobFixture = {
  id: string;
  templateId: string;
  revisionId: string;
  enabledSystemId: string;
  zoneId: string;
  locationId: string;
  snapshot: R;
};

function makeJobFixture(): JobFixture {
  const fixture = {
    id: id(),
    templateId: id(),
    revisionId: id(),
    enabledSystemId: id(),
    zoneId: id(),
    locationId: id(),
    snapshot: {} as R
  };
  fixture.snapshot = {
    customer: { id: id(), code: "CUST-1", displayName: "Test Customer" },
    configuration: { revisionId: fixture.revisionId, revisionNumber: 1 },
    template: { id: fixture.templateId, code: "MFE-FSSR", name: "Master Service Report", version: 1 },
    enabledSystems: [{
      enabledSystemId: fixture.enabledSystemId,
      systemKey: "hydrant",
      definitionStatus: "confirmed",
      zones: [{ id: fixture.zoneId, enabledSystemId: fixture.enabledSystemId, key: "zone-a", displayName: "Zone A", sortOrder: 1 }],
      locations: [{
        id: fixture.locationId,
        enabledSystemId: fixture.enabledSystemId,
        zoneId: fixture.zoneId,
        key: "north-gate",
        displayName: "North gate",
        presetRowCount: 2,
        rowPreset: { assetReference: "HYD-1" },
        sortOrder: 1
      }]
    }]
  };
  return fixture;
}

function inspectionSnapshotFor(job: JobFixture): R {
  return {
    schemaVersion: 1,
    capturedAt: "2026-08-10T00:00:00.000Z",
    job: { id: job.id, reference: `JOB-${job.id.slice(-4)}`, title: "Hydrant authority test" },
    customer: structuredClone(job.snapshot.customer),
    configuration: structuredClone(job.snapshot.configuration),
    template: structuredClone(job.snapshot.template),
    system: {
      ...structuredClone(job.snapshot.enabledSystems[0]),
      definition: structuredClone(hydrantDefinition),
      repetitionMode: "single_with_repeatable_rows"
    }
  };
}

function configuredRow(job: JobFixture, ordinal: number, sortOrder: number): R {
  return {
    rowUuid: id(),
    source: "configured",
    configuredLocationId: job.locationId,
    configuredRowOrdinal: ordinal,
    zoneSnapshot: { id: job.zoneId, displayName: "Zone A" },
    locationSnapshot: { id: job.locationId, displayName: "North gate" },
    assetReference: "HYD-1",
    locationText: "North gate",
    canvasHose1Result: "good",
    canvasHose2Result: "poor",
    diffuserNozzleResult: "good",
    landingValveResult: "good",
    landingValveHandleResult: "poor",
    hoseCabinetResult: "good",
    keyLockResult: "good",
    remarks: "Checked",
    sortOrder
  };
}

function technicianRow(sortOrder: number): R {
  return {
    rowUuid: id(),
    source: "technician",
    configuredLocationId: null,
    configuredRowOrdinal: null,
    zoneSnapshot: null,
    locationSnapshot: null,
    assetReference: "TECH-1",
    locationText: "Technician-added location",
    canvasHose1Result: "good",
    canvasHose2Result: "poor",
    diffuserNozzleResult: "good",
    landingValveResult: "good",
    landingValveHandleResult: "poor",
    hoseCabinetResult: "good",
    keyLockResult: "good",
    remarks: "Checked locally",
    sortOrder
  };
}

function payloadFor(job: JobFixture, rows = [configuredRow(job, 1, 1), configuredRow(job, 2, 2)]): R {
  return {
    clientUuid: id(),
    jobId: job.id,
    systemKey: "hydrant",
    instanceKey: "primary",
    configuredZoneId: null,
    configuredLocationId: null,
    displaySequence: 1,
    originalCreatorSnapshot: null,
    masterTemplate: { id: job.templateId, code: "MFE-FSSR", version: 1 },
    configuration: { revisionId: job.revisionId, revisionNumber: 1 },
    inspectionSnapshot: inspectionSnapshotFor(job),
    responses: { schemaVersion: 1, hydrantType: "meter", rows, comments: "Hydrant authority test" },
    performedAt: "2026-08-10T00:00:00.000Z"
  };
}

class DisposableHydrantDatabase {
  readonly jobs = new Map<string, R>();
  readonly forms = new Map<string, { requestFingerprint: string; responsePayload: unknown; inspectionSnapshot: unknown; performedAt: unknown; originalCreatorSnapshot: unknown }>();
  readonly groups = new Map<string, string>();
  private jobLock: Promise<void> = Promise.resolve();

  private async lockJob() {
    const previous = this.jobLock;
    let release: () => void = () => undefined;
    this.jobLock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    return release;
  }

  createClient() {
    let releaseJobLock: (() => void) | undefined;
    return {
      query: async (sql: string, params: unknown[] = []) => {
      if (sql === "BEGIN") return { rowCount: 0, rows: [] };
      if (sql === "COMMIT" || sql === "ROLLBACK") {
        releaseJobLock?.();
        releaseJobLock = undefined;
        return { rowCount: 0, rows: [] };
      }
      if (sql.startsWith("SELECT request_fingerprint")) {
        const form = this.forms.get(params[0] as string);
        return form ? { rowCount: 1, rows: [{ request_fingerprint: form.requestFingerprint }] } : { rowCount: 0, rows: [] };
      }
      if (sql.startsWith("SELECT configuration_snapshot,status,job_reference,title")) {
        releaseJobLock ??= await this.lockJob();
        const job = this.jobs.get(params[0] as string);
        return job ? { rowCount: 1, rows: [job] } : { rowCount: 0, rows: [] };
      }
      if (sql.startsWith("SELECT 1 FROM master_system_inspections")) {
        return { rowCount: this.groups.has(params[0] as string) ? 1 : 0, rows: [] };
      }
      if (sql.startsWith("SELECT definition")) return { rowCount: 1, rows: [{ definition: structuredClone(hydrantDefinition), definition_status: "confirmed" }] };
      if (sql.startsWith("INSERT INTO master_system_inspections")) {
        this.groups.set(params[1] as string, params[0] as string);
        return { rowCount: 1, rows: [] };
      }
      if (sql.startsWith("INSERT INTO master_system_form_instances")) {
        this.forms.set(params[2] as string, { requestFingerprint: params[7] as string, inspectionSnapshot: params[5], responsePayload: params[6], performedAt: params[8], originalCreatorSnapshot: params[9] });
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected Hydrant test query: ${sql}`);
      },
      release: () => undefined
    };
  }

  readonly client = this.createClient();

  add(job: JobFixture) {
    this.jobs.set(job.id, { status: "open", job_reference: `JOB-${job.id.slice(-4)}`, title: "Hydrant authority test", configuration_snapshot: job.snapshot });
  }

  counts() {
    return { groups: this.groups.size, forms: this.forms.size };
  }
}

function setUp(job = makeJobFixture()) {
  const database = new DisposableHydrantDatabase();
  database.add(job);
  return { database, job };
}

function protectedEnvelope(payload: R): TestSyncItem {
  return { operationId: id(), entityType: "masterSystemInspection", entityId: payload.clientUuid, action: "create", payload };
}

async function submitEnvelope(item: TestSyncItem) {
  return syncHydrantInspections([item], 42);
}

async function submit(payload: R, overrides: Partial<TestSyncItem> = {}) {
  return submitEnvelope({ ...protectedEnvelope(payload), ...overrides });
}

async function expectRejectedWithoutPersistence(database: DisposableHydrantDatabase, payload: R, overrides: Partial<TestSyncItem> = {}) {
  const before = database.counts();
  const result = await submit(payload, overrides);
  assert.deepEqual(result.acceptedIds, []);
  assert.deepEqual(result.duplicateIds, []);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]?.id, payload.clientUuid);
  assert.equal(result.failed[0]?.code, "VALIDATION_ERROR");
  assert.deepEqual(database.counts(), before);
}

test("Hydrant configured rows are validated against the authoritative job snapshot", async (t) => {
  const poolWithMock = pool as unknown as { connect: () => Promise<unknown> };
  const originalConnect = poolWithMock.connect;
  poolWithMock.connect = async () => new DisposableHydrantDatabase().client;

  try {
    await t.test("1. exact configured rows are accepted and persisted unchanged", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      const payload = payloadFor(job);
      const result = await submit(payload);
      assert.deepEqual(result, { acceptedIds: [payload.clientUuid], duplicateIds: [], failed: [] });
      assert.deepEqual(database.counts(), { groups: 1, forms: 1 });
      assert.deepEqual(database.forms.get(payload.clientUuid)?.responsePayload, payload.responses);
    });

    await t.test("2. missing configured rows are rejected", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      await expectRejectedWithoutPersistence(database, payloadFor(job, [configuredRow(job, 1, 1)]));
    });

    await t.test("3. duplicate configured identities are rejected", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      const duplicate = configuredRow(job, 1, 3);
      await expectRejectedWithoutPersistence(database, payloadFor(job, [configuredRow(job, 1, 1), configuredRow(job, 2, 2), duplicate]));
    });

    await t.test("4. modified configured identity is rejected", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      const rows = [configuredRow(job, 1, 1), configuredRow(job, 2, 2)];
      rows[0].configuredLocationId = id();
      await expectRejectedWithoutPersistence(database, payloadFor(job, rows));
    });

    await t.test("5. configured rows from another job are rejected", async () => {
      const { database, job } = setUp();
      const foreignJob = makeJobFixture();
      database.add(foreignJob);
      poolWithMock.connect = async () => database.client;
      await expectRejectedWithoutPersistence(database, payloadFor(job, [configuredRow(foreignJob, 1, 1), configuredRow(foreignJob, 2, 2)]));
    });

    await t.test("6. revision and template mismatches are rejected", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      const revisionMismatch = payloadFor(job);
      revisionMismatch.configuration.revisionId = id();
      await expectRejectedWithoutPersistence(database, revisionMismatch);
      const templateMismatch = payloadFor(job);
      templateMismatch.masterTemplate.id = id();
      await expectRejectedWithoutPersistence(database, templateMismatch);
    });

    await t.test("7. modified configured fields are rejected", async () => {
      const mutations: Array<[string, (row: R) => void]> = [
        ["asset reference", (row) => { row.assetReference = "MODIFIED"; }],
        ["location text", (row) => { row.locationText = "Modified location"; }],
        ["zone snapshot", (row) => { row.zoneSnapshot = { ...row.zoneSnapshot, displayName: "Modified zone" }; }],
        ["location snapshot", (row) => { row.locationSnapshot = { ...row.locationSnapshot, displayName: "Modified location" }; }]
      ];
      for (const [, mutate] of mutations) {
        const { database, job } = setUp();
        poolWithMock.connect = async () => database.client;
        const rows = [configuredRow(job, 1, 1), configuredRow(job, 2, 2)];
        mutate(rows[0]);
        await expectRejectedWithoutPersistence(database, payloadFor(job, rows));
      }
    });

    await t.test("8. technician rows cannot spoof configured provenance", async () => {
      const spoofers: Array<(row: R, job: JobFixture) => void> = [
        (row, job) => { row.configuredLocationId = job.locationId; row.configuredRowOrdinal = 1; },
        (row, job) => { row.zoneSnapshot = { id: job.zoneId, displayName: "Zone A" }; },
        (row, job) => { row.locationSnapshot = { id: job.locationId, displayName: "North gate" }; }
      ];
      for (const spoof of spoofers) {
        const { database, job } = setUp();
        poolWithMock.connect = async () => database.client;
        const technician = technicianRow(3);
        spoof(technician, job);
        await expectRejectedWithoutPersistence(database, payloadFor(job, [configuredRow(job, 1, 1), configuredRow(job, 2, 2), technician]));
      }
    });

    await t.test("9. legitimate technician rows are accepted with their stable UUID", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      const technician = technicianRow(3);
      const payload = payloadFor(job, [configuredRow(job, 1, 1), configuredRow(job, 2, 2), technician]);
      const result = await submit(payload);
      assert.deepEqual(result, { acceptedIds: [payload.clientUuid], duplicateIds: [], failed: [] });
      const stored = database.forms.get(payload.clientUuid)?.responsePayload as R;
      assert.equal(stored.rows[2].rowUuid, technician.rowUuid);
    });

    await t.test("10. exact accepted retry is idempotent and creates no second inspection", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      const payload = payloadFor(job);
      assert.deepEqual(await submit(payload), { acceptedIds: [payload.clientUuid], duplicateIds: [], failed: [] });
      assert.deepEqual(await submit(payload), { acceptedIds: [], duplicateIds: [payload.clientUuid], failed: [] });
      assert.deepEqual(database.counts(), { groups: 1, forms: 1 });
    });

    await t.test("11. ambiguous authoritative Hydrant configuration fails closed", async () => {
      const { database, job } = setUp();
      const system = job.snapshot.enabledSystems[0];
      system.locations.push({ ...system.locations[0] });
      poolWithMock.connect = async () => database.client;
      await expectRejectedWithoutPersistence(database, payloadFor(job));
    });

    await t.test("12. missing authoritative Hydrant configuration is rejected", async () => {
      const { database, job } = setUp();
      job.snapshot.enabledSystems = [];
      poolWithMock.connect = async () => database.client;
      await expectRejectedWithoutPersistence(database, payloadFor(job));
    });

    await t.test("P1-1. nested Hydrant data changes produce an idempotency conflict", async () => {
      const mutations: Array<[string, (payload: R) => void]> = [
        ["Hydrant Type", (payload) => { payload.responses.hydrantType = "public"; }],
        ["row response", (payload) => { payload.responses.rows[0].canvasHose1Result = "poor"; }],
        ["Comments", (payload) => { payload.responses.comments = "Changed comments"; }]
      ];
      for (const [, mutate] of mutations) {
        const { database, job } = setUp();
        poolWithMock.connect = async () => database.client;
        const payload = payloadFor(job);
        assert.deepEqual(await submit(payload), { acceptedIds: [payload.clientUuid], duplicateIds: [], failed: [] });
        const altered = structuredClone(payload);
        mutate(altered);
        const result = await submit(altered);
        assert.equal(result.failed[0]?.code, "IDEMPOTENCY_CONFLICT");
        assert.deepEqual(database.counts(), { groups: 1, forms: 1 });
      }
    });

    await t.test("P1-1. exact payload retry remains a duplicate", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      const payload = payloadFor(job);
      assert.deepEqual(await submit(payload), { acceptedIds: [payload.clientUuid], duplicateIds: [], failed: [] });
      assert.deepEqual(await submit(structuredClone(payload)), { acceptedIds: [], duplicateIds: [payload.clientUuid], failed: [] });
    });

    await t.test("Hydrant sync smoke: malformed response payload is rejected", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      const payload = payloadFor(job);
      payload.responses.rows[0].canvasHose1Result = "invalid";
      await expectRejectedWithoutPersistence(database, payload);
    });

    await t.test("P1-2. persisted snapshot is reconstructed only from authoritative job data", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      const payload = payloadFor(job);
      assert.deepEqual(await submit(payload), { acceptedIds: [payload.clientUuid], duplicateIds: [], failed: [] });
      const stored = database.forms.get(payload.clientUuid)?.inspectionSnapshot as R;
      const { acceptedAt, ...persistedAuthority } = stored;
      const { capturedAt, ...submittedAuthority } = payload.inspectionSnapshot;
      assert.equal(typeof acceptedAt, "string");
      assert.deepEqual(persistedAuthority, { schemaVersion: 1, ...submittedAuthority });
      assert.equal(Object.hasOwn(stored, "capturedAt"), false);
    });

    await t.test("P1-2. contradictory or injected client snapshots are rejected without persistence", async () => {
      const mutations: Array<[string, (payload: R) => void]> = [
        ["job", (payload) => { payload.inspectionSnapshot.job.reference = "FOREIGN-JOB"; }],
        ["customer", (payload) => { payload.inspectionSnapshot.customer = { ...payload.inspectionSnapshot.customer, id: "foreign-customer" }; }],
        ["zone", (payload) => { payload.inspectionSnapshot.system.zones[0].displayName = "Foreign zone"; }],
        ["location", (payload) => { payload.inspectionSnapshot.system.locations[0].displayName = "Foreign location"; }],
        ["unknown identity key", (payload) => { payload.inspectionSnapshot.system.foreignConfigurationId = id(); }],
        ["unknown envelope identity key", (payload) => { payload.foreignConfigurationId = id(); }]
      ];
      for (const [, mutate] of mutations) {
        const { database, job } = setUp();
        poolWithMock.connect = async () => database.client;
        const payload = payloadFor(job);
        mutate(payload);
        await expectRejectedWithoutPersistence(database, payload);
      }
    });

    await t.test("P1-3. concurrent exact UUID retries produce one acceptance and one duplicate", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.createClient();
      const payload = payloadFor(job);
      const [first, second] = await Promise.all([submit(payload), submit(structuredClone(payload))]);
      const results = [first, second];
      assert.equal(results.filter((result) => result.acceptedIds[0] === payload.clientUuid).length, 1);
      assert.equal(results.filter((result) => result.duplicateIds[0] === payload.clientUuid).length, 1);
      assert.equal(results.flatMap((result) => result.failed).some((failure) => failure.code === "ACTIVE_INSPECTION_EXISTS"), false);
      assert.deepEqual(database.counts(), { groups: 1, forms: 1 });
    });

    await t.test("P1-3. concurrent altered retry is an idempotency conflict, never a duplicate", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.createClient();
      const payload = payloadFor(job);
      const altered = structuredClone(payload);
      altered.responses.comments = "Concurrent altered retry";
      const results = await Promise.all([submit(payload), submit(altered)]);
      assert.equal(results.flatMap((result) => result.acceptedIds).length, 1);
      assert.equal(results.flatMap((result) => result.duplicateIds).length, 0);
      assert.equal(results.flatMap((result) => result.failed).filter((failure) => failure.code === "IDEMPOTENCY_CONFLICT").length, 1);
      assert.deepEqual(database.counts(), { groups: 1, forms: 1 });
    });

    await t.test("C2-1. valid Hydrant envelope matches the protected master-system contract and is accepted", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      const payload = payloadFor(job);
      const envelope = protectedEnvelope(payload);
      assert.deepEqual(Object.keys(envelope), ["operationId", "entityType", "entityId", "action", "payload"]);
      assert.match(envelope.operationId as string, /^[0-9a-f-]{36}$/i);
      assert.equal(envelope.entityType, "masterSystemInspection");
      assert.equal(envelope.action, "create");
      assert.equal(envelope.entityId, payload.clientUuid);
      assert.deepEqual(await submitEnvelope(envelope), { acceptedIds: [payload.clientUuid], duplicateIds: [], failed: [] });
      assert.deepEqual(database.counts(), { groups: 1, forms: 1 });
    });

    await t.test("C2-2. malformed operationId rejects before persistence", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      await expectRejectedWithoutPersistence(database, payloadFor(job), { operationId: "not-a-uuid" });
    });

    await t.test("C2-3. missing operationId rejects before persistence", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      await expectRejectedWithoutPersistence(database, payloadFor(job), { operationId: undefined });
    });

    await t.test("C2-4. unsupported action rejects before persistence", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      await expectRejectedWithoutPersistence(database, payloadFor(job), { action: "update" });
    });

    await t.test("C2-5. malformed creator provenance rejects before persistence", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      const payload = payloadFor(job);
      payload.originalCreatorSnapshot = { source: "device_reported", userId: 0, username: "technician", role: "inspector", capturedAt: "2026-08-10T00:00:00.000Z" };
      await expectRejectedWithoutPersistence(database, payload);
    });

    await t.test("C2-6. unknown creator identity key rejects before persistence", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      const payload = payloadFor(job);
      payload.originalCreatorSnapshot = { source: "device_reported", userId: 7, username: "technician", role: "inspector", capturedAt: "2026-08-10T00:00:00.000Z", foreignIdentity: id() };
      await expectRejectedWithoutPersistence(database, payload);
    });

    await t.test("C2-7. invalid performedAt rejects before persistence", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      const payload = payloadFor(job);
      payload.performedAt = "2026-02-30T00:00:00.000Z";
      await expectRejectedWithoutPersistence(database, payload);
    });

    await t.test("C2-8. invalid inspection and creator capturedAt values reject before persistence", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      const payload = payloadFor(job);
      payload.inspectionSnapshot.capturedAt = "2026-08-10T00:00:00+08:00";
      await expectRejectedWithoutPersistence(database, payload);

      const creatorCase = setUp();
      poolWithMock.connect = async () => creatorCase.database.client;
      const creatorPayload = payloadFor(creatorCase.job);
      creatorPayload.originalCreatorSnapshot = { source: "device_reported", userId: 7, username: "technician", role: "inspector", capturedAt: "arbitrary timestamp text" };
      await expectRejectedWithoutPersistence(creatorCase.database, creatorPayload);
    });

    await t.test("C2-9. valid canonical timestamps and creator provenance are accepted and canonicalized", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      const payload = payloadFor(job);
      payload.originalCreatorSnapshot = { source: "device_reported", userId: 7, username: "  device technician  ", role: "inspector", capturedAt: "2026-08-10T00:00:00.000Z" };
      assert.deepEqual(await submit(payload), { acceptedIds: [payload.clientUuid], duplicateIds: [], failed: [] });
      const stored = database.forms.get(payload.clientUuid);
      assert.equal((stored?.originalCreatorSnapshot as R).username, "device technician");
      assert.equal(stored?.performedAt, payload.performedAt);
    });

    await t.test("C2-10. exact valid retry is idempotent and a new valid operationId does not alter payload identity", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      const payload = payloadFor(job);
      const envelope = protectedEnvelope(payload);
      assert.deepEqual(await submitEnvelope(envelope), { acceptedIds: [payload.clientUuid], duplicateIds: [], failed: [] });
      assert.deepEqual(await submitEnvelope(structuredClone(envelope)), { acceptedIds: [], duplicateIds: [payload.clientUuid], failed: [] });
      assert.deepEqual(await submit(payload), { acceptedIds: [], duplicateIds: [payload.clientUuid], failed: [] });
      assert.deepEqual(database.counts(), { groups: 1, forms: 1 });
    });

    await t.test("C2-11. same UUID with altered valid protected payload content conflicts", async () => {
      const { database, job } = setUp();
      poolWithMock.connect = async () => database.client;
      const payload = payloadFor(job);
      assert.deepEqual(await submit(payload), { acceptedIds: [payload.clientUuid], duplicateIds: [], failed: [] });
      const altered = structuredClone(payload);
      altered.performedAt = "2026-08-10T00:00:01.000Z";
      const result = await submit(altered);
      assert.equal(result.failed[0]?.code, "IDEMPOTENCY_CONFLICT");
      assert.deepEqual(database.counts(), { groups: 1, forms: 1 });
    });
  } finally {
    poolWithMock.connect = originalConnect;
  }
});
