import { currentWorkspaceUserId, deviceDatabase, localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import { LocationProposalAlreadyPendingError, submitTechnicianLocationProposal, type LocationProposalPatch } from "../referenceData/referenceDataApi";
import { isHeldProposalDraft } from "../referenceData/proposalMessages";
import { validLocationProposalPatch } from "./locationProposalShape";
import { announceSyncFinished } from "../sync/syncEvents";

/**
 * Technician-proposed customer location patch, reviewed by a Supervisor/Admin before it's merged into
 * the customer's real, versioned configuration. Modeled on `technicianCustomerDraft.ts` -- the closest
 * existing "technician creates something offline that becomes real via server confirmation" precedent
 * -- but keyed per `(jobId, systemKey, targetLocationKey)` (not a single global draft) so a technician
 * can have an "add a new location" draft AND an "update this location's format" draft for the same
 * job+system pending locally at once, and reopening the job/form resumes the right one.
 *
 * `patch` is the same discriminated union the server validates (`LocationProposalPatch`):
 * `add-location` (name a brand-new location; no real inspection data exists for it yet) or
 * `update-format` (save row count + per-row content from the live inspection form's current
 * responses, possibly still Draft; first approval may create Roller Shutter's General location).
 */

export type TechnicianLocationProposalDraft = {
  id: string;
  jobId: string;
  customerId: string;
  systemKey: string;
  patch: LocationProposalPatch;
  status: "Draft" | "Pending" | "Failed" | "Synced";
  lastError?: string;
  revisionOf?: string;
  withdrawRequestId?: string;
};

type ProposalOutboxPayload = { id: string; jobId: string; customerId: string; systemKey: string; patch: LocationProposalPatch };

function newLocalKey() {
  const raw = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `k${Date.now()}${Math.random()}`;
  return raw.replace(/[^a-z0-9]/gi, "").slice(0, 12) || `k${Date.now()}`;
}

function draftKey(jobId: string, systemKey: string, targetLocationKey: string) {
  return `technician-location-proposal:${jobId}:${systemKey}:${targetLocationKey}`;
}

function storageKey(draft: TechnicianLocationProposalDraft) {
  const base = draftKey(draft.jobId, draft.systemKey, draft.patch.locationKey);
  return draft.revisionOf ? `${base}:${draft.id}` : base;
}

async function existingStorageKey(draft: TechnicianLocationProposalDraft) {
  const base = draftKey(draft.jobId, draft.systemKey, draft.patch.locationKey);
  const rows = await localDatabase.drafts.where("id").startsWith(base).toArray();
  const same = rows.find((row) => valid(row.payload) && row.payload.id === draft.id);
  return same?.id ?? (rows.some((row) => row.id === base) ? `${base}:${draft.id}` : storageKey(draft));
}

/** Revisions have their own storage row as well as a new mutation UUID. */
export function reviseTechnicianLocationProposal(source: Pick<TechnicianLocationProposalDraft, "id" | "jobId" | "customerId" | "systemKey" | "patch">): TechnicianLocationProposalDraft {
  return { id: crypto.randomUUID(), revisionOf: source.id, jobId: source.jobId, customerId: source.customerId,
    systemKey: source.systemKey, patch: structuredClone(source.patch), status: "Draft" };
}

/** Persist the withdrawal mutation identity before its POST, including for server-only requests.
 * No review decision or note is cached. A lost response can be retried after reopening this screen. */
export async function locationProposalWithdrawalRequestId(source: Pick<TechnicianLocationProposalDraft, "id" | "jobId" | "customerId" | "systemKey" | "patch">) {
  const draft: TechnicianLocationProposalDraft = { id: source.id, jobId: source.jobId, customerId: source.customerId,
    systemKey: source.systemKey, patch: structuredClone(source.patch), status: "Synced" };
  if (currentWorkspaceUserId() === undefined || !valid(draft)) throw new Error("This request cannot be withdrawn in this workspace.");
  return localDatabase.transaction("rw", localDatabase.drafts, async () => {
    const key = await existingStorageKey(draft);
    const row = await localDatabase.drafts.get(key);
    if (row && (!valid(row.payload) || row.payload.id !== source.id)) throw new Error("Saved request is invalid. It has been preserved.");
    const previous = row?.payload as TechnicianLocationProposalDraft | undefined;
    const requestId = previous?.withdrawRequestId ?? crypto.randomUUID();
    await localDatabase.drafts.put({ id: key, entityType: "technicianLocationProposal",
      payload: { ...(previous ?? draft), withdrawRequestId: requestId }, updatedAt: row?.updatedAt ?? new Date().toISOString() });
    return requestId;
  });
}

export async function listTechnicianLocationProposalDrafts(jobId: string): Promise<TechnicianLocationProposalDraft[]> {
  const rows = await localDatabase.drafts.where("id").startsWith(`technician-location-proposal:${jobId}:`).toArray();
  return rows.filter((row) => row.entityType === "technicianLocationProposal" && valid(row.payload) && row.payload.jobId === jobId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((row) => row.payload as TechnicianLocationProposalDraft);
}

/** Call only after explicit user confirmation. Sync claims and discard serialize on the same tables. */
export async function discardTechnicianLocationProposal(draft: TechnicianLocationProposalDraft) {
  const database = localDatabase;
  if (currentWorkspaceUserId() === undefined) throw new Error("Sign in before discarding a request.");
  await database.transaction("rw", database.drafts, database.syncOutbox, async () => {
    const row = await database.drafts.get(await existingStorageKey(draft));
    const item = await database.syncOutbox.get(draft.id);
    if (!row || !valid(row.payload) || row.payload.id !== draft.id) throw new Error("This request has changed. Refresh before discarding.");
    if (item?.status === "Syncing") throw new Error("This request is Syncing. Wait for server confirmation before withdrawing or discarding.");
    if (row.payload.status === "Synced" || item?.status === "Completed" && !isProposalHeldBehindPending(row.payload)) {
      throw new Error("This request may already be on the server. Refresh its status and use Withdraw.");
    }
    // A timed-out POST may already have been accepted. Preserve it until an exact UUID confirmation.
    if (item && item.attempts > 0 && !isProposalHeldBehindPending(row.payload)) throw new Error("Delivery is uncertain. Retry sync to confirm this request before withdrawing.");
    if (row.payload.status !== "Pending" && row.payload.status !== "Failed") throw new Error("Only an unsynced request can be discarded.");
    await database.syncOutbox.delete(draft.id);
    await database.drafts.delete(row.id);
  });
  announceSyncFinished();
}

/** `zoneKeys` are the zones the job already has for this system. The draft starts on the first one so the
 *  zone shown in the form is the zone that is actually saved (selecting an already-selected option fires no
 *  change event). With no zones the draft starts on an empty "new zone" the technician must name. */
export function newAddLocationDraft(
  jobId: string, customerId: string, systemKey: string, zoneKeys: readonly string[] = []
): TechnicianLocationProposalDraft {
  const firstZone = zoneKeys[0];
  return {
    id: crypto.randomUUID(), jobId, customerId, systemKey,
    patch: {
      kind: "add-location", locationKey: newLocalKey(), displayName: "",
      zoneKey: firstZone ?? null, newZone: firstZone === undefined ? { key: newLocalKey(), displayName: "" } : null
    },
    status: "Draft"
  };
}

export function newUpdateFormatDraft(
  jobId: string, customerId: string, systemKey: string, locationKey: string,
  rows: Array<Record<string, string>>
): TechnicianLocationProposalDraft {
  return { id: crypto.randomUUID(), jobId, customerId, systemKey, patch: { kind: "update-format", locationKey, rows }, status: "Draft" };
}

function validPatch(value: unknown, systemKey: string): value is LocationProposalPatch {
  return validLocationProposalPatch(value, systemKey);
}

function valid(value: unknown): value is TechnicianLocationProposalDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const draft = value as TechnicianLocationProposalDraft;
  return typeof draft.id === "string" && /^[0-9a-f-]{36}$/i.test(draft.id)
    && typeof draft.jobId === "string" && typeof draft.customerId === "string" && typeof draft.systemKey === "string"
    && validPatch(draft.patch, draft.systemKey)
    && (draft.revisionOf === undefined || typeof draft.revisionOf === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.revisionOf))
    && (draft.withdrawRequestId === undefined || typeof draft.withdrawRequestId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.withdrawRequestId))
    && (draft.lastError === undefined || typeof draft.lastError === "string")
    && ["Draft", "Pending", "Failed", "Synced"].includes(draft.status);
}

