import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import type { Pool, PoolClient } from "pg";
import { canonicalJson } from "../corrections/inspectionCorrections.js";
import { pool } from "../db/pool.js";
import {
  deriveSiteProposalState, listSiteProposals, loadSiteProposal, loadSiteProposalDecisions, siteNameKey, siteNameKeySql,
  type SiteProposalDecisionEvent, type SiteProposalRecord, type SiteProposalState, type SiteProposalStatus
} from "../inspections/siteProposal.js";
import { requireRoleAudited } from "../middleware/requireRole.js";

/**
 * CR-02 Phase 1: Admin review of a technician-typed site (migration 050).
 *
 * The site already exists, inactive, with exactly the text the technician typed. Approve only flips it active; it
 * never takes a name or address from the request, so the decision body cannot change what is approved (owner
 * decision D5). Reject leaves it inactive forever and records a note the technician can read (D3). Both decisions
 * are terminal. Admin and supervisor may decide (D1); technicians are refused 403 by the role gate.
 */
export class SiteProposalError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Database = Pick<Pool, "query" | "connect">;
type Queryable = Pick<Pool | PoolClient, "query">;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type ParsedDecision = { requestId: string; decision: "approved" | "rejected"; note: string | undefined };

function parseDecisionBody(body: unknown): ParsedDecision {
  const invalid = (message: string) => new SiteProposalError("INVALID_SITE_PROPOSAL_DECISION_REQUEST", message, 400);
  if (!object(body)) throw invalid("Request body is invalid.");
  if (Object.keys(body).some((key) => key !== "requestId" && key !== "decision" && key !== "note")) throw invalid("Request body is invalid.");
  if (typeof body.requestId !== "string" || !uuidPattern.test(body.requestId)) throw invalid("A request ID is required.");
  if (body.decision !== "approved" && body.decision !== "rejected") throw invalid('decision must be "approved" or "rejected".');
  let note: string | undefined;
  if (body.note !== undefined) {
    if (typeof body.note !== "string" || body.note.trim().length < 3 || body.note.trim().length > 500) throw invalid("A note of 3-500 characters is required.");
    note = body.note.trim();
  }
  if (body.decision === "rejected" && note === undefined) throw invalid("A note is required to reject a site proposal.");
  return { requestId: body.requestId.toLowerCase(), decision: body.decision, note };
}

const publicDecision = ({ requestFingerprint: _fingerprint, ...decision }: SiteProposalDecisionEvent) => decision;

function publicProposal(proposal: SiteProposalRecord & SiteProposalState) {
  const { decision, status, ...record } = proposal;
  return { ...record, status, decision: decision ? publicDecision(decision) : null };
}

async function requireProposal(database: Queryable, id: string): Promise<SiteProposalRecord> {
  const proposal = await loadSiteProposal(database, id);
  if (!proposal) throw new SiteProposalError("SITE_PROPOSAL_NOT_FOUND", "Site proposal was not found.", 404);
  return proposal;
}

function proposalId(request: Request) {
  const id = request.params.id;
  if (typeof id !== "string" || !uuidPattern.test(id)) throw new SiteProposalError("INVALID_PROPOSAL_ID", "Proposal id is invalid.", 400);
  return id.toLowerCase();
}

