# Manager Approvals, Settings and Proposal Filters — Progress Status

> **Started:** 2026-10-20 · **Branch:** `phase-8e-client-demo-polish` · **Revert point:** the commit "Plan manager approvals, settings and proposal filters" (parent `4285448`); everything after it is implementation
> Prompts: [PROMPTS.md](PROMPTS.md) · Offline audit output (task A2): [OFFLINE_AUDIT.md](OFFLINE_AUDIT.md)

## 1. Scope (owner request, 2026-10-20)

| # | Request | Task |
|---|---|---|
| 1 | Site Requests: status tabs (Pending first), customer filter, search bar | A1 |
| 2 | Location Proposals: customer filter + search bar (same logic as Site Requests) | A1 |
| 3 | New **Settings** page (Manager only), last item in the sidebar; Email reminders + Company Profile move in | B1 |
| 4 | New **Approvals** hub (Manager + Admin) with 4 cards: Location Proposals, Site Requests, Repair Visits, Service Reports; red pending count per card; Home stays the landing page | B0 + B1 |
| 5 | Review technician offline/online behaviour: what works, the logic, the open issues | A2 |

Role names used below: code role `admin` = UI **Manager**; code role `supervisor` = UI **Admin** (CR-11).

## 2. Task status

| Task | What | Depends on | Status |
|---|---|---|---|
| **D0** | Approve the screen structure (mockup shown in chat 2026-10-20, described in §5) | — | ☑ Approved by owner 2026-10-20 |
| **A1** | Site Requests tabs + customer filter + search on Site Requests and Location Proposals (web only) | D0 ☑ | ☑ Done — committed 2026-10-20 |
| **A2** | Offline/online audit for technicians → `OFFLINE_AUDIT.md` (read-only, no code change) | — | ☑ Done — `OFFLINE_AUDIT.md` committed (14 findings); OA-1 closed by design (D15), OA-8 → C1 (D16), OA-2..OA-7, OA-9..OA-14 to triage after B1 |
| **B0** | API: list + count of service visits whose report is awaiting approval (read-only, additive) | D0 ☑ | ☑ Done — committed 2026-10-20 |
| **B1** | Navigation: Approvals hub (4 cards) + Service Reports list page + Settings page (web) | A1 and B0 ☑ | ✅ Ready to paste |
| **C1** | OA-8: technician Add Customer marked Synced only when the server echoes the exact requestId (API receipt + web check) | — | ✅ Ready to paste (parallel with B1) |
| **T1** | Triage the remaining offline findings OA-2..OA-7, OA-9..OA-14 (one owner decision pass) | B1 | Later |
| **P1** | Visual polish pass (colours, spacing, icons) with the web-design-guidelines audit | B1 done | Later |
| ~~T1b~~ | "Withdrawn" for Site Requests | — | ❌ Not planned (D1) |

Status legend: ⏸ waiting · ✅ ready · 🔧 in progress · 🔍 in review · ☑ done (owner commits).

### Concurrency

```
Wave A (parallel, disjoint files)
  A1  web: ManagerSiteProposals.tsx, ManagerLocationProposals.tsx, new proposalFilters.ts(x), their CSS, specs
  A2  read-only; writes only docs/manager-approvals-settings/OFFLINE_AUDIT.md
  B0  api: managerServiceVisits.ts or a new route file + reports/reportApproval.ts helpers, API tests
Wave B (after A1 and B0 are reviewed)
  B1  web: App.tsx, ManagerHome.tsx, roleAccess.ts, AppShell.tsx, managerApi.ts, new hub/list/settings pages
Later
  P1  visual polish
```

## 3. Owner decisions (2026-10-20)

