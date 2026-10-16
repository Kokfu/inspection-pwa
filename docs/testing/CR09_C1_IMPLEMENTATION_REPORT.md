# CR-09 C1 — Technician Repair List implementation

Date: 2026-10-13 (Asia/Kuala_Lumpur).
Scope: section 8 **C1 only** and remediation authorized after independent re-review. The current remediation and results are below; earlier sections retain their historical findings and trial results. Independent C1 acceptance and C2 readiness remain N pending re-review.

## Auth-error recovery and compatibility remediation — 2026-10-13

The re-review reproduced a remaining P1: a local remark save failure followed by auth verification receiving HTTP 503 or malformed JSON moved to online-unavailable and unmounted the editor. Try Again with the same technician restored a blank remark without warning. App now retains only the matching technician workspace's repair editor, hidden and inert, throughout verifying and online-unavailable. Server actions remain blocked; explicit logout or a different verified actor still unmounts the old editor. No ordinary inspection or Manager authority predicate changes.

Four permanent regressions cover both responses, same-account text recovery and Save Draft retry, retained navigation guards, hidden/inert controls with no repair requests while authority is unavailable, and different-account isolation. All four pass in `logs/cr09-c1-auth-error-focused.log`.

The inherited P2 was a required compatibility proof gap, not a waiver. The fixture seeded local records after mounting App, racing workspace restoration and cached reads; it now seeds the explicit isolated user workspace and canonical cached job before App mounts. Each retired response is persisted before routing. Fire Alarm's immediate select count also raced the offline transition and incorrectly chose the button branch; the test now waits for the retired field and uses its known native select. All original retired-value, offline-edit, persisted-Good and indicator-removal assertions remain. No production inspection form or validator changes. The complete 24-case suite passes against the hash-exact pre-C1 App (`E26CEB406E8415E9E290B5F308CE70FD8567DFD67BD28F8FCB5D58E5B82A89DB`), and the current Fire Alarm retired-draft case passes three repeated runs. The baseline probe now expects success with corrected fixtures. The cold runner requires all 24 original default-mode cases; the 14 healthy-online cases remain separate proof.

Validation: final cold runner completed with exit 0, ALL GATES PASS and zero skips (`logs/cr09-c1-gates.log`): 34 core cases (21 C1 + 10 B3 + 3 standing inspection), 24 default-mode compatibility cases, and 14 separate healthy-online cases. Also 4/4 focused auth recovery, 3/3 Fire Alarm offline repetitions and 24/24 corrected fixtures against the exact pre-C1 App. Earlier trial failures from hidden-element test lookup and fixture readiness/control timing are corrected; incomplete or failed trials are not credited as PASS. The prior grouped P2 compatibility proof gap is closed by actual default-mode offline persistence proof, not deferred or waived. P0/P1/P2 remaining in remediation scope: 0/0/0. SAFE FOR C1 RE-REVIEW: Y. C1 INDEPENDENT REVIEW ACCEPTED: N; READY FOR C2: N pending independent review.

| Remediation DoD / standing gate | Actual result |
|---|---|
| 503/malformed auth response, retained failed-save edits, same-account retry and guard | PASS — both response cases |
| Different-account recovery does not inherit hidden editor, records or text | PASS — both response cases |
| No verified authority/repair requests while unavailable; hidden/inert editor | PASS |
| Focused auth recovery | PASS — 4/4 |
| Fire Alarm retired-draft offline edit repeated | PASS — 3/3 |
| Hash-exact pre-C1 App with corrected compatibility fixtures | PASS — 24/24 |
| All default-mode Phase A entry/retired-draft/report fixtures on current App | PASS — 24/24 |
| Chromium available | PASS |
| API typecheck | PASS |
| API build | PASS |
| Historical matrix | PASS — 20/20 |
| V6 evidence | PASS — 11/11 |
| Wet Chemical definition | PASS — 2/2 |
| V7 contracts/config | PASS — 38/38 |
| B1 readers | PASS — 22/22 |
| B1 integration | PASS — 10/10 |
| B2 integration | PASS — 18/18 |
| Storage reconciliation | PASS — 1/1 |
| V6 integration | PASS — 1/1 |
| CO2 V7 integration | PASS — 4/4 |
| Wet Chemical V7 integration | PASS — 2/2 |
| Fire Alarm V7 integration | PASS — 4/4 |
| Evidence race | PASS — 1/1 |
| Optional-photo/ordinary report/PDF regression | PASS — 14/14 |
| Web typecheck | PASS |
| Production web build | PASS |
| Production precache | PASS — 3/3; 10 entries, unchanged default 2 MiB limit |
| Web stale evidence | PASS — 1/1 |
| Core C1/B3/standing inspection cases, all three viewports | PASS — 34/34 |
| Separate healthy-online entry/display proof | PASS — 14/14 |
| Auto-sync guard | PASS — 8/8 |
| Queued-write guard | PASS — 8/8 |
| Protected historical status / approved 10f3bbb exception | PASS — protected status empty; exception exact to approved commit |
| Reviewed B1/B2/B3, migration 051, Dexie v10 and unrelated work | PASS — 1,203/1,213 starting files unchanged; only ten listed files differ |
| Whitespace and scope | PASS — git diff --check; no Git mutation, deployment, runtime/customer write or C2 |

