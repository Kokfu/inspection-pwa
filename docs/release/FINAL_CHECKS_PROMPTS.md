# Final Checks — Two Parallel Chats (2026-10-08)

Five checks before client hand-over, split into two independent chats so they can run at the same time.
They touch different files (Chat A: `docs/testing/`; Chat B: `docs/client/` and the proposal-list code), so they do not collide.

| Chat | Items | Output |
|---|---|---|
| **A — Verify** | 1. Email delivery · 4. Save-location features | `docs/testing/FINAL_CHECK_EMAIL_AND_LOCATIONS.md` |
| **B — Investigate + Document** | 2. "1 proposal cannot be shown" · 3. Evidence policy · 5. Client user guide | `docs/client/EVIDENCE_POLICY.md`, `docs/client/USER_GUIDE.md`, proposal fix |

Both chats: read `AGENTS.md` first; **do not stage/commit** (Git is manual); stop before staging; do not touch Dexie schema, migrations, Docker Compose, Caddy or `.env`.

---

## PROMPT A — Email delivery + Save-location verification

```
Read AGENTS.md, then these skills: .agents/skills/backend-api-security/SKILL.md,
.agents/skills/pwa-release-testing/SKILL.md, .agents/skills/offline-first-pwa/SKILL.md.
Also read docs/operations/service-due-email.md and docs/testing/PHONE_TESTING_STATUS.md.

This is a VERIFICATION task. Do not change product code unless you find a P0/P1 or a
clear P2 bug; if you do, stop and report it first with the evidence and a proposed
minimal fix, and wait for my yes before editing. Never weaken a test to make it pass.

### Part 1 — Email delivery: can it actually succeed?
Scope: Manager Settings -> Email reminders, the reminder-worker Compose service,
apps/api (service-due email, SMTP sender, encryption key), apps/web/src/manager/ManagerEmailReminders.tsx.

1. Inspect the implementation: sender settings (Gmail address + app password, write-only,
   encrypted at rest, host fixed smtp.gmail.com:587 STARTTLS), recipient selection,
   delivery history (sent / failed / unknown / missed), 09:00 Asia/Kuala_Lumpur schedule.
2. Run the existing focused API/worker/browser tests for email and report results.
3. Check the live local stack: Is the reminder-worker container running and healthy
   (docker compose ps / logs, no secrets printed)? Does the key file exist at
   INSPECTION_OPERATIONAL_PATH/service-due-email.key (check existence only, never print it)?
4. Check egress: from the host AND from inside the worker container, can it open
   TCP 587 to smtp.gmail.com (a plain TCP/STARTTLS connect test, no credentials)?
5. REAL delivery test: ask me (use AskUserQuestion) for (a) a test sender Gmail + app password
   and (b) one approved test recipient. Never echo the password in chat or files; enter it only
   through the app UI (or the existing API) and never write it to a file. If I do not provide
   credentials, mark real delivery as "NOT TESTED - needs client Gmail app password" and stop
   that step. If provided: configure the sender, set one customer due date to tomorrow with that
   recipient, trigger/observe the worker, and confirm the delivery-history row says `sent`,
   and ask me to confirm the email arrived. Report exactly which outcome you saw.
   Clean up the test due date/recipient afterwards (ask me before deleting anything).
6. Try the failure paths and confirm they are visible and fail-closed: wrong app password,
   port blocked/offline, empty recipient list. Confirm no duplicate send on worker restart
   (one row per customer + due date + recipient + kind).

### Part 2 — Save-location features: all good and smooth?
Scope: Manager Customer Configuration (locations/zones per system), technician
"propose a location" flow, Manager/Supervisor Location Proposals screen, offline behavior.

1. Inspect the code first (ManagerCustomerConfiguration.tsx, ManagerLocationProposals.tsx,
   apps/api/src/routes/managerLocations*.ts, apps/api/src/inspections/locationConfiguration.ts,
   technician-side proposal code in apps/web/src/jobs).
2. Run the focused tests: location proposal list/shape tests, managerLocations integration test,
   manager-customer-configuration spec, plus typecheck and `git diff --check`.
3. Walk through it in the built-in browser against the local stack (use the demo/test
   customer, NOT real customer data): 
   a. Admin adds, edits, removes a location on one system; reload; it persists.
   b. A technician offline adds a location / proposes one; refresh; PWA-style restart;
      it survives; reconnect; it syncs exactly once (check for duplicates).
   c. Manager approves one proposal and rejects another; verify the customer config
      reflects only the approved one and the technician sees the result after sync.
   d. Edge cases: duplicate location name, empty name, very long name, special characters,
      two technicians proposing the same location, unknown system key, malformed payload.
   e. Check mobile width (360 px): readable, 44 px touch targets, no horizontal scroll.
4. Do NOT delete or modify the existing legacy FM200 proposal from 2026-09-28
   (reference 678f1e17) - another chat is investigating it. Just note that it still shows the
   "1 proposal cannot be shown" notice and that readable proposals still work beside it.

### Deliverable
Write docs/testing/FINAL_CHECK_EMAIL_AND_LOCATIONS.md with: what was inspected, tests run
(command + result), step-by-step results table (PASS / FAIL / NOT TESTED + why), P0/P1/P2/P3
findings, limitations, and a plain-language verdict for each of the two parts
("safe to hand to client" / "not yet, because ..."). Do not claim a real-phone, real-Gmail or
offline-restart test unless you actually performed it. Do not update PHONE_TESTING_STATUS.md
(Chat B / I will merge results). Stop before staging.
```

