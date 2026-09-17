import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV1 } from "../inspections/templates/masterServiceReportV1.js";
import { masterServiceReportV4 } from "../inspections/templates/masterServiceReportV4.js";
import { createServiceVisit, ServiceVisitError } from "./serviceVisits.js";
import { loadCanonicalInspectionJob, parseCreateServiceVisit } from "../routes/inspectionJobs.js";
import { requireRole } from "../middleware/requireRole.js";

const ids = {
  request: "10000000-0000-4000-8000-000000000001",
  customer: "10000000-0000-4000-8000-000000000002",
  site: "10000000-0000-4000-8000-000000000003",
  revision: "10000000-0000-4000-8000-000000000004",
  template: "10000000-0000-4000-8000-000000000005",
  enabled: "10000000-0000-4000-8000-000000000006"
};
const hoseDefinition = masterServiceReportV1.systems.find((system) => system.key === "hose_reel")!;
const co2Definition = masterServiceReportV1.systems.find((system) => system.key === "co2_fire_extinguisher")!;
const wetChemicalDefinition = masterServiceReportV4.systems.find((system) => system.key === "wet_chemical")!;

class FakeServiceVisitDatabase {
  inserts = 0;
  rollbacks = 0;
  oldCompletedJob = { id: "old-completed", status: "closed", reference: "OLD-001", completedAt: "2026-08-13T00:00:00.000Z" };

