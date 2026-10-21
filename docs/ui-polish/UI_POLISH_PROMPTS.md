# UI polish round — Codex prompts (2026-10-21)

> Owner approved all five changes as drawn (mockups in the Claude chat of 2026-10-21).
> Git is the owner's; every task stops before staging. Run in order: A, B, C, D. Review each (Sol) before starting the next.
> Level 1 verification (AGENTS.md): focused tests, typecheck, build, `git diff --check`. No schema, Dexie, Docker or lockfile changes in any task.
> Browser check: desktop width (1920) AND phone width (375). Phone layouts must not regress.

## Approved changes

| # | Change | Task |
|---|---|---|
| 1 | Manager Customers list (web): aligned columns, one-line rows, plain-text name, "No contact", "21 Oct 2026" dates, Archive in a ⋯ menu | B |
| 2 | Manager Operations: slim approval banner, stat tiles become filter chips, search, dense desktop list with technician + age | D |
| 3 | Technician Completed Services: remove Back, left-aligned heading, label "Select customer", helper line | A |
| 4 | Technician Home: Hide/Show per section with count (remembered on device), search at top | C |
| 5 | Manager Current Services Done: reuse the technician customer picker + completed timeline | A |

---

## Prompt A — Items 3 and 5 (shared customer picker)

```text
Read AGENTS.md, .agents/skills/mobile-first-ui/SKILL.md and .agents/skills/offline-first-pwa/SKILL.md. Do not touch Git, Docker Compose, the database schema, Dexie schema, or package-lock files.

Inspect first: apps/web/src/visits/CustomerTimelineRoute.tsx (used by BOTH "technician-completed-services" and "customer-timeline" routes), apps/web/src/App.tsx around the "technician-completed-services" render (search for it), apps/web/src/manager/ManagerServicesDone.tsx, apps/web/src/manager/ManagerHome.tsx, apps/web/src/manager/roleAccess.ts.

TASK
1. Technician Completed Services: remove the "Back" button on this route only. Keep Back on the "customer-timeline" (Customer history) route if it is reached from a Home button and needs it; confirm by reading how it is opened. Add an optional prop (for example showBack, default true) to CustomerTimelineRoute rather than deleting the button for everyone.
2. Same page: heading left-aligned like other workspace pages with the eyebrow "Technician workspace" and h2 "Completed Services"; change the field label "Customer" to "Select customer"; placeholder option "Select customer"; add one helper line "Pick a customer to see their finished visits." (ends with a period). Remove the duplicate h2 that App.tsx renders above the component if the component now owns the heading.
3. Manager "Current Services Done" (route manager-services-done): replace the free-text search page with the same customer picker + completed-visit timeline used by the technician page (CustomerTimelineRoute with initialStatus="closed", mode "server"). Eyebrow "Manager workspace", h2 "Current Services Done". Make the picker type-to-filter (searchable select or select + filter input) because the manager customer list is long; keep it keyboard and screen-reader accessible (label, aria).
4. Keep manager-only extras that the old page had if they exist (technician name, Final Report link/button, open-visit navigation). Do not drop any capability the old ManagerServicesDone offered; list what you kept in the report. Do not delete ManagerServicesDone.tsx data helpers that other code or tests import.
5. Technician behaviour must be unchanged otherwise (offline customer cache path, 10 s open timeout, abort handling).
6. Update or add tests: Playwright/unit coverage that (a) technician Completed Services has no Back button and shows "Select customer", (b) technician Customer history still behaves as before, (c) manager Current Services Done shows the picker and lists a completed visit for the chosen customer, (d) manager can still open the report. Fix existing specs that assert old wording (search tests referencing "Customer name or code") by updating the expectation, never by weakening it.

DoD: focused tests, apps/web typecheck + build, git diff --check. Browser-verify technician-demo and mobiletest at 1920 and 375 widths. Report files changed, behaviour changed, tests run, P0/P1/P2, limitations. Stop before staging.
```

## Prompt B — Item 1 (manager customers list, web)

