# Server Record Listing Test

## Goal

Verify that an authenticated second browser can view generic test records already synced to PostgreSQL without modifying its local IndexedDB records.

## Preconditions

- The Docker Compose stack is running.
- An active `admin` or `inspector` user exists.
- Browser A can sign in and sync a generic test record.

## Browser A

1. Open `https://localhost` and sign in.
2. Create a generic test record with `Submit Local`.
3. Run `Sync Pending` and confirm the record becomes `Synced`.

## Browser B

1. Open `https://localhost` in another browser profile and sign in.
2. Select `Load Server Records`.
3. Confirm the Browser A record is shown in the separate read-only Server Records section.
4. Confirm the response displays only title, notes, created time, and client UUID.
5. Confirm Browser B local Draft or Pending records remain separate and unchanged.

## Access and Failure Cases

1. Sign out and confirm Server Records clears while local IndexedDB records remain.
2. Request `curl.exe -k -i https://localhost/api/test-records` without a session and confirm `401`.
3. Simulate offline or API unavailability, select `Load Server Records`, and confirm a clear failure message appears.
4. Confirm failed listing does not delete, alter, sync, or fail any local IndexedDB records or outbox items.
