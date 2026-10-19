import type { Pool } from "pg";
import type { LocationProposalPatch } from "./locationConfiguration.js";

/**
 * Technician-proposed, Supervisor/Admin-approved customer zone/location configuration
 * (migration 048). Mirrors `reportApproval.ts`'s split of pure derivation
 * (`deriveLocationProposalState`) from the SQL that loads its inputs
 * (`loadLocationProposal`, `loadLocationProposalDecisions`), so the derivation itself
 * can be unit tested with no database.
 *
 * All outcomes here are TERMINAL: approval, rejection and withdrawal allow
 * no re-decision. A proposal accumulates at most one decision row in practice, but the
 * derivation still resolves by highest `sequence` (never array position or wall-clock
 * order) for the same reason `reportApproval.ts` does -- defense in depth against a
 * same-millisecond double-submit race.
 */

export type LocationProposalDecision = "approved" | "rejected" | "withdrawn";
export type LocationProposalDecisionRole = "admin" | "supervisor" | "inspector";
export type LocationProposalStatus = "pending" | LocationProposalDecision;

/** One stored decision. `decidedAt` uses the same fixed-width format as `reportApproval.ts`'s
 *  `decidedAt` (`YYYY-MM-DDTHH:MI:SS.MSZ`, 3-digit milliseconds) for the same lexicographic-compare reason. */
export type LocationProposalDecisionEvent = {
  id: string;
  decision: LocationProposalDecision;
  note: string | null;
  decidedBy: string;
  decidedByRole: LocationProposalDecisionRole;
  decidedAt: string;
  sequence: number;
  requestId: string;
  /** The configuration revision Approve produced, or null for a reject / not yet decided. */
  resultingRevisionId: string | null;
  appliedPatch?: LocationProposalPatch | null;
  /** Present only when loaded for the router's own idempotency check; never sent to a client. */
  requestFingerprint?: string;
};

export type LocationProposalRecord = {
  id: string;
  customerId: string;
  customerDisplayName: string;
  systemKey: string;
  systemDisplayName: string | null;
  jobId: string;
  jobReference: string | null;
  submittedByUserId: number;
  submittedBy: string;
  submittedByRole: "inspector";
  submittedAt: string;
  payload: LocationProposalPatch;
};

export type LocationProposalState = {
  status: LocationProposalStatus;
  decision: LocationProposalDecisionEvent | null;
};

/** Pure derivation: no decisions -> "pending"; otherwise the highest-`sequence` decision's own outcome. */
export function deriveLocationProposalState(decisions: readonly LocationProposalDecisionEvent[]): LocationProposalState {
  if (decisions.length === 0) return { status: "pending", decision: null };
  const latest = decisions.reduce((max, event) => (event.sequence > max.sequence ? event : max));
  return { status: latest.decision, decision: latest };
}

type Queryable = Pick<Pool, "query">;

/** Every decision event recorded for a proposal, oldest first. */
export async function loadLocationProposalDecisions(database: Queryable, proposalId: string): Promise<LocationProposalDecisionEvent[]> {
  const result = await database.query(`
    SELECT decision.id, decision.decision, decision.note,
      actor.username AS "decidedBy", decision.decided_by_role AS "decidedByRole",
      to_char(decision.decided_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "decidedAt",
      decision.sequence, decision.request_id AS "requestId",
      decision.resulting_revision_id AS "resultingRevisionId", decision.request_fingerprint AS "requestFingerprint",
      decision.applied_patch AS "appliedPatch"
    FROM customer_location_proposal_decisions decision
    INNER JOIN users actor ON actor.id = decision.decided_by_user_id
    WHERE decision.proposal_id = $1
    ORDER BY decision.sequence`, [proposalId]);
  return result.rows as LocationProposalDecisionEvent[];
}

