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

For Phase 2 local sync testing only, set this in local `.env`:

```text
ALLOW_PHASE2_UNAUTHENTICATED_SYNC=true
```

Do not commit `.env`. Do not expose the app publicly while this temporary bypass is true.

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
