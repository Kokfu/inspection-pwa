# Security remediation implementation — Tasks 1–4

Updated: 2026-10-10, Asia/Kuala_Lumpur.

Coding checkpoint only. No deployment, production database access, real-account attempts or Git mutations. Task 5 remains owner work. Historical HTTPS evidence remains in the original assessment/brief; Always Use HTTPS and proxy configuration were not changed.

## Reviewable checkpoints and changed files

1. Dependency prerequisite: API `package.json` / `package-lock.json`, web `package-lock.json` — compatible patches, including proxy-addr before client-IP work. No forced major upgrade or audit suppression. Frontend updates stay within declared ranges; complete resolved version deltas are in [SECURITY_DEPENDENCY_VERSION_CHANGES.txt](SECURITY_DEPENDENCY_VERSION_CHANGES.txt).
2. Login and cookie boundary: `apps/api/src/auth/loginLimiter.ts` — durable atomic budgets; `routes/auth.ts` — strict input, generic credential errors, dummy verification, leases and 429; `auth/sessionTokens.ts` — allow session creation on the login transaction's client; `middleware/currentUser.ts` — targeted, bounded cookie parsing, duplicates fail closed and no-store; `apps/web/src/auth/authApi.ts` — useful cooldown message through the existing LoginForm error display.
3. Session/browser boundary: `middleware/requestSecurity.ts` and `server.ts` — browser write-origin/Fetch Metadata guard and private no-store on API responses; `routes/managerTechnicians.ts` — deactivation permanently revokes sessions atomically; login rechecks and share-locks the user after hashing so reset/deactivation cannot mint a stale session.
4. Proof and handover: `auth/loginSecurity.test.ts`, `routes/authSecurity.integration.test.ts`, `routes/technicianOwnership.integration.test.ts` (real hashed-token sessions instead of injected identity), `routes/managerTechnicians.integration.test.ts` (stronger permanent-revocation assertion), `apps/web/tests/login-cooldown.spec.ts`, `scripts/security/Test-SecurityRemediation.ps1`, this report, audit JSONs/version inventory and `HANDOVER.md`.

Other pre-existing work was preserved. No schema, migration, Dexie index/version, historical template, Compose, Caddy, .env, runtime/customer/job data file changes.

## Limiter design and thresholds

| Control | Initial limit | Reason |
| --- | --- | --- |
| Account | 8 failed or unfinished attempts in a rolling 600 seconds | Covers rotating peers and reserves before hashing; small typing-error allowance |
| Socket peer | 120 total admitted attempts / 600 seconds | Allows a shared office/gateway and bounds random usernames |
| All API workers combined | 300 admitted attempts / rolling 60 seconds | Global hash and audit-work budget |
| All API workers combined | 4 concurrent login leases | PostgreSQL session advisory locks bound expensive verification |
| Each process | 8 pending limiter connection acquisitions | Bounds local pool waiters; overload gets Retry-After: 1 |

A blocked request receives 429 LOGIN_COOLDOWN plus a positive integer Retry-After and retryAfterSeconds. Request-work contention returns 1 second; window limits return time until an entry expires (at most 600 seconds). Rejected requests add no state/audit rows and do not extend the window. No permanent automatic account lockout. Successful credentials below the limits remain usable; successes still consume peer/global work, but not the account failure budget. Failure responses do not disclose account existence/activity. Unknown/inactive accounts use one lazy dummy Argon2id hash, with verification inside the same lease budget.

**Storage:** reuse existing PostgreSQL `audit_events`, dedicated action `login_budget_v1`. The entity ID is SHA-256 of the existing case-sensitive trimmed username; reason is SHA-256 of the socket peer; result starts as failure, including an unfinished/crashed attempt. A success changes only its reservation to success and records the normal successful-login audit. No passwords, token/cookie values, arbitrary headers or raw supplied usernames are logged. Invalid payloads and denied budgets are not logged individually. These operational failure reservations expire after 10 minutes; they are not permanent incident history. Ordinary audit history is never pruned by this limiter.

