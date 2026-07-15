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
