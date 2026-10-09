# Security improvements — next coding tasks

Updated: 2026-10-09, Asia/Kuala_Lumpur.

Purpose: protect server information and accounts while preserving offline inspection work. This is a task brief; the remaining code changes have not been implemented.

## Current status

| Item | Status | Next action |
| --- | --- | --- |
| Anonymous business-data access | Previous assessment: 73/73 protected checks returned 401 | Keep passing after changes |
| A-01: HTTP login exposure | Owner enabled Always Use HTTPS; targeted live recheck passed | Keep HTTPS enforcement enabled; include in final retest |
| A-02: application login throttling | OPEN, P1 | Implement first; review dependency prerequisite below |
| A-03: dependency advisories | OPEN, P2; deployed API versions confirmed | Patch and review exploitability before security sign-off |
| A-04: malformed cookie returns 500 | OPEN, P2 | Fix defensive parsing |
| Signed-in authorization and session lifecycle | Not fully verified | Add disposable integration coverage and controlled acceptance tests |

HTTPS recheck on 2026-10-09 at 23:17 MYT (15:17 UTC): HTTP `GET /` returned **301** to HTTPS; HTTP `POST /api/auth/login` with an empty `{}` body returned **301** to the HTTPS endpoint rather than API login validation; HTTPS `GET /api/auth/me` returned **401 AUTH_REQUIRED** without a session. Redirects were inspected without following them, and TLS validation was enabled. No real credentials were used. A fresh-browser/installed-PWA check remains outstanding. The original assessment is historical evidence and should not be overwritten to imply these redirects were present earlier.

Reference: [original assessment](SECURITY_ACCESS_ASSESSMENT.md), [access evidence](SECURITY_ACCESS_EVIDENCE.json), [API dependency audit](SECURITY_API_DEPENDENCIES.json), [web dependency audit](SECURITY_WEB_DEPENDENCIES.json).

## Working rules for each coding task

- Follow `AGENTS.md` and `.agents/skills/codex-task-brief/SKILL.md`; inspect the current checkout and implementation first. Do not assume the historical branch/commit named in a skill is the current working baseline.
- Read applicable API-security and testing skills. Read deployment skills before changing proxy/deployment behavior, and offline/UI skills before modifying login presentation or offline handling.
- Keep each task focused and reviewable. Preserve other work in the shared checkout.
- No staging, commits, push, branch changes or other Git mutations.
- No production database/customer/job changes, credential guessing against real users, load attacks, or live deployment during implementation.
- Preserve historical templates, evidence contracts, accepted reports, stable UUIDs, sync idempotency and existing role permissions.
- Use disposable PostgreSQL on `127.0.0.1:55432` for integration tests; never point tests at runtime PostgreSQL. Override inherited database URLs explicitly. A skipped integration test is not a pass.
- Package manifest/lockfile changes are in scope for the dependency remediation task below. Other protected files remain outside scope unless the owner explicitly extends the implementation task. Do not add migrations just to simplify rate limiting.
- Do not put passwords, cookies, tokens, production hostnames or client configuration into code, fixtures, reports or Git. Obtain the authorized live origin interactively.

## Task 1 — Implement login abuse protection (P1)

**Goal:** repeated automated password attempts receive a temporary cooldown, while normal staff login and offline data entry keep working.

Relevant files:

- `apps/api/src/routes/auth.ts`
- `apps/api/src/server.ts`
- `apps/api/src/middleware/currentUser.ts` and new focused limiter modules/tests if needed
- `apps/api/src/config/env.ts` if validated limiter settings are necessary
- `apps/web/src/auth/authApi.ts` and login presentation, if required to show cooldowns

Implementation requirements:

1. Establish the trusted proxy/client-IP boundary before using IP-based limits. Requests currently pass through Cloudflare, a tunnel and Caddy; do not set unrestricted `trust proxy = true` or trust arbitrary `X-Forwarded-For`/identity headers. Verify the actual forwarding chain and whether direct-origin access can bypass it. If infrastructure changes are necessary, document the exact proposed change for the deployment checkpoint.
2. **Dependency prerequisite:** patch the flagged `proxy-addr` dependency before enabling new proxy trust behavior. Complete the relevant part of Task 2 first if needed.
3. Apply bounded request limits and failed-login cooldowns using account identity and trusted client IP. Account-wide controls must cover attempts distributed over different IPs. Global/per-IP bounds must also limit expensive password-hash work and random-username abuse.
4. Select and document initial thresholds with reasons. Accommodate legitimate users sharing an office/mobile network. Do not introduce permanent automatic account lockouts that attackers can trigger against staff.
5. Keep limiter storage bounded and clear expired entries. Prove atomic counting under concurrent attempts. Document restart/multiple-process behavior; choose a design that cannot silently lose protection when the API restarts or gains another worker. If durability needs a migration or an additional service, present the necessary design before expanding protected scope.
6. Return `429` with a valid `Retry-After` during cooldowns. Preserve generic invalid-credential messages so responses do not expose whether an account exists. Consider dummy verification for nonexistent/inactive accounts, within the request-work budget, to reduce timing differences.
7. Validate login payload types and reasonable length limits before database/hash work. Reject malformed input safely. Keep username normalization consistent with existing account creation and matching.
8. Audit failures/cooldowns safely without passwords, raw sessions or sensitive headers. Bound audit/log amplification.
9. Show a useful cooldown message in the login UI if the API returns 429; do not label every cooldown as an incorrect password. Never disable local forms, draft saves, camera capture or offline business creation because of login throttling.

