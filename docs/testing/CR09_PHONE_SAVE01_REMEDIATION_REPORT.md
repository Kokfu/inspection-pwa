# CR-09 PHONE-SAVE-01 implementation remediation

## Current checkpoint: unconfirmed photo replacement recovery — 2026-10-14

This addendum supersedes the previous source disposition only for the independently reproduced checkpoint-blocking P2 at RepairPartView.tsx:125. Earlier P1 remediations, failures, manifests and review/phone evidence below are retained. Implementation verification, independent review and original-condition physical acceptance remain separate. **OWNER LEVEL 3 ACCEPTANCE PASSED: N.**

### Deterministic negative control and post-fix proof

Before production source edits, all nine entries in logs/cr09-phone-save03-candidate-hashes.json matched exactly. The added production-editor gallery regression ran against that candidate and **failed 1/1, zero skipped**, exit 1, at the recovery-status assertion (12.6 s case). Log: logs/cr09-phone-save04-negative-normal.log. It had already observed native commit, old photo absence, replacement row presence, real gallery capture metadata and the finished native transaction's abort exception. Old photo UUID: 8f626ae3-f92a-49ce-a73d-84dba5912462; committed replacement UUID: b638c066-6ef5-4f69-b784-4fa9322db2df. Displayed status: **“After photo save failed; your previous saved photo is retained. Retry choosing or taking the photo.”** The error alert separately reported REPAIR_LOCAL_STORAGE_OUTCOME_UNKNOWN. This failure is caused by the false UI claim, not a mocked capture result or missing completion event.

Only the photo store() catch now branches for REPAIR_LOCAL_STORAGE_OUTCOME_UNKNOWN. It displays **“After photo save outcome unconfirmed; the replacement may already be saved. Retry choosing or taking the photo. Internet is not required.”** It claims neither previous-photo preservation, rollback nor confirmed success. Actual native abort/rollback continues to use the original retention wording. No helper, verification budget, writer, schema, capture transaction or compensation write changed.

Post-fix focused command: **4/4 PASS, zero skipped, exit 0, 32.0 s** (logs/cr09-phone-save04-focused.log). The same committed-state case observed old UUID ecedcee8-bbbe-4891-b533-f7bfd4bd115e absent and replacement 28a67395-3adb-446c-a935-20df79d711e1 present while showing the honest message. Final combined gate repeats this proof with old UUID 94b75d6b-1fa9-4aca-aeee-8fc5a5297b30 absent and replacement a694f188-ac47-4f15-bec6-b7deae122b16 present. These are disposable browser fixtures, never retained acceptance records.

The four new cases verify:

- Existing photo replacement through the real editor gallery input and repository processing/atomic transaction, fully offline. Native oncomplete delivery is held after commit. Before deadline the status stays Processing photo; after deadline abort throws and workspace activity becomes idle. Record and attachment reads confirm the actual commit.
- All four actions recover. A deliberately failed real remark write leaves latest text visible and dirty; photo uncertainty and late completion do not clear that state. A blue-photo retry confirms successfully before old delivery is released. After release the exact newer record, attachment metadata/checksum, success UI and dirty state are unchanged. Submit then freezes the latest visible remark and newer photo; direct Pending replacement rejects REPAIR_IMMUTABLE without changing that Pending record.
- A held issued replacement write really aborts: native abort event, exact original record and original attachment metadata/checksum restored by transaction rollback. The old photo remains. Retry succeeds before the old gate releases and is unchanged afterward. No restoration/deletion/rewrite compensation is introduced.
- After expiry, old completion cannot publish into an unmounted editor or changed workspace. The originating committed record remains unchanged and the other actor's matching-UUID sentinel is untouched.

The original 23 editor cases are byte-preserved: removing only the inserted helper/test block reproduces SHA-256 528020BF0291BE8E887E52325E9072F315A86B331000179C643B2A723F4FB49F (logs/cr09-phone-save04-test-preservation.log). Existing timeouts, retries and assertions were not changed. Existing camera overlap, account/logout/token, native acquisition/rollback, immediate/coalesced save, Submit, stored verification, unmount, Pending and exact receipts remain covered by the requested gates. Success still requires the existing transaction completion promise; expired promise settlement absorbs late delivery permanently.

360×800, 768×1024 and 1280×800 recovery checks pass: no horizontal scroll and four action heights ≥44px. Phone/desktop harness screenshots were inspected (logs/cr09-phone-save04-retry-{360,768,1280}.png): text wraps, focus is visible, remark and actions remain available. The held Dexie delivery can leave the prior preview visible; that preview is not claimed as the committed photo authority. The record/attachment reads above establish the actual state. This is desktop harness verification, not installed-PWA/phone acceptance.

### Files changed and frozen source/test identity

| File | Reason |
|---|---|
| apps/web/src/repairs/RepairPartView.tsx | Branch unknown photo outcome into honest offline retry wording |
| apps/web/tests/repair-phone-save.spec.ts | Four additive real-editor regressions; original 23 tests unchanged |
| docs/testing/CR09_PHONE_SAVE01_REMEDIATION_REPORT.md | Negative control, proof, hashes, DoD and retained review history |
| HANDOVER.md | Current source checkpoint and remaining acceptance ownership |
| docs/testing/CR09_OWNER_LEVEL3_ACCEPTANCE_REPORT.md | Keep physical acceptance open and separate from source verification |

Source/tests were frozen before final verification. No later source/test edit occurred. Exact manifest: logs/cr09-phone-save04-candidate-hashes.json. Seven unchanged entries preserve both P1 fixes and the coalesced writer. The original 03 manifest remains untouched.

| Source/test | Final SHA-256 |
|---|---|
| `apps/web/src/repairs/RepairPartView.tsx` | `5CC0019246A66A7D7F8187C18B4F6FF275E5237D1A8ABD2195562EC3D716C3B7` |
| `apps/web/src/repairs/repairRepository.ts` | `ADE250123BB90444213C7D459B7A8C9DF02C8DEB9B98A903FC26953FF2F02A18` |
| `apps/web/src/repairs/repairDraftWriter.ts` | `DFDB3CF54894F80182A28CC855171C99BAFA1BA739BB12A7E81C644F2FB6220D` |
| `apps/web/src/repairs/repairStorageTransaction.ts` | `FA94DF2E30609161ABD99DAD7C1EDA7C44ABDDD4799A460456C1A43824D27C5C` |
| `apps/web/src/repairs/repairVerification.ts` | `74892E1B6277666DBF86AF6545D191699470E08C20415C293542D385C6D1A649` |
| `apps/web/src/repairs/repairUiRepository.ts` | `D9E6E04BB6C4F6418E26FADFE2E72B857965406725C4C6F2FC43D3BC59D07CDD` |
| `apps/web/tests/repairDraftWriter.test.ts` | `98766CF426C34339FD5E75166DE2FA30DCBF5BFDD6B1A1AB674F242505482F58` |
| `apps/web/tests/repair-phone-save.html` | `8C712CB44338C223A747963F56A6D41FBE9EBFF7B028E0C98F6E81477FA22F5B` |
| `apps/web/tests/repair-phone-save.spec.ts` | `BF882F7D296A1F0FB02291CC868CA590D962A57078FE88BB5E5A7A9C844A9C2B` |

### Definition of Done and final verification

