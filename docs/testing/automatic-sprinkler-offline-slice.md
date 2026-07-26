# Automatic Sprinkler Offline Slice Test

## Initialization

1. Start the production stack and sign in at `https://localhost`.
2. Refresh jobs and open `Demo Automatic Sprinkler Job`.
3. Open Automatic Sprinkler twice and confirm the same Draft UUID.
4. Reopen from another tab and confirm one local record and no outbox item.
5. For a disposable concurrency check, run the Vite test origin, open
   `/tests/automatic-sprinkler-concurrent-initialization.html` in two tabs,
   reset once, initialize concurrently, and require Verify to report PASS.

## Offline Draft

1. Go offline after the job and app shell are cached.
2. Enter partial Water Tank results and Jockey Cut In/Cut Out values.
3. Save Draft, force-close or reload, and reopen from the same job.
4. Confirm the same UUID and all values return in the authoritative row order.
5. Confirm inputs and Save Draft remain available while offline.

## Validation And Submission

1. Submit an incomplete Draft and require `Cannot submit yet` grouped by Water
   Tank, Pump House, and Main Alarm Valve.
2. Confirm the first incomplete row is highlighted and scrolled into view.
3. Complete all 20 Good/Poor results and all six PSI values.
4. Submit Local offline and confirm the same UUID becomes Pending.
5. Confirm exactly one active outbox operation exists.

Server-focused invalid requests must reject unknown keys, invalid result
values, missing/wrong PSI keys or units, non-finite values, non-primary
identity, and non-null zone/location provenance.

## Sync And Idempotency

1. Reconnect, verify the session, and use shared Sync Pending.
2. Confirm the local record becomes Completed without a reload.
3. Confirm PostgreSQL has one parent and one primary child, distinct server ID
   and client UUID, and null zone/location columns.
4. Exact replay must return the UUID in `duplicateIds`.
5. Changed replay must return `IDEMPOTENCY_CONFLICT`.
6. A new UUID for the same job/system must return
   `ACTIVE_INSPECTION_EXISTS`.
7. Confirm the authenticated server list displays the safe summary only.

## Fixture And Regression

Repeated API startup must retain exactly one sprinkler demo customer,
configuration revision, enabled system, and open job, with zero zones and
locations. A partial or mismatched deterministic fixture must fail startup.

Re-run Hose Reel Draft/submit/sync and one independent CO2 location flow.
Verify authentication, offline startup, cached jobs/reference data, legacy
tools, interrupted-sync recovery, and completed-outbox retention.
