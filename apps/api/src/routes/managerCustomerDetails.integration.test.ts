import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { createManagerCustomersRouter, ManagerCustomerError } from "./managerCustomers.js";
import { createServiceVisit } from "../jobs/serviceVisits.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
test("customer details: authz, strict validation, unique names, atomic audit, stale callers and retry", { skip: !databaseUrl }, async () => {
  const url = new URL(databaseUrl!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/customer_records_s3a_test");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  let server: ReturnType<express.Express["listen"]> | undefined;
  try {
    await runMigrations(pool);
    const userId = (await pool.query("INSERT INTO users(username,password_hash,role) VALUES('customer-records-manager','x','admin') RETURNING id")).rows[0].id;
    const app = express(); app.use(express.json());
    app.use((request, _response, next) => {
      const role = request.headers["x-role"];
      if (role === "admin" || role === "inspector" || role === "supervisor") request.currentUser = { id: userId, username: "test", role };
      next();
    });
    app.use(createManagerCustomersRouter(pool));
    app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      response.status(error instanceof SyntaxError ? 400 : error instanceof ManagerCustomerError ? error.status : 500).json({ error: error instanceof ManagerCustomerError ? error.code : "INTERNAL_SERVER_ERROR", message: error instanceof ManagerCustomerError ? error.message : "Internal error" });
    });
    server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    const request = (path: string, method = "GET", body?: unknown, role = "admin", expectedUser?: string) => fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { "Content-Type": "application/json", "x-role": role, ...(expectedUser === undefined ? {} : { "x-expected-user-id": expectedUser }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const create = async (displayName: string) => {
      const result = await request("/manager/customers", "POST", { displayName, siteDisplayName: "Main site", systemKeys: ["hose_reel"] });
      assert.equal(result.status, 201); return (await result.json()).customer;
    };
    const first = await create("S3a Customer"); await create("S3a Duplicate");
    const path = `/manager/customers/${first.customer.id}`;
    const fields = ["displayName", "contactPerson", "contactPhone", "fax", "contractNumber", "serviceFrequency"];
    const expected = Object.fromEntries(fields.map((key) => [key, first.customer[key]]));
    const changes = { ...expected, displayName: "S3a Renamed", contactPerson: "New Contact", contactPhone: "123", serviceFrequency: "MONTHLY" };
    const edit = { expected, changes };
    assert.equal((await request(path, "PATCH", edit, "admin", "different-user")).status, 409);
    for (const [role, status] of [["", 401], ["inspector", 403], ["supervisor", 403]] as const) assert.equal((await request(path, "PATCH", edit, role)).status, status);
    for (const body of [null, [], {}, { ...edit, extra: true }, { ...edit, changes: { ...changes, extra: true } }, { ...edit, changes: { ...changes, displayName: " " } }, { ...edit, changes: { ...changes, contactPhone: 42 } }, { ...edit, changes: { ...changes, serviceFrequency: "WEEKLY" } }, { ...edit, changes: { ...changes, contactPhone: "x".repeat(41) } }]) {
      assert.equal((await request(path, "PATCH", body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await request("/manager/customers/no-uuid", "PATCH", edit)).status, 400);
    const duplicate = await request(path, "PATCH", { expected, changes: { ...changes, displayName: "  s3a duplicate  " } });
    assert.equal(duplicate.status, 409); assert.equal((await duplicate.json()).error, "CUSTOMER_NAME_CONFLICT");
    assert.equal((await request(path, "PATCH", edit)).status, 200);
    const read = (await (await request(path)).json()).customer;
    for (const key of fields) assert.equal(read.customer[key], changes[key as keyof typeof changes]);
    const audit = (await pool.query("SELECT actor_user_id, created_at, reason FROM audit_events WHERE action='manager_customer_details_updated' AND entity_id=$1", [first.customer.id])).rows;
    assert.equal(audit.length, 1); assert.equal(Number(audit[0].actor_user_id), Number(userId)); assert.ok(audit[0].created_at);
    assert.deepEqual(JSON.parse(audit[0].reason), { old: expected, new: changes });
    assert.equal((await request(path, "PATCH", edit)).status, 200);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='manager_customer_details_updated'")).rows[0].n, 1);
    assert.equal((await request(path, "PATCH", { expected, changes: { ...changes, contactPhone: "456" } })).status, 409);
    const racing = await Promise.all(["111", "222"].map((phone) => request(path, "PATCH", { expected: changes, changes: { ...changes, contactPhone: phone } })));
    assert.deepEqual(racing.map((result) => result.status).sort(), [200, 409]);
    const current = (await (await request(path)).json()).customer.customer;
    const beforeFailure = Object.fromEntries(fields.map((key) => [key, current[key]]));
    await pool.query(`CREATE FUNCTION s3a_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='manager_customer_details_updated' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER s3a_reject_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION s3a_reject_audit();`);
    assert.equal((await request(path, "PATCH", { expected: beforeFailure, changes: { ...beforeFailure, displayName: "Must roll back" } })).status, 500);
    assert.equal((await pool.query("SELECT display_name FROM customers WHERE id=$1", [first.customer.id])).rows[0].display_name, beforeFailure.displayName);
    await pool.query("DROP TRIGGER s3a_reject_audit ON audit_events; DROP FUNCTION s3a_reject_audit();");
    const list = await request("/manager/customers"); assert.equal(list.status, 200);
    const listed = (await list.json()).customers.find((row: typeof first) => row.customer.id === first.customer.id);
    assert.deepEqual(listed.tableSummary, { lastVisit: null, openCount: 0 });
    const visitClient = await pool.connect();
    try { await createServiceVisit(visitClient, { requestId: randomUUID(), customerId: first.customer.id, siteId: first.sites[0].id, systemKeys: ["hose_reel"] }, userId); }
    finally { visitClient.release(); }
    await pool.query(`INSERT INTO repair_visits(client_uuid,visit_number,customer_id,site_id,created_by_user_id,configuration_revision_id,arrival_time,visit_date,created_on_device_at,request_fingerprint)
      VALUES($1,'RV-20261021-999',$2,$3,$4,$5,'09:00','2099-01-01',now(),$6)`, [randomUUID(), first.customer.id, first.sites[0].id, userId, first.configuration.id, "a".repeat(64)]);
    const populated = (await (await request("/manager/customers")).json()).customers.find((row: typeof first) => row.customer.id === first.customer.id);
    assert.deepEqual(populated.tableSummary, { customerId: first.customer.id, lastVisit: "2099-01-01", openCount: 2 });
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  }
});
