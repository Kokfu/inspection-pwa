# Customer-centred history — prompts

How to run: open one chat per step. Run a whole wave at the same time; start the next wave only after the previous wave is Done in PROGRESS.md and the user has committed it.

| Wave | Prompts (can run together in separate chats) |
|---|---|
| A | S1, S3a, S4 |
| B | S2, S5 |
| C | S3b, S6 |
| D | S7 |

Parallel safety: run each chat in its own git worktree or keep strictly to the files each prompt owns. Never let two chats edit the same file.

---

## Shared header (paste at the top of every prompt)

You are implementing one step of the customer-centred history feature for the Inspection PWA.
Read first: AGENTS.md, docs/customer-records/PLAN.md, docs/customer-records/PROGRESS.md, and the project skills relevant to your step (offline-first-pwa, indexeddb-data-model, sync-engine, backend-api-security, mobile-first-ui, codex-task-brief as applicable).
Standing rules:
- Inspect existing code first; reuse proven patterns; smallest change; no unrelated refactor.
- Do NOT touch Git (no stage/commit/push/etc.). Stop before staging.
- Do NOT change the Dexie schema, Postgres migrations, Docker, Caddy, .env, package-lock unless this prompt says so. If you believe a migration is needed and the prompt did not authorise it, STOP and report why.
- Offline contract: never disable entry/save/camera because offline. Server is authoritative; fail closed on malformed data; auth required on all backend routes.
- Customer is a LIVE reference (no snapshots). Editing a customer changes it everywhere.
- Add focused regression tests. Run focused tests, typecheck, build if relevant, `git diff --check`.
- At the end UPDATE docs/customer-records/PROGRESS.md (your step row + a step-log entry) and report: files changed, behaviour changed, tests run, P0/P1/P2, limitations, readiness. Do not claim phone/offline/browser tests you did not perform.
Only touch the files listed under "You own". Anything else is read-only.

---

## S1 — Shared visit row + unified Service/Repair read query (Wave A)

Goal: one read-only list of visits for a customer that returns BOTH service visits and repair visits, newest first, with a `kind` field ("service" | "repair"), plus one reusable row component. No schema change.

Do:
1. Inspect how service visits (jobs) and repair visits (repair_visits, migration 054) are read today, API and web.
2. API: add an authenticated read endpoint, e.g. GET customer visit summaries (customerId, optional kind/status/date-range/siteId filters, cursor/limit). Return SUMMARY fields only: id, kind, date, status, siteId/siteName, technicianId/technicianName, `ownedByCaller` boolean. No findings/evidence/answers. Managers/admin: all rows. Technicians: all rows for customers they can see, summary only.
3. Server must NOT leak detail for non-owners here (summary only is the contract; detail guard is S2).
4. Web: add `VisitRow` component (type badge Service/Repair, status badge, date, technician name, optional lock icon, optional onClick). Pure presentational, mobile-first, 44px+ touch target when tappable.
5. Tests: API (auth required, both kinds merged and sorted, filters, no detail fields, role behaviour), web (row renders, lock when not tappable).

You own: new API route + query module for visit summaries, new web `visits/VisitRow.tsx` (+ its test and CSS section). Do not edit App.tsx routing, TechnicianHome, manager screens.
Done when: tests pass, typecheck/build pass, PROGRESS updated.

---

## S3a — Manager customer table + detail (Details, Sites) + audited edit (Wave A)

Goal (see mockups M1/M2 in the review): Joblogic-style manager Customers table and a customer detail page with editable Details and Sites; edits are audited. Technicians get no edit ability.

UI:
- M1 Customers table: search box (name/contact/site/phone), columns Customer, Contact, Sites, Last visit, Open, Status; row click opens detail. Add customer button keeps current flow.
- M2 Detail: header (name), tabs Details | Sites | Timeline (Timeline tab shows a "coming soon" placeholder; S3b fills it). Details tab: editable fields (name, contact person, phone, service frequency, other existing customer fields), Save changes / Discard. Banner text: "Edits apply to all visits, past and future."
Do:
1. Inspect ManagerCustomerServices/ManagerCustomerConfiguration/ManagerHome and existing customer API routes; reuse.
2. API: manager/admin-only PATCH for customer details with strict validation (unknown keys rejected). Name change must respect the existing unique-name index (return a clear conflict error).
3. Audit: find an existing audit/log pattern. If none exists, STOP before adding any migration and report the proposed table; do not add it unprompted.
4. Web table + detail components, responsive (table becomes stacked cards on phones).
5. Tests: authz (technician 403), validation, conflict on duplicate name, audit row written, table filter/search, edit round-trip.

You own: manager customer table/detail components, customer PATCH route + audit helper, their tests, routing entries for these new screens in the manager route list. Avoid App.tsx changes beyond adding the new route names.
Done when: tests pass, PROGRESS updated (note audit decision).

---

## S4 — Near-duplicate customer name warning (Wave A)

