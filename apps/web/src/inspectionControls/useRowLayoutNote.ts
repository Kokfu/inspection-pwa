import { useEffect, useState } from "react";
import { isProposalHeldBehindPending, loadTechnicianLocationProposalDraft, type TechnicianLocationProposalDraft } from "../jobs/technicianLocationProposalDraft";
import { rowLayoutNote } from "./rowLayout";

/**
 * Phase 3 / I-50: the note about this visit's saved layout, derived from the stored proposal so it is still there after a
 * reload or when the submitted record is opened again. Only a submitted (read-only) record shows it. `setStored` lets the
 * submit-time save publish the proposal it just stored without waiting for the next read.
 */
export function useRowLayoutNote(input: { submitted: boolean; jobId: string; systemKey: string; locationKey: string | undefined; noun: string; refreshKey: string }) {
  const [stored, setStored] = useState<TechnicianLocationProposalDraft | undefined>(undefined);
  const { submitted, jobId, systemKey, locationKey, refreshKey } = input;
  useEffect(() => {
    if (!submitted || !locationKey) return;
    let active = true;
    void loadTechnicianLocationProposalDraft(jobId, systemKey, locationKey).then((draft) => { if (active) setStored(draft); }).catch(() => undefined);
    return () => { active = false; };
  }, [submitted, jobId, systemKey, locationKey, refreshKey]);
  const note = submitted ? rowLayoutNote(stored, isProposalHeldBehindPending(stored), input.noun) : "";
  return { note, setStored };
}
