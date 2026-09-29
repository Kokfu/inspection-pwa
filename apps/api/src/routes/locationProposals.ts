import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import type { Pool, PoolClient } from "pg";
import type { UserRole } from "../auth/authTypes.js";
import { canonicalJson } from "../corrections/inspectionCorrections.js";
import { pool } from "../db/pool.js";
import { requireRole, requireRoleAudited } from "../middleware/requireRole.js";
import { requireExpectedActor } from "../jobs/technicianOwnership.js";
import {
  applyLocationProposalPatch, locationConfigurableSystemKeys, parseLocationProposalPatch,
  type LocationConfigurationInput, type LocationProposalPatch
} from "../inspections/locationConfiguration.js";
import {
  deriveLocationProposalState, listLocationProposals, loadLocationProposal, loadLocationProposalDecisions,
  type LocationProposalDecisionEvent, type LocationProposalRecord, type LocationProposalState, type LocationProposalStatus
} from "../inspections/locationProposal.js";
import { applyManagerLocationsUpdate, loadConfiguration, ManagerCustomerError } from "./managerCustomers.js";

/**
 * Technician-proposed, Supervisor/Admin-approved customer zone/location configuration.
 *
 * Phase 1 redesign: a proposal no longer carries "the complete desired {zones, locations}" for a
 * system (that full-replace shape stays exactly as-is for the Manager's own
 * `PUT .../systems/:systemKey/locations`, via `applyManagerLocationsUpdate`, unchanged). Instead a
 * proposal carries a scoped PATCH -- `add-location` (name a brand-new location; no real inspection
 * data exists for it yet) or `update-format` (save row count + per-row content from the live
 * inspection form; Roller Shutter may create its General location on first approval) -- that
 * Approve merges into whatever the customer's CURRENT state is, fetched fresh at decision time
 * (`applyLocationProposalPatch`). This is what makes proposing something offline-safe (a technician
 * never needs to know the customer's current full structure) and lets two proposals targeting
 * different locations of the same system be pending, and approved, independently -- keyed by
 * `patch.locationKey`, not just `(customerId, systemKey)`. Both decisions are terminal: no withdraw,
 * no re-decision.
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

function parseSubmissionBody(body: unknown, systemKey: string): { id: string; jobId: string; patch: LocationProposalPatch } {
  const invalid = (message: string) => new LocationProposalError("INVALID_LOCATION_PROPOSAL_REQUEST", message, 400);
  if (!object(body)) throw invalid("Request body is invalid.");
  const allowed = ["id", "jobId", "patch"];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw invalid("Request body is invalid.");
  if (typeof body.id !== "string" || !uuidPattern.test(body.id)) throw invalid("id must be a valid UUID.");
  if (typeof body.jobId !== "string" || !uuidPattern.test(body.jobId)) throw invalid("jobId must be a valid UUID.");
  const patch = parseLocationProposalPatch(body.patch, systemKey);
  if (!patch) throw invalid("The proposal patch is invalid.");
  return { id: body.id.toLowerCase(), jobId: body.jobId.toLowerCase(), patch };
}

function submissionFingerprint(customerId: string, systemKey: string, jobId: string, patch: LocationProposalPatch) {
  return createHash("sha256").update(canonicalJson({
    customerId: customerId.toLowerCase(), systemKey, jobId, patch
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
  const { decision, status } = proposal;
  return {
    id: proposal.id, customerId: proposal.customerId, customerDisplayName: proposal.customerDisplayName,
    systemKey: proposal.systemKey, jobId: proposal.jobId,
    submittedByUserId: proposal.submittedByUserId, submittedBy: proposal.submittedBy, submittedByRole: proposal.submittedByRole,
    submittedAt: proposal.submittedAt,
    payload: proposal.payload,
    status, decision: decision ? publicDecision(decision) : null
  };
}

async function requireProposal(database: Queryable, id: string): Promise<LocationProposalRecord> {
  const proposal = await loadLocationProposal(database, id);
  if (!proposal) throw new LocationProposalError("LOCATION_PROPOSAL_NOT_FOUND", "Location proposal was not found.", 404);
  return proposal;
}

/** This system's current `{zones, locations}`, in the same shape `applyLocationProposalPatch`/
 *  `applyManagerLocationsUpdate` expect -- extracted from `loadConfiguration`'s full (all systems)
 *  result. Mirrors `loadLocationsContext`'s posture in `managerCustomers.ts`: a not-yet-enabled system
 *  resolves to an empty set (an add-location patch, or Roller Shutter's first General format,
 *  gives it authority),
 *  never a 404. */
