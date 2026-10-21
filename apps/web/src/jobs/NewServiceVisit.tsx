import { useEffect, useRef, useState } from "react";
import {
  createTechnicianCustomer,
  loadCustomerConfiguration,
  loadCustomerSites,
  loadReferenceCustomers,
  loadServiceFormatOptions,
  type ServiceFormatOption
} from "../referenceData/referenceDataApi";
import { getCachedCustomerConfiguration, getCachedReferenceCustomers } from "../referenceData/referenceDataCache";
import type { CustomerConfigurationResponse, ReferenceCustomer, ReferenceSite } from "../referenceData/referenceDataTypes";
import { createServiceVisit, SiteAlreadyExistsError } from "./jobApi";
import type { InspectionJob } from "./jobTypes";
import { cacheCustomerSites, createLocalServiceVisit, getCachedCustomerSites, OfflineVisitUnavailableError } from "./offlineServiceVisitLocal";
import { isServerUnreachable } from "./serverReachability";
import { clearNewVisitDraft, isBlankDraft, loadNewVisitDraft, newVisitDraft, saveNewVisitDraft, type NewServiceVisitDraft } from "./newServiceVisitDraft";

/** Offline, the shortcut opens the standalone Add Customer page, which saves a draft and queues the customer on this device (OA-5). */
export const offlineAddCustomerRoute = "#/technician-add-customer";

export function serviceAvailabilityMessage({
  customerSelected,
  loading,
  configurationLoaded,
  systemCount
}: {
  customerSelected: boolean;
  loading: boolean;
  configurationLoaded: boolean;
  systemCount: number;
}) {
  if (!customerSelected) return "Select a customer to view available services.";
  if (loading) return "Loading available services…";
  if (!configurationLoaded) return "Customer service configuration is unavailable.";
  if (systemCount === 0) return "No services are currently assigned to this customer.";
  return undefined;
}

