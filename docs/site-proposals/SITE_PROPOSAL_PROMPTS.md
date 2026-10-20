# Site proposals — build steps and prompts

Goal: a technician can add a new site while creating a New Service Visit. The site is saved as **pending**,
the visit proceeds, and an admin/supervisor approves it (site becomes permanent and appears in that customer's
dropdown for everyone) or rejects it (site is simply not saved permanently; the visit stays as it is).
A manager can later **archive** a site that is no longer used (and restore it).

## Owner decisions (2026-10-20)

- A pending site proposed by another technician is NOT selectable. Dropdown = active sites only, until approved.
- The visit proceeds while the site is unapproved (existing server design).
- Rejection leaves the visit untouched on its (inactive) site. Rejection only means the site is not added to the
  customer's permanent list.
- Archive/restore is a manager action. Archived sites disappear from the dropdown; old visits/reports keep the name.

## What already exists (do not rebuild)

- Migration 050 `customer_site_proposals` + `customer_site_proposal_decisions` (append-only). No new migration needed.
- `POST` create-service-visit accepts `siteId` XOR `newSite {displayName, address}` (technician role only), see
  `apps/api/src/routes/inspectionJobs.ts` (~L139) and `apps/api/src/jobs/serviceVisits.ts` `resolveTypedSite`.
  Typed site is inserted `is_active=false`; same-name ACTIVE site -> 409 `SITE_ALREADY_EXISTS` with `existingSiteId`;
  same-name PENDING site is reused.
- Reviewer API (admin + supervisor): `GET /manager/site-proposals`, `GET /manager/site-proposals/:id`,
  `POST /manager/site-proposals/:id/decision` in `apps/api/src/routes/siteProposals.ts`.
- Status is DERIVED from the decision log (`apps/api/src/inspections/siteProposal.ts`), not from `is_active`.
- Pattern to copy for UI: location proposals (`ManagerLocationProposals.tsx`, `managerLocationProposals.css`,
  `managerApi.ts`, `roleAccess.ts`, `ManagerHome.tsx`, `App.tsx`).

## Order and concurrency

```
Wave 1 (run these 3 at the same time — disjoint files)
  S1  Technician "Add new site"            web: NewServiceVisit.tsx, jobApi.ts (+ job card badge)
  S2  Manager site-proposal review page    web: new ManagerSiteProposals.tsx + css, managerApi.ts,
                                                roleAccess.ts, ManagerHome.tsx, App.tsx
  S3a Archive / restore site — API only    api: managerCustomers.ts (+ tests)

Wave 2 (after S2 and S3a are reviewed — S3b shares managerApi.ts with S2 and needs the S3a endpoint)
  S3b Archive / restore — manager UI       web: managerApi.ts, ManagerCustomerConfiguration.tsx

Wave 3 (separate decision, only if wanted)
  S4  Offline "add new site"               touches sync/offline — do NOT start without a design review
```

File-overlap check for Wave 1: S1 touches `jobApi.ts`/`NewServiceVisit.tsx`; S2 touches manager files incl.
`managerApi.ts`; S3a touches only API files. No shared file, so all three are safe in parallel. Keep them in the
same checkout only if each agent edits ONLY its listed files; otherwise use separate worktrees.

Review: run the **Review prompt** (bottom) once per step after it reports, or once for the whole wave.

---

## Standing rules (paste at the top of EVERY prompt below)

```
Project: Inspection PWA (C:\PWA_OfflineRecordWebApp). Read AGENTS.md first.
Read applicable skills before editing: .agents/skills/backend-api-security, .agents/skills/mobile-first-ui,
.agents/skills/offline-first-pwa (and sync-engine / indexeddb-data-model only if you touch them).
- Git is mine. Never stage, commit, push, merge, reset, restore, switch branch or touch stash. Stop before staging.
- Do NOT change: Postgres migrations/schema, Dexie schema/version/indexes, package-lock, Docker/Caddy/.env,
  client-material/. No migration is needed for this work; if you think one is, STOP and report instead.
- Inspect the existing implementation first; copy proven patterns (location proposals) rather than inventing.
- Smallest change, no unrelated refactor, existing behaviour unchanged unless stated.
- Validation fails closed; no silent fallback; do not weaken any existing test.
- Add focused regression tests for what you change.
- Gates: focused tests, relevant regression tests, typecheck, build if web changed, `git diff --check`.
- Final report: files changed, behaviour changed, tests run (with results), P0/P1/P2 findings, limitations,
  readiness for next step. Do not claim a phone/offline/browser test you did not perform.
```

