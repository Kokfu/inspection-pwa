Follow .agents/skills/codex-task-brief/SKILL.md (standing rules 1, 2, 6, 7, 8 and the DoD table format).
Read .agents/skills/backend-api-security/SKILL.md and .agents/skills/on-premise-windows-deployment/SKILL.md.
The V7 standard gates in the codex-task-brief skill do NOT apply here (no template/evidence work).
Use the gates under "DoD" below instead. Verification level: 2 (auth / data integrity).

TASK: Admin recovery CLI (Part A, offline, operator-only, never exposed over HTTP) plus
admin web password reset for technicians/supervisors (Part B, below). Implement A first, then B.
Items numbered 1-7 below are Part A.

Background (verified in code)
- apps/api/src/cli/createAdmin.ts upserts on username: it creates an admin OR silently resets the
  password, forces role='admin', and reactivates the account. Password comes from ADMIN_PASSWORD env.
- apps/api/src/audit/auditLog.ts writes to audit_events (actor_user_id, action, entity_type,
  entity_id, result, reason). No new table or column is needed.
- user_sessions has revoked_at (revoked via UPDATE in apps/api/src/routes/auth.ts logout).
  createAdmin does NOT revoke sessions today.
- package.json script "create-admin" -> node dist/cli/createAdmin.js. Docker image runs dist/.

1. Replace the upsert behaviour with two explicit commands (new files in apps/api/src/cli/):
   a. `createAdmin.ts` (keep script name `create-admin`): creates a NEW admin only.
      If the username already exists, exit 1 with a clear message pointing to `reset-admin-password`.
   b. `resetAdminPassword.ts` (new script `reset-admin-password`): updates an EXISTING user whose
      role is 'admin' only. Missing user, or a non-admin user, -> exit 1, change nothing.
      It sets password_hash, is_active=true, updated_at=now(), and revokes ALL that user's
      unrevoked sessions (UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL)
      in the SAME transaction as the password change.
2. Password input, both commands:
   - If stdin is a TTY: prompt twice with hidden input (no echo), require a match.
   - If not a TTY: accept ADMIN_PASSWORD from env (keeps automation and tests working).
   - Never print the password. Keep the existing 12-character minimum; add a 1024 maximum
     (matches managerTechnicians.ts).
   - Username from ADMIN_USERNAME env or first CLI argument. Trim as today.
3. Shared helper (e.g. apps/api/src/cli/adminCli.ts) for the prompt, validation and transaction.
   No duplicated logic between the two commands.
4. Audit: write one audit_events row per run using auditLog (or the same INSERT inside the
   transaction so audit and change commit together):
   - action: 'admin_create_cli' / 'admin_password_reset_cli'
   - entity_type 'user', entity_id = user id, result 'success'
   - reason: 'offline operator CLI'. NEVER include the password or hash.
   - On refused runs (user exists / not admin / not found) write a result 'failure' row with the reason.
     For not-found, entity_id is the attempted username (trimmed, truncated to a sane length).
   - Note the deliberate difference from Part B: the CLI reset DOES set is_active=true (recovery
     of a locked-out admin); the web reset must NOT. Keep each as specified.
5. Part A must not touch: runMigrations behaviour, schema/migrations, login route, Docker Compose,
   Caddy, .env (the web app is touched only by Part B). The CLI keeps calling runMigrations() only if createAdmin already does; do not add it
   to reset-admin-password (a reset must not alter schema).
6. apps/api/package.json: add the `reset-admin-password` script and one test script for the new
   integration test(s) (e.g. `test:admin-cli-integration`, matching the existing `tsx --test` style).
   No other changes. Do not edit any package-lock.json.
7. Docs: add a short "Admin recovery" section to docs/client-install-and-public-access.md with the
   exact commands below, and a one-line note in docs/client/ if a client-facing admin guide exists.
   Update HANDOVER.md "Last updated" line and relevant section.

   Operator commands to document (service name is `api`; `docker compose exec` allocates a TTY by
   default, which the hidden prompt needs; do NOT add -T. Terra: confirm the exact flags against
   `docker compose exec --help` on this machine and only document what actually works):
     docker compose exec api node dist/cli/resetAdminPassword.js admin-username
     docker compose exec api node dist/cli/createAdmin.js new-admin-username
   Also document the "no admin left / forgot username" case:
     docker compose exec postgres psql -U <db user> -d <db name> -c "SELECT username, is_active FROM users WHERE role='admin';"
   (placeholders only; no real credentials or hostnames).

Tests (disposable Postgres on 127.0.0.1:55432 only; never inspection_pwa-postgres-1)
- New apps/api/src/cli/adminCli.integration.test.ts covering:
  a. create-admin creates admin; second run with same username fails and leaves hash unchanged.
  b. reset updates hash; old password no longer verifies, new one does (verifyPassword).
  c. reset revokes all active sessions of that user; other users' sessions untouched.
  d. reset refuses a non-admin (technician/supervisor) and a missing user; DB unchanged.
  e. reset reactivates an inactive admin.
  f. password <12 and >1024 rejected; mismatched confirmation rejected.
  g. audit rows written for success and refusal; no row/column contains the password or hash.
  h. transaction rollback: force failure after password UPDATE (test hook or bad audit insert)
     -> password and sessions both unchanged.
- Add the test to the api test script list the same way other integration tests are registered.

DoD ADDITIONS (report as a PASS/FAIL table)
- cd apps/api; npm run typecheck; npm run build
- New integration test passes against the disposable DB (cold-start block included, works verbatim
  even if DATABASE_URL is already set; SKIP is not PASS). Existing auth/manager integration tests
  still pass: managerTechnicians, supervisorRole, technicianOwnership.
