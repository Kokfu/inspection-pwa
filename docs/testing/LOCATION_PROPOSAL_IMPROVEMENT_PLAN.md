# Location Proposal Improvement Plan

Created 2026-10-19. Owner decisions: **approve-with-edits and technician withdraw are IN scope (a
migration is accepted)**; **a rejected proposal must be resubmittable by the same technician**.

Governs: technician "Add a New Location" / "Save as format" proposals, the Supervisor/Admin review inbox,
and the phone read-back of decisions. Read with `.agents/skills/codex-task-brief/SKILL.md` (standing rules,
no git), `sync-engine`, `backend-api-security`, `indexeddb-data-model`, `mobile-first-ui`.

---

## 1. Current flow (baseline, so the changes are unambiguous)

Technician drafts a patch (`add-location` or `update-format`) in IndexedDB -> `Pending` + outbox item ->
`POST /technician/customers/:customerId/systems/:systemKey/location-proposals` (idempotent on the client UUID,
one pending per customer + system + target location) -> Supervisor/Admin inbox
(`ManagerLocationProposals.tsx`) -> `POST /manager/location-proposals/:id/decision` (approve = re-read current
configuration, merge, new revision; reject = note required) -> next visit freezes the new configuration.
Status is derived from append-only decision rows (`locationProposal.ts`); both decisions are terminal today.

Key files: `apps/api/src/routes/locationProposals.ts`, `apps/api/src/inspections/locationProposal.ts`,
`apps/api/src/inspections/locationConfiguration.ts`, `apps/web/src/manager/ManagerLocationProposals.tsx`,
`apps/web/src/jobs/TechnicianLocationProposal.tsx`, `apps/web/src/jobs/technicianLocationProposalDraft.ts`,
`apps/web/src/jobs/SingleInstanceFormatAction.tsx`, `apps/web/src/inspectionControls/rowLayoutProposal.ts`,
`apps/web/src/manager/managerApi.ts`, `apps/web/src/referenceData/referenceDataApi.ts`.

---

## 2. Problems -> changes

| # | Problem | Change |
|---|---|---|
| P1 | Reviewer sees raw keys/UUIDs and no idea what changed | Plain names, visit reference, before/after diff |
| P2 | Approve can fail with a bare 409 when the target went stale | "Can this still be approved?" check up front; Approve disabled with the reason |
| P3 | Technician never learns approved/rejected, or why | Read-back of decisions on the job screen; rejected -> "Revise and resubmit" (new UUID) |
| P4 | Reviewer cannot fix a small mistake, only reject | Approve with edits (original payload kept, applied patch recorded) |
| P5 | Technician cannot cancel a wrong proposal | Withdraw while pending (server) / discard before sync (local) |
| P6 | Held-behind-pending message is vague | Name what it is waiting on and since when |
| P7 | List endpoint is N+1 and filters status in JS | One SQL query |
| P8 | No pending count for reviewers | Badge/count on the reviewer home |
| P9 | Both pages look different from the rest of the app | Redesign onto the shared page template (section 5) |

---

## 3. Server contract (decided up front so the UI work can run in parallel)

### 3.1 Migration `056_location_proposal_edit_withdraw.sql` (the only migration)
Append-only triggers stay in place; only DDL changes.
- `customer_location_proposal_decisions.decision` CHECK -> `('approved','rejected','withdrawn')`.
- `decided_by_role` CHECK -> `('admin','supervisor','inspector')` (a withdraw is decided by the submitting technician).
- `ALTER TABLE ... ADD COLUMN applied_patch JSONB NULL` -- set only on an approve that differs from the submitted payload.
- Existing rows untouched. The pending-slot query already uses `NOT EXISTS decision`, so a withdrawn or rejected
  proposal frees its target automatically (this is what makes resubmission legal with no further server change).
- Verify the real auto-generated CHECK constraint names against the database before dropping them.

