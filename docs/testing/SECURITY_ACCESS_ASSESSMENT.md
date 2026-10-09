# Unauthenticated access security assessment

Assessed: 2026-10-09, Asia/Kuala_Lumpur. Target: the owner-supplied public application origin (hostname intentionally omitted from repository artifacts).

**Verdict: no anonymous business-data access or successful login bypass was observed; security sign-off is NOT granted. P0 remaining: 0 identified. P1 remaining: 2. P2 findings: 2.** These counts describe this bounded assessment, not a guarantee that other vulnerabilities do not exist. No security remediation was applied.

## Scope and evidence

Source-assisted, non-destructive checks of authentication, public GET routes, representative protected writes, photos, reports, deployment ports, HTTP/HTTPS, cookies, cross-origin responses and dependency advisories. No valid credentials, password guessing against real accounts, business payloads, database changes, denial-of-service exploits or production restarts were used. Invalid login requests can create normal failure audit entries and proxy logs.

- `SECURITY_ACCESS_EVIDENCE.json`: 91 automated requests, plus one supplemental HTTP login request. Includes 62 protected GET route patterns, eight empty protected writes, and three forged-session/identity/cross-origin probes. All **73/73** of those protected checks returned **401 AUTH_REQUIRED**, without business response fields or new cookies.
- Static inventory: **113** route declarations; **111** have recognized authentication/role guards as their first route middleware. Two intended public routes: health and login. Middleware aliases were inspected manually. This inventory is not an automated proof of every authorization predicate or every possible URL.
- `SECURITY_API_DEPENDENCIES.json` and `SECURITY_WEB_DEPENDENCIES.json`: read-only npm production dependency audits. Vulnerability counts are package entries, not unique independently exploitable defects.
- Running local production containers: API exposes container port 3000 only; PostgreSQL exposes container port 5432 only; neither publishes a host port. Proxy publishes 80/443. This does not prove router, Windows firewall or every Cloudflare tunnel rule is correctly configured.

Detail requests used a deliberately nonexistent UUID. They verify authentication rejects before record lookup; they do not test authorization between two signed-in users against actual records. Source and live deployment can differ; the deployed frontend asset and selected deployed API dependency versions were checked, but API source commit identity was not verified.

## Findings

### A-01 — P1: HTTP serves the application and processes login requests

**Confirmed live.** `GET /` over HTTP returned 200 with the app shell, without an HTTPS redirect. `POST /api/auth/login` over HTTP with `{}` returned **400 INVALID_LOGIN**, without a redirect, at 2026-10-09 15:02:55 UTC. The latter proves the HTTP request reached login validation. No real password was sent.

An initial visitor who enters the HTTP address can receive a login form over an unencrypted connection; same-origin relative login requests then use HTTP. A network attacker can observe a submitted password or replace the delivered app. Secure cookies prevent ordinary HTTP cookie submission, but do not encrypt a login request body. HSTS observed on HTTPS helps browsers that already learned it; an HSTS header sent over HTTP provides no first-visit protection.

**Required correction:** enforce HTTP-to-HTTPS redirects at the public Cloudflare edge for every app path before serving the app, and prevent HTTP API requests from reaching credential processing. Review tunnel/reverse-proxy scheme handling. Keep Secure cookies and HSTS. Verify HTTP in a fresh browser profile, without relying on remembered HSTS. Redirecting an already-sent POST cannot retroactively protect its original body.

**Closure gate:** public HTTP app GETs redirect to HTTPS before returning HTML; empty HTTP login requests redirect or are rejected before application login validation; HTTPS authentication and the PWA continue working.

### A-02 — P1: no application-level login abuse controls

**Confirmed in source; edge mitigation unverified.** `apps/api/src/routes/auth.ts:19` accepts login attempts without an application limiter, attempt counter, backoff or lockout. `apps/api/src/server.ts:33` onward registers no rate-limit middleware; the repository Caddy configuration adds none. A few invalid live requests returned ordinary 400/401 responses. No high-volume test was conducted; those requests alone cannot prove that Cloudflare has no rate-limit rule.