Changed files in this remediation:

| File | Reason |
|---|---|
| `apps/web/src/App.tsx` | Retain matching repair editor during online-unavailable auth state without granting authority |
| `apps/web/tests/repair-c1.spec.ts` | Four auth-error recovery/account-isolation regressions |
| `apps/web/tests/result-tap-scroll.html` | Seed isolated local workspace and cached job before App restoration |
| `apps/web/tests/repair-disabled.spec.ts` | Await offline form recovery and choose Fire Alarm's actual select without a racy count |
| `apps/web/tests/repair-c1-inspection-regressions.spec.ts` | Clarify separate healthy-online proof |
| `scripts/testing/verify-cr09-c1.ps1` | Require all default-mode entry/retired-draft compatibility cases |
| `scripts/testing/probe-cr09-c1-phase-a-baseline.ps1` | Document corrected fixtures and expected passing baseline proof |
| `HANDOVER.md` | Current remediation/checkpoint status |
| `docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md` | Current C1 status and independent review boundary |
| `docs/testing/CR09_C1_IMPLEMENTATION_REPORT.md` | Actual remediation evidence and DoD |

Reproduce from cold:

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\scripts\testing\verify-cr09-c1.ps1
& .\scripts\testing\probe-cr09-c1-phase-a-baseline.ps1 -Grep 'CR-09'
```

The runner creates/removes its unique disposable PostgreSQL container on 127.0.0.1:55432 only, forces BOTH database URLs, uses NODE_ENV=test for API fixtures and production for the web build. No runtime/customer writes, deployment, Git mutation or C2 work. Browser evidence is controlled routes, real IndexedDB/test-worker reload and synthetic camera, with separate disposable PostgreSQL integration; no live browser-to-PostgreSQL, installed-PWA force-close, physical-phone or Level 3 claim.

## Independent-review recovery remediation — 2026-10-13

Earlier checkpoint; the current remediation section above supersedes its open findings and readiness claims.

The review reproduced two new C1 failures: authentication re-verification discarded failed-save remark text, and cancelling the second sign-out confirmation consumed the unsaved-navigation guard. The owner authorized these fixes only; inherited Phase A fixtures remain unchanged.

- The same technician's repair editor stays mounted, hidden and inert during session verification. This is limited to repair routes and the matching existing local workspace; server authority remains unverified, and normal inspection/Manager authorization is unchanged. Explicit logout and a different actor unmount the old editor. A suspended editor closes its camera and stops streams while retaining saved photos and remark recovery. No additional persistence or submission pipeline is introduced.
- Sign-out checks the existing leave guard without consuming it, and clears it only after the submitted-work confirmation also succeeds. Default helper callers keep their existing behavior. Verify Sign-in preserves the repair editor and no longer consumes its leave guard.
- Two permanent regression tests failed on the reviewed code before the fixes. Final focused remediation verification passes 5/5, including failed-save recovery through offline/online and manual verification, declined navigation, Save Draft retry, cancelled and completed sign-out, hidden/inert verification, different-account isolation, offline revoked/source-review work and camera stream cleanup.
- The existing baseline probe removes only these C1 App integration additions before enforcing the unchanged pre-C1 SHA-256. Original fixtures and assertions remain unchanged.

The first remediation cold run passed standing API/build gates and 28/30 core browser cases but failed the camera cleanup timing assertion and the existing offline-status assertion. Its log is retained in logs/cr09-c1-remediation-first-cold-gates.log. Retaining the page also retained its prior success message; the status now always includes the offline/unverified notice. Camera assertions await React's asynchronous cleanup and still require every track to end. The unchanged offline-authority test and strengthened camera test now pass in the 5/5 focused run. Supplementary ordinary-form/Manager verification produced 23 passed and 14 existing skipped cases; those skips are not credited as passes. The adapted baseline probe reconstructed the exact pre-C1 hash and reproduced the default Hose Reel failure, expected exit 1.

The second cold run passed the recovery tests and 29/30 core browser cases but failed on a viewport fixture callback evaluating an already-closing page. Its log is retained in logs/cr09-c1-remediation-second-cold-gates.log. A third run also passed 29/30 but exposed duplicate route cancellation when teardown changed the browser's network state; logs/cr09-c1-remediation-third-cold-gates.log retains that failure. Final C1 teardown blocks new fetches without changing connectivity, then waits for routed callbacks while the page remains alive. It does not ignore callback errors or change product assertions. All 17 C1 cases passed in a separate final-source browser run before the final cold runner.

Final cold verification completed with **exit 0 / ALL GATES PASS / zero skips**, including **30/30 core browser cases (17 C1 + 10 B3 + 3 standing inspection cases)** and **14/14 healthy-online entry/display cases**. The runner started another fresh disposable PostgreSQL at 127.0.0.1:55432, forced both database URL variables, used NODE_ENV=test for API fixtures and NODE_ENV=production for the web build, and removed its own container. Production build retains 10 precache entries (1463.33 KiB), with all chunks under the unchanged default limit. Evidence: logs/cr09-c1-gates.log, logs/cr09-c1-remediation-focused.log and logs/cr09-c1-remediation-final-c1.log.

The five original Phase A failures remain one inherited P2 validation-debt item. The prior independent review confirmed all five against the hash-exact pre-C1 App; the healthy-online 14-case entry/display suite does not close the four retired-draft compatibility scenarios. That required compatibility DoD remains unproven; the implementation report cannot waive it. No C1 acceptance or C2 readiness is claimed.

Changed files in this remediation: App.tsx (repair-only mount continuity and final sign-out guard consumption), AppShell.tsx (hidden/inert suspended presentation), RepairList.tsx (non-destructive sign-in verification and persistent offline notice), RepairPartView.tsx (close camera on suspension), managerLeaveGuard.ts (optional non-consuming confirmation), repair-c1.spec.ts (three new regressions and strengthened camera cleanup coverage), probe-cr09-c1-phase-a-baseline.ps1 (retain hash-exact baseline reproduction), this report, HANDOVER.md and the checkpoint plan. Pre-remediation hashes are recorded in logs/cr09-c1-remediation-baseline.json.

| Remediation DoD / standing gate | Actual result |
|---|---|
| Failed-save text survives offline/online and manual same-actor verification; Save Draft retry | PASS |
| Cancelled sign-out retains navigation guard; completed sign-out still works | PASS |
| Hidden/inert verification; no repair requests while held; different-account isolation | PASS |
| Camera stops when suspended; saved After retained; offline notice remains visible | PASS |
| Final focused recovery/authority/camera cases | PASS — 5/5 |
| Separate final C1 browser suite | PASS — 17/17, zero skips |
| Full core C1/B3/inspection browser suite and three viewport sizes | PASS — 30/30, zero skips |
| Healthy-online entry/display proof | PASS — 14/14; separate from inherited failures |
| Chromium | PASS |
| API typecheck | PASS |
| API build | PASS |
| Historical matrix | PASS — 20/20 |
| V6 evidence | PASS — 11/11 |
| Wet Chemical definition | PASS — 2/2 |
| V7 contracts/config | PASS — 38/38 |
| B1 readers/integration | PASS — 22/22, 10/10 |
| B2 integration/storage reconciliation | PASS — 18/18, 1/1 |
| V6 integration | PASS — 1/1 |
| CO2 V7 integration | PASS — 4/4 |
| Wet Chemical V7 integration | PASS — 2/2 |
| Fire Alarm V7 integration | PASS — 4/4 |
| Evidence race | PASS — 1/1 |
| Optional-photo/ordinary report/PDF regression | PASS — 14/14 |
| Web typecheck | PASS |
| Production web build | PASS |
| Production precache | PASS — 3/3 |
| Web stale evidence | PASS — 1/1 |
| Auto-sync/queued-write guards | PASS — 8/8, 8/8 |
| Supplementary Manager/ordinary-form suite | 23 PASS, 14 existing SKIP not credited as PASS |
| Hash-exact pre-C1 baseline probe | Verified exact hash; Hose Reel expected FAIL, exit 1 |
| Required Phase A retired-draft compatibility proof | FAIL/OPEN — inherited P2; no waiver |
| Protected historical files, reviewed B1/B2/B3/051/Dexie/unrelated work | PASS — 1,203/1,213 captured files unchanged; only ten intended files differ |
| Whitespace and scope | PASS — no Git mutation, deployment, runtime/customer writes or C2 |

Protected-path git status is empty; the sole protected difference from e30c649 is still the approved fireAlarmV6Evidence.ts exception, exact to 10f3bbb. No API/schema/Dexie/package-lock change. Phone, installed-PWA force-close, live browser-to-PostgreSQL and Level 3 acceptance remain unperformed.

Reproduce the complete cold runner from the repository root:

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\scripts\testing\verify-cr09-c1.ps1
```

