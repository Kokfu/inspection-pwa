# Manager Approvals, Settings and Proposal Filters — Prompts

Status, decisions (D1–D14) and the D0 structure: [PROGRESS_STATUS.md](PROGRESS_STATUS.md).
A prompt is ready to paste only when PROGRESS_STATUS.md §2 marks it ✅. Paste the Standing rules block first, then the task block.

```
Wave A (parallel, disjoint files)   A1 proposal filters + Site Requests tabs | A2 offline audit (read-only) | B0 report-approval API
Wave B (after A1 and B0 are reviewed)  B1 Approvals hub + Service Reports list + Settings page
Later                                  P1 visual polish
```

---

## Standing rules (paste at the top of EVERY prompt below)

```
Project: Inspection PWA (C:\PWA_OfflineRecordWebApp). Read AGENTS.md first.
Follow .agents/skills/codex-task-brief/SKILL.md for the report format (DoD table, files changed, verdict line).
These are web-only UI tasks: the V7 API/integration gates in that skill do not apply; use the gates below.
Read applicable skills before editing: .agents/skills/mobile-first-ui, .agents/skills/backend-api-security
(manager authority / fail-closed), .agents/skills/pwa-release-testing. Pair with .claude/skills/web-design-guidelines.
- Git is mine. Never stage, commit, push, merge, reset, restore, switch branch or touch stash. Stop before staging.
- Do NOT change: Postgres migrations/schema, any API file, Dexie schema/version/indexes, package-lock, Docker/Caddy/.env,
  client-material/. No API change or migration is needed; if you think one is, STOP and report instead.
- Role names: code role `admin` is shown as "Manager"; code role `supervisor` is shown as "Admin". Do not rename roles.
- Inspect the existing implementation first; copy proven patterns (ManagerLocationProposals tabs, ManagerEmailReminders
  search form) rather than inventing.
- Smallest change, no unrelated refactor, existing behaviour unchanged unless stated. Decision flows (approve / reject,
  confirmation, idempotent requestId, server re-read) must stay exactly as they are.
- Validation fails closed; no silent fallback; never weaken an existing test.
- Mobile first: works at 360 px with no horizontal scroll, touch targets >= 44 px, design tokens only, visible focus.
- Add focused regression tests for what you change.
- Gates (apps/web): focused specs, relevant regression specs, `npm run typecheck`, `npm run build`; then `git diff --check`.
- Final report: files changed (one-line reason each), behaviour changed, tests run with results, P0/P1/P2 findings,
  limitations, readiness for next step, verdict line `SAFE FOR REVIEW: Y/N`. Do not claim a phone/offline/browser test you did
  not perform.
```

---

## A1 — Site Requests tabs + customer filter + search on both proposal pages (Wave A)

Status: ✅ ready (D0 approved 2026-10-20).

