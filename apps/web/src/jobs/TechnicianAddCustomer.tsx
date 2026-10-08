import { type FormEvent, useEffect, useRef, useState } from "react";
import { SYNC_FINISHED_EVENT } from "../sync/syncEvents";
import { cachedServiceFormatOptions, loadServiceFormatOptions, type ServiceFormatOption } from "../referenceData/referenceDataApi";
import {
  loadTechnicianCustomerDraft, newTechnicianCustomerDraft, queueTechnicianCustomer,
  saveTechnicianCustomerDraft, syncPendingTechnicianCustomers, type TechnicianCustomerDraft
} from "./technicianCustomerDraft";

export function TechnicianAddCustomer({ actorUserId, canUseServer, onStartVisit, onBackHome }: {
  actorUserId: number;
  canUseServer: boolean;
  onStartVisit: (customerId: string) => void;
  onBackHome: () => void;
}) {
  const [draft, setDraft] = useState<TechnicianCustomerDraft>();
  const [catalog, setCatalog] = useState<ServiceFormatOption[]>([]);
  const [catalogMessage, setCatalogMessage] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const writes = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    void loadTechnicianCustomerDraft().then(async (saved) => {
      if (active) setDraft(saved);
      if (canUseServer && navigator.onLine && (saved.status === "Pending" || saved.status === "Failed")) {
        await syncPendingTechnicianCustomers(actorUserId);
        if (active) setDraft(await loadTechnicianCustomerDraft());
      }
    })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Customer draft could not be loaded."); });
    void cachedServiceFormatOptions().then((items) => { if (active) setCatalog(items); })
      .catch((reason) => { if (active) setCatalogMessage(reason instanceof Error ? reason.message : "Cached service formats are unavailable."); });
    if (canUseServer) void loadServiceFormatOptions().then((items) => { if (active) { setCatalog(items); setCatalogMessage(""); } })
      .catch((reason) => { if (active) setCatalogMessage(reason instanceof Error ? reason.message : "Service formats could not be refreshed."); });
    return () => { active = false; };
  }, [actorUserId, canUseServer]);

  // A background (automatic) sync may complete the queued customer while this screen is open: re-read it.
  // Only a submitted request is refreshed; a Draft being typed is never replaced.
  const submittedRef = useRef(false);
  submittedRef.current = draft !== undefined && draft.status !== "Draft";
  useEffect(() => {
    let active = true;
    const refresh = () => { if (submittedRef.current) void loadTechnicianCustomerDraft().then((next) => { if (active && submittedRef.current) setDraft(next); }).catch(() => undefined); };
    window.addEventListener(SYNC_FINISHED_EVENT, refresh);
    return () => { active = false; window.removeEventListener(SYNC_FINISHED_EVENT, refresh); };
  }, []);

  function update(patch: Partial<TechnicianCustomerDraft>) {
    if (!draft || draft.status !== "Draft") return;
    const next = { ...draft, ...patch };
    setDraft(next);
    setSaved(false);
    writes.current = writes.current.catch(() => undefined).then(() => saveTechnicianCustomerDraft(next));
    void writes.current.catch((reason) => setError(reason instanceof Error ? reason.message : "Customer draft could not be saved."));
  }

  async function synchronize() {
    setSaving(true); setError("");
    try {
      await syncPendingTechnicianCustomers(actorUserId);
      setDraft(await loadTechnicianCustomerDraft());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Customer could not be synced."); }
    finally { setSaving(false); }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || saving || error || draft.status !== "Draft") return;
    setSaving(true);
    try {
      await writes.current;
      const pending = await queueTechnicianCustomer(draft);
      setDraft(pending);
      if (canUseServer && navigator.onLine) {
        await syncPendingTechnicianCustomers(actorUserId);
        setDraft(await loadTechnicianCustomerDraft());
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Customer could not be saved."); }
    finally { setSaving(false); }
  };

  const addAnother = async () => {
    setSaving(true); setError("");
    try { const next = newTechnicianCustomerDraft(); await saveTechnicianCustomerDraft(next); setDraft(next); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "New customer draft could not be saved."); }
    finally { setSaving(false); }
  };

  const setField = (key: keyof TechnicianCustomerDraft, value: string) => update({ [key]: value });
  const locked = draft?.status !== "Draft";
  const created = draft?.status === "Synced" ? draft.createdCustomer : undefined;
  return <section aria-labelledby="technician-add-customer-title">
    <div className="workspace-heading"><div><p className="eyebrow">Technician workspace</p><h2 id="technician-add-customer-title">Add Customer</h2><p>Create a shared customer and assign its initial services.</p></div></div>
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    {saved && !error ? <p role="status">Customer draft saved on this device.</p> : null}
    {!draft ? <p role="status">Loading customer draft…</p> : created ? <div className="report-summary" role="status"><h3>{created.displayName} created</h3><p>The customer is ready for a service visit.</p><div className="inline-actions"><button type="button" onClick={() => onStartVisit(created.id)}>Start a Service Visit for this customer</button><button type="button" className="secondary-command" onClick={() => void addAnother()}>Add another customer</button><button type="button" className="secondary-command" onClick={onBackHome}>Back to Home</button></div></div> : <>
      {draft.status === "Pending" || draft.status === "Failed" ? <div className="report-summary" role="status"><p>{draft.status === "Pending" ? "Customer saved on this device, pending sync." : `Customer sync needs attention: ${draft.lastError ?? "Retry the original request."}`}</p><p>The submitted details are locked so retry uses the same request ID and payload.</p><div className="inline-actions"><button type="button" disabled={!canUseServer || saving} onClick={() => void synchronize()}>{saving ? "Syncing…" : "Retry Sync"}</button><button type="button" className="secondary-command" onClick={onBackHome}>Back to Home</button></div></div> : null}
      {catalogMessage ? <p className="form-message" role="status">{catalogMessage}</p> : null}
      <form className="report-summary setup-card customer-form-card" onSubmit={(event) => void submit(event)}>
        <fieldset disabled={locked || saving}>
          <label>Customer display name<input required autoComplete="off" maxLength={160} value={draft.displayName} onChange={(event) => setField("displayName", event.target.value)} /></label>
          <label>Initial Site<input required autoComplete="off" maxLength={160} value={draft.siteDisplayName} onChange={(event) => setField("siteDisplayName", event.target.value)} /></label>
          <label>Telephone No<input type="tel" inputMode="tel" autoComplete="off" maxLength={40} value={draft.contactPhone} onChange={(event) => setField("contactPhone", event.target.value)} /></label>
          <label>Contact<input autoComplete="off" maxLength={160} value={draft.contactPerson} onChange={(event) => setField("contactPerson", event.target.value)} /></label>
          <label>Fax<input type="tel" inputMode="tel" autoComplete="off" maxLength={40} value={draft.fax} onChange={(event) => setField("fax", event.target.value)} /></label>
          <label>Contract No.<input autoComplete="off" maxLength={160} value={draft.contractNumber} onChange={(event) => setField("contractNumber", event.target.value)} /></label>
          <label>Service Frequency<select value={draft.serviceFrequency} onChange={(event) => setField("serviceFrequency", event.target.value)}><option value="">Not set</option><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="HALF_YEARLY">Half-yearly</option><option value="ANNUALLY">Annually</option></select></label>
          <label>Site Address<input autoComplete="off" maxLength={500} value={draft.siteAddress} onChange={(event) => setField("siteAddress", event.target.value)} /></label>
          <fieldset className="manager-service-picker"><legend>Initial Assigned Services</legend>
            {!catalog.length ? <p className="empty-state">Service formats are unavailable on this device. You can save these details and assign services after reconnecting.</p> : null}
            {catalog.map((system) => <label className="manager-service-option" key={system.key}><input type="checkbox" checked={draft.systemKeys.includes(system.key)} onChange={() => update({ systemKeys: draft.systemKeys.includes(system.key) ? draft.systemKeys.filter((key) => key !== system.key) : [...draft.systemKeys, system.key] })} /><span className="manager-service-option-copy"><strong>{system.displayName}</strong></span></label>)}
          </fieldset>
        </fieldset>
        <div className="inline-actions"><button type="button" className="secondary-command" disabled={locked || saving} onClick={() => { if (draft) writes.current = writes.current.catch(() => undefined).then(() => saveTechnicianCustomerDraft(draft)).then(() => { setError(""); setSaved(true); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Customer draft could not be saved.")); }}>Save Draft</button><button type="submit" disabled={locked || saving || !draft.systemKeys.length}>{saving ? "Saving…" : "Create Customer"}</button></div>
      </form>
    </>}
  </section>;
}
