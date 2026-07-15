# Inspection Skeleton Test

The Phase 4A sample inspection is generic demonstration data only.

1. Sign in as an `admin` or `inspector`.
2. Save a sample inspection draft, refresh, and confirm it remains local.
3. Submit a completed sample inspection locally and confirm it is `Pending`.
4. Simulate an unavailable API and confirm a new draft can still be saved locally.
5. Restore the API, select `Sync Pending`, and confirm the inspection becomes `Synced`.
6. Confirm one `inspections` row and its response rows exist in PostgreSQL.
7. Replay the same UUID and confirm no duplicate inspection or response rows are created.
8. In another signed-in browser profile, select `Load Server Inspections` and confirm the summary appears separately from local records.
9. Confirm unauthenticated `GET /api/inspections` returns `401`.

## Phase 4B Hardening Checks

1. Sync a complete sample inspection and confirm one inspection row and the expected response rows are committed.
2. Send the same otherwise-valid payload with one required sample item omitted. Confirm its UUID is returned in `failed` with `VALIDATION_ERROR` and no inspection or response rows are inserted.
3. Save a Draft, refresh, resume it, and verify the section/item labels, order, response types, required flags, responses, and remarks come from that Draft's stored snapshot.
4. Submit the same Draft/retry path repeatedly. Confirm only one Pending, Syncing, or Failed `inspection/create` outbox item exists for its inspection UUID.
5. Force an inspection item to Syncing, reload, and confirm it becomes retryable while retaining the same active outbox key.
6. After confirmation, verify the outbox item is Completed with no active key. Only Completed items older than 30 days are eligible for best-effort cleanup; Pending, Failed, and Syncing items must remain.