---

## PROMPT B — Legacy proposal, Evidence policy, Client user guide

```
Read AGENTS.md, then these skills: .agents/skills/v7-evidence-acceptance/SKILL.md,
.agents/skills/sync-engine/SKILL.md, .agents/skills/backend-api-security/SKILL.md,
.agents/skills/mobile-first-ui/SKILL.md. Also read docs/testing/PHONE_TESTING_STATUS.md
(issue I-24 and I-21), HANDOVER.md, docs/operations/*.md, docs/report-template/README.md.

Three tasks, in this order. Another chat is running verification of email and location
saving in parallel - do not edit docs/testing/FINAL_CHECK_EMAIL_AND_LOCATIONS.md.

### Task 1 — "1 proposal cannot be shown" (location proposal, FM200, 2026-09-28)
Screen text today: "1 proposal cannot be shown. It is in a format this version of the app
cannot read, so it cannot be approved or rejected here. The other proposals below are not
affected. Ask an administrator to check it." Row: 28/9/2026 All Services · fm200_fire_suppression
· submitted by Technician1 · 2026-09-28T18:10:05.637Z (reference 678f1e17).

1. Diagnose read-only first: query the demo Postgres (read-only SELECT, no secrets printed)
   for that row (location_proposals or equivalent; find the table via the API code). Show me the
   payload shape vs. what validLocationProposalPatch expects (payload.kind = add-location /
   update-format). Find out which old code/version wrote `{zones, locations}` without `kind`
   and whether ANY current code path can still create such a row.
2. Decide: is the row real data of value (zones/locations that should be recovered) or demo debris?
   Show me its contents.
3. Present me 2-3 options with a recommendation, and use AskUserQuestion before changing
   anything. Candidates: (a) leave as is (fail-closed per row, by design from I-24);
   (b) admin-only "dismiss/reject unreadable proposal" action that marks it rejected without
   interpreting the payload (needs API change - justify, no migration unless unavoidable);
   (c) one-off, scripted, reviewed data fix to convert it to the current shape, or reject it
   (script in scripts/phone-testing or scripts/, with a dry-run mode and a printed before/after).
   Never DELETE the row without my explicit yes. Keep the validators strict and unchanged.
4. After my choice, implement the smallest change, add focused tests (they must fail before the
   change), run typecheck, focused tests, `git diff --check`, and verify in the browser that
   the notice disappears (or the action works) and readable proposals still work.

### Task 2 — "What is the evidence policy?"
Inspect the real implementation, do not guess: apps/api/src/inspections/evidence/*,
apps/api/src/routes/stagedEvidence.ts, apps/web/src/attachments/*, the per-system forms,
the V7 skill, and the Final Report authority chain.
Write docs/client/EVIDENCE_POLICY.md in plain language for the client (no code jargon), covering:
- Good / Poor / Not Relevant and what each requires (Poor = remark + photo per field).
- Which systems require photo evidence, how many photos, size/format limits, camera vs gallery.
- Offline behavior: photos saved on the phone first, uploaded before the record is accepted
  ("evidence first"), what the technician sees at each state (Pending / Syncing / Synced / Failed / Conflict).
- What happens when evidence is rejected (the "corrected copy" flow) and how long unsent photos are kept
  on the phone (retention rules: 24 h / 30 d).
- Who can see or change accepted records (frozen at acceptance; corrections by admin only, audited),
  how Accepted -> Final Report -> PDF relate.
- Template history: old inspections keep the form they were done with (V1-V7, forward-only).
Also give me a 10-line summary in chat. Flag anything where code and docs disagree.

### Task 3 — Client user guide
Write docs/client/USER_GUIDE.md (Markdown; clear headings; numbered steps; short; written for a
non-technical fire-safety company owner/admin, English). Base every step on the real UI: open the
screens in the built-in browser against the local stack (demo data only) and check labels,
menu names and buttons exactly as shown. Cover, per role (Admin/Manager, Supervisor, Technician):
1. Signing in/out, installing the app on a phone, working offline, what the header status messages mean.
2. Technicians: add, edit, deactivate, permanently delete (type username), reset password.
3. Customers: add customer, customer configuration, service catalog, which systems apply.
4. Location setup: add/edit locations and zones; technician proposals; approve / reject.
5. Scheduling: new service visit, upcoming services, recurrence (every N weeks / monthly),
   deleting an unfinished visit.
6. Doing an inspection on the phone: draft, autosave, photos, submit, sync states, corrected copy.
7. Reports: completed services, final report view, PDF, correction by admin.
8. Email reminders: where to enter SENDER email (client Gmail address + Gmail app password -
   explain step by step how to create a Google app password and that 2-step verification is needed),
   where to add RECEIVER emails (technician/supervisor addresses, extra named addresses, per-customer
   "Reminder recipients"), when emails go out (09:00 Malaysia time, day before due date), how to read
   delivery history (sent / failed / unknown / missed), and what to do on failure. State clearly that
   `sent` means Gmail accepted it, not that it was read, and that failed mails are not auto-retried.
9. Company profile (letterhead for PDFs), common remarks.
10. Daily/Weekly admin: backups (scripts/Backup-*.ps1 in plain steps), keeping the PC awake,
    Docker start, health check, where the email key file must be backed up, who to call.
11. Troubleshooting table (symptom -> meaning -> action) incl. "Server unreachable",
    "Sync needs attention", "1 proposal cannot be shown", email failures, forgot password.
12. Glossary and a one-page quick-start cheat sheet at the top.
Mark with "[CONFIRM]" anything you could not verify in the UI or that depends on client setup
(domain name, Gmail account, support contact) instead of inventing it. No real IPs, passwords or
production config. Do not include internal developer commands in the main body; put
admin/IT-only steps in a clearly labelled appendix.

### Deliverable
Report: files changed, behavior changed (Task 1 only), tests run, P0/P1/P2 findings, limitations
and [CONFIRM] items. Stop before staging.
```

