import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ManagerCustomerServiceHistory, isServiceHistoryFilterValues, type ServiceHistoryFilterValues } from "./ManagerCustomerServiceHistory";
import { loadManagerCustomers, loadManagerTechnicians, loadManagerServiceHistory, ManagerApiError, type ManagerCustomerSummary, type ManagerTechnician } from "./managerApi";
import { readManagerSession, writeManagerSession } from "./managerReturnRoute";
import { CustomerRepairVisits, useRepairVisitList } from "./repairVisits/RepairVisitEntries";

import type { AuthUser } from "../auth/authApi";
import { CustomerTimelineRoute } from "../visits/CustomerTimelineRoute";
import type { TimelineLoader } from "../visits/CustomerTimeline";
import { parseTimelinePage, type TimelineVisit } from "../visits/customerTimelineData";
import { useWorkspaceLabel } from "./WorkspaceEyebrow";

type Props = {
  actor: AuthUser;
  supervisor?: boolean;
  message?: string;
  onAuthorityFailure: (error: unknown) => void;
  onViewServiceVisit: (jobId: string) => void;
  onViewRepairVisit: (visitId: string) => void;
  onViewReport: (jobId: string) => void;
  onDownloadReport: (jobId: string) => Promise<void>;
};

type RememberedSelection = { customerId: string; filters: ServiceHistoryFilterValues | null };

const sessionKey = "manager-services-done:v1";

function isRememberedSelection(value: unknown): value is RememberedSelection {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.customerId === "string" && candidate.customerId.length > 0
    && (candidate.filters === null || isServiceHistoryFilterValues(candidate.filters));
}

