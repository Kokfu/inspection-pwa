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

## Phase 5A4 definition-control regression

1. Open a pre-5A4 Draft offline. Verify Good/Poor options, previous selections, measurement values and PSI units, remarks, and repeatable rows render from its frozen V1 definition. Save, reload, and resume without a UUID or payload rewrite.
2. Open a pre-5A4 Pending record read-only. Verify opening does not update the record or outbox payload, then sync or replay it with the original Phase 5A3 fingerprint semantics.
3. Open a pre-5A4 Completed record read-only and verify its historical machine values display as Good/Poor.
4. Create a new Draft and inspect its snapshot. Verify it contains resolved controls with only ordered `good`/`poor` machine values, Good/Poor labels, requiredness, measurement labels/PSI units, and remarks limits.
5. After creating a Draft, change only a temporary catalog fixture. Verify the existing Draft remains unchanged because rendering uses its frozen snapshot.
6. Inject `na` separately into a checklist result, a measurement result, and a repeatable-row result. Verify local submission rejects each. Bypass local validation in a controlled API test and verify the server returns `VALIDATION_ERROR` without inserting data.
7. Supply malformed or unknown V1 definition/control metadata. Verify both frontend and server fail closed with a safe error and do not save or sync the inspection.
8. Confirm Water Tank, Pump House, measurement-result, and all five repeatable component controls use the shared option-driven selector.
9. Confirm generic test records, legacy inspections, auth/jobs, reference cache, stale-sync recovery, and Hose Reel sync behavior remain unchanged.

Manual production-PWA testing on a real phone remains required before release acceptance.