**P0 remaining: 0. P1 remaining: 0 in remediation checks. P2 remaining: 1 verified inherited compatibility-proof gap. SAFE FOR C1 RE-REVIEW: Y. C1 INDEPENDENT REVIEW ACCEPTED: N. READY FOR C2: N.** Independent re-review remains required; stop before staging.

## Prerequisite and preserved authority

Before editing, read the completed **Review B3 repair implementation** re-review in chat `01a13119-c9f6-77d3-ba75-47a8675eac6a`, completed turn `01a1312c-a80e-7c71-a0c6-1e9b7fbe9d24`. Its final answer explicitly says **READY FOR C1: Y; SAFE FOR B3 REVIEW ACCEPTANCE: Y; PHASE B DATA+SYNC REVIEW ACCEPTED: Y; P0: 0 / P1: 0 / P2: 0; NEW DEFECTS: N.** All three former findings are closed. Repository pending-review wording was stale and is now marked as historical; implementation gates were not substituted for this independent prerequisite.

Inspected the initial working tree and captured 1,204 file hashes in `logs/cr09-c1-baseline.json`. Existing unrelated work was preserved. Read the build plan/prompts, B3 report and current HANDOVER, task-brief, mobile-first-ui, its UI/React companions, offline-first-pwa, IndexedDB, sync, V7 evidence, API security and release-testing skills. D1–D11 were treated as confirmed.