export async function loadTechnicianLocationProposalDraft(
  jobId: string, systemKey: string, targetLocationKey: string
): Promise<TechnicianLocationProposalDraft | undefined> {
  const rows = await localDatabase.drafts.where("id").startsWith(draftKey(jobId, systemKey, targetLocationKey)).toArray();
  const row = rows.filter((item) => valid(item.payload) && item.payload.patch.locationKey === targetLocationKey)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!row) return undefined;
  if (row.entityType !== "technicianLocationProposal" || !valid(row.payload)) {
    throw new Error("Saved location proposal draft is invalid; it has been preserved on this device.");
  }
  return row.payload;
}

/** The add-location proposal this technician last worked on for this job + system, whatever its status.
 *  An add-location draft's `locationKey` is generated when the draft is created, so the screen cannot
 *  know it after a reload; find the stored row by its job + system prefix instead. Rows that are not valid
 *  add-location drafts are left untouched on the device. */
export async function loadLatestAddLocationProposalDraft(
  jobId: string, systemKey: string
): Promise<TechnicianLocationProposalDraft | undefined> {
  const rows = await localDatabase.drafts.where("id").startsWith(`technician-location-proposal:${jobId}:${systemKey}:`).toArray();
  let latest: { at: string; payload: TechnicianLocationProposalDraft } | undefined;
  for (const row of rows) {
    if (row.entityType !== "technicianLocationProposal" || !valid(row.payload) || row.payload.patch.kind !== "add-location" || row.payload.revisionOf) continue;
    if (!latest || row.updatedAt > latest.at) latest = { at: row.updatedAt, payload: row.payload };
  }
  return latest?.payload;
}

