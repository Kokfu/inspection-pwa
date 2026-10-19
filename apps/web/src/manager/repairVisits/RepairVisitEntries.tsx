import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthUser } from "../../auth/authApi";
import type { RepairVisit } from "../../repairVisits/repairVisitTypes";
import { isManagerRole } from "../roleAccess";
import { loadRepairVisits, RepairVisitsApiError } from "../repairVisitsApi";
import { formatVisitDate, statusLabel, statusTone } from "./repairVisitLabels";
import "./repairVisitReview.css";

/* Pieces for step 5A to plug into ManagerServicesDone (customer view) and the awaiting-approval list.
 * Nothing here is routed or mounted by this step. */

export type RepairVisitListState =
  | { phase: "idle" } | { phase: "loading" } | { phase: "failed"; message: string }
  | { phase: "ready"; visits: RepairVisit[] };

/**
 * Online-only list of repair visits for Admin/Manager. A failed refresh drops the previous list and
 * reports the failure; stale rows are never kept as current. A technician role performs no request.
 */
export function useRepairVisitList(role: AuthUser["role"], onAuthorityFailure?: (error: unknown) => void) {
  const allowed = isManagerRole(role);
  const [state, setState] = useState<RepairVisitListState>({ phase: allowed ? "loading" : "idle" });
  const current = useRef(0);
  const authority = useRef(onAuthorityFailure);
  authority.current = onAuthorityFailure;

  const reload = useCallback(async (signal?: AbortSignal) => {
    if (!allowed) { setState({ phase: "idle" }); return; }
    const id = ++current.current;
    setState({ phase: "loading" });
    try {
      const visits = await loadRepairVisits(signal);
      if (!signal?.aborted && id === current.current) setState({ phase: "ready", visits });
    } catch (caught) {
      if (signal?.aborted || id !== current.current || (caught instanceof DOMException && caught.name === "AbortError")) return;
      if (caught instanceof RepairVisitsApiError && caught.kind === "authorization") authority.current?.(caught);
      setState({ phase: "failed", message: caught instanceof RepairVisitsApiError ? caught.message : "Repair visits are currently unavailable." });
    }
  }, [allowed]);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => { controller.abort(); current.current += 1; };
  }, [reload]);

  return { state, reload: () => reload() };
}

export const repairVisitsForCustomer = (visits: readonly RepairVisit[], customerId: string) =>
  visits.filter(visit => visit.customerId === customerId && visit.status !== "draft");
export const awaitingRepairVisits = (visits: readonly RepairVisit[]) =>
  visits.filter(visit => visit.status === "awaiting_approval");

export function RepairLabel() {
  return <span className="status-badge status-badge--draft rv-kind-badge">Repair</span>;
}

export type RepairVisitRowNames = {
  /** id -> display name; missing entries fall back to neutral text rather than guessing. */
  customers?: ReadonlyMap<string, string>;
  sites?: ReadonlyMap<string, string>;
  technicians?: ReadonlyMap<number, string>;
};

type RowProps = { visit: RepairVisit; names?: RepairVisitRowNames; showCustomer?: boolean; onOpen: (visitId: string) => void };

export function RepairVisitRow({ visit, names, showCustomer = false, onOpen }: RowProps) {
  const customer = names?.customers?.get(visit.customerId);
  const site = names?.sites?.get(visit.siteId);
  const technician = names?.technicians?.get(visit.createdByUserId);
  const title = [showCustomer ? customer ?? "Customer" : null, site ?? null].filter(Boolean).join(" — ") || visit.visitNumber;
  return (
    <li className="rv-row">
      <div className="rv-row-main">
        <p className="rv-row-title"><RepairLabel /> <strong>{title}</strong></p>
        <p className="rv-row-meta">
          {visit.visitNumber} · {formatVisitDate(visit.visitDate)}{technician ? ` · ${technician}` : ""}
          {visit.reportNumber ? ` · ${visit.reportNumber}` : ""}
        </p>
      </div>
      <span className={`status-badge status-badge--${statusTone[visit.status]}`}>{statusLabel[visit.status]}</span>
      <button type="button" className="secondary-command" onClick={() => onOpen(visit.clientUuid)} aria-label={`Review repair visit ${visit.visitNumber}`}>Review</button>
    </li>
  );
}

type ListProps = { state: RepairVisitListState; onRetry: () => void; names?: RepairVisitRowNames; onOpen: (visitId: string) => void };

function ListShell({ state, onRetry, empty, children }: { state: RepairVisitListState; onRetry: () => void; empty: string; children: (visits: RepairVisit[]) => RepairVisit[] }) {
  if (state.phase === "idle") return null;
  if (state.phase === "loading") return <p role="status" className="operational-message">Loading repair visits…</p>;
  if (state.phase === "failed") {
    return (
      <div role="alert" className="mrv-banner mrv-banner--error">
        <p>Repair visits could not be refreshed: {state.message}</p>
        <button type="button" className="secondary-command" onClick={onRetry}>Try again</button>
      </div>
    );
  }
  const rows = children(state.visits);
  return rows.length === 0 ? <p className="operational-message">{empty}</p> : null;
}

/** "Repair" rows for one customer in the Services Done customer view. */
export function CustomerRepairVisits({ customerId, state, onRetry, names, onOpen }: ListProps & { customerId: string }) {
  const rows = state.phase === "ready" ? repairVisitsForCustomer(state.visits, customerId) : [];
  return (
    <section className="rv-list" aria-label="Repair visits">
      <h3>Repair visits</h3>
      <ListShell state={state} onRetry={onRetry} empty="No repair visits for this customer yet." >{visits => repairVisitsForCustomer(visits, customerId)}</ListShell>
      {rows.length ? <ul className="rv-rows">{rows.map(visit => <RepairVisitRow key={visit.clientUuid} visit={visit} names={names} onOpen={onOpen} />)}</ul> : null}
    </section>
  );
}

/** Repair visits waiting for approval, for the awaiting-approval list. */
export function AwaitingRepairVisits({ state, onRetry, names, onOpen }: ListProps) {
  const rows = state.phase === "ready" ? awaitingRepairVisits(state.visits) : [];
  return (
    <section className="rv-list" aria-label="Repair visits awaiting approval">
      <h3>Repair visits awaiting approval</h3>
      <ListShell state={state} onRetry={onRetry} empty="No repair visits are awaiting approval.">{awaitingRepairVisits}</ListShell>
      {rows.length ? <ul className="rv-rows">{rows.map(visit => <RepairVisitRow key={visit.clientUuid} visit={visit} names={names} showCustomer onOpen={onOpen} />)}</ul> : null}
    </section>
  );
}
