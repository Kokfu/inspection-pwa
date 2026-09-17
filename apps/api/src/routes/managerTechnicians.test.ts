import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import { createManagerTechniciansRouter, ManagerTechnicianError } from "./managerTechnicians.js";

async function harness(database: unknown, run: (request: (path: string, method?: string, body?: unknown, role?: string) => Promise<Response>) => Promise<void>) {
  const app = express(); app.use(express.json());
  app.use((request, _response, next) => { const role = request.headers["x-role"]; if (role === "admin" || role === "inspector") request.currentUser = { id: 1, username: role, role }; next(); });
  app.use(createManagerTechniciansRouter(database as never));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(error instanceof SyntaxError ? 400 : error instanceof ManagerTechnicianError ? error.status : 500).json({ error: error instanceof ManagerTechnicianError ? error.code : "INTERNAL_SERVER_ERROR" });
  });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const { port } = server.address() as { port: number };
  try { await run((path, method = "GET", body, role = "admin") => fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { "x-role": role, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })); }
  finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

test("all technician routes reject missing/inspector authority and invalid inputs before DB access", async () => {
  let touched = false;
  await harness({ query() { touched = true; throw Error(); }, connect() { touched = true; throw Error(); } }, async (request) => {
    for (const role of ["", "inspector"]) for (const [path, method] of [["/manager/technicians", "GET"], ["/manager/technicians", "POST"], ["/manager/technicians/2/deactivate", "POST"]]) {
      assert.equal((await request(path!, method, method === "GET" ? undefined : {}, role)).status, role ? 403 : 401);
    }
    for (const body of [null, [], {}, { username: "x", password: "short" }, { username: " ", password: "valid-password" }, { username: "x", password: "valid-password", role: "admin" }]) {
      assert.equal((await request("/manager/technicians", "POST", body)).status, 400);
    }
    for (const id of ["uuid", "0", "-1", "1.5", "999999999999999999999"]) assert.equal((await request(`/manager/technicians/${id}/deactivate`, "POST")).status, 400);
    assert.equal((await request("/manager/technicians/2/deactivate", "POST", { isActive: true })).status, 400);
    assert.equal(touched, false);
  });
});

test("technician transaction conflict, missing row and audit failure roll back and release", async () => {
  for (const scenario of ["duplicate", "race", "missing", "audit"]) {
    const queries: string[] = []; let released = false;
    const client = { async query(sql: string) {
      queries.push(sql);
      if (sql.includes("SELECT id FROM users")) return { rows: scenario === "duplicate" ? [{ id: 2 }] : [] };
      if (sql.includes("INSERT INTO users")) return { rows: scenario === "race" ? [] : [{ id: 2, username: "tech", isActive: true, createdAt: new Date() }] };
      if (sql.includes("INSERT INTO audit_events")) throw Error("audit unavailable");
      return { rows: [] };
    }, release() { released = true; } };
    await harness({ connect: async () => client }, async (request) => {
      const result = scenario === "missing" ? await request("/manager/technicians/2/deactivate", "POST") : await request("/manager/technicians", "POST", { username: "tech", password: "valid-password" });
      assert.equal(result.status, scenario === "missing" ? 404 : scenario === "audit" ? 500 : 409);
      assert.ok(queries.includes("ROLLBACK")); assert.ok(!queries.includes("COMMIT")); assert.equal(released, true);
    });
  }
});
