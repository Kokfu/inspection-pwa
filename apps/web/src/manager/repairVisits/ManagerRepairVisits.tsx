import { useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../auth/authApi";
import { isManagerRole } from "../roleAccess";
import { loadManagerCustomers } from "../managerApi";
import { AwaitingRepairVisits, awaitingRepairVisits, useRepairVisitList, type RepairVisitRowNames } from "./RepairVisitEntries";
import { WorkspaceEyebrow } from "../WorkspaceEyebrow";

type Props = { role: AuthUser["role"]; onAuthorityFailure: (error: unknown) => void; onOpen: (visitId: string) => void };

/** The repair visits waiting for approval, with customer names when they could be loaded. Online only. */
export function AwaitingRepairVisitsPanel({ role, onAuthorityFailure, onOpen }: Props) {
  const { state, reload } = useRepairVisitList(role, onAuthorityFailure);
  const [customers, setCustomers] = useState<ReadonlyMap<string, string>>();
  useEffect(() => {
    if (!isManagerRole(role)) return;
    const controller = new AbortController();
    // Names are a convenience; without them rows fall back to the RV number rather than guessing.
    void loadManagerCustomers(controller.signal)
      .then(rows => { if (!controller.signal.aborted) setCustomers(new Map(rows.map(row => [row.customer.id, row.customer.displayName]))); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [role]);
  const names = useMemo<RepairVisitRowNames>(() => ({ customers }), [customers]);
  return <AwaitingRepairVisits state={state} onRetry={reload} names={names} onOpen={onOpen} />;
}

/**
 * Slim warning on Operations: how many repair visits await approval, linking to the repairs page.
 * Hidden at 0 and while loading; a failed load keeps the retryable error so a missing count is never read as zero.
 */
export function AwaitingRepairVisitsBanner({ role, onAuthorityFailure }: Omit<Props, "onOpen">) {
  const { state, reload } = useRepairVisitList(role, onAuthorityFailure);
  if (state.phase === "failed") {
    return (
      <div role="alert" className="mrv-banner mrv-banner--error">
        <p>Repair visits could not be refreshed: {state.message}</p>
        <button type="button" className="secondary-command" onClick={reload}>Try again</button>
      </div>
    );
  }
  if (state.phase !== "ready") return null;
  const count = awaitingRepairVisits(state.visits).length;
  if (count === 0) return null;
  return (
    <p className="ops-repair-banner" role="status">
      <span>{count} repair {count === 1 ? "visit" : "visits"} awaiting approval</span>
      <span aria-hidden="true"> · </span>
      <a href="#/manager-repairs">Review</a>
    </p>
  );
}

/** Admin/Manager "Repair Visits" page. */
export function ManagerRepairVisits(props: Props) {
  return (
    <section className="manager-home page-stack" aria-labelledby="manager-repair-visits-title">
      <div className="workspace-heading"><div><WorkspaceEyebrow /><h2 id="manager-repair-visits-title">Repair Visits</h2></div></div>
      <AwaitingRepairVisitsPanel {...props} />
    </section>
  );
}
