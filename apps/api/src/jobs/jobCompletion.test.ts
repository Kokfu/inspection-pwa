import assert from "node:assert/strict";
import test from "node:test";
import {
  buildJobCompletion,
  closeInspectionJob,
  type AcceptedAuthorityRow,
  type CompletionJobRow
} from "./jobCompletion.js";
import { buildReportViewModel } from "../reports/reportViewModel.js";
import { renderReportHtml } from "../reports/template/renderReportHtml.js";
import { personName } from "../users/personName.js";

const ids = {
  job: "10000000-0000-4000-8000-000000000001",
  hose: "10000000-0000-4000-8000-000000000002",
  co2: "10000000-0000-4000-8000-000000000003",
  locationA: "10000000-0000-4000-8000-000000000004",
  locationB: "10000000-0000-4000-8000-000000000005",
  clientA: "10000000-0000-4000-8000-000000000006",
  clientB: "10000000-0000-4000-8000-000000000007",
  clientC: "10000000-0000-4000-8000-000000000008"
};

const snapshot = {
  schemaVersion: 1,
  enabledSystems: [
    { enabledSystemId: ids.hose, systemKey: "hose_reel", displayName: "Hose Reel", definitionStatus: "confirmed", zones: [], locations: [] },
    {
      enabledSystemId: ids.co2, systemKey: "co2_fire_extinguisher", displayName: "CO2", definitionStatus: "confirmed", zones: [],
      locations: [
        { id: ids.locationA, zoneId: null, displayName: "Location A", sortOrder: 1 },
        { id: ids.locationB, zoneId: null, displayName: "Location B", sortOrder: 2 }
      ]
    }
  ]
};

function job(status: "open" | "closed" = "open"): CompletionJobRow {
  return {
    id: ids.job,
    status,
    configuration_snapshot: snapshot,
    completed_at: status === "closed" ? "2026-08-13T01:00:00.000Z" : null,
    completed_by_user_id: status === "closed" ? 7 : null,
    completed_by_username: status === "closed" ? "first-inspector" : null,
    completed_by_display_name: status === "closed" ? "first-inspector" : null,
    service_date: "2026-08-13", report_number: status === "closed" ? "MFE/SR/2026/0001" : null,
    created_by_username: "first-inspector", created_by_display_name: null
  };
}

function row(systemKey: string, clientUuid: string, instanceKey = "primary", locationId: string | null = null, displaySequence = 1): AcceptedAuthorityRow {
  return {
    system_key: systemKey, instance_key: instanceKey, zone_id: null, location_id: locationId,
    display_sequence: displaySequence, client_uuid: clientUuid,
    evidence_policy_id: null, evidence_policy_version: null, evidence_policy_snapshot: null,
    evidence_policy_sha256: null, evidence_policy_matches: null,
    attachment_field_path: null, attachment_evidence_policy_id: null, attachment_mime_type: null,
    attachment_source_sha256: null, attachment_stored_sha256: null,
    attachment_source_size_bytes: null, attachment_stored_size_bytes: null,
    attachment_source_width: null, attachment_source_height: null,
    attachment_width: null, attachment_height: null
  };
}

const acceptedRows = [
  row("hose_reel", ids.clientA),
  row("co2_fire_extinguisher", ids.clientB, `location:${ids.locationA}`, ids.locationA, 1),
  row("co2_fire_extinguisher", ids.clientC, `location:${ids.locationB}`, ids.locationB, 2)
];

test("mixed system and per-location authority remains incomplete until every location is Accepted", () => {
  const partial = buildJobCompletion(job(), acceptedRows.slice(0, 2), "2026-08-13T00:00:00.000Z");
  assert.equal(partial.eligible, false);
  assert.equal(partial.acceptedUnitCount, 2);
  assert.equal(partial.requiredUnitCount, 3);
  assert.equal(partial.systems[1].units[1].reason, "ACCEPTED_INSPECTION_MISSING");

  const complete = buildJobCompletion(job(), acceptedRows, "2026-08-13T00:00:00.000Z");
  assert.equal(complete.eligible, true);
  assert.equal(complete.acceptedUnitCount, 3);
});