Counting plus insertion runs in a PostgreSQL transaction under a dedicated advisory lock. Cleanup deletes only expired dedicated reservations and is coalesced to once per minute per process under normal operation; startup and database errors can trigger another cleanup. A denied admission commits completed cleanup without inserting a budget event. This removes repeated historical DELETE scans on every denied attempt. The monotonic in-memory timestamp schedules maintenance only; every authoritative count and reservation remains in PostgreSQL. Live rows remain bounded at 3,000; the extra minute of cleanup cadence gives a conservative bound of 3,300 live/residual rows under successful database operation. Idle expiry needs no timer and cleanup resumes on a subsequent request. Password work holds one of four database session locks, released on completion or connection loss. Durable reservations are shared by workers using the same PostgreSQL database. A lost worker conservatively consumes its reserved attempt until expiry. No new service or migration. Independent-pool coverage is separate from the new child-process termination/replacement test; neither is deployed API/PC restart acceptance.

**Trusted IP boundary:** Express proxy trust stays disabled. Only `request.socket.remoteAddress` is used; IPv4-mapped IPv6 is normalized. X-Forwarded-For, CF-Connecting-IP, X-Real-IP and identity/role headers are never trusted by the limiter. Caddy therefore counts as one shared peer. This deliberately conservative fallback is operationally more restrictive than per-browser IP limits. Source configuration shows Cloudflare → tunnel → Caddy → API, but the actual deployed forwarding values/direct-origin bypass were not inspected or assumed. Account/global controls remain authoritative even if a caller rotates peers. Before enabling finer per-client attribution, the owner must verify direct API isolation and the actual socket peer/Caddy/tunnel chain, make Caddy discard supplied forwarding identities and emit one authoritative client address, and configure only the exact verified proxy peers. Do not enable blanket `trust proxy=true`, a hop-count trust shortcut or a broad private subnet. Such infrastructure changes require the separate deployment scope.

Payloads must be exactly username/password strings, nonempty after username trimming, username <=128 characters before trim and password <=1024 characters. Username matching stays case-sensitive, consistent with existing creation/matching.

## Browser and session safety

Invalid session percent encoding, non-token shapes and duplicate session cookie names are anonymous: protected routes return 401 AUTH_REQUIRED. A malformed unrelated cookie is ignored. Session lookup continues to require the hashed token, active user, unexpired session and no revocation. No error stack is returned.

All production API responses pass through private, no-store cache protection. Browser writes with cross-site or same-site Fetch Metadata are rejected. An Origin, when present, must parse exactly, use HTTPS and match the incoming Host including its port. Published access and Secure session cookies already require HTTPS, so the external scheme is explicit even when TLS terminates before the internal HTTP API socket. Neither forwarding headers nor the internal socket determine that scheme. HTTP Origins are rejected even without Fetch Metadata or with a supplied same-origin value. Origin-less non-browser clients remain supported. This supplements HttpOnly/Secure/SameSite=Lax cookies and the JSON login boundary; CORS absence is not the CSRF defense. Reverse-proxy preservation of the incoming Host must be checked at owner deployment. No offline record, identity restoration, local draft, photo or sync path was changed.

## Dependencies and reachability

