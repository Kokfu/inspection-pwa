import { currentWorkspaceUserId, deviceDatabase, localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import { createTechnicianCustomer } from "../referenceData/referenceDataApi";
import type { ReferenceCustomer } from "../referenceData/referenceDataTypes";

const draftKey = "technician-add-customer";
export type TechnicianCustomerDraft = {
  requestId: string;
  displayName: string;
  siteDisplayName: string;
  systemKeys: string[];
  contactPhone: string;
  contactPerson: string;
  fax: string;
  contractNumber: string;
  serviceFrequency: string;
  siteAddress: string;
  status: "Draft" | "Pending" | "Failed" | "Synced";
  lastError?: string;
  createdCustomer?: ReferenceCustomer;
};

export function newTechnicianCustomerDraft(): TechnicianCustomerDraft {
  return { requestId: crypto.randomUUID(), displayName: "", siteDisplayName: "Primary Service Site", systemKeys: [],
    contactPhone: "", contactPerson: "", fax: "", contractNumber: "", serviceFrequency: "", siteAddress: "", status: "Draft" };
}

function customerPayload(draft: TechnicianCustomerDraft) {
  return {
    requestId: draft.requestId, displayName: draft.displayName, siteDisplayName: draft.siteDisplayName,
    systemKeys: draft.systemKeys,
    ...(draft.contactPhone.trim() ? { contactPhone: draft.contactPhone.trim() } : {}),
    ...(draft.contactPerson.trim() ? { contactPerson: draft.contactPerson.trim() } : {}),
    ...(draft.fax.trim() ? { fax: draft.fax.trim() } : {}),
    ...(draft.contractNumber.trim() ? { contractNumber: draft.contractNumber.trim() } : {}),
    ...(draft.serviceFrequency ? { serviceFrequency: draft.serviceFrequency } : {}),
    ...(draft.siteAddress.trim() ? { siteAddress: draft.siteAddress.trim() } : {})
  };
}

function valid(value: unknown): value is TechnicianCustomerDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const draft = value as TechnicianCustomerDraft;
  return typeof draft.requestId === "string" && /^[0-9a-f-]{36}$/i.test(draft.requestId)
    && typeof draft.displayName === "string" && typeof draft.siteDisplayName === "string"
    && Array.isArray(draft.systemKeys) && draft.systemKeys.every((key) => typeof key === "string")
    && [draft.contactPhone, draft.contactPerson, draft.fax, draft.contractNumber, draft.serviceFrequency, draft.siteAddress].every((field) => typeof field === "string")
    && ["Draft", "Pending", "Failed", "Synced"].includes(draft.status)
    && (draft.status !== "Synced" || typeof draft.createdCustomer?.id === "string");
}

export async function loadTechnicianCustomerDraft(): Promise<TechnicianCustomerDraft> {
  const row = await localDatabase.drafts.get(draftKey);
  if (!row) return newTechnicianCustomerDraft();
  if (row.entityType !== "technicianCustomer" || !valid(row.payload)) throw new Error("Saved customer draft is invalid; it has been preserved on this device.");
  return row.payload;
}

export async function saveTechnicianCustomerDraft(draft: TechnicianCustomerDraft) {
  if (currentWorkspaceUserId() === undefined || !valid(draft) || draft.status !== "Draft") throw new Error("Customer draft cannot be saved in this workspace.");
  await localDatabase.drafts.put({ id: draftKey, entityType: "technicianCustomer", payload: draft, updatedAt: new Date().toISOString() });
}

