import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import express from "express";
import pg from "pg";
import { createCustomerVisitSummariesRouter } from "./customerVisitSummaries.js";
import { listVisitSummaries, parseVisitSummaryFilters } from "../visits/visitSummaries.js";

const customer = "10000000-0000-4000-8000-000000000001";
const site = "20000000-0000-4000-8000-000000000001";
const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = `/customers/${customer}/visit-summaries`;

test("query validation refuses unknown keys, repeated values, bad identities, dates and cursors", () => {
  for (const query of [
    { detail: "true" }, { kind: "invalid" }, { kind: ["service", "repair"] }, { status: "completed" },
    { dateFrom: "2026-02-30" }, { dateTo: "2026-10-01T00:00:00Z" }, { dateFrom: "2026-10-02", dateTo: "2026-10-01" },
    { siteId: "no" }, { limit: "0" }, { limit: "101" }, { limit: "1.5" }, { cursor: "bad" },
    { cursor: Buffer.from(JSON.stringify({ date: "2026-10-21", id: id(1), kind: "service", extra: 1 })).toString("base64url") }
  ]) assert.throws(() => parseVisitSummaryFilters(customer, query), /INVALID_VISIT_SUMMARY_QUERY/);
  assert.throws(() => parseVisitSummaryFilters("bad", {}));
  assert.equal(parseVisitSummaryFilters(customer, {}).limit, 50);
});

test("wire projection strips details and fails closed on malformed database rows", async () => {
  const row = { id: id(1), kind: "service", date: "2026-10-21", status: "open", siteId: site,
    siteName: "Site", technicianId: 1, technicianName: "Tech", ownedByCaller: true, answers: { secret: true } };
  const db = { query: async (sql: string) => ({ rows: sql.includes("WITH visits") ? [row] : [{ id: customer }] }) };
  const actor = { id: 1, role: "inspector" as const, username: "tech" };
  const result = await listVisitSummaries(db as never, actor, customer, { limit: 50 });
  assert.equal(Object.hasOwn(result.visits[0]!, "answers"), false);
  row.status = "unknown";
  await assert.rejects(listVisitSummaries(db as never, actor, customer, { limit: 50 }), /INVALID_VISIT_SUMMARY_DATA/);
});