| Package | Before | After | Reachability / resolution |
| --- | --- | --- | --- |
| Express | 4.22.2 | 4.22.3 | API request routing/query parser; same major |
| body-parser | 1.20.6 | 1.20.8 | JSON parsing in API; qs transitive patched |
| proxy-addr | 2.0.7 | 2.0.8 | Express IP resolution; vulnerable subnet-trust path was not enabled; patched prerequisite |
| qs | 6.15.3 | 6.16.0 | API query parser; patched both advisories, no override remains |
| sharp | 0.35.4 | 0.35.5 | Photo normalization/logo/PDF image path; bundled libvips packages 1.3.3 → 1.3.4 |
| baseline-browser-mapping | 2.10.42 | 2.11.28 | Frontend build target data; patched |
| brace-expansion | 5.0.7 / 2.1.2 | 5.0.12 / 2.1.7 | Build glob expansion; patched |
| browserslist | 4.28.5 | 4.29.3 | Frontend build targeting; patched |
| fast-uri | 3.1.3 | 3.1.8 | Build JSON-schema validation; patched |
| nanoid | 3.3.15 | 3.3.20 | PostCSS build identifiers; patched |
| postcss / source-map-js | 8.5.16 / 1.2.1 | 8.5.29 / 1.2.2 | CSS/build source maps; patched |
| Vite / PWA plugin | 6.4.3 / 0.21.2 | 6.4.4 / 0.21.2 | Build/dev server; PWA plugin unchanged against current HEAD |
| React / React DOM | 19.2.7 / 19.2.7 | 19.3.0 / 19.3.0 | Browser runtime; within declared ranges, requires browser compatibility checks |
| Playwright | 1.62.1 | 1.64.0 | Test tooling; matching Chromium installed for local checks |
| Dexie | 4.4.4 | 4.4.6 | Browser runtime patch; no schema/version/index changes |

Before: API 1 critical, 1 high, 3 moderate (5 package entries); web 6 high, 1 moderate (7 entries). After: **0 advisories in each full and omit-dev audit**. Evidence: `SECURITY_{API,WEB}_AUDIT_{BEFORE,AFTER}.json` and `SECURITY_{API,WEB}_PRODUCTION_AUDIT_AFTER.json`. No remaining advisory is suppressed. Build dependencies declared under dependencies do not imply they execute on Caddy's public static server. Before advisories and affected ranges/URLs remain in the JSON; every finding was patched rather than deferred. Isolated clean npm ci succeeded for both lockfiles. Deprecation notices (e.g. crypto-js/jpeg-exif/glob) are not audit advisories; future maintenance remains appropriate.

Reviewed upstream sources: [proxy-addr maintainer advisory](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h), [sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), [qs maintainer advisory](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g). Local lockfiles do not update running containers; image/Linux native-library and deployed package verification is still owner work.

## Acceptance checklist

PASS means executed locally or verified in the stated source scope. NOT RUN is never a pass for deployed acceptance.

