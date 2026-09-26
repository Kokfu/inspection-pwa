import { useEffect, useState } from "react";
import { loadTechnicianUpcomingServices, type TechnicianUpcomingServicesData } from "../referenceData/referenceDataApi";

export function TechnicianUpcomingServices() {
  const [data, setData] = useState<TechnicianUpcomingServicesData>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void loadTechnicianUpcomingServices(controller.signal)
      .then((rows) => { if (!controller.signal.aborted) setData(rows); })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Upcoming services are unavailable."); });
    return () => controller.abort();
  }, []);
  const rows = (customers: TechnicianUpcomingServicesData["customers"]) => <ul className="manager-schedule-list">{customers.map((customer) => <li key={customer.id}>
    <strong>{customer.displayName}</strong><span>{customer.nextServiceDueDate ?? "Not scheduled"}</span>
  </li>)}</ul>;
  return <section aria-labelledby="technician-upcoming-title"><h2 id="technician-upcoming-title">Upcoming Services</h2>
    <p>Customers you have serviced, grouped by their next service due date.</p>
    {error ? <p role="alert" className="form-message">{error}</p> : !data ? <p role="status">Loading upcoming services…</p> : !data.customers.length && !data.unscheduledCustomers.length ? <p className="empty-state">No serviced customers yet.</p> : <>
      <section aria-label="Scheduled customers"><h3>Scheduled</h3>{rows(data.customers)}</section>
      <section aria-label="Not yet scheduled"><h3>Not yet scheduled</h3>{rows(data.unscheduledCustomers)}</section>
    </>}
  </section>;
}
