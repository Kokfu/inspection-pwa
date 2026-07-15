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
