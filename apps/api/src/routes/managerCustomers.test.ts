import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import { createManagerCustomersRouter } from "./managerCustomers.js";
import { loadManagerCustomer } from "./managerCustomers.js";
import { masterServiceReportV5 } from "../inspections/templates/masterServiceReportV5.js";

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("Manager Customer Configuration routes require admin authority before any database work", async () => {
  let touched = false;
  const database = {
    async query() { touched = true; return { rows: [] }; },
    async connect() { touched = true; throw new Error("protected handler must not run"); }
  };
  const app = express(); app.use(express.json());
  app.use((request, _response, next) => { const role = request.headers["x-role"]; if (role === "admin" || role === "inspector") request.currentUser = { id: 1, username: role, role }; next(); });
  app.use(createManagerCustomersRouter(database as never));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address() as { port: number };
  const request = (path: string, role?: "admin" | "inspector") => fetch(`http://127.0.0.1:${address.port}${path}`, { method: "GET", headers: role ? { "x-role": role } : undefined });
  try {
    assert.equal((await request("/manager/customers")).status, 401);
    assert.equal((await request("/manager/customers", "inspector")).status, 403);
    assert.equal((await request("/manager/customers/71000000-0000-4000-8000-000000000001", "inspector")).status, 403);
    assert.equal(touched, false);
  } finally { await close(server); }
});

test("manager customer presentation is operational-only and its catalog excludes unsupported FM200", async () => {
  const queries: string[] = [];
  const hose = masterServiceReportV5.systems.find((system) => system.key === "hose_reel")!;
  const fm200 = masterServiceReportV5.systems.find((system) => system.key === "fm200")!;
  const database = {
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes("FROM customers")) return { rows: [{ id: "71000000-0000-4000-8000-000000000001", code: "OPS", displayName: "Operational Customer" }] };
      if (sql.includes("FROM customer_sites")) return { rows: [{ id: "71000000-0000-4000-8000-000000000002", code: "PRIMARY", displayName: "Primary Service Site" }] };
      if (sql.includes("FROM customer_configuration_revisions")) return { rows: [{ id: "71000000-0000-4000-8000-000000000003", revision: 1, templateId: masterServiceReportV5.id }] };
      if (sql.includes("FROM customer_enabled_systems")) return { rows: [{ id: "71000000-0000-4000-8000-000000000004", key: "hose_reel", displayName: hose.displayName, sortOrder: 1, systemConfiguration: {}, evidencePolicyId: null }] };
      if (sql.includes("FROM customer_system_zones") || sql.includes("FROM customer_system_locations")) return { rows: [] };
      if (sql.includes("FROM master_service_report_systems")) return { rows: [
        { key: hose.key, displayName: hose.displayName, sortOrder: hose.sortOrder, definitionStatus: hose.definitionStatus, definition: hose },
        { key: fm200.key, displayName: fm200.displayName, sortOrder: fm200.sortOrder, definitionStatus: fm200.definitionStatus, definition: fm200 }
      ] };
      throw new Error(`Unexpected query ${sql}`);
    }
  };
  const customer = await loadManagerCustomer("71000000-0000-4000-8000-000000000001", database as never);
  assert.deepEqual(customer?.configuration.enabledSystems.map((system) => system.key), ["hose_reel"]);
  assert.deepEqual(customer?.supportedSystems.map((system) => system.key), ["hose_reel"]);
  assert.match(queries[0] ?? "", /is_active = true AND is_demo = false/);
});

test("manager write connection failure is routed through Express error handling", async () => {
  const app = express(); app.use(express.json());
  app.use((request, _response, next) => { request.currentUser = { id: 1, username: "admin", role: "admin" }; next(); });
  app.use(createManagerCustomersRouter({ async query() { return { rows: [] }; }, async connect() { throw new Error("pool unavailable"); } } as never));
  app.use((_error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(503).json({ error: "MANAGER_UNAVAILABLE" }));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address() as { port: number };
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/manager/customers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "Failure", siteDisplayName: "Primary", systemKeys: ["hose_reel"] }) });
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "MANAGER_UNAVAILABLE" });
  } finally { await close(server); }
});

test("technician customer creation is authenticated, server-backed, and does not grant Manager access", async () => {
  const hose = masterServiceReportV5.systems.find((system) => system.key === "hose_reel")!;
  let insertedCustomer = false;
  const client = {
    async query(sql: string) {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("INSERT INTO customer_creation_requests")) return { rows: [{ requestId: "72000000-0000-4000-8000-000000000009" }] };
      if (sql.includes("UPDATE customer_creation_requests")) return { rows: [], rowCount: 1 };
      if (sql.includes("FROM master_service_report_systems")) return { rows: [{ key: hose.key, displayName: hose.displayName, sortOrder: hose.sortOrder, definitionStatus: hose.definitionStatus, definition: hose }] };
      if (sql.includes("INSERT INTO customers")) { insertedCustomer = true; return { rows: [{ id: "72000000-0000-4000-8000-000000000001" }] }; }
      if (sql.includes("lower(btrim(display_name))")) return { rows: [] };
      if (sql.startsWith("INSERT INTO customer_sites") || sql.startsWith("INSERT INTO customer_configuration_revisions") || sql.startsWith("INSERT INTO customer_enabled_systems") || sql.startsWith("INSERT INTO audit_events")) return { rows: [] };
      if (sql.includes("FROM customers")) return { rows: [{ id: "72000000-0000-4000-8000-000000000001", code: "CUST-TEST", displayName: "Technician Customer" }] };
      if (sql.includes("FROM customer_sites")) return { rows: [{ id: "72000000-0000-4000-8000-000000000002", code: "PRIMARY", displayName: "Primary" }] };
      if (sql.includes("FROM customer_configuration_revisions")) return { rows: [{ id: "72000000-0000-4000-8000-000000000003", revision: 1, templateId: masterServiceReportV5.id }] };
      if (sql.includes("FROM customer_enabled_systems")) return { rows: [{ id: "72000000-0000-4000-8000-000000000004", key: hose.key, displayName: hose.displayName, sortOrder: 1, systemConfiguration: {}, evidencePolicyId: null }] };
      if (sql.includes("FROM customer_system_zones") || sql.includes("FROM customer_system_locations")) return { rows: [] };
      throw new Error(`Unexpected query ${sql}`);
    },
    release() {}
  };
  const database = { query: client.query, async connect() { return client; } };
  const app = express(); app.use(express.json());
  app.use((request, _response, next) => {
    const role = request.headers["x-role"];
    if (role === "admin" || role === "inspector") request.currentUser = { id: 7, username: String(role), role };
    next();
  });
  app.use(createManagerCustomersRouter(database as never));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address() as { port: number };
  const post = (role?: "admin" | "inspector") => fetch(`http://127.0.0.1:${address.port}/customers`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(role ? { "x-role": role } : {}) },
    body: JSON.stringify({ requestId: "72000000-0000-4000-8000-000000000009", displayName: "Technician Customer", siteDisplayName: "Primary", systemKeys: ["hose_reel"] })
  });
  try {
    assert.equal((await post()).status, 401);
    assert.equal((await post("inspector")).status, 201);
    assert.equal(insertedCustomer, true);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/manager/customers`, { headers: { "x-role": "inspector" } })).status, 403);
  } finally { await close(server); }
});
