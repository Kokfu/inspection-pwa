# Location proposals W2 integration review

19 October 2026. Scope: the existing uncommitted W0, W1-A, W1-B and W1-C outputs governed by `LOCATION_PROPOSAL_IMPROVEMENT_PLAN.md`, section 6. This is source/harness verification, not release acceptance. No staging, commits, production migration, deployment or runtime database writes.

## Findings and corrections

| Priority | Origin | Failing scenario | W2 correction | Status |
|---|---|---|---|---|
| P0 | Combined scope | None identified | — | 0 remaining |
| P1 | Combined scope | None identified | — | 0 remaining |
| P2 / W2-01 | W1-B | Revise a rejected hose-reel format: drum type was arbitrary text; asset/zone text allowed 300 characters despite a 200-character server limit; riser location allowed 300 despite a 250-character limit. A seemingly valid edit could fail local queue validation or server sync. | Enum select and field-specific maximum lengths in `TechnicianLocationProposal.tsx:343`; three browser cases submit valid revisions offline for Hose Reel, Riser and Roller Shutter. | Fixed |
| P2 / W2-02 | W1-A | Clear the edited location/new-zone name and approve: the error marked the unrelated review note invalid and did not focus the field needing correction. | Field-specific invalid state, error association and focus in `ManagerLocationProposals.tsx:54`; browser test checks both names and zero writes. | Fixed |
| P2 / W2-03 | W1-A | At phone width, Back attempted to focus the inbox heading before removing the CSS-hidden state; focus could be lost when the detail disappeared. | Restore inbox focus after React commits the visible list; phone-width browser test asserts heading focus. | Fixed |
| — | W0 | No additional defect identified in combined contract, auth, replay, rollback, race and migration review/tests. | Existing implementation preserved. | Reviewed |
| — | W1-C | Pending count success, unavailable count and reviewer role behavior. | Added admin/supervisor count and failure regressions; component unchanged. | Reviewed |

P0 remaining: **0**. P1 remaining in W2 scope: **0**. P2 remaining in W2 scope: **0**.
The pre-existing PHONE-SAVE-01 physical-acceptance P1 in `HANDOVER.md` remains open outside this scope; W2 does not close it.

Verification corrections: the initial CLI wildcard omitted technician specs because Playwright CLI patterns are regular expressions. The W2 config now uses explicit `testMatch` globs and a separate port/output directory. An added admin badge test initially inherited the supervisor fixture's intentional 403 for admin-only compliance reminders; its fixture now supplies a valid empty reminders response. The new approval-focus case initially timed out on `getByLabel("Zone")`; it now uses the existing suite's accessible combobox selector, and the focused rerun passed. No production authorization or existing assertion was weakened. The initial sandboxed Docker access failure, occupied Vite-port attempt and first combined run's test-selector failure are retained in local logs; none counts as a pass. The final combined command is rerun from cold after these test corrections.

## Definition of Done

| Item | Result / evidence |
|---|---|
| API typecheck and build | PASS |
| Location configuration/proposal/review units; unchanged legacy rejection | PASS, 30 tests |
| Cold and populated migration 056 | PASS, 1 scenario suite; disposable PostgreSQL only |
| Original and W0 proposal HTTP/database suites | PASS, 2 scenario suites; auth/owner isolation, edit validation, idempotency, reject/withdraw resubmission, SQL filter/counts, live mergeability, stale callers, concurrency and audit rollback |
| Historical matrix, V6 evidence, Wet Chemical definition, V7 contracts/config | PASS, 20 / 11 / 2 / 38 tests |
| V6 integration; CO2, Wet Chemical, Fire Alarm V7; evidence races | PASS, 1 / 4 / 2 / 4 / 1 tests |
| Web typecheck, production build, W0 client contracts/regressions, V7 stale evidence | PASS; 24 client/regression tests and 1 stale-evidence test |
| Diff helper, held-proposal and header summary units | PASS, 16 tests |
| All section 6 screen specs, plus five defect cases and three badge cases | PASS, 51 browser cases; explicit W2 suite config |
| 360×800, 768×1024, 1280×800 | PASS, harness asserts no horizontal page overflow, minimum 44px controls, visible focus and reachable primary actions; screenshots generated at all sizes |
| Mobile UI, Web Interface Guidelines and React review | PASS for this scoped review after the three corrections above; limits below |
| Missing `:root` tokens | PASS, none missing: all variables used by both new stylesheets and Home badge resolve in `app.css`; no token or stylesheet change required |
| User guide and handover | PASS, updated for combined behavior and test limits |
| Git diff check / protected working-tree paths | PASS, no whitespace errors (CRLF notices only); protected status empty |
| Strict protected equality to `e30c649` | **Pre-existing exception:** `fireAlarmV6Evidence.ts` differs by the committed `10f3bbb` bigint/string uploader-ID fix. W0/W1/W2 do not modify it. V1–V6 template files, migration 017, V6 acceptance and V6 final-report integration source equal `e30c649`. Do not claim blanket protected equality. |

The final cold command completed with **exit 0**: **157 Node unit/integration tests and 51 Chromium browser cases, zero failures and zero skips**. Docker removed the run's disposable database container before the browser stage. An additional web typecheck was run after the final source edits. All executable gates passed; the strict baseline-equality exception above is retained, not silently marked PASS.

Protected-path check (19 October 2026): the following command produced **no status entries**. The separate `git diff e30c649` check confirmed the pre-existing V6 evidence exception described above; the other named paths had no baseline diff.

