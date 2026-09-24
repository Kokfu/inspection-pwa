import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import type { Server } from "node:http";
import express from "express";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { createServiceVisit } from "../jobs/serviceVisits.js";
import { createManagerCustomersRouter, ManagerCustomerError } from "./managerCustomers.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
const customerId = "00000000-0000-4000-8000-000000000900";

test("FM200 is assignable without setup; new visits freeze General or configured locations", { skip: !databaseUrl }, async () => {
  assert.equal(new URL(databaseUrl!).pathname, "/phase6_seed_integration", "FM200 integration only permits the disposable database");
  const database = new pg.Pool({ connectionString: databaseUrl });
  let server: Server | undefined;
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(database);
    const userId = (await database.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES('fm200-manager','x','admin') RETURNING id")).rows[0]!.id;
    await database.query("UPDATE customers SET is_demo=false WHERE id=$1", [customerId]);
    const siteId = (await database.query<{ id: string }>("SELECT id FROM customer_sites WHERE customer_id=$1 LIMIT 1", [customerId])).rows[0]!.id;
    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { request.currentUser = { id: userId, username: "fm200-manager", role: "admin" }; next(); });
    app.use(createManagerCustomersRouter(database));
    app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      if (error instanceof ManagerCustomerError) response.status(error.status).json({ error: error.code, message: error.message });
      else response.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : String(error) });
    });
    server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    const call = (method: "GET" | "PUT" | "POST", path: string, body?: unknown) => fetch(`http://127.0.0.1:${port}${path}`, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const configPath = `/manager/customers/${customerId}/configuration`;
    const locationsPath = `/manager/customers/${customerId}/systems/fm200_fire_suppression/locations`;

    const defaultSystems = ["co2_fire_extinguisher", "wet_chemical", "fm200_fire_suppression"];
    const before = await (await call("GET", configPath)).json() as { supportedSystems: Array<{ key: string; assignable: boolean }> };
    for (const key of defaultSystems) assert.equal(before.supportedSystems.find((item) => item.key === key)?.assignable, true);
    assert.equal((await call("POST", `/manager/customers/${customerId}/configuration-revisions`, { systemKeys: ["fm200_fire_suppression"] })).status, 201);
    const empty = await (await call("GET", locationsPath)).json() as { zones: unknown[]; locations: unknown[] };
    assert.deepEqual(empty.zones, []); assert.deepEqual(empty.locations, []);

    const createdResponse = await call("POST", "/manager/customers", { displayName: "General Location Test Customer", siteDisplayName: "Main Site", systemKeys: defaultSystems });
    assert.equal(createdResponse.status, 201, JSON.stringify(await createdResponse.clone().json()));
    const created = await createdResponse.json() as { customer: { customer: { id: string }; sites: Array<{ id: string }> } };
    const freshCustomerId = created.customer.customer.id;
    const freshSiteId = created.customer.sites[0]!.id;

    const client = await database.connect();
    try {
      const generalVisit = await createServiceVisit(client, { requestId: randomUUID(), customerId: freshCustomerId, siteId: freshSiteId, systemKeys: defaultSystems }, userId);
      const frozen = (await client.query<{ configurationSnapshot: { enabledSystems: Array<{ systemKey: string; zones: Array<{ id: string; displayName: string }>; locations: Array<{ id: string; zoneId: string; displayName: string }> }> } }>(
        'SELECT configuration_snapshot AS "configurationSnapshot" FROM inspection_jobs WHERE id=$1', [generalVisit.id]
      )).rows[0]!.configurationSnapshot.enabledSystems;
      for (const key of defaultSystems) {
        const general = frozen.find((system) => system.systemKey === key)!;
        assert.equal(general.zones.length, 1);
        assert.equal(general.locations.length, 1);
        assert.equal(general.zones[0]?.displayName, "General");
        assert.equal(general.locations[0]?.displayName, "General");
        assert.equal(general.locations[0]?.zoneId, general.zones[0]?.id);
      }
      assert.equal(new Set(frozen.map((system) => system.locations[0]!.id)).size, 3);
    } finally { client.release(); }

    const response = await call("PUT", locationsPath, { zones: [{ key: "server-room", displayName: "Server Room", sortOrder: 1 }], locations: [{ key: "fm200-panel", displayName: "FM200 Panel", zoneId: "server-room", presetRowCount: 1 }] });
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const saved = await response.json() as { customer: { supportedSystems: Array<{ key: string; assignable: boolean }> }; locations: unknown[] };
    assert.equal(saved.customer.supportedSystems.find((item) => item.key === "fm200_fire_suppression")?.assignable, true);
    assert.equal(saved.locations.length, 1);

    const configuredClient = await database.connect();
    try {
      const visit = await createServiceVisit(configuredClient, { requestId: randomUUID(), customerId, siteId, systemKeys: ["fm200_fire_suppression"] }, userId);
      const frozen = (await configuredClient.query<{ configurationSnapshot: { enabledSystems: Array<{ systemKey: string; locations: Array<{ displayName: string }> }> } }>(
        'SELECT configuration_snapshot AS "configurationSnapshot" FROM inspection_jobs WHERE id=$1', [visit.id]
      )).rows[0]!.configurationSnapshot;
      const fm200 = frozen.enabledSystems.find((system) => system.systemKey === "fm200_fire_suppression");
      assert.equal(fm200?.locations.length, 1);
      assert.equal(fm200?.locations[0]?.displayName, "FM200 Panel");
    } finally { configuredClient.release(); }
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await database.end();
  }
});
