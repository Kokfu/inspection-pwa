import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthUser } from "../auth/authApi";
import { CustomerTimeline } from "../visits/CustomerTimeline";
import "../visits/CustomerTimeline.css";
import {
  activateManagerCustomerConfiguration,
  archiveManagerCustomer,
  archiveManagerCustomerSite,
  createManagerCustomerSite,
  evidencePolicyAssignableSystemKeys,
  confirmManagerCustomer,
  loadArchivedManagerCustomers,
  loadManagerEvidencePolicy,
  loadManagerLocations,
  loadManagerSystemConfiguration,
  locationConfigurableSystemKeys,
  ManagerApiError,
  restoreManagerCustomer,
  restoreManagerCustomerSite,
  savesGeneralLayout,
  saveCustomerSiteAddress,
  saveManagerEvidencePolicy,
  saveManagerLocations,
  saveManagerSystemConfiguration,
  systemConfigurationSystemKeys,
  type ManagerCustomer,
  type ManagerEvidencePolicyOption,
  type ManagerLocations,
  type ManagerSystemConfigurationSchema,
  isGeneralLayout
} from "./managerApi";
import { customerMatches, isUnconfirmed, ManagerCustomerTable, ManagerCustomerDetailsEditor } from "./ManagerCustomerRecords";
import { ManagerCustomerServices } from "./ManagerCustomerServices";
import { locationNameWarnings } from "../referenceData/locationNameWarnings";
import { WorkspaceEyebrow } from "./WorkspaceEyebrow";

export function ManagerCustomerConfiguration({ customers, loading, message, onRefresh, onManage, onAuthorityFailure }: {
  customers: ManagerCustomer[]; loading: boolean; message: string; onRefresh: () => Promise<void>; onManage: (customer: ManagerCustomer) => void; onAuthorityFailure: (error: ManagerApiError) => void;
}) {
  const [error, setError] = useState("");
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archivedCustomers, setArchivedCustomers] = useState<ManagerCustomer[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [searchMessage, setSearchMessage] = useState("");
  const [unconfirmedOnly, setUnconfirmedOnly] = useState(false);
  const unconfirmedCount = customers.filter(isUnconfirmed).length;

  const search = () => {
    const trimmed = query.trim();
    if (!trimmed) { setSubmittedQuery(null); setSearchMessage("Enter a name, contact, site or phone to search."); return; }
    setSearchMessage("");
    setSubmittedQuery(trimmed);
  };
  const clearSearch = () => { setQuery(""); setSubmittedQuery(null); setSearchMessage(""); };
  const needle = submittedQuery?.toLocaleLowerCase() ?? "";
  const filteredCustomers = customers.filter((row) => (submittedQuery === null || customerMatches(row, needle)) && (!unconfirmedOnly || isUnconfirmed(row)));

  const fail = (reason: unknown, fallback: string) => {
    if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
    else setError(reason instanceof Error ? reason.message : fallback);
  };

  const loadArchived = async () => {
    setArchivedLoading(true); setError("");
    try { setArchivedCustomers(await loadArchivedManagerCustomers()); }
    catch (reason) { fail(reason, "Archived customers could not be loaded."); }
    finally { setArchivedLoading(false); }
  };

  const toggleArchived = () => {
    const next = !archivedOpen;
    setArchivedOpen(next);
    if (next) void loadArchived();
  };

  const archive = async (customer: ManagerCustomer) => {
    if (!window.confirm(`Archive customer “${customer.customer.displayName}”? It will no longer appear in active lists, and can be restored later.`)) return;
    setArchivingId(customer.customer.id); setError("");
    try { await archiveManagerCustomer(customer.customer.id); await onRefresh(); if (archivedOpen) await loadArchived(); }
    catch (reason) { fail(reason, "Customer could not be archived."); }
    finally { setArchivingId(null); }
  };

  const restore = async (customer: ManagerCustomer) => {
    setRestoringId(customer.customer.id); setError("");
    try { await restoreManagerCustomer(customer.customer.id); await Promise.all([onRefresh(), loadArchived()]); }
    catch (reason) { fail(reason, "Customer could not be restored."); }
    finally { setRestoringId(null); }
  };

  return <section className="page-stack" aria-labelledby="manager-customers-title">
    <div className="workspace-heading"><div><WorkspaceEyebrow /><h2 id="manager-customers-title">Customers</h2><p>Manage customer details, sites and services.</p></div><div className="inline-actions"><a className="secondary-command customer-add-link" href="#/manager-add-customer">Add Customer</a><button type="button" className="secondary-command" disabled={loading} onClick={() => void onRefresh()}>Refresh</button></div></div>
    {message || error ? <p className="form-message" role="alert">{error || message}</p> : null}
    <form className="manager-search-form" role="search" aria-label="Find active customer" onSubmit={(event) => { event.preventDefault(); search(); }}>
      <label htmlFor="customer-configuration-search">Name, contact, site or phone</label>
      <div className="manager-search-row">
        <input id="customer-configuration-search" type="search" autoComplete="off" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="submit" disabled={loading}>Search</button>
        <button type="button" className="secondary-command" onClick={clearSearch}>Clear</button>
      </div>
    </form>
    {searchMessage ? <p className="form-message" role="status">{searchMessage}</p> : null}
    <div className="customer-filter-chips"><button type="button" className="secondary-command customer-filter-chip" aria-pressed={unconfirmedOnly} onClick={() => setUnconfirmedOnly((value) => !value)}>Unconfirmed ({unconfirmedCount})</button></div>
    {loading ? <p role="status">Loading customers…</p> : null}
    {!loading && filteredCustomers.length ? <ManagerCustomerTable customers={filteredCustomers} onManage={onManage} onArchive={(row) => void archive(row)} archivingId={archivingId} /> : !loading ? <p className="empty-state" role="status">{customers.length ? unconfirmedOnly && !submittedQuery ? "No unconfirmed customers." : `No customers match the search.` : "No operational customers are configured."}</p> : null}
    <section aria-labelledby="manager-archived-customers-title">
      <button type="button" className="secondary-command" aria-expanded={archivedOpen} onClick={toggleArchived}>{archivedOpen ? "Hide archived customers" : "Show archived customers"}</button>
      {archivedOpen ? <div>
        <h3 id="manager-archived-customers-title">Archived customers</h3>
        {archivedLoading ? <p role="status">Loading archived customers…</p> : null}
        {!archivedLoading && archivedCustomers.length === 0 ? <p className="empty-state">No archived customers.</p> : null}
        {archivedCustomers.length ? <ul className="job-card-list">{archivedCustomers.map((customer) => <li key={customer.customer.id}>
          <div className="job-card"><div className="job-card-heading"><div><span className="job-card-label">Customer</span><strong>{customer.customer.displayName}</strong></div><span className="status-badge">Archived</span></div></div>
          <div className="inline-actions"><button type="button" disabled={restoringId === customer.customer.id} onClick={() => void restore(customer)}>{restoringId === customer.customer.id ? "Restoring…" : "Restore"}</button></div>
        </li>)}</ul> : null}
      </div> : null}
    </section>
  </section>;
}

