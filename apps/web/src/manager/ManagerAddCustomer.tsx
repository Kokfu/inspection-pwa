import { type FormEvent, useEffect, useState } from "react";
import {
  createManagerCustomer,
  loadManagerServiceCatalog,
  ManagerApiError,
  type ManagerServiceCatalogEntry
} from "./managerApi";

/**
 * Standalone "Add Customer" page (route `manager-add-customer`). Extracted out
 * of `ManagerCustomerConfiguration`'s customer-list screen, where this form used
 * to piggyback its "Initial Assigned Services" checklist on
 * `customers[0]?.supportedSystems` — an arbitrary OTHER customer's per-customer
 * location-validity state, and empty (so the form could never be submitted) on a
 * fresh install with zero customers. It now loads the system-wide, no-customer
 * catalog from `GET /manager/service-catalog` instead: correct for a
 * not-yet-existing customer, since a system with no current configuration is
 * always assignable (zones/locations are set up after creation, same as any
 * newly-enabled system today).
 */
export function ManagerAddCustomer({ onCreated, onAuthorityFailure }: {
  onCreated: () => void;
  onAuthorityFailure: (error: ManagerApiError) => void;
}) {
  const [catalog, setCatalog] = useState<ManagerServiceCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogMessage, setCatalogMessage] = useState("");
  const [name, setName] = useState(""); const [site, setSite] = useState("Primary Service Site"); const [keys, setKeys] = useState<string[]>([]); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const [telephone, setTelephone] = useState(""); const [contact, setContact] = useState("");
  const [fax, setFax] = useState(""); const [contractNumber, setContractNumber] = useState("");
  const [serviceFrequency, setServiceFrequency] = useState(""); const [siteAddress, setSiteAddress] = useState("");

  useEffect(() => {
    let current = true;
    setCatalogLoading(true); setCatalogMessage("");
    void loadManagerServiceCatalog()
      .then((result) => { if (current) { setCatalog(result); setCatalogLoading(false); } })
      .catch((reason) => {
        if (!current) return;
        setCatalogLoading(false);
        if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
        else setCatalogMessage(reason instanceof Error ? reason.message : "Service catalog could not be loaded.");
      });
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (key: string) => setKeys((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await createManagerCustomer({
        displayName: name, siteDisplayName: site, systemKeys: keys,
        ...(telephone.trim() ? { contactPhone: telephone.trim() } : {}),
        ...(contact.trim() ? { contactPerson: contact.trim() } : {}),
        ...(fax.trim() ? { fax: fax.trim() } : {}),
        ...(contractNumber.trim() ? { contractNumber: contractNumber.trim() } : {}),
        ...(serviceFrequency ? { serviceFrequency } : {}),
        ...(siteAddress.trim() ? { siteAddress: siteAddress.trim() } : {})
      });
      onCreated();
    } catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setError(reason instanceof Error ? reason.message : "Customer could not be created.");
    } finally { setSaving(false); }
  };

  return <section aria-labelledby="manager-add-customer-title">
    <div className="workspace-heading"><div><p className="eyebrow">Manager workspace</p><h2 id="manager-add-customer-title">Add Customer</h2><p>Create a new customer and assign its initial services.</p></div></div>
    {error || catalogMessage ? <p className="form-message" role="alert">{error || catalogMessage}</p> : null}
    <form className="report-summary" onSubmit={submit}>
      <label>Customer display name<input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Initial Site<input required maxLength={160} value={site} onChange={(event) => setSite(event.target.value)} /></label>
      <label>Telephone No<input maxLength={40} value={telephone} onChange={(event) => setTelephone(event.target.value)} /></label>
      <label>Contact<input maxLength={160} value={contact} onChange={(event) => setContact(event.target.value)} /></label>
      <label>Fax<input maxLength={40} value={fax} onChange={(event) => setFax(event.target.value)} /></label>
      <label>Contract No.<input maxLength={160} value={contractNumber} onChange={(event) => setContractNumber(event.target.value)} /></label>
      <label>Service Frequency<select value={serviceFrequency} onChange={(event) => setServiceFrequency(event.target.value)}><option value="">Not set</option><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="HALF_YEARLY">Half-yearly</option><option value="ANNUALLY">Annually</option></select></label>
      <label>Site Address<input maxLength={500} value={siteAddress} onChange={(event) => setSiteAddress(event.target.value)} /></label>
      <fieldset className="manager-service-picker"><legend>Initial Assigned Services</legend>
        {catalogLoading ? <p role="status">Loading service catalog…</p> : null}
        {!catalogLoading && catalog.length === 0 ? <p className="empty-state">No services are available to assign.</p> : null}
        {catalog.map((system) => <label className="manager-service-option" key={system.key}><input type="checkbox" disabled={!system.assignable} checked={keys.includes(system.key)} onChange={() => toggle(system.key)} /><span className="manager-service-option-copy"><strong>{system.displayName}</strong></span></label>)}
      </fieldset>
      <div className="inline-actions"><button disabled={saving || catalogLoading}>{saving ? "Creating…" : "Create Customer"}</button></div>
    </form>
  </section>;
}