| DoD / gate | Result |
|---|---|
| Frozen-candidate pre-fix negative control | PASS as negative evidence: 1 failed at false recovery wording, zero skipped |
| Added focused photo regressions | PASS, 4/4, zero skipped |
| Native commit / finished abort exception / honest uncertainty / workspace idle | PASS; committed replacement present, old row absent |
| Offline enabled retry / latest visible dirty remark | PASS; newer photo confirms before old completion; old delivery leaves dirty state and outcome unchanged |
| Confirmed capture success only after completion | PASS; Processing photo while completion held; confirmed retry reports success |
| Genuine rollback / atomic replacement / immutable Pending | PASS; abort retains original, newer retry and exact Pending unchanged |
| Late completion / newer retry / another workspace / unmount | PASS |
| Existing P1 fixes and all prior editor/C1 guards | PASS; original 23 cases plus unchanged C1 suite |
| Web typecheck | PASS, exit 0 |
| Web production build | PASS, exit 0; 294 modules, 11 precache entries / 1511.20 KiB; inherited >500 kB advisory |
| Header summary / writer units | PASS, 11/11, zero skipped |
| Repair editor / C1 browser gate | PASS, 49/49, zero skipped |
| Header/proposal/offline browser gate | PASS, 7/7, zero skipped |
| Header/ordinary inspection browser gate | PASS, 26/26, zero skipped |
| Recovery layout / screenshots | PASS, 360/768/1280; desktop harness only |
| Final identity / diff check / protected scope | PASS; nine frozen hashes match; diff check clean; six protected anchors match |
| Historical immutability / approved exception | PASS; V1–V6/017/V6 acceptance/PDF diff to e30c649 empty; V6 evidence diff to 10f3bbb empty; protected status empty |
| Unrelated work preservation | PASS; 1,235 entry-inventory files unchanged outside five authorized paths |
| Standing backend/API/historical/V6/V7 integration gates and web V7 stale-evidence suite | NOT RUN for this expressly frontend-only task-specific verification; no backend/schema/contract change, PostgreSQL or container action; prior proof is historical |
| Independent review of this candidate | NOT PERFORMED; independent reviewer owns next checkpoint |
| Original-condition OPPO / deployment / owner Level 3 | NOT RUN / OPEN; new phone actions and deployment unauthorized |

Final logs: logs/cr09-phone-save04-final-{typecheck,build,units,repair,header,inspection,diff-check}.log. Full read-only status: logs/cr09-phone-save04-final-git-status.txt. Protected/history/exception comparisons and inventory proof are separate logs. The supplementary shared co2DefinitionControls comparison contains inherited additive V7 changes relative to e30c649; that resolver is unchanged from task entry. CO2 V1 and Wet Chemical V4 published constants remain within the unchanged historical template files. No new historical test execution is claimed.

Failures remain separate: earlier re-review logs/cr09-phone-save03-rereview-focused-bootstrap-failure.log records **44 passed / 1 failed**, C1 actor-retention case timed out during boot waiting for service-worker control, before test actions. Neither that log nor the earlier successful re-review was erased. This task's initial sandboxed Vite startup stalled and was interrupted, recorded in logs/cr09-phone-save04-negative.log; it did not reach regression assertions and is not counted as negative-control proof. Normal-process isolated verification succeeded. No timeout, retry, route handler or assertion was weakened.

| Findings | Disposition / owner |
|---|---|
| P0 source | 0 identified |
| P1 source | 0 identified; both earlier fixes preserved |
| Checkpoint-blocking P2 false photo preservation | Implementation remediated; independent reviewer must confirm exact candidate |
| P1 PHONE-SAVE-01 physical acceptance | 1 OPEN; owner/operator and physical acceptance owner |
| Inherited unrelated P2/release limitations | Existing owners and history retained; no new scope or closure claim |

**P0 remaining: 0. P1 source remaining: 0. P2 source remaining in this scope: 0 identified after implementation verification. P1 physical acceptance remaining: 1. SAFE FOR FOCUSED INDEPENDENT RE-REVIEW: Y. FOCUSED CHANGED-CANDIDATE INDEPENDENT REVIEW ACCEPTED: N (not performed). READY FOR OWNER LEVEL 3 ACCEPTANCE CLOSURE: N. OWNER LEVEL 3 ACCEPTANCE PASSED: N.** The original OPPO trigger remains unconfirmed. Physical acceptance requires separately authorized candidate deployment and original-condition typing/camera/save/read/OS restart/reconnect proof; synthetic success does not close PHONE-SAVE-01.

No deployment, production write, phone action, PostgreSQL/restore-container access, customer-data cleanup, IndexedDB clearing or Git mutation. Protected 051/052, Dexie v10, D authority, approved 10f3bbb, header loading/wording, retained repair 68f72e29-0383-4dbf-8492-8f8dd4e67b55/photo 193cdb71-cc35-492c-b554-c73f6a58180a (Synced / Awaiting Approval), accepted records/photos/PDFs and unrelated work remain untouched. Stop before staging.

Reproducible commands (isolated synthetic browser contexts, no server database):

```powershell
cd C:\PWA_OfflineRecordWebApp
cd apps/web
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
..\api\node_modules\.bin\tsx.cmd --test tests/headerSyncSummary.test.ts tests/repairDraftWriter.test.ts
if ($LASTEXITCODE -ne 0) { throw 'Units failed' }
npx playwright test tests/repair-phone-save.spec.ts --grep P2 --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Photo regression failed' }
npx playwright test tests/repair-phone-save.spec.ts tests/repair-c1.spec.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Repair/C1 failed' }
npx playwright test tests/header-repair-sync-summary.spec.ts tests/header-proposal-sync-summary.spec.ts tests/header-offline-mid-session.spec.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Header/proposal/offline failed' }
npx playwright test tests/header-repair-sync-summary.spec.ts tests/repair-c1-inspection-regressions.spec.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Header/inspection failed' }
cd C:\PWA_OfflineRecordWebApp
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff check failed' }
git status --short
```


## Current checkpoint: completion race and stored-photo verification remediation — 2026-10-14

This is implementation verification of the two source P1 findings from the PHONE-SAVE-01 re-review. It preserves the previous failures, candidate hashes and review/phone history below. Independent review and the original-condition OPPO acceptance are separate checkpoints. **OWNER LEVEL 3 ACCEPTANCE PASSED: N.** No deployment, production write, phone action, PostgreSQL/container access, restore-container access, IndexedDB clearing, cleanup of customer data or Git mutation was performed.

### Mechanisms and negative controls

**P1-1:** Installed Dexie's `Transaction.abort()` sets `active=false`, calls native `IDBTransaction.abort()`, then rejects its completion promise. Native commit can finish before delivery of Dexie's `oncomplete`. In that interval native abort throws; both Dexie's rejection and the old helper's rejection are bypassed. The helper has already marked itself expired and ignores eventual success, stranding its caller and workspace activity. The isolated regression holds the real native completion handler, observes the committed exact remark through an independent IndexedDB read, crosses the 5,000 ms deadline and requires an honest recoverable outcome within the unchanged 7,000 ms assertion budget.

**P1-2:** Submit's stored-photo byte read, WebCrypto hash, bitmap decode and request fingerprint hashes ran outside the guarded transactions. A held readonly phase could therefore keep Submit disabled and the textarea readonly indefinitely, while the retained record remained Draft. This concerns unresolved local work; it does not establish the trigger of the original OPPO slowdown.

Before production edits, two added regressions failed on the entry implementation: both seven-second retry assertions found no alert; Save remained unresolved in the native completion race and Submit remained unresolved on the held read. Output: `logs/cr09-phone-save03-negative.log`. The supplied eight-file candidate identity is retained in `logs/cr09-phone-save02-candidate-hashes.json`, along with the independent native-commit and held-Blob probes requested in the brief. The initial test command had a path error, two sandbox Vite starts could not proceed, and a test syntax error prevented collection; none is counted as a product test result.

During development the global photo hold could also intercept the preview's independent integrity read. The first fixed run passed the completion test but failed three photo cases because Submit proceeded while the preview was held. That fixture error is preserved in `logs/cr09-phone-save03-focused-dev.log`. The corrected fixture targets the exact Blob returned by Submit's readonly transaction across findings/work orders/attachments. Its byte/hash/decode results passed 9/9 with session/unmount tests in `logs/cr09-phone-save03-focused-refined.log`; a fingerprint case was then added.

