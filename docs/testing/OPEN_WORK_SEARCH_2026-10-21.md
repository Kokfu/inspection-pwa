# Open work search — 2026-10-21

Home now filters its already-loaded open service/repair lists by customer, site/service and SV/RV number. Matching is live, case-insensitive and trimmed. Active filters show the combined match/total count; zero matches offers Clear. Existing membership predicates, sorting, cards, routes, offline labels, draft/delete/retry controls and synchronization remain unchanged.

Each section exposes an accessible Hide/Show button and visible total. Only a boolean is stored in `inspection-pwa:open-work:v1:user:<id>:<section>:collapsed`, guarded for unavailable storage. Search expansion is temporary; clearing restores the saved preference. Manually hiding search matches leaves the match count on the header. No business data or search strings are stored in localStorage.

| Gate | Result |
|---|---|
| Focused filtering, reload, auto-expansion, empty/Clear, routes and storage-error browser checks | PASS: 5 tests |
| User preference isolation across logout/login | PASS: 1 test |
| Existing Home/ownership and navigation regressions | PASS: 8 tests |
| Unit filtering and existing job-progress regressions | PASS: 10 tests |
| Network-blocked filtering | PASS: Chromium offline + rejected fetch; zero fetch calls during filtering after normal offline auth transition |
| Responsive layout | PASS: 360, 375, 768, 1280, 1920 widths; no horizontal page overflow; toggle targets >=44px |
| Screenshots | PASS: 375 and 1920 captured and visually inspected |
| Web typecheck / production build | PASS; existing large-bundle warning |
| Whitespace | PASS: git diff --check (existing LF/CRLF notices only) |

Screenshots: [375](../../apps/web/test-results/open-work-375.png), [1920](../../apps/web/test-results/open-work-1920.png).

Files changed by this task:

- `apps/web/src/jobs/TechnicianHome.tsx`: filter loaded arrays and wrap existing lists.
- `apps/web/src/jobs/OpenWorkSection.tsx`: local matching and accessible device-preference sections.
- `apps/web/src/styles/app.css`: token-based search/header layout.
- `apps/web/tests/openWorkSearch.test.ts`: matching and missing cached-name cases.
- `apps/web/tests/open-work-search.spec.ts`: filtering, persistence, user isolation, offline, storage and responsive coverage.
- `apps/web/tests/technician-home-ownership.html`: opt-in search fixtures plus cached repair names.
- `apps/web/tests/technician-home.config.ts`: collect new focused browser spec.
- `apps/web/tests/technician-home-ownership.spec.ts`: update stale Completed Services selectors to the existing Select customer/Home controls, preserving assertions.
- `HANDOVER.md` and this report: checkpoint documentation.

Reproduce (no Docker or database required):

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\web
..\api\node_modules\.bin\tsx.cmd --test tests/openWorkSearch.test.ts tests/jobProgress.test.ts
npx playwright test --config tests/technician-home.config.ts --workers=1
npm run typecheck
npm run build
cd C:\PWA_OfflineRecordWebApp
git diff --check
```

The test server/browser need loopback access. The initial sandboxed run could not access localhost; verification passed with loopback access enabled. An initial display-encoding issue in the new section heading was corrected before the passing run.

P0 remaining: 0. P1 remaining: 0. P2 findings in this scope: 0. Existing large-bundle warning remains a release-maintenance limitation. Older repairs without cached names remain searchable by RV number; no network lookup is added to fill those names. Browser testing uses synthetic local data, not customer data. No physical phone, installed-PWA force-close, deployment or production database acceptance is claimed. No API/schema, Dexie schema, lockfile, Docker Compose, deployment or historical-template edits belong to this task. Git was used only for the requested read-only whitespace check; nothing staged.

READY FOR FOCUSED REVIEW: YES.