test("unsupported confirmed systems fail closed instead of being ignored", () => {
  const invalidJob = job();
  invalidJob.configuration_snapshot = {
    schemaVersion: 1,
    enabledSystems: [{ enabledSystemId: ids.hose, systemKey: "fm200", displayName: "FM200", definitionStatus: "confirmed", zones: [], locations: [] }]
  };
  const completion = buildJobCompletion(invalidJob, []);
  assert.equal(completion.eligible, false);
  assert.equal(completion.systems[0].units[0].reason, "SYSTEM_NOT_SUPPORTED");
});

test("Automatic Sprinkler completion derives evidence authority from the frozen job snapshot", () => {
  const sprinklerJob = job();
  const frozenPolicy = {
    id: ids.co2,
    code: "automatic-sprinkler-psi-evidence",
    version: 1,
    schemaVersion: 1,
    definition: {
      systemKey: "automatic_sprinkler",
      points: { "measurements.runningPressure": { allowed: true, required: true, maxCount: 1 } }
    },
    definitionSha256: "a".repeat(64)
  };
  sprinklerJob.configuration_snapshot = {
    schemaVersion: 1,
    enabledSystems: [{ enabledSystemId: ids.hose, systemKey: "automatic_sprinkler", displayName: "Automatic Sprinkler", definitionStatus: "confirmed", zones: [], locations: [], evidencePolicy: frozenPolicy }]
  };
  const sprinkler = {
    ...row("automatic_sprinkler", ids.clientA),
    evidence_policy_id: ids.co2,
    evidence_policy_version: 1,
    evidence_policy_snapshot: frozenPolicy.definition,
    evidence_policy_sha256: "a".repeat(64),
    evidence_policy_matches: true
  };
  const pending = buildJobCompletion(sprinklerJob, [sprinkler]);
  assert.equal(pending.eligible, false);
  assert.equal(pending.systems[0].units[0].reason, "EVIDENCE_PENDING");

  const withEvidence = {
    ...sprinkler,
    attachment_field_path: "measurements.runningPressure",
    attachment_evidence_policy_id: ids.co2,
    attachment_mime_type: "image/jpeg",
    attachment_source_sha256: "b".repeat(64),
    attachment_stored_sha256: "c".repeat(64),
    attachment_source_size_bytes: 100,
    attachment_stored_size_bytes: 90,
    attachment_source_width: 800,
    attachment_source_height: 600,
    attachment_width: 800,
    attachment_height: 600
  };
  assert.equal(buildJobCompletion(sprinklerJob, [withEvidence]).eligible, true);

  const noEvidenceJob = job();
  noEvidenceJob.configuration_snapshot = {
    schemaVersion: 1,
    enabledSystems: [{ enabledSystemId: ids.hose, systemKey: "automatic_sprinkler", displayName: "Automatic Sprinkler", definitionStatus: "confirmed", zones: [], locations: [] }]
  };
  assert.equal(buildJobCompletion(noEvidenceJob, [row("automatic_sprinkler", ids.clientA)]).eligible, true);

  const clientClaimsNoEvidence = row("automatic_sprinkler", ids.clientA);
  assert.equal(buildJobCompletion(sprinklerJob, [clientClaimsNoEvidence]).eligible, false);
  assert.equal(buildJobCompletion(sprinklerJob, [clientClaimsNoEvidence]).systems[0].units[0].reason, "EVIDENCE_INVALID");

  const policyMismatch = { ...withEvidence, evidence_policy_sha256: "d".repeat(64) };
  assert.equal(buildJobCompletion(sprinklerJob, [policyMismatch]).eligible, false);
  assert.equal(buildJobCompletion(sprinklerJob, [policyMismatch]).systems[0].units[0].reason, "EVIDENCE_INVALID");

  const unrelatedAttachment = { ...sprinkler, attachment_field_path: "measurements.otherPressure", attachment_evidence_policy_id: ids.co2,
    attachment_mime_type: "image/jpeg", attachment_source_sha256: "b".repeat(64), attachment_stored_sha256: "c".repeat(64),
    attachment_source_size_bytes: 100, attachment_stored_size_bytes: 90, attachment_source_width: 800, attachment_source_height: 600, attachment_width: 800, attachment_height: 600 };
  assert.equal(buildJobCompletion(sprinklerJob, [unrelatedAttachment]).eligible, false);
  assert.equal(buildJobCompletion(sprinklerJob, [unrelatedAttachment]).systems[0].units[0].reason, "EVIDENCE_PENDING");
});