The two corrected probes were additionally rerun on a reconstructed pre-fix baseline and failed 2/2 with the same 7,000 ms missing-retry assertions (`logs/cr09-phone-save03-negative-corrected.log`). The helper/editor/recovery baseline copies match their original candidate hashes. The reconstructed repository retains the pre-fix code but has reconstructed mixed line endings: SHA `3C344AD2C37236B10184A2A58370030CC8ABB370A65CD58C3F511287E202D407`, rather than candidate `A04A4E63EEAB12E91E5B50B3C7F3A8C8D3C920F0E0AF7D462F6A59B3B83A79E9`. This supplementary run is **not** represented as a byte-exact eight-file candidate certification. The initial pre-edit negative control and the independently recorded candidate probes remain the entry-candidate evidence. An attempted all-CRLF reconstruction failed its hash precondition before tests; retained hash logs record that attempt. Fixed source was restored from local byte copies in `finally`, with no Git restore/reset or history operation.

### Implementation, cancellation and late-result behavior

`repairStorageTransaction` retains the five-second acquisition/transaction deadline and immediate acquisition. Cancellation catches native/Dexie abort exceptions and always rejects the outer caller. Successful cancellation retains `REPAIR_LOCAL_STORAGE_TIMEOUT`; a thrown abort reports `REPAIR_LOCAL_STORAGE_OUTCOME_UNKNOWN`. Neither that error nor its UI wording claims rollback or save success. The message explicitly says the work **may already be saved** and completion/rollback is unconfirmed. Retry remains available offline. Success still requires resolution of the real Dexie transaction after native completion. Timers and cancellation listeners are removed on expiry, completion and synchronous acquisition failure. Late success cannot resolve an expired caller, clear dirty state or change the result of a newer writer drain.

An initial attempt to catch synchronous acquisition errors deferred invocation of `db.transaction` to a microtask. The unchanged delayed-creation test caught that regression in the first combined final attempt (44 passed / 1 failed, `logs/cr09-phone-save03-acquisition-regression.log`). Immediate invocation with a synchronous `try/catch` replaces that approach; existing assertions, timeouts and retry settings are unchanged. Source/tests were frozen again before all final gates were rerun.

Submit uses the new `repairVerification` scope for **readonly verification only**, with a five-second total budget across Blob bytes, source hash, bitmap decode and both frozen request fingerprints. Every awaited phase checks expiry before continuing; decoded bitmaps close even when the decode finishes after expiry. The freeze transaction sits outside and after the successfully settled verification promise. A timeout permanently rejects that operation's continuation: a late result cannot begin a freeze or create outbox items. This is a timeout around unabortable **reads/computation**, not an unabortable write race. Blob/WebCrypto/decode APIs have no cancellation API here; underlying work may finish later, but only its readonly result is consumed/discarded. Native transaction deadlines still cancel actual IndexedDB work.

The editor passes an AbortSignal to Submit and aborts it on unmount. The verification scope and atomic freeze transaction observe it; cancellation aborts a captured native freeze transaction, and the entry guard aborts one acquired later. A Submit waiting for autosave also checks mount/cancellation before invoking the repository. Save reasserts the pinned database/actor/canonical auth token after confirmed transaction completion before publishing success. Existing in-transaction actor/database/logout/token assertions remain intact. Account/session changes during verification fail the existing assertion at freeze entry. No validator, receipt rule, schema or immutable payload rule was relaxed.

On verification timeout, controls recover, typing is restored and the visible remark remains. The already-confirmed remark and committed photo stay durable; no extra dirty flag is needed for those confirmed bytes. On an unconfirmed save, visible edits remain dirty and the navigation recovery guard remains. Recovery wording names the local retry action and does not require internet. Strict JPEG/type/size/hash/dimension validation remains mandatory before freeze; ordinary preview/Before verification retains its existing behavior.

### Regression proof

Ten added browser cases, in addition to the original thirteen, cover:

- Real native commit with withheld completion delivery, abort throwing on the finished transaction, exact committed remark readable before delivery, dirty/unconfirmed UI and workspace-idle recovery. A newer confirmed retry commits while old delivery is still held, proving native lock release; releasing the old callback leaves the newer text/status/dirty result unchanged, with zero page errors.
- Held Submit-specific byte read, source hash, decode and request fingerprint. Each recovers controls without freeze/outbox; offline retry freezes the newest committed remark with the retained photo; late completion leaves the complete Pending record and two operations unchanged. Late decoded bitmap closure is asserted.
- Verification completion after timeout without any retry: no freeze/outbox is created. Completion after account switch, explicit same-actor logout, canonical-token change and editor unmount likewise leaves the original committed Draft/photo intact; the other-account sentinel is unchanged.

The unchanged existing tests still demonstrate actual queued-native abort, issued-write rollback, ordinary read/lock release while an old callback remains held, rejection of late transaction mutation, delayed transaction creation executing zero work, rapid native input/repeated Save, camera overlap/immediate Submit, exact latest text/photo freeze, account/session recovery and 24 subscribed pages. The original spec is a byte-exact 21,248-byte prefix of the expanded spec. The writer, writer unit tests and harness retain their exact prior hashes.

The byte-read recovery test checks 360×800, 768×1024 and 1280×800: no horizontal scroll and Save/Submit targets at least 44px. Screenshots `logs/cr09-phone-save03-retry-{360,768,1280}.png` retain the visible editable remark, photo, enabled actions and offline retry wording. Phone and desktop screenshots were visually inspected. This is an isolated desktop browser harness, not a physical-phone test or production PWA acceptance.

### Changed files and frozen identity

| Changed file | Reason |
|---|---|
| `apps/web/src/repairs/repairStorageTransaction.ts` | Always settle cancellation/abort exceptions; honest unknown outcome; signal and synchronous-acquisition cleanup |
| `apps/web/src/repairs/repairVerification.ts` | Bounded readonly verification with permanently invalidated late continuation |
| `apps/web/src/repairs/repairRepository.ts` | Phase checks, bounded Submit integrity/fingerprints, cancellable freeze and post-commit session assertion |
| `apps/web/src/repairs/RepairPartView.tsx` | Unknown-outcome/verification recovery wording and unmount cancellation |
| `apps/web/src/repairs/repairUiRepository.ts` | Offline-capable recovery for both new error states |
| `apps/web/tests/repair-phone-save.spec.ts` | Ten added real IndexedDB/Blob/hash/decode/session/unmount regressions; original thirteen unchanged |
| This report, `HANDOVER.md`, owner acceptance report | Current implementation disposition, evidence, identity and retained physical blocker |

The nine-entry final identity includes unchanged preservation anchors. Manifest: `logs/cr09-phone-save03-candidate-hashes.json`.

| Source/test | Final SHA-256 |
|---|---|
| `RepairPartView.tsx` | `110DE5B0649371493D2AA2A6267D32CADD7FE69E15B772949E63B2ADC23D2AAE` |
| `repairRepository.ts` | `ADE250123BB90444213C7D459B7A8C9DF02C8DEB9B98A903FC26953FF2F02A18` |
| `repairDraftWriter.ts` (unchanged) | `DFDB3CF54894F80182A28CC855171C99BAFA1BA739BB12A7E81C644F2FB6220D` |
| `repairStorageTransaction.ts` | `FA94DF2E30609161ABD99DAD7C1EDA7C44ABDDD4799A460456C1A43824D27C5C` |
| `repairVerification.ts` | `74892E1B6277666DBF86AF6545D191699470E08C20415C293542D385C6D1A649` |
| `repairUiRepository.ts` | `D9E6E04BB6C4F6418E26FADFE2E72B857965406725C4C6F2FC43D3BC59D07CDD` |
| `repairDraftWriter.test.ts` (unchanged) | `98766CF426C34339FD5E75166DE2FA30DCBF5BFDD6B1A1AB674F242505482F58` |
| `repair-phone-save.html` (unchanged) | `8C712CB44338C223A747963F56A6D41FBE9EBFF7B028E0C98F6E81477FA22F5B` |
| `repair-phone-save.spec.ts` | `528020BF0291BE8E887E52325E9072F315A86B331000179C643B2A723F4FB49F` |

### Definition of Done / final gates

Source/tests were frozen after the immediate-acquisition correction and remained unchanged through final verification. Final logs use `logs/cr09-phone-save03-final-{typecheck,build,units,focused,header,inspection}.log`. Development failures remain separate. The sandboxed build failed with `EPERM realpath index.html`; the normal-process local rerun passed, and no deployment occurred.

