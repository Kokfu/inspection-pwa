# Project Handover & Live Status

> Single source of truth for current state. Update the "Last updated" line and the
> relevant section on every change. Keep it short — link to code, don't duplicate it.

**Last updated:** 2026-09-11 — **Phase 8H STEP 3.2 slice C (systemKey/from/to filters + a
"X of Y visits" total-count chip on the Manager service-history view) — uncommitted working tree,
owner does git.** STEP 3.2 is now fully closed: Slice A's `systemKey`/`from`/`to` filters (server-
validated since slice A but left out of the UI by slice B) are now wired into
`ManagerCustomerServiceHistory`, and every page of a filtered list now reports its true total
match count without a second query.

**What ships (STEP 3.2 slice C):**
`apps/api/src/routes/managerServiceVisits.ts` (+ its unit test and
`managerServiceHistory.integration.test.ts`), `apps/web/src/manager/managerApi.ts`,
`apps/web/src/manager/ManagerCustomerServiceHistory.tsx`, and
`apps/web/tests/manager-customer-service-history.{html,spec.ts}`. Two pre-existing test harnesses
also needed a one-line mock fix (see below) since `totalCount` is now a required field of the
`GET /manager/service-visits` response shape-guard.
* **`totalCount` on `GET /manager/service-visits`, no second query.** `buildOperationalListQuery`
  computes `totalCount` from a `summary` derived table (`count(*)` with no `GROUP BY`, so it
  always returns exactly one row) LEFT JOINed onto the cursor+limit-scoped `paged` rows; both
  `summary` and `paged` read the same `filtered` CTE (materialized once, scoped only to
  `customerId`/`siteId`/`status`/`systemKey`/`from`/`to` — never the cursor), so the count can
  never drift from the list's own filters. `listManagerServiceVisits` reads `totalCount` off
  `result.rows[0]`, and filters out the LEFT JOIN's placeholder row (`paged.id IS NULL`, since a
  real job's `id` is never null) before presenting the page. **Sol P1 fix:** the first cut used a
  plain `COUNT(*) OVER()` scoped to a filter-only inner subquery with the cursor applied as an
  outer `WHERE` — correct for "same value on every page", but wrong the moment a valid
  cursor+limit page is itself empty (the true last page, or a cursor at/past the end of an
  otherwise non-empty filtered set — both reachable, not just adversarial): with no row left to
  carry the window value, `totalCount` silently read back as `0`. The `summary LEFT JOIN paged`
  structure fixes this — `summary` always has a row, so `totalCount` survives an empty page.
  Regression proven both in-memory (`managerServiceVisits.test.ts`) and against real PostgreSQL
  (`managerServiceHistory.integration.test.ts`, cursor set to the true last row's own tuple).
  `ManagerServiceVisitList` / the route body gain the sibling key `totalCount: number`; zero query
  params still returns byte-identical `serviceVisits`/`nextCursor` to before this slice, plus this
  one field.
* **`systemKey`/`from`/`to` wired into `ManagerCustomerServiceHistory`.** A "System" `<select>`
  built from `customer.supportedSystems` (the full catalog, not just `enabledSystems` — history
  can include a system the customer no longer has assigned), and `<input type="date">` "From"/"To"
  controls. No client-side range validation — an invalid range (`from > to`) surfaces the server's
  `INVALID_DATE_RANGE` inline through the existing domain-error `setError` path, same as every
  other filter here. All five filters (site/status/systemKey/from/to) are in the load effect's
  dependency array and are threaded through `loadMore`, so page 2+ carries the same active filters
  as page 1.
* **"X of Y visits" chip.** Lives in a `.list-heading` div next to the "Service history" heading
  (the same heading+count convention `TechnicianHome`/`ManagerHome` already use — reused, no new
  CSS). Hidden only on the exact empty state (`visits.length === 0 && !loading`); otherwise tracks
  `visits.length`/`totalCount` and updates on every Load More and filter change. Deliberately NOT
  given the row-status-badge classes (`status-badge status-badge--draft` is already the "In
  Progress" row badge; reusing it for the chip would make the two indistinguishable to a test —
  and to a reader).
* **Test-harness fallout, fixed.** `loadManagerServiceHistory`'s shape-guard now requires
  `totalCount: number`; any pre-existing mock of `GET /manager/service-visits` returning a body
  without it now fails closed (`ManagerApiError "unavailable"` → `onAuthorityFailure`). Two
  harnesses mount `ManagerCustomerConfigurationDetail` (which always renders the service-history
  section) with such mocks: `apps/web/tests/manager-customer-configuration.html` (one case) and
  `apps/web/tests/manager-app-auth-transitions.html` (~10 scenario-local mocks) — both patched to
  add `totalCount` to every `serviceVisits` response. Verified this changes no scenario's
  assertions or call-counting semantics.
* **Tests.** `managerServiceVisits.test.ts`: `totalCount` exact for 0/1/more-than-limit matches
  and identical across every page of a filtered set (proving the `summary`/`paged` split, not just
  the column's presence); **a dedicated empty-page regression** (cursor equal to the true last
  row's own tuple — nothing sorts after it — yields `serviceVisits: []` with `totalCount` still the
  full match count, not `0`); zero-param response is exactly `{serviceVisits, nextCursor,
  totalCount}`; every existing per-filter assertion extended to also check `totalCount ===
  serviceVisits.length` (whole set fits on one page). `managerServiceHistory.integration.test.ts`:
  seeds 4 matching rows against `limit=2`, asserts `totalCount === 4` while `serviceVisits.length
  === 2` on both pages, **the same empty-page regression against real PostgreSQL** (cursor at the
  true end of the 4-row set → `[]` + `totalCount: 4`), and re-confirms the `customer_id`/`site_id`
  `EXPLAIN` index-scan assertions still hold (`CTE filtered` materialized once — `Bitmap Index Scan`
  on `idx_inspection_jobs_customer_id`/`idx_inspection_jobs_site_id`, no `Seq Scan` — then scanned
  twice: once by the `Aggregate` for `summary`, once by the `Limit`/`Sort` for `paged`, joined by a
  `Nested Loop Left Join`).
  `manager-customer-service-history.{html,spec.ts}`: System/From/To narrow the query string,
  invalid range surfaces `INVALID_DATE_RANGE` inline (never `onAuthorityFailure`), the chip renders
  and updates after Load More and after a filter change, and is absent on the empty state. Gates
  green: api typecheck + build; `managerServiceVisits.test.ts` (13); `managerServiceHistory.
  integration.test.ts` (1, cold `phase6_seed_integration`); `historical-matrix` (20) /
  `v6-evidence` (9) / `wet-chemical-definition` (2) / `v7EvidenceContracts` + `env` (11) /
  `v6-integration` (1) / the full V7 integration set — `co2V7`/`wetChemicalV7`/`fireAlarmV7`/
  `v7EvidenceRace` (9, cold) — all unaffected; web typecheck + build (CSS hash unchanged, zero new
  class names); `manager-customer-configuration` / `manager-customer-service-history` /
  `manager-locations` / `manager-evidence-policy` / `manager-system-configuration` /
  `manager-label-overrides` / `manager-final-report-navigation` / `manager-app-auth-transitions`
  Playwright specs (8, all green, 0 skips); `test:v7-stale-evidence`; `final-ui-acceptance.test.tsx`
  (16). DO-NOT-MODIFY list byte-identical to `e30c649`.
* **Sol round-2 P1 (test-only, no behavior change).** The empty-page regression added in
  `managerServiceHistory.integration.test.ts` read `lastVisit.serviceDate`/`.reference` off a
  locally-typed response shape that only declared `{ id: string }`, so `npm run typecheck`/`build`
  failed TS2339. Fixed by widening that test-local type to the three fields the cursor actually
  needs. Also cleaned up a few comments in both test files that still described the rejected
  `COUNT(*) OVER()` approach instead of the shipped `summary`/`paged` split (Sol P2). Re-verified:
  api typecheck + build green; `managerServiceVisits.test.ts` (13) and
  `managerServiceHistory.integration.test.ts` (1, cold, EXPLAIN unchanged) both still green.

<details><summary>Previous — 2026-09-11 STEP 3.2 slice B (read-only Manager service-history view on the customer configuration screen)</summary>

**Last updated:** 2026-09-11 — **Phase 8H STEP 3.2 slice B (read-only Manager service-history
view on the customer configuration screen) — uncommitted working tree, owner does git.** Web-only,
additive. NO backend/API file touched — `git diff --stat e30c649 -- apps/api` proves Slice A's
apps/api diff is byte-identical to before this slice. Scope is customer + site (both, per the
owner): the history section lives on the existing `manager-customer` page
(`ManagerCustomerConfigurationDetail`), always filtered to that customer (`customerId`), with a
"Site" dropdown built from `customer.sites` (All Sites default) covering the site scope. No new
"site" page or route was invented.

**What ships (STEP 3.2 slice B):** `apps/web/src/manager/managerApi.ts` (+1 fetcher,
`loadManagerServiceHistory`), `apps/web/src/manager/ManagerCustomerServiceHistory.tsx` (new),
`apps/web/src/manager/ManagerCustomerConfiguration.tsx` (threads 3 new props straight through to
the new section — STEP 3.1's Assigned-Services / per-service-settings paths are byte-unchanged),
`apps/web/src/App.tsx` (wires the 3 new props at the existing `manager-customer` render site,
reusing the identical navigation/download mechanisms `ManagerHome` already uses a few lines
below), `apps/web/tests/manager-customer-service-history.{html,spec.ts}` (new), and mocked-fetch
fixes in two pre-existing harnesses, `apps/web/tests/manager-customer-configuration.html` and
`apps/web/tests/manager-app-auth-transitions.html` (see below).
* **`loadManagerServiceHistory(filters, signal)`.** GET `/api/manager/service-visits` with
  `customerId` always in the query string, `siteId`/`status`/`cursor`/`limit` only when present
  (absent fields omitted entirely — mirrors the conditional-spread style already used by
  `activateManagerCustomerConfiguration`). Validates the body is a plain object with
  `serviceVisits` an array and `nextCursor` either `null` or a string; same `ManagerApiError`
  401/403→authorization, 400/404/409→domain, else→unavailable classification as every other
  fetcher in the file. `systemKey`/`from`/`to` exist server-side (Slice A) but are **not wired to
  any control in this slice** — left for a future slice.
* **`ManagerCustomerServiceHistory`.** Its own `<section className="report-summary">`, rendered
  inside `ManagerCustomerConfigurationDetail` right after "Per-service settings". A Site `<select>`
  (All sites + one option per `customer.sites`) and a Status `<select>` (All/Open/Closed);
  changing either resets the list and cursor and refetches from scratch. Rows reuse
  `ManagerHome.tsx`'s `visitCard` semantics (status badge open="In Progress"/closed="Service
  Completed", `formatMalaysiaDateTime(visit.createdAt)`, `inspectionProgress.accepted/required`,
  `visit.reference`) minus the redundant "Customer" line, leading with `visit.site` instead.
  Closed rows get "View Final Report" + "Download PDF" (same handlers `ManagerHome` uses); open
  rows get a single "View Progress". "Load more" appends to the existing list (never replaces)
  and disappears once `nextCursor` is `null`. Strictly read-only — no mutation call anywhere.
  Reused existing classes throughout (`job-card-list`, `job-card`, `job-card-heading`,
  `status-badge`, `job-card-meta`, `job-reference`, `job-card-label`, `inline-actions`,
  `manager-report-actions`, `empty-state`, `form-message`) — **zero new CSS**;
  `dist/assets/index-*.css` hash is unchanged (`index-C9TOXXcd.css`, same as slice A).
* **Test-harness fallout, fixed.** Because `ManagerCustomerConfigurationDetail` now always
  renders this section, its mount-time fetch also reaches every pre-existing Manager test
  harness whose mocked `fetch` didn't anticipate a queried `/api/manager/service-visits?...`
  call. Two fixes, both outside this slice's own file list but required to keep the existing
  regression suite green:
  * `manager-customer-configuration.html` — its generic `/api/manager/` → `{}` catch-all stub is
    not a valid `ManagerServiceHistory` shape; added a specific
    `/api/manager/service-visits` → `{ serviceVisits: [], nextCursor: null }` case ahead of it.
  * `manager-app-auth-transitions.html` — ~10 scenario-local `fetch` mocks matched with
    exact-string `url === "/api/manager/service-visits"` (no query string) and returned
    `{ serviceVisits: [...] }` with no `nextCursor`, so the new queried call either 503'd (missed
    the exact match) or failed shape validation (missing `nextCursor`). Both fixed at all ~10
    sites: `url === "/api/manager/service-visits"` → `url.startsWith("/api/manager/service-visits")`,
    and every `json({ serviceVisits: ... })` response there now carries `nextCursor: null`. Verified
    this doesn't change any scenario's call-counting semantics (the one scenario that counts
    `/api/manager/service-visits` calls to trigger a 403 — "C loaded data clears after 403" —
    never navigates to `manager-customer`, so the new component never mounts there and the extra
    match is a no-op for it).
* **Tests.** New `manager-customer-service-history.{html,spec.ts}`: query-string assertions
  (`customerId` always; `siteId`/`status` only when picked; `cursor` only on "Load more"); row
  semantics (closed rows show both report buttons, open rows show only "View Progress"); "Load
  more" appends and disappears once `nextCursor` is `null`; a 403-shaped response trips
  `onAuthorityFailure` and never renders a domain form-message; an empty-filter state; zero crash
  text. Gates green: web typecheck + build; `manager-customer-configuration` /
  `manager-customer-service-history` / `manager-locations` / `manager-evidence-policy` /
  `manager-system-configuration` / `manager-label-overrides` / `manager-final-report-navigation` /
  `manager-app-auth-transitions` / `manager-navigation-request-count` / `manager-created-time` /
  `manager-final-report-failure-matrix` Playwright specs (11, all green, 0 skips);
  `test:v7-stale-evidence`; `final-ui-acceptance.test.tsx` (16). `git diff --stat e30c649 --
  apps/api` confirms nothing under `apps/api` changed. DO-NOT-MODIFY list byte-identical to
  `e30c649`.

</details>

<details><summary>Previous — 2026-09-11 STEP 3.2 slice A (read-only Manager service-history filtering + pagination on the existing <code>GET /manager/service-visits</code>)</summary>

**Last updated:** 2026-09-11 — **Phase 8H STEP 3.2 slice A (read-only Manager service-history
filtering + pagination on the existing `GET /manager/service-visits`) — uncommitted working tree,
owner does git.** Backend-only, additive. NO new table, NO migration, NO seed change, NO write
path, NO change to `/:jobId`, `/final-report`, or `/final-report.pdf`. Zero query params still
produce byte-identical rows/order/shape to before this slice, plus one new sibling response key.

**What ships (STEP 3.2 slice A):** `apps/api/src/routes/managerServiceVisits.ts` (+ its unit test
and a new `managerServiceHistory.integration.test.ts`) only.
* **Filters, all optional and additive.** `customerId` / `siteId` (UUID; both given AND —
  a site of a different customer yields `[]`), `status` (`open`/`closed`), `systemKey` (validated
  against `isImplementedSystemKey`; matched via a parameterized `jsonb_array_elements(...
  enabledSystems) EXISTS` predicate against the frozen `configuration_snapshot` — never loaded
  into JS and filtered there), `from`/`to` (inclusive `service_date`, real-calendar-date
  validated so `2026-02-30` 400s instead of silently rolling over; `from > to` →
  `INVALID_DATE_RANGE`), `limit` (default 50, hard max 200). Every value is bound as its own
  `$n` — never string-interpolated. A malformed param 400s with a stable code
  (`INVALID_CUSTOMER_ID` / `INVALID_SITE_ID` / `INVALID_STATUS` / `INVALID_SYSTEM_KEY` /
  `INVALID_FROM_DATE` / `INVALID_TO_DATE` / `INVALID_DATE_RANGE` / `INVALID_LIMIT` /
  `INVALID_CURSOR`), no stack leak. A well-formed but unknown/foreign `customerId`/`siteId` is
  `200 []` — same existence-oracle discipline as `loadManagerServiceVisit`'s single-job lookup.
* **Keyset pagination**, mirroring `masterSystemInspections.ts`'s cursor discipline (strict
  base64url JSON, exact key set). Cursor encodes the last row's
  `(serviceDate | null, jobReference, id)`; a tampered/garbage cursor 400s
  (`INVALID_CURSOR`). The existing total order (`service_date DESC NULLS LAST, job_reference
  DESC, id DESC`) is preserved; the "after cursor" predicate correctly handles the NULL
  boundary (a non-null cursor's "after" set includes every NULL-date row; a NULL cursor only
  tie-breaks among other NULL-date rows). Response gains exactly one new sibling key:
  `nextCursor: string | null`; `serviceVisits` keeps its exact existing shape (no roll-up
  fields — that needs the Final Report and is a later slice).
* **Authority unchanged.** Still `requireRole("admin")`, still excludes `is_sample` in SQL,
  still reads only the frozen `configuration_snapshot` + `loadJobCompletion`'s accepted
  authority, still `Cache-Control: private, no-store`.
