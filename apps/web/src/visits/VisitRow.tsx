import type { ReactNode } from "react";

export type VisitRowSummary = {
  kind: "service" | "repair";
  date: string;
  status: "open" | "closed" | "draft" | "awaiting_approval" | "returned" | "approved";
  technicianName: string | null;
};
type VisitRowProps = { visit: VisitRowSummary; locked?: boolean; onClick?: () => void };
const statusLabels = {
  open: "Open", closed: "Completed", draft: "Draft", awaiting_approval: "Awaiting approval",
  returned: "Returned", approved: "Approved"
};

/** Presentation only. The caller decides access; a locked row can never invoke onClick. */
export function VisitRow({ visit, onClick, locked = !onClick }: VisitRowProps) {
  const content: ReactNode = <>
    <span className="visit-row__badges">
      <span className={`visit-row__kind visit-row__kind--${visit.kind}`}>{visit.kind === "service" ? "Service" : "Repair"}</span>
      <span className="visit-row__status">{statusLabels[visit.status]}</span>
    </span>
    <time dateTime={visit.date}>{visit.date}</time>
    <span className="visit-row__technician">{visit.technicianName ?? "Unassigned"}</span>
    {locked && <span className="visit-row__lock" role="img" aria-label="Summary only">🔒</span>}
  </>;
  return onClick && !locked
    ? <button type="button" className="visit-row visit-row--tappable" onClick={onClick}>{content}</button>
    : <div className="visit-row">{content}</div>;
}