```
<Standing rules>

TASK
Owner decisions: D1–D4 in docs/manager-approvals-settings/PROGRESS_STATUS.md §3.

Files you may edit: apps/web/src/manager/ManagerSiteProposals.tsx, managerSiteProposals.css,
apps/web/src/manager/ManagerLocationProposals.tsx, managerLocationProposals.css, ONE new shared module
apps/web/src/manager/proposalFilters.ts(x) (filter bar + pure matcher), apps/web/tests/* for new/updated specs and unit tests,
apps/web/package.json "scripts" only to register a new test script.
Do NOT edit managerApi.ts, ManagerHome.tsx, App.tsx, roleAccess.ts, AppShell.tsx, or any API file.

1. Site Requests status tabs (D1, D2)
   - Tabs Pending / Approved / Rejected (NO Withdrawn), same markup, keyboard behaviour (Arrow/Home/End, roving tabIndex) and
     look as ManagerLocationProposals. Opens on Pending. Each tab label shows its count from the loaded list, e.g. "Pending (3)".
   - The existing single GET already returns every status: filter in the browser; do not add a status query or a second request.
   - Switching tab while a review note is unsaved must use the existing leave() confirmation.
   - After a confirmed decision the item leaves the Pending tab on the refreshed list; the confirmed detail stays visible as today.
   - Empty state per tab: "No pending site requests." / "No approved site requests." / "No rejected site requests."
   - Show the visit number (jobReference) on the card when present, so a search by visit number is visible on the card.

2. Shared filter bar (both pages) (D3, D4)
   - Order on the page: tabs, then the customer dropdown, then the search form, then the list.
   - Customer dropdown (label "Customer"): first option "All customers", then the distinct customers that have requests IN
     THE CURRENTLY SELECTED TAB, sorted A–Z (locale compare), keyed by customerId (two customers with the same display name
     stay separate options). It applies AS SOON AS it changes (no Search press needed).
     If the selected customer has no requests in a newly selected tab, reset the dropdown to "All customers" and say so in
     the result line ("Customer filter cleared: no <tab> requests for <name>.").
   - Search input (type="search", label "Search requests", maxLength 200) + "Search" and "Clear" buttons, inside a
     role="search" form like ManagerEmailReminders. The text filter applies ONLY when Search is pressed (or Enter submits);
     typing alone does not filter. Clear empties the input and removes the text filter (the customer filter stays).
   - No date/time filter.
   - Matching: trimmed, case-insensitive substring (toLocaleLowerCase); customer filter AND text filter AND the tab.
     Fields matched (only those the type has):
       Site Requests: customerDisplayName, proposedDisplayName (site name), proposedAddress, submittedBy, jobReference.
       Location Proposals: customerDisplayName, systemDisplayName, add-location displayName and new-zone name,
       update-format row text (locationText / location / zoneText / alarmZone / assetReference), submittedBy, jobReference.
       (If jobReference is not on the Location Proposal list item, do not add an API field: report it as a limitation.)
   - Put the pure matcher in proposalFilters.ts so it is unit tested without a browser.
   - Result line under the filter bar when a filter is active: "Showing N of M requests" (role="status").
     No-match empty state: "No requests match this filter." with the Clear button reachable.
   - Tab counts stay UNFILTERED (they are the real pending numbers).
   - Filters persist when switching tabs and when opening/closing a detail. They are not saved across reloads.
   - The currently open detail is not closed by a filter change; if it is filtered out of the list it stays open.

3. Location Proposals: keep its tabs, its per-tab server request and the unreadable-proposal notice exactly as they are; only
   add the filter bar from step 2. The unreadable notice is never hidden by a filter.

DoD ADDITIONS
- Unit tests for the matcher: each field matches; case/whitespace; AND of customer + text; same-name different customers.
- Extend tests/supervisor-site-proposals.spec.ts (or add a sibling spec): opens on Pending; tabs show counts; Approved/Rejected
  items hidden until their tab; keyboard tab navigation; customer dropdown lists only customers with requests; search applies
  only on Search; Clear; filters persist across tabs; decision flow unchanged (existing assertions still pass).
- Extend tests/supervisor-location-proposals.spec.ts (or sibling): filter bar present, search + customer filter work,
  unreadable notice still shown, existing assertions still pass.
- Re-run: test:location-proposal-list, manager-dashboard-navigation.spec.ts, manager-navigation-request-count.spec.ts,
  test:mobile-css.
- 360 px screenshot of both pages with the filter bar (no horizontal overflow).

STOP when the DoD table is green. Print files changed. Do NOT commit.
```

---

## A2 — Technician offline / online audit (Wave A, read-only)

Status: ✅ ready.

