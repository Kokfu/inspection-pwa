# Offline-First Contract

## Core Rule

Offline must limit synchronisation, not data entry.

Users must be able to type, select, edit, validate, save drafts, and create records while offline. Never disable inputs, local save actions, camera capture, or draft saving because `navigator.onLine` is false.

## Local First Write

Every business-data write must first persist to IndexedDB before any API request.

Every local record must have a stable UUID generated on the device with `crypto.randomUUID()`.

Unsynced records must survive:

- Refresh.
- Browser restart.
- PWA force-close.
- Internet loss.
- API failure.
- Server downtime.

## Storage Responsibilities

- Service Worker Cache Storage: app-shell assets only.
- IndexedDB: drafts, business records, sync outbox items, offline reference data, and future attachment Blobs.
- PostgreSQL: shared authoritative business database after successful sync.

## Required Local Statuses

- `Draft`
- `Pending`
- `Syncing`
- `Synced`
- `Failed`
- `Conflict`

## Save Flow

```text
User edits form
-> local validation
-> save record to IndexedDB
-> create or update outbox item
-> show local-save confirmation
-> attempt upload only when appropriate
-> receive exact server UUID confirmation
-> mark confirmed record Synced
```

## Prohibited Patterns

Do not block data entry or local saves with online checks. Browser online status is only a hint for sync scheduling and messaging.