An attacker can repeatedly test stolen/guessed passwords unless a separately configured edge control intervenes. Existing-account attempts also perform an expensive Argon2 verification. No password was cracked and no account takeover was demonstrated.

**Required correction:** bounded login attempts by account and trusted client IP, progressive cooldown with 429/Retry-After, and protection against distributed attempts and denial of service through deliberate account lockout. Add Cloudflare edge protection as an additional layer. Establish the trusted proxy boundary before relying on forwarded IP headers; currently Express does not configure `trust proxy`. Do not trust arbitrary client-supplied identity/IP headers. Verify that demo/default credentials are absent or rotated through the operator's account administration process.

**Closure gate:** disposable tests prove cooldowns, recovery, generic invalid-credential responses, and inability to bypass throttling with forged forwarding headers; operator verifies relevant Cloudflare rules. This finding remains open pending implementation or verified effective controls.

### A-03 — P2: deployed dependency advisories require patching and reachability review

API audit: **one critical, one high, three moderate package entries**. Running API container versions: Express 4.22.2, qs 6.15.3, proxy-addr 2.0.7, sharp 0.35.4. These versions match the flagged local versions.

- [proxy-addr advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h): patched in 2.0.8. The critical advisory depends on particular trusted-proxy subnet configurations. Reviewed server code does not set `trust proxy` and authenticates through database sessions rather than IPs; a critical login bypass is **not demonstrated** here. Upgrade before introducing IP-based protection.
- [sharp/librsvg advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w): audit flags sharp below 0.35.5. Running sharp contains librsvg. Photo and logo routes require authentication and validate image formats. Malicious decoder inputs were not submitted; authenticated image-processing reachability still needs review. Format checks after decoder metadata processing should not be treated as proof of safety.
- `qs` also has denial-of-service advisories. Reachability and impact were not exploited against production.

Web audit: **six high and one moderate package entries**, including build tooling declared as production dependencies. The proxy image serves compiled static assets, not a running Vite/npm server, so this count must not be represented as seven public-server exploits.

**Action:** review and update the affected dependencies in a separate explicitly scoped task (package locks are protected); run authentication, upload, PDF and build regressions, rebuild deployed images, and repeat the audits. This follow-up belongs to the next security remediation checkpoint. P2 does not imply a completed dependency release gate.

### A-04 — P2: malformed cookies trigger an unauthenticated 500

**Confirmed live and in source.** A request to `/api/manager/customers` with `Cookie: inspection_session=%ZZ` returns **500 INTERNAL_SERVER_ERROR**. `apps/api/src/middleware/currentUser.ts:15` uses unguarded `decodeURIComponent`, which throws on invalid encoding. No stack trace or business data was returned, and the request did not authenticate.

**Action:** parse cookie encodings defensively and return a controlled unauthenticated/bad-request response. Add regression coverage for malformed cookie values and ensure a broken unrelated cookie does not turn every API request into a server error. This is deferred to the next security remediation checkpoint; it did not defeat this assessment's access-control gate.

## Passing checks and important boundaries

- Unauthenticated customers, jobs, inspection summaries/details, manager configuration, report/PDF and photo/evidence endpoints reject requests in the tested route inventory. Eight representative write routes reject empty unauthenticated requests.
- Fake session token and client-supplied admin/user headers do not grant access. Login SQL uses a parameterized username; a small SQL-looking invalid login probe was rejected. This is not a comprehensive SQL injection assessment.
- TLS certificate validation succeeded through curl without disabling certificate checks. HTTPS responses include enforced CSP, HSTS, frame denial, nosniff, referrer and permissions policies. Cloudflare identifies itself in its Server header; this is not an origin server information leak.
- Cross-origin GET/preflight responses do not grant Access-Control-Allow-Origin or credentials. OPTIONS returning 200 is not permission to read business data. Authenticated CSRF and same-site/subdomain attacks were not exercised.
- Requests for `.env`, `.git/config`, Compose and `/uploads/` returned the same public app shell, rather than those files. The referenced JavaScript source map returned 404. These probes do not constitute a comprehensive secret scan.
- Source uses Argon2id passwords and random 256-bit session tokens, storing token hashes. Session queries require unexpired, unrevoked sessions and active users. Cookie flags in source are HttpOnly, Secure and SameSite=Lax. A successful live login/cookie capture, logout revocation and session-expiry test were **not** performed.
- PWA service-worker configuration excludes API navigation and has no runtime business-data cache. IndexedDB deliberately retains local records after logout. A person with access to an unlocked device/browser profile can inspect cached local data; remote account authentication does not encrypt or remove that data. This is an offline design boundary, not a confirmed remote login bypass. Use device locks and dedicated browser profiles; stronger local encryption/unlock policy needs a separate product decision.