/** Shared completed timeline plus the existing manager history/report/archive tools. */
export function ManagerServicesDone({ actor, supervisor = false, message = "", onAuthorityFailure, onViewServiceVisit, onViewRepairVisit, onViewReport, onDownloadReport }: Props) {
  const [customers, setCustomers] = useState<ManagerCustomerSummary[]>([]);
  const [technicians, setTechnicians] = useState<ManagerTechnician[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);
  const authorityFailure = useRef(onAuthorityFailure);
  authorityFailure.current = onAuthorityFailure;
  // Both review roles may read repair visits; the verified role is enforced again by the server.
  const repairVisits = useRepairVisitList(supervisor ? "supervisor" : "admin", onAuthorityFailure);
  const [selection, setSelection] = useState<RememberedSelection | null>(() => readManagerSession(sessionKey, isRememberedSelection));

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([loadManagerCustomers(controller.signal), loadManagerTechnicians(controller.signal)]).then(([customerRows, technicianRows]) => {
      if (controller.signal.aborted) return;
      setCustomers(customerRows);
      // Supervisors never create visits, so only technicians are offered as a "created by" filter.
      setTechnicians(technicianRows.filter((row) => row.role === "inspector"));
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ManagerApiError && error.kind === "domain") setLoadError(error.message);
      else onAuthorityFailure(error);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const repairNames = useMemo(() => ({ customers: new Map(customers.map((row) => [row.customer.id, row.customer.displayName])) }), [customers]);
  const selectedCustomer = selection && !loading ? customers.find((row) => row.customer.id === selection.customerId) : undefined;

  const choose = (next: RememberedSelection | null) => {
    setSelection(next);
    writeManagerSession(sessionKey, next);
  };

  const options = useMemo(() => customers.map(row => row.customer), [customers]);
  // The manager API is authorized for both review roles; the technician summary API is not.
  const loadVisits = useCallback<TimelineLoader>(async (id, user, _mode, canCommit) => {
    const sites = customers.find(customer => customer.customer.id === id)?.sites ?? [];
    const siteIdForName = (name: string) => {
      const matches = sites.filter(site => site.displayName === name);
      return matches.length === 1 ? matches[0].id : null;
    };
    const visits: TimelineVisit[] = [];
    const cursors = new Set<string>();
    let cursor: string | null = null;
    try {
      do {
        const page = await loadManagerServiceHistory({ customerId: id, limit: 100, ...(cursor ? { cursor } : {}) });
        if (!canCommit()) throw new Error("Customer history session changed.");
        visits.push(...page.serviceVisits.map(visit => ({
          id: visit.id, kind: "service" as const, date: visit.serviceDate ?? visit.createdAt.slice(0, 10), status: visit.status,
          siteId: siteIdForName(visit.site),
          siteName: visit.site, technicianId: visit.technician?.id ?? null,
          technicianName: visit.technician?.displayName ?? null, ownedByCaller: visit.technician?.id === user.id
        })));
        cursor = page.nextCursor;
        if (cursor && (cursors.has(cursor) || cursors.size >= 1000)) throw new Error("Service history contains an invalid cursor.");
        if (cursor) cursors.add(cursor);
      } while (cursor);
      const repairs = await repairVisits.reload();
      if (!canCommit()) throw new Error("Customer history session changed.");
      if (!repairs) throw new Error("Repair visits could not be refreshed. Retry refreshing history.");
      visits.push(...repairs.filter(visit => visit.customerId === id && visit.status !== "draft").map(visit => ({
        id: visit.clientUuid, kind: "repair" as const, date: visit.visitDate, status: visit.status,
        siteId: visit.siteId, siteName: sites.find(site => site.id === visit.siteId)?.displayName ?? null,
        technicianId: visit.createdByUserId, technicianName: technicians.find(technician => technician.id === visit.createdByUserId)?.displayName
          ?? technicians.find(technician => technician.id === visit.createdByUserId)?.username ?? null,
        ownedByCaller: visit.createdByUserId === user.id
      })));
      return { visits: parseTimelinePage({ visits, nextCursor: null }, user).visits, offline: false, cached: false };
    } catch (error) {
      if (canCommit() && error instanceof ManagerApiError && error.kind === "authorization") authorityFailure.current(error);
      throw error;
    }
  }, [customers, technicians, historyRevision, repairVisits.reload]);

  const workspaceLabel = useWorkspaceLabel();
  return <section className="manager-home page-stack" aria-label="Current Services Done">
    <CustomerTimelineRoute actor={actor} mode="server" initialStatus="closed" showBack={false}
      heading="Current Services Done" eyebrow={workspaceLabel} searchable customerOptions={options}
      customerId={selectedCustomer?.customer.id} loadVisits={loadVisits}
      onCustomer={id => choose(id ? { customerId: id, filters: null } : null)} onBack={() => {}}
      onOpen={visit => visit.kind === "service" ? onViewServiceVisit(visit.id) : onViewRepairVisit(visit.id)} />
    {message ? <p className="form-message" role="alert">{message}</p> : null}
    {loading ? <p role="status">Loading customers…</p> : null}
    {loadError ? <p className="form-message" role="alert">{loadError}</p> : null}
    {selectedCustomer && <section aria-label="Manager visit tools">
      <div className="workspace-heading manager-selected-customer">
        <div><p className="eyebrow">Customer</p><h3>{selectedCustomer.customer.displayName}</h3><p className="job-reference">{selectedCustomer.customer.code}</p></div>
        <button type="button" className="secondary-command" onClick={() => choose(null)}>Change customer</button>
      </div>
      <ManagerCustomerServiceHistory
        key={selectedCustomer.customer.id}
        variant="services-done"
        canManageVisits={!supervisor}
        customer={selectedCustomer}
        technicians={technicians}
        initialFilters={selection?.filters ?? undefined}
        onFiltersApplied={(filters) => choose({ customerId: selectedCustomer.customer.id, filters })}
        onVisitsChanged={() => setHistoryRevision(revision => revision + 1)}
        onViewServiceVisit={onViewServiceVisit}
        onViewFinalReport={onViewReport}
        onDownloadFinalReport={onDownloadReport}
        onAuthorityFailure={onAuthorityFailure}
      />
      <CustomerRepairVisits customerId={selectedCustomer.customer.id} state={repairVisits.state} onRetry={repairVisits.reload}
        names={repairNames} onOpen={onViewRepairVisit} />
    </section>}
  </section>;
}