```
<Standing rules>

TASK — READ-ONLY AUDIT. Do not modify any source, test, config or doc file except the one output file below.
Read additionally: .agents/skills/offline-first-pwa, .agents/skills/sync-engine, .agents/skills/indexeddb-data-model,
docs/architecture/02-offline-first-contract.md, 03-sync-protocol.md, 12-offline-photo-evidence.md,
docs/testing/PHONE_TESTING_STATUS.md (§4 rows, the issue register, the I-02 decision brief), apps/web/src/sync/README.md,
apps/web/src/pwa/README.md.

Write docs/manager-approvals-settings/OFFLINE_AUDIT.md with:

1. Plain-language summary (for the owner, max 15 lines): what a technician can and cannot do with no signal today.
2. Capability matrix, one row per technician action, columns: Online | Offline (no network) | Server unreachable with Wi-Fi
   up | Evidence (file:line) | Last phone-verified (build/date from PHONE_TESTING_STATUS.md, or "not phone-tested").
   Actions at least: sign in / session restore; job list; Download for offline; New Service Visit (cached vs no cached
   customers/sites); Add Customer; Add new site; open each of the 11 systems on a prepared vs unprepared job; draft/autosave;
   camera photo; Submit Locally; sync trigger and order; view accepted inspection; Final Report / PDF; Complete job;
   Delete job; repair visits (create, Not Done, Compare, submit); location proposals (create, withdraw, revise); sign out.
3. The logic, short and exact: auth restore and "verifying" state; offline readiness; IndexedDB stores used; outbox
   statuses Pending/Syncing/Synced/Failed/Conflict and who sets them; what triggers sync (reconnect, visibility, timers,
   manual); ordering (visit -> inspection -> evidence -> attachments); idempotency and exact-UUID confirmation;
   retry/backoff; what survives refresh / force-close / app update.
4. Issues found, each with: id (OA-1..), severity P0–P3 per AGENTS.md, what goes wrong for the technician, evidence
   (file:line or test record), whether it violates the Offline Contract in AGENTS.md, suggested fix and size, and whether it
   needs a migration / API change. Include and re-check the status of: PHONE-SAVE-01, I-68, I-69, I-70, L-6, the I-02 A1
   gate inconsistency (5 systems gated vs 6 not), offline Add new site (S4), offline Add Customer.
5. Gaps in verification: what has never been tested on a phone or offline.

Rules: evidence or it did not happen; state plainly what you only read versus what you ran. You may RUN existing unit and
Playwright specs to confirm behaviour (report the commands and results); do not add or change tests. No phone tests.

DoD ADDITIONS
- OFFLINE_AUDIT.md exists, every matrix cell has a value, every issue has evidence.
- `git status --short` shows only that new file changed by you.

STOP after writing the file. Print its summary section. Do NOT commit.
```

---

## B0 — Report approvals awaiting decision: API list + count (Wave A, parallel)

Status: ✅ ready (D0 approved 2026-10-20).

```
<Standing rules>

OVERRIDE of the standing rules for THIS task only: API files may be edited (listed below); NO web file may be edited.
Read additionally: .agents/skills/backend-api-security (authoritative), .agents/skills/codex-task-brief test-DB discipline
(disposable Postgres on 127.0.0.1:55432 only; never the runtime database). Level 2: authentication, role scoping, fail-closed.

TASK
Owner decision D14 in docs/manager-approvals-settings/PROGRESS_STATUS.md. The web Approvals hub needs (a) the number of
service visits whose report is awaiting approval and (b) the list of those visits. Today report approval is derived per visit
in TypeScript (apps/api/src/reports/reportApproval.ts deriveReportApproval / visitReportApproval) and
GET /manager/service-visits (apps/api/src/routes/managerServiceVisits.ts) is paginated with no approval filter.

Files you may edit: apps/api/src/routes/managerServiceVisits.ts (or ONE new route file mounted the same way),
apps/api/src/reports/reportApproval.ts (only to export/reuse helpers, behaviour unchanged), the app/router mount file only if
a new route file needs mounting, and API tests. No migration, no schema change, no web file.

1. Add a read-only way to get service visits whose report approval status is "awaiting_approval" (this includes
   "Re-approval needed", i.e. corrected after approval). Preferred shape: a validated optional query parameter on
   GET /manager/service-visits, e.g. `reportApproval=awaiting_approval`, that keeps the existing pagination, `totalCount`
   and response shape. If that is not clean, a new GET /manager/report-approvals/awaiting endpoint returning
   `{ serviceVisits, nextCursor, totalCount }` in the same item shape. Explain your choice in the report.
2. The approval status MUST come from the same derivation as the existing per-visit `reportApproval` field. Either reuse
   visitReportApproval/deriveReportApproval in TypeScript, or, if you derive it in SQL, add a parity test proving the SQL
   result equals deriveReportApproval for every case (no events, approved, withdrawn, approved then corrected, not_applicable).
   Never return a visit as awaiting when the per-visit field would say otherwise, and vice versa.
3. Authorization unchanged: roles admin + supervisor only; a supervisor (UI "Admin") sees only the visits the existing
   supervisor scoping (`supervisorId`) allows; inspector 403; unauthenticated 401. Unknown/invalid parameter values -> 400
   with a specific error code (fail closed, like INVALID_STATUS). `Cache-Control: private, no-store`.
4. Order: oldest awaiting first (completion time ascending, then id) so the longest-waiting report is on top. Keep
   `totalCount` = full count regardless of cursor/limit (the web card badge uses it with limit=1).

DoD ADDITIONS
- Integration tests on the disposable Postgres: counts and items for each derivation case; correction after approval
  re-enters the list; withdrawn re-enters; approved leaves; not_applicable never listed; supervisor scoping; 401/403/400;
  pagination + totalCount; existing GET /manager/service-visits behaviour byte-for-byte unchanged without the parameter
  (existing managerServiceVisits.test.ts and reportApprovals.integration.test.ts still pass).
- API typecheck + build; `git diff --check`.
- Report the exact request/response contract for B1 (path, params, response keys, error codes).

STOP when the DoD table is green. Print files changed + the reproducible test command block. Do NOT commit.
```

