# Manager dashboard, technicians, and scheduling — validation

Date: 2026-09-13. Working tree only; no staging, commits, or other Git mutations.

The original feature is implemented. The product owner authorized bundling the
contact-person/phone editing (migration 029) and service-visit cover-field
(migration 030) work into this change, so the combined workspace retains both.
Migration 028 now contains due date and phone; the later removal of contact email
is preserved. That authorization supersedes the original schema-only contact scope
and the original-only working-tree requirement.

## Definition of Done

| Gate | Result | Evidence |
|---|---|---|
| API typecheck and build | PASS | Both commands exit 0. |
| Historical matrix | PASS | 20 tests. |
| V6 evidence | PASS | 9 tests. |
| Wet Chemical definition | PASS | 2 tests. |
| V7 contracts and environment configuration | PASS | 11 tests. |
| Cold migration and startup replay | PASS | Technician integration checks migration 028 columns/index and calls the migration runner twice. |
| Technician unit and integration tests | PASS | Role rejection before DB access; password hashing; concurrent username conflict; audit rollback; inactive list rows; no admin deactivation. |
| Existing technician session rejected after deactivation | PASS | Real `/auth/login`, successful `/auth/me`, deactivation, then the same cookie receives 401; session row remains unrevoked. |
| Customer due-date routes | PASS | Set/get/clear round trips; malformed/impossible dates; missing/inactive customer; auth gates; sorted scheduled and separate unscheduled results. |
| Combined customer, service-visit, report, and location regressions | PASS | 47 focused backend tests including technician/customer tests above. |
| V6 and complete standard V7 integration set | PASS | 10 tests, zero skips, disposable PostgreSQL only. |
| Web typecheck and production build | PASS | Service worker and production assets generated. |
| V7 stale-evidence gate | PASS | 1 test. |
| Three new Playwright specs | PASS | 5 tests across technician, dashboard, and upcoming-service specs. |
| Manager auth/navigation and preserved frontend regressions | PASS | 5 additional browser tests; auth harness covers 24 scenarios. |
| Manual UI click-through | PASS | Disposable production-build instance: mobiletest login, five-card Home, create technician and see Active, deactivate and see Inactive; login after deactivation receives 401. Existing-session rejection is established separately by the integration proof above. On the resumed instance, dates saved via native date controls and rendered Mak Siti 2026-09-16 before Hokuden 2026-10-21; Current Services Done displayed both customers' closed fixture visits. |
| Historical protected-file immutability | PASS | `git diff --exit-code e30c649` for V1–V6 template files, migration 017, V6 evidence/acceptance, and V6 final-report integration file. |
| Whitespace and Git ownership | PASS | `git diff --check`; no Git mutations. Other uncommitted work preserved as requested. |
| Delivered cold verification script | PASS | Executed from cold on 2026-09-13; all commands passed, zero test skips, and its disposable container was removed. |

## Findings and limits

- P0 remaining: 0. P1 remaining: 0 within the implemented feature and exercised checks.
- P2: Vite reports the existing large-bundle warning (main JS chunk 1,477.58 kB before
  gzip, 328.07 kB gzip, per the 2026-09-17 production build).
  Deferred to frontend performance/release work; it does not block this feature checkpoint.
- The shared workspace includes separately authored changes. Validation covers builds,
  the named standard gates, and focused regressions; this is not an independent review
  of every unrelated change.
- No client runtime database, production domain, Compose/Caddy configuration, or
  production customer records were modified by this task. Manual closed visits were
  disposable fixtures, not claims of newly accepted inspection evidence.
- No physical-phone, HTTPS deployment, force-close, or offline acceptance claim is made.

## Files changed by this task

Some listed files also contain later changes explicitly preserved by the owner.

