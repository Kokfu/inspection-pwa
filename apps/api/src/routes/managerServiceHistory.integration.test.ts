import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { createServiceVisit } from "../jobs/serviceVisits.js";
import { createManagerCustomersRouter, ManagerCustomerError } from "./managerCustomers.js";
import { buildOperationalListQuery, createManagerServiceVisitsRouter } from "./managerServiceVisits.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
const v7TemplateId = "00000000-0000-4000-8000-000000000807";

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

/**
 * STEP 3.2 slice A: read-only filtering/pagination on the existing GET /manager/service-visits.
 * Exercises the real production SQL (parameterized WHERE/EXISTS/keyset predicates) against
 * PostgreSQL — never the runtime/customer database.
 */
test("GET /manager/service-visits filters by customer/site/status/systemKey/date range, excludes samples, keeps admin-only authority, and uses its indexes", { skip: !databaseUrl }, async () => {
  assert.equal(new URL(databaseUrl!).pathname, "/phase6_seed_integration", "manager integration only permits its dedicated database");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(pool);
    const user = await pool.query<{ id: number }>(
      "INSERT INTO users(username,password_hash,role) VALUES('service-history-admin','not-used','admin') RETURNING id"
    );
    const userId = user.rows[0]!.id;

    // --- Fixture: one customer, two sites, a mix of open/closed operational jobs across both
    // sites, plus one sample job that must never surface. ---------------------------------------
    const customersApp = express(); customersApp.use(express.json());
    customersApp.use((request, _response, next) => { request.currentUser = { id: userId, username: "service-history-admin", role: "admin" }; next(); });
    customersApp.use(createManagerCustomersRouter(pool));
    customersApp.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      if (error instanceof ManagerCustomerError) response.status(error.status).json({ error: error.code });
      else response.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
    });
    const customersServer = customersApp.listen(0, "127.0.0.1"); await once(customersServer, "listening");
    const customersAddress = customersServer.address() as { port: number };
    const post = async (path: string, body: unknown) => fetch(`http://127.0.0.1:${customersAddress.port}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });

    try {
      const created = await post("/manager/customers", {
        displayName: "Service History Customer", siteDisplayName: "Site Alpha",
        systemKeys: ["hose_reel", "automatic_sprinkler"]
      });
      assert.equal(created.status, 201);
      const customer = (await created.json() as { customer: { customer: { id: string }; sites: Array<{ id: string; displayName: string }>; configuration: { id: string } } }).customer;
      const customerId = customer.customer.id;
      const siteAlphaId = customer.sites.find((site) => site.displayName === "Site Alpha")!.id;

      const addedSite = await post(`/manager/customers/${customerId}/sites`, { displayName: "Site Beta" });
      assert.equal(addedSite.status, 201);
      const siteBetaId = (await addedSite.json() as { site: { id: string } }).site.id;

      // A second, unrelated customer — used to prove a foreign siteId (of a different customer)
      // never leaks through the customerId+siteId AND, and returns [] on its own too.
      const otherCreated = await post("/manager/customers", {
        displayName: "Unrelated Customer", siteDisplayName: "Unrelated Site", systemKeys: ["hose_reel"]
      });
      assert.equal(otherCreated.status, 201);
      const otherCustomer = (await otherCreated.json() as { customer: { customer: { id: string }; sites: Array<{ id: string }> } }).customer;
      const otherCustomerId = otherCustomer.customer.id;
      const otherSiteId = otherCustomer.sites[0]!.id;

      const visit = async (visitCustomerId: string, siteId: string, systemKeys: string[]) => {
        const client = await pool.connect();
        try {
          return (await createServiceVisit(client, { requestId: randomUUID(), customerId: visitCustomerId, siteId, systemKeys }, userId)).id;
        } finally { client.release(); }
      };

      // A real visit for the unrelated customer, at otherSiteId — proves the customerId+siteId
      // AND genuinely excludes another customer's site (rather than that site simply having no
      // visits at all). Goes through the real `createServiceVisit()` path.
      const otherCustomerJob = await visit(otherCustomerId, otherSiteId, ["hose_reel"]);

      // The four fixture jobs need specific, varied service_date values to exercise date-range
      // filtering — but migration 015's `trg_service_visit_schedule_immutable` freezes
      // service_date/service_time forever on any job `createServiceVisit()` produces (its
      // `creation_request_id` is always set), even while the job is still open. So these are
      // inserted directly (frozen at creation, never mutated after), mirroring the same
      // clone-a-frozen-snapshot technique used for `sampleJob` below.
      const revisionId = customer.configuration.id;
      let historicalReference = 0;
      const insertHistoricalJob = async (siteId: string, siteDisplayName: string, systemKey: string, systemDisplayName: string, serviceDate: string) => {
        historicalReference += 1;
        const id = randomUUID();
        const snapshot = JSON.stringify({
          schemaVersion: 1,
          customer: { id: customerId, code: "SVC-HIST", displayName: "Service History Customer" },
          site: { id: siteId, displayName: siteDisplayName },
          configuration: { revisionId, revisionNumber: 1 },
          template: { id: v7TemplateId, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 },
          enabledSystems: [{ enabledSystemId: randomUUID(), systemKey, displayName: systemDisplayName, sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [] }]
        });
        await pool.query(
          `INSERT INTO inspection_jobs (
             id, template_id, master_template_version_id, job_reference, title, status, is_sample,
             customer_id, customer_configuration_revision_id, configuration_snapshot, site_id, service_date
           ) VALUES ($1, NULL, $2, $3, $4, 'open', false, $5, $6, $7::jsonb, $8, $9::date)`,
          [id, v7TemplateId, `SV-HIST-${historicalReference}`, siteDisplayName, customerId, revisionId, snapshot, siteId, serviceDate]
        );
        return id;
      };

      const jobAlphaHoseOpen = await insertHistoricalJob(siteAlphaId, "Site Alpha", "hose_reel", "Hose Reel", "2026-08-05");
      const jobAlphaSprinklerClosed = await insertHistoricalJob(siteAlphaId, "Site Alpha", "automatic_sprinkler", "Automatic Sprinkler", "2026-08-15");
      const jobBetaHoseClosed = await insertHistoricalJob(siteBetaId, "Site Beta", "hose_reel", "Hose Reel", "2026-08-25");
      const jobBetaSprinklerOpen = await insertHistoricalJob(siteBetaId, "Site Beta", "automatic_sprinkler", "Automatic Sprinkler", "2026-09-01");

      await pool.query(
        "UPDATE inspection_jobs SET status='closed', completed_at=now(), completed_by_user_id=$2, completed_by_display_name='history-tech' WHERE id=$1",
        [jobAlphaSprinklerClosed, userId]
      );
      await pool.query(
        "UPDATE inspection_jobs SET status='closed', completed_at=now(), completed_by_user_id=$2, completed_by_display_name='history-tech' WHERE id=$1",
        [jobBetaHoseClosed, userId]
      );

      // A sample fixture on the SAME site/customer — proves `is_sample` exclusion holds even
      // under the new filters, not just the old zero-filter path.
      const sampleJob = (await pool.query<{ id: string }>(`
        INSERT INTO inspection_jobs(
          id, template_id, master_template_version_id, job_reference, title, status, is_sample,
          customer_id, customer_configuration_revision_id, configuration_snapshot, site_id, service_date
        )
        SELECT gen_random_uuid(), NULL, master_template_version_id, 'SV-SAMPLE-0001', title, status, true,
          customer_id, customer_configuration_revision_id, configuration_snapshot, site_id, service_date
        FROM inspection_jobs WHERE id = $1
        RETURNING id`, [jobAlphaHoseOpen])).rows[0]!.id;

      // --- Serve the actual GET /manager/service-visits route under test ---------------------
      const historyApp = express();
      const historyRole = { current: undefined as "admin" | "inspector" | undefined };
      historyApp.use((request, _response, next) => {
        if (historyRole.current) request.currentUser = { id: userId, username: historyRole.current, role: historyRole.current };
        next();
      });
      historyApp.use(createManagerServiceVisitsRouter({ database: pool }));
      const historyServer = historyApp.listen(0, "127.0.0.1"); await once(historyServer, "listening");
      const historyAddress = historyServer.address() as { port: number };
      const get = (query = "") => fetch(`http://127.0.0.1:${historyAddress.port}/manager/service-visits${query}`);

      try {
        // Auth matrix: unauthenticated -> 401, wrong role -> 403, admin -> 200.
        historyRole.current = undefined;
        assert.equal((await get()).status, 401);
        historyRole.current = "inspector";
        assert.equal((await get()).status, 403);
        historyRole.current = "admin";

        const idsFor = async (query: string) => {
          const response = await get(query);
          assert.equal(response.status, 200, query);
          const body = await response.json() as { serviceVisits: Array<{ id: string }>; nextCursor: string | null; totalCount: number };
          // Every filtered set exercised below fits on one (default 50) page, so totalCount must
          // equal the returned row count exactly — proving each filter narrows totalCount
          // identically to the rows it returns.
          assert.equal(body.totalCount, body.serviceVisits.length, `totalCount must match rows for ${query}`);
          return body.serviceVisits.map((v) => v.id);
        };

        // customerId scope: all four real visits, never the sample.
        const scopedToCustomer = await idsFor(`?customerId=${customerId}`);
        assert.deepEqual(new Set(scopedToCustomer), new Set([jobAlphaHoseOpen, jobAlphaSprinklerClosed, jobBetaHoseClosed, jobBetaSprinklerOpen]));
        assert.ok(!scopedToCustomer.includes(sampleJob), "sample job is never returned");

        // totalCount reflects the FULL filtered count (from the `summary` derived table, computed
        // independently of the cursor+limit page) while serviceVisits.length stays capped at
        // `limit`, and stays identical across every page of the same filtered set.
        type ServiceVisitPage = { serviceVisits: Array<{ id: string; reference: string; serviceDate: string | null }>; nextCursor: string | null; totalCount: number };
        const firstPage = await get(`?customerId=${customerId}&limit=2`);
        assert.equal(firstPage.status, 200);
        const firstPageBody = await firstPage.json() as ServiceVisitPage;
        assert.equal(firstPageBody.serviceVisits.length, 2, "page is capped by limit");
        assert.equal(firstPageBody.totalCount, 4, "totalCount reflects the FULL filtered count, not the page size");
        assert.ok(firstPageBody.nextCursor);
        const secondPage = await get(`?customerId=${customerId}&limit=2&cursor=${encodeURIComponent(firstPageBody.nextCursor!)}`);
        assert.equal(secondPage.status, 200);
        const secondPageBody = await secondPage.json() as ServiceVisitPage;
        assert.equal(secondPageBody.serviceVisits.length, 2, "final page carries the remainder");
        assert.equal(secondPageBody.totalCount, 4, "totalCount is identical on the second page of the same filtered set");
        assert.equal(secondPageBody.nextCursor, null);

        // Regression: a cursor positioned exactly at the true end of an otherwise non-empty
        // filtered set (nothing sorts "after" it) produces a genuinely empty page against real
        // PostgreSQL. totalCount must still be 4, not 0 — proving the `summary LEFT JOIN paged`
        // placeholder row actually survives a real, empty `paged` result set, not just the
        // in-memory mock's simulation of it.
        const lastVisit = secondPageBody.serviceVisits[secondPageBody.serviceVisits.length - 1]!;
        const pastEndCursor = Buffer.from(JSON.stringify({
          serviceDate: lastVisit.serviceDate, jobReference: lastVisit.reference, id: lastVisit.id
        })).toString("base64url");
        const pastEnd = await get(`?customerId=${customerId}&limit=50&cursor=${encodeURIComponent(pastEndCursor)}`);
        assert.equal(pastEnd.status, 200);
        const pastEndBody = await pastEnd.json() as { serviceVisits: unknown[]; nextCursor: string | null; totalCount: number };
        assert.deepEqual(pastEndBody.serviceVisits, [], "a cursor at the true end of the filtered set yields a genuinely empty page");
        assert.equal(pastEndBody.totalCount, 4, "totalCount survives an empty page against real PostgreSQL — it must not silently become 0");
        assert.equal(pastEndBody.nextCursor, null);

        // siteId scope.
        assert.deepEqual(new Set(await idsFor(`?siteId=${siteAlphaId}`)), new Set([jobAlphaHoseOpen, jobAlphaSprinklerClosed]));
        assert.deepEqual(new Set(await idsFor(`?siteId=${siteBetaId}`)), new Set([jobBetaHoseClosed, jobBetaSprinklerOpen]));

        // both given, consistent -> AND; both given, a site of a DIFFERENT customer -> [].
        assert.deepEqual(await idsFor(`?customerId=${customerId}&siteId=${siteAlphaId}`), [jobAlphaSprinklerClosed, jobAlphaHoseOpen]);
        assert.deepEqual(await idsFor(`?customerId=${customerId}&siteId=${otherSiteId}`), [], "a site of a different customer yields []");

        // a foreign/unrelated siteId on its own -> just that other customer's own job, never ours.
        assert.deepEqual(await idsFor(`?siteId=${otherSiteId}`), [otherCustomerJob]);

        // a well-formed but wholly unknown siteId -> 200 [].
        assert.deepEqual(await idsFor(`?siteId=${randomUUID()}`), []);

        // status.
        assert.deepEqual(new Set(await idsFor(`?customerId=${customerId}&status=closed`)), new Set([jobAlphaSprinklerClosed, jobBetaHoseClosed]));
        assert.deepEqual(new Set(await idsFor(`?customerId=${customerId}&status=open`)), new Set([jobAlphaHoseOpen, jobBetaSprinklerOpen]));

        // systemKey: filters on the frozen snapshot's enabled systems.
        assert.deepEqual(new Set(await idsFor(`?customerId=${customerId}&systemKey=hose_reel`)), new Set([jobAlphaHoseOpen, jobBetaHoseClosed]));
        assert.deepEqual(new Set(await idsFor(`?customerId=${customerId}&systemKey=automatic_sprinkler`)), new Set([jobAlphaSprinklerClosed, jobBetaSprinklerOpen]));

        // date range, inclusive; from>to -> 400 INVALID_DATE_RANGE.
        assert.deepEqual(new Set(await idsFor(`?customerId=${customerId}&from=2026-08-01&to=2026-08-20`)), new Set([jobAlphaHoseOpen, jobAlphaSprinklerClosed]));
        assert.deepEqual(await idsFor(`?customerId=${customerId}&from=2026-08-05&to=2026-08-05`), [jobAlphaHoseOpen]);
        const badRange = await get(`?from=2026-08-20&to=2026-08-01`);
        assert.equal(badRange.status, 400);
        assert.deepEqual(await badRange.json(), { error: "INVALID_DATE_RANGE" });

        // malformed params -> 400, stable codes, no stack leak.
        assert.deepEqual(await (await get("?customerId=not-a-uuid")).json(), { error: "INVALID_CUSTOMER_ID" });
        assert.equal((await get("?limit=0")).status, 400);
        assert.equal((await get("?cursor=%25%25not-valid%25%25")).status, 400);

        // -- EXPLAIN: customer_id / site_id filters use the migrations 004/010 indexes, not a
        // sequential scan on inspection_jobs, once the table has enough (and selective enough)
        // rows for the planner to prefer them. `buildOperationalListQuery()`'s SQL now also
        // carries the `filtered` CTE + `summary`/`paged` split for `totalCount`; this proves that
        // structure does not force a plan change that drops the index scan. --------------------
        const decoyCount = 4000;
        const decoyCustomerIds = Array.from({ length: decoyCount }, () => randomUUID());
        const decoySiteIds = Array.from({ length: decoyCount }, () => randomUUID());
        const decoyJobIds = Array.from({ length: decoyCount }, () => randomUUID());
        const decoyRevisionIds = Array.from({ length: decoyCount }, () => randomUUID());

        await pool.query(
          `INSERT INTO customers (id, customer_code, display_name)
           SELECT * FROM unnest($1::uuid[], $2::text[], $3::text[])`,
          [decoyCustomerIds, decoyCustomerIds.map((_, i) => `DECOY-${i}`), decoyCustomerIds.map((_, i) => `Decoy Customer ${i}`)]
        );
        await pool.query(
          `INSERT INTO customer_configuration_revisions (id, customer_id, template_version_id, revision, status)
           SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::int[], $5::text[])`,
          [decoyRevisionIds, decoyCustomerIds, decoyCustomerIds.map(() => v7TemplateId), decoyCustomerIds.map(() => 1), decoyCustomerIds.map(() => "active")]
        );
        await pool.query(
          `INSERT INTO customer_sites (id, customer_id, site_code, display_name)
           SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[])`,
          [decoySiteIds, decoyCustomerIds, decoySiteIds.map((_, i) => `SITE-${i}`), decoySiteIds.map((_, i) => `Decoy Site ${i}`)]
        );
        const decoySnapshots = decoyCustomerIds.map((decoyCustomerId, i) => JSON.stringify({
          schemaVersion: 1,
          customer: { id: decoyCustomerId, code: `DECOY-${i}`, displayName: `Decoy Customer ${i}` },
          site: { id: decoySiteIds[i], displayName: `Decoy Site ${i}` },
          configuration: { revisionId: decoyRevisionIds[i], revisionNumber: 1 },
          template: { id: v7TemplateId, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 7 },
          enabledSystems: [{ enabledSystemId: randomUUID(), systemKey: "hose_reel", displayName: "Hose Reel", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [] }]
        }));
        await pool.query(
          `INSERT INTO inspection_jobs (
             id, template_id, master_template_version_id, job_reference, title, status, is_sample,
             customer_id, customer_configuration_revision_id, configuration_snapshot, site_id, service_date
           )
           SELECT t.id, NULL, $1::uuid, t.reference, 'Decoy Visit', 'open', false,
             t.customer_id, t.revision_id, t.snapshot::jsonb, t.site_id, '2026-01-01'::date
           FROM unnest($2::uuid[], $3::text[], $4::uuid[], $5::uuid[], $6::uuid[], $7::jsonb[])
             AS t(id, reference, customer_id, revision_id, site_id, snapshot)`,
          [v7TemplateId, decoyJobIds, decoyJobIds.map((_, i) => `SV-DECOY-${i}`), decoyCustomerIds, decoyRevisionIds, decoySiteIds, decoySnapshots]
        );
        await pool.query("ANALYZE inspection_jobs");

        const customerScoped = buildOperationalListQuery({ customerId, limit: 50 });
        const customerPlan = (await pool.query(`EXPLAIN ${customerScoped.sql}`, customerScoped.values)).rows.map((row: { "QUERY PLAN": string }) => row["QUERY PLAN"]).join("\n");
        assert.ok(!/Seq Scan on inspection_jobs/.test(customerPlan), `expected an index path for customer_id, got:\n${customerPlan}`);

        const siteScoped = buildOperationalListQuery({ siteId: siteAlphaId, limit: 50 });
        const sitePlan = (await pool.query(`EXPLAIN ${siteScoped.sql}`, siteScoped.values)).rows.map((row: { "QUERY PLAN": string }) => row["QUERY PLAN"]).join("\n");
        assert.ok(!/Seq Scan on inspection_jobs/.test(sitePlan), `expected an index path for site_id, got:\n${sitePlan}`);

        // eslint-disable-next-line no-console
        console.log("EXPLAIN customerId scope:\n" + customerPlan);
        // eslint-disable-next-line no-console
        console.log("EXPLAIN siteId scope:\n" + sitePlan);
      } finally {
        await close(historyServer);
      }
    } finally {
      await close(customersServer);
    }
  } finally {
    await pool.end();
  }
});
