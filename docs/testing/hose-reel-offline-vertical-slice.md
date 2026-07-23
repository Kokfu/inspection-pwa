# Hose Reel Offline Vertical Slice Test

1. Log in online and refresh technician jobs/reference data.
2. Open a job with Hose Reel enabled and open Hose Reel repeatedly; verify one local UUID.
3. Disconnect the network, enter partial results and PSI values, add/edit rows, and save Draft.
4. Refresh or force-close/reopen the PWA offline. Resume the same Draft and verify responses, remarks, rows, and snapshot context remain unchanged.
5. Complete all required results and PSI values, then Submit Local offline. Verify the same UUID is Pending and exactly one active outbox item exists.
6. Reconnect, verify the session, and sync. Confirm only the exact accepted/duplicate UUID becomes Synced and the outbox item becomes Completed.
7. Verify one server form instance with a server ID distinct from the client UUID, and one server group for job plus `hose_reel`.
8. Replay the identical payload and verify `duplicateIds` with no additional database rows.
9. Replay a changed payload with the same UUID and verify `IDEMPOTENCY_CONFLICT`.
10. Replay a different UUID for the same job/Hose Reel group and verify `ACTIVE_INSPECTION_EXISTS`.
11. Verify unknown keys, invalid result values, malformed PSI values, duplicate row UUIDs, forged configured locations, and hybrid technician/configured rows are rejected without insertion.
12. Re-run generic test-record, legacy inspection, offline auth/job navigation, reference-cache, and interrupted-sync recovery checks.

Manual production-PWA testing on a real phone remains required before release acceptance.
