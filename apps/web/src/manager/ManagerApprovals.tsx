import { useEffect, useRef, useState } from "react";
import { loadLocationProposals, loadReportApprovals, loadSiteProposals, ManagerApiError } from "./managerApi";
import { loadRepairVisits, RepairVisitsApiError } from "./repairVisitsApi";
import "./ManagerApprovals.css";

export const approvalCards = [
  ["Location proposals", "Location and format changes", "manager-location-proposals"],
  ["Site requests", "New sites from technicians", "manager-site-proposals"],
  ["Repair visits", "Approve or return to technician", "manager-repairs"],
  ["Service reports", "Reports awaiting approval", "manager-report-approvals"]
] as const;
type ApprovalRoute = typeof approvalCards[number][2];
type Counts = Record<ApprovalRoute, number | null>;
const emptyCounts: Counts = { "manager-location-proposals": null, "manager-site-proposals": null, "manager-repairs": null, "manager-report-approvals": null };

/** Each source settles independently; unknown counts stay unknown. Fresh on every page mount. */
export function useApprovalCounts(onAuthorityFailure: (error: unknown) => void) {
  const [counts, setCounts] = useState<Counts>(emptyCounts);
  const authorityFailure = useRef(onAuthorityFailure);
  authorityFailure.current = onAuthorityFailure;
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    const load = (route: ApprovalRoute, pending: Promise<number>) => {
      void pending.then(count => {
        if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid approval count");
        if (!signal.aborted) setCounts(current => ({ ...current, [route]: count }));
      }).catch((error: unknown) => {
        if (!signal.aborted && (error instanceof ManagerApiError || error instanceof RepairVisitsApiError) && error.kind === "authorization") authorityFailure.current(error);
      });
    };
    load("manager-location-proposals", loadLocationProposals("pending", signal).then(data => data.counts.pending));
    load("manager-site-proposals", loadSiteProposals(signal).then(items => items.filter(item => item.status === "pending").length));
    load("manager-repairs", loadRepairVisits(signal).then(items => items.filter(item => item.status === "awaiting_approval").length));
    load("manager-report-approvals", loadReportApprovals({ limit: 1 }, signal).then(data => data.totalCount));
    return () => controller.abort();
  }, []);
  const values = Object.values(counts);
  return { counts, total: values.every(value => value !== null) ? values.reduce<number>((sum, value) => sum + value!, 0) : null };
}

export function PendingCount({ count }: { count: number | null }) {
  return count !== null && count > 0
    ? <span className="approval-pending-count" role="img" aria-label={`${count} pending`}>{count}</span>
    : null;
}

export function ManagerApprovals({ navigate, onAuthorityFailure }: {
  navigate: (route: { name: ApprovalRoute }) => void;
  onAuthorityFailure: (error: unknown) => void;
}) {
  const { counts } = useApprovalCounts(onAuthorityFailure);
  return <section className="manager-hub" aria-labelledby="manager-approvals-title">
    <div className="workspace-heading"><h2 id="manager-approvals-title">Approvals</h2></div>
    <div className="manager-dashboard manager-hub-grid">{approvalCards.map(([title, description, name]) =>
      <button type="button" className="manager-dashboard-card manager-hub-card" key={name} onClick={() => navigate({ name })}>
        <span className="manager-hub-copy"><strong>{title}</strong><span>{description}</span></span><PendingCount count={counts[name]} />
      </button>)}</div>
  </section>;
}
