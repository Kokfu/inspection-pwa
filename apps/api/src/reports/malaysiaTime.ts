// Report display time is Malaysia time. Stored timestamps stay UTC; only formatting changes.
export const REPORT_TIME_ZONE = "Asia/Kuala_Lumpur";

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parse(value: string | Date): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("Invalid report timestamp");
  return parsed;
}

function parts(value: string | Date, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-GB", { timeZone: REPORT_TIME_ZONE, hourCycle: "h23", ...options }).formatToParts(parse(value))) out[part.type] = part.value;
  return out;
}

/** Malaysia calendar date of a timestamp, as YYYY-MM-DD. */
export function formatMalaysiaIsoDate(value: string | Date): string {
  const p = parts(value, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

/** Malaysia calendar date of a timestamp, e.g. "22 Oct 2026". */
export function formatMalaysiaDate(value: string | Date): string {
  const p = parts(value, { year: "numeric", month: "short", day: "2-digit" });
  return `${p.day} ${p.month} ${p.year}`;
}

/** Malaysia time of day, 24-hour HH:mm. */
export function formatMalaysiaTime(value: string | Date): string {
  const p = parts(value, { hour: "2-digit", minute: "2-digit" });
  return `${p.hour}:${p.minute}`;
}

/** e.g. "22 Oct 2026 03:13". */
export function formatMalaysiaDateTime(value: string | Date): string {
  return `${formatMalaysiaDate(value)} ${formatMalaysiaTime(value)}`;
}

/** A stored calendar DATE (YYYY-MM-DD) is shown as written; it is never shifted by a time zone. */
export function formatCalendarDate(value: string): string {
  if (!CALENDAR_DATE.test(value)) throw new Error("Invalid report date");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("Invalid report date");
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
}

/** A report value that is either a calendar DATE or a full timestamp. */
export function formatDateOrTimestamp(value: string): string {
  return CALENDAR_DATE.test(value) ? formatCalendarDate(value) : formatMalaysiaDate(value);
}
