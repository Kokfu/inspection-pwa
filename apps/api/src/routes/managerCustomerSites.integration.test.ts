import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { createServiceVisit, ServiceVisitError } from "../jobs/serviceVisits.js";
import { loadCanonicalInspectionJob } from "./inspectionJobs.js";
import { createManagerCustomersRouter, ManagerCustomerError } from "./managerCustomers.js";
import { createInspectionReferenceRouter } from "./inspectionReference.js";
import { createSiteProposalsRouter } from "./siteProposals.js";

const url = process.env.SEED_INTEGRATION_DATABASE_URL;
const customerId = "00000000-0000-4000-8000-000000000750";
const siteId = "00000000-0000-4000-8000-000000000755";

test("site archive/restore: authority, transaction, history and proposal boundaries", { skip: !url }, async () => {
  assert.equal(new URL(url!).hostname, "127.0.0.1");
  assert.equal(new URL(url!).port, "55432");
  assert.equal(new URL(url!).pathname, "/phase6_seed_integration");
  const db = new pg.Pool({ connectionString: url });
  try {
    await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(db);
    await db.query("UPDATE customers SET is_demo=false WHERE id=$1", [customerId]);
    const actorId = Number((await db.query("INSERT INTO users(username,password_hash,role) VALUES('site-archive','x','admin') RETURNING id")).rows[0].id);
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => {
      const role = req.header("x-role");
      if (role === "admin" || role === "inspector" || role === "supervisor") req.currentUser = { id: actorId, username: "site-archive", role };
      next();
    });
    app.use(createManagerCustomersRouter(db)); app.use(createInspectionReferenceRouter(db)); app.use(createSiteProposalsRouter(db));
    app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(error instanceof SyntaxError ? 400 : error instanceof ManagerCustomerError ? error.status : 500).json({ error: error instanceof ManagerCustomerError ? error.code : "INTERNAL_SERVER_ERROR" });
    });
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const { port } = server.address() as { port: number };
    const call = (path: string, role = "admin", body?: unknown) => fetch(`http://127.0.0.1:${port}${path}`, {
      method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", "x-role": role },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const change = (id: string, action: string, role = "admin", body: unknown = {}) => call(`/manager/customers/${customerId}/sites/${id}/${action}`, role, body);
    const visit = async (input: { siteId: string } | { newSite: { displayName: string; address: null } }) => {
      const client = await db.connect();
      try { return await createServiceVisit(client, { requestId: randomUUID(), customerId, systemKeys: ["portable_fire_extinguisher"], ...input }, actorId, "inspector"); }
      finally { client.release(); }
    };
    const manager = async () => (await (await call(`/manager/customers/${customerId}`)).json()).customer;
    const reference = async () => (await (await call(`/customers/${customerId}/sites`, "inspector")).json()).sites as Array<{ id: string }>;
    try {
      const originalSite = (await db.query("SELECT * FROM customer_sites WHERE id=$1", [siteId])).rows[0];
      const oldJob = await visit({ siteId });
      for (const action of ["archive", "restore"]) {
        for (const role of ["", "inspector", "supervisor"]) assert.equal((await change(siteId, action, role)).status, role ? 403 : 401);
        for (const body of [null, [], { is_active: true }, { reason: "x" }]) assert.equal((await change(siteId, action, "admin", body)).status, 400);
        assert.equal((await call(`/manager/customers/bad/sites/${siteId}/${action}`, "admin", {})).status, 400);
        assert.equal((await change(randomUUID(), action)).status, 404);
      }
      const archived = await change(siteId, "archive"); assert.equal(archived.status, 200);
      const archivedBody = await archived.json();
      assert.deepEqual(await (await change(siteId, "archive")).json(), archivedBody, "archive replay has same success shape");
      assert.ok(!(await reference()).some(s => s.id === siteId));
      assert.ok(!archivedBody.customer.sites.some((s: { id: string }) => s.id === siteId));
      assert.equal(archivedBody.customer.archivedSites.find((s: { id: string }) => s.id === siteId).archived, true);
      await assert.rejects(visit({ siteId }), (e: unknown) => e instanceof ServiceVisitError && e.code === "SITE_NOT_FOUND");
      assert.equal((await loadCanonicalInspectionJob(oldJob.id, db))?.site?.displayName, originalSite.display_name);
      assert.deepEqual((await db.query("SELECT * FROM customer_sites WHERE id=$1", [siteId])).rows[0], { ...originalSite, is_active: false }, "only activity changes");
      const restored = await change(siteId, "restore"); assert.equal(restored.status, 200);
      assert.deepEqual(await (await change(siteId, "restore")).json(), await restored.json());
      assert.ok((await reference()).some(s => s.id === siteId)); await visit({ siteId });
      await change(siteId, "archive");
      const clash = randomUUID();
      await db.query("INSERT INTO customer_sites(id,customer_id,site_code,display_name) VALUES($1,$2,'CLASH',$3)", [clash, customerId, `  ${originalSite.display_name.toUpperCase().replace(/ /g, "   ")}  `]);
      const conflict = await change(siteId, "restore"); assert.equal(conflict.status, 409); assert.equal((await conflict.json()).error, "SITE_NAME_CONFLICT");
      await change(clash, "archive");
      const raced = await Promise.all([change(siteId, "restore"), change(clash, "restore")]);
      assert.deepEqual(raced.map(r => r.status).sort(), [200, 409], "one restore wins normalized-name race");
      for (const [activeName, archivedName] of [
        ["Cafe\u0301", "Caf\u00e9"],
        ["Caf\u00e9", "Cafe\u0301"],
        ["\u00a0Unicode\u00a0 Bay\u00a0", "unicode bay"]
      ]) {
        const activeId = randomUUID(), archivedId = randomUUID();
        await db.query(`INSERT INTO customer_sites(id,customer_id,site_code,display_name,is_active)
          VALUES($1,$2,$6,$3,true),($4,$2,$7,$5,false)`, [activeId, customerId, activeName, archivedId, archivedName, activeId, archivedId]);
        const refused = await change(archivedId, "restore");
        assert.equal(refused.status, 409, `normalized clash: ${JSON.stringify([activeName, archivedName])}`);
        assert.equal((await refused.json()).error, "SITE_NAME_CONFLICT");
        assert.equal((await db.query("SELECT is_active FROM customer_sites WHERE id=$1", [archivedId])).rows[0].is_active, false);
        assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_events WHERE entity_id=$1 AND action='manager_customer_site_restored'", [archivedId])).rows[0].n, 0);
        assert.equal((await change(activeId, "archive")).status, 200);
        assert.equal((await change(archivedId, "restore")).status, 200, "restore succeeds once the normalized clash is archived");
        assert.equal((await db.query("SELECT display_name FROM customer_sites WHERE id=$1", [archivedId])).rows[0].display_name, archivedName, "restore preserves historical spelling");
        assert.equal((await change(archivedId, "archive")).status, 200);
      }
      // Typed sites exercise actual immutable proposal submissions and decision log.
      for (const decision of ["pending", "rejected", "approved"]) {
        const job = await visit({ newSite: { displayName: `Archive ${decision}`, address: null } });
        const proposal = (await db.query("SELECT id,site_id FROM customer_site_proposals WHERE job_id=$1", [job.id])).rows[0];
        if (decision !== "pending") {
          const res = await call(`/manager/site-proposals/${proposal.id}/decision`, "admin", { requestId: randomUUID(), decision, ...(decision === "rejected" ? { note: "Not a valid site" } : {}) });
          assert.equal(res.status, 201, await res.text());
        }
        if (decision === "approved") {
          assert.equal((await change(proposal.site_id, "archive")).status, 200);
          assert.ok((await manager()).archivedSites.some((s: { id: string }) => s.id === proposal.site_id));
          assert.equal((await change(proposal.site_id, "restore")).status, 200);
        } else {
          for (const action of ["archive", "restore"]) {
            const res = await change(proposal.site_id, action); assert.equal(res.status, 409); assert.equal((await res.json()).error, "SITE_PROPOSAL_NOT_APPROVED");
          }
          assert.ok(!(await manager()).archivedSites.some((s: { id: string }) => s.id === proposal.site_id));
        }
      }
      const audits = (await db.query("SELECT action,count(*)::int AS n FROM audit_events WHERE entity_id=$1 AND action IN ('manager_customer_site_archived','manager_customer_site_restored') GROUP BY action", [siteId])).rows;
      assert.equal(audits.find(a => a.action === "manager_customer_site_archived").n, 2, "replay creates no duplicate audit");
      assert.ok(audits.find(a => a.action === "manager_customer_site_restored").n >= 1);
      // Audit failure must roll back the site flag in the same transaction.
      await db.query(`CREATE FUNCTION fail_site_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='manager_customer_site_archived' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER fail_site_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_site_audit()`);
      const activeSite = (await db.query("SELECT id FROM customer_sites WHERE customer_id=$1 AND is_active=true LIMIT 1", [customerId])).rows[0].id;
      assert.equal((await change(activeSite, "archive")).status, 500);
      assert.equal((await db.query("SELECT is_active FROM customer_sites WHERE id=$1", [activeSite])).rows[0].is_active, true);
      await db.query("DROP TRIGGER fail_site_audit ON audit_events; DROP FUNCTION fail_site_audit()");
      for (const s of (await manager()).sites) assert.equal((await change(s.id, "archive")).status, 200);
      assert.equal((await manager()).sites.length, 0, "last active site can be archived");
    } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
  } finally { await db.end(); }
});