No API contract gap required a server edit. Existing B1 service/work-order/finding DTOs and B2 submitted-detail/After-content endpoints supply C1. Migration 051, Dexie v10, the B3 repositories/validators/sync, B1/B2 server authority, approved `10f3bbb` exception and production/precache follow-up remain unchanged.

## Behavior delivered

- Technician AppShell sidebar/mobile menu adds **Repair List** beside New Service Visit. Hash routes are `#/repair-list`, `#/repair-list/<jobId>/<systemKey>` and `#/repair-list/<jobId>/<systemKey>/<findingId>`. The existing workspace, role-selection and successful credential-login redirects preserve only these new repair routes; ordinary inspection routing retains its behavior. Technician role gating and account-scoped B3 context remain in force.
- List groups customers, original visits and services; the service screen groups frozen units/sections and only server-authorized failed parts. Group identity includes location, zone, instance and frozen unit metadata, so identical visible labels cannot collapse distinct rows. Frozen row numbers, asset references and locations are display labels, not record identities. Cached progress shows local Draft/Pending/Failed/Conflict separately from server history/Needs Review/Repaired history.
- Original technicians explicitly prepare their source service online once using the existing self-start route. Its request/work-order UUIDs are transactionally persisted in the existing per-user reference store before any request. Lost-response retry uses the exact same IDs and verifies the complete actor-bound receipt/fingerprint. Assigned technicians download their existing scoped work orders; no ordinary job-ownership access is widened.
- **Download for Offline** uses B3 reference and unchanged Before-byte caching. Original Before is read-only. Historical permitted absence, not downloaded, verified cached bytes and corruption have distinct labels. Failed authority refreshes show retained cache as informational and keep local entities/Blobs. Fresh authorized download can replace corrupt cached Before bytes without changing original authority.
- Every part has one own After photo and a nonblank repair remark. Capture/gallery, watermark/normalization and atomic one-photo storage use the existing helpers through B3. Typing queues serialized IndexedDB autosaves; Save Draft retries a failed local write. A page-wide use of the App's existing leave guard protects unsaved edits across hash navigation/sign-out, with field-level before-unload protection and an explicit retry message. Camera focus/Escape/Tab behavior is scoped to C1 around the shared dialog.
- **Submit Locally** flushes the remark save and invokes B3 transactional freeze of the exact part, photo manifest and both outbox operations. It never submits directly to the API. Offline/expired/revoked/source-review caches do not disable typing, capture, local save or local Submit. New online assignments still require server authorization. Pending/frozen content is immutable.
- **Sync / Retry**, **Refresh Authority**, **Verify Sign-in** and concrete Manager/Admin recovery instructions retain exact UUIDs, drafts, immutable submissions, operations and Blobs after assignment/source/auth errors. The existing App sync coordinator supplies reconnect/retry; no second dispatcher is added. A server submission receipt yields Synced/Awaiting Approval, never workmanship approval.
- History retains previous remarks, authors, dates, states and own local After Blobs. Online submitted-detail reads bind history, parent, manifest, evidence and normalized byte hash before showing a previous After and append-only decision reasons. Approval without a reason remains compatible with B2. Previous After photos are never substituted for Original Before.
- **Start Another Repair** explicitly creates a new B3 UUID/sequence/predecessor and fresh own-photo slot after approved/rejected/withdrawn history. A rejected cycle stays immutable. Awaiting predecessors and a Synced local submission absent from the downloaded history cannot expose another-start action; refresh is required before choosing lineage.
- Before/After stacks on phones and uses two columns at 768px+. New styles are scoped to repair selectors and use existing tokens/canonical breakpoints. Existing inspection forms, accepted content, ordinary Final Report/PDF and report-approval implementation are unchanged.