export function ManagerCustomerConfigurationDetail({ customer, onBack, onSaved, onAuthorityFailure, onViewServiceVisit, onViewFinalReport, onDownloadFinalReport, onOpenService, timelineActor, timelineMode = "unavailable", onViewRepairVisit }: {
  customer: ManagerCustomer; onBack: () => void; onSaved: (customer: ManagerCustomer) => void; onAuthorityFailure: (error: ManagerApiError) => void;
  onViewServiceVisit: (jobId: string) => void; onViewFinalReport: (jobId: string) => void; onDownloadFinalReport: (jobId: string) => Promise<void>;
  /** Opens the per-service editor (Form wording / Preset rows / Settings) for one service. */
  onOpenService?: (systemKey: string) => void;
  timelineActor?: AuthUser; timelineMode?: "server" | "offline" | "unavailable";
  onViewRepairVisit?: (visitId: string) => void;
}) {
  const [tab, setTab] = useState<"Details" | "Sites" | "Timeline">("Details");
  const timelineKey = `${timelineActor?.id}:${timelineActor?.role}:${customer.customer.id}:${timelineMode}`;
  const [timelineCount, setTimelineCount] = useState<{ key: string; count: number | undefined }>();
  const updateTimelineCount = useCallback((count: number | undefined) => setTimelineCount({ key: timelineKey, count }), [timelineKey]);
  const [keys, setKeys] = useState<string[]>([]); const [saving, setSaving] = useState(false); const [addingSite, setAddingSite] = useState(false); const [siteName, setSiteName] = useState(""); const [newSiteAddress, setNewSiteAddress] = useState(""); const [siteSaving, setSiteSaving] = useState(false); const [error, setError] = useState("");
  const [archivedSitesOpen, setArchivedSitesOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [siteChanging, setSiteChanging] = useState<string | null>(null);
  // A completed write still belongs to the customer screen that started it.
  // Invalidate callbacks on navigation/authority unmount, including late errors.
  const siteChangeGeneration = useRef(0);
  useEffect(() => {
    siteChangeGeneration.current += 1;
    setSiteChanging(null);
    return () => { siteChangeGeneration.current += 1; };
  }, [customer.customer.id]);
  const changeSite = async (site: ManagerCustomer["sites"][number], action: "archive" | "restore") => {
    if (siteChanging !== null) return;
    if (action === "archive" && !window.confirm(`Archive ${site.displayName}? It will no longer be offered when creating a new service visit. Existing visits and reports keep this site.${customer.sites.length === 1 ? " Warning: this customer will have no active sites." : ""}`)) return;
    const generation = siteChangeGeneration.current;
    const isCurrent = () => generation === siteChangeGeneration.current;
    setSiteChanging(site.id); setError("");
    try {
      const updated = await (action === "archive" ? archiveManagerCustomerSite : restoreManagerCustomerSite)(customer.customer.id, site.id);
      if (isCurrent()) onSaved(updated);
    } catch (reason) {
      if (!isCurrent()) return;
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setError(reason instanceof Error ? reason.message : `Site could not be ${action === "archive" ? "archived" : "restored"}.`);
    } finally { if (isCurrent()) setSiteChanging(null); }
  };
  const [newRiserMode, setNewRiserMode] = useState("");
  useEffect(() => { setKeys(customer.configuration.enabledSystems.map((system) => system.key)); setNewRiserMode(""); }, [customer]);
  const toggle = (key: string) => setKeys((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
  // `dry_wet_riser` cannot be stood up without a frozen `riserMode`, so whenever
  // it is ticked without one the choice is required inline and passed through
  // `activateManagerCustomerConfiguration`'s `systemConfiguration` arg — one
  // atomic revision that enables (or re-affirms) and configures it. This covers
  // a fresh tick AND — defensively — an already-enabled riser whose stored
  // `system_configuration` somehow carries no `riserMode`. If that inline control
  // were ever missed, the save is still safely rejected server-side with
  // `RISER_MODE_REQUIRED` (HTTP 400, surfaced inline as a domain error) BEFORE
  // any revision row is written; surfacing the control just gives the Manager an
  // in-form way to supply the mode instead of a bare server string. When the
  // riser already has a valid `riserMode`, `riserNeedsMode` is false and the save
  // path is byte-unchanged (no `systemConfiguration` arg).
  const riserEnabled = customer.configuration.enabledSystems.find((system) => system.key === "dry_wet_riser");
  const riserStoredMode = riserEnabled?.systemConfiguration?.riserMode;
  const riserNeedsMode = keys.includes("dry_wet_riser") && riserStoredMode !== "dry" && riserStoredMode !== "wet";
  // Display-only: a one-line inline warning when the pending selection drops a
  // system that has saved per-service settings. `copySelectedConfiguration`
  // (server) only forward-copies config for keys still selected, so re-adding the
  // service in a later revision comes back bare. The save path is unchanged. The
  // `keys.length > 0` guard skips the transient mount frame before the
  // `enabledSystems` effect seeds `keys`.
  const removedSystemsWithSettings = keys.length === 0 ? [] : customer.configuration.enabledSystems
    .filter((system) => !keys.includes(system.key) && enabledSystemHasSavedSettings(system))
    .map((system) => system.displayName);
  const submitConfiguration = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (riserNeedsMode && newRiserMode !== "dry" && newRiserMode !== "wet") {
      setError("Choose a riser mode (dry or wet) for Dry / Wet Riser before saving."); return;
    }
    setSaving(true);
    try {
      onSaved(await activateManagerCustomerConfiguration(
        customer.customer.id, keys,
        riserNeedsMode ? { dry_wet_riser: { riserMode: newRiserMode } } : undefined
      ));
    } catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setError(reason instanceof Error ? reason.message : "Configuration could not be activated.");
    } finally { setSaving(false); }
  };
  const confirmDetails = async () => {
    setConfirming(true); setError("");
    try { onSaved(await confirmManagerCustomer(customer.customer.id)); }
    catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setError(reason instanceof Error ? reason.message : "Customer details could not be confirmed.");
    } finally { setConfirming(false); }
  };
  const addedOn = customer.customer.createdAt ? new Date(customer.customer.createdAt) : null;
  const addedLine = customer.customer.createdBy && addedOn && !Number.isNaN(addedOn.getTime())
    ? `Added by ${customer.customer.createdBy} on ${addedOn.toLocaleDateString("sv-SE")}` : null;
  return <section className="manager-home page-stack" aria-labelledby="customer-configuration-title"><button type="button" className="secondary-command" onClick={onBack}>Back to Customers</button><div className="workspace-heading"><div><p className="eyebrow">Customer Configuration</p><h2 id="customer-configuration-title">{customer.customer.displayName}</h2><p>{customer.sites.map((site) => site.displayName).join(", ")}</p>{addedLine ? <p className="customer-added-by">{addedLine}</p> : null}</div><div className="inline-actions">{isUnconfirmed(customer) ? <><span className="status-badge status-badge--waiting">Unconfirmed</span><button type="button" disabled={confirming} onClick={() => void confirmDetails()}>Confirm details</button></> : <span className="status-badge status-badge--complete">Current settings</span>}</div></div>
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    <div className="customer-record-tabs" role="tablist" aria-label="Customer record">{(["Details", "Sites", "Timeline"] as const).map((value) => <button type="button" role="tab" key={value} id={`customer-tab-${value}`} aria-controls={`customer-panel-${value}`} aria-selected={tab === value} onClick={() => setTab(value)}>{value}{value === "Timeline" && timelineCount?.key === timelineKey && timelineCount.count !== undefined ? <> <span className="status-badge">{timelineCount.count}</span></> : null}</button>)}</div>
    <div role="tabpanel" id="customer-panel-Details" aria-labelledby="customer-tab-Details" hidden={tab !== "Details"}><ManagerCustomerDetailsEditor key={customer.customer.id} customer={customer} onSaved={onSaved} onAuthorityFailure={onAuthorityFailure} /></div>
    <div role="tabpanel" id="customer-panel-Sites" aria-labelledby="customer-tab-Sites" hidden={tab !== "Sites"}>
    <section className="report-summary setup-card customer-form-card"><div className="workspace-heading"><h3>Sites</h3><button type="button" disabled={siteSaving} onClick={() => { setAddingSite(true); setError(""); }}>+ Add Site</button></div><ul>{customer.sites.map((site) => <ManagerSiteAddress key={site.id} customerId={customer.customer.id} site={site} archiveDisabled={siteChanging !== null} onArchive={() => void changeSite(site, "archive")} onSaved={onSaved} onAuthorityFailure={onAuthorityFailure} />)}</ul>{customer.sites.length === 0 ? <p className="empty-state">No active sites.</p> : null}
      <section aria-label="Archived sites">
        <button type="button" className="secondary-command" aria-expanded={archivedSitesOpen} aria-controls="archived-sites-list" onClick={() => setArchivedSitesOpen((open) => !open)}>Archived sites</button>
        {archivedSitesOpen ? <div id="archived-sites-list">
          {customer.archivedSites?.length ? <ul>{customer.archivedSites.map((site) => <li key={site.id}>
            <strong>{site.displayName}</strong>{site.address ? <p>{site.address}</p> : null}
            <div className="inline-actions"><button type="button" disabled={siteChanging !== null} onClick={() => void changeSite(site, "restore")}>{siteChanging === site.id ? "Restoring…" : "Restore"}</button></div>
          </li>)}</ul> : <p className="empty-state">No archived sites.</p>}
        </div> : null}
      </section>{addingSite ? <form onSubmit={async (event) => { event.preventDefault(); setSiteSaving(true); setError(""); try { onSaved(await createManagerCustomerSite(customer.customer.id, siteName, newSiteAddress)); setAddingSite(false); setSiteName(""); setNewSiteAddress(""); } catch (reason) { if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason); else setError(reason instanceof Error ? reason.message : "Site could not be created."); } finally { setSiteSaving(false); } }}><label>Site Name<input required maxLength={160} value={siteName} onChange={(event) => setSiteName(event.target.value)} /></label><label>Site Address<input maxLength={500} value={newSiteAddress} onChange={(event) => setNewSiteAddress(event.target.value)} /></label><div className="inline-actions"><button type="button" className="secondary-command" disabled={siteSaving} onClick={() => { setAddingSite(false); setError(""); }}>Cancel</button><button disabled={siteSaving}>{siteSaving ? "Adding…" : "Add Site"}</button></div></form> : null}</section></div><div hidden={tab !== "Details"}><form className="report-summary setup-card customer-form-card" onSubmit={submitConfiguration}><h3>Assigned Services</h3><fieldset className="manager-service-picker">{customer.supportedSystems.map((system) => <label className="manager-service-option" key={system.key}><input type="checkbox" disabled={!system.assignable && !keys.includes(system.key)} checked={keys.includes(system.key)} onChange={() => toggle(system.key)} /><span className="manager-service-option-copy"><strong>{system.displayName}</strong>{!system.assignable ? <><small className="manager-service-option-reason">{system.unavailableReason}</small>{locationConfigurableSystemKeys.has(system.key) && !savesGeneralLayout(system.key) ? <small className="manager-service-option-reason">Define at least one zone and one location for this service in its “Zones &amp; locations” editor below (open it under Services → Preset rows), then this service can be assigned.</small> : null}</> : null}</span></label>)}</fieldset>{riserNeedsMode ? <label className="manager-riser-mode">Riser mode<select required value={newRiserMode} onChange={(event) => setNewRiserMode(event.target.value)}><option value="">Select…</option><option value="dry">Dry</option><option value="wet">Wet</option></select></label> : null}{removedSystemsWithSettings.length > 0 ? <p className="support-metadata" role="status">Removing {removedSystemsWithSettings.join(", ")} also drops the per-service settings saved for it (zones and locations, field labels, system and evidence settings). Re-adding a service in a later version starts from defaults — its previous settings are not restored.</p> : null}<p>Saving creates a new version of these settings. Existing service visits keep the services originally assigned to them.</p><p className="support-metadata">Version {customer.configuration.revision}</p><div className="inline-actions"><button type="button" className="secondary-command" disabled={saving} onClick={onBack}>Cancel</button><button disabled={saving || keys.length === 0}>{saving ? "Saving…" : "Save & Activate"}</button></div></form>
    <ManagerCustomerServices customer={customer} onOpenService={onOpenService} />
    </div>
    <div role="tabpanel" id="customer-panel-Timeline" aria-labelledby="customer-tab-Timeline" hidden={tab !== "Timeline"}>
      {timelineActor?.role === "admin" && onViewRepairVisit ? <CustomerTimeline key={timelineKey} customerId={customer.customer.id} actor={timelineActor} mode={timelineMode}
        onCountChange={updateTimelineCount} onOpen={visit => visit.kind === "service" ? onViewServiceVisit(visit.id) : onViewRepairVisit(visit.id)} />
        : <p role="status">Verify your manager session to view customer history.</p>}
    </div>
  </section>;
}