---

## S1 — Technician "Add new site" (Wave 1, parallel)

Files you may edit: `apps/web/src/jobs/NewServiceVisit.tsx`, `apps/web/src/jobs/jobApi.ts`, job-card/list display
files only if needed for the pending badge, one new/updated Playwright spec (`apps/web/tests/`), CSS if needed.
Do NOT edit manager files, `managerApi.ts`, or any API file.

S1 review-fix exception authorized by the owner on 2026-10-20: `App.tsx` may carry the
creation confirmation through the existing callback with visit-scoped state, and
`TechnicianHome.tsx` may announce that message as an accessible status. Extend the
existing S1 spec to cover the real App navigation. These small integration changes
share `App.tsx` with S2; preserve and review the S2 hunks separately. The prompts and
handover may record this exception and its verification results.

```
<paste Standing rules>

TASK S1 — Technician can add a new site on New Service Visit.

Read first: apps/web/src/jobs/NewServiceVisit.tsx (Site <select> ~L255, submit ~L220), jobApi.ts createServiceVisit,
apps/api/src/routes/inspectionJobs.ts (~L139-170: body is siteId XOR newSite {displayName,address}),
apps/api/src/jobs/serviceVisits.ts resolveTypedSite (409 SITE_ALREADY_EXISTS carries existingSiteId).

Behaviour:
1. Under the Site dropdown add a "+ Add new site" control (same style as "+ Add New Customer"). It opens inline
   fields: Site name (required, maxLength 160) and Site address (optional, maxLength 500). Only enabled once a
   customer is selected.
2. While adding a new site, siteId is cleared and the typed site is sent as `newSite` (never both). Cancel returns to
   the dropdown. canCreate must accept EITHER a selected siteId OR a non-empty trimmed new site name.
3. The dropdown still lists ACTIVE sites only. Do not show pending sites from anyone.
4. Online only: when `offline` is true, disable "+ Add new site" and explain "Adding a new site needs a connection."
   Do not change the offline creation path (createLocalServiceVisit) or any Dexie schema.
5. Handle 409 SITE_ALREADY_EXISTS: show "This site already exists — choose it from the list", select
   `existingSiteId` in the dropdown (refresh the site list first if it is not present), and leave the form editable.
6. Keep the idempotent requestId behaviour exactly as for the existing path (retry must not create a 2nd site).
7. Pending visibility: inspect how the job list/card gets the site name. If the API response already tells you the
   site is not active/pending, show a small "Site pending approval" badge on that visit. If it does NOT, do not
   change the API: show a one-time confirmation message after Create ("Site sent for approval. Your visit
   continues.") and report the missing field as a limitation for a follow-up.
8. Trim and collapse whitespace of the typed name client-side for display only; the server remains the authority.

Tests: Playwright mock spec (copy the pattern of apps/web/tests/new-service-visit-site-hint.spec.ts): request body
has newSite and no siteId; both-selected is impossible; 409 selects the existing site; offline disables the control;
existing select-site flow unchanged. Run web typecheck, build, the new spec, and the existing new-service-visit specs.
```

## S2 — Manager review page for site proposals (Wave 1, parallel)

Files you may edit: new `apps/web/src/manager/ManagerSiteProposals.tsx` (+ css), `managerApi.ts`, `roleAccess.ts`,
`ManagerHome.tsx`, `apps/web/src/App.tsx`, a new Playwright spec. Do NOT edit API files, `NewServiceVisit.tsx`,
`jobApi.ts`, or `ManagerCustomerConfiguration.tsx`.

