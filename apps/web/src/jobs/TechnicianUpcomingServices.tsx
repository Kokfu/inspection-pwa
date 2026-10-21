import { useEffect, useMemo, useState } from "react";
import { loadTechnicianUpcomingServices, type TechnicianUpcomingServicesData } from "../referenceData/referenceDataApi";
import { compareByUrgency, dueLabel, formatDueDate, localToday, technicianGroup, type TechnicianGroup } from "../schedule/dueStatus";
import "./technicianUpcomingServices.css";

type DueGroup = Exclude<TechnicianGroup, "not_scheduled">;
type Card = { id: string; name: string; dueDate: string };

const GROUPS: ReadonlyArray<{ key: DueGroup; title: string }> = [
  { key: "overdue", title: "Overdue" },
  { key: "this_week", title: "This week" },
  { key: "later", title: "Later" }
];
const UNAVAILABLE = "Upcoming services are unavailable.";
const OFFLINE = "Upcoming services could not be loaded. Check your connection and try again.";

/** Groups scheduled customers for a fixed "today"; throws on a malformed date so the caller fails closed. */
function groupCustomers(customers: TechnicianUpcomingServicesData["customers"], today: string): Record<DueGroup, Card[]> {
  const grouped: Record<DueGroup, Card[]> = { overdue: [], this_week: [], later: [] };
  for (const customer of customers) {
    const group = technicianGroup(customer.nextServiceDueDate, today);
    if (group === "not_scheduled" || customer.nextServiceDueDate === null) throw new Error("Scheduled customer has no due date.");
    formatDueDate(customer.nextServiceDueDate);
    grouped[group].push({ id: customer.id, name: customer.displayName, dueDate: customer.nextServiceDueDate });
  }
  for (const cards of Object.values(grouped)) cards.sort((a, b) => compareByUrgency({ dueDate: a.dueDate, name: a.name }, { dueDate: b.dueDate, name: b.name }));
  return grouped;
}

export function TechnicianUpcomingServices() {
  const [data, setData] = useState<TechnicianUpcomingServicesData>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<DueGroup | null>(null);
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void loadTechnicianUpcomingServices(controller.signal)
      .then((rows) => { if (!controller.signal.aborted) setData(rows); })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof TypeError ? OFFLINE : reason instanceof Error ? reason.message : UNAVAILABLE); });
    return () => controller.abort();
  }, [attempt]);
  function retry() { setError(""); setData(undefined); setAttempt((count) => count + 1); }
  const today = localToday();
  const grouped = useMemo(() => {
    if (!data) return null;
    try { return groupCustomers(data.customers, today); } catch { return "malformed" as const; }
  }, [data, today]);
  const unscheduled = useMemo(() => data
    ? [...data.unscheduledCustomers].sort((a, b) => a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" }))
    : [], [data]);

  const body = () => {
    if (error) return <>
      <p role="alert" className="form-message">{error}</p>
      <button type="button" className="secondary-command" onClick={retry}>Retry</button>
    </>;
    if (!data || !grouped) return <p role="status">Loading upcoming services…</p>;
    if (grouped === "malformed") return <p role="alert" className="form-message">{UNAVAILABLE}</p>;
    if (!data.customers.length && !data.unscheduledCustomers.length) return <p className="empty-state">No serviced customers yet.</p>;
    const shown = GROUPS.filter(({ key }) => (selected === null || selected === key) && grouped[key].length);
    return <>
      <div className="tech-upcoming-chips" role="group" aria-label="Filter by due status">
        {GROUPS.map(({ key, title }) => <button key={key} type="button" className={`tech-upcoming-chip tech-upcoming-chip--${key}`}
          aria-pressed={selected === key} onClick={() => setSelected(selected === key ? null : key)}>
          {title} <span className="tech-upcoming-count">{grouped[key].length}</span>
        </button>)}
      </div>
      {shown.map(({ key, title }) => <section key={key} className="tech-upcoming-group" aria-labelledby={`tech-upcoming-${key}`}>
        <h3 id={`tech-upcoming-${key}`} className={`tech-upcoming-heading tech-upcoming-heading--${key}`}>{title}</h3>
        <ul className="tech-upcoming-list">{grouped[key].map((card) => <li key={card.id} className="tech-upcoming-card">
          <strong className="tech-upcoming-name">{card.name}</strong>
          <span className="tech-upcoming-date">Due {formatDueDate(card.dueDate)}</span>
          <span className={`tech-upcoming-status tech-upcoming-status--${key}`}>{dueLabel(card.dueDate, today)}</span>
        </li>)}</ul>
      </section>)}
      <section className="tech-upcoming-unscheduled" aria-label="Not scheduled">
        <button type="button" className="tech-upcoming-toggle" aria-expanded={showUnscheduled} aria-controls="tech-upcoming-unscheduled-list"
          onClick={() => setShowUnscheduled((open) => !open)}>Not scheduled ({unscheduled.length})</button>
        {showUnscheduled ? <ul id="tech-upcoming-unscheduled-list" className="tech-upcoming-list">
          {unscheduled.map((customer) => <li key={customer.id} className="tech-upcoming-card"><strong className="tech-upcoming-name">{customer.displayName}</strong></li>)}
        </ul> : null}
      </section>
    </>;
  };

  return <section aria-labelledby="technician-upcoming-title"><h2 id="technician-upcoming-title">Upcoming Services</h2>
    <p>Customers you have serviced, grouped by their next service due date.</p>
    {body()}
  </section>;
}