function ManagerSiteAddress({ customerId, site, onSaved, onAuthorityFailure, onArchive, archiveDisabled }: {
  onArchive: () => void; archiveDisabled: boolean;
  customerId: string; site: ManagerCustomer["sites"][number]; onSaved: (customer: ManagerCustomer) => void; onAuthorityFailure: (error: ManagerApiError) => void;
}) {
  const [address, setAddress] = useState(site.address ?? ""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  useEffect(() => setAddress(site.address ?? ""), [site]);
  return <li><strong>{site.displayName}</strong><div className="inline-actions"><button type="button" className="secondary-command" disabled={archiveDisabled || saving} onClick={onArchive}>Archive</button></div><form onSubmit={async (event) => { event.preventDefault(); setSaving(true); setError(""); try { onSaved(await saveCustomerSiteAddress(customerId, site.id, address.trim() || null)); } catch (reason) { if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason); else setError(reason instanceof Error ? reason.message : "Site address could not be saved."); } finally { setSaving(false); } }}><label>Site Address<input maxLength={500} value={address} onChange={(event) => setAddress(event.target.value)} /></label><button disabled={saving}>{saving ? "Saving…" : "Save Address"}</button>{error ? <span role="alert">{error}</span> : null}</form></li>;
}

/**
 * Slice 3b: the four per-service editors below share one collapsible affordance.
 * The Manager customer page now opens each service in `ManagerServiceEditor`,
 * which mounts the per-system editors `embedded` (open, loaded on mount, no
 * toggle); the collapsible wrappers stay exported for their browser harnesses.
 * Field-label wording is edited only in that editor's "Form wording" tab.
 * These are the single source of that shared copy, so the per-system toggle
 * label, the unsaved-changes line and the save confirmation stay identical
 * across all four editors. Only `noun` varies between them.
 */
