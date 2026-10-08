import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  SUPERSEDED_DRAFT_PHOTO_GRACE_MS,
  SYNCED_PHOTO_RETENTION_MS,
  planAttachmentCleanup,
  type ParentView
} from "../src/attachments/attachmentRetention.js";

/**
 * I-07: Draft photos of an already-Synced parent and old Synced photos were never removed. The plan must delete
 * only what is provably final and keep everything a Failed/Conflict/Pending parent or an outbox item still needs.
 */
const now = Date.parse("2026-10-08T10:00:00.000Z");
const ago = (ms: number) => new Date(now - ms).toISOString();
const DAY = 24 * 60 * 60 * 1000;
const photo = (over: Record<string, unknown> = {}) => ({
  photoUuid: "p1", inspectionClientUuid: "r1", syncStatus: "Draft" as const, localUpdatedAt: ago(5 * DAY), ...over
});
const synced = (ageMs: number, extra: Partial<ParentView> = {}): ParentView => ({ syncStatus: "Synced", lastSyncedAt: ago(ageMs), localUpdatedAt: ago(ageMs), ...extra });
const plan = (p: ReturnType<typeof photo>, parents: ParentView[] | undefined, active: string[] = []) =>
  planAttachmentCleanup([p], new Map(parents ? [["r1", parents]] : []), new Set(active), now)[0];

test("a stale Draft photo of a Synced parent is deleted only after the 24 h grace", () => {
  assert.deepEqual(plan(photo(), [synced(2 * DAY)]), { photoUuid: "p1", action: "delete", reason: "superseded-draft" });
  assert.deepEqual(plan(photo({ localUpdatedAt: ago(3 * DAY) }), [synced(SUPERSEDED_DRAFT_PHOTO_GRACE_MS)]), { photoUuid: "p1", action: "delete", reason: "superseded-draft" });
  assert.deepEqual(plan(photo({ localUpdatedAt: ago(3 * DAY) }), [synced(SUPERSEDED_DRAFT_PHOTO_GRACE_MS - 60_000)]), { photoUuid: "p1", action: "keep", reason: "draft-parent-synced-recent" });
  assert.equal(plan(photo({ localUpdatedAt: ago(60_000) }), [synced(3 * DAY)]).action, "keep", "a photo touched a minute ago is not stale");
});

test("a Synced photo of a Synced parent is deleted only after 30 days", () => {
  const photoSynced = (ageMs: number) => photo({ syncStatus: "Synced", lastSyncedAt: ago(ageMs), localUpdatedAt: ago(ageMs) });
  assert.deepEqual(plan(photoSynced(SYNCED_PHOTO_RETENTION_MS), [synced(SYNCED_PHOTO_RETENTION_MS)]), { photoUuid: "p1", action: "delete", reason: "synced-retention-expired" });
  assert.deepEqual(plan(photoSynced(29 * DAY), [synced(29 * DAY)]), { photoUuid: "p1", action: "keep", reason: "within-window" });
  assert.equal(plan(photoSynced(90 * DAY), [synced(2 * DAY)]).action, "keep", "the newer of the two times governs");
});

test("never delete for a Failed / Conflict / Pending / Syncing / Draft parent (it may return to correction Draft)", () => {
  for (const status of ["Failed", "Conflict", "Pending", "Syncing", "Draft", "weird"]) {
    for (const p of [photo(), photo({ syncStatus: "Synced", lastSyncedAt: ago(400 * DAY) })]) {
      assert.deepEqual(plan(p, [{ syncStatus: status, lastSyncedAt: ago(400 * DAY), localUpdatedAt: ago(400 * DAY) }]), { photoUuid: "p1", action: "keep", reason: "parent-not-synced" }, status);
    }
  }
});

test("a parentless photo, or a parent seen twice with one not Synced, is kept", () => {
  assert.equal(plan(photo(), undefined).reason, "no-parent");
  assert.equal(plan(photo(), []).reason, "no-parent");
  assert.equal(plan(photo(), [synced(9 * DAY), { syncStatus: "Failed" }]).reason, "parent-not-synced");
});

test("any non-Completed outbox item for the photo or its parent keeps the photo", () => {
  assert.equal(plan(photo(), [synced(9 * DAY)], ["p1"]).reason, "active-outbox");
  assert.equal(plan(photo(), [synced(9 * DAY)], ["r1"]).reason, "active-outbox");
  assert.equal(plan(photo(), [synced(9 * DAY)], ["other"]).action, "delete");
});

test("in-flight photo states are never deleted", () => {
  for (const syncStatus of ["Pending", "Uploading", "Failed", "Conflict"] as const) {
    assert.equal(plan(photo({ syncStatus }), [synced(400 * DAY)]).reason, "photo-in-flight", syncStatus);
  }
});

test("unreadable times fail closed", () => {
  assert.equal(plan(photo(), [{ syncStatus: "Synced", lastSyncedAt: "garbage" }]).reason, "unreadable-time");
  assert.equal(plan(photo({ localUpdatedAt: "garbage" }), [synced(9 * DAY)]).reason, "unreadable-time");
  assert.equal(plan(photo({ syncStatus: "Synced", lastSyncedAt: "garbage", localUpdatedAt: ago(99 * DAY) }), [synced(99 * DAY)]).reason, "unreadable-time");
  assert.equal(plan(photo(), [{ syncStatus: "Synced" }]).reason, "unreadable-time", "a Synced parent with no time at all is kept");
});

test("wiring: the app runs the cleanup once the workspace is ready, not on the sync path", () => {
  const app = readFileSync(join(import.meta.dirname, "../src/App.tsx"), "utf8");
  assert.match(app, /runAttachmentCleanupIfDue\(userId\)/);
  const retention = readFileSync(join(import.meta.dirname, "../src/attachments/attachmentRetention.ts"), "utf8");
  assert.match(retention, /db\.transaction\("rw"/, "decisions and deletes share one transaction");
  assert.doesNotMatch(retention, /fetch\(|navigator\.onLine/, "purely local; no network dependency");
});
