import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { createInspectionReferenceRouter } from "./inspectionReference.js";
import { createManagerCustomersRouter, ManagerCustomerError } from "./managerCustomers.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
const uuid = (suffix: string) => `93000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function application(
  database: pg.Pool,
  users: Record<string, { id: number; username: string }>,
  afterCustomerInserted?: () => Promise<void> | void
) {
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    const actor = typeof request.headers["x-actor"] === "string" ? users[request.headers["x-actor"]] : undefined;
    if (actor) request.currentUser = { ...actor, role: "inspector" };
    next();
  });
  // Match production mount order: reference routes are available to a second
  // technician after creation, while POST /customers remains the explicit
  // shared-master-data command.
  app.use(createInspectionReferenceRouter(database));
  app.use(createManagerCustomersRouter(database, { afterCustomerInserted }));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof ManagerCustomerError) response.status(error.status).json({ error: error.code, message: error.message });
    else response.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  });
  return app;
}

test("technician customer creation is persistent, idempotent, concurrent-safe, and atomic", { skip: !databaseUrl }, async () => {
  assert.equal(new URL(databaseUrl!).pathname, "/phase6_seed_integration", "customer integration only permits its dedicated database");
  const database = new pg.Pool({ connectionString: databaseUrl });
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(database);
    const accounts = await database.query<{ id: number; username: string }>(`
      INSERT INTO users (username, password_hash, role) VALUES
        ('customer-tech-a', 'not-used', 'inspector'),
        ('customer-tech-b', 'not-used', 'inspector')
      RETURNING id, username`);
    const users = Object.fromEntries(accounts.rows.map((account) => [account.username.endsWith("-a") ? "a" : "b", account]));
    const app = application(database, users);
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address() as { port: number };
    const post = (actor: "a" | "b", body: unknown) => fetch(`http://127.0.0.1:${address.port}/customers`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-actor": actor }, body: JSON.stringify(body)
    });
    const get = (actor: "a" | "b", path: string) => fetch(`http://127.0.0.1:${address.port}${path}`, { headers: { "x-actor": actor } });
    const input = (requestId: string, displayName: string, siteDisplayName = "Primary") => ({ requestId, displayName, siteDisplayName, systemKeys: ["hose_reel"] });
    try {
      assert.deepEqual((await get("a", "/customers/service-format-options")).status, 200);
      const options = await (await get("a", "/customers/service-format-options")).json() as { systems: Array<{ key: string }> };
      assert(!options.systems.some((system) => system.key === "co2_fire_extinguisher" || system.key === "wet_chemical" || system.key === "dry_wet_riser"), "simple customer setup must not advertise systems needing additional structure");

      const firstRequest = input(uuid("1"), "Technician Shared Customer");
      const first = await post("a", firstRequest);
      assert.equal(first.status, 201);
      const firstBody = await first.json() as { customer: { customer: { id: string }; configuration: { revision: number; enabledSystems: Array<{ key: string }> } } };
      const firstId = firstBody.customer.customer.id;
      assert.equal(firstBody.customer.configuration.revision, 1);
      assert.deepEqual(firstBody.customer.configuration.enabledSystems.map((system) => system.key), ["hose_reel"]);
      assert.deepEqual((await database.query(`SELECT
        (SELECT count(*)::int FROM customers WHERE id=$1) AS customer,
        (SELECT count(*)::int FROM customer_sites WHERE customer_id=$1) AS site,
        (SELECT count(*)::int FROM customer_configuration_revisions WHERE customer_id=$1 AND revision=1 AND status='active') AS revision,
        (SELECT count(*)::int FROM customer_enabled_systems WHERE configuration_revision_id=(SELECT id FROM customer_configuration_revisions WHERE customer_id=$1 AND revision=1)) AS systems,
        (SELECT count(*)::int FROM customer_creation_requests WHERE request_id=$2 AND customer_id=$1) AS request`, [firstId, firstRequest.requestId])).rows[0], { customer: 1, site: 1, revision: 1, systems: 1, request: 1 });

      const visibleToSecond = await get("b", "/customers");
      assert.equal(visibleToSecond.status, 200);
      assert((await visibleToSecond.json() as { customers: Array<{ id: string }> }).customers.some((customer) => customer.id === firstId), "second technician sees server-backed customer");
      const configurationToSecond = await get("b", `/customers/${firstId}/configuration`);
      assert.equal(configurationToSecond.status, 200);

      const replay = await post("a", firstRequest);
      assert.equal(replay.status, 200);
      assert.equal((await replay.json() as { customer: { customer: { id: string } } }).customer.customer.id, firstId);
      const changedReplay = await post("a", { ...firstRequest, siteDisplayName: "Changed Site" });
      assert.equal(changedReplay.status, 409);
      assert.equal((await changedReplay.json() as { error: string }).error, "IDEMPOTENCY_CONFLICT");
      assert.equal((await database.query("SELECT count(*)::int AS count FROM customers WHERE id=$1", [firstId])).rows[0]?.count, 1);

      const sameKey = input(uuid("2"), "Concurrent Same Key Customer");
      const sameKeyResponses = await Promise.all([post("a", sameKey), post("a", sameKey)]);
      assert.deepEqual(sameKeyResponses.map((response) => response.status).sort(), [200, 201]);
      const sameKeyBodies = await Promise.all(sameKeyResponses.map((response) => response.json() as Promise<{ customer: { customer: { id: string } } }>));
      assert.equal(sameKeyBodies[0].customer.customer.id, sameKeyBodies[1].customer.customer.id);
      assert.equal((await database.query("SELECT count(*)::int AS count FROM customers WHERE lower(btrim(display_name))=lower(btrim($1))", [sameKey.displayName])).rows[0]?.count, 1);

      const duplicateName = "Concurrent Canonical Customer";
      const competing = await Promise.all([post("a", input(uuid("3"), duplicateName)), post("b", input(uuid("4"), `  ${duplicateName}  `))]);
      assert.deepEqual(competing.map((response) => response.status).sort(), [201, 409]);
      assert.equal((await database.query("SELECT count(*)::int AS count FROM customers WHERE lower(btrim(display_name))=lower(btrim($1))", [duplicateName])).rows[0]?.count, 1);
    } finally { await close(server); }

    const failedApp = application(database, users, () => { throw new Error("forced customer creation failure"); });
    const failedServer = failedApp.listen(0, "127.0.0.1"); await once(failedServer, "listening");
    const failedAddress = failedServer.address() as { port: number };
    const failedInput = input(uuid("5"), "Rollback Customer");
    try {
      const before = await database.query(`SELECT
        (SELECT count(*)::int FROM customers WHERE lower(btrim(display_name))=lower(btrim($1))) AS customer,
        (SELECT count(*)::int FROM customer_sites site INNER JOIN customers customer ON customer.id=site.customer_id WHERE lower(btrim(customer.display_name))=lower(btrim($1))) AS site,
        (SELECT count(*)::int FROM customer_configuration_revisions revision INNER JOIN customers customer ON customer.id=revision.customer_id WHERE lower(btrim(customer.display_name))=lower(btrim($1))) AS revision,
        (SELECT count(*)::int FROM customer_creation_requests WHERE request_id=$2) AS request`, [failedInput.displayName, failedInput.requestId]);
      const failed = await fetch(`http://127.0.0.1:${failedAddress.port}/customers`, { method: "POST", headers: { "Content-Type": "application/json", "x-actor": "a" }, body: JSON.stringify(failedInput) });
      assert.equal(failed.status, 500);
      assert.deepEqual((await database.query(`SELECT
        (SELECT count(*)::int FROM customers WHERE lower(btrim(display_name))=lower(btrim($1))) AS customer,
        (SELECT count(*)::int FROM customer_sites site INNER JOIN customers customer ON customer.id=site.customer_id WHERE lower(btrim(customer.display_name))=lower(btrim($1))) AS site,
        (SELECT count(*)::int FROM customer_configuration_revisions revision INNER JOIN customers customer ON customer.id=revision.customer_id WHERE lower(btrim(customer.display_name))=lower(btrim($1))) AS revision,
        (SELECT count(*)::int FROM customer_creation_requests WHERE request_id=$2) AS request`, [failedInput.displayName, failedInput.requestId])).rows, before.rows, "failed transaction leaves no customer or idempotency residue");
    } finally { await close(failedServer); }

    const retryApp = application(database, users);
    const retryServer = retryApp.listen(0, "127.0.0.1"); await once(retryServer, "listening");
    const retryAddress = retryServer.address() as { port: number };
    try {
      const retry = await fetch(`http://127.0.0.1:${retryAddress.port}/customers`, { method: "POST", headers: { "Content-Type": "application/json", "x-actor": "a" }, body: JSON.stringify(failedInput) });
      assert.equal(retry.status, 201, "same request ID may create after its failed transaction rolled back");
    } finally { await close(retryServer); }

    const contactApp = application(database, users);
    const contactServer = contactApp.listen(0, "127.0.0.1"); await once(contactServer, "listening");
    const contactAddress = contactServer.address() as { port: number };
    try {
      const withContact = await fetch(`http://127.0.0.1:${contactAddress.port}/customers`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-actor": "a" },
        body: JSON.stringify({ ...input(uuid("6"), "Customer With Contact Details"), contactPhone: "  012-3456789  ", contactPerson: "  Jane Tan  " })
      });
      assert.equal(withContact.status, 201);
      const withContactBody = await withContact.json() as { customer: { customer: { id: string; contactPhone?: string | null; contactPerson?: string | null } } };
      assert.equal(withContactBody.customer.customer.contactPhone, "012-3456789", "contact phone is trimmed and returned");
      assert.equal(withContactBody.customer.customer.contactPerson, "Jane Tan", "contact person is trimmed and returned");
      assert.deepEqual((await database.query("SELECT contact_phone AS \"contactPhone\", contact_person AS \"contactPerson\" FROM customers WHERE id=$1", [withContactBody.customer.customer.id])).rows[0], { contactPhone: "012-3456789", contactPerson: "Jane Tan" });

      const withoutContact = await fetch(`http://127.0.0.1:${contactAddress.port}/customers`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-actor": "a" },
        body: JSON.stringify(input(uuid("7"), "Customer Without Contact Details"))
      });
      assert.equal(withoutContact.status, 201);
      const withoutContactBody = await withoutContact.json() as { customer: { customer: { contactPhone?: string | null; contactPerson?: string | null } } };
      assert.equal(withoutContactBody.customer.customer.contactPhone, null, "omitted contact phone stays null, not required");
      assert.equal(withoutContactBody.customer.customer.contactPerson, null, "omitted contact person stays null, not required");
    } finally { await close(contactServer); }
  } finally { await database.end(); }
});