### 3.2 Status model
`LocationProposalStatus = "pending" | "approved" | "rejected" | "withdrawn"`; `deriveLocationProposalState`
stays highest-`sequence`. A decision with non-null `appliedPatch` is "approved with changes".

### 3.3 Endpoints
| Endpoint | Change |
|---|---|
| `GET /manager/location-proposals` | One SQL query; status filter in SQL; adds `systemDisplayName`, `jobReference`, `counts` per status |
| `GET /manager/location-proposals/:id` | Adds `currentRows` / `currentLocation` (live configuration), `mergeable: true \| { reason }` (dry-run of `applyLocationProposalPatch`, read-only) |
| `POST /manager/location-proposals/:id/decision` | Adds optional `appliedPatch`. Must pass `parseLocationProposalPatch`, same `kind`, `locationKey`, `systemKey` as the original. Row edits may change text and remove rows; they may not add rows. Included in the idempotency fingerprint |
| `GET /technician/location-proposals?jobId=` (new, separate router file) | Caller's own proposals only; status, decision note, `edited` flag, applied patch. `Cache-Control: private, no-store` |
| `POST /technician/location-proposals/:id/withdraw` (new) | Own proposal, pending only, `requestId` idempotent, writes a `withdrawn` decision + audit event. Online only (server-confirmed) |

Rules that must survive: authentication on every route, strict key validation, fail closed on malformed data,
Approve still re-reads fresh configuration under the customer row lock, no decision can be re-decided.

### 3.4 Phone (no Dexie schema change)
- Decision status is fetched when online and held in memory; offline shows the last local state with a plain
  "Status needs a connection" line. It never claims approved/rejected from stale data.
- "Revise and resubmit" creates a new draft (new `crypto.randomUUID()`) prefilled from the rejected/withdrawn
  patch. The old draft stays untouched.
- "Discard before sync" removes a local `Pending`/`Failed` draft and its outbox item in one transaction, and only
  if the outbox item is not `Syncing`. A server-confirmed proposal uses Withdraw instead.
- Any new local field lives inside the existing `drafts` payload and is validated by `valid()`.

---

## 4. Work breakdown and what can run together

Files each task may touch are exclusive. Two tasks never edit the same file.

| Task | Scope | Owns (exclusive files) | Depends on |
|---|---|---|---|
| **W0** | Migration 056, status model, all server endpoints in 3.3, list SQL, mergeable dry-run, client API functions and types, server tests | `apps/api/migrations/056*`, `apps/api/src/routes/locationProposals.ts`, new `technicianLocationProposals.ts` router + its mount line in `server.ts`, `inspections/locationProposal.ts`, `inspections/locationConfiguration.ts` (only if a helper is needed), `apps/web/src/manager/managerApi.ts`, `apps/web/src/referenceData/referenceDataApi.ts`, API tests | none |
| **W1-A** | Reviewer page redesign: list, detail, diff, mergeable gate, approve-with-edits, tabs with counts | `ManagerLocationProposals.tsx`, new `managerLocationProposals.css`, new diff helper + test | W0 |
| **W1-B** | Technician page redesign: step layout, "your proposals on this visit" list with decisions, withdraw, discard, revise-and-resubmit, better held message | `TechnicianLocationProposal.tsx`, `technicianLocationProposalDraft.ts`, `SingleInstanceFormatAction.tsx`, `rowLayoutProposal.ts` (+ `rowLayout.ts` only if the held decision needs it), `useLocationProposalOutboxStatuses.ts`, new `technicianLocationProposal.css`, web tests | W0 |
| **W1-C** | Reviewer home pending badge | `ManagerHome.tsx` (badge only), `roleAccess.ts` only if a nav label is needed | W0 |
| **W2** | Integration review, three-viewport browser checks, accessibility/UI audit, docs, regression | docs, `USER_GUIDE.md`, `HANDOVER.md`, test fixes | W1-A, W1-B, W1-C |

