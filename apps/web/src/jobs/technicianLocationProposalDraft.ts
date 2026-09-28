import { currentWorkspaceUserId, deviceDatabase, localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import { submitTechnicianLocationProposal } from "../referenceData/referenceDataApi";

/**
 * Technician-proposed customer zone/location breakdown, reviewed by a Supervisor/Admin before it
 * becomes the customer's real, versioned configuration. Modeled on `technicianCustomerDraft.ts` --
 * the closest existing "technician creates something offline that becomes real via server
 * confirmation" precedent -- but keyed per `(jobId, systemKey)` (not a single global draft) so a
 * technician can have at most one in-progress draft per job+system, and reopening the job resumes it.
 */

export type TechnicianLocationProposalZone = { key: string; displayName: string };
export type TechnicianLocationProposalLocation = { key: string; displayName: string; zoneKey: string; presetRowCount: number };

export type TechnicianLocationProposalDraft = {
  id: string;
  jobId: string;
  customerId: string;
  systemKey: string;
  zones: TechnicianLocationProposalZone[];
  locations: TechnicianLocationProposalLocation[];
  status: "Draft" | "Pending" | "Failed" | "Synced";
  lastError?: string;
};

type ProposalOutboxPayload = {
  id: string; jobId: string; customerId: string; systemKey: string;
  zones: Array<{ key: string; displayName: string; sortOrder: number }>;
  locations: Array<{ key: string; displayName: string; zoneId: string; presetRowCount: number }>;
};

function draftKey(jobId: string, systemKey: string) {
  return `technician-location-proposal:${jobId}:${systemKey}`;
}

export function newTechnicianLocationProposalDraft(jobId: string, customerId: string, systemKey: string): TechnicianLocationProposalDraft {
  return { id: crypto.randomUUID(), jobId, customerId, systemKey, zones: [], locations: [], status: "Draft" };
}

function proposalPayload(draft: TechnicianLocationProposalDraft): ProposalOutboxPayload {
  return {
    id: draft.id, jobId: draft.jobId, customerId: draft.customerId, systemKey: draft.systemKey,
    zones: draft.zones.map((zone, index) => ({ key: zone.key, displayName: zone.displayName.trim(), sortOrder: index + 1 })),
    locations: draft.locations.map((location) => ({
      key: location.key, displayName: location.displayName.trim(), zoneId: location.zoneKey, presetRowCount: location.presetRowCount
    }))
  };
}

function valid(value: unknown): value is TechnicianLocationProposalDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const draft = value as TechnicianLocationProposalDraft;
  return typeof draft.id === "string" && /^[0-9a-f-]{36}$/i.test(draft.id)
    && typeof draft.jobId === "string" && typeof draft.customerId === "string" && typeof draft.systemKey === "string"
    && Array.isArray(draft.zones) && draft.zones.every((zone) => zone && typeof zone.key === "string" && typeof zone.displayName === "string")
    && Array.isArray(draft.locations) && draft.locations.every((location) => location
      && typeof location.key === "string" && typeof location.displayName === "string"
      && typeof location.zoneKey === "string" && Number.isInteger(location.presetRowCount))
    && ["Draft", "Pending", "Failed", "Synced"].includes(draft.status);
}

export async function loadTechnicianLocationProposalDraft(
  jobId: string, systemKey: string, customerId: string
): Promise<TechnicianLocationProposalDraft> {
  const row = await localDatabase.drafts.get(draftKey(jobId, systemKey));
  if (!row) return newTechnicianLocationProposalDraft(jobId, customerId, systemKey);
  if (row.entityType !== "technicianLocationProposal" || !valid(row.payload)) {
    throw new Error("Saved location proposal draft is invalid; it has been preserved on this device.");
  }
  return row.payload;
}

export async function saveTechnicianLocationProposalDraft(draft: TechnicianLocationProposalDraft) {
  if (currentWorkspaceUserId() === undefined || !valid(draft) || draft.status !== "Draft") {
    throw new Error("Location proposal draft cannot be saved in this workspace.");
  }
  await localDatabase.drafts.put({ id: draftKey(draft.jobId, draft.systemKey), entityType: "technicianLocationProposal", payload: draft, updatedAt: new Date().toISOString() });
}

export async function queueTechnicianLocationProposal(draft: TechnicianLocationProposalDraft): Promise<TechnicianLocationProposalDraft> {
  if (currentWorkspaceUserId() === undefined || draft.status !== "Draft") throw new Error("This location proposal cannot be queued.");
  if (draft.zones.length === 0 || draft.zones.some((zone) => !zone.displayName.trim())) {
    throw new Error("Add at least one named zone before submitting.");
  }
  if (draft.locations.length === 0 || draft.locations.some((location) => !location.displayName.trim() || !location.zoneKey)) {
    throw new Error("Add at least one named location, each assigned to a zone, before submitting.");
  }
  const payload = proposalPayload(draft);
  const at = new Date().toISOString();
  const key = draftKey(draft.jobId, draft.systemKey);
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
      const key = draftKey(payload.jobId, payload.systemKey);
      const stored = await database.drafts.get(key);
      const draft = stored?.payload;
      if (!valid(draft) || draft.id !== item.entityId || (draft.status !== "Pending" && draft.status !== "Failed")
        || JSON.stringify(proposalPayload(draft)) !== JSON.stringify(payload)) {
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
          id: payload.id, jobId: payload.jobId, zones: payload.zones, locations: payload.locations
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