```
<paste Standing rules>

TASK S2 — Admin/supervisor page to review technician-proposed sites.

Read first: apps/api/src/routes/siteProposals.ts (GET list, GET :id, POST :id/decision - read the exact request/
response shapes, request id + idempotency, reject-note rule), apps/api/src/inspections/siteProposal.ts, and copy the
structure of apps/web/src/manager/ManagerLocationProposals.tsx, its css, and how managerApi.ts / roleAccess.ts /
ManagerHome.tsx / App.tsx wire it (route, nav entry, role gate: admin + supervisor).

Behaviour:
1. New manager page "Site Requests" (nav + route + role gate identical to Location Proposals). Pending count badge
   if the location page has one.
2. List: customer, proposed site name, proposed address, submitted by, submitted at, status (pending / approved /
   rejected). Pending first. Mobile-first layout per .agents/skills/mobile-first-ui.
3. Detail/decision: Approve (optional note) and Reject (note REQUIRED, min 3 chars, same bound as the API).
   Use a stable crypto.randomUUID() request id per decision attempt and reuse it on retry (idempotent).
   Show the server's response; refresh the list from the server after a decision. Do not mark anything decided
   from HTTP 200 alone — re-read the proposal status.
4. Handle server refusals with plain messages: already decided, name now taken by an active site (409), not found.
5. Wording: Approve = "Add to customer's sites". Reject = "Do not add". Explain on screen that rejecting does not
   change the technician's visit.
6. Do not add edit-on-approve in this step (approve uses exactly what the technician typed, as the API does).

Tests: Playwright mock spec (pattern: apps/web/tests/supervisor-location-proposals.spec.ts): list renders,
approve sends correct body + same request id on retry, reject without note blocked client-side, reject with note
works, role gate (inspector cannot reach the page), error states. Run typecheck, build, new spec, existing
manager/location-proposal specs.
```

## S3a — Archive / restore a site, API only (Wave 1, parallel)

Files you may edit: `apps/api/src/routes/managerCustomers.ts` (and its `*.test.ts` / integration test). Nothing in
`apps/web`. No migration.

```
<paste Standing rules>

TASK S3a — Manager API to archive and restore a customer site.

Read first: apps/api/src/routes/managerCustomers.ts (site routes ~L899-932; loadManagerCustomer ~L482 lists sites),
apps/api/src/inspections/siteProposal.ts (status derives from the decision log, not is_active),
apps/api/src/jobs/offlineServiceVisits.ts (~L76 reads is_active at sync time),
apps/api/src/repairVisits/repairVisitWrites.ts (~L54 requires an active site), inspectionReference.ts (~L239).

Add, role admin only (same as the other site routes), exact-body validation, audit_events, single transaction:
1. POST /manager/customers/:customerId/sites/:siteId/archive  -> sets is_active=false. Only for a site that is
   currently active. Idempotent: archiving an already archived (non-pending) site returns the same success shape.
2. POST /manager/customers/:customerId/sites/:siteId/restore  -> sets is_active=true. Only for a site that was
   archived, i.e. NOT a pending or rejected proposal site (derive status with siteProposal.ts; pending/rejected
   sites must be refused — they are handled only by the proposal decision route). Refuse 409 if an ACTIVE site of
   the same normalised name already exists for the customer.
3. Archive must not delete or rewrite anything: existing visits, reports and PDFs keep the site name (they join
   customer_sites; confirm nothing filters on is_active when rendering history — report any place that does).
4. Return the refreshed manager customer in the same shape as the other site routes. Make sure the manager customer
   payload exposes enough to show archived sites separately (e.g. include archived sites flagged `archived: true`
   but ONLY if this does not change existing consumers; otherwise add a separate field and report it). Pending and
   rejected proposal sites must not appear as "archived".
5. Block archiving the customer's LAST active site? Do NOT decide — implement no block, and report the consequence
   for new-visit creation as a limitation.
6. Investigate and REPORT (do not fix unless trivial and in scope): what happens to an offline-created visit and
   to a repair visit for a site archived before it syncs (offlineServiceVisits.ts ~L76, repairVisitWrites.ts ~L54).

Tests (unit + the existing disposable-Postgres integration pattern): archive hides site from
GET reference sites and from createServiceVisit(siteId) ; restore brings it back; restore refused on name clash;
pending/rejected proposal site cannot be archived/restored via these routes; non-admin 403; unauthenticated 401;
idempotent replay; audit rows written; old job still resolves its site name. Run api typecheck, the touched tests,
and the existing managerCustomers + siteProposals + serviceVisits tests.
```

