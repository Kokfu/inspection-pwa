# Upcoming Services Redesign — Prompts

Status, decisions (D1–D5) and the approved UI: [PROGRESS_STATUS.md](PROGRESS_STATUS.md).
A prompt is ready to paste only when PROGRESS_STATUS.md §2 marks it ✅. Paste the Standing rules block first, then the task block.

```
U1  status helper + tests
U2 | U3  technician cards | manager table   (parallel, disjoint files)
R1  rebuild + browser/phone check
U4  calendar (last, after owner approves a mockup)
```

---

## Standing rules (paste at the top of EVERY prompt below)

```
Project: Inspection PWA (C:\PWA_OfflineRecordWebApp). Read AGENTS.md first.
Follow .agents/skills/codex-task-brief/SKILL.md for the report format (DoD table, files changed, verdict line).
These are web-only UI tasks: the V7 API/integration gates in that skill do not apply; use the gates below.
Read before editing: .agents/skills/mobile-first-ui, .agents/skills/pwa-release-testing,
.agents/skills/offline-first-pwa. Pair with .claude/skills/web-design-guidelines.
Owner decisions: docs/upcoming-services/PROGRESS_STATUS.md §3. Approved UI: §5.
- Git is mine. Never stage, commit, push, merge, reset, restore, switch branch or touch stash. Stop before staging.
- Do NOT change: Postgres migrations/schema, any API file, Dexie schema/version/indexes, package-lock, Docker/Caddy/.env,
  client-material/. No API change is needed; if you think one is, STOP and report instead.
- Role names: code role `admin` is shown as "Manager"; `supervisor` as "Admin". Do not rename roles.
- Inspect the existing implementation first (apps/web/src/manager/ManagerUpcomingServices.tsx,
  apps/web/src/jobs/TechnicianUpcomingServices.tsx, managerApi.ts loadUpcomingServices,
  referenceData/referenceDataApi.ts loadTechnicianUpcomingServices). Reuse proven patterns
  (proposalFilters.tsx filter chips/search, existing tab/menu markup) rather than inventing.
- Smallest change, no unrelated refactor. Save-date, ManagerReminderPlan and ManagerServiceRecurrence behaviour,
  onAuthorityFailure handling and fail-closed loading stay exactly as they are.
- Do not silently show stale rows after a failed or malformed load. Malformed dates fail closed (treated as an error
  state, never as "later").
- Mobile first: works at 360 px with no horizontal scroll, touch targets >= 44 px, design tokens only, visible focus,
  status is never colour-only (text label always present).
- Add focused regression tests for what you change. Never weaken an existing test; update expectations only where the
  approved layout changed, and say which.
- Gates (apps/web): focused specs, relevant regression specs (see PROGRESS_STATUS.md §4), `npm run typecheck`,
  `npm run build`; then `git diff --check`.
- Final report: files changed (one-line reason each), behaviour changed, tests run with results, P0/P1/P2 findings,
  limitations, readiness for next step, verdict line `SAFE FOR REVIEW: Y/N`. Do not claim a browser, phone or offline
  test you did not perform.
```

---

## U1 — Due-status helper + unit tests

Status: ✅ ready.