## DoD and actual results

Final cold verification completed with **exit 0 / ALL GATES PASS / zero skips**, recorded in `logs/cr09-c1-gates.log` and `logs/cr09-c1-runner-console.log`. **27/27 core browser cases (14 C1 + 10 B3 + 3 standing inspection cases)** and **14/14 supplementary healthy-online current-entry/display cases** passed. Both database URLs were deliberately invalid before the runner forced the disposable URLs. Final production build has **10 precache entries (1462.92 KiB)**; main/React chunks are **1196.17 / 222.53 kB**, under the unchanged 2 MiB limit.

The final combined cold runner passed all required C1 and standing checks below. The extra original-suite failures remain separately marked FAIL.

| DoD / standing gate | Result and actual proof |
|---|---|
| Green completed B3 prerequisite before edits | PASS — exact independent completed turn/verdict above |
| Technician navigation and original/assigned deep links | PASS — production App/AppShell; assigned #72 at all sizes; original #71 self-start; service/part reload |
| Customer/original visit/service/unit/section/failed-part grouping | PASS — frozen labels and distinct repeated row identities, including identical visible labels |
| Original Before remark/photo read-only | PASS — no editable Before controls; original remains unchanged through repairs/revisions |
| Historical permitted absence vs not downloaded vs cached vs corruption | PASS — separate labels; unchanged verified bytes; corrupt metadata retained and refused; fresh download recovery |
| One own After photo and nonblank remark per part | PASS — blank/whitespace/own missing-photo validation; another part's photo cannot satisfy the part |
| Offline typing, camera/gallery, local save/autosave and Submit | PASS — actual offline Chromium context; API fixtures refuse offline requests; synthetic camera through real dialog/processing |
| Offline reload and reconnect through B3 | PASS — Draft/Pending reload, frozen identity, own retained Blob; exact evidence-before-parent receipts and App reconnect coordinator |
| Separate local sync and server review state | PASS — Pending/unsubmitted and Synced/Awaiting Approval are distinct; no inferred approval |
| Assignment/source/auth errors preserve local work | PASS — stale work order/source/401 and denied refresh retain drafts, frozen records, exact operations and photos with recovery actions |
| Revoked/expired/Needs Review caches preserve local entry | PASS — typing/capture/save/Submit enabled; independent per-part requirements remain enforced |
| Rejected revision/repeat lineage and retained history | PASS — explicit new UUID/sequence/predecessor; fresh own-photo slot; old frozen records/Blobs retained; unrefreshed/awaiting cycles cannot expose new-start action |
| Submitted history/After/decisions | PASS — foreign identity refusal, complete receipt/manifest linkage, normalized byte integrity, rejection reason and approved null-reason compatibility |
| Local autosave failure and recovery | PASS — injected local write failure retains typed edits; declined route departure stays on form; Save Draft retry persists content |
| Strict/stale list authority | PASS — malformed list refused without replacement; older in-flight list cannot override the new list |
| Browser 360x800 / 768x1024 / 1280x800 | PASS — exact viewport runs; phone/tablet/desktop screenshots in `logs/cr09-c1-360.png`, `-768.png`, `-1280.png`; inspected layouts |
| Touch targets, labels, focus, errors and overflow | PASS — measured visible repair controls >=44px; 16px input; focus outline/error focus; camera Tab/Escape/return focus; no page overflow at all sizes |
| Mobile/UI/React companion audit | PASS — scoped tokens/min-width 768 layout, semantic actions/links, labels/alt text, object-URL cleanup, stable editor keys, parallel independent local reads, serialized saves and page leave protection |
| Chromium available | PASS — executable checked by cold runner |
| API typecheck / build | PASS |
| Historical matrix | PASS — 20/20 |
| V6 evidence/storage/compatibility | PASS — 11/11 |
| Wet Chemical definition | PASS — 2/2 |
| V7 contract / config | PASS — 38/38 |
| B1 readers / integration | PASS — 22/22 and 10/10 |
| B2 integration / storage reconciliation | PASS — 18/18 and 1/1 |
| V6 / CO2 V7 / Wet Chemical V7 / Fire Alarm V7 integration | PASS — 1/1, 4/4, 2/2, 4/4; separate processes |
| V7 evidence race | PASS — 1/1 |
| Optional-photo / ordinary report-PDF regression | PASS — 14/14; original reporting code unchanged |
| Web typecheck / NODE_ENV=production build | PASS |
| Production precache / stale evidence | PASS — 3/3 and 1/1; 10 entries, default 2 MiB unchanged; main/React chunks fit |
| Final-source C1 + B3 + standing inspection browser suite | PASS — 27/27: 14 C1, 10 B3, 3 existing inspection sync cases |
| Supplementary healthy-online entry/accepted-display scenarios | PASS — 14/14; all 12 current forms, Roller Shutter offline retired draft, accepted/ordinary report display; original assertions unchanged |
| Auto-sync / queued-write guards | PASS — 8/8 and 8/8 |
| Historical protected status and approved exception | PASS — protected status empty; sole e30c649 difference is approved V6 exception, exact to 10f3bbb |
| Reviewed B1/B2/B3/schema/051/unrelated-work preservation | PASS — 1,198/1,204 captured files unchanged; only three intended UI files and three checkpoint docs differ; new C1 files listed below |
| Whitespace, docs and scope stop | PASS — git diff --check clean; checkpoint documents updated; no next-checkpoint/Git/runtime/deployment action |
| Extra original default/retired Phase A suite | **FAIL — five pre-C1 harness failures retained; one grouped P2 validation-debt item, later acceptance checkpoint owns it; never counted PASS/SKIP** |

