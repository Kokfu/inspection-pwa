# V7 Evidence & Acceptance Skill

## Purpose

Use this skill whenever changing anything in the multi-system inspection
evidence and acceptance path: the V7 shared staged-evidence foundation, a
Good/Poor/Not Relevant control, per-field Poor photo/remark, the frozen
attachment manifest, the sync outbox ordering for evidence, atomic
acceptance, Accepted Detail, or the Final Report / PDF authority chain.

This is the architecture the CO2 V7 and Wet Chemical V7 rollouts are built on,
and every future system (Fire Alarm V7, Hydrant, Hose Reel, Automatic
Sprinkler, Dry/Wet Riser, FM200, Smoke Ventilation, Fire Intercom) will
implement against it. Read it before touching related code, and mirror the
already-proven CO2 / Wet Chemical path rather than inventing a new one.

Related skills: `sync-engine` (outbox + idempotency), `backend-api-security`
(scoped DB uniqueness, upload security), `indexeddb-data-model` (local
attachment lifecycle). Read those sections too.

---

## Historical Template Strategy

1. Published template versions are immutable. V1–V5 are historical, V6 is the
   Fire Alarm evidence pilot, V7 is the forward-only shared-evidence rollout.
2. Never mutate a published template object. `masterServiceReportV7.ts`
   composes a new object from V6; it does not edit V6.
3. Never auto-upgrade an existing Job, Draft, Pending, or Accepted record from
   one template version to another. Version is frozen when the Job is created.
4. A frozen inspection is interpreted only by the exact template/contract it
   was frozen against. A newer template must never re-interpret older data.
5. The current V7 identity tuple (confirm against
   `apps/api/src/inspections/templates/masterServiceReportV7.ts` and the seed):
   - `masterTemplateId` = `00000000-0000-4000-8000-000000000807`
   - `code` = `MFE-FSSR`
   - `version` = `7`
   - `snapshotSchemaVersion` = `2`, `responseSchemaVersion` = `2`
6. Historical regression baselines that must stay byte-exact and green after
   any change here: V1–V5, Fire Alarm V6, CO2 V1, Wet Chemical V4.

---

## Result Model

1. V7 Good/Poor controls allow exactly three values: `good`, `poor`,
   `not_relevant`. Nothing else.
2. `Normal` / `Test` / `Isolation` are a separate detector-state control. They
   are NOT Good/Poor controls and their semantics must never be changed or
   folded into the Good/Poor model.
3. Only a `poor` value carries evidence. `good` and `not_relevant` carry none.
4. Some real customer paper forms use a fourth state ("Complete Repair" /
   "N.A. — no need checking"). That is a future phase (result-model
   refinement). Do not add states in an evidence phase.

---

## Poor Evidence Ownership

1. A `poor` field requires that field's OWN remark and that field's OWN photo.
2. One photo must never satisfy two Poor fields.
3. A Poor field must never borrow another field's remark or photo.
4. Evidence identity is the tuple:
   `photoUuid` + `inspectionClientUuid` + `jobId` + `systemKey`
   + V7 template tuple + `contractSha256` + canonical `fieldPath` + actor.
5. Canonical `fieldPath` values are defined by the system's V7 contract
   adapter. An adapter rejects any path it does not recognise
   (`isCanonicalFieldPath`).

---

## Adding a System to V7

The V7 evidence foundation is a registry of per-system contract adapters.

Location: `apps/api/src/inspections/evidence/v7EvidenceContracts.ts`.

To add a system (mirror `co2Adapter` / `wetChemicalAdapter`):

1. Extend the `V7EvidenceSystemKey` union with the system key
   (e.g. `fire_alarm_detector`).
2. Add an adapter via the `adapter(systemKey, fields)` helper with the exact
   canonical `fieldPath -> caption` map for that system's Poor-capable fields.
3. Implement / inherit: `isCanonicalFieldPath`, `derivePoorFieldPaths`
   (from the CURRENT response — see Frozen Manifest), `ownPoorRemark`,
   `acceptedEvidenceCaption`.
4. Register the adapter in the adapter map.
5. The DB `CHECK` constraints in migration `018_v7_shared_staged_evidence.sql`
   already permit `fire_alarm_detector`, `co2_fire_extinguisher`,
   `wet_chemical`. Storage checks do not decide authorization — the runtime
   adapter does. Add a new system key to migration 018's CHECK lists (a new
   forward migration if 018 is already applied downstream), never to 017.