---

## B1 — Approvals hub + Service Reports list + Settings page (Wave B)

Status: ⏸ paste after A1 and B0 are reviewed (fill B0's final contract into step 4).

```
<Standing rules>

TASK
Owner decisions: D5–D13 and the D0 structure in docs/manager-approvals-settings/PROGRESS_STATUS.md §3 and §5.

Files you may edit: apps/web/src/App.tsx (routes, parsing, hrefs, rendering, back buttons, active sidebar item),
apps/web/src/manager/ManagerHome.tsx (managerNavLinks + Home cards), apps/web/src/manager/roleAccess.ts,
apps/web/src/layout/AppShell.tsx (icons only), apps/web/src/manager/managerApi.ts (ONE new loader for the B0 endpoint),
NEW apps/web/src/manager/ManagerApprovals.tsx (+ css), NEW apps/web/src/manager/ManagerReportApprovals.tsx (+ css),
NEW apps/web/src/manager/ManagerSettings.tsx (+ css), apps/web/tests/*, package.json "scripts" only.
Only to change a heading/eyebrow or back link: ManagerSiteProposals.tsx, ManagerLocationProposals.tsx,
repairVisits/ManagerRepairVisits.tsx, ManagerEmailReminders.tsx, the Company Profile page. No API file.

1. Approvals hub (route `manager-approvals`, `#/manager-approvals`; roles admin + supervisor)
   - Sidebar: "Approvals" replaces "Location Proposals", "Site Requests" AND "Repair Visits" in BOTH role lists. Position:
     Manager list = after "Service Catalog" (before Settings); Admin list = last.
   - Page: heading "Approvals"; 4 cards in this order, each a button opening its page:
       Location proposals ("Location and format changes")  -> manager-location-proposals
       Site requests ("New sites from technicians")         -> manager-site-proposals
       Repair visits ("Approve or return to technician")    -> manager-repairs
       Service reports ("Reports awaiting approval")        -> manager-report-approvals (new, step 4)
   - Each card: red round count badge (danger fill token + on-danger text, min 20 px, aria-label "N pending") when its
     pending count > 0; nothing when 0; nothing (never a fake 0) when the count cannot be loaded. Counts load independently;
     a count failure never blocks the hub; authorization failure -> onAuthorityFailure (copy the ManagerHome pattern).
     Counts: Location = loadLocationProposals("pending").counts.pending; Site = site proposals with status pending;
     Repair = loadRepairVisits() items with status "awaiting_approval"; Service reports = B0 totalCount (limit=1).
   - Sidebar "Approvals" item: NO badge.

2. Home (D10, D13): the card grid still comes from managerNavLinks(), so it shows "Approvals" (and "Settings" for the
   Manager). The Approvals card shows the TOTAL pending count (sum of the 4) only when all 4 counts loaded; otherwise no
   number. Remove the old per-card "Pending: N" chips. KPI tiles, charts, compliance reminders unchanged.
   Share the count loading between Home and the hub (one small hook/module), do not duplicate it.

3. Settings hub (route `manager-settings`, `#/manager-settings`; role admin = Manager ONLY; a supervisor is refused exactly
   like other Manager-only routes in roleAccess.ts)
   - Sidebar "Settings" is LAST in the Manager list; absent from the Admin list.
   - Heading "Settings"; 2 cards: Email reminders ("Sender and recipients") -> manager-email-reminders;
     Company profile ("Name, address, logo") -> manager-company-profile. Both leave the top-level list.
   - "Service Catalog" and "Service Common Remarks" stay top-level, unchanged.

4. Service reports list (route `manager-report-approvals`, `#/manager-report-approvals`; admin + supervisor)
   - Uses the B0 endpoint: <paste B0's final contract here>. Shows customer, SV number, completed date, and a chip
     "Awaiting approval" or "Re-approval needed" (same wording as ManagerOperations ReportApprovalChip). Oldest first,
     "Load more" for the next cursor. Tapping a row opens the EXISTING visit report screen where Approve already lives
     (the same navigation ManagerOperations uses); after approving, returning here re-fetches the list.
   - Load failure: role="alert" message + "Retry"; authorization failure -> onAuthorityFailure; malformed response fails
     closed (validator like the other managerApi loaders). Empty state: "No reports are waiting for approval."

5. Old addresses keep working (D11): #/manager-location-proposals, #/manager-site-proposals, #/manager-repairs (and the
   repair visit detail route) open with the sidebar highlighting "Approvals"; #/manager-email-reminders and
   #/manager-company-profile open with the sidebar highlighting "Settings". Phone back buttons read "Back to Approvals" /
   "Back to Settings" and return to the hub. Access rules for each page stay exactly as today.

