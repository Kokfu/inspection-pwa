# Offline-First PWA Skill

## Purpose

This application is an offline-first field inspection Progressive Web App.

Users may work in locations with no Wi-Fi, unstable mobile data, poor signal, or temporary server outages. The application must remain usable for data entry even when the network is unavailable.

## Non-Negotiable Rules

1. Offline mode must never prevent users from typing, selecting options, editing forms, capturing photos, saving drafts, or submitting inspection records locally.

2. Internet availability may affect synchronisation only. It must not affect data-entry controls.

3. Do not use `navigator.onLine` to disable inputs, forms, save buttons, camera capture, or local database writes.

4. Every business record must be written to IndexedDB before any API request is attempted.

5. Every locally created record must have a stable client-generated UUID using `crypto.randomUUID()`.

6. A local record must remain available after:

   * page refresh;
   * force-closing the PWA;
   * reopening from the phone home screen;
   * internet loss;
   * API failure;
   * temporary server maintenance.

7. A record can be marked `Synced` only after the server explicitly confirms that the exact record UUID was successfully accepted.

8. Failed uploads must remain locally available with a clear error status and retry path.

9. The Service Worker caches the application shell and static assets. IndexedDB stores business data, drafts, forms, attachments, and sync queue items.

10. Do not store important inspection records only in React state, localStorage, Cache Storage, or an in-memory array.

## Required Local Statuses

Every editable inspection record must use one of these states:

* `Draft`
* `Pending`
* `Syncing`
* `Synced`
* `Failed`
* `Conflict`

The user interface must show a meaningful status such as:

* Saved on this device
* Pending Sync
* Syncing
* Synced
* Sync failed
* Needs review

## Required Save Flow

User edits form
→ validate locally
→ save record to IndexedDB
→ create or update sync outbox item in the same IndexedDB transaction
→ show local-save confirmation
→ attempt upload only when appropriate
→ receive server confirmation
→ mark confirmed records as Synced

## Prohibited Patterns

Do not write code like:

```ts
disabled={!isOnline}
```

on field-entry controls.

Do not block record saving with:

```ts
if (!navigator.onLine) return;
```

Do not submit records directly to the API before saving them locally.

Do not delete pending records after a failed API request.

Do not treat browser online status as proof that the backend API is reachable.

## Required Acceptance Test

After every relevant change, test:

1. Open the production PWA online.
2. Wait until Offline Ready is confirmed.
3. Add it to the phone home screen.
4. Turn off Wi-Fi and mobile data.
5. Force-close the PWA.
6. Reopen from the home screen.
7. Type into every field.
8. Save a record.
9. Confirm the record is marked Pending Sync.
10. Force-close and reopen again.
11. Confirm the record still exists.
12. Restore internet.
13. Sync the record.
14. Confirm exactly one server record exists for the local UUID.