export async function saveTechnicianLocationProposalDraft(draft: TechnicianLocationProposalDraft) {
  if (currentWorkspaceUserId() === undefined || !valid(draft) || draft.status !== "Draft") {
    throw new Error("Location proposal draft cannot be saved in this workspace.");
  }
  await localDatabase.transaction("rw", localDatabase.drafts, async () => {
    const key = await existingStorageKey(draft);
    const current = await localDatabase.drafts.get(key);
    if (current && (!valid(current.payload) || current.payload.status !== "Draft" || current.payload.id !== draft.id)) {
      throw new Error("A submitted request already uses this location. Its original has been preserved.");
    }
    await localDatabase.drafts.put({
    id: key, entityType: "technicianLocationProposal",
    payload: draft, updatedAt: new Date().toISOString()
    });
  });
}

function validateForQueue(draft: TechnicianLocationProposalDraft) {
  if (draft.patch.kind === "add-location") {
    if (!draft.patch.locationKey.trim() || !draft.patch.displayName.trim()) throw new Error("Name the new location before submitting.");
    if ((draft.patch.zoneKey === null || !draft.patch.zoneKey.trim()) && draft.patch.newZone === null) throw new Error("Choose an existing zone or name a new one before submitting.");
    if (draft.patch.newZone !== null && (!draft.patch.newZone.key.trim() || !draft.patch.newZone.displayName.trim())) throw new Error("Name the new zone before submitting.");
    return;
  }
  if (draft.patch.rows.length === 0) throw new Error("There are no rows to save as the format.");
}

