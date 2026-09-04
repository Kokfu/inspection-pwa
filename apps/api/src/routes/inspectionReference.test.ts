import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import { createInspectionReferenceRouter } from "./inspectionReference.js";

const customerId = "74000000-0000-4000-8000-000000000001";
const configurationId = "74000000-0000-4000-8000-000000000002";

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function loadConfiguration(enabledSystems: unknown[]) {
  const database = {
    async query(sql: string) {
      if (sql.includes("FROM customers")) return { rows: [{ id: customerId, code: "RISER", displayName: "Riser Customer", isDemo: false }] };
      if (sql.includes("FROM customer_configuration_revisions")) return { rows: [{ configurationId, revision: 1, templateId: "74000000-0000-4000-8000-000000000003", templateCode: "MFE-FSSR", templateName: "MFE Fire System Service Report Template", templateVersion: 2, selectionPolicy: "preset_only" }] };
      if (sql.includes("FROM customer_enabled_systems")) return { rows: enabledSystems };
      if (sql.includes("FROM customer_system_zones") || sql.includes("FROM customer_system_locations")) return { rows: [] };
      throw new Error(`Unexpected query ${sql}`);
    }
  };
  const app = express();
  app.use((request, _response, next) => { request.currentUser = { id: 1, username: "admin", role: "admin" }; next(); });
  app.use(createInspectionReferenceRouter(database as never));
  app.use((_error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(500).json({ error: "INTERNAL_SERVER_ERROR" }));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address() as { port: number };
  try {
    return await fetch(`http://127.0.0.1:${address.port}/customers/${customerId}/configuration`);
  } finally { await close(server); }
}

test("technician configuration preserves a valid Dry/Wet Riser configuration", async () => {
  const response = await loadConfiguration([{
    id: "74000000-0000-4000-8000-000000000004", key: "dry_wet_riser", displayName: "Dry / Wet Riser System", sortOrder: 1,
    definitionStatus: "confirmed", evidencePolicy: null, systemConfiguration: { riserMode: "wet" }
  }]);
  assert.equal(response.status, 200);
  const body = await response.json() as { configuration: { enabledSystems: Array<{ key: string; systemConfiguration?: unknown }> } };
  assert.deepEqual(body.configuration.enabledSystems, [{
    id: "74000000-0000-4000-8000-000000000004", key: "dry_wet_riser", displayName: "Dry / Wet Riser System", sortOrder: 1,
    definitionStatus: "confirmed", systemConfiguration: { riserMode: "wet" }, zones: [], locations: []
  }]);
});

test("a malformed legacy Dry/Wet Riser row does not hide the customer's other systems", async () => {
  const response = await loadConfiguration([
    { id: "74000000-0000-4000-8000-000000000004", key: "dry_wet_riser", displayName: "Dry / Wet Riser System", sortOrder: 1, definitionStatus: "confirmed", evidencePolicy: null, systemConfiguration: {} },
    { id: "74000000-0000-4000-8000-000000000005", key: "hose_reel", displayName: "Hose Reel", sortOrder: 2, definitionStatus: "confirmed", evidencePolicy: null, systemConfiguration: {} },
    { id: "74000000-0000-4000-8000-000000000006", key: "automatic_sprinkler", displayName: "Automatic Sprinkler", sortOrder: 3, definitionStatus: "confirmed", evidencePolicy: null, systemConfiguration: {} }
  ]);
  assert.equal(response.status, 200);
  const body = await response.json() as { configuration: { enabledSystems: Array<{ key: string }> } };
  assert.deepEqual(body.configuration.enabledSystems.map((system) => system.key), ["hose_reel", "automatic_sprinkler"]);
});
