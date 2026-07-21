# Technician Offline Navigation Test

Use a production build through Caddy. Development-server behavior is not proof of PWA or offline support.

## Online Preparation

1. Sign in with an authorized local test account.
2. Confirm Server Access reports Verified.
3. Confirm exactly two sanitized demo jobs appear.
4. Open Demo Single-Zone Job and verify exactly Hose Reel, Fire Alarm / Detector, and Portable Fire Extinguisher appear.
5. Open Demo Multi-Zone Job and verify exactly six configured systems appear.
6. Confirm FM200, Smoke Ventilation, Fire Intercom, and Fire Rated Roller Shutter do not appear.
7. Inspect configured zones, locations, preset row counts, and Back navigation.
8. Confirm IndexedDB contains `device-auth` without any token/password fields and a job cache key scoped to the verified user ID.

## Offline Reopen

1. Disable the network after online preparation.
2. Force-close the browser or installed PWA.
3. Reopen it offline.
4. Confirm the state is Offline mode with the last verified identity and time, not an explicit logged-out state.
5. Confirm the same user's cached jobs and system navigation remain usable.
6. Confirm refresh, server listing, and sync controls are unavailable.
7. Confirm existing Draft and Pending records remain visible and local save actions remain enabled.
8. Simulate a delayed, timed-out, or 5xx `/api/auth/me` response. Confirm cached jobs appear promptly as Offline mode and the app does not treat the condition as logout.

## Revalidation And 401

1. Restore the network and confirm the online event rechecks `/api/auth/me`.
2. Confirm a valid session returns to Verified and refreshes the current user's cache.
3. Revoke or expire the session, then reconnect/recheck.
4. Confirm an explicit 401 requires sign-in and clears only cached identity.
5. Confirm local records, outbox items, reference data, and cached job data were not deleted.

## Logout

1. While online, log out and verify the server session and local identity are cleared.
2. Sign in again, go offline, and log out.
3. Confirm local identity disappears immediately while business data remains.
4. Reconnect and confirm pending server logout completes before `/auth/me` can restore a session.
5. Delay `/auth/me`, then trigger logout. Confirm the delayed authenticated response cannot restore the local identity or remove the pending logout marker.
6. Start login, then logout before it returns. Confirm logout remains the final local state and revokes the session created by the stale login.

## Shared Device Scope

1. Login as User A and cache jobs.
2. Logout, then login as User B.
3. Confirm the UI reads only User B's job-cache key.
4. Confirm User A's cached job list is not displayed as User B's list.
5. Delay a User A reconciliation while User B signs in. Confirm only User B's identity and job cache become active.

## Regression

Open Development / Regression Tools and verify generic test records, Phase 4 Draft/resume, local submission, authenticated sync, reference cache status, and server inspection listing still work.
