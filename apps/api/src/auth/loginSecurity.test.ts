import assert from "node:assert/strict";
import test from "node:test";
import { sessionCookie } from "../middleware/currentUser.js";
import { loginPeer, reserveLogin, loginCleanupIntervalMs } from "./loginLimiter.js";
import { performance } from "node:perf_hooks";
import type { Pool } from "pg";
import type { Request } from "express";
import { requestSecurity } from "../middleware/requestSecurity.js";

test("HTTPS write origin policy includes scheme, port and Fetch Metadata without proxy trust", () => {
  for (const [origin, site, accepted] of [
    ["https://inspection.invalid", undefined, true],
    ["http://inspection.invalid", undefined, false],
    ["http://inspection.invalid", "same-origin", false],
    ["https://inspection.invalid:8443", undefined, false],
    ["https://sibling.invalid", undefined, false],
    ["https://inspection.invalid", "same-site", false],
    ["https://inspection.invalid", "cross-site", false],
    ["null", undefined, false],
    ["https://inspection.invalid/", undefined, false],
    [undefined, undefined, true]
  ] as const) {
    const headers: Record<string, string | undefined> = { host: "inspection.invalid", origin, "sec-fetch-site": site, "x-forwarded-proto": "http" };
    let nextCalled = false, status = 200;
    const request = { method: "POST", header: (name: string) => headers[name] };
    const response = { setHeader() {}, status(value: number) { status = value; return this; }, json(value: unknown) { assert.deepEqual(value, { error: "CROSS_ORIGIN_WRITE_DENIED" }); } };
    requestSecurity(request as Request, response as unknown as import("express").Response, () => { nextCalled = true; });
    assert.equal(nextCalled, accepted, `${origin}, ${site}`);
    assert.equal(status, accepted ? 200 : 403);
  }
});

test("session cookies fail closed on malformed or ambiguous values and ignore unrelated cookies", () => {
  const token = "A".repeat(43);
  assert.equal(sessionCookie(undefined, "inspection_session"), undefined);
  for (const value of ["%ZZ", "%E0%A4%A", "", "fake", `${token}; inspection_session=${token}`, `${token}; inspection_session=%ZZ`]) {
    assert.equal(sessionCookie(`inspection_session=${value}`, "inspection_session"), undefined);
  }
  assert.equal(sessionCookie(`broken=%ZZ; inspection_session=${token}`, "inspection_session"), token);
  assert.equal(sessionCookie(`inspection_session=${token}; broken=%E0%A4%A`, "inspection_session"), token);
});
test("forwarding and identity headers never override the socket peer", () => {
  const request = { socket: { remoteAddress: "::ffff:127.0.0.1" }, headers: { "x-forwarded-for": "1.2.3.4", "cf-connecting-ip": "2.3.4.5" } } as unknown as Request;
  assert.equal(loginPeer(request), "127.0.0.1");
});

test("denied budgets commit cleanup but do not repeat historical DELETE within its cadence", async t => {
  let tick = 1_000;
  t.mock.method(performance, "now", () => tick);
  const queries: string[] = [];
  const client = {
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
      if (sql.startsWith("SELECT entity_id")) return { rows: Array.from({ length: 300 }, () => ({ entity_id: "other", reason: "other", result: "failure", age: 1 })) };
      return { rows: [] };
    },
    release() {}
  };
  const database = { connect: async () => client } as unknown as Pool;
  assert.equal(await reserveLogin(database, "target", "peer"), 59);
  tick++;
  assert.equal(await reserveLogin(database, "target", "peer"), 59);
  assert.equal(queries.filter(sql => sql.startsWith("DELETE FROM audit_events")).length, 1);
  assert.equal(queries.filter(sql => sql === "COMMIT").length, 2);
  assert.equal(queries.includes("ROLLBACK"), false);
  tick += loginCleanupIntervalMs;
  assert.equal(await reserveLogin(database, "target", "peer"), 59);
  assert.equal(queries.filter(sql => sql.startsWith("DELETE FROM audit_events")).length, 2);
});

test("failed reservation rolls back and schedules cleanup again instead of retaining an uncommitted cadence", async t => {
  let tick = 1_000, failInsert = true;
  t.mock.method(performance, "now", () => tick);
  const queries: string[] = [];
  const client = {
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
      if (sql.startsWith("INSERT INTO audit_events")) {
        if (failInsert) throw new Error("disposable reservation failure");
        return { rows: [{ id: "1" }] };
      }
      return { rows: [] };
    },
    release() {}
  };
  const database = { connect: async () => client } as unknown as Pool;
  await assert.rejects(reserveLogin(database, "target", "peer"), /disposable reservation failure/);
  assert(queries.includes("ROLLBACK"));
  failInsert = false; tick++;
  const lease = await reserveLogin(database, "target", "peer");
  assert.notEqual(typeof lease, "number");
  if (typeof lease !== "number") await lease.release();
  assert.equal(queries.filter(sql => sql.startsWith("DELETE FROM audit_events")).length, 2);
});
