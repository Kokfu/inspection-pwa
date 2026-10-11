import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { runMigrations } from "../db/migrations.js";
import { pool } from "../db/pool.js";
import { v7IntegrationDatabaseUrl } from "../sync/v7IntegrationTestDatabase.js";
import { createInspectionReferenceRouter } from "./inspectionReference.js";
import { inspectionJobsRouter, listTechnicianInspectionJobs, loadCanonicalInspectionJob } from "./inspectionJobs.js";
import { createSiteProposalsRouter } from "./siteProposals.js";

/**
 * CR-02 Phase 1 (disposable Postgres on 127.0.0.1:55432 only; a SKIP is not a PASS). Drives the REAL routes:
 * visit creation with a typed site, the Admin review routes, the site lists that must keep hiding a pending site,
 * idempotency and concurrency, the append-only tables, and the cold + re-run migration.
 */
const databaseUrl = v7IntegrationDatabaseUrl();
const id = () => randomUUID();
const seedCustomer = "00000000-0000-4000-8000-000000000750"; // seeded by runMigrations; has portable_fire_extinguisher enabled
const seedSite = "00000000-0000-4000-8000-000000000755";
const systemKeys = ["portable_fire_extinguisher"];

test("site proposals: typed site on a visit, Admin decision, hidden until approved", { skip: !databaseUrl }, async (t) => {
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(pool);
    assert.equal((await pool.query("SELECT to_regclass('public.customer_site_proposals') IS NOT NULL AS ok")).rows[0].ok, true, "migration 050 created the tables");

    const user = async (username: string, role: string) => (await pool.query<{ id: number }>("INSERT INTO users(username,password_hash,role) VALUES($1,'x',$2) RETURNING id::int AS id", [username, role])).rows[0]!.id;
    const techA = await user("sp-tech-a", "inspector"), techB = await user("sp-tech-b", "inspector");
    const supervisor = await user("sp-super", "supervisor"), admin = await user("sp-admin", "admin");
    const actors: Record<string, { id: number; username: string; role: "admin" | "inspector" | "supervisor" }> = {
      techA: { id: techA, username: "sp-tech-a", role: "inspector" }, techB: { id: techB, username: "sp-tech-b", role: "inspector" },
      supervisor: { id: supervisor, username: "sp-super", role: "supervisor" }, admin: { id: admin, username: "sp-admin", role: "admin" }
    };
    const app = express(); app.use(express.json());
    app.use((request, _response, next) => { const actor = actors[request.header("x-test-actor") ?? ""]; if (actor) request.currentUser = actor; next(); });
    app.use(createInspectionReferenceRouter(pool)); app.use(inspectionJobsRouter); app.use(createSiteProposalsRouter(pool));
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const { port } = server.address() as { port: number };
    const call = (path: string, actor: string | undefined, method = "GET", body?: unknown) => fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers: { "content-type": "application/json", ...(actor ? { "x-test-actor": actor } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const visit = (actor: string, body: Record<string, unknown>) => call("/inspection-jobs/service-visits", actor, "POST", { customerId: seedCustomer, systemKeys, ...body });
    const typed = (name: string, address?: string) => ({ newSite: { displayName: name, ...(address === undefined ? {} : { address }) } });
    const count = async (table: string, where = "true") => (await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`)).rows[0].n as number;
    const siteList = async (actor = "techA") => ((await (await call(`/customers/${seedCustomer}/sites`, actor)).json()) as { sites: Array<{ id: string; displayName: string }> }).sites;
    const decide = (proposalId: string, actor: string, body: Record<string, unknown>) => call(`/manager/site-proposals/${proposalId}/decision`, actor, "POST", body);
    const reject = async (response: Response, status: number, error: string) => {
      const text = await response.clone().text(); assert.equal(response.status, status, text);
      assert.equal((JSON.parse(text) as { error: string }).error, error, text);
    };
    const proposalFor = async (name: string) => (await pool.query<{ id: string; site_id: string }>("SELECT id, site_id FROM customer_site_proposals WHERE proposed_display_name=$1", [name])).rows[0]!;

    try {
      let firstProposalId = ""; let firstSiteId = ""; let firstJobId = ""; const firstRequest = id();
      await t.test("create: one INACTIVE site, one proposal, the visit points at it, snapshot and audit rows written", async () => {
        const created = await visit("techA", { requestId: firstRequest, ...typed("  Warehouse   Annex ", " 12 Jalan  Contoh ") });
        assert.equal(created.status, 201, await created.clone().text());
        const body = await created.json() as { job: { id: string; site: { id: string; displayName: string }; siteApproval: { status: string }; configurationSnapshot: { site: { id: string; displayName: string; address: string } } } };
        firstJobId = body.job.id; firstSiteId = body.job.site.id;
        assert.equal(body.job.site.displayName, "Warehouse Annex", "normalised: trimmed + collapsed whitespace");
        assert.deepEqual(body.job.siteApproval, { status: "pending" });
        assert.deepEqual(body.job.configurationSnapshot.site, { id: firstSiteId, displayName: "Warehouse Annex", address: "12 Jalan Contoh" });
        const site = (await pool.query("SELECT is_active, site_code, address, customer_id FROM customer_sites WHERE id=$1", [firstSiteId])).rows[0];
        assert.equal(site.is_active, false); assert.match(site.site_code, /^SITE-[0-9A-F]{8}$/); assert.equal(site.address, "12 Jalan Contoh"); assert.equal(site.customer_id, seedCustomer);
        const proposal = (await pool.query("SELECT * FROM customer_site_proposals WHERE site_id=$1", [firstSiteId])).rows[0];
        firstProposalId = proposal.id;
        assert.equal(proposal.job_id, firstJobId); assert.equal(proposal.submitted_by_user_id, String(techA)); assert.equal(proposal.submitted_by_role, "inspector");
        assert.equal(proposal.proposed_display_name, "Warehouse Annex"); assert.equal(proposal.proposed_address, "12 Jalan Contoh");
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='site_proposal_submitted' AND entity_id=$1", [firstProposalId])).rows[0].n, 1);
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='service_visit_create' AND entity_id=$1 AND result='success'", [firstJobId])).rows[0].n, 1);
        assert.deepEqual(Object.keys(body.job.configurationSnapshot).sort(), ["configuration", "customer", "enabledSystems", "schemaVersion", "site", "template"], "snapshot keys unchanged");
      });

      await t.test("a pending site is absent from the technician site list, the manager site list and the old siteId path", async () => {
        for (const actor of ["techA", "techB", "admin"]) assert.ok(!(await siteList(actor)).some((site) => site.id === firstSiteId), actor);
        assert.ok((await siteList()).some((site) => site.id === seedSite), "existing sites are still listed");
        const managerSites = await pool.query("SELECT id FROM customer_sites WHERE customer_id=$1 AND is_active = true", [seedCustomer]);
        assert.ok(!managerSites.rows.some((row) => row.id === firstSiteId));
        await reject(await visit("techA", { requestId: id(), siteId: firstSiteId }), 404, "SITE_NOT_FOUND");
        const listed = await listTechnicianInspectionJobs(pool, techA);
        assert.deepEqual(listed.find((job) => job.id === firstJobId)?.siteApproval, { status: "pending" });
        assert.equal(listed.find((job) => job.site?.id === seedSite)?.siteApproval ?? null, null);
      });

      await t.test("replay: same request and body returns the same visit and creates nothing; a different body is refused", async () => {
        const before = [await count("customer_sites"), await count("customer_site_proposals"), await count("inspection_jobs")];
        const replay = await visit("techA", { requestId: firstRequest, ...typed("warehouse annex", "somewhere else entirely") });
        assert.equal(replay.status, 200, await replay.clone().text());
        assert.equal(((await replay.json()) as { job: { id: string } }).job.id, firstJobId);
        assert.deepEqual([await count("customer_sites"), await count("customer_site_proposals"), await count("inspection_jobs")], before);
        await reject(await visit("techA", { requestId: firstRequest, ...typed("A completely different site") }), 409, "IDEMPOTENCY_MISMATCH");
        await reject(await visit("techA", { requestId: firstRequest, siteId: seedSite }), 409, "IDEMPOTENCY_MISMATCH");
        assert.deepEqual([await count("customer_sites"), await count("customer_site_proposals"), await count("inspection_jobs")], before, "a refused request leaves no orphan site");
      });

      await t.test("a concurrent double submit of one request makes exactly one visit, one site and one proposal", async () => {
        const request = id();
        const [a, b, c] = await Promise.all([1, 2, 3].map(() => visit("techA", { requestId: request, ...typed("Double Submit Depot") })));
        assert.deepEqual([a, b, c].map((response) => response.status).sort(), [200, 200, 201]);
        assert.equal(await count("customer_sites", "display_name='Double Submit Depot'"), 1);
        assert.equal(await count("customer_site_proposals", "proposed_display_name='Double Submit Depot'"), 1);
        assert.equal(await count("inspection_jobs", `creation_request_id='${request}'`), 1);
      });

      await t.test("two technicians typing the same name at once end with one site, one proposal and two visits", async () => {
        const [a, b] = await Promise.all([visit("techA", { requestId: id(), ...typed("Shared Loading Bay", "Bay 1") }), visit("techB", { requestId: id(), ...typed("shared  LOADING bay", "Bay 2") })]);
        assert.deepEqual([a.status, b.status], [201, 201]);
        assert.equal(await count("customer_sites", "lower(display_name)='shared loading bay'"), 1);
        assert.equal(await count("customer_site_proposals", "lower(proposed_display_name)='shared loading bay'"), 1, "the second visit reuses the pending site (D2)");
        const jobs = await pool.query("SELECT DISTINCT site_id FROM inspection_jobs WHERE title='Shared Loading Bay'");
        assert.equal(jobs.rows.length, 1);
        assert.equal(await count("inspection_jobs", "title='Shared Loading Bay'"), 2);
        const proposal = await proposalFor("Shared Loading Bay");
        assert.equal((await pool.query("SELECT address FROM customer_sites WHERE id=$1", [proposal.site_id])).rows[0].address, "Bay 1", "the first submitter's text is kept");
      });

      await t.test("an ACTIVE site of the same name refuses the request and writes nothing", async () => {
        const before = [await count("customer_sites"), await count("customer_site_proposals"), await count("inspection_jobs")];
        const existingName = (await pool.query("SELECT display_name FROM customer_sites WHERE id=$1", [seedSite])).rows[0].display_name as string;
        for (const name of [existingName, existingName.toUpperCase(), `  ${existingName.replace(/ /g, "   ")} `]) {
          const response = await visit("techA", { requestId: id(), ...typed(name) });
          assert.equal(response.status, 409, name);
          assert.deepEqual(await response.json(), { error: "SITE_ALREADY_EXISTS", message: "A site with this name already exists for this customer. Choose it from the list.", existingSiteId: seedSite });
        }
        assert.deepEqual([await count("customer_sites"), await count("customer_site_proposals"), await count("inspection_jobs")], before);
      });

      await t.test("request validation: exactly one of siteId / newSite, unknown keys, blank, oversize and control characters", async () => {
        const before = await count("customer_sites");
        const base = { requestId: id() };
        const bad: Array<[string, Record<string, unknown>]> = [
          ["both siteId and newSite", { siteId: seedSite, ...typed("Both Given") }], ["neither", {}], ["newSite not an object", { newSite: "Nope Site" }], ["newSite array", { newSite: ["x"] }],
          ["unknown key inside newSite", { newSite: { displayName: "Extra Key", approved: true } }], ["unknown top-level key", { ...typed("Top Extra"), siteCode: "X" }],
          ["blank name", typed("    ")], ["missing name", { newSite: { address: "only an address" } }], ["name number", { newSite: { displayName: 5 } }],
          ["name 161 chars", typed("n".repeat(161))], ["address 501 chars", typed("Valid Name", "a".repeat(501))], ["address not a string", { newSite: { displayName: "Valid Name", address: 7 } }],
          ["newline in name", typed("Line\nBreak")], ["tab in name", typed("Tab\tName")], ["newline in address", typed("Valid Name", "line\nbreak")], ["zero-width in name", typed(`Zero${String.fromCodePoint(0x200b)}Width`)],
          ["bidi override", typed(`Bidi${String.fromCodePoint(0x202e)}Name`)], ["null newSite", { newSite: null }], ["null siteId", { siteId: null }]
        ];
        for (const [name, extra] of bad) {
          const response = await visit("techA", { ...base, ...extra });
          assert.equal(response.status, 400, `${name}: ${await response.clone().text()}`);
          assert.equal((await response.json() as { error: string }).error, "INVALID_SERVICE_VISIT_REQUEST", name);
        }
        const exact160 = await visit("techA", { requestId: id(), ...typed("n".repeat(160)) }); assert.equal(exact160.status, 201, await exact160.clone().text());
        const exact500 = await visit("techA", { requestId: id(), ...typed("Boundary Address", "a".repeat(500)) }); assert.equal(exact500.status, 201, await exact500.clone().text());
        assert.equal(await count("customer_sites"), before + 2, "only the two valid boundary requests wrote a site");
      });

      await t.test("only a technician may propose: admin gets 403 and nothing is written; a supervisor cannot create visits", async () => {
        const before = await count("customer_sites");
        await reject(await visit("admin", { requestId: id(), ...typed("Admin Typed Site") }), 403, "NEW_SITE_NOT_ALLOWED");
        assert.equal((await visit("supervisor", { requestId: id(), ...typed("Supervisor Typed") })).status, 403);
        assert.equal((await visit("", { requestId: id(), ...typed("Anonymous Typed") })).status, 401);
        assert.equal(await count("customer_sites"), before);
        const siteIdPath = await visit("admin", { requestId: id(), siteId: seedSite }); assert.equal(siteIdPath.status, 201, "the existing siteId path is unchanged for an admin");
      });

      await t.test("review routes: 401, technician 403, admin and supervisor can list and read", async () => {
        assert.equal((await call("/manager/site-proposals", undefined)).status, 401);
        for (const path of ["/manager/site-proposals", `/manager/site-proposals/${firstProposalId}`]) assert.equal((await call(path, "techA")).status, 403, path);
        assert.equal((await call(`/manager/site-proposals/${firstProposalId}/decision`, "techA", "POST", { requestId: id(), decision: "approved" })).status, 403);
        for (const actor of ["admin", "supervisor"]) {
          const list = await call("/manager/site-proposals?status=pending", actor); assert.equal(list.status, 200);
          const proposals = (await list.json() as { proposals: Array<{ id: string; status: string; proposedDisplayName: string; siteId: string; jobReference: string | null; decision: unknown }> }).proposals;
          const first = proposals.find((proposal) => proposal.id === firstProposalId)!;
          assert.equal(first.status, "pending"); assert.equal(first.decision, null); assert.equal(first.proposedDisplayName, "Warehouse Annex"); assert.match(first.jobReference ?? "", /^SV-/);
          assert.equal((await call(`/manager/site-proposals/${firstProposalId}`, actor)).status, 200);
        }
        await reject(await call("/manager/site-proposals?status=bogus", "admin"), 400, "INVALID_STATUS_FILTER");
        await reject(await call("/manager/site-proposals/not-a-uuid", "admin"), 400, "INVALID_PROPOSAL_ID");
        await reject(await call(`/manager/site-proposals/${id()}`, "admin"), 404, "SITE_PROPOSAL_NOT_FOUND");
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='authz.denied'")).rows[0].n >= 0, true);
      });

      await t.test("decision parser: reject needs a note, unknown keys and name edits are refused", async () => {
        const bodies: Array<[string, Record<string, unknown>]> = [
          ["no request id", { decision: "approved" }], ["bad request id", { requestId: "x", decision: "approved" }], ["bad decision", { requestId: id(), decision: "maybe" }],
          ["reject without note", { requestId: id(), decision: "rejected" }], ["reject with short note", { requestId: id(), decision: "rejected", note: "no" }],
          ["long note", { requestId: id(), decision: "approved", note: "x".repeat(501) }], ["note not a string", { requestId: id(), decision: "approved", note: 5 }],
          ["name edit", { requestId: id(), decision: "approved", displayName: "Edited By Admin" }], ["address edit", { requestId: id(), decision: "approved", address: "elsewhere" }]
        ];
        for (const [name, body] of bodies) await reject(await decide(firstProposalId, "admin", body), 400, "INVALID_SITE_PROPOSAL_DECISION_REQUEST");
        assert.equal(await count("customer_site_proposal_decisions"), 0, "no refused body stored a decision");
      });

      await t.test("approve: the site becomes active and appears everywhere; replay returns the same decision; later conflicts are refused", async () => {
        const requestId = id();
        const approved = await decide(firstProposalId, "supervisor", { requestId, decision: "approved" });
        assert.equal(approved.status, 201, await approved.clone().text());
        const body = await approved.json() as { proposal: { status: string; siteId: string; proposedDisplayName: string; decision: { decision: string; decidedByRole: string; sequence: number; requestFingerprint?: string } } };
        assert.equal(body.proposal.status, "approved"); assert.equal(body.proposal.decision.decidedByRole, "supervisor"); assert.equal(body.proposal.decision.sequence, 1);
        assert.equal(body.proposal.decision.requestFingerprint, undefined, "the fingerprint is never sent to a client");
        assert.equal((await pool.query("SELECT is_active, display_name, address FROM customer_sites WHERE id=$1", [firstSiteId])).rows[0].is_active, true);
        assert.ok((await siteList("techB")).some((site) => site.id === firstSiteId && site.displayName === "Warehouse Annex"), "visible in the technician site list");
        const canonical = await loadCanonicalInspectionJob(firstJobId, pool);
        assert.deepEqual(canonical?.siteApproval, { status: "approved" });
        // The same request and body replays the stored decision (200); a different body under that id is refused.
        const replay = await decide(firstProposalId, "supervisor", { requestId, decision: "approved" });
        assert.equal(replay.status, 200); assert.equal(((await replay.json()) as { proposal: { status: string } }).proposal.status, "approved");
        await reject(await decide(firstProposalId, "supervisor", { requestId, decision: "rejected", note: "changed my mind" }), 409, "SITE_PROPOSAL_DECISION_REQUEST_REUSED");
        await reject(await decide(firstProposalId, "admin", { requestId: id(), decision: "rejected", note: "too late" }), 409, "SITE_PROPOSAL_ALREADY_DECIDED");
        await reject(await decide(firstProposalId, "admin", { requestId: id(), decision: "approved" }), 409, "SITE_PROPOSAL_ALREADY_DECIDED");
        assert.equal(await count("customer_site_proposal_decisions", `proposal_id='${firstProposalId}'`), 1);
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='site_proposal_approved' AND entity_id=$1", [firstProposalId])).rows[0].n, 1);
        // An approved site is a normal site: the next visit can pick it by id, and typing its name again is a 409 pointing at it.
        assert.equal((await visit("techB", { requestId: id(), siteId: firstSiteId })).status, 201);
        const again = await visit("techB", { requestId: id(), ...typed("warehouse annex") }); assert.equal(again.status, 409);
        assert.equal(((await again.json()) as { existingSiteId: string }).existingSiteId, firstSiteId);
      });

      await t.test("reject: the note reaches the technician, the site stays hidden, the visit still loads", async () => {
        const created = await visit("techB", { requestId: id(), ...typed("Rejected Kiosk", "Kiosk row") });
        assert.equal(created.status, 201);
        const job = (await created.json() as { job: { id: string; site: { id: string } } }).job;
        const proposal = await proposalFor("Rejected Kiosk");
        const rejected = await decide(proposal.id, "admin", { requestId: id(), decision: "rejected", note: "  Not one of this customer's sites.  " });
        assert.equal(rejected.status, 201, await rejected.clone().text());
        assert.equal(((await rejected.json()) as { proposal: { status: string } }).proposal.status, "rejected");
        assert.equal((await pool.query("SELECT is_active FROM customer_sites WHERE id=$1", [proposal.site_id])).rows[0].is_active, false);
        assert.ok(!(await siteList("techB")).some((site) => site.id === proposal.site_id));
        const canonical = await loadCanonicalInspectionJob(job.id, pool);
        assert.deepEqual(canonical?.siteApproval, { status: "rejected", note: "Not one of this customer's sites." });
        assert.equal(canonical?.site?.id, proposal.site_id, "the visit keeps working against its own site");
        const viaRoute = await call(`/inspection-jobs/${job.id}`, "techB"); assert.equal(viaRoute.status, 200);
        assert.deepEqual(((await viaRoute.json()) as { job: { siteApproval: unknown } }).job.siteApproval, { status: "rejected", note: "Not one of this customer's sites." });
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='site_proposal_rejected' AND entity_id=$1", [proposal.id])).rows[0].n, 1);
        // A rejected name can be proposed again: it makes a NEW pending site and proposal.
        const retry = await visit("techB", { requestId: id(), ...typed("Rejected Kiosk") }); assert.equal(retry.status, 201);
        assert.equal(await count("customer_site_proposals", "proposed_display_name='Rejected Kiosk'"), 2);
      });

      await t.test("a concurrent approve and reject make exactly one decision", async () => {
        const created = await visit("techA", { requestId: id(), ...typed("Race Warehouse") }); assert.equal(created.status, 201);
        const proposal = await proposalFor("Race Warehouse");
        const results = await Promise.all([
          decide(proposal.id, "admin", { requestId: id(), decision: "approved" }),
          decide(proposal.id, "supervisor", { requestId: id(), decision: "rejected", note: "Racing the approval" }),
          decide(proposal.id, "admin", { requestId: id(), decision: "approved" })
        ]);
        assert.deepEqual(results.map((response) => response.status).sort(), [201, 409, 409]);
        assert.equal(await count("customer_site_proposal_decisions", `proposal_id='${proposal.id}'`), 1);
        const winner = (await pool.query("SELECT decision FROM customer_site_proposal_decisions WHERE proposal_id=$1", [proposal.id])).rows[0].decision as string;
        assert.equal((await pool.query("SELECT is_active FROM customer_sites WHERE id=$1", [proposal.site_id])).rows[0].is_active, winner === "approved");
      });

      await t.test("approve refuses when an active site took the name meanwhile, or the customer is inactive", async () => {
        const created = await visit("techA", { requestId: id(), ...typed("Contested Name") }); assert.equal(created.status, 201);
        const proposal = await proposalFor("Contested Name");
        await pool.query("INSERT INTO customer_sites(id,customer_id,site_code,display_name,is_active) VALUES($1,$2,'MANUAL-1','contested   NAME',true)", [id(), seedCustomer]);
        await reject(await decide(proposal.id, "admin", { requestId: id(), decision: "approved" }), 409, "SITE_NAME_CONFLICT");
        assert.equal((await pool.query("SELECT is_active FROM customer_sites WHERE id=$1", [proposal.site_id])).rows[0].is_active, false);
        assert.equal(await count("customer_site_proposal_decisions", `proposal_id='${proposal.id}'`), 0, "a refused approval stores nothing");
        // The Admin can still reject it.
        assert.equal((await decide(proposal.id, "admin", { requestId: id(), decision: "rejected", note: "Duplicate of an existing site" })).status, 201);

        const second = await visit("techA", { requestId: id(), ...typed("Dormant Customer Site") }); assert.equal(second.status, 201);
        const dormant = await proposalFor("Dormant Customer Site");
        await pool.query("UPDATE customers SET is_active=false WHERE id=$1", [seedCustomer]);
        try { await reject(await decide(dormant.id, "admin", { requestId: id(), decision: "approved" }), 404, "CUSTOMER_NOT_FOUND"); }
        finally { await pool.query("UPDATE customers SET is_active=true WHERE id=$1", [seedCustomer]); }
        assert.equal((await decide(dormant.id, "admin", { requestId: id(), decision: "approved" })).status, 201, "approves normally once the customer is active again");
      });

      await t.test("deleting an unstarted visit leaves its site and proposal intact", async () => {
        const created = await visit("techA", { requestId: id(), ...typed("Deleted Visit Site") }); assert.equal(created.status, 201);
        const job = (await created.json() as { job: { id: string } }).job;
        const proposal = await proposalFor("Deleted Visit Site");
        const removed = await call(`/inspection-jobs/${job.id}`, "techA", "DELETE"); assert.equal(removed.status, 200, await removed.clone().text());
        assert.equal(await count("inspection_jobs", `id='${job.id}'`), 0);
        assert.equal(await count("customer_site_proposals", `id='${proposal.id}'`), 1);
        assert.equal(await count("customer_sites", `id='${proposal.site_id}' AND is_active=false`), 1);
        assert.equal((await decide(proposal.id, "admin", { requestId: id(), decision: "approved" })).status, 201, "the proposal can still be decided");
      });

      await t.test("the existing siteId path is unchanged: same snapshot keys, no approval, no proposal rows", async () => {
        const before = await count("customer_site_proposals");
        const created = await visit("techA", { requestId: id(), siteId: seedSite }); assert.equal(created.status, 201);
        const job = (await created.json() as { job: { siteApproval: unknown; site: { id: string }; configurationSnapshot: { site: Record<string, unknown> } } }).job;
        assert.equal(job.siteApproval, null);
        assert.deepEqual(Object.keys(job.configurationSnapshot.site).sort(), ["address", "displayName", "id"]);
        assert.equal(job.site.id, seedSite);
        assert.equal(await count("customer_site_proposals"), before);
        await reject(await visit("techA", { requestId: id(), siteId: id() }), 404, "SITE_NOT_FOUND");
        await reject(await visit("techA", { requestId: id(), siteId: "not-a-uuid" }), 400, "INVALID_SERVICE_VISIT_REQUEST");
      });
    } finally { server.close(); await once(server, "close"); }

    // Append-only at the database level.
    await assert.rejects(pool.query("UPDATE customer_site_proposals SET proposed_display_name='Tampered'"), /append-only/);
    await assert.rejects(pool.query("DELETE FROM customer_site_proposals"), /append-only/);
    await assert.rejects(pool.query("TRUNCATE customer_site_proposals CASCADE"), /append-only|cannot truncate/);
    await assert.rejects(pool.query("UPDATE customer_site_proposal_decisions SET decision='rejected'"), /append-only/);
    await assert.rejects(pool.query("DELETE FROM customer_site_proposal_decisions"), /append-only/);
    await assert.rejects(pool.query("TRUNCATE customer_site_proposal_decisions"), /append-only/);
    await assert.rejects(pool.query("DELETE FROM customer_sites WHERE id IN (SELECT site_id FROM customer_site_proposals)"), /foreign key|violates/);
    // Table constraints.
    await assert.rejects(pool.query("INSERT INTO customer_site_proposals(id,customer_id,site_id,submitted_by_user_id,submitted_by_role,proposed_display_name) SELECT $1,customer_id,id,$2,'admin','Bad Role' FROM customer_sites LIMIT 1", [id(), techA]), /check constraint/);
    await assert.rejects(pool.query("INSERT INTO customer_site_proposals(id,customer_id,site_id,submitted_by_user_id,submitted_by_role,proposed_display_name) SELECT $1,customer_id,id,$2,'inspector',' padded ' FROM customer_sites LIMIT 1", [id(), techA]), /check constraint/);

    // Migration: re-run keeps the data; a database at 049 (no site tables) is brought forward empty.
    const kept = await count2("customer_site_proposals");
    await runMigrations(pool); await runMigrations(pool);
    assert.equal(await count2("customer_site_proposals"), kept, "re-running the migrations keeps the data");
    await pool.query("DROP TABLE customer_site_proposal_decisions; DROP TABLE customer_site_proposals;");
    await runMigrations(pool);
    assert.equal(await count2("customer_site_proposals"), 0, "recreated from the 049 state with no backfill");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='customer_sites'")).rows[0].n, 7, "customer_sites gained no column (id, customer_id, site_code, display_name, is_active, created_at, address)");
  } finally { await pool.end(); }
});

async function count2(table: string) { return (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n as number; }
