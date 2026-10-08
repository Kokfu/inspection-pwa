import { currentWorkspaceUserId, deviceDatabase, localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import { submitTechnicianLocationProposal, type LocationProposalPatch } from "../referenceData/referenceDataApi";
import { validLocationProposalPatch } from "./locationProposalShape";

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
};

type ProposalOutboxPayload = { id: string; jobId: string; customerId: string; systemKey: string; patch: LocationProposalPatch };

function newLocalKey() {
  const raw = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `k${Date.now()}${Math.random()}`;
  return raw.replace(/[^a-z0-9]/gi, "").slice(0, 12) || `k${Date.now()}`;
}

function draftKey(jobId: string, systemKey: string, targetLocationKey: string) {
  return `technician-location-proposal:${jobId}:${systemKey}:${targetLocationKey}`;
}

export function newAddLocationDraft(jobId: string, customerId: string, systemKey: string): TechnicianLocationProposalDraft {
  return {
    id: crypto.randomUUID(), jobId, customerId, systemKey,
    patch: { kind: "add-location", locationKey: newLocalKey(), displayName: "", zoneKey: null, newZone: null },
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
    && ["Draft", "Pending", "Failed", "Synced"].includes(draft.status);
}

export async function loadTechnicianLocationProposalDraft(
  jobId: string, systemKey: string, targetLocationKey: string
): Promise<TechnicianLocationProposalDraft | undefined> {
  const row = await localDatabase.drafts.get(draftKey(jobId, systemKey, targetLocationKey));
  if (!row) return undefined;
  if (row.entityType !== "technicianLocationProposal" || !valid(row.payload)) {
    throw new Error("Saved location proposal draft is invalid; it has been preserved on this device.");
  }
  return row.payload;
}

export async function saveTechnicianLocationProposalDraft(draft: TechnicianLocationProposalDraft) {
  if (currentWorkspaceUserId() === undefined || !valid(draft) || draft.status !== "Draft") {
    throw new Error("Location proposal draft cannot be saved in this workspace.");
  }
  await localDatabase.drafts.put({
    id: draftKey(draft.jobId, draft.systemKey, draft.patch.locationKey), entityType: "technicianLocationProposal",
    payload: draft, updatedAt: new Date().toISOString()
  });
}

function validateForQueue(draft: TechnicianLocationProposalDraft) {
  if (draft.patch.kind === "add-location") {
    if (!draft.patch.locationKey.trim() || !draft.patch.displayName.trim()) throw new Error("Name the new location before submitting.");
    if (draft.patch.zoneKey === null && draft.patch.newZone === null) throw new Error("Choose an existing zone or name a new one before submitting.");
    if (draft.patch.newZone !== null && (!draft.patch.newZone.key.trim() || !draft.patch.newZone.displayName.trim())) throw new Error("Name the new zone before submitting.");
    return;
  }
  if (draft.patch.rows.length === 0) throw new Error("There are no rows to save as the format.");
}

export async function queueTechnicianLocationProposal(draft: TechnicianLocationProposalDraft): Promise<TechnicianLocationProposalDraft> {
  if (currentWorkspaceUserId() === undefined || draft.status !== "Draft") throw new Error("This location proposal cannot be queued.");
  validateForQueue(draft);
  const payload: ProposalOutboxPayload = { id: draft.id, jobId: draft.jobId, customerId: draft.customerId, systemKey: draft.systemKey, patch: draft.patch };
  const at = new Date().toISOString();
  const key = draftKey(draft.jobId, draft.systemKey, draft.patch.locationKey);
  const operation: SyncOutboxItem = {
    operationId: draft.id, entityType: "technicianLocationProposal", entityId: draft.id,
    action: "create", payload, createdAt: at, attempts: 0, status: "Pending", activeKey: `technicianLocationProposal:create:${draft.id}`
  };
  await localDatabase.transaction("rw", localDatabase.drafts, localDatabase.syncOutbox, async () => {
    const existing = await localDatabase.syncOutbox.get(draft.id);
    if (existing) throw new Error("This location proposal is already queued.");
    await localDatabase.drafts.put({ id: key, entityType: "technicianLocationProposal", payload: { ...draft, status: "Pending" }, updatedAt: at });
    await localDatabase.syncOutbox.put(operation);
  });
  return { ...draft, status: "Pending" };
}

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
      const key = draftKey(payload.jobId, payload.systemKey, payload.patch.locationKey);
      const stored = await database.drafts.get(key);
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
      await database.syncOutbox.update(item.operationId, { status: "Syncing", attempts: item.attempts + 1, lastAttemptAt: at });
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
          await database.drafts.put({ id: key, entityType: "technicianLocationProposal", payload: { ...draft, status: "Synced", lastError: undefined }, updatedAt: done });
          await database.syncOutbox.update(item.operationId, { status: "Completed", activeKey: undefined, completedAt: done, lastError: undefined });
        });
      } catch (error) {
        if (currentWorkspaceUserId() !== actorUserId || localDatabase !== database) return;
        const message = error instanceof Error ? error.message : "Location proposal sync failed.";
        await database.transaction("rw", database.drafts, database.syncOutbox, async () => {
          const current = await database.syncOutbox.get(item.operationId);
          if (current?.status !== "Syncing") return;
          await database.drafts.put({ id: key, entityType: "technicianLocationProposal", payload: { ...draft, status: "Failed", lastError: message }, updatedAt: new Date().toISOString() });
          await database.syncOutbox.update(item.operationId, { status: "Failed", lastError: message });
        });
      }
    }
  })().finally(() => { syncing = undefined; });
  return syncing;
}
