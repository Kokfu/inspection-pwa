# CO2 Multi-Instance Offline Slice Test

## Initialization

1. Start the production stack and sign in at `https://localhost`.
2. Refresh jobs and open `Demo CO2 Multi-Zone Job`.
3. Open CO2 and confirm Room A-D in Zone 1, Room E in Zone 2, and Room F in Zone 3.
4. Reopen CO2 and confirm exactly six children with unchanged UUIDs.

### Concurrent initialization

1. Start the Vite test server on a disposable origin:
   `npm.cmd run dev -- --host 127.0.0.1 --port 4174`.
2. Open `/tests/co2-concurrent-initialization.html` in two tabs.
3. Select `Reset Test Data` once, then select `Initialize` in both tabs
   concurrently.
4. Confirm both tabs report six initialized children without an unhandled
   `ConstraintError`.
5. Select `Verify` and require `PASS`, one group, six children, stable UUIDs,
   zero outbox operations, malformed/duplicate UUID rejection, and three
   immutable zone group keys.
6. This harness clears only its disposable-origin IndexedDB CO2 test data. Do
   not run its reset action against the production PWA origin.

## Offline Drafts

1. Go offline after preparation.
2. Edit and Save Draft in Room A and Room B independently.
3. Force-close or reload the PWA.
4. Confirm both Drafts and values remain and all local inputs/actions work.

## Submission

Confirm actionable validation for a blank panel location, no detector rows,
missing detector zone/location, neither detector status, incomplete fixed
checks, duplicate row UUIDs on the server, and over 250 rows. Draft remains
permissive. Submit Room A and confirm it is Pending while Room B stays Draft.

## Sync and Progress

Reconnect, verify the session, and sync. Room A must become Completed without
reload, Room B must remain Draft, and parent status must be In Progress.
Complete all six independently and confirm parent status becomes Completed.

## Idempotency and Authority

- Exact replay returns `duplicateIds`.
- Changed replay returns `IDEMPOTENCY_CONFLICT`.
- New UUID for the same instance returns `INSTANCE_ALREADY_EXISTS`.
- A different valid configured room is accepted.
- Mixed batches preserve partial success.
- Forged zone/location/instance identity is rejected.
- Invalid detector and fixed result values are rejected.

Confirm the authenticated server list contains safe customer, job, system,
zone, configured location, instance key, status, performed time, UUID, and
actor context, without raw response or snapshot JSON.

## Regression

Re-run Hose Reel Draft, submit, sync, retry, and listing checks. Confirm
legacy records, auth, cached jobs/reference data, and interrupted-sync
recovery remain intact after Dexie v8.
