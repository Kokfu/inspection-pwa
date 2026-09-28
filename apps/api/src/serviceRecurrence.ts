import { datePlusDays, validDate } from "./reminderCore.js";

export type ServiceRecurrence = { kind: "weekly"; interval: number; day: number } | { kind: "monthly"; interval: 1; day: number };

export function matchesRecurrence(date: string, rule: ServiceRecurrence): boolean {
  if (!validDate(date)) return false;
  if (rule.kind === "weekly") return Number.isInteger(rule.interval) && rule.interval >= 1 && rule.interval <= 52
    && Number.isInteger(rule.day) && rule.day >= 1 && rule.day <= 7
    && (new Date(`${date}T00:00:00Z`).getUTCDay() || 7) === rule.day;
  return rule.interval === 1 && Number.isInteger(rule.day) && rule.day >= 1 && rule.day <= 31 && Number(date.slice(8, 10)) === rule.day;
}

export function nextRecurringDate(currentDue: string, serviceDate: string, rule: ServiceRecurrence): string {
  if (!matchesRecurrence(currentDue, rule) || !validDate(serviceDate)) throw new Error("INVALID_SERVICE_RECURRENCE");
  const threshold = currentDue > serviceDate ? currentDue : serviceDate;
  if (rule.kind === "weekly") {
    let candidate = currentDue;
    for (let iteration = 0; iteration < 10000; iteration++) {
      candidate = datePlusDays(candidate, rule.interval * 7);
      if (candidate > threshold) return candidate;
    }
  } else {
    let year = Number(currentDue.slice(0, 4));
    let month = Number(currentDue.slice(5, 7));
    for (let iteration = 0; iteration < 120000; iteration++) {
      month += 1;
      if (month > 12) { month = 1; year += 1; }
      if (year > 9999) break;
      const date = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${rule.day.toString().padStart(2, "0")}`;
      if (validDate(date) && date > threshold) return date;
    }
  }
  throw new Error("SERVICE_RECURRENCE_OUT_OF_RANGE");
}
