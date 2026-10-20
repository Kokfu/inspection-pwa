import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { createManagerCustomersRouter, ManagerCustomerError } from "./managerCustomers.js";

test("site lifecycle routes reject malformed bodies and identities before opening a transaction", async () => {
  let connected = false;
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.currentUser = { id: 1, username: "admin", role: "admin" }; next(); });
  app.use(createManagerCustomersRouter({ connect() { connected = true; throw Error("unexpected DB access"); } } as never));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error instanceof SyntaxError ? 400 : error instanceof ManagerCustomerError ? error.status : 500).json({ error: error instanceof ManagerCustomerError ? error.code : "INTERNAL_SERVER_ERROR" });
  });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const { port } = server.address() as { port: number };
  try {
    for (const action of ["archive", "restore"]) {
      for (const [customer, site, body] of [
        ["bad", "71000000-0000-4000-8000-000000000002", {}],
        ["71000000-0000-4000-8000-000000000001", "bad", {}],
        ...[null, [], "archive", { is_active: false }, { requestId: "x" }].map(body => ["71000000-0000-4000-8000-000000000001", "71000000-0000-4000-8000-000000000002", body])
      ]) {
        const res = await fetch(`http://127.0.0.1:${port}/manager/customers/${customer}/sites/${site}/${action}`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
        });
        assert.equal(res.status, 400);
      }
    }
    assert.equal(connected, false);
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});
