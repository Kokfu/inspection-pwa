# IndexedDB Data Model Skill

## Purpose

Use this skill whenever changing browser-side local storage, offline data models, Dexie schemas, sync queue records, drafts, attachments, or IndexedDB migrations.

This project is an offline-first field inspection PWA. IndexedDB is the device-local business-data store. It is not optional. The app must remain usable when the API, internet, Wi-Fi, mobile data, router, domain, or client PC is unavailable.

## Core Rules

1. IndexedDB stores business data that must survive offline usage.
2. Service Worker Cache Storage stores app-shell assets only.
3. Do not store important inspection records only in React state, memory, Cache Storage, or `localStorage`.
4. Every locally created business record must have a stable device-generated UUID.
5. Use `crypto.randomUUID()` for new local entities when available.
6. Local data must be saved before any API request is attempted.
7. Failed API calls must never delete or overwrite unsynced local data.
8. Browser `navigator.onLine` is only a status hint. It must not decide whether local writes are allowed.
9. Unsynced data must survive:

   * refresh;
   * tab close;
   * browser restart;
   * installed PWA force-close;
   * offline mode;
   * API failure;
   * server downtime;
   * Windows client PC downtime.
10. Data-model changes must include a migration strategy.

## Required Local Tables

Use these logical tables or close equivalents.

### `inspectionRecords`

Stores locally created or edited inspection records.

Required fields:

* `localId`
* `serverId`
* `clientUuid`
* `assignmentId`
* `formTemplateId`
* `formVersion`
* `payload`
* `localCreatedAt`
* `localUpdatedAt`
* `lastSyncedAt`
* `syncStatus`
* `lastSyncError`

Allowed `syncStatus` values:

* `Draft`
* `Pending`
* `Syncing`
* `Synced`
* `Failed`
* `Conflict`

### `syncOutbox`

Stores retryable local operations that must be sent to the server.

Required fields:

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

Allowed `action` examples:

* `Create`
* `Update`
* `Delete`
* `UploadAttachment`

Allowed `status` values:

* `Pending`
* `Syncing`
* `Failed`
* `Completed`

### `referenceData`

Stores offline-readable data downloaded from the server.

Examples:

* customers;
* sites;
* inspection templates;
* checklist definitions;
* technician assignments;
* dropdown options.

Required fields:

* `key`
* `payload`
* `version`
* `fetchedAt`
* `expiresAt`

### `attachments`

Stores future local photo/file/signature data.

Required fields:

* `attachmentId`
* `recordId`
* `blob`
* `filename`
* `mimeType`
* `sizeBytes`
* `checksum`
* `localCreatedAt`
* `syncStatus`
* `uploadProgress`
* `lastSyncError`

## Required Save Transaction

When saving a record that needs server sync, write the business record and outbox operation together where practical.

Required flow:

User edits or submits
→ validate locally
→ generate stable UUID if new
→ save record to IndexedDB
→ create or update outbox item
→ show local status
→ attempt sync only after local save succeeds

Do not call the API first.

## Schema Versioning

Every Dexie schema change must be intentional.

When changing IndexedDB tables:

1. Increment the database version.
2. Add a clear migration path.
3. Preserve unsynced records.
4. Preserve failed records.
5. Preserve attachment Blobs.
6. Preserve outbox operations.
7. Test migration with existing local data.
8. Test migration while offline.
9. Test migration after force-closing and reopening the installed PWA.

## Deletion Rules

Do not permanently delete unsynced business records casually.

Use safe states where possible:

* `DeletedPendingSync`
* `Archived`
* `Voided`
* `PendingDelete`

Normal users must not be able to clear unsynced records without explicit confirmation and a recovery path.

## Attachment Rules

Photos, signatures, and files must not be stored only in memory or Cache Storage.

Required future flow:

Capture/select file
→ optionally compress or normalize
→ calculate metadata/checksum where practical
→ save Blob to IndexedDB
→ link Blob to local record UUID
→ create outbox upload operation
→ upload after parent record is accepted
→ mark attachment synced only after server confirmation

## Prohibited Patterns

Do not use:

```ts
disabled={!navigator.onLine}
```

on form inputs or local save actions.

Do not do:

```ts
if (!navigator.onLine) return;
```

before saving to IndexedDB.

Do not mark records as `Synced` merely because a batch request returned HTTP 200. The server must confirm the exact UUIDs accepted.

Do not wipe IndexedDB as part of normal update, logout, or error recovery unless the user explicitly confirms and unsynced data has been handled safely.

## Acceptance Tests

Any local data-model change must pass these tests:

1. Create a record offline.
2. Save it to IndexedDB.
3. Refresh the page.
4. Confirm the record remains.
5. Force-close the installed PWA.
6. Reopen offline.
7. Confirm the record remains.
8. Restore internet.
9. Sync the record.
10. Confirm exactly one server record exists for the UUID.
11. Upgrade the app build.
12. Confirm old local data migrates safely.
13. Confirm failed or pending outbox items are not lost.