class Lock {
  private tail = Promise.resolve();
  async acquire() {
    let release!: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    const prior = this.tail;
    this.tail = prior.then(() => next);
    await prior;
    return release;
  }
}

class FakeCompletionDatabase {
  state = job();
  actorDisplayName: string | null = null;
  rows = acceptedRows;
  updates = 0;
  audits = 0;
  writes = 0;
  lock = new Lock();

  connect = async () => {
    let release: (() => void) | undefined;
    const query = async (sql: string, values: unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized === "BEGIN" || normalized === "ROLLBACK") {
        if (normalized === "ROLLBACK") { release?.(); release = undefined; }
        return { rowCount: 0, rows: [] };
      }
      if (normalized === "COMMIT") { release?.(); release = undefined; return { rowCount: 0, rows: [] }; }
      if (normalized.includes("FROM inspection_jobs") && normalized.includes("FOR UPDATE")) {
        release = await this.lock.acquire();
        return { rowCount: 1, rows: [{ ...this.state }] };
      }
      if (normalized.includes("FROM master_system_form_instances instance") && normalized.includes("inspection.job_id = $1")) {
        return { rowCount: this.rows.length, rows: this.rows };
      }
      if (normalized.startsWith("INSERT INTO report_number_year_counters")) return { rowCount: 1, rows: [{ sequence: "1" }] };
      if (normalized.includes("SELECT username, display_name FROM users")) return { rowCount: 1, rows: [{ username: "first-inspector", display_name: this.actorDisplayName }] };
      if (normalized.startsWith("UPDATE inspection_jobs")) {
        if (this.state.status !== "open") return { rowCount: 0, rows: [] };
        this.state = {
          ...this.state, status: "closed", completed_at: "2026-08-13T02:00:00.000Z",
          completed_by_user_id: Number(values[1]), completed_by_username: "first-inspector",
          completed_by_display_name: String(values[2]), report_number: String(values[3]),
          technician_team_snapshot: JSON.parse(String(values[4]))
        };
        this.updates += 1;
        return { rowCount: 1, rows: [{ completed_at: this.state.completed_at, completed_by_user_id: values[1] }] };
      }
      if (normalized.startsWith("INSERT INTO audit_events")) { this.audits += 1; return { rowCount: 1, rows: [] }; }
      if (normalized.startsWith("INSERT INTO inspections") || normalized.startsWith("INSERT INTO inspection_attachments")) { this.writes += 1; return { rowCount: 1, rows: [] }; }
      throw new Error(`Unexpected SQL: ${normalized}`);
    };
    return { query, release: () => { release?.(); release = undefined; } };
  };
}

async function authoritativeWrite(
  database: FakeCompletionDatabase,
  jobId: string,
  lockSql: string,
  afterLock?: () => Promise<void>
) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const job = (await client.query(lockSql, [jobId])).rows[0] as { status: "open" | "closed" } | undefined;
    if (!job || job.status !== "open") { await client.query("ROLLBACK"); return "JOB_CLOSED" as const; }
    await afterLock?.();
    await client.query("INSERT INTO inspections (id) VALUES ($1)", [ids.clientA]);
    await client.query("COMMIT");
    return "written" as const;
  } finally {
    client.release();
  }
}