| Ref | Decision |
|---|---|
| D1 | Site Requests show only **Pending / Approved / Rejected** for now. No Withdrawn. |
| D2 | Site Requests use **tabs like Location Proposals**, opening on **Pending**. |
| D3 | Customer filter = **dropdown listing only customers that have requests in the tab currently selected**. |
| D4 | Search matches **customer, site or location name, address, system, technician, visit number** (whichever fields that proposal type has). The text search applies only when **Search** is pressed. The customer dropdown applies **as soon as it changes**. Both together = **AND**. No date filter ("time" was a typo). Same logic on Location Proposals. |
| D5 | Approvals: **Manager and Admin**. Settings: **Manager only**. |
| D6 | Settings contains **Email reminders** and **Company Profile**. Service Catalog and Service Common Remarks stay top-level. |
| D7 | Settings is a sidebar item, placed **last** in the sidebar. |
| D8 | Approvals and Settings are **hub pages with cards**; each card opens its own page. Each Approvals card shows a red pending count. |
| D9 | Approvals contains **Location Proposals, Site Requests, Repair Visits review, Service report approval**. "Location Proposals", "Site Requests" and **"Repair Visits" leave the sidebar**. |
| D10 | Home stays the landing page. Its card grid follows the sidebar, so it shows one **Approvals** card (plus **Settings** for the Manager). |
| D11 | Old addresses (`#/manager-location-proposals`, `#/manager-site-proposals`, `#/manager-repairs`, `#/manager-email-reminders`, `#/manager-company-profile`) keep working and open inside their new section. |
| D12 | Files live in `docs/manager-approvals-settings/`; prompts use the codex-task-brief format. |
| D13 | No red badge on the **sidebar** Approvals item. The **Home "Approvals" card shows the total pending count**. |
| D14 | Service report approval needs a small read-only API addition (B0); accepted by the owner (OQ-3 d). |
| D15 | **OA-1 closed — by design.** All data in the project is test data; the Dexie v12 upgrade deleting the old Repair List stores/outbox stays as is (repair-visit decision #1, 2026-10-18). No archive, no recovery screen. |
| D16 | **OA-8 → task C1.** Add an additive `requestId` receipt to `POST /customers` (201 and 200 replay) and require it in the technician client before Synced. No migration. Deploy API before web. |

## 4. Open questions

None. D0 approved 2026-10-20 (including the four filled-in details: customer dropdown resets on a tab with no
requests for that customer; Home total only when all 4 counts load; Service reports oldest first; sidebar positions as in §5).
Owner asked whether design should come first: recommendation recorded in §5 — approve the **structure** now, do the
**visual polish** (P1) after the features work.

## 5. D0 — Screen structure (approved 2026-10-20)

Built only from components the app already has (dashboard cards with the left accent bar, Location Proposals tabs, the Email
reminders search form, the existing danger colour token). No new visual style is introduced; P1 polishes it later.

**Why structure first, polish later:** the tasks write tests and screenshots against routes, headings, labels and the order of
items. Changing those after the build means rewriting tests; changing colours or spacing later does not.

1. **Approvals hub** (`#/manager-approvals`, Manager + Admin): heading "Approvals", 4 cards in this order:
   Location proposals · Site requests · Repair visits · Service reports. Each card: title, one-line description, red round
   count on the right when pending > 0; nothing when 0; nothing (never a fake 0) when the count cannot be loaded.
   Phone: one card per row. Desktop: same grid as the Home cards.
2. **Site requests / Location proposals** (opened from a card): "Back to Approvals" on phone; tabs at the top
   (Site requests: Pending / Approved / Rejected; Location proposals: Pending / Approved / Rejected / Withdrawn) with counts;
   under the tabs a customer dropdown ("All customers" + customers in that tab), then the search box with Search and Clear;
   then the list. Cards show customer, site/location, visit number, technician, status chip.
3. **Repair visits**: the existing Repair Visits review page, unchanged except "Back to Approvals". Card count = repair
   visits Awaiting approval.
4. **Service reports** (new list page): completed visits whose report is Awaiting approval or Re-approval needed —
   customer, SV number, completed date, chip. Tapping one opens the existing visit report screen where Approve already
   lives. For the Admin, only the visits the server already lets that Admin see (existing scoping).
5. **Settings hub** (`#/manager-settings`, Manager only): heading "Settings", 2 cards: Email reminders · Company profile.
6. **Sidebar (Manager)**: Home · Technician List · Services · Operations · Add Customer · Current Services Done · Next Upcoming
   Service · Service Common Remarks · Service Catalog · **Approvals** · **Settings** (last).
   **Sidebar (Admin)**: Home(landing) · Services · Current Services Done · **Approvals**.
7. **Home**: unchanged KPIs, charts and reminders; the card grid shows Approvals with the total pending count (sum of the 4
   counts; shown only when all 4 loaded, otherwise no number).

## 6. Explanation: what "Withdrawn" means (for D1)

On **Location Proposals**, Withdrawn already exists:

- A **technician can withdraw their own proposal** while it is still **Pending**, i.e. before a Manager/Admin decides.
  Use: the technician made a mistake or no longer needs the change.
- Server: `POST /technician/location-proposals/:id/withdraw` (`apps/api/src/routes/technicianLocationProposals.ts`). Only the
  submitter can do it, only while no decision exists; it writes a `withdrawn` row into the append-only decision log (idempotent by
  `requestId`) and an audit event. Once any decision exists it returns `LOCATION_PROPOSAL_ALREADY_DECIDED`.
- After withdrawal the reviewer can no longer approve or reject it; it moves to the Withdrawn tab. The technician sees
  "You withdrew this request." and can **Revise and resubmit** (a new proposal).

For **Site Requests** this does not exist. Adding it would need a technician Withdraw button, a new API endpoint and a database
migration (the decision table only allows `approved` / `rejected`), plus a rule for the visit already on that pending site.
Not planned (D1).

## 7. Current state found (2026-10-20, before any change)

- `ManagerSiteProposals.tsx`: one list, Pending sorted first, no tabs / filter / search; the list endpoint already returns every
  status, so tabs and filters can be done in the browser.
- `ManagerLocationProposals.tsx`: tabs with counts, one server request per tab; no filter / search.
- `managerNavLinks()` in `ManagerHome.tsx` feeds both the sidebar and the Home card grid.
- Repair visits: `loadRepairVisits()` returns every visit with status `draft / awaiting_approval / returned / approved`.
- Report approval: derived per visit in TypeScript (`apps/api/src/reports/reportApproval.ts`, `deriveReportApproval`);
  `GET /manager/service-visits` is paginated and has no approval filter, and an Admin (`supervisor`) only sees their own
  visits. Hence B0.

## 8. Preliminary offline snapshot (from code and test records, NOT re-tested — A2 replaces this)

Works offline for technicians: session restore after one online sign-in; cached job list; drafts + autosave in IndexedDB; Submit
Locally into the outbox; camera photos kept on the device; auto-sync on reconnect (evidence first); offline New Service Visit
(server assigns the SV number at sync); repair visits; location proposals queue; per-job "Download for offline".

Needs a connection: Add Customer; **Add new site** (offline site requests, S4, never built); completed/accepted inspections not
cached; Final Report / PDF; Complete / Delete job; first open of Smoke Ventilation, Portable Fire Extinguisher, Hydrant, Roller
Shutter, Fire Intercom on a job not prepared online; New Service Visit when no customers/sites are cached.

To confirm in A2: PHONE-SAVE-01 acceptance open; I-70 (many tabs stall storage, notice only); L-6 (header recovery may need
Reconnect); I-68 / I-69 phone retest status.

## 9. Log

| Date | Event |
|---|---|
| 2026-10-20 | Plan agreed; decisions D1–D12; OQ-1..OQ-5 raised; PROMPTS.md written. |
| 2026-10-20 | OQ-1..OQ-5 answered → D3, D4, D8, D9, D13, D14; task B0 added; D0 structure mockup shown. |
| 2026-10-20 | D0 approved. Baseline commit of these planning docs made before any implementation (revert point). A1, A2, B0 ready. |
| 2026-10-20 | A1 and B0 built and reviewed. A2 audit written; follow-up review: OA-1 (old repair data deleted by Dexie v12) = REVISE, OA-8 (customer create not confirmed by request UUID) = PROCEED as a separate task. Owner decision pending. |
| 2026-10-20 | Owner: OA-1 closed by design (D15), OA-8 → C1 (D16). A1, B0 and A2 committed. B1 contract filled; B1 and C1 ready. B0 note (P3): the awaiting filter derives approval per scoped completed visit in TypeScript; not benchmarked at volume. |
