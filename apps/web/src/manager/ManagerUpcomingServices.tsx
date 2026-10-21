import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { groupByDate, monthOf, weekdayDate, type YearMonth } from "../schedule/calendarMonth";
import { DueCalendar, useCompactViewport, type CalendarItem, type CalendarStatus } from "../schedule/DueCalendar";
import { classifyDue, compareByUrgency, dueLabel, formatDueDate, localToday, type DueStatus } from "../schedule/dueStatus";
import { loadUpcomingServices, saveCustomerNextServiceDueDate, ManagerApiError, type UpcomingServices } from "./managerApi";
import { ManagerReminderPlan } from "./ManagerReminderPlan";
import { ManagerServiceRecurrence } from "./ManagerServiceRecurrence";
import { UpcomingServiceDrawer } from "./UpcomingServiceDrawer";
import type { UpcomingServiceAction } from "./UpcomingServiceRowMenu";
import { UpcomingRowActions, UpcomingServicesTable, type UpcomingRow, type UpcomingSort } from "./UpcomingServicesTable";
import "./managerUpcomingServices.css";

type StatusFilter = DueStatus | "all";
const FILTERS: Array<{ key: StatusFilter; label: string; empty: string }> = [
  { key: "overdue", label: "Overdue", empty: "No overdue services." },
  { key: "due_soon", label: "Due in 30 days", empty: "No services due in the next 30 days." },
  { key: "later", label: "Later", empty: "No later services." },
  { key: "not_scheduled", label: "Not scheduled", empty: "No unscheduled customers." },
  { key: "all", label: "All", empty: "No customers." }
];

/** Throws on a malformed due date so the caller fails closed; a bad date is never treated as "later". */
function accepted(rows: UpcomingServices): UpcomingServices {
  const today = localToday();
  for (const customer of [...rows.customers, ...rows.unscheduledCustomers]) classifyDue(customer.nextServiceDueDate, today);
  return rows;
}

type UpcomingView = "table" | "calendar";

function calendarStatus(dueDate: string, today: string): CalendarStatus {
  const { status } = classifyDue(dueDate, today);
  return status === "overdue" ? "overdue" : status === "due_soon" ? "soon" : "later";
}

