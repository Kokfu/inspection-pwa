import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import { createManagerCustomersRouter, loadManagerCustomer, ManagerCustomerError } from "./managerCustomers.js";
import { masterServiceReportV5 } from "../inspections/templates/masterServiceReportV5.js";
import { masterServiceReportV7 } from "../inspections/templates/masterServiceReportV7.js";
import { resolveAutomaticSprinklerControls } from "../inspections/templates/automaticSprinklerDefinitionControls.js";
import { buildLabelOverrideFormLayout } from "../inspections/labelOverrideFormLayout.js";
import { collectResolvedLabelPaths } from "../inspections/labelOverrides.js";

test("due date routes gate authority and reject malformed dates without database work", async () => {
  let touched = false;
  const database = { query() { touched = true; throw Error(); }, connect() { touched = true; throw Error(); } };
  const app = express(); app.use(express.json());
  app.use((request, _response, next) => { const role = request.headers["x-role"]; if (role === "admin" || role === "inspector") request.currentUser = { id: 1, username: role, role }; next(); });
  app.use(createManagerCustomersRouter(database as never));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(error instanceof SyntaxError ? 400 : error instanceof ManagerCustomerError ? error.status : 500).json({ error: error instanceof ManagerCustomerError ? error.code : "INTERNAL_SERVER_ERROR" });
  });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const { port } = server.address() as { port: number };
  const path = "/manager/customers/71000000-0000-4000-8000-000000000001/next-service-due-date";
  const request = (url: string, method: string, role: string, body?: unknown) => fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { "x-role": role, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    for (const role of ["", "inspector"]) {
      assert.equal((await request(path, "PUT", role, { nextServiceDueDate: null })).status, role ? 403 : 401);
      assert.equal((await request("/manager/customers/upcoming-service", "GET", role)).status, role ? 403 : 401);
    }
    for (const body of [{}, [], null, { nextServiceDueDate: "2026-02-30" }, { nextServiceDueDate: "2025-02-29" }, { nextServiceDueDate: "0000-01-01" }, { nextServiceDueDate: "2026-09-12T00:00:00Z" }, { nextServiceDueDate: null, extra: true }]) {
      assert.equal((await request(path, "PUT", "admin", body)).status, 400);
    }
    assert.equal(touched, false);
  } finally { await close(server); }
});

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

