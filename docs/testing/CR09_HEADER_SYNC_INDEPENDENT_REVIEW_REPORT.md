# CR-09 / CR-10 shared repair header independent review

## Later rebuilt-phone checkpoint — 2026-10-14

After the owner rebuild and explicit reviewer-access/approval authorization, the installed phone updated normally to **build-20261014T021329Z**, release **sha256-ec99d9eaabf8d274**. The accepted six-file hashes and other 60 original inventory entries remain unchanged. Actual fresh submitted-repair header behavior, exact frozen/Blob/outbox retention across a real second OS force-stop/reopen, live evidence-first exact confirmation and two idempotent replays passed on this build. **FOCUSED INDEPENDENT REVIEW ACCEPTED: Y** remains the source verdict and HDR-01 stays closed.

Full acceptance is now blocked by a separate observed runtime **P1 PHONE-SAVE-01**: the initial native burst text/camera/Draft/Submit flow remained Saving… for minutes, blocked a record lookup and left only a partial remark committed before interrupted-save restart. The later clean-start single-insertion recovery/success is not closure of that failure; cause/reproduction still require investigation. No source root cause is asserted. **READY FOR OWNER LEVEL 3 ACCEPTANCE CLOSURE: N. OWNER LEVEL 3 ACCEPTANCE PASSED: N.** Full current owner report owns [runtime evidence, new P1, owners and limits](CR09_OWNER_LEVEL3_ACCEPTANCE_REPORT.md#actual-rebuilt-phone-continuation-and-new-save-blocker--2026-10-14). Earlier statements below that phone confirmation was not performed describe the earlier review checkpoint. No application/test/Git mutations or cleanup occurred in the phone continuation; the new decision/record/photo are retained authorized acceptance data.

## Focused re-review — 2026-10-14

Owner requested **rereview**. Reviewed the changed source/test candidate without modifying application or test files. **HDR-01 CLOSED in the reviewed source candidate. P0/P1/relevant open source P2: 0/0/0. NEW DEFECTS: N.** This verdict is based on source/guard inspection, exact revised hashes and fresh focused gates, not the implementation readiness statement.

**FOCUSED INDEPENDENT REVIEW ACCEPTED: Y** — applies to the revised six-file source/test hashes recorded in the remediation table below.

**READY FOR OWNER LEVEL 3 ACCEPTANCE CLOSURE: N** — the accepted loading-state fix has not been published or physically retested. The last recorded deployed build is the earlier candidate. Owner/operator owns authorized publication and any required installed-phone update/retained-work retest; the acceptance owner then closes Level 3. This is an operational acceptance prerequisite, not a new source defect.

**OWNER LEVEL 3 ACCEPTANCE PASSED: N**

### Identity and review disposition

All six current SHA-256 values match the revised remediation table below exactly. App.tsx still matches the original `logs/cr09-header-fix-candidate-hashes.json`; the other five intentionally differ from that original rejected/deployed snapshot. The old manifest was preserved and was not silently replaced. All other 60 entries in the prior D/owner candidate inventory match, including protected authority/schema code. HEAD remains `97a0cac4e7458cd109f234ed6d8d750f96dd5c4e`, branch `phase-8e-client-demo-polish`. The accepted source candidate is not identified by the older production build ID.

| Requirement / DoD | Re-review result |
|---|---|
| HDR-01 startup and account-switch unread state | PASS; `useRepairSyncStatuses.ts:31-32` returns display-only Loading until the snapshot matches actor, database and workspace; `headerSyncSummary.ts:32` displays Checking submitted changes… before the success fallback. Fresh held-read regression passed |
| Pending counted once; Draft excluded | PASS; parent filtering and single merged status per record unchanged; original real IndexedDB browser test passed |
| Evidence Uploading / parent Syncing | PASS; merged status priority unchanged; browser evidence-upload check and unit Syncing case passed |
| Failed / Conflict / rejected read | PASS; error callback remains guarded and sets Failed; forced read-error regression displays attention, unit attention priority retained |
| Exact confirmation returns synced | PASS for display mapping and retained recorded receipts; summary uses confirmed local states, performs no write and does not infer HTTP success |
| IndexedDB changes without sync events | PASS; real liveQuery parent/photo observations, existing browser state-transition test passed |
| Actor/workspace/stale callbacks/unsubscribe | PASS; same captured database/current-actor predicate guards both callbacks; render hides unmatched snapshots; cleanup sets active=false before unsubscribe. Held switched-account regression ignores old-workspace mutation; original wrong-actor and previous-workspace checks passed |
| App wiring/account preparation | PASS; hook import/call/summary argument unchanged. Login and verified reconciliation prepare workspace before publishing new verified user; no auth/routing changes made in re-review |
| Existing inspection/attachment/proposal wording | PASS; exact unit strings and both browser suites retained, no status-priority regression |
| Revised candidate identity | PASS, 6/6 revised hashes; original manifest retained; 60/60 other original inventory entries match |
| Web typecheck | PASS, `npm run typecheck`, exit 0 |
| Summary tests | PASS, `..\api\node_modules\.bin\tsx.cmd --test tests/headerSyncSummary.test.ts`, exit 0, 8/8, zero skips |
| Header/proposal/offline browser suite | PASS, `npx playwright test tests/header-repair-sync-summary.spec.ts tests/header-proposal-sync-summary.spec.ts tests/header-offline-mid-session.spec.ts --workers=1`, exit 0, 7/7 in 26.1s, zero skips |
| Header/ordinary compatibility browser suite | PASS, `npx playwright test tests/header-repair-sync-summary.spec.ts tests/repair-c1-inspection-regressions.spec.ts --workers=1`, exit 0, 26/26 in 56.9s, zero skips |
| Whitespace | PASS, `git diff --check`, exit 0 before and after review documentation; CRLF warnings only |
| Historical/protected scope | PASS, protected status empty; V1-V6/017/V6 acceptance/PDF baseline diff empty, approved V6 exception exact to 10f3bbb; 051/052 and Dexie v10 hashes retain recorded values |
| Production build | Prior remediation build PASS for these exact unchanged source hashes; not rerun in this review because no source/test changes occurred |
| Full cold API/D/integration gates | NOT RUN, bounded focused Level 1 re-review; no PostgreSQL target or recovery container accessed |
| Revised deployment / physical-phone retest / Level 3 closure | NOT RUN; owner/operator/acceptance prerequisite remains open |

The regression now actually covers the defect that caused rejection: Pending exists before mount and the first read is held, rather than checking only eventual updates in an initially empty workspace. Its prior negative control failed all four unknown-state checks while resolved Pending/error checks passed. Fresh re-review reruns confirm all seven internal loading checks and the original twelve status/account checks pass. No assertion, timeout, retry or route handler changed during re-review. In-flight callback cancellation is supported by source guards; not every possible scheduling race was separately fault-injected.

### Retained phone evidence and limits

Re-read the recorded offline/reopened/confirmed states, retention comparison, visible-state text, stopped-PID artifact, live Network trace and both exact replay receipts. Offline/reopened snapshots are byte-identical; two Pending operations, exact frozen payload/fingerprint and 14,574-byte Blob SHA remain intact. Recorded evidence response precedes parent POST; exact parent UUID/fingerprint receipt marks Synced; both retries match. OS force-stop/relaunch actions and screenshots were inspected in the earlier review and remain recorded earlier actions, not new actions of this re-review.

Those artifacts identify **build-20261013T180055Z**, release **sha256-9b2f90c04cb06999**, proxy **sha256:2d356700b0a1d1ceed332f39aeb1b85eb0ea9c557077f931e581f364f8ebde32**. This re-review did not query the live proxy or certify a current deployment, and those artifacts do not certify the revised source is running on the phone. No physical-phone force-close, phone update, live replay, production write, deployment, Docker operation, integration test, restore-container change or cleanup occurred. Existing phone/all-system/recovery/rollback limitations remain as documented below. Mobile text/CSS layout was not re-audited at three widths; no layout or control change is introduced by the reviewed delta.

Only this report, HANDOVER and the owner acceptance report were updated to record the re-review outcome. Source/test hashes remain unchanged. API authority, exact receipt validators, PDFs, Dexie schema, migrations, configuration and unrelated working-tree changes are preserved. **HISTORICAL IMMUTABILITY INTACT: Y with the approved 10f3bbb exception.** No Git mutation; stop before staging. Next checkpoint belongs to the owner/operator for authorized deployment/phone confirmation and then the owner acceptance closer.

## Owner-requested HDR-01 remediation — 2026-10-14

The owner requested **Fix** after the independent review below. HDR-01 is **IMPLEMENTATION REMEDIATED; READY FOR FOCUSED INDEPENDENT RE-REVIEW: Y**. This section records implementation/verification of a changed candidate; it does not rewrite the earlier independent rejection into acceptance. **FOCUSED INDEPENDENT REVIEW ACCEPTED: N (changed candidate not yet re-reviewed). READY FOR OWNER LEVEL 3 ACCEPTANCE CLOSURE: N. OWNER LEVEL 3 ACCEPTANCE PASSED: N.**

The hook now returns a display-only `Loading` marker when an actor exists but its matching current-workspace snapshot has not been read. The summary displays **Checking submitted changes…** instead of claiming all synced. Successful empty reads still return the existing all-synced message; known attention, syncing and waiting work retain their priority and wording. No actor still returns no repair work. Actor/database predicates, stale-callback guards, subscription cleanup, Draft filtering, once-per-repair aggregation and read-error attention are unchanged. `Loading` is never persisted and is not a business sync status, migration or receipt rule.

The added real IndexedDB regression pre-seeds Pending before mounting, holds the first read and checks the loading message for a full second, releases to the exact one-repair Pending summary, then repeats with a different account and an old-workspace update. A forced read rejection must show attention. The corrected regression was run against the old hook and **FAILED**: all four unresolved-read checks failed, while both resolved Pending checks and error attention passed. After the source change it passes in both requested suites. The first helper attempt also exposed a Dexie ReadOnlyError from a foreign promise context; the helper was corrected to use `Dexie.Promise` for the held query and polling for entry. That fixture error is not product evidence and assertions were not relaxed.

### Remediation DoD and actual commands

| Gate | Result |
|---|---|
| Old-hook regression demonstrates HDR-01 | PASS as negative control: exit 1, structured FAIL with four false loading checks; not counted as a passing test run |
| Startup and switched-account unresolved reads | PASS, new browser test, including old-workspace update while current read is held |
| Resolved Pending / read error | PASS, Pending remains counted once; rejection shows attention |
| Existing repair/Draft/evidence/wording | PASS, original real IndexedDB browser test and exact-string unit cases retained |
| `npm run typecheck` in apps/web | PASS, exit 0 |
| `..\api\node_modules\.bin\tsx.cmd --test tests/headerSyncSummary.test.ts` | PASS, exit 0, 8/8, zero skips |
| `npx playwright test tests/header-repair-sync-summary.spec.ts tests/header-proposal-sync-summary.spec.ts tests/header-offline-mid-session.spec.ts --workers=1` | PASS, exit 0, 7/7 in 25.5s, zero skips |
| `npx playwright test tests/header-repair-sync-summary.spec.ts tests/repair-c1-inspection-regressions.spec.ts --workers=1` | PASS, exit 0, 26/26 in 57.1s, zero skips, includes 24 ordinary compatibility cases |
| `npm run build` in apps/web | PASS, exit 0; 291 modules, 11 precache entries, 1507.55 KiB; existing >500 kB chunk advisory retained |
| `git diff --check` from repository root | PASS, exit 0; CRLF warnings only |
| Protected scope / unrelated work | PASS, protected status/baseline comparisons empty; migrations 051/052 and Dexie v10 hashes unchanged; approved 10f3bbb unchanged; all other 60 earlier manifest entries match |
| Full cold API/D/DB/release gates | NOT RUN for this bounded Level 1 display change; existing restore container and runtime untouched |
| Deployment / physical-phone retest / independent re-review | NOT RUN, remains next-checkpoint evidence; earlier phone proof below applies to the earlier deployed candidate |

P0 remaining: **0 identified**. P1 remaining: **0 identified**. Open implementation P2 in this fix: **0 identified**; HDR-01 remediated with a failing-old/passing-new regression. Independent acceptance of the changed candidate remains pending; owner closure is not authorized by a green implementation table.

### Changed source/test candidate

The original `logs/cr09-header-fix-candidate-hashes.json` remains intact as the reviewed/deployed snapshot. Five files intentionally differ; App.tsx is unchanged, including its unrelated work. Current six-file SHA-256 values for re-review:

| File | SHA-256 |
|---|---|
| apps/web/src/App.tsx | `509409FC754220EC6C7ED598627300751D5986BE425E0E265E73D82722CEDB3D` |
| apps/web/src/sync/headerSyncSummary.ts | `988036F89B069222E318E3DE0481DA39FDF6134A74C95F256C2851139DB7FD47` |
| apps/web/src/sync/useRepairSyncStatuses.ts | `B319E5A75DD32BF2947A2B14E585B4E9B6E2270FCDFF580BBDAAEBD7A8AF7CCF` |
| apps/web/tests/headerSyncSummary.test.ts | `E7F991A7A663998318CD46762707E3C0136FFDD45D53E067262D4F345BD7DDB7` |
| apps/web/tests/header-repair-sync-summary.html | `B4A9F6945DD6A1F2F45957283135AFB1F6D2FC6A9C2494AE521F3EC329FE9F83` |
| apps/web/tests/header-repair-sync-summary.spec.ts | `5F1EE049DC81F01D146161BA0456069C60B5C5FFB0D615B3DE4220F184B62AF4` |

Files changed by the remediation: hook (unread-state marker), summary (loading wording), unit test (loading priority and successful empty read), HTML harness (held startup/account reads and read-error checks), browser spec (new loading regression), this report (remediation evidence), HANDOVER and owner acceptance report (current checkpoint). App.tsx, schemas, sync/receipt authority, API/PDF code, lock files and deployment configuration were not edited. **HISTORICAL IMMUTABILITY INTACT: Y with approved 10f3bbb exception.** No Git mutation, production write, deployment, phone action, Docker/restore-container operation or cleanup occurred.

Reproducible focused commands; no database is needed or used:

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\web
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed' }
..\api\node_modules\.bin\tsx.cmd --test tests/headerSyncSummary.test.ts
if ($LASTEXITCODE -ne 0) { throw 'Header unit tests failed' }
npx playwright test tests/header-repair-sync-summary.spec.ts tests/header-proposal-sync-summary.spec.ts tests/header-offline-mid-session.spec.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Header/offline browser tests failed' }
npx playwright test tests/header-repair-sync-summary.spec.ts tests/repair-c1-inspection-regressions.spec.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Header/inspection browser tests failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
cd C:\PWA_OfflineRecordWebApp
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed' }
```

Limitation: the new text was verified in browser harnesses, not a new physical-device/three-width layout session. No CSS or controls changed. The last recorded deployment remains `build-20261013T180055Z` / `sha256-9b2f90c04cb06999`; it does not contain this fix. The local build is not a deployed release. Independent re-review and any authorized publication/phone acceptance remain separate checkpoints. **SAFE FOR FOCUSED INDEPENDENT RE-REVIEW: Y. Stop before staging.**

## Earlier independent review — rejected original candidate

Reviewed: 2026-10-14 (Asia/Kuala_Lumpur). Scope: the six-file shared repair sync-header remediation, including only its subscription/summary wiring in App.tsx. This is an independent review of the hash-bound candidate, not implementation readiness or owner Level 3 closure.

**FOCUSED INDEPENDENT REVIEW ACCEPTED: N**

**READY FOR OWNER LEVEL 3 ACCEPTANCE CLOSURE: N**

**OWNER LEVEL 3 ACCEPTANCE PASSED: N**

The candidate matches and all requested focused checks pass. One newly demonstrated, checkpoint-blocking P2 remains: persisted Pending work can still display **All submitted changes synced** before the first repair-status read completes. No relevant P0/P1 was identified. No source fix was made.

## Candidate identity and scope

Working directory `C:\PWA_OfflineRecordWebApp`; branch `phase-8e-client-demo-polish`; HEAD `97a0cac4e7458cd109f234ed6d8d750f96dd5c4e`. HEAD alone does not identify this uncommitted/untracked candidate.

All six actual SHA-256 values match `logs/cr09-header-fix-candidate-hashes.json`:

| File | Actual SHA-256 | Result |
|---|---|---|
| apps/web/src/App.tsx | `509409FC754220EC6C7ED598627300751D5986BE425E0E265E73D82722CEDB3D` | MATCH |
| apps/web/src/sync/headerSyncSummary.ts | `A15F509A6C2F9D8BC8A6FCB4548E9E57293A54F9964692986BC74ADA19777B38` | MATCH |
| apps/web/src/sync/useRepairSyncStatuses.ts | `15B05696186A7A9FE02DA76891C9271A77BB840457FC1951392FBC18E61E978C` | MATCH |
| apps/web/tests/headerSyncSummary.test.ts | `A08023C1F85D322366E56A77F7765112D36041C371F5B30CCA77CC48AD516698` | MATCH |
| apps/web/tests/header-repair-sync-summary.html | `6DDF41CF3A2596818D5CEE4F086BFAC99FE6ED38350EB21BCB5D8E1637521373` | MATCH |
| apps/web/tests/header-repair-sync-summary.spec.ts | `155263B90C936021C3510840248311CB7D4E453E2BFF4961C0E143A99AAA909A` | MATCH |

Supplied deployed identity, corroborated by prior build/phone evidence: **build-20261013T180055Z**, web release **sha256-9b2f90c04cb06999**, proxy image **sha256:2d356700b0a1d1ceed332f39aeb1b85eb0ea9c557077f931e581f364f8ebde32**. The prior Docker build log records this manifest-list digest; phone state and screenshots record the build. The release is recorded in the owner report. No deployment, new production build, or read of the currently running proxy was performed here; this is recorded identity, not a new runtime certification.

The App.tsx remediation is the `useRepairSyncStatuses` import at line 211, invocation with `headerUser?.id` at line 2295, and `repairStatuses` summary argument at line 2300. Other dirty App.tsx changes include repair routing/screens, lazy review rendering, authentication/editor preservation, navigation and Manager leave handling. They are pre-existing work, outside this focused review and preserved. The entire App.tsx hash matches the candidate manifest. Comparison of all 61 entries in `logs/cr09-owner-level3-candidate-hashes.json` shows only App.tsx differs; the other 60 match. The new hook/harness and summary/test changes are explicitly captured by the six-file manifest.

Read AGENTS.md, current/relevant historical HANDOVER checkpoints and the owner acceptance report; applied codex-task-brief, mobile-first-ui, offline-first-pwa, indexeddb-data-model, sync-engine, pwa-release-testing and the task brief's governing v7-evidence-acceptance skill. The explicit focused review commands and prohibition on production/integration/cleanup actions govern this task; full cold D/backend/release gates were not rerun.

## Finding and owners

| ID | Severity / gate | Concrete defect | Owner |
|---|---|---|---|
| HDR-01 | P2, blocks this checkpoint | `useRepairSyncStatuses.ts:7,31` has no initial snapshot and returns `[]`; `headerSyncSummary.ts:29-32` interprets it as all synced. Mount the real hook for an actor whose IndexedDB already contains a Pending repair and delay its first `repairRecords.toArray()` resolution: the header claims **All submitted changes synced** for the entire unresolved read, despite submitted work. After release it changes to **1 repair waiting to sync**. | Shared-header implementation owner; independent reviewer verifies the changed candidate; owner acceptance closer owns Level 3 closure |

This is an unknown-readiness state being represented as confirmed absence of work. A normal fast query may make it brief; slow device/storage scheduling can extend it. The independent browser probe held the read for one second and observed the exact false text. It does not demonstrate physical-phone read latency or data loss. No false receipt, mutation or cross-account disclosure was observed. Severity remains P2 because this is status presentation; it blocks because preventing the false all-synced claim is the purpose and explicit gate of this remediation.

Required follow-up: represent unread/current-workspace loading separately from a successfully read empty list; do not claim all submitted work synced until the repair read succeeds. Add a focused regression that pre-seeds Pending work before mounting and holds the first read, plus the account-change equivalent. Preserve actor/database guards and fail-to-attention behavior. This review does not authorize that fix.

The current harness begins with an empty workspace, then polls eventual states. It proves reactive changes after the first successful read but cannot catch HDR-01. The spec is one browser test containing 12 internal checks, not 12 separately collected tests.

P0 remaining: **0**. P1 remaining: **0**. Relevant P2 remaining: **1, checkpoint-blocking**. NEW DEFECTS: **Y — HDR-01**. Previously recorded steady-state Pending defect is remediated; independent acceptance is still withheld.

## Requirement disposition

| Requirement | Result / evidence |
|---|---|
| Candidate matches | PASS, all six hashes match; other 60 prior manifest entries preserved |
| Submitted Pending prevents all synced | FAIL across first-read lifecycle, HDR-01; PASS after successful read, browser harness and recorded phone Pending evidence |
| Count each repair once; evidence not double counted | PASS, one mapped status per non-Draft parent (`useRepairSyncStatuses.ts:15-22`); parent+photo Pending yields one waiting repair in real IndexedDB harness |
| Drafts excluded | PASS, filter before attachment read; unit/harness Draft checks; prior phone Draft evidence retained |
| Evidence Uploading / parent Syncing | PASS, merged priority maps either to Syncing; evidence Uploading exercised by browser, parent Syncing by unit test/source inspection |
| Failed / Conflict attention | PASS, Conflict then Failed outrank running/waiting; evidence Failed and parent Conflict browser checks; unit tests both states |
| Exact confirmed records return synced | PASS, recorded actual exact receipts and final phone UI; harness confirms eventual both-Synced state. Hook is read-only and does not infer write success |
| IndexedDB updates without sync event | PASS, Dexie liveQuery observes parent/photo changes; harness emits no sync events and local transaction immediately changes summary |
| Actor/workspace switching | PASS for privacy, pinned database and actor/current-workspace render guard; wrong-actor Failed row and old-workspace update ignored in browser. Loading message after switching is subject to HDR-01 |
| Stale callbacks and cleanup | PASS by source inspection: `active`, captured DB equality and actor/workspace predicate guard both callbacks; cleanup sets inactive before unsubscribe. Existing harness changes accounts, mutates previous DB and unmounts. Held in-flight callback at unmount was not separately fault-injected |
| Read errors do not silently claim success | PASS after rejected read: source error callback sets Failed; independent forced-read-error probe displays Sync needs attention. Unknown/unresolved first read remains HDR-01 |
| Inspection/attachment/proposal wording | PASS, existing strings unchanged; unit exact strings, proposal browser and four mid-session offline tests; 24 ordinary compatibility cases |
| Mobile header | PASS for recorded phone Pending/Synced presentation; existing text/attention semantics retained, no layout/CSS/tap-target change. Fresh three-width UI audit not performed |
| No migration/schema/API/receipt/PDF change | PASS within delta; six files are web read/subscription/summary/tests only; protected anchors and reviewed D inventory unchanged |
| Focused automated commands | PASS, 7 + 6 + 25 tests, zero skips, typecheck exit 0 |
| Whitespace | PASS, git diff --check exit 0; LF-to-CRLF warnings only |
| Independent acceptance / closure readiness | FAIL, HDR-01 cannot be deferred beyond this header-status checkpoint |

## Commands actually performed

From `C:\PWA_OfflineRecordWebApp\apps\web`:

| Command | Result |
|---|---|
| `npm run typecheck` | Exit 0 |
| `..\api\node_modules\.bin\tsx.cmd --test tests/headerSyncSummary.test.ts` | Exit 0, 7 passed, 0 failed/skipped |
| `npx playwright test tests/header-repair-sync-summary.spec.ts tests/header-proposal-sync-summary.spec.ts tests/header-offline-mid-session.spec.ts --workers=1` | Normal-process rerun exit 0, 6 passed in 20.4s, zero skips |
| `npx playwright test tests/header-repair-sync-summary.spec.ts tests/repair-c1-inspection-regressions.spec.ts --workers=1` | Normal-process rerun exit 0, 25 passed in 52.4s, zero skips; includes 24 imported ordinary compatibility cases |

The first sandbox browser attempt stalled after Vite startup output; the second attempted suite failed because its port 4175 was still occupied. The stalled process was interrupted; both suites were then run sequentially with approved normal process access and passed. The initial attempts are not PASS. No assertions, test timeouts, retries or route handlers were weakened. No automatic approval rejection remained.

Additional review actions: read-only Git status/branch/HEAD/diffs, SHA-256 manifest comparisons, protected baseline comparisons, recorded JSON-state comparisons and local image viewing. `git diff --check` ran from the repository root and was repeated after documentation edits. A temporary Vite server on 127.0.0.1:4175 supported the independent delay/error probe and was stopped afterward. Probe startup first encountered a closed test server, then a Vite CommonJS export-import error; neither is product evidence. The corrected probe returned:

```json
{"entered":true,"storedStatus":"Pending","heldReadHeader":"All submitted changes synced","resolvedReadHeader":"1 repair waiting to sync","readErrorHeader":"Sync needs attention"}
```

Reproduce the probe without changing candidate source, production, or the restore database. In one terminal run the temporary server; in another run the script below, then stop only that temporary server. The browser uses an ephemeral isolated context; the record is synthetic test data in that context's IndexedDB.

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\web
npm run dev -- --host 127.0.0.1 --port 4175 --strictPort
```

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\web
@'
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
try {
 const page = await browser.newPage();
 await page.goto('http://127.0.0.1:4175/tests/header-repair-sync-summary.html');
 const result = await page.evaluate(async () => {
  const React = (await import('/node_modules/.vite/deps/react.js')).default;
  const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const dbm = await import('/src/db/localDatabase.ts');
  const { useRepairSyncStatuses } = await import('/src/sync/useRepairSyncStatuses.ts');
  const { headerSyncSummary } = await import('/src/sync/headerSyncSummary.ts');
  await dbm.activateUserWorkspace(9010); const db = dbm.localDatabase;
  await db.repairRecords.put({ clientUuid:'review-pending', actorId:9010, syncStatus:'Pending' });
  const original = db.repairRecords.toArray.bind(db.repairRecords);
  let entered = false, release; const gate = new Promise(r => { release = r; });
  db.repairRecords.toArray = async () => { entered = true; await gate; return original(); };
  const target = document.createElement('div'); document.body.append(target); const root = createRoot(target);
  function Header() { const repairStatuses = useRepairSyncStatuses(9010); return React.createElement('span', null, headerSyncSummary({ inspectionStatuses:[], attachmentStatuses:[], proposalStatuses:[], repairStatuses }).text); }
  root.render(React.createElement(Header));
  for (let i=0;i<100 && !entered;i++) await new Promise(r=>setTimeout(r,20));
  await new Promise(r=>setTimeout(r,1000)); const before = target.textContent; release();
  for (let i=0;i<100 && target.textContent !== '1 repair waiting to sync';i++) await new Promise(r=>setTimeout(r,20));
  const after = target.textContent; root.unmount();
  db.repairRecords.toArray = async () => { throw new Error('review read failure'); };
  const errorRoot = createRoot(target); errorRoot.render(React.createElement(Header));
  for (let i=0;i<100 && target.textContent !== 'Sync needs attention';i++) await new Promise(r=>setTimeout(r,20));
  const readError = target.textContent; errorRoot.unmount();
  return { entered, storedStatus:'Pending', heldReadHeader:before, resolvedReadHeader:after, readErrorHeader:readError };
 }); console.log(JSON.stringify(result));
} finally { await browser.close(); }
'@ | node --input-type=module
```

The four requested commands above are reproducible as listed from apps/web. They use the local test harness, not PostgreSQL. Full cold backend/D gates and a fresh production build were intentionally outside this review's requested scope.

## Recorded physical-phone evidence independently inspected

These are earlier owner-authorized actions recorded in the acceptance report, on OPPO CPH2375 / Android 13 installed HTTPS WebAPK. The independent review performed no ADB action, device reload/force-stop, capture, deployment, live sync/replay or production query.

| Prior evidence | Independent inspection result |
|---|---|
| `logs/cr09-header-fix-offline-pending.json`, `cr09-header-fix-offline-visible.json`, `cr09-header-fix-offline-pending.png` | Exact corrected build; offline, standalone and controlled; parent/photo Pending; header text 1 repair waiting to sync. Screenshot is scrolled to the per-part Pending record/photo, so the header text proof here is the visible-state JSON |
| `cr09-header-fix-reopened-state.json`, `cr09-header-fix-reopened-visible.json`, `cr09-header-fix-reopened.png`, `cr09-header-fix-retention-comparison.json` | Before/reopened state files are byte-identical; records, photos and outbox compare exactly. Reopened screenshot visibly shows Offline / 1 repair waiting to sync / Offline ready and corrected build without clipping |
| Owner report OS commands and `cr09-header-fix-stopped-pid.txt` | Report records am force-stop for WebAPK and Chrome followed by absent PID and installed launcher relaunch offline; PID artifact is empty. Reviewed as recorded OS termination evidence, not inferred from a reload or harness. This review did not witness/repeat the OS operations |
| Frozen repair/Blob retention | Parent `cf4eddcc-517a-40ee-bc3f-d339af4b61b7`, cycle 3; photo `ff7dc9db-7be1-49e2-83b8-3cbac27d0d95`; fingerprint `6ae7b5daba2d15828f4c76676ede3c68825e7740f5e35e3500eda222cbc1828b`; Blob 14,574 bytes, SHA `79dd10dfaefe68b016bf0d889e15ea45fc0630e8b81b95c734a44c9f4d07a224`; unchanged frozen payload/manifest and two Pending operation UUIDs across restart |
| `cr09-header-fix-live-network.json` | Actual recorded stage response at CDP time 1125213.476233 precedes parent POST at 1125213.571186. Parent request matches frozen record; exact receipt UUID/fingerprint and evidence photo/repair identity match |
| `cr09-header-fix-confirmed-state.json`, `cr09-header-fix-confirmed-visible.json`, `cr09-header-fix-confirmed.png` | Parent/photo Synced, exact receipts present, outbox empty; screenshot visibly says All submitted changes synced. Retained Blob/source SHA matches; stored SHA `4704cb184b62171ff1a0ef74705bd402ce4237ab460778dc974583919b523517` |
| `cr09-header-fix-exact-replay.json` and `.js` | Two recorded evidence/parent retries return exact fingerprint matches and the same parent receipt. Script uses existing frozen request/Blob. One repair/one evidence row after retry is recorded in owner report; not independently re-queried here |
| Prior `cr09-owner-offline-before-forceclose.json` / `cr09-owner-offline-after-forceclose.json` | Inspected retained initial camera Draft and gallery Pending repair with exact UUID/frozen record, 12,030/14,867-byte Blob hashes and two Pending operations; older build, not substituted for corrected-build evidence |
| Prior `cr09-owner-original-boundary.json`, `cr09-owner-final-issued-history.json` and owner acceptance tables | Context preserves earlier role-boundary denials and issued-history authority. No new assignment/review/export action or PDF acceptance claimed by this focused review |

The report's nonexistent `*-visible.json/.png` naming shorthand was resolved to the actual files `cr09-header-fix-reopened.png` and `cr09-header-fix-confirmed.png`; visible-state JSON files exist separately. Phone screenshots are private ignored evidence and were not copied into tracked documentation. Earlier actual phone checks remain prior evidence. The browser harness, synthetic held read and mocked ordinary API routes are desktop test proof only.

## Protected scope, limitations and documentation changes

Migration 051 SHA `BF057005856ED16580E4D6EDEE587A1B86121C5313940694325F0421A569694E`, migration 052 SHA `0C02AE438450DBE9F0F7EB9A9B4374AD3601B8B384A7A8AA3F6E7EC9538A2596`, Dexie localDatabase SHA `3A48F39E2F3C48EBBEEA9FD7E3D35CE317E1B7C74544039565AD267A73774445`, approved V6 evidence SHA `A92914DB2017FAF49611DB132E70329762723409536027E1337355526ACFDA7B` all match the recorded anchors. Protected `git status --short` is empty. Explicit V1-V6 template/017/V6 acceptance/PDF diff against e30c649 is empty; V6 evidence diff against approved 10f3bbb is empty. **HISTORICAL IMMUTABILITY INTACT: Y, with the approved exception retained.** Broader historical behavior relies on the prior independent D gates; no new historical suite is claimed.

All prior 61-file manifest entries except the explicitly changed App.tsx match. No migration, Dexie schema/index, API authority, receipt validator, PDF, package-lock, deployment configuration, runtime directory or business record was changed by this review. Existing disposable restore container/recovery data was not accessed, overwritten or cleaned. No PostgreSQL integration tests or Docker operation ran. Existing unrelated dirty/untracked work remains preserved. No staging or other Git mutations.

Limitations retained for the acceptance owner/operator: this is not a fresh runtime/image/HTTPS certification; no new physical phone test, all-system phone coverage, production rollback/image import, physical PC reboot, production restore or full client disaster recovery proof. The latest post-retest backup pair was not restored, as already recorded. Full retrospective original D hash certification remains limited to available anchors/inventory; this focused six-file identity is exact. Existing retention 10 override and compatible Dexie v10/API 051/052 rollback requirements remain operator-owned. These inherited limits are not silently closed or promoted to new focused source findings.

Only documentation changed in this review:

- `docs/testing/CR09_HEADER_SYNC_INDEPENDENT_REVIEW_REPORT.md`: candidate identity, independent results, phone-evidence assessment and HDR-01 disposition.
- `HANDOVER.md`: latest checkpoint and blocked review/closure verdict, preserving prior checkpoints.
- `docs/testing/CR09_OWNER_LEVEL3_ACCEPTANCE_REPORT.md`: latest independent-review outcome and owner/follow-up, preserving prior implementation and phone evidence as historical records.

Next checkpoint: owner-authorized focused loading-state remediation, then independent re-review of the changed hash-bound candidate and appropriate regression checks. Final owner Level 3 closure remains owner-controlled. Implementation and prior phone success alone do not satisfy this independent gate. **Stop before staging.**
