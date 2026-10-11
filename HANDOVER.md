# Project Handover & Live Status

> Single source of truth for current state. Update the "Last updated" line and the
> relevant section on every change. Keep it short — link to code, don't duplicate it.

**Last updated:** 2026-10-11 — **CR-02 Phase 1 built: manually typed site + Admin approval (API + database only; migration 050).**
A technician creating a visit may send `newSite` instead of `siteId`; the site is created inactive (hidden from every site list), the visit proceeds, and an Admin or supervisor approves or rejects it (`/manager/site-proposals`). Job DTOs gain an additive `siteApproval`. No web change yet (Phase 2 = New Service Visit UI + Admin screen), no Dexie change. 17/17 integration + 6 unit tests, existing visit/location/manager/V7 suites and API typecheck/build pass. Details: [CR02_P1_SITE_PROPOSALS_API](docs/testing/CR02_P1_SITE_PROPOSALS_API.md).

**Earlier checkpoint:** 2026-10-10 — **CR-07 Phase 1 built: technician section remarks (Automatic Sprinkler pilot); owner phone test pending.**
A technician adds a free-text remark in one Sprinkler section (each checklist/measurement row, or Comments); it is stored per customer + system + section on the phone first (offline OK), synced idempotently, and offered only in that section for every technician of the customer. Add-only. Migration **049** (new table only), 2 new API routes, no Dexie version/stores change, nothing in inspection payloads/templates/reports.
API 12/12 + contract 1/1 on the disposable DB; web 19 node + 7 browser cases + 24 existing browser regressions pass. Web and API typecheck pass (the API one was briefly red mid-session from another task's untracked `rollerShutterReport.test.ts`, then cleared). Uncommitted. Decision for the owner: keep the "Others" option in the Sprinkler form? Details: [CR07_SECTION_REMARKS_P1](docs/testing/CR07_SECTION_REMARKS_P1.md).

**Earlier checkpoint:** 2026-10-10 — **CR-01 Phase 0+1: optional photo on Good / N.A. — server contract for all 11 V7 systems + web pilot (CO2, Wet Chemical).**
Server: each V7 adapter now derives `{ required, optional }` photo paths; the manifest must satisfy `required ⊆ manifest ⊆ required ∪ optional` with a response-derived
size bound (the fixed 250 cap is gone); the Final Report accepts `required ⊆ rows ⊆ required ∪ optional`. No migration, no Dexie change, no new template version.
Web: Good / N.A. rows of CO2 and Wet Chemical show "Photo (optional)" (capture, replace, Remove while Draft); a Poor photo flipped to Good / N.A. is kept; Submit never needs one.
The web slot was then rolled out to Fire Alarm, Hydrant, Hose Reel, Dry/Wet Riser, Smoke Ventilation, Fire Intercom, Roller Shutter and FM200, and (2026-10-11, after the CR-07 commit) Automatic Sprinkler, so all 11 V7 forms now have the slot. Committed (pilot, rollout `fa7bd71`, Automatic Sprinkler `127da11`). **Phone retest of the rollout done 2026-10-11 on a second phone (Xiaomi, build `101813Z`)** for Automatic Sprinkler, Hydrant and Fire Alarm: real camera, offline submit, reconnect sync (evidence first), Complete Service, Final Report data and an Admin-approved PDF with all 4 photos; the other forms are covered by the real-stack browser run only. New P3 findings I-57 (validation list prints raw field paths and widens the page) and I-58 (neutral wording inside the optional box); neither is fixed. **P0-FR1 fixed afterwards (committed):** the Final Report now embeds Dry/Wet Riser evidence (required and optional photos), with a regression test that failed before the fix; verified on the phone after the owner rebuilt (riser report lists its photo; 4 JPEGs in the PDF). Also on the phone: CR-01 CO2 offline Good/N.A. photos -> sync -> Accepted Detail -> report. Phone proxy Origin rewritten to https (I-56). Details: [tracker CR-01](docs/client-format-request/CLIENT_CHANGE_REQUESTS_2026-10.md).

**Earlier checkpoint:** 2026-10-10 — **Phone-testing round: I-42 fixed, committed (`0415ffd`) and phone-verified; I-45/I-46/I-49/I-50/I-51 fixed in source, phone retest pending.**
I-42: the header chip follows `navigator.onLine`. I-45/I-46: Roller Shutter report fields read "No. N (Zone — Location)", rows and photos are grouped by zone for display
(stored order unchanged), photo captions name the shutter (API + web + PDF). I-49: a 409 already-pending layout proposal is retired calmly, not retried. I-50: the layout note survives
a reload. I-51: a 403 from `/api/sync` no longer says "Sign in". Needs the proxy AND API rebuild to reach the phone (the API image would also carry other sessions' uncommitted work,
including `migrations.ts`). Register, evidence and test list: [PHONE_TESTING_STATUS](docs/testing/PHONE_TESTING_STATUS.md). Mine to commit: not done (the classifier refused staging).

**Earlier checkpoint:** 2026-10-10 — **CR-06 form "jumps to top" reproduced and fixed (scroll continuity); verified on the phone.**
Cause: a network hand-over re-verifies the session and hides the open form (by design), collapsing the page to the top.
The form now returns at the same scroll position. Hand-over test fails on HEAD (11/11) and passes (11/11); taps/autosave never moved the page.
Owner decision left: keep Drafts mounted during re-verification (Level 2). See [CR06_FORM_SCROLL_JUMP](docs/testing/CR06_FORM_SCROLL_JUMP.md).

**Earlier checkpoint:** 2026-10-10 — **CR-09 Complete Repair disabled for new entry; saved-data compatibility preserved.**
One recoverable UI switch hides the option across all result-entry forms and correction choices.
All 12 forms were checked; saved retired drafts in all 11 result-bearing systems can change offline.
Web typecheck/build, 58 browser cases and 151 node tests pass; 14 retired-option scenarios are explicit skips.
All 300 API files match pre-task hashes. No API/server, migration, Dexie or Git change. Requested Git
checks were not run under the owner no-git rule, so literal DoD remains open for those checks.
Evidence, per-hit audit and restore checklist: [CR09_REPAIR_DISABLED](docs/testing/CR09_REPAIR_DISABLED.md).

**Earlier checkpoint:** 2026-10-10 — **CR-08 photo date/time watermark implemented; phone acceptance pending.**
New camera/gallery photos burn Malaysia processing time into pixels before compression and SHA-256.
Existing stored photos, copied evidence, retry/sync bytes and attachment schemas are unchanged. Focused photo
tests, affected browser regressions and Node tests pass; web typecheck/build and diff check recorded in
[CR08_PHOTO_WATERMARK](docs/testing/CR08_PHOTO_WATERMARK.md), with all callers, full-size measurements and owner
phone retest steps. Existing high-resolution input/memory limits and a pre-existing e30c649 protected-file
baseline discrepancy are documented. No deployment or Git mutation.

**Earlier checkpoint:** 2026-10-10 — **CR-11 Admin wording implemented; Level 1 checks pass.**
The existing `supervisor` review role now reads Admin throughout the UI, freshly rendered report/PDF text,
API messages and client guides. The existing `admin` account still uses Manager; permissions and stored data
are unchanged. Web typecheck/build, 55 affected browser cases (with focused rerun), 8 web node tests, API
typecheck and 16 API integration/report/PDF cases pass. Duplicate Admin labels and per-hit internal-name
audit: [CR11_ADMIN_WORDING](docs/testing/CR11_ADMIN_WORDING.md). No deployment or Git mutation.

**Earlier checkpoint:** 2026-10-10 — **CR-05 compact remaining inspections implemented; Level 1 checks pass.**
Remaining Inspections now uses a collapsed native disclosure with authoritative completion counts and compact
unit/reason rows. Ready to Complete, completion rules and API/data behavior are unchanged. Chromium checks at
360/768/1280px, existing completion workflow, UI static regressions, web typecheck/build and diff check pass.
No Git mutations or deployment. Evidence and reproducible commands: [CR05_REMAINING_INSPECTIONS](docs/testing/CR05_REMAINING_INSPECTIONS.md).

**Earlier checkpoint:** 2026-10-10 — **Security committed; local candidate images verified; no deployment.**
Owner authorized commit `f208352` and continuation. API and web/Caddy candidates built from that committed archive,
excluding unrelated changes. Candidate API versions match the reviewed lockfile; production audit is clean; Linux
Argon2/Sharp/application Chromium PDF smoke checks and Caddy/PWA asset validation pass. Production replacement,
edge/proxy-chain verification and physical-phone acceptance remain outstanding; security sign-off is withheld.
Details: [SECURITY_DEPLOYMENT_CHECKPOINT](docs/testing/SECURITY_DEPLOYMENT_CHECKPOINT.md).
Replacement/rollback plan prepared without production access:
[SECURITY_DEPLOYMENT_EXECUTION_PLAN](docs/testing/SECURITY_DEPLOYMENT_EXECUTION_PLAN.md).
Production authorization, origin and purpose-created account inputs remain pending. The reminder worker must use the
coordinated API image; public Host preservation is required by the HTTPS Origin guard.

**Earlier local review checkpoint:**
The origin guard now requires HTTPS as well as the incoming Host, without enabling proxy trust. New disposable tests
prove both login/reset/deactivation race orderings, deactivation rollback, and actual child-process termination/replacement
without refunding durable attempts. Historical audit cleanup is coalesced to once per minute per process under normal
operation; counters remain PostgreSQL-owned. The dependency report's PWA-plugin baseline was corrected. Focused units
5/5 and expanded security integration 10/10 pass. The full cold-start regression wrapper, final focused cleanup/crash
suite, typechecks/builds and four dependency audits pass with no skips. Local security P0/P1: 0/0; deployed A-02 remains P1.
No schema, historical template, infrastructure, environment or production-data changes. Owner deployment and physical-phone
acceptance remain separate checkpoints; security sign-off is withheld. The security changes are ready for the owner's
manual Git checkpoint; unrelated working-tree changes require their own review. Stop before staging. Details:
[SECURITY_REMEDIATION_IMPLEMENTATION](docs/testing/SECURITY_REMEDIATION_IMPLEMENTATION.md).

**Earlier checkpoint:** 2026-10-09 — **Security remediation Tasks 1–4 implemented locally; owner code review/deployment acceptance pending.**
Durable PostgreSQL-backed login budgets (8 account failures/10 min, 120 socket-peer attempts/10 min,
300 global/min, four concurrent verifications); forwarding headers remain untrusted and Caddy shares one peer budget.
Malformed/duplicate session cookies fail closed; no-store and browser-write origin checks added; deactivation permanently
revokes sessions. API proxy-addr/Express/qs/body-parser/sharp and compatible frontend dependencies patched; full and
production-only local audits report zero advisories. Focused auth/ownership/role/session, historical/evidence/image/PDF,
offline-authority and browser cooldown regressions pass. No production access, infrastructure/schema changes or Git mutations.
Always Use HTTPS and previous targeted redirect evidence preserved. **Local code P0/P1: 0/0; deployed A-02 remains P1
until owner deployment and acceptance. No security sign-off.** Exact files, thresholds/proxy limitations, PASS/NOT RUN
checklist, dependency evidence, P2 items and cold disposable-DB commands:
[SECURITY_REMEDIATION_IMPLEMENTATION](docs/testing/SECURITY_REMEDIATION_IMPLEMENTATION.md).
Stop before staging. Task 5 (edge rule, origin isolation, reviewed image deployment, installed versions and physical-phone
HTTPS/offline/reconnect acceptance) belongs to the owner.

**Earlier checkpoint:** 2026-10-09 — **Security next-task brief; HTTPS redirects verified after owner enabled Always Use HTTPS.**
Targeted live recheck at 23:17 MYT: HTTP app GET and empty HTTP login POST both redirect with 301 to HTTPS;
HTTPS `/api/auth/me` still rejects anonymous access with 401. A-01's tested transport behavior is corrected;
fresh-browser/phone acceptance remains. Application login throttling (A-02, P1), dependency review/patches and
malformed-cookie handling remain open. Implementation scope, acceptance checks and owner deployment steps:
[SECURITY_REMEDIATION_TASK_BRIEF](docs/testing/SECURITY_REMEDIATION_TASK_BRIEF.md). No product code or deployment changes by this task.

**Earlier checkpoint:** 2026-10-09 — **Public unauthenticated security assessment; security sign-off withheld.**
Non-destructive source/live assessment: 73/73 protected checks rejected with `401 AUTH_REQUIRED`; no anonymous business
data access observed. **Two open P1 findings:** public HTTP serves the app and processes login requests without HTTPS
redirection; application login has no throttling (Cloudflare edge controls not verified). P2: dependency advisories in
deployed API packages require patch/reachability review, and malformed cookie encoding returns a safe but incorrect 500.
No live remediation, database changes, credentials used, or Git mutation. Evidence, limitations and next security checkpoint:
[SECURITY_ACCESS_ASSESSMENT](docs/testing/SECURITY_ACCESS_ASSESSMENT.md). This is a bounded assessment, not release acceptance.

**Earlier checkpoint:** 2026-10-09 — **Roller Shutter zones x locations setup + auto-saved layout (Phases 1-2; Phase 2 uncommitted; stop before staging).**
Phase 1 (committed `626c21f`, review fixes `0d15a57`): a fresh Roller Shutter visit asks how many shutters before the form, a
visit with a saved layout shows "Same shutters as last time", and submitting a new or changed layout queues the existing
`update-format` proposal automatically (no button; Supervisor approval kept). Phase 2: **zone headings inside the one form**.
First visit asks **Number of zones** and **Locations in each zone** (per-zone override), the form groups rows under zone
headings (rename a technician zone, **Add shutter to** a zone, **Add Zone**), and the approved layout pre-fills every zone next
visit. Design: no migration, no `customer_system_zones` rows - `zoneText` is a free-text label on each saved preset row
(`{assetReference, locationText, zoneText}`, all rows or none) inside the existing zone-free General location, and a **response
schemaVersion 2** adds `zoneText` to every row (schema 1 stays valid and byte-identical; configured rows must equal the frozen
zone; `master_system_form_instances.response_schema_version` already allows 1/2). Files: `fireRatedRollerShutter*` (web),
`fireRatedRollerShutterV7Acceptance.ts` / `fireRatedRollerShutterInspectionSync.ts` / `locationConfiguration.ts` /
`acceptedMasterSystemDetail.ts` / `reportViewModel.ts` (API; the report prints "Zone - Location", the frozen V7 definition is
unchanged). Tests: web Node + Playwright (`fire-rated-roller-shutter-setup.spec.ts`), API unit, and disposable-Postgres
integration (schema 2 accept, frozen-zone tamper, schema-1 retained, zoned proposal approval, Final Report + PDF text).
**Known P2, deferred:** a second proposal for the same customer/system while one is pending returns 409 and shows "Sync
needs attention" until a Supervisor decides; the layout-save outcome note is not persisted after reload.
Not done: phone / installed-PWA / force-close check; Manager desktop editor for Roller Shutter zones (none exists; layouts
come from technician proposals).

**Earlier checkpoint:** 2026-10-09 — **Admin recovery CLI + admin web password reset (committed `94bdc19`).**
Part A: `create-admin` now creates a NEW admin only (existing username → exit 1); new `reset-admin-password`
([adminCli.ts](apps/api/src/cli/adminCli.ts), [resetAdminPassword.ts](apps/api/src/cli/resetAdminPassword.ts)) updates an
EXISTING admin only, reactivates it and revokes its sessions in one transaction with an `admin_*_cli` audit row; hidden
TTY prompt (twice) or `ADMIN_PASSWORD` when not a TTY, 12–1024 chars. Part B: `POST /manager/technicians/:id/password`
(admin only; technician/supervisor targets, not hidden; revokes target sessions, never reactivates, audited) and a
**Set new password** action on the Technician List. No schema/migration change. Operator commands:
[Admin recovery](docs/client-install-and-public-access.md). The user guide's old password workaround was replaced.
Tests: `npm run test:admin-cli-integration`, `managerTechnicians.integration.test.ts`/`.test.ts`, Playwright
`manager-technicians.spec.ts`. Not done: phone/real-PWA check; live-app walkthrough of the new screen.

**Earlier checkpoint:** 2026-10-09 — **I-31, I-32, L-5 fixed; client user guide verified against the real UI.**
Web/proxy rebuilt as `build-20261008T155132Z` (`docker compose build proxy`, `up -d --no-deps proxy`; API and
PostgreSQL untouched, health ok). Fixes, each with a regression test that failed first: **I-31** proposal screen no
longer keeps another job's system (derived per job, fail-closed message, `key` by job id); **L-5** header summary now
counts location-proposal outbox items (Pending → "waiting to sync", Failed/Conflict → "Sync needs attention", only
server-confirmed Completed clears it); **I-32** four stale API fixtures repaired (all four also failed before the
location work; fixture drift only, no product bug). Gates: both typechecks, **Playwright 190/190, web Node 377/377,
API 519/519**, `git diff --check` clean. [USER_GUIDE](docs/client/USER_GUIDE.md) and
[EVIDENCE_POLICY](docs/client/EVIDENCE_POLICY.md) were corrected from a live walkthrough (admin, supervisor,
technician; browser at desktop width + 360 px menu check; **no phone**) and now include a Known limits section.
Test data left behind (cannot be deleted by design): accepted visit SV-20261008-79 (accepted records), two rejected
proposals with their immutable decisions ("GuideWalk Test Room", "L5 Header Probe Room"), archived customer
"ZZ Guide Walk Customer" (with one extra configuration version), a Reviewed-by-Supervisor mark on SV-79. Removed or
reversed: the test technician account, the extra visit, the reminder routine/date.
**Client handover: NOT YET** — production HTTPS/install, client-PC operations, physical-phone re-check of L-5/I-31 and the
owner policy decisions remain (Level 3 acceptance is the owner's separate checkpoint). No staging or Git mutation.
See [phone register](docs/testing/PHONE_TESTING_STATUS.md) and
[production checklist/local verification](docs/release/LEVEL3_CHECKLIST.md).

**Earlier checkpoint:** 2026-10-08 — **Local release verification and owner-selected L-4 warning** (build
`150537Z`; then 188 Playwright, 371 web Node, API 507/519 with the four fixtures later repaired as I-32).
Evidence: [complete pass report](docs/testing/RELEASE_LOCATION_VERIFICATION.md).

**Earlier checkpoint:** 2026-10-08 — **Prompt B: legacy proposal disposition and client documentation.**
Owner confirmed proposal `678f1e17-34b2-42f5-9674-2bd8d0392524` is demo debris and authorized rejection only.
The dry-run-default [one-off script](scripts/reject-legacy-location-proposal.mjs) ran with explicit `--apply`
through the existing authenticated API as admin `mobiletest`; no proposal deletion, payload update,
validator change, schema change or new endpoint. Full before/after output is preserved in
[the rejection report](docs/testing/LEGACY_PROPOSAL_REJECTION.json). Pending is clear in the built-in
browser; Rejected retains the unreadable submission summary by design. Focused script, route,
parser/browser tests and both typechecks pass; readable-proposal fixtures were browser-local and
cleaned up with their test contexts (no extra runtime proposals).
[Evidence policy](docs/client/EVIDENCE_POLICY.md) and [client user guide](docs/client/USER_GUIDE.md)
describe actual behavior and mark unverified/setup steps `[CONFIRM]`. Current V7 is four-state;
both Admin and Supervisor can append audited corrections; corrected reports currently block PDF
download. Password reset has no implemented UI. See [scope/gates/limitations](docs/testing/PROMPT_B_REPORT.md).
The other chat's email/location verification files and edits are outside this task and preserved.
No staging or other Git mutation. Client deployment, phone install/offline acceptance and marked
handover confirmations remain separate gates.

**Last updated:** 2026-10-07 — **G7 / Fire Intercom Sol recheck — found a new P0: Final Report is
broken for any job containing a V7 Dry/Wet Riser inspection.** Confirmed live on the runtime
(`docker compose`, not touched otherwise) with the demo job `SV-20260909-42` (Demo V7 Shared
Evidence Client, customer `DEMO-V7-SHARED-EVIDENCE`): submitted and synced all 7 applicable
systems (Fire Alarm, CO2, Wet Chemical, Hydrant, Hose Reel, Automatic Sprinkler, Dry/Wet Riser),
completed the service visit (7/7), then **View Final Report returned a 409** —
`GET /api/inspection-jobs/:id/final-report` → `"Required accepted inspection history is
unavailable for Dry / Wet Riser System."` Root cause: `validHistoricalUnit()` in
[`apps/api/src/reports/finalServiceReport.ts:366`](apps/api/src/reports/finalServiceReport.ts:366)
has a `v7Suppression` allowlist that includes every other V7 system (`co2_fire_extinguisher`,
`wet_chemical`, `fire_alarm_detector`, `hydrant`, `hose_reel`, `automatic_sprinkler`,
`smoke_ventilation`, `fire_intercom`, `fire_rated_roller_shutter`, `fm200_fire_suppression`) but
**omits `dry_wet_riser`**, and there is no dedicated `row.system_key === "dry_wet_riser" &&
snapshot.schemaVersion === 2` branch either (unlike Hydrant/Hose Reel/Automatic Sprinkler, which
each have one at lines 396/406/416). The function's entry guard therefore always returns `false`
for a V7 Riser record, so `finalServiceReport.ts:885` always throws. Accepted Detail's own
validator (`validateAcceptedDryWetRiserV7Detail` in
[`apps/api/src/inspections/acceptedMasterSystemDetail.ts:353`](apps/api/src/inspections/acceptedMasterSystemDetail.ts:353))
already does this correctly and is the pattern to mirror. No `finalServiceReport.integration.test.ts`
case exercises Dry/Wet Riser at all, which is why this was never caught — STEP 1.4's own proof
(`dry-wet-riser-v7-offline.html/.spec.ts`) stops at Accepted and never calls Final Report. **This
likely affects any already-accepted production job with a V7 Dry/Wet Riser inspection that reaches
Complete Service** (not checked against runtime data — out of scope for this recheck). Not fixed;
left for the owner to prioritize. The demo job above is left closed/read-only as a live repro —
harmless, and the underlying data is valid, so a code fix alone (no migration, no data change)
resolves it retroactively.

Also found and fixed, in the same pass: the **"Remark \*" required-indicator never renders** for
any V7 finding needing Not Good/Complete Repair — [`RemarksField.tsx:72-76`](apps/web/src/inspectionControls/RemarksField.tsx:72)
ignores the `label` prop whenever `systemKey` is set (always, in practice), always showing plain
"Remark". Submission is still correctly blocked without a remark (verified via the submit-gate
error text), so this is cosmetic/UX only, not a data-integrity bug — technicians just get no
advance visual cue. Not fixed; flagged for the owner.

**G7 (4-state browser sanity) — steps 1–2 confirmed, step 3 confirmed for Fire Alarm, step 4
blocked by the new P0 above.** Live-tested on `https://localhost/` as `technician-demo`: Good/N.A.
correctly hide the remark+photo widgets, Not Good/Complete Repair correctly reveal them; the G7
duplicate-photo guard fired exactly as documented (*"This photo is already attached to
charger_batteries.charger_battery_checks.battery. Each finding needs its own photo."*); Fire
Alarm's Accepted Detail rendered the 4-state labels correctly and the `/api/v7-evidence/accepted`
manifest returned `200`. Could not reach the PDF-embedding step (step 4) for *this* job because
Dry/Wet Riser blocks Final Report — the mechanism itself remains covered by
`fireAlarmV7.integration.test.ts`'s own PDF-embed case (not independently re-run this session; see
below). **Fire Intercom Sol verdict — CONFIRMED SAFE, closing the long-open §6a line.** Reviewed
`0e17c74` against the server's `validResponses()`: client/server key-literal parity confirmed
word-for-word, no drift since September. `test:v7-fire-intercom-submit` 23/23 (incl. all 5 "Sol
P1" regression cases), `acceptedMasterSystemDetail.fireIntercomV7.test.ts` 6/6,
`fireIntercomV7.integration.test.ts` 12/12 on fresh disposable PostgreSQL, both typecheck/build
clean, DO-NOT-MODIFY list clean, V1–V6 byte-identical to `e30c649`. P0: 0, P1: 0, NEW DEFECTS: N
(aside from the two above, both outside Fire Intercom's own scope). SAFE TO COMMIT: Y (already
committed).

**Process note:** two background disposable-Postgres test runs (covering CO2/Wet
Chemical/Fire Alarm/Smoke Ventilation/Fire Intercom + PDF embedding together) were accidentally
started overlapping each other against the same disposable DB and hung; killing them was correctly
blocked by the harness's workload-safety guard, so they were left running rather than force-killed.
Their result was never obtained, but the live-runtime walkthrough above independently confirms the
same ground for Fire Alarm. Docker Desktop was started this session (it restored the
`inspection_pwa-*` runtime compose stack automatically); a separate disposable Postgres container
(`phase8f-v7-verify`, port 55432) was used for all integration-test runs, per the standing rule
never to point tests at the runtime database.

**Last updated:** 2026-09-29 — **Paused pending client domain and confirmations; resume around 2026-10-06.**
Current code is at `18e9895` on `phase-8e-client-demo-polish`; the working tree was clean before
this status note. All 12 listed services have an implemented V7 path (Portable Fire Extinguisher
is registration-only by design). Location-format reuse for the seven repeatable-row systems is
committed and reviewed, including Supervisor approval, concurrent merge protection, and frozen
historical row shapes. The latest API/web builds, historical/V6/V7 and focused integration
suites, and relevant browser regression tests passed on 2026-09-29. These are development
checks, not a production-domain, physical-phone, or installed-PWA acceptance claim.

**Waiting on client/owner input:** the production domain and its DNS control; the client's
public-IP/router/reverse-proxy and production-credential details; confirmation of FM200 against
the client's source format; sign-off on the provisional Final Report condition mapping and
Roller Shutter PDF/paper interpretation; and the backup retention/off-device-copy policy.
The owner may bring other confirmations when returning. Until then, do not infer production
HTTPS readiness from the interim local/tunnel tests. On return, confirm these inputs, review
the fresh PDF with the client, then run the Phase 9 deployment and real-device/offline
acceptance gates before release. See §4–§5 for the longer-standing backlog.

**Internal follow-ups (no client input needed, not yet confirmed closed):** the §4 "Outstanding
owner check — 4-state browser sanity" checklist (G7) and the Fire Intercom final Sol review
verdict (§6a) were still open as of early September and were never explicitly marked closed
despite a lot of overlapping browser-proof work since. Recheck whether they're already covered
before re-running them from scratch — see the note in §1.

**Last updated:** 2026-09-29 — **Location-format reuse baseline review and migration disposition.**
The completed feature and review fixes are in `d8510cc`. A clean `0024707` source archive,
run against fresh disposable PostgreSQL with the installed Chromium path, passed
`fireAlarmV7.integration.test.ts` 4/4; the same suite passed 4/4 on the feature head. The
earlier 3/4 note was an environment failure caused by an invalid Chromium path, not a code
regression. Migration 046 is required for Roller Shutter V7 photo evidence: the clean baseline
database's staged-evidence and reservation constraints both exclude
`fire_rated_roller_shutter`, while the feature stages and accepts its evidence. It is a
forward-only migration already committed in `058d2f9`; no migration is added by this review.
The original no-migration check applied to the location-format patch alone and does not cover
the Roller Shutter V7 evidence capability included in the full feature span. See the change log.

**Last updated:** 2026-09-29 — **Location-format reuse review fixes (committed `d8510cc`).**
The Supervisor inbox now validates every supported proposal format through the same browser
shape reader used by technician drafts; Supervisor session restoration no longer requests the
inspector-only job list. Approval locks the customer before reading and merging its live
configuration, so simultaneous approvals for different targets retain both formats. The direct
Manager Fire Alarm locations route rejects missing or mismatched table routing. Roller Shutter,
Smoke Ventilation and Fire Intercom now offer separate future-format correction inputs for
configured labels, leaving frozen inspection rows untouched. Focused API/web tests, the
disposable-PostgreSQL concurrent-approval integration test, and browser checks for Supervisor
approval and all three format editors passed. The already-committed migration 046 belongs to
Roller Shutter V7 evidence support; this fix adds no migration. See the new change-log entry.
The standard V6/V7 database suites, web production build, and Manager authorization browser
suite also passed. The latter suite's stale text-based offline denial checks were updated to
assert the current denial and absence of a Manager dashboard or service-data request.
The final review found and corrected a 10 px sticky action-bar overflow at the 768 px
breakpoint; the Roller Shutter layout now fits 360, 768 and 1280 px viewports.

**Last updated:** 2026-09-29 — **Phase 2.5 Smoke Ventilation / Fire Intercom location-format reuse (uncommitted; stop before staging).**
Both zone-free single-table systems now save their Fan/Station `assetReference` labels as one
General row format through the established technician proposal outbox. Supervisor approval
freezes the saved rows into new visits. The per-row result fields and serialized inspection
shapes are unchanged. A read-only runtime query found zero submitted records for either system.
The disposable-Postgres HTTP round trip, new-visit freeze, focused row tests, both app builds,
and a real browser Smoke Ventilation first-visit → approval → second-visit walkthrough passed.
The known Supervisor Location Proposals navigation error recurred; approval used the local
test API. See the Phase 2.5 change-log entry. This closes the full Phase 2 roadmap item across
all seven systems (Phase 2.1–2.5).

**Last updated:** 2026-09-29 — **Fire Alarm location-format reuse (uncommitted; stop before staging).**
Extended the location-proposal patch model to Fire Alarm -- the most structurally complex remaining
service, with TWO repeatable tables (primary device rows, secondary alarm device rows) in one
inspection record. Modeled as zone-free with two independent pseudo-locations, `general-primary` and
`general-secondary` (one per table, since a real location's rows already route entirely to one table
via `rowPreset.fireAlarmTable`), each with its own "Save as format for next visit" button and
independently proposable/approvable. `FireAlarmPrimaryDeviceRow`/`FireAlarmSecondaryAlarmDeviceRow`'s
frozen serialized shapes are unchanged. Also generalized three separate hardcoded "Roller
Shutter/Hose Reel are the only zone-free systems" checks (in `locationConfiguration.ts` twice, and in
`managerCustomers.ts`'s shared write path) into one shared `zoneFreeLocationKeysBySystem` registry
supporting more than one implicit location per system -- a real bug this task's own integration test
caught (`applyManagerLocationsUpdate` initially rejected the second pseudo-location's zone-free write).
Same UI fix as Hydrant: removed the dead-code `readOnly={configured}` lock on primary/secondary
identity inputs (server never enforced content-matching for V7 anyway). Focused unit/integration
tests, both typechecks/builds, and a real (non-Docker, disposable-Postgres) browser walkthrough all
passed -- see the newest change-log entry for the full design writeup, test list, and a flagged
Roller Shutter follow-up (same lock is still live there, unconfirmed whether intentional).

**Last updated:** 2026-09-29 — **Hose Reel location-format reuse (uncommitted; stop before staging).**
Hose Reel's schema-3 form now saves the actual drum count and each drum's type, location, and
reference as a customer-level row format for Supervisor approval. Approval creates or updates
one zone-free General location; a new visit freezes those rows and pre-fills its per-visit
`response_payload.drumCount` and drum sections. Schema-3 response keys and historical readers
are unchanged. A focused browser check also caught and fixed configured-row Draft save
restoring the old location text. See the newest change-log entry for tests and limits.

**Last updated:** 2026-09-29 — **Hydrant / Dry-Wet-Riser location-format reuse (uncommitted; stop before staging).**
Extended the location-proposal patch model (Phase 2.1/2.2's `add-location` + `update-format`
pattern) to Hydrant and Dry/Wet Riser -- the two remaining repeatable-row services with
accepted production data. Unlike Roller Shutter/Hose Reel, neither is zone-free: both use
`add-location` (real zones) exactly like CO2/FM200. `HydrantRow`/`RiserOutlet`'s frozen
serialized shape is byte-identical; only the runtime pre-fill of newly-created configured rows
and a UI fix changed. See the newest change-log entry for details, tests, and the manual
walkthrough.

**Last updated:** 2026-09-29 — **Phase 2.1 Roller Shutter location-format reuse (uncommitted).**
The owner chose to keep Roller Shutter zone-free. A focused follow-up review tightened the
Manager write boundary to one General layout with at most 250 rows. A technician can save actual Asset Reference
and Location rows from the inspection form for Supervisor approval. The first approval creates
the zone-free General configuration; later approvals update it, and the next visit pre-fills
the saved rows. Focused tests, disposable-PostgreSQL integration, typechecks/builds, and a
desktop-browser propose/approve/new-visit/acceptance walkthrough passed. See the newest
change-log entry. Physical phone and PWA force-close checks remain for release acceptance.

**Last updated:** 2026-09-29 — **Wet Chemical detector-row format reuse added (uncommitted).**
Wet Chemical now uses the same saved row count/content and in-form format action as CO2;
focused tests, web typecheck and build pass. The disposable-browser propose/approve/new-visit
walkthrough also passed. See the newest change-log entry.

**Last updated:** 2026-09-29 — **CO2/FM200 preset-row limit aligned with detector contract (uncommitted).**
Newly saved CO2/FM200 location presets above 250 rows are rejected before a customer
configuration revision is written; the Manager field now shows 250 as its maximum.
Other systems retain the existing 500-row limit. The shared save guard also covers
inline configuration revisions and location-proposal approval. Existing frozen jobs
are unchanged. Focused disposable-Postgres Manager locations tests, both app typechecks,
and `git diff --check` passed. The in-progress proposal-flow edits were left intact;
this guard was added in a separate hunk of the shared Manager save file.

**Last updated:** 2026-09-29 — **Four requested fixes reviewed for commit.**
The location-proposal review now requires a real visit owned by the submitting technician
for the target customer and system, and rejects a foreign technician's UUID replay.
Proposal audit context no longer blocks deletion of an unfinished visit. The disposable-
Postgres proposal suite and Manager locations regression, IndexedDB browser sync test,
focused API/web tests, and both app typechecks passed. See the change log for scope and
the remaining technician decision-visibility limitation.

**Last updated:** 2026-09-29 — **Completed-report photo source shown to Technician and Manager/Supervisor.**
The JSON Final Report now labels accepted photos as Camera, Gallery, or Source unavailable;
the shared read-only presentation shows the label. New V7 staged uploads persist their
validated capture source through forward migration 047. Older V6/V7 staged rows cannot
recover that metadata and display Source unavailable; legacy attachment rows already
store it. The PDF renderer, embedding model, and final-service-report loader were untouched.
Focused route/UI tests, the supervisor browser check, both typechecks/builds, and the
FM200 V7 disposable-Postgres suite passed (2/2 with the test runner's force-exit option).
The historical matrix (20/20), V6 evidence suite (11/11), and report view-model suite
(14/14) also passed. The test container was removed.

**Last updated:** 2026-09-29 — **CO2/FM200 detector counts and desktop job return.**
New CO2 and FM200 location drafts seed detector rows from the frozen `presetRowCount`.
Technicians can set the total count; extra blank rows trim from the end while configured
and filled rows remain. Local row provenance is stripped from the existing exact-key
server payload. The in-context “Back to My Jobs” button now displays on desktop.
Focused row-count and repeatable-row tests, web typecheck/build passed. No phone or
offline acceptance run was performed.

**Last updated:** 2026-09-29 — **Generated report pagination and Roller Shutter parts tally fixed in code.**
The PDF renderer now uses a compact Roller Shutter inspection header, 36 mm photo previews,
a slightly shorter inspection strip, and less space before the end marker so photo-backed system details do not leave a strip
alone on a nearly empty page. Failed Roller Shutter Auto Alarm/Manual Mode checks remain in
the finding remarks but no longer produce a false parts tally. A representative FM200 plus
Roller Shutter two-photo PDF regression renders in five pages with both strips alongside
their system content. Report model and full template suites, API typecheck/build, and
`git diff --check` passed. The previously downloaded seven-page PDF is unchanged; generate
a new report after deploying these changes for owner visual sign-off. No runtime or
production data was modified for this verification.

**Last updated:** 2026-09-29 — **Generated report reviewed; Roller Shutter result choices confirmed.**
The owner confirmed that the conflicting paper `/` mark is deferred. Keep Good, Not Good,
Complete Repair, and N/A as the four digital choices. The generated report
`Service-Report_SV-20260928-48_2026-09-28.pdf` shows one FM200 cover entry and the Roller
Shutter detail page, but its inspection strips spill onto nearly empty pages 5 and 7.
The Roller Shutter's `AUTO ALARM MODE X 1` parts tally also treats a failed test mode as a
replacement part. Visual report acceptance remains open pending those report fixes and a
fresh PDF review.

**Last updated:** 2026-09-28 — **Fire Rated Roller Shutter V7 form implemented; duplicate FM200 cover entry removed (uncommitted).**

The roller shutter form follows `docs/paper-forms/fire-rated-roller-shutter.md`: Date Tested, Zone, Inspected By, numbered Location/Auto Alarm Mode/Manual Mode rows, and Comments. It saves drafts in IndexedDB, queues evidence before the parent inspection, and has accepted-detail and Final Report readers. The report cover now lists the confirmed `fm200_fire_suppression` once; the approved HTML fixture and snapshot reflect that. Focused API/web tests, browser form flow, both typechecks, both builds, historical/V6 regressions, all 12 report-template tests, and disposable-PostgreSQL clean and photo-backed acceptance/idempotency passed. The paper page and cover disagree on the `/` mark, so the V7 four-state interpretation remains provisional. Next: owner review and manual commit; then visual review of a generated roller shutter PDF and a physical-phone offline/reconnect acceptance pass before release. The current PDF renderer already has the landscape cover, summary, and system-page structure, so compare its actual output with the client sample before changing layout.

**Last updated:** 2026-09-28 — **Offline common remark Edit/Remove and manager phone navigation fixed.**
Pending common remark edits now update the cached record and queued create together; removal cancels that create and clears the cache. Manager pages use the existing collapsible mobile menu. Focused browser coverage is in `apps/web/tests/manager-common-remarks-mobile.spec.ts`. Service Catalog layout remains at planning stage pending owner approval.

**Last updated:** 2026-09-28 — **Technician self-delete of an in-progress job cherry-picked from `claude/autopilot`'s T14.**
New `PUT /inspection-jobs/:jobId/archive` (soft delete via `inspection_jobs.archived_at`, never a
hard delete) plus a "Delete this job" button in the technician job detail view, shown once local
work has started (i.e. exactly when the existing "Delete unfinished visit" hard-delete button is
disabled). Dropped upstream's own migration (a duplicate port of this branch's own 036, which
already covers `archived_at`) and its stale claim of no admin restore path — this branch's
existing Manager Operations archive/restore already covers recovery.

**Last updated:** 2026-09-28 — **Search boxes cherry-picked from `claude/autopilot`'s T13 onto Technician List and Upcoming Service.**
Client-side, case-insensitive filter over username (technicians) or name/code (upcoming services),
`useMemo` over the already-loaded list, no API change. Dropped the Customer Configuration hunk of
the upstream commit — this branch already had its own independent search box there. On Technician
List, the new filter composes with the existing "Show deactivated" toggle (status filter first,
then the search query on top of that).

**Last updated:** 2026-09-28 — **Whitespace collapse cherry-picked from `claude/autopilot`'s T9 (managerCustomers.ts).**
Customer/site display names and contact phone/person now collapse internal whitespace on write
(single file, no schema change). Only affects new writes, never rewrites an existing row.
**Also surfaced by this cherry-pick, not fixed here:** `apps/api/src/routes/
managerServiceVisits.test.ts` has 7 real, reproducible failures, invisible to the standard gate
script because that file was never added to its test list — worth a dedicated follow-up task.

**Last updated:** 2026-09-28 — **Due soon / Overdue compliance glance cherry-picked from `claude/autopilot`'s T7 onto Manager Home.**
Manager Home now shows "Overdue" and "Due soon" (fixed 7-day window) counts and customer lists,
computed server-side from the same `next_service_due_date` column Next Upcoming Service edits;
admin-only, hidden from a supervisor. Kept alongside this branch's existing KPI tiles and trend/
status charts rather than replacing them. Only a genuine 401/403 from the new fetch is treated as
fail-closed; anything else means "nothing to show" on what is a supplementary widget.

**Last updated:** 2026-09-27 — **Branch `claude/autopilot`: T9 text normalisation landed
(committed on the branch, not merged).**
Customer/site display names and contact phone/person now collapse internal whitespace on write
(single file, `managerCustomers.ts`, no schema change). Codes are always server-generated so moot;
username case-sensitivity is left alone as an auth decision. Remarks normalisation (zero
handling today, across ~10 evidence-sync modules) is scoped out and fully documented as a
ready-to-implement follow-up in `docs/autopilot/designs/T9.md` §1.3, not silently dropped.
**Separately found during T9's review, not part of it:** `apps/api/src/routes/
managerServiceVisits.test.ts` has 7 real, reproducible failures, invisible to the standard gate
script (never added to its test list) and predating this session's work by weeks (traced to T6,
2026-09-23). See `docs/autopilot/BACKLOG.md` T9's follow-up note for detail — worth a dedicated
task before any release-level checkpoint.

**Last updated:** 2026-09-27 — **Branch `claude/autopilot`: T7 in-app compliance reminders landed
(committed on the branch, not merged).**
Manager Home now shows "Overdue" and "Due soon" (fixed 7-day window) counts and customer lists,
computed server-side from the same `next_service_due_date` column Next Upcoming Service edits;
admin-only, hidden from a supervisor. Caught and fixed a real regression before it ever reached
commit: the new Home-level fetch's failure handling was as aggressive as every other Manager
screen's (any failure kicked the whole Manager experience back to the role chooser), which broke
25 unrelated pre-existing Playwright tests that transiently render Home without knowing about the
new endpoint. Fixed by only treating a genuine 401/403 as fail-closed; anything else just means
"nothing to show" on what is a supplementary widget, not a full data screen. See
`docs/autopilot/BACKLOG.md` T7 for full detail, gate/review/revert-proof counts.

Admin can permanently remove a deactivated technician from operational staff lists after typing the exact username. Unused accounts are deleted; linked accounts are hidden through forward migration 044, preserving historical identity. Technicians can delete their own unstarted, open service visits while online; the UI protects local drafts and the server rejects accepted work or pending evidence under a job lock. The existing Manager Operations delete remains available for unfinished visits. The Email reminders staff-address section has submitted name/username/email search and All/Active/Inactive filtering. Focused API, disposable PostgreSQL, and browser tests pass.

**Last updated:** 2026-09-28 — **Service-due email key now provisions automatically on first deployment (unstaged).**

After migration, a fresh API install generates a random key in the persistent `INSPECTION_OPERATIONAL_PATH/service-due-email.key`; the worker reads the same host file. Existing `.env` keys still work. If sender settings exist but the key is missing or corrupt, startup does not replace it and reminder delivery remains blocked until recovery. The client no longer needs to generate or paste a key during setup. The key file must still be included in encrypted off-device recovery backups; existing database/uploads scripts do not include it. See `docs/operations/service-due-email.md`.

**Last updated:** 2026-09-28 — **Email settings save failure now reports missing server encryption key in place (unstaged).**

The live API log identified `SERVICE_DUE_EMAIL_ENCRYPTION_KEY_UNAVAILABLE` during a Manager's sender save. The reminder settings route now returns an actionable 409 without saving a partial setting, and reminder status flags the missing key before any sender is configured. The Manager remains on Email reminders when this known configuration error occurs. Focused disposable PostgreSQL and browser regressions pass. The current running stack predates automatic key provisioning; deploying the updated API and worker will create the persistent key if sender settings are still empty.

**Last updated:** 2026-09-28 — **Customer-list demo exclusion and manager search added (uncommitted).**

Technician `GET /customers` now excludes demo customers from the New Service Visit list. Manager Customer Configuration filters its active list by submitted customer name or code; archived customers remain separate. Focused browser tests and the customer-creation integration test pass. See `apps/api/src/routes/inspectionReference.ts` and `apps/web/src/manager/ManagerCustomerConfiguration.tsx`.

**Last updated:** 2026-09-28 — **Automatic service-due email and optional recurrence implemented (unstaged, owner acceptance pending).**

Forward migration 043 adds encrypted Gmail sender settings, staff notification email, per-customer/due-date recipient plans, and a deduplicated delivery ledger. The dedicated no-port worker sends at 09:00 Asia/Kuala_Lumpur, checks on startup and every 15 minutes, records failed/uncertain/missed outcomes, and never retries SMTP automatically. Manager Settings exposes configuration and delivery status; Next Upcoming Service manages recipients and optional weekly/monthly routines. Successful visit close advances a routine once in the close transaction; manual customers keep their dates. The historical inspection and IndexedDB paths remain untouched. See `docs/operations/service-due-email.md`. Focused unit, browser, and disposable PostgreSQL tests and the standing historical/V6/V7 gates passed; production Gmail egress and a live approved-recipient send remain for owner acceptance.

**Last updated:** 2026-09-28 — **Company Profile logo upload added (uncommitted).**

The same admin-only Company Profile screen can now upload a PNG/JPEG logo (validated and normalized to a single canonical PNG, capped at 1200px on its longest edge, decompression-bomb guarded) or reset to the default. `GET/PUT /api/manager/company-profile/logo` and `PUT .../logo/reset` store the file next to `company-profile.json` under the same `/srv/operational` runtime path. `resolveCompanyLogoFile` in `apps/api/src/reports/companyProfile.ts` is now the single place both the PDF renderer (`renderReportHtml.ts`) and the Manager preview endpoint resolve "what is the current logo" from, so they can't disagree; a save takes effect on the next PDF with no restart. No logo ships today (neither checked-in default asset exists yet), so a report shows its existing "MFE" text placeholder until a Manager uploads one — unchanged from before this feature. Focused unit and route tests cover validation (size/format/decompression-bomb), normalization, persistence, and auth; both apps typecheck clean.

**Last updated:** 2026-09-28 — **Customer form sizing, Company Profile actions, and Operations delete/filter controls (uncommitted).**

Technician Add Customer, Manager Add Customer, and Customer Configuration cards share a centered 720px cap. Company Profile's confirm and save actions align on one row. Admin Operations can request a permanent delete of an open visit only while no accepted records or pending evidence exist; the server rechecks under the job lock and audits each result. Operations also has independent Active/Completed toggles and technician/customer filters. Focused route, cold disposable PostgreSQL, and browser tests pass, as do the historical/V6/V7 gates, both app builds, and `git diff --check`. The shared working tree contains unrelated ongoing changes, so the task brief's full-status-only-intended-files gate remains unmet. See `apps/api/src/routes/managerServiceVisits.ts`, `apps/web/src/manager/ManagerOperations.tsx`, and `apps/web/src/styles/app.css`.

**Last updated:** 2026-09-28 — **Reviewed features 2–4 of the Supervisor/technician-assignment plan (no code change).**

Feature 2 (technician-to-supervisor assignment scoping, uncommitted): re-verified clean — `apps/api`/`apps/web` typecheck, `managerTechnicians.test.ts` + `managerServiceVisits.test.ts` (18/18), and `technicianSupervisorAssignments.integration.test.ts` + `supervisorRole.integration.test.ts` + `managerTechnicians.integration.test.ts` (3/3) against a disposable Postgres container all pass; `git diff --check` clean. Ready for the owner to review and commit.
Feature 3 (remove a deactivated technician from operational lists) is implemented in the 2026-09-28 update above: linked accounts are hidden for historical integrity, while unused accounts are deleted.
Feature 4 (delete an unfinished service) is implemented: Manager Operations retains its guarded admin delete; the technician can delete their own unstarted visit from the selected visit page. Both server routes reject accepted records and pending evidence.
Note: the working tree currently mixes this plan's changes with an unrelated Company Profile edit (next entry below) and unrelated `docs/autopilot/BACKLOG.md` edits (T7/T8/T13, a different tracked workstream) — these will likely need to be committed separately.

**Last updated:** 2026-09-28 — **Manager-editable Company Profile (report letterhead) added (uncommitted).**

Admin-only Manager screen edits the company name, registration no., address, phone/fax/email, complaint hotline, verified-by name/title, and report-number format shown on every generated PDF cover page, with no code change or redeploy needed. `GET/PUT /api/manager/company-profile` reads/writes a JSON file under the existing `/srv/operational` bind mount (no migration, no Docker Compose change); report rendering re-reads it live, so a saved edit takes effect on the next PDF without a server restart — confirmed by the owner on a real generated report. The V1–V7 evidence templates are untouched; this only edits letterhead branding layered on top. The logo image itself stays file-based (no upload UI yet). See `apps/api/src/reports/companyProfile.ts`, `apps/api/src/routes/managerCompanyProfile.ts`, and `apps/web/src/manager/ManagerCompanyProfile.tsx`. Focused unit and route-integration tests pass, both apps typecheck clean, and `git diff --check` is clean.

**Last updated:** 2026-09-27 — **Technician-to-supervisor assignment scoping added (feature 2 of 4; unstaged).**

Forward migration 042 stores reversible many-to-many assignments with a unique technician/supervisor pair. Admin assignment writes validate both roles, audit actual changes, and make retries idempotent. Supervisor technician choices and operational service-visit lists use active server assignments; admin lists remain unscoped. The service-visit detail and report routes also refuse an unassigned job. See `apps/api/src/routes/managerTechnicians.ts`, `managerServiceVisits.ts`, and `apps/web/src/manager/ManagerTechnicians.tsx`. Focused API, browser, and disposable PostgreSQL assignment tests pass. Technician hiding and stale-service archiving remain for later checkpoints.

**Last updated:** 2026-09-27 — **Dedicated Supervisor sign-in added (feature 1 of 4; committed as c10764d).**

The role chooser now separates Technician, Manager (admin), and Supervisor. Supervisor credentials open the existing review-only operations workspace, including its route restrictions, and restore that choice after a same-user reload. Role-mismatch checks reject a Supervisor choosing Manager and an admin choosing Supervisor. See `apps/web/src/manager/roleAccess.ts`, `apps/web/src/App.tsx`, and `apps/web/tests/manager-supervisor.spec.ts`. Assignment scoping, technician hiding, and service archiving remain for the next checkpoints.

**Last updated:** 2026-09-26 — **Wide desktop content centered with the header (uncommitted).**

At widths of 1200px and above, the shared AppShell reserves a matching gutter opposite the sidebar so Technician and Manager page content centers in the browser viewport. The sidebar stays in the left gutter. Technician navigation browser checks confirm New Service Visit and Upcoming Services center at 1280px and 1920px, with no overflow at 360px or 768px; the Manager navigation browser check, web typecheck, and build pass. See `apps/web/src/styles/app.css` and `apps/web/tests/technician-sidebar-navigation.spec.ts`.

**Last updated:** 2026-09-26 — **Technician sidebar Sol findings remediated (uncommitted).**

Technician desktop navigation opens Home, New Service Visit, Add Customer, Completed Services, and Upcoming Services. The phone sidebar remains hidden below 768px, with a compact menu for all five routes. Customer details and the frozen creation request are saved in the technician's IndexedDB workspace before sync; failed responses retry the same request after refresh, and online bootstrap caches service formats for offline selection. The customer POST now checks the queued request's expected actor, including on a cross-account session change. The success action opens visit setup with that customer selected. Completed cards use Home's exact progress calculation. Upcoming Services uses customers with a job created by the signed-in technician as an interim ownership proxy awaiting owner confirmation. The full serial Playwright suite passed 119/119, both apps typecheck and build, and the historical, V6/V7, and customer-creation disposable PostgreSQL gates pass. Offline common-remarks refresh avoids network requests when the browser reports offline. Hydrant accepted-evidence loading now starts at commit so its existing browser check sees the photo under full-suite load.

**Last updated:** 2026-09-26 — **Manager inspection status dashboard added (uncommitted).**

Home now shows Passed, Not OK, and N/A counts with an SVG donut for Admin and Supervisor. The date-capped API reads accepted systems, applies append-only corrections, and uses the Final Report's field flattening and condition logic without changing its three-state output. V7 web Final Reports now show corrected values. Each accepted V7 form, including the technician's accepted detail, starts Pending Review and identifies its verified technician submitter when available. An explicit supervisor approval marks it Reviewed by Supervisor; a later correction returns it to Pending Review. Review history is append-only in forward migration 041. Reports remain viewable while pending. Corrected PDFs retain the existing refusal until their own correction rendering is implemented. Disposable PostgreSQL tests cover the correction and review lifecycle, and browser specs cover the new labels and action. The accepted payload stays unchanged.

**Review findings fixed:** Condition roll-ups now use source-marked result controls, so free-text comments containing Good or Poor cannot change the dashboard or Final Report verdict or create a PDF finding. The Manager web report loads the report and correction history to the same append-only correction revision before displaying either; Check again reloads both. Focused unit, disposable PostgreSQL, and browser race regressions cover the cases.

**Last updated:** 2026-09-26 — **Manager Playwright harness assumptions corrected (uncommitted).**

The customer service-history harness now checks the required closed-row report actions while confirming Admin retains Archive. The Final Report failure matrix supplies a successful empty corrections check before exercising PDF error responses. Both changes are test-only. All 42 selected Manager, Supervisor, and Technician Playwright tests passed, as did the full web unit suite and both app typechecks and builds.

**Last updated:** 2026-09-26 — **Technician tiles and Supervisor browser audit (uncommitted).**

Technician Home now reuses `KpiTiles` for the existing In Progress and Completed counts. The phone layout was checked at 375px and 520px. A Supervisor walkthrough on an isolated current-build stack covered Home, Operations, Services Done, visit detail, Final Report, and an audited correction to an accepted V7 record. It found Services Done exposing Archive/Restore actions that return 403 and hiding a corrected-report PDF refusal; both are fixed. Supervisor workspace wording and web completion-time display are clearer. The server role matrix and correction integration tests passed against disposable PostgreSQL; production data was untouched.

**Last updated:** 2026-09-26 — **Manager Home dashboard implemented (uncommitted).**

Home now shows active non-demo customer count, this month's operational service-visit count, and a daily SVG trend for Admin and Supervisor. The existing navigation remains. Operations shares the KPI tiles, common remarks uses the shared heading and card styles, and Technician headings were checked without changes. See `apps/api/src/routes/managerDashboard.ts` and `apps/web/src/manager/ManagerHome.tsx`. Dashboard counts are server-backed and show an unavailable state on request failure.

**Last updated:** 2026-09-25 — **Windows review-gate Chromium setup corrected.**

The standard gate block in `.agents/skills/codex-task-brief/SKILL.md` now resolves
Playwright Chromium before the PDF-bearing historical matrix. Starting with an
inherited `/usr/bin/chromium` value, the corrected setup resolved the installed
Windows binary and the historical matrix passed 20/20. Disposable database URL
overrides remain inside the integration-test block. No app source changed for
this review-gate fix.

**Last updated:** 2026-09-25 — **Published V1 source restored to the accepted baseline.**

FM200 V7 now clones the CO2 definition inside `masterServiceReportV7.ts`, leaving
the V1 suppression factory private and byte-identical to `e30c649` (Git blob
`a81e75eb4ec9773ab080635095f0fab5221ba454`). API/web typechecks and builds,
V7 contract tests (15/15), historical matrix (20/20), V6 evidence (10/10),
Wet Chemical definition (2/2), config (3/3), web stale evidence (1/1), and
disposable-PostgreSQL V6/CO2/Wet Chemical/Fire Alarm/V7 race/FM200 integration
passed. The current edits remain unstaged.

**Last updated:** 2026-09-25 — **Level 3 General-location and accepted-detail blockers remediated in the working tree.**

The isolated Level 3 browser run found that no-preset FM200 drafts saved offline but
failed server acceptance: migration 006's trigger and preset foreign keys rejected
the frozen General IDs. Forward migration 038 now validates the exact server-owned
General pair while retaining configured-location and reference-deletion checks.
The technician configuration endpoint now includes CO2, Wet Chemical, and FM200
assignments with no saved presets, while still hiding malformed saved locations.
Accepted-detail validation now handles the complete customer snapshot created by
Manager service visits as well as the historical three-field format, with strict
known keys and value checks. The isolated HTTPS browser run confirmed that a
no-preset FM200 inspection saved offline, survived browser reopen, synced once,
returned an exact duplicate on replay, opened as accepted detail, closed its
visit, and appeared in the final report. Disposable PostgreSQL FM200 integration
(2/2), historical matrix (20/20), and final-report tests (18/18) passed. A
physical-phone run and client-domain deployment verification remain for final
release acceptance; the isolated stack used a local self-signed proxy certificate.

**Last updated:** 2026-09-25 — **Service catalog validation now requires `retiredAt` on every entry (uncommitted).**

The default and includeRetired catalog responses both fail closed when an entry
omits `retiredAt`. Active entries use `null`; retired entries use a canonical UTC
timestamp and are available only with includeRetired. Focused web tests cover
both response modes.

**Last updated:** 2026-09-24 — **Phase 8e review findings remediated (uncommitted).**

FM200 V7 evidence now passes the web sync engine's form-instance gate and stages
before its parent. Retired services remain visible in an existing customer's
picker; new assignments are disabled while already-enabled services remain
re-savable, with the API rejection retained. Manager catalog responses now
reject malformed retirement timestamps and inconsistent assignment states.
Focused browser, manager, historical, FM200/CO2, and disposable PostgreSQL
regressions are the review gates for this change.

**Last updated:** 2026-09-24 — **CO2, Wet Chemical, and FM200 location presets made optional (uncommitted).**

Managers can assign all three services without first configuring locations.
For each such service, a new visit freezes a server-generated General zone and
one General location into its job snapshot; saved customer locations take
precedence. Existing visits keep their original snapshots, so a visit created
without locations must be replaced to gain General. The technician new-service
format options include all three services. Malformed configured location/zone
relationships still fail closed. Focused visit tests, manager API integration
tests on disposable PostgreSQL, manager browser tests, typechecks, and builds
were run for this change. No production database or runtime container was changed.

**Last updated:** 2026-09-24 — **FM200 technician open route regression fixed (uncommitted).**

The technician FM200 system button once again invokes the local group
initializer before navigating to the location list. A direct location URL with
a cached configured visit now offers Open FM200 Locations to initialize the
group. Visits whose frozen snapshot contains no FM200 location offer a new
service visit instead. Browser checks cover button dispatch and Dexie group
creation from the frozen job. The running Docker app was not rebuilt here.

**Last updated:** 2026-09-24 — **Remarks layout corrected and FM200 manager location configuration enabled (uncommitted).**

**Follow-up 2026-09-24:** The six-service field control now shows one Remark
picker and selected remarks; only Others reveals text entry and the optional
common-catalog action. Manager Home Services opens customer service configuration
instead of the read-only Operations list, which has its own tile. FM200 opens an
overview first. Legacy visits with no frozen FM200 locations show a Start New
Service Visit action; configured visits show Open FM200 Locations. This follows
the frozen-job contract: a later customer location revision cannot alter an
existing visit. Focused web unit and browser checks passed; final build and
diff check are reported in the task response.

Common choices now sit in the same Remarks section, with no quantity input.
Others accepts technician text and offers Add to common remarks after entry;
multiple selections append to the existing final remark. The manager Preset
rows editor now permits FM200 zones and locations. New configuration revisions
and service visits freeze those locations when provided. New visits without
presets now receive General; existing visits retain their frozen manifest.
Focused
browser, API unit, and disposable-Postgres integration checks passed; final
build and diff checks are recorded in the task response.

**Last updated:** 2026-09-24 — **Service common remarks picker and global catalog implemented (uncommitted; browser acceptance pending).**

The six client-requested services now have a shared picker in their existing
remarks/comments fields. Migration 035 seeds 38 service-specific choices and
adds a global catalog. Technician and manager additions save to IndexedDB
first and sync by UUID; manager edits/removals use authenticated API routes.
The selected wording remains in each inspection's existing remark text, so
V7 per-field evidence and frozen accepted responses keep their authority.
Focused tests, typechecks and builds passed; physical phone/offline acceptance
has not been performed at this checkpoint.
Migration 034 rejects every open→closed transition without a report number while preserving
historical closed NULLs. `closeInspectionJob` uses the Malaysia-local completion year when the
service date is absent, inside the same locked transaction and yearly counter. The cover hides an
empty Team line; the web download revokes its Blob URL after 60 seconds. Fresh isolated API
container proof: `docs/report-template/r6-fresh-container-download.pdf` (real number
`MFE/SR/2026/0001`, no empty Team label). The disposable database had zero unnumbered closed jobs
at the time of this download; the migration test later created one intentional historical NULL
fixture to verify replay, and the final disposable-database count was zero after subsequent suites
reset the schema. API/web typechecks and builds, focused completion/service-visit/report suites,
the standard historical/V6/V7 gates, and all directly affected integration fixtures passed with
zero skips. The already-present duplicate FM200 cover-list labels remain a P2 outside R6's
approved-layout scope. Sol's Windows CRLF snapshot failure is fixed by normalizing both sides of
the assertion; the completion-year integration assertion now handles a new annual counter. Both
affected suites pass with zero skips. The latest isolated numbering test left one intentional
historical closed NULL fixture in its disposable database, which was removed with that container.

**Last updated:** 2026-09-24 — **Report R5 person names and cover fixes completed (uncommitted).**
Migration 032 adds nullable `users.display_name` without backfill. Manager Technician List and
`ADMIN_DISPLAY_NAME` in the admin CLI can set names. New completions freeze the resolved name
(display name, otherwise username) for the closer and visit creator; the frozen team is still only
the visit creator, not a crew assignment. Historical closed snapshots remain untouched. Reports
now omit absent report-number labels, derive Issued from completion date, and join optional phone/
fax and arrival/departure values only when both exist. API/web typechecks and builds, focused and
historical suites, migration replay, closed-PDF text immutability, V6/V7 integration, and a fresh
isolated-container authenticated PDF download passed with zero skips. The download is
`docs/report-template/r5-person-name-generated.pdf` (cover/signature text contains Alice Tan).
Sol's R5 P1 name-clearing mismatch is fixed: the web API accepts a successful `null` response, and
the manager browser suite now covers clearing a saved name and waits for the PUT response, refreshed
GET, and settled loading state (3 passed, 0 skipped). Its create mock also includes the nullable
name field. The cold standard-gate block in `.agents/skills/codex-task-brief/SKILL.md` now starts
disposable `phase6_seed_integration`, uses matching test URLs, waits for readiness, and runs the
V6/V7 integration files in separate processes. Its cold database sequence was rerun on 2026-09-24:
11 integration tests passed, zero failed, zero skipped; the disposable container was removed.

**Last updated:** 2026-09-23 — **Report R4 cover-field implementation completed (uncommitted).**
Migration 031 adds nullable customer fax/contract/frequency, site address, immutable job report
number/team snapshots, and a per-year concurrency-safe counter without backfilling history.
Service-visit creation freezes customer/site cover values; completion allocates the report number
once and freezes the existing creator assignment as the current technician team. Final reports use
only those frozen values. Manager and technician customer-create flows now collect the four fields,
and the Manager customer page edits customer cover details and per-site addresses. Focused unit,
integration, concurrency, migration-replay, frozen-PDF, typecheck, build, historical, V6 and V7
gates are green with zero skips where run; live rebuilt-container download proof remains to be
recorded below before final acceptance.

**Last updated:** 2026-09-19 — **Known issue closed: `Test-ManagerScheduling.ps1` no longer fails without `REPORT_CHROMIUM_PATH` or hangs with it (uncommitted; one test script only).**
Only `scripts/Test-ManagerScheduling.ps1` changed. The fixes mirror `scripts/Test-V7LiveBrowser.ps1`:
(1) When `REPORT_CHROMIUM_PATH` is unset, it is resolved from Playwright's `chromium.executablePath()`
(run from apps/web) and checked with `Test-Path`. The run throws if Chromium is missing. A value that
is already set is kept, and `finally` restores the original value.
(2) The two report-rendering `node --test` lines (manager/customer/final-report and the sync
integration set) now load `--import ./src/reports/pdf/testLifecycle.ts`, but only when that file
exists. The PDF engine then closes, and node exits.
(3) Native calls go through `Invoke-Native`, which uses a function-local `$ErrorActionPreference =
'Continue'`. `Invoke-Checked` first sets `$global:LASTEXITCODE = -1`, and `$LASTEXITCODE` stays the
only pass/fail authority. Non-native cmdlets still run under 'Stop'.
The tests, their order, the container, the finally cleanup and the protected-file diff against `e30c649` are unchanged.
**Proof (cold, PS 5.1, each run under a hard timeout):** every case exited 0 and each phase ran with 0 skipped:
historical-matrix 20, v6-evidence 9, wet-chemical-definition 2, v7EvidenceContracts+env 12,
manager/customer/report 109, sync integration 11 (**163 backend**), v7-stale-evidence 1,
job-progress 8, and Playwright **34 passed / 0 failed**. The cases were: `-File` with the variable
unset (378 s), `-File` with it preset (329 s), `-File *>&1` (344 s), in-process `*>&1` with it unset
(399 s; no terminating error, working directory restored, variable restored to unset), and in-process
with it preset (342 s; preset kept). No container and no listener on 55432/4175 were left behind.
The web `npm run build` step (unchanged) leaves one `%TEMP%\<hash>\sw.js` directory per run, from
VitePWA/workbox `generateSW`. HEAD has the same leak, and it was cleaned up by hand.
**Negative controls (scratch copies outside the repo, removed afterwards):** a missing `npx` exits 1.
Removing the lifecycle import reproduces the hang: every test in the report line passes, but node
never exits, so the run was killed at the 600 s timeout. A lone missing `node --test` path exits 1.
**Noted, not fixed:** Node 24 `--test` treats its paths as globs and silently drops a path that
matches nothing when another path in the same command does match. A missing file inside either
multi-file line therefore still exits 0 (109 -> 87 tests, not flagged). The original script had the
same gap. Guarding against it needs a per-path existence check, which is outside this task's scope.

**Last updated:** 2026-09-23 — **Report R2 shutdown re-review findings closed (uncommitted).**
Graceful shutdown now attempts HTTP, Chromium and PostgreSQL cleanup sequentially even when an
earlier step fails. It collects all failures, logs once after every step has been attempted, and
sets a non-zero process exit code. Direct regressions independently emit SIGTERM and SIGINT and
wait for injected cleanup completion without calling the returned shutdown function; a separate
test proves repeated signals remain idempotent, and fault injection proves all cleanup steps run.
The focused suite passes 4/4. The full cold `Test-ReportR2.ps1` gate passes **107 API tests +
1 web regression, 0 failed, 0 skipped**, including API/web typechecks and builds.

**Last updated:** 2026-09-23 — **Report R2 continuation-title Sol findings closed (uncommitted).**
The blocking continuation-title defect is fixed. Each system now has an opaque opening-title overlay
without a suffix and an underlying repeated table header with the approved `(continued)` suffix;
Chromium exposes that repeated header only on visually continued pages. The generated sample shows
the marker on pages 4, 6 and 8, and the rebuilt live V7 report shows it on pages 4, 5, 7 and 9.
The fixture pagination assertion is exact at nine pages instead of accepting 8–10. The long-report
regression proves the opening/repeated header structure, the continued wording on overflow pages,
the repeated register header and the final row. `serverShutdown.ts` now owns the production
SIGTERM/SIGINT registration, and two direct tests prove both signals share one ordered HTTP →
Chromium → PostgreSQL shutdown and that failures set a non-zero exit code.
`scripts/Test-ReportR2.ps1` now includes this shutdown suite. Its cold disposable-PostgreSQL run
passed **105 API tests + 1 web regression, 0 failed, 0 skipped**, with API/web typechecks and builds.
The rebuilt container excludes `/app/docs` and renders nine pages with destinations 3/5/7/9,
`✓ ✗ ◯` and zero `.notdef`. The refreshed manager download for `SV-20260906-41` returned HTTP 200
as the unchanged filename and is an 11-page, 423,897-byte PDF. Every page of both regenerated PDFs
was rendered and visually checked; opening pages have no visible suffix and overflow pages do.

**Last updated:** 2026-09-25 — **`claude/autopilot` merged into `phase-8e-client-demo-polish`.**
Brings T1–T6 (per-service editor UI polish, Wet Chemical parser hardening, remembered Manager choice,
Supervisor role, append-only corrections to accepted V7 records, T6 report-approval design) together
with this branch's FM200 system, manager UI navigation split, and soft-archive/retirement work. See the
`claude/autopilot` entries immediately below for that branch's own history up to the merge.

**Last updated:** 2026-09-28 — **Report approval workflow cherry-picked from `claude/autopilot`'s T6 (migration renumbered 033 → 045).**
Append-only `report_approvals` table with a single derived-state helper every route reads;
`POST/GET /manager/service-visits/:jobId/report-approval` (admin+supervisor, withdraw admin-only); both
PDF routes refuse `409 REPORT_NOT_APPROVED` until approved; a correction after approval reverts to
awaiting approval; technicians see a read-only chip; `ManagerOperations.tsx`'s richer supervisor/filter/
delete-visit view kept, with the approval chip woven in.

**Last updated:** 2026-09-27 — **Branch `claude/autopilot`: T14 technician job soft-delete
landed (committed on the branch, not merged).**
A technician can now delete their own still-open (not yet submitted) job; soft delete via
`inspection_jobs.archived_at`, never a hard delete. This branch forked before that column
existed on the main tree, so it needed its own migration (034, a byte-for-byte port of the main
tree's proven 036) rather than reusing one, and there is not yet an admin-facing screen on this
branch to view/restore an archived job (the row is fully recoverable, just not exposed in any UI
here yet) — see `docs/autopilot/BACKLOG.md` T14 for the full detail and gate/review/revert-proof
counts. Also: T15 (auto-recurring due dates) is next and is DESIGN FIRST, not started; T16
(email reminder) stays BLOCKED on the owner creating an email-provider account.

**Last updated:** 2026-09-27 — **Branch `claude/autopilot`: T13 search boxes landed; T6 committed
retroactively (committed on the branch, not merged).**
T6 (report approval) had been fully implemented/reviewed/gated in an earlier session but never
committed — verified clean and committed as-is. T13 adds a client-side, case-insensitive search
filter to Customer Configuration, Technician List and Upcoming Service (owner request
2026-09-26; the fourth screen in the original ask, Add Customer's system picker, turned out to be
a small fixed checklist, not a searchable list, so it got no search box). Along the way, found
and fixed a real regression the new search `<input>` caused in
`manager-app-auth-transitions.html`'s hardcoded 5-input assumption for the Add-Customer form (see
`docs/autopilot/BACKLOG.md` T13 for the root-cause and fix detail, gate/review/revert-proof
counts). Backlog also gained T14 (technician soft-deletes an own in-progress job — no new
migration, reuses `inspection_jobs.archived_at`), T15 (auto-recurring due dates — DESIGN FIRST,
not started), and T16 (email reminder the day before a service — BLOCKED on the owner creating an
email-provider account; see that entry for what to prepare).

**Last updated:** 2026-09-23 — **Branch `claude/autopilot`: T6 report approval landed (committed on the
branch, not merged).**
Append-only `report_approvals` (migration 033 on that branch) with a single derived-state helper every
route reads; `POST/GET /manager/service-visits/:jobId/report-approval` (admin+supervisor, withdraw
admin-only); both PDF routes refuse `409 REPORT_NOT_APPROVED` until approved (composes with T5a's
corrections gate); a correction after approval reverts to awaiting approval; technicians see a read-only
chip. See `docs/autopilot/BACKLOG.md` T6 for gate/review/revert-proof detail. Also open: T5d (corrections
panel vs inline effective values).

**Last updated:** 2026-09-21 — **Branch `claude/autopilot`: T5c landed — supervisors read accepted records and evidence; corrections show on Accepted Detail (committed on the branch, not merged).**
Read-only widening only (`requireReviewerOrOwnership`); technicians still see their own records and now
their corrections. OPEN OWNER DECISION T5d: corrections are a panel above the record, not the inline
effective value + badge of design §3.4. Details: `docs/autopilot/BACKLOG.md` T5c/T5d.

**Last updated:** 2026-09-21 — **Branch `claude/autopilot`: T5b Manager correction screens landed (committed on the branch, not merged).**
Visit detail lists accepted records → correction screen (required reason, unsaved-changes guard, original
always shown); Final Report lists corrections and withholds the PDF until they are rendered. Next: T5c
(supervisor accepted-detail + evidence reads, corrections on Accepted Detail).
Details: `docs/autopilot/BACKLOG.md` T5b.

**Last updated:** 2026-09-20 — **Branch `claude/autopilot`: T5a corrections API landed (committed on the branch, not merged).**
Append-only `inspection_corrections` (migration 032 — needs running on the client DB at deploy); accepted
records are never written; supervisors/admins correct V7 records of 8 systems through
`/manager/inspections/:clientUuid/corrections`; PDF download is refused (409) for a corrected visit until
the PDF work renders corrections. Next: T5b (Manager correction screen), T5c (accepted detail).
Details: `docs/autopilot/BACKLOG.md` T5a, `docs/autopilot/designs/T5.md` §8b.

**Last updated:** 2026-09-20 — **Branch `claude/autopilot`: T5 corrections design written — waiting for owner approval.**
`docs/autopilot/designs/T5.md`: append-only `inspection_corrections` (migration 032) pointing at the
accepted form instance; effective value = accepted value + latest correction; accepted rows never
written; report/PDF integration handed to the PDF work as a view-model proposal. Six owner questions (§9).

**Last updated:** 2026-09-20 — **Branch `claude/autopilot`: T4 supervisor role implemented (committed on the branch, not merged).**
Review-only Manager access for `supervisor` (migration 031 — must run on the client DB at deploy),
created by an admin from the technician form; accepted-detail/evidence reads deferred to T5 (owner).
Details: `docs/autopilot/BACKLOG.md` T4, `docs/autopilot/designs/T4.md` §9.

**Last updated:** 2026-09-19 — **Branch `claude/autopilot`: T4 Supervisor role design written (approved 2026-09-20).**
`docs/autopilot/designs/T4.md`: new `supervisor` role via forward migration 031, explicit per-route
`requireRole` lists (no hierarchy), review-only Manager screens, admin creates supervisors from the
technician form, audit via `audit_events`. Three owner questions in its §8.

**Last updated:** 2026-09-19 — **Branch `claude/autopilot`: T3 — a reload keeps the Manager choice (committed on the branch, not merged).**
Per tab, for the same verified admin only (`manager-experience:v1`, cleared with the Manager session on
login, logout and identity change; forgotten on every exit to the role chooser). Technician unchanged.
Details: `docs/autopilot/BACKLOG.md` T3.

**Last updated:** 2026-09-19 — **Branch `claude/autopilot`: T2 landed the Wet Chemical accepted-detail parser and live-spec gating (committed on the branch, not merged).**
Parser takes the shared suppression detail shape (V4 good/poor, V5/V6 as V4, V7 4-state); live specs
run only with `PLAYWRIGHT_LIVE=1`; `Test-ManagerScheduling.ps1` is the main-tree version plus this
branch's tests. Details: `docs/autopilot/BACKLOG.md` T2.

**Last updated:** 2026-09-19 — **Branch `claude/autopilot`: T1b landed the UI token system / polish (committed on the branch, not merged).**
Main-tree `app.css` token refactor + post-login route keep (`landingHash`, `App.tsx`), with fixes: focus
outline restored (main-tree copy had a self-referential `--focus-outline`), `--muted-on-sunken` for AA
contrast on sunken backgrounds, 560 px stacking breakpoint kept. Final Report card region verified
pixel-identical. Details: `docs/autopilot/BACKLOG.md` T1b.

**Last updated:** 2026-09-19 — **Branch `claude/autopilot`: T1 landed the Manager per-service editor (committed on the branch, not merged).**
The editor from the main tree (see "Manager form-shaped per-service editor" below) is now committed on
`claude/autopilot`, with two review fixes: text typed into an open wording editor counts as unsaved
(Back, browser Back and reload ask first), and Sign out asks before discarding unsaved wording
(`confirmManagerLeave`, `managerLeaveGuard.ts`). `app.css` only gained the tokens the editor uses; the
main tree's full token refactor and the post-login `landingHash` change are backlog T1b.
Status per task: `docs/autopilot/BACKLOG.md`.

**Last updated:** 2026-09-19 — **V7 live-spec test hardening (uncommitted; tests + one test script only).**
**Wet Chemical checklist.** `tests/wet-chemical-v7-live-accepted-detail.spec.ts` now asserts the full
paragraph with `toHaveText`, as CO2 does: `"Battery: Good"`, `"Charger: No Need Checking / N.A."`,
`"Main Supply: Not Good — Runtime Wet Chemical Poor A"`. The Wet Chemical view separates the remark
with an **em dash** (`ServerWetChemicalView.tsx:7`); CO2 uses ` - ` (`ServerCo2View.tsx:31`). The
result text comes from `ServerWetChemicalView.tsx:5` and the labels from `:6`.
**Detector rows (both live specs).** The detector assertions are now scoped to their row
(`article.hose-row-card` holding the exact text `Row n`). The label is anchored with a regex
(`/^Heat Detector:/`), each value is checked in full with `toHaveText` (for example
`"Heat Detector: Normal, Test"`), and there must be exactly 2 rows. The old Wet Chemical locator
`hasText: "Heat Detector:"` matched 4 paragraphs, including "Second Heat Detector".
**Mutation proof.** A scratch copy outside the repo intercepted the real accepted-detail response.
Wet Chemical Battery set to `not_good` fails with `Received: "Battery: Not Good"`. Each of the
8 detector mutations (4 per system) fails at its own assertion. The unmutated control passes. The
old assertions pass on the same mutated state.
**Stale fixtures deleted.** `tests/wet-chemical-accepted-detail.html` and
`tests/wet-chemical-authority-d1.html` had no references in tests/, src/, scripts/ or
playwright.config.ts. Only the first used the `evidencePolicy*` shape; `authority-d1` was an
orphan authority harness that no test loaded.
**`scripts/Test-V7LiveBrowser.ps1`.** Native npx/node/docker calls now run through
`Invoke-Native`, which sets a function-local `$ErrorActionPreference = 'Continue'`. Before this, a
PS 5.1 in-process `*>&1` run threw on node's NO_COLOR stderr warning even when the run was green
(reproduced with the pre-fix copy). `$LASTEXITCODE` and the Playwright JSON stats are still the
only pass/fail authority. The gate exits 0 when run with `-File`, with `-File *>&1`, and in-process
with `*>&1`. `-RevertProofBogusPhoto` still exits 1.

**Last updated:** 2026-09-19 — **Wet Chemical V7 accepted detail fixed (P1 closed); CO2 live-spec result assertions tightened (P2 closed) (uncommitted; web only).**
**Root cause, from the real route response.** A real `GET /wet-chemical-inspections/:id`, captured
from a seeded disposable Postgres (55432), returns the shared suppression key set (the same as
CO2): `clientUuid, serverFormInstanceId, jobId, jobReference, jobTitle, customerName, systemKey,
systemLabel, instanceKey, zoneId, locationId, displaySequence, status, performedAt, receivedAt,
template, configuration, responses, displayControls, deviceReportedCreatorUsername,
verifiedOriginalCreatorUsername, syncedByUsername`. It has no `evidencePolicy*` keys. At HEAD the
parser did not reject this key set: `normaliseDedicatedDetail` removed the five new keys
**without checking them** and added null `evidencePolicy*` values. The failing check was the V7
**4-state results** (`not_good` / `na`): the parser only allowed `good` / `poor` / `not_relevant`.
The HEAD parser returns `undefined` for the captured payload; the fixed parser parses it.
**Fix (`apps/web/src/wetChemical/serverWetChemicalApi.ts`, web only; API unchanged).** The parser
now requires exactly the CO2 key set and checks it the same way as `parseServerCo2Detail`: uuid
formats, `instanceKey === location:${locationId}`, zoneId null or uuid, displaySequence a safe
integer ≥1, template exact `{id, code: "MFE-FSSR", version}`, configuration exact
`{revisionId, revisionNumber}`, 6-digit-microsecond timestamps, and creator usernames null or
text. One extra check: the frozen `displayControls.source.templateVersion` must match what the server
freezes for `template.version` (7 for V7, otherwise 4), and `template.version` must be at least 4.
**V5/V6 fix (Sol P1):** V5 and V6 carry the V4 Wet Chemical definition, so the server freezes
source version 4 for them (`co2DefinitionControls.ts:97`); the earlier strict-equality check rejected
those real details and now uses that mapping instead.
The shim and the `evidencePolicy*` checks are removed; the view never read them, and accepted V7
evidence still comes from `loadV7AcceptedEvidence`. The V4 good/poor and V7 4-state paths are
kept, and Normal/Test/Isolation is unchanged (these came from the concurrent session's uncommitted edit).
Unknown, missing or malformed input still returns `undefined`. The `ServerWetChemicalDetail` type
and the view are unchanged. **V4:** the same parser serves V4. The V4 fixture renders
identically to HEAD (2365 = 2365 characters, i.e. UTF-16 string length, in Asia/Kuala_Lumpur;
2364 in UTC; parsed detail deep-equal). Byte counts depend on the timezone: 2382 bytes in
Asia/Kuala_Lumpur, 2381 in UTC. V5/V6 re-stamps of the V4 fixture give the same detail and markup.
**Tests.** New `tests/wetChemicalAcceptedDetailParser.test.ts` (`npm run test:wet-chemical-accepted-detail`,
6/6) over `tests/wetChemicalAcceptedDetailPayloads.json`: the real WC V7 and CO2 V7 route payloads,
plus a V4 payload built with the API resolver and validator. Cases: V7 parses; V4 parses and
renders read-only; V5 and V6 re-stamps parse and render the same as V4; the version mapping is
enforced (V7 controls with version 4/5/6, V4 controls with version 7, and version 3 are rejected); 22
rejections on both V7 and V4, 44 in total (including evidencePolicyId, the legacy evidencePolicy*
shape, extra key, missing zoneId, bad instanceKey, non-uuid locationId, wrong systemKey, and now
non-uuid template id, an extra configuration key and revisionNumber 0); CO2 and Wet Chemical each rejected by the other's parser. Against the HEAD parser the
test fails 3 of 6 (a, b3, c).
**P2 closed.** In `tests/co2-v7-live-accepted-detail.spec.ts` the four result assertions changed from
`toContainText(<result>)` to a full-text `toHaveText` of the label paragraph, for example
`"Main Supply: Not Good - Runtime CO2 Browser Poor A"` and `"Charger: No Need Checking / N.A."`.
The result is now fixed between the label and the ` - ` remark separator, so the remark can no
longer satisfy it. Labels come from `co2DefinitionControls.ts:32` (V7 values from
`masterServiceReportV7.ts:4`). Nothing else in the spec changed. The label change to "Not Good" /
"No Need Checking / N.A." and the uncommitted edit to `tests/wet-chemical-v7-live-accepted-detail.spec.ts`
come from the concurrent session and were kept as they were.
**Gates.** `.\scripts\Test-V7LiveBrowser.ps1` exit 0: CO2 and Wet Chemical each expected=1,
unexpected=0, skipped=0. Web: typecheck and build pass; Playwright 73 passed / 0 failed / 0 skipped;
17 tsx scripts, 153 pass (147 + 6), 0 fail, 0 skip. API (the report tests need `REPORT_CHROMIUM_PATH` set to
Playwright's `chromium.executablePath()`): typecheck, build, historical-matrix 20/20, v6-evidence 9/9,
wet-chemical-definition 2/2, v7EvidenceContracts+env 12/12, v6-integration 1/1, and the V7
integration set (co2V7, wetChemicalV7, fireAlarmV7, v7EvidenceRace) 10/10 from cold on 55432, run with
`--import ./src/reports/pdf/testLifecycle.ts`.
**Noted, not fixed:** `tests/wet-chemical-accepted-detail.html` / `wet-chemical-authority-d1.html`
still use the old `evidencePolicy*` shape, but no spec loads them.

**Last updated:** 2026-09-22 — **Report R2: approved HTML report renderer wired to Generate report (uncommitted).**
`renderFinalServiceReportPdf` now builds `ReportViewModel`, renders HTML twice through Chromium,
resolves named system destinations after pass one, and fills the Summary PAGE column in pass two.
The approved cover, summary, structured block tables, remarks, parts, comments, accepted photos,
inspection strip, repeated system title/table headers, and footer counters are rendered from cached
assets with one HTML-escaping boundary plus CSS-string escaping for customer/report margin boxes.
Summary Main Finding is reusable view-model data (worst result, definition order, `(+N more)`).
`REPORT_RENDERER=legacy` retains PDFKit for one release; HTML is the default. The API closes the
shared PDF engine on SIGTERM/SIGINT. The final image excludes `/app/docs`; its network-isolated
sample proof is 9 pages, system destinations 3/5/7/9, `✓ ✗ ◯` present, zero `.notdef`.
The cold R2 gate (`scripts/Test-ReportR2.ps1`) passed API/web builds, all named report/engine/model,
historical and disposable-Postgres gates with zero skips. Generated sample:
`docs/report-template/generated-sample.pdf`. **Live browser proof:** after manager sign-in, the
completed V7 visit `SV-20260906-41` (5/5 systems) returned HTTP 200 from the Manager PDF route with
`Content-Disposition: attachment; filename="Service-Report_SV-20260906-41_2026-09-06.pdf"`.
The exact 417,365-byte response is `docs/report-template/generated-live-download.pdf`: Chromium/Skia,
11 landscape A4 pages, no encryption or JavaScript. All 11 pages were rendered and visually checked;
the cover, linked page numbers (3/6/8/10/11), repeated system headers, V7 four-state symbols and words,
accepted evidence, remarks/parts, final inspection strips and end marker are present without clipping.

**Previously (2026-09-19): Manager form-shaped per-service editor (uncommitted).**
The customer page's flat "Per-service settings" block is replaced by a **Services** area with one
card per service. Each card shows chips for custom label count, preset rows and settings state.
Enabled services are listed, plus any location-dependent service (CO2 / Wet Chemical) that is not
assigned yet. Clicking a card opens `#/manager-customer/<id>/service/<systemKey>`
(`apps/web/src/manager/ManagerServiceEditor.tsx`), which has a "Back to <customer>" button and
accessible tabs (arrow/Home/End keys; the tab is remembered per customer+service in
sessionStorage `manager-service-tab:*`, cleared with the other Manager keys). Only the tabs that
apply are shown. **Form wording** is a disabled replica of the technician form: fieldsets with
section headings, 4-state result buttons, measurement inputs with units, text boxes, and one
sample row for repeatable tables. It is built from the label-override GET plus the shared
`inspectionControls` components rendered read-only. It never mounts a technician form and never
writes IndexedDB (proven by a spec). Clicking a label (a keyboard-reachable button) opens an
inline editor with the new wording, the default wording, Reset to default, Cancel and Done.
Blank text or the default wording clears the override. Edited fields show "Custom" and "Unsaved"
badges. The tab also has a label search, "Show only custom labels", a sticky save bar
(N unsaved · Discard · Save wording) and "Preview as technician", which hides every edit
affordance. Unsaved wording is guarded on Back, browser Back/hash navigation
(`managerLeaveGuard.ts`, checked in App's `hashchange`) and reload/close. **Preset rows**
(zones & locations) and **Settings** (riser system configuration, sprinkler evidence policy)
mount the existing editors `embedded`: open, loaded on mount, no toggle, and identical load,
save, validation and PUT bodies. Services without wording support show "Wording for this
service can't be customised yet." and no edit controls. Editable systems are still exactly
`labelOverrideSystemKeys` (hose_reel, co2_fire_extinguisher, wet_chemical, automatic_sprinkler).
**Not editable:** hiding, adding, reordering or requiring fields; result options; V7
definitions; evidence rules. Fire Alarm is still excluded (see the API comment). **API
(additive, GET only):** `GET …/label-overrides` appends `formLayout: { sections: [{ key,
heading, repeatable: { rowHeading } | null, fields: [{ path, control, parentPath, result,
unit, remarks }] }] }` (`apps/api/src/inspections/labelOverrideFormLayout.ts`). `labels` and
`overrides` are byte-identical, proven by a route unit test and a real-Postgres integration
assertion. PUT, path grammar, validation, versioning, forward-copy and job freeze are
unchanged. The web client validates `formLayout` against `labels` and fails closed; if the
layout is absent it falls back to grouped plain fields. The legacy flat
`ManagerCustomerLabelOverrides` editor has been removed. `tests/manager-label-overrides.html`
now drives the Form wording tab and keeps all 40 of its earlier guard checks, plus 4 new ones
(the spec pins exactly 44). The collapsible wrappers for settings and locations stay exported
for their harnesses. **Tests:** new `tests/manager-service-editor.spec.ts` (8 tests;
fixture `managerServiceEditorFixture.ts` uses the real API resolvers). Full Playwright run:
**73 passed, 0 failed, 0 skipped** (65 before). The layout checks in
`manager-customer-configuration.html/.spec.ts` were updated to the cards; its Assigned
Services checks are unchanged. API: `labelOverrideFormLayout.test.ts` 11/11,
`managerCustomers.test.ts` 7/7, `managerLabelOverrides.integration.test.ts` 3/3 on
disposable Postgres. `Test-ManagerScheduling.ps1` hits the R3 known issue below (fails
without `REPORT_CHROMIUM_PATH`, hangs with it). A scratch copy that only adds the
`testLifecycle.ts` import to its two `node --test` lines passed end to end (exit 0).

**Last updated:** 2026-09-19 — **Web UI polish pass: one token system, phone tap targets, status shapes (uncommitted; CSS only).**
Only `apps/web/src/styles/app.css` changed. No markup, logic, test, lockfile or dependency changes.
**Tokens.** The two `:root` blocks are now one block at the top. It holds brand, neutral and semantic
success/warning/danger/info colours, a spacing scale (`--space-1..8`), radii, shadows, a focus ring, a
type scale and `--tap: 44px`. Distinct hex values outside `:root` went from 122 to 0; `:root` holds 30.
Nine of them are pinned to their exact old values so the Final Report web view renders unchanged.
Breakpoints are now phone ≤520, tablet-down ≤767, wide ≥1200 (560/700/640/480 folded in; 760 → 768).
**Visible changes.** Secondary buttons, home Refresh / Sync Now and report actions are now 44px.
Sign out keeps its compact look with an invisible 44px hit area. `.danger-command` is now styled.
Every status tone has its own marker shape (ring / dot / half / spinner / diamond / tick), so colour is
never the only signal. Completed job cards get a green accent. The form sync line
(`.inspection-status`) is a toned pill. On phones the four result options form a 2×2 grid of 48px
targets. The Drum Type radios are proper controls and no longer throw off section numbering. Manager
Home, Technicians and Upcoming use the same 1120px column as other screens, with card-style dashboard
tiles and matching heading sizes.
**Fixes.** (1) A 1px horizontal overflow on forms at 375px. (2) A selected result or system option
became white-on-pale when hovered, and after a tap on touch screens (hover now only applies on hover
devices and never over the selected state). (3) A `Â·` mojibake in the read-only banner (now a CSS escape).
(4) Round "Active" badge and stretched "Change customer" button on phone.
**Scope guard.** Sizing rules skip `.final-report` and the Customer configuration / service-history
screens. The Final Report body is pixel-identical at 375 and 1280. The only diffs are the header /
Sign out row and the Download PDF button picking up the primary-button token (`--brand-dark`).
**Evidence.** `C:\Users\kokfu\pwa-ui-pass-2026-09-19\{before,after}\*.png` (375×812 and 1280×800;
`scrollWidth.json` shows 375/1280 on every screen). Gates: typecheck + build pass; Playwright 73/73
(baseline 65/65 before the concurrent `manager-service-editor.spec.ts` added 8); 16 tsx scripts,
147 pass. No phone or installed-PWA test. Dark mode not added.

**Last updated:** 2026-09-19 — **V7 live browser mode for the CO2 / Wet Chemical accepted-detail specs (uncommitted).**
The 2 full-suite failures from the Slice A entry (`*_LIVE_BROWSER_FIXTURE_PATH is required`) are
closed as config failures. `apps/web/playwright.config.ts` now leaves both live specs out of a plain
`npx playwright test` through `testIgnore` (not listed, not skipped). With `PLAYWRIGHT_LIVE=1` they are
collected and the 4175 `webServer` is not started. The live gate is scripted:
`.\scripts\Test-V7LiveBrowser.ps1` (or `npm run test:v7-live-browser` in apps/web). It starts its own
disposable `postgres:16-alpine` on 127.0.0.1:55432 (`phase6_seed_integration`) and refuses to run when
55432/4176/4177/4180 are taken. Then, strictly in this order (each seed drops the schema): seed CO2 →
CO2 spec → seed Wet Chemical → Wet Chemical spec. Each seed is the first test only of
`co2V7.integration.test.ts` / `wetChemicalV7.integration.test.ts` with `*_SEED=1`, because the second
test in each file drops the schema too. Fixtures and uploads go to a temp dir outside the repo and
are checked before use. The real API (4180) and Vite (4177) sit behind `tests/liveReverseProxy.mjs`
(4176 = app + `/api`), with `*_BASE_URL` pointing at 4176. A spec fails the gate on any failure or
skip. The container, child processes and temp dir are always removed, and the environment is restored.
`-RevertProofBogusPhoto` is a negative control.
**Results.** Default suite: 62 passed, 3 failed, 0 skipped of 65 (57 Slice A baseline − 2 live + 10
`manager-technician-services-done`). `--list` gives 73 without and 75 with `PLAYWRIGHT_LIVE=1`, so exactly
the 2 live specs; the extra 8 come from the concurrent, uncommitted `manager-service-editor.spec.ts`.
The 3 failures are not caused by this change. `connectivity-recovery` and `manager-app-auth-transitions`
passed on rerun (load-flaky). `manager-customer-configuration` fails every time against the concurrent,
uncommitted `ManagerCustomerConfiguration.tsx` rewrite. **Live gate findings (the live gate runs end to end; still exits 1):**
(1) **Fixed, Wet Chemical V7 accepted detail:** `parseServerWetChemicalDetail` still checked V7 results
against the old 3-state set. d7ecc0d (4-state model) updated `ServerWetChemicalView` but not
`serverWetChemicalApi.ts`. So every accepted V7 detail showed "Server returned invalid Wet Chemical accepted
detail". V7 now accepts `good/not_good/complete_repair/na` in the controls and responses; V4 stays `good/poor`.
(2) **Fixed, CO2 spec labels:** now "Not Good" / "No Need Checking / N.A.". (3) **Fixed, login redirect race:** `handleLogin` (`App.tsx`) called `navigate({ name: "jobs" })`
after `refreshServerWorkspace`, while "My Service Jobs" was already on screen. So a navigation made in
that ~300 ms window was sent back to the job list; the CO2 spec lost the detail page before photoB. It now
redirects only if the hash has not changed since the list rendered. The 7 login/routing specs pass (19 tests).
**Now:** the CO2 live spec passes (expected=1, 0 unexpected, 0 skipped). With `-RevertProofBogusPhoto`, it fails
at the bogus photoA link (spec line 15) and nothing is left behind. (4) **Fixed, Wet Chemical spec labels:** now "Not Good", "No Need Checking / N.A.", "Normal" and "Test".
**Live gate green:** a cold `.\scripts\Test-V7LiveBrowser.ps1` exits 0. Both seeds pass (CO2 2/0/0, Wet Chemical 1/0/0),
and both live specs show expected=1, unexpected=0, skipped=0. No container, ports, processes or temp dir are left. **Known issue:** since R3, `Test-ManagerScheduling.ps1`
fails at `test:historical-matrix` when `REPORT_CHROMIUM_PATH` is unset. With it set, the focused API
`node --test` run hangs because the PDF engine never closes (no `testLifecycle.ts` import).

**Last updated:** 2026-09-18 — **Report R3: standalone Chromium PDF engine (uncommitted; not wired to reports).**
`apps/api/src/reports/pdf/` provides queued HTML rendering, embedded fonts, and named-destination
page resolution. Real Chromium proves three anchors resolve to pages 1/2/3; the approved sample
prints exactly nine pages locally and inside the rebuilt Alpine image as `node`, with network off.
Eight engine tests plus the task-brief API/web and disposable-Postgres gates pass, without skips.
See `apps/api/src/reports/pdf/README.md` for evidence, image sizes, limits, and reproduction.
V7 remains `good / not_good / complete_repair / na`; legacy V1–V6 remain unchanged.

**Previously (2026-09-18): Report R1: structured report view model (uncommitted, no visual change).**
`apps/api/src/reports/reportViewModel.ts` `buildReportViewModel(report)` builds company / cover /
summary / per-system pages. Each page's blocks (checklist, units, register with N/T/I, quantity,
comments) come from the frozen V7 definition + accepted response + frozen label overrides. Pre-V7
records fall back to one checklist block. `loadFinalServiceReport` now attaches each section's raw
snapshot/response as a non-enumerable `source`, so pinned digests and the PDFKit PDF are unchanged.
`reports/assets/company-profile.json` (`"confirmed": false`) is read at startup; a missing or invalid
file gives blanks. Tests: `reportViewModel.test.ts`. Next: R2 HTML renderer (docs/report-template/README.md §6).

**Previously (2026-09-18):** **Slice B P2 remediation (uncommitted, on top of da93bdb).**
A stored Back target now applies only to the visit it was set for. A deep link or a different
job goes Back to Operations. Stale Load more pages are dropped after a filter or technician change
or unmount. Logout and every credential login (before the first verified render; round 2) clear
every Manager session key. Round 3 adds a per-tab owner stamp (`manager-session-owner:v1`, sessionStorage).
Every verified reconcile (reload restore, cross-tab `inspection-auth-change`) and every login claims it
before the verified render. A different user clears the Manager keys; the same manager keeps them across a
reload. Technician keys, IndexedDB, outbox and drafts are untouched. The API drops the `creator.id::int` cast, so a
creator id above int4 no longer returns 500; `technician.id` is still a JSON number. Cold gate exit **0**:
**161 backend, 1 stale-evidence, 8 job-progress, 34 Playwright (26 + 8); zero skips**. All seven revert
proofs FAIL as intended: (d) removes the login clear and the claim; (d2') removes only the login clear and
fails the new same-manager re-login test (d2). Not in scope: `technician` shows an admin creator's username.

Previous entry, 2026-09-18: **Slice B (manager technician view + customer-first Services
Done) implemented.** Admin list gains `technicianId` filter and per-item
`technician` (null for legacy NULL-creator visits); Technician detail screen with In Progress /
Completed tabs; Services Done searches a customer first, then groups that customer's visits by
site with date/status/technician filters remembered for the session. No migration. Cold
`.\scripts\Test-ManagerScheduling.ps1` exit **0**: **161 backend, 1 stale-evidence,
8 job-progress, 26 Playwright; zero skips**. Revert proof (predicate removed, scratch copy
outside repo): filter test FAILS. Details: [validation note](docs/manager-scheduling-validation.md).

Previous entry, 2026-09-18: **Slice A Sol findings remediated; full-suite baseline
failures explicitly retained.** PFE resolves its table inside each function after login;
the scan of 169 web source files found no other eager module-level database capture.
The three ownership-aware API fixtures and per-user connectivity fixture now run in the
focused gate. Multipart preflight rejects oversized Content-Length before reading, and
legacy attachments retain HTTP 413. New regressions cover PFE Save Draft/Submit/Edit
Failed/sync, header-only and chunked oversize requests, mixed owned/foreign batches
without partial writes, and admin reaching uploader-mismatch 409.

**Upgrade precondition:** sync every device/browser profile online before deploying;
postpone deployment if work remains unsynced. After upgrading, each technician must
sign in and refresh online once. An offline first launch may show an empty new workspace:
legacy work is preserved but cannot be attributed until the server confirms ownership.
Work on jobs the technician did not create, NULL-creator jobs and unattributable jobs
stays quarantined. Do not clear browser storage. Resolve it before upgrade or arrange
authorized recovery afterward; see [deployment runbook](docs/architecture/06-deployment-runbook.md).

Cold `cd C:\PWA_OfflineRecordWebApp ; .\scripts\Test-ManagerScheduling.ps1` exited **0**:
**158 backend tests, 1 stale-evidence test, 8 job-progress tests, 24 Playwright tests;
zero skips**. Port 55432 was free; the script created and removed its own disposable
`/phase6_seed_integration` database. API/web typechecks and builds passed.

| Remediation DoD / standard gate | Result |
|---|---|
| P0 PFE dynamic database lookup and complete authenticated workflow | PASS — new mounted-App browser test |
| Search remaining web module-level database captures | PASS — no other captures found |
| P1 three route fixtures, connectivity fixture and focused-list additions | PASS — 6 route tests + 10 connectivity browser scenarios |
| P1 deployment precondition, offline-first-launch and non-owned legacy quarantine | PASS — runbook and this entry |
| P2 Content-Length before body, oversized attachment 413 | PASS — header-only and chunked HTTP regressions |
| Mixed owned/foreign batch in both orders; valid owned item succeeds alone | PASS — no partial writes |
| Admin still reaches immutable uploader-mismatch 409 | PASS — real staged evidence replay |
| Historical matrix / V6 evidence / Wet Chemical definition | PASS — 20 / 9 / 2 tests |
| V7 contracts and environment / focused API set / V6-V7 integrations | PASS — 11 / 105 / 11 tests |
| API/web typechecks and builds | PASS |
| Web stale-evidence / job progress / focused Playwright | PASS — 1 / 8 / 24 tests |
| Full Playwright suite | FAIL — 55 passed, 2 failed, 0 skipped; same two failures at a760ae1 |
| Baseline comparison outside repo | PASS — a760ae1: 51 passed, 2 failed, 0 skipped |
| Historical/protected files vs e30c649; migrations and serviceVisits.ts unchanged | PASS |
| git status --short and git diff --check | PASS — protected paths clean, no whitespace errors |

The full-suite failures are `co2-v7-live-accepted-detail.spec.ts` requiring
`CO2_V7_LIVE_BROWSER_FIXTURE_PATH` and `wet-chemical-v7-live-accepted-detail.spec.ts`
requiring `WET_CHEMICAL_V7_LIVE_BROWSER_FIXTURE_PATH`. Both fail identically in the
external a760ae1 archive; neither is counted as a pass. Live browser acceptance remains
unverified without those fixtures. No unrelated baseline failure was changed.

**Sol re-review P2 follow-ups (2026-09-18), fixed in the working tree:**
1. `POST /sync` returned a batch-wide 404 for unsupported entity types. Only job-bound types
   (`inspection`, `masterSystemInspection`, `masterSystemFormInstance`) are ownership-checked now;
   unsupported types get their per-item `VALIDATION_ERROR` again. A batch that contains a foreign
   job item still gets a whole-batch 404 with nothing written (intentional; no partial writes).
2. The sync engine skipped its identity check when no user id was passed. It now binds to the
   device's signed-in identity and refuses to sync a user workspace that belongs to someone else.
3. Cross-tab session race: sync and every upload send `X-Expected-User-Id`. `POST /sync`,
   `/v6-evidence/stage`, `/v7-evidence/stage` and `/inspection-attachments` return
   409 `IDENTITY_MISMATCH` (audited) when the session belongs to a different user. The client
   keeps the work and retries it after the owner signs back in.
4. Legacy rows copied while `Syncing`/`Uploading` are stored as `Failed` (retryable), the same
   state interrupted-sync recovery gives them, so they no longer wait for an app restart.
5. Admin legacy recovery stays off **by design**: an admin's job list includes every
   technician's jobs, so recovering by that list would move other technicians' unsynced work into
   the admin workspace. Admin legacy rows stay quarantined (runbook covers pre-upgrade sync).
6. A Completed card opens the job again (accepted details and Final Report button, as before
   Slice A). "View Report" is a separate button and is disabled offline.
Tests: 2 new ownership integration tests (unsupported entity type; identity mismatch on all four
write routes) and the home spec now covers opening a completed job. Not covered by an automated
test: the `Syncing` → `Failed` normalisation during legacy recovery (item 4). The V6 stager's
uploader-mismatch 409 has no admin test (V7 is covered in co2V7.integration.test.ts).
Cold gate after these fixes: PASS, backend 160, web unit 1 + 8, Playwright 24/24, zero skips.
Full Playwright: 55 passed, same 2 live-fixture failures as a760ae1.

**Reported findings remaining: P0 0, P1 0, P2 0.** This supersedes the incorrect
pre-Sol blanket assessment below; two pre-existing full-suite verification failures remain
explicitly open. **SAFE FOR SOL RE-REVIEW: Y; full-suite green: N.** No staging, commits,
migrations, production access or deployment. The existing client-format-request edits
were preserved. Changed files with reasons, baseline failures, verbatim cold output and
final Git checks: [Slice A validation report](docs/technician-ownership-slice-a.md).

**Last updated:** 2026-09-17 — **Slice A: technician ownership and technician home.**
Inspectors now see only jobs they created, including all job/form-bound sync, accepted
detail, report/PDF and evidence routes. Foreign, NULL-creator and missing identities return
the same 404; existing failure audits remain. Admin access and serviceVisits.ts are unchanged.
The technician home has remembered accessible In Progress/Completed tabs, newest-first
cards, progress, service dates, direct report access and a prominent New Service Visit action.

Business data uses separate IndexedDB databases per authenticated user with the existing
schema. Switching identities drains local operations/sync and replaces rendered state;
previous users' unsynced work survives. Legacy records are copied only after the server
confirms job ownership, with atomic copy receipts; originals remain untouched. First recovery
of pre-upgrade data requires an online refresh. Unattributable legacy records remain preserved
and quarantined. Browser coverage uses the real App and IndexedDB with mocked HTTP;
no physical-phone, installed-PWA force-close or deployment claim is made.

Cold command `cd C:\PWA_OfflineRecordWebApp ; .\scripts\Test-ManagerScheduling.ps1`
exited 0 with port 55432 initially free and a fresh disposable
`127.0.0.1:55432/phase6_seed_integration` database. Exact totals: **148 backend tests,
1 stale-evidence test, 8 job-progress tests, 13 Playwright tests; zero skips**.

| Definition of Done | Result / evidence |
|---|---|
| API typecheck and build | PASS |
| Historical matrix | PASS — 20 tests |
| V6 evidence | PASS — 9 tests |
| Wet Chemical definition | PASS — 2 tests |
| V7 contracts and environment | PASS — 11 tests |
| Focused backend integration/regression set | PASS — 96 tests, including 38 ownership tests |
| V6/V7 acceptance and races | PASS — 10 tests |
| Web typecheck and production build | PASS |
| Stale-evidence and job-progress regressions | PASS — 1 + 8 tests |
| Playwright regression set | PASS — 13 tests |
| Every technician route inventoried and tested | PASS — linked report has file:line inventory and sync dispatch coverage |
| A/B/admin/NULL-creator isolation and existing denial audits | PASS — disposable PostgreSQL HTTP integration |
| External scratch revert proof | PASS — removing ownership causes 23 failures / 38 tests, exit 1, zero skips |
| Home tab counts, keyboard/session behavior, report and 375px overflow | PASS — Playwright |
| Same-browser user switch, hidden foreign work, draft recovery and owner sync | PASS — Playwright; includes suspended-save/logout race |
| Focused script sets | PASS — only the two test file lists changed |
| Historical/protected files against e30c649 | PASS — byte-identical; protected git status clean |
| No migrations; serviceVisits.ts actor/legacy guards unchanged | PASS — baseline a760ae1 comparison |
| V7 four-state model and Normal/Test/Isolation preserved | PASS — no template/control changes |
| Dated handover and exact cold counts | PASS — this entry |
| Final git status and diff --check | PASS — no protected files changed; no whitespace errors |

**Pre-review assessment superseded by Sol:** the previous P0/P1/P2-zero claim was
incorrect. Sol identified a P0 PFE module-load database capture, P1 stale fixtures and
upgrade documentation, and a P2 upload-size regression/coverage gap. The dated
remediation entry records the corrected outcome; the original focused run above did
not establish that the full Playwright suite was green. No staging or commits.
Full route inventory, persistence
design, 27-file change list with reasons, actual revert output and reproducible commands:
[technician-ownership-slice-a.md](docs/technician-ownership-slice-a.md).
The two pre-existing client-format-request documentation edits were preserved.

**Last updated:** 2026-09-17 — **Service-visit idempotent replay now compares the cover
fields.** A retry with the same `requestId` but a different service call number, arrival time
or departure time previously returned idempotent success and silently kept the original values.
Both replay branches in `apps/api/src/jobs/serviceVisits.ts` now select and compare those three
fields (absent/`null`/blank equal; trimmed; `HH:MM`), so any change is the existing 409
`IDEMPOTENCY_MISMATCH`, while an exact retry stays idempotent. No migration, route-shape or web
change. New coverage: 10 unit tests in `serviceVisits.test.ts` (each replay branch: exact retry,
each of the 3 fields changed/dropped/added, absent vs `null` vs blank) and 1 real-PostgreSQL
test in `serviceVisits.integration.test.ts` (including the HTTP 409, no overwrite, and a
concurrent differing first attempt). With the fix reverted in a scratch copy, 6 unit tests and
the new integration test fail. `scripts/Test-ManagerScheduling.ps1` now also runs
`test:job-progress`; a cold run of it exited 0: 110 backend tests (was 99; includes the 10 V6/V7
integration tests), 1 stale-evidence test, 8 job-progress tests, 10 Playwright tests, zero
skips, protected files identical to `e30c649`, `git diff --check` clean. This refreshes the
API gate result the 2026-09-16 entry flagged as stale. No staging or commits.

**Last updated:** 2026-09-16 — **Documented and tested the sprinkler-progress guard Sol
found riding along in the scheduling change; corrected the 029–030 bundling paper trail.**
`deriveAutomaticSprinklerServerProgress` in `apps/web/src/jobs/jobProgress.ts` now carries a
one-line note explaining why a summary cached before the auth/load state was known must not be
trusted for display — the same gate `deriveNoLocalSystemProgress` above it already applied. New
`apps/web/tests/jobProgress.test.ts` pins both functions: 8 tests, 96 assertions across the full
authStatus × serverSummaryState × summary matrix, plus the unchanged `deriveNoLocalSystemProgress`
behaviour so the two siblings' coverage is symmetric. Deleting the guard turns 3 of the 8 red,
confirming the coverage is real and not merely co-passing. Added `test:job-progress` to
`apps/web/package.json`; the test lives in `tests/` rather than `src/` because `apps/web` has no
resolvable `@types/node` and `src` sits inside the tsconfig `include`, so a test there fails
`npm run typecheck`. The 2026-09-13 entry below and `docs/manager-scheduling-validation.md` now
state plainly that the product owner authorized bundling migrations 029–030 into that change,
replacing the vague “on resuming, the owner explicitly chose” framing.

Web typecheck, production build, `test:job-progress` (8 tests), and `test:v7-stale-evidence`
(1 test) pass; protected historical files remain identical to `e30c649`; `git diff --check` clean.
**The API gate set has not been re-run since 2026-09-13** — this pass touched no API file, but it
is carrying a stale result forward and should be treated as unverified until a cold re-run. Working
tree is 19 new and 37 modified files; `docs/manager-scheduling-validation.md`'s “Files changed by
this task” inventory is deliberately left scoped to the original task and does not list this pass's
three files. No staging or commits.

**Last updated:** 2026-09-13 — **Manager dashboard, technician management, and manual
next-service scheduling implemented; combined workspace validation.** Admin-only
technician creation/list/deactivation includes transactional audit and a real
session-invalidation integration proof. Home now links to Technicians, Services,
Customers, Current Services Done, and Next Upcoming Service; due dates are manually
editable and sorted. The product owner authorized bundling the contact-person/phone
(migration 029) and service-visit cover-field (migration 030) work into this change,
including removal of contact email from 028. No staging or commits.

Builds, standard historical/evidence gates, 47 focused backend tests, the 10-test
V6/V7 integration set, and 10 Playwright tests pass. The manual disposable-instance
check confirmed technician status changes, saved date ordering, and closed visits
across Mak Siti and Hokuden. Protected historical files remain identical to `e30c649`.
Full DoD, file inventory, limitations, and final cold-script result are in
[manager-scheduling-validation.md](docs/manager-scheduling-validation.md).
Reproduce automated verification with `scripts/Test-ManagerScheduling.ps1`;
production customer data and deployment configuration were not changed by this task.

**Last updated:** 2026-09-12 — **Security-checklist cleanup pass (closes the two loose ends the
2026-09-12 checklist run flagged) — uncommitted working tree, owner does git.** Removed the dead
`authRequired`/`allowPhase2UnauthenticatedSync` fields from `apps/api/src/config/env.ts` (zero
other references anywhere in `apps/api/src`, confirmed by grep before touching anything — real
enforcement is 100% per-route `requireRole`/`requireAuthenticated`) and the now-pointless
`AUTH_REQUIRED`/`ALLOW_PHASE2_UNAUTHENTICATED_SYNC` entries from `docker-compose.yml`'s api
service (`AUTH_REQUIRED` never existed in `.env.example`; only its
`ALLOW_PHASE2_UNAUTHENTICATED_SYNC` placeholder + misleading comment came out of that file).
Rewrote `apps/api/src/audit/README.md` to describe what audit logging actually
covers (login/logout in `routes/auth.ts`, sync writes in `routes/sync.ts`, every manager
configuration write transaction-scoped in `routes/managerCustomers.ts:497-1026`) instead of
describing it as a future requirement; backup/restore stays correctly un-audited since those
PowerShell scripts run on the host and are never exposed via an API route. Also flipped STEP 3.1
and STEP 3.2 below from `[~]` to `[x]` — every one of their own sub-bullets was already `[x]`, the
top-level marker was just stale. No runtime behavior changed; Postgres/uploads untouched.

**Last updated:** 2026-09-12 — **STEP 4.1 security-checklist pass (real point-by-point run of
`backend-api-security`'s Public Deployment Gate) — one real dependency CVE found and fixed,
`apps/api/package.json`/`package-lock.json` uncommitted, owner does git.** Full results in
`docs/architecture/04-security-and-access.md`'s "Security Checklist Results (2026-09-12)"
section. Every route file was read directly (not sampled) to confirm auth/authz coverage, and
live requests were made against the running Caddy-fronted stack.
* **9 of 12 gate items are real PASSes**, each with live evidence or direct code citation: every
  protected route carries explicit `requireRole`/`requireAuthenticated` (confirmed unauthenticated
  `401` on `/inspection-jobs`, `/sync`, `/manager/customers` live through Caddy); no CORS headers
  are ever set anywhere in the codebase (confirmed live — a cross-origin `Origin` header gets zero
  `Access-Control-*` response headers, so the browser's own same-origin policy is what actually
  blocks it, not a configurable allow-list); Postgres still not public (re-confirmed); destructive
  writes are role-gated and roll back to zero rows on rejection
  (`managerCustomers.integration.test.ts`, re-run, PASS); audit logging covers login/logout/sync
  writes/every manager configuration write, transaction-scoped so the audit row commits or rolls
  back atomically with the change (`routes/managerCustomers.ts:497-1026`); the health check leaks
  nothing; no hardcoded/default credentials exist anywhere in source (`createAdmin.ts` requires
  explicit env vars + a 12-char minimum, no default seeded admin); secrets stay outside Git
  (re-confirmed `.env` untracked, `.env.example` placeholder-only, no sensitive-data logging
  anywhere).
* **2 items are honestly PARTIAL, not silently passed.** HTTPS: the interim Cloudflare tunnel is
  proven end-to-end, but real production HTTPS still needs the client's domain/static
  IP/router — same gap STEP 4.1's checklist line already names, not new. Dependency
  vulnerabilities: found and fixed one real HIGH-severity issue (see below); one moderate issue
  remains, genuinely blocked upstream, documented rather than force-fixed.
* **Real fix — `sharp` HIGH-severity CVE in the untrusted-image-upload path.** `npm audit` on
  `apps/api` found `sharp <0.35.4` (libheif CVEs) sitting directly in
  `attachments/attachmentStorage.ts`'s `normalizeAttachmentImage`, which real-decodes every
  uploaded inspection photo. Fixed: bumped to `0.35.4`, already inside the declared `^0.35.3`
  range (a lockfile-only change — no `package.json` version-range edit needed beyond the bump
  itself). Re-ran `test:v6-evidence` (9/9 PASS, attachment-storage tests included) to confirm no
  regression. Left as a documented, deferred risk: `qs`/`body-parser`/`express` (moderate,
  DoS-class) — the fix requires a `qs` version outside what `express@4.22.2` allows, and the only
  real path is an Express 5 migration, out of scope for a checklist pass. `apps/web`'s flagged
  packages (`postcss`/`nanoid`/`fast-uri`) were traced with `npm ls` to `vite`/`vite-plugin-pwa`
  only — both `devDependencies`, never shipped in the built bundle, not a real exposure.
* **One structural finding, not a vulnerability.** `config/env.ts` computes
  `authRequired`/`allowPhase2UnauthenticatedSync` from env vars, but grepping the whole
  `apps/api/src` tree shows neither is ever read anywhere else — dead config. Not exploitable
  (real enforcement is 100% per-route middleware, confirmed above), but `.env.example`'s comment
  on `ALLOW_PHASE2_UNAUTHENTICATED_SYNC` reads as if it's a live, environment-gated bypass when
  it does nothing in any environment — worth wiring up or removing so it doesn't look like a real
  control that isn't one. `audit/README.md` is also stale (describes audit logging as a "future"
  requirement when it's substantially already built).
* **Runtime untouched.** All testing used a disposable Postgres (`phase6_seed_integration` on
  `127.0.0.1:55432`, torn down after) — never the runtime `inspection_pwa-postgres-1`. No app code
  was changed beyond the one dependency bump.

**Last updated:** 2026-09-12 — **STEP 4.2 close-out, after two Sol review rounds — six real
script defects found and fixed, plus a runbook validation pass corrected twice — commit `a36db33`
covers round 1, round 2 fixes are uncommitted, owner does git.** This closed out with real back-
and-forth: round 1 fixed the original bug + ran the validation checklist; round 2 review found the
round-1 fix for that same bug was itself still bypassable, plus five more real defects elsewhere in
the same backup/restore scripts (not just documentation wording). All are now fixed and
re-reproduced. Full detail lives in `docs/architecture/06-deployment-runbook.md`'s "Second review
round (2026-09-12)" note; summary:
* **`scripts/Restore-Uploads.ps1` live-mount guard — three rounds to close.** (1) Original bug:
  `Resolve-Path`-based comparison silently passed when the live path didn't exist yet on disk.
  (2) Round-1 fix (`GetFullPath` string compare) missed the `\\?\` extended-length path prefix.
  (3) Round-2 review found the real underlying problem: no *lexical* string compare can catch an
  NTFS junction, a `subst`-mapped drive, or an 8.3 short name aliasing the live path — a cold
  junction fixture bypassed the guard. Fixed by resolving both sides to their canonical filesystem
  identity via `GetFinalPathNameByHandle` (walking up to the nearest existing ancestor when the
  destination doesn't exist yet, failing closed if no identity can be established). Reproduced: a
  `\\?\` alias, a `subst` drive, and a real junction are all now refused; staging/relative/empty
  inputs still behave correctly.
* **`scripts/Restore-Database.ps1` — two real defects found by round-2 review, not present in
  round 1.** The forbidden-container block compared only the literal name
  `inspection_pwa-postgres-1`; passing the live container's actual Docker ID (full or abbreviated)
  bypassed it and reached the copy/restore calls — fixed by resolving both sides to canonical
  Docker container IDs before comparing. Separately, a failed `pg_restore` only warned, then the
  script printed "Restore complete" and returned success anyway — fixed to throw on any nonzero
  `docker cp`/`pg_restore` exit, so success is only ever reported after it actually happened. Both
  reproduced against disposable containers (never the runtime one): the live container's ID is
  now refused pre-copy; an intentionally invalid dump now throws instead of reporting success; a
  genuinely valid restore still completes and reports so correctly.
* **`scripts/Backup-Database.ps1` — two real defects.** Read `$env:POSTGRES_USER`/`$env:POSTGRES_DB`
  from the host shell, which Compose's `.env` never populates (confirmed both empty in a normal
  shell) — `pg_dump` was running with null credentials. Fixed to resolve them from the running
  container via `printenv`. Separately, no native command's exit code was checked, so a silently
  failed `docker compose cp` would proceed to delete the container-local dump before the failure
  was ever detected — fixed to gate every step and only delete the container-local copy after the
  host copy is verified to exist and be non-empty. Reproduced against a disposable Postgres
  container with a confirmed-empty host environment: fixed script resolves real credentials and
  produces a valid, verified dump.
* **`scripts/Backup-Uploads.ps1` — hidden files silently dropped and undercounted to match.**
  `Compress-Archive`'s wildcard expansion skips Hidden-attribute items, and the separate file-count
  query used the same non-`-Force` enumeration, so the manifest agreed with the incomplete archive
  instead of catching it. Also found: `Compress-Archive` fails on a hidden file even when handed
  its exact path explicitly (an internal `Get-Item` call without `-Force`), so simply switching to
  a `-Force` enumeration wasn't enough on its own. Rebuilt on `System.IO.Compression.ZipFile`
  directly, driven by one `-Force` file list used for both archiving and counting. Reproduced: a
  visible file + a Hidden-attribute file + a nested subfolder now all archive, count, and
  round-trip correctly through `Restore-Uploads.ps1` (previously silently dropped the hidden one).
* **On-premise-windows-deployment skill's Validation Checklist — corrected twice.** 8 of 10 items
  are real PASSes with live evidence; the remaining 2 are honestly PARTIAL: item 7 ("data survives
  container recreation") initially claimed PASS from recreating only `proxy`, which owns neither
  the Postgres volume nor the uploads bind mount, so that test doesn't actually exercise the
  data-owning containers; item 10 (Windows startup/sleep policy) is documented-but-unverified-on-
  real-hardware, since the client's physical PC doesn't exist yet. Item 8's wording was also
  corrected for the container-local-dump-window point above.
* **Documentation honesty — retention/off-device copy.** New subsection in
  `docs/architecture/05-backup-and-recovery.md` making explicit that nothing in `scripts/`
  automates or enforces retention or off-device copy (no pruning script exists); the suggested
  daily/weekly/monthly policy stays a suggestion, not an implemented or client-approved policy.
  No retention/pruning script was built — that stays separate, client-gated work.
* **Verified untouched throughout both review rounds:** runtime Postgres (`inspection_jobs` count
  unchanged, 54 before and after every test) and the live uploads folder (47 files, SHA-256
  identical before/after) — every script fix was reproduced and verified against disposable
  fixtures/containers, never the runtime ones.

**Last updated:** 2026-09-11 — **STEP 4.2 first half (real backup verification + real restore
scripts, one live drill) — uncommitted working tree, owner does git.** `scripts/Backup-Database.ps1`
and `scripts/Backup-Uploads.ps1` now write a manifest (file name, SHA-256, size, and for uploads a
file count) next to each backup; `scripts/Verify-Backup.ps1` checks that manifest/checksum, not
just presence/size; `scripts/Restore-Database.ps1` and `scripts/Restore-Uploads.ps1` are real
(previously print-only skeletons) — both verify the manifest checksum before restoring, and both
default to a disposable/staging target (never the runtime `inspection_pwa-postgres-1` container or
the live uploads bind mount), requiring an explicit non-default parameter with a loud warning to
target anything else. Proven with one real end-to-end drill: backed up the live runtime Postgres DB
and uploads folder, restored the dump into a disposable Postgres container and the uploads archive
into `restore-staging\uploads`, and confirmed row counts, a sample query, and file checksums
matched the runtime source exactly, while the runtime DB's row counts / write counters / latest
timestamp and the live uploads folder were unchanged before vs. after (proving the drill never
wrote to either). Also fixed a real pre-existing bug found by the drill:
`Backup-Database.ps1`'s original `pg_dump ... > $outputFile` let PowerShell re-encode the binary
custom-format dump and prepend a UTF-8 BOM, corrupting every dump it ever produced — pg_dump now
writes inside the container and `docker compose cp` copies the bytes out untouched. Still
outstanding for STEP 4.2's full scope: a documented retention/off-device-copy policy (client
decision per `docs/architecture/05-backup-and-recovery.md`) and the separate on-prem Windows
deployment runbook validation.

**Last updated:** 2026-09-11 — **Phase 8H STEP 3.2 slice C (systemKey/from/to filters + a
"X of Y visits" total-count chip on the Manager service-history view) — uncommitted working tree,
owner does git.** STEP 3.2 is now fully closed: Slice A's `systemKey`/`from`/`to` filters (server-
validated since slice A but left out of the UI by slice B) are now wired into
`ManagerCustomerServiceHistory`, and every page of a filtered list now reports its true total
match count without a second query.

**STEP 4.1 (partial, interim HTTPS tunnel for phone/PWA testing) — also uncommitted, owner does
git.** `scripts/Start-DevTunnel.ps1` starts a Cloudflare quick tunnel (`cloudflared`, no account/
domain needed) against Caddy's existing HTTPS listener, giving phone testing a real
`https://*.trycloudflare.com` origin without touching Caddy config or `PUBLIC_HOSTNAME`. Documented
in `docs/architecture/06-deployment-runbook.md`'s "Temporary HTTPS Testing" section (prerequisite,
usage, warnings). Session-scoped only — no URL is ever recorded here or anywhere else, since it's
regenerated every run. This is not the production HTTPS path (client domain/static IP/router is a
separate, later item). Verified end-to-end: tunnel starts, `/` and `/api/health` both return the
real origin content through it, `POST /api/auth/login` succeeds through the tunnel with a normal
session cookie (auth not bypassed), and the process tree exits cleanly on stop.

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
5. **Final PDF layout review — next visual checkpoint.** The current renderer has a landscape
   cover, Summary of Testing, system tables, and accepted photos. Compare a generated report
   containing Roller Shutter against the client's saved sample before a further polish pass.
6. **FM200 (STEP 2.1) + Fire Rated Roller Shutter (STEP 2.4)** — runtime forms are implemented.
   The owner deferred the conflicting paper `/` legend on 2026-09-29 and confirmed the four
   digital choices. Fresh-PDF visual sign-off and phone acceptance remain.

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

**Pause snapshot (2026-09-29):** Code head `18e9895`; awaiting client domain and the
confirmations listed at the top of this file. The current implementation covers 12/12 listed
services; location-format reuse and its review fixes are committed. Next work is client
confirmation, fresh PDF visual sign-off, then production HTTPS and physical-phone/offline
acceptance. Earlier deployment/build notes below are historical and do not certify the new
feature on the client's production domain.

**Superseded — see the pause snapshot above and §6a for current status.** The "10 of 12" count
and the "next: G7 browser sanity, then Fire Intercom Sol pass" line below are from early
September and predate FM200, Roller Shutter, and the full Phase 2 location-format work; §6a's
service table (12/12, updated 2026-09-29) is the current source of truth. **Both G7 and the Fire
Intercom Sol pass were rechecked and closed 2026-10-07** (see the 2026-10-07 note at the very top
of this file) — the recheck also turned up a new P0 (Dry/Wet Riser blocks Final Report, P0-FR1 in
§4) and a cosmetic P2 (missing "Remark \*" indicator, P2-RM1 in §4).

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

**Status update (2026-09-28):** Fire Rated Roller Shutter and FM200 now have runtime V7 forms.
The owner deferred the roller shutter paper's conflicting `/` legend and confirmed the four
digital choices. Fresh-PDF visual sign-off and physical-phone offline acceptance are the next release checks. All STEP 1/2 services
inherit 4-state + C3. C2 (remarks pick-list) remains deferred to last.

**Status update (2026-09-29): Technician-proposed, Supervisor-approved customer locations — reviewed.**
A technician can now draft the real zone/location breakdown for a customer's CO2 / Wet Chemical / FM200 system
on-site, offline-first, and submit it for Supervisor/Admin review; Approve writes it through the exact same
server path a Manager's own "Zones & locations" edit uses. See the change-log entry below for the full
data-model / API / test summary. Migration 048 follows the separate 046 Roller Shutter and 047
photo-source migrations in the shared working tree.

**Status update (2026-09-29, later same day): Location Proposals redesigned to a patch model —
owner feedback after using the above in the real app.** The above design had the workflow backwards:
it asked a technician to invent zone/location structure (including row count) *before* doing any real
inspection work, and its standalone screen never loaded a customer's already-approved locations before
"replacing" them — a real bug (Approve does a full replace; the screen always started blank). Redesigned:
a proposal is now a scoped PATCH (`add-location` — just names a brand-new location, since there's no
real data for it yet; or `update-format` — replaces an EXISTING location's row count + per-row content,
read straight out of what a technician actually typed into the live CO2/FM200 form) that the server
merges into the customer's CURRENT configuration fresh at Approve time, never a client-submitted full
replacement. The standalone screen is trimmed to just `add-location` (name + zone); a new "Save as
format for next visit" action lives inside `Co2InspectionForm.tsx` / `Fm200InspectionForm.tsx` for
`update-format`, available any time from Draft. One-pending-per-target (not per-system), so an
`add-location` and an `update-format` proposal for the same system can be pending, and approved,
independently. Manually verified end to end in a real (non-Docker, disposable-DB) browser session: added
two named locations for a customer with only "General" before, approved both independently without
clobbering each other, confirmed both appear as separate CO2 form instances on the NEXT visit, filled
real detector rows ("Zone A"/"Zone A Room", "Zone B"/"Zone B Room"), saved that as the format, approved
it, and confirmed a THIRD visit's form opened with those exact 2 rows pre-filled. Full details, file
list, and known limitations in the change-log entry below (search "patch model").

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
| P0-FR1 | **OPEN 2026-10-07.** Final Report / PDF generation always fails (`409 FINAL_REPORT_DATA_INVALID`, `"Required accepted inspection history is unavailable for Dry / Wet Riser System."`) for any completed job containing a V7 Dry/Wet Riser inspection. `validHistoricalUnit()`'s `v7Suppression` allowlist omits `dry_wet_riser` (every other V7 system is listed) and there is no dedicated `dry_wet_riser` + `schemaVersion === 2` branch, unlike Hydrant/Hose Reel/Automatic Sprinkler. Confirmed live end-to-end on `SV-20260909-42`. Accepted Detail's own validator (`validateAcceptedDryWetRiserV7Detail`) already does this correctly and is the pattern to mirror. No migration/data fix needed — read-path only. Likely affects existing accepted production jobs with V7 Riser that reach Complete Service (not checked against runtime data). | Final Report / PDF unusable for any job with a V7 Dry/Wet Riser inspection. | `apps/api/src/reports/finalServiceReport.ts:366` (allowlist), `:396-425` (sibling systems' pattern to mirror); reference validator at `apps/api/src/inspections/acceptedMasterSystemDetail.ts:353` |
| P2-RM1 | **OPEN 2026-10-07.** The "Remark \*" required-indicator never renders for a V7 finding needing `Not Good`/`Complete Repair` — `RemarksField.tsx` ignores its `label` prop whenever `systemKey` is set (always), always showing plain "Remark". Submission is still correctly blocked without a remark (server + client gate both enforce it); this is a missing visual cue only. | Technician gets no advance warning a remark is required until Submit is rejected. | `apps/web/src/inspectionControls/RemarksField.tsx:70-78` |
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
- [x] 2.4 **Fire Rated Roller Shutter** — implemented from the real Hokuden report
      (No. / Location / Auto Alarm Mode / Manual Mode). V7 definition, form, adapter,
      evidence-first sync, accepted detail, and Final Report path are implemented.
      Browser and disposable-PostgreSQL acceptance pass; the conflicting `/` legend
      still needs client confirmation before release sign-off.

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
- [x] 3.1 Manager UI for per-customer `customer_enabled_systems` configuration.
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
- [x] 3.2 Manager review of completed reports / service history (partly exists).
      - [x] slice A — read-only filtering/pagination on the existing `GET /manager/service-visits`
        (`customerId`, `siteId`, `status`, `systemKey`, `from`/`to`, keyset `cursor`/`limit`),
        both per-customer and per-site scope. No migration, no new table, no write path.
      - [x] slice B — read-only service-history view on the `manager-customer` customer
        configuration screen, scoped to that customer with a Site filter (All Sites default) and
        a Status filter; "Load more" keyset pagination. Web-only, uses Slice A's filters
        as-is. `systemKey`/`from`/`to` are left unwired — no date-range or system-key control in
        this slice.

### STEP 4 — Production / real-device readiness  (Phase 9)
- [~] 4.1 HTTPS on LAN/phone with a trusted cert; production credentials; security checklist.
      - [x] trusted-cert LAN/phone testing — interim Cloudflare tunnel (`Start-DevTunnel.ps1`),
        verified end-to-end including a real login through it. Not the production path.
      - [x] security checklist — real point-by-point pass of `backend-api-security`'s Public
        Deployment Gate, see `docs/architecture/04-security-and-access.md`'s "Security Checklist
        Results (2026-09-12)" section (9/12 real PASS; 1 real HIGH-severity dependency CVE found
        and fixed; 2 honestly marked PARTIAL — HTTPS blocked on client infrastructure, one
        moderate dependency issue blocked upstream by Express 4.x).
      - [ ] real production HTTPS (client domain + static public IP + router forwarding) and
        production credentials — both blocked on the client's actual infrastructure, which
        doesn't exist yet. Nothing to build until that's provisioned.
- [~] 4.2 Backup + restore drill; on-prem Windows deployment runbook validation.
      - [x] real backup manifests/checksums, real restore scripts (DB + uploads), one live
        end-to-end drill proven against the runtime DB and uploads folder without touching either.
      - [x] on-prem Windows deployment runbook validation — real point-by-point pass against this
        repo's actual state, see `docs/architecture/06-deployment-runbook.md`'s "Validation
        Checklist Results (2026-09-11)" section (8/10 real PASS; 2 honestly marked PARTIAL —
        container-recreation coverage limited to `proxy`, not the Postgres/uploads-owning
        containers; Windows startup/sleep policy documented-but-unverified-on-real-hardware
        pending the client's actual PC. Both partials were tightened after a Sol review pass
        caught the first draft overclaiming them as full PASSes).
      - [ ] documented retention/off-device-copy policy (client decision) — still just a starting
        suggestion in `docs/architecture/05-backup-and-recovery.md`; nothing in `scripts/`
        automates or enforces it yet (no pruning/off-device-copy script exists). Stays unchecked
        until the client decides and it gets built.

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
| FM200 | ⚠️ source-format confirmation pending | ✅ implemented | Confirm against the client's source document before final sign-off |
| Smoke Ventilation | ✅ confirmed (V7-only) | ✅ **done** (4-state, browser + 9-case DB proven, committed `ade85f6`) | — |
| Fire Intercom | ✅ confirmed (V7-only) | ✅ **done** (4-state, browser + 12-case DB proven) | — (Sol pass closed 2026-10-07, SAFE TO COMMIT: Y) |
| Fire Rated Roller Shutter | ✅ four digital choices confirmed; paper `/` deferred | ✅ implemented, browser and disposable-PostgreSQL tested | Fresh-PDF visual sign-off and physical-phone acceptance remain |

Current V7 code includes **12 / 12 listed services**, including the independent FM200
implementation and the new Fire Rated Roller Shutter form. Portable Fire Extinguisher remains
registration-only by design (C4). The owner confirmed the four digital Roller Shutter choices
on 2026-09-29 and deferred interpretation of the historical paper `/` mark. PDF pagination
visual sign-off on a regenerated PDF and release-level phone acceptance remain outstanding. The older STEP 2.1 FM200 source-document input note
remains a documentation/confirmation question, not a missing runtime form.

## 7. Change log

- 2026-10-07 — **G7 / Fire Intercom Sol recheck — found P0-FR1 (Dry/Wet Riser blocks Final
  Report) and P2-RM1 (missing "Remark \*" indicator).** No code changed — investigation and
  live-runtime verification only. Fire Intercom Sol verdict closed (SAFE TO COMMIT: Y, already
  committed, 0 P0/P1). G7 steps 1-2 confirmed live on `https://localhost/`; step 4 blocked by the
  newly found P0. Full details, repro, and fix pointers in the 2026-10-07 note at the top of this
  file and in §4 (P0-FR1, P2-RM1). Demo job `SV-20260909-42` left closed/read-only as a live repro
  of P0-FR1 — harmless, no production data touched.

- 2026-09-29 — **Project pause snapshot.** Recorded commit `18e9895`, the verified
  location-format reuse status, outstanding client domain/infrastructure and format/report/
  backup confirmations, and the Phase 9 release checks to run when the owner returns in
  about one week. Documentation only; no production configuration or runtime data changed.

- 2026-09-29 — **Baseline review proof and migration disposition.** Extracted `0024707`
  with `git archive` into a disposable checkout without stash, branch changes, or runtime-data
  access. Its Fire Alarm V7 integration suite passed 4/4 against fresh PostgreSQL on
  `127.0.0.1:55432` with the installed Playwright Chromium; the feature head also passed 4/4.
  The previous 3/4 was the documented missing-browser-path environment failure. The clean
  baseline database constraints on `staged_inspection_evidence` and
  `inspection_evidence_reservations` exclude `fire_rated_roller_shutter`. Migration 046 is
  therefore required for the added Roller Shutter V7 evidence path and is a justified
  forward-only exception to the original no-migration assumption for location-format patches.
  No production database or historical migration was modified. The temporary checkout and
  database were removed after verification.

- 2026-09-29 — **Sol review fixes for location-format reuse (uncommitted; stop before staging).**
  The full-span review found four P1 defects. `managerApi.ts` and the technician outbox now
  use one browser proposal-shape validator, accepting all seven new row formats while refusing
  unknown systems and cross-table Fire Alarm rows. Supervisor restore skips the technician-only
  `/inspection-jobs` refresh, so full navigation can open the proposal inbox. Approval now locks
  the customer before reloading the active revision; the disposable-PostgreSQL test blocks two
  different approvals at that lock and verifies both formats survive. The direct Manager Fire
  Alarm locations write rejects missing or mismatched `fireAlarmTable` routing. Roller Shutter,
  Smoke Ventilation and Fire Intercom offer separate configured-label corrections for the next
  format proposal; the current inspection's frozen row labels remain unchanged and browser
  tests verify the queued payload. No schema, migration, or historical row shape changed in this
  remediation. Migration 046 was already present in Phase 2.3 for Roller Shutter V7 evidence,
  despite the location-patch design itself needing no migration.
  Standard V6/V7 database integration suites and the production web build passed. The existing
  Manager authorization browser harness expected an older offline-denial sentence and mistook
  the word "Operations" in the current denial for exposed data; its assertions now check the
  current denial, absence of the Manager dashboard, and absence of a service-data request.
  Final review reproduced a 10 px overflow from the shared sticky form action bar's negative
  side margin at 768 px and removed that margin; the viewport browser gate covers 360/768/1280 px.

- 2026-09-29 — **Phase 2.5: Smoke Ventilation / Fire Intercom location-format reuse (uncommitted; stop before staging).**
  This completes the seven-system Phase 2 location-format roadmap: Phase 2.1 Roller Shutter,
  Phase 2.2 Hose Reel, Phase 2.3 Hydrant and Dry/Wet Riser, Phase 2.4 Fire Alarm, and this
  Phase 2.5 pair. Both systems have a single zone-free `general` layout. A read-only aggregate
  query of the runtime `master_system_form_instances` found **zero submitted rows for either
  key** before the change. Existing row types and accepted authority remain unchanged.
  - The saved row shape is `{assetReference}` only. Smoke Ventilation's `zoneSnapshot` is null;
    its Auto/Manual fields are inspection results, not layout. Fire Intercom's V7 definition
    records the 2026-09-04 owner decision collapsing the paper Yes/No × 1/2 grid into one
    `conditionResult`; the printed station label is `assetReference`. No second result or
    location/zone field was inferred from the paper.
  - API `locationConfigurableSystemKeys`, `zoneFreeLocationKeysBySystem`, and
    `formatRowFieldsBySystem` now accept these two General `update-format` patches and refuse
    `add-location`, unknown keys, and extra row fields. The browser proposal draft validator
    mirrors that shape. The web `managerApi.ts` registry remains the narrower set served by
    the zoned Manager/add-location editors; exposing these zone-free systems there would offer
    an add-location action the API correctly refuses. A first approval creates General; later
    approval replaces its row list.
    The shared server `expectedConfiguredSingleInstanceRows()` and the two web configured-row
    generators consume a complete `rowPreset.rows[]` only; a short or malformed list falls back
    as a whole to the legacy flat `assetReference`. Fire Intercom's submit gate already checks
    frozen row content; Smoke Ventilation's gate now does too. Existing IndexedDB records are
    loaded before row generation, so an in-progress row is never re-prefilled.
  - Each Draft form has “Save as format for next visit”, using the established IndexedDB draft,
    queue, exact-UUID sync confirmation, and Supervisor proposal review. Manager review no
    longer invents “(no location)” for these label-only rows.
  - Focused API parser/server-authority tests: 19/19 passed. New web per-system reuse and
    fail-closed tests: 4/4 passed; existing Smoke Ventilation and Fire Intercom submit gates:
    43/43 passed. The real HTTP proposal integration suite against disposable PostgreSQL
    passed, including each system's proposal → approval → exact stored preset → new service
    visit frozen snapshot. Both apps' typechecks and builds passed; `git diff --check` clean.
  - Manual browser walkthrough on disposable local API/PostgreSQL: as technician, opened a
    Smoke Ventilation visit already holding two labels, added and saved `Roof Fan 7`, then
    submitted its format. As Supervisor, the known `Location Proposals` navigation error
    recurred, so approval went through an authenticated call to the local test API. A newly
    created second visit displayed all three exact labels (`01`, `Pump Room`, `Roof Fan 7`)
    in its Fan Schedule. At 360px, no horizontal overflow. No production data was written;
    temporary API, Vite proxy, database, and seed files were removed. Physical phone and
    installed-PWA force-close checks remain release-level work. No P0/P1 in this scope.

- 2026-09-29 — **Fire Alarm location-format reuse (uncommitted; stop before staging).**
  Extended the location-proposal patch model to Fire Alarm (`fire_alarm_detector`), reusing the
  generalized pattern from Phase 2.1/2.2/2.3 (`update-format`, `technicianLocationProposalDraft.ts`,
  fail-closed preset pre-fill, "Save as format for next visit").
  - **Why Fire Alarm needed its own design, not a straight copy.** Per
    `.agents/skills/repeatable-row-model/SKILL.md`, Fire Alarm's primary + alarm-device rows are
    frozen/divergent-named, same constraint as Phase 2.3's systems -- so `FireAlarmPrimaryDeviceRow`
    and `FireAlarmSecondaryAlarmDeviceRow`'s serialized shapes were never touched. But Fire Alarm is
    structurally unlike every prior system: it has TWO repeatable tables in ONE inspection record
    (`repetitionMode: "single_with_two_repeatable_tables"`), and `fireAlarmRepository.ts`'s
    `configuredRows()` already routes a whole configured LOCATION's rows to exactly one table via
    `location.rowPreset.fireAlarmTable` ("primary" | "secondary") -- never both. Fire Alarm was never
    in `locationConfigurableSystemKeys` before this task, so in production every row has always been
    technician-sourced (`fireAlarmTable` routing was dead code), exactly like Hydrant before its own
    Phase.
  - **Design decision (documented per the task brief): treat Fire Alarm as zone-free with TWO
    independent pseudo-locations, not real zones/locations.** Considered and rejected: (a) real zoned
    locations like Hydrant, where `add-location` would need a new field naming which table a location
    is for, plus Approve-time cross-validation that a re-submitted format's row shape still matches the
    location's originally-assigned table; (b) one `update-format` patch carrying two named row groups.
    Chose instead: `add-location` stays refused (like Roller Shutter/Hose Reel), and `update-format`
    targets one of exactly two fixed keys, `general-primary` / `general-secondary` -- the locationKey
    itself unambiguously determines the row shape (`{assetReference,alarmZone,location}` vs
    `{assetReference,location}`) and the `fireAlarmTable` to bootstrap, with no cross-referencing of
    stored state needed at parse time. This is the simplest option that doesn't require inventing a new
    patch field, and it mirrors Roller Shutter/Hose Reel's already-proven zero-real-zone pattern --
    just doubled, since Fire Alarm has two tables where they have one. Each pseudo-location gets its
    own "Save as format for next visit" button in `FireAlarmInspectionForm.tsx` (reads
    `primaryDeviceRows`/`secondaryAlarmDeviceRows` respectively), not a per-real-location button like
    Hydrant/Riser.
  - **Generalized the zone-free-system special case wherever it was hardcoded, rather than adding a
    third copy.** `locationConfiguration.ts` had it hardcoded twice (`parseLocationConfigurationInput`'s
    "general" key/count check, and `applyLocationProposalPatch`'s single-location bootstrap), and
    `managerCustomers.ts`'s `applyManagerLocationsUpdate` (the shared write path both the Manager's own
    PUT route and location-proposal Approve call) had a THIRD, independent copy. All three now read a
    single exported `zoneFreeLocationKeysBySystem: Record<string, readonly string[]>` (Roller
    Shutter/Hose Reel: `["general"]`; Fire Alarm: `["general-primary","general-secondary"]`).
    `applyLocationProposalPatch`'s bootstrap branch was also changed from "replace the whole
    `{zones, locations}` when the ONE known key is missing" to "append when a target key from the
    system's allowed set is missing, capped at that set's length" -- needed because Fire Alarm's SECOND
    pseudo-location's first approval must not clobber the first one already created. Byte-identical
    behavior for Roller Shutter/Hose Reel confirmed by the pre-existing tests passing unmodified.
  - **Real bug caught by this task's own integration test, not by inspection.** Before generalizing
    `managerCustomers.ts`'s copy of the zone-free check, approving Fire Alarm's first `update-format`
    (bootstrapping `general-primary`, `zoneId: null`) failed with `400 INVALID_LOCATION_CONFIGURATION`
    ("Every location must reference a submitted zone") -- `applyManagerLocationsUpdate` didn't know
    `fire_alarm_detector` was zone-free at all, since that check was its own independent hardcoded
    `fire_rated_roller_shutter || hose_reel` list, never touched when `locationConfigurableSystemKeys`
    gained `fire_alarm_detector`. Fixed by the same `zoneFreeLocationKeysBySystem` generalization above.
  - **`rowPreset` shape.** `{ fireAlarmTable: "primary" | "secondary", assetReference?: string, rows?:
    Array<{assetReference,alarmZone,location}> | Array<{assetReference,location}> }` --
    `fireAlarmTable` is REQUIRED (not a legacy fallback like Hydrant's flat `assetReference`) since
    `configuredRows()` throws "missing or invalid row routing" without it; `applyLocationProposalPatch`
    now always re-derives and preserves it from `locationKey` on every merge (fail-closed sanity check:
    refuses if an existing location's stored `fireAlarmTable` ever disagreed). `parseFireAlarmRowPreset`
    (`fireAlarmDefinition.ts`) extended, mirroring Hydrant's `rowPresets()`: a `rows[]` array is trusted
    only when every entry matches its table's exact field set; any mismatch drops the WHOLE array
    (never a partial/mixed layout), falling back to the flat `assetReference` default and the location's
    own `displayName`/zone for `alarmZone`/`location`.
  - **`configuredRows()`** (`fireAlarmRepository.ts`, exported for testability) now reads
    `preset.rows[]` index-aligned with `presetRowCount` for BOTH tables (previously always derived
    `assetReference`/`alarmZone`/`location` from the flat fallback and the location's own
    zone/displayName, never a saved per-row preset).
  - **UI fix required to make the feature functional, same root cause as Hydrant's.**
    `FireAlarmInspectionForm.tsx` had `readOnly={row.source === "configured"}` on all 5 primary +
    secondary identity inputs -- dead code until now (Fire Alarm was never location-configurable, so
    `row.source` was always `"technician"` in production). Removed; the fieldset's own
    `disabled={!editable}` already gates edits once a Draft is submitted, and neither the V7 client
    validator (`fireAlarmV7Evidence.ts`) nor the V7 server acceptance (`fireAlarmV7Acceptance.ts`'s
    `validResponses`) enforce a configured row's content matching a frozen/expected value (confirmed by
    reading both) -- unlike Roller Shutter, which still enforces this AND still has the same
    `disabled={configured}` lock live in its own form. **Flagged as a separate follow-up** (not fixed
    here, out of this task's scope): Roller Shutter may have the same "Save as format is a permanent
    no-op after the first save" bug Hydrant had, unconfirmed whether the strict match-check is an
    intentional product decision.
  - **`ManagerLocationProposals.tsx`** needed a small generalization (not "no change" like
    Hydrant/Riser): its row renderer branched on `"assetReference" in row` to show `Asset: / Location:
    {row.locationText}` OR `Zone: / Location: {row.location}` -- neither branch fit Fire Alarm's
    `{assetReference, alarmZone, location}` (primary) or `{assetReference, location}` (secondary) rows,
    since the field NAME `location` (not `locationText`) collided with the assetReference branch,
    which would have shown "(no location)" always. Rewrote to check each field key independently
    (`assetReference`, `alarmZone`, `location ?? locationText`, `drumType`), verified byte-identical
    rendering for every existing system's row shape.
  - **Tests.** `locationConfiguration.test.ts`: new "Fire Alarm format" case covering both pseudo-
    locations' independent bootstrap/append/update-in-place, cross-table shape refusal in both
    directions, add-location refusal, and the direct-editor round trip capped at two keys. All 16
    existing cases in this file re-run unmodified -- **PASS**. `fireAlarmRowPresetReuse.test.ts` (new,
    8 tests): per-table pre-fill, missing-routing throws, fail-closed on malformed/short presets (no
    mixed layout), the flat fallback, and a secondary-shaped row saved against a primary location
    being dropped whole. `locationProposals.integration.test.ts` extended with a Fire Alarm scenario
    (disposable Postgres): add-location refused -> `general-primary` update-format -> approve ->
    `general-secondary` update-format -> approve (both pseudo-locations present, neither clobbers the
    other) -> exact stored `row_preset` verified by direct DB read for both -> a second
    `general-primary` update-format replaces it in place, leaves `general-secondary` untouched ->
    a secondary-shaped row against `general-primary` refused (400) at submit time. Also re-ran
    `managerLocations.integration.test.ts`, `managerCustomers.integration.test.ts`,
    `managerSystemConfiguration.integration.test.ts`, `managerLabelOverrides.integration.test.ts`,
    `fireAlarmV7.integration.test.ts` (3/4 -- one unrelated pre-existing failure, see Known
    limitations), `fireAlarmV6Acceptance.integration.test.ts` -- **PASS, no regressions**. Both apps'
    `typecheck` and `build` -- **PASS**. `git diff --check` -- clean (CRLF warnings only).
  - **Manual browser walkthrough (real, non-Docker dev stack: disposable Postgres, `apps/api` dev
    server, and a temporary Vite proxy with a `/api` prefix rewrite -- all reverted afterward).** Seeded
    fresh admin/inspector/supervisor accounts and used the ALREADY-enabled "Hokuden (Malaysia) Sdn Bhd"
    demo customer (Fire Alarm was already assigned to it, since the system requires no pre-configured
    location to be assignable -- confirmed unaffected by this task, `locationDependentSystemKeys` in
    `managerCustomers.ts` was never touched). As technician: created a real service visit, opened the
    V7 Fire Alarm form, added one primary row (`FA-01` / `Zone A` / `Level 1 Lobby`) and one secondary
    row (`FA-10` / `Guard House Panel`), clicked "Save as format for next visit" on each -- both
    "Submitted for Supervisor review" immediately (online). As supervisor: hit the same PRE-EXISTING
    `#/manager-location-proposals` full-navigation quirk documented in the Hydrant entry (stray
    `GET /inspection-jobs` 403 wedging the app shell into "Manager server data is currently
    unavailable"), so approved both via an authenticated `fetch` through the real running server, same
    workaround as before -- both approvals returned `201`, and a direct DB read confirmed
    `general-primary`/`general-secondary` each stored with the exact typed content and correct
    `fireAlarmTable`. As technician on a freshly-created THIRD visit: the Fire Alarm form opened with
    BOTH tables pre-filled from the live DOM -- primary row `assetReference="FA-01"`,
    `alarmZone="Zone A"`, `location="Level 1 Lobby"`; secondary row `assetReference="FA-10"`,
    `location="Guard House Panel"` -- **the actual payoff for both tables, read directly from input
    values, not inferred**. Confirmed editable (proving the UI fix): typed a change into the primary
    row's Location field, clicked Save Draft, reloaded the DOM read -- the edit persisted through a
    real IndexedDB + V7-dispatch round trip with no validation error, confirming V7 truly does not
    enforce configured-row content matching. The disposable Postgres, temporary Vite proxy, and seed
    scripts were removed afterward; no production data or physical phone was used.
  - **Known limitations.** (1) Same pre-existing `#/manager-location-proposals` full-navigation quirk
    as the Hydrant entry -- reproduced again here, still unrelated to this task's own code. (2) One
    `fireAlarmV7.integration.test.ts` case ("accepts frozen current-Poor evidence, retries after
    closure, and PDF-embeds accepted image") failed in this sandbox with `REPORT_CHROMIUM_PATH binary
    is missing or not executable` -- a pre-existing environment limitation (no Chromium installed
    here), unrelated to this task; the other 3 cases in that file passed. (3) Roller Shutter's own
    `disabled={configured}` lock (see UI fix note above) was flagged as a separate follow-up, not
    fixed here. (4) No physical phone or PWA force-close test was performed (release-acceptance level,
    not required for this task's Level 2 scope).
  - **Files changed:** `apps/api/src/inspections/locationConfiguration.ts` (registry, shared
    zone-free-key registry, per-locationKey row field resolution, bootstrap/merge generalization),
    `apps/api/src/inspections/locationConfiguration.test.ts` (new Fire Alarm case),
    `apps/api/src/routes/managerCustomers.ts` (shared zone-free check in
    `applyManagerLocationsUpdate`), `apps/api/src/routes/locationProposals.integration.test.ts` (new
    Fire Alarm scenario), `apps/web/src/fireAlarm/fireAlarmTypes.ts` (`FireAlarmRowPreset` gains
    `rows`), `apps/web/src/fireAlarm/fireAlarmDefinition.ts` (`parseFireAlarmRowPreset` fail-closed
    rows reader), `apps/web/src/fireAlarm/fireAlarmRepository.ts` (`configuredRows` exported, reads
    saved rows per table), `apps/web/src/fireAlarm/FireAlarmInspectionForm.tsx` (props, two
    independent Save-as-format actions, the `readOnly={configured}` fix),
    `apps/web/src/jobs/technicianLocationProposalDraft.ts` (`validPatch` field-set + locationKey
    check), `apps/web/src/manager/ManagerLocationProposals.tsx` (generalized row renderer),
    `apps/web/src/App.tsx` (`actorUserId`/`canUseServer` threaded to the form),
    `apps/web/tests/fireAlarmRowPresetReuse.test.ts` (new).

- 2026-09-29 — **Hydrant / Dry-Wet-Riser location-format reuse (uncommitted; stop before staging).**
  Extended the location-proposal patch model to the two remaining repeatable-row services with
  accepted production data (Hydrant V1, Dry/Wet Riser V2), reusing the exact generalized pattern
  from Phase 2.1/2.2 (`add-location` + `update-format`, `technicianLocationProposalDraft.ts`,
  `newUpdateFormatDraft`, `configuredRowPresets`-style fail-closed pre-fill).
  - **Scope, per `.agents/skills/repeatable-row-model/SKILL.md`'s frozen warning.** Both
    `HydrantRow` and `RiserOutlet` are explicitly frozen (accepted production data) -- this
    change touches ONLY (a) whether `customer_system_locations` gets real rows written for these
    two `systemKey`s (previously: never, since they were absent from
    `locationConfigurableSystemKeys`), and (b) what DEFAULT content a newly-created "configured"
    row is pre-filled with. **Neither row's TypeScript type nor its serialized field set changed
    at all** -- confirmed by the pre-existing `hydrantV7SubmissionIssues.test.ts` /
    `dryWetRiserV7SubmissionIssues.test.ts` / `repeatableRows.test.ts` suites (21/21) passing
    unmodified, and by `git diff` showing no touched line inside either `*Types.ts` file.
  - **Key difference from Roller Shutter/Hose Reel: NOT zone-free.** Hydrant and Dry/Wet Riser
    keep their full zoned, multi-location model (like CO2/FM200) -- `add-location` (naming a new
    location under an existing or new zone) is required before `update-format` can target it;
    unlike Roller Shutter/Hose Reel's single implicit "general" layout, `update-format` against a
    location that doesn't exist yet is refused (`LOCATION_PROPOSAL_TARGET_INVALID`), proven in
    the integration test. Also unlike CO2/FM200 (one form instance per configured location),
    Hydrant/Riser combine ALL of a system's locations into ONE inspection record
    (`single_with_repeatable_rows`), so "Save as format for next visit" is scoped PER LOCATION --
    each form renders one save button per `record.inspectionSnapshot.system.locations` entry,
    reading only that location's own rows (`row.configuredLocationId === location.id`) into the
    patch.
  - **Real bug found and fixed: Dry/Wet Riser requires `systemConfiguration.riserMode` to be set
    before/while it is first enabled** (`assertDryWetRiserAssignments`, pre-existing, unrelated to
    this task). A technician's `add-location` proposal cannot be the FIRST thing that enables
    Dry/Wet Riser for a customer -- discovered by the integration test failing with
    `RISER_MODE_REQUIRED` until the test pre-enabled the system via the real
    `POST .../configuration-revisions` route first, exactly as production requires. This is a
    genuine (if narrow) product constraint, not a defect in this change, and is called out
    explicitly rather than worked around.
  - **UI fix required to make the feature functional for Hydrant.** `HydrantInspectionForm.tsx`
    previously disabled `assetReference`/`locationText` inputs for `source === "configured"`
    rows (`disabled={readOnly || configured}`), copied from Roller Shutter's pattern. This was
    DEAD CODE until now (Hydrant was never in `locationConfigurableSystemKeys`, so `row.source`
    was always `"technician"` in production) -- once live, it would have permanently locked a
    configured row's identity fields the moment a location existed, making "Save as format"
    produce nothing but a no-op re-save. Removed `|| configured}` to match the ALREADY-editable
    behavior of CO2/FM200/Dry-Wet-Riser (3 of 4 existing precedents); Hydrant's own
    `structuralSubmitIssues` never enforced configured-row content matching a frozen value
    (unlike Roller Shutter's `authoritative.assetReference` check), so this was always a
    server-permitted path, just UI-unreachable. Dry/Wet Riser's form never had this restriction.
  - **`configuredHydrantRows`/`configuredDryWetRiserOutlets`** (both renamed from a private
    `configured` and exported for testability, mirroring `configuredFireRatedRollerShutterRows`):
    each location's `rowPreset.rows[]` is read index-aligned with `presetRowCount`, exactly
    mirroring Roller Shutter's `rowPresets()` fail-closed reader (wrong length, wrong shape, or
    extra/missing keys -> the WHOLE preset is ignored, never a partial/mixed layout). The
    pre-existing flat `rowPreset.assetReference` fallback (a legacy single-value field some
    already-configured locations may carry) is preserved as a lower-priority fallback beneath the
    new per-row preset -- Roller Shutter's `expectedConfiguredRows` does the identical dual
    fallback.
  - **API.** `locationConfigurableSystemKeys` (both the API's and the web's copies) gained
    `"hydrant"` and `"dry_wet_riser"`. `formatRowFieldsBySystem` gained
    `hydrant: ["assetReference", "locationText"]` and the same for `dry_wet_riser` (both systems'
    `add-location` remains available, unlike Roller Shutter/Hose Reel where it is refused).
    `technicianLocationProposalDraft.ts`'s client-side `validPatch` field-set check extended to
    match.
  - **`ManagerLocationProposals.tsx` needed NO change** -- its `update-format` row renderer
    already branches generically on `"assetReference" in row`, which both new systems' rows
    satisfy verbatim.
  - **Tests.** `locationConfiguration.test.ts`: new test proving assetReference/locationText rows
    parse, `{alarmZone,location}` rows are refused, `update-format` against a non-existent
    location is refused (not implicitly zone-free), and `add-location` still works, for both
    systems. `hydrantRowPresetReuse.test.ts` / `dryWetRiserRowPresetReuse.test.ts` (new, 5 tests
    each): preset-driven pre-fill, fail-closed on malformed/short presets, no mixed configured
    layout, the flat-fallback preserved, V7 `fieldRemarks` presence. `locationProposals.integration.test.ts`
    extended with a combined Hydrant + Dry/Wet Riser scenario (disposable Postgres): add-location
    -> approve -> update-format -> approve -> exact stored `row_preset` verified by direct DB
    read -> a second update-format replaces it in place -> a `update-format` against a
    non-existent location is refused at Approve. The pre-existing "unsupported system" negative
    controls in this file and in `managerLocations.integration.test.ts` were repointed from
    `hydrant` (now legitimately supported) to `fire_alarm`. All API-side regressions
    (`hydrantInspectionSync.test.ts`, `dryWetRiserConfiguration.test.ts`,
    `dryWetRiserAccepted.test.ts`, `hydrantV7SubmissionIssues.test.ts`,
    `dryWetRiserV7SubmissionIssues.test.ts`, `repeatableRows.test.ts`,
    `managerSystemConfiguration.integration.test.ts`, `managerLabelOverrides.integration.test.ts`)
    re-run -- **PASS, no regressions**. Both apps' `typecheck` and `build` -- **PASS**.
    `git diff --check` -- clean (CRLF warnings only).
  - **Manual browser walkthrough (real, non-Docker dev stack: disposable Postgres on 55432 +
    `apps/api` dev server + a temporary Vite proxy, reverted afterward; Hydrant only -- Dry/Wet
    Riser round-trip is covered by the integration test but not separately walked through in the
    browser, given the extra riserMode pre-enable step).** Seeded a Hydrant-enabled customer with
    zero locations. As technician (real signed-in session): used "Add a New Location" to name
    "North Gate Hydrant" under a new "Yard Zone". As supervisor: approved it -- DB confirmed the
    real `customer_system_locations` row. As technician on a freshly-seeded SECOND visit: the
    Hydrant form opened with one configured row pre-filled `locationText="North Gate Hydrant"`,
    confirmed **editable** (proving the UI fix); typed real content (`HYD-201` /
    "North Gate — Fire Access Road") and clicked "Save 'North Gate Hydrant' as format for next
    visit" -- "Submitted for Supervisor review", and a direct DB read showed the exact typed
    content in the proposal's stored payload. As supervisor: approved it via an authenticated
    fetch through the real running server after the click-through UI hit a reproducible,
    PRE-EXISTING app-shell quirk unrelated to this change (see Known limitations) -- a direct read
    of `customer_system_locations.row_preset` confirmed the exact approved content. As technician
    on a freshly-seeded THIRD visit: the Hydrant form opened with the row pre-filled
    `locationText="North Gate — Fire Access Road"`, `assetReference="HYD-201"` -- **the actual
    payoff, read directly from the live DOM's input values, not inferred**. No horizontal overflow
    confirmed at 375px. The disposable Postgres, temporary Vite proxy, and a throwaway seed script
    were removed afterward; no production data or physical phone was used.
  - **Known limitations.** (1) Navigating directly to `#/manager-location-proposals` via a full
    page load (as opposed to in-app SPA navigation) intermittently triggers a stray, unrelated
    `GET /inspection-jobs` call under a Supervisor session, which 403s and puts the app shell into
    a persistent "Manager server data is currently unavailable" state that a fresh in-app
    navigation click does not clear. Reproduced independently of this change's own code (confirmed
    the underlying `/manager/location-proposals` endpoint returns 200 with correct data throughout
    via direct authenticated `fetch`); not touched, since it is unrelated to the location-proposal
    or repeatable-row code this task owns. Worth a dedicated look. (2) The Dry/Wet Riser round
    trip was proven via the integration test and direct DB reads, not a full click-through browser
    walkthrough (time-boxed; the riserMode pre-enable step makes it a longer setup than Hydrant's).
  - **Files changed:** `apps/api/src/inspections/locationConfiguration.ts` (registry + row-field
    map), `apps/api/src/inspections/locationConfiguration.test.ts` (new Hydrant/Riser cases),
    `apps/api/src/routes/locationProposals.integration.test.ts` (new combined scenario +
    unsupported-system fix), `apps/api/src/routes/managerLocations.integration.test.ts`
    (unsupported-system fix), `apps/web/src/manager/managerApi.ts` (registry),
    `apps/web/src/jobs/technicianLocationProposalDraft.ts` (`validPatch` field set),
    `apps/web/src/hydrant/hydrantRepository.ts` (`configuredHydrantRows` + fail-closed preset
    reader), `apps/web/src/dryWetRiser/dryWetRiserRepository.ts`
    (`configuredDryWetRiserOutlets` + fail-closed preset reader),
    `apps/web/src/hydrant/HydrantInspectionForm.tsx` (props, per-location Save-as-format, the
    `disabled={configured}` fix), `apps/web/src/dryWetRiser/DryWetRiserInspectionForm.tsx`
    (props, per-location Save-as-format in both the V7 and legacy branches), `apps/web/src/App.tsx`
    (`actorUserId`/`canUseServer` threaded to both forms), `apps/web/tests/hydrantRowPresetReuse.test.ts`
    (new), `apps/web/tests/dryWetRiserRowPresetReuse.test.ts` (new).

- 2026-09-29 — **Hose Reel format reuse (uncommitted; stop before staging).**
  Hose Reel now uses the Phase 2.1 `update-format` patch for one zone-free General layout (up to
  250 drums). A format row is `{assetReference, locationText, drumType}`; type is `swing`, `fixed`,
  or empty while the Draft is incomplete. Supervisor approval stores `{rows}` as the customer's
  `rowPreset` and the row count as `presetRowCount`. A newly created V7 inspection reads the frozen
  preset, validates the whole row list, and pre-fills configured drum sections plus schema-3
  `response_payload.drumCount`; malformed presets fall back as a whole to safe defaults. The
  response schema and historical V1–V6 behavior remain unchanged. The form saves the current
  Draft's row content into the existing IndexedDB proposal outbox. Manager review now shows each
  drum type. Hose Reel Draft save now preserves technician edits to a configured row's location
  text; it previously restored the original frozen label.
  API patch unit tests passed (14/14), web row-preset/submission/Roller regressions passed
  (23/23), disposable-PostgreSQL proposal integration passed (1/1), Manager location integration
  passed (4/4), both app typechecks and builds passed, and the focused browser test passed.
  A manual in-app browser walkthrough used the actual signed-in app and a disposable local API
  and PostgreSQL: technician created a first visit, entered two real drum sections (Swing/Fixed,
  distinct locations/references), saved the Draft and format; Supervisor saw both exact rows and
  approved; a new server-created visit showed `drumCount=2` and both rows prefilled. A direct
  disposable-DB read confirmed the exact `preset_row_count=2` and `row_preset.rows`. The focused
  browser regression separately proves a configured-row Draft edit survives reload and checks no
  horizontal overflow at 360, 768, or 1280 px. The test-only API, temporary Vite proxy,
  database container, and local seed data were removed after the walkthrough. No production data, physical phone,
  or installed-PWA force-close test was used. No P0/P1 finding remains in this scope; release
  phone checks remain outstanding.

- 2026-09-29 — **Phase 2.1: Fire Rated Roller Shutter format reuse (uncommitted; stop before staging).**
  The owner confirmed Roller Shutter remains zone-free. Its form now accepts an editable
  Asset Reference beside Location and offers "Save as format for next visit" using the
  existing IndexedDB proposal draft and outbox. The API validates Roller-only
  `{assetReference, locationText}` rows and permits `update-format` for General; first
  approval creates one zone-free General customer location and later approval updates it.
  Follow-up review found and closed a direct Manager API path that otherwise accepted
  multiple Roller Shutter locations; both parser and write boundary now enforce the
  single General layout (up to 250 rows).
  New visits freeze and pre-fill those exact rows. The other location systems retain their
  zone and row contracts. A Roller-only job no longer offers "Add a New Location".
  Focused API/web tests passed (13/13 after review, 3/3), existing CO2 and row-count regressions passed
  (5/5, 2/2), disposable-PostgreSQL Manager locations and proposal integration passed
  (4/4, 1/1), and IndexedDB Playwright proposal sync passed (1/1). Both app typechecks
  and builds passed. A disposable desktop-browser walkthrough confirmed propose, review,
  approve, a new visit pre-filled with two configured rows, and accepted sync; responsive
  checks at 360, 768, and 1280 px found no horizontal overflow. No physical phone or PWA
  force-close test was performed. No P0/P1 finding in Phase 2.1 scope.

- 2026-09-29 — **Wet Chemical location-format reuse (uncommitted; stop before staging).**
  Wet Chemical now initializes detector rows from its frozen location's `presetRowCount` and
  `rowPreset.rows`, using the same count control and "Save as format for next visit" action as CO2.
  Existing Draft rows are normalized without replacing text already entered. The former single-row
  free-add/remove path had no documented Wet Chemical-specific requirement; a technician can still
  choose any row count up to the form maximum. `wetChemicalRowPresetReuse.test.ts` checks the actual
  blank-response initializer and preservation of older Draft text. Focused row-preset/count tests
  passed (9/9), including unchanged `suppressionDetectorRowCount.test.ts`; web typecheck and build
  passed. **Live browser walkthrough passed** against disposable PostgreSQL and the current Vite
  source: technician proposed "Hood Annex" through "Add a New Location"; Supervisor approved it;
  technician started a new visit, opened its real Wet Chemical form, set two detector rows, entered
  "Kitchen Zone A"/"Hood A" and "Kitchen Zone B"/"Hood B", and saved them as the format;
  Supervisor saw both rows and approved. The active customer configuration held
  `preset_row_count=2` and those exact `row_preset.rows`. On a further new visit, Hood Annex opened
  with both rows already prefilled, observed directly in the browser. The test-only API, Vite,
  proxy, PostgreSQL container, credentials, and seed helpers were removed afterward.
  **P2 follow-up:** The existing-zone radio appears selected on a fresh "Add a New Location"
  draft, but Submit remains disabled until the technician explicitly reselects that zone (the
  new-zone → existing-zone toggle worked). This predates the Wet Chemical row change and belongs
  to the next proposal-screen acceptance pass. No API, migration, FM200, or patch-merge files
  were changed for this follow-up.

- 2026-09-29 — **Location Proposals redesigned to a patch model (uncommitted; stop before staging).**
  Owner feedback after using the previous design (entry directly below) in the real app surfaced it had
  the workflow backwards, plus a real correctness bug. Full redesign:
  - **The problem.** (1) The standalone "Propose Customer Locations" screen asked a technician to
    invent zone/location structure — including row count — *before* doing any real inspection work.
    What's actually wanted: fill the real form, then save what was *actually entered* as the format for
    next time. (2) That screen never loaded the customer's currently-approved locations before
    submitting; since Approve does a full replace (`applyManagerLocationsUpdate`), using it on an
    already-configured customer would silently propose to WIPE OUT existing locations. (3) `rowPreset`
    (a JSONB column that already existed end-to-end — write path, job-freeze, and a client-side reader
    for Hydrant/Dry-Wet-Riser/Fire-Rated-Roller-Shutter's `assetReference` field) was never read by
    CO2/FM200's own detector-row generator (`detectorRowCount.ts`), so "reuse the same rows next visit"
    had no reader on the one path that mattered for this task.
  - **Data model.** `customer_location_proposals.payload` changes shape from "the complete desired
    `{zones, locations}`" to a scoped PATCH (new types + parser + pure merge function in
    `apps/api/src/inspections/locationConfiguration.ts`): `add-location` (`locationKey`, `displayName`,
    `zoneKey` OR `newZone` — exactly one) names a brand-new location with no real content yet;
    `update-format` (`locationKey`, `rows: Array<{alarmZone, location}>`) replaces an EXISTING
    location's `presetRowCount` (= `rows.length`) and `rowPreset` (`{rows}`) in place, leaving every
    other zone/location of the system byte-identical. No migration needed — the `payload` column was
    already an unconstrained `JSONB`; only what the app considers a valid shape changed.
  - **API (`locationProposals.ts`).** Submission parses `{id, jobId, patch}`, not `{id, jobId, zones,
    locations}`. **One-pending-per-target, not per-system**: both patch kinds carry `locationKey`, so
    the advisory-lock key and the "already pending" check both become
    `customerId:systemKey:patch.locationKey` (extracted via `payload->>'locationKey'`) — an
    `add-location` proposal for "TNB Room" and an `update-format` proposal for "General" on the SAME
    system can now be pending, and approved, independently. **Approve no longer trusts the stored
    payload as the whole picture**: it now does `loadConfiguration` (newly exported from
    `managerCustomers.ts`) to read the customer's CURRENT configuration fresh, extracts this system's
    `{zones, locations}`, applies the patch (`applyLocationProposalPatch`), and only then calls
    `applyManagerLocationsUpdate` with the merged result — `LOCATION_PROPOSAL_TARGET_INVALID` (409) if
    the patch's target no longer exists (renamed/removed since submission). This is what makes two
    proposals for different locations of the same system safe to approve in either order without
    clobbering each other, proven directly in the integration test.
  - **Web — technician.** `TechnicianLocationProposal.tsx` (still the job-screen entry point, now
    labeled "Add a New Location") is trimmed to just the `add-location` case: pick an existing zone
    (read straight from the job's frozen snapshot — good enough for picking, since Approve
    re-validates against live state anyway) or name a new one, name the location, submit. New "Save as
    format for next visit" action inside `Co2InspectionForm.tsx` and `Fm200InspectionForm.tsx` (next
    to Save Draft; available any time from Draft, per the owner's explicit answer — reads whatever's
    currently typed, submit not required) builds an `update-format` patch from the form's current
    `detectorRows` and queues it through the same offline-first draft/outbox mechanics.
    `technicianLocationProposalDraft.ts` keeps its Draft→Pending→Syncing→Synced/Failed IndexedDB-first
    design (unchanged, still exactly right for the Offline Contract) but the draft key becomes
    `technician-location-proposal:${jobId}:${systemKey}:${targetLocationKey}` so an add-location draft
    and an update-format draft for the same job+system coexist locally without collision.
  - **The actual payoff (`detectorRowCount.ts`).** New `configuredRowPresets(system, instance)` reads
    `location.rowPreset.rows[]`; `newDetectorRow` gained an optional preset param; `normalizeDetectorRows`
    now pre-fills each newly-created "configured" row's `alarmZone`/`location` from the saved preset by
    index, falling back to today's blank/instance-name defaults on anything malformed or missing (fails
    closed, never crashes — proven by dedicated tests). This only fills the GAP at first creation of a
    blank draft; it never retroactively rewrites a row a technician has already started editing.
  - **Wet Chemical gap (pre-existing, not introduced by this change, not fixed here).**
    `co2Repository.ts`'s `blankResponses` only runs the `presetRowCount`-driven multi-row branch for
    `systemKey === "co2_fire_extinguisher"`; Wet Chemical falls into a single-row `legacyDetectorRow`
    branch that never reads `presetRowCount` or `rowPreset` at all. `add-location`
    (structural — new named locations) works identically for Wet Chemical; `update-format` /
    row-content reuse does not take effect for it until that pre-existing branch is addressed
    separately — left as a known limitation rather than folded into this change's scope.
  - **Tests.** `locationConfiguration.test.ts` (new: 11 unit tests for `parseLocationProposalPatch` /
    `applyLocationProposalPatch` — both patch kinds, every rejection path, byte-identical-untouched-
    locations assertion). `locationProposals.integration.test.ts` (rewritten for the patch shape;
    proves the two-independent-pending-targets scenario end to end against a disposable Postgres, with
    sequential approval order and a DB-level check that neither location's row survives incorrectly).
    `managerLocations.integration.test.ts` re-run — **PASS, no regression** (4/4; `loadConfiguration`
    export and `applyManagerLocationsUpdate` call site unchanged in behaviour). `detectorRowPresetReuse.test.ts`
    (new: pre-fill payoff, fail-closed-on-malformed-rowPreset, gap-fill-only-at-creation semantics — 5
    tests). `suppressionDetectorRowCount.test.ts` (the other session's existing tests) re-run — **PASS,
    no regression** (2/2). `technician-location-proposal-sync.html`/`.spec.ts` rewritten for the patch-
    shaped draft mechanics (both kinds, independent-target coexistence, Failed-preservation, exact-UUID
    confirmation). `roleAccess.test.ts` re-run — **PASS** (3/3, unaffected). `apps/api` + `apps/web`
    `typecheck` and `build` — **PASS**. `git diff --check` — clean (CRLF warnings only).
  - **Manual browser walkthrough (real, non-Docker dev stack, same discipline as the prior pass;
    disposable Postgres removed and temporary Vite proxy reverted afterward).** Seeded a customer with
    CO2 enabled and zero locations. As technician: added "TNB Room" and "Dust Room" (two separate
    `add-location` proposals) via the trimmed screen. As supervisor: both showed in the Pending list
    with a real per-kind summary line; approved TNB Room, then Dust Room — DB query confirmed both
    survived as separate `customer_system_locations` rows. As technician: started a NEW service visit
    for the same customer — confirmed both "TNB Room" and "Dust Room" appeared as independent CO2 form
    instances (the point-2 payoff). Opened TNB Room's form, set detector count to 2, typed "Zone A" /
    "Zone A Room" and "Zone B" / "Zone B Room" into the two rows, clicked "Save as format for next
    visit" — confirmed "Submitted for Supervisor review." As supervisor: the proposal's detail view
    listed both rows verbatim; approved it — DB query confirmed `preset_row_count=2` and the exact
    `row_preset.rows` JSON. As technician: started a THIRD service visit for the same customer, opened
    TNB Room's form — **it opened with 2 detector rows already pre-filled with "Zone A"/"Zone A Room"
    and "Zone B"/"Zone B Room"**, the actual point-1 payoff, observed directly in the browser's
    accessibility tree, not inferred.
  - **Known limitations.** Wet Chemical's row-content reuse (see above). No technician-facing view of
    a proposal's later decision (unchanged from the prior entry). The Manager review screen shows an
    `add-location` patch's `zoneKey` as a raw key rather than resolving it to the zone's current
    display name (cosmetic; the key is still legible, e.g. "zone: server-room" — noted as a nice-to-
    have in the plan, not done this pass).
  - **Files changed:** `apps/api/src/inspections/locationConfiguration.ts` (patch types/parser/merge),
    `apps/api/src/inspections/locationConfiguration.test.ts` (new), `apps/api/src/inspections/locationProposal.ts`
    (payload type), `apps/api/src/routes/locationProposals.ts` (patch submission/approve-merge/per-target
    pending lock), `apps/api/src/routes/locationProposals.integration.test.ts` (rewritten),
    `apps/api/src/routes/managerCustomers.ts` (`export` on `loadConfiguration`),
    `apps/web/src/co2/Co2InspectionForm.tsx` / `apps/web/src/fm200/Fm200InspectionForm.tsx` (Save as
    format action), `apps/web/src/co2/co2Repository.ts` / `apps/web/src/fm200/fm200Repository.ts`
    (pass row presets into `blankResponses`), `apps/web/src/co2/detectorRowCount.ts`
    (`configuredRowPresets`, preset-aware `newDetectorRow`/`normalizeDetectorRows`),
    `apps/web/tests/detectorRowPresetReuse.test.ts` (new), `apps/web/src/App.tsx` (`actorUserId`/
    `canUseServer` props threaded to both forms), `apps/web/src/jobs/TechnicianHome.tsx` (button
    relabel), `apps/web/src/jobs/TechnicianLocationProposal.tsx` (trimmed to add-location),
    `apps/web/src/jobs/technicianLocationProposalDraft.ts` (patch union, per-target draft keys),
    `apps/web/src/manager/managerApi.ts` (patch union types), `apps/web/src/manager/ManagerLocationProposals.tsx`
    (per-kind rendering), `apps/web/src/referenceData/referenceDataApi.ts` (patch-shaped submission
    input), `apps/web/tests/technician-location-proposal-sync.html`/`.spec.ts` (rewritten).

- 2026-09-29 — **Technician-proposed, Supervisor-approved customer locations. Reviewed for commit at owner request.**
  Today, zones/locations for CO2/Wet Chemical/FM200 could only be configured in advance by a Manager
  (`ManagerLocationsEditor` / `PUT /manager/customers/:id/systems/:systemKey/locations`). This adds a
  standalone review flow: a technician drafts the real zone/location breakdown on-site (offline-first,
  IndexedDB-first per the Offline Contract), submits it, and a Supervisor/Admin approves or rejects it
  before it becomes the customer's real, versioned configuration. **Deliberately decoupled from the live
  CO2/FM200 inspection form** — the server validates a submitted `configuredLocationId` against the job's
  already-frozen `configuration_snapshot`, so a locally-drafted id can never pass that check; `co2Repository.ts`,
  `co2FormInstanceSync.ts`, `fm200Repository.ts` and their FM200 sync counterpart are untouched.
  - **Data model (migration 048, additive; 046 Roller Shutter remains separate, and 047 belongs to the photo-source fix).**
    `customer_location_proposals` (one immutable row per technician submission, PK is the technician's own
    client-generated UUID) + `customer_location_proposal_decisions` (append-only decision log, same shape as
    `report_approvals`), both with append-only triggers. Status is DERIVED
    (`apps/api/src/inspections/locationProposal.ts`), never read off a mutable column. **Both decisions are
    terminal** — no withdraw, no re-decision, unlike report approval's withdraw/re-approve cycle; a technician
    who wants to try again submits a fresh proposal (new UUID).
  - **API.** New `apps/api/src/routes/locationProposals.ts`: `POST /technician/customers/:customerId/systems/:systemKey/location-proposals`
    (`requireRole("inspector")`, idempotent on the client id, one pending proposal at a time per
    customer+system via `pg_advisory_xact_lock`); `GET /manager/location-proposals[?status=]` and
    `GET /manager/location-proposals/:id`; `POST /manager/location-proposals/:id/decision`
    (`requireRoleAudited(admin, supervisor)`, reject requires a 3–500 char note, approve's is optional,
    advisory-lock + fingerprint-replay idempotency mirroring `reportApprovals.ts`). **Approve reuses the real
    save path**: extracted `applyManagerLocationsUpdate` out of `managerCustomers.ts`'s PUT locations handler
    (byte-for-byte the same write, re-validated against current customer state at decision time — never
    trusting the state the proposal was drafted against); the PUT route now calls it too, and its
    now-redundant validation-only `loadLocationsContext` call was dropped.
  - **Web — technician.** New `technicianLocationProposalDraft.ts` (modeled on `technicianCustomerDraft.ts`,
    the closest "technician creates something offline that becomes real via server confirmation" precedent),
    IndexedDB `drafts` row keyed per `(jobId, systemKey)` so reopening the job resumes the draft;
    `syncEngine.ts` wires `syncPendingLocationProposals` into the main sync loop (excluded from the generic
    dispatch branch, same as `commonRemark`/`technicianCustomer`). Entry point ("Propose Customer Locations")
    always visible on the job screen in `TechnicianHome.tsx`, not gated on the customer having zero locations
    configured. New screen `TechnicianLocationProposal.tsx`, new route `location-proposal/:jobId` in `App.tsx`.
    No Dexie schema version bump — `drafts`/`syncOutbox` are already generic tables; only `SyncOutboxItem.entityType`'s
    TS union widened.
  - **Web — supervisor/admin.** New `ManagerLocationProposals.tsx` (list + read-only drill-in preview +
    Approve/Reject), new route `manager-location-proposals` added to `roleAccess.ts`'s `supervisorRoutes` and
    to `managerNavLinks` in `ManagerHome.tsx` for both roles. `managerApi.ts` additions: `loadLocationProposals`,
    `loadLocationProposal`, `decideLocationProposal`, all with hardened response validators (poisoned-shape
    responses route to `onAuthorityFailure`, never a render-time crash, same discipline as the existing
    `ManagerLocations` validators).
  - **Tests.** `locationProposal.test.ts` (pure derivation unit tests). `locationProposals.integration.test.ts`
    (disposable Postgres: submission idempotency, one-pending-per-customer+system, auth matrix, malformed
    payload rejected pre-write, terminal Approve producing a real configuration revision verified against
    `customer_system_locations`, terminal Reject with `resultingRevisionId: null`, decision idempotent replay
    + reused-request-id conflict, append-only triggers) — **PASS**. `managerLocations.integration.test.ts`
    re-run after the `applyManagerLocationsUpdate` extraction — **PASS, no regression** (4/4). New Playwright
    `technician-location-proposal-sync.spec.ts` (real Dexie/IndexedDB in a real browser tab, no
    fake-indexeddb dependency added: save/reload persistence, empty-payload validation refused locally,
    Pending→Failed preservation on a network error, retry-to-Synced, and the exact-UUID confirmation rule — a
    server response naming a different id must never be trusted as success) — **PASS**. `roleAccess.test.ts`
    gained a case for the new supervisor route — **PASS (3/3)**. `apps/api` + `apps/web` `typecheck` and
    `build` — **PASS**. `git diff --check` — clean (pre-existing CRLF warnings only, on files this task did
    not touch).
  - **Manual browser walkthrough (real, non-Docker dev stack: disposable Postgres on 55432 + `apps/api`
    dev server + `apps/web` Vite dev server behind a temporary local `/api` proxy, reverted after the
    check).** Logged in as a seeded technician, opened a job with CO2 enabled and no locations
    configured, clicked "Propose Customer Locations", added a zone + location, submitted; the local
    Draft → Pending → Synced transition and the real `POST .../location-proposals` round trip both
    worked. Signed out, logged in as a seeded supervisor, opened Location Proposals, saw the pending
    item with its zone/location counts, drilled into the read-only preview (matched exactly what the
    technician entered), and Approved with no note. **This caught a real P1**: `submittedByUserId`
    is a `BIGINT` column and `pg` returns it as a *string*, but the web client's `isLocationProposal`
    validator required `Number.isSafeInteger` — every GET/POST response silently failed client-side
    validation and was misreported as "Manager server data is currently unavailable", logging the
    reviewer out to the role-selection screen instead of showing the list. **Fixed**: added `::int` to
    both `submitted_by_user_id` selects in `locationProposal.ts` (`loadLocationProposal` /
    `listLocationProposals`), matching the existing `id::int AS id` convention already used in
    `managerTechnicians.ts`. Added regression assertions in `locationProposals.integration.test.ts`
    (`typeof … === "number"` on all three response shapes: submission response, list, detail) so this
    class of bug fails a test next time instead of only a browser. Re-verified end to end after the
    fix: the supervisor's Approve wrote `customer_system_zones`/`customer_system_locations` rows
    matching exactly what the technician had typed, queried directly against Postgres.
  - **Review follow-up.** Submission now requires a real, owned, non-sample job for the target customer
    with the proposed system in its frozen snapshot; an unrelated technician cannot replay its UUID.
    Migration 048 keeps the validated job UUID as immutable audit context without a foreign key,
    allowing deletion of an unfinished visit without mutating the append-only proposal. The disposable-
    Postgres integration test covers these cases and passed after the changes.
  - **Known limitations / out of scope.** No technician-facing view of a proposal's later decision (Approved/
    Rejected) once submitted — the local draft only tracks *sync* status (Draft/Pending/Failed/Synced), not
    the server-side review outcome; a technician who wants to check would need the Supervisor/Admin to tell
    them, or a future "my proposals" read view. No UI surfaces the `LOCATION_PROPOSAL_ALREADY_PENDING` 409 with a
    friendly message beyond the generic Failed-with-reason banner.
  - **Rollback.** Fully additive; no existing route, table, or column was changed in a breaking way. To roll
    back: revert this changeset (all new files can simply be deleted; `managerCustomers.ts`'s PUT locations
    route and `migrations.ts`/`server.ts`/`syncEngine.ts`/`TechnicianHome.tsx`/`roleAccess.ts`/`ManagerHome.tsx`
    changes are additive edits, safe to revert directly). Migration 048 only creates new tables — no existing
    table was altered, so no down-migration is needed beyond `DROP TABLE customer_location_proposal_decisions,
    customer_location_proposals CASCADE` on a database that has not yet had a real proposal approved (an
    approved proposal's resulting `customer_configuration_revisions` row is untouched by that drop, since
    `resulting_revision_id` only references it, never the reverse).
  - **Files changed:** `apps/api/migrations/048_customer_location_proposals.sql` (new),
    `apps/api/src/db/migrations.ts`, `apps/api/src/inspections/locationProposal.ts` (new),
    `apps/api/src/inspections/locationProposal.test.ts` (new), `apps/api/src/routes/locationProposals.ts` (new),
    `apps/api/src/routes/locationProposals.integration.test.ts` (new), `apps/api/src/routes/managerCustomers.ts`,
    `apps/api/src/server.ts`, `apps/web/package.json`, `apps/web/src/App.tsx`, `apps/web/src/db/localDatabase.ts`,
    `apps/web/src/jobs/TechnicianHome.tsx`, `apps/web/src/jobs/TechnicianLocationProposal.tsx` (new),
    `apps/web/src/jobs/technicianLocationProposalDraft.ts` (new), `apps/web/src/manager/ManagerHome.tsx`,
    `apps/web/src/manager/ManagerLocationProposals.tsx` (new), `apps/web/src/manager/managerApi.ts`,
    `apps/web/src/manager/roleAccess.ts`, `apps/web/src/referenceData/referenceDataApi.ts`,
    `apps/web/src/sync/syncEngine.ts`, `apps/web/tests/roleAccess.test.ts`,
    `apps/web/tests/technician-location-proposal-sync.html` (new),
    `apps/web/tests/technician-location-proposal-sync.spec.ts` (new).

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
