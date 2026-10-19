import {
  heldLocationProposalMessage, isProposalHeldBehindPending, loadTechnicianLocationProposalDraft, newUpdateFormatDraft, queueTechnicianLocationProposal,
  saveTechnicianLocationProposalDraft, syncPendingLocationProposals, type TechnicianLocationProposalDraft
} from "../jobs/technicianLocationProposalDraft";
import { decideRowLayout, type LayoutLimits, type LayoutRow } from "./rowLayout";

export type RowLayoutProposalArgs = {
  jobId: string; customerId: string; systemKey: string; locationKey: string;
  saved: readonly LayoutRow[]; proposed: readonly LayoutRow[]; limits: LayoutLimits; noun: string;
  canUseServer: boolean; actorUserId: number;
};

/**
 * Phase 3: after a successful local Submit, remember this visit's rows for the next one -- no extra button. Only a layout
 * that differs from the saved one is proposed (an unchanged layout would only add Admin work), and never over a proposal
 * already made for this visit. Outbox first, then sync when online. The inspection itself is already safely queued, so
 * nothing here may fail the submit: a problem comes back as a note instead of an error.
 * `stored` is the proposal draft as saved on this device (undefined when nothing was proposed).
 */
export async function proposeRowLayoutAfterSubmit(args: RowLayoutProposalArgs): Promise<{ note: string; stored: TechnicianLocationProposalDraft | undefined }> {
  try {
    const existing = await loadTechnicianLocationProposalDraft(args.jobId, args.systemKey, args.locationKey);
    const decision = decideRowLayout(args.saved, args.proposed, existing?.status, isProposalHeldBehindPending(existing), args.limits, args.noun);
    if (decision.action === "skip") return { note: "", stored: existing };
    if (decision.action === "note") return { note: existing && isProposalHeldBehindPending(existing)
      ? heldLocationProposalMessage(existing, args.noun) : decision.note, stored: existing };
    const draft = newUpdateFormatDraft(args.jobId, args.customerId, args.systemKey, args.locationKey, args.proposed.map((row) => ({ ...row })));
    await saveTechnicianLocationProposalDraft(draft);
    await queueTechnicianLocationProposal(draft);
    if (args.canUseServer && navigator.onLine) await syncPendingLocationProposals(args.actorUserId);
    const stored = await loadTechnicianLocationProposalDraft(args.jobId, args.systemKey, args.locationKey);
    return { note: stored && isProposalHeldBehindPending(stored) ? heldLocationProposalMessage(stored, args.noun) : "", stored };
  } catch (error) {
    return { note: `Inspection submitted. The ${args.noun} layout could not be saved for next visit: ${error instanceof Error ? error.message : "unknown error"}`, stored: undefined };
  }
}
