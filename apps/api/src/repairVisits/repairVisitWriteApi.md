# Repair visit API (3A)

All paths are relative to the API root and require the existing authenticated session.
Manager maps to `supervisor`; Technician maps to `inspector`. All responses are private/no-store.
Optional `x-expected-user-id` must match the authenticated user. Unknown body/query keys are refused.
UUIDs, hashes and UTC timestamps use the strict foundation contract (lowercase UUID/SHA256;
timestamp `YYYY-MM-DDTHH:mm:ss.sssZ`). Field identities come verbatim from the 2B catalog.

## Technician writes

`POST /repair-visits`:

```json
{
  "clientUuid": "client visit UUID",
  "customerId": "existing customer UUID",
  "siteId": "existing site UUID",
  "configurationRevisionId": "downloaded active revision UUID",
  "deviceCreatedAt": "2026-10-19T02:05:00.000Z",
  "visitDate": "2026-10-19",
  "arrivalTime": "10:05",
  "serviceCallNumber": null,
  "previousVisit": null,
  "items": [{ "clientUuid": "stable item UUID", "identity": "2B identity object" }]
}
```

`previousVisit` may be `{kind: "service"|"repair", visitId: UUID}`. It must belong to
this technician, customer and site and be approved. At least one distinct field/item is required.
`deviceCreatedAt: null` requests online creation using the server's Malaysia date/instant;
otherwise both the visit day and device instant must be within -30/+1 calendar days,
and their Malaysia day must agree. Arrival time is the captured local arrival time.
The server assigns `RV-YYYYMMDD-NN`. Retry the identical original request, including original
items, even after later submit/approval. A deleted UUID cannot be recreated.

Create receipt: `{clientUuid, visitNumber, configurationRevisionId, deviceCreatedAt,
visitDate, arrivalTime, requestFingerprint}`.

`POST /repair-visits/:visitId/photos`: multipart fields `metadata` (JSON) and `file`
(one JPEG, maximum 2 MiB, maximum 1600 px per edge). Metadata keys:
`{photoUuid,itemUuid,revision,sourceSha256,sizeBytes,width,height,captureSource,capturedAt}`.
`captureSource` is `camera|gallery|unknown`. New item UUIDs may stage before Submit adds
them. Stage revision 1 for a draft, or current revision + 1 for a returned visit.
Receipt: `{photoUuid,clientUuid,itemUuid,revision,requestFingerprint,sourceSha256,storedSha256}`.
The fingerprint includes the visit UUID, actor ID and metadata. Exact retries verify uploaded
bytes and the stored file, even after approval. A photo UUID is immutable; each item/revision
has one staged slot. Keep a frozen local submission/photo request across network retries.

`POST /repair-visits/:visitId/submit`:

```json
{
  "operationUuid": "stable submit operation UUID",
  "expectedRevision": 1,
  "revision": 1,
  "items": [{
    "clientUuid": "stable item UUID",
    "identity": "2B identity object",
    "outcome": "done_repair",
    "remark": "Replaced the valve",
    "photoUuid": "confirmed staged photo UUID",
    "sourceSha256": "confirmed source hash"
  }]
}
```

Outcome is `done_repair|not_done`; both require a nonblank remark and one photo.
Items are the complete replacement set in display order. Their identity and labels/Before
come from the server catalog. Clients cannot provide Before or labels. Photos stage first;
no visit/item/binding/event change commits if any photo or field fails validation.
Service-source catalog reads hold the existing per-visit approval lock and all source-form
correction locks through commit, so withdrawal/correction cannot race approval validation
and the frozen Before snapshot. An item UUID already owned by another repair visit is refused
atomically, including concurrent creation attempts; the losing visit is rolled back.
Hash reuse between different items of one system is refused; reuse across visits is allowed.
An existing accepted photo may be retained unchanged on a returned revision.
Existing item UUIDs cannot be repurposed for other fields. Replaced photos are superseded;
removing an item removes its photo metadata before its item (restrictive foundation FK),
leaving discarded files to the existing reconciler. Previous visits are never written.

First Submit uses `expectedRevision=revision=1`. After return at revision N, resubmit uses
`expectedRevision=N, revision=N+1` and a new operation UUID. Local edits remain local until
this atomic submission. Exact original retries return the original event receipt after later
transitions; new payloads using the same operation UUID are conflicts.

Event receipt: `{operationUuid,clientUuid,revision,event,requestFingerprint,occurredAt}`.
`event` is `submitted|resubmitted|returned|approved`. Canonical fingerprint is SHA256 of
JSON recursively sorted by object key (arrays preserve order), over
`{action,actorId,clientUuid,...parsedBody}`. Decision parser adds `reason:null` for approval.
Submit action is `submit`; decision action is `return|approve`. Creation uses
`{actorId,...parsedCreateBody}`. Confirm the exact visit/operation/photo UUIDs and fingerprint;
HTTP 200 alone never means that a queued local request synced.

