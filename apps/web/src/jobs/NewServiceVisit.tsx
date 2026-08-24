import { useEffect, useState } from "react";
import { loadCustomerConfiguration, loadCustomerSites, loadReferenceCustomers } from "../referenceData/referenceDataApi";
import type { CustomerConfigurationResponse, ReferenceCustomer, ReferenceSite } from "../referenceData/referenceDataTypes";
import { createServiceVisit } from "./jobApi";
import type { InspectionJob } from "./jobTypes";

function todayLocal() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

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
  const [serviceDate, setServiceDate] = useState(todayLocal);
  const [systemKeys, setSystemKeys] = useState<string[]>([]);
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
  const canCreate = !loading && !creating && configurationMatchesCustomer && Boolean(customerId && siteId && serviceDate && systemKeys.length);

  function selectCustomer(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    setSites([]); setConfiguration(undefined); setConfigurationCustomerId(undefined);
    setSiteId(""); setSystemKeys([]); setMessage(""); setLoading(Boolean(nextCustomerId));
  }

  async function submit() {
    if (!canCreate) return;
    setCreating(true); setMessage("");
    try {
      const job = await createServiceVisit({ requestId, customerId, siteId, serviceDate, systemKeys });
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
        <div className="form-field"><label htmlFor="service-date">Service Date</label><input id="service-date" type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} disabled={creating} /></div>
        <div className="form-field"><label htmlFor="service-customer">Customer</label><select id="service-customer" value={customerId} onChange={(event) => selectCustomer(event.target.value)} disabled={creating}><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName}</option>)}</select></div>
        <div className="form-field"><label htmlFor="service-site">Site</label><select id="service-site" value={siteId} onChange={(event) => setSiteId(event.target.value)} disabled={!customerId || loading || creating}><option value="">Select site</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.displayName}</option>)}</select></div>
      </div>
      <fieldset className="system-picker" disabled={!customerId || loading || creating}><legend>Applicable Fire Systems</legend><div className="system-picker-grid">{serviceAvailability ? <p role="status">{serviceAvailability}</p> : systems.map((system) => <label key={system.id} className={`system-check-row ${systemKeys.includes(system.key) ? "system-check-row--selected" : ""}`}><input type="checkbox" checked={systemKeys.includes(system.key)} onChange={() => toggle(system.key)} /><span aria-hidden="true">✓</span><strong>{system.displayName}</strong></label>)}</div></fieldset>
      {systemKeys.length ? <p className="selected-services-summary" role="status">{systemKeys.length} {systemKeys.length === 1 ? "service selected" : "services selected"} and ready to create.</p> : null}
      {message ? <p className="operational-message operational-message--warning">{message}</p> : null}
      <button className="setup-submit" type="button" onClick={() => void submit()} disabled={!canCreate}>{creating ? "Creating…" : "Create Service Visit"}</button>
    </div>
  </section>;
}
