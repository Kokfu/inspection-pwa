import type { Pool } from "pg";

/**
 * CR-02 Phase 1: a technician-typed site that an Admin approves or rejects (migration 050).
 *
 * Mirrors `locationProposal.ts`: pure derivation (`deriveSiteProposalState`) is separate from the SQL that loads
 * its inputs, so it can be unit tested without a database. Both decisions are TERMINAL: no withdraw and no
 * re-decision, so a proposal holds at most one decision row in practice; the derivation still resolves by highest
 * `sequence` (never array position or wall-clock order) as defence against a same-millisecond double submit.
 *
 * The status is derived from the DECISION LOG, not from `customer_sites.is_active`: an approved site that is later
 * deactivated by a Manager is still an approved proposal, and a rejected proposal's site stays inactive forever.
 */
export type SiteProposalDecision = "approved" | "rejected";
export type SiteProposalStatus = "pending" | "approved" | "rejected";

export type SiteProposalDecisionEvent = {
  id: string;
  decision: SiteProposalDecision;
  note: string | null;
  decidedBy: string;
  decidedByRole: "admin" | "supervisor";
  decidedAt: string;
  sequence: number;
  requestId: string;
  /** Present only when loaded for the router's own idempotency check; never sent to a client. */
  requestFingerprint?: string;
};

export type SiteProposalRecord = {
  id: string;
  customerId: string;
  customerDisplayName: string;
  siteId: string;
  jobId: string | null;
  jobReference: string | null;
  submittedByUserId: number;
  submittedBy: string;
  submittedAt: string;
  proposedDisplayName: string;
  proposedAddress: string | null;
};

export type SiteProposalState = { status: SiteProposalStatus; decision: SiteProposalDecisionEvent | null };

/** Pure derivation: no decisions -> "pending"; otherwise the highest-`sequence` decision's own outcome. */
export function deriveSiteProposalState(decisions: readonly SiteProposalDecisionEvent[]): SiteProposalState {
  if (decisions.length === 0) return { status: "pending", decision: null };
  const latest = decisions.reduce((max, event) => (event.sequence > max.sequence ? event : max));
  return { status: latest.decision, decision: latest };
}

/** What a technician's own visit shows: the status plus, only for a rejection, the Admin's reason (owner decision D3). */
export type SiteApproval = { status: SiteProposalStatus; note?: string };
export function siteApprovalFor(state: SiteProposalState): SiteApproval {
  return state.status === "rejected" && state.decision?.note ? { status: "rejected", note: state.decision.note } : { status: state.status };
}

// --- text rules for a typed site (server-side; the web phase mirrors them) ---------------------------------------
export const siteDisplayNameMaxLength = 160;
export const siteAddressMaxLength = 500;

const control = /\p{Cc}/u;
const hidden = /[\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2060}-\u{2064}\u{2066}-\u{2069}\u{FEFF}]/u;

function normaliseText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" || control.test(value) || hidden.test(value)) return undefined;
  const collapsed = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  return [...collapsed].length > maxLength ? undefined : collapsed;
}

/** Trim + collapse whitespace (the Manager add-site rule), 1..160; control and hidden characters are refused. */
export function normaliseSiteDisplayName(value: unknown): string | undefined {
  const text = normaliseText(value, siteDisplayNameMaxLength);
  return text === undefined || text.length === 0 ? undefined : text;
}

/** Optional: absent / null / blank is `null`; malformed is `undefined` (distinct, so the caller can fail closed). */
export function normaliseSiteAddress(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  const text = normaliseText(value, siteAddressMaxLength);
  if (text === undefined) return undefined;
  return text.length === 0 ? null : text;
}

/** The comparison key for "is this the same site name": case-insensitive on the collapsed text. */
export function siteNameKey(name: string): string {
  return name.normalize("NFC").replace(/\s+/gu, " ").trim().toLowerCase();
}
/** The same key in SQL, for a stored `display_name` that may carry uneven whitespace. */
export const siteNameKeySql = (column: string) => `lower(regexp_replace(btrim(${column}), '\\s+', ' ', 'g'))`;

type Queryable = Pick<Pool, "query">;

const submittedAt = `to_char(proposal.submitted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const proposalColumns = `
  proposal.id, proposal.customer_id AS "customerId", customer.display_name AS "customerDisplayName",
  proposal.site_id AS "siteId", proposal.job_id AS "jobId", job.job_reference AS "jobReference",
  proposal.submitted_by_user_id::int AS "submittedByUserId", actor.username AS "submittedBy",
  ${submittedAt} AS "submittedAt",
  proposal.proposed_display_name AS "proposedDisplayName", proposal.proposed_address AS "proposedAddress"
  FROM customer_site_proposals proposal
  INNER JOIN users actor ON actor.id = proposal.submitted_by_user_id
  INNER JOIN customers customer ON customer.id = proposal.customer_id
  LEFT JOIN inspection_jobs job ON job.id = proposal.job_id`;

/** Every decision event recorded for a proposal, oldest first. */
export async function loadSiteProposalDecisions(database: Queryable, proposalId: string): Promise<SiteProposalDecisionEvent[]> {
  const result = await database.query(`
    SELECT decision.id, decision.decision, decision.note,
      actor.username AS "decidedBy", decision.decided_by_role AS "decidedByRole",
      to_char(decision.decided_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "decidedAt",
      decision.sequence, decision.request_id AS "requestId", decision.request_fingerprint AS "requestFingerprint"
    FROM customer_site_proposal_decisions decision
    INNER JOIN users actor ON actor.id = decision.decided_by_user_id
    WHERE decision.proposal_id = $1
    ORDER BY decision.sequence`, [proposalId]);
  return result.rows as SiteProposalDecisionEvent[];
}

/** One proposal's immutable submission content, or `undefined` when unknown. */
export async function loadSiteProposal(database: Queryable, id: string): Promise<SiteProposalRecord | undefined> {
  const result = await database.query(`SELECT ${proposalColumns} WHERE proposal.id = $1`, [id]);
  return result.rows[0] as SiteProposalRecord | undefined;
}

/** Every proposal (newest submission first) with its derived state, optionally filtered by status. */
export async function listSiteProposals(
  database: Queryable, status?: SiteProposalStatus
): Promise<Array<SiteProposalRecord & SiteProposalState>> {
  const result = await database.query(`SELECT ${proposalColumns} ORDER BY proposal.submitted_at DESC, proposal.id`);
  const withState = await Promise.all((result.rows as SiteProposalRecord[]).map(async (row) =>
    ({ ...row, ...deriveSiteProposalState(await loadSiteProposalDecisions(database, row.id)) })));
  return status ? withState.filter((row) => row.status === status) : withState;
}

/**
 * The additive `siteApproval` column on a job DTO: NULL for a visit whose site was never a proposal (every existing
 * visit), otherwise `{status}` and, for a rejection only, `{note}`. `siteColumn` is the SQL for the job's site id.
 */
export const siteApprovalSql = (siteColumn: string) => `(
  SELECT jsonb_build_object('status', COALESCE(latest.decision, 'pending'))
    || CASE WHEN latest.decision = 'rejected' AND latest.note IS NOT NULL THEN jsonb_build_object('note', latest.note) ELSE '{}'::jsonb END
  FROM customer_site_proposals site_proposal
  LEFT JOIN LATERAL (
    SELECT d.decision, d.note FROM customer_site_proposal_decisions d WHERE d.proposal_id = site_proposal.id ORDER BY d.sequence DESC LIMIT 1
  ) latest ON true
  WHERE site_proposal.site_id = ${siteColumn}
) AS "siteApproval"`;