export function createSiteProposalsRouter(database: Database = pool) {
  const router = Router();
  const reviewers = requireRoleAudited(database, "admin", "supervisor");

  router.get("/manager/site-proposals", reviewers, async (request, response, next) => {
    try {
      const statusParam = request.query.status;
      let status: SiteProposalStatus | undefined;
      if (statusParam !== undefined) {
        if (statusParam !== "pending" && statusParam !== "approved" && statusParam !== "rejected") {
          throw new SiteProposalError("INVALID_STATUS_FILTER", "status must be pending, approved, or rejected.", 400);
        }
        status = statusParam;
      }
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ proposals: (await listSiteProposals(database, status)).map(publicProposal) });
    } catch (error) { next(error); }
  });

  router.get("/manager/site-proposals/:id", reviewers, async (request, response, next) => {
    try {
      const id = proposalId(request);
      const proposal = await requireProposal(database, id);
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ proposal: publicProposal({ ...proposal, ...deriveSiteProposalState(await loadSiteProposalDecisions(database, id)) }) });
    } catch (error) { next(error); }
  });

  router.post("/manager/site-proposals/:id/decision", reviewers, async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const id = proposalId(request);
      const input = parseDecisionBody(request.body);
      const fingerprint = createHash("sha256").update(canonicalJson({ proposalId: id, decision: input.decision, note: input.note ?? null })).digest("hex");
      client = await database.connect();
      await client.query("BEGIN");
      const proposal = await requireProposal(client, id);
      // Serialise decisions per proposal without writing (or row-locking) the proposal row.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('site_proposal_decision:' || $1))", [id]);
      const existing = await loadSiteProposalDecisions(client, id);
      const replay = existing.find((event) => event.requestId === input.requestId);
      if (replay) {
        if (replay.requestFingerprint !== fingerprint) {
          throw new SiteProposalError("SITE_PROPOSAL_DECISION_REQUEST_REUSED", "This request ID was already used for a different decision.", 409);
        }
        await client.query("COMMIT");
        response.status(200).json({ proposal: publicProposal({ ...proposal, ...deriveSiteProposalState(existing) }) });
        return;
      }
      if (existing.length > 0) throw new SiteProposalError("SITE_PROPOSAL_ALREADY_DECIDED", "This site proposal has already been decided.", 409);

      if (input.decision === "approved") {
        // Customer row first (the same order the visit-creation path takes it), so this cannot deadlock with it.
        const owner = await client.query("SELECT id FROM customers WHERE id=$1 AND is_active FOR UPDATE", [proposal.customerId]);
        if (!owner.rows[0]) throw new SiteProposalError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
        const clash = await client.query(
          `SELECT id FROM customer_sites WHERE customer_id=$1 AND is_active=true AND id<>$2 AND ${siteNameKeySql("display_name")} = $3 LIMIT 1 FOR UPDATE`,
          [proposal.customerId, proposal.siteId, siteNameKey(proposal.proposedDisplayName)]);
        if (clash.rows[0]) throw new SiteProposalError("SITE_NAME_CONFLICT", "An active site already uses this name. Reject this proposal instead.", 409);
        const activated = await client.query("UPDATE customer_sites SET is_active=true WHERE id=$1 AND customer_id=$2 AND is_active=false RETURNING id",
          [proposal.siteId, proposal.customerId]);
        if (!activated.rows[0]) throw new SiteProposalError("SITE_STATE_INVALID", "This site is not waiting for approval.", 409);
      }
      const actor = request.currentUser!;
      await client.query(`INSERT INTO customer_site_proposal_decisions
        (id, proposal_id, decision, note, decided_by_user_id, decided_by_role, sequence, request_id, request_fingerprint)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [randomUUID(), id, input.decision, input.note ?? null, actor.id, actor.role, existing.length + 1, input.requestId, fingerprint]);
      await client.query(`INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, result, reason) VALUES ($1,$2,'customer_site_proposal',$3,'success',$4)`,
        [actor.id, input.decision === "approved" ? "site_proposal_approved" : "site_proposal_rejected", id, input.note ?? ""]);
      await client.query("COMMIT");
      response.status(201).json({ proposal: publicProposal({ ...proposal, ...deriveSiteProposalState(await loadSiteProposalDecisions(database, id)) }) });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); } finally { client?.release(); }
  });

  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (error instanceof SiteProposalError) { response.status(error.status).json({ error: error.code, message: error.message }); return; }
    next(error);
  });
  return router;
}

export const siteProposalsRouter = createSiteProposalsRouter();
