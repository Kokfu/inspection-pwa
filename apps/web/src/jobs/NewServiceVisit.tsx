import { useEffect, useState } from "react";
import {
  createTechnicianCustomer,
  loadCustomerConfiguration,
  loadCustomerSites,
  loadReferenceCustomers,
  loadServiceFormatOptions,
  type ServiceFormatOption
} from "../referenceData/referenceDataApi";
import type { CustomerConfigurationResponse, ReferenceCustomer, ReferenceSite } from "../referenceData/referenceDataTypes";
import { createServiceVisit } from "./jobApi";
import type { InspectionJob } from "./jobTypes";

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

function hasRealJobId(job: unknown): job is InspectionJob {
  return typeof job === "object" && job !== null && !Array.isArray(job)
    && typeof (job as { id?: unknown }).id === "string" && (job as { id: string }).id.trim().length > 0;
}

export function NewServiceVisit({ onCreated, onCancel }: {
  onCreated: (job: InspectionJob) => Promise<void>;
  onCancel: () => void;
}) {
  const [customers, setCustomers] = useState<ReferenceCustomer[]>([]);
  const [sites, setSites] = useState<ReferenceSite[]>([]);
  const [configuration, setConfiguration] = useState<CustomerConfigurationResponse>();
  const [configurationCustomerId, setConfigurationCustomerId] = useState<string>();
  const [customerId, setCustomerId] = useState("");
  const [siteId, setSiteId] = useState("");
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
  const [arrivalTime, setArrivalTime] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  // Keep the same mutation identity for a retry after a lost response. It is
  // not a job identity; the server alone allocates the job and reference.
  const [requestId] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void loadReferenceCustomers().then((values) => {
      if (!active) return;
      setCustomers(values);
      setLoading(false);
    }).catch(() => { if (active) { setMessage("Connect to the server to create a new service visit."); setLoading(false); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!customerId) return;
    let active = true;
    void Promise.all([loadCustomerSites(customerId), loadCustomerConfiguration(customerId)])
      .then(([nextSites, nextConfiguration]) => {
        if (!active) return;
        setSites(nextSites); setConfiguration(nextConfiguration); setConfigurationCustomerId(customerId);
      })
      .catch(() => { if (active) { setSites([]); setConfiguration(undefined); setConfigurationCustomerId(undefined); setMessage("Customer service configuration is unavailable."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [customerId]);

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
  const canCreate = !loading && !creating && configurationMatchesCustomer && Boolean(customerId && siteId && systemKeys.length);

  function selectCustomer(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    setSites([]); setConfiguration(undefined); setConfigurationCustomerId(undefined);
    setSiteId(""); setSystemKeys([]); setMessage(""); setLoading(Boolean(nextCustomerId));
  }

  async function beginAddCustomer() {
    setMessage("");
    if (!addingCustomer) setNewCustomerRequestId(crypto.randomUUID());
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

  async function submit() {
    if (!canCreate) return;
    setCreating(true); setMessage("");
    try {
      const job = await createServiceVisit({
        requestId, customerId, siteId, systemKeys,
        ...(serviceCallNumber.trim() ? { serviceCallNumber: serviceCallNumber.trim() } : {}),
        ...(arrivalTime.trim() ? { arrivalTime: arrivalTime.trim() } : {}),
        ...(departureTime.trim() ? { departureTime: departureTime.trim() } : {})
      });
      if (!hasRealJobId(job)) throw new Error("Service visit could not be created.");
      await onCreated(job);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Service visit could not be created.");
    } finally { setCreating(false); }
  }

  return <section className="new-service-visit" aria-labelledby="new-service-visit-title">
    <button type="button" className="secondary-command back-command" onClick={onCancel} disabled={creating}>← Back to My Jobs</button>
    <div className="setup-card">
      <div className="workspace-heading"><div><p className="eyebrow">Service visit setup</p><h2 id="new-service-visit-title">New Service Visit</h2><p>Select the customer, site, and fire systems for this visit.</p></div></div>
      <div className="setup-fields">
        <p className="offline-notice">Service Visit Date &amp; Time will be recorded automatically by the server when created.</p>
        <div className="form-field"><label htmlFor="service-customer">Customer</label><select id="service-customer" value={customerId} onChange={(event) => selectCustomer(event.target.value)} disabled={creating || addingCustomer}><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName}</option>)}</select><button type="button" className="secondary-command" onClick={() => void beginAddCustomer()} disabled={creating || addingCustomer}>+ Add New Customer</button></div>
        <div className="form-field"><label htmlFor="service-site">Site</label><select id="service-site" value={siteId} onChange={(event) => setSiteId(event.target.value)} disabled={!customerId || loading || creating}><option value="">Select site</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.displayName}</option>)}</select></div>
      </div>
      {addingCustomer ? <section className="report-summary" aria-labelledby="new-customer-title"><h3 id="new-customer-title">Add New Customer</h3><p>This creates a shared customer and its first service format on the server.</p><div className="setup-fields"><div className="form-field"><label htmlFor="new-customer-name">Customer Name</label><input id="new-customer-name" maxLength={160} value={newCustomerName} onChange={(event) => setNewCustomerName(event.target.value)} disabled={creating} /></div><div className="form-field"><label htmlFor="new-customer-site">Primary Site</label><input id="new-customer-site" maxLength={160} value={newSiteName} onChange={(event) => setNewSiteName(event.target.value)} disabled={creating} /></div><div className="form-field"><label htmlFor="new-site-address">Site Address</label><input id="new-site-address" maxLength={500} value={newSiteAddress} onChange={(event) => setNewSiteAddress(event.target.value)} disabled={creating} /></div><div className="form-field"><label htmlFor="new-customer-telephone">Telephone No</label><input id="new-customer-telephone" maxLength={40} value={newCustomerTelephone} onChange={(event) => setNewCustomerTelephone(event.target.value)} disabled={creating} /></div><div className="form-field"><label htmlFor="new-customer-fax">Fax</label><input id="new-customer-fax" maxLength={40} value={newCustomerFax} onChange={(event) => setNewCustomerFax(event.target.value)} disabled={creating} /></div><div className="form-field"><label htmlFor="new-customer-contact">Contact</label><input id="new-customer-contact" maxLength={160} value={newCustomerContact} onChange={(event) => setNewCustomerContact(event.target.value)} disabled={creating} /></div><div className="form-field"><label htmlFor="new-customer-contract">Contract No.</label><input id="new-customer-contract" maxLength={160} value={newCustomerContract} onChange={(event) => setNewCustomerContract(event.target.value)} disabled={creating} /></div><div className="form-field"><label htmlFor="new-customer-frequency">Service Frequency</label><select id="new-customer-frequency" value={newCustomerFrequency} onChange={(event) => setNewCustomerFrequency(event.target.value)} disabled={creating}><option value="">Not set</option><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="HALF_YEARLY">Half-yearly</option><option value="ANNUALLY">Annually</option></select></div></div><fieldset className="system-picker" disabled={creating}><legend>Initial Service Format</legend><div className="system-picker-grid">{serviceFormatOptions.map((system) => <label key={system.key} className={`system-check-row ${newCustomerSystems.includes(system.key) ? "system-check-row--selected" : ""}`}><input type="checkbox" checked={newCustomerSystems.includes(system.key)} onChange={() => setNewCustomerSystems((current) => current.includes(system.key) ? current.filter((key) => key !== system.key) : [...current, system.key])} /><span aria-hidden="true">✓</span><strong>{system.displayName}</strong></label>)}</div></fieldset><div className="inline-actions"><button type="button" className="secondary-command" disabled={creating} onClick={() => { setAddingCustomer(false); setMessage(""); }}>Cancel</button><button type="button" disabled={creating || !newCustomerName.trim() || !newSiteName.trim() || newCustomerSystems.length === 0} onClick={() => void createCustomer()}>{creating ? "Creating…" : "Create Customer"}</button></div></section> : null}
      <fieldset className="system-picker" disabled={!customerId || loading || creating}><legend>Applicable Fire Systems</legend><div className="system-picker-grid">{serviceAvailability ? <p role="status">{serviceAvailability}</p> : systems.map((system) => <label key={system.id} className={`system-check-row ${systemKeys.includes(system.key) ? "system-check-row--selected" : ""}`}><input type="checkbox" checked={systemKeys.includes(system.key)} onChange={() => toggle(system.key)} /><span aria-hidden="true">✓</span><strong>{system.displayName}</strong></label>)}</div></fieldset>
      {configurationMatchesCustomer && systems.length ? <button type="button" className="secondary-command" disabled={creating} onClick={() => setSystemKeys(systems.map((system) => system.key))}>Reuse Previous Service Format</button> : null}
      <div className="setup-fields">
        <div className="form-field"><label htmlFor="service-call-number">Service Call No</label><input id="service-call-number" maxLength={80} value={serviceCallNumber} onChange={(event) => setServiceCallNumber(event.target.value)} disabled={creating} /></div>
        <div className="form-field"><label htmlFor="service-arrival">Arrival</label><input id="service-arrival" type="time" value={arrivalTime} onChange={(event) => setArrivalTime(event.target.value)} disabled={creating} /></div>
        <div className="form-field"><label htmlFor="service-departure">Departure</label><input id="service-departure" type="time" value={departureTime} onChange={(event) => setDepartureTime(event.target.value)} disabled={creating} /></div>
      </div>
      {systemKeys.length ? <p className="selected-services-summary" role="status">{systemKeys.length} {systemKeys.length === 1 ? "service selected" : "services selected"} and ready to create.</p> : null}
      {message ? <p className="operational-message operational-message--warning" role="status">{message}</p> : null}
      <button className="setup-submit" type="button" onClick={() => void submit()} disabled={!canCreate}>{creating ? "Creating…" : "Create Service Visit"}</button>
    </div>
  </section>;
}
