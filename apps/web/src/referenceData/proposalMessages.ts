/** I-49: what the technician reads when the server already holds a pending proposal for the same target. */
export const proposalAlreadyPendingMessage = "Not sent: a proposal for this location is already waiting for Admin review.";

/**
 * I-49 / I-52: a proposal the sync retired because an earlier one for the same target is still awaiting review.
 * The draft stays 'Failed' locally with the fixed text above (so the forms that read the draft status keep working)
 * while its outbox item is 'Completed'. Nothing needs attention and nothing can be retried, so callers must not offer
 * a retry or treat it as a proposal that was sent.
 */
export function isHeldProposalDraft(draft: { status: string; lastError?: string } | undefined): boolean {
  return draft?.status === "Failed" && draft.lastError === proposalAlreadyPendingMessage;
}