---

## PROMPT C — Rebuild, full regression, merge results into status files

```
Read AGENTS.md, then .agents/skills/pwa-release-testing/SKILL.md,
.agents/skills/on-premise-windows-deployment/SKILL.md and .agents/skills/codex-task-brief/SKILL.md.
Also read docs/testing/PHONE_TESTING_STATUS.md, docs/release/LEVEL3_CHECKLIST.md,
docs/testing/FINAL_CHECK_EMAIL_AND_LOCATIONS.md (incl. its addendum) and docs/testing/PROMPT_B_REPORT.md.

Context: two earlier chats finished. Chat A fixed L-1 (Submit disabled with default zone), L-2
(saved proposal draft lost on reload) and L-3 (admin save error shown far from the Save button) in
source only: TechnicianLocationProposal.tsx, technicianLocationProposalDraft.ts,
ManagerCustomerConfiguration.tsx. Chat B rejected the legacy FM200 proposal 678f1e17 via the admin
API and wrote docs/client/*. None of this is rebuilt or phone-tested yet. Do NOT change product code
unless a test exposes a P0/P1/P2 in these changes; if so, stop and report with evidence first.
Never weaken a test. Do not stage/commit. Do not touch Dexie schema, migrations, Docker Compose,
Caddy, .env or package-lock files.

### Step 1 - Full regression on current source (Level 1+)
Run web typecheck, API typecheck, both builds, the full Playwright suite, the API/Node suites, the
new script test (scripts/reject-legacy-location-proposal.test.mjs) and `git diff --check`.
Report exact counts versus the last baseline (168/179 pass in the status file - state which number
applies). Investigate every failure; separate "caused by these changes" from pre-existing.
Also confirm the historical-baseline exception: show `git diff e30c649 -- <fireAlarmV6Evidence.ts>`
and tell me whether the only change is the string comparison from commit 10f3bbb.

### Step 2 - Rebuild and deploy locally
Rebuild only what changed (the web/proxy container; the API only if its source changed - check).
Use the project's own script/compose command (scripts/Update-System.ps1 or docker compose build),
confirm containers healthy, run scripts/Health-Check.ps1 and `node scripts/check-security-headers.mjs`.
Record the new build id (build-YYYYMMDDTHHMMSSZ) from the deployed service worker/version file.
Check the API was NOT unexpectedly restarted into a different state, and PostgreSQL data persisted.

### Step 3 - Retest L-1/L-2/L-3 on the rebuilt stack
Use the phone-testing tooling in scripts/phone-testing (read its README/status section first). If the
phone is not connected via adb, use the built-in browser at 360 px and clearly label results "browser
only, NOT phone". Demo/test customer only. Verify:
 a. L-1: new location proposal, type a name only, Submit is enabled and submits (default zone saved);
    with a job that has no zones, the form requires a new zone name.
 b. L-2: save a draft, reload, leave and re-enter the screen, force-close/reopen the PWA (phone only):
    the draft returns; Pending / Failed / Synced proposals also reappear.
 c. L-1+offline: submit offline, reload offline, reconnect, exactly ONE server row, no duplicate.
 d. L-3: admin editor with a blank name and with a location lacking a zone: specific message appears
    right above Save and is scrolled into view; nothing is sent; a server refusal also shows there.
 e. Manager Location Proposals: Pending is clear (legacy row gone), reference 678f1e17 under Rejected,
    approve one readable test proposal and reject another; clean up your test data afterwards.
 f. Quick smoke: login, technician home, open one inspection draft, autosave, header status text.
Do not claim a phone test, offline test or PWA force-close unless you actually did it.

### Step 4 - Ask me, then record
Use AskUserQuestion for L-4 (duplicate zone/location display names): (a) leave as is, (b) show a
non-blocking warning, (c) block duplicates (server 409 + UI message). Recommend (b). Implement only
my choice, with a test that fails before; if I choose (a), just document it.

### Step 5 - Merge results into the project records
Update docs/testing/PHONE_TESTING_STATUS.md: add L-1..L-8 and E-1..E-3 to the issue register with
status and evidence (build id, date), mark I-24's leftover row as rejected (not deleted), update
"Last updated", the build-verified line and the "Still open" list. Update docs/release/LEVEL3_CHECKLIST.md
with what was actually verified in this pass (tick only what was truly done; leave the rest open).
Add the owner decisions still pending (PDF download for corrected visits, Supervisor correction
rights, no password-reset feature, historical-baseline exception) under "Still open".
Remove nothing from the register. Do not edit docs/client/* except to fix a factual error you
find while testing - list any such edit.

### Step 6 - Hand-over summary
Give me: files changed, tests run with counts, the build id, what was verified on a real phone vs
browser only, P0/P1/P2 findings, a "safe to hand to client? yes / not yet because ..." verdict, and a
list of untracked/modified files I should commit vs ignore (e.g. scripts/phone-testing/mode.txt,
docs/testing/*.png, LEGACY_PROPOSAL_REJECTION.json). Stop before staging.
```