| Brief acceptance item | Status | Evidence / boundary |
| --- | --- | --- |
| Correct credentials below limit; failures create no sessions | PASS | authSecurity HTTP |
| Existing/nonexistent/inactive generic errors | PASS | authSecurity HTTP |
| Threshold and valid 429/Retry-After | PASS | authSecurity HTTP |
| Cooldown expiry/recovery | PASS | DB clock-aged disposable reservations, no long sleep |
| Atomic parallel counting | PASS | Concurrent leases across two independent pools |
| Supplied forwarding headers cannot evade limits | PASS | HTTP headers rotated + socket-peer unit check |
| Rotating peers cannot evade account control | PASS | Different peer keys, shared account budget |
| Random usernames/storage/hash/log bounds | PASS | Peer/global saturation, capped rows/four leases, no denied-event inserts |
| Restart/worker protection model | PASS | Shared pools plus actual child-process termination and replacement; deployed API/PC restart NOT RUN |
| Shared-network normal logins | PASS | Four roles/accounts from same peer |
| Browser cooldown and unchanged offline contract | PASS | Browser test plus authority/offline regression; physical phone NOT RUN |
| Advisory version/reachability/resolution evidence | PASS | Before/after JSON + table/inventory |
| Untriaged applicable critical/high findings | PASS | None in updated local audits |
| Clean lockfile installs | PASS | Fresh temporary npm ci for API/web; no existing node_modules reused |
| API/web typechecks/builds | PASS | Final checks below |
| Auth/image/thumbnail/logo/PDF regressions | PASS | Final checks below |
| Candidate installed security versions match | PASS | Committed f208352 Linux API image; see SECURITY_DEPLOYMENT_CHECKPOINT.md |
| Deployed installed versions match | NOT RUN | No production replacement performed |
| Missing/fake/expired/revoked sessions rejected | PASS | Real-cookie authSecurity HTTP |
| Invalid session percent encoding controlled | PASS | 401, not 500 |
| Broken unrelated cookie preserves valid session | PASS | Real-cookie HTTP |
| Duplicate cookie behavior fail closed | PASS | Both distinct and identical duplicate sessions rejected |
| Production errors contain no stack/secrets | PASS | Source error handler + controlled cookie response |
| Technician A/B ID substitution for jobs/accepted/evidence/reports | PASS | Ownership inventory now uses real session cookies |
| Forged role/user headers/cached identity cannot grant authority | PASS | Real-cookie forged headers + web authority tests; cached identity never supplies server role |
| Technician user/reset/configuration restrictions | PASS | Real-cookie HTTP plus existing role suites |
| Supervisor existing review policy | PASS | Existing supervisor route matrix unchanged |
| HttpOnly/Secure/SameSite cookies | PASS | HTTP Set-Cookie attributes (HTTPS/browser persistence acceptance NOT RUN) |
| Logout revokes; old-cookie replay fails | PASS | Real-cookie HTTP |
| Password reset/deactivation invalidate sessions | PASS | HTTP, permanent revocation assertion; no automatic role changes |
| Login races with reset/deactivation | PASS | Barrier-controlled HTTP tests cover mutation-first and login-first orderings; blocked user-row lock observed in PostgreSQL |
| Deactivation rollback preserves account/session | PASS | Disposable audit fault rolls back both writes; old cookie remains valid |
| Expired protected sessions; offline drafts intact | PASS | Protected API rejection + offline authority regressions; physical restart NOT RUN |
| Sensitive cache protection/account switching | PASS | private no-store + mounted lifecycle test; deployed cache behavior NOT RUN |
| Cross-origin/same-site writes protected | PASS | Origin and Fetch Metadata HTTP denials; same-origin remains supported |
| Historical immutability | PASS | No diff in historical/protected paths; historical matrix below |
| Static security headers | PASS | check-security-headers --static-only |
| git diff --check / stop before staging | PASS | Final working-tree check |
| HTTPS redirects preserved | PASS | Configuration unchanged; owner supplied targeted live results retained |
| Fresh-profile HTTPS/login/phone/offline/reconnect | NOT RUN | Owner Task 5 acceptance |
| Public-origin bypass/API and PostgreSQL isolation | NOT RUN | Owner hosting/firewall/tunnel checkpoint |
| Edge login rate-limit/accounts/password hygiene | NOT RUN | Owner Task 5 |

## Verification results and reproducible commands

The following paragraph records the original implementation run on 2026-10-09. The completed 2026-10-10 re-review runs and expanded test counts are recorded under Remaining findings and next checkpoint below.

Successful verification: API/web typechecks and production builds; historical matrix 20/20; V6 evidence 11/11; Wet Chemical definition 2/2; API cookie/config/V7/image/logo/PDF unit regressions 55/55; web role/authority/offline/V7 regressions 51/51; security HTTP 6/6; real-session ownership 46/46; supervisor 1/1; technician lifecycle 1/1; V6 acceptance 1/1; CO2 V7 4/4; Wet Chemical V7 2/2; Fire Alarm V7 4/4; V7 race 1/1; final report integration 1/1; V6 final-report integration 1/1; browser cooldown at 360/768/1280 and mounted authorization lifecycle 4/4 (the mounted harness covers 24 scenarios). No skips. All four full/production dependency audits have zero advisories. Static security headers pass. Browser assertions initially needed the existing role-selection step; the test was corrected and all original cooldown/usability assertions passed. Initial sandbox EACCES/EPERM, missing Chromium and a test-harness malformed-JSON classification failure were corrected and the affected checks rerun; none are counted as passes without a successful rerun. No validator/assertion was weakened. Full clean installs were independently run in unique temporary directories and removed after success. Raw local test logs under docs/testing/security-*.log are ignored by Git; final counts/results are recorded here. The cold DB setup and individual commands were executed; the combined convenience wrapper was syntax-checked, not rerun end-to-end as one invocation. The disposable container and temporary database-URL file were removed after verification.

