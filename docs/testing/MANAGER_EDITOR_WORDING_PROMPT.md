# Prompt for a new chat: Manager "Zones & locations" wording for the General-layout services

Paste everything below the line into a new Claude Code chat opened on `C:\PWA_OfflineRecordWebApp`.

---

Continue the inspection PWA in C:\PWA_OfflineRecordWebApp (branch phase-8e-client-demo-polish, HEAD 1dd636c or newer). Date context: 2026-10-12.

TASK: fix the Manager-screen wording for the "General layout" services (Hose Reel, Hydrant, Dry/Wet Riser) so an Admin/Manager is never told something wrong or left guessing. Then test, COMMIT, and REVIEW.

READ FIRST, in this order: AGENTS.md; docs/testing/PHONE_TESTING_STATUS.md (section 1, the register rows I-61, I-62, I-63, and the matrix rows "General layout ... 2026-10-12" (source checks, phone test, phone retest, offline + force-close)); the newest "Earlier checkpoint" entry at the top of HANDOVER.md ("Hydrant and Dry/Wet Riser are General layout systems"). Read .agents/skills/mobile-first-ui and pwa-release-testing; read codex-task-brief and backend-api-security only if you touch the API (you should not need to).

CONTEXT (what already exists, committed: e59628a, b80b536, a05c3ba, 8d012e0, 1f3b2d7, 1dd636c)
- Hydrant and Dry/Wet Riser now save ONE zone-free "General layout" per customer (like Hose Reel). A customer is either zoned (named zones/locations a Manager typed) or has the single General location, never both (server: apps/api/src/inspections/locationConfiguration.ts `generalLayoutLocationKeysBySystem`, `isGeneralLayoutShape`).
- The Manager editor already shows a read-only note for a General layout: apps/web/src/manager/ManagerCustomerConfiguration.tsx, in `ManagerLocationsEditor`, state `generalLayoutRows`, text "General layout: N rows saved from technician inspections and approved by an Admin. This service has no named zones or locations to edit here; a technician updates the layout from the next visit." (`isGeneralLayout` and `offersAddLocation` live in apps/web/src/manager/managerApi.ts.)
- The wording problems I know of (verify each in the real code before changing anything):
  1. `ManagerCustomerLocations` (same file, section "Zones & locations") intro still says "CO2, Wet Chemical, and FM200 use one General location in new visits when none are configured" and never mentions that Hydrant, Dry/Wet Riser (and Hose Reel) save their layout from the technician's inspection.
  2. The per-service editor (apps/web/src/manager/ManagerCustomerServices.tsx, "Preset rows" tab, and the service cards' chips such as "General location in new visits" / "1 location set") may describe Hydrant/Riser as if the Manager had to type locations. Check what a customer with NO location, with a General layout, and with a zoned configuration each sees; Hose Reel is NOT in the web `locationConfigurableSystemKeys` (its layout is saved from the form), so check what the Manager sees for it too.
  3. Consistency of names: CR-11 renamed the review role to "Admin" (the `supervisor` role) while the `admin` account is "Manager"; keep that naming. Do not use "Supervisor" in new text.
- Decide the wording yourself where it is clear; if a sentence needs the owner's choice (tone, whether to show the row list), give 2 options in one short question and recommend one. Keep text short, plain, mobile-friendly (360 px), no jargon like "zone-free" or "rowPreset".

WORK
1. Inspect the existing implementation first and list every Manager-facing string about zones/locations/General for these 3 systems (grep the strings, do not guess). Give me a short plan: the strings, the new wording, the files you will change.
2. Implement the smallest change. No API change, no migration, no Dexie change, no package-lock change, no behaviour change: wording only (plus a render test if useful).
3. Tests: update/add focused regression coverage. Existing specs to keep green: apps/web/tests/manager-locations-general-layout.spec.ts (+ .html), manager-locations.spec.ts, manager-locations-save-feedback.spec.ts, manager-customer-configuration.spec.ts, generalLayoutManager.test.ts, and any spec that asserts the old text (grep for it; update an assertion ONLY when the wording itself is what changed, and say so). Add a spec/Node test that fails on the old wording and passes on the new (prove it by temporarily restoring the HEAD version with `git show HEAD:<path>`, never `git stash`, and confirm with `cmp` that you restored yours). Optional small extra from the earlier review: a rendered test that Technician Home / job screen does NOT offer "Add a New Location" for a job whose Hydrant/Riser is a General layout (`offersAddLocation`).
4. Run (Level 1): web typecheck (`cd apps/web ; npm run typecheck`), production build, web Node tests (`..\api\node_modules\.bin\tsx.cmd --test tests/*.test.ts`), the Playwright specs above, `git diff --check`. Do NOT run the whole Playwright suite unless you changed shared code; if you do, use `npx playwright test "\.spec\.ts$" --workers=1` (a bare `npx playwright test` also picks up the Node `*.test.ts` files and aborts). Known baseline failures that are not yours: four `repair-disabled.spec.ts` "saved retired draft" cases (fire_alarm, co2, fm200, wet_chemical) and an intermittent Hose Reel timeout there. One Playwright run at a time (dev server on 127.0.0.1:4175).
5. Update docs/testing/PHONE_TESTING_STATUS.md (a matrix row; a register row only if you find a real problem, next ID I-64, logged BEFORE the fix) and add a short HANDOVER.md paragraph (edit only your own paragraph).
6. REVIEW: run the code-review skill at high effort on your diff (`/code-review high` with the file paths of your change as the target), fix real findings with regression tests, then call ReportFindings again with each finding's outcome.
7. COMMIT after the review fixes. For THIS task you may commit: show `git status` first, stage ONLY your own files by name, never `apps/api/src/attachments/attachmentStorage.ts` or `apps/web/src/App.tsx` (another session's uncommitted work), never push, reset, rebase, stash or switch branches. Re-run `git status` right before committing. End the commit message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
8. Report: what you did, what you observed, tests run (counts), P0/P1/P2, what is not verified, what you need from me, and the next step you propose.

RULES
- The working tree is SHARED with other sessions. Do not overwrite a shared file for a "fails before" check unless you restore it immediately.
- Never run docker compose on your own. This task does not need a rebuild; if you want to see the new text on the real stack, ask me first (a web-only rebuild is `docker compose build proxy` then `docker compose up -d --no-deps proxy`, verify the container is newer than its image, and say it also ships other sessions' uncommitted work). Playwright against the dev server is enough proof for wording.
- Credentials are never stored or repeated. You should not need any login for this task.
- Never weaken a validator or test to make it pass.
- Tooling traps: the Bash tool breaks on heredocs that contain apostrophes (write files with the Write tool, or a Python script file); many source files use CRLF, so a script edit must preserve line endings (read with newline="", detect "\r\n", write back the same); validate package.json with `node -e "require('./package.json')"` if you edit it.
- Never say a test passed unless you ran it. Stop before anything outward-facing that I have not approved.