This table reports implementation proof. **Independent C1 review acceptance is pending.** The explicitly extra original-suite debt does not satisfy or waive later acceptance gates.

## Extra Phase A regression failures — explicitly retained

The first expanded cold run passed **all 13 then-current C1 cases**, **10 B3 cases**, standing API/build/inspection gates and 20 of 24 extra Phase A cases, but exited 1 because four pre-existing retired-draft fixtures failed. The initial failed run is preserved in `logs/cr09-c1-first-expanded-gates.log` and `logs/cr09-c1-first-expanded-console.log`.

The same unchanged four tests were rerun with an App reconstructed **byte-exact** to the captured pre-C1 SHA-256 `E26CEB406E8415E9E290B5F308CE70FD8567DFD67BD28F8FCB5D58E5B82A89DB`. All four also failed there, exit 1. `logs/cr09-c1-prechange-phase-a.log` records that comparison; temporary proof files were removed. Existing AppShell's added icon is unused on those routes and new CSS is scoped exclusively to repair selectors. No product failure attributable to C1 was demonstrated by these tests.

| Unchanged Phase A retired-draft test | Current and hash-exact pre-C1 result |
|---|---|
| Fire Alarm | FAIL — locator expects Good under the retired indicator's immediate parent; times out |
| CO2 | FAIL — harness `openSystem` returns false before the expected retired-form assertion |
| FM200 | FAIL — expected retired indicator is absent in the seeded fixture |
| Wet Chemical | FAIL — expected retired indicator is absent in the seeded fixture |

