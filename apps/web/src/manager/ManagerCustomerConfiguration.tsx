import { useEffect, useMemo, useState } from "react";
import {
  activateManagerCustomerConfiguration,
  createManagerCustomer,
  createManagerCustomerSite,
  labelOverrideSystemKeys,
  loadManagerLabelOverrides,
  ManagerApiError,
  saveManagerLabelOverrides,
  type ManagerCustomer,
  type ManagerLabelOverrideNode
} from "./managerApi";

export function ManagerCustomerConfiguration({ customers, loading, message, onRefresh, onManage, onAuthorityFailure }: {
  customers: ManagerCustomer[]; loading: boolean; message: string; onRefresh: () => Promise<void>; onManage: (customer: ManagerCustomer) => void; onAuthorityFailure: (error: ManagerApiError) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(""); const [site, setSite] = useState("Primary Service Site"); const [keys, setKeys] = useState<string[]>([]); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const catalog = customers[0]?.supportedSystems ?? [];
  const toggle = (key: string) => setKeys((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
  return <section aria-labelledby="manager-customers-title">
    <div className="workspace-heading"><div><p className="eyebrow">Manager workspace</p><h2 id="manager-customers-title">Customer Configuration</h2><p>Manage customer service assignments online.</p></div><button type="button" className="secondary-command" disabled={loading} onClick={() => void onRefresh()}>Refresh</button></div>
    {message || error ? <p className="form-message" role="alert">{error || message}</p> : null}
    <button type="button" onClick={() => { setAdding(true); setError(""); }}>Add Customer</button>
    {adding ? <form className="report-summary" onSubmit={async (event) => { event.preventDefault(); setSaving(true); setError(""); try { await createManagerCustomer({ displayName: name, siteDisplayName: site, systemKeys: keys }); setAdding(false); setName(""); setKeys([]); await onRefresh(); } catch (reason) { if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason); else setError(reason instanceof Error ? reason.message : "Customer could not be created."); } finally { setSaving(false); } }}>
      <h3>Add Customer</h3><label>Customer display name<input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label><label>Initial Site<input required maxLength={160} value={site} onChange={(event) => setSite(event.target.value)} /></label>
      <fieldset className="manager-service-picker"><legend>Initial Assigned Services</legend>{catalog.map((system) => <label className="manager-service-option" key={system.key}><input type="checkbox" disabled={!system.assignable} checked={keys.includes(system.key)} onChange={() => toggle(system.key)} /><span className="manager-service-option-copy"><strong>{system.displayName}</strong>{!system.assignable ? <small className="manager-service-option-reason">{system.unavailableReason}</small> : null}</span></label>)}</fieldset>
      <div className="inline-actions"><button type="button" className="secondary-command" disabled={saving} onClick={() => setAdding(false)}>Cancel</button><button disabled={saving || keys.length === 0}>{saving ? "Creating…" : "Create Customer"}</button></div>
    </form> : null}
    {customers.length ? <ul className="job-card-list">{customers.map((customer) => <li key={customer.customer.id}><button type="button" className="job-card" onClick={() => onManage(customer)}><div className="job-card-heading"><div><span className="job-card-label">Customer</span><strong>{customer.customer.displayName}</strong></div><span className="status-badge status-badge--complete">Current settings</span></div><div className="job-service-line"><span className="job-card-label">Sites</span><strong>{customer.sites.map((siteValue) => siteValue.displayName).join(", ") || "No active site"}</strong></div><div className="job-service-line"><span className="job-card-label">Assigned Services</span><strong>{customer.configuration.enabledSystems.map((system) => system.displayName).join(", ") || "None"}</strong></div><span className="job-reference">Version {customer.configuration.revision} · Manage configuration</span></button></li>)}</ul> : <p className="empty-state">No operational customers are configured.</p>}
  </section>;
}

export function ManagerCustomerConfigurationDetail({ customer, onBack, onSaved, onAuthorityFailure }: { customer: ManagerCustomer; onBack: () => void; onSaved: (customer: ManagerCustomer) => void; onAuthorityFailure: (error: ManagerApiError) => void }) {
  const [keys, setKeys] = useState<string[]>([]); const [saving, setSaving] = useState(false); const [addingSite, setAddingSite] = useState(false); const [siteName, setSiteName] = useState(""); const [siteSaving, setSiteSaving] = useState(false); const [error, setError] = useState("");
  useEffect(() => setKeys(customer.configuration.enabledSystems.map((system) => system.key)), [customer]);
  const toggle = (key: string) => setKeys((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
  return <section className="manager-home" aria-labelledby="customer-configuration-title"><button type="button" className="secondary-command" onClick={onBack}>Back to Customer Configuration</button><div className="workspace-heading"><div><p className="eyebrow">Customer Configuration</p><h2 id="customer-configuration-title">{customer.customer.displayName}</h2><p>{customer.sites.map((site) => site.displayName).join(", ")}</p></div><span className="status-badge status-badge--complete">Current settings</span></div>
    {error ? <p className="form-message" role="alert">{error}</p> : null}<section className="report-summary"><div className="workspace-heading"><h3>Sites</h3><button type="button" disabled={siteSaving} onClick={() => { setAddingSite(true); setError(""); }}>+ Add Site</button></div><ul>{customer.sites.map((site) => <li key={site.id}>{site.displayName}</li>)}</ul>{addingSite ? <form onSubmit={async (event) => { event.preventDefault(); setSiteSaving(true); setError(""); try { onSaved(await createManagerCustomerSite(customer.customer.id, siteName)); setAddingSite(false); setSiteName(""); } catch (reason) { if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason); else setError(reason instanceof Error ? reason.message : "Site could not be created."); } finally { setSiteSaving(false); } }}><label>Site Name<input required maxLength={160} value={siteName} onChange={(event) => setSiteName(event.target.value)} /></label><div className="inline-actions"><button type="button" className="secondary-command" disabled={siteSaving} onClick={() => { setAddingSite(false); setError(""); }}>Cancel</button><button disabled={siteSaving}>{siteSaving ? "Adding…" : "Add Site"}</button></div></form> : null}</section><form className="report-summary" onSubmit={async (event) => { event.preventDefault(); setSaving(true); setError(""); try { onSaved(await activateManagerCustomerConfiguration(customer.customer.id, keys)); } catch (reason) { if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason); else setError(reason instanceof Error ? reason.message : "Configuration could not be activated."); } finally { setSaving(false); } }}><h3>Assigned Services</h3><fieldset className="manager-service-picker">{customer.supportedSystems.map((system) => <label className="manager-service-option" key={system.key}><input type="checkbox" disabled={!system.assignable && !keys.includes(system.key)} checked={keys.includes(system.key)} onChange={() => toggle(system.key)} /><span className="manager-service-option-copy"><strong>{system.displayName}</strong>{!system.assignable ? <small className="manager-service-option-reason">{system.unavailableReason}</small> : null}</span></label>)}</fieldset><p>Saving creates a new version of these settings. Existing service visits keep the services originally assigned to them.</p><p className="support-metadata">Version {customer.configuration.revision}</p><div className="inline-actions"><button type="button" className="secondary-command" disabled={saving} onClick={onBack}>Cancel</button><button disabled={saving || keys.length === 0}>{saving ? "Saving…" : "Save & Activate"}</button></div></form>
    <ManagerCustomerLabelOverrides customer={customer} onSaved={onSaved} onAuthorityFailure={onAuthorityFailure} />
  </section>;
}

/**
 * Per-customer display-label overrides. One collapsible editor per eligible
 * enabled system (`labelOverrideSystemKeys`). Reads the render-path label tree
 * from `GET .../label-overrides` (definitionLabel + effectiveLabel + overridden)
 * and PUTs the full map; a blank field clears that path. Editing here creates a
 * new customer configuration revision server-side and forward-copies the map —
 * existing frozen jobs keep the labels they froze with. Server validation
 * (UNKNOWN_LABEL_PATH / INVALID_LABEL_OVERRIDE / LABEL_OVERRIDES_TOO_LARGE)
 * surfaces inline as the server's own message.
 */
export function ManagerCustomerLabelOverrides({ customer, onSaved, onAuthorityFailure }: {
  customer: ManagerCustomer; onSaved: (customer: ManagerCustomer) => void; onAuthorityFailure: (error: ManagerApiError) => void;
}) {
  const editable = useMemo(
    () => customer.configuration.enabledSystems.filter((system) => labelOverrideSystemKeys.has(system.key)),
    [customer.configuration.enabledSystems]
  );
  if (editable.length === 0) return null;
  return <section className="report-summary" aria-labelledby="manager-label-overrides-title">
    <h3 id="manager-label-overrides-title">Custom field labels</h3>
    <p>Rename the field labels a technician sees for this customer. This does not change what is recorded — only the wording on the form and the accepted report.</p>
    {editable.map((system) => (
      <ManagerSystemLabelOverrides
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

function ManagerSystemLabelOverrides({ customerId, systemKey, systemLabel, onSaved, onAuthorityFailure }: {
  customerId: string; systemKey: string; systemLabel: string;
  onSaved: (customer: ManagerCustomer) => void; onAuthorityFailure: (error: ManagerApiError) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nodes, setNodes] = useState<ManagerLabelOverrideNode[] | undefined>(undefined);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const hydrate = (list: ManagerLabelOverrideNode[]) => {
    setNodes(list);
    setDraft(Object.fromEntries(list.filter((node) => node.overridden).map((node) => [node.path, node.effectiveLabel])));
  };

  const load = async () => {
    setLoading(true); setError(""); setMessage("");
    try { hydrate((await loadManagerLabelOverrides(customerId, systemKey)).labels); }
    catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setError(reason instanceof Error ? reason.message : "Field labels could not be loaded.");
    } finally { setLoading(false); }
  };

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && nodes === undefined && !loading) void load();
  };

  const save = async () => {
    setSaving(true); setError(""); setMessage("");
    const map: Record<string, string> = {};
    for (const [path, value] of Object.entries(draft)) { const trimmed = value.trim(); if (trimmed) map[path] = trimmed; }
    try {
      const result = await saveManagerLabelOverrides(customerId, systemKey, map);
      hydrate(result.labels.labels);
      onSaved(result.customer);
      setMessage("Field labels saved. A new configuration version was created.");
    } catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setError(reason instanceof Error ? reason.message : "Field labels could not be saved.");
    } finally { setSaving(false); }
  };

  const changedCount = nodes
    ? nodes.filter((node) => (draft[node.path]?.trim() ?? "") !== (node.overridden ? node.effectiveLabel : "")).length
    : 0;

  return <div className="manager-label-override-system">
    <button type="button" className="secondary-command" aria-expanded={open} onClick={toggleOpen}>
      {open ? "Hide" : "Customise"} labels — {systemLabel}
    </button>
    {open ? <div>
      {loading ? <p>Loading field labels…</p> : null}
      {error ? <p className="form-message" role="alert">{error}</p> : null}
      {message ? <p className="form-message" role="status">{message}</p> : null}
      {nodes ? <>
        <ul className="manager-label-override-list">
          {nodes.map((node) => (
            <li key={node.path}>
              <label>
                <span className="manager-label-override-definition">{node.definitionLabel}</span>
                <input
                  aria-label={`Custom label for ${node.definitionLabel}`}
                  maxLength={200}
                  placeholder={node.definitionLabel}
                  value={draft[node.path] ?? ""}
                  onChange={(event) => setDraft((current) => ({ ...current, [node.path]: event.target.value }))}
                />
              </label>
              {node.overridden ? <small className="manager-label-override-current">Currently: {node.effectiveLabel}</small> : null}
            </li>
          ))}
        </ul>
        <p className="support-metadata">Blank a field to restore its default label. {changedCount} unsaved change{changedCount === 1 ? "" : "s"}.</p>
        <div className="inline-actions">
          <button type="button" className="secondary-command" disabled={saving || loading} onClick={() => void load()}>Reload</button>
          <button type="button" disabled={saving || loading} onClick={() => void save()}>{saving ? "Saving…" : "Save labels"}</button>
        </div>
      </> : null}
    </div> : null}
  </div>;
}