test("customer picker blocks new retired assignment while retaining an enabled retired service", async () => {
  const enabled = masterServiceReportV7.systems.find((system) => system.key === "hose_reel")!;
  const unassigned = masterServiceReportV7.systems.find((system) => system.key === "hydrant")!;
  const database = { async query(sql: string) {
    if (sql.includes("FROM customers")) return { rows: [{ id: "71000000-0000-4000-8000-000000000001", code: "OPS", displayName: "Customer" }] };
    if (sql.includes("FROM customer_sites")) return { rows: [] };
    if (sql.includes("FROM customer_configuration_revisions")) return { rows: [{ id: "71000000-0000-4000-8000-000000000003", revision: 1, templateId: masterServiceReportV7.id }] };
    if (sql.includes("FROM customer_enabled_systems")) return { rows: [{ id: "71000000-0000-4000-8000-000000000004", key: enabled.key, displayName: enabled.displayName, sortOrder: enabled.sortOrder, systemConfiguration: {}, evidencePolicyId: null }] };
    if (sql.includes("FROM customer_system_zones") || sql.includes("FROM customer_system_locations")) return { rows: [] };
    if (sql.includes("FROM master_service_report_systems")) return { rows: [enabled, unassigned].map((system) => ({ key: system.key, displayName: system.displayName, sortOrder: system.sortOrder, definitionStatus: system.definitionStatus, definition: system, retiredAt: "2026-09-01T00:00:00.000Z" })) };
    throw Error(`Unexpected query ${sql}`);
  } };
  const customer = await loadManagerCustomer("71000000-0000-4000-8000-000000000001", database as never);
  assert.equal(customer?.supportedSystems.find((system) => system.key === "hose_reel")?.assignable, true);
  assert.deepEqual(customer?.supportedSystems.find((system) => system.key === "hydrant"), { key: "hydrant", displayName: unassigned.displayName, sortOrder: unassigned.sortOrder, assignable: false, unavailableReason: "This service is retired and cannot be newly assigned" });
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

test("manager configuration activation rejects Dry/Wet Riser without systemConfiguration.riserMode before writing a revision", async () => {
  const dryWetRiser = masterServiceReportV5.systems.find((system) => system.key === "dry_wet_riser")!;
  const writes: string[] = [];
  const client = {
    async query(sql: string) {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("FROM customers")) return { rows: [{ id: "73000000-0000-4000-8000-000000000001" }] };
      if (sql.includes("FROM customer_sites")) return { rows: [] };
      if (sql.includes("FROM customer_configuration_revisions")) return { rows: [{ id: "73000000-0000-4000-8000-000000000002", revision: 1, templateId: masterServiceReportV5.id }] };
      if (sql.includes("FROM customer_enabled_systems")) return { rows: [{ id: "73000000-0000-4000-8000-000000000003", key: "dry_wet_riser", displayName: dryWetRiser.displayName, sortOrder: 1, systemConfiguration: {}, evidencePolicyId: null }] };
      if (sql.includes("FROM customer_system_zones") || sql.includes("FROM customer_system_locations")) return { rows: [] };
      if (sql.includes("FROM master_service_report_systems")) return { rows: [{ key: dryWetRiser.key, displayName: dryWetRiser.displayName, sortOrder: dryWetRiser.sortOrder, definitionStatus: dryWetRiser.definitionStatus, definition: dryWetRiser }] };
      if (sql.startsWith("UPDATE customer_configuration_revisions")) return { rows: [] };
      if (sql.startsWith("INSERT INTO customer_configuration_revisions") || sql.startsWith("INSERT INTO customer_enabled_systems")) { writes.push(sql); return { rows: [] }; }
      if (sql.startsWith("INSERT INTO audit_events")) return { rows: [] };
      throw new Error(`Unexpected query ${sql}`);
    },
    release() {}
  };
  const app = express(); app.use(express.json());
  app.use((request, _response, next) => { request.currentUser = { id: 1, username: "admin", role: "admin" }; next(); });
  app.use(createManagerCustomersRouter({ query: client.query, async connect() { return client; } } as never));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof ManagerCustomerError) response.status(error.status).json({ error: error.code, message: error.message });
    else response.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Unknown error" });
  });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address() as { port: number };
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/manager/customers/73000000-0000-4000-8000-000000000001/configuration-revisions`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemKeys: ["dry_wet_riser"] })
    });
    const payload = await response.json();
    assert.equal(response.status, 400, JSON.stringify(payload));
    assert.deepEqual(payload, {
      error: "RISER_MODE_REQUIRED",
      message: "dry_wet_riser.systemConfiguration.riserMode must be either dry or wet."
    });
    assert.deepEqual(writes, []);
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

test("label-overrides GET adds a read-only formLayout while every pre-existing field stays byte-identical", async () => {
  const customerId = "71000000-0000-4000-8000-000000000001";
  const sprinkler = masterServiceReportV7.systems.find((system) => system.key === "automatic_sprinkler")!;
  const stored = { "checklist.waterTank.water_level": "Tank Level", "measurements.jockey_pump_pressure.values.cut_in": "Cut-In Reading" };
  const database = {
    async query(sql: string) {
      if (sql.includes("FROM customers")) return { rows: [{ "?column?": 1 }] };
      if (sql.includes("FROM customer_configuration_revisions")) return { rows: [{ templateVersion: 7, definition: sprinkler, labelOverrides: stored }] };
      throw new Error(`Unexpected query ${sql}`);
    },
    async connect() { throw new Error("GET must not open a write transaction"); }
  };
  const app = express(); app.use(express.json());
  app.use((request, _response, next) => { request.currentUser = { id: 1, username: "admin", role: "admin" }; next(); });
  app.use(createManagerCustomersRouter(database as never));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const { port } = server.address() as { port: number };
  try {
    const response = await fetch(`http://127.0.0.1:${port}/manager/customers/${customerId}/systems/automatic_sprinkler/label-overrides`);
    assert.equal(response.status, 200);
    const text = await response.text();
    const body = JSON.parse(text) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body), ["systemKey", "templateVersion", "labels", "overrides", "formLayout"]);

    // The response WITHOUT `formLayout` must serialise to exactly the bytes the
    // route produced before this change (same keys, same order, same values).
    const controls = resolveAutomaticSprinklerControls(sprinkler, "MFE-FSSR", 7);
    const legacy = {
      systemKey: "automatic_sprinkler",
      templateVersion: 7,
      labels: collectResolvedLabelPaths(controls).map((entry) => {
        const override = (stored as Record<string, string>)[entry.path];
        const overridden = typeof override === "string" && override.trim().length > 0;
        return { path: entry.path, key: entry.key, definitionLabel: entry.definitionLabel, effectiveLabel: overridden ? override.trim() : entry.definitionLabel, overridden };
      }),
      overrides: stored
    };
    const { formLayout, ...rest } = body;
    assert.equal(JSON.stringify(rest), JSON.stringify(legacy));
    assert.ok(text.startsWith(JSON.stringify(legacy).slice(0, -1) + ",\"formLayout\":"), "old fields are a byte-identical prefix of the new body");
    assert.deepEqual(formLayout, buildLabelOverrideFormLayout("automatic_sprinkler", controls));
  } finally { await close(server); }
});

