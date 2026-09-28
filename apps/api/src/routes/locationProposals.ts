import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import type { Pool, PoolClient } from "pg";
import type { UserRole } from "../auth/authTypes.js";
import { canonicalJson } from "../corrections/inspectionCorrections.js";
import { pool } from "../db/pool.js";
import { requireRole, requireRoleAudited } from "../middleware/requireRole.js";
import { requireExpectedActor } from "../jobs/technicianOwnership.js";
import {
  locationConfigurableSystemKeys, parseLocationConfigurationInput, type LocationConfigurationInput
} from "../inspections/locationConfiguration.js";
import {
  deriveLocationProposalState, listLocationProposals, loadLocationProposal, loadLocationProposalDecisions,
  type LocationProposalDecisionEvent, type LocationProposalRecord, type LocationProposalState, type LocationProposalStatus
} from "../inspections/locationProposal.js";
import { applyManagerLocationsUpdate, ManagerCustomerError } from "./managerCustomers.js";

/**
 * Technician-proposed, Supervisor/Admin-approved customer zone/location configuration
 * (docs: the location-proposal design confirmed with the owner). A technician drafts the real
 * zone/location breakdown on-site (offline-capable via `technicianLocationProposalDraft.ts`), it
 * flows here for review, and Approve reuses `applyManagerLocationsUpdate` -- the exact write path a
 * Manager's own edit performs -- so an approved proposal becomes the customer's real, versioned
 * configuration. Both decisions are terminal: no withdraw, no re-decision.
 */
export class LocationProposalError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Database = Pick<Pool, "query" | "connect">;
type Queryable = Pick<Pool | PoolClient, "query">;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProposalTarget(request: { params: Record<string, unknown> }) {
  const customerId = request.params.customerId;
  const systemKey = request.params.systemKey;
  if (typeof customerId !== "string" || !uuidPattern.test(customerId)) {
    throw new LocationProposalError("INVALID_CUSTOMER_ID", "Customer id is invalid.", 400);
  }
  if (typeof systemKey !== "string" || !locationConfigurableSystemKeys.has(systemKey)) {
    throw new LocationProposalError("LOCATION_PROPOSALS_UNSUPPORTED_SYSTEM", "Location proposals are not supported for this system.", 404);
  }
  return { customerId, systemKey };
}

function parseSubmissionBody(body: unknown): { id: string; jobId: string; parsed: LocationConfigurationInput } {
  const invalid = (message: string) => new LocationProposalError("INVALID_LOCATION_PROPOSAL_REQUEST", message, 400);
  if (!object(body)) throw invalid("Request body is invalid.");
  const allowed = ["id", "jobId", "zones", "locations"];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw invalid("Request body is invalid.");
  if (typeof body.id !== "string" || !uuidPattern.test(body.id)) throw invalid("id must be a valid UUID.");
  if (typeof body.jobId !== "string" || !uuidPattern.test(body.jobId)) throw invalid("jobId must be a valid UUID.");
  const parsed = parseLocationConfigurationInput({ zones: body.zones, locations: body.locations });
  if (!parsed) throw invalid("The zone/location payload is invalid for this system.");
  return { id: body.id.toLowerCase(), jobId: body.jobId.toLowerCase(), parsed };
}

function submissionFingerprint(customerId: string, systemKey: string, jobId: string | null, payload: LocationConfigurationInput) {
  return createHash("sha256").update(canonicalJson({
    customerId: customerId.toLowerCase(), systemKey, jobId, payload
  })).digest("hex");
}

type ParsedDecisionBody = { requestId: string; decision: "approved" | "rejected"; note: string | undefined };

function parseDecisionBody(body: unknown): ParsedDecisionBody {
  const invalid = (message: string) => new LocationProposalError("INVALID_LOCATION_PROPOSAL_DECISION_REQUEST", message, 400);
  if (!object(body)) throw invalid("Request body is invalid.");
  const allowed = ["requestId", "decision", "note"];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw invalid("Request body is invalid.");
  if (typeof body.requestId !== "string" || !uuidPattern.test(body.requestId)) throw invalid("A request ID is required.");
  if (body.decision !== "approved" && body.decision !== "rejected") throw invalid('decision must be "approved" or "rejected".');
  let note: string | undefined;
  if (body.note !== undefined) {
    if (typeof body.note !== "string" || body.note.trim().length < 3 || body.note.trim().length > 500) {
      throw invalid("A note of 3-500 characters is required.");
    }
    note = body.note.trim();
  }
  if (body.decision === "rejected" && note === undefined) throw invalid("A note is required to reject a location proposal.");
  return { requestId: body.requestId.toLowerCase(), decision: body.decision, note };
}

const publicDecision = ({ requestFingerprint: _fingerprint, ...decision }: LocationProposalDecisionEvent) => decision;

