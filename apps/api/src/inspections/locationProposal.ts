import type { Pool } from "pg";
import type { LocationConfigurationInput } from "./locationConfiguration.js";

/**
 * Technician-proposed, Supervisor/Admin-approved customer zone/location configuration
 * (migration 048). Mirrors `reportApproval.ts`'s split of pure derivation
 * (`deriveLocationProposalState`) from the SQL that loads its inputs
 * (`loadLocationProposal`, `loadLocationProposalDecisions`), so the derivation itself
 * can be unit tested with no database.
 *
 * Unlike report approval, both decisions here are TERMINAL: there is no withdraw and
 * no re-decision. A proposal accumulates at most one decision row in practice, but the
 * derivation still resolves by highest `sequence` (never array position or wall-clock
 * order) for the same reason `reportApproval.ts` does -- defense in depth against a
 * same-millisecond double-submit race.
 */

export type LocationProposalDecision = "approved" | "rejected";
export type LocationProposalDecisionRole = "admin" | "supervisor";
export type LocationProposalStatus = "pending" | "approved" | "rejected";

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
  /** Present only when loaded for the router's own idempotency check; never sent to a client. */
  requestFingerprint?: string;
};

export type LocationProposalRecord = {
  id: string;
  customerId: string;
  customerDisplayName: string;
  systemKey: string;
  jobId: string;
  submittedByUserId: number;
  submittedBy: string;
  submittedByRole: "inspector";
  submittedAt: string;
  payload: LocationConfigurationInput;
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
      decision.resulting_revision_id AS "resultingRevisionId", decision.request_fingerprint AS "requestFingerprint"
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
      proposal.submitted_by_user_id::int AS "submittedByUserId", actor.username AS "submittedBy",
      proposal.submitted_by_role AS "submittedByRole",
      to_char(proposal.submitted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "submittedAt",
      proposal.payload
    FROM customer_location_proposals proposal
    INNER JOIN users actor ON actor.id = proposal.submitted_by_user_id
    INNER JOIN customers customer ON customer.id = proposal.customer_id
    WHERE proposal.id = $1`, [id]);
  return result.rows[0] as LocationProposalRecord | undefined;
}

/** Every proposal (newest submission first), each with its derived state. Optionally filtered by status. */
export async function listLocationProposals(
  database: Queryable, status?: LocationProposalStatus
): Promise<Array<LocationProposalRecord & LocationProposalState>> {
  const result = await database.query(`
    SELECT proposal.id, proposal.customer_id AS "customerId", customer.display_name AS "customerDisplayName",
      proposal.system_key AS "systemKey", proposal.job_id AS "jobId",
      proposal.submitted_by_user_id::int AS "submittedByUserId", actor.username AS "submittedBy",
      proposal.submitted_by_role AS "submittedByRole",
      to_char(proposal.submitted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "submittedAt",
      proposal.payload
    FROM customer_location_proposals proposal
    INNER JOIN users actor ON actor.id = proposal.submitted_by_user_id
    INNER JOIN customers customer ON customer.id = proposal.customer_id
    ORDER BY proposal.submitted_at DESC, proposal.id`);
  const withState = await Promise.all((result.rows as LocationProposalRecord[]).map(async (row) => {
    const decisions = await loadLocationProposalDecisions(database, row.id);
    return { ...row, ...deriveLocationProposalState(decisions) };
  }));
  return status ? withState.filter((row) => row.status === status) : withState;
}
