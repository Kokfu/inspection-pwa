import { compareByUrgency } from "./dueStatus";

export type CalendarCell = { date: string; inMonth: boolean };
export type YearMonth = { year: number; month: number };

const DAY_MS = 86_400_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function assertYearMonth(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 1 || year > 9999) throw new Error(`Invalid calendar year: ${String(year)}.`);
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error(`Invalid calendar month: ${String(month)}.`);
}

function format(ms: number): string {
  const date = new Date(ms);
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
}

/** Parses a strict YYYY-MM-DD calendar date to UTC-midnight milliseconds; throws on anything else. */
export function parseCalendarDate(value: string): number {
  const match = typeof value === "string" ? DATE_PATTERN.exec(value) : null;
  if (!match) throw new Error(`Invalid calendar date: ${JSON.stringify(value)}.`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) throw new Error(`Invalid calendar date: ${value}.`);
  return ms;
}

/** Month containing a YYYY-MM-DD date. */
export function monthOf(date: string): YearMonth {
  const parsed = new Date(parseCalendarDate(date));
  return { year: parsed.getUTCFullYear(), month: parsed.getUTCMonth() + 1 };
}

export function addDays(date: string, days: number): string {
  return format(parseCalendarDate(date) + days * DAY_MS);
}

/** 0 = Monday ... 6 = Sunday. */
export function mondayIndex(date: string): number {
  return (new Date(parseCalendarDate(date)).getUTCDay() + 6) % 7;
}

export function daysInMonth(year: number, month: number): number {
  assertYearMonth(year, month);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Monday-first weeks covering the month: only as many rows as the month needs (4 to 6). */
export function monthGrid(year: number, month: number): CalendarCell[][] {
  assertYearMonth(year, month);
  const first = format(Date.UTC(year, month - 1, 1));
  const lead = mondayIndex(first);
  const total = Math.ceil((lead + daysInMonth(year, month)) / 7) * 7;
  const start = Date.UTC(year, month - 1, 1) - lead * DAY_MS;
  const rows: CalendarCell[][] = [];
  for (let index = 0; index < total; index += 1) {
    const ms = start + index * DAY_MS;
    const cell = { date: format(ms), inMonth: new Date(ms).getUTCMonth() === month - 1 };
    if (index % 7 === 0) rows.push([]);
    rows[rows.length - 1].push(cell);
  }
  return rows;
}

export function shiftMonth(year: number, month: number, delta: number): YearMonth {
  assertYearMonth(year, month);
  if (!Number.isInteger(delta)) throw new Error(`Invalid month offset: ${String(delta)}.`);
  const index = year * 12 + (month - 1) + delta;
  const shifted = { year: Math.floor(index / 12), month: (index % 12 + 12) % 12 + 1 };
  assertYearMonth(shifted.year, shifted.month);
  return shifted;
}

/** Fixed English month names so the title never depends on the device locale. */
export function monthTitle(year: number, month: number): string {
  assertYearMonth(year, month);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** "28 Oct 2026" */
export function shortDate(date: string): string {
  const parsed = new Date(parseCalendarDate(date));
  return `${parsed.getUTCDate()} ${MONTH_SHORT[parsed.getUTCMonth()]} ${parsed.getUTCFullYear()}`;
}

/** "Wed 28 Oct 2026" */
export function weekdayDate(date: string): string {
  return `${WEEKDAY_SHORT[new Date(parseCalendarDate(date)).getUTCDay()]} ${shortDate(date)}`;
}

/** Groups items by due date, each day ordered with compareByUrgency. Null dates are skipped; a malformed date throws. */
export function groupByDate<T extends { name: string }>(items: readonly T[], getDate: (item: T) => string | null): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const date = getDate(item);
    if (date === null) continue;
    parseCalendarDate(date);
    const day = grouped.get(date);
    if (day) day.push(item); else grouped.set(date, [item]);
  }
  for (const day of grouped.values()) day.sort((a, b) => compareByUrgency({ dueDate: getDate(a), name: a.name }, { dueDate: getDate(b), name: b.name }));
  return grouped;
}
