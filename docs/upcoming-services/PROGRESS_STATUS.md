# Upcoming Services Redesign — Progress Status

> **Started:** 2026-10-21 · **Branch:** `phase-8e-client-demo-polish`
> Prompts: [PROMPTS.md](PROMPTS.md)

## 1. Scope (owner request, 2026-10-21)

The Upcoming Services screens are hard to scan: every customer is a form row (manager) or a plain
name + date line (technician), and nothing says what is overdue. Redesign both, modelled on
ServiceTitan's *Recurring Service Events* table. Calendar comes last.

| # | Request | Task |
|---|---|---|
| 1 | One shared, tested function that turns a due date into a status + readable label | U1 |
| 2 | Technician screen: read-only grouped cards (Overdue / This week / Later / collapsed Not scheduled) | U2 |
| 3 | Manager screen: ServiceTitan-style table with search, status filter chips, sortable columns, row menu | U3 |
| 4 | Calendar (month) view, built last | U4 |

Role names: code role `admin` = UI **Manager**; code role `supervisor` = UI **Admin** (CR-11).

## 2. Task status

| Task | What | Depends on | Status |
|---|---|---|---|
| **D0** | Approve the UI plan (mockups shown in chat 2026-10-21, described in §5) | — | ☑ Approved by owner 2026-10-21 |
| **U1** | Pure status helper + unit tests (web only, no UI change) | D0 ☑ | ☑ Done 2026-10-21 — reviewed: 9/9 `test:due-status`, web typecheck clean, P0 0 / P1 0 / P2 0; owner commits. Files: `apps/web/src/schedule/dueStatus.ts`, `apps/web/tests/dueStatus.test.ts`, `test:due-status` script |
| **U2** | Technician Upcoming Services: grouped read-only cards | U1 ☑ | ☑ Done 2026-10-21 — reviewed, committed with U3. P0 0 / P1 0 |
| **U3** | Manager Next Upcoming Service: table, filter chips, sort, row menu + drawer | U1 ☑ | ☑ Done 2026-10-21 — reviewed, committed with U2. P0 0 / P1 0. **Routine column omitted** (the loaded data has no routine text; no API change allowed) |
| **R1** | Rebuild web on the local stack, browser (1024 px + 360 px) check of both screens | U2 and U3 | ☑ Browser check done 2026-10-21 on build `20261021T041245Z`. Fixes made and retested: P3-1 technician load failure now shows a friendly message + Retry; P3-2 manager save/clear notice; P3-3 body scroll lock while a drawer is open. 33/33 specs. Reviewed: P0 0 / P1 0 / P2 0. **Fixes not yet committed** (files: TechnicianUpcomingServices.tsx, ManagerUpcomingServices.tsx, UpcomingServiceDrawer.tsx, manager-upcoming-services.spec.ts, technician-upcoming-services.spec.ts) |
| **R2** | Physical phone + real offline check | R1 ☑ | ☑ Agent-run 2026-10-21: Chromium offline (Playwright `setOffline`, 360 px) and the USB phone (CPH2375, build `20261021T044424Z`, proxy-stop offline + Chrome force-stop). PASS on rows 1-12; no P0/P1/P2. Not tested: installed WebAPK force-close, true airplane mode, human touch (taps were DOM events over CDP). Owner may still spot-check by hand. |
| **D1** | Owner approves a calendar mockup (month grid, status colours) | R2 | ☑ Approved by owner 2026-10-21 (mockup described in §5) |
| **U4** | Calendar month view (reuses U1 helper and U3 filters) | D1 ☑ | ☑ Done 2026-10-21 — reviewed: web typecheck + build clean, 9/9 `test:calendar-month`, 9/9 `test:due-status`, 52/52 Playwright (new calendar specs + existing upcoming/email-reminder/sidebar/compliance specs). P0 0 / P1 0 / P2 1 (below). **Not committed yet** |
| **R3** | Agent browser/offline check of the calendar, then commit U4 (prompt in PROMPTS.md); owner phone rows after | U4 ☑ | ✅ Ready |

Status legend: ⏸ waiting · ✅ ready · 🔧 in progress · 🔍 in review · ☑ done (owner commits).

### Concurrency

```
U1  web: new apps/web/src/schedule/dueStatus.ts + unit test
U2 | U3 (parallel after U1, disjoint files)
      U2  web: jobs/TechnicianUpcomingServices.tsx (+ its css, specs)
      U3  web: manager/ManagerUpcomingServices.tsx (+ new table/drawer files, css, specs)
R1  verification only
D1 -> U4  last
```

## 3. Owner decisions (2026-10-21)