Goal (mockup T2): when adding a customer (technician or manager), warn if the typed name is close to an existing customer; user can "Use <existing>" or "Create anyway". Exact duplicates stay blocked by the existing server rule.

Do:
1. Add a pure shared helper `findSimilarCustomers(name, customers)`: normalise (lowercase, trim, collapse spaces, strip punctuation like "." and ",", normalise "sdn bhd"/"sdn. bhd."/"berhad"/"bhd"), then similarity (e.g. normalised equality, prefix/contains, and a small edit-distance threshold). Return top 3.
2. Technician: compare against the CACHED customer list so it works offline. Manager: use the loaded list.
3. UI: inline warning panel under the name field, never blocks typing or saving offline; "Use ABC Sdn Bhd" selects the existing customer; "Create anyway" proceeds.
4. Do NOT change the idempotent creation request flow (exact request UUID confirmation stays).
5. Tests: helper table-driven tests (punctuation, suffix variants, typos, unrelated names not matched), component test for both choices.

You own: new helper module + test, TechnicianAddCustomer.tsx, ManagerAddCustomer.tsx, their tests/CSS. Do not touch customer table/detail (S3a) or API.
Done when: tests pass, PROGRESS updated.

---

## S2 — Customer timeline + non-owner guard (Wave B, after S1)

Goal (mockup T1): one customer timeline, newest first, using S1's endpoint and VisitRow. Chips: All | Services | Repairs, plus status and date filters. Technician: own rows tappable; other technicians' rows show a lock and are NOT tappable. Manager/admin: all rows tappable.

Do:
1. New `CustomerTimeline` component + route (technician route reachable from the customer picker context and from Home; manager route reused by S3b).
2. Server guard: the existing visit DETAIL endpoints (service and repair) must refuse technicians who are not the owner, with a clear error, regardless of UI. Add tests for each kind. Do not change owner/manager behaviour.
3. Offline: timeline reads from cached summaries; cache only summary fields for other technicians' rows; no full records of others stored in IndexedDB. If caching summaries needs a Dexie change, STOP and report (Dexie is protected).
4. Tests: component (lock vs tap), guard (403 for non-owner on both kinds), filter behaviour.

You own: CustomerTimeline component/route + tests, detail-endpoint guards + tests. Do not edit TechnicianHome (S6) or manager customer detail (S3b).

---

## S5 — Confirmed flag + Unconfirmed chip + Confirm action (Wave B, after S3a)

Goal: manager can mark a customer "Confirmed". Unconfirmed customers remain fully usable. Customers created by a technician start Unconfirmed; manager-created and existing customers are Confirmed.

Do:
1. Check whether an existing column/table can carry this. If a migration is needed, add the smallest migration (nullable-safe, existing rows = confirmed) and say so clearly in PROGRESS. Otherwise no migration.
2. API: set on technician creation, Confirm endpoint (manager/admin only, idempotent), include `confirmed`/`createdBy` in list and detail responses.
3. Web: Status column + "Unconfirmed (n)" filter chip in the M1 table; "Confirm details" button + "Added by X on <date>" line in the M2 header. Technician sees no confirm control and no status gating anywhere.
4. Tests: default values, confirm idempotency, authz, technician flows unchanged, existing-system regression.

You own: migration (if needed), customer confirm route, the Status/chip/Confirm additions in the S3a components (coordinate: S3a must be Done first). Do not edit timeline or Home.

---

## S3b — Timeline tab in manager customer detail (Wave C, after S2 and S3a)

Goal: replace the Timeline placeholder in the M2 detail page with S2's `CustomerTimeline` (manager mode: all rows tappable to the existing manager visit detail routes, including repairs). Tab badge shows count.
You own: the Timeline tab wiring only. Tests: tab renders rows for both kinds, row opens correct manager route.

---

## S6 — Technician Home: Open work + Recent completed shortcut (Wave C, after S2)

Goal: Home shows only unfinished work (service + repair drafts/in-progress/pending-sync) as "Open work", plus a "Recent completed" shortcut that opens the customer timeline pre-filtered to Completed. Remove duplicated completed lists from Home. Repair List entry points for creating visits stay.
Do: inspect TechnicianHome and the repair list routes; keep old routes working (redirect repair list to the filtered timeline only if safe); existing offline start/readiness behaviour must not change.
You own: TechnicianHome.tsx and related home tests/CSS, route redirects in App.tsx limited to these entries.

---

## S7 — Verification, phone check, docs (Wave D)

Goal: Level 2 verification of the whole feature. Run API + web tests, typecheck, build, git diff --check. Browser-check M1, M2, T1, T2, Home on desktop and 375px widths. Offline checks only if actually performed: create customer offline with near-match warning, timeline from cache, force-close/reopen. List what needs the user's physical phone. Update PROGRESS.md with results and a final P0/P1/P2 list. No code changes except tiny fixes for findings, each listed.