| File | Reason |
|---|---|
| `apps/api/migrations/028_manager_technicians_and_scheduling.sql` | Add due-date/contact storage and partial scheduling index; later contact-email removal preserved. |
| `apps/api/src/db/migrations.ts` | Register migration 028 with a replay guard; later 029–030 registration preserved. |
| `apps/api/src/routes/managerTechnicians.ts` | Admin-only list/create/deactivate with hashing, uniqueness, and transactional audit. |
| `apps/api/src/routes/managerTechnicians.test.ts` | Authorization, validation, conflict, rollback, and release coverage. |
| `apps/api/src/routes/managerTechnicians.integration.test.ts` | Cold migration/replay, concurrent creation, real auth/session lifecycle, and audit rollback. |
| `apps/api/src/routes/managerCustomers.ts` | Due-date update and upcoming-service routes plus due date in customer presentation. |
| `apps/api/src/routes/managerCustomers.test.ts` | Due-date validation and role gates without DB access. |
| `apps/api/src/routes/managerCustomers.integration.test.ts` | Due-date persistence, sorting, inactive/missing customers, and audit checks. |
| `apps/api/src/server.ts` | Mount technician router. |
| `apps/web/src/manager/ManagerOperations.tsx` | Preserve the former operations screen under its new component/file name. |
| `apps/web/src/manager/ManagerHome.tsx` | Five-link dashboard without data fetching. |
| `apps/web/src/manager/ManagerTechnicians.tsx` | Inline creation, active/inactive list, confirmed deactivation, and fail-closed errors. |
| `apps/web/src/manager/ManagerServicesDone.tsx` | Organization-wide closed visits, existing cards, and pagination. |
| `apps/web/src/manager/ManagerUpcomingServices.tsx` | Inline manual dates, sorted scheduled list, and separate unscheduled section. |
| `apps/web/src/manager/managerApi.ts` | Typed request helpers, response validation, and optional service-history customer filter. |
| `apps/web/src/App.tsx` | Route/hash mappings, dashboard entry, corrected Back targets, and request invalidation. |
| `apps/web/src/styles/app.css` | Semantic dashboard, technician, and schedule classes. |
| `apps/web/package.json` | Three named Playwright commands; no dependency or lockfile change. |
| `apps/web/tests/manager-technicians.html` | Mounted technician UI harness. |
| `apps/web/tests/manager-technicians.spec.ts` | Creation/list/deactivation, confirmation cancel, and malformed response checks. |
| `apps/web/tests/manager-dashboard-navigation.html` | Mounted App dashboard harness. |
| `apps/web/tests/manager-dashboard-navigation.spec.ts` | Five hash/component targets and no dashboard data request. |
| `apps/web/tests/manager-upcoming-services.html` | Mounted scheduling UI harness. |
| `apps/web/tests/manager-upcoming-services.spec.ts` | Unsorted server input, ordering, save/clear, and empty state. |
| `apps/web/tests/manager-app-auth-transitions.html` | Enter relevant cards through Home; await actual auth revalidation instead of three animation frames. |
| `apps/web/tests/manager-navigation-request-count.html` | Follow renamed Operations route while retaining exact request-count assertions. |
| `scripts/Test-ManagerScheduling.ps1` | Cold, isolated, fail-fast combined verification with cleanup and environment restoration. |
| `HANDOVER.md` | Record feature status, combined-scope decision, and validation entry point. |
| `docs/manager-scheduling-validation.md` | DoD, limitations, changed-file inventory, and reproduction instructions. |

## Reproduce automated verification

Requires Docker Desktop, installed repository dependencies, and the existing Playwright
Chromium installation. Port 55432 must be free. An occupied port fails safely; the
script never reuses or removes another container. The database is created fresh even
when `DATABASE_URL` already points elsewhere, and test processes run serially against it.

```powershell
cd C:\PWA_OfflineRecordWebApp
.\scripts\Test-ManagerScheduling.ps1
```

The script includes the actual build/test commands, verifies protected-file identity,
prints `git status --short`, restores prior environment variables, and removes only
its own disposable container. It does not perform the manual UI click-through.

Final cold-run totals: 99 backend tests, 1 frontend stale-evidence test, and 10
Playwright tests passed. The latter includes the 24-case Manager auth harness.
Verdict: **READY FOR REVIEW: YES.** No staging or commit performed.

### 2026-09-17 note: service-visit replay compares cover fields

Both idempotent-replay branches in `apps/api/src/jobs/serviceVisits.ts` (the locked
existing-row lookup and the lost-insert-race lookup) now also compare service call number,
arrival time and departure time against the retry, not just customer, site and systems.
Absent, `null` and blank are the same value; text is trimmed; times compare as `HH:MM`.
A changed, dropped or newly added cover field returns the existing 409
`IDEMPOTENCY_MISMATCH` and never overwrites the stored visit. No migration, route or web
change. The script now also runs `npm run test:job-progress` (8 tests). Cold rerun:
110 backend tests (was 99: +10 unit, +1 integration; includes the 10 V6/V7 integration tests),
1 stale-evidence test, 8 job-progress tests, and 10 Playwright tests passed with zero skips.

### 2026-09-18 note: Slice B — manager technician view and customer-first Services Done

`GET /api/manager/service-visits` accepts an optional `technicianId` (positive int4, else
400 `INVALID_TECHNICIAN_ID`; bound as `$n::bigint` on `inspection_jobs.created_by_user_id`;
combines with every other filter and the keyset cursor). A well-formed unknown id returns an
empty page. Each item, list and detail, now carries `technician: { id, displayName } | null`,
from a LEFT JOIN on `users`; legacy NULL-creator visits get `null` and never match a technician filter.
Admin-only as before; inspector still gets 403. No migration.

