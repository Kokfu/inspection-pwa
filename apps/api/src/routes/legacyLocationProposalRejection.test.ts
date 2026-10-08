import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import type { Pool } from "pg";
import { createLocationProposalsRouter } from "./locationProposals.js";
import { parseLocationProposalPatch } from "../inspections/locationConfiguration.js";

test("existing rejection route preserves an unreadable legacy payload and records an admin decision", async () => {
  const proposalId = "678f1e17-34b2-42f5-9674-2bd8d0392524";
  const payload = { zones: [{ key: "old-zone", displayName: "1", sortOrder: 1 }], locations: [] };
  assert.equal(parseLocationProposalPatch(payload, "fm200_fire_suppression"), undefined);
  const proposal = { id: proposalId, customerId: "customer", customerDisplayName: "Legacy fixture", systemKey: "fm200_fire_suppression", jobId: "job", submittedByUserId: 2, submittedBy: "tech", submittedByRole: "inspector", submittedAt: "2026-09-28T18:10:05.637Z", payload };
  const decisions: Record<string, unknown>[] = []; const audits: unknown[][] = [];
  const query = async (sql: string, args: unknown[] = []) => {
    if (sql.includes("FROM customer_location_proposals proposal")) return { rows: [structuredClone(proposal)] };
    if (sql.includes("FROM customer_location_proposal_decisions decision")) return { rows: structuredClone(decisions) };
    if (sql.includes("INSERT INTO customer_location_proposal_decisions")) {
      decisions.push({ id: args[0], decision: args[2], note: args[3], decidedBy: "admin-fixture", decidedByRole: args[5], sequence: args[6], resultingRevisionId: args[7], requestId: args[8], requestFingerprint: args[9], decidedAt: "2026-10-08T12:00:00.000Z" });
    } else if (sql.includes("INSERT INTO audit_events")) audits.push(args);
    else assert.ok(/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql) || sql.includes("pg_advisory_xact_lock"), `Unexpected SQL: ${sql}`);
    return { rows: [] };
  };
  const database = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.currentUser = { id: 1, username: "admin-fixture", role: "admin" }; next(); });
  app.use(createLocationProposalsRouter(database));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const port = (server.address() as { port: number }).port;
    const decide = (body: unknown) => fetch(`http://127.0.0.1:${port}/manager/location-proposals/${proposalId}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const requestId = "00000000-0000-4000-8000-000000000123";
    const body = { requestId, decision: "rejected", note: "Reviewed demo debris; preserve original submission." };
    assert.equal((await decide({ requestId, decision: "rejected" })).status, 400);
    assert.equal(decisions.length, 0);
    const response = await decide(body);
    assert.equal(response.status, 201);
    const result = (await response.json()).proposal;
    assert.deepEqual(result.payload, payload);
    assert.equal(result.status, "rejected");
    assert.equal(result.decision.decidedByRole, "admin");
    assert.equal(result.decision.resultingRevisionId, null);
    assert.equal(decisions.length, 1); assert.equal(audits.length, 1);
    assert.equal((await decide(body)).status, 200); assert.equal(decisions.length, 1);
    assert.equal((await decide({ ...body, requestId: "00000000-0000-4000-8000-000000000124" })).status, 409);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
