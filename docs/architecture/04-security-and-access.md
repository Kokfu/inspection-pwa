# Security and Access

## Production Gate

Phase 3 adds the authentication and API security foundation, but public production deployment is still prohibited until the full deployment checklist is complete: real credentials outside Git, client domain/TLS validation, backups and restore testing, operating procedures, and maintenance ownership.

## Exposure Rules

- Caddy exposes only TCP 80 and 443.
- API is internal to Docker and reachable publicly only through authenticated `/api` routes via Caddy.
- PostgreSQL is internal-only and must never publish port 5432.
- Health checks must reveal minimal information.

## Secrets

Do not commit:

- `.env` files.
- Passwords.
- API keys.
- Tokens.
- Certificates.
- Private keys.
- Public IP addresses.
- Client-specific domains or settings.

Use `.env.example` placeholders only.

## Authentication Direction

Phase 3 uses simple production-capable username/password authentication:

- Passwords are hashed with Argon2id before storage.
- Raw passwords are never stored or logged.
- Sessions are opaque random tokens.
- Only the SHA-256 hash of each session token is stored in PostgreSQL.
- The raw session token is stored only in an HTTP-only cookie.
- The session cookie uses `Secure`, `SameSite=Lax`, and `Path=/`.
- The default session duration is 12 hours.

Authentication routes:

- `POST /auth/login` is public.
- `GET /auth/me` requires a valid session.
- `POST /auth/logout` requires a valid session and revokes it.
- `POST /sync` requires a valid session with the `admin` or `inspector` role.
- `GET /test-records` requires a valid session with the `admin` or `inspector` role.
- `GET /inspections` requires a valid session with the `admin` or `inspector` role.