6. Wire the web form (`apps/web/src/<system>/`), the sync path
   (`apps/api/src/sync/<system>FormInstanceSync.ts` — mirror
   `co2FormInstanceSync.ts`), Accepted Detail
   (`acceptedMasterSystemDetail.ts`), and the Final Report
   (`reports/finalServiceReport.ts`).
7. Additive only. If the system already has a V6 (or earlier) accepted path
   (Fire Alarm), that path stays byte-for-byte unchanged and is selected for
   Jobs frozen to the older version.

---

## Frozen Manifest

The manifest is the immutable list of Poor evidence a Pending record commits
to. Manifest entry shape (see `co2FormInstanceSync.ts` `manifestKeys`):
`{ photoUuid, fieldPath, sourceSha256 }`.

1. On first Submit Local, freeze the manifest by DERIVING it from the CURRENT
   Poor set of the response — the set of fields whose value is `poor` right
   now. Never build it by enumerating every V7 attachment Blob in IndexedDB.
2. If a field was Poor with a photo and is then changed to `good` or
   `not_relevant` before freeze, that photo is stale: it must NOT enter the
   frozen manifest, must NOT create an evidence outbox item, and must NOT
   block acceptance. The Blob may remain in IndexedDB but is not authoritative.
3. Two Poor fields A and B, then A becomes `good` -> the manifest contains
   only B's evidence.
4. Once a Pending record is frozen, later Draft edits must not mutate the
   frozen response or the frozen manifest. A server-rejected parent may return
   to correction Draft and reuse the same parent/photo outbox operation IDs,
   but the evidence set cannot change (repository transactions forbid it).
5. The server rejects an acceptance whose staged evidence does not match the
   frozen manifest exactly (no missing, no extra).

---

## Evidence-First Sync Ordering

1. Save the business record and its outbox item to IndexedDB in one
   transaction before any API call (see `offline-first-pwa`,
   `indexeddb-data-model`).
2. The sync coordinator resolves evidence BEFORE the parent form instance:
   each Poor photo is staged first, then the parent JSON is accepted.
3. Evidence staging is authenticated multipart to `POST /api/inspection-attachments`
   (V6) / the V7 staged-evidence route. JPEG only. The server normalises the
   image and records both `sourceSha256` (bytes as uploaded) and
   `storedSha256` (normalised bytes).
4. Staging is idempotent on `photoUuid` + a canonical `request_fingerprint`
   over the immutable identity. Re-staging identical bytes returns
   `duplicate`; different bytes for the same `photoUuid` returns
   `IDEMPOTENCY_CONFLICT`. A different photo for an occupied field returns
   `EVIDENCE_FIELD_OCCUPIED`.
5. Staged rows live in `staged_inspection_evidence` with `status='staged'`.
   Session ownership is reserved per location in
   `inspection_evidence_reservations`, keyed by `inspection_client_uuid`.
6. A network timeout is an unknown result, never a rejection. Retry the exact
   same UUIDs. Do not mark anything synced until the server confirms the exact
   UUID.

---

## Atomic Acceptance

1. Acceptance of one location's parent form runs in a single DB transaction
   and is all-or-nothing: parent form instance + binding every manifest photo
   from `status='staged'` to `status='accepted'` (setting `form_instance_id`,
   `accepted_at`). If any part fails, the whole acceptance rolls back.
2. Check ordering inside the transaction (this is the P1-2 fix — keep it):
   a. If a form instance for this `clientUuid` already exists and matches the
      incoming data -> return the SAME accepted authority (idempotent success),
      even if the Job is now closed.
   b. Only if there is no matching existing acceptance, enforce Job-open:
      a genuinely new acceptance against a closed Job is rejected `JOB_CLOSED`.
   c. Foreign / unknown Job access -> `JOB_ACCESS_DENIED` (existence oracle:
      unknown and forbidden must be indistinguishable).
3. Acceptance verifies the frozen V7 contract is still the confirmed
   definition (`CONTRACT_MISMATCH` otherwise) and that the reservation belongs
   to the same authority (`EVIDENCE_NOT_STAGED` otherwise).
4. After acceptance the record is immutable forever.

---

## Evidence Uniqueness Scope

1. Uniqueness scope is `jobId` + `systemKey`. Within one Job+system, an
   accepted binding must be unique on each of `photoUuid`, `sourceSha256`,
   `storedSha256`. The same image bytes must not back two different Poor
   fields or two different locations in the same Job+system.