export async function queueTechnicianLocationProposal(draft: TechnicianLocationProposalDraft): Promise<TechnicianLocationProposalDraft> {
  if (currentWorkspaceUserId() === undefined || !valid(draft) || draft.status !== "Draft") throw new Error("This location proposal cannot be queued.");
  validateForQueue(draft);
  const payload: ProposalOutboxPayload = { id: draft.id, jobId: draft.jobId, customerId: draft.customerId, systemKey: draft.systemKey, patch: draft.patch };
  const at = new Date().toISOString();
  const operation: SyncOutboxItem = {
    operationId: draft.id, entityType: "technicianLocationProposal", entityId: draft.id,
    action: "create", payload, createdAt: at, attempts: 0, status: "Pending", activeKey: `technicianLocationProposal:create:${draft.id}`
  };
  await localDatabase.transaction("rw", localDatabase.drafts, localDatabase.syncOutbox, async () => {
    const key = await existingStorageKey(draft);
    const existing = await localDatabase.syncOutbox.get(draft.id);
    if (existing) throw new Error("This location proposal is already queued.");
    const previous = await localDatabase.drafts.get(key);
    if (previous && (!valid(previous.payload) || previous.payload.id !== draft.id || previous.payload.status !== "Draft")) throw new Error("The original request has been preserved. Create a revision instead.");
    await localDatabase.drafts.put({ id: key, entityType: "technicianLocationProposal", payload: { ...draft, status: "Pending" }, updatedAt: at });
    await localDatabase.syncOutbox.put(operation);
  });
  announceSyncFinished();
  return { ...draft, status: "Pending" };
}

/** I-49: the draft of a proposal the sync retired because an earlier one for the same target is still awaiting review. */
export const isProposalHeldBehindPending = isHeldProposalDraft;

