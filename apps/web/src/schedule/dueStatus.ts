export type DueStatus = "overdue" | "due_soon" | "later" | "not_scheduled";
export type TechnicianGroup = "overdue" | "this_week" | "later" | "not_scheduled";

const DAY_MS = 86_400_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Parses a strict YYYY-MM-DD calendar date to UTC-midnight milliseconds; throws on anything else. */
function parseDateOnly(value: string, field: string): number {
  const match = typeof value === "string" ? DATE_PATTERN.exec(value) : null;
  if (!match) throw new Error(`Invalid ${field}: expected YYYY-MM-DD, received ${JSON.stringify(value)}.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error(`Invalid ${field}: ${value} is not a real calendar date.`);
  }
  return ms;
}

export function daysUntilDue(dueDate: string | null, today: string): number | null {
  const todayMs = parseDateOnly(today, "today");
  if (dueDate === null) return null;
  return Math.round((parseDateOnly(dueDate, "dueDate") - todayMs) / DAY_MS);
}

export function classifyDue(dueDate: string | null, today: string): { status: DueStatus; days: number | null } {
  const days = daysUntilDue(dueDate, today);
  if (days === null) return { status: "not_scheduled", days };
  if (days < 0) return { status: "overdue", days };
  return { status: days <= 30 ? "due_soon" : "later", days };
}

export function technicianGroup(dueDate: string | null, today: string): TechnicianGroup {
  const days = daysUntilDue(dueDate, today);
  if (days === null) return "not_scheduled";
  if (days < 0) return "overdue";
  return days <= 7 ? "this_week" : "later";
}

function plural(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

export function dueLabel(dueDate: string | null, today: string): string {
  const days = daysUntilDue(dueDate, today);
  if (days === null) return "Not scheduled";
  if (days < 0) return `${plural(-days)} overdue`;
  if (days === 0) return "Due today";
  return `In ${plural(days)}`;
}

export function formatDueDate(dueDate: string): string {
  parseDateOnly(dueDate, "dueDate");
  const [year, month, day] = dueDate.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

export function localToday(now: Date = new Date()): string {
  const pad = (value: number, width: number) => String(value).padStart(width, "0");
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`;
}

/** Overdue most-late first, then soonest, then not scheduled last, then name A-Z. Throws on a malformed date. */
export function compareByUrgency(
  a: { dueDate: string | null; name: string },
  b: { dueDate: string | null; name: string }
): number {
  const aMs = a.dueDate === null ? null : parseDateOnly(a.dueDate, "dueDate");
  const bMs = b.dueDate === null ? null : parseDateOnly(b.dueDate, "dueDate");
  if (aMs !== bMs) {
    if (aMs === null) return 1;
    if (bMs === null) return -1;
    return aMs - bMs;
  }
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
}
