import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import express from "express";
import { pool } from "../db/pool.js";
import { masterServiceReportV7 } from "../inspections/templates/masterServiceReportV7.js";
import { v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";
import { masterSystemInspectionsRouter } from "./masterSystemInspections.js";

const templateId = masterServiceReportV7.id;
const definition = masterServiceReportV7.systems.find((system) => system.key === "automatic_sprinkler")!;
const contractSha256 = v7EvidenceContractSha256(definition);
const jobId = "11111111-1111-4111-8111-111111111151";
const clientUuid = "22222222-2222-4222-8222-222222222251";
const revisionId = "33333333-3333-4333-8333-333333333351";
const customerId = "44444444-4444-4444-8444-444444444451";
const formInstanceId = "55555555-5555-4555-8555-555555555551";
const actorId = 5151;
const overridePath = "checklist.testRunFirePump.trfp_jockey_pump";
const overrideLabel = "Jockey Pump (30 min run)";

const checklistKeys = [
  "saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions",
  "pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator",
  "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions",
  "breaching_inlet", "alarm_gong", "flow_meter_valve_positions",
  "trfp_jockey_pump", "trfp_duty_pump", "trfp_standby_pump"
];

/** A clean, zero-finding accepted V7 payload: its frozen manifest is empty. */
function v7Responses() {
  const psi = (values: Record<string, number | null>) => ({ values, unit: "PSI", result: "good", remarks: "" });
  return {
    schemaVersion: 2,
    checklist: Object.fromEntries(checklistKeys.map((key) => [key, { result: "good", remarks: "" }])),
    measurements: {
      jockey_pump_pressure: psi({ cut_in: 80, cut_out: 90 }),
      duty_pump_cut_in: psi({ value: 80 }),
      standby_pump_cut_in: psi({ value: 80 }),
      water_supply_gauge: psi({ value: 80 }),
      installation_gauge: psi({ value: 80 })
    },
    comments: ""
  };
}

function v7Snapshot() {
  return {
    schemaVersion: 2,
    acceptedAt: "2026-09-05T00:00:00.000Z",
    job: { id: jobId, reference: "SV-20260905-9", title: "Primary Service Site" },
    customer: { id: customerId, code: "ASP", displayName: "Sprinkler Customer" },
    configuration: { revisionId, revisionNumber: 2 },
    template: { id: templateId, code: "MFE-FSSR", version: 7 },
    system: {
      key: "automatic_sprinkler", systemKey: "automatic_sprinkler", displayName: "Automatic Sprinkler System",
      definitionStatus: "confirmed", repetitionMode: "single", definition
    },
    contractSha256,
    instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null },
    evidenceManifest: []
  };
}

function acceptedRow() {
  return {
    clientUuid, serverFormInstanceId: formInstanceId, jobId, jobReference: "SV-20260905-9",
    jobTitle: "Primary Service Site", customerName: "Sprinkler Customer", systemKey: "automatic_sprinkler",
    instanceKey: "primary", zoneId: null, locationId: null, displaySequence: 1, status: "submitted",
    performedAt: "2026-09-05T00:00:00.000000Z", receivedAt: "2026-09-05T00:00:01.000000Z",
    templateId, configurationRevisionId: revisionId, inspectionSnapshot: v7Snapshot(), responses: v7Responses(),
    deviceReportedCreatorUsername: null, verifiedOriginalCreatorUsername: null, syncedByUsername: "browser-tech"
  };
}

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Automatic Sprinkler V7 route test server address is unavailable");
  return `http://127.0.0.1:${address.port}`;
}

type Stub = { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }> };

/** Drive GET /master-system-inspections/:clientUuid with a stubbed database whose
 *  frozen `configuration_snapshot` label map is `labelOverrides`. */
