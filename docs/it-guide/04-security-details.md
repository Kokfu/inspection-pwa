# 4. Security Details

| Area | How it is done |
|---|---|
| Transport | HTTPS ends at Cloudflare; the tunnel to the PC is encrypted and outbound-only (no router ports opened). HSTS is sent for the real hostname. |
| Network | Docker networks: `postgres` and `api` sit on an internal-only network; only `proxy` is reachable; `cloudflared` can reach only `proxy`. Port 5432 is never published. |
| Headers | Strict Content-Security-Policy (no inline or third-party scripts), `X-Frame-Options: DENY`, `nosniff`, a `Permissions-Policy` that allows only the camera. Defined in `infra/reverse-proxy/Caddyfile`. |
| Cloudflare settings | Rocket Loader, Auto Minify, Email Obfuscation and Web Analytics **off** for the hostname (the CSP blocks injected scripts); a cache rule bypasses `/sw.js`, `/index.html`, `/manifest.webmanifest` and `/api/*`. |
| Sessions | Random token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie; server-side sessions; lifetime `SESSION_DURATION_HOURS` (default 12); a password reset revokes all sessions. |
| Passwords | Argon2id; 12–1024 characters; sign-in cooldown after repeated failures. |
| Authorisation | Every API route requires a session and checks role and ownership on the server. Technicians can open only their own visits. |
| Audit | Account changes, approvals and corrections are written to `audit_events`. Accepted inspections cannot be deleted. |
| Secrets | `.env` (database password, tunnel token) and `runtime\operational\service-due-email.key` are outside Git. The Gmail app password is encrypted at rest with that key; restoring a database without its key means re-entering the Gmail app password. |
| Phones | Unsynced work and downloaded reference data sit in the browser's storage for the app's origin. A record is marked synced only when the server confirms its exact ID; replays are idempotent. |

## If a secret leaks

| Secret | Action |
|---|---|
| Tunnel token | Cloudflare Zero Trust → the tunnel → **Refresh token**; put the new token in `.env`; `docker compose --profile tunnel up -d cloudflared` |
| Manager password | Reset it (chapter 2.3) |
| Technician/Admin password | A Manager sets a new one in the app |
| Gmail app password | Revoke it in the Google account, create a new one, enter it in Settings → Email Reminders |
| Database password | The database is not reachable from outside; rotate it with the developer at the next visit |