6. Icons: add `manager-approvals`, `manager-settings`, `manager-report-approvals` to AppShell ICONS (inline SVG, same stroke).

DoD ADDITIONS
- Update tests/manager-dashboard-navigation.spec.ts and tests/manager-navigation-request-count.spec.ts to the new
  navigation (list each assertion you changed and why; do not weaken what they protect).
- New spec(s): hub shows the 4 cards in order with correct red counts; 0 -> no badge; one count failing -> no badge on that
  card, others fine; each card opens its page; back returns to the hub; Home Approvals card total shown only when all 4
  loaded; old addresses work and highlight the parent; Settings last for the Manager, absent for the Admin; Admin opening
  #/manager-settings / #/manager-email-reminders is refused; Service reports list renders, paginates, retries, opens the
  report screen, and rejects a malformed response.
- Re-run: supervisor-site-proposals.spec.ts, supervisor-location-proposals.spec.ts, manager-email-reminders.spec.ts,
  manager-home-compliance-reminders.spec.ts, manager-final-report-navigation.spec.ts, technician-sidebar-navigation.spec.ts,
  the repair-visit manager specs, test:mobile-css, test:manager-app-auth.
- 360 px screenshots: phone Menu (Manager and Admin), Approvals hub, Service reports list, Settings hub.

STOP when the DoD table is green. Print files changed. Do NOT commit.
```

---

## Review prompt (after each task reports)

```
Review the uncommitted working tree for task <A1|A2|B0|B1> in docs/manager-approvals-settings/PROMPTS.md against HEAD.
Modify no file. Read AGENTS.md, PROGRESS_STATUS.md (decisions D1–D14 and the D0 structure in §5) and the skills the task lists.
- Confirm every TASK point and DoD item with file:line; give a concrete failing scenario for anything not met.
- Look for NEW defects: role/route access (supervisor must not reach Settings), fail-closed behaviour on load errors,
  decision-flow regressions, focus/keyboard, 360 px overflow, tests that were weakened rather than updated.
- Confirm no file outside the task's allowed list changed (`git status --short`) and `git diff --check` is clean.
- Re-run the task's gates.
Deliver: P0 count, P1 count, P2 list, NEW DEFECTS: Y/N, SAFE TO COMMIT: Y/N.
```