### Run order
```
W0 (serial, first)
   |
   +--> W1-A  --\
   +--> W1-B  ----> W2 (serial, last)
   +--> W1-C  --/
```
- **W0 must finish first.** Every other task consumes its contract, and it owns the shared files
  (`locationProposals.ts`, `managerApi.ts`, `referenceDataApi.ts`). Splitting it would put two sessions in the
  same files.
- **W1-A, W1-B and W1-C run at the same time.** They share no files. CSS is the usual collision, so each owns its
  own new stylesheet and uses only `:root` tokens from `app.css` (read-only for them).
- **W2 runs last** because it verifies the combined result and updates shared docs.
- Not parallelisable: W0 pieces among themselves (same two server files), and anything touching `app.css`. If a
  missing token is found, W2 adds it once, not three parallel tasks.

Because all sessions share one checkout (git is manual, no branches), each W1 prompt repeats: touch only your
exclusive files, commit nothing, switch no branch. The tree already holds unrelated uncommitted work
(`VisitReference.tsx` and the system forms): leave those files alone.

### Order of value if time is short
W0 -> W1-B (technician feedback, biggest daily win) -> W1-A -> W1-C -> W2.

---

## 5. Page template (applies to W1-A and W1-B)

Match the existing manager/technician pages, not a new look. Reuse these existing patterns and classes:

- **Page shell:** `<section className="manager-home" aria-labelledby=...>` + `workspace-heading` (eyebrow, `h2`, one
  short sentence) as in `ManagerCommonRemarks.tsx`. Eyebrow text for the reviewer page: "Manager workspace".
- **Lists:** `job-card-list` cards (as in Service common remarks / Services pages), title = customer, second line =
  plain system name, third line = what was proposed. Replace `record-list` use here.
- **Tabs:** `job-tabs` with counts, e.g. "Pending (3)". Default to Pending.
- **Status:** text badge (Pending / Approved / Approved with changes / Rejected / Withdrawn) with the semantic token
  colour; never colour-only.
- **Detail:** `report-summary` + `job-facts` (Submitted by, Submitted, Visit reference). Never show raw UUIDs or
  keys such as `co2_fire_extinguisher`; use display names and the visit reference (`VisitReference` already exists).
  An internal reference may appear in small support text only.
- **Wording:** Supervisor/Admin labels through `reviewerRoleLabel`; plain language consistent with CR11 wording.
- **Messages:** `form-message role="alert"` for errors, `role="status"` for progress, `offline-notice` for
  informational banners, `empty-state` for empty lists. Every list has loading (skeleton sized like content),
  empty, and error states.
- **Layout:** phone first at 360px, single column. At >=768px the reviewer page becomes list on the left and detail
  on the right. On phone, opening an item shows the detail with a Back button; the primary Approve/Reject actions
  sit in a bottom action bar respecting `env(safe-area-inset-bottom)`. Only canonical breakpoints (521, 768, 1200).
- **Controls:** targets >= `var(--tap)` (44px), inputs 16px+, labels above inputs, error text under the field with
  `aria-describedby`, visible focus, no hover-only information, motion only under `prefers-reduced-motion`.
- **Reviewer diff:** added rows, removed rows, edited rows shown with text labels ("Added", "Removed", "Changed"),
  stacked cards on phone and a table on desktop. Header line shows the count change, e.g. "12 rows -> 14 rows".
- **Technician page:** one clear sequence -- choose system, name, zone, Submit for Review -- then a "Your location
  requests for this visit" list showing each request's status and the reviewer's note. Offline state is a calm
  non-blocking line; inputs and Save Draft are never disabled by being offline.

No new raw hex/px values; if a token is missing, add it to `:root` once (W2) and say why.

---

## 6. Verification

