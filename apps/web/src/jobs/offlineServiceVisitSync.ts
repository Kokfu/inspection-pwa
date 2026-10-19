import { currentWorkspaceUserId, localDatabase, type SyncOutboxItem } from "../db/localDatabase";
import { cacheCanonicalInspectionJob } from "../referenceData/referenceDataCache";
import { AUTO_SYNC_FAILED_BACKOFF_MS } from "../sync/autoSync";
import { refusalReason } from "./offlineServiceVisitStore";
import {
  isOfflineServiceVisitCreateRequest,
  parseOfflineServiceVisitCreateResponse,
  type LocalOfflineServiceVisit,
  type OfflineServiceVisitCreateRequest,
  type OfflineServiceVisitCreateResponse
} from "./offlineServiceVisitTypes";

const createRequestTimeoutMs = 30_000;
/** Definite answers that no retry can change on its own; the technician sees "Needs attention". */
const conflictCodes = new Set(["IDEMPOTENCY_MISMATCH", "JOB_NOT_FOUND"]);

export type OfflineVisitSyncContext = {
  actorUserId: number | undefined;
  assertIdentity: () => Promise<void>;
  headers: Record<string, string>;
};

const isWaiting = (item: SyncOutboxItem) => item.status === "Pending" || item.status === "Failed";

/**
 * A refused create is not re-sent more often than the usual Failed backoff: its held forms keep the auto-sync timer
 * firing, which would otherwise repeat the same refusal every minute. The card's Retry button re-queues it as Pending
 * and so is never delayed.
 */
function isCoolingDown(item: SyncOutboxItem, now: number) {
  if (item.status !== "Failed" || !item.lastAttemptAt) return false;
  const last = Date.parse(item.lastAttemptAt);
  return !Number.isNaN(last) && now - last >= 0 && now - last < AUTO_SYNC_FAILED_BACKOFF_MS;
}

/** The echo must name the exact UUID and every value the device sent; anything else is not a confirmation. */
export function receiptConfirmsRequest(receipt: OfflineServiceVisitCreateResponse, request: OfflineServiceVisitCreateRequest) {
  return receipt.clientJobUuid === request.clientJobUuid && receipt.jobId === request.clientJobUuid
    && receipt.configurationRevisionId === request.configurationRevisionId
    && Date.parse(receipt.deviceCreatedAt) === Date.parse(request.deviceCreatedAt)
    && receipt.visitDate === request.visitDate && receipt.arrivalTime === request.arrivalTime;
}

/**
 * A crash or force-close mid-request leaves the create "Syncing". The server is idempotent on the UUID, so the
 * safe recovery is to queue the same operation again. Runs before the generic recovery, which would mark it Failed.
 */
export async function recoverInterruptedOfflineVisits() {
  const syncing = (await localDatabase.syncOutbox.where("status").equals("Syncing").toArray())
    .filter((item) => item.entityType === "offlineServiceVisit");
  const visits = await localDatabase.offlineServiceVisits.where("syncStatus").equals("Syncing").toArray();
  if (syncing.length === 0 && visits.length === 0) return 0;
  await localDatabase.transaction("rw", localDatabase.offlineServiceVisits, localDatabase.syncOutbox, async () => {
    for (const item of syncing) await localDatabase.syncOutbox.update(item.operationId, { status: "Pending", lastError: undefined });
    for (const visit of visits) {
      await localDatabase.offlineServiceVisits.update(visit.clientJobUuid, { syncStatus: "Pending", lastSyncError: undefined, lastSyncErrorCode: undefined });
    }
  });
  return syncing.length + visits.length;
}

async function readBody(response: Response): Promise<{ error?: unknown; message?: unknown } & Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

