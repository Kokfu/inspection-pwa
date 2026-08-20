import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import { createManagerServiceVisitsRouter, listManagerServiceVisits } from "./managerServiceVisits.js";
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
      if (id === closedId) return { rows: [{ id: closedId, reference: "SV-CLOSED", title: "Hidden technician site", status: "closed", serviceDate: "2026-08-19", site: { id: "site-closed", displayName: "Hidden technician site" }, configurationSnapshot: snapshot("Closed Customer") }] };
      if (id === openId) return { rows: [{ id: openId, reference: "SV-OPEN", title: "Open site", status: "open", serviceDate: "2026-08-20", site: { id: "site-open", displayName: "Open site" }, configurationSnapshot: snapshot("Open Customer") }] };
      return { rows: [
        { id: openId, reference: "SV-OPEN", title: "Open site", status: "open", serviceDate: "2026-08-20", site: { id: "site-open", displayName: "Open site" }, configurationSnapshot: snapshot("Open Customer") },
        { id: closedId, reference: "SV-CLOSED", title: "Hidden technician site", status: "closed", serviceDate: "2026-08-19", site: { id: "site-closed", displayName: "Hidden technician site" }, configurationSnapshot: snapshot("Closed Customer") }
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
    assert.deepEqual((await collection.json() as { serviceVisits: Array<{ id: string }> }).serviceVisits.map((visit) => visit.id), [openId, closedId]);
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
        { id: openId, reference: "SV-OPEN", title: "Open site", status: "open", serviceDate: "2026-08-20", site: { id: "site-open", displayName: "Open site" }, configurationSnapshot: snapshot("Open Customer") },
        { id: closedId, reference: "SV-CLOSED", title: "Closed site", status: "closed", serviceDate: "2026-08-19", site: { id: "site-closed", displayName: "Closed site" }, configurationSnapshot: snapshot("Closed Customer") }
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
  const visits = await listManagerServiceVisits(database as never);
  assert.deepEqual(visits.map((visit) => [visit.reference, visit.status]), [["SV-OPEN", "open"], ["SV-CLOSED", "closed"]]);
  assert.equal(visits[1]?.completion.completedBy?.username, "tech-one");
  const collectionQuery = database.queries.find((query) => query.includes("LEFT JOIN customer_sites")) ?? "";
  assert.match(collectionQuery, /inspection_jobs\.is_sample = false/);
  assert.match(collectionQuery, /master_template_version_id IS NOT NULL/);
  assert.doesNotMatch(collectionQuery, /fixture|regression/i);
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