```
<Standing rules>

TASK
Create ONE pure module apps/web/src/schedule/dueStatus.ts (+ a unit test file under apps/web/tests/, registered as a script in
apps/web/package.json "scripts" only). No UI change in this task.

1. Export:
   - type DueStatus = "overdue" | "due_soon" | "later" | "not_scheduled"
   - type TechnicianGroup = "overdue" | "this_week" | "later" | "not_scheduled"
   - function daysUntilDue(dueDate: string | null, today: string): number | null   // date-only math
   - function classifyDue(dueDate: string | null, today: string): { status: DueStatus; days: number | null }
       overdue: days < 0 · due_soon: 0 <= days <= 30 · later: days > 30 · not_scheduled: dueDate null
   - function technicianGroup(dueDate: string | null, today: string): TechnicianGroup
       overdue: days < 0 · this_week: 0 <= days <= 7 · later: days > 7 · not_scheduled: null
   - function dueLabel(dueDate: string | null, today: string): string
       "21 days overdue" / "1 day overdue" / "Due today" / "In 1 day" / "In 7 days" / "Not scheduled"
   - function formatDueDate(dueDate: string): string        // "30 Sep 2026" (fixed English month names, not locale-dependent)
   - function localToday(now?: Date): string                // device-local YYYY-MM-DD
2. Validation: dueDate must match ^\d{4}-\d{2}-\d{2}$ AND be a real calendar date (2026-02-30 invalid). Invalid input
   throws a clear Error (callers decide how to fail closed). today is validated the same way.
3. Date math is date-only: parse to UTC midnight (Date.UTC) and divide by 86_400_000; never use local Date arithmetic.
4. Sorting helper: compareByUrgency(a, b) with overdue-most-late first, then soonest, then not_scheduled last, then name A-Z.

DoD ADDITIONS
- Unit tests cover: boundaries (-1, 0, 1, 7, 8, 30, 31 days), month and year rollover, leap day 2028-02-29,
  2026-02-30 and "2026-9-30" and "" and "30/09/2026" rejected, null -> not_scheduled, label singular/plural,
  a run with TZ set to Asia/Kuala_Lumpur and to America/Los_Angeles giving identical results for the same strings.
- No component imports it yet.

STOP when the DoD table is green. Do NOT commit.
```

---

## U2 — Technician Upcoming Services: grouped read-only cards

Status: ✅ ready (U1 done).

```
<Standing rules>

TASK
Rebuild apps/web/src/jobs/TechnicianUpcomingServices.tsx (and its CSS, put in a new technicianUpcomingServices.css if the
file does not already have one) to the approved technician UI (PROGRESS_STATUS.md §5, D1, D2). Use schedule/dueStatus.ts
(U1). Data source and error handling (loadTechnicianUpcomingServices, abort, role="alert" on failure) stay as they are.

1. Header: "Upcoming Services" + the existing one-line description.
2. Filter chips with counts: Overdue / This week / Later (chip buttons, aria-pressed). Default: none selected = show all
   groups. Selecting a chip shows only that group. Chips with count 0 stay visible.
3. Groups in this order, each with a heading: Overdue, This week, Later. Cards inside a group sorted soonest first
   (overdue: most late first), then name A-Z. Empty groups are not rendered.
4. Card: customer name; "Due 30 Sep 2026" (formatDueDate); status chip with text (dueLabel). Cards are NOT links or
   buttons (read-only, D2). No tap action.
5. "Not scheduled (n)" is a collapsed disclosure (button, aria-expanded) at the bottom; expanded it lists names only.
6. Empty state when there are no serviced customers: keep the existing "No serviced customers yet."
7. A malformed nextServiceDueDate in the server data: do NOT guess. Show a role="alert" "Upcoming services are unavailable."
   and render no rows (fail closed), consistent with the existing error state.
8. Today = localToday() at render; recompute if the page stays open past midnight is NOT required.
9. Works offline exactly as before (no new network calls). No new storage.

Files you may edit: apps/web/src/jobs/TechnicianUpcomingServices.tsx, a css file for it, apps/web/src/styles/app.css only if
a shared token is genuinely missing, apps/web/tests/* (update technician-sidebar-navigation.spec.ts expectations that
asserted the old plain list; add technician-upcoming-services.spec.ts).
Do NOT edit ManagerUpcomingServices.tsx or referenceDataApi.ts.

DoD ADDITIONS
- Playwright: groups and counts correct for a fixed "today" (use page.clock or inject a date; do not depend on the real date),
  chip filter works, no group when empty, Not scheduled collapsed by default and expands, cards are not interactive,
  malformed date -> alert and no rows, 360 px viewport has no horizontal scroll.
- State which technician-sidebar-navigation expectations changed and why.

STOP when the DoD table is green. Do NOT commit.
```

---

## U3 — Manager Next Upcoming Service: table, chips, sort, row menu

Status: ✅ ready (U1 done). May run in parallel with U2.

