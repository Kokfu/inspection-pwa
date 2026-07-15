# Sync Protocol

## Principle

The device is the first write location. PostgreSQL becomes the shared authoritative location after the server confirms a sync item.

## Outbox Fields

Each queued operation must include:

- `operationId`
- `entityType`
- `entityId`
- `action`
- `payload`
- `createdAt`
- `attempts`
- `lastAttemptAt`
- `lastError`
- `status`

## Server Response Shape

The API must confirm exact IDs:

```json
{
  "acceptedIds": ["uuid-1"],
  "duplicateIds": ["uuid-2"],
  "failed": [
    {
      "id": "uuid-3",
      "code": "VALIDATION_ERROR",
      "message": "Required field is missing"
    }
  ]
}
```

The client marks only `acceptedIds` and `duplicateIds` as synced.

## Idempotency

The API must use client-generated stable UUIDs or mutation IDs with database uniqueness constraints. Retrying the same write must not create duplicates.

Network timeout does not prove rejection. Preserve the local outbox item and retry safely.

## Retry Triggers

- App launch.
- Browser `online` event.
- User presses Sync.
- Safe retry interval while the app is open.

Do not call this browser-level Background Sync unless actual Service Worker Background Sync is implemented and verified.

## Phase 2 Test Record Slice

Phase 2 implements one generic `testRecord` entity only. It is not a real inspection workflow.

Frontend local fields:

- `clientUuid`
- `title`
- `notes`
- `createdAt`
- `localCreatedAt`
- `localUpdatedAt`
- `lastSyncedAt`
- `syncStatus`
- `lastSyncError`

`Save Draft` writes only to IndexedDB with `syncStatus = Draft` and does not create an outbox item.

`Submit Local` writes the record to IndexedDB with `syncStatus = Pending` and creates one `syncOutbox` item with:

- `entityType = testRecord`
- `action = create`

The API route is exposed through Caddy as `POST /api/sync` and received by the API container as `POST /sync`.

Beginning in Phase 3, `/sync` requires an authenticated server session with the `admin` or `inspector` role. Authentication failure must not delete or mark local IndexedDB records as synced. The client leaves affected outbox items local and retryable.

The Phase 2 PostgreSQL table is created by the API startup migration runner using non-destructive `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` statements. The matching SQL file is stored at `apps/api/migrations/001_create_test_records.sql`.

## Phase 3.5 Server Record Listing

`GET /api/test-records` is a read-only server projection for authenticated users. Caddy removes the `/api` prefix before forwarding the request to `GET /test-records` in the API container.

The route returns at most 100 generic test records in deterministic newest-first order. Its response exposes only `clientUuid`, `title`, `notes`, and `createdAt`.

Server records are shown separately from IndexedDB records and are not imported into IndexedDB in Phase 3.5. A failed server listing request must not change local records, local statuses, or outbox items.

## Phase 4A Inspection Skeleton

Phase 4A adds a separate `inspection/create` sync entity while retaining the generic `testRecord/create` regression path. A submitted local inspection is written with its outbox item in the same IndexedDB transaction. The server inserts an inspection and its checklist responses in one PostgreSQL transaction and confirms only the exact client UUID it accepted or recognized as a duplicate.

The seeded sample job and template contain generic labels only. PDF generation will be server-side in a later phase, based on approved structured PostgreSQL inspection data.

## Temporary Local Auth Bypass

Phase 2 used an explicit local-development bypass:

```text
ALLOW_PHASE2_UNAUTHENTICATED_SYNC=false
```

The committed/default value is false. Phase 3 protects `/sync` with server-side sessions and roles. The bypass is deprecated, ignored in production, and must not be used for public deployment.

Do not expose the app publicly while any unauthenticated sync bypass is enabled.