test("HTTP and PostgreSQL summary contract", async t => {
  // Explicit opt-in only; never DATABASE_URL. TEMP fixtures exercise the production SQL without modifying real tables.
  const connectionString = process.env.VISIT_SUMMARIES_TEST_DATABASE_URL;
  assert.ok(connectionString, "Set VISIT_SUMMARIES_TEST_DATABASE_URL to a fresh disposable database on 127.0.0.1:55432");
  const url = new URL(connectionString);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432");
  assert.ok(url.pathname.startsWith("/visit_summaries_test"));
  const db = new pg.Client({ connectionString });
  await db.connect();
  const app = express();
  app.use((req, _res, next) => {
    const role = req.header("x-test-role");
    if (role === "admin" || role === "inspector" || role === "supervisor") req.currentUser = { id: 1, username: "tech", role };
    next();
  });
  app.use(createCustomerVisitSummariesRouter(db as never));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const get = (path = base, role?: string, headers: Record<string, string> = {}) => fetch(`http://127.0.0.1:${address.port}${path}`,
    { headers: { ...(role ? { "x-test-role": role } : {}), ...headers } });
  try {
    await db.query(`
      CREATE TEMP TABLE customers(id uuid PRIMARY KEY,is_active boolean,is_demo boolean);
      CREATE TEMP TABLE users(id bigint PRIMARY KEY,username text,display_name text);
      CREATE TEMP TABLE customer_sites(id uuid PRIMARY KEY,display_name text);
      CREATE TEMP TABLE inspection_jobs(id uuid PRIMARY KEY,customer_id uuid,master_template_version_id uuid,
        service_date date,created_at timestamptz,status text,site_id uuid,created_by_user_id bigint,
        is_sample boolean DEFAULT false,technician_visible boolean DEFAULT true,archived_at timestamptz,
        configuration_snapshot jsonb DEFAULT '{"secret":"must not leave server"}');
      CREATE TEMP TABLE repair_visits(client_uuid uuid PRIMARY KEY,customer_id uuid,visit_date date,
        status text,site_id uuid,created_by_user_id bigint,final_pdf bytea DEFAULT '\\x1234');
    `);
    await db.query("INSERT INTO customers VALUES ($1,true,false)", [customer]);
    await db.query("INSERT INTO users VALUES (1,'tech','Caller'),(2,'other','Other technician')");
    await db.query("INSERT INTO customer_sites VALUES ($1,'Live site')", [site]);
    for (const [n, date, owner, status] of [[1, "2026-10-21", 1, "open"], [2, "2026-10-19", 2, "closed"], [3, "2026-10-18", 2, "open"]] as const) {
      await db.query(`INSERT INTO inspection_jobs(id,customer_id,master_template_version_id,service_date,created_at,status,site_id,created_by_user_id)
        VALUES ($1,$2,$1,$3,'2026-10-01Z',$4,$5,$6)`, [id(n), customer, date, status, site, owner]);
    }
    for (const [n, date, owner, status] of [[1, "2026-10-21", 2, "draft"], [4, "2026-10-20", 1, "approved"], [5, "2026-10-17", 2, "returned"]] as const) {
      await db.query("INSERT INTO repair_visits(client_uuid,customer_id,visit_date,status,site_id,created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6)",
        [id(n), customer, date, status, site, owner]);
    }
    await t.test("auth and stale identity reject before reads; supervisor follows customer catalog role gate", async () => {
      assert.equal((await get()).status, 401);
      assert.equal((await get(base, "supervisor")).status, 403);
      assert.equal((await get(base, "inspector", { "x-expected-user-id": "2" })).status, 409);
      assert.equal((await get(`${base}?answers=true`, "admin")).status, 400);
    });
    await t.test("both kinds sorted by date, with summary allowlist for owner, non-owner and manager", async () => {
      for (const role of ["admin", "inspector"]) {
        const response = await get(base, role); assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        const { visits, nextCursor } = await response.json();
        assert.equal(nextCursor, null); assert.equal(visits.length, 6);
        assert.deepEqual(visits.map((v: { kind: string; date: string }) => [v.kind, v.date]), [
          ["service", "2026-10-21"], ["repair", "2026-10-21"], ["repair", "2026-10-20"],
          ["service", "2026-10-19"], ["service", "2026-10-18"], ["repair", "2026-10-17"]
        ]);
        for (const v of visits) assert.deepEqual(Object.keys(v).sort(),
          ["id", "kind", "date", "status", "siteId", "siteName", "technicianId", "technicianName", "ownedByCaller"].sort());
        assert.equal(visits[0].ownedByCaller, true); assert.equal(visits[1].ownedByCaller, false);
        assert.equal(visits[1].technicianName, "Other technician"); assert.equal(visits[0].siteName, "Live site");
      }
    });
    await t.test("filters compose and inclusive dates work across both kinds", async () => {
      for (const [filter, count] of [["kind=repair", 3], ["status=closed", 1], ["dateFrom=2026-10-19&dateTo=2026-10-20", 2],
        [`siteId=${site}`, 6], [`siteId=${id(99)}`, 0], ["kind=repair&status=draft&dateFrom=2026-10-21&dateTo=2026-10-21", 1]] as const) {
        const response = await get(`${base}?${filter}`, "inspector"); assert.equal(response.status, 200);
        assert.equal((await response.json()).visits.length, count, filter);
      }
    });
    await t.test("cursor covers ties including the same UUID in both tables without duplicates", async () => {
      const seen: string[] = []; let cursor: string | null = null;
      do {
        const response = await get(`${base}?limit=1${cursor ? `&cursor=${cursor}` : ""}`, "inspector");
        assert.equal(response.status, 200); const body = await response.json();
        seen.push(...body.visits.map((v: { kind: string; id: string }) => `${v.kind}:${v.id}`)); cursor = body.nextCursor;
      } while (cursor);
      assert.equal(seen.length, 6); assert.equal(new Set(seen).size, 6);
    });
    await t.test("visibility rejects demo/inactive customers for technician but keeps manager history", async () => {
      for (const update of ["is_demo=true", "is_demo=false,is_active=false"]) {
        await db.query(`UPDATE customers SET ${update}`);
        assert.equal((await get(base, "inspector")).status, 404);
        assert.equal((await get(base, "admin")).status, 200);
      }
      assert.equal((await get(`/customers/${id(99)}/visit-summaries`, "admin")).status, 404);
      await db.query("UPDATE customers SET is_active=true,is_demo=false");
      await db.query("UPDATE inspection_jobs SET technician_visible=false WHERE id=$1", [id(1)]);
      await db.query("UPDATE inspection_jobs SET archived_at=now() WHERE id=$1", [id(2)]);
      // A customer timeline contains all summaries, including visits hidden from the open-work list.
      assert.equal((await (await get(base, "inspector")).json()).visits.length, 6);
      assert.equal((await (await get(base, "admin")).json()).visits.length, 6);
    });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); await db.end();
  }
});