const perServiceToggleLabel = (open: boolean, noun: string, systemLabel: string) =>
  `${open ? "Hide" : "Edit"} ${noun} — ${systemLabel}`;
const perServiceUnsavedLine = (changed: boolean) => (changed ? "Unsaved changes." : "No unsaved changes.");
const PER_SERVICE_SAVE_CONFIRMATION = "Saved. A new configuration version was created.";

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * STEP 3.1 final polish: does one enabled system carry any saved per-service
 * configuration that `copySelectedConfiguration` would NOT restore if the system
 * were unticked now and re-added later? Label overrides / system configuration /
 * evidence policy / zones-or-locations (a lone zone with no locations still
 * counts as entered config), read straight off
 * `customer.configuration.enabledSystems`. The Services cards
 * (`managerServiceChips`) read the same fields, so a lone zone shows there as
 * "1 zone, no locations" — never as "nothing set" — and the two agree.
 */
const enabledSystemHasSavedSettings = (
  system: ManagerCustomer["configuration"]["enabledSystems"][number]
) => {
  const labelOverrides = (system as { labelOverrides?: Record<string, unknown> }).labelOverrides;
  return (isPlainRecord(labelOverrides) && Object.keys(labelOverrides).length > 0)
    || (isPlainRecord(system.systemConfiguration) && Object.keys(system.systemConfiguration).length > 0)
    || (typeof system.evidencePolicyId === "string" && system.evidencePolicyId.length > 0)
    || system.zones.length > 0
    || system.locations.length > 0;
};

