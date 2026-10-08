/**
 * I-07: local photo retention. Photos are only ever added to IndexedDB; this module removes the ones that can
 * no longer matter. It is deliberately conservative: a photo is deleted only when its parent record has been
 * confirmed Synced by the server for a grace period (or retention window) AND nothing in the outbox refers to
 * it. A Failed/Conflict parent can return to a correction Draft that reuses its evidence, so those are never
 * touched. Anything unreadable fails closed (kept).
 */
import { currentWorkspaceUserId, localDatabase } from "../db/localDatabase";
import type { InspectionAttachmentRecord } from "./attachmentTypes";

/** A never-uploaded Draft photo of an already-Synced parent is stale evidence (not in the accepted manifest). */
export const SUPERSEDED_DRAFT_PHOTO_GRACE_MS = 24 * 60 * 60 * 1000;
/** A Synced photo is on the server (exact upload confirmed); the local copy is kept this long after the parent synced. */
export const SYNCED_PHOTO_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const ATTACHMENT_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_STATE_KEY = "maintenance:attachment-cleanup";

type PhotoLike = Pick<InspectionAttachmentRecord, "photoUuid" | "inspectionClientUuid" | "syncStatus" | "lastSyncedAt" | "localUpdatedAt">;
/** The status/time view of every parent row found for one inspectionClientUuid (normally exactly one). */
export type ParentView = { syncStatus: string; lastSyncedAt?: string; localUpdatedAt?: string };

export type PhotoKeepReason =
  | "no-parent" | "parent-not-synced" | "active-outbox" | "photo-in-flight" | "within-window" | "unreadable-time" | "draft-parent-synced-recent";
export type PhotoCleanupDecision =
  | { photoUuid: string; action: "delete"; reason: "superseded-draft" | "synced-retention-expired" }
  | { photoUuid: string; action: "keep"; reason: PhotoKeepReason };

function latestMs(...values: Array<string | undefined>) {
  let latest = Number.NaN;
  for (const value of values) {
    if (value === undefined) continue;
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) return Number.NaN; // a malformed time makes the whole decision unreadable
    if (Number.isNaN(latest) || ms > latest) latest = ms;
  }
  return latest;
}

/** Pure decision function. `parents` maps inspectionClientUuid -> every parent row seen for it. */
export function planAttachmentCleanup(
  photos: ReadonlyArray<PhotoLike>,
  parents: ReadonlyMap<string, ReadonlyArray<ParentView>>,
  activeOutboxEntityIds: ReadonlySet<string>,
  nowMs: number
): PhotoCleanupDecision[] {
  return photos.map((photo): PhotoCleanupDecision => {
    const keep = (reason: PhotoKeepReason): PhotoCleanupDecision => ({ photoUuid: photo.photoUuid, action: "keep", reason });
    const found = parents.get(photo.inspectionClientUuid);
    if (!found || found.length === 0) return keep("no-parent");
    if (found.some((parent) => parent.syncStatus !== "Synced")) return keep("parent-not-synced");
    if (activeOutboxEntityIds.has(photo.photoUuid) || activeOutboxEntityIds.has(photo.inspectionClientUuid)) return keep("active-outbox");
    if (photo.syncStatus !== "Draft" && photo.syncStatus !== "Synced") return keep("photo-in-flight");

    // Conservative clock: the latest timestamp that could mean "this became final".
    const parentMs = latestMs(...found.flatMap((parent) => [parent.lastSyncedAt, parent.localUpdatedAt]));
    if (Number.isNaN(parentMs)) return keep("unreadable-time");
    if (photo.syncStatus === "Draft") {
      const draftMs = latestMs(photo.localUpdatedAt);
      if (Number.isNaN(draftMs)) return keep("unreadable-time");
      return nowMs - Math.max(parentMs, draftMs) >= SUPERSEDED_DRAFT_PHOTO_GRACE_MS
        ? { photoUuid: photo.photoUuid, action: "delete", reason: "superseded-draft" }
        : keep("draft-parent-synced-recent");
    }
    const syncedMs = latestMs(photo.lastSyncedAt, photo.localUpdatedAt);
    if (Number.isNaN(syncedMs)) return keep("unreadable-time");
    return nowMs - Math.max(parentMs, syncedMs) >= SYNCED_PHOTO_RETENTION_MS
      ? { photoUuid: photo.photoUuid, action: "delete", reason: "synced-retention-expired" }
      : keep("within-window");
  });
}

