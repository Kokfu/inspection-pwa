# Security and Access

## Production Gate

Public production deployment is prohibited until authentication and API security are implemented.

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

Phase 3 should add production-grade application authentication, password hashing, secure session/token handling, auth audit logs, and a clear offline-auth policy.

## Audit Requirements

Audit authentication events, sync writes, destructive operations, admin changes, backup/restore actions, and security-relevant failures.

## Operational Security

The client must maintain Windows updates, Docker Desktop updates, router/firewall settings, domain renewal, disk space, backup checks, and recovery tests. Docker Desktop licensing must be confirmed for the client environment.