- Manual proof against the DISPOSABLE db only: show reset-admin-password refusing a technician.
- grep proof: no console.log / auditLog / error path prints ADMIN_PASSWORD or password_hash.
- git diff --check
- git status --short: only these may change: apps/api/src/cli/*, the new CLI test, apps/api/package.json
  (script lines), apps/api/src/routes/managerTechnicians.ts and its test, apps/web/src/manager/
  managerApi.ts, ManagerTechnicians.tsx and its test, docs, HANDOVER.md. (scripts/phone-testing/mode.txt
  is a pre-existing untracked file; leave it alone.) No migrations, no package-lock, no
  docker-compose, no Caddy, no .env, nothing on the codex-task-brief DO-NOT-MODIFY list.
- P0 remaining: <n>, P1 remaining: <n>. Files changed with one-line reasons.
- Verdict line: SAFE FOR SOL RE-REVIEW: Y/N

PART B: Admin sets a new password for a technician/supervisor (API + web UI)

Background (verified): managerTechnicians.ts sets a password only on create. Existing routes under
/manager/technicians/:technicianId/* use requireRole("admin"), strict body validation
(unknown keys rejected), BEGIN/COMMIT with ROLLBACK, the local audit(client, ...) helper, and
numericUserId(). The web side is apps/web/src/manager/managerApi.ts (managerRequest) and
apps/web/src/manager/ManagerTechnicians.tsx (deactivate uses window.confirm today).
Mirror these patterns exactly; do not invent a new one.

B1. API: POST /manager/technicians/:technicianId/password in managerTechnicians.ts
    - requireRole("admin") only. Supervisors and technicians must get 403.
    - Body must be exactly { password: string }, 12–1024 chars (same rule as create). Unknown keys -> 400.
    - Target must satisfy: role IN ('inspector','supervisor') AND hidden_at IS NULL.
      Admin accounts are NOT resettable through the web (that is the offline CLI's job).
      Not found / wrong role -> 404 TECHNICIAN_NOT_FOUND, same as the sibling routes.
    - Single transaction: UPDATE users SET password_hash, updated_at=now(); revoke all of the
      target's unrevoked user_sessions; write the audit row. Roll back everything on any failure.
    - Do NOT change is_active (a reset must not silently reactivate a deactivated account).
    - audit action 'manager_technician_password_reset', entity user:<id>, reason 'role=<role>'.
      Never put the password or hash in the audit row, the response, or logs.
    - Response: 200 { ok: true }, Cache-Control: private, no-store. Return no hash.
    - Hash with hashPassword BEFORE opening the transaction, as the create route does.
B2. Already verified by the reviewer: apps/api/src/middleware/currentUser.ts:53-55 rejects sessions
    where revoked_at is set, expired, or u.is_active is false, so a deactivated user's old session
    is already dead. Terra: confirm with one test (deactivate -> existing session cookie gets 401)
    and add it if missing. No fix expected; report any deviation as P1.
B3. Web API client: add resetManagerTechnicianPassword(id, password) to managerApi.ts, same
    managerRequest pattern. The password must never be logged, stored in IndexedDB, put in a URL,
    or kept in state after submit.
B4. Web UI in ManagerTechnicians.tsx: a "Set new password" action per technician/supervisor row
    (not shown for admins; hidden rows are already excluded).
    - Opens a small inline form or dialog: new password + confirm password, type="password",
      autoComplete="new-password", 12-character minimum shown in the helper text, show/hide toggle
      optional. Submit disabled until valid and matching.
    - Mobile-first per .agents/skills/mobile-first-ui/SKILL.md: 44px touch targets, labels tied to
      inputs, errors announced (aria-live), no horizontal scroll at 375px.
    - Clear password fields on success AND on cancel; show a success message that says the user was
      signed out of existing sessions. Show API errors using the existing ManagerApiError handling.
    - Works only online (it is an admin server action, not offline business data). If offline, show
      the existing offline messaging; do NOT queue passwords in the sync outbox or IndexedDB.
    - Follow the repo's existing style for mutations (the `mutate(...)` helper).
B5. Tests
    - API integration (disposable DB): admin can reset a technician and a supervisor; old password
      fails login, new works; target sessions revoked, others untouched; inactive user stays
      inactive; admin target -> 404; hidden target -> 404; supervisor and technician callers -> 403;
      unauthenticated -> 401; short/long/missing/non-string/extra-key bodies -> 400; audit row exists
      with no password or hash anywhere; rollback leaves password and sessions unchanged.
      Put them in managerTechnicians.integration.test.ts (extend, do not weaken existing tests).
    - Web: a focused test for the form (mismatch blocks submit, fields cleared after success and
      cancel, password not present in any request URL or storage). Use the existing web test setup
      in apps/web; add a Playwright spec only if the existing manager specs already use one for
      this screen. Do not run the full Playwright suite.
    - Web gates: cd apps/web; npm run typecheck; npm run build.

OUT OF SCOPE (note, do not fix)
- Last-active-admin lockout guard in the web UI: report whether it exists, do not implement.
- Self-service "change my own password" for technicians/supervisors: report as a P2 follow-up.
- Changing admin passwords through the web: intentionally not provided.

Additional DoD rows for Part B
- API route test file passes against the disposable DB; existing managerTechnicians tests unchanged and green.
- Web typecheck + build PASS; the new form test PASS.
- Screenshot or DOM proof at 375px width is NOT required to claim done, but do not claim a
  phone test or real-browser check unless actually performed.
- grep proof: password is not logged or serialized anywhere in new web or API code.
- B2 confirmation test PASS (deactivated user's existing session -> 401).

STOP when the DoD table is green. Print files-changed + reproducible block. Do NOT commit.