| DoD item / gate | Final result |
|---|---|
| Both pre-edit negative controls | PASS as negative evidence: 2 failed, zero skipped, each seven-second retry assertion remained unresolved |
| Corrected Submit-specific supplementary negative controls | PASS as negative evidence: 2 failed; reconstructed repository line-ending identity limitation recorded above |
| Native completion/abort exception/caller settlement/idle/committed bytes/late retry | PASS in final combined gate; no premature saved-success or rollback claim |
| Existing native acquisition/cancellation/rollback/read/late-created transaction tests | PASS unchanged; ordinary read and newer commit complete before old gate release |
| Byte/hash/decode/fingerprint bound; no freeze/outbox on verification timeout | PASS, four held phase cases; editing/actions recover offline |
| Late completion before/after newer retry; account/logout/token/unmount | PASS; retained Draft or exact newer Pending remains unchanged; no stale submitted UI |
| Immediate first autosave / latest pending / repeated Save / camera overlap / immediate Submit | PASS; exact first/latest writes `["C","CR09-HDR01-offline-cycle4"]`, two in-transaction assertions; writer bytes unchanged |
| Strict integrity / atomic photo replacement and Pending freeze / receipts | PASS in real repository/C1 regression coverage; no validator or authority change |
| Web typecheck | PASS, exit 0 |
| Web production build | PASS, exit 0; 294 modules, 11 precache entries, 1511.02 KiB; inherited large-chunk advisory |
| Header summary / draft writer units | PASS, 11/11, zero skipped |
| Repair editor / C1 browser gate | PASS, 45/45 (23 editor + 22 C1), zero skipped, 2.8 min |
| Header/proposal/offline browser gate | PASS, 7/7, zero skipped, 22.8 s |
| Header/ordinary inspection browser gate | PASS, 26/26, zero skipped, 49.7 s |
| 360/768/1280 recovery UI | PASS: no horizontal scroll, ≥44px actions; phone/desktop harness screenshots inspected |
| Final hashes / whitespace | PASS, nine hashes unchanged after final gates; `git diff --check` exit 0; focused untracked source/test scan clean |
| Protected/history/unrelated preservation | PASS, protected status and historical/approved-exception diffs empty; 3,879 unrelated entry inventory files unchanged, excluding task-owned/generated files |
| Standing API typecheck/build, historical/V6/V7 backend unit/integration gates | NOT RUN in this explicit frontend-only verification; no API/schema change or PostgreSQL/container operation; prior results remain historical evidence |
| Standing web V7 stale-evidence suite | NOT RUN; unchanged V7 contract; requested ordinary inspection regressions passed |
| Independent changed-candidate review | NOT PERFORMED; independent reviewer owns the next checkpoint |
| Original-condition physical-phone / owner Level 3 | NOT RUN / OPEN; deployment and new phone actions were explicitly unauthorized |

**P0 remaining in source scope: 0. P1 remaining in source scope: 0 identified. P2 new product findings: 0. P1 physical acceptance remaining: 1 — PHONE-SAVE-01, owner/operator-owned.** The two source findings are implementation-remediated and await independent confirmation. The inherited bundle-size advisory is unchanged and outside this task; no checkpoint-blocking source P2 is deferred. **SAFE FOR FOCUSED INDEPENDENT RE-REVIEW: Y. FOCUSED CHANGED-CANDIDATE INDEPENDENT REVIEW ACCEPTED: N (not yet performed). READY FOR OWNER LEVEL 3 ACCEPTANCE CLOSURE: N. OWNER LEVEL 3 ACCEPTANCE PASSED: N.**

Reproducible task-specific verification (isolated browser contexts/test harnesses; no PostgreSQL needed):

```powershell
cd C:\PWA_OfflineRecordWebApp
cd apps/web
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
..\api\node_modules\.bin\tsx.cmd --test tests/headerSyncSummary.test.ts tests/repairDraftWriter.test.ts
if ($LASTEXITCODE -ne 0) { throw 'Header/writer units failed' }
npx playwright test tests/repair-phone-save.spec.ts tests/repair-c1.spec.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Repair/C1 gate failed' }
npx playwright test tests/header-repair-sync-summary.spec.ts tests/header-proposal-sync-summary.spec.ts tests/header-offline-mid-session.spec.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Header/proposal/offline gate failed' }
npx playwright test tests/header-repair-sync-summary.spec.ts tests/repair-c1-inspection-regressions.spec.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Header/inspection gate failed' }
cd C:\PWA_OfflineRecordWebApp
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed' }
git status --short
```

For just the ten new regressions, run `npx playwright test tests/repair-phone-save.spec.ts --grep P1 --workers=1` from apps/web. The final combined gate already executes all ten. No assertion, timeout or retry relaxation is required. Private final Git status is `logs/cr09-phone-save03-final-git-status.txt`; protected status, historical and approved-exception outputs are zero-byte files. Candidate/protected hashes and the unrelated inventory comparison are retained alongside it. An initial inventory comparison included generated tsbuildinfo/test-results drift; the final comparison explicitly excludes those generated artifacts and shows no unrelated source/document drift.

### Remaining uncertainty and owners

The source implementation addresses the two reproduced re-review P1 mechanisms. The independent reviewer owns review of this changed hash-bound candidate. **PHONE-SAVE-01 physical acceptance remains P1 and owner/operator-owned.** Synthetic success does not identify or close the original OPPO trigger. The owner must separately authorize deployment and original-condition OPPO CPH2375 / Android 13 testing: native IME/composition/autocorrect, restored/background pages versus clean start, offline/no-default-network, camera overlap, rapid input/repeated Save/immediate Submit, ordinary reads, interrupted/unconfirmed saves, OS force-stop/reopen of confirmed Draft/Pending work, then evidence-first reconnect and exact idempotent receipts.

Timers cannot run while Android suspends JavaScript. Checks enforce elapsed deadlines when continuation resumes; the browser proofs do not certify suspension, low memory or IME behavior. Underlying readonly verification may continue after expiry without writing. An unrelated tab's native blocker is not forcibly aborted. Visible unconfirmed text must stay open for retry and is not claimed durable across process termination. Backend/Level 3 release gates remain outside this explicit frontend-only task; prior backend evidence is historical, not a new PASS.

Migration 051/052, Dexie v10, accepted header/loading wording, reviewed D authority, approved `10f3bbb` exception, package locks and deployment configuration are preserved. Protected status and V1–V6/017/V6 acceptance/PDF comparison against `e30c649` are empty; V6 evidence comparison against `10f3bbb` is empty. The retained repair `68f72e29-0383-4dbf-8492-8f8dd4e67b55`, photo `193cdb71-cc35-492c-b554-c73f6a58180a`, Synced / Awaiting Approval, were not accessed or modified. No restore container was accessed. Final candidate/protected/preservation manifests and full read-only Git status accompany the final gates. Stop before staging.

---

The following checkpoints are preserved historical records; their verdicts apply to their own candidates.

## Current checkpoint: native transaction cancellation — 2026-10-14

This checkpoint supersedes the source limitation of the earlier queue-only candidate below. All earlier failures, hashes, review/phone evidence and command blocks remain historical records. This is source remediation and implementation verification; independent acceptance and original-condition physical acceptance remain separate. **OWNER LEVEL 3 ACCEPTANCE PASSED: N.**

### Demonstrated mechanism and negative control

The exact reviewed repository at entry was SHA-256 `076181E9B398A51EC0944140EE6B0E61C07F89F9332754E00E6855EFD4D2A0F5`, preserved as `logs/cr09-phone-save02-reviewed-repairRepository.ts`. The existing seven browser tests/assertions/timeouts/retry settings were retained. A new test holds the cross-database auth assertion inside the real workspace write transaction, submits the native-style input burst, and requires an honest retry state within seven seconds. **Before production edits it failed: expected “Draft save failed; keep this form open and retry Save Draft.”, received “Saving on this device…”, after the full 7,000 ms assertion deadline.** Exact output: `logs/cr09-phone-save02-negative.log`. This negative control is against the reviewed two-write candidate, not the older 28-write editor. The previous 28/26 versus 2-write controls below remain separate evidence.