async function detailFor(labelOverrides: unknown | (() => never)) {
  const database = pool as unknown as Stub;
  const originalQuery = database.query;
  database.query = async (sql, values = []) => {
    if (sql.includes("AND job.created_by_user_id = $2")) {
      assert.deepEqual(values, [clientUuid, actorId], "ownership uses the authenticated actor and requested form");
      return { rows: [{ id: jobId }], rowCount: 1 };
    }
    if (/configured\.system->'labelOverrides'/.test(sql)) {
      if (typeof labelOverrides === "function") (labelOverrides as () => never)();
      assert.deepEqual(values, [jobId, "automatic_sprinkler"], "the frozen map is read for THIS job only");
      return { rowCount: 1, rows: [{ labelOverrides }] };
    }
    if (/inspection\.system_key\s*=\s*\$2/.test(sql)) {
      if (values[0] !== clientUuid || values[1] !== "automatic_sprinkler") return { rows: [], rowCount: 0 };
      return { rowCount: 1, rows: [acceptedRow()] };
    }
    if (/snapshot_schema_version AS "snapshotSchemaVersion"/.test(sql)) {
      if (values[0] !== clientUuid) return { rows: [], rowCount: 0 };
      return { rowCount: 1, rows: [{ systemKey: "automatic_sprinkler", snapshotSchemaVersion: 2, jobId }] };
    }
    throw new Error(`unexpected query in Automatic Sprinkler V7 route test: ${sql}`);
  };

  const app = express();
  app.use((request, _response, next) => { request.currentUser = { id: actorId, username: "route-test", role: "inspector" }; next(); });
  app.use(masterSystemInspectionsRouter);
  app.use((_error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  });
  const server = createServer(app);
  try {
    const origin = await listen(server);
    const response = await fetch(`${origin}/master-system-inspections/${clientUuid}`);
    return { status: response.status, body: await response.json() as { inspection?: Record<string, unknown>; error?: string } };
  } finally {
    database.query = originalQuery;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("a V7 Automatic Sprinkler job with NO frozen overrides keeps its exact historical wire shape", async () => {
  // The wire-compatibility guarantee: every accepted record that existed before
  // this feature must keep its exact previous shape, so an app shell cached
  // before the deploy (which accepts only `displayControls: null` and no extra
  // key) still parses it.
  for (const empty of [null, undefined, {}]) {
    const { status, body } = await detailFor(empty);
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.inspection!.displayControls, null, `frozen map ${JSON.stringify(empty)} must stay null`);
    assert.ok(!("displayLabelOverrides" in body.inspection!), "no override key is emitted for an unconfigured job");
    assert.equal(body.inspection!.systemKey, "automatic_sprinkler");
    assert.equal((body.inspection!.responses as { schemaVersion: number }).schemaVersion, 2);
  }
});

test("a V7 Automatic Sprinkler job WITH a frozen override forwards the map verbatim, and no controls tree", async () => {
  const { status, body } = await detailFor({ [overridePath]: overrideLabel });
  assert.equal(status, 200, JSON.stringify(body));
  // No re-derived tree: shipping one would reword every other caption in the view.
  assert.equal(body.inspection!.displayControls, null);
  assert.deepEqual(body.inspection!.displayLabelOverrides, { [overridePath]: overrideLabel });
  // Exactly the one renamed path travels - nothing else is enumerated.
  assert.deepEqual(Object.keys(body.inspection!.displayLabelOverrides as object), [overridePath]);
  // The frozen response payload is untouched by the display substitution.
  assert.deepEqual(
    Object.keys((body.inspection!.responses as { checklist: Record<string, unknown> }).checklist).sort(),
    [...checklistKeys].sort()
  );
});

test("a database failure reading the frozen override map surfaces, it is not silently downgraded", async () => {
  const { status, body } = await detailFor(() => { throw new Error("connection terminated unexpectedly"); });
  assert.equal(status, 500, "a transient DB error must reach the error handler");
  assert.equal(body.error, "INTERNAL_SERVER_ERROR");
  assert.equal(body.inspection, undefined, "no partial inspection is emitted on a DB failure");
});
