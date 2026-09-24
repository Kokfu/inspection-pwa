import { useEffect, useState } from "react";
import {
  loadManagerServiceCatalog,
  ManagerApiError,
  retireManagerServiceCatalogEntry,
  restoreManagerServiceCatalogEntry,
  type ManagerServiceCatalogEntry
} from "./managerApi";

/**
 * System-wide service-catalog retirement page (route `manager-service-catalog`).
 * Retiring a system only stops it from being offered for NEW assignment (this
 * page and `ManagerAddCustomer`'s picker); a customer already using a retired
 * system keeps it fully functional — retirement never touches
 * `customer.supportedSystems` for an existing customer.
 *
 * `GET /manager/service-catalog?includeRetired=true` now reports every
 * system with its `retiredAt` state, so this page loads the full list once
 * and splits it into Active / Retired client-side — a system retired in an
 * earlier session is found and restorable here exactly like one retired in
 * this session.
 */
export function ManagerServiceCatalog({ onAuthorityFailure }: {
  onAuthorityFailure: (error: ManagerApiError) => void;
}) {
  const [systems, setSystems] = useState<ManagerServiceCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setMessage("");
    try { setSystems(await loadManagerServiceCatalog({ includeRetired: true })); }
    catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setMessage(reason instanceof Error ? reason.message : "Service catalog could not be loaded.");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const retire = async (entry: ManagerServiceCatalogEntry) => {
    if (!window.confirm(`Retire “${entry.displayName}”? It will no longer be offered when assigning services to a customer. Customers already using it are unaffected.`)) return;
    setBusyKey(entry.key); setMessage("");
    try { await retireManagerServiceCatalogEntry(entry.key); await load(); }
    catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setMessage(reason instanceof Error ? reason.message : "Service catalog entry could not be retired.");
    } finally { setBusyKey(null); }
  };

  const restore = async (entry: ManagerServiceCatalogEntry) => {
    setBusyKey(entry.key); setMessage("");
    try { await restoreManagerServiceCatalogEntry(entry.key); await load(); }
    catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setMessage(reason instanceof Error ? reason.message : "Service catalog entry could not be restored.");
    } finally { setBusyKey(null); }
  };

  const active = systems.filter((entry) => !entry.retiredAt);
  const retired = systems.filter((entry) => entry.retiredAt);

  return <section aria-labelledby="manager-service-catalog-title">
    <div className="workspace-heading"><div><p className="eyebrow">Manager workspace</p><h2 id="manager-service-catalog-title">Service Catalog</h2><p>Retire a system so it is no longer offered for new customer assignment. Existing assignments are unaffected.</p></div></div>
    {message ? <p className="form-message" role="alert">{message}</p> : null}
    {loading ? <p role="status">Loading service catalog…</p> : null}
    {!loading && active.length === 0 ? <p className="empty-state">No active services in the catalog.</p> : null}
    {active.length ? <ul className="job-card-list">{active.map((entry) => <li key={entry.key}>
      <div className="job-card"><div className="job-card-heading"><div><span className="job-card-label">Service</span><strong>{entry.displayName}</strong></div><span className="status-badge status-badge--complete">Active</span></div></div>
      <div className="inline-actions"><button type="button" className="secondary-command" disabled={busyKey === entry.key} onClick={() => void retire(entry)}>{busyKey === entry.key ? "Retiring…" : "Retire"}</button></div>
    </li>)}</ul> : null}
    {retired.length ? <section aria-labelledby="manager-retired-services-title">
      <h3 id="manager-retired-services-title">Retired services</h3>
      <ul className="job-card-list">{retired.map((entry) => <li key={entry.key}>
        <div className="job-card"><div className="job-card-heading"><div><span className="job-card-label">Service</span><strong>{entry.displayName}</strong></div><span className="status-badge">Retired</span></div></div>
        <div className="inline-actions"><button type="button" disabled={busyKey === entry.key} onClick={() => void restore(entry)}>{busyKey === entry.key ? "Restoring…" : "Restore"}</button></div>
      </li>)}</ul>
    </section> : null}
  </section>;
}
