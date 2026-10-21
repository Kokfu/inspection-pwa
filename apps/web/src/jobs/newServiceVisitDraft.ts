import { currentWorkspaceUserId, localDatabase } from "../db/localDatabase";

/**
 * OA-7: the New Service Visit setup lives on the device from the first change, not only in React state, so a refresh,
 * a force-close or a crash does not lose the customer / site / services / call number the technician already chose.
 * It also keeps the create request's identity (`requestId`, `localJobUuid`, start time) across a reload, so a create
 * whose reply was lost is replayed with the same identity instead of becoming a second visit.
 * Stored in the existing per-user `drafts` table (no schema change). Add Customer / Add site inline forms are not part
 * of this draft.
 */
const draftId = "new-service-visit";
const entityType = "newServiceVisit";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NewServiceVisitDraft = {
  schemaVersion: 1;
  requestId: string;
  localJobUuid: string;
  customerId: string;
  siteId: string;
  systemKeys: string[];
  serviceCallNumber: string;
  addingSite: boolean;
  proposedSiteName: string;
  proposedSiteAddress: string;
  /** Device clock time captured on the first Create tap; replays must send the identical value. */
  arrivalTime?: string;
  /** A server create was started and its outcome is unknown: only an exact replay (or Start over) is safe. */
  sending: boolean;
};

export function newVisitDraft(initialCustomerId = ""): NewServiceVisitDraft {
  return { schemaVersion: 1, requestId: crypto.randomUUID(), localJobUuid: crypto.randomUUID(), customerId: initialCustomerId,
    siteId: "", systemKeys: [], serviceCallNumber: "", addingSite: false, proposedSiteName: "", proposedSiteAddress: "", sending: false };
}

export function isNewServiceVisitDraft(value: unknown): value is NewServiceVisitDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const draft = value as NewServiceVisitDraft;
  return draft.schemaVersion === 1
    && typeof draft.requestId === "string" && uuid.test(draft.requestId)
    && typeof draft.localJobUuid === "string" && uuid.test(draft.localJobUuid)
    && typeof draft.customerId === "string" && typeof draft.siteId === "string"
    && Array.isArray(draft.systemKeys) && draft.systemKeys.every((key) => typeof key === "string")
    && typeof draft.serviceCallNumber === "string" && typeof draft.addingSite === "boolean"
    && typeof draft.proposedSiteName === "string" && typeof draft.proposedSiteAddress === "string"
    && (draft.arrivalTime === undefined || /^\d{2}:\d{2}$/.test(draft.arrivalTime))
    && typeof draft.sending === "boolean";
}

/** True when nothing worth restoring has been chosen yet. */
export function isBlankDraft(draft: NewServiceVisitDraft) {
  return !draft.customerId && !draft.siteId && draft.systemKeys.length === 0 && !draft.serviceCallNumber.trim()
    && !draft.addingSite && !draft.proposedSiteName.trim() && !draft.proposedSiteAddress.trim() && !draft.sending;
}

/** The saved setup, or undefined when there is none, none can be read, or it is malformed (a fresh setup then starts). */
export async function loadNewVisitDraft(): Promise<NewServiceVisitDraft | undefined> {
  if (currentWorkspaceUserId() === undefined) return undefined;
  try {
    const row = await localDatabase.drafts.get(draftId);
    return row && row.entityType === entityType && isNewServiceVisitDraft(row.payload) ? row.payload : undefined;
  } catch { return undefined; }
}

let chain: Promise<void> = Promise.resolve();
/** Writes are applied in call order, so the last change always wins. Resolves true when stored. */
export function saveNewVisitDraft(draft: NewServiceVisitDraft): Promise<boolean> {
  if (currentWorkspaceUserId() === undefined || !isNewServiceVisitDraft(draft)) return Promise.resolve(false);
  const snapshot = structuredClone(draft);
  let stored = false;
  chain = chain.then(async () => {
    try { await localDatabase.drafts.put({ id: draftId, entityType, payload: snapshot, updatedAt: new Date().toISOString() }); stored = true; }
    catch { stored = false; }
  });
  return chain.then(() => stored);
}

export function clearNewVisitDraft(): Promise<void> {
  if (currentWorkspaceUserId() === undefined) return Promise.resolve();
  chain = chain.then(async () => { try { await localDatabase.drafts.delete(draftId); } catch { /* the next save overwrites it */ } });
  return chain;
}
