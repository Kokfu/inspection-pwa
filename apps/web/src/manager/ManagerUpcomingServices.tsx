import { useEffect, useRef, useState } from "react";
import { loadUpcomingServices, saveCustomerNextServiceDueDate, ManagerApiError, type UpcomingServices } from "./managerApi";

export function ManagerUpcomingServices({ onAuthorityFailure }: { onAuthorityFailure: (error: unknown) => void }) {
  const [data, setData] = useState<UpcomingServices>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void loadUpcomingServices(controller.signal).then((rows) => { if (!controller.signal.aborted) setData(rows); }).catch((error: unknown) => {
      if (!controller.signal.aborted) { setData(undefined); onAuthorityFailure(error); }
    });
    return () => { mounted.current = false; controller.abort(); };
  }, []);
  async function save(id: string, value: string) {
    setBusy(true); setMessage("");
    try { await saveCustomerNextServiceDueDate(id, value || null); if (!mounted.current) return; const rows = await loadUpcomingServices(); if (mounted.current) setData(rows); }
    catch (error) {
      if (!mounted.current) return;
      if (error instanceof ManagerApiError && error.kind === "domain") setMessage(error.message);
      else { setData(undefined); onAuthorityFailure(error); }
    } finally { if (mounted.current) setBusy(false); }
  }
  const rows = (customers: UpcomingServices["customers"]) => <ul className="manager-schedule-list">{customers.map((customer) => <li key={customer.id}>
    <strong>{customer.displayName}</strong>
    <label>Next service due for {customer.displayName}<input type="date" aria-label={`Next service due for ${customer.displayName}`} disabled={busy} value={customer.nextServiceDueDate ?? ""} onChange={(event) => void save(customer.id, event.target.value)} /></label>
  </li>)}</ul>;
  return <section aria-labelledby="upcoming-title"><h2 id="upcoming-title">Next Upcoming Service</h2>
    {message && <p role="alert" className="form-message">{message}</p>}
    {!data ? <p role="status">Loading upcoming services…</p> : !data.customers.length && !data.unscheduledCustomers.length ? <p className="empty-state">No customers.</p> : <>
      <section aria-label="Scheduled customers"><h3>Scheduled</h3>{rows([...data.customers].sort((a, b) => a.nextServiceDueDate!.localeCompare(b.nextServiceDueDate!) || a.displayName.localeCompare(b.displayName)))}</section>
      <section aria-label="Not yet scheduled"><h3>Not yet scheduled</h3>{rows(data.unscheduledCustomers)}</section>
    </>}
  </section>;
}
