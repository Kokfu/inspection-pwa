import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import {
  buildOperationalListQuery,
  createManagerServiceVisitsRouter,
  listManagerServiceVisits,
  ManagerServiceVisitQueryError,
  parseServiceVisitFilters
} from "./managerServiceVisits.js";
import { requireRole } from "../middleware/requireRole.js";
import { createFinalReportHandler, createFinalReportPdfHandler } from "./inspectionJobs.js";
import { FinalReportError, loadFinalServiceReport } from "../reports/finalServiceReport.js";

const openId = "71000000-0000-4000-8000-000000000001";
const closedId = "71000000-0000-4000-8000-000000000002";
const sampleId = "71000000-0000-4000-8000-000000000003";
const snapshot = (customer: string) => ({
  schemaVersion: 1,
  customer: { id: "71000000-0000-4000-8000-000000000010", code: "OPS", displayName: customer },
  enabledSystems: [{ systemKey: "hose_reel", displayName: "Hose Reel", definitionStatus: "confirmed", zones: [], locations: [] }]
});

class RouteDatabase {
  queries: string[] = [];
  async query(sql: string, values?: unknown[]) {
    this.queries.push(sql);
    const id = values?.[0];
    if (sql.includes("LEFT JOIN customer_sites")) {
      if (id === sampleId) return { rows: [] };
      if (id === closedId) return { rows: [{ id: closedId, reference: "SV-CLOSED", title: "Hidden technician site", status: "closed", createdAt: "2026-08-19T06:15:00.000Z", serviceDate: "2026-08-19", site: { id: "site-closed", displayName: "Hidden technician site" }, configurationSnapshot: snapshot("Closed Customer") }] };
      if (id === openId) return { rows: [{ id: openId, reference: "SV-OPEN", title: "Open site", status: "open", createdAt: "2026-08-20T01:30:00.000Z", serviceDate: "2026-08-20", site: { id: "site-open", displayName: "Open site" }, configurationSnapshot: snapshot("Open Customer") }] };
      return { rows: [
        { id: openId, reference: "SV-OPEN", title: "Open site", status: "open", createdAt: "2026-08-20T01:30:00.000Z", serviceDate: "2026-08-20", site: { id: "site-open", displayName: "Open site" }, configurationSnapshot: snapshot("Open Customer") },
        { id: closedId, reference: "SV-CLOSED", title: "Hidden technician site", status: "closed", createdAt: "2026-08-19T06:15:00.000Z", serviceDate: "2026-08-19", site: { id: "site-closed", displayName: "Hidden technician site" }, configurationSnapshot: snapshot("Closed Customer") }
      ] };
    }
    if (sql.includes("FROM inspection_jobs job")) {
      return { rows: [{ id, status: id === closedId ? "closed" : "open", configuration_snapshot: snapshot(id === closedId ? "Closed Customer" : "Open Customer"), completed_at: id === closedId ? "2026-08-20T10:00:00.000Z" : null, completed_by_user_id: id === closedId ? 9 : null, completed_by_username: null, completed_by_display_name: id === closedId ? "tech-one" : null }] };
    }
    if (sql.includes("FROM master_system_form_instances")) return { rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  }
}

const stubReport = {
  customer: "Closed Customer", site: "Hidden technician site", serviceDate: "2026-08-19", jobReference: "SV-CLOSED",
  completedAt: "2026-08-20T10:00:00.000Z", completedBy: "tech-one", systems: [], sections: []
} as never;

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("actual Manager and report routes enforce the admin/technician visibility matrix for JSON and PDF", async () => {
  const database = new RouteDatabase();
  const reportAccesses: Array<{ jobId: string; access: "technician" | "manager" }> = [];
  const loadReport = async (jobId: string, _database: unknown, access: "technician" | "manager") => {
    reportAccesses.push({ jobId, access });
    const technicianAllowed = jobId === openId;
    const managerAllowed = jobId === openId || jobId === closedId;
    if (!(access === "technician" ? technicianAllowed : managerAllowed)) {
      throw new FinalReportError("JOB_NOT_FOUND", 404, "Service visit not found.");
    }
    return stubReport;
  };
  const app = express();
  app.use((request, _response, next) => {
    const role = request.headers["x-role"];
    if (role === "admin" || role === "inspector") request.currentUser = { id: 1, username: String(role), role };
    next();
  });
  app.get("/inspection-jobs/:jobId/final-report", requireRole("admin", "inspector"), createFinalReportHandler({ database: database as never, loadReport: loadReport as never }));
  app.get("/inspection-jobs/:jobId/final-report.pdf", requireRole("admin", "inspector"), createFinalReportPdfHandler({ database: database as never, loadReport: loadReport as never, renderPdf: async () => Buffer.from("%PDF-test") }));
  app.use(createManagerServiceVisitsRouter({ database: database as never, loadReport: loadReport as never, renderPdf: async () => Buffer.from("%PDF-test") }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const get = (path: string, role?: "admin" | "inspector") => fetch(`http://127.0.0.1:${address.port}${path}`, { headers: role ? { "x-role": role } : undefined });
  try {
    assert.equal((await get("/manager/service-visits")).status, 401);
    assert.equal((await get("/manager/service-visits", "inspector")).status, 403);
    const collection = await get("/manager/service-visits", "admin");
    assert.equal(collection.status, 200);
    const collectionBody = await collection.json() as { serviceVisits: Array<{ id: string }>; nextCursor: string | null };
    assert.deepEqual(collectionBody.serviceVisits.map((visit) => visit.id), [openId, closedId]);
    assert.equal(collectionBody.nextCursor, null);
    assert.equal((await get(`/manager/service-visits/${openId}`)).status, 401);
    assert.equal((await get(`/manager/service-visits/${openId}`, "inspector")).status, 403);
    assert.equal((await get(`/manager/service-visits/${closedId}`, "admin")).status, 200);
    assert.equal((await get(`/manager/service-visits/${sampleId}`, "admin")).status, 404);

    assert.equal((await get(`/inspection-jobs/${openId}/final-report`, "inspector")).status, 200);
    assert.equal((await get(`/inspection-jobs/${closedId}/final-report`, "inspector")).status, 404);
    assert.equal((await get(`/inspection-jobs/${sampleId}/final-report`, "inspector")).status, 404);
    assert.equal((await get(`/inspection-jobs/${openId}/final-report`, "admin")).status, 200);
    assert.equal((await get(`/inspection-jobs/${sampleId}/final-report`, "admin")).status, 404);
    assert.equal((await get(`/manager/service-visits/${closedId}/final-report`)).status, 401);
    assert.equal((await get(`/manager/service-visits/${closedId}/final-report`, "inspector")).status, 403);
    assert.equal((await get(`/manager/service-visits/${closedId}/final-report`, "admin")).status, 200);
    assert.equal((await get(`/manager/service-visits/${sampleId}/final-report`, "admin")).status, 404);
    assert.equal((await get(`/manager/service-visits/${closedId}/final-report.pdf`, "admin")).status, 200);
    assert.equal((await get(`/manager/service-visits/${closedId}/final-report.pdf`)).status, 401);
    assert.equal((await get(`/manager/service-visits/${closedId}/final-report.pdf`, "inspector")).status, 403);
    assert.equal((await get(`/manager/service-visits/${sampleId}/final-report.pdf`, "admin")).status, 404);
    assert.equal((await get(`/inspection-jobs/${closedId}/final-report.pdf`, "inspector")).status, 404);
    assert.equal((await get(`/inspection-jobs/${openId}/final-report.pdf`, "inspector")).status, 200);
    assert.equal((await get(`/inspection-jobs/${sampleId}/final-report.pdf`, "admin")).status, 404);
    assert.deepEqual(reportAccesses.filter((call) => call.jobId === closedId).map((call) => call.access), ["technician", "manager", "manager", "technician"]);
  } finally {
    await close(server);
  }
});

test("Phase 7 report loader keeps technician and Manager SQL access policies separate", async () => {
  const queries: string[] = [];
  const database = { async query(sql: string) { queries.push(sql); return { rows: [], rowCount: 0 }; } };
  await assert.rejects(() => loadFinalServiceReport(openId, database as never, "technician"), FinalReportError);
  await assert.rejects(() => loadFinalServiceReport(openId, database as never, "manager"), FinalReportError);
  assert.match(queries[0] ?? "", /job\.technician_visible = true AND job\.is_sample = false/);
  assert.match(queries[1] ?? "", /job\.is_sample = false/);
  assert.doesNotMatch(queries[1] ?? "", /technician_visible/);
});

class OperationalDatabase {
  queries: string[] = [];
  async query(sql: string, values?: unknown[]) {
    this.queries.push(sql);
    if (sql.includes("LEFT JOIN customer_sites")) {
      return { rows: [
        { id: openId, reference: "SV-OPEN", title: "Open site", status: "open", createdAt: "2026-08-20T01:30:00.000Z", serviceDate: "2026-08-20", serviceTime: "09:30", site: { id: "site-open", displayName: "Open site" }, configurationSnapshot: snapshot("Open Customer") },
        { id: closedId, reference: "SV-CLOSED", title: "Closed site", status: "closed", createdAt: "2026-08-19T06:15:00.000Z", serviceDate: "2026-08-19", serviceTime: "14:15", site: { id: "site-closed", displayName: "Closed site" }, configurationSnapshot: snapshot("Closed Customer") }
      ] };
    }
    if (sql.includes("FROM inspection_jobs job")) {
      const id = values?.[0];
      return { rows: [{ id, status: id === closedId ? "closed" : "open", configuration_snapshot: snapshot(id === closedId ? "Closed Customer" : "Open Customer"), completed_at: id === closedId ? "2026-08-20T10:00:00.000Z" : null, completed_by_user_id: id === closedId ? 9 : null, completed_by_username: null, completed_by_display_name: id === closedId ? "tech-one" : null }] };
    }
    if (sql.includes("FROM master_system_form_instances")) return { rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  }
}

test("manager operational list is server-classified, includes open and closed visits, and excludes samples in SQL", async () => {
  const database = new OperationalDatabase();
  const { serviceVisits: visits, nextCursor } = await listManagerServiceVisits(database as never);
  assert.deepEqual(visits.map((visit) => [visit.reference, visit.status]), [["SV-OPEN", "open"], ["SV-CLOSED", "closed"]]);
  assert.deepEqual(visits.map((visit) => visit.serviceTime), ["09:30", "14:15"]);
  assert.deepEqual(visits.map((visit) => visit.createdAt), ["2026-08-20T01:30:00.000Z", "2026-08-19T06:15:00.000Z"]);
  assert.equal(visits[1]?.completion.completedBy?.username, "tech-one");
  // No-params baseline: identical rows/shape to the pre-filtering behaviour, plus nextCursor: null
  // because the whole (2-row) set fits on one default (50) page.
  assert.equal(nextCursor, null);
  const collectionQuery = database.queries.find((query) => query.includes("LEFT JOIN customer_sites")) ?? "";
  assert.match(collectionQuery, /inspection_jobs\.is_sample = false/);
  assert.match(collectionQuery, /master_template_version_id IS NOT NULL/);
  assert.doesNotMatch(collectionQuery, /fixture|regression/i);
  assert.doesNotMatch(collectionQuery, /customer_id = \$|site_id = \$|status = \$|systemKey/);
});

test("parseServiceVisitFilters rejects malformed params with stable 400 codes", () => {
  const codeOf = (input: Record<string, unknown>) => {
    try {
      parseServiceVisitFilters(input);
      return undefined;
    } catch (error) {
      assert.ok(error instanceof ManagerServiceVisitQueryError, `expected ManagerServiceVisitQueryError for ${JSON.stringify(input)}`);
      assert.equal((error as ManagerServiceVisitQueryError).status, 400);
      return (error as ManagerServiceVisitQueryError).code;
    }
  };
  assert.equal(codeOf({ customerId: "not-a-uuid" }), "INVALID_CUSTOMER_ID");
  assert.equal(codeOf({ customerId: ["a", "b"] }), "INVALID_CUSTOMER_ID");
  assert.equal(codeOf({ siteId: "not-a-uuid" }), "INVALID_SITE_ID");
  assert.equal(codeOf({ status: "archived" }), "INVALID_STATUS");
  assert.equal(codeOf({ systemKey: "not_a_real_system" }), "INVALID_SYSTEM_KEY");
  assert.equal(codeOf({ from: "2026-13-40" }), "INVALID_FROM_DATE");
  assert.equal(codeOf({ from: "2026-02-30" }), "INVALID_FROM_DATE", "rejects a calendar date that JS Date would silently roll over");
  assert.equal(codeOf({ to: "not-a-date" }), "INVALID_TO_DATE");
  assert.equal(codeOf({ from: "2026-08-20", to: "2026-08-01" }), "INVALID_DATE_RANGE");
  assert.equal(codeOf({ limit: "0" }), "INVALID_LIMIT");
  assert.equal(codeOf({ limit: "201" }), "INVALID_LIMIT");
  assert.equal(codeOf({ limit: "abc" }), "INVALID_LIMIT");
  assert.equal(codeOf({ limit: "1.5" }), "INVALID_LIMIT");
  assert.equal(codeOf({ cursor: "not-base64-json!!" }), "INVALID_CURSOR");
  assert.equal(codeOf({ cursor: Buffer.from(JSON.stringify({ foo: 1 })).toString("base64url") }), "INVALID_CURSOR", "wrong shape");
  assert.equal(codeOf({ cursor: Buffer.from(JSON.stringify({ serviceDate: "bad-date", jobReference: "SV-1", id: "71000000-0000-4000-8000-000000000001" })).toString("base64url") }), "INVALID_CURSOR");
  assert.equal(codeOf({ cursor: Buffer.from(JSON.stringify({ serviceDate: null, jobReference: "SV-1", id: "not-a-uuid" })).toString("base64url") }), "INVALID_CURSOR");
  // Tampering with an otherwise-valid-looking cursor (reversing its bytes) must still 400 — this
  // is deterministic (unlike a single flipped character, which has a vanishing but nonzero chance
  // of still decoding to a validly-shaped cursor).
  const validCursor = Buffer.from(JSON.stringify({ serviceDate: "2026-08-20", jobReference: "SV-1", id: "71000000-0000-4000-8000-000000000001" })).toString("base64url");
  const tampered = [...validCursor].reverse().join("");
  assert.notEqual(tampered, validCursor);
  assert.equal(codeOf({ cursor: tampered }), "INVALID_CURSOR");

  assert.deepEqual(parseServiceVisitFilters({}), { limit: 50 });
  assert.deepEqual(parseServiceVisitFilters({ limit: "200" }), { limit: 200 }, "200 is the inclusive hard max");
  assert.deepEqual(parseServiceVisitFilters({ status: "open" }), { status: "open", limit: 50 });
});

test("buildOperationalListQuery parameterizes every filter and never string-interpolates a value", () => {
  const customerId = "71000000-0000-4000-8000-000000000010";
  const siteId = "71000000-0000-4000-8000-000000000011";
  const { sql, values, limit } = buildOperationalListQuery({
    customerId, siteId, status: "closed", systemKey: "hose_reel", from: "2026-08-01", to: "2026-08-31", limit: 25
  });
  assert.equal(limit, 25);
  assert.deepEqual(values, [customerId, siteId, "closed", "hose_reel", "2026-08-01", "2026-08-31", 26]);
  assert.match(sql, /inspection_jobs\.customer_id = \$1/);
  assert.match(sql, /inspection_jobs\.site_id = \$2/);
  assert.match(sql, /inspection_jobs\.status = \$3/);
  assert.match(sql, /enabled_system ->> 'systemKey' = \$4/);
  assert.match(sql, /inspection_jobs\.service_date >= \$5::date/);
  assert.match(sql, /inspection_jobs\.service_date <= \$6::date/);
  assert.match(sql, /LIMIT \$7/);
  // No caller-controlled value ever appears inlined in the SQL text itself.
  for (const value of [customerId, siteId, "hose_reel", "2026-08-01", "2026-08-31"]) {
    assert.ok(!sql.includes(value), `${value} must be bound as a parameter, not interpolated`);
  }

  const cursored = buildOperationalListQuery({ cursor: { serviceDate: null, jobReference: "SV-1", id: siteId }, limit: 10 });
  assert.deepEqual(cursored.values, [null, "SV-1", siteId, 11]);
  assert.match(cursored.sql, /\$1::date IS NULL AND inspection_jobs\.service_date IS NULL/);
  assert.match(cursored.sql, /\(inspection_jobs\.job_reference, inspection_jobs\.id\) < \(\$2, \$3::uuid\)/);

  const zero = buildOperationalListQuery({});
  assert.deepEqual(zero.values, [51]);
  assert.doesNotMatch(zero.sql, /customer_id = \$|site_id = \$|status = \$|systemKey|service_date >=|service_date <=/);
});

type CannedRow = {
  id: string; reference: string; title: string; status: "open" | "closed"; createdAt: string;
  serviceDate: string | null; serviceTime: string | null;
  site: { id: string; displayName: string } | null;
  customerId: string;
  configurationSnapshot: { schemaVersion: 1; customer: { displayName: string }; enabledSystems: Array<{ systemKey: string; displayName: string }> };
};

function cannedRow(overrides: Partial<CannedRow> & Pick<CannedRow, "id" | "reference" | "serviceDate">): CannedRow {
  return {
    title: overrides.reference,
    status: "open",
    createdAt: "2026-08-01T00:00:00.000Z",
    serviceTime: null,
    site: { id: `site-${overrides.id}`, displayName: `Site ${overrides.id}` },
    customerId: "customer-default",
    configurationSnapshot: { schemaVersion: 1, customer: { displayName: "Default Customer" }, enabledSystems: [{ systemKey: "hose_reel", displayName: "Hose Reel" }] },
    ...overrides
  };
}

/**
 * A hand-rolled reference implementation of the SAME ordering/filtering semantics the production
 * SQL expresses (service_date DESC NULLS LAST, job_reference DESC, id DESC; keyset "after cursor").
 * This proves the route/pagination wiring in isolation from Postgres; the companion integration
 * test proves the real SQL produces the identical result against a real database.
 */
class FilterableServiceVisitDatabase {
  queries: Array<{ sql: string; values?: unknown[] }> = [];
  constructor(private readonly rows: CannedRow[]) {}
  async query(sql: string, values?: unknown[]) {
    this.queries.push({ sql, values });
    if (sql.includes("LEFT JOIN customer_sites")) {
      const remaining = [...(values ?? [])];
      let matched = this.rows;
      if (sql.includes("inspection_jobs.customer_id = $")) {
        const customerId = remaining.shift();
        matched = matched.filter((row) => row.customerId === customerId);
      }
      if (sql.includes("inspection_jobs.site_id = $")) {
        const siteId = remaining.shift();
        matched = matched.filter((row) => row.site?.id === siteId);
      }
      if (sql.includes("inspection_jobs.status = $")) {
        const status = remaining.shift();
        matched = matched.filter((row) => row.status === status);
      }
      if (sql.includes("enabled_system ->> 'systemKey' = $")) {
        const systemKey = remaining.shift();
        matched = matched.filter((row) => row.configurationSnapshot.enabledSystems.some((system) => system.systemKey === systemKey));
      }
      if (sql.includes("inspection_jobs.service_date >= $")) {
        const from = remaining.shift() as string;
        matched = matched.filter((row) => row.serviceDate !== null && row.serviceDate >= from);
      }
      if (sql.includes("inspection_jobs.service_date <= $")) {
        const to = remaining.shift() as string;
        matched = matched.filter((row) => row.serviceDate !== null && row.serviceDate <= to);
      }
      if (sql.includes("inspection_jobs.job_reference, inspection_jobs.id) <")) {
        const serviceDate = remaining.shift() as string | null;
        const jobReference = remaining.shift() as string;
        const id = remaining.shift() as string;
        matched = matched.filter((row) => {
          if (serviceDate !== null) {
            if (row.serviceDate !== null && row.serviceDate < serviceDate) return true;
            if (row.serviceDate === serviceDate && (row.reference < jobReference || (row.reference === jobReference && row.id < id))) return true;
            return row.serviceDate === null;
          }
          return row.serviceDate === null && (row.reference < jobReference || (row.reference === jobReference && row.id < id));
        });
      }
      const limit = remaining.shift() as number;
      return { rows: matched.slice(0, limit) };
    }
    if (sql.includes("FROM inspection_jobs job")) {
      const id = values?.[0];
      const row = this.rows.find((candidate) => candidate.id === id);
      return {
        rows: row ? [{
          id, status: row.status, configuration_snapshot: row.configurationSnapshot,
          completed_at: null, completed_by_user_id: null, completed_by_username: null, completed_by_display_name: null
        }] : []
      };
    }
    if (sql.includes("FROM master_system_form_instances")) return { rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  }
}

test("each filter narrows the operational list correctly", async () => {
  const rows = [
    cannedRow({ id: "j-a", reference: "SV-A", serviceDate: "2026-08-20", customerId: "cust-1", site: { id: "site-1", displayName: "Site 1" }, status: "open", configurationSnapshot: { schemaVersion: 1, customer: { displayName: "Customer 1" }, enabledSystems: [{ systemKey: "hose_reel", displayName: "Hose Reel" }] } }),
    cannedRow({ id: "j-b", reference: "SV-B", serviceDate: "2026-08-10", customerId: "cust-1", site: { id: "site-2", displayName: "Site 2" }, status: "closed", configurationSnapshot: { schemaVersion: 1, customer: { displayName: "Customer 1" }, enabledSystems: [{ systemKey: "automatic_sprinkler", displayName: "Sprinkler" }] } }),
    cannedRow({ id: "j-c", reference: "SV-C", serviceDate: "2026-07-01", customerId: "cust-2", site: { id: "site-3", displayName: "Site 3" }, status: "open", configurationSnapshot: { schemaVersion: 1, customer: { displayName: "Customer 2" }, enabledSystems: [{ systemKey: "hose_reel", displayName: "Hose Reel" }] } })
  ];
  const database = new FilterableServiceVisitDatabase(rows);
  const ids = async (filters: Parameters<typeof listManagerServiceVisits>[1]) =>
    (await listManagerServiceVisits(database as never, filters)).serviceVisits.map((visit) => visit.id);

  assert.deepEqual(await ids({ customerId: "cust-1" }), ["j-a", "j-b"]);
  assert.deepEqual(await ids({ siteId: "site-3" }), ["j-c"]);
  assert.deepEqual(await ids({ customerId: "cust-1", siteId: "site-3" }), [], "a site of a different customer yields []");
  assert.deepEqual(await ids({ status: "closed" }), ["j-b"]);
  assert.deepEqual(await ids({ systemKey: "automatic_sprinkler" }), ["j-b"]);
  assert.deepEqual(await ids({ from: "2026-08-01" }), ["j-a", "j-b"]);
  assert.deepEqual(await ids({ to: "2026-07-31" }), ["j-c"]);
  assert.deepEqual(await ids({ from: "2026-08-01", to: "2026-08-15" }), ["j-b"]);
  assert.deepEqual(await ids({ customerId: "11110000-0000-4000-8000-000000000099" }), [], "well-formed but unknown/foreign customerId is 200 []");
  assert.deepEqual(await ids({ siteId: "22220000-0000-4000-8000-000000000099" }), [], "well-formed but unknown/foreign siteId is 200 []");
});

test("keyset cursor walk visits every row exactly once, in order, including a NULL-service_date boundary", async () => {
  const rows = [
    cannedRow({ id: "id2", reference: "SV-2", serviceDate: "2026-08-22" }),
    cannedRow({ id: "id1", reference: "SV-1", serviceDate: "2026-08-21" }),
    cannedRow({ id: "id3", reference: "SV-3", serviceDate: null }),
    cannedRow({ id: "id0", reference: "SV-0", serviceDate: null })
  ];
  const database = new FilterableServiceVisitDatabase(rows);
  const visited: string[] = [];
  let cursor: string | null | undefined;
  let hops = 0;
  do {
    const page = await listManagerServiceVisits(database as never, { limit: 1, ...(cursor ? { cursor: decodeForTest(cursor) } : {}) });
    assert.equal(page.serviceVisits.length, 1, "limit:1 must return exactly one row per hop until exhausted");
    visited.push(page.serviceVisits[0]!.id);
    cursor = page.nextCursor;
    hops += 1;
    assert.ok(hops <= rows.length, "walk must not exceed the total row count (no infinite loop / no duplication)");
  } while (cursor);
  assert.deepEqual(visited, ["id2", "id1", "id3", "id0"], "no dup/gap across the full keyset walk, NULL rows trail in job_reference/id tie-break order");
});

function decodeForTest(cursor: string): { serviceDate: string | null; jobReference: string; id: string } {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
}

test("GET /manager/service-visits validates query params and returns stable 400 codes with no stack leak", async () => {
  const database = new OperationalDatabase();
  const app = express();
  app.use((request, _response, next) => { request.currentUser = { id: 1, username: "admin", role: "admin" }; next(); });
  app.use(createManagerServiceVisitsRouter({ database: database as never }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const get = (query: string) => fetch(`http://127.0.0.1:${address.port}/manager/service-visits${query}`);
  try {
    const badCustomer = await get("?customerId=not-a-uuid");
    assert.equal(badCustomer.status, 400);
    assert.deepEqual(await badCustomer.json(), { error: "INVALID_CUSTOMER_ID" });
    assert.equal((await get("?siteId=not-a-uuid")).status, 400);
    assert.equal((await get("?status=archived")).status, 400);
    assert.equal((await get("?systemKey=not_a_real_system")).status, 400);
    assert.equal((await get("?from=2026-08-20&to=2026-08-01")).status, 400);
    assert.equal((await get("?limit=0")).status, 400);
    assert.equal((await get("?limit=201")).status, 400);
    const badCursor = await get("?cursor=not-valid-base64url!!");
    assert.equal(badCursor.status, 400);
    assert.deepEqual(await badCursor.json(), { error: "INVALID_CURSOR" });
    assert.equal((await get("")).status, 200, "zero params still succeeds");
  } finally { await close(server); }
});

test("GET /manager/service-visits nextCursor round-trips through the query string with no dup/gap", async () => {
  const job1 = "72000000-0000-4000-8000-000000000001";
  const job2 = "72000000-0000-4000-8000-000000000002";
  const rows = [
    cannedRow({ id: job1, reference: "SV-1", serviceDate: "2026-08-20" }),
    cannedRow({ id: job2, reference: "SV-2", serviceDate: "2026-08-10" })
  ];
  const database = new FilterableServiceVisitDatabase(rows);
  const app = express();
  app.use((request, _response, next) => { request.currentUser = { id: 1, username: "admin", role: "admin" }; next(); });
  app.use(createManagerServiceVisitsRouter({ database: database as never }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const get = (query: string) => fetch(`http://127.0.0.1:${address.port}/manager/service-visits${query}`);
  try {
    const first = await get("?limit=1");
    assert.equal(first.status, 200);
    const firstBody = await first.json() as { serviceVisits: Array<{ id: string }>; nextCursor: string | null };
    assert.deepEqual(firstBody.serviceVisits.map((visit) => visit.id), [job1]);
    assert.ok(firstBody.nextCursor);
    const second = await get(`?limit=1&cursor=${encodeURIComponent(firstBody.nextCursor!)}`);
    assert.equal(second.status, 200);
    const secondBody = await second.json() as { serviceVisits: Array<{ id: string }>; nextCursor: string | null };
    assert.deepEqual(secondBody.serviceVisits.map((visit) => visit.id), [job2]);
    assert.equal(secondBody.nextCursor, null);
  } finally { await close(server); }
});

test("manager API contract permits only the existing admin authority", () => {
  const middleware = requireRole("admin");
  const invoke = (role?: "admin" | "inspector") => {
    let status: number | undefined;
    let next = false;
    middleware({ currentUser: role ? { id: 1, username: role, role } : undefined } as never,
      { status: (code: number) => ({ json: () => { status = code; } }) } as never,
      () => { next = true; });
    return { status, next };
  };
  assert.deepEqual(invoke(), { status: 401, next: false });
  assert.deepEqual(invoke("inspector"), { status: 403, next: false });
  assert.deepEqual(invoke("admin"), { status: undefined, next: true });
});
