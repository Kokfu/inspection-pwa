import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import { isSectionRemarkKey, isSectionRemarkSystemKey, type SectionRemarkSystemKey } from "./remarkSections";
import { normaliseSectionRemarkWording, sectionRemarkCompareKey } from "./sectionRemarkText";

/**
 * CR-07 Phase 1: technician-added remarks, stored per customer + system + form section.
 *
 * A remark is only ever TEXT appended to an inspection field string (appendCommonRemark); no remark id ever
 * enters an inspection payload. This module owns the device-side list: a per-customer cache in the existing
 * `referenceData` store (key `service-section-remarks:<customerId>`) that holds the server's rows plus this
 * device's not-yet-confirmed additions, and the `sectionRemark` outbox item that carries each addition to the
 * server. Both are written in ONE Dexie transaction, so a remark can never be offered without being queued,
 * or queued without being offered. No Dexie schema change: `referenceData` and `syncOutbox` already exist.
 */
export const sectionRemarkCap = 50;
const maxCachedRemarks = 2000;
const changedEvent = "service-section-remarks-changed";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SectionRemark = {
  id: string;
  customerId: string;
  systemKey: SectionRemarkSystemKey;
  sectionKey: string;
  wording: string;
};
/** The outbox payload: the remark plus the visit it was typed in (audit context only; never part of identity). */
export type SectionRemarkOutboxPayload = SectionRemark & { jobId?: string };

export const sectionRemarkCacheKey = (customerId: string) => `service-section-remarks:${customerId.toLowerCase()}`;

/** A refusal the technician can read: duplicate wording, section full, or invalid text. Nothing was stored. */
export class SectionRemarkInputError extends Error {
  constructor(readonly code: "INVALID" | "DUPLICATE" | "DUPLICATE_CATALOG" | "LIMIT", message: string) { super(message); }
}
/** The server's reply did not confirm the exact remark that was sent (HTTP 200 alone is never enough). */
export class SectionRemarkNotConfirmedError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validSectionRemark(value: unknown): value is SectionRemark {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 5 || !keys.every((key) => ["id", "customerId", "systemKey", "sectionKey", "wording"].includes(key))) return false;
  if (typeof value.id !== "string" || !uuid.test(value.id) || typeof value.customerId !== "string" || !uuid.test(value.customerId)) return false;
  if (!isSectionRemarkSystemKey(value.systemKey) || !isSectionRemarkKey(value.systemKey, value.sectionKey)) return false;
  const text = normaliseSectionRemarkWording(value.wording);
  return text.ok && text.wording === value.wording;
}

/** Strict: any malformed element, a foreign customer or a repeated id rejects the WHOLE list (fail closed). */
export function parseSectionRemarks(value: unknown, customerId: string): SectionRemark[] {
  const expected = customerId.toLowerCase();
  if (!Array.isArray(value) || value.length > maxCachedRemarks || !value.every(validSectionRemark)
    || value.some((remark) => remark.customerId.toLowerCase() !== expected)
    || new Set(value.map((remark) => remark.id.toLowerCase())).size !== value.length) {
    throw new Error("Section remarks are malformed");
  }
  return value as SectionRemark[];
}

const scopeKey = (remark: Pick<SectionRemark, "systemKey" | "sectionKey" | "wording">) =>
  JSON.stringify([remark.systemKey, remark.sectionKey, sectionRemarkCompareKey(remark.wording)]);

/** Server rows first, then this device's unconfirmed additions that the server list does not already hold. */
export function mergeSectionRemarks(remote: readonly SectionRemark[], local: readonly SectionRemark[]): SectionRemark[] {
  const ids = new Set(remote.map((remark) => remark.id.toLowerCase()));
  const texts = new Set(remote.map(scopeKey));
  const merged = [...remote];
  for (const remark of local) {
    if (ids.has(remark.id.toLowerCase()) || texts.has(scopeKey(remark))) continue;
    ids.add(remark.id.toLowerCase()); texts.add(scopeKey(remark)); merged.push(remark);
  }
  return merged;
}

/** The remarks one section offers, in the order they were added. */
export function sectionRemarkChoices(all: readonly SectionRemark[], systemKey: string, sectionKey: string): SectionRemark[] {
  return all.filter((remark) => remark.systemKey === systemKey && remark.sectionKey === sectionKey);
}