2. A DIFFERENT Job may reuse the same image bytes. There is no global or
   historical image uniqueness.
3. Staging stays reusable (not scoped) until acceptance. Only accepted
   bindings are scoped — enforced by partial unique indexes in migration 018:
   `staged_inspection_evidence(job_id, system_key, source_sha256)` and
   `(job_id, system_key, stored_sha256)` `WHERE master_template_version=7 AND
   status='accepted'`.
4. Acceptance must also guard transactionally against a concurrent race: two
   parallel acceptances that both pass the pre-check must not both bind — at
   most one Accepted (the other fails and retries safely). A partial unique
   index alone is necessary but the acceptance path must translate the
   `23505` into a safe, retryable failure, not a 500.
5. Migration `017*` is frozen. All V7 schema changes go in migration 018 (or a
   later forward migration). Never edit 017. Never rewrite an applied
   migration.

---

## Authority Chain (Accepted Detail / Final Report / PDF)

The Final Report and its PDF may be built ONLY from:

- a completed Job;
- the frozen configuration snapshot;
- the frozen template / contract;
- the Accepted server-side form instance;
- the bound Accepted evidence (`status='accepted'` staged rows).

They must NEVER read from: a Draft, a Pending record, staged-but-unbound
evidence, the mutable current template, or the IndexedDB draft.

Accepted Detail returns the frozen response plus the bound evidence for
viewing. A Poor field's accepted photo is served from its bound stored file.
The PDF embeds the accepted photo bytes (assert the image is actually present
in the generated PDF, not just referenced).

---

## Test Environment

1. Integration tests use the disposable Postgres at `127.0.0.1:55432`
   (database `phase8f_v6_integration`). Start it if it is down. V7 integration
   tests SKIP when it is absent — a skip is not a pass.
2. Never point tests at the runtime Postgres (`inspection_pwa-postgres-1`,
   container-internal `5432`). Never use the Docker internal hostname
   `postgres:5432` from the Windows host.
3. Never run `docker compose down -v`, `docker volume rm`, or
   `docker system prune`. The runtime/client database must never be used for
   integration tests, and vice versa.

---

## Prohibited Patterns

- Do not mutate a published template version, or auto-upgrade an existing
  Job/Draft/Pending/Accepted to a new version.
- Do not build the frozen manifest by enumerating all attachments; derive it
  from the current Poor set.
- Do not let a stale photo (field flipped Poor -> Good / Not Relevant) enter
  the manifest or the outbox.
- Do not make evidence uniqueness global or historical; scope it to
  `jobId + systemKey`.
- Do not return `JOB_CLOSED` for an exact idempotent retry of an already
  accepted record.
- Do not treat a network timeout as a server rejection.
- Do not read Draft / Pending / current-template data into a Final Report.
- Do not change `Normal/Test/Isolation` semantics.
- Do not touch the V6 Fire Alarm path when adding Fire Alarm V7.

---

## Acceptance Tests

For any change in this path, prove (per relevant system: CO2, Wet Chemical,
Fire Alarm V7):

1. Good / Poor / Not Relevant all persist; Normal/Test/Isolation unchanged.
2. Poor field: own remark + own photo captured offline; saved to IndexedDB.
3. Save Draft -> reload (IndexedDB) -> values and photo intact.
4. Poor + photo -> change field to Good, then to Not Relevant -> Save Draft ->
   reload -> Submit -> the new value is kept and the stale photo does not
   enter the frozen manifest, creates no outbox item, and does not block
   acceptance.
5. Two Poor (A, B) -> A becomes Good -> manifest contains only B's evidence.
6. Offline Submit -> reconnect -> evidence stages first (per-part success) ->
   parent acceptance is atomic.
7. Exact retry after Job closure -> same Accepted authority, not JOB_CLOSED.
   A genuinely new acceptance on a closed Job -> rejected.
8. Same source hash and same stored hash reused across locations in one
   Job+system -> REJECTED. Same bytes in a different Job -> ALLOWED.
9. Concurrent duplicate acceptance race -> at most one Accepted.
10. Frozen Pending stays immutable under later Draft edits.
11. Accepted Detail shows the frozen response and the bound accepted photo.
12. Final Report + PDF build only from the frozen/Accepted authority; the PDF
    contains the embedded photo bytes.
13. Historical baselines still pass and their files are unchanged:
    V1–V5, Fire Alarm V6, CO2 V1, Wet Chemical V4.
