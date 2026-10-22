import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import express from "express";
import { createInspectionJobDetailHandler } from "./inspectionJobs.js";
import { createRepairVisitWritesRouter } from "./repairVisitWrites.js";

const id = "30000000-0000-4000-8000-000000000001";
const at = new Date("2026-10-21T00:00:00.000Z");
test("detail HTTP gates refuse foreign technicians for service and repair; retain owner and manager reads", async () => {
  let owner: number | null = 2;
  let detailReads = 0;
  let missing = false;
  let liveName = "Original customer";
  let liveId = id;
  let invalidCustomer = false;
  const snapshot = { customer: { id, code: "CUSTOMER", displayName: "Original customer" }, enabledSystems: [{ systemKey: "unchanged" }] };
  const visit = () => ({ client_uuid: id, visit_number: "RV-20261021-1", customer_id: id, site_id: id,
    created_by_user_id: owner, configuration_revision_id: id, service_call_number: null, arrival_time: "08:00:00",
    visit_date: "2026-10-21", created_on_device_at: at, previous_visit_kind: null, status: "draft", revision: 1,
    report_number: null, approved_by_user_id: null, approved_at: null, created_at: at, updated_at: at });
  const query = async (sql: string, parameters?: unknown[]) => {
    if (sql.includes("FROM users")) return { rows: [{ id: 1 }] };
    if (sql.includes("SELECT COALESCE")) return { rows: missing ? [] : [{ owned: owner === 1 }] };
    if (sql.includes("JOIN customers customer")) {
      assert.deepEqual(parameters, [id]);
      return { rows: invalidCustomer ? [] : [{ id: liveId, code: "CUSTOMER", displayName: liveName }] };
    }
    if (sql.includes("SELECT * FROM repair_visits")) return { rows: missing ? [] : [visit()] };
    if (/repair_visit_items|repair_visit_events|repair_visit_photos/.test(sql)) { detailReads++; return { rows: [] }; }
    return { rows: [] };
  };
  const database = { query, connect: async () => ({ query, release() {} }) };
  const app = express();
  app.use((req, _res, next) => {
    const role = req.header("x-test-role");
    if (role === "admin" || role === "inspector" || role === "supervisor") req.currentUser = { id: 1, username: "test", role };
    next();
  });
  app.get("/inspection-jobs/:jobId", createInspectionJobDetailHandler(database as never, async () => { detailReads++; return { id, configurationSnapshot: snapshot } as never; }));
  app.use(createRepairVisitWritesRouter(database as never));
  app.use(((_error, _req, res, _next) => { res.status(500).json({ error: "INVALID_DETAIL" }); }) as express.ErrorRequestHandler);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    for (const path of [`/inspection-jobs/${id}`, `/repair-visits/${id}`]) {
      const get = (role?: string, extra = {}) => fetch(base + path, { headers: { ...(role ? { "x-test-role": role } : {}), ...extra } });
      assert.equal((await get()).status, 401);
      detailReads = 0; owner = 2;
      const denied = await get("inspector"); assert.equal(denied.status, 403);
      assert.match((await denied.json()).message, path.startsWith("/inspection-jobs") ? /You can only open your own service visits/ : /technician who owns this repair visit/); assert.equal(detailReads, 0);
      owner = null; assert.equal((await get("inspector")).status, 403);
      owner = 1; assert.equal((await get("inspector")).status, 200); assert.ok(detailReads > 0);
      assert.equal((await get("inspector", { "x-expected-user-id": "2" })).status, 409);
      owner = 2; assert.equal((await get("admin")).status, 200);
      missing = true; assert.equal((await get("inspector")).status, 404); missing = false;
    }
    assert.equal((await fetch(`${base}/inspection-jobs/${id}`, { headers: { "x-test-role": "supervisor" } })).status, 403);
    assert.equal((await fetch(`${base}/repair-visits/${id}`, { headers: { "x-test-role": "supervisor" } })).status, 200);
    // The same historical visit follows a server-side rename without mutating its frozen configuration.
    for (const role of ["inspector", "admin"]) {
      owner = 1;
      liveName = "Original customer";
      const get = () => fetch(`${base}/inspection-jobs/${id}`, { headers: { "x-test-role": role } });
      assert.equal((await (await get()).json()).job.configurationSnapshot.customer.displayName, "Original customer");
      liveName = "Renamed customer";
      const renamed = await (await get()).json();
      assert.equal(renamed.job.configurationSnapshot.customer.displayName, "Renamed customer");
      assert.deepEqual(renamed.job.configurationSnapshot.enabledSystems, snapshot.enabledSystems);
      assert.equal(snapshot.customer.displayName, "Original customer");
      invalidCustomer = true;
      const refused = await get();
      assert.equal(refused.status, 500);
      assert.equal((await refused.json()).job, undefined);
      invalidCustomer = false;
      liveId = "30000000-0000-4000-8000-000000000002";
      assert.equal((await get()).status, 500);
      liveId = id;
    }
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});
