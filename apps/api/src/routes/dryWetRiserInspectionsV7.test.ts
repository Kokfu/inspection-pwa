import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import express from "express";
import { pool } from "../db/pool.js";
import { masterServiceReportV7 } from "../inspections/templates/masterServiceReportV7.js";
import { v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";
import { masterSystemInspectionsRouter } from "./masterSystemInspections.js";

const templateId = masterServiceReportV7.id;
const definition = masterServiceReportV7.systems.find((system) => system.key === "dry_wet_riser")!;
const contractSha256 = v7EvidenceContractSha256(definition);
const jobId = "11111111-1111-4111-8111-111111111131";
const clientUuid = "22222222-2222-4222-8222-222222222231";
const revisionId = "33333333-3333-4333-8333-333333333331";
const customerId = "44444444-4444-4444-8444-444444444431";
const formInstanceId = "55555555-5555-4555-8555-555555555531";
const locationId = "66666666-6666-4666-8666-666666666631";
const rowUuid = "77777777-7777-4777-8777-777777777731";
const actorId = 4242;

const checklistKeys = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions", "pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator", "battery_charger_failure_alarm", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"];

function v7Responses() {
  const checklist = Object.fromEntries(checklistKeys.map((key) => [key, { result: "good", remarks: "" }]));
  const psi = (values: Record<string, number | null>) => ({ values, unit: "PSI", result: "good", remarks: "" });
  return {
    schemaVersion: 2, mode: "dry", checklist,
    measurements: { jockey_psi: psi({ cut_in: 80, cut_out: 100 }), duty_psi: psi({ cut_in: 70 }), standby_psi: psi({ cut_in: 60 }) },
    riserOutlets: [{
      rowUuid, source: "configured", configuredLocationId: locationId, configuredRowOrdinal: 1,
      zoneSnapshot: null, locationSnapshot: { id: locationId, displayName: "Riser Outlet 1" },
      assetReference: "", locationText: "Riser Outlet 1",
      canvasHoseAt2Result: "good", diffuserNozzleResult: "good", landingValveResult: "good", crandleResult: "good", doorResult: "good",
      remarks: "", fieldRemarks: {}, sortOrder: 1
    }],
    comments: ""
  };
}

function v7Snapshot() {
  return {
    schemaVersion: 2, acceptedAt: "2026-09-05T00:00:00.000Z",
    job: { id: jobId, reference: "SV-20260905-2", title: "Primary Service Site" },
    customer: { id: customerId, code: "DWR", displayName: "Riser Customer" },
    configuration: { revisionId, revisionNumber: 1 },
    template: { id: templateId, code: "MFE-FSSR", version: 7 },
    system: { enabledSystemId: "e", key: "dry_wet_riser", systemKey: "dry_wet_riser", displayName: "Dry / Wet Riser System", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [{ id: locationId, zoneId: null, displayName: "Riser Outlet 1", presetRowCount: 1, rowPreset: {}, sortOrder: 1 }], definition, systemConfiguration: { riserMode: "dry" }, repetitionMode: "single_with_repeatable_rows" },
    instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null },
    contractSha256,
    evidenceManifest: []
  };
}

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Dry/Wet Riser V7 route test server address is unavailable");
  return `http://127.0.0.1:${address.port}`;
}

test("GET /dry-wet-riser-inspections/:clientUuid returns 200 (not 404) for a real accepted V7 record", async () => {
  const database = pool as unknown as { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }> };
  const originalQuery = database.query;
  database.query = async (sql, values = []) => {
    if (sql.includes("AND job.created_by_user_id = $2")) {
      assert.deepEqual(values, [clientUuid, actorId], "ownership uses the authenticated actor and requested form");
      return { rows: [{ id: jobId }], rowCount: 1 };
    }
    if (/inspection\.system_key\s*=\s*\$2/.test(sql)) {
      // acceptedDetailRow(): the generic, ownership-scoped V7 row lookup.
      if (values[0] !== clientUuid || values[1] !== "dry_wet_riser") return { rows: [], rowCount: 0 };
      return {
        rowCount: 1,
        rows: [{
          clientUuid, serverFormInstanceId: formInstanceId, jobId, jobReference: "SV-20260905-2", jobTitle: "Primary Service Site",
          customerName: "Riser Customer", systemKey: "dry_wet_riser", instanceKey: "primary", zoneId: null, locationId: null,
          displaySequence: 1, status: "submitted", performedAt: "2026-09-05T00:00:00.000000Z", receivedAt: "2026-09-05T00:00:00.000000Z",
          templateId, configurationRevisionId: revisionId, inspectionSnapshot: v7Snapshot(), responses: v7Responses(),
          deviceReportedCreatorUsername: null, verifiedOriginalCreatorUsername: null, syncedByUsername: "browser-tech"
        }]
      };
    }
    if (/inspection\.system_key\s*=\s*'dry_wet_riser'/.test(sql)) {
      // the route's own bespoke legacy-shaped query, which also carries snapshotSchemaVersion.
      if (values[0] !== clientUuid) return { rows: [], rowCount: 0 };
      return { rowCount: 1, rows: [{ snapshotSchemaVersion: 2 }] };
    }
    throw new Error(`unexpected query in Dry/Wet Riser V7 route test: ${sql}`);
  };

  const app = express();
  app.use((request, _response, next) => { request.currentUser = { id: actorId, username: "route-test", role: "inspector" }; next(); });
  app.use(masterSystemInspectionsRouter);
  const server = createServer(app);

  try {
    const origin = await listen(server);
    const response = await fetch(`${origin}/dry-wet-riser-inspections/${clientUuid}`);
    assert.equal(response.status, 200, "a real accepted V7 record must round-trip, not 404");
    const body = await response.json() as { inspection: Record<string, unknown> };
    assert.equal(body.inspection.clientUuid, clientUuid);
    assert.equal(body.inspection.systemKey, "dry_wet_riser");
    assert.equal(body.inspection.systemLabel, "Dry / Wet Riser System");
    assert.deepEqual(body.inspection.template, { id: templateId, code: "MFE-FSSR", version: 7 });
    assert.deepEqual(body.inspection.systemConfiguration, { riserMode: "dry" });
    assert.equal((body.inspection.responses as { schemaVersion: number }).schemaVersion, 2);
    assert.equal(body.inspection.customerId, customerId);
    assert.equal(body.inspection.customerCode, "DWR");
  } finally {
    database.query = originalQuery;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("GET /dry-wet-riser-inspections/:clientUuid still 404s when nothing is stored", async () => {
  const database = pool as unknown as { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }> };
  const originalQuery = database.query;
  database.query = async () => ({ rows: [], rowCount: 0 });

  const app = express();
  app.use((request, _response, next) => { request.currentUser = { id: actorId, username: "route-test", role: "inspector" }; next(); });
  app.use(masterSystemInspectionsRouter);
  const server = createServer(app);

  try {
    const origin = await listen(server);
    const response = await fetch(`${origin}/dry-wet-riser-inspections/${clientUuid}`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "JOB_NOT_FOUND" });
  } finally {
    database.query = originalQuery;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