test("incomplete close rejects without mutation", async () => {
  const database = new FakeCompletionDatabase();
  database.rows = acceptedRows.slice(0, 2);
  const result = await closeInspectionJob(ids.job, { id: 7, username: "first-inspector" }, database as never);
  assert.equal(result.kind, "incomplete");
  assert.equal(database.state.status, "open");
  assert.equal(database.updates, 0);
});

test("repeated and concurrent close requests produce one immutable completion", async () => {
  const database = new FakeCompletionDatabase();
  const [first, second] = await Promise.all([
    closeInspectionJob(ids.job, { id: 7, username: "first-inspector" }, database as never),
    closeInspectionJob(ids.job, { id: 8, username: "second-inspector" }, database as never)
  ]);
  assert.equal(database.updates, 1);
  assert.equal(database.audits, 1);
  assert.deepEqual(new Set([first.kind, second.kind]), new Set(["closed"]));
  const outcomes = [first, second].filter((result) => result.kind === "closed");
  assert.equal(outcomes.filter((result) => result.alreadyCompleted === false).length, 1);
  assert.equal(outcomes.filter((result) => result.alreadyCompleted === true).length, 1);
  assert.equal(database.state.completed_by_user_id, 7);

  const repeated = await closeInspectionJob(ids.job, { id: 9, username: "third-inspector" }, database as never);
  assert.equal(repeated.kind, "closed");
  assert.equal(repeated.kind === "closed" && repeated.alreadyCompleted, true);
  assert.equal(database.state.completed_by_user_id, 7);
});

test("new completion freezes a person's name and falls back to username", async () => {
  assert.equal(personName("first-inspector", "   "), "first-inspector");
  assert.throws(() => personName("  ", null), /no printable name/);
  for (const displayName of ["Alice Tan", null]) {
    const database = new FakeCompletionDatabase();
    database.actorDisplayName = displayName;
    database.state.created_by_display_name = displayName;
    const result = await closeInspectionJob(ids.job, { id: 7, username: "first-inspector" }, database as never);
    assert.equal(result.kind, "closed");
    const expected = displayName ?? "first-inspector";
    assert.equal(database.state.completed_by_display_name, expected);
    assert.deepEqual(database.state.technician_team_snapshot, [expected]);
    const vm = buildReportViewModel({ customer: "Customer", site: "Site", serviceDate: "2026-08-13", jobReference: "Job", completedAt: database.state.completed_at as string, completedBy: database.state.completed_by_display_name!, technicians: database.state.technician_team_snapshot as string[], systems: [], sections: [] });
    const html = renderReportHtml(vm);
    assert.ok(html.includes('<td class="lbl">Test Leader</td>'));
    assert.ok(html.includes(`data-bind="job.completedBy">${expected}</td>`));
    assert.ok(html.includes(`data-bind="job.technicians[]">${expected}</td>`));
  }
});

test("authoritative writes and close serialize on the inspection job row", async () => {
  const database = new FakeCompletionDatabase();
  let writerLocked!: () => void;
  const writerHasLock = new Promise<void>((resolve) => { writerLocked = resolve; });
  let releaseWriter!: () => void;
  const holdWriter = new Promise<void>((resolve) => { releaseWriter = resolve; });
  const legacyWrite = authoritativeWrite(
    database,
    ids.job,
    "SELECT job.status FROM inspection_jobs job WHERE job.id = $1 FOR UPDATE OF job",
    async () => { writerLocked(); await holdWriter; }
  );
  await writerHasLock;
  const close = closeInspectionJob(ids.job, { id: 7, username: "first-inspector" }, database as never);
  releaseWriter();
  assert.equal(await legacyWrite, "written");
  assert.equal((await close).kind, "closed");
  assert.equal(database.writes, 1);

  const attachmentAfterClose = await authoritativeWrite(
    database,
    ids.job,
    "SELECT job.status FROM inspection_jobs job WHERE job.id = $1 FOR UPDATE OF job"
  );
  assert.equal(attachmentAfterClose, "JOB_CLOSED");
  assert.equal(database.writes, 1);
});