Per `AGENTS.md`: W0 is **Level 2** (data integrity and auth); W1-A/B/C are Level 1 plus the UI checks; W2 is
Level 2 across the combined change. Release-level (Level 3) items are not claimed.

### W0 gates
- API `typecheck`, `build`, unit tests for `locationConfiguration` / `locationProposal`, and the location-proposal
  integration tests against the **disposable Postgres on 127.0.0.1:55432 only** (never the runtime database;
  skipped is not passed).
- New tests: withdraw by owner / by another technician (404) / after a decision (409) / replay; approve with
  `appliedPatch` (accepted, wrong kind or key refused, row-add refused, replay and reused-requestId cases);
  `mergeable` for each failure reason; technician read returns only own proposals; list status filter in SQL;
  resubmission after reject and after withdraw; concurrent approve and withdraw serialises.
- `legacyLocationProposalRejection.test.ts` and `locationProposals.integration.test.ts` still pass unchanged.
- Migration applies cold on an empty database and on a database with existing proposals and decisions.
- `git diff --check`.

### W1 gates
- Web `typecheck`, `build`, the existing specs for the touched screens
  (`supervisor-location-proposals`, `location-proposals-unreadable`, `technician-location-proposal-*`,
  `layout-proposal-already-pending`, `header-proposal-sync-summary`, `manager-supervisor`) updated and passing.
- New tests: diff helper, status overlay never claims a decision offline, revise-and-resubmit makes a new UUID,
  discard refuses a `Syncing` item, sync of the original is untouched.
- Browser check at 360x800, 768x1024, 1280x800: no horizontal scroll, targets >= 44px, focus visible, primary
  action visible without zoom. Screenshots phone + desktop.
- Do not weaken any existing validator or test to make it pass.

### W2 gates
- Everything above re-run together; `web-design-guidelines` audit on the changed files;
  `vercel-react-best-practices` pass on the two components.
- Offline checks that can be done in the browser harness are labelled as harness checks. Do **not** claim a real
  phone, PWA force-close or physical offline test unless it was actually performed.

---

## 7. Definition of Done (each task reports this table)

| Item | Evidence |
|---|---|
| Files changed (and confirmation of no files outside the exclusive list) | `git status --short` |
| Behaviour changed | list |
| Tests run | commands + results |
| P0 / P1 / P2 findings | list |
| Limitations | list |
| Ready for next checkpoint | yes/no and why |

A task is not complete with an open P0 or P1 in its scope. P2 is deferrable only when documented.

---

## 8. Prompts

Common header for every prompt:

> `cd C:\PWA_OfflineRecordWebApp`. Follow `.agents/skills/codex-task-brief/SKILL.md` standing rules (no git
> mutations, stop before staging, no scope widening, report honestly). Read `docs/testing/LOCATION_PROPOSAL_IMPROVEMENT_PLAN.md`
> sections 1-3, 5-7 and the skills named below before editing. Leave unrelated uncommitted files
> (`apps/web/src/jobs/VisitReference.tsx`, the `*InspectionForm.tsx` files, `RepairVisitForm.tsx`) untouched.

### W0 prompt
> TASK W0: implement section 3 of the plan. Skills: `backend-api-security`, `sync-engine`, `indexeddb-data-model`.
> Inspect first: `locationProposals.ts`, `locationProposal.ts`, `locationConfiguration.ts`, `048_customer_location_proposals.sql`,
> `managerCustomers.ts` (`loadConfiguration`, `applyManagerLocationsUpdate`), `managerApi.ts` (`loadLocationProposals`,
> `decideLocationProposal`, `LocationProposal` types incl. the unreadable-item handling), `referenceDataApi.ts`.
> Do: migration 056 (verify real constraint names; additive; append-only triggers kept); `withdrawn` status; list in one SQL
> query with status filter in SQL; `GET :id` adds `currentLocation` and `mergeable`; decision route accepts `appliedPatch`
> with the validation in 3.3 and fingerprint coverage; new technician read + withdraw routes in a new router file;
> add `systemDisplayName` and `jobReference` to proposal responses (find where the display name and visit reference
> already come from; do not invent them); mirror all of it in the web client API types/functions with strict response
> validation (fail closed, keep the existing "unreadable proposal" behaviour). Do NOT touch any React component.
> Level 2 verification. DoD additions: the migration test on cold and populated databases; the test list in section 6 W0.

