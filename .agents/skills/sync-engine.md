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
