# Autopilot — standing instructions

Owner-approved 2026-09-19. Start or resume with:

```
/loop Follow docs/autopilot/AUTOPILOT.md. Take the next open task in docs/autopilot/BACKLOG.md.
```

Run the session with its working directory set to this worktree:
`C:\PWA_OfflineRecordWebApp\.claude\worktrees\autopilot` (branch `claude/autopilot`).

These rules extend `.agents/skills/codex-task-brief/SKILL.md`. Where they conflict, this file wins
**only** for work on branch `claude/autopilot`. Everything else in that skill still applies
(mirror the proven path, additive only, historical immutability, test-DB discipline, honest reporting).

---

## 1. Where you work

- Only inside this worktree, on branch `claude/autopilot`. Never edit `C:\PWA_OfflineRecordWebApp`
  (the main tree). That tree holds another agent's unfinished PDF work (GPT-6, report R2/R3). Read it
  only when a backlog task says to import named files from it.
- Never create, edit, stage or commit anything under: `apps/api/src/reports/template/`,
  `apps/api/src/reports/pdf/`, `apps/api/src/cli/render*`, `scripts/Test-ReportR2.ps1`, `tmp/`,
  `docs/report-template/generated-sample.pdf`. Those belong to the PDF work. If a task needs them, mark
  it BLOCKED (see §5).
- First run in a fresh worktree: `npm ci` in `apps/api` and in `apps/web` (never a junction to the
  main tree's node_modules).

## 2. Git: what you may do

Allowed, on `claude/autopilot` only:
- `git add <explicit paths>` (never `-A`, `.`, or `-u`), `git commit`, `git status`, `git diff`, `git log`,
  `git show`, `git worktree list`.

Never: push, pull, fetch-and-merge, merge, rebase, reset, restore, checkout of other branches or files,
stash, tag, amend, cherry-pick, branch deletion, `git clean`, or any change to the main tree's index.

Commit message: `<type>(<area>): <what>` + a body listing the task id, gate result and review verdict.
End every message with:
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## 3. One iteration = one task

1. **Pick** the first task in BACKLOG.md with status `TODO` whose prerequisites are `DONE`. Set it to
   `IN PROGRESS` (edit the file; it is committed with the task).
2. **Design check.** If the task is marked `DESIGN FIRST`, write `docs/autopilot/designs/<id>.md`
   (problem, options, recommendation, data/migration impact, offline impact, test plan), commit it,
   set the task to `NEEDS OWNER`, and stop the loop (§5). Do not implement until the owner writes
   `APPROVED` in that file or in the backlog.
3. **Implement** to the task's Definition of Done. Read the skills the task names first.
4. **Review.** Spawn a fresh reviewer with the Agent tool (general-purpose, not a fork) and give it the
   "Sol review brief" section of the codex-task-brief skill, the task's DoD, the exact diff range
   (`git diff HEAD` plus untracked files), and the instruction to modify no file. It must answer with
   P0/P1/P2 counts, each with `file:line` and a concrete failing scenario.
5. **Fix** every P0 and P1, and every P2 that is cheap. Re-review with a new reviewer. At most 3 review
   rounds; still open P0/P1 after round 3 = STOP (§5).
6. **Gate, cold** (§4). Any failure or skip: fix and rerun. Still red after 3 attempts = STOP.
7. **Revert proof** for every new guard/test the task adds: in a scratch copy outside the repo, remove the
   guard, show the new test fails at the expected line, remove the copy (junctions removed with `rmdir`
   only; confirm zero reparse points before any recursive delete).
8. **Record.** In BACKLOG.md set the task to `DONE` with: commit summary, gate counts, review rounds,
   revert-proof result, and any `OWNER CHECK` line (what the owner should try in the browser/phone).
   Update `HANDOVER.md`'s "Last updated" entry for this branch.
9. **Commit** (explicit paths). Then continue to the next task in the same loop.

Batch owner checks: never wait for the owner to click through the UI mid-loop. Put the steps under the
task's `OWNER CHECK` and move on.

## 4. Gates

Before any gate, check nothing else is using the shared resources: TCP 4175 (Playwright dev server),
TCP 55432 and Docker containers named `phase6_seed_integration*` / `phase8f-*`. If busy (the main tree
or another session is gating), wait and check again later; never kill another session's process or
container.

Minimum for every task (PowerShell, verbatim, no `*>`/`2>&1` wrapping):
```
cd <worktree> ; .\scripts\Test-ManagerScheduling.ps1
cd apps/api ; npm run typecheck ; npm run build
cd ../web ; npm run typecheck ; npm run build
git diff --check
```
Plus the standard gates from the codex-task-brief skill when the task touches API, sync, templates,
evidence or reports, plus the task's own tests. Zero skips. The runtime Postgres
(`inspection_pwa-postgres-1`) is never used by tests, and never `docker compose down -v`,
`docker volume rm`, or `docker system prune`.

## 5. When to stop the loop and wait for the owner

Stop (end the loop with `ScheduleWakeup stop:true`, then write a short summary) when:
- a task is `DESIGN FIRST` and its design is written (status `NEEDS OWNER`);
- a product decision is needed that the backlog does not answer: ask it plainly, with a recommendation;
- P0/P1 still open after 3 review rounds, or a gate still red after 3 attempts;
- a change would touch a DO-NOT-MODIFY file, an applied migration, the runtime DB, Docker volumes,
  deployment on the client host, or the PDF files in §1;
- a task needs real client data (company details, logo) or a real phone;
- every remaining task is `BLOCKED`, `NEEDS OWNER` or `DONE`.

Set the task to `BLOCKED: <reason>` or `NEEDS OWNER: <question>` before stopping.

## 6. Summary to the owner (end of every loop run)

Short: tasks done (with commit hashes), the task it stopped on and why, the batched OWNER CHECK list,
and the exact question if one is pending. No re-listing of passing tests beyond counts.