### W1-A prompt (parallel with W1-B and W1-C; starts after W0 reports done)
> TASK W1-A: redesign `ManagerLocationProposals.tsx` on the section 5 template and add the diff, the mergeable gate and
> approve-with-edits. Skills: `mobile-first-ui`, `vercel-react-best-practices`, `web-design-guidelines`.
> Exclusive files: `ManagerLocationProposals.tsx`, new `managerLocationProposals.css`, a new pure diff helper + its test, and
> the existing specs for this screen. Use only the W0 client API; if something is missing, stop and report it, do not edit
> `managerApi.ts`. Editing: `add-location` -> name and zone; `update-format` -> edit text and remove rows, no adding rows;
> an edited approval shows "Approved with changes" and keeps the original visible. Reject keeps the required note.
> Touch only your exclusive files, commit nothing, switch no branch. Verify at 360/768/1280 with screenshots.

### W1-B prompt (parallel)
> TASK W1-B: redesign the technician side per sections 3.4 and 5. Skills: `offline-first-pwa`, `indexeddb-data-model`,
> `sync-engine`, `mobile-first-ui`. Exclusive files: `TechnicianLocationProposal.tsx`, `technicianLocationProposalDraft.ts`,
> `SingleInstanceFormatAction.tsx`, `rowLayoutProposal.ts`, `useLocationProposalOutboxStatuses.ts`, new
> `technicianLocationProposal.css`, and their tests. No Dexie schema/version/index change. Add: "Your location requests for
> this visit" list with decision status and note; Revise and resubmit (new UUID); Withdraw (online, server-confirmed);
> Discard before sync (transactional, refuses `Syncing`); a clearer held-behind-pending message. Offline must never disable
> inputs, Save Draft or Submit; a decision is never shown from stale data without saying so.
> Touch only your exclusive files, commit nothing, switch no branch. Verify at 360/768/1280.

### W1-C prompt (parallel; small)
> TASK W1-C: show a pending-proposal count on the reviewer home (Supervisor/Admin only), using the W0 counts. Exclusive file:
> `ManagerHome.tsx` (badge only) and `roleAccess.ts` only if a label is needed. Technicians must not see it or call it.
> Count failure must never block the home screen. Touch only those files, commit nothing.

### W2 prompt (after A, B and C)
> TASK W2: integration review and polish. Re-run all section 6 gates together; fix only defects in the three W1 outputs
> and W0 (report each); add the single missing `:root` token if any; update `docs/client/USER_GUIDE.md` and `HANDOVER.md`;
> produce the P0/P1/P2 table and a "what was and was not tested" list (harness vs. real phone). Then hand a Sol review
> brief per the codex-task-brief skill.

---

## 9. Risks and open points

- **Migration on a populated runtime database:** constraint names must be confirmed before drop. Owner applies it to
  the client PC; this plan only creates the file and tests it on the disposable database.
- **Withdraw is online-only** by design (it must be server-confirmed). Offline the technician can only discard an
  unsynced draft. If a proposal syncs just after a discard attempt, the discard refuses and the UI says why.
- **Approve with edits widens reviewer power.** The original payload is immutable and shown next to the applied one;
  the audit event records that an edit happened.
- **Verify first (W0):** where the visit reference and system display name are available on the server, and whether the
  existing `LocationProposal` client parsing needs a version-tolerant path for old rows.
- **Parallel sessions share one working tree.** The exclusive-file rule is the only protection; W2 checks
  `git status --short` for stray edits.