Installed Dexie's `Transaction.waitFor` repeatedly requests `store.get(-Infinity)` to keep the workspace transaction alive. Consequently a delayed auth result holds the workspace write lock and queues normal repair-record reads and camera writes. Dexie's default `waitFor` promise timeout is 60,000 ms; it is not a deadline for initial device-auth transaction acquisition, database opening, or subsequent workspace requests. A queued native operation can also prevent delivery of the keep-alive's waiting queue. No live-query write feedback loop was found: RepairList and the accepted header hook subscribe to reads, while App's workspace activation waits for local activities to drain. Restored/background tabs can contend for native locks; their involvement in the original phone failure remains a hypothesis.

The new synthetic tests also exercise actual native read/write blockers on device auth and workspace records. These distinguish acquisition delay from a delayed JavaScript auth callback. This establishes the remaining locking/cancellation mechanism, **not the trigger for the original OPPO latency**. Original phone artifacts were inspected read-only, including `cr09-hdr01-save-blocked.png`: full visible remark, Draft and retained After image; JSON retains Saving/partial committed text. Pending before/after force-close files still hash to `C0C3EE9A2D44F53AE74382D2C9BC6F736A95B810384C7F6952EC584B2669D3CB`.

### Bounded implementation and cancellation evidence

`repairStorageTransaction` provides a **5,000 ms deadline per guarded storage transaction**, measured before database opening/transaction creation. This is a conservative retry budget for local storage; it does not depend on network availability. It wraps the repair repository's existing transactions (Draft creation/save, photo replacement, reference/Before caching, and atomic local Submit), Submit's preparation reads, and device-auth reads outside a workspace transaction. It preserves the existing tables, validators, database/actor pins and canonical auth-token assertion. No identity check was removed.

On expiry the helper marks the operation expired and calls the captured Dexie transaction's public `abort()`, which calls native `IDBTransaction.abort()`. The caller gets `REPAIR_LOCAL_STORAGE_TIMEOUT`, so the coalesced writer rejects and releases its drain/activity. Success still awaits `db.transaction` completion, not merely completion of the callback. If database opening/creation finishes only after the deadline, the callback entry check aborts that newly created transaction before its work runs. The check after work also enforces the deadline when a renderer's timer delivery was delayed.

Inside a repair workspace transaction the original cross-database readonly auth request and `Dexie.waitFor` are retained. Its owning workspace transaction now has a native abort deadline. The readonly auth request can eventually finish, but cannot write any business data or resurrect the aborted workspace transaction. **The helper does not claim to abort an unrelated tab's blocking transaction.** If another tab holds a native writer, unrelated ordinary reads may still wait for that writer; the expired operation's own queued transaction is cancelled. Initial auth reads have their own captured readonly transaction and are cancelled on acquisition timeout.

An initial implementation unnecessarily kept an explicit device-auth transaction alive during the held assertion. The unchanged logout test caught that this blocked the logout write and produced a timeout instead of the expected identity rejection. That approach was discarded. Final auth assertions retain the original implicit readonly request inside workspace transactions; no device keep-alive is introduced. The failed development run is preserved in `logs/cr09-phone-save02-initial.log`; the corrected existing editor tests passed 8/8 in `cr09-phone-save02-refined.log`.

Six added browser cases prove:

1. A held auth assertion fails honestly, releases the repair lock, permits a newer confirmed retry before the old gate is released, and leaves that newer text unchanged after late release.
2. A real device-auth writer delays initial auth acquisition; the expired queued readonly transaction emits native `abort`, never `complete`, and later retry commits.
3. A real workspace writer delays the repair transaction; the expired queued transaction likewise emits native `abort`, never `complete`, and later retry commits. The external blocker is released explicitly only by the test fixture.
4. An issued remark write is rolled back on deadline. An ordinary read begun during the lock returns the original committed empty remark **while the old callback is still held**. A newer retry commits; the held callback is then resumed and its attempted mutation through the original transaction rejects. The newer committed remark remains exact. This fixture uses a native keep-alive and a directly resumable gate, avoiding the misleading assumption that an aborted Dexie waiting queue must resume.
5. Transaction creation delayed beyond the deadline emits native `abort` after release, executes zero work callbacks, and cannot overwrite the newer successful write.
6. Immediate Submit waiting for an expired autosave returns to enabled controls and an editable textarea, retains the full visible remark and committed photo, creates no outbox entry, and allows retry to freeze the newest confirmed text/photo before the old gate releases. Late release leaves the exact Pending record unchanged.

No existing assertion, timeout or retry setting was weakened. A new native-lock fixture initially blocked the editor's own mounting read before its textarea appeared; it was corrected to await mounting **before** installing the deliberate blocker. The first rollback fixture also wrongly waited for an aborted Dexie waiting queue to resume; the directly resumable native fixture above corrects that proof. Both failed development cases remain in `cr09-phone-save02-expanded.log`; the corrected expanded suite passed 13/13 in `cr09-phone-save02-expanded-fixed.log`.

The independently reviewed `repairDraftWriter.ts` and its unit tests remain byte-identical. Immediate first autosave, one replaceable pending snapshot, shared drain, latest committed text before freeze, dirty/navigation recovery and stale/unmounted UI callbacks remain intact. Existing rapid typing/repeated Save, camera overlap, immutable Pending, account switch, same-actor logout/token mutation, 24 subscribed tabs, offline entry and evidence-first/exact-receipt gates remain required. Photo-save failure now has an honest retry message; timeout recovery explicitly says visible edits are not confirmed saved and internet is not required.

### Changed files and frozen candidate

| Changed file | Reason |
|---|---|
| `apps/web/src/repairs/repairStorageTransaction.ts` | Repair-specific deadline with native abort, late-creation guard and commit-only success |
| `apps/web/src/repairs/repairRepository.ts` | Guard existing local transactions/auth acquisition/Submit reads, preserving identity assertions |
| `apps/web/src/repairs/RepairPartView.tsx` | Honest photo-failure status and retry; queue/editor behavior preserved |
| `apps/web/src/repairs/repairUiRepository.ts` | Local-storage timeout recovery wording without a network prerequisite |
| `apps/web/tests/repair-phone-save.html` | Expose the real transaction helper for isolated cancellation proofs |
| `apps/web/tests/repair-phone-save.spec.ts` | Six added native/auth/acquisition/rollback/late-retry/Submit regressions; original seven unchanged |
| This report, `HANDOVER.md`, owner acceptance report | Current source checkpoint, exact identity, evidence and retained acceptance blocker |

Source/tests were frozen before the final requested verification sequence. The private eight-file manifest is `logs/cr09-phone-save02-candidate-hashes.json`; the unchanged writer/source-unit entries bind preservation of the prior queue mitigation. No deployment/build publication or Git mutation occurred.

| Final source/test | SHA-256 |
|---|---|
| `RepairPartView.tsx` | `8A2932D20460A7AA2A1945B4DF284D3326BB79DEBFBE45F3BC13BA50826B4CDD` |
| `repairRepository.ts` | `A04A4E63EEAB12E91E5B50B3C7F3A8C8D3C920F0E0AF7D462F6A59B3B83A79E9` |
| `repairDraftWriter.ts` (unchanged) | `DFDB3CF54894F80182A28CC855171C99BAFA1BA739BB12A7E81C644F2FB6220D` |
| `repairStorageTransaction.ts` | `0D850F503A057A8D656E01D4337DC630BAE0CE05BC1EA0A2BC34441A1573955D` |
| `repairUiRepository.ts` | `41DC2838D15E281AD97EA1A8516E1D5A2DF5151B3EBD96C7CC7AC196AB898FFF` |
| `repairDraftWriter.test.ts` (unchanged) | `98766CF426C34339FD5E75166DE2FA30DCBF5BFDD6B1A1AB674F242505482F58` |
| `repair-phone-save.html` | `8C712CB44338C223A747963F56A6D41FBE9EBFF7B028E0C98F6E81477FA22F5B` |
| `repair-phone-save.spec.ts` | `F768BC09E56EB418090213EDEB38E495B85E8C3D5226E76C1604C2D7908D9A19` |