let syncing: Promise<void> | undefined;
/** Resolves when no location-proposal sync is running (see technicianCustomerSyncIdle). */
export function locationProposalSyncIdle(): Promise<void> { return (syncing ?? Promise.resolve()).catch(() => undefined); }
export function syncPendingLocationProposals(actorUserId: number): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    if (currentWorkspaceUserId() !== actorUserId) return;
    const database = localDatabase;
    const identity = await deviceDatabase.authState.get("device-auth");
    if (identity?.userId !== actorUserId || identity.explicitLogout || identity.serverLogoutPending) return;
    const rows = (await database.syncOutbox.where("entityType").equals("technicianLocationProposal").toArray())
      .filter((item) => item.status === "Pending" || item.status === "Failed");
    for (const item of rows) {
      if (currentWorkspaceUserId() !== actorUserId || localDatabase !== database) return;
      const payload = item.payload as ProposalOutboxPayload;
      const stored = (await database.drafts.where("id").startsWith(draftKey(payload.jobId, payload.systemKey, payload.patch.locationKey)).toArray())
        .find((row) => valid(row.payload) && row.payload.id === payload.id);
      const key = stored?.id ?? draftKey(payload.jobId, payload.systemKey, payload.patch.locationKey);
      const draft = stored?.payload;
      if (!valid(draft) || draft.id !== item.entityId || (draft.status !== "Pending" && draft.status !== "Failed")
        || JSON.stringify({ id: draft.id, jobId: draft.jobId, customerId: draft.customerId, systemKey: draft.systemKey, patch: draft.patch }) !== JSON.stringify(payload)) {
        const message = "Location proposal draft and frozen request do not match";
        await database.transaction("rw", database.drafts, database.syncOutbox, async () => {
          if (valid(draft) && draft.id === item.entityId) {
            await database.drafts.put({ id: key, entityType: "technicianLocationProposal", payload: { ...draft, status: "Failed", lastError: message }, updatedAt: new Date().toISOString() });
          }
          await database.syncOutbox.update(item.operationId, { status: "Failed", lastError: message });
        });
        continue;
      }
      const at = new Date().toISOString();
      const claimed = await database.transaction("rw", database.drafts, database.syncOutbox, async () => {
        const current = await database.syncOutbox.get(item.operationId);
        const currentDraft = await database.drafts.get(key);
        if (!current || !["Pending", "Failed"].includes(current.status) || !currentDraft || !valid(currentDraft.payload)
          || currentDraft.payload.id !== draft.id || JSON.stringify(current.payload) !== JSON.stringify(item.payload)) return false;
        await database.syncOutbox.update(item.operationId, { status: "Syncing", attempts: current.attempts + 1, lastAttemptAt: at });
        return true;
      });
      if (!claimed) continue;
      try {
        const currentIdentity = await deviceDatabase.authState.get("device-auth");
        if (currentWorkspaceUserId() !== actorUserId || currentIdentity?.userId !== actorUserId
          || currentIdentity.explicitLogout || currentIdentity.serverLogoutPending) throw new Error("Authentication changed; retry after signing in.");
        const result = await submitTechnicianLocationProposal(payload.customerId, payload.systemKey, {
          id: payload.id, jobId: payload.jobId, patch: payload.patch
        }, actorUserId);
        // Never infer success from HTTP 200 alone: the server must confirm this exact UUID.
        if (result.id !== draft.id) throw new Error("Server confirmed a different proposal id.");
        const done = new Date().toISOString();
        if (currentWorkspaceUserId() !== actorUserId || localDatabase !== database) return;
        await database.transaction("rw", database.drafts, database.syncOutbox, async () => {
          const current = await database.syncOutbox.get(item.operationId);
          if (current?.status !== "Syncing" || JSON.stringify(current.payload) !== JSON.stringify(item.payload)) return;
          const latest = await database.drafts.get(key);
          if (!valid(latest?.payload) || latest.payload.id !== draft.id) return;
          await database.drafts.put({ id: key, entityType: "technicianLocationProposal", payload: { ...draft, withdrawRequestId: latest.payload.withdrawRequestId, status: "Synced", lastError: undefined }, updatedAt: done });
          await database.syncOutbox.update(item.operationId, { status: "Completed", activeKey: undefined, completedAt: done, lastError: undefined });
        });
      } catch (error) {
        if (currentWorkspaceUserId() !== actorUserId || localDatabase !== database) return;
        const message = error instanceof Error ? error.message : "Location proposal sync failed.";
        // I-49: an earlier proposal for the same target is still awaiting review. Retrying cannot succeed and nothing
        // needs attention, so the item is retired (Completed = never retried, header clear) while the local draft keeps
        // its calm "not sent" text. It is deliberately NOT marked Synced: the server never confirmed this UUID.
        const retired = error instanceof LocationProposalAlreadyPendingError;
        await database.transaction("rw", database.drafts, database.syncOutbox, async () => {
          const current = await database.syncOutbox.get(item.operationId);
          if (current?.status !== "Syncing") return;
          const latest = await database.drafts.get(key);
          if (!valid(latest?.payload) || latest.payload.id !== draft.id) return;
          await database.drafts.put({ id: key, entityType: "technicianLocationProposal", payload: { ...draft, withdrawRequestId: latest.payload.withdrawRequestId, status: "Failed", lastError: message }, updatedAt: new Date().toISOString() });
          await database.syncOutbox.update(item.operationId, retired
            ? { status: "Completed", activeKey: undefined, completedAt: new Date().toISOString(), lastError: message }
            : { status: "Failed", lastError: message });
        });
      }
    }
  })().finally(() => { syncing = undefined; announceSyncFinished(); });
  return syncing;
}

export function heldLocationProposalMessage(draft: TechnicianLocationProposalDraft, systemName: string, pending?: { submittedAt: string }, heldAt?: string) {
  const target = draft.patch.kind === "add-location" ? draft.patch.displayName : "this location's format";
  return pending
    ? `Not sent: ${target} (${systemName}) is waiting on the earlier request submitted ${new Date(pending.submittedAt).toLocaleString()}. After its review, revise and submit a new request.`
    : `Not sent: ${target} (${systemName}) is waiting on an earlier request for the same location.${heldAt ? ` This attempt was held at ${new Date(heldAt).toLocaleString()}.` : ""} The earlier request's submission time is unavailable here. Check its review status before submitting a new request. This saved copy will not retry automatically.`;
}