The second expanded run passed the final **14 C1 + 10 B3 + 3 standing inspection browser cases**, but its supplementary default-mode Hose Reel entry fixture failed with `openSystem=false` / `Inspection unavailable: Failed to fetch`. The failure repeated in a focused current run and in the **hash-exact pre-C1 App** comparison, exit 1, in `logs/cr09-c1-prechange-hose.log`. The default harness authenticates `/auth/me` but makes every other API request fail; it races the fixture's direct database seeding with App restoration. The failed second-run logs are retained in `logs/cr09-c1-second-expanded-gates.log` and `logs/cr09-c1-second-expanded-console.log`.

These **five extra default/retired-fixture failures are not PASS and not SKIP**. No existing test/validator was edited or relaxed. They are one grouped **pre-existing P2 validation-debt item** deferred to the later Phase A/inspection acceptance checkpoint. That checkpoint owns repair of the original harness coverage and must not claim full original-suite acceptance while these remain. They are outside C1's standing gates; C1 reruns B3's standing inspection sync regressions.

The supplementary current-entry smoke explicitly uses the existing harness's documented **healthy `?online` mode**, through a new test-only navigation wrapper. It imports every original assertion unchanged and selects all 12 current form-entry checks, offline Roller Shutter retired compatibility and immutable accepted/ordinary-report display. Focused verification passed **14/14** in that mode. This is distinct proof and does **not** close or relabel any default-mode/retired-fixture failure. The wrapper redirects only document navigation, leaving Vite module requests intact; its initial overly broad redirect failed to load the harness and was corrected before verification.

Baseline comparison reproducibility (browser-only fixtures; no database writes; expected exit 1 for four failures):

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\scripts\testing\probe-cr09-c1-phase-a-baseline.ps1
# Separate default-mode Hose Reel comparison, also expected exit 1:
& .\scripts\testing\probe-cr09-c1-phase-a-baseline.ps1 -Grep 'hose_reel: new form'
```

## Files changed by this C1 task

| File | Reason |
|---|---|
| `apps/web/src/App.tsx` | Technician repair routes/nav/page; retain repair deep links through existing role/workspace/login paths, preserve initial unrelated edits |
| `apps/web/src/layout/AppShell.tsx` | Repair List icon using existing navigation pattern |
| `apps/web/src/styles/app.css` | Scoped mobile/token-based comparison, history, actions, focus and image rules |
| `apps/web/src/repairs/RepairList.tsx` | Authorized grouping, cached authority/recovery, preparation, part selection/new cycles, progress and account-scoped local subscriptions |
| `apps/web/src/repairs/RepairPartView.tsx` | Immutable Before, own After/remark editor, autosave/validation/local freeze, camera focus and retained history |
| `apps/web/src/repairs/repairUiRepository.ts` | Strict C1 read adapters, stale-list guard, persisted exact self-start replay, bound history After/decision display and labels |
| `apps/web/tests/repair-c1.html` | Controlled browser fixture mounting the real production App/AppShell/components; reuse static test worker |
| `apps/web/tests/repair-c1.spec.ts` | Actual browser UI/offline/recovery/lineage/accessibility/integrity regressions |
| `apps/web/tests/repair-c1-inspection-regressions.spec.ts` | Import unchanged Phase A assertions under the explicitly documented healthy-online current-entry fixture mode; retain default-suite failures separately |
| `scripts/testing/verify-cr09-c1.ps1` | Fresh disposable B1/B2/standing/C1 gates; explicit zero-skip checks and supplementary current-entry/display proof |
| `scripts/testing/probe-cr09-c1-phase-a-baseline.ps1` | Reproducible hash-exact pre-C1 comparison of the unchanged four extra regression failures |
| `HANDOVER.md` | Current C1 checkpoint, B3 acceptance evidence, proof limits and retained baseline debt |
| `docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md` | B3 accepted/C1 implementation status; C2/D remain unbuilt |
| `docs/testing/CR09_B3_IMPLEMENTATION_REPORT.md` | Correct top status from completed independent B3 re-review, preserving historical narrative |
| `docs/testing/CR09_C1_IMPLEMENTATION_REPORT.md` | C1 contract, full DoD/evidence/commands/findings and limits |

## Cold reproducible commands

Run verbatim in PowerShell with Docker/Playwright Chromium available and port 55432 free:

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\scripts\testing\verify-cr09-c1.ps1
```