/** After a merged reply: the local id is replaced by the server's canonical row (inspections store text, not ids). */
export function swapCanonicalSectionRemark(list: readonly SectionRemark[], localId: string, canonical: SectionRemark): SectionRemark[] {
  const withoutLocal = list.filter((remark) => remark.id.toLowerCase() !== localId.toLowerCase());
  if (withoutLocal.some((remark) => remark.id.toLowerCase() === canonical.id.toLowerCase())) return withoutLocal;
  const index = list.findIndex((remark) => remark.id.toLowerCase() === localId.toLowerCase());
  const next = [...withoutLocal];
  next.splice(index < 0 ? next.length : Math.min(index, next.length), 0, canonical);
  return next;
}

export function parseSectionRemarkOutboxPayload(value: unknown, entityId: string): SectionRemarkOutboxPayload | undefined {
  if (!isRecord(value)) return undefined;
  const { jobId, ...remark } = value;
  if (jobId !== undefined && (typeof jobId !== "string" || !uuid.test(jobId))) return undefined;
  if (!validSectionRemark(remark) || remark.id !== entityId) return undefined;
  return { ...remark, ...(jobId === undefined ? {} : { jobId }) };
}

export type SectionRemarkConfirmation = { remark: SectionRemark; merged: boolean; duplicate: boolean };

/**
 * The only way a queued remark becomes Completed. The reply must echo the exact UUID that was sent and carry a
 * valid canonical row for the same customer + system + section + wording; a different canonical id is accepted
 * only when the server says it merged this text onto an existing row.
 */
export function parseSectionRemarkConfirmation(body: unknown, sent: SectionRemark): SectionRemarkConfirmation {
  const fail = (reason: string) => new SectionRemarkNotConfirmedError(`The server did not confirm this remark (${reason}).`);
  if (!isRecord(body)) throw fail("no reply body");
  if (body.requestedId !== sent.id) throw fail("it named a different remark id");
  if (typeof body.merged !== "boolean" || typeof body.duplicate !== "boolean") throw fail("unexpected reply shape");
  const canonical = body.remark;
  if (!validSectionRemark(canonical)) throw fail("the remark was malformed");
  if (canonical.customerId.toLowerCase() !== sent.customerId.toLowerCase() || canonical.systemKey !== sent.systemKey || canonical.sectionKey !== sent.sectionKey
    || sectionRemarkCompareKey(canonical.wording) !== sectionRemarkCompareKey(sent.wording)) throw fail("it described different content");
  if (canonical.id.toLowerCase() !== sent.id.toLowerCase() && !body.merged) throw fail("it returned a different id without merging");
  return { remark: canonical, merged: body.merged, duplicate: body.duplicate };
}

/** The cached list for one customer ([] when never fetched). Throws when the stored list is malformed. */
export async function cachedSectionRemarks(customerId: string): Promise<SectionRemark[]> {
  const stored = await localDatabase.referenceData.get(sectionRemarkCacheKey(customerId));
  return stored ? parseSectionRemarks(stored.payload, customerId) : [];
}

function announce() { window.dispatchEvent(new Event(changedEvent)); }
export function onSectionRemarksChanged(listener: () => void) {
  window.addEventListener(changedEvent, listener);
  return () => window.removeEventListener(changedEvent, listener);
}

async function writeCache(customerId: string, remarks: SectionRemark[]) {
  const at = new Date().toISOString();
  await localDatabase.referenceData.put({ key: sectionRemarkCacheKey(customerId), payload: remarks, version: at, fetchedAt: at, expiresAt: at });
}

/** This device's unconfirmed or retained additions for one customer, from the outbox (inside a transaction). */
async function localAdditions(customerId: string): Promise<SectionRemark[]> {
  const items = await localDatabase.syncOutbox.where("entityType").equals("sectionRemark").toArray();
  const found: SectionRemark[] = [];
  for (const item of items) {
    const payload = parseSectionRemarkOutboxPayload(item.payload, item.entityId);
    if (!payload || payload.customerId.toLowerCase() !== customerId.toLowerCase()) continue;
    const { jobId: _jobId, ...remark } = payload;
    found.push(remark);
  }
  return found;
}

/**
 * Fetch the customer's server list and merge it with this device's additions. A failed or malformed reply throws
 * and leaves the previous cache exactly as it was (never a silent fall back to an emptied list).
 */
