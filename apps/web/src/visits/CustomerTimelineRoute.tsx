import { useEffect, useId, useRef, useState } from "react";
import type { AuthUser } from "../auth/authApi";
import { getCachedReferenceCustomers } from "../referenceData/referenceDataCache";
import { loadTimelineCustomers } from "./customerTimelineData";
import { CustomerTimeline } from "./CustomerTimeline";
import type { TimelineVisit } from "./customerTimelineData";
import "./CustomerTimeline.css";
import { loadTimelineServiceJob } from "./customerTimelineServiceJob";
import type { InspectionJob } from "../jobs/jobTypes";

/** Route-level picker uses the existing live customer catalog, never a visit snapshot. */
export function CustomerTimelineRoute({ customerId, actor, mode, initialStatus, onCustomer, onOpen, onBack, onServiceJob }: {
  initialStatus?: string;
  customerId?: string; actor: AuthUser; mode: "server" | "offline" | "unavailable";
  onCustomer: (id: string) => void; onOpen: (visit: TimelineVisit) => void; onBack: () => void;
  onServiceJob?: (job: InspectionJob) => void;
}) {
  const customerControl = useId();
  const opening = useRef<AbortController | null>(null);
  const [customers, setCustomers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    setCustomers([]); setMessage("");
    async function load() {
      if (mode === "unavailable") throw new Error("Verify your session to choose a customer.");
      let values;
      values = mode === "offline" ? await getCachedReferenceCustomers() : await loadTimelineCustomers(actor);
      if (!Array.isArray(values) || values.some(v => !v || typeof v.id !== "string" || typeof v.displayName !== "string")) throw new Error("Customer catalog is unavailable.");
      if (active) setCustomers(values);
    }
    void load().catch(e => { if (active) setMessage(e instanceof Error ? e.message : "Customer catalog is unavailable."); });
    return () => { active = false; opening.current?.abort(); };
  }, [actor.id, mode]);
  useEffect(() => () => { opening.current?.abort(); }, [customerId]);
  async function open(visit: TimelineVisit) {
    opening.current?.abort();
    const controller = new AbortController(); opening.current = controller;
    setMessage("");
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 10_000);
    try {
      if (visit.kind === "service" && actor.role === "inspector" && mode === "server" && onServiceJob && customerId) {
        const job = await loadTimelineServiceJob(visit.id, customerId, actor, controller.signal);
        if (!controller.signal.aborted) onServiceJob(job);
      } else onOpen(visit);
    } catch (e) {
      if (timedOut) setMessage("The server did not answer in time. Reconnect and retry opening this visit.");
      else if (!controller.signal.aborted) setMessage(e instanceof Error ? e.message : "Visit details are unavailable.");
    }
    finally { clearTimeout(timer); }
  }
  return <section className="workspace">
    <button type="button" className="secondary-command" onClick={onBack}>Back</button>
    <label htmlFor={customerControl}>Customer</label><select id={customerControl} name="customer" autoComplete="off" value={customerId ?? ""} onChange={e => onCustomer(e.target.value)}>
      <option value="">Choose a customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.displayName}</option>)}
    </select>
    {message && <p role="alert">{message}</p>}
    {!customers.length && !message && <p>Connect once to download the customer list if it is not saved on this device.</p>}
    {customerId && <CustomerTimeline key={`${actor.id}:${customerId}`} customerId={customerId} actor={actor} mode={mode} initialStatus={initialStatus} onOpen={visit => { void open(visit); }} />}
  </section>;
}
