import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import type { Pool, PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireExpectedActor } from "../jobs/technicianOwnership.js";
import { canonicalJson } from "../corrections/inspectionCorrections.js";
import { deriveLocationProposalState, listLocationProposals, loadLocationProposal, loadLocationProposalDecisions } from "../inspections/locationProposal.js";
import { LocationProposalError, publicProposal } from "./locationProposals.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createTechnicianLocationProposalsRouter(database: Pick<Pool, "query" | "connect"> = pool) {
  const router = Router();
  router.get("/technician/location-proposals", requireRole("inspector"), async (request, response, next) => {
    try {
      if (Object.keys(request.query).some((key) => key !== "jobId")
        || typeof request.query.jobId !== "string" || !uuid.test(request.query.jobId)) {
        throw new LocationProposalError("INVALID_JOB_ID", "A valid jobId is required.", 400);
      }
      const { proposals } = await listLocationProposals(database, undefined, request.currentUser!.id, request.query.jobId);
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ proposals: proposals.map(publicProposal) });
    } catch (error) { next(error); }
  });
  router.post("/technician/location-proposals/:id/withdraw", requireRole("inspector"),
    requireExpectedActor("technician_location_proposal_withdrawn", "customer_location_proposal"), async (request, response, next) => {
      let client: PoolClient | undefined;
      try {
        const rawId = request.params.id;
        const body: unknown = request.body;
        if (typeof rawId !== "string" || !uuid.test(rawId) || !body || typeof body !== "object" || Array.isArray(body)
          || Object.keys(body).length !== 1 || !("requestId" in body) || typeof body.requestId !== "string" || !uuid.test(body.requestId)) {
          throw new LocationProposalError("INVALID_LOCATION_PROPOSAL_WITHDRAW_REQUEST", "A valid proposal and requestId are required.", 400);
        }
        const id = rawId.toLowerCase(), requestId = body.requestId.toLowerCase();
        const fingerprint = createHash("sha256").update(canonicalJson({ proposalId: id, decision: "withdrawn", actorId: request.currentUser!.id })).digest("hex");
        client = await database.connect();
        await client.query("BEGIN");
        const proposal = await loadLocationProposal(client, id);
        if (!proposal || proposal.submittedByUserId !== request.currentUser!.id) {
          throw new LocationProposalError("LOCATION_PROPOSAL_NOT_FOUND", "Location proposal was not found.", 404);
        }
        await client.query("SELECT pg_advisory_xact_lock(hashtext('location_proposal_decision:' || $1))", [id]);
        const decisions = await loadLocationProposalDecisions(client, id);
        const replay = decisions.find((decision) => decision.requestId === requestId);
        if (replay && replay.requestFingerprint !== fingerprint) {
          throw new LocationProposalError("LOCATION_PROPOSAL_DECISION_REQUEST_REUSED", "This request ID was already used for a different decision.", 409);
        }
        if (!replay && decisions.length) {
          throw new LocationProposalError("LOCATION_PROPOSAL_ALREADY_DECIDED", "This location proposal has already been decided.", 409);
        }
        if (!replay) {
          await client.query(`INSERT INTO customer_location_proposal_decisions
            (id, proposal_id, decision, decided_by_user_id, decided_by_role, sequence, request_id, request_fingerprint)
            VALUES ($1,$2,'withdrawn',$3,'inspector',1,$4,$5)`, [randomUUID(), id, request.currentUser!.id, requestId, fingerprint]);
          await client.query(`INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,result)
            VALUES ($1,'technician_location_proposal_withdrawn','customer_location_proposal',$2,'success')`, [request.currentUser!.id, id]);
        }
        const stored = replay ? decisions : await loadLocationProposalDecisions(client, id);
        await client.query("COMMIT");
        response.setHeader("Cache-Control", "private, no-store");
        response.status(replay ? 200 : 201).json({ proposal: publicProposal({ ...proposal, ...deriveLocationProposalState(stored) }) });
      } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); } finally { client?.release(); }
    });
  router.use((error: unknown, _request: import("express").Request, response: import("express").Response, next: import("express").NextFunction) => {
    if (error instanceof LocationProposalError) { response.status(error.status).json({ error: error.code, message: error.message }); return; }
    next(error);
  });
  return router;
}
export const technicianLocationProposalsRouter = createTechnicianLocationProposalsRouter();