### Definition of Done / final results

| Requirement / gate | Result |
|---|---|
| Exact reviewed-candidate negative control | PASS as evidence: 1/1 FAIL before edits; seven-second retry assertion remained Saving |
| Native cancellation, lock release, rollback, late completion/retry | PASS in frozen combined gate; new six cases plus original seven editor cases |
| Preserved queue / latest confirmed remark and photo / immutable Pending | PASS in expanded run; writer and unit bytes unchanged |
| Actor/database/logout/stale callback/unmount and subscribed tabs | PASS in frozen combined gate; original assertions retained |
| Web typecheck | PASS, exit 0 |
| Web production build | PASS, exit 0; 293 modules / 11 precache entries / 1509.14 KiB; inherited large-chunk advisory |
| Header summary + writer units | PASS, 11/11, zero skips |
| Editor + existing C1 browser gate | PASS, 35/35 (13 editor + 22 C1), zero skips, 2.7 min; burst exact first/latest writes, 2 assertions / diagnostic 1,956 spins |
| Header/proposal/offline browser gate | PASS, 7/7, zero skips, 23.7 s |
| Header/ordinary inspection browser gate | PASS, 26/26, zero skips, 51.5 s |
| Diff/whitespace and final source hashes | PASS, final diff check exit 0; eight-file candidate unchanged after frozen tests; focused untracked-file whitespace scan clean |
| Protected schema/header/history/authority/unrelated work | PASS: anchors below unchanged; 1,228 unrelated inherited inventory entries match; approved 10f3bbb comparison/protected status empty |
| Standing API typecheck/build and historical/V6/V7 backend units/integrations | NOT RUN for this explicitly frontend-only verification; no API/schema change and no PostgreSQL/container action. Prior gates remain historical evidence |
| Standing web V7 stale-evidence gate | NOT RUN; unchanged evidence contract, requested inspection regressions run instead |
| Deployment / physical original-condition acceptance | NOT RUN / OPEN; explicitly unauthorized |
| Independent review of changed candidate | NOT PERFORMED; independent reviewer owns it |

Protected anchors remain 051 `BF057005856ED16580E4D6EDEE587A1B86121C5313940694325F0421A569694E`, 052 `0C02AE438450DBE9F0F7EB9A9B4374AD3601B8B384A7A8AA3F6E7EC9538A2596`, Dexie v10 `3A48F39E2F3C48EBBEEA9FD7E3D35CE317E1B7C74544039565AD267A73774445`, header hook `B319E5A75DD32BF2947A2B14E585B4E9B6E2270FCDFF580BBDAAEBD7A8AF7CCF`, header summary `988036F89B069222E318E3DE0481DA39FDF6134A74C95F256C2851139DB7FD47`. V1–V6/017/V6 acceptance/PDF comparisons against e30c649 and the V6 evidence comparison against approved 10f3bbb are empty. **HISTORICAL IMMUTABILITY INTACT: Y, approved exception preserved.** No schema, migration, API authority, receipt, accepted record, photo/PDF, package-lock or deployment configuration change. Retained repair `68f72e29-0383-4dbf-8492-8f8dd4e67b55` / photo `193cdb71-cc35-492c-b554-c73f6a58180a` remain untouched Synced / Awaiting Approval acceptance evidence. The existing disposable restore container was not accessed.

### Findings, owners and remaining acceptance

**P0 source findings: 0. P1 source findings: 0 identified after the demonstrated mechanism's remediation. P2 new product findings: 0. P1 acceptance remaining: 1 — PHONE-SAVE-01.** Source remediation does not close the original OPPO observation. The independent reviewer must assess the hash-bound transaction/identity/late-retry change. The physical owner must separately authorize deployment and retest the installed OPPO CPH2375 / Android 13 under native IME/composition/autocorrect, offline/no-default-network, camera overlap, repeated Save/immediate Submit, original restored/background-page conditions, ordinary reads, interrupted save and confirmed Draft/Pending OS force-stop/reopen, and reconnect evidence-first/exact-idempotent receipts. Preserve prior failure evidence; a clean-start success remains a separate result. The detailed original-condition checklist below is still applicable.

Timers cannot execute while Android suspends the renderer. On resumed execution the helper checks elapsed time before allowing delayed-created work and after work before commit; the synthetic browser suite does not certify OS suspension/low-memory/IME behavior. The deadline applies to guarded storage transactions, not arbitrary camera/image-processing APIs or transactions owned by unrelated code/tabs. No forced logout, storage clearing, production writes, phone action, cleanup, deployment, PostgreSQL test or Git mutation is authorized or performed. Visible uncommitted text must remain open for retry; it is not falsely represented as durable after forced process termination.

The reproducible frontend command block retained below is unchanged and applies to this candidate. Final verification logs use `logs/cr09-phone-save02-final-{typecheck,build,units,focused,header,inspection}.log`; development failures remain separately retained. The complete read-only working-tree status is `logs/cr09-phone-save02-final-git-status.txt`; the protected-path status and historical comparisons emit no output. Existing dirty/untracked work remains user-owned. **SAFE FOR FOCUSED INDEPENDENT RE-REVIEW: Y. READY FOR OWNER LEVEL 3 ACCEPTANCE CLOSURE: N. OWNER LEVEL 3 ACCEPTANCE PASSED: N.** Stop before staging.

---

## Earlier queue-only implementation checkpoint (preserved)

2026-10-14 (Asia/Kuala_Lumpur). Source candidate on `phase-8e-client-demo-polish`, HEAD `97a0cac4e7458cd109f234ed6d8d750f96dd5c4e`. No staging or Git mutation.

**Disposition: the serialized-input backlog mechanism is reproduced and mitigated. The exact OPPO slowdown trigger remains unconfirmed. PHONE-SAVE-01 remains an open physical acceptance P1.** This report records implementation verification, not independent review, deployment or physical-phone acceptance. **OWNER LEVEL 3 ACCEPTANCE PASSED: N.**

## Evidence and demonstrated mechanism

Read the task brief and applicable mobile, offline, IndexedDB, sync, release-testing and V7 skills; inspected `RepairPartView.tsx`, `repairRepository.ts`, `RepairList.tsx`, `workspaceActivity.ts`, auth/workspace activation and the accepted `useRepairSyncStatuses.ts` hook. No schema or authority expansion was needed.

The original editor appended one `saveRepairDraft` invocation for every textarea input event and every Save tap. Submit appended another save and awaited that entire chain. Each invocation reads device auth, opens a workspace repair-record read/write transaction, and awaits `ctx.assert()`. That assertion performs another read from the separate device database through `Dexie.waitFor`. Installed Dexie's `Transaction.waitFor` keeps the workspace transaction alive by repeatedly issuing `store.get(-Infinity)` while waiting. Thus a slow assertion holds the repair write lock, blocks overlapping record reads/photo writes, and each obsolete intermediate remark incurs that wait again. `beginWorkspaceActivity` also holds workspace switching until queued operations finish. Neither the header hook nor the repair-list subscription writes business rows; their reads can queue behind this lock. No subscription feedback loop was demonstrated.

The isolated browser regression renders the production `RepairEditor` in React StrictMode with real Dexie stores and a live subscription. It holds the first auth assertion inside the actual workspace transaction, dispatches native-style `InputEvent` bursts for `CR09-HDR01-offline-cycle4`, adds repeated Save taps, then releases the gate and imposes an 80 ms delay on later transaction assertions. A separate real record read does not finish during the held transaction. This is controlled fault injection into the demonstrated path, not a claim to recreate Android scheduling or prove that an auth-table lock occurred on the phone.

