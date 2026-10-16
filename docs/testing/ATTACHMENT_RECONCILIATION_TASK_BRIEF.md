# Attachment storage reconciliation — task brief

Created: 2026-10-10, Asia/Kuala_Lumpur. Priority: P2 (release-phase owner). Not implemented.

## Why

On every API start, `reconcileAttachmentStorage()` (`apps/api/src/attachments/attachmentStorage.ts:236`)
compares the files under `uploads/inspections/` with **only** the `inspection_attachments` table.
Photos for Fire Alarm V6 and all V7 systems are recorded in a second table,
`staged_inspection_evidence` (`apps/api/migrations/017_v6_staged_evidence.sql`), in the same
folder. Final Report PDFs read accepted rows from that table
(`apps/api/src/reports/finalServiceReport.ts`).

Evidence from the runtime check on 2026-10-10 (read-only, owner-run):

| Measure | Value |
| --- | --- |
| Files on disk | 79 |
| `inspection_attachments` rows | 8 |
| `staged_inspection_evidence` rows | 71 (44 `accepted`, 27 `staged`) |
| Files in neither table | **0** |
| Startup log `orphanFileCount` | 71 (false alarm) |

Two defects follow:

1. **False orphans.** Every staged/accepted evidence photo is logged as an orphan. The count grows
   with every evidence upload, so a genuine orphan would be hidden in the noise.
2. **No integrity check for evidence.** Missing, truncated or corrupted evidence files are never
   detected. The staged-evidence upload path does verify files on duplicate upload
   (`verifyAttachmentFile` in `v7StagedEvidence.ts` and `fireAlarmV6Evidence.ts`), but nothing checks
   accepted evidence at rest. A lost accepted photo is found only when a PDF build or content
   request fails.

## Goal

Make startup reconciliation treat `staged_inspection_evidence` the same way as `inspection_attachments`:
its files are expected (not orphans) and each row's file is verified for presence, size and SHA-256.

## Working rules

- Follow `AGENTS.md` and `.agents/skills/codex-task-brief/SKILL.md`. Inspect the current checkout
  first; the baseline commit named in the skill is stale.
- Read `.agents/skills/v7-evidence-acceptance/SKILL.md` and `.agents/skills/backend-api-security/SKILL.md`.
- No Git mutations. Stop before staging.
- The working tree already holds uncommitted security-remediation work (auth, limiter, request
  security, package files). Do not touch or revert it.
- Protected scope: no new migration, no schema change, no Docker/Caddy/`.env` change. The table and
  its columns already exist.
- Integration tests use the disposable Postgres on `127.0.0.1:55432` only. Never the runtime
  `inspection_pwa-postgres-1`, and never the runtime uploads directory. Override inherited
  `DATABASE_URL` and `UPLOADS_PATH` explicitly. A skipped test is not a pass.
- **Read-only:** reconciliation must never delete, move or rewrite any upload file or database row.

## Files

| File | Change |
| --- | --- |
| `apps/api/src/attachments/attachmentStorage.ts` | Main change, `reconcileAttachmentStorage()` |
| `apps/api/src/server.ts:98-113` | Only if the log needs adjusting; return keys should stay the same |
| `apps/api/src/cli/validatePhotoEvidence.ts:582` | Existing caller; must keep passing |
| New focused test file next to `attachmentStorage.test.ts` | Regression coverage |

Do not modify: Fire Alarm V6 and V7 evidence modules, the acceptance code under `apps/api/src/sync/`,
`finalServiceReport.ts`, or any migration.

## Requirements

1. Build the expected-path set from the **union** of `inspection_attachments.storage_relative_path`
   and `staged_inspection_evidence.storage_relative_path`. Treat each path once even if it appears in
   both tables.
2. For every `staged_inspection_evidence` row, run `verifyAttachmentFile` with the row's
   `storage_relative_path`, `stored_size_bytes` and `stored_sha256`. Report failures in the existing
   `missingFiles`, `wrongSizeFiles` and `wrongHashFiles` arrays. Keep the return shape unchanged so
   `server.ts` and the CLI need no edit; treat `unsafe-path` as it is treated today.
3. Both `staged` and `accepted` rows are covered. Verify sequentially, as today, with the existing
   streaming hash. Report how long startup reconciliation takes on the current data set.
4. `orphanFiles` must contain only files referenced by neither table.
5. Keep the behaviour warn-only at startup. Do not make the API refuse to start. If the owner wants
   fail-closed at boot, that is a separate decision.
6. The new query must fail loudly if it errors, as the existing query does. Do not swallow a database
   error and report a clean result.
7. Do not change the stale-temp-file check or the write-probe at the top of the function.
8. Optionally add the staged and accepted evidence counts to the startup warning, without paths or
   file names.

## Tests

Add focused regression coverage using the disposable Postgres and a temporary uploads directory.
Reuse an existing evidence fixture, for example from `v7EvidenceRace.integration.test.ts`, or the real
upload path, instead of hand-building every foreign-key parent row. Cover at least:

- [ ] A present, correct `staged` file is not an orphan and is not reported missing.
- [ ] A present, correct `accepted` file is not an orphan and is not reported missing.
- [ ] A file referenced by `inspection_attachments` behaves exactly as before.
- [ ] A file referenced by neither table is still reported in `orphanFiles`.
- [ ] A staged or accepted row whose file was deleted appears in `missingFiles`.
- [ ] A truncated file appears in `wrongSizeFiles`.
- [ ] A same-size file with different content appears in `wrongHashFiles`.
- [ ] A mixed run produces the exact expected counts across all categories.
- [ ] Nothing is deleted or modified by reconciliation (compare the directory listing and file hashes
      before and after).
- [ ] `validate-photo-evidence` still passes with its existing assertions unchanged.

Never weaken an existing assertion to make it pass.

## Verification level

Level 2 (data integrity). Run the focused tests plus `npm run typecheck` and `npm run build` in
`apps/api`. Run the existing V7 integration suites from the standard gates in the task-brief skill
against a cold disposable database. Run `git diff --check`.

## Definition of done

Report as a table, one PASS/FAIL row per item above, plus:

- Files changed, each with a one-line reason.
- `git status --short` showing the DO-NOT-MODIFY list in the skill is untouched and the existing
  security-remediation files are unchanged by this task.
- Measured reconciliation time and, if safe to read, the startup log line from a local run against
  disposable data. Do not run against the runtime database or uploads.
- `P0 remaining: <n>` and `P1 remaining: <n>`.
- A limitations list, including the observations below.

Then stop. Do not commit.

## Out of scope — note only

- The 27 `staged` photos have no cleanup path (`expires_at` is never read by any code). If staged
  evidence is abandoned its files stay forever. Decide at the release phase whether to add expiry.
- Whether the API should refuse to start when an accepted evidence file is missing.
- The same checks for report PDFs and other generated files.

## Owner follow-up after merge

After the owner rebuilds and restarts the API, the startup log should no longer report
`orphanFileCount: 71` for the current data. Confirm on the next local rebuild; do not delete any upload
file based on the old log line.
