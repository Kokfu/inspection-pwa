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