test("customer archive/restore and service-catalog routes require admin authority before any database work", async () => {
  let touched = false;
  const database = {
    async query() { touched = true; return { rows: [] }; },
    async connect() { touched = true; throw new Error("protected handler must not run"); }
  };
  const app = express(); app.use(express.json());
  app.use((request, _response, next) => { const role = request.headers["x-role"]; if (role === "admin" || role === "inspector") request.currentUser = { id: 1, username: role, role }; next(); });
  app.use(createManagerCustomersRouter(database as never));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address() as { port: number };
  const request = (path: string, method: "GET" | "PUT", role?: "admin" | "inspector") => fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: role ? { "x-role": role } : undefined });
  try {
    const customerId = "71000000-0000-4000-8000-000000000001";
    for (const [path, method] of [
      ["/manager/customers/archived", "GET"],
      [`/manager/customers/${customerId}/archive`, "PUT"],
      [`/manager/customers/${customerId}/restore`, "PUT"],
      ["/manager/service-catalog", "GET"],
      ["/manager/service-catalog/hose_reel/retire", "PUT"],
      ["/manager/service-catalog/hose_reel/restore", "PUT"]
    ] as const) {
      assert.equal((await request(path, method)).status, 401, `${method} ${path} unauthenticated`);
      assert.equal((await request(path, method, "inspector")).status, 403, `${method} ${path} inspector`);
    }
    assert.equal(touched, false);
  } finally { await close(server); }
});

test("GET /manager/service-catalog always reports assignable:true and excludes retired systems", async () => {
  const hose = masterServiceReportV5.systems.find((system) => system.key === "hose_reel")!;
  const fm200 = masterServiceReportV5.systems.find((system) => system.key === "fm200")!;
  const database = {
    async query(sql: string) {
      if (sql.includes("FROM master_service_report_systems")) return { rows: [
        { key: hose.key, displayName: hose.displayName, sortOrder: hose.sortOrder, definitionStatus: hose.definitionStatus, definition: hose, retiredAt: null },
        { key: fm200.key, displayName: fm200.displayName, sortOrder: fm200.sortOrder, definitionStatus: fm200.definitionStatus, definition: fm200, retiredAt: "2026-09-01T00:00:00.000Z" }
      ] };
      throw new Error(`Unexpected query ${sql}`);
    }
  };
  const app = express(); app.use(express.json());
  app.use((request, _response, next) => { request.currentUser = { id: 1, username: "admin", role: "admin" }; next(); });
  app.use(createManagerCustomersRouter(database as never));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const { port } = server.address() as { port: number };
  try {
    const response = await fetch(`http://127.0.0.1:${port}/manager/service-catalog`);
    assert.equal(response.status, 200);
    const body = await response.json() as { systems: Array<{ key: string; assignable: boolean }> };
    // fm200 is not `isImplementedSystemKey`/contract-compatible in this fixture set
    // (see the "excludes unsupported FM200" test above), so it never reaches the
    // catalog either way here — the meaningful assertion is that every returned
    // entry (hose_reel) reports assignable:true, and that a retired key never
    // survives the filter.
    assert.ok(body.systems.every((system) => system.assignable === true));
    assert.ok(!body.systems.some((system) => system.key === fm200.key));
  } finally { await close(server); }
});