export type AttachmentCleanupResult = { deleted: number; reclaimedBytes: number; kept: Partial<Record<PhotoKeepReason, number>> };

/**
 * Runs the plan and applies it in ONE read-write transaction, so the parent status, outbox and photo rows used for
 * the decision are the ones deleted against (a concurrent submit/sync cannot slip in between).
 * `canCommit` lets the caller abort when the signed-in workspace changed.
 */
export async function cleanupLocalAttachments(options: { database?: typeof localDatabase; now?: Date; canCommit?: () => boolean } = {}): Promise<AttachmentCleanupResult> {
  const db = options.database ?? localDatabase;
  const nowMs = (options.now ?? new Date()).getTime();
  return db.transaction("rw",
    [db.inspectionAttachments, db.inspectionRecords, db.masterSystemInspections, db.masterSystemFormInstances, db.syncOutbox],
    async () => {
      if (options.canCommit && !options.canCommit()) throw new Error("ATTACHMENT_CLEANUP_SUPERSEDED");
      const photos = await db.inspectionAttachments.where("syncStatus").anyOf("Draft", "Synced").toArray();
      const result: AttachmentCleanupResult = { deleted: 0, reclaimedBytes: 0, kept: {} };
      if (photos.length === 0) return result;
      const parentIds = [...new Set(photos.map((photo) => photo.inspectionClientUuid))];
      const [records, masters, forms, outbox] = await Promise.all([
        db.inspectionRecords.bulkGet(parentIds), db.masterSystemInspections.bulkGet(parentIds),
        db.masterSystemFormInstances.bulkGet(parentIds), db.syncOutbox.where("status").notEqual("Completed").toArray()
      ]);
      const parents = new Map<string, ParentView[]>();
      parentIds.forEach((id, index) => {
        const views = [records[index], masters[index], forms[index]]
          .filter((row): row is NonNullable<typeof row> => row !== undefined)
          .map((row) => ({ syncStatus: String((row as { syncStatus?: unknown }).syncStatus), lastSyncedAt: (row as { lastSyncedAt?: string }).lastSyncedAt, localUpdatedAt: (row as { localUpdatedAt?: string }).localUpdatedAt }));
        parents.set(id, views);
      });
      const active = new Set(outbox.map((item) => item.entityId));
      const decisions = planAttachmentCleanup(photos, parents, active, nowMs);
      const sizes = new Map(photos.map((photo) => [photo.photoUuid, photo.blob?.size ?? photo.sizeBytes ?? 0]));
      const remove: string[] = [];
      for (const decision of decisions) {
        if (decision.action === "delete") { remove.push(decision.photoUuid); result.reclaimedBytes += sizes.get(decision.photoUuid) ?? 0; }
        else result.kept[decision.reason] = (result.kept[decision.reason] ?? 0) + 1;
      }
      if (remove.length > 0) await db.inspectionAttachments.bulkDelete(remove);
      result.deleted = remove.length;
      return result;
    });
}

/** App entry point: at most once per ATTACHMENT_CLEANUP_INTERVAL_MS per workspace; never throws. */
export async function runAttachmentCleanupIfDue(expectedUserId: number, now = new Date()): Promise<AttachmentCleanupResult | "skipped"> {
  try {
    const db = localDatabase;
    const canCommit = () => db === localDatabase && currentWorkspaceUserId() === expectedUserId;
    if (!canCommit()) return "skipped";
    const state = await db.referenceData.get(CLEANUP_STATE_KEY);
    const last = typeof state?.payload === "string" ? Date.parse(state.payload) : Number.NaN;
    if (!Number.isNaN(last) && now.getTime() - last < ATTACHMENT_CLEANUP_INTERVAL_MS) return "skipped";
    const result = await cleanupLocalAttachments({ database: db, now, canCommit });
    const at = now.toISOString();
    await db.referenceData.put({ key: CLEANUP_STATE_KEY, payload: at, version: "1", fetchedAt: at, expiresAt: at });
    return result;
  } catch {
    return "skipped";
  }
}
