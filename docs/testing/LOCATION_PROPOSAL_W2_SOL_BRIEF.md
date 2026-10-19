# Sol review brief — location proposals W2

Follow `.agents/skills/codex-task-brief/SKILL.md`. Read `v7-evidence-acceptance` and the relevant backend, sync, IndexedDB, offline, mobile UI and release-testing skills. Review only; modify no file and perform no Git mutations.

Review the **combined uncommitted W0/W1-A/W1-B/W1-C/W2 working tree against `e30c649`**, using `docs/testing/LOCATION_PROPOSAL_IMPROVEMENT_PLAN.md` sections 3, 5–7 and `docs/testing/LOCATION_PROPOSAL_W2_REVIEW.md`. Keep inherited committed changes distinct from these task outputs. Do not deploy, apply migration 056 to runtime, clear storage or use production data.

W2 claims to verify:

1. W0: migration 056 cold/populated safety and append-only preservation; one-query inbox/filter/counts; authoritative live detail/zones/mergeability; bounded same-target edited approvals; owner-only technician reads/withdrawals; exact confirmations; idempotency, stale-actor protection, audit rollback and approve/withdraw serialization.
2. W1-A: readable reviewer inbox/detail/diffs, counts, mergeability gating, approve-with-edits preserving original and applied patches, required rejection note, late-response/refetch failure handling, keyboard navigation and three-viewport layout.
3. W1-B: offline local data entry, drafts and queue; fresh-only review decisions; revision with a new UUID and unchanged original; online withdrawal with persisted retry ID; atomic discard refusing Syncing/uncertain delivery; named held messages and existing sync regressions.
4. W1-C: only verified Admin/Supervisor Home mounts/fetches the supplementary pending count; unavailable counts never block navigation. Inspect the App authorization/mount predicate as well as the badge itself. Do not weaken existing auth to make a test pass.
5. W2-01: revision editor uses a hose-reel drum enum, 200-character asset/zone text caps, 250-character riser location cap and existing 300-character ordinary location cap. Confirm the new browser cases prove offline queueing without changing historical forms.
6. W2-02: empty location/new-zone approval focuses and marks the actual input, links the error and does not mark the note invalid; no decision POST occurs. Confirm the new test checks both fields.
   W2-03: phone Back restores focus to the inbox heading after the inbox is visible, instead of focusing a hidden element before the render. Confirm the new 360px keyboard regression.
7. All used tokens exist: no `:root` addition was necessary; app.css untouched. Audit reviewer/technician CSS and components under mobile UI, Web Interface Guidelines and React rules.
8. User-guide wording matches the final combined behavior and test limits. No claim of a real phone, installed-PWA force-close or Level 3 acceptance.

Re-run all standing and section 6 gates from cold, with Docker/process access and ports 55432/4178 free:

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\docs\testing\Verify-LocationProposalsW2.ps1
```

The runner starts/removes only its own disposable PostgreSQL on `127.0.0.1:55432`, overrides inherited DB URLs and selects all requested browser specs with config globs. Do not substitute the runtime database. A skip is not a pass; a non-verbatim/broken command is a finding. Inspect output for test counts and zero skips. Inspect fresh screenshots in `apps/web/test-results/w2/` at 360×800, 768×1024 and 1280×800.

Protected-source qualification: V1–V6 master templates, migration 017, V6 acceptance and V6 final-report integration are unchanged from `e30c649`; protected working-tree status must be empty. **`fireAlarmV6Evidence.ts` has a pre-existing committed `10f3bbb` uploader bigint/string fix relative to `e30c649`.** Confirm that provenance and that W0–W2 leave it untouched; report the strict historical-equality exception explicitly instead of claiming blanket byte equality. Do not revert it.

For every claim not closed, provide `file:line`, concrete failing scenario and P0/P1/P2. Look for newly introduced defects in authorization, parameterized SQL, configuration authority, stale asynchronous callers, local persistence and anything that could touch runtime/production. Keep the existing PHONE-SAVE-01 physical-acceptance P1 separate from W2 source findings; it remains open for the owner.

Deliver:

- A row per DoD claim and executable gate: PASS/FAIL with concrete evidence.
- P0 / P1 / P2 counts and findings; NEW DEFECTS: Y/N (list).
- HISTORICAL IMMUTABILITY INTACT: Y/N, explicitly distinguishing the pre-existing protected-file exception from any new task changes.
- SAFE FOR MANUAL FINAL SANITY: Y/N.
- SAFE TO COMMIT: Y/N, with the protected-file qualification and outstanding owner phone acceptance made explicit.
- `git status --short`, protected-path status and `git diff --check` evidence.

Stop after the report. No staging, commits or next-task implementation.