test("GET /manager/service-catalog?includeRetired=true reports a retired, implemented system with its retiredAt and assignable:false", async () => {
  const hose = masterServiceReportV5.systems.find((system) => system.key === "hose_reel")!;
  const hydrant = masterServiceReportV5.systems.find((system) => system.key === "hydrant")!;
  const retiredAt = "2026-09-01T00:00:00.000Z";
  const database = {
    async query(sql: string) {
      if (sql.includes("FROM master_service_report_systems")) return { rows: [
        { key: hose.key, displayName: hose.displayName, sortOrder: hose.sortOrder, definitionStatus: hose.definitionStatus, definition: hose, retiredAt: null },
        { key: hydrant.key, displayName: hydrant.displayName, sortOrder: hydrant.sortOrder, definitionStatus: hydrant.definitionStatus, definition: hydrant, retiredAt }
      ] };
      throw new Error(`Unexpected query ${sql}`);
    }
  };
  const app = express(); app.use(express.json());
  app.use((request, _response, next) => { request.currentUser = { id: 1, username: "admin", role: "admin" }; next(); });
  app.use(createManagerCustomersRouter(database as never));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const { port } = server.address() as { port: number };
  try {
    const defaultResponse = await fetch(`http://127.0.0.1:${port}/manager/service-catalog`);
    const defaultBody = await defaultResponse.json() as { systems: Array<{ key: string }> };
    assert.ok(!defaultBody.systems.some((system) => system.key === hydrant.key), "default call still excludes the retired system");

    const includeRetiredResponse = await fetch(`http://127.0.0.1:${port}/manager/service-catalog?includeRetired=true`);
    assert.equal(includeRetiredResponse.status, 200);
    const body = await includeRetiredResponse.json() as { systems: Array<{ key: string; assignable: boolean; retiredAt: string | null }> };
    const retiredEntry = body.systems.find((system) => system.key === hydrant.key);
    assert.ok(retiredEntry, "includeRetired=true surfaces the retired system");
    assert.equal(retiredEntry!.assignable, false);
    assert.equal(retiredEntry!.retiredAt, retiredAt);
    const activeEntry = body.systems.find((system) => system.key === hose.key);
    assert.ok(activeEntry);
    assert.equal(activeEntry!.assignable, true);
    assert.equal(activeEntry!.retiredAt, null);
  } finally { await close(server); }
});

test("retiring a service-catalog entry sets retired_at scoped to the current published template version and is admin-audited", async () => {
  const writes: string[] = [];
  const client = {
    async query(sql: string, values?: unknown[]) {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("UPDATE master_service_report_systems SET retired_at = now()")) {
        writes.push(sql);
        assert.equal(values?.[0], "hose_reel");
        return { rows: [{ key: "hose_reel", displayName: "Hose Reel", sortOrder: 1, retiredAt: "2026-09-24T00:00:00.000Z" }] };
      }
      if (sql.startsWith("INSERT INTO audit_events")) { writes.push(sql); return { rows: [] }; }
      throw new Error(`Unexpected query ${sql}`);
    },
    release() {}
  };
  const app = express(); app.use(express.json());
  app.use((request, _response, next) => { request.currentUser = { id: 1, username: "admin", role: "admin" }; next(); });
  app.use(createManagerCustomersRouter({ query: client.query, async connect() { return client; } } as never));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const { port } = server.address() as { port: number };
  try {
    const response = await fetch(`http://127.0.0.1:${port}/manager/service-catalog/hose_reel/retire`, { method: "PUT" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { system: { key: "hose_reel", displayName: "Hose Reel", sortOrder: 1, retiredAt: "2026-09-24T00:00:00.000Z" } });
    assert.ok(writes.some((sql) => sql.startsWith("INSERT INTO audit_events")), "retirement is audit-logged");
  } finally { await close(server); }
});

