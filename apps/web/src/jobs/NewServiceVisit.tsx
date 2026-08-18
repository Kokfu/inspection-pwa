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

export function NewServiceVisit({ onCreated, onCancel }: {
  onCreated: (job: InspectionJob) => Promise<void>;
  onCancel: () => void;
}) {
  const [customers, setCustomers] = useState<ReferenceCustomer[]>([]);
  const [sites, setSites] = useState<ReferenceSite[]>([]);
  const [configuration, setConfiguration] = useState<CustomerConfigurationResponse>();
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
    if (!customerId) { setSites([]); setConfiguration(undefined); setSiteId(""); setSystemKeys([]); return; }
    let active = true;
    setLoading(true); setMessage(""); setSiteId(""); setSystemKeys([]);
    void Promise.all([loadCustomerSites(customerId), loadCustomerConfiguration(customerId)])
      .then(([nextSites, nextConfiguration]) => {
        if (!active) return;
        setSites(nextSites); setConfiguration(nextConfiguration);
      })
      .catch(() => { if (active) { setSites([]); setConfiguration(undefined); setMessage("Customer service configuration is unavailable."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [customerId]);

  const systems = configuration?.configuration.enabledSystems ?? [];
  const toggle = (key: string) => setSystemKeys((current) => current.includes(key)
    ? current.filter((candidate) => candidate !== key) : [...current, key]);
  const canCreate = !loading && !creating && Boolean(customerId && siteId && serviceDate && systemKeys.length);

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

  return <section className="workspace technician-home" aria-labelledby="new-service-visit-title">
    <button type="button" className="secondary-command back-command" onClick={onCancel} disabled={creating}>Cancel</button>
    <div className="workspace-heading"><div><p className="eyebrow">Service visit</p><h2 id="new-service-visit-title">New Service Visit</h2></div></div>
    <div className="form-field"><label htmlFor="service-date">Service Date</label><input id="service-date" type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} disabled={creating} /></div>
    <div className="form-field"><label htmlFor="service-customer">Customer</label><select id="service-customer" value={customerId} onChange={(event) => setCustomerId(event.target.value)} disabled={loading || creating}><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName}</option>)}</select></div>
    <div className="form-field"><label htmlFor="service-site">Site</label><select id="service-site" value={siteId} onChange={(event) => setSiteId(event.target.value)} disabled={!customerId || loading || creating}><option value="">Select site</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.displayName}</option>)}</select></div>
    <fieldset disabled={!customerId || loading || creating}><legend>Applicable Fire Systems</legend>{systems.length === 0 ? <p>No confirmed systems are available for this customer.</p> : systems.map((system) => <label key={system.id} className="checkbox-field"><input type="checkbox" checked={systemKeys.includes(system.key)} onChange={() => toggle(system.key)} /> {system.displayName}</label>)}</fieldset>
    {message ? <p className="operational-message operational-message--warning">{message}</p> : null}
    <button type="button" onClick={() => void submit()} disabled={!canCreate}>{creating ? "Creating…" : "Create Service Visit"}</button>
  </section>;
}
