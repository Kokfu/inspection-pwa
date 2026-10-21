import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { addDays, daysInMonth, groupByDate, mondayIndex, monthGrid, monthOf, monthTitle, shiftMonth, shortDate, type YearMonth } from "./calendarMonth";
import "./dueCalendar.css";

export type CalendarStatus = "overdue" | "soon" | "later";
export type CalendarItem = { id: string; name: string; dueDate: string };

const WEEKDAYS = [["M", "Monday"], ["T", "Tuesday"], ["W", "Wednesday"], ["T", "Thursday"], ["F", "Friday"], ["S", "Saturday"], ["S", "Sunday"]] as const;
const STATUS_ORDER: readonly CalendarStatus[] = ["overdue", "soon", "later"];
const STATUS_WORDS: Record<CalendarStatus, string> = { overdue: "Overdue", soon: "Due soon", later: "Later" };
const WIDE_CHIPS = 2;

/** True while the viewport is narrower than the table/card breakpoint (700 px). */
export function useCompactViewport(maxWidth = 699): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  const [compact, setCompact] = useState(() => typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const update = () => setCompact(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return compact;
}

function sameMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

function clampToMonth(date: string, month: YearMonth): string {
  const first = `${String(month.year).padStart(4, "0")}-${String(month.month).padStart(2, "0")}-01`;
  if (sameMonth(monthOf(date), month)) return date;
  return date < first ? first : addDays(first, daysInMonth(month.year, month.month) - 1);
}

/** Month grid shared by the manager and technician screens. Items must carry valid YYYY-MM-DD dates (callers fail closed first). */
export function DueCalendar({ month, items, selectedDate, onSelectDate, onMonthChange, today, compact, statusOf, scheme = "manager" }: {
  month: YearMonth;
  items: readonly CalendarItem[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onMonthChange: (month: YearMonth) => void;
  today: string;
  compact: boolean;
  statusOf: (dueDate: string) => CalendarStatus;
  scheme?: "manager" | "technician";
}) {
  const grid = useMemo(() => monthGrid(month.year, month.month), [month.year, month.month]);
  const byDate = useMemo(() => groupByDate(items, (item) => item.dueDate), [items]);
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);

  const inDisplayed = (date: string | null): date is string => date !== null && sameMonth(monthOf(date), month);
  const first = grid[0].find((cell) => cell.inMonth)!.date;
  const rovingDate = inDisplayed(focusDate) ? focusDate : inDisplayed(selectedDate) ? selectedDate : inDisplayed(today) ? today : first;

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    const element = buttons.current.get(target);
    if (element) { pendingFocus.current = null; element.focus(); }
  });

  function moveTo(date: string) {
    pendingFocus.current = date;
    setFocusDate(date);
    const target = monthOf(date);
    if (!sameMonth(target, month)) onMonthChange(target);
  }
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    let next: string | null = null;
    switch (event.key) {
      case "ArrowLeft": next = addDays(date, -1); break;
      case "ArrowRight": next = addDays(date, 1); break;
      case "ArrowUp": next = addDays(date, -7); break;
      case "ArrowDown": next = addDays(date, 7); break;
      case "Home": next = clampToMonth(addDays(date, -mondayIndex(date)), month); break;
      case "End": next = clampToMonth(addDays(date, 6 - mondayIndex(date)), month); break;
      case "PageUp": case "PageDown": {
        const shifted = shiftMonth(month.year, month.month, event.key === "PageUp" ? -1 : 1);
        const day = Number(date.slice(8));
        next = `${String(shifted.year).padStart(4, "0")}-${String(shifted.month).padStart(2, "0")}-${String(Math.min(day, daysInMonth(shifted.year, shifted.month))).padStart(2, "0")}`;
        break;
      }
      default: return;
    }
    event.preventDefault();
    moveTo(next);
  }
  function goToday() {
    onMonthChange(monthOf(today));
    onSelectDate(today);
    setFocusDate(today);
  }

  const previous = shiftMonth(month.year, month.month, -1);
  const following = shiftMonth(month.year, month.month, 1);
  const title = monthTitle(month.year, month.month);
  return <div className={`due-calendar due-calendar--${compact ? "compact" : "wide"} due-calendar--${scheme}`}>
    <div className="due-cal-head">
      <button type="button" className="due-cal-nav" aria-label="Previous month" onClick={() => onMonthChange(previous)}><span aria-hidden="true">‹</span></button>
      <h3 className="due-cal-title" aria-live="polite">{title}</h3>
      <button type="button" className="due-cal-nav" aria-label="Next month" onClick={() => onMonthChange(following)}><span aria-hidden="true">›</span></button>
      <button type="button" className="due-cal-today" onClick={goToday}>Today</button>
    </div>
    <div role="grid" aria-label={`Service calendar, ${title}`} className="due-cal-grid">
      <div role="row" className="due-cal-row due-cal-row--head">
        {WEEKDAYS.map(([short, long]) => <div key={long} role="columnheader" aria-label={long} className="due-cal-weekday"><span aria-hidden="true">{short}</span></div>)}
      </div>
      {grid.map((week) => <div role="row" className="due-cal-row" key={week[0].date}>
        {week.map((cell) => {
          const day = Number(cell.date.slice(8));
          if (!cell.inMonth) return <div role="gridcell" aria-disabled="true" key={cell.date} className="due-cal-cell due-cal-cell--muted"><span className="due-cal-daynum">{day}</span></div>;
          const dayItems = byDate.get(cell.date) ?? [];
          const present = STATUS_ORDER.filter((status) => dayItems.some((item) => statusOf(item.dueDate) === status));
          const selected = cell.date === selectedDate;
          const isToday = cell.date === today;
          const label = `${shortDate(cell.date)}, ${dayItems.length === 0 ? "no services" : `${dayItems.length} ${dayItems.length === 1 ? "service" : "services"}`}`;
          return <div role="gridcell" aria-selected={selected} key={cell.date} className="due-cal-cell">
            <button type="button" aria-label={label} aria-describedby={present.length ? `due-cal-status-${cell.date}` : undefined} aria-current={isToday ? "date" : undefined} tabIndex={cell.date === rovingDate ? 0 : -1}
              ref={(element) => { if (element) buttons.current.set(cell.date, element); else buttons.current.delete(cell.date); }}
              className={`due-cal-day${isToday ? " due-cal-day--today" : ""}${selected ? " due-cal-day--selected" : ""}`}
              onClick={() => { setFocusDate(cell.date); onSelectDate(cell.date); }} onKeyDown={(event) => onKeyDown(event, cell.date)}>
              <span className="due-cal-daynum">{day}</span>
              {present.length ? <span id={`due-cal-status-${cell.date}`} className="visually-hidden">{present.map((status) => STATUS_WORDS[status]).join(", ")}</span> : null}
              {compact
                ? present.length ? <span className="due-cal-dots" aria-hidden="true">{present.map((status) => <span key={status} className={`due-cal-dot due-cal-tone--${status}`} />)}</span> : null
                : <span className="due-cal-chips" aria-hidden="true">
                  {dayItems.slice(0, WIDE_CHIPS).map((item) => {
                    return <span key={item.id} className={`due-cal-chip due-cal-tone--${statusOf(item.dueDate)}`}>{item.name}</span>;
                  })}
                  {dayItems.length > WIDE_CHIPS ? <span className="due-cal-more">+{dayItems.length - WIDE_CHIPS} more</span> : null}
                </span>}
            </button>
          </div>;
        })}
      </div>)}
    </div>
  </div>;
}