test("customer creation rejects a retired system for a brand-new customer, and an existing customer's already-enabled retired system keeps saving", async () => {
  const hose = masterServiceReportV5.systems.find((system) => system.key === "hose_reel")!;
  const retiredCatalogRow = { key: hose.key, displayName: hose.displayName, sortOrder: hose.sortOrder, definitionStatus: hose.definitionStatus, definition: hose, retiredAt: "2026-09-01T00:00:00.000Z" };
  const creationClient = {
    async query(sql: string) {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("INSERT INTO customer_creation_requests")) return { rows: [{ requestId: "72000000-0000-4000-8000-000000000009" }] };
      if (sql.includes("FROM master_service_report_systems")) return { rows: [retiredCatalogRow] };
      throw new Error(`Unexpected query ${sql}`);
    },
    release() {}
  };
  const app = express(); app.use(express.json());
  app.use((request, _response, next) => { request.currentUser = { id: 1, username: "admin", role: "admin" }; next(); });
  app.use(createManagerCustomersRouter({ query: creationClient.query, async connect() { return creationClient; } } as never));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof ManagerCustomerError) response.status(error.status).json({ error: error.code });
    else response.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const { port } = server.address() as { port: number };
  try {
    const create = await fetch(`http://127.0.0.1:${port}/customers`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "72000000-0000-4000-8000-000000000009", displayName: "Retired Pick Customer", siteDisplayName: "Primary", systemKeys: [hose.key] })
    });
    assert.equal(create.status, 409);
    assert.deepEqual(await create.json(), { error: "RETIRED_SYSTEM_KEY" });

    // An existing customer with hose_reel ALREADY enabled must still be able to
    // save a configuration revision that keeps that same key — retirement never
    // blocks re-saving already-enabled usage.
    const customerId = "73000000-0000-4000-8000-000000000001";
    const revisionWrites: string[] = [];
    const editClient = {
      async query(sql: string) {
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
        if (sql.includes("FROM customers")) return { rows: [{ id: customerId }] };
        if (sql.includes("FROM customer_sites")) return { rows: [] };
        if (sql.includes("FROM customer_configuration_revisions")) return { rows: [{ id: "73000000-0000-4000-8000-000000000002", revision: 1, templateId: masterServiceReportV5.id }] };
        if (sql.includes("FROM customer_enabled_systems")) return { rows: [{ id: "73000000-0000-4000-8000-000000000003", key: hose.key, displayName: hose.displayName, sortOrder: 1, systemConfiguration: {}, evidencePolicyId: null }] };
        if (sql.includes("FROM customer_system_zones") || sql.includes("FROM customer_system_locations")) return { rows: [] };
        if (sql.includes("FROM master_service_report_systems")) return { rows: [retiredCatalogRow] };
        if (sql.startsWith("UPDATE customer_configuration_revisions")) return { rows: [] };
        if (sql.startsWith("INSERT INTO customer_configuration_revisions") || sql.startsWith("INSERT INTO customer_enabled_systems")) { revisionWrites.push(sql); return { rows: [] }; }
        if (sql.startsWith("INSERT INTO audit_events")) return { rows: [] };
        throw new Error(`Unexpected query ${sql}`);
      },
      release() {}
    };
    const editApp = express(); editApp.use(express.json());
    editApp.use((request, _response, next) => { request.currentUser = { id: 1, username: "admin", role: "admin" }; next(); });
    editApp.use(createManagerCustomersRouter({ query: editClient.query, async connect() { return editClient; } } as never));
    editApp.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      if (error instanceof ManagerCustomerError) response.status(error.status).json({ error: error.code });
      else response.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
    });
    const editServer = editApp.listen(0, "127.0.0.1"); await once(editServer, "listening"); const editAddress = editServer.address() as { port: number };
    try {
      const resave = await fetch(`http://127.0.0.1:${editAddress.port}/manager/customers/${customerId}/configuration-revisions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemKeys: [hose.key] })
      });
      assert.equal(resave.status, 201, "re-saving an already-enabled retired system must not be blocked");
      assert.ok(revisionWrites.some((sql) => sql.startsWith("INSERT INTO customer_enabled_systems")));
    } finally { await close(editServer); }
  } finally { await close(server); }
});
