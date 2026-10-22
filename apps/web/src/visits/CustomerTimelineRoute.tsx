import { useEffect, useId, useRef, useState } from "react";
import type { AuthUser } from "../auth/authApi";
import { getCachedReferenceCustomers } from "../referenceData/referenceDataCache";
import { loadTimelineCustomers } from "./customerTimelineData";
import { CustomerTimeline, type TimelineLoader } from "./CustomerTimeline";
import type { TimelineVisit } from "./customerTimelineData";
import "./CustomerTimeline.css";
import { ServiceVisitNotAuthorisedError, loadTimelineServiceJob } from "./customerTimelineServiceJob";
import type { InspectionJob } from "../jobs/jobTypes";

/** Route-level picker uses the existing live customer catalog, never a visit snapshot. */
export function CustomerTimelineRoute({ customerId, actor, mode, initialStatus, onCustomer, onOpen, onBack, onServiceJob,
  showBack = true, heading, eyebrow, searchable = false, customerOptions, loadVisits }: {
  showBack?: boolean; heading?: string; eyebrow?: string; searchable?: boolean;
  customerOptions?: Array<{ id: string; displayName: string; code?: string }>;
  loadVisits?: TimelineLoader;
  initialStatus?: string;
  customerId?: string; actor: AuthUser; mode: "server" | "offline" | "unavailable";
  onCustomer: (id: string) => void; onOpen: (visit: TimelineVisit) => void; onBack: () => void;
  onServiceJob?: (job: InspectionJob) => void;
}) {
  const customerControl = useId();
  const [query, setQuery] = useState("");
  const opening = useRef<AbortController | null>(null);
  const [customers, setCustomers] = useState<Array<{ id: string; displayName: string; code?: string }>>([]);
  const [message, setMessage] = useState("");
  const [notAuthorised, setNotAuthorised] = useState(false);
  useEffect(() => {
    let active = true;
    setCustomers([]); setMessage("");
    async function load() {
      if (customerOptions) { setCustomers(customerOptions); return; }
      if (mode === "unavailable") throw new Error("Verify your session to choose a customer.");
      let values;
      values = mode === "offline" ? await getCachedReferenceCustomers() : await loadTimelineCustomers(actor);
      if (!Array.isArray(values) || values.some(v => !v || typeof v.id !== "string" || typeof v.displayName !== "string")) throw new Error("Customer catalog is unavailable.");
      if (active) setCustomers(values);
    }
    void load().catch(e => { if (active) setMessage(e instanceof Error ? e.message : "Customer catalog is unavailable."); });
    return () => { active = false; opening.current?.abort(); };
  }, [actor.id, mode, customerOptions]);
  useEffect(() => () => { opening.current?.abort(); }, [customerId]);
  async function open(visit: TimelineVisit) {
    opening.current?.abort();
    const controller = new AbortController(); opening.current = controller;
    setMessage(""); setNotAuthorised(false);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 10_000);
    try {
      if (visit.kind === "service" && actor.role === "inspector" && mode === "server" && onServiceJob && customerId) {
        const job = await loadTimelineServiceJob(visit.id, customerId, actor, controller.signal);
        if (!controller.signal.aborted) onServiceJob(job);
      } else onOpen(visit);
    } catch (e) {
      if (e instanceof ServiceVisitNotAuthorisedError) { setMessage(e.message); setNotAuthorised(true); }
      else if (timedOut) setMessage("The server did not answer in time. Reconnect and retry opening this visit.");
      else if (!controller.signal.aborted) setMessage(e instanceof Error ? e.message : "Visit details are unavailable.");
    }
    finally { clearTimeout(timer); }
  }
  const needle = query.trim().toLocaleLowerCase();
  const visibleCustomers = customers.filter(c => c.id === customerId || !needle ||
    `${c.displayName} ${c.code ?? ""}`.toLocaleLowerCase().includes(needle));
  return <section className="workspace page-stack customer-timeline-route">
    {showBack && <button type="button" className="secondary-command" onClick={onBack}>Back</button>}
    {heading && <div className="workspace-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{heading}</h2></div></div>}
    <div className="customer-timeline-picker">
      {searchable && <><label htmlFor={`${customerControl}-filter`}>Filter customers</label>
        <input id={`${customerControl}-filter`} type="search" name="customerFilter" autoComplete="off" value={query}
          aria-controls={customerControl} onChange={e => setQuery(e.target.value)} />
        <p role="status">{visibleCustomers.length} customers available</p></>}
      <label htmlFor={customerControl}>Select customer</label><select id={customerControl} name="customer" autoComplete="off" aria-describedby={`${customerControl}-help`} value={customerId ?? ""} onChange={e => onCustomer(e.target.value)}>
        <option value="">Select customer</option>{visibleCustomers.map(c => <option key={c.id} value={c.id}>{c.displayName}</option>)}
      </select>
      <p id={`${customerControl}-help`}>Pick a customer to see their finished visits.</p>
    </div>
    {message && <p role="alert">{message}</p>}
    {notAuthorised && <button type="button" className="secondary-command" onClick={onBack}>Back to My Jobs</button>}
    {!customerOptions && !customers.length && !message && <p>Connect once to download the customer list if it is not saved on this device.</p>}
    {customerId && <CustomerTimeline key={`${actor.id}:${customerId}`} customerId={customerId} actor={actor} mode={mode} initialStatus={initialStatus} embedded={Boolean(heading)} loadVisits={loadVisits} onOpen={visit => { void open(visit); }} />}
  </section>;
}
