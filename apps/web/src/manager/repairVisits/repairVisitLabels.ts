import type { RepairVisit, RepairVisitBeforeSnapshot, RepairVisitOutcome, RepairVisitStatus } from "../../repairVisits/repairVisitTypes";

export const resultLabel = (result: RepairVisitBeforeSnapshot["result"] | RepairVisitOutcome | null): string => {
  switch (result) {
    case "good": return "GOOD";
    case "not_good": return "NOT GOOD";
    case "complete_repair": return "COMPLETE REPAIR";
    case "na": return "N.A.";
    case "done_repair": return "DONE REPAIR";
    case "not_done": return "NOT DONE";
    default: return "Not recorded";
  }
};

export const statusLabel: Record<RepairVisitStatus, string> = {
  draft: "Draft", awaiting_approval: "Awaiting approval", returned: "Returned to technician", approved: "Approved"
};

export const statusTone: Record<RepairVisitStatus, "draft" | "waiting" | "attention" | "complete"> = {
  draft: "draft", awaiting_approval: "waiting", returned: "attention", approved: "complete"
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-11" -> "11 Oct 2026" without a time-zone conversion (the value is already a calendar day). */
export function formatVisitDate(value: string): string {
  const match = /^(\d{4})-(\d\d)-(\d\d)$/.exec(value);
  const month = match ? months[Number(match[2]) - 1] : undefined;
  return match && month ? `${Number(match[3])} ${month} ${match[1]}` : value;
}

export function previousVisitSummary(visit: RepairVisit, befores: Array<RepairVisitBeforeSnapshot | null>): string {
  if (!visit.previousVisit) return "None";
  const before = befores.find((value): value is RepairVisitBeforeSnapshot => value !== null);
  return before ? `${before.visitNumber}, ${formatVisitDate(before.visitDate)}` : "Previous visit selected (no fields recorded)";
}