| Ref | Decision |
|---|---|
| D1 | **Due soon = 30 days** (manager chips). Technician groups: **Overdue** (before today), **This week** (today to +7 days), **Later** (after +7 days), **Not scheduled** (collapsed). |
| D2 | Technician cards are **read-only** (no tap action, no prefill of New Service Visit). |
| D3 | Manager row actions (**Reminder recipients**, **Service routine**) live in a **row menu**; the existing panels open in a drawer, unchanged. |
| D4 | Calendar is **last**, after the table and cards are accepted. |
| D5 | Reference: ServiceTitan Recurring Service Events (table, filters, due-date ordering). Statuses/chips are our own design. |
| D6 | Calendar approved 2026-10-21: month grid, Monday-first, status-coloured chips (max 2 per day + "+n more"), selected-day list below, Table/Calendar toggle on the manager screen, compact dot calendar on the phone (technician read-only). |
| D7 | Calendar shows scheduled customers only; unscheduled customers stay in the table. Overdue customers from earlier months appear as a banner with "Show in table". |
| D8 | Calendar shares the table's search text and status chip filter; view choice is in-memory only (no storage). |

## 4. Constraints

- **No API, PostgreSQL, Dexie, Docker, Caddy or package-lock change.** Status is computed in the browser from `nextServiceDueDate`.
- Save-date, reminder-plan (`ManagerReminderPlan`) and recurrence (`ManagerServiceRecurrence`) logic is untouched; only where they are mounted changes.
- Authority failures still go through `onAuthorityFailure`; a failed load shows no stale rows.
- Data available today: manager rows have `id`, `displayName`, `code`, `nextServiceDueDate`; technician rows have `id`, `displayName`, `nextServiceDueDate`. **A "last serviced" column is out of scope** (would need an API change).
- Dates are date-only (`YYYY-MM-DD`). "Today" is the device's local date; day arithmetic must be date-only (no DST/timezone drift).
- Existing specs to update (not weaken): `manager-upcoming-services.spec.ts`, `technician-sidebar-navigation.spec.ts`, `manager-dashboard-navigation.spec.ts`, `manager-home-compliance-reminders.spec.ts`, `manager-email-reminders.spec.ts` where they touch these screens.

## 5. Approved UI (summary of the D0 mockup)

**Technician (phone):** title + one-line description; filter chips with counts (Overdue / This week / Later); sections with a coloured heading; each card = customer name, "Due 30 Sep 2026", status chip ("21 days overdue", "In 7 days", "In 86 days"); "Not scheduled (n)" collapsed at the bottom.

**Manager (desktop):** search box + chips `Overdue n · Due in 30 days n · Later n · Not scheduled n · All`; table columns Customer (sortable), Next due (sortable, default ascending), Status chip, Routine, Actions (`Reschedule` or `Set date`, plus a `⋯` row menu). Default filter **Overdue**; default sort most overdue first. Under 700 px the table becomes cards.

## 6. Open items

- [x] "Routine" column: omitted in U3 (data not available without an API change). Revisit only if the owner wants it (would need an API task).
- [ ] P3: `manager-dashboard-navigation.spec.ts` (2 tests) fails because the separate customer-records work renamed the "Customer Configuration" page heading to "Customers". Not from this redesign; the customer-records owner must update that spec.
- [x] Calendar mockup (D1) shown and approved 2026-10-21.
- [x] **P2 (U4) fixed 2026-10-21 (owner approved):** switching Table -> Calendar now selects the "All" chip (a chip chosen inside the calendar is kept until the next switch). `showCalendar` in `ManagerUpcomingServices.tsx` + test "switching to Calendar selects the All chip…" in `manager-upcoming-calendar.spec.ts`; typecheck clean, 28/28 for calendar + manager upcoming + email-reminders specs. Not committed yet (goes in with U4 via R3).

## 7. Log

| Date | Event |
|---|---|
| 2026-10-21 | Research (ServiceTitan, Zoho FSM, Dynamics 365), mockups approved, files created. Nothing implemented. |
| 2026-10-21 | R2 agent-run check: technician (cards, chips, read-only, Not scheduled, offline friendly message + Retry 44 px, reconnect reloads rows) and manager (stacked cards, search counts, saved/cleared notices, both drawers lock/restore body scroll, offline shows "Reconnect to verify Manager access", no stale rows) passed on Chromium and phone. Test date of DEMO-V7-SHARED-EVIDENCE restored to 30 Sep 2026. Observation (P3, no action): on reconnect the screen reloads itself, so Retry is rarely needed after coming back online. An earlier suspicion that Manager offline gave no message was wrong (the message sits below the role buttons). |
| 2026-10-21 | R1 browser retest reviewed (3 P3 fixes). Not tested: real phone/offline, 1024 px layout of the save notice. Observation (P3, deferred): the saved notice sits at the top of the page and may be off-screen on a phone with many rows, and it is not cleared by a later routine/reminder action. |
| 2026-10-21 | U2 + U3 reviewed: web typecheck + build clean, 32 Playwright tests pass (technician-upcoming-services, manager-upcoming-services, manager-email-reminders, technician-sidebar-navigation, manager-home-compliance-reminders); 2 unrelated manager-dashboard-navigation failures (see §6). Committed together. Next: R1. |
| 2026-10-21 | U1 reviewed and accepted. Helper API: `classifyDue`, `technicianGroup`, `dueLabel`, `formatDueDate`, `localToday`, `compareByUrgency({dueDate, name})`; all throw on malformed dates (callers must fail closed). |
