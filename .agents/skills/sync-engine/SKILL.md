# Sync Engine Skill

## Purpose

This application uses local-first data storage. The sync engine uploads locally stored changes to the server when connectivity is available.

## Core Rule

The local device is the first write location. The server is the authoritative shared location after successful confirmation.

## Required Sync Outbox Fields

Each queued operation must include:

* `operationId`
* `entityType`
* `entityId`
* `action`
* `payload`
* `createdAt`
* `attempts`
* `lastAttemptAt`
* `lastError`
* `status`

## Sync Requirements

1. Prevent concurrent sync jobs.
2. Upload only Pending or retry-eligible Failed items.
3. Use controlled batches.
4. Keep each entity’s stable UUID unchanged across retries.
5. The server must treat stable UUIDs or mutation IDs idempotently.
6. A network timeout does not mean the server rejected the record.
7. Do not mark a local record Synced until the server returns confirmation for that exact UUID.
8. On partial batch success, mark only confirmed items Synced.
9. Preserve failed items and show the error reason.
10. Retry when:

* the app launches;
* the browser emits an online event;
* the user presses Sync;
* the application is open and a safe retry interval is reached.

## Server Response Requirement

The API response must include exact IDs, for example:

```json
{
  "acceptedIds": ["uuid-1", "uuid-2"],
  "duplicateIds": ["uuid-3"],
  "failed": [
    {
      "id": "uuid-4",
      "code": "VALIDATION_ERROR",
      "message": "Required inspection field is missing"
    }
  ]
}
```

The client must mark only `acceptedIds` and `duplicateIds` as synced.

## Required Tests

* Submit a record offline.
* Restore internet and sync.
* Disconnect during upload.
* Retry the same record multiple times.
* Verify exactly one server record exists.
* Test one record accepted and another rejected in the same batch.
* Force-close the app during sync and reopen it.
* Confirm no local data disappears.

## Evidence / Attachment Sync (V7)

For the multi-system inspection evidence path, the rules above still apply,
plus the following. See `v7-evidence-acceptance` for the full contract.

1. Evidence-first ordering. The coordinator resolves each Poor photo (stage it)
   BEFORE accepting the parent form instance. Parent acceptance is atomic:
   parent row + binding every manifest photo, all-or-nothing.
2. Frozen manifest. First Submit Local freezes an explicit evidence manifest
   derived from the CURRENT Poor set of the response, not from enumerating
   attachment Blobs. Entry shape: `{ photoUuid, fieldPath, sourceSha256 }`.
3. Manifest immutability. Once Pending is frozen, later Draft edits must not
   change the frozen response or manifest. A rejected parent may return to
   correction Draft and reuse the same parent/photo outbox operation IDs, but
   the evidence set cannot change.
4. Stale evidence. If a field was Poor with a photo and is changed to Good or
   Not Relevant before freeze, that photo must not enter the manifest, must
   not create an outbox item, and must not block acceptance.
5. Staging is idempotent on `photoUuid` + a canonical request fingerprint over
   the immutable identity. Re-staging identical bytes = duplicate success;
   different bytes for the same `photoUuid` = conflict.
6. Multipart staging returns per-part success; the server records both
   `sourceSha256` (uploaded bytes) and `storedSha256` (normalised bytes).
7. Accepted evidence uniqueness is scoped to `jobId + systemKey` (not global,
   not historical). A concurrent acceptance race must yield at most one
   Accepted; translate a unique-violation into a safe retryable failure.
8. Exact idempotent retry of an already-accepted record returns the same
   Accepted authority even if the Job is now closed — never `JOB_CLOSED`.

### Additional evidence tests

* Stage a Poor photo offline, reconnect, confirm evidence stages before the
  parent is accepted.
* Change a Poor field to Good after attaching a photo; confirm the photo is
  excluded from the frozen manifest and outbox.
* Retry an accepted record after the Job is completed; confirm same authority,
  not a closed-job error.
* Reuse the same image bytes across two locations in one Job+system; confirm
  rejection. Reuse across different Jobs; confirm allowed.
