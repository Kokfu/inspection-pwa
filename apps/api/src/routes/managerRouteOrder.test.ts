import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";
import express from "express";
import { createManagerComplianceRemindersRouter } from "./managerComplianceReminders.js";
import { createManagerCustomersRouter } from "./managerCustomers.js";

// I-22: `GET /manager/customers/:customerId` (customers router) swallowed
// `GET /manager/customers/compliance-reminders` (a separate router) whenever the customers router was mounted first.

const database = { query: async () => ({ rows: [], rowCount: 0 }) } as never;

async function status(order: "reminders-first" | "customers-first") {
  const app = express();
  app.use((request, _response, next) => { request.currentUser = { id: 1, username: "admin", role: "admin" }; next(); });
  const reminders = createManagerComplianceRemindersRouter(database);
  const customers = createManagerCustomersRouter(database);
  if (order === "reminders-first") { app.use(reminders); app.use(customers); } else { app.use(customers); app.use(reminders); }
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${port}/manager/customers/compliance-reminders`);
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("compliance-reminders is served when its router is mounted before the customers router", async () => {
  const result = await status("reminders-first");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { overdue: [], dueSoon: [], dueSoonWindowDays: 7 });
});

test("harness sensitivity: the reversed order reproduces the 400 INVALID_CUSTOMER_ID", async () => {
  const result = await status("customers-first");
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "INVALID_CUSTOMER_ID");
});

test("server.ts mounts the compliance-reminders router before the customers router", () => {
  const source = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  const reminders = source.indexOf("app.use(managerComplianceRemindersRouter)");
  const customers = source.indexOf("app.use(managerCustomersRouter)");
  assert.ok(reminders >= 0 && customers >= 0, "both routers are mounted in server.ts");
  assert.ok(reminders < customers, "managerComplianceRemindersRouter must be mounted before managerCustomersRouter (parameter route shadowing)");
});