/** Send every queued visit-create, oldest first. Forms and photos of a visit are released only by its confirmation. */
export async function syncPendingOfflineServiceVisits(context: OfflineVisitSyncContext) {
  const items = (await localDatabase.syncOutbox.where("entityType").equals("offlineServiceVisit").toArray())
    .filter((item) => isWaiting(item) && !isCoolingDown(item, Date.now())).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  let confirmed = 0; let failed = 0;
  for (const item of items) {
    const claimed = await localDatabase.transaction("rw", localDatabase.offlineServiceVisits, localDatabase.syncOutbox, async () => {
      const current = await localDatabase.syncOutbox.get(item.operationId);
      const visit = await localDatabase.offlineServiceVisits.get(item.entityId);
      if (!current || !isWaiting(current)) return undefined;
      if (!visit || visit.syncStatus === "Synced" || !isOfflineServiceVisitCreateRequest(current.payload)
        || visit.clientJobUuid !== current.entityId || current.payload.clientJobUuid !== current.entityId
        || JSON.stringify(visit.request) !== JSON.stringify(current.payload)) {
        await localDatabase.syncOutbox.update(current.operationId, { status: "Failed", lastError: "Local visit does not match its queued create" });
        if (visit && visit.syncStatus !== "Synced") {
          await localDatabase.offlineServiceVisits.update(visit.clientJobUuid, { syncStatus: "Failed", lastSyncError: "Local visit does not match its queued create" });
        }
        failed += 1;
        return undefined;
      }
      const at = new Date().toISOString();
      await localDatabase.syncOutbox.update(current.operationId, { status: "Syncing", attempts: current.attempts + 1, lastAttemptAt: at, lastError: undefined });
      await localDatabase.offlineServiceVisits.update(visit.clientJobUuid, { syncStatus: "Syncing", lastSyncError: undefined, lastSyncErrorCode: undefined, localUpdatedAt: at });
      return { operationId: current.operationId, visit, request: current.payload as OfflineServiceVisitCreateRequest };
    });
    if (!claimed) continue;
    const { operationId, visit, request } = claimed;

    // The queued operation stays Pending (never Failed) when nothing was learned about the server's answer.
    const retryLater = (message: string) => finish(operationId, visit, { kind: "retry", message });
    let response: Response;
    try {
      await context.assertIdentity();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), createRequestTimeoutMs);
      try {
        response = await fetch("/api/inspection-jobs/service-visits", {
          method: "POST", credentials: "same-origin", signal: controller.signal,
          headers: { "Content-Type": "application/json", ...context.headers }, body: JSON.stringify(request)
        });
      } finally { clearTimeout(timer); }
    } catch (error) {
      const identity = error instanceof Error && /Authentication changed/.test(error.message);
      await retryLater(identity ? error.message : "Could not reach the server; this visit will be sent again.");
      continue;
    }
    const body = await readBody(response);
    if (response.status === 401) { await retryLater("Sign in again to send this visit."); continue; }
    if (response.status >= 500 || response.status === 408 || response.status === 429) {
      await retryLater(`The server could not take this visit yet (HTTP ${response.status}); it will be sent again.`); continue;
    }
    if (!response.ok) {
      const code = typeof body.error === "string" ? body.error : undefined;
      const outcome = await finish(operationId, visit, { kind: "refused", code, reason: refusalReason(code, typeof body.message === "string" ? body.message : undefined),
        conflict: code !== undefined && conflictCodes.has(code) });
      if (outcome) failed += 1;
      continue;
    }
    let receipt: OfflineServiceVisitCreateResponse | undefined;
    try { receipt = parseOfflineServiceVisitCreateResponse(body); } catch { receipt = undefined; }
    if (!receipt || !receiptConfirmsRequest(receipt, request)) {
      const outcome = await finish(operationId, visit, { kind: "refused", code: undefined, reason: "The server did not confirm this visit's exact ID.", conflict: false });
      if (outcome) failed += 1;
      continue;
    }
    if (await finish(operationId, visit, { kind: "confirmed", receipt })) confirmed += 1;
  }
  return { confirmed, failed, attempted: items.length };
}

type Outcome =
  | { kind: "confirmed"; receipt: OfflineServiceVisitCreateResponse }
  | { kind: "refused"; code: string | undefined; reason: string; conflict: boolean }
  | { kind: "retry"; message: string };

/** Applies an answer only to the exact operation that was sent; a visit changed or removed meanwhile is left alone. */
async function finish(operationId: string, sent: LocalOfflineServiceVisit, outcome: Outcome) {
  if (outcome.kind === "confirmed") {
    const userId = currentWorkspaceUserId();
    // Cache first: if the app dies before the transaction below, the replay of the same UUID completes it.
    const syncedJob = { ...sent.job, reference: outcome.receipt.visitNumber };
    if (userId !== undefined) await cacheCanonicalInspectionJob(userId, syncedJob).catch(() => undefined);
  }
  return localDatabase.transaction("rw", localDatabase.offlineServiceVisits, localDatabase.syncOutbox, async () => {
    const current = await localDatabase.syncOutbox.get(operationId);
    const visit = await localDatabase.offlineServiceVisits.get(sent.clientJobUuid);
    if (!current || current.status !== "Syncing" || !visit || visit.syncStatus !== "Syncing"
      || JSON.stringify(visit.request) !== JSON.stringify(sent.request)) return false;
    const at = new Date().toISOString();
    if (outcome.kind === "confirmed") {
      await localDatabase.offlineServiceVisits.update(visit.clientJobUuid, {
        syncStatus: "Synced", receipt: outcome.receipt, lastSyncedAt: at, localUpdatedAt: at, lastSyncError: undefined, lastSyncErrorCode: undefined,
        job: { ...visit.job, reference: outcome.receipt.visitNumber }
      });
      await localDatabase.syncOutbox.update(operationId, { status: "Completed", activeKey: undefined, completedAt: at, lastError: undefined });
    } else if (outcome.kind === "refused") {
      await localDatabase.offlineServiceVisits.update(visit.clientJobUuid, {
        syncStatus: outcome.conflict ? "Conflict" : "Failed", lastSyncError: outcome.reason, lastSyncErrorCode: outcome.code, localUpdatedAt: at
      });
      await localDatabase.syncOutbox.update(operationId, { status: "Failed", lastError: outcome.reason });
    } else {
      await localDatabase.offlineServiceVisits.update(visit.clientJobUuid, { syncStatus: "Pending", lastSyncError: outcome.message, localUpdatedAt: at });
      await localDatabase.syncOutbox.update(operationId, { status: "Pending", lastError: outcome.message });
    }
    return true;
  });
}
