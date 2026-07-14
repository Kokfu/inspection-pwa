# Sync Retry Test

1. Create a local record while offline.
2. Confirm it is saved in IndexedDB with a stable UUID.
3. Confirm a matching outbox item exists.
4. Restore internet.
5. Trigger sync.
6. Interrupt network during upload.
7. Retry the same outbox item.
8. Confirm PostgreSQL contains exactly one row for the stable UUID.
9. Test partial success with one accepted and one rejected record.
10. Confirm only exact accepted or duplicate IDs are marked synced.

## Phase 2 Local Setup

For Phase 2 local sync testing only, this older bypass existed:

```text
ALLOW_PHASE2_UNAUTHENTICATED_SYNC=true
```

Do not commit `.env`. Do not expose the app publicly while this temporary bypass is true.

Beginning in Phase 3, sync testing should use a real local admin or inspector session. `/api/sync` should reject unauthenticated requests, and local IndexedDB records should remain retryable after that rejection.

## Phase 2 Duplicate Retry

1. Submit one local test record.
2. Press Sync and confirm it becomes `Synced`.
3. Replay the same payload with the same `clientUuid`.
4. Confirm the API returns that UUID in `duplicateIds`.
5. Confirm PostgreSQL still has exactly one row for that `client_uuid`.

## Phase 2 Interrupted Sync Recovery

1. Submit one local test record.
2. Simulate an interrupted sync by leaving the matching `testRecords` row and `syncOutbox` item in `Syncing`.
3. Reload the app.
4. Confirm both are changed to `Failed`.
5. Confirm `lastError` / `lastSyncError` says `Recovered from interrupted sync`.
6. Press Sync and confirm the recovered item is retryable.

## Phase 3 Authenticated Sync

1. Start the Docker stack.
2. Create a local admin account with the operational admin creation command and runtime-only environment variables.
3. Confirm unauthenticated `POST /api/sync` returns 401.
4. Sign in through the PWA.
5. Submit one local test record and press Sync.
6. Confirm the record is marked `Synced` only after its exact UUID appears in `acceptedIds` or `duplicateIds`.
7. Log out.
8. Confirm pressing Sync no longer uploads and the local item remains `Failed` or retryable.
9. Confirm typing, Save Draft, and Submit Local still work while the API is unavailable or the user is logged out.