function extractSystemLocations(
  configuration: Awaited<ReturnType<typeof loadConfiguration>>, systemKey: string
): LocationConfigurationInput {
  const enabled = configuration.enabled.find((system) => system.key === systemKey);
  if (!enabled) return { zones: [], locations: [] };
  const zones = configuration.zones.filter((zone) => zone.enabledSystemId === enabled.id);
  const zoneKeyById = new Map(zones.map((zone) => [zone.id, zone.key]));
  return {
    zones: zones.map((zone) => ({ key: zone.key, displayName: zone.displayName, sortOrder: zone.sortOrder })),
    locations: configuration.locations
      .filter((location) => location.enabledSystemId === enabled.id)
      .map((location) => ({
        key: location.key, displayName: location.displayName,
        zoneId: location.zoneId ? (zoneKeyById.get(location.zoneId) ?? "") : null,
        presetRowCount: location.presetRowCount,
        rowPreset: object(location.rowPreset) ? location.rowPreset : {},
        sortOrder: location.sortOrder
      }))
  };
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
        const { id, jobId, patch } = parseSubmissionBody(request.body, systemKey);
        const fingerprint = submissionFingerprint(customerId, systemKey, jobId, patch);
        client = await database.connect();
        await client.query("BEGIN");

        // Idempotent replay check first, mirroring reportApprovals.ts: a retry of the
        // same client-generated id short-circuits before any domain-state check.
        const existing = await client.query<{
          customerId: string; systemKey: string; jobId: string; submittedByUserId: number; payload: LocationProposalPatch;
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

        // One pending proposal at a time per (customer, systemKey, target location), serialised so
        // two concurrent submissions cannot both observe "no pending proposal" for the same target --
        // but proposals targeting DIFFERENT locations of the same system may be pending together.
        await client.query("SELECT pg_advisory_xact_lock(hashtext('location_proposal:' || $1 || ':' || $2 || ':' || $3))", [customerId, systemKey, patch.locationKey]);
        const pending = await client.query(`
          SELECT proposal.id FROM customer_location_proposals proposal
          WHERE proposal.customer_id = $1 AND proposal.system_key = $2 AND proposal.payload->>'locationKey' = $3
            AND NOT EXISTS (SELECT 1 FROM customer_location_proposal_decisions decision WHERE decision.proposal_id = proposal.id)
          LIMIT 1`, [customerId, systemKey, patch.locationKey]);
        if (pending.rows[0]) {
          throw new LocationProposalError("LOCATION_PROPOSAL_ALREADY_PENDING", "A location proposal for this location is already awaiting review.", 409);
        }

        await client.query(`INSERT INTO customer_location_proposals
          (id, customer_id, system_key, job_id, submitted_by_user_id, submitted_by_role, payload)
          VALUES ($1,$2,$3,$4,$5,'inspector',$6)`,
        [id, customerId, systemKey, jobId, request.currentUser!.id, JSON.stringify(patch)]);
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
        // Never trust the payload's stored patch to already describe the whole picture -- re-read the
        // customer's CURRENT configuration fresh and merge the patch into it, right here, right now.
        const configuration = await loadConfiguration(client, proposal.customerId);
        const currentForSystem = extractSystemLocations(configuration, proposal.systemKey);
        const merged = applyLocationProposalPatch(currentForSystem, proposal.payload, proposal.systemKey);
        if (!merged) {
          throw new LocationProposalError("LOCATION_PROPOSAL_TARGET_INVALID", "This proposal's target location is no longer valid against the customer's current configuration.", 409);
        }
        resultingRevisionId = await applyManagerLocationsUpdate(client, proposal.customerId, proposal.systemKey, merged, request.currentUser!.id);
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
