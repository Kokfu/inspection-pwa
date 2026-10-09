# Security deployment preparation — 2026-10-10

Owner authorized a commit and continuation. Security remediation was committed as `f208352` on the existing branch. No push, branch change, production deployment, production request, account mutation, runtime mount or Cloudflare change was performed. Unrelated phone-proxy and attachment-reconciliation work remains outside this checkpoint. Always Use HTTPS is preserved.

## Candidate evidence

Candidates were built from a `git archive` of `f208352`, extracted into an ignored isolated build context. Existing Dockerfiles, Compose and Caddy were unchanged. Docker may reuse matching cached build layers; this is not a new no-cache install claim. Earlier independent clean-install evidence remains in the implementation report.

| Check | Result | Evidence |
|---|---|---|
| API Linux image build | PASS | `inspection-security-api:f208352` |
| Web/Caddy Linux image build | PASS | `inspection-security-proxy:f208352`; production PWA generated |
| API security package versions versus embedded lockfile | PASS | Express 4.22.3, proxy-addr 2.0.8, qs 6.16.0, body-parser 1.20.8, Sharp 0.35.5, Argon2 0.44.0, puppeteer-core 25.11.0 |
| Candidate production advisory audit | PASS | `npm audit --omit=dev`: zero vulnerabilities |
| Dependency tree | PASS | `npm ls --omit=dev --depth=0` exits 0; optional Sharp WASM/emnapi entries display as extraneous; no invalid/missing required package |
| Native Linux smoke | PASS | Correct/wrong Argon2 verification; Sharp PNG to resized JPEG; one-page PDF using compiled application renderer and Chromium 152.0.7977.82; image USER node |
| Candidate Caddy configuration | PASS | `caddy validate` with default localhost configuration; no server or published port |
| Candidate PWA assets | PASS | Nonempty index.html, sw.js and manifest.webmanifest |
| Placeholder Compose validation | PASS | `docker compose --env-file .env.example -f docker-compose.yml config --quiet` |
| Running production installed versions | NOT RUN | Candidate images were not substituted into the stack |
| Real forwarding/Host chain and direct-origin isolation | NOT RUN | Source-only inspection cannot prove Windows firewall/router/tunnel state |
| Deployed restart and physical-phone acceptance | NOT RUN | Child-worker proof and local browser tests are separate evidence |

API image ID: `sha256:bd264ca611dcbd6f229c3fa3de7756ea42c0239f3f24baa21ec24ce1e5616fdb`.
Web/Caddy image ID: `sha256:9d47deec8aa8bd2cfa883b2076cac191198934d82de1785ca083ef2cada768ae`.

Native smoke containers used `--rm --network none`, no ports/volumes, and a disposable unused database URL. The API server was never started and no database was contacted. Audit used registry access only. Caddy validation also used an ephemeral network-isolated container, overriding its entrypoint. No production volumes were mounted.

Initial attempts hit sandbox Git/Docker permissions and were retried with approved escalation. The first native smoke harness failed with `ERR_PACKAGE_PATH_NOT_EXPORTED` when resolving Sharp's package.json; direct filesystem version inspection corrected the harness and the complete smoke rerun passed. These failures are not counted as successful attempts. No skipped checks. Web build retains its large-chunk warning and npm glob deprecation warning; neither was suppressed.

## Commands executed

From the isolated committed source context:

```powershell
docker build --label security.review.commit=f208352 -t inspection-security-api:f208352 -f apps/api/Dockerfile .
docker build --label security.review.commit=f208352 -t inspection-security-proxy:f208352 -f infra/reverse-proxy/Dockerfile .
docker run --rm --entrypoint npm inspection-security-api:f208352 audit --omit=dev
docker run --rm --network none --entrypoint npm inspection-security-api:f208352 ls --omit=dev --depth=0
docker run --rm --network none --entrypoint caddy inspection-security-proxy:f208352 validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker run --rm --network none --entrypoint sh inspection-security-proxy:f208352 -c 'test -s /srv/image-release/index.html && test -s /srv/image-release/sw.js && test -s /srv/image-release/manifest.webmanifest'
docker run --rm --network none --entrypoint chromium inspection-security-api:f208352 --version
```

An inline Node smoke program was piped to `docker run --rm -i --network none -e DATABASE_URL=postgres://unused:unused@127.0.0.1:55432/unused --entrypoint node inspection-security-api:f208352 --input-type=module`. It compared installed package.json versions to the embedded lockfile, ran native hash/image assertions and called compiled `renderHtmlToPdf`/`closePdfEngine`, validating the resulting one-page PDF with pdf-lib. This is a compatibility smoke, not every photo/logo/report regression on Alpine.

## Required owner deployment acceptance

1. Confirm backup/restore evidence and rollback plan, with reviewed release assets retained. Identify exact approved image IDs; Compose source builds from a dirty checkout could include unrelated work, so do not rebuild that checkout for production without a separate review.
2. Verify real tunnel/Host/socket-peer chain, API/PostgreSQL isolation and direct-origin bypass controls. Proxy trust stays disabled. Caddy shares the 120 attempts per 10-minute peer quota; expected staff usage and historical audit cleanup capacity remain unverified.
3. Verify the Cloudflare login edge rule and account/password/device hygiene using owner administration. Preserve Always Use HTTPS. No rule thresholds or plan support are assumed verified.
4. Explicitly authorize the production deployment/testing scope and supply the HTTPS origin privately. Use purpose-created test accounts and records; never credential-guess or load-test real accounts.
5. Deploy only reviewed artifacts through the approved procedure, then verify installed versions, anonymous rejection, real-cookie permissions/revocation, origin/cache defenses, cooldown/recovery, and actual deployed restart persistence.
6. Perform fresh-profile HTTPS and physical-phone installed-PWA typing/local save, force-close/reopen, reconnect and exact-UUID idempotent synchronization acceptance. Device IndexedDB retention after logout is intentional; it is not centrally revoked offline storage.

Local code P0/P1: 0/0 identified. Deployed A-02 remains P1 until the new limiter is deployed and accepted; previously deployed dependency findings are not closed by candidate evidence. No new defect found in this candidate checkpoint. Historical immutability intact. Local candidate preparation is complete; production execution is pending owner scope/evidence. SECURITY SIGN-OFF: WITHHELD.