Web: Technician List rows open `#/manager-technician/:id` (In Progress / Completed tabs with
server counts, 20-per-page Load more, View Report / Download PDF, Back to Technicians).
Services Done is now customer-first: search customers by name or code (client-side, since
`/manager/customers` is unpaginated), then that customer's visits grouped by site with
From / To / Status / Technician + Apply / Clear filters. It reuses
`ManagerCustomerServiceHistory` (new `variant="services-done"`); the Customer Configuration
variant is unchanged. The customer, filters and technician tab are kept in sessionStorage,
and Back from a report returns to the screen that opened it.
`manager-dashboard-navigation.spec.ts` no longer expects the old flat `?status=closed` fetch;
it now asserts that no filtered list request is made.

New tests in the focused sets: `managerTechnicianVisits.integration.test.ts` (1) and
`manager-technician-services-done.spec.ts` (2). Revert proof: in a scratch copy outside the repo
with the predicate block removed, `technicianId=A` returned 8 rows instead of 5 (FAIL).
Cold rerun (exit 0): 161 backend tests (20 / 9 / 2 / 11 / 108 / 11), 1 stale-evidence test,
8 job-progress tests, 26 Playwright tests; zero skips.

**Slice B P2 remediation (2026-09-18, uncommitted, on top of `da93bdb`).** Stored return routes are now
`manager-report-return:v2` `{ hash, label, jobId }`. `readManagerReturn(jobId)` returns null unless
the job id matches. v1 values are ignored. A deep link, browser history into another job, or a
missing/invalid value goes Back to Operations. `ManagerCustomerServiceHistory` and `ManagerTechnicianDetail`
give each request a generation number. Filter, customer and technician changes and unmount bump it,
so a stale Load more cannot change the list, cursor, count, error or loading state. `clearManagerSession()`
removes `manager-report-return:*`, `manager-services-done:*`, `manager-technician-tab:*` and
`manager-session-owner:*` on logout and in `handleLogin` right after `login()` succeeds (before the
verified authority/state is installed, so an expired-session reload followed by another manager's login
inherits nothing). Round 3 replaces the old post-render backstop effect, which ran too late, with a per-tab
owner stamp. `manager-session-owner:v1` in sessionStorage holds the verified user id.
`claimManagerSession(userId)` clears every Manager key when the stamp is missing, invalid or names another
user, then writes the stamp. It runs synchronously before `prepareVerifiedAuthority` in the
`reconcileAuthentication` verified branch (reload restore and cross-tab `inspection-auth-change`
revalidation) and in `handleLogin` (after the unconditional clear). The IndexedDB device identity cannot
detect the change, because another tab's sign-in overwrites it. A reload by the same manager keeps the
remembered selection. It never touches `technician-home-tab:*` or local business data.
The API no longer casts `creator.id::int` in either query. The `technicianId` int4 validation is unchanged.
New Playwright tests (4, same spec): (a) deep link after Back to Technician, (b) a held Load more response
released after Apply, (c) logout/login clears keys, (d) manager 900 selects Acme, `/api/auth/me` turns 401
(no logout), reload, manager 901 signs in: no preselected customer, only the 901 owner stamp, `technician-home-tab:901` kept.
Round 3 adds 3 more: (e) 900 selects Acme, `/api/auth/me` returns 901, reload onto `#/manager-services-done`
(choose Manager): signed in as manager-b, no Acme, search shown, owner stamp 901, `technician-home-tab:901` kept;
(f) same start, a second page in the same context loads the app and broadcasts `inspection-auth-change`: the
first page becomes manager-b on `#/manager-services-done` with no Acme and no `manager-services-done:v1`;
(g) 900 reloads as 900: Acme is still shown. Round 4 adds (d2): 900 selects Acme, `/api/auth/me` turns 401
(no logout), reload, 900 signs in again: no Acme, only the owner stamp (900), `technician-home-tab:901` kept.
(e), (f) and (d2) wait for "Loading customers…" to clear before asserting, because the search form also shows
while a remembered selection is still loading; this makes their failing line deterministic. Existing exact-key expectations now include
`manager-session-owner:v1` wherever a Manager session is live. The API integration test also asserts `technician.id`
is a number on list and detail, including an id of 3000000000.
Revert proofs, run in scratch copies outside the repo (node_modules via junction):
- (a) jobId match removed: `Back to Technician` count expected 0, received 1 (`:298`). EXIT 1.
- (b) guard removed: `.job-card` expected 27, received 32 (`:330`). EXIT 1.
- (c) clear made a no-op: session keys expected `[]` (`:360`). (d) `:401`, (e) `:449`, (f) `:474` and
  (d2) `:517` also fail: `Acme Towers` heading expected 0, received 1. EXIT 1 (5 failed).