`DELETE /repair-visits/:visitId`: `{expectedRevision}`. Only the owning technician may
delete a draft with no photo, outcome, remark or event. Deletion is audited. Exact deletion
retries return `{clientUuid,deleted:true}` using that audit record.

## Admin/Manager review

`POST /repair-visits/:visitId/return`: `{operationUuid,expectedRevision,reason}`.
Reason must contain 1–4000 characters. The visit becomes `returned` at the same revision.

`POST /repair-visits/:visitId/approve`: `{operationUuid,expectedRevision}`.
Only `awaiting_approval` can be approved. Within the same locked transaction allocate
`MFE/RR/YYYY/NNNN`, render with the 2C renderer, store PDF bytes/hash, lock the visit,
and append the approval event. Render failure rolls back the counter as well. Approval
receipt adds `reportNumber`. Exact approval retries return that same receipt/number.

`GET /repair-visits/:visitId/revisions/:revision/preview.pdf`: reviewers only, awaiting approval.
Preview uses submitted server items, frozen Before and bound After with the renderer's watermark.
`GET /repair-visits/:visitId/revisions/:revision/report.pdf`: approved only; serves stored bytes
after checking the stored hash. Owning technician or reviewer may download.

## Reads for 4A/4B

`GET /repair-visits` → `{visits: RepairVisit[]}` (technicians: own only; reviewers: all).
`GET /repair-visits/:visitId` → `{visit: RepairVisit,items: RepairVisitItem[],events: RepairVisitEvent[]}`.
`GET /repair-visits/:visitId/photos/:photoUuid/content` → verified JPEG, owner or reviewer;
reviewers see accepted photos only. Foundation camelCase contracts are used for these JSON reads.
No disk path, PDF bytes or internal fingerprint field leaks in the visit/list JSON.
The 2B customer/site/catalog/previous-Before endpoints remain unchanged.

## Refusals

Errors use `{error: CODE, message: string}` (early query/identity middleware may omit message).
No local data should be discarded on refusal. `409` is the default below:

- `INVALID_REPAIR_VISIT_REQUEST` (400): malformed/unknown fields, empty/duplicate items, invalid identity/time/hash.
- `AUTH_REQUIRED` (401), `FORBIDDEN` (403), `IDENTITY_MISMATCH` (409).
- `CUSTOMER_NOT_FOUND` (404), `CUSTOMER_INACTIVE`, `SITE_INACTIVE`, `CONFIGURATION_CHANGED`.
- `DEVICE_DATE_OUT_OF_WINDOW`, `DEVICE_DATE_MISMATCH`.
- `VISIT_NOT_YET_CREATED` (404): sync create before photos/submit; `VISIT_DELETED`.
- `REPAIR_VISIT_NOT_FOUND` (404): previous visit unavailable, unapproved, wrong customer/site/owner.
- `FIELD_NOT_AVAILABLE`, `ITEM_IDENTITY_CHANGED`.
- `INVALID_PHOTO` (400), `PHOTO_METADATA_MISMATCH`, `EVIDENCE_NOT_STAGED`, `DUPLICATE_ITEM_EVIDENCE`.
- `REPAIR_SOURCE_INVALID` / `REPAIR_EVIDENCE_INVALID`: malformed authority or missing/corrupt evidence.
- `IDEMPOTENCY_CONFLICT`, `WRITE_CONFLICT`: UUID/content/unique-slot race conflict; preserve payload and refresh.
- `STALE_REVISION`, `VISIT_LOCKED`, `VISIT_NOT_AWAITING_APPROVAL`, `VISIT_ALREADY_STARTED`.
- `PHOTO_NOT_FOUND` (404), `FINAL_REPORT_UNAVAILABLE`.
- Multipart framing/limits use `INVALID_REPAIR_REQUEST` (400), matching the copied proven upload parser.

Run the cold, isolated verification from the repository root:

```powershell
cd C:\PWA_OfflineRecordWebApp
./apps/api/src/repairVisits/repairVisitWrites.verify.test.ps1
```

The script generates a disposable password, creates its own uniquely named PostgreSQL container
bound only to `127.0.0.1:55432`, explicitly overrides test database URLs, runs suites in separate
processes, and removes only its own container in `finally`. `-Focused` runs the write integration
suite alone. It never accesses the Compose/runtime database.
Browser selection uses an existing `REPORT_CHROMIUM_PATH`, installed Playwright Chromium,
then standard Windows Chrome/Edge locations. Missing candidates are skipped; if none exists,
set `REPORT_CHROMIUM_PATH` to an installed browser executable. The original environment is restored.