// The visit start time is the phone/browser clock (local HH:MM) at the moment the
// technician taps Create. Arrival is never typed; it is recorded from the device.
export function deviceClockTime(now: Date = new Date()) {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function hasRealJobId(job: unknown): job is InspectionJob {
  return typeof job === "object" && job !== null && !Array.isArray(job)
    && typeof (job as { id?: unknown }).id === "string" && (job as { id: string }).id.trim().length > 0;
}

export function NewServiceVisit({ onCreated, onCancel, initialCustomerId }: {
  onCreated: (job: InspectionJob, confirmation?: string) => Promise<void>;
  onCancel: () => void;
  initialCustomerId?: string;
}) {
  const [customers, setCustomers] = useState<ReferenceCustomer[]>([]);
  const [sites, setSites] = useState<ReferenceSite[]>([]);
  const [configuration, setConfiguration] = useState<CustomerConfigurationResponse>();
  const [configurationCustomerId, setConfigurationCustomerId] = useState<string>();
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [siteId, setSiteId] = useState("");
  const [addingSite, setAddingSite] = useState(false);
  const [proposedSiteName, setProposedSiteName] = useState("");
  const [proposedSiteAddress, setProposedSiteAddress] = useState("");
  const [systemKeys, setSystemKeys] = useState<string[]>([]);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newSiteName, setNewSiteName] = useState("");
  const [newCustomerTelephone, setNewCustomerTelephone] = useState("");
  const [newCustomerContact, setNewCustomerContact] = useState("");
  const [newCustomerFax, setNewCustomerFax] = useState("");
  const [newCustomerContract, setNewCustomerContract] = useState("");
  const [newCustomerFrequency, setNewCustomerFrequency] = useState("");
  const [newSiteAddress, setNewSiteAddress] = useState("");
  const [newCustomerSystems, setNewCustomerSystems] = useState<string[]>([]);
  const [newCustomerRequestId, setNewCustomerRequestId] = useState(() => crypto.randomUUID());
  const [serviceFormatOptions, setServiceFormatOptions] = useState<ServiceFormatOption[]>([]);
  const [serviceCallNumber, setServiceCallNumber] = useState("");
  // Keep the same mutation identity for a retry after a lost response. It is
  // not a job identity; the server alone allocates the job and reference.
  const [requestId, setRequestId] = useState<string>(() => crypto.randomUUID());
  // Offline creation: the visit's identity is generated on the device and never changes across taps or retries.
  const [localJobUuid, setLocalJobUuid] = useState<string>(() => crypto.randomUUID());
  // True when the server cannot be reached; the screen then works from the customers, sites and setup saved on the device.
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  // Captured on the first Create tap and reused by retries, so a retry after a
  // lost response replays the identical request instead of an IDEMPOTENCY_MISMATCH.
  const deviceStartTime = useRef<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  // OA-7: the unfinished setup is kept on the device. `draftReady` = the saved setup has been read (or there is none).
  const [draftReady, setDraftReady] = useState(false);
  const [restored, setRestored] = useState(false);
  // A create was started before the app closed and its outcome is unknown: only an exact replay or Start over is safe.
  const [replayOnly, setReplayOnly] = useState(false);
  const [sending, setSending] = useState(false);
  const draftFinished = useRef(false);

  useEffect(() => {
    let active = true;
    void loadNewVisitDraft().then((saved) => {
      if (!active) return;
      const usable = saved && !isBlankDraft(saved) && (saved.sending || !initialCustomerId || saved.customerId === initialCustomerId);
      if (saved && usable) {
        setRequestId(saved.requestId); setLocalJobUuid(saved.localJobUuid);
        deviceStartTime.current = saved.arrivalTime;
        setCustomerId(saved.customerId); setSiteId(saved.siteId); setSystemKeys(saved.systemKeys);
        setServiceCallNumber(saved.serviceCallNumber);
        setAddingSite(saved.addingSite); setProposedSiteName(saved.proposedSiteName); setProposedSiteAddress(saved.proposedSiteAddress);
        setSending(saved.sending); setReplayOnly(saved.sending); setRestored(true);
        setLoading(Boolean(saved.customerId));
        setMessage(saved.sending
          ? "This visit was being created when the app closed, so it may already exist. Check your job list first. If it is not there, tap Create to send the same request again (it cannot create a second visit), or Start over."
          : "Your unfinished setup was restored from this device.");
      }
      setDraftReady(true);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draftReady || draftFinished.current) return;
    const draft: NewServiceVisitDraft = { schemaVersion: 1, requestId, localJobUuid, customerId, siteId, systemKeys, serviceCallNumber,
      addingSite, proposedSiteName, proposedSiteAddress, ...(deviceStartTime.current ? { arrivalTime: deviceStartTime.current } : {}), sending };
    if (isBlankDraft(draft)) void clearNewVisitDraft(); else void saveNewVisitDraft(draft);
  }, [draftReady, requestId, localJobUuid, customerId, siteId, systemKeys, serviceCallNumber, addingSite, proposedSiteName, proposedSiteAddress, sending]);

  function startOver() {
    draftFinished.current = false;
    deviceStartTime.current = undefined;
    setRequestId(crypto.randomUUID()); setLocalJobUuid(crypto.randomUUID());
    setServiceCallNumber(""); setSending(false); setReplayOnly(false); setRestored(false);
    selectCustomer(initialCustomerId ?? "");
    setSiteId(""); setSystemKeys([]); setAddingSite(false); setProposedSiteName(""); setProposedSiteAddress(""); setMessage("");
  }

  useEffect(() => {
    // Follow the connection while this screen is open. Back online, Create uses the server again (same requestId, so a
    // create whose reply was lost is replayed, not duplicated).
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline); window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);

  useEffect(() => {
    let active = true;
    async function fromDevice() {
      const cached = await getCachedReferenceCustomers().catch(() => []);
      if (!active) return;
      setCustomers(cached);
      if (cached.length === 0) setMessage("No customers are saved on this device yet. Connect to the server once to download them.");
      setLoading(false);
    }
    if (offline) { void fromDevice(); return () => { active = false; }; }
    void loadReferenceCustomers().then((values) => {
      if (!active) return;
      setCustomers(values);
      setLoading(false);
    }).catch((error) => {
      if (!active) return;
      if (isServerUnreachable(error)) { setOffline(true); return; }
      setMessage("Connect to the server to create a new service visit."); setLoading(false);
    });
    return () => { active = false; };
  }, [offline]);

  useEffect(() => {
    if (!customerId) return;
    let active = true;
    async function fromDevice() {
      const [cachedSites, cachedConfiguration] = await Promise.all([getCachedCustomerSites(customerId), getCachedCustomerConfiguration(customerId)]);
      if (!active) return;
      setSites(cachedSites);
      setSiteId((current) => cachedSites.some((site) => site.id === current) ? current : "");
      if (!cachedConfiguration) { setConfiguration(undefined); setConfigurationCustomerId(undefined); setMessage("Customer service configuration is not saved on this device. Connect to the server once to download it."); return; }
      setConfiguration(cachedConfiguration); setConfigurationCustomerId(customerId);
      if (cachedSites.length === 0) setMessage("No sites are saved on this device for this customer. Connect to the server once to download them.");
    }
    async function load() {
      try {
        if (offline) { await fromDevice(); return; }
        const [nextSites, nextConfiguration] = await Promise.all([loadCustomerSites(customerId), loadCustomerConfiguration(customerId)]);
        if (!active) return;
        setSites(nextSites); setConfiguration(nextConfiguration); setConfigurationCustomerId(customerId);
        void cacheCustomerSites(customerId, nextSites).catch(() => undefined);
      } catch (error) {
        if (!active) return;
        if (!offline && isServerUnreachable(error)) { setOffline(true); return; }
        setSites([]); setConfiguration(undefined); setConfigurationCustomerId(undefined); setMessage("Customer service configuration is unavailable.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [customerId, offline]);

  const configurationMatchesCustomer = Boolean(customerId) && configurationCustomerId === customerId && configuration !== undefined;
  const systems = configurationMatchesCustomer ? configuration.configuration.enabledSystems : [];
  const serviceAvailability = serviceAvailabilityMessage({
    customerSelected: Boolean(customerId),
    loading,
    configurationLoaded: configurationMatchesCustomer,
    systemCount: systems.length
  });
  const toggle = (key: string) => setSystemKeys((current) => current.includes(key)
    ? current.filter((candidate) => candidate !== key) : [...current, key]);
  const siteReady = addingSite ? !offline && Boolean(proposedSiteName.trim()) : Boolean(siteId);
  const busy = creating || replayOnly || !draftReady;
  const canCreate = draftReady && !loading && !creating && configurationMatchesCustomer && Boolean(customerId && siteReady && systemKeys.length);

  function selectCustomer(nextCustomerId: string) {
    if (nextCustomerId === customerId) return; // picking the customer already chosen (e.g. one restored from the device) changes nothing and must not leave the services loading
    setCustomerId(nextCustomerId);
    setSites([]); setConfiguration(undefined); setConfigurationCustomerId(undefined);
    setSiteId(""); setSystemKeys([]); setMessage(""); setLoading(Boolean(nextCustomerId));
    setAddingSite(false); setProposedSiteName(""); setProposedSiteAddress("");
  }

  async function beginAddCustomer() {
    setMessage("");
    if (offline) { window.location.hash = offlineAddCustomerRoute; return; }
    if (!addingCustomer) setNewCustomerRequestId(crypto.randomUUID());
    setAddingSite(false); setProposedSiteName(""); setProposedSiteAddress("");
    setAddingCustomer(true);
    if (serviceFormatOptions.length) return;
    try {
      setServiceFormatOptions(await loadServiceFormatOptions());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connect to the server to add a new customer.");
      setAddingCustomer(false);
    }
  }

  async function createCustomer() {
    if (creating || !newCustomerName.trim() || !newSiteName.trim() || newCustomerSystems.length === 0) return;
    setCreating(true); setMessage("");
    try {
      const customer = await createTechnicianCustomer({
        requestId: newCustomerRequestId,
        displayName: newCustomerName,
        siteDisplayName: newSiteName,
        systemKeys: newCustomerSystems,
        ...(newCustomerTelephone.trim() ? { contactPhone: newCustomerTelephone.trim() } : {}),
        ...(newCustomerContact.trim() ? { contactPerson: newCustomerContact.trim() } : {}),
        ...(newCustomerFax.trim() ? { fax: newCustomerFax.trim() } : {}),
        ...(newCustomerContract.trim() ? { contractNumber: newCustomerContract.trim() } : {}),
        ...(newCustomerFrequency ? { serviceFrequency: newCustomerFrequency } : {}),
        ...(newSiteAddress.trim() ? { siteAddress: newSiteAddress.trim() } : {})
      });
      setCustomers((current) => [...current.filter((value) => value.id !== customer.id), customer]
        .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id)));
      setAddingCustomer(false); setNewCustomerName(""); setNewSiteName(""); setNewCustomerTelephone(""); setNewCustomerContact(""); setNewCustomerFax(""); setNewCustomerContract(""); setNewCustomerFrequency(""); setNewSiteAddress(""); setNewCustomerSystems([]);
      selectCustomer(customer.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Customer could not be created.");
    } finally { setCreating(false); }
  }

  async function submitOffline() {
    const customer = customers.find((candidate) => candidate.id === customerId);
    const site = sites.find((candidate) => candidate.id === siteId);
    if (!customer || !site || !configuration) throw new OfflineVisitUnavailableError("The customer, site and setup must be saved on this device first.");
    const job = await createLocalServiceVisit({
      customer, site, configuration, systemKeys, serviceCallNumber, arrivalTime: deviceStartTime.current ?? deviceClockTime(), clientJobUuid: localJobUuid
    });
    draftFinished.current = true; await clearNewVisitDraft();
    try { await onCreated(job); }
    catch {
      // The app shell only accepts a new job while the session is verified with the server. The visit is already
      // saved on the device, so open it from there; every form works from local data exactly as for a synced visit.
      window.location.hash = `#/job/${encodeURIComponent(job.id)}`;
      window.location.reload();
    }
  }

  async function submit() {
    if (!canCreate) return;
    setCreating(true); setMessage("");
    deviceStartTime.current ??= deviceClockTime();
    if (offline) {
      try { await submitOffline(); }
      catch (error) { setMessage(error instanceof Error ? error.message : "The visit could not be saved on this device."); }
      finally { setCreating(false); }
      return;
    }
    // OA-7: record on the device that a create is starting, before anything is sent, so a close mid-request is recoverable.
    setSending(true);
    await saveNewVisitDraft({ schemaVersion: 1, requestId, localJobUuid, customerId, siteId, systemKeys, serviceCallNumber,
      addingSite, proposedSiteName, proposedSiteAddress, arrivalTime: deviceStartTime.current, sending: true });
    try {
      const job = await createServiceVisit({
        requestId, customerId, systemKeys,
        ...(addingSite ? { newSite: { displayName: proposedSiteName,
          ...(proposedSiteAddress.trim() ? { address: proposedSiteAddress.trim() } : {}) } } : { siteId }),
        ...(serviceCallNumber.trim() ? { serviceCallNumber: serviceCallNumber.trim() } : {}),
        arrivalTime: deviceStartTime.current
      });
      if (!hasRealJobId(job)) throw new Error("Service visit could not be created.");
      draftFinished.current = true; await clearNewVisitDraft();
      const confirmation = addingSite ? "Site sent for approval. Your visit continues." : undefined;
      await onCreated(job, confirmation);
      if (confirmation) setMessage(confirmation);
    } catch (error) {
      // A reachable server that refused the create did not make a visit; only an unreachable server leaves the outcome unknown.
      if (!isServerUnreachable(error)) { setSending(false); setReplayOnly(false); }
      if (error instanceof SiteAlreadyExistsError) {
        try {
          const nextSites = sites.some((site) => site.id === error.existingSiteId) ? sites : await loadCustomerSites(customerId);
          if (!nextSites.some((site) => site.id === error.existingSiteId)) throw new Error("The existing site is unavailable. Refresh the site list and try again.");
          setSites(nextSites); setSiteId(error.existingSiteId); setAddingSite(false);
          setMessage(error.message);
        } catch (refreshError) {
          setMessage(refreshError instanceof Error ? refreshError.message : "The site list could not be refreshed.");
        }
        return;
      }
      if (isServerUnreachable(error) && configurationMatchesCustomer) {
        setOffline(true);
        setMessage(addingSite
          ? "The server could not be reached, and the visit may already have been created. Check your job list first. Reconnect to retry adding this site."
          : "The server could not be reached, and the visit may already have been created. Check your job list first. If it is not there, tap Create again to save this visit on this device; it is sent when you are connected.");
      } else setMessage(error instanceof Error ? error.message : "Service visit could not be created.");
    } finally { setCreating(false); }
  }

  return <section className="new-service-visit" aria-labelledby="new-service-visit-title">
    <button type="button" className="secondary-command back-command" onClick={onCancel} disabled={creating}>← Back to My Jobs</button>
    {restored ? <button type="button" className="secondary-command" onClick={startOver} disabled={creating}>Start over</button> : null}
    <div className="setup-card">
      <div className="workspace-heading"><div><p className="eyebrow">Service visit setup</p><h2 id="new-service-visit-title">New Service Visit</h2><p>Select the customer, site, and fire systems for this visit.</p></div></div>
      <div className="setup-fields">
        {offline
          ? <p className="offline-notice" role="status">Offline — this visit is saved on this device with this device's date and time, and gets its SV number when it syncs. Add New Customer opens the Add Customer page, which saves it on this device until you reconnect.</p>
          : <p className="offline-notice">Service Visit Date &amp; Time will be recorded automatically by the server when created. Your arrival time is taken from this device's clock when you tap Create.</p>}
        <div className="form-field"><label htmlFor="service-customer">Customer</label><select id="service-customer" value={customerId} onChange={(event) => selectCustomer(event.target.value)} disabled={busy || addingCustomer}><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName}</option>)}</select><button type="button" className="secondary-command" onClick={() => void beginAddCustomer()} disabled={busy || addingCustomer}>+ Add New Customer</button></div>
        <div className="form-field"><label htmlFor="service-site">Site</label>
          <select id="service-site" value={siteId} onChange={(event) => setSiteId(event.target.value)} disabled={!customerId || loading || busy || addingSite}><option value="">Select site</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.displayName}</option>)}</select>
          <button type="button" className="secondary-command" disabled={!customerId || offline || busy || addingCustomer || addingSite} aria-describedby={offline ? "new-site-connection" : undefined} onClick={() => { setSiteId(""); setAddingSite(true); setMessage(""); }}>+ Add new site</button>
          {offline ? <p id="new-site-connection">Adding a new site needs a connection.</p> : null}
          {addingSite ? <section className="setup-fields" aria-label="Add new site">
            <div className="form-field"><label htmlFor="proposed-site-name">Site name</label><input id="proposed-site-name" required maxLength={160} value={proposedSiteName} onChange={(event) => setProposedSiteName(event.target.value)} onBlur={() => setProposedSiteName((name) => name.trim().replace(/\s+/g, " "))} disabled={busy} /></div>
            <div className="form-field"><label htmlFor="proposed-site-address">Site address (optional)</label><input id="proposed-site-address" maxLength={500} value={proposedSiteAddress} onChange={(event) => setProposedSiteAddress(event.target.value)} disabled={busy} /></div>
            <button type="button" className="secondary-command" disabled={busy} onClick={() => { setAddingSite(false); setProposedSiteName(""); setProposedSiteAddress(""); }}>Cancel new site</button>
          </section> : null}
        </div>
      </div>
      {addingCustomer ? <section className="report-summary" aria-labelledby="new-customer-title"><h3 id="new-customer-title">Add New Customer</h3><p>This creates a shared customer and its first service format on the server.</p><div className="setup-fields"><div className="form-field"><label htmlFor="new-customer-name">Customer Name</label><input id="new-customer-name" maxLength={160} value={newCustomerName} onChange={(event) => setNewCustomerName(event.target.value)} disabled={busy} /></div><div className="form-field"><label htmlFor="new-customer-site">Primary Site</label><input id="new-customer-site" maxLength={160} value={newSiteName} onChange={(event) => setNewSiteName(event.target.value)} disabled={busy} /></div><div className="form-field"><label htmlFor="new-site-address">Site Address</label><input id="new-site-address" maxLength={500} value={newSiteAddress} onChange={(event) => setNewSiteAddress(event.target.value)} disabled={busy} /></div><div className="form-field"><label htmlFor="new-customer-telephone">Telephone No</label><input id="new-customer-telephone" maxLength={40} value={newCustomerTelephone} onChange={(event) => setNewCustomerTelephone(event.target.value)} disabled={busy} /></div><div className="form-field"><label htmlFor="new-customer-fax">Fax</label><input id="new-customer-fax" maxLength={40} value={newCustomerFax} onChange={(event) => setNewCustomerFax(event.target.value)} disabled={busy} /></div><div className="form-field"><label htmlFor="new-customer-contact">Contact</label><input id="new-customer-contact" maxLength={160} value={newCustomerContact} onChange={(event) => setNewCustomerContact(event.target.value)} disabled={busy} /></div><div className="form-field"><label htmlFor="new-customer-contract">Contract No.</label><input id="new-customer-contract" maxLength={160} value={newCustomerContract} onChange={(event) => setNewCustomerContract(event.target.value)} disabled={busy} /></div><div className="form-field"><label htmlFor="new-customer-frequency">Service Frequency</label><select id="new-customer-frequency" value={newCustomerFrequency} onChange={(event) => setNewCustomerFrequency(event.target.value)} disabled={busy}><option value="">Not set</option><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="HALF_YEARLY">Half-yearly</option><option value="ANNUALLY">Annually</option></select></div></div><fieldset className="system-picker" disabled={busy}><legend>Initial Service Format</legend><div className="system-picker-grid">{serviceFormatOptions.map((system) => <label key={system.key} className={`system-check-row ${newCustomerSystems.includes(system.key) ? "system-check-row--selected" : ""}`}><input type="checkbox" checked={newCustomerSystems.includes(system.key)} onChange={() => setNewCustomerSystems((current) => current.includes(system.key) ? current.filter((key) => key !== system.key) : [...current, system.key])} /><span aria-hidden="true">✓</span><strong>{system.displayName}</strong></label>)}</div></fieldset><div className="inline-actions"><button type="button" className="secondary-command" disabled={busy} onClick={() => { setAddingCustomer(false); setMessage(""); }}>Cancel</button><button type="button" disabled={busy || !newCustomerName.trim() || !newSiteName.trim() || newCustomerSystems.length === 0} onClick={() => void createCustomer()}>{creating ? "Creating…" : "Create Customer"}</button></div></section> : null}
      <fieldset className="system-picker" disabled={!customerId || loading || busy}><legend>Applicable Fire Systems</legend><div className="system-picker-grid">{serviceAvailability ? <p role="status">{serviceAvailability}</p> : systems.map((system) => <label key={system.id} className={`system-check-row ${systemKeys.includes(system.key) ? "system-check-row--selected" : ""}`}><input type="checkbox" checked={systemKeys.includes(system.key)} onChange={() => toggle(system.key)} /><span aria-hidden="true">✓</span><strong>{system.displayName}</strong></label>)}</div></fieldset>
      {configurationMatchesCustomer && systems.length ? <button type="button" className="secondary-command" disabled={busy} onClick={() => setSystemKeys(systems.map((system) => system.key))}>Reuse Previous Service Format</button> : null}
      <div className="setup-fields">
        <div className="form-field"><label htmlFor="service-call-number">Service Call No</label><input id="service-call-number" maxLength={80} value={serviceCallNumber} onChange={(event) => setServiceCallNumber(event.target.value)} disabled={busy} /></div>
      </div>
      {/* I-47: Site is required too, so say what is missing instead of "ready to create" next to a dimmed button. */}
      {systemKeys.length ? <p id="new-service-visit-summary" className="selected-services-summary" role="status">{systemKeys.length} {systemKeys.length === 1 ? "service selected" : "services selected"}{siteReady ? " and ready to create." : addingSite ? ". Enter a site name and connect to continue." : ". Choose a site to continue."}</p> : null}
      {message ? <p className="operational-message operational-message--warning" role="status">{message}</p> : null}
      <button className="setup-submit" type="button" onClick={() => void submit()} disabled={!canCreate} aria-describedby={systemKeys.length ? "new-service-visit-summary" : undefined}>{creating ? "Creating…" : "Create Service Visit"}</button>
    </div>
  </section>;
}