```text
Read AGENTS.md and .agents/skills/mobile-first-ui/SKILL.md (and .claude/skills/web-design-guidelines for the audit). Do not touch Git, Docker Compose, schema, or lockfiles.

Inspect first: apps/web/src/manager/ManagerCustomerConfiguration.tsx and its CSS, apps/web/tests/manager-customer-records.spec.ts and any customer-list tests.

TASK
1. Desktop table (the phone card layout is correct today and must not change): fixed layout with explicit column widths — Customer, Contact, Last visit, Open, actions. No cell may wrap awkwardly; buttons never wrap ("Archive" must not become "Archiv / e"). Use white-space: nowrap on button cells and ellipsis with a title attribute for long text.
2. Customer cell: customer name as plain bold text (no pill background); the whole row opens Manage (keep a real focusable link or button for keyboard and screen readers). Under the name show "<n> site(s)" instead of the raw comma list; the customer code stays available (second line, muted) if the old UI showed it.
3. Contact cell: show name and phone on one line each, or "No contact" (muted) when empty. Never render "-" or "—".
4. Last visit: format "21 Oct 2026" (not 2026-10-21); "No visits" stays muted.
5. Actions: a "Manage" button plus a "⋯" menu holding Archive (keep the existing confirmation and offline/authority behaviour exactly). Status text "Active" becomes a small status chip in the Customer cell or its own narrow column — keep Archived customers visibly distinct.
6. Keep search, Add customer, Refresh, and the "Unconfirmed (n)" filter behaviour unchanged.
7. Tests: update affected assertions; add a Playwright check at 1920 width that no action button wraps (button height equals single-line height) and that "No contact" renders for an empty contact.

DoD: focused tests, typecheck, build, git diff --check, screenshots at 1920 and 375. Report as in AGENTS.md. Stop before staging.
```

## Prompt C — Item 4 (technician home)

```text
Read AGENTS.md, .agents/skills/offline-first-pwa/SKILL.md, .agents/skills/mobile-first-ui/SKILL.md. Do not touch Git, Docker Compose, schema, Dexie schema, or lockfiles.

Inspect first: apps/web/src/jobs/TechnicianHome.tsx (Service visits list, Repair visits section), apps/web/src/jobs/ServiceJobCard.tsx, how repair visits are rendered on the Home route in App.tsx.

TASK
1. Add a search box at the top of the Open work list: filters live (no submit) over customer name, site/service name, and SV / RV number, case-insensitive, trimmed. Show "Showing 3 of 84" under it when a filter is active; show an empty state "No visits match" with a Clear button. Filtering uses already-loaded local data only, so it works offline. Do not trigger network calls.
2. Make "Service visits (n)" and "Repair visits (n)" headers collapsible with a Hide / Show toggle (button, aria-expanded, aria-controls). The count stays visible when collapsed. If search text is present and a collapsed section has matches, auto-expand it (or show the match count on its header) so a search never silently hides results.
3. Remember each section's collapsed state per device in localStorage (UI preference only, wrapped in try/catch, key namespaced and including the signed-in user id). It must never store business data, and the page must render correctly if storage is unavailable.
4. Tapping a search result opens it exactly as today. Offline-ready labels, sync status, local drafts and the delete/retry controls must be unchanged.
5. Do not change what counts as open work, sorting, or any sync logic.
6. Tests: unit/Playwright for filtering by customer, site and SV number; collapse persists across reload; auto-expand on match; offline (network blocked) filtering still works.

DoD: focused tests, typecheck, build, git diff --check, screenshots at 375 and 1920. Report as in AGENTS.md. Stop before staging.
```

## Prompt D — Item 2 (manager operations)

```text
Read AGENTS.md, .agents/skills/mobile-first-ui/SKILL.md, .agents/skills/backend-api-security/SKILL.md. Do not touch Git, Docker Compose, schema/migrations, or lockfiles.

Inspect first: apps/web/src/manager/ManagerOperations.tsx (and CSS), AwaitingRepairVisitsPanel (search for it; rendered in App.tsx for route manager-operations), the API route that feeds the active service visit list and whether it already returns technician name and created time. Only add API fields if they are missing AND the change is read-only and additive; say so in the report.

TASK
1. Replace the large "Repair visits awaiting approval" cards on this page with one slim warning banner: "2 repair visits awaiting approval · Review" linking to the existing approvals/repairs route. Keep the existing panel component for other places that use it. Hide the banner when the count is 0.
2. Replace the Open / Completed / Total tiles with filter chips showing the counts (Open 43, Completed 7, Total 50). Clicking a chip filters the list; the active chip is highlighted and aria-pressed. This removes the need for the Apply button; filters apply immediately. Keep Clear filters.
3. Add one search box: customer name, site/service, SV number (case-insensitive). Keep the Technician select. Both apply live.
4. Desktop (>= 900px): dense table with columns Customer (plus SV number muted under it), Technician, Progress (e.g. 0/10), Created, Age. Sort by oldest open first by default; highlight Age in the danger colour when an open visit is older than 2 days. The whole row opens the visit as the cards do today. Phone (< 900px): keep the existing cards, and add the technician name to each card.
5. Do NOT add a "Stuck" chip or any rule not listed here (no definition exists; the owner has not approved one).
6. Behaviour that must stay: authority-failure handling, Refresh, Show active checkbox semantics (fold it into the Open chip if redundant, and say what you did), role access (supervisor vs manager) per roleAccess.ts.
7. Tests: filter chips change the list and counts match; live search; age highlight threshold; row opens the visit; technician name present on phone cards; existing operations specs updated, not weakened.

DoD: focused tests, typecheck (web and api if touched), build, git diff --check, screenshots at 1920 and 375. Report as in AGENTS.md. Stop before staging.
```