- (d) `handleLogin` clear **and** claim removed: (d) `Acme Towers` heading expected 0, received 1 (`:401`);
  (c) exact keys at `:371` (owner stamp absent); (d2) `Acme Towers` expected 0, received 1 (`:517`).
  EXIT 1 (3 failed). Before round 3 (Sol's rerun), (d) failed at the search-visibility line instead; that
  unchanged test can still fail at either `:400` or `:401` depending on the customer-load timing.
- (d2') only the `handleLogin` `clearManagerSession()` removed: (d2) `Acme Towers` heading expected 0,
  received 1 (`:517`); all other tests pass. EXIT 1 (1 failed, 9 passed).
- (e') `claimManagerSession` removed from the reconcile path: (e) `:449` and (f) `:474` `Acme Towers` heading
  expected 0, received 1; plus (c) `:357`, (d) `:387` and (g) `:494` exact-key lists (owner stamp absent).
  EXIT 1 (5 failed).
- (g') `claimManagerSession` always clears: (g) `Acme Towers` heading not visible (`:492`). EXIT 1.
c, d, d2' and e' were each run twice, with identical failing lines both times.
Cold rerun (exit 0): 161 backend (20 / 9 / 2 / 11 / 108 / 11), 1 stale-evidence, 8 job-progress,
34 Playwright (26 + 8); zero skips.

## Working-tree snapshot

This snapshot includes the newer changes preserved at the owner's request.
The separate protected-file comparison passed.

```text
 M HANDOVER.md
 M apps/api/src/db/migrations.ts
 M apps/api/src/jobs/serviceVisits.integration.test.ts
 M apps/api/src/jobs/serviceVisits.test.ts
 M apps/api/src/jobs/serviceVisits.ts
 M apps/api/src/reports/finalServiceReport.test.ts
 M apps/api/src/reports/finalServiceReport.ts
 M apps/api/src/routes/customerCreation.integration.test.ts
 M apps/api/src/routes/inspectionJobs.ts
 M apps/api/src/routes/managerCustomers.integration.test.ts
 M apps/api/src/routes/managerCustomers.test.ts
 M apps/api/src/routes/managerCustomers.ts
 M apps/api/src/routes/managerLocations.integration.test.ts
 M apps/api/src/server.ts
 M apps/api/src/sync/fireAlarmV6Acceptance.integration.test.ts
 M apps/api/src/sync/fireAlarmV7Acceptance.ts
 M apps/web/package.json
 M apps/web/src/App.tsx
 M apps/web/src/co2/v7Evidence.ts
 M apps/web/src/fireAlarm/fireAlarmResolution.ts
 M apps/web/src/jobs/NewServiceVisit.tsx
 M apps/web/src/jobs/TechnicianHome.tsx
 M apps/web/src/jobs/jobApi.ts
 M apps/web/src/jobs/jobProgress.ts
 M apps/web/src/manager/ManagerCustomerConfiguration.tsx
 M apps/web/src/manager/ManagerHome.tsx
 M apps/web/src/manager/managerApi.ts
 M apps/web/src/referenceData/referenceDataApi.ts
 M apps/web/src/referenceData/referenceDataCache.ts
 M apps/web/src/styles/app.css
 M apps/web/src/sync/syncEngine.ts
 M apps/web/tests/manager-app-auth-transitions.html
 M apps/web/tests/manager-created-time.html
 M apps/web/tests/manager-final-report-navigation.html
 M apps/web/tests/manager-navigation-request-count.html
 M apps/web/tests/new-service-visit-schedule.html
 M docs/architecture/07-master-service-report-v1.md
?? apps/api/migrations/028_manager_technicians_and_scheduling.sql
?? apps/api/migrations/029_customer_contact_details.sql
?? apps/api/migrations/030_service_visit_cover_fields.sql
?? apps/api/src/routes/managerTechnicians.integration.test.ts
?? apps/api/src/routes/managerTechnicians.test.ts
?? apps/api/src/routes/managerTechnicians.ts
?? apps/web/src/manager/ManagerOperations.tsx
?? apps/web/src/manager/ManagerServicesDone.tsx
?? apps/web/src/manager/ManagerTechnicians.tsx
?? apps/web/src/manager/ManagerUpcomingServices.tsx
?? apps/web/tests/manager-dashboard-navigation.html
?? apps/web/tests/manager-dashboard-navigation.spec.ts
?? apps/web/tests/manager-technicians.html
?? apps/web/tests/manager-technicians.spec.ts
?? apps/web/tests/manager-upcoming-services.html
?? apps/web/tests/manager-upcoming-services.spec.ts
?? docs/manager-scheduling-validation.md
?? scripts/Test-ManagerScheduling.ps1
```