## S3b — Archive / restore, manager UI (Wave 2 — after S2 and S3a are reviewed)

Files you may edit: `apps/web/src/manager/managerApi.ts`, `ManagerCustomerConfiguration.tsx`, its spec.
Starts only after S2 is merged (shared `managerApi.ts`) and S3a's response shape is known.

```
<paste Standing rules>

TASK S3b — Manager UI to archive and restore sites.

Read first: apps/web/src/manager/ManagerCustomerConfiguration.tsx (site list, add site, ManagerSiteAddress ~L237),
managerApi.ts (createManagerCustomerSite, saveCustomerSiteAddress), and the S3a endpoints/response shape in
apps/api/src/routes/managerCustomers.ts.

Behaviour:
1. In each active site row add "Archive" with a confirm step: "Archive <site>? It will no longer be offered when
   creating a new service visit. Existing visits and reports keep this site."
2. Show an "Archived sites" collapsed section listing archived sites with "Restore". Show the 409 name-clash message
   if restore is refused.
3. Add archiveManagerCustomerSite / restoreManagerCustomerSite to managerApi.ts, using the same error handling and
   authority-failure handling as the existing site calls. Refresh from the server response; do not trust local state.
4. If the customer would have zero active sites after archiving, show a warning in the confirm text (do not block).
5. Admin only (same gate as the add-site control). Supervisors see sites read-only as today.

Tests: Playwright mock spec: archive confirm + call + list refresh, restore, name-clash error, supervisor sees no
buttons, existing add-site/address specs still pass. Run typecheck, build, touched specs.
```

## S4 — Offline "add new site" (Wave 3, NOT started)

Out of scope until you decide. It needs a locally-stored pending site, a sync-queue item, and sync ordering
(site before visit). Ask for a design review first (sync-engine + indexeddb-data-model skills; Dexie schema is
protected). Until then the control is disabled offline (S1 item 4).

---

## Review prompt (separate session, read-only — use after each step or each wave)

```
Review the uncommitted changes for the site-proposal work ONLY. Read AGENTS.md and docs/site-proposals/SITE_PROPOSAL_PROMPTS.md
(owner decisions + the step under review: <S1 | S2 | S3a | S3b>). Do not edit files and do not use git write commands.

Check, with file:line evidence:
1. Scope: only the files listed for that step changed; nothing in Dexie schema, migrations, package-lock,
   Docker/Caddy/.env, client-material. `git diff --check` clean.
2. Owner decisions honoured: dropdown shows ACTIVE sites only (no pending from anyone); visit proceeds on a
   pending site; rejection leaves the visit untouched; archive/restore never deletes data and old reports keep the name.
3. Server authority: client never sends both siteId and newSite; client-side trimming is display-only; role gates
   (technician proposes, admin/supervisor decide, admin archives); exact-body validation; fail closed on malformed data.
4. Idempotency: stable requestId per create/decision attempt, reused on retry; no duplicate site/proposal on retry or
   double-tap; not marked decided from HTTP 200 alone.
5. Offline contract: nothing that was enabled offline is now disabled except "add new site"; offline creation path unchanged.
6. Status integrity (S3): pending/rejected proposal sites can never be shown, archived or restored as ordinary sites;
   restore refuses an active name clash.
7. UI: mobile-first sizing/touch targets, plain wording, error states, accessibility labels.
8. Tests: do they assert the behaviour above (not just render)? Any weakened or deleted existing test? Run the step's
   tests, typecheck, and build; report real results only.

Report P0/P1/P2 findings with a fix suggestion each, then "ready / not ready for next step". Do not claim a phone,
offline, or browser-restart test unless it was actually performed.
```
