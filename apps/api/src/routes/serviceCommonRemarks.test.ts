import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import { createServiceCommonRemarksRouter } from "./serviceCommonRemarks.js";

const id = "a1000000-0000-4000-8000-000000000001";
async function close(server: Server) { await new Promise<void>((resolve) => server.close(() => resolve())); }

test("common remarks require authority, validate writes, and confirm the exact idempotent UUID", async () => {
  let touched = 0;
  let stored: Record<string, unknown> | undefined;
  const client = {
    async query(sql: string, parameters?: unknown[]) {
      touched++;
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK" || sql.includes("INSERT INTO audit_events")) return { rows: [] };
      if (sql.includes("SELECT") && sql.includes("FOR UPDATE")) return { rows: stored ? [stored] : [] };
      if (sql.includes("INSERT INTO service_common_remarks")) {
        stored = { id: parameters?.[0], systemKey: parameters?.[1], wording: parameters?.[2], detailLabel: parameters?.[3], detailOptions: JSON.parse(String(parameters?.[4])), active: true, createFingerprint: parameters?.[6] };
        return { rows: [stored] };
      }
      if (sql.includes("UPDATE service_common_remarks SET wording")) {
        if (!stored?.active) return { rows: [] };
        stored = { ...stored, wording: parameters?.[1], detailLabel: parameters?.[2], detailOptions: JSON.parse(String(parameters?.[3])) };
        return { rows: [stored] };
      }
      if (sql.includes("UPDATE service_common_remarks SET active=false")) {
        if (!stored?.active) return { rows: [] };
        stored = { ...stored, active: false };
        return { rows: [{ id }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {}
  };
  const database = { query: async () => ({ rows: stored ? [stored] : [] }), connect: async () => client };
  const app = express(); app.use(express.json());
  app.use((request, _response, next) => { const role = request.header("x-role"); if (role === "admin" || role === "inspector") request.currentUser = { id: 4, username: role, role }; next(); });
  app.use(createServiceCommonRemarksRouter(database as never));
  app.use((error: { code?: string; status?: number }, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(error.status ?? 500).json({ error: error.code ?? "INTERNAL" }));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const request = (method: string, role: string, body?: unknown, expected = "4") => fetch(`http://127.0.0.1:${port}/service-common-remarks${method === "PUT" || method === "DELETE" ? `/${id}` : ""}`, { method, headers: { "Content-Type": "application/json", "x-role": role, "x-expected-user-id": expected }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    const input = { id, systemKey: "fm200_fire_suppression", wording: "Detector needs repair", detailLabel: null, detailOptions: [] };
    assert.equal((await request("POST", "", input)).status, 401);
    assert.equal((await request("POST", "inspector", { ...input, systemKey: "unknown" })).status, 400);
    assert.equal((await request("POST", "inspector", { ...input, extra: true })).status, 400);
    assert.equal(touched, 0);
    assert.equal((await request("POST", "inspector", input)).status, 201);
    const replay = await request("POST", "inspector", input); assert.equal(replay.status, 200);
    assert.equal((await replay.json() as { remark: { id: string } }).remark.id, id);
    assert.equal((await request("POST", "inspector", { ...input, wording: "Different wording" })).status, 409);
    assert.equal((await request("PUT", "inspector", { wording: "Changed", detailLabel: null, detailOptions: [] })).status, 403);
    assert.equal((await request("DELETE", "inspector")).status, 403);
    assert.equal((await request("PUT", "admin", { wording: "Changed", detailLabel: "Size", detailOptions: ["12V x 12AH"] })).status, 200);
    assert.equal((await request("POST", "inspector", input)).status, 200, "a retry confirms the original UUID after a manager edit");
    assert.equal((await request("DELETE", "admin")).status, 200);
    assert.equal((await request("POST", "inspector", input)).status, 200, "a retry confirms the original UUID after removal");
  } finally { await close(server); }
});