## Verification / Definition of Done

| Item | Result |
| --- | --- |
| Route inventory and first authentication guard review | PASS: 111 protected / 113 declarations |
| Live anonymous protected access | PASS: 73/73 returned 401 AUTH_REQUIRED |
| HTTPS certificate and core response security headers | PASS; HTTP enforcement fails separately |
| HTTP login transport | FAIL: P1 A-01 |
| Login abuse controls | FAIL in application; edge verification outstanding: P1 A-02 |
| Dependency audit | FAIL: advisories documented; exploitability qualified |
| Selected deployed API dependency versions | PASS: runtime versions confirmed |
| API/PostgreSQL host ports | PASS: no Docker host mappings observed |
| Existing role/auth/offline authority regression tests | PASS: 50/50, no skips |
| Caddy static security-header regression | PASS |
| Assessment script syntax and git diff whitespace | PASS |
| Product typecheck/build, V7/history and disposable DB integration gates | NOT RUN: no product implementation changed; not a release acceptance checkpoint |
| Signed-in cross-account access, revocation/expiry, default credential rotation | NOT VERIFIED |
| Real browser/phone/PWA force-close/offline/installed-device checks | NOT RUN |
| Full internet port scan, Cloudflare account/rules and router/firewall review | NOT RUN |
| Production remediation / security release sign-off | NOT READY: two open P1 findings |

Historical templates, schema/migrations, package locks, Compose, Caddy, environment, runtime and customer data were not edited by this assessment. Other work in the shared checkout is outside this report; a baseline historical hash comparison was not run. Git status at the final check is recorded in the task output. No staging or other Git mutation occurred.

## Reproduction

Run in PowerShell. Supply the authorized origin interactively so production hostnames do not enter repository files. Curl defaults to checking TLS certificates; the harness never disables this.

```powershell
cd C:\PWA_OfflineRecordWebApp
$assessmentOrigin = Read-Host 'Authorized HTTPS application origin'
node scripts/security/unauthenticated-access-audit.cjs --url $assessmentOrigin --out docs/testing/SECURITY_ACCESS_EVIDENCE.json
# Exit 0 means protected probes rejected correctly, NOT that all security findings passed.
node scripts/check-security-headers.mjs --static-only
node --check scripts/security/unauthenticated-access-audit.cjs
cd C:\PWA_OfflineRecordWebApp\apps\web
..\api\node_modules\.bin\tsx.cmd --test tests/roleAccess.test.ts tests/authorityOfflineFallback.test.ts tests/auth-restoration-regression.test.ts tests/authProbeGateway.test.ts tests/manager-auth-lifecycle.test.ts
cd C:\PWA_OfflineRecordWebApp\apps\api
npm.cmd audit --omit=dev --json
cd C:\PWA_OfflineRecordWebApp\apps\web
npm.cmd audit --omit=dev --json
cd C:\PWA_OfflineRecordWebApp
git diff --check
git status --short
```

Changed files: this assessment report (findings and gates), three JSON evidence files (redacted access results and dependency audits), `scripts/security/unauthenticated-access-audit.cjs` (reproducible probes), and `HANDOVER.md` (checkpoint link). No product behavior changed. Next checkpoint: remediate A-01/A-02, patch/triage A-03, handle A-04, then repeat access testing and use dedicated test accounts for authenticated authorization and session lifecycle testing.
