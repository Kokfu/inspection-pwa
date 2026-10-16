/** Outbox statuses of technician location proposals that are not yet server-confirmed (Completed is excluded). */
export type ProposalOutboxStatus = "Pending" | "Syncing" | "Failed" | "Conflict";

export type HeaderSyncInput = {
  inspectionStatuses: readonly string[];
  attachmentStatuses: readonly string[];
  proposalStatuses: readonly string[];
  repairStatuses?: readonly string[];
};

/** Header summary text. Existing inspection/photo wording is unchanged; proposals use the same status vocabulary. */
export function headerSyncSummary({ inspectionStatuses, attachmentStatuses, proposalStatuses, repairStatuses = [] }: HeaderSyncInput) {
  const waitingInspections = inspectionStatuses.filter((status) => status === "Pending").length;
  const waitingProposals = proposalStatuses.filter((status) => status === "Pending").length;
  const waitingRepairs = repairStatuses.filter((status) => status === "Pending").length;
  const running = inspectionStatuses.some((status) => status === "Syncing")
    || attachmentStatuses.some((status) => status === "Uploading")
    || proposalStatuses.some((status) => status === "Syncing")
    || repairStatuses.some((status) => status === "Syncing");
  const needsAttention = inspectionStatuses.some((status) => status === "Failed" || status === "Conflict")
    || attachmentStatuses.some((status) => status === "Failed" || status === "Conflict")
    || proposalStatuses.some((status) => status === "Failed" || status === "Conflict")
    || repairStatuses.some((status) => status === "Failed" || status === "Conflict");
  const waiting = [
    waitingInspections > 0 ? `${waitingInspections} ${waitingInspections === 1 ? "inspection" : "inspections"}` : "",
    waitingProposals > 0 ? `${waitingProposals} location ${waitingProposals === 1 ? "proposal" : "proposals"}` : "",
    waitingRepairs > 0 ? `${waitingRepairs} ${waitingRepairs === 1 ? "repair" : "repairs"}` : ""
  ].filter(Boolean).join(" and ");
  const text = needsAttention ? "Sync needs attention"
    : running ? "Syncing…"
    : waiting ? `${waiting} waiting to sync`
    : repairStatuses.includes("Loading") ? "Checking submitted changes…"
    : "All submitted changes synced";
  return { text, needsAttention, running };
}