/**
 * Per-customer `system_configuration` editor. One collapsible section per
 * eligible enabled system (`systemConfigurationSystemKeys`). Reads the
 * server-authoritative form descriptor + stored config from
 * `GET .../system-configuration` and PUTs the full object; the server versions
 * the customer configuration and forward-copies everything else. Server
 * validation (`INVALID_SYSTEM_CONFIGURATION`) surfaces inline as the server's
 * own message, never as an authority failure.
 */
export function ManagerCustomerSystemConfiguration({ customer, onSaved, onAuthorityFailure }: {
  customer: ManagerCustomer; onSaved: (customer: ManagerCustomer) => void; onAuthorityFailure: (error: ManagerApiError) => void;
}) {
  const editable = useMemo(
    () => customer.configuration.enabledSystems.filter((system) => systemConfigurationSystemKeys.has(system.key)),
    [customer.configuration.enabledSystems]
  );
  if (editable.length === 0) return null;
  return <section className="manager-per-service-block" aria-labelledby="manager-system-configuration-title">
    <h4 id="manager-system-configuration-title">System configuration</h4>
    <p>Set the per-customer options that change how this service is carried out. Saving creates a new configuration version; existing service visits keep the settings they were created with.</p>
    {editable.map((system) => (
      <ManagerSystemConfigurationEditor
        key={system.key}
        customerId={customer.customer.id}
        systemKey={system.key}
        systemLabel={system.displayName}
        onSaved={onSaved}
        onAuthorityFailure={onAuthorityFailure}
      />
    ))}
  </section>;
}

export function ManagerSystemConfigurationEditor({ customerId, systemKey, systemLabel, onSaved, onAuthorityFailure, embedded = false }: {
  customerId: string; systemKey: string; systemLabel: string;
  onSaved: (customer: ManagerCustomer) => void; onAuthorityFailure: (error: ManagerApiError) => void;
  /** Rendered inside the per-service editor: open and loaded on mount, no collapsible toggle. */
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(embedded);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schema, setSchema] = useState<ManagerSystemConfigurationSchema | undefined>(undefined);
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const hydrate = (next: ManagerSystemConfigurationSchema, configuration: Record<string, unknown>) => {
    const values = Object.fromEntries(next.fields.map((field) => {
      const value = configuration[field.key];
      return [field.key, typeof value === "string" ? value : ""];
    }));
    setSchema(next); setLoaded(values); setDraft(values);
  };

  const load = async () => {
    setLoading(true); setError(""); setMessage("");
    try { const result = await loadManagerSystemConfiguration(customerId, systemKey); hydrate(result.schema, result.configuration); }
    catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setError(reason instanceof Error ? reason.message : "System configuration could not be loaded.");
    } finally { setLoading(false); }
  };

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && schema === undefined && !loading) void load();
  };

  useEffect(() => { if (embedded) void load(); }, [embedded, customerId, systemKey]);

  const save = async () => {
    if (!schema) return;
    setSaving(true); setError(""); setMessage("");
    const payload: Record<string, unknown> = {};
    for (const field of schema.fields) payload[field.key] = draft[field.key] ?? "";
    try {
      const result = await saveManagerSystemConfiguration(customerId, systemKey, payload);
      hydrate(result.configuration.schema, result.configuration.configuration);
      onSaved(result.customer);
      setMessage(PER_SERVICE_SAVE_CONFIRMATION);
    } catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setError(reason instanceof Error ? reason.message : "System configuration could not be saved.");
    } finally { setSaving(false); }
  };

  const changedCount = schema
    ? schema.fields.filter((field) => (draft[field.key] ?? "") !== (loaded[field.key] ?? "")).length
    : 0;

  return <div className="manager-system-configuration-system">
    {!embedded ? <button type="button" className="secondary-command" aria-expanded={open} onClick={toggleOpen}>
      {perServiceToggleLabel(open, "system settings", systemLabel)}
    </button> : null}
    {open ? <div>
      {loading ? <p>Loading system configuration…</p> : null}
      {error ? <p className="form-message" role="alert">{error}</p> : null}
      {message ? <p className="form-message" role="status">{message}</p> : null}
      {schema ? <>
        <ul className="manager-system-configuration-list">
          {schema.fields.map((field) => (
            <li key={field.key}>
              <label>
                <span className="manager-system-configuration-label">{field.label}</span>
                <select
                  aria-label={field.label}
                  value={draft[field.key] ?? ""}
                  onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                >
                  <option value="">Select…</option>
                  {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </li>
          ))}
        </ul>
        <p className="support-metadata">{perServiceUnsavedLine(changedCount > 0)}</p>
        <div className="inline-actions">
          <button type="button" className="secondary-command" disabled={saving || loading} onClick={() => void load()}>Reload</button>
          <button type="button" disabled={saving || loading} onClick={() => void save()}>{saving ? "Saving…" : "Save configuration"}</button>
        </div>
      </> : null}
    </div> : null}
  </div>;
}