export async function queueTechnicianCustomer(draft: TechnicianCustomerDraft) {
  if (currentWorkspaceUserId() === undefined || draft.status !== "Draft"
    || !draft.displayName.trim() || !draft.siteDisplayName.trim() || !draft.systemKeys.length) throw new Error("Complete the customer, site, and service format first.");
  const payload = customerPayload(draft);
  const at = new Date().toISOString();
  const operation: SyncOutboxItem = { operationId: draft.requestId, entityType: "technicianCustomer", entityId: draft.requestId,
    action: "create", payload, createdAt: at, attempts: 0, status: "Pending", activeKey: `technicianCustomer:create:${draft.requestId}` };
  await localDatabase.transaction("rw", localDatabase.drafts, localDatabase.syncOutbox, async () => {
    const existing = await localDatabase.syncOutbox.get(draft.requestId);
    if (existing) throw new Error("This customer request is already queued; retry its original details.");
    await localDatabase.drafts.put({ id: draftKey, entityType: "technicianCustomer", payload: { ...draft, status: "Pending" }, updatedAt: at });
    await localDatabase.syncOutbox.put(operation);
  });
  return { ...draft, status: "Pending" } as TechnicianCustomerDraft;
}

let syncing: Promise<void> | undefined;
/** Resolves when no customer sync is running (the engine must not recover "Syncing" items under a live sync). */
export function technicianCustomerSyncIdle(): Promise<void> { return (syncing ?? Promise.resolve()).catch(() => undefined); }
export function syncPendingTechnicianCustomers(actorUserId: number): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    if (currentWorkspaceUserId() !== actorUserId) return;
    const database = localDatabase;
    const identity = await deviceDatabase.authState.get("device-auth");
    if (identity?.userId !== actorUserId || identity.explicitLogout || identity.serverLogoutPending) return;
    const rows = (await database.syncOutbox.where("entityType").equals("technicianCustomer").toArray())
      .filter((item) => item.status === "Pending" || item.status === "Failed");
    for (const item of rows) {
      if (currentWorkspaceUserId() !== actorUserId || localDatabase !== database) return;
      const stored = await database.drafts.get(draftKey);
      const draft = stored?.payload;
      if (!valid(draft)) {
        await database.syncOutbox.update(item.operationId, { status: "Failed", lastError: "Saved customer draft is invalid" });
        continue;
      }
      if (draft.requestId !== item.entityId || (draft.status !== "Pending" && draft.status !== "Failed")
        || JSON.stringify(customerPayload(draft)) !== JSON.stringify(item.payload)) {
        const message = "Customer draft and frozen request do not match";
        await database.transaction("rw", database.drafts, database.syncOutbox, async () => {
          if (draft.requestId === item.entityId) await database.drafts.put({ id: draftKey, entityType: "technicianCustomer",
            payload: { ...draft, status: "Failed", lastError: message }, updatedAt: new Date().toISOString() });
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
        const customer = await createTechnicianCustomer(item.payload as ReturnType<typeof customerPayload>, actorUserId);
        const done = new Date().toISOString();
        if (currentWorkspaceUserId() !== actorUserId || localDatabase !== database) return;
        await database.transaction("rw", database.drafts, database.syncOutbox, async () => {
          const current = await database.syncOutbox.get(item.operationId);
          if (current?.status !== "Syncing" || JSON.stringify(current.payload) !== JSON.stringify(item.payload)) return;
          await database.drafts.put({ id: draftKey, entityType: "technicianCustomer",
            payload: { ...draft, status: "Synced", createdCustomer: customer, lastError: undefined }, updatedAt: done });
          await database.syncOutbox.update(item.operationId, { status: "Completed", activeKey: undefined, completedAt: done, lastError: undefined });
        });
      } catch (error) {
        if (currentWorkspaceUserId() !== actorUserId || localDatabase !== database) return;
        const message = error instanceof Error ? error.message : "Customer sync failed.";
        await database.transaction("rw", database.drafts, database.syncOutbox, async () => {
          const current = await database.syncOutbox.get(item.operationId);
          if (current?.status !== "Syncing") return;
          await database.drafts.put({ id: draftKey, entityType: "technicianCustomer",
            payload: { ...draft, status: "Failed", lastError: message }, updatedAt: new Date().toISOString() });
          await database.syncOutbox.update(item.operationId, { status: "Failed", lastError: message });
        });
      }
    }
  })().finally(() => { syncing = undefined; });
  return syncing;
}
