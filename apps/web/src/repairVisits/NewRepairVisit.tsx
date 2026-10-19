import { useEffect, useMemo, useRef, useState } from "react";
import { deviceClockTime } from "../jobs/NewServiceVisit";
import { cacheCustomerSites, getCachedCustomerSites } from "../jobs/offlineServiceVisitLocal";
import { isServerUnreachable } from "../jobs/serverReachability";
import { loadCustomerSites, loadReferenceCustomers } from "../referenceData/referenceDataApi";
import { getCachedReferenceCustomers } from "../referenceData/referenceDataCache";
import type { ReferenceCustomer, ReferenceSite } from "../referenceData/referenceDataTypes";
import { formatClientDate } from "../uiPresentation";
import { RepairFieldPicker } from "./RepairFieldPicker";
import { cacheSiteCatalogs, downloadCustomerForOffline, loadCatalog, loadPreviousVisitList, type CatalogSource } from "./repairVisitOffline";
import { identityKey, needsRepair } from "./repairVisitPresentation";
import { createLocalRepairVisit, RepairVisitLocalError } from "./repairVisitRepository";
import type { RepairPreviousVisitListItem } from "./repairVisitTypes";
import { useBrowserConnected } from "./useRepairVisits";

const NONE = "none";
const previousKey = (visit: RepairPreviousVisitListItem) => `${visit.kind}:${visit.visitId}`;
const previousLabel = (visit: RepairPreviousVisitListItem) => `${visit.visitNumber} · ${formatClientDate(visit.visitDate)} · ${visit.kind === "repair" ? "Repair visit" : "Service visit"}`;
const errorText = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