  async query(sql: string, values: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized === "BEGIN" || normalized === "COMMIT") return { rows: [], rowCount: 0 };
    if (normalized === "ROLLBACK") { this.rollbacks += 1; return { rows: [], rowCount: 0 }; }
    if (normalized.includes("WHERE job.creation_request_id")) return { rows: [], rowCount: 0 };
    if (normalized.includes("FROM customers")) return { rows: [{ id: ids.customer, code: "C-1", displayName: "Customer A" }], rowCount: 1 };
    if (normalized.includes("FROM customer_sites")) return { rows: [{ id: ids.site, customerId: ids.customer, displayName: "Site A" }], rowCount: 1 };
    if (normalized.includes("FROM customer_configuration_revisions")) return { rows: [{ revisionId: ids.revision, revisionNumber: 1, templateId: ids.template, templateCode: "MFE-FSSR", templateName: "Master", templateVersion: 1 }], rowCount: 1 };
    if (normalized.includes("FROM customer_enabled_systems")) return { rows: values[1] instanceof Array && values[1][0] === "hose_reel" ? [{ enabledSystemId: ids.enabled, systemKey: "hose_reel", displayName: "Hose Reel", sortOrder: 1, definitionStatus: "confirmed", definition: hoseDefinition, evidencePolicyId: null, evidencePolicyCode: null, evidencePolicyVersion: null, evidencePolicySchemaVersion: null, evidencePolicyDefinition: null, evidencePolicySha256: null, systemConfiguration: {} }] : [], rowCount: values[1] instanceof Array && values[1][0] === "hose_reel" ? 1 : 0 };
    if (normalized.includes("FROM customer_system_zones") || normalized.includes("FROM customer_system_locations")) return { rows: [], rowCount: 0 };
    if (normalized.includes("now() AT TIME ZONE 'Asia/Kuala_Lumpur'")) return { rows: [{ serviceDate: "2026-08-18", serviceTime: "09:30" }], rowCount: 1 };
    if (normalized.includes("nextval('service_visit_reference_sequence')")) return { rows: [{ next: "42" }], rowCount: 1 };
    if (normalized.startsWith("INSERT INTO inspection_jobs")) {
      this.inserts += 1;
      return { rows: [{ id: "20000000-0000-4000-8000-000000000001", reference: "SV-20260818-42", title: "Site A", createdAt: "2026-08-18T00:00:00.000Z", serviceDate: "2026-08-18", serviceTime: "09:30", siteId: ids.site, configurationSnapshot: { enabledSystems: [{ systemKey: "hose_reel" }] } }], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${normalized}`);
  }
}

type StoredCover = { serviceCallNumber: string | null; arrivalTime: string | null; departureTime: string | null };
const noCover: StoredCover = { serviceCallNumber: null, arrivalTime: null, departureTime: null };

function storedVisit(cover: StoredCover) {
  return { id: "30000000-0000-4000-8000-000000000001", customerId: ids.customer,
    siteId: ids.site, serviceDate: "2026-08-18", serviceTime: "09:30",
    configurationSnapshot: { enabledSystems: [{ systemKey: "hose_reel" }] }, ...cover };
}

class ReplayServiceVisitDatabase extends FakeServiceVisitDatabase {
  constructor(private readonly cover: StoredCover = noCover) { super(); }

  async query(sql: string, values: unknown[] = []) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized.includes("WHERE job.creation_request_id") && values[1] === 7) {
      return { rows: [storedVisit(this.cover)], rowCount: 1 };
    }
    return super.query(sql, values);
  }
}

// Forces the concurrent-insert branch: the locked lookup sees nothing, the insert loses
// the unique-key race, and the follow-up read finds the winner's row.
class ConcurrentReplayServiceVisitDatabase extends FakeServiceVisitDatabase {
  constructor(private readonly cover: StoredCover) { super(); }

  async query(sql: string, values: unknown[] = []) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized.includes("WHERE job.creation_request_id") && !normalized.includes("FOR UPDATE")) {
      return { rows: [storedVisit(this.cover)], rowCount: 1 };
    }
    if (normalized.startsWith("INSERT INTO inspection_jobs")) { this.inserts += 1; return { rows: [], rowCount: 0 }; }
    return super.query(sql, values);
  }
}

class UnresolvedLegacyServiceVisitDatabase extends FakeServiceVisitDatabase {
  async query(sql: string, values: unknown[] = []) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized.includes("created_by_user_id IS NULL")) {
      return { rows: [{ id: "30000000-0000-4000-8000-000000000099" }], rowCount: 1 };
    }
    return super.query(sql, values);
  }
}

class ConfiguredAuthorityDatabase extends FakeServiceVisitDatabase {
  constructor(private readonly systemKey: "co2_fire_extinguisher" | "wet_chemical", private readonly malformed = false) { super(); }

  async query(sql: string, values: unknown[] = []) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized.includes("FROM customer_enabled_systems")) {
      const definition = this.systemKey === "co2_fire_extinguisher" ? co2Definition : wetChemicalDefinition;
      return { rows: [{ enabledSystemId: ids.enabled, systemKey: this.systemKey, displayName: this.systemKey,
        sortOrder: 1, definitionStatus: "confirmed", definition, evidencePolicyId: null,
        evidencePolicyCode: null, evidencePolicyVersion: null, evidencePolicySchemaVersion: null,
        evidencePolicyDefinition: null, evidencePolicySha256: null, systemConfiguration: {} }], rowCount: 1 };
    }
    if (normalized.includes("FROM customer_system_locations")) {
      return { rows: [{ id: "10000000-0000-4000-8000-000000000099", enabledSystemId: ids.enabled,
        zoneId: "10000000-0000-4000-8000-000000000098", key: "location", displayName: "Configured location",
        presetRowCount: 1, rowPreset: {}, sortOrder: 1,
        zoneEnabledSystemId: this.malformed ? "10000000-0000-4000-8000-000000000097" : ids.enabled }], rowCount: 1 };
    }
    return super.query(sql, values);
  }
}

test("create service visit rejects client-controlled creation date and time", () => {
  const input = { requestId: ids.request, customerId: ids.customer, siteId: ids.site, systemKeys: ["hose_reel"] };
  assert.deepEqual(parseCreateServiceVisit(input)?.systemKeys, ["hose_reel"]);
  assert.equal(parseCreateServiceVisit({ ...input, serviceDate: "2026-02-30" }), undefined);
  assert.equal(parseCreateServiceVisit({ ...input, serviceTime: "24:00" }), undefined);
  assert.equal(parseCreateServiceVisit({ ...input, serviceDate: "2026-08-18", serviceTime: "09:30" }), undefined);
  assert.equal(parseCreateServiceVisit({ ...input, configuration: {} }), undefined);
  assert.equal(parseCreateServiceVisit({ ...input, systemKeys: [] }), undefined);
});

test("create service visit accepts optional cover fields and rejects malformed ones", () => {
  const input = { requestId: ids.request, customerId: ids.customer, siteId: ids.site, systemKeys: ["hose_reel"] };
  // Absent entirely: all three normalize to null, no field is mandatory.
  const withoutCoverFields = parseCreateServiceVisit(input);
  assert.equal(withoutCoverFields?.serviceCallNumber, null);
  assert.equal(withoutCoverFields?.arrivalTime, null);
  assert.equal(withoutCoverFields?.departureTime, null);
  // Present and valid.
  const withCoverFields = parseCreateServiceVisit({
    ...input, serviceCallNumber: " SC-4821 ", arrivalTime: "09:15", departureTime: "11:45"
  });
  assert.equal(withCoverFields?.serviceCallNumber, "SC-4821");
  assert.equal(withCoverFields?.arrivalTime, "09:15");
  assert.equal(withCoverFields?.departureTime, "11:45");
  // Empty string normalizes to null, same as absent (no field is mandatory).
  const withBlankCoverFields = parseCreateServiceVisit({
    ...input, serviceCallNumber: "  ", arrivalTime: "", departureTime: null
  });
  assert.equal(withBlankCoverFields?.serviceCallNumber, null);
  assert.equal(withBlankCoverFields?.arrivalTime, null);
  assert.equal(withBlankCoverFields?.departureTime, null);
  // Malformed values are rejected outright, not silently dropped.
  assert.equal(parseCreateServiceVisit({ ...input, arrivalTime: "24:00" }), undefined);
  assert.equal(parseCreateServiceVisit({ ...input, arrivalTime: "9:30" }), undefined);
  assert.equal(parseCreateServiceVisit({ ...input, departureTime: "not-a-time" }), undefined);
  assert.equal(parseCreateServiceVisit({ ...input, serviceCallNumber: "x".repeat(81) }), undefined);
  assert.equal(parseCreateServiceVisit({ ...input, arrivalTime: 930 }), undefined);
});

test("new service visit is server-identified, scheduled, blank, and leaves completed history untouched", async () => {
  const database = new FakeServiceVisitDatabase();
  const result = await createServiceVisit(database as never, {
    requestId: ids.request, customerId: ids.customer, siteId: ids.site,
    systemKeys: ["hose_reel"]
  }, 7);
  assert.equal(database.inserts, 1);
  assert.equal(result.id, "20000000-0000-4000-8000-000000000001");
  assert.equal(result.idempotent, false);
  assert.deepEqual(database.oldCompletedJob, { id: "old-completed", status: "closed", reference: "OLD-001", completedAt: "2026-08-13T00:00:00.000Z" });
});

test("unsupported selections fail before a job insert and roll back", async () => {
  const database = new FakeServiceVisitDatabase();
  await assert.rejects(
    () => createServiceVisit(database as never, { requestId: ids.request, customerId: ids.customer,
      siteId: ids.site, systemKeys: ["fm200"] }, 7),
    (error: unknown) => error instanceof ServiceVisitError && error.code === "SYSTEM_NOT_AVAILABLE"
  );
  assert.equal(database.inserts, 0);
  assert.equal(database.rollbacks, 1);
});

test("idempotency is actor-scoped and rejects altered replay payloads", async () => {
  const database = new ReplayServiceVisitDatabase();
  const input = { requestId: ids.request, customerId: ids.customer, siteId: ids.site,
    systemKeys: ["hose_reel"] };
  const replay = await createServiceVisit(database as never, input, 7);
  assert.deepEqual(replay, { id: "30000000-0000-4000-8000-000000000001", idempotent: true });
  await assert.rejects(
    () => createServiceVisit(database as never, { ...input, systemKeys: ["hydrant"] }, 7),
    (error: unknown) => error instanceof ServiceVisitError && error.code === "IDEMPOTENCY_MISMATCH"
  );
  const independentActor = await createServiceVisit(database as never, input, 8);
  assert.equal(independentActor.idempotent, false);
});

const storedCover: StoredCover = { serviceCallNumber: "SC-4821", arrivalTime: "09:15", departureTime: "11:45" };
const replayBranches = [
  ["existing-row", (cover: StoredCover) => new ReplayServiceVisitDatabase(cover)],
  ["concurrent-insert", (cover: StoredCover) => new ConcurrentReplayServiceVisitDatabase(cover)]
] as const;

for (const [branch, makeDatabase] of replayBranches) {
  test(`${branch} replay: an exact cover-field retry stays idempotent`, async () => {
    const database = makeDatabase(storedCover);
    const input = { requestId: ids.request, customerId: ids.customer, siteId: ids.site, systemKeys: ["hose_reel"] };
    assert.deepEqual(await createServiceVisit(database as never, { ...input, ...storedCover }, 7),
      { id: "30000000-0000-4000-8000-000000000001", idempotent: true });
    assert.deepEqual(await createServiceVisit(database as never,
      { ...input, serviceCallNumber: " SC-4821 ", arrivalTime: "09:15 ", departureTime: " 11:45" }, 7),
      { id: "30000000-0000-4000-8000-000000000001", idempotent: true }, "trimmed text matches the stored value");
  });

  for (const field of ["serviceCallNumber", "arrivalTime", "departureTime"] as const) {
    test(`${branch} replay: a changed ${field} is an idempotency mismatch`, async () => {
      const database = makeDatabase(storedCover);
      const changed = { serviceCallNumber: "SC-9999", arrivalTime: "10:15", departureTime: "12:45" }[field];
      for (const value of [changed, null]) {
        await assert.rejects(
          () => createServiceVisit(database as never, { requestId: ids.request, customerId: ids.customer,
            siteId: ids.site, systemKeys: ["hose_reel"], ...storedCover, [field]: value }, 7),
          (error: unknown) => error instanceof ServiceVisitError && error.code === "IDEMPOTENCY_MISMATCH" && error.status === 409
        );
      }
      const blankDatabase = makeDatabase(noCover);
      await assert.rejects(
        () => createServiceVisit(blankDatabase as never, { requestId: ids.request, customerId: ids.customer,
          siteId: ids.site, systemKeys: ["hose_reel"], [field]: changed }, 7),
        (error: unknown) => error instanceof ServiceVisitError && error.code === "IDEMPOTENCY_MISMATCH",
        "adding a value on retry to a visit stored without one is also a mismatch"
      );
    });
  }

  test(`${branch} replay: absent, explicit null and blank cover fields are the same request`, async () => {
    const database = makeDatabase(noCover);
    const input = { requestId: ids.request, customerId: ids.customer, siteId: ids.site, systemKeys: ["hose_reel"] };
    for (const cover of [{}, { serviceCallNumber: null, arrivalTime: null, departureTime: null },
      { serviceCallNumber: "", arrivalTime: "", departureTime: "" }, { serviceCallNumber: "  ", arrivalTime: " ", departureTime: "" }]) {
      assert.deepEqual(await createServiceVisit(database as never, { ...input, ...cover }, 7),
        { id: "30000000-0000-4000-8000-000000000001", idempotent: true }, JSON.stringify(cover));
    }
  });
}

test("an unresolved legacy request id fails closed without creating or exposing a job", async () => {
  const database = new UnresolvedLegacyServiceVisitDatabase();
  await assert.rejects(
    () => createServiceVisit(database as never, { requestId: ids.request, customerId: ids.customer,
      siteId: ids.site, systemKeys: ["hose_reel"] }, 7),
    (error: unknown) => error instanceof ServiceVisitError
      && error.code === "IDEMPOTENCY_LEGACY_UNRESOLVED"
      && error.message.includes("Refresh My Service Jobs")
  );
  assert.equal(database.inserts, 0);
  assert.equal(database.rollbacks, 1);
});

for (const systemKey of ["co2_fire_extinguisher", "wet_chemical"] as const) {
  test(`${systemKey} preserves valid configured location authority`, async () => {
    const database = new ConfiguredAuthorityDatabase(systemKey);
    const result = await createServiceVisit(database as never, { requestId: ids.request,
      customerId: ids.customer, siteId: ids.site, systemKeys: [systemKey] }, 7);
    assert.equal(result.idempotent, false);
    assert.equal(database.inserts, 1);
  });

  test(`${systemKey} rejects malformed configured location-zone authority atomically`, async () => {
    const database = new ConfiguredAuthorityDatabase(systemKey, true);
    await assert.rejects(
      () => createServiceVisit(database as never, { requestId: ids.request,
        customerId: ids.customer, siteId: ids.site, systemKeys: [systemKey] }, 7),
      (error: unknown) => error instanceof ServiceVisitError && error.code === "CONFIGURATION_INVALID"
    );
    assert.equal(database.inserts, 0);
    assert.equal(database.rollbacks, 1);
  });
}

test("canonical replay representation preserves a completed job's actual state and completion metadata", async () => {
  const closedSnapshot = { schemaVersion: 1, enabledSystems: [{ enabledSystemId: ids.enabled,
    systemKey: "hose_reel", displayName: "Hose Reel", definitionStatus: "confirmed", zones: [], locations: [] }] };
  const database = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ");
      if (normalized.includes("LEFT JOIN customer_sites")) {
        return { rows: [{ id: ids.request, reference: "SV-20260818-42", title: "Site A", status: "closed",
          createdAt: "2026-08-18T00:00:00.000Z", configurationSnapshot: closedSnapshot,
          serviceDate: "2026-08-18", serviceTime: "09:30", site: { id: ids.site, displayName: "Site A" } }] };
      }
      if (normalized.includes("completed_by_display_name")) {
        return { rows: [{ id: ids.request, status: "closed", configuration_snapshot: closedSnapshot,
          completed_at: "2026-08-18T12:00:00.000Z", completed_by_user_id: 7,
          completed_by_username: null, completed_by_display_name: "creator" }] };
      }
      if (normalized.includes("FROM master_system_form_instances")) return { rows: [] };
      throw new Error(`Unexpected SQL: ${normalized}`);
    }
  };
  const canonical = await loadCanonicalInspectionJob(ids.request, database as never);
  assert.equal(canonical?.status, "closed");
  assert.equal(canonical?.serviceTime, "09:30");
  assert.equal(canonical?.completion.completedAt, "2026-08-18T12:00:00.000Z");
  assert.deepEqual(canonical?.completion.completedBy, { id: 7, username: "creator" });
});

test("service visit role contract rejects unauthenticated callers and permits inspector/admin", () => {
  const middleware = requireRole("admin", "inspector");
  const invoke = (currentUser?: { id: number; username: string; role: "admin" | "inspector" }) => {
    let status: number | undefined;
    let next = false;
    middleware({ currentUser } as never, { status: (code: number) => ({ json: () => { status = code; } }) } as never,
      () => { next = true; });
    return { status, next };
  };
  assert.deepEqual(invoke(), { status: 401, next: false });
  assert.deepEqual(invoke({ id: 7, username: "inspector", role: "inspector" }), { status: undefined, next: true });
  assert.deepEqual(invoke({ id: 8, username: "admin", role: "admin" }), { status: undefined, next: true });
});
