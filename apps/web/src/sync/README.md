# Sync Notes

Phase 2 will add the minimal offline record vertical slice and idempotent sync engine.

The client must save records to IndexedDB before any API request and mark records synced only after the API confirms the exact stable UUID.

Automatic Sprinkler reuses `masterSystemInspection/create` and the
`masterSystemInspections` Dexie store. Opening or saving a Draft creates no
outbox item; Submit Local writes the Pending record and its single active
outbox operation in one IndexedDB transaction.

Phase 5C1 `inspectionAttachment/create` outbox items contain metadata only.
The shared coordinator resolves parent JSON operations first, then uploads
each eligible Blob through authenticated multipart
`POST /api/inspection-attachments`. Only exact photo UUID and source-hash
confirmation completes an attachment. Interrupted `Uploading` attachments
and `Syncing` attachment operations return to retryable Failed state without
deleting the Blob.

First Submit Local also freezes an explicit attachment manifest. A
server-rejected parent may return to correction Draft and reuse the same
parent/photo outbox operation IDs, but repository transactions continue to
forbid evidence-set mutation. Resubmission compares every current attachment
identity and metadata field with the frozen manifest before restoring
Pending status. The correction placeholder keeps its active key and is
excluded from completed-outbox pruning so the original parent operation can
be reactivated even after a long correction period.