## Review prompts (Sol) — paste after each task finishes

Use the generic prompt and replace `<X>` and the checklist with that task's block below it.

```text
Read AGENTS.md and docs/ui-polish/UI_POLISH_PROMPTS.md. Review the uncommitted working tree for Prompt <X> only. Modify no file. No Git commands that change anything (diff, status and log are fine).

1. Run `git status --short` and `git diff --stat`. List every changed file. Flag any file outside the task's scope, and any change to the schema/migrations, Dexie schema, package-lock files, Docker Compose, Caddy or .env as a P1.
2. Check each requirement in Prompt <X> against the code: PASS or FAIL with file:line. For each FAIL give a concrete failing scenario.
3. Check the task-specific list below.
4. Look for new defects: lost capabilities, offline regressions (anything that now needs the network), keyboard/screen-reader gaps (labels, aria, focus), phone-width regressions, and weakened or deleted tests (a test removed or loosened to pass is a P1).
5. Run: apps/web typecheck, build, and the focused tests named in the task; add apps/api typecheck if the API was touched. Run `git diff --check`. Report real output; a skipped test is not a pass.
6. Report: P0 count, P1 count, P2 list, NEW DEFECTS Y/N (list), SCOPE RESPECTED Y/N, SAFE TO COMMIT Y/N, and what you did not verify (for example real browser or phone).
```

**Task-specific list for A (items 3 and 5)**
- Technician Completed Services: no Back button, label "Select customer", helper line present, no duplicate heading rendered by App.tsx.
- Technician Customer history route still behaves as before, including its Back button if it had one.
- Manager Current Services Done uses CustomerTimelineRoute, picker type-to-filter works, a completed visit lists, the Final Report still opens.
- Every capability of the old ManagerServicesDone is kept or listed as removed; helpers imported by other code or tests still exist.
- Old specs updated by changing the expectation only; offline customer cache path and the 10 s open timeout untouched.

**Task-specific list for B (item 1)**
- Phone card layout unchanged (compare the CSS at under 768px).
- Desktop: fixed column widths, no wrapped button text, ellipsis plus title on long text, name is plain bold with a real keyboard-focusable open control.
- "No contact" replaces "-" and "—"; dates read "21 Oct 2026"; the Archive confirmation and its offline/authority behaviour are unchanged and now sit in the ⋯ menu (menu is keyboard operable, closes on Escape and outside click).
- Search, Add customer, Refresh and the Unconfirmed filter behave as before.

**Task-specific list for C (item 4)**
- Search filters customer, site and SV/RV number live, makes no network call, and works with the network blocked.
- Hide/Show uses a button with aria-expanded and aria-controls; the count stays visible when collapsed; a search auto-expands a section that has matches.
- localStorage is wrapped in try/catch, the key includes the user id, and only the collapsed flags are stored (no business data).
- Open-work rules, sorting, sync status, local drafts and the delete/retry controls are unchanged.

**Task-specific list for D (item 2)**
- Awaiting-approval banner is hidden at 0, links to the existing route, and the old panel is still used wherever else it was.
- Chips filter instantly with correct counts and aria-pressed; there is no Apply button; Clear filters still works; the "Show active" checkbox decision is explained.
- Live search plus the Technician select combine correctly. The desktop table has the required columns, sorts oldest open first, and Age turns the danger colour past 2 days. Phone keeps cards and adds the technician name.
- No "Stuck" chip or other unapproved rule. If the API changed, the change is read-only and additive, still authenticated, and covered by an API test. Supervisor vs manager access (roleAccess.ts) is unchanged.

## After all four

Owner phone/desktop check (manager `mobiletest`, technician `technician-demo`): each of the five pages at desktop width and on the phone; then update docs/testing/PHONE_TESTING_STATUS.md.