* **Indexes confirmed, not assumed.** `customer_id` (migration 004) and `site_id` (migration
  010) both hit their existing B-tree indexes via `EXPLAIN` against ~4,000 synthetic rows
  spread over ~4,000 distinct customers/sites (a handful of real rows is too small for the
  planner to prefer an index over a sequential scan regardless of the index's existence) —
  `Bitmap Index Scan on idx_inspection_jobs_customer_id` / `idx_inspection_jobs_site_id`, no
  `Seq Scan on inspection_jobs` on either scoped path.
* **Tests.** `managerServiceVisits.test.ts` gains: a pure-function `parseServiceVisitFilters`
  validation matrix (every malformed-param code, boundary `limit` values, a reversed/tampered
  cursor); a `buildOperationalListQuery` parameterization proof (exact `$n` positions, no
  interpolated values, zero-filter SQL contains none of the filter fragments); a hand-rolled
  in-memory filtering mock proving each filter narrows correctly, the customer+site AND, and
  the foreign/unknown-id `200 []` cases; a 4-row keyset walk (two real dates plus two
  NULL-`service_date` rows) proving no dup/gap and the NULL boundary; two HTTP round-trip tests
  (400 wiring through the real route, and `nextCursor` round-tripping through an actual query
  string). New `managerServiceHistory.integration.test.ts` (disposable PG,
  `phase6_seed_integration`) seeds one customer, two sites, a mix of open/closed jobs across
  both (plus a same-site sample job and an unrelated second customer/site), and proves every
  filter, the AND, the sample exclusion, the 401/403/200 admin matrix, the foreign-site `[]`,
  and the two `EXPLAIN` index assertions above — all against real PostgreSQL. Gates green:
  api typecheck + build; `historical-matrix` (20) / `v6-evidence` (9) /
  `wet-chemical-definition` (2) / `v7EvidenceContracts` + `env` (11);
  `managerServiceVisits.test.ts` (10); the full V7 integration set — `co2V7` /
  `wetChemicalV7` / `fireAlarmV7` / `v7EvidenceRace` (9, cold `phase6_seed_integration`) — and
  the new `managerServiceHistory.integration.test.ts` (1, same cold DB); web typecheck + build
  (`dist/assets/index-C9TOXXcd.css` hash unchanged — no web file touched) +
  `test:v7-stale-evidence`. DO-NOT-MODIFY list byte-identical to `e30c649`.

</details>

<details><summary>Previous — 2026-09-11 STEP 3.1 final-polish P1 (summary/warning alignment on "zones/locations set")</summary>

**Last updated:** 2026-09-11 — **Phase 8H STEP 3.1 final-polish P1 (summary/warning alignment on
"zones/locations set") — uncommitted working tree, owner does git.** Web-only, copy/UX. NO new
route, NO `managerApi.ts` request/guard change, NO backend change, NO migration, NO `app.css`
change (`dist/assets/index-C9TOXXcd.css` hash unchanged). The "Assigned Services"
(`submitConfiguration`) save path is byte-unchanged for every existing case;
`copySelectedConfiguration` and every `parse*` helper are untouched.

**What ships (STEP 3.1 final polish):** `apps/web/src/manager/ManagerCustomerConfiguration.tsx`
+ `tests/manager-customer-configuration.{html,spec.ts}` only.
* **1a — actionable "Location configuration required".** In `ManagerCustomerConfigurationDetail`'s
  `<fieldset className="manager-service-picker">`, an unticked, not-yet-assignable
  location-dependent system (`co2_fire_extinguisher` / `wet_chemical`, gated on
  `locationConfigurableSystemKeys`) still shows the server `unavailableReason`, now followed by a
  second `<small>`: "Define at least one zone and one location for this service in the "Zones &
  locations" editor below, then this service can be assigned." Copy only — no scroll hijack, no
  new route. (The "Add Customer" picker in `ManagerCustomerConfiguration` is deliberately left
  alone — that form has no "Zones & locations" editor to point at.)
* **1b — already-enabled `dry_wet_riser` with an unset `riserMode`.** `riserNewlyTicked` →
  `riserNeedsMode` = `keys.includes("dry_wet_riser") && storedRiserMode ∉ {dry,wet}`, so the
  inline "Riser mode" `<select>` now also surfaces for an already-enabled riser whose frozen
  `system_configuration` somehow carries no mode (a defensive case — the seed and every write
  path set one). When a valid mode is stored, `riserNeedsMode` is false and the save arg is
  `undefined` exactly as before. **Documented fallback:** if that control were ever missed, the
  save is still safely rejected server-side — `assertDryWetRiserAssignments` throws
  `RISER_MODE_REQUIRED` (`ManagerCustomerError` default **HTTP 400**, mapped to a `"domain"`
  error and shown inline) BEFORE any revision row is written
  (`apps/api/src/routes/managerCustomers.ts:305-323`; proven by
  `src/routes/managerCustomers.test.ts:69` — `assert.deepEqual(writes, [])`). No backend change.
* **1c — unticking a system that has downstream config.** New display-only line: "Removing
  <system> also drops the per-service settings saved for it (zones and locations, field labels,
  system and evidence settings). Re-adding a service in a later version starts from defaults — its
  previous settings are not restored." Shown when the pending selection drops an enabled system
  that has any saved per-service config (`enabledSystemHasSavedSettings`, mirroring
  `ManagerPerServiceSummary`'s per-flag test), because `copySelectedConfiguration` only
  forward-copies config for keys still selected. No behaviour change to the save path.
* **P1 — summary/warning alignment on "zones/locations set".** `ManagerPerServiceSummary`'s
  "Zones & locations" `set` test was `zones.length > 0 && locations.length > 0` while
  `enabledSystemHasSavedSettings` used `zones || locations`. The server permits saving a lone
  zone with no locations (`apps/api/src/inspections/locationConfiguration.ts:133`), so the
  summary chip could read "not set" while unticking still fired the drop-config warning — two
  contradictory signals on one screen. Fix: widen the summary's `set` clause to
  `zones.length > 0 || locations.length > 0` so "set" == "the Manager entered something here",
  and both signals agree a lone zone is real, droppable config. `enabledSystemHasSavedSettings`'s
  body was already `|| zones || locations`; its docstring is reworded to state the
  clause-for-clause match explicitly. Chosen over tightening the warning to `&&` because the
  warning's own copy ("drops … zones and locations") should fire for any entered zone/location
  config, not only a fully-configured pair.
* **Tests:** `tests/manager-customer-configuration.{html,spec.ts}` gain the 1a/1b/1c assertions
  (co2 flipped to `assignable:false` in the harness fixture to exercise the 1a pointer; the spec
  pins the new checks by name), plus a P1 lone-zone case — a fourth enabled system `wet_chemical`
  with `zones.length === 1`, `locations.length === 0`: the harness asserts the summary chip reads
  "Zones & locations: set" AND unticking it fires the drop-config warning naming it (both signals
  now agree). Fixture-count assertions bumped accordingly (4 summary rows, 4 "set" chips, 7
  per-system toggles). The four `tests/manager-{label-overrides,system-configuration,
  evidence-policy,locations}` harnesses render single sub-editors and never touch the picker, so
  they are unchanged — all four re-run green (`--workers=1`, 0 skips) as regression proof.
  `apps/web` typecheck + build green; `test:v7-stale-evidence` + `final-ui-acceptance` green.

</details>

<details><summary>Previous — 2026-09-10 STEP 3.1 slice 3b (Manager customer-configuration screen: cosmetic / summary consolidation)</summary>

**Last updated:** 2026-09-10 — **Phase 8H STEP 3.1 slice 3b (Manager customer-configuration
screen: cosmetic / summary consolidation) — uncommitted working tree, owner does git.**
Web-only, cosmetic. NO new route, NO `managerApi.ts` request/guard change, NO backend change, NO
migration. The "Assigned Services" (`submitConfiguration`) save path is byte-unchanged, and so is
every editor's own load/PUT path.

**What ships (slice 3b):** `apps/web/src/manager/ManagerCustomerConfiguration.tsx` +
`apps/web/src/styles/app.css` only.
* `ManagerCustomerConfigurationDetail` now wraps the four per-system editors
  (`ManagerCustomerLabelOverrides`, `ManagerCustomerSystemConfiguration`,
  `ManagerCustomerEvidencePolicy`, `ManagerCustomerLocations`) in ONE `report-summary`
  frame — `<h3>Per-service settings</h3>` — with the configuration version indicator shown
  once at the top of the frame (not per block). Each editor dropped its own `report-summary`
  card for a lighter `.manager-per-service-block` (a `<h4>` + top-border divider), so the four
  read as one surface.
* **New `ManagerPerServiceSummary`** — an at-a-glance per-enabled-system row of four state chips
  ({field labels, system settings, evidence policy, zones & locations} → `set` / `not set` /
  `n/a`), read straight off `customer.configuration.enabledSystems`
  (`labelOverrides`, `systemConfiguration`, `evidencePolicyId`, `zones`, `locations`) — **no new
  fetch**, no `managerApi.ts` change (`labelOverrides` is read via a local structural cast; the
  API already surfaces it on each enabled system).
* **Unified per-system collapsible affordance** via three shared helpers
  (`perServiceToggleLabel` / `perServiceUnsavedLine` / `PER_SERVICE_SAVE_CONFIRMATION`): every
  toggle is now `Edit <noun> — <system>` / `Hide <noun> — <system>` with `aria-expanded`; every
  editor's unsaved line is `Unsaved changes.` / `No unsaved changes.`; every save confirmation is
  `Saved. A new configuration version was created.`. Consistent intro-sentence pattern per editor
  (all four end "…existing service visits keep the <noun> they were created with").
* **Tests:** new `tests/manager-customer-configuration.{html,spec.ts}` (renders
  `ManagerCustomerConfigurationDetail`; proves one frame + one version line, the summary badges'
  set/not-set/n-a states, and the unified `Edit … — <system>` / `aria-expanded` collapsible with
  the shared `No unsaved changes.` line on expand). `tests/manager-{label-overrides,
  system-configuration,evidence-policy,locations}.{html}` updated for the renamed toggle labels /
  unified unsaved + confirmation copy only — no behavioural assertion changed; all four still
  green (`--workers=1`, 0 skips). `apps/web` typecheck + build green;
  `test:v7-stale-evidence` + `final-ui-acceptance` green.

</details>

<details><summary>Previous — 2026-09-10 STEP 3.1 slice 3a (per-customer zone/location configuration vertical)</summary>

**Last updated:** 2026-09-10 — **Phase 8H STEP 3.1 slice 3a (per-customer zone/location
configuration vertical) — uncommitted working tree, owner does git.** A Manager can now define
the zones and preset locations for a location-dependent master system
(`co2_fire_extinguisher`, `wet_chemical`) end-to-end (backend API + Manager web UI) via the EXACT
mechanism slice 1 (`system_configuration`, `7b7cb83`) and slice 2 (`evidence_policy_id`) built.
This closes the gap where those tables were only ever written by the seed or forward-copied
verbatim — there was no Manager write path, so a CO2 / Wet Chemical customer could not be stood up
through the UI (its "Assigned Services" checkbox stayed disabled with "Location configuration
required"). Defining at least one zone + one location now flips that checkbox to assignable. NO
migration (`customer_system_zones` / `customer_system_locations` + FKs + the
`enforce_location_zone_system` trigger exist since migrations 004/006); NO seed change; NO change
to `label_overrides` / `system_configuration` / `evidence_policy_id` handling; NO V7 evidence /
acceptance / Final Report / PDF change; NO change to `serviceVisits.ts` job-freeze (it already
emits `zones` / `locations` per system — config is read from the JOB's frozen
`configuration_snapshot`, never re-resolved).

**What ships (slice 3a):**
* **NEW `apps/api/src/inspections/locationConfiguration.ts`** —
  `locationConfigurableSystemKeys = new Set(["co2_fire_extinguisher", "wet_chemical"])` (widenable
  without a migration, like `systemConfigurationSystemKeys`) and
  `parseLocationConfigurationInput(value)` → the normalised `{ zones, locations }` or `undefined`
  (caller → 400 `INVALID_LOCATION_CONFIGURATION`). Validates exactly `{ zones, locations }`; zone
  keys non-empty, bounded and unique; location keys non-empty, bounded and unique; every
  `location.zoneId` names a submitted zone `key` (never a null-zone location — keeps the
  `serviceVisits.ts` buildSnapshot invariant, ~:131); `presetRowCount` a bounded 1..500 int;
  optional `rowPreset` a bounded plain object frozen opaquely. `sort_order` re-derived from
  submission order. No route import; no `uuidPattern` needed (cross-refs are by `key`).
* **`managerCustomers.ts`** — `GET`/`PUT
  /manager/customers/:customerId/systems/:systemKey/locations` (`requireRole("admin")`), mirroring
  the `system-configuration` / `evidence-policy` routes. `systemKey` not in
  `locationConfigurableSystemKeys` → 404 `LOCATIONS_UNSUPPORTED_SYSTEM`. **POSTURE:** GET resolves
  against the active revision's template version EVEN WHEN the system row is absent, returning
  `zones: []`, `locations: []` (so the Manager can define them before ticking the box); when the
  system is enabled it returns its current zones/locations. GET responds
  `{ systemKey, templateVersion, zones, locations }`, `Cache-Control: private, no-store`. PUT
  `exactBody(["zones","locations"])` → parse → `BEGIN` → `FOR UPDATE` customer lock (404
  `CUSTOMER_NOT_FOUND`) → assert the buildSnapshot invariant → `copySelectedConfiguration(...,
  <current.enabled keys PLUS systemKey if absent>, { zonesLocationsBySystemKey })` →
  `audit(manager_customer_locations_updated)` → `COMMIT` → re-read → 200
  `{ customer, systemKey, templateVersion, zones, locations }`.
* **`copySelectedConfiguration`** gained `zonesLocationsBySystemKey?: ReadonlyMap<string,
  LocationConfigurationInput>`. When set for a key it INSERTs the SUBMITTED zones (fresh UUIDs)
  then locations (each `zoneId` mapped through the new-UUID map) for that system's new
  `enabledId`, instead of forward-copying the `old` row's zones/locations — and this branch runs
  BEFORE the `if (!old) continue;` short-circuit, so a freshly-enabled location-dependent system
  still gets its zones/locations. Every other system forward-copies unchanged. `perSystemEdit` now
  also fires for this map. `assertLocationDependentAssignments` / `assertDryWetRiserAssignments`
  are **byte-unchanged**: the location guard is instead handed
  `withPendingLocationAuthority(current, zonesLocationsBySystemKey)` — a synthetic
  (`pending:*` ids, never persisted) copy of `current` in which each pending system's authority is
  the submission — so "enable co2 + define its zones/locations" passes the guard in one revision,
  exactly as the DWR guard already honours `systemConfigurationBySystemKey`.
* **`POST .../configuration-revisions`** accepts an optional `locations: Record<systemKey,
  { zones, locations }>` body key (allow-list `["systemKeys", "systemConfiguration",
  "evidencePolicy", "locations"]`); every key must be in `systemKeys` AND
  `locationConfigurableSystemKeys`, every value parses, every `location.zoneId` resolves within
  its own system's submitted zones (else 400 `INVALID_LOCATION_CONFIGURATION`, no revision).
  Mirrors `parseConfigurationRevisionSystemConfiguration` exactly. A `{ systemKeys }`-only /
  `{ systemKeys, systemConfiguration }` / `{ systemKeys, evidencePolicy }` body is byte-unchanged.
* **`loadManagerCustomer`** already surfaces `zones` / `locations` per enabled system — no shape
  change, nothing added.
* **Web** — `managerApi.ts`: `loadManagerLocations` / `saveManagerLocations`,
  `locationConfigurableSystemKeys` Set, `ManagerZone` / `ManagerLocation` / `ManagerLocations` /
  `ManagerLocationsDraft` types, an authority-bound `asManagerLocations(expectedSystemKey, data)`
  guard (rejects a mismatched `systemKey`, a malformed zone/location row, a `zones` list with a
  duplicate `id`, or a location whose `zoneId` is not one of the returned zone ids) routing a
  poisoned 200 / `null` to `onAuthorityFailure`; the PUT `customer` echo stays guarded by the
  unchanged hardened `isManagerCustomer` (its `zones`/`locations` array checks already cover the
  new field). `ManagerCustomerConfiguration.tsx`: new `ManagerCustomerLocations` +
  `ManagerLocationsEditor` (collapsible per system = `locationConfigurableSystemKeys` ∩ the
  customer's **supported catalog** — not limited to enabled systems — lazy GET on expand; an
  editable zone list add/rename/remove; an editable location list add/remove with a `displayName`
  input, a zone `<select>` from the current zone list, and a `presetRowCount` number input; Save →
  PUT → `onSaved(result.customer)`; domain-vs-authority error split), rendered in
  `ManagerCustomerConfigurationDetail` after `ManagerCustomerEvidencePolicy`, with a one-line note
  that defining a zone + location unlocks the CO2 / Wet Chemical checkboxes. The "Assigned
  Services" save path is unchanged.

**New tests:** `apps/api/src/routes/managerLocations.integration.test.ts` (4: GET on the seeded V1
CO2 demo returns its 3 zones + 6 locations, GET on the V7 CO2 demo its 1 zone + 1 location, GET on
an operational customer without CO2 returns `[]`/`[]`; PUT versions the set / audit row / freezes
the new set into NEW jobs only while a pre-PUT job keeps its frozen snapshot / rejects a dangling
`zoneId` + a duplicate zone key + `presetRowCount` 0 / 99999 with no revision /
`label_overrides` + `system_configuration` + `evidence_policy_id` forward-copied unchanged; auth
matrix + `LOCATIONS_UNSUPPORTED_SYSTEM` on `hydrant`; PUT fresh-enables CO2 on an operational
customer and flips its `supportedSystems.assignable` false → true, and a follow-up
`configuration-revisions` keeping CO2 succeeds with no 409 and forward-copies the zones/locations;
`configuration-revisions` inline `locations` enables CO2 fresh + defines its zones/locations in
one revision, rejects a key not in `systemKeys` / not location-configurable / with a dangling
`zoneId`). Web `tests/manager-locations.{html,spec.ts}` (mirrors `manager-evidence-policy`).
Scripts: `test:locations` (api), `test:locations-manager` (web, `--workers=1`).

`managerLabelOverrides.integration.test.ts`, `managerSystemConfiguration.integration.test.ts`,
`managerEvidencePolicy.integration.test.ts`, `managerCustomers.integration.test.ts` and the web
`manager-label-overrides` + `manager-system-configuration` + `manager-evidence-policy` specs stay
green WITHOUT edits despite the shared `copySelectedConfiguration` signature change.

</details>

<details><summary>Previous — 2026-09-10 STEP 3.1 slice 2 (<code>evidence_policy_id</code> assignment vertical)</summary>

**Last updated:** 2026-09-10 — **Phase 8H STEP 3.1 slice 2 (`evidence_policy_id` assignment
vertical) — uncommitted working tree, owner does git.** A Manager can now set or clear a
per-customer `customer_enabled_systems.evidence_policy_id` end-to-end (backend API + Manager web
UI) via the EXACT mechanism slice 1 (`system_configuration`, `7b7cb83`) and slice 1a-i
(`label_overrides`) built. **PLUMBING-ONLY, KNOWN NO-OP FOR V7:** the assignable catalog is bounded
to `automatic_sprinkler` and the single published policy is
`automaticSprinklerPsiEvidencePolicyV1` — the LEGACY pre-V7 per-field photo/PSI lifecycle. V7
evidence is contract-driven and `acceptAutomaticSprinklerV7Inspection` never reads
`system.evidencePolicy`, so assigning this policy is a functional NO-OP for every customer a
Manager can produce today (all on catalog version 7). The write path + UI exist so the vertical is
ready when a V7-era policy catalog does. NO migration (the `evidence_policy_id` column + FK +
`enforce_enabled_system_evidence_policy` trigger exist since 007); NO new/changed policy rows; NO
seed change; NO V7 evidence / acceptance / Final Report / PDF change.

**What ships (slice 2):**
* **NEW `apps/api/src/inspections/evidencePolicyAssignment.ts`** —
  `evidencePolicyAssignableSystemKeys = new Set(["automatic_sprinkler"])` (widenable without a
  migration, like `systemConfigurationSystemKeys`) and
  `parseEvidencePolicyIdInput(value)` → `{ evidencePolicyId: <uuid> }` for a UUID string,
  `{ evidencePolicyId: null }` for JSON `null` (explicit clear), `undefined` otherwise. `uuidPattern`
  regex duplicated (not imported from route code). Module doc marks it the legacy photo-policy hook
  / a V7 no-op.
* **`managerCustomers.ts`** — `GET`/`PUT
  /manager/customers/:customerId/systems/:systemKey/evidence-policy` (`requireRole("admin")`),
  mirroring the `system-configuration` routes. `systemKey` not in
  `evidencePolicyAssignableSystemKeys` → 404 `EVIDENCE_POLICY_UNSUPPORTED_SYSTEM`; system not
  enabled → 404 `SYSTEM_NOT_ENABLED`; bad id/type → 400 `INVALID_EVIDENCE_POLICY`. GET responds
  `{ systemKey, templateVersion, field, policies, evidencePolicyId }` where `field` is a
  server-authoritative select descriptor and `policies` = every published
  `inspection_evidence_policies` row for that `system_key` as `{ id, code, version, label }`. PUT
  `BEGIN` → `FOR UPDATE` customer lock → verify a non-null id names a published row for that
  `system_key` (never relying on the DB trigger to 500) → `copySelectedConfiguration(...,
  { evidencePolicyBySystemKey })` → `audit(manager_customer_evidence_policy_updated)` → `COMMIT` →
  re-read. `Cache-Control: private, no-store`.
* **`copySelectedConfiguration`** gained `evidencePolicyBySystemKey?: ReadonlyMap<string, string |
  null>`; when set for a key it writes `map.get(key)` (string | null) at the
  `customer_enabled_systems` INSERT `evidence_policy_id` param instead of
  `old?.evidencePolicyId ?? null`. `perSystemEdit` now also fires for this map, so a same-set edit
  keeps `current.enabled` order.
* **`POST .../configuration-revisions`** accepts an optional `evidencePolicy: Record<systemKey,
  string | null>` body key (allow-list `["systemKeys", "systemConfiguration", "evidencePolicy"]`);
  every key must be in `systemKeys` AND `evidencePolicyAssignableSystemKeys`, every value parses,
  every non-null id is a published row for that `system_key` (else 400 `INVALID_EVIDENCE_POLICY`,
  no revision). A `{ systemKeys }`-only or `{ systemKeys, systemConfiguration }` body is
  byte-unchanged.
* **`loadManagerCustomer`** now surfaces `evidencePolicyId` (string | null) on
  `configuration.enabledSystems[]` (was destructured out). Response-only; no policy-table join.
* **Web** — `managerApi.ts`: `loadManagerEvidencePolicy` / `saveManagerEvidencePolicy`,
  `evidencePolicyAssignableSystemKeys` Set, `ManagerEvidencePolicy{,Option,Field}` types, an
  authority-bound `asEvidencePolicy(expectedSystemKey, data)` guard (rejects a mismatched
  `systemKey`, a malformed `field`, a `policies` element missing `id`/`code`/`version`/`label`, or
  an `evidencePolicyId` that is neither `null` nor a returned policy id) routing a poisoned 200 /
  `null` to `onAuthorityFailure`; the PUT `customer` echo stays guarded by the hardened
  `isManagerCustomer` (extended, not weakened, with an `evidencePolicyId` string|null|absent
  check); `activateManagerCustomerConfiguration` gains an optional `evidencePolicy` arg after
  `systemConfiguration`. `ManagerCustomerConfiguration.tsx`: new `ManagerCustomerEvidencePolicy` +
  `ManagerEvidencePolicyEditor` (collapsible per eligible enabled system, lazy GET on expand, one
  `<select>` — "None (default evidence handling)" then one `<option>` per policy, Save → PUT
  (`""` → `null`) → `onSaved(result.customer)`, domain-vs-authority error split), rendered after
  `ManagerCustomerSystemConfiguration`; section copy notes it only affects the legacy
  photo-evidence lifecycle. No inline requirement anywhere — the "Assigned Services" save path is
  unchanged.

**New tests:** `apps/api/src/routes/managerEvidencePolicy.integration.test.ts` (4: GET semantics
on the photo + plain sprinkler demo customers; PUT versions the assignment / audit row / freezes
into NEW jobs only / clears / random-uuid + non-string + non-uuid → 400 `INVALID_EVIDENCE_POLICY`
no revision / `label_overrides` / `system_configuration` / zones / locations forward-copied
unchanged; auth matrix + unsupported system + system-not-enabled 404s; `configuration-revisions`
inline `evidencePolicy` enables `automatic_sprinkler` fresh + assigns the PSI policy in one
revision, rejects a key not in `systemKeys` / not assignable / not published; **V7 no-op** — PUT
on `demoV7CustomerId` succeeds, a new V7 job's snapshot carries the frozen `evidencePolicy` AND a
V7 sprinkler payload still accepts through `acceptAutomaticSprinklerV7Inspection` unchanged).
Web `tests/manager-evidence-policy.{html,spec.ts}` (mirrors `manager-system-configuration`).
Scripts: `test:evidence-policy` (api), `test:evidence-policy-manager` (web, `--workers=1`).

`serviceVisits.ts` job-freeze is untouched — it already emits `evidencePolicy` only when the
enabled row has a policy (:158); an `evidence_policy_id IS NULL` customer's frozen job snapshot has
NO `evidencePolicy` key (asserted). `managerLabelOverrides.integration.test.ts`,
`managerSystemConfiguration.integration.test.ts`, and the web `manager-label-overrides` +
`manager-system-configuration` specs stay green WITHOUT edits despite the shared
`copySelectedConfiguration` signature change and the shared `isManagerCustomer` guard.

**Sol P1 remediation (round 1) — `apps/web/src/manager/managerApi.ts` + its web test only:**
* **P1-1** — `asEvidencePolicy` now rejects a `policies` list with a duplicate `id`
  (a poisoned 200 with two entries sharing an id but differing labels rendered an ambiguous
  `<select>` + duplicate React keys instead of routing to `onAuthorityFailure`). The
  `evidencePolicyId`-in-list check reuses the de-duplicated id array.
  `manager-evidence-policy.html` gains a `dupPolicies` poisoned-GET case. No backend change —
  the §2 integration batch is unaffected.

</details>

<details><summary>Previous — 2026-09-09 STEP 3.1 slice 1 (<code>system_configuration</code> vertical for <code>dry_wet_riser</code>)</summary>

**What ships:**
* **NEW `apps/api/src/inspections/systemConfiguration.ts`** — parser/schema registry:
  `systemConfigurationSystemKeys = new Set(["dry_wet_riser"])` (widenable without a migration),
  `parseSystemConfiguration(systemKey, value)` (delegates to `parseDryWetRiserSystemConfiguration`),
  `systemConfigurationSchema(systemKey)` returning the server-authoritative form descriptor the web
  renders (`riserMode` select, `dry`/`wet`).
* **`managerCustomers.ts`** — `GET`/`PUT
  /manager/customers/:customerId/systems/:systemKey/system-configuration` (`requireRole("admin")`),
  mirroring the label-override routes: resolves the frozen active revision like
  `loadLabelOverrideContext`; unsupported system → 404 `SYSTEM_CONFIGURATION_UNSUPPORTED_SYSTEM`,
  system not enabled → 404 `SYSTEM_NOT_ENABLED`, bad payload → 400 `INVALID_SYSTEM_CONFIGURATION`.
  PUT `BEGIN` → `FOR UPDATE` customer lock → `copySelectedConfiguration(...,
  { systemConfigurationBySystemKey })` → `audit(manager_customer_system_configuration_updated)` →
  `COMMIT` → re-read. `Cache-Control: private, no-store`.
* **`copySelectedConfiguration`** gained `systemConfigurationBySystemKey?: ReadonlyMap<string,
  unknown>`; when set for a key it writes `JSON.stringify(map.get(key))` at the
  `customer_enabled_systems` INSERT. The "keep `current.enabled` order" branch now fires for EITHER
  map, but only when the enabled SET is unchanged — a set change (enabling `dry_wet_riser` with an
  inline config) still rebuilds in catalog order so the new key is actually inserted.
  `assertDryWetRiserAssignments` resolves `riserMode` from the pending map FIRST, then the
  forward-copied row — enabling `dry_wet_riser` with no resolvable `riserMode` from either source
  still fails `RISER_MODE_REQUIRED` (400, unchanged — pinned by `managerCustomers.test.ts`).
* **`POST .../configuration-revisions`** accepts an optional `systemConfiguration: Record<systemKey,
  object>` body key (every key must be in `systemKeys` AND `systemConfigurationSystemKeys` AND
  parse), threaded straight into `copySelectedConfiguration` — so "enable dry_wet_riser + set
  riserMode" is ONE atomic revision. `exactBody` allow-list widened to
  `["systemKeys", "systemConfiguration"]`.
* **`loadManagerCustomer`** now surfaces `systemConfiguration` on
  `configuration.enabledSystems[]` (was dropped).
* **Web** — `managerApi.ts`: `loadManagerSystemConfiguration` / `saveManagerSystemConfiguration`,
  `systemConfigurationSystemKeys` Set, `ManagerSystemConfigurationSchema` type, full response
  shape-guard (`asSystemConfiguration`) routing a poisoned 200 / `null` to `onAuthorityFailure`,
  and `activateManagerCustomerConfiguration`'s new optional `systemConfiguration` arg.
  `ManagerCustomerConfiguration.tsx`: new `ManagerCustomerSystemConfiguration` +
  `ManagerSystemConfigurationEditor` (collapsible per eligible system, lazy GET on expand, control
  rendered from the server `schema`, Save → PUT → `onSaved(result.customer)`, domain-vs-authority
  error split), rendered beside `ManagerCustomerLabelOverrides`; the "Assigned Services" save path
  requires a riser-mode choice inline when `dry_wet_riser` is newly ticked and sends it via the new
  arg.

**Config is read from the JOB's frozen `configuration_snapshot`** at freeze time, never re-resolved
from the live revision. `serviceVisits.ts` job-freeze is untouched — it already emits
`systemConfiguration` only for `dry_wet_riser` (:157); a `system_configuration = {}` customer's
frozen job snapshot has NO `systemConfiguration` key on non-`dry_wet_riser` systems (asserted).

**`label_overrides` handling, `applyLabelOverrides`, and the label-override routes/tests are
untouched** — `managerLabelOverrides.integration.test.ts` and the web `manager-label-overrides`
spec stay green WITHOUT edits despite the shared `copySelectedConfiguration` signature change.

**New tests:** `apps/api/src/routes/managerSystemConfiguration.integration.test.ts` (3, mirrors
`managerLabelOverrides`: schema+config GET; PUT versions the map / audit row / freezes into NEW
jobs only / invalid → NO revision; auth matrix; unsupported + not-enabled 404s; fresh-enable via
`configuration-revisions` WITH inline config succeeds + freezes / WITHOUT → 400
`RISER_MODE_REQUIRED`; label_overrides / zones / locations forward-copied unchanged; non-riser
systems freeze no `systemConfiguration` key). Web `tests/manager-system-configuration.{html,spec.ts}`
(mirrors `manager-label-overrides`). Scripts: `test:system-configuration` (api),
`test:system-configuration-manager` (web, `--workers=1`).

**Deviation from the brief:** DoD says the WITHOUT-inline-config `configuration-revisions` case is
"409 `RISER_MODE_REQUIRED`". It is 400 — `assertDryWetRiserAssignments` has thrown 400 since
`ba1fb2a` and `managerCustomers.test.ts` pins 400. Changing it was out of scope (would break a
frozen test); the new integration test asserts 400.

**Sol P1 remediation (round 1) — `apps/web/src/manager/managerApi.ts` only:**
* **P1-1** — `asSystemConfiguration(expectedSystemKey, data)` now binds the response to the
  requested system: rejects a mismatched `systemKey`, an empty `schema.fields`, and any
  `configuration` value that is not a declared option of a declared field. A poisoned 200 naming
  `co2_fire_extinguisher` / carrying `{ riserMode: 17 }` now routes to `onAuthorityFailure`.
* **P1-2** — `isManagerCustomer` (shared with `saveManagerLabelOverrides`) now validates EVERY
  declared `ManagerCustomer` field + nested element: `customer.code`, `configuration.id`,
  `enabledSystems[].sortOrder` / `zones` / `locations` (and optional `systemConfiguration` object),
  `sites[].id` / `.code`, `supportedSystems[].sortOrder` / `.assignable` (boolean) /
  optional `.unavailableReason`. A poisoned echo with a missing/non-boolean `assignable` (which
  could flip a service checkbox's authorization) now routes to `onAuthorityFailure`, never
  `onSaved`. `manager-label-overrides.{spec,integration}` stay green WITHOUT edits — the hardening
  only adds rejection reasons and every legit fixture / real `loadManagerCustomer` response already
  carries these fields. `manager-system-configuration.html` gains `wrongSystem` / `emptySchema` /
  `badConfigValue` poisoned-GET cases.

</details>

<details><summary>Previous — 2026-09-09 label-overrides slice 1a-iv (Final Report + PDF), committed <code>193c078</code> / <code>f6045de</code></summary>

**Task 8e label-overrides slice 1a-iv (Final Report + PDF): 1a-iv
committed `193c078`, response-key-alias remediation committed `f6045de` (HEAD). Sol re-review
test-hardening pass in the working tree (owner does git).** Closes deferred item 2:
`finalServiceReport.ts` built every
`section.fields[].label` by prettifying the raw response key (`trfp_jockey_pump` → "Trfp Jockey
Pump"), so the client-facing report and PDF ignored BOTH the customer's per-job overrides AND the
frozen definition wording. Now the four override systems' **V7** report sections render the frozen
definition labels with the job's frozen `labelOverrides` applied.

**What ships (`apps/api/src/reports/finalServiceReport.ts` only, + its unit test):**
* **`v7DisplayLabelLookup(systemKey, snapshot, frozenSystem)`** — for `automatic_sprinkler`,
  `co2_fire_extinguisher`, `wet_chemical`, `hose_reel` on a `schemaVersion === 2` record only. Runs
  the existing per-system resolver (`resolveAutomaticSprinklerControls` V7 fork /
  `resolveCo2Controls` / `resolveHoseReelControls`) on the snapshot's FROZEN `system.definition` at
  the FROZEN `template.version`, then `applyLabelOverrides(tree, frozenSystem.labelOverrides)` ONCE
  on a clone — `frozenSystem` is `expectedSystem(job.configuration_snapshot, …)`, i.e. the map
  frozen into THIS job's snapshot, never the live customer revision. Emits a flat
  `responseKey → displayLabel` map via `collectResolvedLabelPaths`. Returns `undefined` (⇒ prettifier
  fallback, byte-identical) for any non-V7 record, out-of-scope system, or resolver throw.
* **`labelFor(key, lookup?)` is now segment-aware.** With no `lookup` it prettifies the whole key
  exactly as before (splitting on `" - "` and rejoining is a no-op for the prettifier). With a
  `lookup`, each `" - "`-joined segment the map covers is swapped for its label and every other
  segment is prettified as before — so the structural `" - Result"` / `" - Remarks"` suffixes that
  `sectionRemarkLines` matches survive, and only the field-name segment moves. `flatten` threads the
  `lookup` through.
* **Evidence caption** (`remapEvidenceCaptions`, TASK point 4) — the V7 evidence contract
  (`v7EvidenceContracts.ts`) stays the caption authority; when the job froze a rename AND the
  contract caption ends with the exact definition label, its suffix is swapped so the PDF
  "Final evidence included: …" line matches the renamed field. Surgical ⇒ no-override is
  byte-identical. The `:648` `labelFor(evidence.field)` fallback in `renderFinalServiceReportPdf`
  is only reachable for the out-of-scope legacy Sprinkler PSI lifecycle and is untouched.

**Design deviations from the brief's RECOMMENDED shape (justified):**
* **Per-segment, not whole-leaf, substitution** — needed to keep the `- Result` / `- Remarks`
  suffix structure and the section-path context intact. Still "labelFor consults the lookup before
  the prettifier", flat `responseKey → label` map, no path-shape reconciliation.
* **Collision drop** — the generic single-measurement value key `value` resolves to two definition
  labels ("Cut In" and "Gauge Reading"), so it is dropped from the map and prettifies to "Value"
  exactly as before. Applied symmetrically to the definition and overridden maps.
* **V7 forks of the four systems DO change** (prettified key → frozen definition wording): that is
  the "Definition wording now reaches the report" DoD item. The NON-NEGOTIABLE "byte-identical to
  today's for a job with NO frozen override map" is read as scoped to the historical-immutable forks
  (V1–V6, CO2 V1, Wet Chemical V4) — those never reach `v7DisplayLabelLookup` and are byte-identical
  (proven: `finalServiceReport.integration` CO2-V1 + `.sprinkler.integration` Sprinkler-V1 +
  `fireAlarmV6FinalReport.integration` all green, unmodified). The no-override V7 Sprinkler
  rendering is pinned as the digest baseline; the with-override test asserts only the renamed
  field's two rows move.
* **CO2 / Wet Chemical response-key coverage is complete** (`f6045de`) via the explicit
  `v7DisplayResponseKeyAliases` table in `finalServiceReport.ts` — a per-system, contract-owned
  `resolvedKey → [responseKey…]` map, not a casing heuristic and not a contract-key change:
  * CO2: `control_panel_location → controlPanelLocation`, `alarm_zone → alarmZone`,
    `heat_detector → heatDetectorStatus`, `smoke_detector → smokeDetectorStatus`.
  * Wet Chemical: `control_panel_location → controlPanelLocation`, `alarm_zone → alarmZone`,
    `heat_detector → heatDetectorStatus`, `unconfirmed_second_heat_detector → smokeDetectorStatus`
    (its second source column is preserved under the V1 field key, never normalised to
    `smoke_detector`).
  * The frozen V7 detector columns are `normal_test_isolation_multi` (multi_select), so each is
    serialized as an ordered array and `flatten` renders per-element segments
    `…heatDetectorStatus 1` … `…heatDetectorStatus 3` (bounded — normal / test / isolation);
    those bounded segments are registered alongside the bare key. `hose_reel` row columns
    (`hose → hoseResult`, …) and `automatic_sprinkler` (flat `Record<ChecklistKey,…>`) were already
    covered by 1a-iv.
* **PDF digest not pinnable** — PDFKit stamps a random `/ID`, so the pinned digest is
  `sha256(JSON.stringify(report.sections))` (deterministic); the PDF is checked structurally
  (`%PDF-`, length, `!basePdf.equals(renamedPdf)`).

**Files committed in `193c078` (1a-iv):**
* `apps/api/src/reports/finalServiceReport.ts` — frozen V7 definition wording and per-job display-label overrides reach Final Report/PDF.
* `apps/api/src/reports/finalServiceReport.test.ts` — pins V7 sprinkler wording, override isolation, and report-section digest.
* `HANDOVER.md` — records the slice’s authority-chain design and verification status.
* `apps/web/src/automaticSprinkler/automaticSprinklerTypes.ts` — comment-only four-state V7 result-model clarification.
* `apps/web/src/automaticSprinkler/serverAutomaticSprinklerApi.ts` — behavior-neutral comment cleanup and 300-character constant split.

**Files committed in `f6045de` (response-key-alias remediation, HEAD):**
* `apps/api/src/reports/finalServiceReport.ts` — `v7DisplayResponseKeyAliases` table so frozen/overridden definition wording reaches the hose_reel row columns and the co2 / wet_chemical camelCase detector columns.
* `apps/api/src/reports/finalServiceReport.test.ts` — hose_reel + co2 alias lockstep tests, no-override section digests.
* `HANDOVER.md` — records the alias table and completed CO2 / Wet Chemical coverage.

**Working tree (Sol re-review test-hardening pass, NOT committed — owner does git):**
* `apps/api/src/reports/finalServiceReport.ts` — doc-comment corrections only (alias table's multi_select rationale; the prettifier fallback now lists only genuinely-uncovered keys). No behaviour change.
* `apps/api/src/reports/finalServiceReport.test.ts` — legacy `schemaVersion===1` CO2 section digest pinned in the first test; hose_reel override test rebuilt to the sprinkler 1a-iv rigor (exact changed-label set, per-field `deepEqual` of the untouched subset, unconditional caption/label lockstep); new `V7 Wet Chemical` alias regression (no-override digest + second-detector rename isolation); re-pinned no-override digests carry the "definition-wording baseline, not the pre-alias output" comment.
* `HANDOVER.md` — this section.

**Gates (all green).** API: typecheck + build; `test:final-report` (**14**, incl. 3 new
V7-Sprinkler label tests) / `test:final-report-integration` / `test:final-report-sprinkler` /
`test:final-report-v6` / `automaticSprinklerV7PdfEvidence` → **18 pass, 0 skip** from the cold
`phase6_seed_integration` DB (§2 form); historical-matrix (20) / v6-evidence (9) /
wet-chemical-definition (2) / v7EvidenceContracts + env + label-overrides (19) /
automatic-sprinkler-definition (7). Cold §2 batch — `co2V7` / `wetChemicalV7` / `fireAlarmV7` /
`v7EvidenceRace` / `hydrantV7` / `hoseReelV7` / `automaticSprinklerV7` / `dryWetRiserV7` /
`smokeVentilationV7` / `portableFireExtinguisherV7` / `fireIntercomV7` /
`migrationReplayForwardOnly` / `fireAlarmV6Acceptance` / `managerCustomers` /
`managerLabelOverrides` → **90 pass, 0 skip**. Web: typecheck + build; `test:v7-stale-evidence` (1).
`git diff --check` clean (CRLF warnings only). DO-NOT-MODIFY list clean; V1–V5 /
Fire Alarm V6 / CO2 V1 / Wet Chemical V4 byte-identical to `e30c649`.
`P0 remaining: 0` `P1 remaining: 0` `P2 remaining: 0`. 1a-iv `193c078` + alias remediation `f6045de`
committed; Sol re-review test-hardening pass in the working tree — owner does git.

**Sol re-review test-hardening (working tree) — full gate set re-run cold, supersedes the
counts above.** API typecheck + build clean. `test:final-report` now **17 pass, 0 skip** (was 14:
`+V7 Wet Chemical response aliases…`; hose_reel + co2 + wet_chemical each pin a no-override
`sha256(JSON.stringify(report.sections))` AND an override regression, and the legacy
`schemaVersion===1` CO2 section digest is pinned in the first test — proven to never enter
`v7DisplayLabelLookup`, which bails on `schemaVersion !== 2`). historical-matrix **20** / v6-evidence
**9** / wet-chemical-definition **2** / v7EvidenceContracts + env **11** / label-overrides **8** /
automatic-sprinkler-definition **7** / automaticSprinklerV7PdfEvidence **1**. Cold §2 one-DB batch
(`phase6_seed_integration`, 18 files incl. `test:final-report-v6` / `-integration` / `-sprinkler`)
→ **93 pass, 0 skip**. Web typecheck + build clean; `test:v7-stale-evidence` **1**.
Sprinkler 1a-iv tests unchanged; its pinned digest
`2e415ad2857dfd76e221772a5994979f98a74409048ce70ca61454ccd159f356` unmoved.
`P0 remaining: 0` `P1 remaining: 0` `P2 remaining: 0`.

**STILL DEFERRED — owner-approved:**
1. **Fire alarm.** Form renders labels from `resolveFireAlarmVisibleLabels(definition)` + literals,
   not the controls tree; the V6 acceptor reads the frozen entry and `fireAlarmV6Acceptance.ts` is
   DO-NOT-MODIFY. Absent from `labelOverrideSystemKeys` (API + web) → `/label-overrides` 404s. The
   final report's `fire_alarm_detector` branch (`fireAlarmV6Fields`) is likewise NOT wired to
   `v7DisplayLabelLookup` (returns `undefined` for it) and stays byte-identical.

</details>

<details><summary>Previous — 2026-09-09 label-overrides slice 1a-iii (`automatic_sprinkler`), committed <code>dbe9924</code></summary>

**Task 8e label-overrides slice 1a-iii (`automatic_sprinkler`).** Closes the two
`automatic_sprinkler` gaps 1a-ii left open:
the API resolver had no V7 fork (so `/label-overrides` 409'd `SYSTEM_DEFINITION_UNRESOLVABLE`), and
the V7 Accepted-Detail branch returned `displayControls: null`. Per-customer display-label
overrides now cover **4 systems** — `co2_fire_extinguisher`, `wet_chemical`, `hose_reel`,
`automatic_sprinkler`.

**What ships:**
* **API resolver V7 fork** — `apps/api/src/inspections/templates/automaticSprinklerDefinitionControls.ts`
  now branches on `templateVersion === 7`, mirroring the already-V7 web resolver
  (`resolvePublishedAutomaticSprinklerControls`) and `definitionControls.ts` / `co2DefinitionControls.ts`:
  four-state result control (`good` / `not_good` / `complete_repair` / `na`, each field's own frozen
  `allowedValues` still decides the option set — the label map never widens it), the
  `test_run_fire_pump_checks` block from the Main Alarm Valve section
  (`trfp_jockey_pump` / `trfp_duty_pump` / `trfp_standby_pump`) as `checklist.testRunFirePump`,
  a matching `layout.testRunFirePump`, and `source.templateVersion: 7`.
  **The V1 path is untouched**: both new tree keys are *conditional spreads*, so a V1–V6 tree keeps
  exactly its old keys AND key order. `automaticSprinklerDefinitionControls.test.ts` (4) pins
  `sha256(JSON.stringify(V1..V6 controls)) = 9635824630d591b6…` (the pre-fork bytes), asserts the V7
  tree shape + 4-state + the canonical label paths, and asserts each fork rejects the other's
  definition. `validatePhotoEvidence.ts:296` and the historical acceptors
  (`automaticSprinklerInspectionSync.ts:162,313`) still call the V1 path with a V1 version.
* **Allow-list** — `automatic_sprinkler` re-added to `labelOverrideSystemKeys` in
  `apps/api/src/routes/managerCustomers.ts` AND `apps/web/src/manager/managerApi.ts`. The Manager
  editor is generic over that set, so no UI change was needed.
* **Technician form** — `AutomaticSprinklerInspectionForm.tsx` uses the same 1a-ii shape:
  `controls` stays the canonical, un-overridden `resolvedControls` (sole authority for every response
  key, evidence `fieldPath`, submit gate and the `isV7` branch); only label **text** goes through
  `labelAt(path, def) = overriddenLabel(record.displayLabelOverrides, path, def)`, and
  `MeasurementValueInput` gets a throwaway `{ ...def, label: labelAt(…) }`. Canonical paths:
  `checklist.<waterTank|pumpHouse|mainAlarmValve|testRunFirePump>.<key>`, `measurements.<key>`,
  `measurements.<key>.values.<vkey>`.
* **Repo + type** — `automaticSprinklerRepository.ts` `snapshot()` destructures `labelOverrides`
  OUT before the `{ ...system }` spread (it must never reach the submitted / fingerprinted
  `inspectionSnapshot.system`); the record gets the non-synced `displayLabelOverrides?` only when
  the frozen map is non-empty, so a no-override record stays byte-identical.
  `automaticSprinklerTypes.ts` gains `displayLabelOverrides?: Readonly<Record<string,string>>`
  (and an optional `layout.testRunFirePump?`, which only the API-shaped tree carries).
* **Accepted detail (the 1a-ii known gap) — the frozen MAP travels, never a controls tree.** A V7
  acceptance freezes **no** `system.resolvedControls`, so the V7 `automatic_sprinkler` branch of
  `GET /api/master-system-inspections/:id` keeps `displayControls: null` and instead forwards this
  job's frozen `frozenLabelOverrides(jobId, "automatic_sprinkler")` map verbatim as a new
  `displayLabelOverrides` key. `ServerAutomaticSprinklerView` substitutes it per canonical path via
  the shared `overriddenLabel(map, path, caption)` — the exact helper and path grammar the
  technician form uses (`checklist.<section>.<key>`, `measurements.<key>`,
  `measurements.<key>.values.<vkey>`; the section tables now carry their resolved-tree section key).
  Applied in one place only, so no double-apply is possible. Response payload, evidence
  `fieldPath`s, the frozen manifest and `contractSha256` are untouched.
* **Why the map and not a re-derived tree (Sol round-2 P1).** An earlier revision of this slice sent
  the whole re-derived controls tree and had the view prefer it for every key. The accepted view's
  built-in captions and the definition labels are two different wordings — **17 of 23 differ**
  ("Water Supply Gauge" vs "Water Supply Gauge At", "Jockey Pump" vs "Jockey Correct Cut In / Cut
  Out", …) — so saving ONE override silently reworded 17 rows nobody edited, permanently, on every
  job frozen while that override existed. A per-path substitution cannot do that. The browser
  harness now renders the accepted view twice (with and without the map) and asserts **exactly two**
  rendered labels differ and every other is byte-identical.
* **Wire compatibility — this deploy changes no existing record's shape (Sol round-1 P1).** The
  `displayLabelOverrides` key is emitted **only** when the job froze a non-empty map; a job with no
  overrides returns the byte-identical historical payload. That matters because this is an installed
  PWA: the previously shipped client does `exactKeys(value, v7DetailKeys)` and rejects a non-`null`
  `displayControls` (`5d86ace`), so a service-worker-cached shell would otherwise have failed
  **every** accepted V7 sprinkler with "Server inspection is currently unavailable" until it updated.
  No accepted record predating this slice has an override, so none change shape.
* **Display-only data degrades, it never fails the detail (Sol round-1 P2).** `parseLabelOverrideMap`
  validates the map (plain object, 1–300 entries, values 1–200 chars, trimmed) and drops individual
  bad entries rather than the whole map; an unusable map yields `undefined` (render every caption
  as-is) instead of failing `parseServerAutomaticSprinklerDetail`. A label mismatch must never turn
  an immutable accepted record into `server-unavailable`. `responses` remains the authority and
  still fails closed, and a stray `displayControls` tree on a V7 sprinkler is still refused.
* **A DB error is not a missing override map (Sol P2).** `frozenLabelOverrides` is awaited
  **outside** the `try` that degrades to `null`, so a transient database failure reaches the error
  handler (500) instead of silently rendering as "this customer has no overrides".

**Gates (all green).** API: typecheck + build; historical-matrix (20) / v6-evidence (9) /
wet-chemical-definition (2) / v7EvidenceContracts + env (11) / `test:label-overrides` (8) /
**`test:automatic-sprinkler-definition` (7 — the resolver fork plus the new
`masterSystemInspectionsAutomaticSprinklerV7` route test: a no-override job keeps its exact historical
wire shape, an overridden job forwards the map verbatim with no controls tree, a DB failure 500s)**; `automaticSprinklerV7PdfEvidence` +
`acceptedMasterSystemDetail.automaticSprinklerV7` / `.dryWetRiserV7` / `.fireIntercomV7` +
`finalServiceReport` + `serviceVisits` (38). Web: typecheck + build; `test:label-overrides-parity`
(**still 16**) / `test:v7-stale-evidence` (1) / `test:v7-automatic-sprinkler-submit` (8) /
`test:v7-hose-reel-submit` (16) / **new `test:label-overrides-sprinkler` (6, incl. the
per-path-only substitution and the degrade-to-no-overrides contract)**; Playwright
`--workers=1`: **new `label-override-sprinkler`** + `label-override-technician-form` +
`manager-label-overrides` + `automatic-sprinkler-v7-offline` + `hose-reel-v7-offline` +
`co2-v7-cross-instance` + `fire-alarm-v6-accepted-detail` + `manager-app-auth-transitions`.
**Cold integration — ONE disposable DB `phase6_seed_integration` on port 55432, §2 form**
(`NODE_ENV=test`, `SEED_INTEGRATION_DATABASE_URL` at that DB, `DATABASE_URL` bogus):
`fireAlarmV6Acceptance` + `co2V7` / `wetChemicalV7` / `fireAlarmV7` / `v7EvidenceRace` /
`automaticSprinklerV7` + `managerLabelOverrides` (3, **incl. the new V7 sprinkler case**) →
**24 pass, 0 skips**; plus `finalServiceReport.sprinkler` / `managerCustomers` /
`customerCreation` integrations (3). `co2-v7-live-accepted-detail` and
`wet-chemical-v7-live-accepted-detail` are runtime-fixture specs (`*_LIVE_BROWSER_FIXTURE_PATH`),
not part of this gate set. `git status --short`: 5 modified `apps/api` files (+2 new tests),
7 modified `apps/web` files (+3 new tests), HANDOVER.md. `git diff --check` clean (CRLF warnings only). DO-NOT-MODIFY
list clean; V1–V5 / Fire Alarm V6 / CO2 V1 / Wet Chemical V4 byte-identical to `e30c649`.
`P0 remaining: 0` `P1 remaining: 0` `P2 remaining: 0`. Not committed — owner does git.

</details>

<details><summary>Previous — 2026-09-09 label-overrides slice 1a-ii (WEB, uncommitted; its "Known gap" + deferred item 2 are CLOSED by 1a-iii above)</summary>

**Task 8e label-overrides slice 1a-ii (WEB + Sol P0/P1/P2
remediation, round 3) in the working tree, NOT committed.** Consumes the 1a-i backend (`eadb12b`):
technician form + Manager UI for **3 systems** — `co2_fire_extinguisher`, `wet_chemical`,
`hose_reel` — plus owner-approved hardening of 1a-i acceptors. `fire_alarm_detector`,
`automatic_sprinkler` and the final report are deferred (see end).

**What ships:**
* **Shared helper** — `apps/web/src/inspections/labelOverrides.ts` is a **verbatim port** of the
  API authority; both copies export `applyLabelOverrides` (clone the tree, swap `label` strings —
  now **trims** the replacement) and `overriddenLabel(map, path, definitionLabel)` (single-node
  lookup: own **and enumerable** only, via `Object.prototype.propertyIsEnumerable` so it matches
  `applyLabelOverrides`' `Object.entries` exactly, non-empty trimmed string wins, else the
  definition label). `tests/labelOverridesParity.test.ts` (16) imports both copies and asserts
  `applyLabelOverrides` identical output AND `overriddenLabel(map,p,node.label) ===
  applyLabelOverrides(tree,map)` at every path — across padded values, prototype-inherited and
  own-non-enumerable props, whitespace-only, non-string, nested repeatable-row / measurement-value
  paths, option-labels.
* **Technician forms (co2/wet_chemical via `Co2InspectionForm`, `HoseReelInspectionForm`)** —
  `controls` is the **canonical, un-overridden** `resolvedControls`, the sole authority for every
  key / evidence `fieldPath` / response wiring / submit gate / V7 branch; it is never cloned or
  shadowed. Label **text only** comes from a `labelAt(path, def)` closure =
  `overriddenLabel(record.displayLabelOverrides, …)` interpolated into JSX; the two
  `MeasurementValueInput` sites get a throwaway `{ ...def, label: labelAt(…) }`.
* **Where the frozen map lives (was P0):** NOT `inspectionSnapshot`. `JobSystemSnapshot.labelOverrides?`
  carries it from the job payload; each repo's `snapshot()` builder **destructures it OUT** before
  the `{ ...system }` spread and stashes it on a **non-synced** record field `displayLabelOverrides?`
  (`co2Types.ts` / `hoseReelTypes.ts`), set **only when non-empty** → a no-override record is
  byte-identical. Absent from every `payload()` / outbox builder.
* **1a-i acceptor hardening (was P0):** `hoseReelV7Acceptance.ts` + `automaticSprinklerV7Acceptance.ts`
  strip `labelOverrides` from the frozen `configuration_snapshot` enabled-system entry before it
  enters `authority` (request fingerprint) or the stored `inspection_snapshot.system`; the
  historical `enabledSystem()` helpers in `masterSystemInspectionSync.ts` +
  `automaticSprinklerInspectionSync.ts` do the same (defence-in-depth — those fingerprints
  already excluded the entry; automatic_sprinkler's is kept even though the system is now
  deferred). Stripping an absent key is a no-op → no-override jobs byte-identical to `e30c649`.
  `contractSha256 = sha256(canonical(definition))` never touched. CO2 / Wet Chemical were already
  clean (server rebuilds `system` from explicit keys; fingerprint excludes the snapshot).
* **Manager UI** — `ManagerCustomerLabelOverrides` / `ManagerSystemLabelOverrides` in
  `ManagerCustomerConfiguration.tsx`, inside `ManagerCustomerConfigurationDetail` (no new route).
  One collapsible editor per eligible enabled system. `managerApi.ts`: `readResponse` refactored
  onto `readBody` — which now **rejects any non-object body** (null / array / scalar) as
  `ManagerApiError("unavailable")` before dereference (was P1 #2); `managerRequest` accepts `PUT`;
  new `loadManagerLabelOverrides` / `saveManagerLabelOverrides`. `asLabelOverrides` validates
  every `labels[]` node + each `overrides` value; `isManagerCustomer` now validates every field
  the UI dereferences — `enabledSystems[].key`/`.displayName`, `sites[].displayName`,
  `supportedSystems[].key`/`.displayName` — so a poisoned `customer` echo (`enabledSystems:[null]`)
  routes to `onAuthorityFailure`, never `onSaved` (was P1 #3). Server domain errors
  (`UNKNOWN_LABEL_PATH` / `INVALID_LABEL_OVERRIDE` / `LABEL_OVERRIDES_TOO_LARGE`) still surface
  inline as the server's message.
* **Playwright** — `label-override-technician-form.spec.ts` (+ `.html`): CO2 form renders an
  overridden checklist label from a frozen `record.displayLabelOverrides`, a no-key record renders
  the definition label; harness signals `body[data-harness-ready]` after its module graph loads so
  the spec cuts the network (`context.setOffline(true)`) with no lazy-chunk race, and asserts the
  render did **zero fetch** with `navigator.onLine === false`. `manager-label-overrides.spec.ts`
  (+ `.html`, mocked `fetch`): load → edit → save → fresh reload persists effectiveLabel → clear
  → reload shows definitionLabel → rejected value shows a visible server message (no authority
  failure) → `labels:[null]`, `null` root body, and a poisoned PUT `customer` each route to
  `onAuthorityFailure` with no crash text. Both `--workers=1`.

**Accepted / read-only web views — NO web change, no double-apply.** Render
`inspection.displayControls`, already overridden server-side by 1a-i. **Known gap (API follow-up):**
the V7 `automatic_sprinkler` branch of `/api/master-system-inspections/:id` returns
`displayControls: null` and applies no overrides.

**DEFERRED — owner-approved:**
1. **Fire alarm.** Form renders labels from `resolveFireAlarmVisibleLabels(definition)` + literals,
   not the controls tree; V6 acceptor reads the frozen entry and `fireAlarmV6Acceptance.ts` is
   DO-NOT-MODIFY. Absent from `labelOverrideSystemKeys` (API + web) → `/label-overrides` 404s.
2. **Automatic sprinkler.** `resolveAutomaticSprinklerControls` (managerCustomers.ts) is V1-only
   (2-state) — a V7 customer's GET 409s `SYSTEM_DEFINITION_UNRESOLVABLE`. Needs a V7 fork in that
   resolver (mirroring `definitionControls.ts` / `co2DefinitionControls.ts`). Also dropped from
   `labelOverrideSystemKeys`; its web form + repo + type reverted to pre-slice. Its V7/historical
   acceptor `labelOverrides` strips stay (harmless defence-in-depth).
3. **Final report + PDF.** `finalServiceReport.ts` builds `section.fields[].label` from
   `flatten(response_payload)` → `labelFor(key)`, never a controls tree. Own backend slice.

**Gates (all green):** web typecheck + build; `test:label-overrides-parity` (16, incl. padded /
prototype-inherited / own-non-enumerable helper-parity cases); the 2 Playwright specs `--workers=1`
(technician re-run x2, manager re-run x3, stable); regression sweep `manager-app-auth-transitions`
/ `manager-navigation-request-count` / `hose-reel-v7-offline` / `co2-v7-cross-instance` /
`test:v7-stale-evidence` (1) / `test:v7-hose-reel-submit` (16) / `test:v7-automatic-sprinkler-submit`
(8). **API:** typecheck + build; historical-matrix (20) / v6-evidence (9) / wet-chemical-definition
(2) / v7EvidenceContracts + env + `labelOverrides.test.ts` (19). **Cold integration — ONE
disposable DB `phase6_seed_integration` on port 55432, exactly as §2** (`NODE_ENV=test` makes
`loadConfig().databaseUrl === SEED_INTEGRATION_DATABASE_URL`; the V6/V7 tests assert only the port,
`managerLabelOverrides.integration.test.ts` additionally asserts the `/phase6_seed_integration`
pathname — one DB satisfies all): `fireAlarmV6Acceptance.integration` + `co2V7` / `wetChemicalV7` /
`fireAlarmV7` / `v7EvidenceRace` + `managerLabelOverrides.integration` (2) → 12 pass, 0 skips.
`git status --short`: web files + shared helper + tests + 6 `apps/api` files (`labelOverrides.ts` —
`applyLabelOverrides` trims the replacement, `overriddenLabel` gates on
`Object.prototype.propertyIsEnumerable` so it matches `Object.entries` exactly (own + enumerable);
`managerCustomers.ts` allow-list; `hoseReelV7Acceptance.ts`, `automaticSprinklerV7Acceptance.ts`,
`masterSystemInspectionSync.ts`, `automaticSprinklerInspectionSync.ts` strips). DO-NOT-MODIFY list
clean; V1–V5 / Fire Alarm V6 / CO2 V1 / Wet Chemical V4 byte-identical to `e30c649`.
`P0 remaining: 0` `P1 remaining: 0` `P2 remaining: 0`. Not committed — owner does git.

</details>

<details><summary>Previous — 2026-09-08 label-overrides slice 1a-i (backend, committed <code>eadb12b</code>)</summary>

New capability: a Manager renames
existing field labels per customer (e.g. `dry_wet_riser` `pumps_auto_start` → "Pumps Start
Automatically") without a code deploy. **Display strings ONLY** — field keys, response shape,
evidence `fieldPath`s, `validResponses()` lists, the frozen manifest and above all
`contractSha256 = sha256(canonical(definition))` are never touched (proven byte-identical for
all 9 V7 systems with and without an override). Additive + reversible: a missing/blank override
falls back to the definition label. This slice is backend + data model + job-freeze +
Accepted-Detail-side rendering only — the technician web form + Manager UI are slice 1a-ii above.

Shape: new column `customer_enabled_systems.label_overrides jsonb NOT NULL DEFAULT '{}'` (fwd
migration `027_customer_label_overrides.sql`, object CHECK mirroring 008's `system_configuration`
CHECK, gated in `migrations.ts` on the constraint's presence). Canonical path grammar = the
**resolved-controls tree's own dotted object path** (`checklist.pumpHouse.pumps_auto_start`,
`measurements.jockey_pump_pressure.values.cut_in`, `repeatableRows.resultColumns.drumResult`) —
see `apps/api/src/inspections/labelOverrides.ts` (`applyLabelOverrides` — pure, clones, no-ops on
an empty/undefined map, applied AFTER the frozen `resolvedControls` equality gate;
`collectResolvedLabelPaths` / `resolvedLabelPathSet`). Overrides are per-customer, versioned via
the existing `customer_configuration_revisions` bump (`copySelectedConfiguration` forward-copies
`label_overrides` alongside `system_configuration` / zones / locations; a label-only edit keeps
the customer's current enabled-system order) and frozen into
`configuration_snapshot.enabledSystems[].labelOverrides` at job creation (`serviceVisits.ts`) —
**emitted only when a non-empty map exists** (like `systemConfiguration`), so a customer with no
override produces a snapshot byte-identical to `e30c649` and the strict `exact(system, …)`
historical acceptors (Fire Alarm V3–V5 `fireAlarmAccepted.ts`, Portable
`portableFireExtinguisherSync.ts`) do not regress (Sol P1-1 fix).
Manager route (`managerCustomers.ts`, `requireRole("admin")`): `GET` / `PUT`
`/manager/customers/:id/systems/:systemKey/label-overrides` — GET returns the resolved label
tree (path + definitionLabel + effectiveLabel + overridden) for the customer's frozen template
version; PUT server-validates every key resolves to a real label node in that system's published
definition (unknown path → 400 `UNKNOWN_LABEL_PATH`), each value a non-empty string ≤ 200 chars
(trimmed), map ≤ 300 entries, then supersedes the active revision and creates N+1 carrying the
edited map. **Bounded to the 5 systems with a server-side resolved-controls tree** (`hose_reel`,
`co2_fire_extinguisher`, `wet_chemical`, `fire_alarm_detector`, `automatic_sprinkler`) — other
systems 404 `LABEL_OVERRIDES_UNSUPPORTED_SYSTEM`; the storage/freeze/copy layer is
system-agnostic so this set can widen later without a data migration. **DEVIATION from the brief
file list:** the render change also lives in `routes/masterSystemInspections.ts` (not just
`acceptedMasterSystemDetail.ts`) — that route is where `displayControls` is serialized;
`acceptedDetailResponse` now takes an optional frozen override map (fetched by a new
`frozenLabelOverrides(jobId, systemKey)` reading the job's `configuration_snapshot`, NOT the
exact-key-checked `inspection_snapshot`) and applies `applyLabelOverrides` to
`system.resolvedControls`. V7 Accepted-Detail branches return `displayControls: null` as before
(no server controls tree ships for them) — the frozen map still rides `configuration_snapshot`
for the later web slice. Gates green from a cold `phase6_seed_integration` DB: api
typecheck + build, historical-matrix / v6-evidence / wet-chemical-definition / final-report unit,
new `test:label-overrides` (8), the full HANDOVER §2 cold integration batch + new
`managerLabelOverrides.integration.test.ts` (0 skips), web typecheck + build + v7-stale-evidence.
DO-NOT-MODIFY list clean; V1–V5 / Fire Alarm V6 / CO2 V1 / Wet Chemical V4 byte-identical to
`e30c649`. `P0 remaining: 0` `P1 remaining: 0`. Committed `eadb12b` (owner did git).

</details>

<details><summary>Previous — 2026-09-08 <code>ecc3e34</code> (8e-P1 "Summary of Testing")</summary>

**8e-P1 "Summary of Testing" derived roll-up committed `97a6437`,
then Terra remediation of Sol's 4 P1s on it committed `ecc3e34`
(`apps/api/src/reports/finalServiceReport.ts`, `finalServiceReport.test.ts`, `HANDOVER.md` only).
Sol re-reviewed `ecc3e34`: 0 P0 / 0 P1 on behaviour, 154 tests / 0 fail / 0 skip, protected
files byte-identical to `e30c649`; the only follow-up was this HANDOVER wording correction.
Nothing in the working tree is uncommitted any more.**
`97a6437` applied the client's "Summary of Testing" presentation (Option 1 of
`docs/client-format-request/format-adoption-options.md` — derived roll-up only; the full
cosmetic reskin is still a later task, NOT started): a DERIVED, report-output-only per-system
`condition` (`GOOD CONDITIONS | REFER DETAIL PAGE | FAILED`) + `conditionDetail` on
`FinalServiceReport.systems[]` / `FinalReportPreview.systems[]` — not stored, not a
template/contract field, a different axis from the 4-state per-field result model. PROVISIONAL
4→3 mapping pending client confirmation (any `Not Good`/`Poor` → FAILED; else any
`Complete Repair` → REFER DETAIL PAGE; else GOOD CONDITIONS), noted in a `finalServiceReport.ts`
comment. PDF "Service Summary" bullet list → a numbered "Summary of Testing" block + per-section
"Remarks:" list; web `FinalReportPresentation` summary table gained `No.` + `Condition` columns.
No handler / template / migration / schema / submit-gate change; V1–V5 / Fire Alarm V6 / CO2 V1
/ Wet Chemical V4 byte-identical. `97a6437` also carried 3 pre-existing
`docs/client-format-request/*` files (owner-included, unrelated to the type change) — recorded,
no action. **Sol's 4 P1s on `97a6437`, fixed in `ecc3e34` (still report-output-only):**
(P1-1) `deriveSystemCondition` froze `conditionDetail` on the first finding while `condition`
escalated — now it tracks the FIRST `Not Good`/`Poor` and the FIRST `Complete Repair` separately
and picks the one matching the final condition, so a FAILED system always shows a real failure
line. (P1-2) the PDF "Remarks:" list folded the *adjacent* next field — for flatten-based V7
systems (hydrant/hose_reel/dry_wet_riser/smoke_ventilation/fire_intercom) that omitted the
finding's OWN `fieldRemarks` entry (emitted many fields later) and folded a row-level `remarks`
instead. Extracted a pure `sectionRemarkLines(section)` helper that locates each finding's own
remark by LABEL STRUCTURE (Fire Alarm `${L} Remark(s)`; V7 flat `… - Result`/`… - Remarks`
siblings; V7 row `${head} - Field Remarks - ${tail}`), never by adjacency. (P1-3) the PDF test
asserted only signature/size, so P1-2 passed it — added an `extractPdfText()` test helper
(inflates streams, parses the `/ToUnicode` bfchar/bfrange CMap, maps the `<hex>` glyph runs) and
the render test now PROVES "Summary of Testing", the exact `1. … — FAILED` line, "Remarks:" and
the owned remark text in the rendered bytes, and asserts "Remarks:" is absent for a clean system.
(P1-4) HANDOVER §2's cold-start block was not hermetic — replaced with a single
`POSTGRES_DB=phase6_seed_integration` disposable DB + a `Confirm-Exit` gate after every step, the
v6 acceptance integration test folded into the guarded `node --import tsx --test` batch so it
cannot silently skip. Gates green: api typecheck+build, historical-matrix / v6-evidence /
wet-chemical-definition, `v7EvidenceContracts` + `env`, `finalServiceReport.test.ts` (11 — +1
`sectionRemarkLines` unit test, `deriveSystemCondition` + PDF cases extended), the full V7
integration set + `finalServiceReport.integration` / `.sprinkler.integration` /
`fireAlarmV6FinalReport.integration` / v6 acceptance integration against a cold
`phase6_seed_integration` DB (0 skips). Committed `ecc3e34`; Sol re-reviewed `ecc3e34` — 0 P0 /
0 P1 on behaviour, 154 tests / 0 fail / 0 skip, protected files byte-identical to `e30c649`. The
only follow-up was this HANDOVER wording correction.

</details>

<details><summary>Previous — 2026-09-07 <code>d9ea404</code></summary>

`d9ea404` (`refactor(web): implement task 8e-P1 …`) landed the 8e-P1 presentation pass — shared Final
Report body reworked for readability (key-value job-facts header, Service Summary index table
with `system.status` verbatim, grouped per-section field lists in `FinalReportPresentation.tsx`
+ `app.css`). No data-shape / API / PDF change. **Sol reviewed `d9ea404`: 0 P0 / 0 P1, NEW
DEFECTS: N, HISTORICAL IMMUTABILITY INTACT: Y, SAFE FOR MANUAL FINAL SANITY: Y, SAFE TO COMMIT:
Y** — one P2 observation (the `.report-summary`/`h3` restyle at `app.css:899-900` also lands on
New Service Visit "Add Customer" + Manager Customer Configuration headings; cosmetic, in-design,
no test/functional impact — scope to `.final-report` later if unwanted). Gates green:
`final-ui-acceptance` 16/16, `manager-final-report` failure-matrix + navigation Playwright specs
(run `--workers=1`; navigation harness is IndexedDB-block flaky under parallel cold start),
web typecheck + build, api historical-matrix/v6-evidence/wet-chemical-definition; `git diff
d9ea404^..d9ea404 -- apps/api` empty. **Only OWNER visual sign-off on `SV-20260906-41` remains
to fully close 8e-P1.** 8e-P2 PDF pass unchanged (deferred). Earlier this session: `f7decfd`
(4 stale Manager/riser test harnesses fixed), `0e17c74` (Fire Intercom + Smoke Ventilation
submit-gate client/server parity, 0.4b class), `28d7b55` (Hose Reel response schema 2 → 3,
multi-drum), then `25e3768` + **`f6aab25`** — Terra remediation of Sol's two P1s on `28d7b55`
(client exact-key discipline for schema 2/3 in `getHoseReelSubmitIssues`; drum-count decrease no
longer silently drops started technician drum sections). `apps/web`-only, additive, no server /
migration / template change. **Sol re-reviewed `f6aab25`: 0 P0 / 0 P1, NEW DEFECTS: N, SAFE TO
COMMIT: Y.** STEP 1.2 (Hose Reel V7 multi-drum) is now re-closed. Detail below.

</details>

**OPEN — carried to the next session:**
1. **Sol review pass still owed on `0e17c74`** (Fire Intercom + Smoke Ventilation submit-gate
   parity). `28d7b55` + its `f6aab25` remediation have had their Sol pass and are closed.
   Re-issue the `0e17c74` prompt from `.agents/skills/codex-task-brief`. (Overlaps OPEN item 3.)
2. **G7 4-state browser sanity — still owed by the owner** (manual, on the live runtime). Blocks
   closing G7. Checklist in §4 "Outstanding owner check".
3. **Fire Intercom STEP 2.3 final Sol verdict.** The `44fb682` P1 is fixed in `0e17c74`; a
   confirmation pass closes §6a's "Sol pass" line for Fire Intercom.
4. **8e-P1 — Final Report summary readability.** **Presentation pass committed `d9ea404`
   (Sol-passed 2026-09-07, 0 P0 / 0 P1, 1 cosmetic P2); derived "Summary of Testing" roll-up
   committed `97a6437`.** Shared `apps/web/src/jobs/FinalReportPresentation.tsx` +
   `apps/web/src/styles/app.css` — key-value job-facts header, Service Summary index table,
   grouped per-section field lists. `97a6437` added the DERIVED per-system `condition` verdict +
   `No.` column + PDF "Summary of Testing"/"Remarks:" (`deriveSystemCondition`,
   `condition`/`conditionDetail` on `systems[]`); provisional 4→3 mapping needs client
   confirmation. **Terra remediation of Sol's 4 P1s on `97a6437` committed `ecc3e34`**
   (`finalServiceReport.ts` + its test + this file only; report-output-only), Sol-re-reviewed
   2026-09-08 — behaviour PASS (0 P0 / 0 P1; 154 tests, 0 skip); the one doc-only P1 (this
   HANDOVER wording) is now closed. **Owner visual sign-off on `SV-20260906-41` still remains**
   before 8e-P1 is fully closed. (Run the two manager-final-report Playwright specs `--workers=1`.) Full cosmetic
   reskin still NOT started.
5. **Final PDF layout polish — DEFERRED by owner decision.** `apps/api/src/reports/finalServiceReport.ts`
   PDF layout gets ONE polish pass *after the last buildable system (Fire Rated Roller Shutter)*,
   not per-system. The photo embedding is fine as-is. This is a sequencing decision, not a gap.
6. **FM200 (STEP 2.1) + Fire Rated Roller Shutter (STEP 2.4)** — both still blocked on client
   input (see §5).

Detail on `28d7b55` — **Hose Reel V7 multi-drum (STEP 1.2 follow-up) — response schema
2 → 3, per-drum `drumType` label + technician-declared `drumCount`.** Owner confirmed the
`drumTypeCardinality: "pending_confirmation"` question: a customer may have >1 hose reel drum;
the technician enters the drum count up front (free-form integer, per visit) and the form renders
that many per-drum sections, each choosing its own type (`swing` | `fixed`) as a LABEL ONLY — the
per-drum result columns (drum/hose/nozzle/valve/nozzleBox) and the shared Water Tank / Pump House
header are unchanged. Schema 3 removes the global `drumTypes` multi-select, adds
`drumCount` to the response and `drumType` to every `HoseReelRow`. **Additive:** the schema-2
read path is kept everywhere (`parseV7Responses`, `validResponses`, `validateAcceptedHoseReelV7Detail`
all branch on `response.schemaVersion`), so every existing schema-2 Draft/Pending/Accepted record
opens, submits and accepts byte-identical; V1–V6 legacy (`drumTypes`, no `schemaVersion`) untouched.
**No V7 template change and no migration:** the published `masterServiceReportV7` hose_reel
definition already carries a (now-unused) global `drum_type` select from V1; changing it would
break every schema-2 accepted record's `contractSha256`. `drumType` is a fixed `{swing,fixed}`
enum validated by hardcoded lists client + server (exactly like `row.source`), bears no evidence,
and lives entirely in the JSON `response_payload` — no DDL, 017/018/026 untouched, DB
`response_schema_version` column stays `2` (matches how hydrant/fire-intercom/smoke-ventilation V7
already decouple it). Client form: drum-count entry → N per-drum sections with a swing/fixed
radio each, plus a non-binding "previous visit for this customer" reference
(`latestHoseReelReferenceForCustomer`) showing the prior drum count + per-drum types read-only.
Client `getHoseReelSubmitIssues` gains a schema-3 block (count is a positive integer,
`count === rows.length`, every `drumType ∈ {swing,fixed}`) mirroring the server `validResponses`
exact-key discipline. Gates green: `hoseReelV7.integration.test.ts` 10 → 13 (multi-drum schema-3
+ closed-job idempotent retry + schema-3 negatives + schema-2 regression, cold disposable PG),
`test:v7-hose-reel-submit` 8, `hose-reel-v7-offline.spec.ts` (2-drum swing/fixed round trip),
`technician-offline-regression.spec.ts` (legacy V1 harness), `hoseReelV7PdfEvidence.test.ts`,
full V7 integration set + `migrationReplayForwardOnly.integration.test.ts` (0 skipped), apps/api +
apps/web `typecheck`/`build`, `git diff --check` clean (CRLF only), DO-NOT-MODIFY list clean.
**Committed `28d7b55`.**

**Sol's two P1s on `28d7b55` — fix staged, UNCOMMITTED in the working tree (client-only, no
server change, no migration).** (P1-a) `getHoseReelSubmitIssues` did *not* actually mirror the
server's exact-key discipline — it checked only known keys, so an extra envelope key (e.g. a
leftover schema-2 `drumTypes` beside `drumCount`), an extra own property on a row, or a row
missing `drumType` all passed the client gate yet are rejected non-retryably by
`validResponses()`, stranding the queued Pending record offline. Added an `exactKeys` helper
(same shape as `0e17c74`'s FI/SV fix) + per-schema envelope/row key literals covering **both**
schema 2 and schema 3. (P1-b) a drum-count *decrease* silently discarded trailing technician
drum sections the technician had already filled in. `setHoseReelDrumCount` now trims only
trailing *empty* technician rows on a bare decrease (stops at the first started one); the form's
number input runs a `window.confirm` — mirroring the per-row "Remove Drum" confirm — before
passing `allowDroppingEnteredRows`; configured rows stay unconditionally protected. Regressions
in `hoseReelV7SubmissionIssues.test.ts` (`test:v7-hose-reel-submit` 8 → 16). Previously:
**Smoke Ventilation submit-gate Sol P1 closed — client parity
with `validResponses()`, no server change.** Same 0.4b class Terra just closed on Fire Intercom:
`structuralSubmitIssues()` in `apps/web/src/smokeVentilation/smokeVentilationRepository.ts` was a
strict subset of `smokeVentilationV7Acceptance.ts` `validResponses()`, so malformed shapes passed
the browser gate, got written Pending + queued, then hit a non-retryable server `VALIDATION_ERROR`
— offline that strands the technician's work. Fix mirrors the Fire Intercom mechanism exactly:
`exactKeys()` (a copy of the server's `exact()`) over the response envelope key set, the checklist
envelope + each checklist entry key set, and each Fan Schedule row's key set; `zoneSnapshot === null`
per row; `fieldRemarks` keys whitelisted against `smokeVentilationRowColumns`; all issues pushed
into the existing shared `submitIssues()` array — no new validation path. Client gate only; server
and `validResponses()` untouched. `smokeVentilationV7SubmissionIssues.test.ts` 13 → 20 (six new
malformed-shape regressions + a client/server parity table). Gates green:
`test:v7-smoke-ventilation-submit` (20), `test:v7-smoke-ventilation-browser` (1),
`smokeVentilationV7.integration.test.ts` (12, cold disposable PG), apps/web + apps/api
`typecheck`/`build`, `git diff --check` clean, apps/api diff empty. **Committed `0e17c74`**
(same commit as the Fire Intercom parity fix below). Previously:
**Fire Intercom STEP 2.3 Sol P1 closed — client submit-gate
parity, no server change.** Sol's re-review of `8f755af`+`44fb682` returned SAFE TO COMMIT: N
with one P1 (0.4b class): `submitIssues()` in `fireIntercomRepository.ts` did not mirror the
exact-envelope parity `fireIntercomV7Acceptance.ts` `validResponses()` enforces, so four
malformed shapes (a `fieldRemarks` key other than `conditionResult`, `zoneSnapshot !== null`,
an extra own property on a row, an extra own property on the response envelope) passed the
browser gate but are rejected non-retryably by the server — an offline Pending record stranded
behind an impossible acceptance. Fix: `structuralSubmitIssues()` now runs the server's
`exact()` check on the envelope key set and each row's key set, requires `zoneSnapshot === null`,
and whitelists `fieldRemarks` keys against `fireIntercomRowColumns`. Client gate only; server
and `validResponses()` untouched. `fireIntercomV7SubmissionIssues.test.ts` 18 → 23 (five new
client/server parity regressions). Gates green: `test:v7-fire-intercom-submit` (23),
`test:v7-fire-intercom-browser` (1), `fireIntercomV7.integration.test.ts` (12),
`acceptedMasterSystemDetail.fireIntercomV7.test.ts` (6), `test:v7-stale-evidence` (1),
apps/web + apps/api `typecheck`/`build`. **Committed `0e17c74`.** Previously: **Four red Manager / riser
browser harnesses fixed — test-hygiene only, no app change.** The HANDOVER note that claimed two
were already fixed by a test-hygiene pass was wrong; the pass had never been applied. Verdicts:
all four are stale-harness, not an `App.tsx` regression (the Manager Operations list→detail path
is byte-identical to `e30c649`; `git diff e30c649..HEAD -- apps/web/src/manager/` is empty).
(1) `manager-app-auth-transitions.html`
— `openCustomerDetail()` settled on `"Current settings" && "Sites"`, both of which the customer
*list card* renders ([`ManagerCustomerConfiguration.tsx:20`](apps/web/src/manager/ManagerCustomerConfiguration.tsx:20)),
so the wait no-op'd and the next `click("+ Add Site")` threw for the 5 Add-Site cases; now waits
on the detail-only `#customer-configuration-title` + the `+ Add Site` control. 24/24 cases green;
the `MANAGER_APP_AUTH_FORCE_FAILURE` switch still drives Playwright to exit 1. (2)
`manager-navigation-request-count.html` and (3) `manager-final-report-navigation.html` — the fetch
stubs never handled `/api/manager/customers`, which the Manager home loads via
`Promise.all([loadManagerServiceVisits, loadManagerCustomers])` ([`App.tsx:992`](apps/web/src/App.tsx:992),
identical at `e30c649:932`); the unstubbed call fell through to `503` → `ManagerApiError`
"unavailable" → fail-closed back to role selection, so the "Manager Operations" / "direct
Operations navigation" waits timed out. Added the one-line stub to each; the hard assertions
(`detailRequests === 1`; click/aborted/hashchange counts `1 / 0 / 2`) are unchanged and pass. (4)
`dry-wet-riser-v2-historical.spec.ts` — not a mounted-App harness; its `state()` poll helper did a
bare `JSON.parse(#result)` that threw on the initial `"Ready"` text and propagated out of
`expect.poll` as a hard fail; wrapped in `try/catch → "RUNNING"` to match the sibling specs.
Files: the three `.html` harnesses + the one `.spec.ts`. `npm run typecheck` / `npm run build`
(apps/web), `test:fire-alarm-dispatch`, `test:v7-cross-instance-browser` all green; `git diff
--check` clean. **Committed `f7decfd`; Sol reviewed 0 P0 / 0 P1.**
Previously: **RELEASE BLOCKER P0-M1 CLOSED — committed, deployed, verified.**
Both fixes are in: `4eee41e` (`fix(db): make V7 migration replay forward-only`) and `07a859b`
(`fix(db): re-home V7 definition publication to the seed (023/024 legacy-source drift)`). The
deployed API image was rebuilt (`docker compose build api && docker compose up -d`, api
container only — postgres / proxy untouched, no `down -v` / volume / prune, runtime DB never
queried or mutated) and **verified healthy: `inspection_pwa-api-1` `Up`, `restarts=0`,
`curl -k https://localhost/api/health` → `200`, migrate + seed clean on boot.** The drift fix
re-homes V7 definition publication into `seedMasterServiceReport` (the V7 system loop is now
`ON CONFLICT DO UPDATE`, `IS DISTINCT FROM`-guarded, so the seed reconciles a stored V7 row
that migrations `021`–`026` left diverging from `masterServiceReportV7.ts`); V1–V6 stay
`DO NOTHING`; no migration edited. Previously-red
`v7DetectorStateMigration.integration.test.ts` + `seedMasterServiceReport.integration.test.ts`
now green; new `migrationReplayForwardOnly` case *"heals a drifted V7 system definition"* fails
pre-fix with the exact deployed crash signature. Full V7 set + replay cover: **83 tests, 0
skipped**; fast gates green. **G5 CLOSED 2026-09-06:** a malformed successful create payload can
no longer call the success callback, and failed creation keeps the populated form with its server
message. Live technician verification returned canonical `201` job `SV-20260906-41`; the original
silent failure is not present in the current deployed build. **G9 CLOSED 2026-09-06:** the
cross-location V7 photo guard now blocks before queueing, and a server-side evidence conflict
becomes local Needs attention rather than an infinite retry. Next: G7 4-state browser sanity,
then the Fire Intercom Sol pass. See §4 P0-M1, §5, §7.
Previously: **P0-M1 FIXED, forward-only. Sol: SAFE TO COMMIT: Y (round 4;
0 P0 / 0 P1). Committed `4eee41e`.** `runMigrations` replayed migration `018` (and `021`–`026`)
unconditionally; each re-`ADD`s a `system_key` CHECK narrowed to the systems known when it was
written, and `ADD CONSTRAINT … CHECK` re-validates existing rows, so a deployed database
holding an evidence reservation for a later V7 system aborted startup with `23514` before a
downstream migration could re-widen it (`inspection_pwa-api-1` = `Restarting (1)`, confirmed
in the live API log). Fix: `018` guarded on the `master_template_version` marker (the guard
that already gates `017`); `021`–`025` run only while the schema has not reached `026` at all —
by the `system_key` CHECK **and** by no surviving evidence row for a post-`hydrant` system;
`026` — the only one carrying all nine systems — replays as the reconciliation step. The
`pg_constraint` predicate `evidenceSystemKeyCheckListsKey` inspects **both** evidence CHECKs
with a literal `position()` match (Sol round 1: the first cut used `LIKE` on one table only).
A fresh database still runs every migration in full. `017`/`018` untouched (frozen); no DB was
queried or mutated. `apps/api/src/db/migrationReplayForwardOnly.integration.test.ts` — 5 cases
(replay with `fire_intercom` + `hydrant` reservations; fresh-migrate completeness; one-sided
CHECK reconciled; both CHECKs dropped with a late reservation surviving; part-way rollout
rolled forward). Case 1 fails pre-fix; case 3 fails against the round-1 predicate; case 4
against the round-2 code. Full V7 set (76) + replay cover green from cold: **81 tests, 0
skipped**. Not re-added: the `021`–`024` stored-definition self-heal (entangled with a
pre-existing `023`/`024` legacy-source drift — see §7). Operator action to recover the deployed
runtime: `docker compose build api && docker compose up -d` (image rebuild + container
recreate; no DB surgery). See §4 P0-M1, §5, §7. Previously: **STEP 2.3 Fire Intercom DONE, end
to end** (committed `44fb682`; Sol review pending). The
second V7-only system (no V1-V6 lineage), composed fresh in `masterServiceReportV7.ts`
(`fire_intercom`, sortOrder 11, four-state natively). Structurally the simplest page on the form:
ONE `station_schedule` section, one `repeatable_table` (`asset_reference` "Station" /
`condition` / `remarks`), one section-level comments block, **no checklist sections and no header
fields at all**. Per the 2026-09-04 owner decision the paper's `Condition Yes`/`Condition No` x
`1`/`2` box grid is collapsed to one four-state result + own remark per station row; the original
four-box structure is not modelled, and the three interpretive calls are recorded in the
definition's own `confirmationNotes`. Full stack: migration `026` (evidence CHECK widening only),
contract adapter, `fireIntercomV7Acceptance.ts` (with G10's `sameManifest()` from day one),
`fireIntercomInspectionSync.ts`, sync/staged-evidence/job-completion wiring, Accepted Detail
reader + route branch, Final Report + PDF, and a new `apps/web/src/fireIntercom/` module.
Proofs: `fireIntercomV7.integration.test.ts` (12 cases incl. G10 reverse-order retry),
`acceptedMasterSystemDetail.fireIntercomV7.test.ts` (6), `fireIntercomV7SubmissionIssues.test.ts`
(12, both gates proven to fail against perturbed code), `fire-intercom-v7-offline.html/.spec.ts`
(browser round trip, 2 findings on distinct rows each loading its own accepted photo). Full V7
integration set green from cold: **76 tests** (was 62 with G10). G10 was committed on its own
first and is untouched by this task. Also in this change: §1/§3/§5/§6a corrected — STEP 0.2,
Hydrant 1.1, Hose Reel 1.2, Automatic Sprinkler 1.3 and Smoke Ventilation 2.2 were all still
labelled "uncommitted" here long after they were committed, and §6a still showed Hydrant / Hose
Reel / Automatic Sprinkler as not on V7. Real count is **10 / 12**. See §5 2.3, §6a and §7.
Previously: **STEP 2.2 Sol remediation committed and re-reviewed: SAFE TO
COMMIT: Y, 0 P0 / 0 P1.** Sol's first pass returned N with 2 P1s; both are now closed. (1) Manifest
ordering broke idempotent retry — fixed, and Sol's re-review confirmed Terra's dispute: the bug is
**INHERITED**, present in all six V7 acceptance handlers. **The other five are still wrong** and
are the top outstanding P1 (see §4 G10). (2) The configured-Fan-Schedule-row concern was a *test
and documentation* hole, not a missing guard — no guard added, correctly. **Note: Terra's stated
reason for refusing that guard was factually wrong** (it conflated
`initialStructureRequiredSystemKeys`, which only filters the technician initial-format picker and
already contains Dry/Wet Riser, with `locationDependentSystemKeys`, which governs Manager
assignment). The conclusion held; the reasoning did not. Corrected in §7 — do not trust the
remediation commit message on that point.
Previously: **STEP 2.2 Smoke Ventilation complete (committed `ade85f6`), Slices 1–3.**
The first system with **zero V1–V6 lineage**: composed fresh into `masterServiceReportV7.ts`
(sortOrder 10, four-state natively) rather than upgraded from V6, which needed a small new
"no legacy contract" registration in both `systemContractCompatibility.ts` files. Full V7
evidence path: adapter, migration 025, atomic acceptance, Accepted Detail, Final Report,
web module, offline round trip. 9 adversarial DB integration cases + 12-check offline browser
harness + 10 client submit-gate tests (drift guard proven to fail against a deliberately
perturbed client path). **STEP 2.1 FM200 remains BLOCKED** — the roadmap's "client says same
structure as CO2" line has no dated record and is contradicted by the stub's own
`confirmationNotes` and by `docs/paper-forms/fm200.md`; see §7.
Previously: STEP 1.5 Portable Fire Extinguisher closed (`7cba8fb`): hypothesis
confirmed — a V7-templated job's Portable Fire Extinguisher system already resolved, opened,
saved a Draft, submitted, and synced correctly with **zero code changes**, purely via the
structural (non-version-gated) match in `isCompatibleSystemContract`. Proved with a real browser
round trip and a real-Postgres integration test; no production file touched. Dry/Wet Riser STEP
1.4 offline-round-trip browser proof committed (`a1cb7bf`), two independent Sol review passes both
SAFE TO COMMIT: Y; G4 closed (was already fixed in `ba1fb2a`, just never marked done here).
Hydrant STEP 1.1 (`81db211`), Hose Reel STEP 1.2 (`efef275`) and Automatic Sprinkler STEP 1.3
(`7e2a7e6`) all committed and complete.
**Repo:** `C:\PWA_OfflineRecordWebApp`  ·  **Branch:** `phase-8e-client-demo-polish`  ·  **HEAD:** `ecc3e34` (2026-09-08: `97a6437` 8e-P1 "Summary of Testing" derived roll-up → `ecc3e34` 4-P1 remediation — both committed, Sol-passed on behaviour)
**Local runtime:** https://localhost/  ·  **Demo accounts:** Manager `mobiletest` / Technician `technician-demo` (passwords held by owner, never committed — created manually via `create-admin`, not seeded)

---

## 1. One-line status

**10 of 12 services on the V7 evidence model** — 9 with a full evidence workflow (Fire Alarm, CO2,
Wet Chemical, Hydrant, Hose Reel, Automatic Sprinkler, Dry/Wet Riser, Smoke Ventilation, Fire
Intercom), plus Portable Fire Extinguisher (registration-only by design, C4). All committed and
browser-proven through the full offline→sync→Accepted→PDF workflow. **Deployed API is up and
verified** on the drift-fix image (`07a859b`): `inspection_pwa-api-1` `Up`, health `200`,
migrate + seed clean. Release blocker P0-M1 (`4eee41e` + `07a859b`) is fully closed — see §4 /
§5. G5 and G9 are now closed; next: the G7 browser sanity, then the Fire Intercom Sol pass.
Result model is now
**4-state** (Hokuden legend: `good` / `not_good` / `complete_repair` / `na`); validators are
per-field `allowedValues`-driven so a 2-state page can declare its own set. Detector
Normal/Test/Isolation is multi-select. Shared repeatable-row model (C3) extracted, unconsumed.

**Hydrant STEP 1.1 — DONE, committed `81db211`.** Its seven deployed row result columns—including
both Canvas Hose results—use the four-state V7 definition with row+column evidence paths, additive
migration 021, field-owned accepted photos, and Final Report/PDF output. The isolated browser proof
covers IndexedDB reload, offline queueing, reconnect sync, and Accepted Detail.

**Hose Reel STEP 1.2 — DONE, committed `efef275`** (server slice landed with Hydrant in `81db211`).
**Follow-up (uncommitted): multi-drum response schema 3.** Owner resolved
`drumTypeCardinality: "pending_confirmation"` → per-drum. Schema 3 replaces the global `drumTypes`
multi-select with a technician-declared `drumCount` + a per-row `drumType` label (`swing`|`fixed`,
label only, no evidence). Schema-2 read path kept everywhere (all validators branch on
`response.schemaVersion`); V1–V6 untouched. No V7 template change, no migration — `drumType` is a
hardcoded enum in the JSON `response_payload` and the pre-existing `drum_type` template block stays
unused (changing it would break schema-2 `contractSha256`). Client form: count entry → N per-drum
sections with swing/fixed radios + a non-binding previous-visit reference for the same customer.
See the "Last updated" note for the full gate list.

**Automatic Sprinkler STEP 1.3 — DONE, committed `7e2a7e6`** (server + web slices `ba1fb2a`,
`eea9c5d`). **Owner decision:** V7 Automatic Sprinkler **drops** the legacy Cut-In/Cut-Out PSI photo
lifecycle — V7 carries V7 finding evidence only; the legacy PSI lifecycle stays exactly as-is for
V1–V6. The V7 input form no longer shows the legacy `PhotoEvidenceField` (gated on `!isV7`, proven
by `automaticSprinklerV7PsiControl.test.tsx`). Slice 3 added
`validateAcceptedAutomaticSprinklerV7Detail` (separate schema-2 reader), the `automatic_sprinkler`
+ schema-2 branches in `masterSystemInspections.ts` / `finalServiceReport.ts`
(`validHistoricalUnit`, `validatedV7SuppressionEvidence`, evidence dispatch), a schema-2 branch +
V7 accepted-evidence fetch in the web `ServerAutomaticSprinklerView` / `serverAutomaticSprinklerApi`,
and a full offline-round-trip browser proof (`automatic-sprinkler-v7-offline.html/.spec.ts`).
`stagedEvidence.ts` `/v7-evidence/accepted[/…/content]` now serve every V7 system (owner fix —
Hydrant/Hose Reel accepted photos returned empty before).

**Dry/Wet Riser STEP 1.4 — DONE, committed `a1cb7bf`.** The V7 web module (form, evidence
adapter, Accepted Detail, sync wiring) already existed from earlier work; this pass added the
missing `dry-wet-riser-v7-offline.html/.spec.ts` automated browser proof, mirroring Automatic
Sprinkler's Slice 3 harness: Save Draft → reload → offline Submit → reconnect Sync → Accepted →
Accepted Detail, with 3 distinct findings (checklist / measurement / riser-outlet row), each
owning its own remark + photo. Two independent Sol review passes, both **SAFE TO COMMIT: Y** —
the first pass caught a stale `sortOrder` on the harness's synthetic fixture definition and a
UUID-prefix collision with `fire-alarm-v6-offline.html`, both fixed and re-verified before commit.
**G4 also closed** (see §4) — it turned out to already be fixed server-side in `ba1fb2a`, just
never marked done in this doc. Historical V1–V6 riser (`dryWetRiserAccepted.test.ts`) unaffected.
Not yet through a live-runtime manual browser sanity pass (unlike Fire Alarm/CO2/Wet Chemical's
STEP 0.3) — verification here is the automated Playwright harness only.

Committed chain (all verified): `5bc968d` V7 foundation · `0e04a64` NTI multi-select ·
`7635cb3` paper-form transcription + C3 skill · `2e07ab1` C3 row model (T1) ·
`d7ecc0d` **C1-REWORK 4-state**. Safety branches: `phase-8f2b2a…d-final-accepted`, `phase-8f2c-final-accepted`.

**Deployed:** runtime rebuilt + recreated 2026-09-04 on the G7 fix, which was uncommitted at
that time
(`build-20260903T174358Z`); migration 020 applied, API booted clean, stored V7 defs are 4-state.
`SV-20260903-36` is already `technician_visible=false`. **Still owed: the 4-state browser sanity
pass** (checklist in §4) — it is the only thing between here and "3/12 fully proven".

**Fire Intercom STEP 2.3 — DONE.** The second system with **no V1-V6 lineage**,
built by mirroring Smoke Ventilation (STEP 2.2, `ade85f6`) and trimming: Fire Intercom is a strict
subset — one repeatable table, one four-state result per station row, one section-level comments
box, no checklist sections and no header fields. Its "legacy" contract version is 7 itself, the
same deliberate self-reference Smoke Ventilation introduced, so it also gets a single contract
variant rather than the legacy+V7 pair every STEP 1 system has.

**Next:** STEP 2.4 **Fire Rated Roller Shutter** still needs a client-confirmed spec, and STEP 2.1
FM200 remains blocked on a real client answer (see §5). With Fire Intercom done, every STEP 2
service that was *ready to build* is built. All STEP 1/2 services inherit 4-state + C3. C2
(remarks pick-list) remains deferred to last.

---

## 2. How to run / rebuild / test

```powershell
# Run the local runtime (https://localhost)
docker compose up -d
docker compose logs api --tail=50        # confirm migrations + seed ran clean

# Rebuild after code changes (images bake source at build time — no hot reload)
docker compose build api proxy ; docker compose up -d

# ---------------------------------------------------------------------------
# Cold, hermetic integration run. ONE disposable DB, named phase6_seed_integration
# so it satisfies both the port-55432 assertions (V6 acceptance / V6 final report)
# AND the pathname = /phase6_seed_integration assertions (final-report + sprinkler +
# manager/catalog). Every gate is followed by Confirm-Exit so a non-zero exit — or
# a SKIP that leaves node --test with a non-zero status — throws instead of being
# scrolled past. "A SKIP is not a PASS."
# ---------------------------------------------------------------------------
function Confirm-Exit($what) { if ($LASTEXITCODE -ne 0) { throw "$what FAILED (exit $LASTEXITCODE)" } }

docker rm -f phase8f-v7-verify 2>$null
docker run -d --rm --name phase8f-v7-verify -e POSTGRES_DB=phase6_seed_integration -e POSTGRES_USER=inspection_app `
  -e POSTGRES_PASSWORD=replace-with-a-real-secret-outside-git -p 127.0.0.1:55432:5432 postgres:16-alpine
Confirm-Exit "docker run"

# Wait until PostgreSQL is genuinely up. postgres:16-alpine runs a socket-only
# init server, stops it, then execs the real one — a single pg_isready hit can
# land in that window and the first tests then fail "Connection terminated
# unexpectedly". Require 5 consecutive TCP successes, then a real query.
$ready = 0
while ($ready -lt 5) {
  Start-Sleep -Seconds 1
  docker exec phase8f-v7-verify pg_isready -q -h 127.0.0.1 -U inspection_app -d phase6_seed_integration 2>$null
  if ($LASTEXITCODE -eq 0) { $ready++ } else { $ready = 0 }
}
docker exec phase8f-v7-verify psql -q -U inspection_app -d phase6_seed_integration -c "SELECT 1" | Out-Null
Confirm-Exit "postgres readiness"

cd apps/api
$env:NODE_ENV='test'
$env:DATABASE_URL='postgres://bogus:bogus@10.255.255.1:9999/nope'
$env:SEED_INTEGRATION_DATABASE_URL='postgres://inspection_app:replace-with-a-real-secret-outside-git@127.0.0.1:55432/phase6_seed_integration'

# Full V7 integration set + migration-replay cover + the final-report / V6 acceptance
# integration tests, ALL in one guarded batch so none can silently skip (each test
# self-manages its schema: DROP SCHEMA public CASCADE; CREATE SCHEMA public; runMigrations).
node --import tsx --test --test-concurrency=1 `
  src/sync/co2V7.integration.test.ts src/sync/wetChemicalV7.integration.test.ts `
  src/sync/fireAlarmV7.integration.test.ts src/sync/v7EvidenceRace.integration.test.ts `
  src/sync/hydrantV7.integration.test.ts src/sync/hoseReelV7.integration.test.ts `
  src/sync/automaticSprinklerV7.integration.test.ts src/sync/dryWetRiserV7.integration.test.ts `
  src/sync/smokeVentilationV7.integration.test.ts src/sync/portableFireExtinguisherV7.integration.test.ts `
  src/sync/fireIntercomV7.integration.test.ts `
  src/db/migrationReplayForwardOnly.integration.test.ts `
  src/sync/fireAlarmV6Acceptance.integration.test.ts `
  src/reports/finalServiceReport.integration.test.ts `
  src/reports/finalServiceReport.sprinkler.integration.test.ts `
  src/reports/fireAlarmV6FinalReport.integration.test.ts `
  src/routes/managerCustomers.integration.test.ts `
  src/routes/managerLabelOverrides.integration.test.ts `
  src/routes/managerSystemConfiguration.integration.test.ts `
  src/routes/managerEvidencePolicy.integration.test.ts `
  src/routes/managerLocations.integration.test.ts
Confirm-Exit "integration batch"

cd ../.. ; docker rm -f phase8f-v7-verify
Remove-Item Env:DATABASE_URL,Env:NODE_ENV,Env:SEED_INTEGRATION_DATABASE_URL -ErrorAction SilentlyContinue

# Fast gates  (run from the repo root)
cd apps/api
npm run typecheck ; Confirm-Exit "api typecheck"
npm run build ; Confirm-Exit "api build"
npm run test:historical-matrix ; Confirm-Exit "historical-matrix"
npm run test:v6-evidence ; Confirm-Exit "v6-evidence"
npm run test:wet-chemical-definition ; Confirm-Exit "wet-chemical-definition"
npm run test:label-overrides ; Confirm-Exit "label-overrides"
npm run test:final-report ; Confirm-Exit "final-report unit"
cd ../web
npm run typecheck ; Confirm-Exit "web typecheck"
npm run build ; Confirm-Exit "web build"
npm run test:v7-stale-evidence ; Confirm-Exit "v7-stale-evidence"
npm run test:label-overrides-manager ; Confirm-Exit "label-overrides-manager"
npm run test:system-configuration-manager ; Confirm-Exit "system-configuration-manager"
npm run test:evidence-policy-manager ; Confirm-Exit "evidence-policy-manager"
npm run test:locations-manager ; Confirm-Exit "locations-manager"
cd ../..
```

Rules: never `docker compose down -v` / `volume rm` / `system prune`. Never point tests at the
runtime Postgres. Git is done manually by the owner (agents never stage/commit/push).

---

## 3. What is DONE and verified

**STEP 0.1 — committed `5bc968d`** (safety branch `phase-8f2b2a-final-accepted`):

- V7 template `00000000-0000-4000-8000-000000000807` (MFE-FSSR v7), migration `018`, shared
  staged-evidence authority, per-system contract adapters (`co2_fire_extinguisher`,
  `wet_chemical`, `fire_alarm_detector`).
- Good / Poor / Not Relevant; per-Poor own remark + own photo; Normal/Test/Isolation untouched.
- Frozen manifest derived from the current Poor set; stale evidence (Poor→Good/NR) excluded.
- Evidence uniqueness scoped to `jobId + systemKey`; accepted-only partial indexes; concurrent
  race → one Accepted, loser mapped to terminal `EVIDENCE_CONFLICT` / Needs attention; different Job + same bytes allowed.
- Closed/hidden-job exact idempotent retry → same Accepted authority; unknown/forbidden/closed/
  hidden collapse to one response (`JOB_ACCESS_DENIED`).
- Fire Alarm V7 Accepted Detail requires owner/admin scope (no `technician_visible` over-restriction).
- Atomic acceptance, Accepted Detail, Final Report, PDF-with-embedded-image — all covered by
  integration tests against real PostgreSQL, reproducible from a cold start with a hostile
  `DATABASE_URL`.
- Historical immutability intact: V1–V5, Fire Alarm V6, CO2 V1, Wet Chemical V4 byte-identical.
- Docs: `.agents/skills/v7-evidence-acceptance/SKILL.md` + cross-references in sync-engine /
  backend-api-security / indexeddb-data-model / AGENTS.md.
- Review: 4 independent (Sol) passes; final verdict **SAFE TO COMMIT: Y**.

**STEP 0.2 — DONE, committed `0e04a64`** (re-verified 2026-09-03):

- `INSPECTION_CUSTOMER_CATALOG_VERSION` config key (`env.ts`, default 7); `managerCustomers.ts`
  consumes it for every customer/config-revision/service-visit insert; `inspectionReference.ts`
  lists + resolves v7 (Fire Alarm v7 → `resolveFireAlarmV6Controls(def, 7)`).
- New coverage: `env.test.ts` (unset→7, `"6"`→6); `managerCustomers.integration.test.ts`
  (catalog `[1..7]`, v7 Fire Alarm `templateVersion:7`, new customer + visit freeze v7).
- All standard gates + both new tests green. DO-NOT-MODIFY list clean.

**Derived "Summary of Testing" — committed `97a6437`** — `FinalServiceReport.systems[]` /
`FinalReportPreview.systems[]` carry a report-output-only `condition`
(`GOOD CONDITIONS`/`REFER DETAIL PAGE`/`FAILED`) + `conditionDetail`, rolled up in
`loadFinalServiceReport` from the accepted section fields (`deriveSystemCondition`); PDF
"Summary of Testing" block + per-section "Remarks:" list (`sectionRemarkLines`); web summary
table `No.`+`Condition` columns. Derived only — no stored/template/contract/submit-gate change;
PROVISIONAL 4→3 mapping flagged for client confirmation. Closes 8e-P1 (see §4). **Terra
remediation of Sol's 4 P1s on `97a6437` committed `ecc3e34`** (`finalServiceReport.ts` worst-
severity `conditionDetail`; label-structure `sectionRemarkLines` instead of adjacency;
`extractPdfText` proof helper; HANDOVER §2 cold-start block) — still report-output-only;
Sol-re-reviewed on `ecc3e34`, behaviour PASS (0 P0 / 0 P1; 154 tests, 0 skip); see the
"Last updated" note.

---

## 4. Known gaps / blockers

| # | Gap | Impact | Where |
|---|-----|--------|-------|
| ~~P0-M1~~ | **CLOSED 2026-09-06 — committed (`4eee41e` + `07a859b`), deployed image rebuilt, API verified `Up` (`restarts=0`, health `200`, migrate + seed clean).** The forward-only replay guards cleared the `23514`; the rebuild then surfaced the `023`/`024` legacy-source drift one step later in the post-migration seed, fixed by re-homing V7 definition publication to the seed with a guarded `ON CONFLICT DO UPDATE` (§5). Postgres / proxy never touched; runtime DB never queried or mutated. Was: `runMigrations` replayed every migration unconditionally, and `018` — plus `021`–`026` — each re-`ADD` the evidence `system_key` CHECK narrowed to the systems known when it was written. `ALTER TABLE … ADD CONSTRAINT … CHECK` re-validates existing rows, so any database holding a reservation for a system newer than that migration's list aborted startup with `23514` before a downstream migration could re-widen. Pre-existing since `81db211` (STEP 1.1, `021` introduced `hydrant`). Confirmed live: `inspection_pwa-api-1` = `Restarting (1)`, API log `23514` on `inspection_evidence_reservations_system_key_check` at `runMigrations` (`dist/db/migrations.js:202`). **Fix:** `018` replays only when the `staged_inspection_evidence_master_template_version_check` marker it sets is absent (the guard that already gates `017`). `021`–`025` replay only while the schema has not reached `026` at all; `026` — the only one of the six carrying the full nine-system list — replays whenever the two `system_key` CHECKs do not both list `fire_intercom`, and is the reconciliation step for a fresh install, a part-way rollout, or two CHECKs drifted apart. Predicate `evidenceSystemKeyCheckListsKey(key, "both" | "either")` inspects **both** evidence CHECKs with a literal `position()` match (no `LIKE` wildcards); `021`–`025` are additionally gated on `evidenceRowExistsForSystemOutside` so a database with both CHECKs hand-dropped still reconciles via `026` — both hardened after Sol review rounds 1–2. A fresh DB runs all of them; a deployed DB runs none. `017`/`018` byte-frozen; no runtime DB touched. Recovered by rebuilding + recreating the API container (`docker compose build api && docker compose up -d`) — code fix, not a DB change. Proof: `migrationReplayForwardOnly.integration.test.ts` (6 cases; case 1 fails pre-fix, case 3 fails the round-1 predicate, case 4 fails the round-2 code, case 5 — the 023/024 drift heal — fails against the pre-`DO UPDATE` seed). | Deployed API restart no longer fatal — verified `Up` on the `07a859b` image. | `apps/api/src/db/migrations.ts:83-168` (helpers), `:388-418` (guards); `apps/api/src/db/seedMasterServiceReport.ts:454-467` (drift fix); `apps/api/src/db/migrationReplayForwardOnly.integration.test.ts` |
| ~~G2~~ | **CLOSED 2026-09-03.** Full browser workflow proven for Fire Alarm + CO2 + Wet Chemical V7 on `SV-20260903-34`: 3-state, Poor+own remark+own photo, Save Draft → reload → offline Submit → reconnect → Sync → Accepted → Accepted Detail → photo → Complete Service → Final Report → PDF with 3 embedded images. Stale Poor→Good evidence correctly excluded. Historical CO2 V1 / Wet Chemical V4 unchanged (2-state). | — | — |
| ~~G3~~ | **CLOSED.** All V7 work through C1-REWORK committed (`d7ecc0d`). | — | — |
| ~~G4~~ | **CLOSED** (fixed in `ba1fb2a`, confirmed 2026-09-05 — never marked done here until now). `managerCustomers.ts`'s `assertDryWetRiserAssignments` rejects an unconfigured/invalid `dry_wet_riser` assignment at write time (`RISER_MODE_REQUIRED`, no valid `riserMode`); `inspectionReference.ts`'s `usableEnabledSystems` filter additionally excludes any stored riser row that fails `parseDryWetRiserSystemConfiguration` from `GET /customers/:id/configuration`, so a bad row degrades that one system instead of 500ing the whole customer. | — | — |
| ~~G5~~ | **CLOSED 2026-09-06.** The live technician flow returned `201` plus canonical job `SV-20260906-41`; its historical silent failure could not be reproduced on build `build-20260904T133127Z`. The client now rejects every non-2xx response with the server message and also rejects a malformed 2xx response missing a nonblank Job ID. `NewServiceVisit` independently refuses to call `onCreated` without that ID, preserving all selected form state and showing the existing warning. Browser regression covers both a server `409` and a `201` jobless body. | — | `apps/web/src/jobs/jobApi.ts`, `NewServiceVisit.tsx`, `tests/new-service-visit-failure.spec.ts` |
| ~~G6~~ | **PARTLY CLOSED 2026-09-04.** `d7ecc0d` deployed; 4-state options render in all 3 forms. Bug found + fixed (`3065539`): CO2/Wet Chemical `V7EvidenceField` was gated on `result === "poor"` (unreachable) so no photo could be attached on a finding — now `not_good \|\| complete_repair`. Deployed `sha256-188fbb1857f422d5`. |
| ~~G7~~ | **ROOT-CAUSED + FIXED 2026-09-04, awaiting browser re-verification.** Not a 4-state defect at all: the technician **attached the same photo to two findings**. Reproduced in-browser on `SV-20260904-38` (instance `10433777`), outbox `lastError` captured = `"This V7 inspection is unavailable"` (`JOB_ACCESS_DENIED`). Both staged rows carried identical `source_sha256` **and** `stored_sha256`, so `parseV7EvidenceManifest` refused the manifest, and `fireAlarmV7Acceptance.ts` folded `!manifest` into the collapsed job-access guard — reporting a payload problem as a Job problem. Confirmed the same duplicate pair in the owner's original `8b4cc663` rows. Fixes: (a) capture-time guard in `saveFireAlarmV7Photo` / `saveV7SuppressionPhoto` refuses a photo already attached to another field, naming it; (b) submit gate `duplicateV7PhotoIssues` in both `fireAlarmV7Evidence.ts` and `co2/v7Evidence.ts` — the offline-safety layer, same precedent as 0.4b; (c) server splits the manifest failure out of the collapsed guard (after it, so no job-existence leak) and names the reused image; CO2/WC get the same treatment plus a separate `EVIDENCE_NOT_STAGED` for two sources that normalize to the same stored bytes. Coverage: new `fireAlarmV7.integration.test.ts` case (first ever to submit `complete_repair`, a secondary alarm-device row finding with row-scoped evidence, and a reused photo); 3 new web submit-gate tests, the duplicate one **proven to fail against the pre-fix code**. | — | — |
| ~~G9~~ | **CLOSED 2026-09-06.** The shared CO2/Wet Chemical V7 client guard joins sibling `masterSystemFormInstances` through its `groupKey` (`jobId + systemKey`) and blocks the same bytes at capture and Submit Local, including only sibling fields that are currently evidence-required. The server’s acceptance pre-check now identifies the already-bound canonical field. A server `EVIDENCE_CONFLICT` is terminal in the outbox: the form remains local as **Needs attention** (`Conflict`) and its operation is no longer dispatched on later syncs. Coverage includes cross-instance client/unit + browser harnesses, a real-Postgres CO2 acceptance conflict, and a browser outbox no-loop harness. | — | `apps/web/src/co2/v7Evidence.ts`, `co2Repository.ts`, `sync/syncEngine.ts`; `apps/api/src/sync/co2FormInstanceSync.ts` |
| ~~G10~~ | **CLOSED 2026-09-06.** The order-independent `sameManifest()` comparison (length + fingerprint of `canonical`-ised entries, order-independent) — proven earlier on Smoke Ventilation — is now applied to the accepted-authority pre-check in all five remaining V7 acceptance handlers: `fireAlarmV7Acceptance.ts`, `hydrantV7Acceptance.ts`, `hoseReelV7Acceptance.ts`, `automaticSprinklerV7Acceptance.ts`, `dryWetRiserV7Acceptance.ts`. Comparison side only — `parseV7EvidenceManifest`'s fieldPath sort is the stored authority and is untouched. Permutation equality is the sole behaviour change: a manifest with different entries, a different length, or duplicates still returns `IDEMPOTENCY_CONFLICT`. One regression case per handler in its existing `*V7.integration.test.ts` (reverse-fieldPath manifest → accept → identical retry is duplicate success, and again after Job closure; plus dropped-entry and changed-bytes retries that both still conflict) — each proven to fail against the old positional comparison by reverting the one-line swap and observing the retry assertion fail with `IDEMPOTENCY_CONFLICT`, then restoring. **CO2 / Wet Chemical (`co2FormInstanceSync.ts`) checked and NOT affected** — it fingerprints over the `v7Manifest()`-sorted manifest on both the first-acceptance store and the retry pre-check, so an unsorted retry normalizes to the same fingerprint (the `grep` for `canonical(payload.evidenceManifest)` correctly did not match it). Full V7 integration set green: 62 tests (was 57). `hydrantV7.integration.test.ts` still sorts its happy-path manifest with a now-stale "compares … positionally" comment — harmless, left in place; a trivial follow-up can drop that workaround. | — | — |
| G8 | Fire Alarm form auto-persists a Draft on Add/Remove row (pre-existing — technician-row helpers write immediately). Not a C1-REWORK regression. Low priority. | Minor UX surprise. | `apps/web/src/fireAlarm/fireAlarmRepository.ts` |
| — | ~13 orphaned `staged` Fire Alarm evidence rows in runtime back to Aug 30 — abandoned drafts/test runs, **not a bug** (evidence stages before acceptance). Ignore or clean at leisure. Two more were added by the G7 repro (`10433777…`). | none | — |

### Outstanding owner check — 4-state browser sanity (blocks closing G7)

Sign in as `technician-demo` on `https://localhost/` (build `build-20260903T174358Z` or later), then
per system on a V7 job (`SV-20260903-37` is open and untouched):

1. **Fire Alarm / CO2 / Wet Chemical each:** `Good` and `No Need Checking / N.A.` show **no**
   remark-required and **no** photo widget; `Not Good` and `Complete Repair` each reveal
   `Remark *` **and** the photo widget on that field only.
2. **G7 regression:** attach one photo to a finding, then attach the *same file* to a second
   finding — expect `This photo is already attached to <field>. Each finding needs its own photo.`
   at capture time, and nothing queued.
3. Distinct photos on every finding → Submit → Sync → **Accepted** → Accepted Detail renders the
   4-state labels and serves each photo from `/api/v7-evidence/accepted/…`.
4. Complete Service → Final Report → **PDF** with one embedded image per finding.
5. Additive: historical CO2 (V1) and Wet Chemical (V4) still render 2-state.

### phase-8e client-demo polish backlog (owner-raised 2026-09-07, not started)

| # | Item | Notes |
|---|------|-------|
| 8e-P1 | **Final Report summary view is unclear / "too ugly".** Reference job `SV-20260906-41`. | **COMMITTED `d9ea404`, Sol-passed 2026-09-07 (0 P0 / 0 P1; 1 P2: `.report-summary` h3 restyle also touches New Service Visit + Manager Customer Configuration headings — cosmetic, in-design).** Reworked the SHARED `apps/web/src/jobs/FinalReportPresentation.tsx` + `apps/web/src/styles/app.css` report rules: job-facts is now a clean labelled key-value header (was a cramped 3-col dl), Service Summary is a scannable per-system index table after Asiamost's "SUMMARY OF TESTING" (`system.status` shown verbatim — no invented 3-state verdict), per-section field lists stack vertically with clearer label/value hierarchy and visible nested-depth grouping. Presentation only: no data-shape / API / PDF change. Both Technician + Manager views verified. **ONLY owner visual sign-off on `SV-20260906-41` remains.** 8e-P2 PDF pass unchanged (deferred). **FOLLOW-UP committed `97a6437`:** the client's actual "Summary of Testing" ask — a per-system `Condition` verdict, `No.` column, PDF "Summary of Testing" + per-section "Remarks:" — built as a DERIVED roll-up (`deriveSystemCondition` + `sectionRemarkLines` in `finalServiceReport.ts`; `condition`/`conditionDetail` on `systems[]`), Option 1 of `docs/client-format-request/format-adoption-options.md`. Provisional 4→3 mapping — client must confirm. Still derived/presentation only; no data/template/contract change. `system.status` ("Accepted") retained on the type but no longer shown in the summary table. `97a6437` also carried 3 pre-existing `docs/client-format-request/*` files (owner-included, unrelated) — recorded, no action. **Terra remediation of Sol's 4 P1s on `97a6437` committed `ecc3e34`** (`finalServiceReport.ts` worst-severity `conditionDetail`; `sectionRemarkLines` locates each finding's own remark by label structure not adjacency; `extractPdfText` proof helper; HANDOVER §2 cold-start block) — report-output-only; Sol re-review 2026-09-08 behaviour-PASS (0 P0 / 0 P1; 154 tests, 0 skip), the one doc-only P1 (this HANDOVER wording) closed here. Then the original owner visual sign-off. |
| 8e-P2 | **Final Report PDF layout.** Photo embedding is fine — leave it. | `apps/api/src/reports/finalServiceReport.ts`. **DEFERRED by owner decision** to ONE pass *after* the last buildable system (Fire Rated Roller Shutter), so it isn't re-touched per system. Not a gap — a sequencing decision. |

---

## 5. Roadmap

**Goal (owner-confirmed):** every service gets the V7 evidence model (Good / Poor / Not Relevant
+ per-Poor own remark + own photo) on a fixed base template, with future per-customer *minor*
modification done by the Manager via `customer_enabled_systems.system_configuration` (jsonb hook
already exists; editing UI is Phase 8H). Customers subscribe to many services; technician or
manager picks them (`customer_enabled_systems` rows).

### STEP 0 — Workflow demo: Fire Alarm + CO2 + Wet Chemical  ← DO FIRST  (~2–3 working days)
- [ ] 0.1 Commit the finished V7 work + create `phase-8f2b2a-final-accepted`. (ready now — owner review, then `git commit`)
- [x] 0.2 **G1 — V7 front door:** `customerCatalogVersion` config-driven (default 7);
      `inspectionReference.ts` catalog includes v7; Manager customer setup can choose v7.
      Re-verify gates + short Sol spot-check. **DONE + re-verified 2026-09-03** — all standard
      gates green; `managerCustomers.integration.test.ts` green after `createdb -h 127.0.0.1`
      fix (Codex's repro block used the racy unix socket). Uncommitted (6 files). Nits (owner's
      call): `loadConfig()` captured at module load in `managerCustomers.ts`; env pin to `"6"` is
      a soft default only — `inspectionReference.ts` still lists/asserts exactly 7 published rows.
- [x] 0.4 **DONE + verified 2026-09-03.** Seed demo customer `demoV7Customer`
      (`00000000-0000-4000-8000-0000000009xx`, code `DEMO-V7-SHARED-EVIDENCE`): customer +
      PRIMARY site + active configuration revision on V7 + 3 enabled systems (Fire Alarm, CO2,
      Wet Chemical, all frozen to V7 `…0807`) + one zone/location each for CO2 and Wet Chemical.
      **No job** — seeded jobs are deliberately `technician_visible = false` (regression-fixture
      isolation, asserted by `seedMasterServiceReport.integration.test.ts`). Guarded no-op on
      re-run. Terra did customer+systems+zones/locations; owner added the PRIMARY site
      (`…0909`, inside the same guard) so 0.3 needs no manual add-site. seed + manager
      integration + typecheck green. No open technician-visible pre-V7 Fire Alarm demo job
      exists (0.3 additive check will need a pre-V7 job created via the Manager, or accept the
      historical-matrix test as the V6 regression proof).
- [x] 0.4a **Web catalog contract fix (found by browser sanity, 2026-09-03).**
      `compatibleCatalogSystem` picked the contract template by scanning the catalog
      (`version === contractVersions[key] || version === 7`); since the catalog is ordered by
      version, V1 (CO2) / V4 (Wet Chemical) always shadowed V7, so a V7 job compared its V7
      definition against the historical contract, mismatched, and threw "Cached template version
      is unavailable" — **CO2 and Wet Chemical V7 were unreachable in the browser**. Now the
      contract version is derived from the job's frozen identity.
      `apps/web/src/referenceData/systemContractCompatibility.ts` + new regression suite
      `apps/web/tests/v7CatalogContractResolution.test.ts` (`npm run test:v7-catalog-contract`,
      proven to fail against the old code). Fire Alarm branch untouched.
- [x] 0.4b **Fire Alarm V7 client submit gate (found by browser sanity, 2026-09-03).**
      `v7FireAlarmSubmissionIssues` had dropped every *structural* check `v6SubmissionIssues`
      performs (Control Panel Location, at-least-one-primary-device-row, per-row Alarm Zone /
      Location / all four Normal-Test-Isolation) while the server's `validResponses`
      (`apps/api/src/sync/fireAlarmV7Acceptance.ts`) still enforced them. The form therefore
      queued submissions the server rejected non-retryably with `VALIDATION_ERROR` — offline
      that strands the technician's work in the outbox as "Sync needs attention" with no
      recovery. Structural checks restored in `apps/web/src/fireAlarm/fireAlarmV7Evidence.ts`;
      regression suite `apps/web/tests/fireAlarmV7SubmissionIssues.test.ts`
      (`npm run test:v7-fire-alarm-submit`, proven to fail against the old code).
- [x] 0.3 **G2 — browser sanity: DONE 2026-09-03** on release `sha256-785201faec6bed92`
      (`build-20260903T095536Z`), job `SV-20260903-34`. Per system: Good / Poor / Not Relevant;
      Poor revealed its own remark + photo controls on that field only; Save Draft → full page
      reload → state, remark and photo rehydrated; offline Submit queued ("waiting to sync");
      reconnect → Sync → Accepted. Accepted Detail rendered `Main Supply: Good`,
      `Battery: Not Relevant`, `CO2 Cylinder: Poor - <remark>` with the photo served from
      `/api/v7-evidence/accepted/…`. Stale case: a second field set Poor with a photo then
      reverted to Good was excluded — never staged, never accepted. Complete Service → Final
      Report → PDF (30,543 bytes, 3 `/Subtype /Image` + 3 `/DCTDecode` streams). Accepted
      evidence is field-scoped: `…co2_cylinder`, `…wet_chemical_cylinder`,
      `charger_batteries.charger_battery_checks.main_supply`, all `master_template_version = 7`.
      Additive check: historical CO2 (V1) and Wet Chemical (V4) forms still render 2-state.
- [ ] 0.5 Commit checkpoint (0.2 + 0.4 + 0.4a + 0.4b). **→ Demo-ready.**
      Not yet re-run since the web fixes: the full API gate set. Re-run before committing.

### CROSS-CUTTING — decide before building more services
- [x] **C1 DECIDED 2026-09-03, owner-CONFIRMED 2026-09-04 — 4-state everywhere, all customers.**
      Hokuden cover legend is the house grading standard for every customer:
      `good` (√ Good/Baik) · `not_good` (X Not Good/Tidak Memuaskan) ·
      `complete_repair` (◯ Complete Repair/Siap Baik Pulih) · `na` (/ No Need Checking/N.A.).
      (The MFE system pages are only 2-state; the 3rd/4th states come from the Hokuden cover
      sheet — owner has confirmed this is intentional and universal.) Supersedes the shipped
      3-state. Done via **C1-REWORK** below (`d7ecc0d`).
- [x] **C1-REWORK (Phase 8F.2C):** V7 result model 3-state → 4-state. `masterServiceReportV7.ts`
      `upgradeV7EvidenceSystem` emits the 4 values; every V7 validator
      (`fireAlarmV7Acceptance.ts`, `co2FormInstanceSync.ts`, …) honors **per-field
      `allowedValues`** instead of hardcoding the set (so a 2-state page like Roller Shutter can
      declare `["good","not_good"]`); accepted detail + PDF render 4 states; migration rewrites
      stored V7 definitions (FK-safe: `INSERT … ON CONFLICT DO UPDATE`, restart-proof — see the
      reverted 020 FK failure); V7 Fire Alarm contract SHA recomputed + web constant updated;
      the 3 accepted V7 demo records on `SV-20260903-36` must be owner-cleaned/re-seeded. The
      FK-safe 020 upsert and disposable T1-definition restart proof are green; V1–V6 untouched.
- [ ] C2 **Remarks pick-list — DEFERRED to the very last step (owner, 2026-09-04).** Client has
      not supplied the list. Build every service with free-text remarks for now; retrofit the
      pick-list once received. Do not invent one.
- [x] C3 **Repeatable row model** — skill `.agents/skills/repeatable-row-model/SKILL.md` (`7635cb3`);
      helpers `apps/web/src/inspectionControls/repeatableRows.ts` + 4-invariant tests (`2e07ab1`,
      T1). Unconsumed until STEP 1.1 (Hydrant) / STEP 2.4 (Roller Shutter).
- [x] **C4 DECIDED 2026-09-05 (owner) — a service with no result ovals on its paper form gets no
      V7 evidence; never invent one.** Portable Fire Extinguisher's paper form is count-fields-only
      (no Good/Poor anywhere). Precedent for any future service in the same situation: V7 work is
      registration-only (carry the existing fields onto the V7 template/contract), not a synthetic
      "overall condition" field. See STEP 1.5.
- **Fire Intercom (STEP 2.3) — UNBLOCKED (owner, 2026-09-04).** Do not wait on the client for the
      `Condition Yes / No` `1`/`2` column meaning. Model each floor row as one standard 4-state
      result (good / not_good / complete_repair / na), same as every other service. The paper
      form's Yes/No `1`/`2` grid collapses to a single per-row result + remark.

### STEP 1 — Upgrade existing base templates to V7 evidence  (est. ~4–5 weeks total)
Each: add a V7 evidence-contract adapter (mirror `co2Adapter`), wire the web form to the V7
field, add integration coverage, re-verify, Sol pass.
- [x] 1.1 **Hydrant — DONE, committed `81db211`.** 7-column row-scoped V7 evidence,
      web wiring, Accepted Detail/Final Report/PDF, and integration/browser proof.
- [x] 1.2 **Hose Reel — DONE, committed `efef275`** (server slice landed with Hydrant in
      `81db211`). V7 combined checklist +
      repeatable-drum evidence adapter, forward-only migration 022, and atomic single-instance
      acceptance; V7-only 4-state web wiring, per-finding photos/remarks, evidence-first outbox,
      and the V7 catalog front-door resolver. Slice 3 adds a separate schema-2 Accepted Detail reader,
      accepted evidence rendering, Final Report/PDF embedding, adversarial eight-case integration coverage,
      and browser reload/sync/detail proof. The paper form supports only Duty / Standby in the new 30-minute test block;
      it explicitly omits Jockey, so no Jockey row was invented.
      **Follow-up committed `28d7b55` (2026-09-07): multi-drum.** Response schema `2 → 3` —
      technician-declared `drumCount` + per-drum `drumType` (`swing`|`fixed`, label only), global
      `drumTypes` multi-select removed, prior-visit reference surfaced. Additive (schema-2 path
      kept everywhere), no template change, no migration. **Sol pass still owed** before this
      follow-up is re-closed — see §1 open item 1 and §7.
- [x] 1.3 **Automatic Sprinkler — DONE, committed `7e2a7e6`.** Water Tank /
      Pump House / Main Alarm Valve / 30-min pump test on the V7 four-state model, separate
      schema-2 Accepted Detail reader, Final Report/PDF embedding, and a full offline-round-trip
      browser proof. **Owner decision:** V7 DROPS the legacy Cut-In/Cut-Out PSI photo lifecycle
      (V7 carries V7 finding evidence only); the legacy PSI lifecycle is untouched for V1–V6.
- [x] 1.4 **Dry / Wet Riser — DONE, committed `a1cb7bf`.** Dry/Wet toggle, Riser Outlet table,
      four-state checklist/measurement/row-scoped V7 evidence (web module was already built from
      earlier work); this pass added the missing `dry-wet-riser-v7-offline.html/.spec.ts`
      offline-round-trip browser proof (Save Draft → reload → offline Submit → reconnect Sync →
      Accepted → Accepted Detail, 3 distinct findings across checklist/measurement/row scopes,
      each with its own remark + photo). Two Sol review passes, both **SAFE TO COMMIT: Y**.
      Historical V1–V6 riser (`dryWetRiserAccepted.test.ts`) unaffected. See also G4 (closed).
- [x] 1.5 **Portable Fire Extinguisher — DONE, committed `7cba8fb`.** No V7 evidence at all (owner
      decision C4): `docs/paper-forms/portable-fire-extinguisher.md` has no result ovals for this
      section (count fields only — Total / 9KG Dry Powder / 2KG CO2 / free-text Others +
      Comments), so there is no Poor-capable field to hang a photo/remark on and none was
      invented. **Investigation found the hypothesis true: zero code changes needed.** Portable's
      definition has been byte-identical since `masterServiceReportV5.ts` (V6/V7 both fall
      through unchanged), both contract-version maps
      (`apps/web/src/referenceData/systemContractCompatibility.ts`,
      `apps/api/src/inspections/templates/systemContractCompatibility.ts`) compare a job's system
      definition against the V5 contract structurally rather than gating on an exact template
      version, and every call site (`serviceVisits.ts`, `portableFireExtinguisherSync.ts`,
      `managerCustomers.ts`, the web sync engine's dedicated `isPortableOutboxItem` path) already
      calls `isCompatibleSystemContract` without a `frozenMasterTemplate` filter — so a V7 job's
      Portable Fire Extinguisher system already resolves, opens, saves a Draft, submits, and syncs
      end to end with no version gate anywhere in the chain. Proved (not just inspected) with
      `apps/web/tests/portable-fire-extinguisher-v7-offline.html/.spec.ts` (Draft → reload →
      offline Submit → reconnect Sync → Accepted → Accepted Detail, zero evidence/photo steps, on
      a V7-templated job fixture) and `apps/api/src/sync/portableFireExtinguisherV7.integration.test.ts`
      (real Postgres: a V7-templated job accepts through the unmodified
      `syncPortableFireExtinguishers` path, plus an exact-retry duplicate check). Existing
      historical coverage (`portableFireExtinguisherDefinition.test.ts`,
      `portable-fire-extinguisher-sync-race.html`) re-run and confirmed still green, untouched.
      No new Good/Poor/evidence field, no evidence-contract adapter, V1–V6 untouched.

### STEP 2 — New services (need a fresh definition from the paper master + client input)
- [ ] 2.1 **FM200 — BLOCKED, client-input gate NOT satisfied (investigated 2026-09-05).**
      The "client says 'same structure as CO2 for now'" line below was written into this roadmap
      by the very commit that first created the roadmap skeleton (`be9ad11`, 2026-09-03 14:12);
      `git log -S` finds no other source for it, and there is **no dated §7 change-log entry**
      recording it the way C1/C2/C4 and the "client answers" entry each got one. It is also
      contradicted by two later, more careful artefacts: the fm200 stub's own
      `confirmationNotes` in `masterServiceReportV1.ts:639` ("Do not enable this system or infer
      fields from CO2 or Wet Chemical definitions") and `docs/paper-forms/fm200.md` (committed
      `7635cb3`, ~8 h *after* the roadmap line), which records that FM200 has **no page at all**
      in any source PDF and that "it is not known whether MFE uses the CO2 page as a stand-in".
      **To unblock, one of:** (a) a dated, attributed change-log entry confirming the client was
      actually asked *after* the paper-form research and said "reuse the CO2 checklist"; or
      (b) an explicit owner override of the stub's own prohibition, with reasoning. Do not
      resolve by inference. *(original note, unverified: clone the CO2 V7 adapter with FM200
      labels; flip `requires_confirmation` → `confirmed`. ~2 d)*
- [x] 2.2 **Smoke Ventilation — DONE, committed `ade85f6`, Slices 1–3.** First system with **no V1–V6
      lineage at all**: composed fresh in `masterServiceReportV7.ts` (sortOrder 10, four-state
      natively, no `upgradeV7*`/`fourState` rewrite because there is no legacy shape to
      preserve). That required one real, small extension in both `systemContractCompatibility.ts`
      files — a system whose "legacy" contract version *is* 7, giving it a single contract
      variant instead of the legacy+V7 pair every STEP 1 system has. Source
      `docs/paper-forms/smoke-ventilation.md`; follows the **blank master (Revision A)** — one
      Control Panel No. / Location / Date Tested, a single Fan Schedule table (No. / Auto /
      Manual / Remarks), Power Supply (AC + DC), Charger & Batteries, Main Function Key (4),
      Comments. **Two interpretive calls are recorded in the definition's own
      `confirmationNotes`** (same convention as Dry/Wet Riser's and Hose Reel's): (i) Auto/Manual
      are modeled as two independent four-state results under the page's general Good/Poor
      legend — confirm with the client if they instead denote a fixed operating-mode selection;
      (ii) the Hokuden revision's 3 zone panels (8 rows each) and its free-text (not oval) AC/DC
      fields are not modeled. Also: "Date Tested" is a `text` control, not a new `date` control —
      the paper form is a write-in line and no per-system date control exists anywhere in the
      web layer, so none was invented. Fan Schedule rows reuse the existing
      `repeatable_table` + `customer_system_locations` machinery with `supportsZones: false`
      (`zone_id` is already nullable) rather than a new "fixed rows, no location" mechanism.
      Migration `025` widens the two evidence CHECK constraints only — the system row itself is
      brand new, so the ordinary seed `INSERT … ON CONFLICT DO NOTHING` inserts it. Proofs:
      `smokeVentilationV7.integration.test.ts` (9 adversarial cases: stale evidence, reused
      photo naming, stored-hash collision, cross-Job byte reuse, concurrent race, closed/hidden/
      unknown/forbidden collapse, closed-Job idempotent retry, clean zero-finding draft),
      `smoke-ventilation-v7-offline.html/.spec.ts` (12 checks, Draft → reload → offline Submit →
      reconnect Sync → Accepted → Accepted Detail with 3 photos across both evidence scopes),
      `smokeVentilationV7SubmissionIssues.test.ts` (10 client-gate tests incl. the 0.4b
      client/server path-drift guard, proven to fail against a deliberately perturbed path).
- [x] 2.3 **Fire Intercom — DONE, end to end.** The **second** system with no
      V1–V6 lineage, composed fresh in `masterServiceReportV7.ts` (`fire_intercom`, sortOrder 11,
      four-state natively, no `upgradeV7*`/`fourState` rewrite). Built by mirroring Smoke
      Ventilation (2.2, `ade85f6`) and **trimming** — Fire Intercom is a strict subset of it, not
      a new mechanism: one `station_schedule` section → one `repeatable_table`
      (`station_schedule_rows`: `asset_reference` labelled "Station" / `condition` / `remarks`)
      plus one section-level comments block, and that is the whole page. Its "legacy" contract
      version is 7 itself (same self-reference 2.2 introduced), so it gets a single contract
      variant in both `systemContractCompatibility.ts` files. Source
      `docs/paper-forms/fire-intercom.md`. **Spec was fixed by the 2026-09-04 owner decision, not
      by client input:** the paper's `Condition Yes` / `Condition No` × unlabelled `1`/`2` box
      grid is collapsed into ONE V7 four-state result (`good`/`not_good`/`complete_repair`/`na`)
      plus that row's own remark; the original four-box structure is **not modelled**. Three
      interpretive calls are recorded in the definition's own `confirmationNotes`: (i) the box
      collapse and the fact that page 10 carries no legend at all; (ii) the pre-printed station
      labels (`9`…`1`, `Grd Floor`, `Basement`, `Genset`, `Pump Room`, + one blank write-in row)
      are preset configured rows and therefore a Manager-configuration concern (STEP 3.1 /
      Phase 8H) — the definition guarantees no particular rows, a customer with none starts with
      an empty table, and technician write-in rows are always allowed; (iii) the page has **no
      header fields whatsoever** (no Date Tested, no panel/control number, no location line) and
      none were invented, and the single `Comments :` area spans the whole grid so it is one
      section-level block, not a per-row note. Migration `026` widens the two evidence CHECK
      constraints only — the system row itself is brand new, so the ordinary seed
      `INSERT … ON CONFLICT DO NOTHING` inserts it; 017/018 untouched. Row evidence uses the C3
      shape `station_schedule.station_schedule_rows.rows.<rowUuid>.condition`, and the per-row
      `condition` result is the **only** Poor-capable field on the page. Proofs:
      `fireIntercomV7.integration.test.ts` (12 cases — the Smoke Ventilation adversarial set plus
      the **G10 reverse-fieldPath retry from day one**: unsorted-but-identical retry is duplicate
      success, again after Job closure, while a dropped entry and a changed `sourceSha256` are
      still `IDEMPOTENCY_CONFLICT`), `acceptedMasterSystemDetail.fireIntercomV7.test.ts` (6),
      `fireIntercomV7SubmissionIssues.test.ts` (12 client-gate tests — both the 0.4b
      client/server path-drift guard and the duplicate-photo-across-two-findings gate proven to
      fail against deliberately perturbed / pre-fix code), and
      `fire-intercom-v7-offline.html/.spec.ts` (Draft → reload → offline Submit → reconnect Sync
      → Accepted → Accepted Detail, 2 findings on distinct station rows each loading its own
      accepted photo). Browser-verified: the form shows exactly two fieldsets (Station Schedule +
      Comments), a four-state control per station row, a working write-in row, and no Date
      Tested / panel / location field.
- [ ] 2.4 **Fire Rated Roller Shutter** — NOT in the paper master; only in real Hokuden reports
      (No. / Location / Auto Alarm Mode / Manual Mode, 45+ rows). **Needs a client-confirmed spec
      first.** + definition + V7 adapter. (~1 w incl. client input)

### RELEASE BLOCKER — P0-M1 migration replay  ← CLOSED 2026-09-06 (committed + deployed + verified)
- [x] **`runMigrations` no longer re-applies migration `018`'s (or `021`–`026`'s) narrowing
      CHECK constraints on a database that has already advanced past them.** Implemented as the
      repo's existing per-migration `pg_constraint` guard idiom (same as `008` / `017`), so no
      new table and no edit to the frozen `018`. `018` gates on its `master_template_version`
      marker; `021`–`025` run only while the schema has not reached `026` at all (by the
      `system_key` CHECK **and** by no surviving evidence row for a post-`hydrant` system);
      `026` is the reconciliation step, safe against any database. Proven by
      `migrationReplayForwardOnly.integration.test.ts` (5 cases). Sol review rounds 1–4:
      **SAFE TO COMMIT: Y, 0 P0 / 0 P1**, proposed message
      `fix(db): make V7 migration replay forward-only`.
- [x] **P0-M1 deployed-image rebuild — DONE + verified 2026-09-06.** Rebuild #1 (from `4eee41e`)
      cleared the `23514` but surfaced the `023`/`024` drift below in the post-migration seed.
      Rebuild #2 (from `07a859b`, after the drift fix committed) recreated **only**
      `inspection_pwa-api-1` (postgres / proxy untouched, no `down -v` / volume / prune) and
      startup completed: `docker compose logs api` shows migrate + seed clean, `inspection-api
      listening`, `inspection_pwa-api-1` `Up` `restarts=0`, `curl -k https://localhost/api/health`
      → `200`. Runtime Postgres never queried or mutated at any point.
- [x] **Follow-up (own task, not P0) — FIXED 2026-09-06, committed `07a859b`.**
      Migrations `021`–`026` publish the V7 system definitions with `INSERT … SELECT` from the
      `…501`/`…802` legacy rows and replay on every startup; a later TS-only edit to
      `masterServiceReportV7.ts` left the migration-computed `automatic_sprinkler` /
      `dry_wet_riser` definition diverging from the tracked source, and the seed's strict
      published-template assertion then crash-looped the API (the second failure the P0-M1
      rebuild surfaced). **Fix:** re-homed V7 definition publication into `seedMasterServiceReport`
      — the V7 system loop is now `ON CONFLICT (template_version_id, system_key) DO UPDATE`
      (guarded by an `IS DISTINCT FROM` `WHERE` so an in-sync reseed stays a true no-op),
      making the seed the single source of truth and re-healing any drifted stored V7 row on
      the next boot. V1–V6 loops stay `DO NOTHING` (never migration-written). No migration
      edited, no runtime DB touched. Proof: previously-red
      `v7DetectorStateMigration.integration.test.ts` and
      `seedMasterServiceReport.integration.test.ts` now green; new
      `migrationReplayForwardOnly.integration.test.ts` case *"heals a drifted V7 system
      definition (023/024 legacy-source drift) on replay"* (fails pre-fix with the exact
      deployed crash signature). Full V7 set + replay cover: **83 tests, 0 skipped**; API +
      web typecheck/build, `test:historical-matrix` (20), `test:v6-evidence` (9),
      `test:v7-stale-evidence` (1), `managerCustomers.integration` all green.
      `apps/api/src/db/seedMasterServiceReport.ts:454-467`. Committed `07a859b`
      (`fix(db): re-home V7 definition publication to the seed (023/024 legacy-source drift)`);
      on the deployed image since rebuild #2.

### STEP 3 — Manager administration  (Phase 8H)
- [~] 3.1 Manager UI for per-customer `customer_enabled_systems` configuration.
      - [x] slice 1 — `system_configuration` vertical (backend API + Manager web UI) for
        `dry_wet_riser` (`riserMode`), via the slice 1a-i `label_overrides` mechanism. Fresh
        `dry_wet_riser` customers can now be stood up through the UI. No migration.
      - [x] slice 2 — evidence-policy assignment vertical (backend API + Manager web UI) for
        `customer_enabled_systems.evidence_policy_id`, via the slice 1 `system_configuration`
        mechanism. **Plumbing only:** bounded to `automatic_sprinkler` + the one published legacy
        PSI policy; a functional NO-OP for V7 customers (the V7 acceptance path never reads
        `system.evidencePolicy`) pending a V7-era policy catalog. No migration.
      - [x] slice 3a — per-customer zone/location configuration vertical (backend API + Manager
        web UI) for `customer_system_zones` / `customer_system_locations`, via the slice 1/2
        mechanism. **CO2 / Wet Chemical are now UI-configurable end to end:** a Manager defines
        zones + preset locations for `co2_fire_extinguisher` / `wet_chemical` through
        `GET`/`PUT /manager/customers/:id/systems/:systemKey/locations` (or inline on
        `configuration-revisions`), which is what flips the "Assigned Services" checkbox from
        disabled ("Location configuration required") to assignable. No migration (tables + FKs
        exist since migrations 004/006).
      - [x] slice 3b — cosmetic / summary pass over the STEP 3.1 config screens
        (consolidated "Per-service settings" frame + at-a-glance summary + unified collapsible).
      - [x] service tick-list ("Assigned Services") UI polish — actionable "Location
        configuration required" pointer to the Zones & locations editor; inline Riser mode
        control also surfaces for an already-enabled riser with an unset mode (server
        `RISER_MODE_REQUIRED` 400 is the documented fallback); untick-drops-config warning.
        Web-only copy/UX; save path byte-unchanged.
      - [x] final-polish P1 — summary/warning alignment: `ManagerPerServiceSummary`'s "Zones &
        locations" `set` test widened to `zones.length > 0 || locations.length > 0` to match
        `enabledSystemHasSavedSettings`, so a lone zone with no locations no longer reads "not
        set" on the chip while the untick-drops-config warning fires for it. Web-only.
- [~] 3.2 Manager review of completed reports / service history (partly exists).
      - [x] slice A — read-only filtering/pagination on the existing `GET /manager/service-visits`
        (`customerId`, `siteId`, `status`, `systemKey`, `from`/`to`, keyset `cursor`/`limit`),
        both per-customer and per-site scope. No migration, no new table, no write path.
      - [x] slice B — read-only service-history view on the `manager-customer` customer
        configuration screen, scoped to that customer with a Site filter (All Sites default) and
        a Status filter; "Load more" keyset pagination. Web-only, uses Slice A's filters
        as-is. `systemKey`/`from`/`to` are left unwired — no date-range or system-key control in
        this slice.

### STEP 4 — Production / real-device readiness  (Phase 9)
- [ ] 4.1 HTTPS on LAN/phone with a trusted cert; production credentials; security checklist.
- [ ] 4.2 Backup + restore drill; on-prem Windows deployment runbook validation.

**Rough total to "all client services on V7 + Manager mods" ≈ 6–9 weeks** of the Codex loop +
owner reviews, gated on client input for C1/C2/2.3/2.4.

---

## 6. Handover package (what the next owner gets)

- This file (`HANDOVER.md`) — live status + run/test/rebuild instructions.
- Git history with per-phase `*-final-accepted` safety-pointer branches.
- `.agents/skills/` — architecture knowledge transfer (V7 evidence/acceptance, sync, IndexedDB, API security, deployment).
- `docs/architecture/` + `docs/testing/` — design decisions and test procedures.
- `AGENTS.md` — repo conventions and the git-ownership rule.

**To hand over cleanly:** finish Tier 1, commit, ensure `HANDOVER.md` §1/§3/§4/§5 reflect reality,
then the repo is self-describing.

---

## 6a. Service status (target: all on V7 evidence model)

| Service | Base template | V7 evidence workflow | Left to do |
|---|---|---|---|
| Fire Alarm / Detector | ✅ confirmed | ✅ **done** (4-state, NTI multi-select, browser-proven) | deploy `d7ecc0d` + re-check 4-state |
| CO2 Fire Extinguisher | ✅ confirmed | ✅ **done** (4-state, browser-proven) | ″ |
| Wet Chemical | ✅ confirmed | ✅ **done** (4-state, browser-proven) | ″ |
| Hydrant | ✅ confirmed | ✅ **done** (4-state, browser-proven, committed `81db211`) | — (first C3 consumer) |
| Hose Reel | ✅ confirmed | ✅ **done** (4-state, browser-proven, `efef275`; multi-drum schema-3 follow-up `28d7b55`) | Sol pass owed on `28d7b55` |
| Automatic Sprinkler | ✅ confirmed | ✅ **done** (4-state, browser-proven, committed `7e2a7e6`) | — (V7 drops legacy PSI lifecycle, owner decision) |
| Dry / Wet Riser | ✅ confirmed | ✅ **done** (4-state, browser-proven, committed `a1cb7bf`) | — |
| Portable Fire Extinguisher | ✅ confirmed | ✅ **n/a by design (C4)** — confirmed working on V7 with zero code changes, browser + integration proven | — |
| FM200 | ⚠️ requires_confirmation | ❌ | STEP 2.1 — **BLOCKED on a real client answer**, see roadmap |
| Smoke Ventilation | ✅ confirmed (V7-only) | ✅ **done** (4-state, browser + 9-case DB proven, committed `ade85f6`) | — |
| Fire Intercom | ✅ confirmed (V7-only) | ✅ **done** (4-state, browser + 12-case DB proven) | Sol pass |
| Fire Rated Roller Shutter | ❌ none | ❌ | STEP 2.4 — `docs/paper-forms/fire-rated-roller-shutter.md`; 2 failed one-shot attempts, split into 3 slices |

Done: **10 / 12 on V7** — 9 with a full V7 evidence workflow (Fire Alarm, CO2, Wet Chemical,
Hydrant, Hose Reel, Automatic Sprinkler, Dry/Wet Riser, Smoke Ventilation, Fire Intercom; the last
two are the only ones with no V1–V6 lineage), plus Portable Fire Extinguisher — registration-only
by design (C4), no evidence workflow. Base template ready: 10 / 12. Remaining: **FM200** (stub,
`requires_confirmation`, blocked on a real client answer) and **Fire Rated Roller Shutter** (no
template, needs a client-confirmed spec).
All 10 implemented services share the 4-state result model, per-field `allowedValues` and the C3
repeatable-row model; the 9 with an evidence workflow share the V7 staged-evidence authority
(Portable FE has no Poor-capable field by C4, so it has nothing to hang evidence on). FM200 and
Roller Shutter have no implementation yet.

## 7. Change log

- 2026-09-07 — **Hose Reel schema-3 Sol P1 remediation — client exact-key discipline + drum-count
  data-loss guard. Committed `25e3768` + `f6aab25`; Sol re-reviewed `f6aab25`: 0 P0 / 0 P1, SAFE
  TO COMMIT: Y.** `apps/web`-only, additive, no server / migration / template change
  (`git diff 28d7b55..f6aab25 -- apps/api` empty). (P1-a) `getHoseReelSubmitIssues` now runs a
  genuine `exactKeys` gate over the response envelope and every row for schema 2 **and** schema 3,
  literals copied from `hoseReelV7Acceptance.ts` `validResponses()` — closes the escape where an
  extra envelope/row key queued a Pending record the server rejects non-retryably. (P1-b)
  `setHoseReelDrumCount` trims only trailing *empty* technician drum sections on a bare decrease;
  `HoseReelInspectionForm.tsx` runs a `window.confirm` (mirroring the per-row "Remove Drum"
  confirm, treating an attached V7 photo as started data) before discarding a started section,
  then passes the new `allowDroppingEnteredRows` opt-in. Configured rows stay unconditionally
  protected. Exported `hoseReelTechnicianRowHasEnteredData`. Gates: `test:v7-hose-reel-submit`
  8 → 16 (P1-a negative-shape regressions + P1-b repo unit tests, clean schema-3 draft = []),
  full V7 integration set 83/83 + `migrationReplayForwardOnly` 0 skipped, `hose-reel-v7-offline` +
  `technician-offline-regression` specs, apps/api + apps/web `typecheck`/`build`, `git diff
  --check` clean, DO-NOT-MODIFY byte-identical.

- 2026-09-07 — **Hose Reel V7 multi-drum (STEP 1.2 follow-up) — response schema 2 → 3. Committed `28d7b55`.**
  Baseline `e30c649`, branch `phase-8e-client-demo-polish`. Closes the
  `drumTypeCardinality: "pending_confirmation"` question with an owner decision: a customer may
  have >1 hose reel drum; the technician enters `drumCount` up front (free-form positive integer,
  per visit) and the form renders that many per-drum sections, each picking its own `drumType`
  (`swing` | `fixed`) as a **label only** — the per-drum result columns
  (drum/hose/nozzle/valve/nozzleBox) and the single shared Water Tank / Pump House header are
  unchanged. The form also surfaces the technician's previous Hose Reel visit for the same
  customer (`latestHoseReelReferenceForCustomer`) as a **non-binding** read-only reference.
  - **Schema.** JSON `response_payload.schemaVersion` `2 → 3`: drops the global
    `drumTypes: {swing,fixed}` multi-select, adds `drumCount` to the response and `drumType` to
    every `HoseReelRow`. The DB `response_schema_version` column stays `2` (same JSON-vs-column
    decoupling hydrant / fire-intercom / smoke-ventilation V7 already use), so **no migration** and
    the shared evidence CHECK constraints are untouched (017/018/026 frozen;
    `migrationReplayForwardOnly.integration.test.ts` unaffected).
  - **No V7 template change.** The published `masterServiceReportV7` `hose_reel` definition already
    carries a now-unused global `drum_type` select inherited from V1; editing it would change
    every existing schema-2 accepted record's `contractSha256` (frozen-manifest re-parse +
    evidence reservation match). `drumType` is a hardcoded `{swing,fixed}` enum validated by
    literal lists on both client and server (exactly like `row.source`), carries no evidence, and
    lives entirely in the JSON payload.
  - **Additive.** `parseV7Responses`, `validResponses`, `validateAcceptedHoseReelV7Detail` all
    branch on `response.schemaVersion`, keeping the schema-2 read/accept path byte-identical; every
    existing schema-2 Draft / Pending / Accepted still opens, submits and accepts. V1–V6 legacy
    (`drumTypes`, no `schemaVersion`) untouched.
  - **Client gate.** `getHoseReelSubmitIssues` gains a schema-3 block — `drumCount` a positive
    integer, `drumCount === rows.length`, every row `drumType ∈ {swing,fixed}` — mirroring the
    server `validResponses` exact-key discipline (the 0.4b class fixed twice this week).
  - **14 files.** `hoseReelTypes.ts`, `hoseReelRepository.ts` (`setHoseReelDrumCount` row
    reconciliation keeping configured rows, `latestHoseReelReferenceForCustomer`),
    `hoseReelV7Evidence.ts`, `HoseReelInspectionForm.tsx`, `serverHoseReelApi.ts`,
    `ServerHoseReelView.tsx`, `apps/api/src/sync/hoseReelV7Acceptance.ts`,
    `apps/api/src/inspections/acceptedMasterSystemDetail.ts`,
    `apps/api/src/reports/hoseReelV7PdfEvidence.test.ts`, `hoseReelV7.integration.test.ts`,
    `hoseReelV7SubmissionIssues.test.ts`, `hose-reel-v7-offline.html/.spec.ts`, `HANDOVER.md`.
    **`finalServiceReport.ts` deliberately unchanged** — its V7 `hose_reel` branch reads the frozen
    snapshot + manifest adapter (neither touches `drumType`/`drumCount`) and `flatten()` already
    renders both from `response_payload`; PDF *visual layout* is the separate deferred pass.
  - **Gates.** `hoseReelV7.integration.test.ts` 10 → 13 (multi-drum schema-3 with drum-2
    row-scoped evidence + closed-job idempotent retry; schema-3 negatives; schema-2 byte-for-byte
    regression), `test:v7-hose-reel-submit` (8), `hose-reel-v7-offline.spec.ts` (2-drum
    swing/fixed round trip), `technician-offline-regression.spec.ts` (legacy V1 harness),
    `hoseReelV7PdfEvidence.test.ts`, full V7 integration set (87 tests) +
    `migrationReplayForwardOnly.integration.test.ts` (0 skipped), `test:historical-matrix` (20),
    `test:v6-evidence` (9), `finalServiceReport.test.ts`/`.integration.test.ts` (8 + 1), apps/api +
    apps/web `typecheck`/`build`, `git diff --check` clean, DO-NOT-MODIFY list byte-identical.
  - **Sol pass:** DONE. Sol found 2 P1s on `28d7b55` — (P1-a) the client `getHoseReelSubmitIssues`
    schema-3 block validated only known keys, so it did NOT actually mirror the server's exact-key
    discipline: an extra envelope key (e.g. a leftover schema-2 `drumTypes` beside `drumCount`),
    an extra own property on a row, or a schema-2-shaped row inside a schema-3 envelope all passed
    the client gate yet are rejected non-retryably by `validResponses()`, stranding the queued
    Pending record offline; (P1-b) a drum-count *decrease* silently discarded trailing technician
    drum sections the technician had already filled in. **Remediated in `25e3768` + `f6aab25`**
    (`apps/web`-only, additive): a real `exactKeys` helper + per-schema envelope/row key literals
    copied from `hoseReelV7Acceptance.ts` covering schema 2 **and** 3; `setHoseReelDrumCount` now
    trims only trailing *empty* technician rows on a bare decrease (stops at the first started
    one) and the form's drum-count input runs a `window.confirm` — mirroring the per-row "Remove
    Drum" confirm, and counting an attached V7 photo as started data — before passing
    `allowDroppingEnteredRows`; configured rows stay unconditionally protected. Regressions in
    `hoseReelV7SubmissionIssues.test.ts` (`test:v7-hose-reel-submit` 8 → 16). Sol re-review of
    `f6aab25`: **0 P0 / 0 P1, NEW DEFECTS: N, HISTORICAL IMMUTABILITY INTACT: Y, SAFE TO
    COMMIT: Y.** STEP 1.2 re-closed.
  - **Out of scope (noted, still open):** Manager-side per-customer drum configuration (owner:
    technician free-form field, not a `customer_system_locations` concern); PDF visual layout;
    the FI/SV/HR client key whitelists have no compile-time link to the server arrays (drift
    risk, not a defect); the same missing exact-key discipline in the Hydrant / Automatic
    Sprinkler / Dry-Wet Riser client submit gates, and SV's missing rowUuid
    format/uniqueness + technician `locationSnapshot===null` checks.

- 2026-09-07 — **Smoke Ventilation submit-gate Sol P1 closed — client parity with `validResponses()`. Committed `0e17c74`** (with the Fire Intercom parity fix below).
  Baseline `e30c649`, branch `phase-8e-client-demo-polish`. Parallel to the Fire Intercom P1 below —
  Terra's report flagged the identical gap in Smoke Ventilation.
  - **P1 (0.4b class).** `structuralSubmitIssues()` in
    `apps/web/src/smokeVentilation/smokeVentilationRepository.ts` was a strict subset of
    `apps/api/src/sync/smokeVentilationV7Acceptance.ts` `validResponses()`. Malformed shapes
    returned `submitIssues=[]` on the client yet the server rejects them non-retryably
    (`VALIDATION_ERROR`), stranding a Pending record in the outbox — offline, unrecoverable
    field-data loss: (a) an extra own property on the response envelope beyond
    `schemaVersion`/`controlPanelNo`/`location`/`dateTested`/`checklist`/`rows`/`comments`;
    (b) an extra key on the `checklist` envelope; (c) an extra key on a checklist entry beyond
    `result`/`remarks`; (d) an extra own property on a Fan Schedule row object; (e)
    `row.zoneSnapshot !== null` (server requires `=== null`); (f) a `row.fieldRemarks` key other
    than `autoResult`/`manualResult`.
  - **Fix (client only).** `structuralSubmitIssues()` now mirrors `validResponses()` for exactly
    those rules: `exactKeys()` (a copy of the server's `exact()`) over `responseEnvelopeKeys`, the
    checklist envelope key set (derived from `smokeVentilationChecklistFields`), `checklistEntryKeys`,
    and `rowKeys`; `zoneSnapshot === null` per row; a `fieldRemarks` key whitelist driven by
    `smokeVentilationRowColumns`. Same mechanism Fire Intercom uses (issues pushed into the shared
    `submitIssues()` array) — no new validation path. Server, `validResponses()` and
    `masterServiceReportV7.ts` untouched.
  - **Tests.** `apps/web/tests/smokeVentilationV7SubmissionIssues.test.ts` 13 → 20: one regression
    per malformed shape plus a client/server parity table, each asserting the V7 evidence gate is
    blind to the shape (the pre-fix escape route), that the server predicate fragment rejects it,
    and that `submitIssues()` now returns a non-empty issue list. Four-shape reproduction re-run
    against a pre-fix copy of the gate (`git show HEAD:…`): all six shapes returned `[]` pre-fix,
    a non-empty list post-fix; a clean draft returns `[]` on both.
  - **Gates.** `test:v7-smoke-ventilation-submit` (20), `test:v7-smoke-ventilation-browser` (1),
    `smokeVentilationV7.integration.test.ts` (12, cold disposable PG on `127.0.0.1:55432`),
    `acceptedMasterSystemDetail.{fireIntercom,dryWetRiser,automaticSprinkler}V7.test.ts` (15, shared
    module unchanged), apps/web + apps/api `typecheck`/`build`, `git diff --check` clean (CRLF only),
    apps/api diff empty, DO-NOT-MODIFY list clean. Files: `smokeVentilationRepository.ts`,
    `smokeVentilationV7SubmissionIssues.test.ts`, this file.

- 2026-09-07 — **Fire Intercom STEP 2.3 Sol P1 closed — client submit-gate parity. Committed `0e17c74`.**
  Baseline `e30c649`, branch `phase-8e-client-demo-polish`. Sol's re-review of `8f755af`+`44fb682`
  passed everything else (row-remarks provenance, order-independent `sameManifest`, evidence scope,
  migration 026 scope, forward-only replay, historical immutability) and returned SAFE TO COMMIT: N
  on one P1.
  - **P1 (0.4b class).** `submitIssues()` in `apps/web/src/fireIntercom/fireIntercomRepository.ts`
    was a strict subset of the server's `configuredFireIntercomRowsMatch` + `validResponses()`
    pair. Four demonstrated escapes returned `submitIssues=[]` on the client yet the server rejects
    them non-retryably (`VALIDATION_ERROR`), stranding a Pending record in the outbox — offline,
    unrecoverable field-data loss: (a) `row.fieldRemarks` with any key other than `conditionResult`;
    (b) `row.zoneSnapshot !== null` (server requires `=== null`); (c) an extra own property on a
    row object (server enforces exact row keys); (d) an extra own property on the response
    envelope beyond `schemaVersion`/`rows`/`comments`.
  - **Fix (client only).** `structuralSubmitIssues()` now mirrors `validResponses()` for exactly
    those four rules: `exactKeys()` (a copy of the server's `exact()`) over `responseEnvelopeKeys`
    and `rowKeys`, `zoneSnapshot === null` per row, and a `fieldRemarks` key whitelist driven by
    `fireIntercomRowColumns`. Same mechanism Smoke Ventilation uses (issues pushed into the shared
    `submitIssues()` array) — no new validation path. Server and `validResponses()` untouched;
    `masterServiceReportV7.ts` untouched.
  - **Tests.** `apps/web/tests/fireIntercomV7SubmissionIssues.test.ts` 18 → 23: one regression per
    malformed shape plus a client/server parity table, each asserting the V7 evidence gate is
    blind to the shape (the pre-fix escape route), that the server predicate fragment rejects it,
    and that `submitIssues()` now returns a non-empty issue list. Sol's reproduction re-run: all
    four shapes now return a non-empty list; a clean draft still returns `[]`.
  - **Gates.** `test:v7-fire-intercom-submit` (23), `test:v7-fire-intercom-browser` (1),
    `fireIntercomV7.integration.test.ts` (12, cold disposable PG), `acceptedMasterSystemDetail.fireIntercomV7.test.ts`
    (6), `test:v7-stale-evidence` (1), apps/web + apps/api `typecheck`/`build`, `git diff --check`
    clean (CRLF only), DO-NOT-MODIFY list clean. Files: `fireIntercomRepository.ts`,
    `fireIntercomV7SubmissionIssues.test.ts`, this file.

- 2026-09-07 — **Four red Manager / riser browser harnesses fixed (test-hygiene only).**
  Baseline `e30c649`, branch `phase-8e-client-demo-polish`. All four were stale harnesses, not an
  `App.tsx` regression — the Manager Operations list→detail navigation path is byte-identical to
  `e30c649` (`git diff e30c649..HEAD -- apps/web/src/manager/` empty; the only `App.tsx` change
  since baseline is the additive smoke-ventilation / fire-intercom form routes). The earlier
  HANDOVER claim that a test-hygiene pass had already fixed two of them was false; nothing had
  been applied.
  - `apps/web/tests/manager-app-auth-transitions.html` — **harness-timing.** `openCustomerDetail()`
    settled on `mount.textContent.includes("Current settings") && …("Sites")`, but the customer
    *list card* already renders both strings
    ([`ManagerCustomerConfiguration.tsx:20`](apps/web/src/manager/ManagerCustomerConfiguration.tsx:20):
    a `Current settings` status badge and a `Sites` label per card), so the wait returned before
    `manage.click()`'s detail render committed and the next `click("+ Add Site")` threw
    `Missing actual App button: + Add Site` for the 5 Add-Site cases. Now waits on the detail-only
    `mount.querySelector("#customer-configuration-title")`
    ([`ManagerCustomerConfiguration.tsx:28`](apps/web/src/manager/ManagerCustomerConfiguration.tsx:28))
    plus `"Current settings"` and the `+ Add Site` control. 19/24 → 24/24. The
    `MANAGER_APP_AUTH_FORCE_FAILURE` verification switch still forces Playwright exit 1 (checked).
  - `apps/web/tests/manager-navigation-request-count.html`,
    `apps/web/tests/manager-final-report-navigation.html` — **harness-timing / missing fetch stub.**
    The mounted Manager home loads
    `Promise.all([loadManagerServiceVisits(), loadManagerCustomers()])`
    ([`App.tsx:992`](apps/web/src/App.tsx:992), identical at `e30c649:932`). Neither stub had a
    `/api/manager/customers` branch, so it fell through to `new Response("", {status:503})` →
    `readResponse` JSON-parse throw → `ManagerApiError(kind:"unavailable")` →
    `failClosedManagerOperations` bounced to role selection (`"Manager server data is currently
    unavailable."`), and the `"Manager Operations"` / `"direct Operations navigation"` waits timed
    out. Added `if (url === "/api/manager/customers") return json({ customers: [] });` to each.
    The specs' hard assertions are untouched and pass: `detailRequests === 1`;
    `clickDetailRequests / clickAbortedDetailRequests / hashchangeDetailRequests === 1 / 0 / 2`
    — so no App regression in detail-request counting or abort handling.
  - `apps/web/tests/dry-wet-riser-v2-historical.spec.ts` — **spec-timing** (not a mounted-App
    harness — a repository-level `getOrCreateDryWetRiserInspection` / `saveDryWetRiserDraft` /
    `submitLocalDryWetRiser` reload test). The one-line spec's `state()` poll helper did a bare
    `JSON.parse(await page.locator("#result").innerText()).status`; on the first poll `#result` is
    still `"Ready"`, `JSON.parse` throws, and the exception propagates out of `expect.poll` as an
    immediate hard failure instead of retrying. The other three specs already guard this with
    `try { … } catch { return "RUNNING"; }`; applied the same guard here. Harness body unchanged
    and passing (V2 Draft survives reload, legacy Pending outbox, `schemaVersion:1`, no
    `evidenceManifest`).
  - Gates: `npm run test:manager-app-auth`, the three raw `npx playwright test` specs,
    `npm run typecheck` + `npm run build` (apps/web), `npm run test:fire-alarm-dispatch`,
    `npm run test:v7-cross-instance-browser` — all green. `git diff --check` clean (CRLF warnings
    only). P0 remaining: 0. P1 remaining: 0. Not staged (owner does git).

- 2026-09-07 — Web harness cleanup + V6 Fire Alarm client-sync fix. Retired the rotted
  CO2/Wet Chemical V7 and Fire Alarm V6 offline orphan harnesses. **Fixed:** `v7FormReady`
  in `apps/web/src/sync/syncEngine.ts` subjected any Fire Alarm outbox item carrying an
  `evidenceManifest` to the `protocolVersion === 7` gate — `isFireAlarmOutboxItem` matches
  on `systemKey` only — so a V6 Fire Alarm parent with a finding (V6 staged evidence is
  `protocolVersion: 6`) failed the gate permanently and stuck at Pending across every
  `syncPendingRecords()`. It now reads the frozen `masterTemplate` identity via
  `fireAlarmClientDispatch` and returns ready for a V6 parent, leaving readiness to
  `v6FormReady`; the V7 gate is unchanged for every V7 system. **Gate added:**
  `v6TransientRetry` in `apps/web/tests/fire-alarm-client-dispatch.html` — two Poor findings,
  a transient TypeError on the 2nd `/api/v6-evidence/stage` call blocks acceptance and holds
  the record Pending with the parent payload frozen; the retry stages the remaining photo
  then POSTs the byte-identical frozen payload to `/api/sync` last, and the record reaches
  Synced.

- 2026-09-06 — **RELEASE BLOCKER P0-M1 CLOSED — the `023`/`024` legacy-source drift fixed and
  the deployed API back up.** Drift fix committed `07a859b`; P0-M1 replay fix `4eee41e`. Deployed
  image rebuilt twice and verified `Up`.
  - **Deployed rebuild #1 (from `4eee41e`).** `docker compose build api` + `docker compose up -d`
    recreated **only** `inspection_pwa-api-1` — postgres / proxy untouched, no `down -v` / volume
    / prune, runtime DB never queried or mutated. The `23514` at `runMigrations` is **gone**: the
    forward-only replay guards work against the deployed schema. Startup then crash-looped **one
    step later**, in the post-migration seed:
    `Published Master V7 system dry_wet_riser differs from the deterministic seed` at
    `seedMasterServiceReport` → `assertPublishedMasterServiceReportTemplate`. `curl` via proxy
    `502`; container `Restarting`. Captured, stopped, no DB surgery.
  - **Root cause (confirmed hermetically, not re-derived).** Migrations `021`–`026` publish the
    V7 system definitions with `INSERT … SELECT` from the `…501`/`…802` legacy V1/V2 rows and
    `ON CONFLICT DO UPDATE`, and `runMigrations` replays them on every startup. On a database
    where the legacy rows already exist (any deployed / already-seeded DB), each replay
    re-computes `automatic_sprinkler` / `dry_wet_riser` from the frozen legacy source and
    overwrites `807.<system>`. A later TS-only edit to `masterServiceReportV7.ts` (the four-state
    result model + the sprinkler `test_run_fire_pump_checks` block) was never mirrored into a
    migration, so the migration-computed definition diverges from the tracked source. The seed's
    V7 loop was `ON CONFLICT DO NOTHING`, so it could not reconcile the drift, and its strict
    published-template assertion aborted startup. A **fresh** DB was unaffected only by ordering
    luck: migrations run before the seed, so the legacy rows do not yet exist and the
    `INSERT … SELECT` matches nothing, leaving the seed's own correct value in place — which is
    why `seedMasterServiceReport.integration.test.ts` passed while
    `v7DetectorStateMigration.integration.test.ts` (which seeds an old catalog first) was long red.
  - **Fix (`apps/api/src/db/seedMasterServiceReport.ts`).** Re-homed V7 definition publication
    into the seed: the V7 system loop is now
    `ON CONFLICT (template_version_id, system_key) DO UPDATE SET display_name, sort_order,
    definition_status, definition = EXCLUDED.*`, guarded by an `IS DISTINCT FROM` `WHERE` so an
    already-consistent reseed writes zero rows. The seed runs last in `runMigrations`, so it is
    the single source of truth: whatever `021`–`026` leave behind, the next boot reconciles the
    stored V7 rows to `masterServiceReportV7.ts` — the "automatic re-heal for a drifted stored
    V7 definition" P0-M1 deliberately did not wire in. V1–V6 loops stay `DO NOTHING` (never
    migration-written). **No migration edited**, no new table, no runtime DB touched.
  - **Proof.** `v7DetectorStateMigration.integration.test.ts` and
    `seedMasterServiceReport.integration.test.ts` — both previously red — now green. New
    `migrationReplayForwardOnly.integration.test.ts` case *"heals a drifted V7 system definition
    (023/024 legacy-source drift) on replay"*: fresh migrate → downgrade `807.automatic_sprinkler`
    / `807.dry_wet_riser` to the pre-four-state shape → `runMigrations` again → completes clean,
    both rows healed to the tracked definition, third run idempotent. Proven to fail against the
    pre-`DO UPDATE` seed with the exact deployed crash message. Full V7 integration set + P0-M1
    replay cover: **83 tests, 0 skipped** (was 81). API + web `typecheck` / `build`,
    `test:historical-matrix` (20), `test:v6-evidence` (9), `test:v7-stale-evidence` (1),
    `seedMasterServiceReport.integration` + `managerCustomers.integration` (2) all green.
  - **Not addressed (deliberate).** The migration `INSERT … SELECT` transforms in `023`/`024`
    are left as-is — with the seed now authoritative they are best-effort initial publishers and
    their output is reconciled on the same boot; rewriting frozen migrations to match the TS
    exactly is unnecessary and higher-risk. If a future change wants the migrations themselves
    correct (e.g. to drop the seed dependency), that is a separate task.
  - **Deployed rebuild #2 (from `07a859b`).** `docker compose build api` + `docker compose up -d`
    (api container only; postgres / proxy untouched; no `down -v` / volume / prune; runtime DB
    never queried or mutated). Startup completed: migrate + seed clean, `inspection-api
    listening`, `inspection_pwa-api-1` `Up` `restarts=0`, `curl -k https://localhost/api/health`
    → `200`. The 28 orphan-file reconciliation lines in the boot log are the pre-existing
    abandoned-staged-evidence rows (§4, not a bug). **P0-M1 track fully closed.**
  - **Next:** demo-hardening, not new capability. G5 and G9 closed 2026-09-06 (see §4). Remaining:
    the §4 G7 4-state browser sanity (owner clickthrough), then the Fire Intercom Sol pass.
    STEP 3.1 (Manager config UI) is deferred to post-demo.

- 2026-09-06 — **Owner decision: the Fire Intercom per-row `remarks` column is KEPT.** Resolves
  the STEP 2.3-remediation owner-override flag below. Rationale: `remarks` is part of the frozen
  shared C3 repeatable-row envelope every repeatable-row service carries; dropping it would make
  Fire Intercom the only C3 service that deviates from the shared envelope, for the sake of one
  optional column the paper form happens not to print. It stays distinct from the mandatory
  field-owned per-finding remark. No code change (the column was retained pending this).

- 2026-09-06 — **P0-M1 FIXED, forward-only. Not committed.** `runMigrations` no longer
  re-applies a narrowing evidence CHECK on a database that has already advanced past the
  migration that set it.
  - **Root cause (confirmed live, not re-derived):** `runMigrations` replays every migration
    on each start. Migration `018` — and, identically, `021`–`026` — do
    `DROP CONSTRAINT IF EXISTS … ; ADD CONSTRAINT … CHECK (system_key IN (<systems known then>))`
    on both `inspection_evidence_reservations` and `staged_inspection_evidence`.
    `ADD CONSTRAINT … CHECK` re-validates existing rows, so once a reservation exists for a
    system newer than that migration's list, its `ADD` raises `23514` and startup aborts
    before a downstream migration re-widens. Live: `inspection_pwa-api-1` = `Restarting (1)`,
    API log `error: check constraint "inspection_evidence_reservations_system_key_check" … is
    violated by some row`, `code: '23514'`, at `runMigrations (dist/db/migrations.js:202)`.
  - **Fix (`apps/api/src/db/migrations.ts`):**
    - `018` replays only when its marker — `staged_inspection_evidence_master_template_version_check`
      not yet mentioning `7` — is absent. This is the predicate that already gates `017`, so
      the two are now co-guarded (Sol confirmed the binding is sound and `018` is atomic:
      node-postgres runs an unparameterised multi-statement `query(text)` as one implicit
      transaction).
    - `021`–`025` replay only while the schema has **not** reached migration `026` at all,
      detected by two independent signals: `evidenceSystemKeyCheckListsKey("fire_intercom",
      "either")` is false **and** no evidence row exists for a `system_key` outside
      `{fire_alarm_detector, co2_fire_extinguisher, wet_chemical, hydrant}`
      (`evidenceRowExistsForSystemOutside`) — the second catches a database where BOTH
      `system_key` CHECKs were dropped by hand but a later-system reservation survives. A
      fresh install and a rollout stopped part-way still run each in order, safely; an
      already-rolled-out database never re-runs them, because only `026` carries the full
      nine-system list and so is the only one of the six safe to re-apply.
    - `026` replays when `evidenceSystemKeyCheckListsKey("fire_intercom", "both")` is false. It
      is the reconciliation step: it runs on a fresh install, to finish a part-way rollout,
      and to bring a database whose two evidence CHECKs have drifted apart (a hand-applied
      stop-gap, a half-restored dump) back into agreement — always widening, never narrowing.
    - `evidenceSystemKeyCheckListsKey(key, mode)` inspects **both** `<table>_system_key_check`
      constraints (not just the reservations one) and matches the key as a quoted literal via
      `position(text in text)` — no `LIKE` `_`/`%` wildcards. `"both"` = fully applied;
      `"either"` = been through at least once.
    - No new table, no ledger, no edit to frozen `017`/`018`.
  - **Sol review round 1 — 3 P1 + "NEW DEFECTS: Y", all addressed in this same uncommitted tree:**
    - P1a: the first predicate used `LIKE` (so `_` matched any char) and inspected only the
      reservations constraint (so a one-sided widening let every guard skip, leaving
      `staged_inspection_evidence` narrow). Fixed: literal `position()` match, both
      constraints, and the part-way vs advanced split above so a one-sided state is
      reconciled by `026` rather than crashing on a re-narrowing `021` replay. New test
      `…reconciles a one-sided evidence CHECK…` fails against the round-1 predicate, passes now.
    - P1b: guarding `021`–`024` on the constraint alone dropped their
      `INSERT … ON CONFLICT DO UPDATE SET definition` self-heal for a drifted stored V7
      definition. **Deliberately not re-added.** Re-running `021`–`024` to heal a definition
      also re-runs their `system_key` narrowing (23514 on the advanced database this task
      exists for) and drags in the **pre-existing** `023`/`024` legacy-source drift (their
      `INSERT … SELECT` from the `…501`/`…802` legacy rows yields a `dry_wet_riser` /
      `automatic_sprinkler` definition whose top-level `sortOrder` no longer matches the TS
      source — the same bug behind the already-red `v7DetectorStateMigration` /
      `seedMasterServiceReport.integration.test.ts`). A corrupted stored definition is still
      caught loudly by `seedMasterServiceReport`'s strict published-template assertion (no
      silent bad data), exactly as before. A real definition re-assert belongs in a follow-up
      that first fixes `023`/`024`'s legacy source (or moves V7 definition publication into
      the seed with `ON CONFLICT DO UPDATE`).
    - P1c: the stale HANDOVER §2 command block (readiness commented out, only four V7 files,
      no replay test). Fixed — §2 runs all eleven V7 files plus
      `migrationReplayForwardOnly.integration.test.ts`, with a real readiness gate.
  - **Sol review round 2 — 2 P1, both addressed in this same uncommitted tree:**
    - P1 (round 2): with BOTH `system_key` CHECKs dropped by hand and a `fire_intercom`
      reservation still present, the CHECK predicate saw nothing, so `021` re-ran and its
      four-system `ADD CONSTRAINT` hit `23514`. Fixed by the second rollout signal above
      (`evidenceRowExistsForSystemOutside`) — such a database now reconciles via `026` only.
      New test `…rebuilds both evidence CHECKs when both were dropped…` fails against the
      round-2 code, passes now.
    - P1 (round 2): §2 was still not reliable verbatim — a single `pg_isready` hit could land
      in the `postgres:16-alpine` init-server / real-server restart window (Sol saw 76 pass /
      4 "Connection terminated unexpectedly"), and `cd apps/web` ran from `apps/api`. Fixed —
      the readiness gate now needs five consecutive `pg_isready` successes plus a real
      `SELECT 1`, and the fast-gates run `cd ../web` from `apps/api` and reset to the repo
      root. Re-run verbatim (11 V7 files + the 5-case replay cover): **81 tests, 0 skipped**.
  - **Migration audit (this class, across every unconditional replay):** blockers found and
    fixed — `018` (`018_v7_shared_staged_evidence.sql:4-13`) and `021`–`025` (the
    `system_key_check` DROP+ADD pair near the top of each: `021`/`022` lines 1-13, `023`
    lines 1-14, `024` lines 24-36, `025` lines 12-21), each an `ADD CONSTRAINT … CHECK` that
    re-narrows `system_key`. Same shape, NOT a blocker, noted only:
    `007_inspection_photo_evidence.sql:24-27`
    (`master_system_form_instances_evidence_policy_consistency`) — DROP+ADD on every start, but
    its predicate is invariant across replays so existing rows always satisfy it; nothing ever
    widened or narrowed it. Guarded already and safe: `005` / `009` (`ADD CONSTRAINT` wrapped
    in `IF NOT EXISTS (SELECT 1 FROM pg_constraint …)`), `008` (catalog-predicate guarded in
    the runner), `017` (now co-guarded with `018`). `CREATE UNIQUE INDEX` occurrences are all
    `IF NOT EXISTS`. No `ALTER COLUMN … SET NOT NULL` in the replay set.
  - **Proof:** `apps/api/src/db/migrationReplayForwardOnly.integration.test.ts`, 5 cases —
    (1) migrate to completion, insert `fire_intercom` + `hydrant` reservations, migrate again
    → completes, both rows survive, final `system_key` CHECK still lists all nine systems, a
    fresh `smoke_ventilation` reservation still inserts, a third migrate is idempotent;
    (2) a fresh migrate still creates both `018` tables, both partial unique indexes and the
    `(6,7)` version checks; (3) one-sided CHECK (reservations wide, staged narrow, a
    `fire_intercom` reservation present) is reconciled to nine-wide on both tables without a
    re-narrowing crash; (4) both CHECKs dropped with a `fire_intercom` reservation surviving →
    reconciled via `026`, no `23514`; (5) a part-way rollout (both CHECKs at the seven-system
    list `024` left) rolls forward through `025`/`026`. Case (1) is proven to fail against
    pre-fix code with the live `23514`; case (3) against the round-1 predicate; case (4)
    against the round-2 code. Full V7 integration set (76) + the 5-case replay cover green
    from cold with a hostile `DATABASE_URL`: **81 tests, 0 skipped**.
    API + web typecheck/build green; `test:historical-matrix` (20), `test:v6-evidence` (9),
    `test:wet-chemical-definition` (2), adapters/env (11), `test:v6-integration` (1),
    `test:v7-stale-evidence` (1) all green. `git diff --check` clean.
  - **Pre-existing failures, NOT caused by this change, NOT fixed (out of scope):**
    `apps/api/src/db/v7DetectorStateMigration.integration.test.ts` — and, if `023`/`024` are
    ever replayed against an already-seeded database, `seedMasterServiceReport`'s
    `dry_wet_riser` / `automatic_sprinkler` `sortOrder` assert — are red on `44fb682` and stay
    red, with the identical assertion, after this change (verified against both trees). Root
    cause: `023`/`024`'s `INSERT … SELECT … ON CONFLICT DO UPDATE SET definition` sources the
    V7 definition from the immutable `…501`/`…802` legacy rows, and the value it computes no
    longer matches the current `masterServiceReportV7.ts` (a later hand-edit to the TS source
    without a new migration). Neither test is in a standard gate or the 76-test set. This
    change does not touch that path — for the actual deployed database (already past `026`)
    `021`–`025` are skipped entirely — and a `023`/`024` replay on HEAD hits the same assert.
    Needs a dedicated fix (correct the legacy source, or re-home V7 definition publication).
  - **Deployed runtime:** not touched. The runtime Postgres was never queried or mutated. The
    running API image still executes the old `dist/db/migrations.js` and will keep
    crash-looping until the operator runs `docker compose build api && docker compose up -d`
    on the host (image rebuild + container recreate — no DB migration, no manual SQL). On the
    next boot with the rebuilt image, the `master_template_version` marker (present from the
    original successful `018`) makes the runner skip `017`/`018`; the `system_key` CHECKs
    already list `fire_intercom` on both tables, so `021`–`025` are skipped
    (`schemaReachedNewestSystem`) and `026` is skipped (`"both"` satisfied); `019`/`020` and
    the seed replay idempotently, and startup completes. Verified by the hermetic replay test
    reproducing the deployed
    precondition; not verified against the live container by design.

- 2026-09-06 — **STEP 2.3 Sol remediation: 2 of 3 P1s and both P2s closed; the P0 is logged as
  P0-M1 and NOT fixed here.** Sol returned `SAFE TO COMMIT: N` (1 P0, 3 P1).
  - **P0-M1 — NOT fixed, own task (see §4).** Verified independently: `runMigrations` replays
    migration 018, whose `ADD CONSTRAINT … CHECK (system_key IN (3 keys))` validates existing
    rows, so any database holding a later-V7 reservation aborts startup with `23514` before
    021–026 re-widen. Confirmed live (`inspection_pwa-api-1` = `Restarting (1)`). **Pre-existing
    since `81db211`**, not introduced by STEP 2.3. Deliberately left alone: every viable fix
    touches either the frozen `018` file (which the standing rules forbid rewriting once applied)
    or the runner's execution semantics, and choosing between them is an owner decision, not a
    remediation-pass side effect.
  - **P1 (closed) — client submit gate was a strict subset of the server predicate.** Sol's probe
    (`clientIssues=[]; serverMatch=false`) was reproduced and is now fixed:
    `fireIntercomRepository.ts` gained `expectedConfiguredRows()`, mirroring
    `expectedConfiguredFireIntercomRows` exactly, and `structuralSubmitIssues` now enforces the
    authoritative `location.sortOrder` ordering, configured-before-technician, exact configured
    `assetReference`, exact `locationSnapshot`, the 250-row cap, and `rowUuid` shape/uniqueness.
    **`configuredRows()` itself was also wrong** — it built a Draft in `system.locations` array
    order rather than frozen `sortOrder` order, so an out-of-order snapshot produced a Draft that
    could never be submitted. Six regression tests added (18 total in the file); a direct probe
    now reports `AGREE=true` for both the reversed-order and frozen-order payloads, and the 251st
    row is refused client-side.
  - **P1 (closed by documentation, flagged for owner override) — the per-row `remarks` column.**
    Sol is right that this page prints no Remarks column, so it has no source in
    `docs/paper-forms/fire-intercom.md`. It is not an invention of this task: it was specified in
    the task brief, and `remarks` is part of the frozen shared repeatable-row envelope every C3
    service carries. A fourth `confirmationNote` now records exactly that, distinguishes it from
    the field-owned per-finding remark, and states that dropping the column is safe while Fire
    Intercom has no accepted data — at the cost of making Fire Intercom the only C3 service that
    deviates from the shared envelope. **Owner call; the column is retained pending that.**
  - **P1 (closed) — the standing cold command block.** Corrected, and my earlier claim was wrong:
    the V6 fixture *does* read `SEED_INTEGRATION_DATABASE_URL`, but an ordinary invocation also
    needs a reachable `DATABASE_URL` unless `NODE_ENV=test` makes the pool use the SEED URL. The
    block now starts the container first and sets `NODE_ENV=test` plus both variables before
    `test:v6-integration`, which then passes (1 test, 0 skipped) rather than skipping.
  - **P2 (both closed)** — §1 still said "3 of 12 services on the V7 evidence model" and §6a still
    claimed all 12 share the V7 evidence authority. Both corrected (10 / 12; 9 evidence workflows,
    Portable FE has no Poor-capable field by C4, FM200 and Roller Shutter unimplemented).
  - Re-verified after the changes: API typecheck/build, historical matrix 20, V6 evidence 9, Wet
    Chemical definition 2, adapters+env+compat+accepted-detail 22, V6 integration 1 (0 skipped),
    **full V7 integration set 76 / 0 skipped from cold with a hostile `DATABASE_URL`**, web
    typecheck/build, stale-evidence 1, Fire Intercom submit 18, Playwright 1.

- 2026-09-06 — **STEP 2.3 Fire Intercom added as a V7-only system, end to end** (on top of
  `f5ed7e3` and the separately-committed G10). Second system with no V1–V6 lineage, built
  by mirroring Smoke Ventilation (`ade85f6`) and trimming rather than inventing anything: one
  `station_schedule` section → one `repeatable_table` (`asset_reference` "Station" / `condition` /
  `remarks`) + one section-level comments block; no checklist sections, no header fields. Spec
  fixed by the **2026-09-04 owner decision** (collapse the paper's `Condition Yes`/`Condition No`
  × unlabelled `1`/`2` box grid into one four-state result + own remark per station row); the
  original four-box structure is deliberately **not** modelled and the reasoning is recorded in
  the definition's `confirmationNotes`, together with the preset-station-label note (a Manager
  configuration concern for STEP 3.1) and the explicit "this page has no header fields, none were
  invented" note. Changes: `masterServiceReportV7.ts` (`fireIntercom`, sortOrder 11, appended to
  `systems`, not routed through any `upgradeV7*` mapper); `v7EvidenceContracts.ts`
  (`fire_intercom` key + `fireIntercomAdapter` — the per-row `condition` result is the only
  Poor-capable field, with row-UUID `fieldPath`s); `v7StagedEvidence.ts`; migration
  `026_v7_fire_intercom_evidence.sql` (widens the two evidence CHECK constraints only — 017/018
  untouched, no data backfill, the system row is inserted by the ordinary seed) + its
  `migrations.ts` registration; `systemContractCompatibility.ts` (API + web) with
  `fire_intercom: 7` — the same deliberate "legacy version is 7" self-reference Smoke Ventilation
  introduced; new `fireIntercomV7Acceptance.ts` (carrying G10's order-independent
  `sameManifest()` from day one, never the positional comparison) and
  `fireIntercomInspectionSync.ts`; `sync.ts` / `stagedEvidence.ts` / `jobCompletion.ts` wiring;
  `acceptedMasterSystemDetail.ts` schema-2 reader + `masterSystemInspections.ts` route branch;
  `finalServiceReport.ts` (all four registration points) so the PDF embeds the accepted photo
  bytes; and a new `apps/web/src/fireIntercom/` module (form, evidence field, repository,
  resolution, server API, Accepted Detail view) plus registrations in `App.tsx`,
  `localDatabase.ts`, `TechnicianHome.tsx`, `attachmentApi/Types.ts`, `syncEngine.ts`,
  `serverMasterSystemInspectionApi.ts`. Proofs: `fireIntercomV7.integration.test.ts` (12 cases —
  the Smoke Ventilation adversarial set plus the G10 reverse-order retry case from day one),
  `acceptedMasterSystemDetail.fireIntercomV7.test.ts` (6),
  `fireIntercomV7SubmissionIssues.test.ts` (12 — the 0.4b path-drift guard proven to fail against
  a client path perturbed to `…station_schedule_rows.row.…`, and the duplicate-photo gate proven
  to fail with the gate removed), `fire-intercom-v7-offline.html/.spec.ts`. Full V7 integration
  set green from a cold disposable Postgres with a hostile `DATABASE_URL`: **76 tests, 0 skipped**
  (was 62). DO-NOT-MODIFY list clean; the ten G10 files are untouched by this task.
- 2026-09-06 — **Status-doc correction (same change as STEP 2.3).** §1, §3, §5 and §6a still
  labelled STEP 0.2 (`0e04a64`), Hydrant 1.1 (`81db211`), Hose Reel 1.2 (`efef275`), Automatic
  Sprinkler 1.3 (`7e2a7e6`) and Smoke Ventilation 2.2 (`ade85f6`) as "complete but uncommitted"
  long after each was committed, and §6a's table still showed Hydrant / Hose Reel / Automatic
  Sprinkler with **no** V7 evidence workflow while their V7 acceptance handlers, schema-2 Accepted
  Detail readers, Final Report branches and offline browser proofs were all committed and green in
  the standing V7 integration set. Every label now carries its commit hash, and the §6a count is
  corrected from "6 / 12" to **10 / 12** (9 full evidence workflows + Portable FE by C4). No code
  changed for this correction — it is a doc-accuracy fix only, found while verifying this task's
  own claims against `git log`.

- 2026-09-06 — **G10 closed: order-independent manifest comparison in the five remaining V7
  acceptance handlers** (committed on its own, ahead of STEP 2.3). `parseV7EvidenceManifest` returns the
  manifest fieldPath-sorted and acceptance persists that sorted copy into the accepted snapshot,
  but the accepted-authority pre-check in `fireAlarmV7Acceptance.ts`, `hydrantV7Acceptance.ts`,
  `hoseReelV7Acceptance.ts`, `automaticSprinklerV7Acceptance.ts` and `dryWetRiserV7Acceptance.ts`
  compared it **positionally** (`canonical(storedManifest) === canonical(payload.evidenceManifest)`)
  against the raw retry payload — which the API accepts in any order — so a valid *unsorted* retry
  returned `IDEMPOTENCY_CONFLICT` instead of duplicate success, unrecoverable once the Job closes
  (`syncEngine.ts:193` re-attempts a Failed outbox item forever). Fixed by mirroring Smoke
  Ventilation's `sameManifest()` (length check + order-independent fingerprint: each entry
  `canonical`-ised, the strings sorted and joined) into each handler and swapping the one
  comparison. **Comparison side only** — `parseV7EvidenceManifest`'s sort is the stored authority
  and is deliberately left alone (changing it would alter already-accepted snapshots).
  **Permutation equality is the only behaviour change**: a manifest with different entries, a
  different length, or duplicate entries still returns `IDEMPOTENCY_CONFLICT`. One regression case
  per handler in its existing integration test file (reverse-fieldPath manifest → accept →
  identical envelope retried is duplicate success, then again after the Job is closed; plus a
  dropped-entry retry and a changed-`sourceSha256` retry that both still return
  `IDEMPOTENCY_CONFLICT`). Each proven to fail against the old comparison: reverting the one-line
  `sameManifest` swap in all five handlers and running the five new cases makes every "unsorted
  retry must be duplicate success" assertion fail with `IDEMPOTENCY_CONFLICT` (0 pass / 5 fail);
  restoring the swap returns them to green. **CO2 / Wet Chemical (`co2FormInstanceSync.ts`) was
  checked and is NOT affected** — the same raw-vs-sorted shape does not exist there. It computes
  `requestFingerprint` over `v7Manifest(payload.evidenceManifest)` (which sorts by fieldPath) on
  the retry pre-check, and the stored `request_fingerprint` was likewise computed over the
  `parseV7EvidenceManifest`-sorted manifest at first acceptance, so an unsorted retry normalizes to
  the identical fingerprint and is duplicate success; the manifest-vs-staged check is keyed by
  `field_path` via a `Map`, not positional. The `grep` for `canonical(payload.evidenceManifest)`
  correctly did not match it. `hydrantV7.integration.test.ts` still `.sort()`s its happy-path
  manifest under a comment claiming "acceptance compares the retry manifest positionally" — now
  stale but harmless; left untouched (pre-existing test, out of this task's scope). A trivial
  follow-up can delete that `.sort()` and comment. Full V7 integration set green from a cold
  disposable Postgres: **62 tests** (was 57). Additive only — no V1–V6 template, migration, Fire
  Alarm V6 file, `parseV7EvidenceManifest`, frozen manifest, outbox or web client touched;
  DO-NOT-MODIFY list clean.

- 2026-09-06 — **STEP 2.2 Sol re-review remediation (uncommitted, on top of `ade85f6`).** Sol
  returned `SAFE TO COMMIT: N` with 2 P1s. Both investigated; one confirmed, one reclassified.
  **(1) Manifest ordering vs idempotent retry — CONFIRMED, fixed.** `parseV7EvidenceManifest`
  returns the manifest fieldPath-sorted and acceptance stores that sorted copy, but the
  accepted-authority pre-check compared it positionally against the raw retry payload, so a
  valid *unsorted* retry returned `IDEMPOTENCY_CONFLICT` instead of duplicate success — after Job
  closure that is unrecoverable for the technician. Fixed in `smokeVentilationV7Acceptance.ts`
  with an order-independent `sameManifest()` comparison, plus a regression case proven to fail
  against the old comparison before being restored. **Sol classified this as a NEW defect; it is
  not** — the identical raw-vs-sorted comparison exists in all six V7 acceptance handlers
  (`fireAlarmV7Acceptance.ts:102`, `hydrantV7Acceptance.ts:131`, hose reel, sprinkler, riser),
  and `hydrantV7.integration.test.ts` even documents the workaround in a comment ("Submit what
  the client submits") rather than fixing it. Smoke Ventilation mirrored the proven path, as the
  skill instructs. **The other five are still wrong and are NOT fixed here** (no scope widening) —
  this needs a separate cross-cutting task; it is a latent P1 for every V7 system.
  **(2) Configured Fan Schedule rows — RECLASSIFIED, but Terra's stated reasoning was WRONG and
  is corrected here (Sol re-review, 2026-09-06).** The outcome stands — no guard is added, because
  a customer with zero configured locations is intentionally supported — but the argument Terra
  gave for it in the remediation commit message is factually wrong and must not be trusted by a
  future reader. Terra claimed adding smoke_ventilation to `initialStructureRequiredSystemKeys`
  would make the system "unassignable" and that "Hydrant / Hose Reel / Riser are all deliberately
  ungated". Both are false. The truth: `initialStructureRequiredSystemKeys`
  (`managerCustomers.ts:16`) is `{co2_fire_extinguisher, wet_chemical, dry_wet_riser}` — **Dry/Wet
  Riser IS in it** — and its ONLY use is `managerCustomers.ts:286`, filtering the
  `/customers/service-format-options` list used by technician-led quick customer creation. Manager
  assignability is a different set, `locationDependentSystemKeys` (`managerCustomers.ts:12`),
  which holds only CO2 / Wet Chemical (for those the location *is* the instance key). So the guard
  would only have removed Smoke Ventilation from the technician initial-format picker; Manager
  configuration revisions (`managerCustomers.ts:360`) could still assign it either way. Terra
  conflated the two sets. The real defects Sol surfaced were (a) a doc comment in
  `masterServiceReportV7.ts` claiming "every customer … is configured with the same 10 preset
  rows", which nothing enforced — corrected to state the real behaviour and that pre-seeding ten
  rows is a Phase 8H Manager concern, not a template guarantee; and (b) **zero test coverage of
  the configured-row path** — every case used `locations: []`. Now covered on both sides: a new DB
  case seeds real configured locations and proves retained rows accept while a dropped row, a
  re-labelled `locationSnapshot.displayName`, a rewritten `assetReference` and a forged configured
  provenance are each rejected (four rejection assertions plus a persistence assertion proving
  only the clean submission was stored); three new client-gate cases prove the web refuses the
  same. Every one passed on first run, so the authentication logic itself was already correct — it
  was simply unproven.
  **P2s:** the `systemContractCompatibility.test.ts` filter no longer derives its exclusion from
  the production mapping it tests (an explicit `v7OnlySystemKeys` set plus a positive assertion
  that every other system's contract version really is ≤ 5). `originalCreatorSnapshot` being
  neither shape-validated nor fingerprinted is inherited from every other V7 handler and is left
  alone. The missing `locationText` column is deliberate — the paper Fan Schedule has no Location
  column — and Sol confirmed it does not weaken configured-row authentication. Sol also corrected
  a claim of mine: `finalServiceReport.ts` has **five** smoke_ventilation registrations, not four
  (lines 42, 147, 204, 350, 495); all five are present.

- 2026-09-05 — **STEP 2.1 FM200 investigated and STOPPED at its client-input gate; no code
  written.** The roadmap's "client says 'same structure as CO2 for now'" instruction could not be
  substantiated. `git log -S "same structure as CO2" -- HANDOVER.md` returns exactly one commit:
  `be9ad11`, the commit that first created this roadmap skeleton — not a commit recording a
  client conversation — and the line has never been touched since. There is **no dated §7 entry**
  for it, unlike every other client/owner decision in this project (C1, C2, C4, and the
  2026-09-04 "client answers" entry each have one). Two later artefacts contradict it: the fm200
  stub's own `confirmationNotes` (`masterServiceReportV1.ts:639` — "the authoritative detailed
  form is unavailable… Do not enable this system or infer fields from CO2 or Wet Chemical
  definitions") and `docs/paper-forms/fm200.md`, transcribed in `7635cb3` roughly eight hours
  *after* the roadmap line, which records that FM200 appears **only as a cover-page checkbox**
  with no data page in the blank master or in any of the four filled reports examined, and states
  outright that "it is not known whether MFE uses the CO2 page as a stand-in for FM 200".
  Per the project's standing rule against inferring unconfirmed fields (same spirit as C4), this
  is an owner/client question, not something to resolve by inference. **Unblock with either** a
  dated entry confirming the client was asked *after* the paper-form research and answered, **or**
  an explicit owner override of the stub's own prohibition. V1–V7's fm200 stub was left
  byte-identical.

- 2026-09-05 — **STEP 2.2 Smoke Ventilation complete (uncommitted), Slices 1–3.** The first
  system in this codebase with **no V1–V6 presence at all**, which is why it is not a
  "mirror the pattern" task: every STEP 1 system was *upgraded* from an existing confirmed
  definition, so `masterServiceReportV7.ts` could `.map()` over `masterServiceReportV6.systems`.
  Smoke Ventilation has nothing to map, so it is composed fresh and appended (sortOrder 10),
  carrying the four-state model natively with no `fourState`/`upgradeV7*` rewrite. That exposed
  the one genuinely new bit of architecture: `systemContractCompatibility.ts` (API **and** web)
  assumed every implemented system has a pre-V7 "legacy" contract version plus a V7 one. Smoke
  Ventilation's legacy version is **7 itself** — a deliberate self-reference giving it exactly one
  contract variant — and `systemContractCompatibility.test.ts`'s blanket "every implemented system
  exists in V5" loop was narrowed to systems whose contract version is ≤ 5, with a new positive
  assertion that smoke_ventilation must *not* exist before V7. Definition follows the blank
  master (Revision A) per `docs/paper-forms/smoke-ventilation.md`; the two unresolved paper
  ambiguities (Auto/Manual semantics; the Hokuden 3-zone / free-text-AC-DC revision) are recorded
  in the definition's own `confirmationNotes` rather than guessed silently, matching how Dry/Wet
  Riser and Hose Reel flagged theirs. "Date Tested" is a `text` control, not a new `date` control:
  the paper form is a write-in line and no per-system date control exists in the web layer, so
  none was invented. The Fan Schedule reuses the existing `repeatable_table` +
  `customer_system_locations` machinery with `supportsZones: false` (the column is already
  nullable) rather than inventing a "fixed rows, no location" mechanism. Migration `025` widens
  only the two evidence CHECK constraints — unlike every prior STEP 1.x migration there is no
  existing row to rewrite, because the ordinary seed `INSERT … ON CONFLICT DO NOTHING` inserts
  the brand-new system key itself. ~15 registration points wired (acceptance, Accepted Detail,
  Final Report + PDF evidence, staged-evidence routes and allow-lists, job completion, sync
  dispatch, web catalog/attachment/sync/local-DB unions, routing). **Proofs:** 9 adversarial
  real-Postgres cases mirroring `hydrantV7.integration.test.ts` (stale evidence never accepted,
  reused photo named rather than masked as JOB_ACCESS_DENIED per G7, two sources normalizing to
  one stored image, same bytes allowed in a different Job, concurrent race → exactly one Accepted
  + one retryable EVIDENCE_CONFLICT, closed/hidden/unknown/forbidden collapsed to one
  JOB_ACCESS_DENIED, exact retry after Job closure → same authority not JOB_CLOSED, clean
  zero-finding draft); a 12-check offline browser harness (`smoke-ventilation-v7-offline`) run
  end to end — Draft → reload → offline Submit → reconnect Sync → Accepted → Accepted Detail with
  one photo per finding across **both** evidence scopes; and 10 client submit-gate tests whose
  client/server path-drift guard was **proven to fail** against a deliberately perturbed client
  prefix before being reverted (the 0.4b failure mode). All 46 pre-existing V7 integration tests
  and every other web submit-gate suite re-run green; V1–V6, migration 017 and the Fire Alarm V6
  files untouched. **Known unrelated red, confirmed pre-existing by `git stash` against clean
  HEAD:** `co2-v7-offline.spec.ts` fails with "Complete the required suppression-system fields and
  evidence before local submission" (`co2Repository.ts:275`), and
  `seedMasterServiceReport.integration.test.ts` fails on a dry_wet_riser sortOrder mismatch during
  migration replay. Both reproduce with zero changes applied. Also spotted, not fixed (out of
  scope): `finalServiceReport.ts`'s evidence ternary omits `dry_wet_riser`, so accepted riser
  photos may not reach the Final Report PDF even though riser has a V7 branch in
  `validHistoricalUnit`.

- 2026-09-05 — **STEP 1.5 closed (uncommitted): Portable Fire Extinguisher already works on V7,
  zero code changes.** Investigated the "does it already work" hypothesis rather than assuming a
  registration task was needed: Portable's definition has been byte-identical since
  `masterServiceReportV5.ts` (V6/V7 fall through unchanged via the `: system` default case in
  `masterServiceReportV7.ts`'s `systems.map`), and both contract-version maps
  (`apps/web/src/referenceData/systemContractCompatibility.ts:10`,
  `apps/api/src/inspections/templates/systemContractCompatibility.ts:31`) compare a job's system
  definition against the frozen V5 contract structurally (canonicalized deep-equal), not by exact
  template-version match. Every call site that resolves Portable Fire Extinguisher
  (`compatibleCatalogSystem` on the web; `serviceVisits.ts`, `portableFireExtinguisherSync.ts`,
  `managerCustomers.ts` on the API) calls `isCompatibleSystemContract` without a
  `frozenMasterTemplate` filter, so there is no version gate anywhere in the chain — unlike Fire
  Alarm, which explicitly branches on template version 6/7 vs. earlier. Confirmed with two real
  tests, not by inspection alone: a new offline round-trip browser harness
  (`apps/web/tests/portable-fire-extinguisher-v7-offline.html/.spec.ts`, mirroring Dry/Wet Riser's
  STEP 1.4 harness shape but with the evidence/photo steps removed per C4 — Draft → reload →
  offline Submit → reconnect Sync → Accepted → Accepted Detail, on a V7-templated job fixture) and
  a real-Postgres integration test (`apps/api/src/sync/portableFireExtinguisherV7.integration.test.ts`,
  seeded by the real `runMigrations()`/`seedMasterServiceReport()` path — a V7 job's Portable Fire
  Extinguisher accepts through the unmodified `syncPortableFireExtinguishers`, plus an
  exact-retry-returns-duplicate check). Both pass. Existing historical coverage
  (`portableFireExtinguisherDefinition.test.ts`, `portable-fire-extinguisher-sync-race.html`)
  re-run and confirmed still green, unmodified. Zero production files touched — only 3 new test
  files added, plus this HANDOVER.md update.

- 2026-09-05 — **STEP 1.5 scope decided (owner): Portable Fire Extinguisher gets no V7 evidence.**
  Its paper form (`docs/paper-forms/portable-fire-extinguisher.md`) has no result ovals for this
  section — count fields only (Total / 9KG Dry Powder / 2KG CO2 / Others + Comments), confirmed
  against the existing V1–V5 module (`apps/web/src/portableFireExtinguisher/portableFireExtinguisher.ts`),
  which has no result control today. Owner chose "no V7 evidence at all — count fields only" over
  inventing a synthetic Overall Condition field, consistent with the project's standing rule
  against inventing fields the paper source doesn't specify (same spirit as C2's remarks
  pick-list). Logged as new cross-cutting precedent **C4** for any future service in the same
  situation. STEP 1.5 is now registration-only: carry the same fields onto the V7 template/contract,
  no evidence-contract adapter needed.

- 2026-09-05 — **STEP 1.4 Dry/Wet Riser closed, committed `a1cb7bf`.** Added
  `apps/web/tests/dry-wet-riser-v7-offline.html/.spec.ts`, mirroring Automatic Sprinkler's Slice 3
  harness: Save Draft → reload → offline Submit → reconnect Sync → Accepted → Accepted Detail,
  proving 3 distinct findings (checklist `saj_main_water_supply`, measurement `jockey_psi`, riser-
  outlet row `canvasHoseAt2Result`) each own their own remark + photo end to end. No production
  code touched — the V7 web module, evidence adapter, and Accepted Detail view already existed.
  Two independent Sol review passes: first found the harness's synthetic fixture definition used
  the wrong system-level `sortOrder` (1 vs the real 2, from `masterServiceReportV3.ts`) and a
  UUID id-prefix (`76000000-…`) that collided with `fire-alarm-v6-offline.html`; both fixed and
  re-verified, second pass returned SAFE TO COMMIT: Y with zero P0/P1. Historical Dry/Wet Riser
  V1–V6 (`dryWetRiserAccepted.test.ts`) confirmed unaffected. Also closed **G4** while updating
  this doc: the Manager-config 500-on-empty-riser-config bug was already fixed server-side in
  `ba1fb2a` (write-time `RISER_MODE_REQUIRED` guard in `managerCustomers.ts` + a read-time filter
  in `inspectionReference.ts` that excludes an invalid stored riser row instead of 500ing the
  whole customer) — it just was never marked closed here. Next: STEP 1.5 Portable Fire
  Extinguisher (last STEP 1 service). Unlike 1.1–1.4, this one is NOT a mirror-the-pattern task:
  the paper form (`docs/paper-forms/portable-fire-extinguisher.md`) has no result ovals for this
  section at all — count fields only — so "add V7 evidence" has no natural Poor-capable field to
  hang a photo/remark on. Needs an owner decision on scope before Terra writes any code.

- 2026-09-04 (G7) — **Fire Alarm V7 "Sync Failed" root-caused: one photo on two findings.**
  Browser repro on `SV-20260904-38` reproduced the owner's failure exactly and captured the
  outbox `lastError`; the runtime rows for the owner's own `8b4cc663` show the same duplicate
  `source_sha256`/`stored_sha256` pair. The 4-state model was never at fault — `d7ecc0d` and the
  stored V7 definition are consistent (`fire_alarm_detector` contract
  `3dafe01f42efd7d9ca8adfdfd288356d212406c38e82ad33c21bcd327a29e3b0`, `allowedValues` =
  4-state). Both forms already render `record.lastSyncError`; the message itself
  ("This V7 inspection is unavailable") was the problem, not its absence.
  `fireAlarmV7.integration.test.ts` did submit `not_good` + `na` + evidence, so it was green —
  its real gaps were `complete_repair`, secondary alarm-device rows (it sent `[]`), and any
  duplicate-photo case. All three now covered. API + web typecheck/build, all 4 V7 integration
  suites, historical matrix (20), V6 evidence (8) and every web unit gate re-run green.
  **Not yet done: the 4-state browser sanity pass** — the in-app browser profile's IndexedDB
  wedged (`inspection-pwa` v90, `deleteDatabase` permanently blocked) and its technician session
  is gone; agents must not enter passwords. Owner: sign in as `technician-demo` in a clean
  profile and run §4 G7's checklist. Runtime already rebuilt and recreated on the fix
  (`build-20260903T174358Z`, API booted clean).

- 2026-09-03 (owner UI fix) — Fire Alarm primary device rows lost their visible column labels in
  the multi-select change: `MultiResultSelector` exposes `label` only as `aria-label`, and Fire
  Alarm's old `Select` had rendered a visible `<label>`. Four unlabelled Normal/Test/Isolation
  clusters resulted. Fixed by wrapping each selector in `<div><strong>…</strong>` exactly as
  `Co2InspectionForm` already does (`FireAlarmInspectionForm.tsx`). CO2 / Wet Chemical were never
  affected. Verified on release `sha256-32ba5613c511dfc5` (`build-20260903T122716Z`).
- 2026-09-03 (owner verification) — Multi-select change independently re-verified. All API + web
  gates re-run green (historical matrix 20, V6 evidence 8, V6 + 4 V7 integrations, migration-019
  upgrade path, seed, manager, all web suites). V7 Fire Alarm contract SHA recomputed from source
  and confirmed to equal the hardcoded web constant `0fb524f9…`; V6 still `deec720d…`.
  **Deployed to the live runtime**: `docker compose build api proxy` + recreate — API booted clean
  (`inspection-api listening on 3000`), stored V7 control upgraded `normal_test_isolation` →
  `normal_test_isolation_multi`, V6 unchanged. Browser-confirmed on `SV-20260903-36`: Normal/Test/
  Isolation tick independently and all three can be on at once; clearing a detector blocks submit
  with "Detector row 1: select at least one Normal/Test/Isolation for Heat Detector".
  Caveat: Codex's repro block shipped a racy `pg_isready` for the fourth time — a single success
  passes against postgres:16-alpine's temporary bootstrap server, so the owner's run failed with
  "Connection terminated unexpectedly". Wait for THREE consecutive successes.
- 2026-09-03 — Migration 019 upgrades only the three persisted V7 detector-state definitions from the prior single-value control to the V7 multi-select contract before the startup seed assertion. It leaves V1–V6 untouched and is covered by a disposable database upgrade-path test seeded from commit `5bc968d`.
- 2026-09-03 — V7 detector-state controls are now multi-select only for Fire Alarm, CO2, and Wet Chemical. New V7 records store canonical non-empty arrays in Normal/Test/Isolation definition order; V1–V6 remain frozen single strings. The Fire Alarm V7 contract SHA is `0fb524f92033b523128743b6b6dfe3646880a34846b3b1c4a79498573f8c0f59`. Existing accepted V7 demo records for `SV-20260903-34` must be cleaned by the owner before a rebuilt runtime serves the new contract.
- 2026-09-03 (late) — STEP 0.3 completed in-browser end to end (see roadmap 0.3). Second client
  defect found and fixed (0.4b): the Fire Alarm V7 submit gate had lost every structural check,
  so the form queued work the server rejected non-retryably — offline that is unrecoverable field
  data loss. Both browser-found defects were client-side and invisible to the server-side
  integration suite; both now carry regression tests that were proven to fail against the old code.
- 2026-09-03 (evening) — First real browser pass on V7. Found and fixed two blockers:
  (a) a Manager-created customer carried `dry_wet_riser` with `system_configuration={}`, 500ing
  `GET /customers/:id/configuration` — stray rows deleted from the runtime; logged as G4;
  (b) **`compatibleCatalogSystem` resolved V7 CO2/Wet Chemical against the V1/V4 contract**, so
  both forms were unreachable ("Cached template version is unavailable"). Fixed + regression
  suite added (0.4a). Verified in-browser on release `sha256-e9891d4f08618b8b`
  (`build-20260903T092509Z`): Fire Alarm / CO2 / Wet Chemical V7 all open with Good/Poor/Not
  Relevant, Poor reveals its own remark + photo controls, Normal/Test/Isolation unchanged; and
  historical CO2 (V1) + Wet Chemical (V4) still render 2-state with zero "Not Relevant".
  Note: a duplicate hand-made "DEMO-V7-SHARED-EVIDENCE" customer (`81955194-…`) exists alongside
  the seeded `…0900`; the real job `SV-20260903-34` belongs to the seeded one.
- 2026-09-03 (pm) — STEP 0.1 committed (`5bc968d`, branch `phase-8f2b2a-final-accepted`); docs
  commit `be9ad11`. STEP 0.2 (V7 front door) reviewed + re-verified: `managerCustomers.integration.test.ts`
  re-run green after fixing Codex's repro block (`createdb`/`pg_isready` must use `-h 127.0.0.1`,
  not the racy unix socket). 0.2 accepted, still uncommitted (6 files). Reordered roadmap: STEP 0.4
  seed now precedes STEP 0.3 browser sanity (Manager quick-create cannot enable CO2 / Wet Chemical).
  STEP 0.4: Terra seeded `demoV7Customer` (customer + V7 revision + 3 systems + CO2/WC zones/locations,
  no job). Owner added the PRIMARY site inside the same guard (Terra's brief had omitted it) and
  re-ran seed + manager integration + typecheck green — twice Codex handed back a repro block still
  using the racy `createdb`/`pg_isready` unix socket; the two DB tests only failed on that, not on code.
- 2026-09-03 — Phase 8F.2B.2A server-side complete + 4 Sol passes + hermetic test-DB config.
  Runtime rebuilt (build `20260903T051655Z`); migration 018 + V7 seed confirmed live. Found G1
  (no V7 UI front door). Handover doc + full roadmap created. Owner confirmed target: all 12
  services on the V7 evidence model. Added `.agents/skills/codex-task-brief` (reusable task
  scaffold). STEP 0.1 commit commands + STEP 0.2 (V7 front door) brief prepared.
  G1 change is contained to `managerCustomers.ts` (catalog version pin) + `inspectionReference.ts`
  (lines 91-99 length/version guard, 146 control resolver, 181 `version IN (1..6)`).
