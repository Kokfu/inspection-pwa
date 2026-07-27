# Automatic Sprinkler Photo Evidence Test

## Repeatable Harnesses

With the Vite development server running, execute:

- `/tests/automatic-sprinkler-photo-evidence.html`
- `/tests/dexie-v8-v9-upgrade.html`
- `/tests/automatic-sprinkler-concurrent-initialization.html`
- `/tests/auth-offline-restoration.html`
- `/tests/server-sprinkler-resolution.html`

These harnesses are local test utilities. They do not replace production-build
PWA, physical-camera, permission, force-close, or real offline testing.

## Preparation

1. Build and start the production Docker stack.
2. Sign in and refresh jobs/reference data.
3. Open `Demo Automatic Sprinkler Photo Evidence Job`.
4. Confirm the six exact PSI values each show photo controls.
5. Confirm historical sprinkler, Hose Reel, and CO2 forms show no photo controls.

## Camera And Processing

1. Take a rear-camera photo and confirm permission/cancellation behavior.
2. Deny permission and confirm a clear gallery fallback remains.
3. Choose a gallery image and confirm `Gallery attachment`.
4. Confirm camera tracks stop after capture, cancel, navigation, and unmount.
5. Verify the processed Blob is JPEG, at most 1600 px per edge and 2 MB.
6. Verify a rotated source displays correctly and EXIF/GPS is absent.
7. Verify corrupt, oversized, and excessive-dimension images fail without replacing the prior photo.
8. Start processing one image, choose a newer image or navigate away, and confirm the obsolete operation does not write.
9. Simulate wrapped quota errors and confirm the existing photo remains with actionable storage guidance.

## Offline Draft

1. Go offline and attach camera and gallery photos to different PSI fields.
2. Confirm thumbnail and full-size previews remain readable.
3. Save Draft, reload, and force-close/reopen offline.
4. Confirm the same photo UUIDs and Blobs remain.
5. Remove and replace while Draft.
6. Confirm one record per inspection/field under concurrent tabs.
7. Confirm simply opening the form creates no attachment or outbox item.

## Submit And Sync

1. Complete all required sprinkler values and Submit Local offline.
2. Confirm one parent and one attachment outbox item per photo.
3. Confirm photos become immutable while previews remain.
4. Reload offline and confirm all Pending evidence remains.
5. Reconnect and sync.
6. Confirm parent acceptance precedes multipart uploads.
7. Interrupt an upload and verify stale Uploading recovery retains the Blob.
8. Confirm partial photo failure does not stop other photos.
9. Confirm progress stays Pending Evidence or Needs Attention until every submitted photo is confirmed.
10. Confirm no-photo optional V1 submission completes after parent sync.
11. Reject a no-photo parent, return it to correction Draft, edit and resubmit with the same parent outbox operation.
12. Reject a photo parent before acceptance, correct responses, and confirm add/remove/replace are rejected while the original photo UUID and outbox are reused.
13. Keep a pre-submission Draft open in another tab, return the failed parent
    to correction Draft, then save responses from the stale tab. Confirm the
    frozen submission timestamp and attachment manifest remain unchanged.
14. Repeat the stale-tab save while the live parent is Pending, Syncing, and
    Synced. Confirm each save is rejected without a lifecycle downgrade.

## Camera Lifecycle Harness

1. Confirm a capture attempted before video dimensions are ready stops every
   acquired track.
2. Confirm `video.play()` rejection stops every acquired track.
3. Cancel initialization before `getUserMedia()` resolves and confirm the late
   stream is stopped without being installed.
4. Start two camera initializations and confirm only the newest stream remains
   active.

## Server And Security

1. Verify PostgreSQL metadata and the normalized file under the uploads bind mount.
2. Verify source and stored hashes, size, dimensions, source, actor, and field path.
3. Exact replay must be duplicate success.
4. Changed content under the same UUID must return `IDEMPOTENCY_CONFLICT`.
5. A different UUID for an occupied field must return `ATTACHMENT_FIELD_OCCUPIED`.
6. Unaccepted parent must return `PARENT_NOT_SYNCED`.
7. Historical or disallowed fields must return `EVIDENCE_NOT_ALLOWED`.
8. Unauthenticated upload, metadata listing, and content viewing must return 401.
9. MIME spoofing, SVG, malformed images, excessive pixels, and malicious filenames must not be accepted.
10. Authenticated content must return JPEG, `nosniff`, inline disposition, and private cache headers.
11. Missing, truncated, and wrong-hash canonical files must return `ATTACHMENT_STORAGE_INTEGRITY_ERROR` on exact replay.
12. Reconciliation must report missing, wrong-size, wrong-hash, orphan, and stale temporary files without deleting them.
13. Duplicate fields, excess parts, and oversized total multipart bodies must be rejected and temporary files cleaned.

## Migration And Crash Checks

1. Confirm migrations 001-006 are byte-for-byte unchanged.
2. Apply migration 007 on an empty disposable database and run it twice.
3. Confirm historical all-NULL policy rows remain valid and accepted policy fields cannot be changed or cleared.
4. On the pre-release development database, apply only the corrected policy function/trigger in a reviewed transaction.
5. Simulate failure before rename and confirm temporary cleanup.
6. Simulate failure after canonical rename and confirm an orphan remains detectable.
7. Simulate an ambiguous commit acknowledgement and confirm a committed row's canonical file is never deleted.
8. Build the final API image from the committed lockfile using `npm ci`, then exercise Sharp and multipart upload.

## Regression

Repeat one Hose Reel flow, one CO2 location flow, one historical no-photo
sprinkler flow, authentication/offline-unverified startup, cached job
navigation, interrupted JSON sync recovery, and server inspection listing.

## Cross-Device Server Detail

1. Sync a photo-enabled Automatic Sprinkler inspection from the phone.
2. On a second authenticated browser with empty IndexedDB, open
   `#/sprinkler-form/<client-uuid>`.
3. Confirm Completed, the exact client UUID, all responses and remarks,
   Comments, photo source, capture time, thumbnail, and full image.
4. Confirm no local inspection or attachment Blob is created.
5. Confirm the same route while offline reports that the inspection is not
   cached on this device.
6. Confirm an unknown UUID returns a controlled unavailable/not-found view and
   does not initialize a Draft.

## Installed-PWA Offline Restart

1. Log in online and confirm the status is Verified.
2. Open the cached photo-enabled job, attach a photo, and Save Draft.
3. Enable airplane mode and force-stop the installed PWA/browser.
4. Reopen while offline and confirm
   `Offline - identity not reverified`.
5. Confirm the cached job, Draft, local photo, and preview remain available.
6. Confirm Refresh Jobs, Sync Pending, server listing, and server-only photo
   viewing remain blocked until verification succeeds.
7. Explicitly log out, repeat the offline restart, and confirm the previous
   identity is not restored while business data remains intact.