/**
 * Per-customer evidence-policy assignment (`customer_enabled_systems.evidence_policy_id`).
 * One collapsible section per eligible enabled system (`evidencePolicyAssignableSystemKeys`).
 * Reads the server-authoritative `field` descriptor + published policy list +
 * current value from `GET .../evidence-policy` and PUTs the chosen id (`""` ->
 * `null`); the server versions the customer configuration and forward-copies
 * everything else. Server validation (`INVALID_EVIDENCE_POLICY`) surfaces inline
 * as the server's own message, never as an authority failure.
 *
 * This only affects the LEGACY photo-evidence lifecycle — V7 evidence is
 * contract-driven and ignores it, so assigning a policy is a no-op for every
 * customer created today. Nothing gates enabling a system on an evidence policy;
 * there is no inline requirement and the "Assigned Services" save path is
 * unchanged.
 */
export function ManagerCustomerEvidencePolicy({ customer, onSaved, onAuthorityFailure }: {
  customer: ManagerCustomer; onSaved: (customer: ManagerCustomer) => void; onAuthorityFailure: (error: ManagerApiError) => void;
}) {
  const editable = useMemo(
    () => customer.configuration.enabledSystems.filter((system) => evidencePolicyAssignableSystemKeys.has(system.key)),
    [customer.configuration.enabledSystems]
  );
  if (editable.length === 0) return null;
  return <section className="manager-per-service-block" aria-labelledby="manager-evidence-policy-title">
    <h4 id="manager-evidence-policy-title">Evidence policy</h4>
    <p>Assign the photo-evidence policy a technician's inspection is held to for this customer. This affects the legacy photo-evidence lifecycle only, never what is recorded. Saving creates a new configuration version; existing service visits keep the policy they were created with.</p>
    {editable.map((system) => (
      <ManagerEvidencePolicyEditor
        key={system.key}
        customerId={customer.customer.id}
        systemKey={system.key}
        systemLabel={system.displayName}
        onSaved={onSaved}
        onAuthorityFailure={onAuthorityFailure}
      />
    ))}
  </section>;
}

export function ManagerEvidencePolicyEditor({ customerId, systemKey, systemLabel, onSaved, onAuthorityFailure, embedded = false }: {
  customerId: string; systemKey: string; systemLabel: string;
  onSaved: (customer: ManagerCustomer) => void; onAuthorityFailure: (error: ManagerApiError) => void;
  /** Rendered inside the per-service editor: open and loaded on mount, no collapsible toggle. */
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(embedded);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldLabel, setFieldLabel] = useState("Evidence policy");
  const [policies, setPolicies] = useState<ManagerEvidencePolicyOption[] | undefined>(undefined);
  const [loaded, setLoaded] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const hydrate = (next: { field: { label: string }; policies: ManagerEvidencePolicyOption[]; evidencePolicyId: string | null }) => {
    setFieldLabel(next.field.label);
    setPolicies(next.policies);
    setLoaded(next.evidencePolicyId ?? "");
    setDraft(next.evidencePolicyId ?? "");
  };

  const load = async () => {
    setLoading(true); setError(""); setMessage("");
    try { hydrate(await loadManagerEvidencePolicy(customerId, systemKey)); }
    catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setError(reason instanceof Error ? reason.message : "Evidence policy could not be loaded.");
    } finally { setLoading(false); }
  };

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && policies === undefined && !loading) void load();
  };

  useEffect(() => { if (embedded) void load(); }, [embedded, customerId, systemKey]);

  const save = async () => {
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await saveManagerEvidencePolicy(customerId, systemKey, draft === "" ? null : draft);
      hydrate(result.evidencePolicy);
      onSaved(result.customer);
      setMessage(PER_SERVICE_SAVE_CONFIRMATION);
    } catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setError(reason instanceof Error ? reason.message : "Evidence policy could not be saved.");
    } finally { setSaving(false); }
  };

  const changed = draft !== loaded;

  return <div className="manager-evidence-policy-system">
    {!embedded ? <button type="button" className="secondary-command" aria-expanded={open} onClick={toggleOpen}>
      {perServiceToggleLabel(open, "evidence policy", systemLabel)}
    </button> : null}
    {open ? <div>
      {loading ? <p>Loading evidence policy…</p> : null}
      {error ? <p className="form-message" role="alert">{error}</p> : null}
      {message ? <p className="form-message" role="status">{message}</p> : null}
      {policies ? <>
        <ul className="manager-evidence-policy-list">
          <li>
            <label>
              <span className="manager-evidence-policy-label">{fieldLabel}</span>
              <select
                aria-label={fieldLabel}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              >
                <option value="">None (default evidence handling)</option>
                {policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.label}</option>)}
              </select>
            </label>
          </li>
        </ul>
        <p className="support-metadata">{perServiceUnsavedLine(changed)}</p>
        <div className="inline-actions">
          <button type="button" className="secondary-command" disabled={saving || loading} onClick={() => void load()}>Reload</button>
          <button type="button" disabled={saving || loading} onClick={() => void save()}>{saving ? "Saving…" : "Save evidence policy"}</button>
        </div>
      </> : null}
    </div> : null}
  </div>;
}

/**
 * Per-customer zone / location configuration for the location-dependent master
 * systems (`locationConfigurableSystemKeys` ∩ the customer's supported catalog —
 * NOT limited to already-enabled systems, because defining zones/locations here
 * is what makes a system enable-able). One collapsible editor per eligible
 * system, lazy GET on expand. Reads the current zones/locations from
 * `GET .../locations` and PUTs the full set; the server versions the customer
 * configuration and forward-copies everything else. Server validation
 * (`INVALID_LOCATION_CONFIGURATION`) surfaces inline as the server's own
 * message, never as an authority failure. The "Assigned Services" save path is
 * unchanged.
 */