**Negative control before modifying production source: both initial browser tests failed on the original editor.** Burst plus three Save taps performed **28** remark writes/assertions, successively `C`, `CR`, `CR0`, through the full remark, followed by repeated full-value saves; sampled `_spinCount` total **6,672**. Immediate Submit with an overlapping synthetic camera-source write performed **26** remark writes rather than the required two. The assertion on the exact write list/count failed; committed full text/photo and freezing assertions were otherwise retained. This is evidence of linear backlog amplification, not completed-save loss. Original source copies are preserved privately under `logs/cr09-phone-save01-original-*`:

| Original source copy | SHA-256 |
|---|---|
| `RepairPartView.tsx` | `BA13B3BD2AA562E507C5E876BEDB4BD6A8CCB92D309512EEAE554EAF2C254A7E` |
| `repairRepository.ts` | `F45AC9F96B18A1EB43195AFD1E293C566EC0D76C99C3611FD6F2CEB3FD44E37A` |

Initial post-fix execution of those same two regressions passed: exact writes `C`, `CR09-HDR01-offline-cycle4`, **2** remark assertions, sampled spins **791**, dirty false only after the drain commits. Spinner counts vary with scheduling; they are diagnostic observations, not thresholds or a phone-performance guarantee. Subsequent focused runs also passed the added rollback, auth and lifecycle cases.

The existing phone evidence was preserved and inspected read-only. `offline-draft.json` contains `CR0`; `save-blocked-visible.json` and `visible-remark-recovery.json` contain the full text; `after-interrupted-save.json` contains `CR09-HDR01-`; `recovered-draft.json` contains the full text. Pending before/after snapshots have identical SHA-256 `C0C3EE9A2D44F53AE74382D2C9BC6F736A95B810384C7F6952EC584B2669D3CB`. The actual blocked screenshot is **`logs/cr09-hdr01-save-blocked.png`**, not the prompt/report shorthand `save-blocked-visible.png`; it shows the full remark and retained After image. JSON retains the Saving status observation. The retained photo is still 4,353 bytes with source SHA `3d7adcc7444354c82d47619613779c521b4e30574e02d5e4293e820a094aefc8`. Confirmed-state, retention, recorded network trace and exact-replay artifacts remain earlier physical evidence. No new receipt, phone action or production query is claimed.

These observations are consistent with obsolete input saves accumulating under slow IndexedDB/auth assertions. They do **not** identify what made the original phone storage operation slow, demonstrate an Android/Chrome defect, establish that the roughly 24 restored pages were competing writers, or establish loss of a completed save. The later clean-start single-insertion recovery remains recovery evidence only.

## Smallest justified change

Autosave still starts immediately. While a write is running, a single pending snapshot is replaced with the newest text; no debounce timer delays the first write. Save callers share the drain promise, and Submit waits for the latest snapshot's successful commit before calling the unchanged freeze/outbox transaction. Input becomes read-only during Submit's commit/freeze interval, preventing a newer remark from racing the freeze; offline typing and typing during camera processing remain available. Repeated Submit calls are guarded synchronously.

The writer releases its running flag synchronously with drain completion, so an input arriving in another commit microtask starts a new drain instead of being stranded. A transaction failure rejects waiting callers, leaves visible latest text and the dirty/navigation warning intact, and allows explicit Save Draft retry. A failed write is never presented as saved. Unmounted editors do not clear a later owner's dirty state or publish save messages.

The editor pins its database object and actor at construction. Optional expected-workspace guards on draft save and local Submit reject execution after a switch before acquiring new workspace rows. Existing `repairContext` token validation and in-transaction assertions remain intact, including same-actor logout/token changes and post-processing camera checks. This avoids weakening identity checks to remove cross-database waiting. The queue improvement does **not** make a genuinely stuck first IndexedDB operation complete; an externally held auth read still holds the active write lock. Native phone retesting must distinguish improved burst behavior from persistent underlying storage contention.

No online-dependent disabling, new storage location, schema/migration, API authority, receipt validator, sync order, photograph transformation or accepted/PDF change. Existing header checking state and wording are untouched.

| Task file | Reason |
|---|---|
| `apps/web/src/repairs/RepairPartView.tsx` | Coalesce pending input snapshots; await latest commit before freeze; guard Submit/dirty callbacks; pin originating workspace |
| `apps/web/src/repairs/repairDraftWriter.ts` | Small repair-specific immediate writer with one replaceable pending snapshot |
| `apps/web/src/repairs/repairRepository.ts` | Optional expected database/actor guards for queued draft save and Submit; existing assertions unchanged |
| `apps/web/tests/repairDraftWriter.test.ts` | Drain/commit ordering, commit-microtask boundary and rollback/retry coverage |
| `apps/web/tests/repair-phone-save.html` | Isolated production editor and real IndexedDB harness with StrictMode/live subscription |
| `apps/web/tests/repair-phone-save.spec.ts` | Negative-control burst, overlapping photo/Submit, transaction rollback, stale actor/auth and 24-page lifecycle coverage |
| This report | Evidence, candidate identity, results, findings and remaining checks |
| `HANDOVER.md` | Current implementation checkpoint with open acceptance blocker |
| `docs/testing/CR09_OWNER_LEVEL3_ACCEPTANCE_REPORT.md` | Distinguish this implementation from earlier accepted header review and physical-phone evidence |

## Verification / Definition of Done

All final frontend gates completed on the exact candidate below. No source/test edits followed the final rerun. Private complete logs are `logs/cr09-phone-save01-{typecheck,build,unit,header,inspection,focused-final}.log`; zero skips in every test run counted as PASS.

| Requirement / gate | Result |
|---|---|
| Concrete cause or reproduction | PASS for controlled backlog reproduction; exact original OPPO latency trigger UNCONFIRMED |
| Original-code negative control | PASS as evidence: 2 tests FAIL on exact obsolete-write assertions, 28/26 writes |
| Small bounded fix | PASS; immediate first save plus one latest pending snapshot; no schema/authority changes |
| Rapid input + repeated Save + commit boundary | PASS; final browser and writer units, exact first/latest write list |
| Photo/save overlap + immediate Submit | PASS; latest remark/own Blob frozen with two outbox entries; input read-only during freeze |
| Account switch/stale callback/same-actor auth change | PASS; old work cannot overwrite matching UUID in new workspace; auth rejection remains strict |
| Transaction rollback and retry | PASS; write-before-throw rolls back, Draft/photo retained, no freeze on save failure, visible full text/dirty guard preserved; retry succeeds |
| Multiple-tab lifecycle | PASS; 24 open subscribed pages, one active editor, offline burst, committed text readable after that tab closes |
| Existing repair UI / layout | PASS; 360×800, 768×1024, 1280×800 layout/focus/targets/validation; no CSS/layout changes or new screenshot audit claimed |
| Web typecheck | PASS, `npm run typecheck`, exit 0 |
| Web production build | PASS, `npm run build`, exit 0; 292 modules, 11 precache entries / 1508.17 KiB. Existing >500 kB chunk advisory remains; local build only, not deployment |
| Header summary + writer units | PASS, 11/11 (8 header + 3 writer), exit 0 |
| Header/proposal/offline browser gate | PASS, 7/7, exit 0, 26.0 s |
| Header/ordinary inspection compatibility gate | PASS, 26/26, exit 0, 1.0 min |
| Focused editor + existing C1 browser gate | PASS, 29/29 (7 new + 22 existing), exit 0, 2.2 min; final burst diagnostic 2 assertions / 1,057 spins |
| `git diff --check` | PASS, exit 0; existing CRLF warnings only |
| Historical immutability / approved exception | PASS: V1–V6/017/V6 acceptance/PDF comparison to e30c649 empty; V6 evidence comparison to approved 10f3bbb empty; protected status empty |
| 051/052 / Dexie v10 / reviewed authority / unrelated work | PASS; candidate 6/6 exact, all 1,229 unrelated preservation entries unchanged; protected status empty |
| Standing API/historical/V7 integration/release gates | NOT RUN: task-specific frontend verification and protected-scope preservation apply here; no API/schema changes. No PostgreSQL target, Docker start/cleanup or restore-container action. Prior D proof is historical, not a new PASS |
| Independent review | NOT RUN; independent reviewer owns changed-candidate acceptance |
| Original-condition physical-phone retest | NOT RUN / OPEN; new phone actions and deployment explicitly unauthorized |