export function NewRepairVisit({ canUseServer, onSync }: { canUseServer: boolean; onSync: () => Promise<unknown> }) {
  const connected = useBrowserConnected();
  // A browser that says it is online but cannot reach the server falls back to the device, like New Service Visit.
  const [serverDown, setServerDown] = useState(false);
  const offline = !connected || !canUseServer || serverDown;
  // Regaining the browser's connection is a fresh chance to reach the server.
  useEffect(() => { if (connected) setServerDown(false); }, [connected]);
  const [customers, setCustomers] = useState<ReferenceCustomer[]>([]);
  const [sites, setSites] = useState<ReferenceSite[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [previous, setPrevious] = useState<{ visits: RepairPreviousVisitListItem[]; fromDevice: boolean; fetchedAt?: string }>();
  const [previousChoice, setPreviousChoice] = useState(NONE);
  const [catalog, setCatalog] = useState<CatalogSource>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [serviceCallNumber, setServiceCallNumber] = useState("");
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [creating, setCreating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState("");
  const [listError, setListError] = useState("");
  const [fieldsError, setFieldsError] = useState("");
  const [downloadMessage, setDownloadMessage] = useState("");
  const arrival = useRef<string | undefined>(undefined);
  // The identity of this visit never changes across taps or retries; a double tap cannot create two.
  const [clientUuid] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let active = true;
    setLoadingCustomers(true);
    (async () => {
      if (!offline) {
        try { const list = await loadReferenceCustomers(); if (active) { setCustomers(list); setMessage(""); } return; }
        catch (error) {
          if (isServerUnreachable(error)) { if (active) setServerDown(true); return; }
          if (active) setMessage(errorText(error, "Customers could not be loaded."));
          return;
        }
      }
      const cached = await getCachedReferenceCustomers().catch(() => []);
      if (!active) return;
      setCustomers(cached);
      setMessage(cached.length ? "" : "No customers are saved on this device yet. Connect to the server once to download them.");
    })().finally(() => { if (active) setLoadingCustomers(false); });
    return () => { active = false; };
  }, [offline]);

  useEffect(() => {
    setSites([]); setSiteId("");
    if (!customerId) return;
    let active = true;
    (async () => {
      if (!offline) {
        try {
          const list = await loadCustomerSites(customerId);
          if (!active) return;
          setSites(list); void cacheCustomerSites(customerId, list).catch(() => undefined);
          return;
        } catch (error) {
          if (isServerUnreachable(error)) { if (active) setServerDown(true); return; }
          if (active) setMessage(errorText(error, "Sites could not be loaded."));
          return;
        }
      }
      const cached = await getCachedCustomerSites(customerId);
      if (!active) return;
      setSites(cached);
      if (!cached.length) setMessage("No sites are saved on this device for this customer. Connect to the server once to download them.");
    })();
    return () => { active = false; };
  }, [customerId, offline]);

  // The approved visits that can be chosen as the previous visit. Never a stale list after a refused refresh.
  useEffect(() => {
    setPrevious(undefined); setPreviousChoice(NONE); setListError("");
    if (!customerId || !siteId) return;
    let active = true;
    setLoadingList(true);
    loadPreviousVisitList(customerId, siteId, !offline).then(list => {
      if (!active) return;
      setPrevious(list);
      if (!list.fromDevice) void cacheSiteCatalogs(customerId, siteId, list.visits);
    }).catch(error => {
      if (!active) return;
      if (isServerUnreachable(error) && !offline) { setServerDown(true); return; }
      setListError(errorText(error, "Previous visits could not be loaded."));
    }).finally(() => { if (active) setLoadingList(false); });
    return () => { active = false; };
  }, [customerId, siteId, offline]);

  const chosen = useMemo(() => previous?.visits.find(visit => previousKey(visit) === previousChoice), [previous, previousChoice]);

  useEffect(() => {
    setCatalog(undefined); setSelected(new Set()); setFieldsError("");
    if (!customerId || !siteId || !previous) return;
    if (previousChoice !== NONE && !chosen) return;
    let active = true;
    setLoadingFields(true);
    loadCatalog(customerId, siteId, chosen ? { kind: chosen.kind, visitId: chosen.visitId } : null, !offline, chosen).then(source => {
      if (active) setCatalog(source);
    }).catch(error => {
      if (!active) return;
      if (isServerUnreachable(error) && !offline) { setServerDown(true); return; }
      setFieldsError(errorText(error, "The field list could not be loaded."));
    }).finally(() => { if (active) setLoadingFields(false); });
    return () => { active = false; };
  }, [customerId, siteId, previous, previousChoice, chosen, offline]);

  const toggle = (key: string) => setSelected(current => { const next = new Set(current); if (!next.delete(key)) next.add(key); return next; });
  const selectAllNeedingRepair = () => setSelected(new Set((catalog?.fields ?? []).filter(needsRepair).map(field => identityKey(field.identity))));
  const customer = customers.find(candidate => candidate.id === customerId);
  const site = sites.find(candidate => candidate.id === siteId);
  const canCreate = !creating && Boolean(customer && site && catalog && selected.size > 0);

  async function create() {
    if (!customer || !site || !catalog || selected.size === 0) return;
    setCreating(true); setMessage("");
    arrival.current ??= deviceClockTime();
    try {
      const fields = catalog.fields.filter(field => selected.has(identityKey(field.identity)));
      const visit = await createLocalRepairVisit({
        clientUuid, customerId: customer.id, customerName: customer.displayName, siteId: site.id, siteName: site.displayName,
        configurationRevisionId: catalog.configurationRevisionId, previousVisit: chosen ? { kind: chosen.kind, visitId: chosen.visitId } : null,
        ...(chosen ? { previousVisitLabel: previousLabel(chosen) } : {}), serviceCallNumber, arrivalTime: arrival.current, fields, online: !offline
      });
      if (!offline) void onSync().catch(() => undefined);
      window.location.hash = `#/repair-visits/${encodeURIComponent(visit.clientUuid)}`;
    } catch (error) {
      setMessage(error instanceof RepairVisitLocalError || error instanceof Error ? error.message : "The repair visit could not be saved on this device.");
    } finally { setCreating(false); }
  }

  async function downloadForOffline() {
    if (!customerId || offline) return;
    setDownloading(true); setDownloadMessage("");
    try {
      const report = await downloadCustomerForOffline(customerId);
      setDownloadMessage(`Saved on this device: ${report.fieldLists} field ${report.fieldLists === 1 ? "list" : "lists"} for ${report.sites} ${report.sites === 1 ? "site" : "sites"} and ${report.photos} Before ${report.photos === 1 ? "photo" : "photos"}.${report.failures.length ? ` ${report.failures.length} could not be saved: ${report.failures[0]}` : ""}`);
    } catch (error) { setDownloadMessage(errorText(error, "The download did not finish. Nothing already saved was removed.")); }
    finally { setDownloading(false); }
  }

  return <section className="rv-page" aria-labelledby="rv-new-title">
    <a className="secondary-command rv-back" href="#/repair-visits">← Back to Repair List</a>
    <div className="setup-card">
      <div className="workspace-heading"><div><p className="eyebrow">Repair visit setup</p><h2 id="rv-new-title">New Repair Visit</h2>
        <p>Choose the customer, site and the fields you will repair.</p></div></div>
      {offline
        ? <p className="offline-notice" role="status">Offline — this repair visit is saved on this device with this device's date and time, and gets its RV number when it syncs. Only customers, sites and field lists already saved on this device can be used.</p>
        : <p className="offline-notice">The visit date is recorded by the server. Your arrival time is taken from this device's clock when you tap Create.</p>}
      <div className="rv-fields">
        <div className="rv-field"><label htmlFor="rv-customer">Customer</label>
          <select id="rv-customer" value={customerId} onChange={event => { setCustomerId(event.target.value); setMessage(""); }} disabled={creating || loadingCustomers}>
            <option value="">{loadingCustomers ? "Loading customers…" : "Select customer"}</option>
            {customers.map(value => <option key={value.id} value={value.id}>{value.displayName}</option>)}
          </select></div>
        <div className="rv-field"><label htmlFor="rv-site">Site</label>
          <select id="rv-site" value={siteId} onChange={event => setSiteId(event.target.value)} disabled={!customerId || creating}>
            <option value="">Select site</option>
            {sites.map(value => <option key={value.id} value={value.id}>{value.displayName}</option>)}
          </select></div>
        <div className="rv-field"><label htmlFor="rv-previous">Previous visit</label>
          <select id="rv-previous" value={previousChoice} onChange={event => setPreviousChoice(event.target.value)} disabled={!siteId || loadingList || creating} aria-describedby="rv-previous-help">
            <option value={NONE}>None</option>
            {(previous?.visits ?? []).map(visit => <option key={previousKey(visit)} value={previousKey(visit)}>{previousLabel(visit)}</option>)}
          </select>
          <p id="rv-previous-help" className="rv-help">{loadingList ? "Loading approved visits…" : previous?.fromDevice
            ? "Offline — showing the approved visits whose field lists are saved on this device."
            : "Only approved visits of this site that you created can be chosen. The previous visit is never changed."}</p>
          {listError ? <p className="rv-error" role="alert">{listError}</p> : null}</div>
        <div className="rv-field"><label htmlFor="rv-call">Service Call No</label>
          <input id="rv-call" maxLength={100} value={serviceCallNumber} onChange={event => setServiceCallNumber(event.target.value)} disabled={creating} autoComplete="off" /></div>
      </div>
      <div className="rv-download">
        <button type="button" className="secondary-command" onClick={() => void downloadForOffline()} disabled={!customerId || offline || downloading}>{downloading ? "Downloading…" : "Download for offline"}</button>
        <p className="rv-help">Saves this customer's field lists and Before photos on this device so you can work without signal.</p>
        {downloadMessage ? <p className="operational-message" role="status">{downloadMessage}</p> : null}
      </div>
      {customerId && siteId ? <section aria-labelledby="rv-fields-title" className="rv-fields-section">
        <h3 id="rv-fields-title">Fields to repair</h3>
        {loadingFields ? <p role="status">Loading fields…</p> : null}
        {fieldsError ? <p className="rv-error" role="alert">{fieldsError}</p> : null}
        {catalog ? <>
          <p className="rv-help">{previous?.fromDevice || catalog.fromDevice ? `Field list saved on this device ${formatClientDate(catalog.fetchedAt)}. ` : ""}{chosen ? "Fields from the previous visit. Not Good or Not Done fields come first." : "Fields from this customer's current service setup."}</p>
          {catalog.fields.length === 0 ? <p role="status">This site has no fields that can be repaired.</p> : <RepairFieldPicker idPrefix="rv-pick" fields={catalog.fields} selected={selected} onToggle={toggle} onSelectAllNeedingRepair={selectAllNeedingRepair} disabled={creating} />}
        </> : null}
        <p id="rv-selection-summary" className="rv-help" role="status">{selected.size === 0 ? "Select at least one field." : `${selected.size} ${selected.size === 1 ? "field" : "fields"} selected.`}</p>
      </section> : null}
      {message ? <p className="operational-message operational-message--warning" role="status">{message}</p> : null}
      <button className="setup-submit" type="button" onClick={() => void create()} disabled={!canCreate} aria-describedby="rv-selection-summary">{creating ? "Creating…" : "Create Repair Visit"}</button>
    </div>
  </section>;
}