Acceptance checks:

- [ ] Correct credentials succeed below the limit; wrong credentials do not create a session.
- [ ] Existing, nonexistent and inactive accounts retain generic credential responses.
- [ ] Repeated attempts hit the configured threshold and return 429/Retry-After.
- [ ] Cooldown expires and legitimate login recovers.
- [ ] Parallel attempts cannot bypass counters.
- [ ] Changing client-supplied forwarding headers cannot bypass limits.
- [ ] Rotating IPs cannot evade the documented account control.
- [ ] Random usernames cannot grow storage or consume unbounded hash/log resources.
- [ ] Restart/worker behavior matches the documented protection model.
- [ ] Shared-network legitimate use is covered by tests.
- [ ] Browser login displays the cooldown clearly; local offline work remains available.

## Task 2 — Patch and triage dependencies

**Goal:** remove applicable advisories from deployed packages and document any remaining findings with reachability evidence.

Explicit task scope: `apps/api/package.json`, `apps/api/package-lock.json`, `apps/web/package.json`, `apps/web/package-lock.json`, plus compatibility fixes and focused tests directly required by the updates. This permission applies when the owner starts this implementation task; creation of this brief does not update dependencies.

1. Re-run current dependency audits; the saved JSON files are a dated snapshot.
2. Review API `proxy-addr`, `sharp`, `qs` and related Express/body-parser packages. The previous deployed versions were proxy-addr 2.0.7, sharp 0.35.4, qs 6.15.3 and Express 4.22.2.
3. Select compatible patched versions from current maintainer advisories. The previous proxy-addr advisory identifies 2.0.8 as patched; the sharp audit flagged versions below 0.35.5. Recheck current advisories rather than assuming those minimums close all present findings.
4. Review frontend findings separately. Build tools declared under dependencies are not automatically running on the public static server. Patch applicable issues without representing every audit entry as a demonstrated remote exploit.
5. Use deliberate updates; do not run `npm audit fix --force` blindly, suppress advisories or weaken tests.
6. Check native sharp/library changes against photo normalization, company logo handling and PDF/report output. No malformed decoder exploit testing against production.
7. Rebuild candidate images for the deployment checkpoint and verify the final installed versions there. Updating a local lockfile alone does not update the running API.

Acceptance checks:

- [ ] Current audit evidence records each remaining advisory, affected version, runtime/build reachability and resolution.
- [ ] No untriaged applicable critical/high dependency findings remain at security sign-off.
- [ ] Clean install from updated lockfiles succeeds in an isolated build environment.
- [ ] API/web typechecks and production builds pass.
- [ ] Authentication, photo/thumbnail, logo and PDF regression checks pass.
- [ ] Candidate/deployed version numbers match the reviewed lockfiles at their respective checkpoints.

## Task 3 — Parse malformed cookies safely

**Goal:** invalid cookie encodings cannot turn anonymous requests into internal server errors.

Relevant file: `apps/api/src/middleware/currentUser.ts`.

1. Handle invalid percent encoding defensively.
2. Invalid/missing session tokens must never authenticate. Use a documented safe 401 or 400 response for invalid session cookies.
3. A malformed unrelated cookie must not break otherwise valid authentication or every API route.
4. Keep session lookup requirements: hashed tokens, active user, unexpired session and no revocation.

Acceptance checks:

- [ ] Missing, fake, expired and revoked tokens do not authenticate.
- [ ] `inspection_session=%ZZ` returns a controlled rejection rather than 500.
- [ ] Broken unrelated cookie values do not invalidate a valid session unexpectedly.
- [ ] Duplicate-cookie behavior is explicitly tested and cannot select an unintended session.
- [ ] Production errors return no stack trace or secret values.

## Task 4 — Prove signed-in authorization and session lifecycle

**Goal:** verify permissions beyond the anonymous checks already completed.

Use dedicated admin, supervisor and two technician test accounts in a disposable integration environment. Inspect existing ownership/role suites and extend gaps rather than duplicating them.

- [ ] Technician A cannot read or modify Technician B's restricted jobs, accepted inspections, photos/evidence or reports by substituting IDs.
- [ ] Forging a role/user header or editing cached browser identity never changes server authority.
- [ ] Technicians cannot create/reset users or perform manager/admin configuration actions.
- [ ] Supervisor access matches the existing review policy; no unintended write/admin access is added.
- [ ] Valid session cookies are HttpOnly, Secure and SameSite as intended.
- [ ] Logout revokes the server session; replaying the old cookie fails.
- [ ] Password reset and account deactivation invalidate existing sessions.
- [ ] Expired sessions fail on protected API routes; offline drafts remain intact.
- [ ] Authenticated sensitive responses have suitable cache protection; logout/account switching cannot display another user's server data through a stale response.
- [ ] Review authenticated cross-origin/same-site request risks and require appropriate protections for state-changing requests. Do not infer CSRF safety solely from absent CORS headers.