export function ManagerUpcomingServices({ onAuthorityFailure }: { onAuthorityFailure: (error: unknown) => void }) {
  const [data, setData] = useState<UpcomingServices>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [drawer, setDrawer] = useState<{ customerId: string; action: UpcomingServiceAction }>();
  const [pickerId, setPickerId] = useState<string | null>(null);
  const [chosenFilter, setChosenFilter] = useState<StatusFilter>();
  const [sort, setSort] = useState<UpcomingSort>({ key: "due", dir: "asc" });
  const [query, setQuery] = useState("");
  const [view, setView] = useState<UpcomingView>("table");
  const [calMonth, setCalMonth] = useState<YearMonth>(() => monthOf(localToday()));
  const [selectedDate, setSelectedDate] = useState<string | null>(() => localToday());
  const compact = useCompactViewport();
  const mounted = useRef(false);
  const latestData = useRef(data);
  latestData.current = data;
  const opener = useRef<HTMLElement | null>(null);
  const pendingFocus = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const authorityFailure = useRef(onAuthorityFailure);
  authorityFailure.current = onAuthorityFailure;
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void loadUpcomingServices(controller.signal).then((rows) => {
      if (controller.signal.aborted) return;
      const checked = accepted(rows);
      setChosenFilter((current) => current ?? (checked.customers.some((customer) => classifyDue(customer.nextServiceDueDate, localToday()).status === "overdue") ? "overdue" : "all"));
      setData(checked);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) { setData(undefined); onAuthorityFailure(error); }
    });
    return () => { mounted.current = false; controller.abort(); };
  }, []);
  // Hand focus back after a drawer or popover closes (the trigger may be gone if the row left the filtered list).
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    const target = opener.current;
    opener.current = null;
    (target?.isConnected ? target : titleRef.current)?.focus();
  });
  async function save(id: string, value: string): Promise<boolean> {
    setBusy(true); setMessage(""); setNotice("");
    const known = latestData.current;
    const name = known?.customers.concat(known.unscheduledCustomers).find((customer) => customer.id === id)?.displayName ?? "customer";
    try {
      await saveCustomerNextServiceDueDate(id, value || null);
      if (!mounted.current) return false;
      const rows = accepted(await loadUpcomingServices());
      if (mounted.current) { setData(rows); setNotice(value ? `Next service date saved for ${name}: ${formatDueDate(value)}.` : `Next service date cleared for ${name}.`); }
      return true;
    }
    catch (error) {
      if (!mounted.current) return false;
      if (error instanceof ManagerApiError && error.kind === "domain") setMessage(error.message);
      else { setData(undefined); authorityFailure.current(error); }
      return false;
    } finally { if (mounted.current) setBusy(false); }
  }
  const reloadAfterRoutine = useCallback(async () => {
    try { const latest = accepted(await loadUpcomingServices()); if (mounted.current) setData(latest); }
    catch (error) { if (mounted.current) setData(undefined); throw error; }
  }, []);

  const today = useMemo(() => localToday(), [data]);
  const allRows = useMemo<UpcomingRow[]>(() => data ? [...data.customers, ...data.unscheduledCustomers].map((customer) => {
    const due = customer.nextServiceDueDate;
    return { customer, status: classifyDue(due, today).status, label: dueLabel(due, today), dateText: due === null ? null : formatDueDate(due) };
  }) : [], [data, today]);
  const trimmedQuery = query.trim().toLowerCase();
  const searched = useMemo(() => !trimmedQuery ? allRows : allRows.filter(({ customer }) =>
    customer.displayName.toLowerCase().includes(trimmedQuery) || customer.code.toLowerCase().includes(trimmedQuery)), [allRows, trimmedQuery]);
  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { overdue: 0, due_soon: 0, later: 0, not_scheduled: 0, all: searched.length };
    for (const row of searched) result[row.status] += 1;
    return result;
  }, [searched]);
  const filter = chosenFilter ?? "all";
  const visible = useMemo(() => {
    const shown = filter === "all" ? searched : searched.filter((row) => row.status === filter);
    const direction = sort.dir === "asc" ? 1 : -1;
    const byName = (a: UpcomingRow, b: UpcomingRow) => a.customer.displayName.localeCompare(b.customer.displayName, "en", { sensitivity: "base" }) || a.customer.code.localeCompare(b.customer.code);
    const byDue = (a: UpcomingRow, b: UpcomingRow) => compareByUrgency({ dueDate: a.customer.nextServiceDueDate, name: a.customer.displayName }, { dueDate: b.customer.nextServiceDueDate, name: b.customer.displayName });
    return [...shown].sort((a, b) => {
      if (sort.key === "name") return direction * byName(a, b);
      const aUnset = a.customer.nextServiceDueDate === null;
      const bUnset = b.customer.nextServiceDueDate === null;
      if (aUnset || bUnset) return byDue(a, b); // not scheduled stays last in either direction
      return direction * byDue(a, b);
    });
  }, [searched, filter, sort]);

  const calendarItems = useMemo<CalendarItem[]>(() => visible.flatMap(({ customer }) =>
    customer.nextServiceDueDate ? [{ id: customer.id, name: customer.displayName, dueDate: customer.nextServiceDueDate }] : []), [visible]);
  const dayRows = useMemo(() => {
    const items = selectedDate ? groupByDate(calendarItems, (item) => item.dueDate).get(selectedDate) ?? [] : [];
    return items.flatMap((item) => visible.filter((row) => row.customer.id === item.id));
  }, [calendarItems, visible, selectedDate]);
  const monthStart = `${String(calMonth.year).padStart(4, "0")}-${String(calMonth.month).padStart(2, "0")}-01`;
  const overdueEarlier = useMemo(() => searched.filter((row) => row.status === "overdue" && row.customer.nextServiceDueDate !== null && row.customer.nextServiceDueDate < monthStart).length, [searched, monthStart]);
  const changeMonth = useCallback((next: YearMonth) => {
    setCalMonth(next);
    setSelectedDate((current) => {
      const kept = current !== null && monthOf(current).year === next.year && monthOf(current).month === next.month;
      return kept ? current : null;
    });
  }, []);
  // The calendar opens on every scheduled customer; the default Overdue chip would leave the current month looking empty.
  const showCalendar = useCallback(() => { if (view !== "calendar") setChosenFilter("all"); setView("calendar"); }, [view]);
  const showOverdueInTable = useCallback(() => { setChosenFilter("overdue"); setView("table"); }, []);
  const onSort = useCallback((key: UpcomingSort["key"]) => setSort((current) => current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }), []);
  const closePicker = useCallback(() => { pendingFocus.current = true; setPickerId(null); }, []);
  const closeDrawer = useCallback(() => { pendingFocus.current = true; setDrawer(undefined); }, []);
  const handlers = useMemo(() => ({
    onOpenPicker: (customerId: string, element: HTMLElement | null) => { opener.current = element; setDrawer(undefined); setPickerId(customerId); },
    onSavePicker: (customerId: string, value: string) => { void save(customerId, value).then((ok) => { if (ok && mounted.current) closePicker(); }); },
    onCancelPicker: closePicker,
    onAction: (customerId: string, action: UpcomingServiceAction, element: HTMLElement | null) => { opener.current = element; setPickerId(null); setDrawer({ customerId, action }); }
  }), [closePicker]);

  const drawerCustomer = drawer && data ? [...data.customers, ...data.unscheduledCustomers].find((customer) => customer.id === drawer.customerId) : undefined;
  const drawerDueDate = drawerCustomer?.nextServiceDueDate ?? null;
  const showDrawer = !!drawer && !!drawerCustomer && (drawer.action === "routine" || drawerDueDate !== null);
  const hasAnyCustomers = allRows.length > 0;
  const activeFilter = FILTERS.find((entry) => entry.key === filter)!;
  return <section aria-labelledby="upcoming-title"><h2 id="upcoming-title" ref={titleRef} tabIndex={-1}>Next Upcoming Service</h2>
    {message && <p role="alert" className="form-message">{message}</p>}
    {notice && <p role="status" className="form-message">{notice}</p>}
    {hasAnyCustomers ? <div className="upcoming-toolbar">
      <div className="upcoming-toolbar-top">
        <div className="manager-search-form" role="search" aria-label="Filter customers">
          <label htmlFor="manager-upcoming-search">Filter by customer name or code</label>
          <div className="manager-search-row">
            <input id="manager-upcoming-search" type="search" autoComplete="off" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} />
            {query ? <button type="button" className="secondary-command" onClick={() => setQuery("")}>Clear</button> : null}
          </div>
        </div>
        <div className="upcoming-view-toggle" role="group" aria-label="View">
          <button type="button" className="upcoming-chip" aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button>
          <button type="button" className="upcoming-chip" aria-pressed={view === "calendar"} onClick={showCalendar}>Calendar</button>
        </div>
      </div>
      <div className="upcoming-chips" role="group" aria-label="Filter by status">
        {FILTERS.map((entry) => <button key={entry.key} type="button" className="upcoming-chip" aria-pressed={filter === entry.key} onClick={() => setChosenFilter(entry.key)}>
          {entry.label} <span className="upcoming-chip-count">{counts[entry.key]}</span></button>)}
      </div>
    </div> : null}
    {!data ? <p role="status">Loading upcoming services…</p> : !hasAnyCustomers ? <p className="empty-state">No customers.</p>
      : searched.length === 0 ? <p className="empty-state">No customer matches "{query.trim()}".</p>
      : view === "calendar" ? (filter === "not_scheduled"
        ? <p className="empty-state">Unscheduled customers are not on the calendar. Switch to Table to see them.</p>
        : <div className="upcoming-calendar">
          {overdueEarlier > 0 && <div className="upcoming-cal-banner">
            <span>{overdueEarlier} {overdueEarlier === 1 ? "customer" : "customers"} overdue from earlier months</span>
            <button type="button" className="secondary-command" onClick={showOverdueInTable}>Show in table</button>
          </div>}
          <DueCalendar month={calMonth} items={calendarItems} selectedDate={selectedDate} onSelectDate={setSelectedDate} onMonthChange={changeMonth}
            today={today} compact={compact} statusOf={(dueDate) => calendarStatus(dueDate, today)} />
          <section className="upcoming-day" aria-labelledby="upcoming-day-title">
            <h3 id="upcoming-day-title">{selectedDate === null ? "No day selected" : `${weekdayDate(selectedDate)}, ${dayRows.length === 0 ? "no customers" : `${dayRows.length} ${dayRows.length === 1 ? "customer" : "customers"}`}`}</h3>
            {selectedDate === null ? <p className="secondary-metadata">Select a day to see its customers.</p>
              : <ul className="upcoming-day-list">{dayRows.map((row) => <li key={row.customer.id} className="upcoming-day-item">
                <div className="upcoming-customer"><strong>{row.customer.displayName}</strong><span className="secondary-metadata">{row.customer.code}</span></div>
                <span className={`upcoming-status upcoming-status--${row.status}`}>{row.label}</span>
                <div className="upcoming-actions"><UpcomingRowActions customer={row.customer} busy={busy} pickerOpen={pickerId === row.customer.id} handlers={handlers} /></div>
              </li>)}</ul>}
          </section>
        </div>)
      : visible.length === 0 ? <p className="empty-state">{activeFilter.empty}</p>
      : <UpcomingServicesTable rows={visible} sort={sort} onSort={onSort} busy={busy} pickerId={pickerId} handlers={handlers} />}
    {showDrawer && drawerCustomer && <UpcomingServiceDrawer kindLabel={drawer.action === "reminders" ? "Reminder recipients" : "Service routine"} customerName={drawerCustomer.displayName} onClose={closeDrawer}>
      {drawer.action === "reminders" && drawerDueDate
        ? <ManagerReminderPlan key={`${drawerCustomer.id}:${drawerDueDate}`} customerId={drawerCustomer.id} dueDate={drawerDueDate} onAuthorityFailure={onAuthorityFailure} />
        : <ManagerServiceRecurrence customerId={drawerCustomer.id} onAuthorityFailure={onAuthorityFailure} onSaved={reloadAfterRoutine} />}
    </UpcomingServiceDrawer>}
  </section>;
}
