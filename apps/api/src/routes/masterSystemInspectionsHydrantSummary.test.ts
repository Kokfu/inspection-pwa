import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import express from "express";
import { pool } from "../db/pool.js";
import { masterSystemInspectionsRouter } from "./masterSystemInspections.js";

const jobId = "00000000-0000-4000-8000-000000000101";
const otherJobId = "00000000-0000-4000-8000-000000000102";
const hydrantUuid = "00000000-0000-4000-8000-000000000103";
const wetChemicalUuid = "00000000-0000-4000-8000-000000000106";
const wetChemicalLocationId = "00000000-0000-4000-8000-000000000107";

const summaries = [
  {
    clientUuid: wetChemicalUuid,
    jobId,
    systemKey: "wet_chemical",
    instanceKey: `location:${wetChemicalLocationId}`,
    status: "submitted",
    zoneId: null,
    locationId: wetChemicalLocationId,
    displaySequence: 2,
    performedAt: "2026-08-10T12:00:00.000000Z",
    deviceReportedCreatorUsername: null,
    verifiedOriginalCreatorUsername: null,
    syncedByUsername: "wet-chemical-inspector"
  },
  {
    clientUuid: hydrantUuid,
    jobId,
    systemKey: "hydrant",
    instanceKey: "primary",
    status: "submitted",
    zoneId: null,
    locationId: null,
    displaySequence: 1,
    performedAt: "2026-08-11T00:00:00.000000Z",
    deviceReportedCreatorUsername: null,
    verifiedOriginalCreatorUsername: null,
    syncedByUsername: "hydrant-inspector"
  },
  {
    clientUuid: "00000000-0000-4000-8000-000000000104",
    jobId,
    systemKey: "hose_reel",
    instanceKey: "primary",
    status: "submitted",
    zoneId: null,
    locationId: null,
    displaySequence: 1,
    performedAt: "2026-08-10T00:00:00.000000Z",
    deviceReportedCreatorUsername: null,
    verifiedOriginalCreatorUsername: null,
    syncedByUsername: "hose-reel-inspector"
  },
  {
    clientUuid: "00000000-0000-4000-8000-000000000105",
    jobId: otherJobId,
    systemKey: "hydrant",
    instanceKey: "primary",
    status: "submitted",
    zoneId: null,
    locationId: null,
    displaySequence: 1,
    performedAt: "2026-08-09T00:00:00.000000Z",
    deviceReportedCreatorUsername: null,
    verifiedOriginalCreatorUsername: null,
    syncedByUsername: "other-inspector"
  }
];

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Hydrant summary test server address is unavailable");
  return `http://127.0.0.1:${address.port}`;
}

test("real master-system summary route supports the authoritative Hydrant filter", async () => {
  const database = pool as unknown as {
    query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
  };
  const originalQuery = database.query;
  let queryCount = 0;
  database.query = async (sql, values = []) => {
    queryCount += 1;
    if (sql.includes("AND job.created_by_user_id = $2")) {
      assert.deepEqual(values, [jobId, 42]);
      return { rows: [{ id: jobId }], rowCount: 1 };
    }
    assert.equal(values[0], 42, "summaries bind authenticated ownership first");
    assert.match(sql, /job\.created_by_user_id = \$1/);
    assert.match(sql, /job\.id = \$2/);
    assert.match(sql, /inspection\.system_key = \$3/);
    const rows = summaries.filter((summary) => summary.jobId === values[1] && summary.systemKey === values[2]
      && (values[3] === undefined || summary.locationId === values[3]));
    return { rows, rowCount: rows.length };
  };

  const app = express();
  app.use((request, _response, next) => {
    request.currentUser = { id: 42, username: "route-test", role: "inspector" };
    next();
  });
  app.use(masterSystemInspectionsRouter);
  const server = createServer(app);

  try {
    const origin = await listen(server);
    const acceptedResponse = await fetch(`${origin}/master-system-inspections?jobId=${jobId}&systemKey=hydrant`);
    assert.equal(acceptedResponse.status, 200);
    const accepted = await acceptedResponse.json() as { inspections: Array<{ clientUuid: string; jobId: string; systemKey: string }> };
    assert.deepEqual(accepted.inspections, [summaries[1]]);
    assert.equal(accepted.inspections[0]?.clientUuid, hydrantUuid);
    assert.equal(accepted.inspections.some((summary) => summary.systemKey !== "hydrant" || summary.jobId !== jobId), false);

    const wetChemicalResponse = await fetch(`${origin}/master-system-inspections?jobId=${jobId}&systemKey=wet_chemical&locationId=${wetChemicalLocationId}`);
    assert.equal(wetChemicalResponse.status, 200);
    const wetChemical = await wetChemicalResponse.json() as { inspections: Array<{ clientUuid: string; locationId: string }> };
    assert.deepEqual(wetChemical.inspections, [summaries[0]]);
    assert.equal(wetChemical.inspections[0]?.clientUuid, wetChemicalUuid);

    const beforeInvalid = queryCount;
    const invalidResponse = await fetch(`${origin}/master-system-inspections?jobId=${jobId}&systemKey=not_a_real_system`);
    assert.equal(invalidResponse.status, 400);
    assert.deepEqual(await invalidResponse.json(), { error: "INVALID_INSPECTION_FILTER" });
    assert.equal(queryCount, beforeInvalid);
  } finally {
    database.query = originalQuery;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
