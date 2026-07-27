# Offline Photo Evidence

## Phase 5C1 Scope

Phase 5C1 adds optional photo evidence only to the six PSI values in the
Automatic Sprinkler form. Hose Reel, CO2, checklist results, remarks,
comments, and PDF output remain unchanged.

## Immutable Policy

`automatic-sprinkler-psi-evidence` version 1 allows, but does not require,
one photo for each approved PSI machine path. Published policy rows are
immutable. A future mandatory policy must be a new version assigned through
a new customer configuration revision and frozen into a new job.

Historical enabled systems without a policy remain photo-disabled. New jobs
freeze the policy ID, version, definition, and definition hash. The accepted
server form instance stores the same server-owned policy as one atomic set.
That set may be assigned once from the canonical published policy and then
cannot be changed, regenerated, or cleared. Upload
authorization never trusts a client policy claim.

## Offline Lifecycle

Controlled `getUserMedia` capture is classified `camera`. File-picker input
is classified `gallery` and visibly labelled; this is device-reported
provenance, not cryptographic proof. Client processing corrects displayed
orientation, bounds dimensions, re-encodes to JPEG, strips browser-visible
metadata, computes SHA-256, and stores only the processed Blob in IndexedDB.

Capture, preview, removal, and replacement are local Draft operations.
Submit Local atomically freezes the parent and all current attachments,
creates the parent outbox operation, and creates one metadata-only attachment
operation per photo. Binary data never enters `/api/sync` JSON.

If the server rejects the parent, the parent may return to a correction Draft.
Response fields remain editable, but the submission timestamp and frozen
attachment manifest remain. Resubmission reuses the parent UUID and the
original parent/photo outbox operations. Repository transactions reject
photo add, remove, and replacement calls once the first submission has
frozen the evidence set, even when stale UI code calls them directly.

## Ordered Sync And Completion

The shared coordinator first resolves parent JSON writes. It then uploads
eligible photos individually to the authenticated multipart endpoint.
Exact photo UUID and source-hash confirmation is required before local
evidence becomes Synced.

- Parent pending or syncing: Pending Sync or Syncing.
- Accepted parent with local evidence: Pending Evidence.
- Active upload: Uploading Evidence.
- Failed/conflicting evidence: Needs Attention.
- Accepted parent with all submitted evidence confirmed: Completed.
- Accepted parent with no evidence under optional V1: Completed.

## Server Storage

PostgreSQL stores attachment identity, policy, hashes, dimensions, actor, and
safe relative path. JPEG bytes live under:

```text
/srv/uploads/inspections/<inspection-client-uuid>/<photo-uuid>.jpg
```

Uploads use bounded streaming, strict part and total-body limits, Sharp
decoding, metadata removal, normalized JPEG output, a same-filesystem
temporary file, file sync, and atomic rename. The containing directory is
synced where the Docker Desktop bind-mount filesystem supports it; directory
sync is not guaranteed by every Windows-backed filesystem.

The canonical file is prepared before metadata is committed. Once renamed,
it is not deleted on an ambiguous `COMMIT` result. A fresh database
connection resolves the photo UUID: a matching committed row succeeds, a
conflict fails deterministically, and no row leaves a detectable orphan for
retry/reconciliation. Filesystem and PostgreSQL operations are not one atomic
transaction. Crashes before rename leave removable temporary files; crashes
after rename and before a durable database commit can leave an orphan; the
ordering avoids deliberately creating a committed row whose canonical file
was never prepared.

Exact duplicate replay streams the canonical file, verifies its stored byte
size and SHA-256, and refuses duplicate success for missing or corrupt
storage. Reconciliation reports missing, wrong-size, wrong-hash, orphan, and
stale temporary files without deleting mismatches during normal startup.

The uploads directory is never exposed by Caddy. Metadata and image content
routes require an admin or inspector session and use private, non-service-
worker caching.

## Local Retention

Local Blobs are retained in Draft, Pending, Uploading, Failed, Conflict, and
Synced states. Logout does not clear them. Phase 5C1 performs no automatic
Blob cleanup; later storage-pressure cleanup must be explicit and must never
remove unresolved evidence.

Client processing uses operation generations and cancellation signals so an
obsolete selection cannot replace IndexedDB data. Browser image decoding
cannot always be cancelled before memory allocation, so source byte and
dimension limits reduce risk but do not claim complete decompression-bomb
protection. Server-side Sharp validation remains authoritative.