/** One proposal's immutable submission content, or `undefined` when unknown. */
export async function loadLocationProposal(database: Queryable, id: string): Promise<LocationProposalRecord | undefined> {
  const result = await database.query(`
    SELECT proposal.id, proposal.customer_id AS "customerId", customer.display_name AS "customerDisplayName",
      proposal.system_key AS "systemKey", proposal.job_id AS "jobId",
      system.display_name AS "systemDisplayName", job.job_reference AS "jobReference",
      proposal.submitted_by_user_id::int AS "submittedByUserId", actor.username AS "submittedBy",
      proposal.submitted_by_role AS "submittedByRole",
      to_char(proposal.submitted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "submittedAt",
      proposal.payload
    FROM customer_location_proposals proposal
    INNER JOIN users actor ON actor.id = proposal.submitted_by_user_id
    INNER JOIN customers customer ON customer.id = proposal.customer_id
    LEFT JOIN inspection_jobs job ON job.id = proposal.job_id
    LEFT JOIN master_service_report_systems system ON system.template_version_id = job.master_template_version_id
      AND system.system_key = proposal.system_key
    WHERE proposal.id = $1`, [id]);
  return result.rows[0] as LocationProposalRecord | undefined;
}

export type LocationProposalCounts = Record<LocationProposalStatus, number>;

/** One statement: latest sequence, ownership, status filtering and unfiltered tab counts share a snapshot. */
export async function listLocationProposals(
  database: Queryable, status?: LocationProposalStatus, ownerId?: number, jobId?: string
): Promise<{ proposals: Array<LocationProposalRecord & LocationProposalState>; counts: LocationProposalCounts }> {
  const result = await database.query(`
    WITH proposals AS (
      SELECT proposal.id, proposal.customer_id AS "customerId", customer.display_name AS "customerDisplayName",
        proposal.system_key AS "systemKey", proposal.job_id AS "jobId",
        system.display_name AS "systemDisplayName", job.job_reference AS "jobReference",
        proposal.submitted_by_user_id::int AS "submittedByUserId", actor.username AS "submittedBy",
        proposal.submitted_by_role AS "submittedByRole",
        to_char(proposal.submitted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "submittedAt",
        proposal.payload, COALESCE(latest.decision->>'decision', 'pending') AS status, latest.decision
      FROM customer_location_proposals proposal
      JOIN users actor ON actor.id = proposal.submitted_by_user_id
      JOIN customers customer ON customer.id = proposal.customer_id
      LEFT JOIN inspection_jobs job ON job.id = proposal.job_id
      LEFT JOIN master_service_report_systems system ON system.template_version_id = job.master_template_version_id
        AND system.system_key = proposal.system_key
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('id', d.id, 'decision', d.decision, 'note', d.note,
          'decidedBy', reviewer.username, 'decidedByRole', d.decided_by_role,
          'decidedAt', to_char(d.decided_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'sequence', d.sequence, 'requestId', d.request_id, 'resultingRevisionId', d.resulting_revision_id,
          'appliedPatch', d.applied_patch) AS decision
        FROM customer_location_proposal_decisions d JOIN users reviewer ON reviewer.id = d.decided_by_user_id
        WHERE d.proposal_id = proposal.id ORDER BY d.sequence DESC LIMIT 1
      ) latest ON true
      WHERE ($2::bigint IS NULL OR proposal.submitted_by_user_id = $2)
        AND ($3::uuid IS NULL OR proposal.job_id = $3)
    )
    SELECT COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p."submittedAt" DESC, p.id)
      FROM proposals p WHERE ($1::text IS NULL OR p.status = $1)), '[]'::jsonb) AS proposals,
      jsonb_build_object('pending', count(*) FILTER (WHERE status='pending'),
        'approved', count(*) FILTER (WHERE status='approved'), 'rejected', count(*) FILTER (WHERE status='rejected'),
        'withdrawn', count(*) FILTER (WHERE status='withdrawn')) AS counts
    FROM proposals`, [status ?? null, ownerId ?? null, jobId ?? null]);
  return result.rows[0];
}