The browser accesses these routes through Caddy as `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, `/api/sync`, `/api/test-records`, and `/api/inspections`.

The Phase 3.5 server-record listing returns a bounded, read-only generic record projection. It does not expose database IDs, user/session data, audit events, or internal timestamps.

## Users and Roles

The minimum user roles are:

- `admin`
- `inspector`

Initial admin users must be created by an operational command using environment variables supplied at runtime. There is no public bootstrap route and no committed default password.

Disabled users cannot authenticate and their existing sessions are ignored.

## Offline Auth Policy

Authentication controls server access. It must not block local offline data entry.

If the API is unavailable, the session expires, or the user is logged out:

- Existing local drafts and pending records remain visible on that device.
- Users can continue typing and saving local drafts or pending records.
- Server sync is blocked until a valid session is available again.
- Failed sync attempts stay local and retryable.

The frontend must not treat authentication failure as permission to delete local IndexedDB data.

## Audit Requirements

Audit authentication events, sync writes, destructive operations, admin changes, backup/restore actions, and security-relevant failures.

Phase 3 writes audit events for:

- login success;
- login failure;
- logout;
- sync write summaries.

## Operational Security

The client must maintain Windows updates, Docker Desktop updates, router/firewall settings, domain renewal, disk space, backup checks, and recovery tests. Docker Desktop licensing must be confirmed for the client environment.

## Security Checklist Results (2026-09-12)

Real point-by-point pass of the `backend-api-security` skill's Public Deployment Gate against
this repo's actual code and the live running stack — not a restatement of the sections above.
Every route file was read directly (not sampled), live requests were made against the running
Caddy-fronted API, and both `apps/api`/`apps/web` dependency trees were audited. One real
HIGH-severity dependency vulnerability was found and fixed as part of this pass; the rest is
verification.

| # | Gate item | Result | Evidence |
|---|---|---|---|
| 1 | Authentication implemented | **PASS** | `middleware/currentUser.ts` resolves a session from the `inspection_session` cookie (SHA-256 hash lookup against `user_sessions`, checking `revoked_at IS NULL`, `expires_at > now()`, `u.is_active = true`); `middleware/authRequired.ts` rejects with `401 AUTH_REQUIRED` when no session resolved. Passwords hashed with `argon2id` (`auth/passwords.ts`). Session tokens are 32 random bytes (`crypto.randomBytes`), stored only as a SHA-256 hash server-side, raw token only in an `httpOnly`+`secure`+`sameSite=lax` cookie (`auth/sessionTokens.ts`). Live-tested: `curl` to `/api/inspection-jobs`, `/api/sync`, `/api/manager/customers` with no cookie all return `401 {"error":"AUTH_REQUIRED",...}`. |
| 2 | Authorization implemented | **PASS** | Every route file under `apps/api/src/routes/` was read directly and every non-public route carries an explicit `requireRole("admin", ...)` or `requireAuthenticated` call — no route relies on a global gate. `requireRole` (`middleware/requireRole.ts`) returns `401` with no session, `403 FORBIDDEN` when the session's role isn't in the allowed set. Proven against real PostgreSQL: `managerCustomers.integration.test.ts` (re-run this pass, PASS) asserts `401` unauthenticated and `403` for an `inspector` session against every admin-only manager route, `200`/`201` for `admin`, and that an invalid create rolls back to zero rows (`SELECT count(*) ... = 0`). Unit-level role-matrix tests (`managerCustomers.test.ts`, `managerServiceVisits.test.ts`, 16 tests, re-run this pass, all PASS) assert the same without needing a DB. |
| 3 | CORS production-safe | **PASS** | No `cors` package or `Access-Control-*` header is set anywhere in `apps/api/src` (grepped the whole tree). Live-tested: `curl -H "Origin: https://evil-attacker.example.com"` against `/api/health` and an `OPTIONS` preflight against `/api/sync` both return zero `Access-Control-*` response headers — a real cross-origin browser request would be refused by the browser's own same-origin policy, since nothing ever grants it. This is the same-origin-through-Caddy pattern the skill recommends, achieved by omission rather than an explicit (and therefore misconfigurable) allow-list. |
| 4 | PostgreSQL not public | **PASS** | Re-confirmed live: `docker port inspection_pwa-postgres-1` returns nothing; `docker-compose.yml`'s `postgres` service has no `ports:` key and sits only on the `internal: true` network. Full detail already recorded in `06-deployment-runbook.md`'s Validation Checklist Results. |
| 5 | Destructive endpoints protected | **PASS** | Job-closing, configuration-revision, and sync-write routes all require `admin`/`inspector` roles (same route audit as #2); `managerCustomers.integration.test.ts` proves a rejected write produces zero rows, not a partial write. `routes/sync.ts` additionally enforces a 25-item batch cap and returns the skill's exact suggested `{acceptedIds, duplicateIds, failed}` shape. |
| 6 | Audit logging in place | **PASS, with one stale doc found** | `audit/auditLog.ts` (shared pool) and a transaction-scoped local `audit()` helper in `routes/managerCustomers.ts` (so the audit row commits or rolls back atomically with the change it records) both write to `audit_events`. Confirmed covered: login success/failure, logout, sync write summaries (`routes/auth.ts`, `routes/sync.ts`), and every manager customer/configuration write (`manager_customer_created`, `..._configuration_activated`, `..._label_overrides_updated`, `..._system_configuration_updated`, `..._evidence_policy_updated`, `..._locations_updated` — `routes/managerCustomers.ts:497-1026`). **Found stale:** `audit/README.md` still says "Future production phases must audit..." as if none of this were built yet — it substantially is. Not a security defect, but worth a documentation pass. Backup/restore operations are not audited because they are not exposed via any API route at all (PowerShell scripts run directly on the host) — the skill's "where exposed" qualifier applies; this is N/A, not a gap. |
| 7 | Backup and restore tested | **PASS** | Covered in full by the STEP 4.2 close-out work: real end-to-end drill against the runtime DB/uploads without touching either, plus six real defects found and fixed across two review rounds (filesystem-alias bypass, container-ID bypass, false-success reporting, null credentials, copy-failure data loss, hidden-file loss) — see `06-deployment-runbook.md`'s "Second review round" note and `HANDOVER.md`. |
| 8 | HTTPS valid | **PARTIAL — interim path proven, production path blocked on client infrastructure** | The Cloudflare quick-tunnel path (`scripts/Start-DevTunnel.ps1`) is verified end-to-end including a real `/api/auth/login` through it. The actual production HTTPS path (client domain + static public IP + router forwarding) cannot be verified because that infrastructure doesn't exist yet — same honest gap already tracked as STEP 4.1 in `HANDOVER.md`, not new to this pass. |
| 9 | Health check safe | **PASS** | `routes/health.ts` returns exactly `{status, service, phase}` — no DB credentials, env vars, stack traces, internal paths, or user data. Live-tested through Caddy: `200 {"status":"ok","service":"inspection-api","phase":"foundation"}`. Minor observation (not a gate failure, since the skill lists DB-reachability as *allowed*, not *required*): the check doesn't verify Postgres connectivity, so a downed database wouldn't be reflected here. |
| 10 | Default/admin credentials changed | **PASS by construction** | Grepped the full `apps/api/src` tree for the demo usernames named in this project's own standing docs (`mobiletest`, `technician-demo`) — zero matches anywhere in source. No default or seeded admin/demo credentials exist in committed code at all. `cli/createAdmin.ts` requires `ADMIN_USERNAME`/`ADMIN_PASSWORD` from the environment, enforces a 12-character minimum, and refuses to run without both — there is nothing to "change" because nothing is hardcoded. |
| 11 | Secrets stored outside Git | **PASS** | Re-confirmed: `.env` is git-ignored and untracked (`git check-ignore -v .env`, `git ls-files .env` empty). `.env.example` contains only placeholders (`replace-with-a-real-secret-outside-git`, `localhost`) — same file already reviewed for the STEP 4.2 close-out. No `console.log`/`console.error`/`console.warn` anywhere in `apps/api/src` references `password`, `token`, `cookie`, or `authorization` (grepped the whole tree, non-test files). |
| 12 | Dependency vulnerabilities reviewed | **PARTIAL — one real HIGH-severity issue found and fixed; one moderate issue found and deferred with a documented reason** | `npm audit` on `apps/api` found `sharp <0.35.4` (HIGH — libheif CVEs GHSA-rgj7-g3m4-5g8c) sitting directly in the untrusted-image-upload decode path (`attachments/attachmentStorage.ts`'s `normalizeAttachmentImage`, which real-decodes every uploaded photo). Fixed: bumped to `0.35.4` (already within the declared `^0.35.3` range — a lockfile-only update, `apps/api/package.json`/`package-lock.json`), re-ran `test:v6-evidence` (9/9 PASS, including the attachment-storage tests) to confirm no regression. Remaining: `qs`/`body-parser`/`express` (moderate, DoS-class) — `express@4.22.2` pins `body-parser` to `qs: ~6.15.1`, and the fixed `qs@6.16.0` is outside that range; the only real fix path is an Express 5 migration, which is out of scope for this pass and not attempted. `apps/web`'s `npm audit` findings (`postcss`/`nanoid`/`fast-uri`, high) were traced with `npm ls` to `vite`/`vite-plugin-pwa` only — both `devDependencies`, never shipped in the built `dist/` bundle or reachable by any user; not a real exposure, left as-is. |

**Additional finding, not on the gate checklist itself:** `config/env.ts` computes `authRequired`
and `allowPhase2UnauthenticatedSync` from `AUTH_REQUIRED`/`ALLOW_PHASE2_UNAUTHENTICATED_SYNC`, but
neither value is read anywhere else in the codebase (grepped `apps/api/src` for both identifiers).
This is not an exploitable gap — actual enforcement is 100% per-route `requireRole`/
`requireAuthenticated` middleware (confirmed above), so these two flags doing nothing does not
weaken anything. But `.env.example`'s comment on `ALLOW_PHASE2_UNAUTHENTICATED_SYNC` ("Keep false
for committed/default config. This bypass is ignored in production.") reads as though the flag is
a live, gated mechanism — it is dead code in every environment, not just production. Worth either
wiring it up or removing it so a future operator doesn't mistake it for a real control.

**Honesty note on scope:** items 1-7, 9, 10, and 11 are real PASSes with live evidence or direct
code inspection, not restatements of the sections above. Items 8 and 12 are honestly PARTIAL —
8 for the same client-infrastructure-dependent reason STEP 4.1 already carries in `HANDOVER.md`,
12 because one real vulnerability was fixed but one remains genuinely blocked upstream.
