import { useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../auth/authApi";
import { isManagerRole } from "../roleAccess";
import { loadManagerCustomers } from "../managerApi";
import { AwaitingRepairVisits, useRepairVisitList, type RepairVisitRowNames } from "./RepairVisitEntries";

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

/** Admin/Manager "Repair Visits" page. */
export function ManagerRepairVisits(props: Props) {
  return (
    <section className="manager-home" aria-labelledby="manager-repair-visits-title">
      <h2 id="manager-repair-visits-title">Repair Visits</h2>
      <AwaitingRepairVisitsPanel {...props} />
    </section>
  );
}