export function ManagerCustomerLocations({ customer, onSaved, onAuthorityFailure }: {
  customer: ManagerCustomer; onSaved: (customer: ManagerCustomer) => void; onAuthorityFailure: (error: ManagerApiError) => void;
}) {
  const editable = useMemo(
    () => customer.supportedSystems.filter((system) => locationConfigurableSystemKeys.has(system.key)),
    [customer.supportedSystems]
  );
  if (editable.length === 0) return null;
  return <section className="manager-per-service-block" aria-labelledby="manager-locations-title">
    <h4 id="manager-locations-title">Zones &amp; locations</h4>
    <p>Optionally define zones and locations for this customer. CO2, Wet Chemical, and FM200 use one General location in new visits when none are configured. Hydrant and Dry / Wet Riser use either the zones and locations you define here or one General layout that a technician enters on a visit and an Admin approves. Hose Reel has no zones: its layout also comes from a technician's visit. Saving creates a new configuration version; existing service visits keep the locations they were created with.</p>
    {editable.map((system) => (
      <ManagerLocationsEditor
        key={system.key}
        customerId={customer.customer.id}
        systemKey={system.key}
        systemLabel={system.displayName}
        onSaved={onSaved}
        onAuthorityFailure={onAuthorityFailure}
      />
    ))}
  </section>;
}

type LocationsZoneRow = { localId: string; key: string; displayName: string };
type LocationsLocationRow = { localId: string; key: string; displayName: string; zoneLocalId: string; presetRowCount: number };

const newLocationsKey = () => {
  const raw = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `k${Date.now()}${Math.random()}`;
  return raw.replace(/[^a-z0-9]/gi, "").slice(0, 12) || `k${Date.now()}`;
};

const normalizeLocationsDraft = (zoneRows: LocationsZoneRow[], locationRows: LocationsLocationRow[]) => ({
  zones: zoneRows.map((zone, index) => ({ key: zone.key, displayName: zone.displayName.trim(), sortOrder: index + 1 })),
  locations: locationRows.map((location) => ({
    key: location.key,
    displayName: location.displayName.trim(),
    zoneId: zoneRows.find((zone) => zone.localId === location.zoneLocalId)?.key ?? "",
    presetRowCount: location.presetRowCount
  }))
});

/** Local pre-check so a mistake gets a specific message instead of the server's generic "payload is invalid". */
function locationsDraftProblem(zoneRows: LocationsZoneRow[], locationRows: LocationsLocationRow[]): string {
  if (zoneRows.some((zone) => !zone.displayName.trim())) return "Every zone needs a name. Fill in or remove the blank zone.";
  if (locationRows.some((location) => !location.displayName.trim())) return "Every location needs a name. Fill in or remove the blank location.";
  if (locationRows.some((location) => !location.zoneLocalId)) return "Choose a zone for every location.";
  return "";
}