Prerequisites: Docker Desktop, Node/npm, existing dependencies from reviewed lockfiles, free loopback port 55432, installed Chromium. Run only on a development machine. This script starts a unique disposable postgres:16-alpine container itself, explicitly replaces BOTH database URL variables regardless of inherited values, validates readiness, runs suites in separate processes, restores the prior environment and removes only the container it created. It never reads runtime database configuration.

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\web
npx.cmd playwright install chromium
if ($LASTEXITCODE -ne 0) { throw 'Chromium installation failed' }
cd C:\PWA_OfflineRecordWebApp
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/security/Test-SecurityRemediation.ps1
# For the disposable integration checkpoint alone:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/security/Test-SecurityRemediation.ps1 -IntegrationOnly
# For focused auth/origin/cleanup/race/worker proofs on a new disposable DB:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/security/Test-SecurityRemediation.ps1 -SecurityOnly
```

The script contains the full cold-start DB block and each verification command; do not run the two invocations concurrently. Clean-install reproduction, separately from tests:

```powershell
cd C:\PWA_OfflineRecordWebApp
$cleanRoot = Join-Path $env:TEMP ('security-clean-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $cleanRoot | Out-Null
try {
  foreach ($app in @('api','web')) {
    $target = Join-Path $cleanRoot $app
    New-Item -ItemType Directory -Path $target | Out-Null
    Copy-Item "apps/$app/package.json", "apps/$app/package-lock.json" -Destination $target
    npm.cmd ci --prefix $target
    if ($LASTEXITCODE -ne 0) { throw "Clean install failed: $app" }
  }
} finally {
  $resolved = [IO.Path]::GetFullPath($cleanRoot)
  if (!$resolved.StartsWith([IO.Path]::GetFullPath($env:TEMP) + [IO.Path]::DirectorySeparatorChar)) { throw 'Unexpected cleanup path' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
```

## Remaining findings and next checkpoint

Subsequent authorized Git/candidate checkpoint: the owner explicitly authorized committing and continuing. Security scope was committed as `f208352`; unrelated changes were excluded. Candidate image build/version/native checks now pass; see [SECURITY_DEPLOYMENT_CHECKPOINT.md](SECURITY_DEPLOYMENT_CHECKPOINT.md). Statements below about no Git mutation describe the preceding review/remediation phase. No production access or deployment has been performed in the subsequent phase either.

Review remediation on 2026-10-10: the new scheme-validation defect is corrected without proxy trust or infrastructure changes; login/reset/deactivation concurrency and rollback proofs were added; actual child-process termination/replacement now proves durable unfinished reservations and release of all four leases; historical DELETE cleanup is coalesced rather than repeated for every denied attempt. The PWA-plugin before-version was corrected against current HEAD, and React/React DOM runtime deltas are explicit. Re-review found no remaining actionable local P0/P1 defect or new defect in this security remediation. The individual historical-table cleanup cost remains a documented P2 deployment-capacity limitation.

Completed evidence: the full cold-start `Test-SecurityRemediation.ps1` invocation exited 0 and removed its own disposable container. API/web typechecks and builds passed; all four full/production-only audits reported zero advisories; historical 20/20, V6 evidence 11/11, Wet Chemical definition 2/2, API unit/report 57/57, security integration 10/10, ownership 46/46, supervisor 1/1, technician lifecycle 1/1, V6 acceptance 1/1, CO2 V7 4/4, Wet Chemical V7 2/2, Fire Alarm V7 4/4, V7 race 1/1, final report 1/1, V6 final report 1/1, web authority/offline 51/51, browser cooldown/mounted lifecycle 4/4 and static headers passed. The final standalone login-security units passed 5/5 (including the subsequently added rollback cleanup check); final API typecheck/build passed. The final cold-start `-SecurityOnly` invocation exited 0 with 10/10 after strengthening denied-request cleanup/history preservation and actual-worker crash tests, and removed its own disposable container. No skips or unresolved failing gates in these runs. PowerShell parser validation and `git diff --check` passed. Earlier verification counts above describe the original implementation run, not these expanded suites.

Verdicts: local P0 remaining 0; local P1 remaining 0 (deployed A-02 remains P1 pending owner deployment/acceptance); NEW DEFECTS identified after re-review: NO; HISTORICAL IMMUTABILITY INTACT: YES; SAFE FOR OWNER GIT CHECKPOINT: YES for the reviewed security files only; READY FOR OWNER DEPLOYMENT CHECKPOINT: NO; SECURITY SIGN-OFF: WITHHELD. Unrelated phone-proxy and attachment-reconciliation working-tree changes are preserved and excluded from this security verdict. No staging, Git mutation, production access or deployment was performed. Deployment, actual API/PC restart and phone acceptance remain NOT RUN. The next owner phase is Task 5: review edge controls, proxy/Host chain and direct-origin isolation, capacity and installed image/native-package evidence, then authorize deployment and purpose-created-account HTTPS/restart/physical-phone offline/reconnect acceptance. Cloudflare Always Use HTTPS remains enabled and unchanged.

Coding findings: **P0 remaining: 0; P1 remaining: 0** in the reviewed local implementation. **SAFE FOR OWNER CODE REVIEW: YES.** Production A-02 remains an operational P1 until deployment/acceptance; security sign-off and release acceptance are withheld. Owner Task 5/deployment checks are NOT RUN.

- P1 operational: A-02 remains open on the currently deployed API until owner rebuild/deployment and live controlled acceptance. Local code cannot close a deployed finding. HTTPS targeted checks remain owner-provided evidence; no live requests were made here.
- P2 operational: A-03 dependency findings on the previously assessed deployed packages remain open until the owner rebuilds and verifies running versions. All reviewed local packages are patched; no live/container version claim is made.
- P2: until the forwarding chain is verified, Caddy shares the 120/10-minute peer quota. Validate capacity with expected staff usage and the edge rate rule; do not trust supplied IP headers to solve this. Account-targeted abuse can cause temporary cooldowns; it cannot create a permanent lockout or extend cooldown through rejected requests.
- P2 capacity: dedicated failure-budget events expire at 10 minutes, and the existing audit table has no action-specific index. Cleanup now runs at most once per minute per process under normal operation rather than on every denied attempt. A large historical audit table can still make that individual scan expensive; deployment capacity remains unverified. Permanent aggregate failure history/index changes need separately reviewed scope; no migration was introduced.
- P2: database/worker contention deliberately fails closed; availability under volumetric traffic needs the owner's edge rule and deployment capacity checks. This is not a load benchmark.
- P2: deprecations/large frontend build chunk remain maintenance observations; no remaining current npm advisory.

Owner next: review the uncommitted checkpoints, add/verify edge login protection, verify Host/forwarding chain and origin isolation, review unused/shared accounts, rebuild candidate images with reviewed lockfiles, verify installed Linux/native/deployed versions, deploy through the existing HTTPS path, repeat anonymous and purpose-created-account acceptance and physical-phone offline/reconnect/force-close tests. Preserve Always Use HTTPS. No real customer fixtures or brute-force accounts. IndexedDB retains offline records by design; device security/encryption/unlock policy remains an owner/product decision.
