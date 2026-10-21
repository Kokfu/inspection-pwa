import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { createManagerCustomersRouter, ManagerCustomerError } from "./managerCustomers.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
test("customer confirmation: defaults, provenance, admin-only idempotent confirm, technician flows unchanged", { skip: !databaseUrl }, async () => {
  const url = new URL(databaseUrl!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  let server: ReturnType<express.Express["listen"]> | undefined;
  try {
    await runMigrations(pool);
    await runMigrations(pool); // 059 must be safe to re-run
    const managerId = (await pool.query("INSERT INTO users(username,password_hash,role) VALUES('confirm-manager','x','admin') RETURNING id")).rows[0].id;
    const technicianId = (await pool.query("INSERT INTO users(username,password_hash,role) VALUES('confirm-tech','x','inspector') RETURNING id")).rows[0].id;
    const app = express(); app.use(express.json());
    app.use((request, _response, next) => {
      const role = request.headers["x-role"];
      if (role === "admin") request.currentUser = { id: managerId, username: "confirm-manager", role };
      else if (role === "inspector") request.currentUser = { id: technicianId, username: "confirm-tech", role };
      else if (role === "supervisor") request.currentUser = { id: managerId, username: "confirm-manager", role };
      next();
    });
    app.use(createManagerCustomersRouter(pool));
    app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      response.status(error instanceof ManagerCustomerError ? error.status : 500).json({ error: error instanceof ManagerCustomerError ? error.code : "INTERNAL_SERVER_ERROR" });
    });
    server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    const request = (path: string, method = "GET", body?: unknown, role = "admin", expectedUser?: string) => fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { "Content-Type": "application/json", "x-role": role, ...(expectedUser === undefined ? {} : { "x-expected-user-id": expectedUser }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const auditCount = async () => (await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='manager_customer_confirmed'")).rows[0].n;

    // Legacy customer (inserted without the new columns) is confirmed with unknown creator.
    const legacyId = randomUUID();
    await pool.query("INSERT INTO customers(id,customer_code,display_name) VALUES($1,$2,'Legacy Confirmed Co')", [legacyId, `LEG-${legacyId.slice(0, 8)}`]);
    await pool.query("INSERT INTO customer_sites(id,customer_id,site_code,display_name,is_active) VALUES($1,$2,'PRIMARY','Legacy site',true)", [randomUUID(), legacyId]);
    const legacyRevision = randomUUID();
    await pool.query(`INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status)
      VALUES($1,$2,(SELECT id FROM master_service_report_templates WHERE publication_status='published' ORDER BY version DESC LIMIT 1),1,'active')`, [legacyRevision, legacyId]);
    const legacy = (await (await request(`/manager/customers/${legacyId}`)).json()).customer.customer;
    assert.equal(legacy.confirmed, true); assert.equal(legacy.createdBy, null); assert.equal(legacy.confirmedAt, null);

    // Manager-created: confirmed, creator recorded.
    const managerCreated = await request("/manager/customers", "POST", { displayName: "Manager Made Co", siteDisplayName: "Main", systemKeys: ["hose_reel"] });
    assert.equal(managerCreated.status, 201);
    const managerCustomer = (await managerCreated.json()).customer.customer;
    assert.equal(managerCustomer.confirmed, true); assert.equal(managerCustomer.createdBy, "confirm-manager");
    assert.match(managerCustomer.createdAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);

    // Technician-created: unconfirmed but fully usable; idempotent replay keeps the same state.
    const techBody = { requestId: randomUUID(), displayName: "Tech Made Co", siteDisplayName: "Main", systemKeys: ["hose_reel"] };
    const techCreated = await request("/customers", "POST", techBody, "inspector");
    assert.equal(techCreated.status, 201);
    const techCustomer = (await techCreated.json()).customer;
    const techId = techCustomer.customer.id;
    assert.equal(techCustomer.customer.confirmed, false); assert.equal(techCustomer.customer.createdBy, "confirm-tech");
    assert.equal(techCustomer.sites.length, 1); assert.equal(techCustomer.configuration.enabledSystems.length, 1);
    const replay = await request("/customers", "POST", techBody, "inspector");
    assert.equal(replay.status, 200); assert.equal((await replay.json()).customer.customer.confirmed, false);

    // List and detail both carry the flag.
    const listed = (await (await request("/manager/customers")).json()).customers;
    const byId = (id: string) => listed.find((row: { customer: { id: string } }) => row.customer.id === id).customer;
    assert.equal(byId(techId).confirmed, false); assert.equal(byId(legacyId).confirmed, true); assert.equal(byId(managerCustomer.id).confirmed, true);
    assert.equal((await (await request(`/manager/customers/${techId}`)).json()).customer.customer.confirmed, false);

    // Authz and validation; nothing changes on refusal.
    const path = `/manager/customers/${techId}/confirm`;
    for (const [role, status] of [["", 401], ["inspector", 403], ["supervisor", 403]] as const) assert.equal((await request(path, "POST", undefined, role)).status, status, role);
    assert.equal((await request("/manager/customers/not-a-uuid/confirm", "POST")).status, 400);
    assert.equal((await request(path, "POST", { confirmed: false })).status, 400);
    assert.equal((await request(path, "POST", undefined, "admin", "someone-else")).status, 409);
    assert.equal((await request(`/manager/customers/${randomUUID()}/confirm`, "POST")).status, 404);
    assert.equal((await pool.query("SELECT is_confirmed FROM customers WHERE id=$1", [techId])).rows[0].is_confirmed, false);
    assert.equal(await auditCount(), 0);

    // Confirm, then repeat: the second call changes nothing and writes no second audit.
    const confirmed = await request(path, "POST", undefined, "admin", String(managerId));
    assert.equal(confirmed.status, 200);
    const confirmedCustomer = (await confirmed.json()).customer.customer;
    assert.equal(confirmedCustomer.confirmed, true); assert.match(confirmedCustomer.confirmedAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
    const again = await request(path, "POST", {});
    assert.equal(again.status, 200);
    assert.equal((await again.json()).customer.customer.confirmedAt, confirmedCustomer.confirmedAt);
    assert.equal(await auditCount(), 1);
    assert.equal(Number((await pool.query("SELECT confirmed_by_user_id FROM customers WHERE id=$1", [techId])).rows[0].confirmed_by_user_id), Number(managerId));

    // Another technician-created customer is unconfirmed (no global state); racing confirms stay single-audit.
    const second = await request("/customers", "POST", { requestId: randomUUID(), displayName: "Tech Second Co", siteDisplayName: "Main", systemKeys: ["hose_reel"] }, "inspector");
    const secondCustomer = (await second.json()).customer.customer;
    assert.equal(secondCustomer.confirmed, false);
    const racing = await Promise.all([1, 2, 3].map(() => request(`/manager/customers/${secondCustomer.id}/confirm`, "POST")));
    assert.deepEqual(racing.map((result) => result.status), [200, 200, 200]);
    assert.equal(await auditCount(), 2);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  }
});