export async function refreshSectionRemarks(customerId: string): Promise<SectionRemark[]> {
  const id = customerId.toLowerCase();
  const response = await fetch(`/api/customers/${id}/section-remarks`, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("Section remarks could not be refreshed");
  const body: unknown = await response.json();
  if (!isRecord(body) || !Object.hasOwn(body, "remarks")) throw new Error("Section remarks response is malformed");
  const remote = parseSectionRemarks(body.remarks, id);
  const merged = await localDatabase.transaction("rw", localDatabase.referenceData, localDatabase.syncOutbox, async () => {
    const next = mergeSectionRemarks(remote, await localAdditions(id));
    await writeCache(id, next);
    return next;
  });
  announce();
  return merged;
}

export type AddSectionRemarkInput = {
  customerId: string;
  systemKey: SectionRemarkSystemKey;
  sectionKey: string;
  wording: string;
  jobId?: string;
  /** Wordings the section already offers from the service's standard catalogue (case-insensitive duplicates). */
  catalogWordings?: readonly string[];
};

/**
 * Save a new remark on this device: validate, refuse duplicates, then write the cache entry AND the outbox item in
 * one transaction. Never consults navigator.onLine. Returns the remark that the section now offers.
 */
export async function addSectionRemark(input: AddSectionRemarkInput): Promise<SectionRemark> {
  const customerId = input.customerId.toLowerCase();
  if (!uuid.test(customerId) || !isSectionRemarkKey(input.systemKey, input.sectionKey)) {
    throw new SectionRemarkInputError("INVALID", "This section cannot take a new remark.");
  }
  if (input.jobId !== undefined && !uuid.test(input.jobId)) throw new SectionRemarkInputError("INVALID", "This section cannot take a new remark.");
  const text = normaliseSectionRemarkWording(input.wording);
  if (!text.ok) throw new SectionRemarkInputError("INVALID", text.message);
  const key = sectionRemarkCompareKey(text.wording);
  if ((input.catalogWordings ?? []).some((wording) => sectionRemarkCompareKey(wording.trim()) === key)) {
    throw new SectionRemarkInputError("DUPLICATE_CATALOG", "That remark is already in the standard remarks for this service. Choose it from the list.");
  }
  const remark: SectionRemark = { id: crypto.randomUUID(), customerId, systemKey: input.systemKey, sectionKey: input.sectionKey, wording: text.wording };
  const at = new Date().toISOString();
  const payload: SectionRemarkOutboxPayload = { ...remark, ...(input.jobId === undefined ? {} : { jobId: input.jobId }) };
  const operation: SyncOutboxItem = {
    operationId: crypto.randomUUID(), entityType: "sectionRemark", entityId: remark.id, action: "create", payload,
    createdAt: at, attempts: 0, status: "Pending", activeKey: `sectionRemark:create:${remark.id}`
  };
  await localDatabase.transaction("rw", localDatabase.referenceData, localDatabase.syncOutbox, async () => {
    const existing = await cachedSectionRemarks(customerId);
    const inSection = sectionRemarkChoices(existing, remark.systemKey, remark.sectionKey);
    if (inSection.some((item) => sectionRemarkCompareKey(item.wording) === key)) {
      throw new SectionRemarkInputError("DUPLICATE", "That remark is already in this section's list. Choose it from the list.");
    }
    if (inSection.length >= sectionRemarkCap) {
      throw new SectionRemarkInputError("LIMIT", `This section already has ${sectionRemarkCap} added remarks.`);
    }
    await writeCache(customerId, [...existing, remark]);
    await localDatabase.syncOutbox.put(operation);
  });
  announce();
  return remark;
}

/**
 * Called by the sync engine once the server has confirmed the exact UUID: the outbox item is Completed and, when
 * the server merged the text onto an existing row, the cache swaps the local id for the canonical one - together.
 */
export async function completeSectionRemark(operationId: string, sent: SectionRemark, confirmation: SectionRemarkConfirmation) {
  await localDatabase.transaction("rw", localDatabase.referenceData, localDatabase.syncOutbox, async () => {
    if (confirmation.remark.id.toLowerCase() !== sent.id.toLowerCase()) {
      const cached = await cachedSectionRemarks(sent.customerId).catch(() => undefined);
      if (cached) await writeCache(sent.customerId, swapCanonicalSectionRemark(cached, sent.id, confirmation.remark));
    }
    await localDatabase.syncOutbox.update(operationId, { status: "Completed", activeKey: undefined, completedAt: new Date().toISOString(), lastError: undefined });
  });
  announce();
}
