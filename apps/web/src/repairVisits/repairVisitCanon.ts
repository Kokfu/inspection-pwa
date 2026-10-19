import { rvObject } from "./repairVisitTypes";

/** Recursively key-sorted JSON; arrays keep their order. Byte-identical to apps/api repairVisitWriteContract `fingerprint`. */
export function canonicalJson(value: unknown): string {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical) : rvObject(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key])])) : item;
  return JSON.stringify(canonical(value));
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(data: BufferSource) {
  return hex(await crypto.subtle.digest("SHA-256", data));
}

/** The server's request fingerprint: SHA-256 of the canonical JSON of {actorId, ...body}. */
export async function requestFingerprint(value: unknown) {
  return sha256Hex(new TextEncoder().encode(canonicalJson(value)));
}

/** Malaysia calendar day of an instant; the server compares the visit day with this, not with the device's own zone. */
export function malaysiaDay(instant: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}