export function ManagerLocationsEditor({ customerId, systemKey, systemLabel, onSaved, onAuthorityFailure, embedded = false }: {
  customerId: string; systemKey: string; systemLabel: string;
  onSaved: (customer: ManagerCustomer) => void; onAuthorityFailure: (error: ManagerApiError) => void;
  /** Rendered inside the per-service editor: open and loaded on mount, no collapsible toggle. */
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(embedded);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [zoneRows, setZoneRows] = useState<LocationsZoneRow[]>([]);
  const [locationRows, setLocationRows] = useState<LocationsLocationRow[]>([]);
  const [loadedSnapshot, setLoadedSnapshot] = useState("");
  // Hydrant / Dry-Wet-Riser customers whose layout is the General layout saved from inspections: shown, not edited here.
  const [generalLayoutRows, setGeneralLayoutRows] = useState<number | null>(null);
  // Hydrant / Dry-Wet-Riser customer with neither zones nor a saved layout yet: the technician enters it on a visit.
  const [noLayoutYet, setNoLayoutYet] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const saveStatusRef = useRef<HTMLDivElement>(null);
  // The save button sits far below the top of a long editor: bring the outcome next to it.
  useEffect(() => { if (error || message) saveStatusRef.current?.scrollIntoView?.({ block: "nearest" }); }, [error, message]);

  const hydrate = (result: ManagerLocations) => {
    const zones = result.zones.map((zone) => ({ localId: zone.id, key: zone.key, displayName: zone.displayName }));
    const locations = result.locations.map((location) => ({
      localId: location.id,
      key: location.key,
      displayName: location.displayName,
      zoneLocalId: result.zones.find((zone) => zone.id === location.zoneId)?.id ?? "",
      presetRowCount: location.presetRowCount
    }));
    setZoneRows(zones);
    setLocationRows(locations);
    setGeneralLayoutRows(isGeneralLayout(systemKey, result.zones, result.locations) ? result.locations[0]!.presetRowCount : null);
    setNoLayoutYet(savesGeneralLayout(systemKey) && result.zones.length === 0 && result.locations.length === 0);
    setLoadedSnapshot(JSON.stringify(normalizeLocationsDraft(zones, locations)));
    setLoaded(true);
  };

  const load = async () => {
    setLoading(true); setError(""); setMessage("");
    try { hydrate(await loadManagerLocations(customerId, systemKey)); }
    catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setError(reason instanceof Error ? reason.message : "Zones and locations could not be loaded.");
    } finally { setLoading(false); }
  };

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded && !loading) void load();
  };

  useEffect(() => { if (embedded) void load(); }, [embedded, customerId, systemKey]);

  const save = async () => {
    setError(""); setMessage("");
    const problem = locationsDraftProblem(zoneRows, locationRows);
    if (problem) { setError(problem); return; }
    setSaving(true);
    try {
      const result = await saveManagerLocations(customerId, systemKey, normalizeLocationsDraft(zoneRows, locationRows));
      hydrate(result.locations);
      onSaved(result.customer);
      setMessage(PER_SERVICE_SAVE_CONFIRMATION);
    } catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setError(reason instanceof Error ? reason.message : "Zones and locations could not be saved.");
    } finally { setSaving(false); }
  };

  const addZone = () => setZoneRows((current) => [...current, { localId: newLocationsKey(), key: newLocationsKey(), displayName: "" }]);
  const renameZone = (localId: string, displayName: string) =>
    setZoneRows((current) => current.map((zone) => zone.localId === localId ? { ...zone, displayName } : zone));
  const removeZone = (localId: string) => {
    setZoneRows((current) => current.filter((zone) => zone.localId !== localId));
    setLocationRows((current) => current.map((location) => location.zoneLocalId === localId ? { ...location, zoneLocalId: "" } : location));
  };
  const addLocation = () => setLocationRows((current) => [...current, {
    localId: newLocationsKey(), key: newLocationsKey(), displayName: "", zoneLocalId: zoneRows[0]?.localId ?? "", presetRowCount: 1
  }]);
  const updateLocation = (localId: string, patch: Partial<LocationsLocationRow>) =>
    setLocationRows((current) => current.map((location) => location.localId === localId ? { ...location, ...patch } : location));
  const removeLocation = (localId: string) =>
    setLocationRows((current) => current.filter((location) => location.localId !== localId));

  const changed = loaded && JSON.stringify(normalizeLocationsDraft(zoneRows, locationRows)) !== loadedSnapshot;
  const nameWarnings = locationNameWarnings(zoneRows, locationRows.map((location) => ({ displayName: location.displayName, zoneId: location.zoneLocalId || null })));

  return <div className="manager-locations-system">
    {!embedded ? <button type="button" className="secondary-command" aria-expanded={open} onClick={toggleOpen}>
      {perServiceToggleLabel(open, "zones & locations", systemLabel)}
    </button> : null}
    {open ? <div>
      {loading ? <p>Loading zones and locations…</p> : null}
      {!loaded && error ? <p className="form-message" role="alert">{error}</p> : null}
      {loaded && generalLayoutRows !== null ? <>
        <p className="support-metadata">General layout: {generalLayoutRows} {generalLayoutRows === 1 ? "row" : "rows"} saved from technician inspections and approved by an Admin. There are no zones or locations to edit here. A technician proposes changes from a visit; an Admin approves them.</p>
        <div className="inline-actions">
          <button type="button" className="secondary-command" disabled={loading} onClick={() => void load()}>Reload</button>
        </div>
      </> : null}
      {loaded && generalLayoutRows === null ? <>
        {noLayoutYet ? <p className="support-metadata">No layout saved yet. A technician enters it on a visit and an Admin approves it. To set it up yourself, add zones and locations below instead.</p> : null}
        <h5>Zones</h5>
        <ul className="manager-locations-zone-list">
          {zoneRows.map((zone) => (
            <li key={zone.localId}>
              <label>
                <span className="manager-locations-label">Zone name</span>
                <input
                  aria-label={`Zone name for ${zone.key}`}
                  maxLength={300}
                  value={zone.displayName}
                  onChange={(event) => renameZone(zone.localId, event.target.value)}
                />
              </label>
              <button type="button" className="secondary-command" onClick={() => removeZone(zone.localId)}>Remove zone</button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={addZone}>Add zone</button>
        <h5>Locations</h5>
        <ul className="manager-locations-location-list">
          {locationRows.map((location) => (
            <li key={location.localId}>
              <label>
                <span className="manager-locations-label">Location name</span>
                <input
                  aria-label={`Location name for ${location.key}`}
                  maxLength={300}
                  value={location.displayName}
                  onChange={(event) => updateLocation(location.localId, { displayName: event.target.value })}
                />
              </label>
              <label>
                <span className="manager-locations-label">Zone</span>
                <select
                  aria-label={`Zone for ${location.key}`}
                  value={location.zoneLocalId}
                  onChange={(event) => updateLocation(location.localId, { zoneLocalId: event.target.value })}
                >
                  <option value="">Select…</option>
                  {zoneRows.map((zone) => <option key={zone.localId} value={zone.localId}>{zone.displayName || zone.key}</option>)}
                </select>
              </label>
              <label>
                <span className="manager-locations-label">Preset rows</span>
                <input
                  type="number"
                  min={1}
                  max={systemKey === "co2_fire_extinguisher" || systemKey === "fm200_fire_suppression" || systemKey === "hydrant" || systemKey === "dry_wet_riser" ? 250 : 500}
                  aria-label={`Preset rows for ${location.key}`}
                  value={location.presetRowCount}
                  onChange={(event) => updateLocation(location.localId, { presetRowCount: Math.trunc(Number(event.target.value)) || 1 })}
                />
              </label>
              <button type="button" className="secondary-command" onClick={() => removeLocation(location.localId)}>Remove location</button>
            </li>
          ))}
        </ul>
        <button type="button" disabled={zoneRows.length === 0} onClick={addLocation}>Add location</button>
        <div ref={saveStatusRef}>
          {nameWarnings.length > 0 ? <div className="offline-notice" role="status">
            <p>{nameWarnings.join(" ")}</p>
            <p>Repeated names are allowed. Consider distinct names so technicians can tell them apart.</p>
          </div> : null}
          {error ? <p className="form-message" role="alert">{error}</p> : null}
          {message ? <p className="form-message" role="status">{message}</p> : null}
        </div>
        <p className="support-metadata">{perServiceUnsavedLine(changed)}</p>
        <div className="inline-actions">
          <button type="button" className="secondary-command" disabled={saving || loading} onClick={() => void load()}>Reload</button>
          <button type="button" disabled={saving || loading} onClick={() => void save()}>{saving ? "Saving…" : "Save zones & locations"}</button>
        </div>
      </> : null}
    </div> : null}
  </div>;
}