The runner creates a new uniquely named disposable PostgreSQL at **127.0.0.1:55432**, verifies the target, forcibly sets **both DATABASE_URL and SEED_INTEGRATION_DATABASE_URL**, uses **NODE_ENV=test** for API fixtures, suite-isolated temporary uploads, separate processes for pool-closing suites and **NODE_ENV=production** for web build. It restores prior environment values and removes only its own disposable container. The final run was deliberately launched with both prior URLs pointing to an invalid unused host to verify that they cannot leak into tests. No runtime/customer database, uploads, backfill, migration or deployment is used.

```powershell
cd C:\PWA_OfflineRecordWebApp
git status --short -- apps/api/src/inspections/templates 'apps/api/migrations/017*' 'apps/api/migrations/018*' apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts apps/api/src/sync/fireAlarmV6Acceptance.ts apps/api/src/reports/fireAlarmV6FinalReport.integration.test.ts
git diff e30c649 --name-only -- apps/api/src/inspections/templates/masterServiceReportV1.ts apps/api/src/inspections/templates/masterServiceReportV2.ts apps/api/src/inspections/templates/masterServiceReportV3.ts apps/api/src/inspections/templates/masterServiceReportV4.ts apps/api/src/inspections/templates/masterServiceReportV5.ts apps/api/src/inspections/templates/masterServiceReportV6.ts 'apps/api/migrations/017*' apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts apps/api/src/sync/fireAlarmV6Acceptance.ts apps/api/src/reports/fireAlarmV6FinalReport.integration.test.ts
git diff 10f3bbb -- apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts
git diff --check
```

Protected status returned no entries. The only baseline difference is the approved V6 uploader exception, exact to `10f3bbb`. Migration 051 remains SHA-256 `BF057005856ED16580E4D6EDEE587A1B86121C5313940694325F0421A569694E`. All API source, B1/B2 reports, Dexie schema, B3 repositories/sync, package locks, production/precache follow-up and unrelated working-tree files match captured pre-C1 hashes.

## Limits and review boundary

Browser proof mounts the actual production App/components with **controlled HTTP routes, real account-scoped IndexedDB and the existing test-only static worker**. Offline API fixtures refuse requests when the browser is offline. Camera proof is a synthetic canvas MediaStream through the real shared camera dialog and B3 processing, not a physical camera. API/PostgreSQL authority, transactions, idempotency, source races and report/PDF proof run separately against fresh disposable fixtures. No single live browser-to-PostgreSQL repair flow is claimed.

No installed-PWA force-close, browser-process restart, physical phone/camera, HTTPS customer-network test, production container restart/persistence, deployment, manual final acceptance or Level 3 proof was performed. Runtime finding materialization and production publication/phone/precache acceptance remain separately authorized follow-up work. No Admin/Manager review/assignment UI, repair PDF, C2 or next-checkpoint implementation.

**P0 remaining: 0. P1 remaining: 0. New C1 P2 findings: 0. P2 remaining: 1 grouped pre-existing validation-debt item (five original-harness failures), explicitly deferred to the later Phase A/inspection acceptance checkpoint.** This is implementation verification, not an independent review count. Refresh/retry never rebases an immutable payload; a frozen request whose exact authority cannot be restored remains blocked and retained for Manager/Admin resolution.

**SAFE FOR C1 REVIEW: Y. C1 INDEPENDENT REVIEW ACCEPTED: N. READY TO IMPLEMENT C2: N pending C1 review.** Stop before staging; no Git mutations.