```powershell
git status --short -- apps/api/src/inspections/templates/masterServiceReportV1.ts apps/api/src/inspections/templates/masterServiceReportV2.ts apps/api/src/inspections/templates/masterServiceReportV3.ts apps/api/src/inspections/templates/masterServiceReportV4.ts apps/api/src/inspections/templates/masterServiceReportV5.ts apps/api/src/inspections/templates/masterServiceReportV6.ts apps/api/migrations/017* apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts apps/api/src/sync/fireAlarmV6Acceptance.ts apps/api/src/reports/fireAlarmV6FinalReport.integration.test.ts
# (no output)
```

## UI and React audit

Reviewed `ManagerLocationProposals.tsx`, its stylesheet/diff helper, `TechnicianLocationProposal.tsx`, its stylesheet, `SingleInstanceFormatAction.tsx` and the Home badge. Applied the project mobile skill and the [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), fetched 19 October 2026. Checked labels, text statuses, keyboard tabs, focus, error association, wrapping, empty/loading/error states, safe-area actions and motion. The field error defect above was fixed. Screenshots of reviewer detail and technician offline entry at phone and desktop sizes were visually inspected.

React pass on both proposal components checked primitive effect dependencies, cancellation/late-response guards, keyed visit/user isolation, listener/subscription cleanup, derived online authority, and request ordering. Reviewer list/detail requests are independently scoped; technician local writes precede any sync attempt. No additional correctness defect identified. This was a targeted source review, not a full performance profile, screen-reader audit or certification of the entire application.

## What was and was not tested

**Tested in automated harnesses:**

- Real disposable PostgreSQL migrations and authenticated Express routes on loopback; owner/foreign/unauthenticated/stale-actor behavior, terminal decisions, exact replay, request-ID reuse, edited-patch constraints, resubmission, approve/withdraw races and transaction rollback.
- Chromium React screens with fixture/intercepted APIs, real IndexedDB, offline network emulation, typing, local save/queue, reload or React remount as specified by each test, failed/malformed read-back, hidden stale decisions, new revision UUID, preserved original receipt, discard/sync serialization and exact withdrawal confirmation/retry identity.
- Reviewer tabs/diffs, edited approval, mergeability refusal, original/applied display, late detail responses, keyboard navigation, badge success/failure and layout assertions at the three specified viewport sizes.
- API/web compilation and the standing historical/evidence regression suites.

**Not tested or claimed:**

- Physical Android/iPhone, camera capture, touch keyboard, browser/OS process restart, installed-PWA force-close/reopen, physical airplane-mode operation, mobile service-worker cold start, Safari or other browser engines.
- End-to-end W2 UI against the real API: browser UI tests use fixtures; server routes are tested separately against disposable PostgreSQL.
- Customer PC reboot/container persistence, production migration 056, HTTPS/domain/proxy behavior, public access, deployment or client production data. No Level 3 acceptance.
- Original OPPO PHONE-SAVE-01 acceptance; its existing owner checkpoint remains open.

## W2 files changed

These are W2 changes only; the existing W0/W1 working tree was present at entry and is preserved.

| File | Reason |
|---|---|
| `apps/web/src/jobs/TechnicianLocationProposal.tsx` | Constrain revision fields to the server contract |
| `apps/web/src/manager/ManagerLocationProposals.tsx` | Associate approval-name errors with the correct input; restore phone inbox focus after rendering |
| `apps/web/tests/technician-location-proposal-w1b.spec.ts` | Three revision contract regression cases |
| `apps/web/tests/supervisor-location-proposals.spec.ts` | Approval-name and phone Back focus accessibility regressions |
| `apps/web/tests/manager-supervisor.spec.ts` | Reviewer badge success and nonblocking failure coverage |
| `apps/web/tests/location-proposal-w2.config.ts` | Complete, isolated section 6 browser selection |
| `docs/testing/Verify-LocationProposalsW2.ps1` | Cold reproducible combined gates |
| `docs/testing/LOCATION_PROPOSAL_W2_REVIEW.md` | Findings, DoD, evidence and testing limits |
| `docs/testing/LOCATION_PROPOSAL_W2_SOL_BRIEF.md` | Independent read-only review handoff |
| `docs/client/USER_GUIDE.md` | Current review, edits, withdraw/discard, revision and offline status instructions |
| `HANDOVER.md` | Current W2 checkpoint and remaining acceptance limits |

No W2 change to API code, migration, Dexie schema, lockfiles, runtime configuration, app.css, inspection forms or unrelated source files.

## Reproduce from cold

Prerequisites: installed project dependencies, Docker Desktop, installed Playwright Chromium (or the installed Chromium fallback accepted by the W0 runner), free loopback ports 55432 and 4178. Run with local process/network/Docker access; the runner restores the inherited environment and removes only its own disposable database container. It overrides an already-set `DATABASE_URL`.

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\docs\testing\Verify-LocationProposalsW2.ps1
```

Local full output: `docs/testing/artifacts/w2/final-gates.log` (ignored log). Browser screenshots: `apps/web/test-results/w2/` (ignored, replaced on rerun). The W2 runner invokes the W0 runner unchanged, then 16 focused units and the explicit combined Playwright suite, then `git diff --check` and status. All integration suites run serially on the disposable database.

SAFE FOR SOL RE-REVIEW: **Y**, with the pre-existing protected-file qualification explicitly handed to Sol. Independent review and owner Level 3 acceptance remain separate checkpoints. Stop before staging.