Run any real deployed-account acceptance with purpose-created test accounts and explicit production-testing scope. Do not use real customer records as fixtures.

## Task 5 — Owner hosting/account checkpoint and final retest

These are hosting/operations actions, separate from coding implementation:

- [x] Enable Cloudflare Always Use HTTPS.
- [x] Targeted HTTP app/login redirect and HTTPS anonymous-session recheck.
- [ ] Add/verify a Cloudflare login rate-limit rule for the application host and `POST /api/auth/login`, using settings available on the current plan. Record its thresholds and action without credentials. This supplements server controls.
- [ ] Verify public-origin bypass is prevented and API/PostgreSQL have no public host ports. Review router/Windows firewall and tunnel rules.
- [ ] Disable unused/demo accounts; rotate shared/default/reused passwords and revoke sessions using the approved administration process.
- [ ] Ensure each staff member has an individual account with the necessary role only.
- [ ] Protect staff devices with screen locks and dedicated browser profiles. IndexedDB intentionally retains offline records after logout; device-data encryption/unlock policy is a separate product decision.
- [ ] After code review and the owner's deployment checkpoint, rebuild/deploy the reviewed changes and verify running package versions.
- [ ] Repeat anonymous access checks and controlled authenticated acceptance.
- [ ] Verify HTTP-to-HTTPS in a fresh browser profile, plus login/cooldown behavior and physical-phone PWA/offline/reconnect behavior where required by release acceptance.

Optional later enhancement: administrator MFA. It is outside the first remediation implementation and must preserve the offline workflow.

## How to run the existing checks

PowerShell, from this repository. Obtain the authorized live origin interactively; do not hard-code it into scripts or commit evidence containing credentials. The live access audit uses invalid login payloads and creates ordinary failure logs; it is not a brute-force/load test.

```powershell
cd C:\PWA_OfflineRecordWebApp
node scripts/security/unauthenticated-access-audit.cjs
node scripts/check-security-headers.mjs --static-only
node --check scripts/security/unauthenticated-access-audit.cjs
cd C:\PWA_OfflineRecordWebApp\apps\web
..\api\node_modules\.bin\tsx.cmd --test tests/roleAccess.test.ts tests/authorityOfflineFallback.test.ts tests/auth-restoration-regression.test.ts tests/authProbeGateway.test.ts tests/manager-auth-lifecycle.test.ts
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --omit=dev --json
cd C:\PWA_OfflineRecordWebApp\apps\api
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --omit=dev --json
# Run focused new limiter/cookie tests and applicable existing auth/ownership integration suites.
# Start the disposable DB and explicitly override DATABASE_URL and SEED_INTEGRATION_DATABASE_URL first.
cd C:\PWA_OfflineRecordWebApp
git diff --check
git status --short
```

For the authorized live acceptance checkpoint:

```powershell
cd C:\PWA_OfflineRecordWebApp
$assessmentOrigin = Read-Host 'Authorized HTTPS application origin'
node scripts/security/unauthenticated-access-audit.cjs --url $assessmentOrigin --out docs/testing/SECURITY_ACCESS_RETEST.json
```

The audit script's exit code checks anonymous authentication rejection; **exit 0 is not full security sign-off**. Inspect transport, cookie, throttling, dependency and authenticated results separately. The coding agent must supply a complete, cold-start disposable DB command block for any integration tests it runs, rather than treating the comments above as an executable database test setup.

## Ready-to-copy implementation request

> Follow AGENTS.md and `.agents/skills/codex-task-brief/SKILL.md`. Implement Tasks 1–4 in `docs/testing/SECURITY_REMEDIATION_TASK_BRIEF.md`, using separate reviewable checkpoints. Task 2 explicitly permits package manifests and lockfiles for security dependency updates; patch the proxy trust dependency prerequisite before enabling client-IP limits. Preserve offline entry, sync/evidence behavior, historical templates and existing permissions. Do not change schema/migrations, Compose, Caddy, environment or production data without an explicit scope extension. Do not deploy, stage or mutate Git. Add focused tests, use disposable PostgreSQL only, run relevant checks and report each acceptance item with evidence. Record any unmet requirement or P0/P1 clearly; do not claim full security sign-off until Task 5's deployment and acceptance checks are complete.

## Completion report required from the coding agent

Provide files changed with reasons, chosen limiter thresholds and storage/proxy design, focused/regression test results, dependency before/after versions, remaining advisories and reachability, P0/P1/P2 findings, offline limitations, and a PASS/FAIL/NOT RUN table for each applicable acceptance item. Update HANDOVER.md and stop before staging. An open relevant P0/P1 prevents completion of that security checkpoint.
