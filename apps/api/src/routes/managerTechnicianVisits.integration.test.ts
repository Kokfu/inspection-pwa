import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { createManagerCustomersRouter, ManagerCustomerError } from "./managerCustomers.js";
import { createManagerServiceVisitsRouter } from "./managerServiceVisits.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
const v7TemplateId = "00000000-0000-4000-8000-000000000807";

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

type Visit = { id: string; reference: string; serviceDate: string | null; technician: { id: number; displayName: string } | null };
type Page = { serviceVisits: Visit[]; nextCursor: string | null; totalCount: number };

/**
 * Slice B: the optional `technicianId` filter on the admin-only GET /manager/service-visits, and the
 * creating technician carried on every item. Real production SQL against the disposable database only.
 */
test("GET /manager/service-visits technicianId filter scopes to the creator, combines with other filters, pages exactly once, and stays admin-only", { skip: !databaseUrl }, async () => {
  assert.equal(new URL(databaseUrl!).pathname, "/phase6_seed_integration", "manager integration only permits its dedicated database");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const insertUser = async (username: string, role: "admin" | "inspector") => (await pool.query<{ id: number }>(
      "INSERT INTO users(username,password_hash,role) VALUES($1,'not-used',$2) RETURNING id::int AS id", [username, role]
    )).rows[0]!.id;
    const adminId = await insertUser("slice-b-admin", "admin");
    const techA = await insertUser("slice-b-tech-a", "inspector");
    const techB = await insertUser("slice-b-tech-b", "inspector");

    const customersApp = express(); customersApp.use(express.json());
    customersApp.use((request, _response, next) => { request.currentUser = { id: adminId, username: "slice-b-admin", role: "admin" }; next(); });
    customersApp.use(createManagerCustomersRouter(pool));
    customersApp.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      if (error instanceof ManagerCustomerError) response.status(error.status).json({ error: error.code });
      else response.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
    });
    const customersServer = customersApp.listen(0, "127.0.0.1"); await once(customersServer, "listening");
    const customersPort = (customersServer.address() as { port: number }).port;
    type CreatedCustomer = { customer: { id: string; code: string }; sites: Array<{ id: string; displayName: string }>; configuration: { id: string } };
    const createCustomer = async (displayName: string, siteDisplayName: string) => {
      const response = await fetch(`http://127.0.0.1:${customersPort}/manager/customers`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, siteDisplayName, systemKeys: ["hose_reel"] })
      });
      assert.equal(response.status, 201);
      return (await response.json() as { customer: CreatedCustomer }).customer;
    };

    try {
      const customerX = await createCustomer("Slice B Customer X", "X Site One");
      const customerY = await createCustomer("Slice B Customer Y", "Y Site One");
      const siteX = customerX.sites[0]!;
      const siteY = customerY.sites[0]!;

      // Inserted directly (no creation_request_id) so each row can carry a chosen creator, service date,
      // and status — including a NULL-creator legacy row, which createServiceVisit() can never produce.
      let sequence = 0;
      const insertJob = async (customer: CreatedCustomer, site: { id: string; displayName: string }, creator: number | null, serviceDate: string | null, status: "open" | "closed") => {
        sequence += 1;
        const id = randomUUID();
        const snapshot = JSON.stringify({
          schemaVersion: 1,
          customer: { id: customer.customer.id, code: customer.customer.code, displayName: customer === customerX ? "Slice B Customer X" : "Slice B Customer Y" },
          site: { id: site.id, displayName: site.displayName },
          configuration: { revisionId: customer.configuration.id, revisionNumber: 1 },
          template: { id: v7TemplateId, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 },
          enabledSystems: [{ enabledSystemId: randomUUID(), systemKey: "hose_reel", displayName: "Hose Reel", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [] }]
        });
        await pool.query(
          `INSERT INTO inspection_jobs (
             id, template_id, master_template_version_id, job_reference, title, status, is_sample,
             customer_id, customer_configuration_revision_id, configuration_snapshot, site_id, service_date, created_by_user_id
           ) VALUES ($1, NULL, $2, $3, $4, 'open', false, $5, $6, $7::jsonb, $8, $9::date, $10)`,
          [id, v7TemplateId, `SV-SLICEB-${String(sequence).padStart(2, "0")}`, site.displayName, customer.customer.id, customer.configuration.id, snapshot, site.id, serviceDate, creator]
        );
        if (status === "closed") {
          await pool.query("UPDATE inspection_jobs SET status='closed', completed_at=now(), completed_by_user_id=$2, completed_by_display_name='slice-b' WHERE id=$1", [id, creator ?? adminId]);
        }
        return id;
      };

      const aXOpen = await insertJob(customerX, siteX, techA, "2026-08-01", "open");
      const aXClosed1 = await insertJob(customerX, siteX, techA, "2026-08-10", "closed");
      const aXClosed2 = await insertJob(customerX, siteX, techA, "2026-08-10", "closed");
      const aYClosed = await insertJob(customerY, siteY, techA, "2026-08-20", "closed");
      const aYNoDate = await insertJob(customerY, siteY, techA, null, "open");
      const bXOpen = await insertJob(customerX, siteX, techB, "2026-08-05", "open");
      const bYOpen = await insertJob(customerY, siteY, techB, "2026-08-15", "open");
      const legacyNull = await insertJob(customerX, siteX, null, "2026-08-12", "closed");
      const techAIds = [aXOpen, aXClosed1, aXClosed2, aYClosed, aYNoDate];

      const app = express();
      const role = { current: "admin" as "admin" | "inspector" | undefined };
      app.use((request, _response, next) => {
        if (role.current) request.currentUser = { id: role.current === "admin" ? adminId : techA, username: role.current, role: role.current };
        next();
      });
      app.use(createManagerServiceVisitsRouter({ database: pool }));
      const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
      const port = (server.address() as { port: number }).port;
      const get = (query = "") => fetch(`http://127.0.0.1:${port}/manager/service-visits${query}`);
      const page = async (query: string) => {
        const response = await get(query);
        assert.equal(response.status, 200, query);
        return await response.json() as Page;
      };
      const ids = async (query: string) => {
        const body = await page(query);
        assert.equal(body.totalCount, body.serviceVisits.length, `totalCount must match rows for ${query}`);
        return new Set(body.serviceVisits.map((visit) => visit.id));
      };

      try {
        // Admin-only, exactly as before: inspector is 403 with or without the new filter; anonymous 401.
        role.current = "inspector";
        assert.equal((await get()).status, 403);
        assert.equal((await get(`?technicianId=${techA}`)).status, 403);
        role.current = undefined;
        assert.equal((await get(`?technicianId=${techA}`)).status, 401);
        role.current = "admin";

        // technicianId returns only that technician's visits, each carrying that technician.
        const onlyA = await page(`?technicianId=${techA}`);
        assert.deepEqual(new Set(onlyA.serviceVisits.map((visit) => visit.id)), new Set(techAIds));
        assert.equal(onlyA.totalCount, 5);
        for (const visit of onlyA.serviceVisits) assert.deepEqual(visit.technician, { id: techA, displayName: "slice-b-tech-a" });
        assert.deepEqual(await ids(`?technicianId=${techB}`), new Set([bXOpen, bYOpen]));

        // Combined with customerId / status / siteId / date range.
        assert.deepEqual(await ids(`?technicianId=${techA}&customerId=${customerX.customer.id}`), new Set([aXOpen, aXClosed1, aXClosed2]));
        assert.deepEqual(await ids(`?technicianId=${techA}&customerId=${customerX.customer.id}&status=closed`), new Set([aXClosed1, aXClosed2]));
        assert.deepEqual(await ids(`?technicianId=${techA}&status=open`), new Set([aXOpen, aYNoDate]));
        assert.deepEqual(await ids(`?technicianId=${techB}&customerId=${customerY.customer.id}`), new Set([bYOpen]));
        assert.deepEqual(await ids(`?technicianId=${techB}&siteId=${siteX.id}`), new Set([bXOpen]));
        assert.deepEqual(await ids(`?technicianId=${techA}&from=2026-08-10&to=2026-08-20`), new Set([aXClosed1, aXClosed2, aYClosed]));

        // Unknown (well-formed) technician -> empty page, not an error. Never matches NULL-creator rows.
        const unknown = await page("?technicianId=2147483647");
        assert.deepEqual(unknown.serviceVisits, []);
        assert.equal(unknown.totalCount, 0);
        assert.equal(unknown.nextCursor, null);

        // Invalid technicianId -> 400 with the existing { error } shape, before any SQL.
        for (const bad of ["abc", "0", "-1", "1.5", "01", "2147483648", "99999999999999999999", ""]) {
          const response = await get(`?technicianId=${encodeURIComponent(bad)}`);
          assert.equal(response.status, 400, `technicianId=${bad}`);
          assert.deepEqual(await response.json(), { error: "INVALID_TECHNICIAN_ID" });
        }
        const repeated = await get(`?technicianId=${techA}&technicianId=${techB}`);
        assert.equal(repeated.status, 400);
        assert.deepEqual(await repeated.json(), { error: "INVALID_TECHNICIAN_ID" });

        // Cursor paging with the filter returns every row exactly once, with a stable totalCount,
        // across a same-date tie and a NULL service date.
        for (const limit of [1, 2, 3]) {
          const seen: string[] = [];
          let cursor: string | null = null;
          let pages = 0;
          do {
            const body: Page = await page(`?technicianId=${techA}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
            assert.equal(body.totalCount, 5, `totalCount stable on every page (limit ${limit})`);
            assert.ok(body.serviceVisits.length <= limit);
            seen.push(...body.serviceVisits.map((visit) => visit.id));
            cursor = body.nextCursor;
            pages += 1;
            assert.ok(pages <= 10, "paging terminates");
          } while (cursor);
          assert.equal(seen.length, 5, `every row once (limit ${limit})`);
          assert.deepEqual(new Set(seen), new Set(techAIds));
          assert.deepEqual(seen, onlyA.serviceVisits.map((visit) => visit.id), "paged order equals the unpaged order");
        }
        const closedA = await page(`?technicianId=${techA}&status=closed&limit=1`);
        const closedA2 = await page(`?technicianId=${techA}&status=closed&limit=1&cursor=${encodeURIComponent(closedA.nextCursor!)}`);
        const closedA3 = await page(`?technicianId=${techA}&status=closed&limit=1&cursor=${encodeURIComponent(closedA2.nextCursor!)}`);
        assert.equal(closedA3.nextCursor, null);
        assert.deepEqual(new Set([closedA, closedA2, closedA3].flatMap((body) => body.serviceVisits.map((visit) => visit.id))), new Set([aYClosed, aXClosed1, aXClosed2]));

        // NULL-creator legacy visit: present unfiltered, technician null, excluded from every technician filter.
        const customerXAll = await page(`?customerId=${customerX.customer.id}`);
        const legacy = customerXAll.serviceVisits.find((visit) => visit.id === legacyNull);
        assert.ok(legacy, "NULL-creator visit is still listed without a technician filter");
        assert.equal(legacy.technician, null);
        assert.equal(customerXAll.serviceVisits.find((visit) => visit.id === bXOpen)!.technician!.displayName, "slice-b-tech-b");
        const detail = await get(`/${legacyNull}`);
        assert.equal(detail.status, 200);
        assert.equal((await detail.json() as { serviceVisit: Visit }).serviceVisit.technician, null);
        const detailA = await get(`/${aXOpen}`);
        assert.deepEqual((await detailA.json() as { serviceVisit: Visit }).serviceVisit.technician, { id: techA, displayName: "slice-b-tech-a" });
      } finally {
        await close(server);
      }
    } finally {
      await close(customersServer);
    }
  } finally {
    await pool.end();
  }
});