Initial sandboxed Playwright startup stalled at Vite startup and was interrupted. Approved normal-process execution ran the negative control and subsequent browser gates against ephemeral synthetic IndexedDB data. An early wider run returned 26 passed / 1 failed: C1 camera fixture's API-route callback tried `page.evaluate` while its boot reload destroyed the execution context, before camera actions. Its error context is retained privately as `logs/cr09-phone-save01-initial-camera-fixture-error.md`. No assertion, timeout, retry or route handler was weakened. A subsequent complete 29-case run passed including that unchanged camera case. The source writer's microtask-boundary refinement was made during that run, so a further complete frozen-candidate rerun is required and recorded separately. Neither fixture failure nor a successful rerun proves the original phone failure closed.

## Exact candidate identity and preservation

Private manifest: `logs/cr09-phone-save01-candidate-hashes.json`. SHA-256 is for the final source/test bytes, not the deployed 021329Z build. No new commit/build is published.

| Source/test | SHA-256 |
|---|---|
| `RepairPartView.tsx` | `79F48B2C502FEF1FCFD37790A9E37EA3402D5B693AE5EFBCEE8C3549F50DF6CF` |
| `repairRepository.ts` | `076181E9B398A51EC0944140EE6B0E61C07F89F9332754E00E6855EFD4D2A0F5` |
| `repairDraftWriter.ts` | `DFDB3CF54894F80182A28CC855171C99BAFA1BA739BB12A7E81C644F2FB6220D` |
| `repairDraftWriter.test.ts` | `98766CF426C34339FD5E75166DE2FA30DCBF5BFDD6B1A1AB674F242505482F58` |
| `repair-phone-save.html` | `380D8BEBDF624EA6B1A13B48513873FE7A32B0CE254640B9CD21DA4A5C9E1341` |
| `repair-phone-save.spec.ts` | `94553E17EC71BA2576E50E272DB7732A95D64D7C56ABA378143680A0C7961CDC` |

Protected anchors remain: 051 `BF057005856ED16580E4D6EDEE587A1B86121C5313940694325F0421A569694E`; 052 `0C02AE438450DBE9F0F7EB9A9B4374AD3601B8B384A7A8AA3F6E7EC9538A2596`; localDatabase/Dexie v10 `3A48F39E2F3C48EBBEEA9FD7E3D35CE317E1B7C74544039565AD267A73774445`; accepted header hook `B319E5A75DD32BF2947A2B14E585B4E9B6E2270FCDFF580BBDAAEBD7A8AF7CCF`; header summary `988036F89B069222E318E3DE0481DA39FDF6134A74C95F256C2851139DB7FD47`. Original D/header manifests were not replaced.

The 1,235-entry private preservation inventory was generated while initial edits were in progress. It is used only to compare **unrelated** files, excluding six task paths already present in that inventory; its two repair-source entries are not claimed to be the original negative-control identity. Original pre-edit copies above bind that negative control. After documentation updates, **all 1,229 unrelated entries matched exactly**, including API, authority, sync, auth, schema, lockfile, config and prior tests. Candidate 6/6 hashes also matched. Existing dirty/untracked work remains user-owned. Full read-only `git status --short` is retained in `logs/cr09-phone-save01-git-status.txt`; task-path status is:

```text
 M HANDOVER.md
?? apps/web/src/repairs/RepairPartView.tsx
?? apps/web/src/repairs/repairDraftWriter.ts
?? apps/web/src/repairs/repairRepository.ts
?? apps/web/tests/repair-phone-save.html
?? apps/web/tests/repair-phone-save.spec.ts
?? apps/web/tests/repairDraftWriter.test.ts
?? docs/testing/CR09_OWNER_LEVEL3_ACCEPTANCE_REPORT.md
?? docs/testing/CR09_PHONE_SAVE01_REMEDIATION_REPORT.md
```

The repair sources and owner report were already untracked at task entry; this status does not imply the task created the entire prior repair implementation. `git status --short -- apps/api/src/inspections/templates apps/api/migrations/017* apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts apps/api/src/sync/fireAlarmV6Acceptance.ts apps/api/src/reports/fireAlarmV6FinalReport.integration.test.ts` produced **no output**. **HISTORICAL IMMUTABILITY INTACT: Y, approved 10f3bbb exception preserved.**

## Findings, owners and remaining physical checks

| Severity / ID | Disposition / owner |
|---|---|
| P0 | 0 identified in this scope |
| P1 PHONE-SAVE-01 | **1 remains open for owner acceptance.** Demonstrated obsolete-save amplification mitigated in source. Independent reviewer must review this exact candidate; physical acceptance owner must reproduce/retest native typing/camera/save under original conditions. Exact storage/auth latency trigger remains unconfirmed |
| P2 | 0 new product findings identified; previously recorded release/rollback/backup limitations remain with their existing owners |

**P0 remaining: 0. P1 remaining: 1 (physical acceptance, not silently closed by implementation tests).** A genuinely blocked first auth/storage request is an explicit unresolved limitation of this mitigation. No claim that coalescing fixes every source of IndexedDB stalls. The 24-page desktop test demonstrates subscribed-page lifecycle under this controlled burst; it is not 24 Android restored pages, background suspension, native IME, OS memory pressure or competing-tab edit acceptance.

After independent review and separately authorized deployment, the physical owner must verify the candidate build on the installed OPPO CPH2375 / Android 13, preserve original evidence and record: Wi-Fi/cellular off/no active default network; burst native IME entry including composition/autocorrect; camera while autosaving; immediate Submit and repeated Save; latest full committed remark/own Blob; responsive ordinary record reads; interrupted-save recovery and confirmed-save/confirmed-Pending OS force-stop/reopen; reconnect evidence-first exact receipts and exact idempotent retry. Repeat with the original restored-page conditions and a clean start, documenting differences rather than substituting the latter for the failed scenario. Capture transaction/auth-read latency and queue state if the first operation still stalls. This is a future checklist, not authorization to act now.

Retained cycle 4 `68f72e29-0383-4dbf-8492-8f8dd4e67b55` and photo `193cdb71-cc35-492c-b554-c73f6a58180a` remain immutable Synced / Awaiting Approval acceptance evidence; never reuse them as mutable fixtures. No phone, production data, deployment, backup, cleanup, IndexedDB clearing or recovery-container action occurred in this task.

## Reproducible frontend commands

These create only isolated browser-context synthetic fixtures through the existing local Vite harness. No database server is required; no `DATABASE_URL` is read or changed. Use normal process access where sandboxed Vite/browser startup is unavailable. Do not modify source while browser gates run.

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\web
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
..\api\node_modules\.bin\tsx.cmd --test tests/headerSyncSummary.test.ts tests/repairDraftWriter.test.ts
if ($LASTEXITCODE -ne 0) { throw 'Header/writer units failed' }
npx playwright test tests/repair-phone-save.spec.ts tests/repair-c1.spec.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Repair save/C1 browser gate failed' }
npx playwright test tests/header-repair-sync-summary.spec.ts tests/header-proposal-sync-summary.spec.ts tests/header-offline-mid-session.spec.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Header/proposal/offline gate failed' }
npx playwright test tests/header-repair-sync-summary.spec.ts tests/repair-c1-inspection-regressions.spec.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Header/ordinary inspection gate failed' }
cd C:\PWA_OfflineRecordWebApp
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace gate failed' }
git status --short
```

**SAFE FOR FOCUSED INDEPENDENT RE-REVIEW: Y** — review this bounded source mitigation and its explicitly open latency/physical acceptance limits. Independent acceptance of the new candidate: not performed. **READY FOR OWNER LEVEL 3 ACCEPTANCE CLOSURE: N. OWNER LEVEL 3 ACCEPTANCE PASSED: N.** Stop before staging.