---

## PROMPT D — Fix I-31, L-5, diagnose I-32, verify the user guide

```
Read AGENTS.md, then .agents/skills/pwa-release-testing/SKILL.md, .agents/skills/sync-engine/SKILL.md,
.agents/skills/mobile-first-ui/SKILL.md and .agents/skills/offline-first-pwa/SKILL.md. Also read
docs/testing/RELEASE_LOCATION_VERIFICATION.md, docs/testing/PHONE_TESTING_STATUS.md (I-31, I-32, L-5),
docs/client/USER_GUIDE.md and docs/client/EVIDENCE_POLICY.md.

Git: the owner committed the previous work already. Do NOT stage or commit; stop before staging.
Never weaken a test. Do not touch Dexie schema, migrations, Docker Compose, Caddy, .env, lockfiles.
Smallest change per item; no unrelated refactoring. Each fix needs a regression test that FAILS on
the current source first (prove it, restoring with `git show HEAD:<file>`, not stash/reset).

### Task 1 - I-31: crash when switching between jobs' location-proposal routes
Direct navigation from one job's proposal screen to another job's with a different system set
(e.g. CO2 SV-78 -> zoneless Dry/Wet Riser SV-17) leaves the old selected system in state and throws
"Cannot read properties of undefined (reading 'zones')" (blank page).
Reproduce first (browser harness), then fix at the cause: state must reset/derive when jobId or
the system set changes (key the component by job, or derive the selected system), and remove the
unsafe `selectedSystem!` dereference with a fail-closed "cannot open this proposal" message.
Check the manager/other screens that use the same pattern. Test: route change without unmount.

### Task 2 - L-5: header says "All submitted changes synced" while a location proposal is Pending/Failed
Find how the header unsynced count is computed and include technician location-proposal outbox items
(Pending / Syncing / Failed / Conflict) using the existing outbox/status vocabulary. A Failed proposal
must produce the same "Sync needs attention" treatment as other Failed records. Do not mark anything
Synced without exact-UUID server confirmation. Tests: header summary with one Pending proposal,
one Failed, none; no change for existing record kinds. Run the sync-related regression specs.

### Task 3 - I-32: 12 failing API tests (reported as 4 fixtures, pre-existing)
Do not trust the report: reproduce. Run the full API suite on a clean worktree of HEAD
(git worktree add in the scratchpad, or `git stash`-free equivalent; do NOT switch branches in the main
tree) and on the current tree, list every failing test with its first error line, and prove whether
each failure exists at HEAD~ (before the location work). For each: root cause, whether it is test-fixture
drift or a real product bug. Fix fixture drift by updating the fixture to current valid data only (never
loosen an assertion or validator). A real product bug: stop and report with evidence before changing it.
Goal: API suite fully green, with counts reported. Remove any worktree you create.

### Task 4 - Verify the client user guide against the real UI
docs/client/USER_GUIDE.md was mostly written from source. Rebuild is NOT needed unless Tasks 1-2 change
shipped code - in that case rebuild only web/proxy with the project's script and record the build id.
Walk every [CONFIRM] and every unexercised step in the real app (built-in browser at 360 px and 1280 px,
demo/test data only; use the phone if connected and label results phone vs browser-only):
add/edit/deactivate/permanently delete a technician, add customer, customer configuration and locations,
technician proposal + approve/reject, new service visit, upcoming services + recurrence, doing an inspection
(draft, photo, submit, sync states), corrected copy, completed services, final report view, company profile,
email reminders screen (sender, recipients, history - do NOT send real mail; Gmail was already proven),
operations delete of an unfinished visit. Fix every wrong label, menu name, button or step in the guide;
keep [CONFIRM] only for things that depend on the client (domain, Gmail account, support contact, backup
storage). Also reconcile the guide with EVIDENCE_POLICY.md. Add a short "Known limits" section: corrected
visits cannot yet download a PDF; no password-reset feature (state the real workaround); "Offline needs
the job opened online once"; new visits need to be online. Clean up all test data afterwards.

### Task 5 - Records and report
Update docs/testing/PHONE_TESTING_STATUS.md (register: I-31, I-32, L-5 status + evidence + build id; Still open),
docs/release/LEVEL3_CHECKLIST.md and HANDOVER.md. Run: web + API typecheck, builds if code changed, full
Playwright, API suite, web Node tests, `git diff --check`. Report: files changed, behavior changed, tests
(command + counts), what was verified on phone vs browser, P0/P1/P2 findings, limitations, and a
"safe to hand to client? yes / not yet because ..." verdict (Level 3 client-PC HTTPS acceptance stays
the owner's separate checkpoint). Stop before staging.
```