function publicProposal(proposal: LocationProposalRecord & LocationProposalState) {
  const { payload, decision, status } = proposal;
  return {
    id: proposal.id, customerId: proposal.customerId, customerDisplayName: proposal.customerDisplayName,
    systemKey: proposal.systemKey, jobId: proposal.jobId,
    submittedByUserId: proposal.submittedByUserId, submittedBy: proposal.submittedBy, submittedByRole: proposal.submittedByRole,
    submittedAt: proposal.submittedAt,
    zoneCount: payload.zones.length, locationCount: payload.locations.length,
    payload,
    status, decision: decision ? publicDecision(decision) : null
  };
}

async function requireProposal(database: Queryable, id: string): Promise<LocationProposalRecord> {
  const proposal = await loadLocationProposal(database, id);
  if (!proposal) throw new LocationProposalError("LOCATION_PROPOSAL_NOT_FOUND", "Location proposal was not found.", 404);
  return proposal;
}

export function createLocationProposalsRouter(database: Database = pool) {
  const router = Router();
  const requireManagerRole = (...roles: UserRole[]) => requireRoleAudited(database, ...roles);

  router.post(
    "/technician/customers/:customerId/systems/:systemKey/location-proposals",
    requireRole("inspector"),
    requireExpectedActor("technician_location_proposal_submitted", "customer_location_proposal"),
    async (request, response, next) => {
      let client: PoolClient | undefined;
      try {
        const { customerId, systemKey } = parseProposalTarget(request);
        const { id, jobId, parsed } = parseSubmissionBody(request.body);
        const fingerprint = submissionFingerprint(customerId, systemKey, jobId, parsed);
        client = await database.connect();
        await client.query("BEGIN");

        // Idempotent replay check first, mirroring reportApprovals.ts: a retry of the
        // same client-generated id short-circuits before any domain-state check.
        const existing = await client.query<{
          customerId: string; systemKey: string; jobId: string; submittedByUserId: number; payload: LocationConfigurationInput;
        }>(`SELECT customer_id AS "customerId", system_key AS "systemKey", job_id AS "jobId",
              submitted_by_user_id::int AS "submittedByUserId", payload
            FROM customer_location_proposals WHERE id = $1`, [id]);
        if (existing.rows[0]) {
          const row = existing.rows[0];
          if (row.submittedByUserId !== request.currentUser!.id) {
            throw new LocationProposalError("LOCATION_PROPOSAL_NOT_FOUND", "Location proposal was not found.", 404);
          }
          const existingFingerprint = submissionFingerprint(row.customerId, row.systemKey, row.jobId, row.payload);
          if (existingFingerprint !== fingerprint) {
            throw new LocationProposalError("LOCATION_PROPOSAL_REQUEST_REUSED", "This request ID was already used for a different proposal.", 409);
          }
          await client.query("COMMIT");
          const proposal = await requireProposal(database, id);
          const decisions = await loadLocationProposalDecisions(database, id);
          response.status(200).json({ proposal: publicProposal({ ...proposal, ...deriveLocationProposalState(decisions) }) });
          return;
        }

        const owner = await client.query(`SELECT id FROM customers WHERE id=$1 AND is_active AND NOT is_demo`, [customerId]);
        if (!owner.rows[0]) throw new LocationProposalError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
        const job = await client.query(`SELECT id FROM inspection_jobs
          WHERE id=$1 AND customer_id=$2 AND created_by_user_id=$3 AND is_sample=false
            AND configuration_snapshot->'enabledSystems' @> jsonb_build_array(jsonb_build_object('systemKey',$4::text))`,
          [jobId, customerId, request.currentUser!.id, systemKey]);
        if (!job.rows[0]) throw new LocationProposalError("JOB_NOT_FOUND", "Service visit was not found.", 404);

        // One pending proposal at a time per (customer, systemKey), serialised so two
        // concurrent submissions cannot both observe "no pending proposal".
        await client.query("SELECT pg_advisory_xact_lock(hashtext('location_proposal:' || $1 || ':' || $2))", [customerId, systemKey]);
        const pending = await client.query(`
          SELECT proposal.id FROM customer_location_proposals proposal
          WHERE proposal.customer_id = $1 AND proposal.system_key = $2
            AND NOT EXISTS (SELECT 1 FROM customer_location_proposal_decisions decision WHERE decision.proposal_id = proposal.id)
          LIMIT 1`, [customerId, systemKey]);
        if (pending.rows[0]) {
          throw new LocationProposalError("LOCATION_PROPOSAL_ALREADY_PENDING", "A location proposal for this customer and system is already awaiting review.", 409);
        }

        await client.query(`INSERT INTO customer_location_proposals
          (id, customer_id, system_key, job_id, submitted_by_user_id, submitted_by_role, payload)
          VALUES ($1,$2,$3,$4,$5,'inspector',$6)`,
        [id, customerId, systemKey, jobId, request.currentUser!.id, JSON.stringify(parsed)]);
        await client.query(`INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, result) VALUES ($1,'technician_location_proposal_submitted','customer_location_proposal',$2,'success')`,
          [request.currentUser!.id, id]);
        await client.query("COMMIT");
        const proposal = await requireProposal(database, id);
        response.status(201).json({ proposal: publicProposal({ ...proposal, status: "pending", decision: null }) });
      } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); } finally { client?.release(); }
    }
  );

  router.get("/manager/location-proposals", requireManagerRole("admin", "supervisor"), async (request, response, next) => {
    try {
      const statusParam = request.query.status;
      let status: LocationProposalStatus | undefined;
      if (statusParam !== undefined) {
        if (statusParam !== "pending" && statusParam !== "approved" && statusParam !== "rejected") {
          throw new LocationProposalError("INVALID_STATUS_FILTER", "status must be pending, approved, or rejected.", 400);
        }
        status = statusParam;
      }
      const proposals = await listLocationProposals(database, status);
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ proposals: proposals.map(publicProposal) });
    } catch (error) { next(error); }
  });

  router.get("/manager/location-proposals/:id", requireManagerRole("admin", "supervisor"), async (request, response, next) => {
    try {
      const id = request.params.id;
      if (typeof id !== "string" || !uuidPattern.test(id)) throw new LocationProposalError("INVALID_PROPOSAL_ID", "Proposal id is invalid.", 400);
      const proposal = await requireProposal(database, id);
      const decisions = await loadLocationProposalDecisions(database, id);
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ proposal: publicProposal({ ...proposal, ...deriveLocationProposalState(decisions) }) });
    } catch (error) { next(error); }
  });

  router.post("/manager/location-proposals/:id/decision", requireManagerRole("admin", "supervisor"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const id = request.params.id;
      if (typeof id !== "string" || !uuidPattern.test(id)) throw new LocationProposalError("INVALID_PROPOSAL_ID", "Proposal id is invalid.", 400);
      const input = parseDecisionBody(request.body);
      const fingerprint = createHash("sha256").update(canonicalJson({
        proposalId: id.toLowerCase(), decision: input.decision, note: input.note ?? null
      })).digest("hex");
      client = await database.connect();
      await client.query("BEGIN");
      const proposal = await requireProposal(client, id);
      // Serialise decisions per proposal without writing (or row-locking) the proposal row.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('location_proposal_decision:' || $1))", [id]);
      const existing = await loadLocationProposalDecisions(client, id);
      const replay = existing.find((event) => event.requestId === input.requestId);
      if (replay) {
        if (replay.requestFingerprint !== fingerprint) {
          throw new LocationProposalError("LOCATION_PROPOSAL_DECISION_REQUEST_REUSED", "This request ID was already used for a different decision.", 409);
        }
        await client.query("COMMIT");
        response.status(200).json({ proposal: publicProposal({ ...proposal, ...deriveLocationProposalState(existing) }) });
        return;
      }
      if (existing.length > 0) {
        throw new LocationProposalError("LOCATION_PROPOSAL_ALREADY_DECIDED", "This location proposal has already been decided.", 409);
      }
      let resultingRevisionId: string | null = null;
      if (input.decision === "approved") {
        // The exact write a Manager's own edit performs, re-validated against current
        // customer state -- never trusting the state the proposal was drafted against.
        resultingRevisionId = await applyManagerLocationsUpdate(client, proposal.customerId, proposal.systemKey, proposal.payload, request.currentUser!.id);
      }
      const decisionId = randomUUID();
      await client.query(`INSERT INTO customer_location_proposal_decisions
        (id, proposal_id, decision, note, decided_by_user_id, decided_by_role, sequence, resulting_revision_id, request_id, request_fingerprint)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [decisionId, id, input.decision, input.note ?? null, request.currentUser!.id, request.currentUser!.role, existing.length + 1, resultingRevisionId, input.requestId, fingerprint]);
      await client.query(`INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, result, reason) VALUES ($1,$2,'customer_location_proposal',$3,'success',$4)`,
        [request.currentUser!.id, input.decision === "approved" ? "location_proposal_approved" : "location_proposal_rejected", id, input.note ?? ""]);
      await client.query("COMMIT");
      const stored = await loadLocationProposalDecisions(database, id);
      response.status(201).json({ proposal: publicProposal({ ...proposal, ...deriveLocationProposalState(stored) }) });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); } finally { client?.release(); }
  });

  router.use((error: unknown, _request: import("express").Request, response: import("express").Response, next: import("express").NextFunction) => {
    if (error instanceof LocationProposalError) { response.status(error.status).json({ error: error.code, message: error.message }); return; }
    if (error instanceof ManagerCustomerError) { response.status(error.status).json({ error: error.code, message: error.message }); return; }
    next(error);
  });
  return router;
}

export const locationProposalsRouter = createLocationProposalsRouter();
