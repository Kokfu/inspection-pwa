import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { serviceDueEmailEncryptionKey } from "./config/env.js";

export const reminderZone = "Asia/Kuala_Lumpur";
export const reminderTime = "09:00";

export const encryptionKey = serviceDueEmailEncryptionKey;

export function encryptPassword(password: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  return { ciphertext: Buffer.concat([cipher.update(password, "utf8"), cipher.final()]), iv, tag: cipher.getAuthTag() };
}

export function decryptPassword(ciphertext: Buffer, iv: Buffer, tag: Buffer): string {
  if (iv.length !== 12 || tag.length !== 16) throw new Error("SERVICE_DUE_EMAIL_CIPHERTEXT_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  try { return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"); }
  catch { throw new Error("SERVICE_DUE_EMAIL_CIPHERTEXT_INVALID"); }
}

export function validEmail(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 254 || value.length < 3 || /[\s<>\x00-\x1f]/.test(value)) return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts as [string, string];
  return local.length > 0 && local.length <= 64 && !local.startsWith(".") && !local.endsWith(".") && !local.includes("..")
    && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
    && domain.length <= 253 && domain.includes(".") && domain.split(".").every((label) =>
      label.length > 0 && label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
}

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function datePlusDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function localClock(now: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: reminderZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (part: string) => parts.find((value) => value.type === part)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function nextRunAt(now: Date): Date {
  const clock = localClock(now);
  const nextDate = clock.time < reminderTime ? clock.date : datePlusDays(clock.date, 1);
  const [year, month, day] = nextDate.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(year, month - 1, day, 9);
  const zonePart = new Intl.DateTimeFormat("en-US", { timeZone: reminderZone, timeZoneName: "shortOffset" })
    .formatToParts(new Date(guess)).find((part) => part.type === "timeZoneName")?.value;
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(zonePart ?? "");
  if (!match) throw new Error("REMINDER_TIMEZONE_UNAVAILABLE");
  const offset = (Number(match[2]) * 60 + Number(match[3] ?? 0)) * (match[1] === "+" ? 1 : -1);
  return new Date(guess - offset * 60_000);
}

export function mailText(customerName: string, dueDate: string): { subject: string; body: string } {
  const safeName = customerName.replace(/[\r\n\x00-\x1f]/g, " ").trim();
  return {
    subject: `Service reminder: ${safeName} — ${dueDate}`,
    body: `This is a scheduling reminder for ${safeName}. The next service date is ${dueDate}.\r\n\r\nPlease confirm the schedule with your manager if needed.\r\n`
  };
}