```
<Standing rules>

TASK
Rebuild the list UI of apps/web/src/manager/ManagerUpcomingServices.tsx to the approved manager UI (PROGRESS_STATUS.md §5,
D1, D3). Use schedule/dueStatus.ts (U1). Loading, save (saveCustomerNextServiceDueDate), reload-after-save, busy handling,
domain-error message and onAuthorityFailure behaviour stay exactly as they are. Keep the file readable: put the table,
the row menu and the drawer in new files under apps/web/src/manager/ if ManagerUpcomingServices.tsx would grow large.

1. Toolbar: the existing search (customer name or code) + status chips with counts:
   Overdue n · Due in 30 days n · Later n · Not scheduled n · All. Counts reflect the current search text.
   Default chip = Overdue. If Overdue is empty on first load, default to All (so the page never opens on an empty list).
2. Table (semantic <table>, <th scope="col">): Customer (sortable), Next due (sortable), Status (chip with text), Routine, Actions.
   - Default sort: most overdue first, then soonest, not scheduled last, then name A-Z (compareByUrgency).
   - Sort buttons use aria-sort and cycle ascending/descending.
   - Routine column: show a short text ONLY if the data from loadUpcomingServices already contains it. If it does not,
     omit the column and say so in the report. Do not change managerApi.ts or any API file.
3. Actions column: primary button "Reschedule" (has date) or "Set date" (none) opens a date picker (a native
   <input type="date"> inside a small popover/dialog, with Save and Cancel; Save calls the existing save(); clearing the
   date is allowed and calls save with null, as today). The always-visible per-row date input goes away.
4. Row menu (button "More actions for <customer>", aria-haspopup, keyboard operable, Escape closes, focus returns):
   - "Reminder recipients" (only when a due date exists, as today) -> opens ManagerReminderPlan in a right-side drawer
     (dialog role, focus trap, Escape closes, labelled by customer name). Keep the key={`${customer.id}:${dueDate}`} remount.
   - "Service routine" -> opens ManagerServiceRecurrence in the same drawer, keeping the onSaved reload.
   Only one drawer at a time. Do not modify ManagerReminderPlan.tsx or ManagerServiceRecurrence.tsx.
5. Under 700 px wide the table becomes stacked cards (same data, same actions), no horizontal scroll, targets >= 44 px.
6. Empty states: "No customers." / "No customer matches "<q>"." (keep) / per-chip "No overdue services." etc.
7. A malformed nextServiceDueDate from the server: fail closed with the existing authority-failure path (setData(undefined) +
   onAuthorityFailure) or an explicit error state; never classify it as "later".
8. Large list: filter and sort in useMemo; do not re-render every row on a keystroke more than needed (see
   .claude/skills/vercel-react-best-practices). No virtualisation required.

Files you may edit: apps/web/src/manager/ManagerUpcomingServices.tsx, new files under apps/web/src/manager/ for the table, row
menu, drawer and their css, apps/web/tests/* (update manager-upcoming-services.spec.ts and any spec that clicked the old
per-row date input or buttons; add new coverage). Do NOT edit TechnicianUpcomingServices.tsx.

DoD ADDITIONS
- Playwright (fixed "today"): default chip, counts with search text, chip filter, sort toggle + aria-sort, Reschedule saves
  and reloads, clearing date saves null, Reminder recipients and Service routine open in the drawer and the old save paths
  still work, Escape/focus return, 360 px cards without horizontal scroll, failed load shows no stale rows.
- List every existing spec expectation you changed and why (layout change only, no weakened assertions).

STOP when the DoD table is green. Do NOT commit.
```

---

## R1 — Rebuild and check both screens

Status: ✅ ready (U2 and U3 done). Verification only; no code change unless a P0/P1 is found.

```
<Standing rules>

TASK
1. Rebuild the web image on the local stack (web only; API is unchanged).
2. Browser at 1024 px and 360 px: Manager `mobiletest` (table, chips, sort, Reschedule, row menu, both drawer panels) and
   Technician `technician-demo` (grouped cards, chips, collapsed Not scheduled). Also check dark/low-contrast status chips are
   readable and that status is understandable without colour.
3. Report exactly what was and was not tested (browser-pane offline vs real phone offline). Do not claim a phone test you did
   not perform; list items for the owner to run on the physical phone.
4. Log findings as P0/P1/P2/P3. Do not fix anything in this task.

STOP after the report.
```

---

## D1 + U4 — Calendar (last)

Status: ⏸ not started. Starts only after R1 is accepted. First show the owner a calendar mockup (D1); write the U4 prompt
after approval. Intended scope: month grid, one dot or chip per due customer coloured by the same status helper,
click a day to list customers, reuse U3 filters and search, read-only for technicians, no API change.
