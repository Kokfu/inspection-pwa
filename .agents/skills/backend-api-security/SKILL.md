# Backend API Security Skill

## Purpose

Use this skill whenever changing API routes, authentication, authorization, sessions, sync endpoints, upload endpoints, destructive actions, database access, CORS, public exposure, audit logs, secrets, or deployment security.

The backend API will eventually be reachable from the public internet through Caddy. It must be designed as a production API, not as a prototype.

## Core Rules

1. Do not expose the production API publicly before authentication is implemented.
2. PostgreSQL must never be exposed to the internet.
3. The API connects to PostgreSQL through the internal Docker network only.
4. No real secrets may be committed to Git.
5. `.env.example` may contain placeholders only.
6. Every write endpoint must validate input server-side.
7. Every sync write must be idempotent.
8. Destructive actions require authorization, confirmation, and audit logging.
9. Health endpoints must reveal minimal information.
10. CORS must not be left wide open in production.

## Authentication Requirements

Before production exposure, implement authentication for all API routes except narrow health checks.

Authentication design must define:

* login route;
* logout route;
* session or token storage;
* password hashing;
* password reset or admin reset policy;
* session expiry;
* offline behaviour after prior login;
* what happens when a technician is offline and the session is expired.

Passwords must be hashed using a modern password-hashing method.

Do not store plaintext passwords.

Do not log passwords, tokens, cookies, or authorization headers.

## Authorization Requirements

At minimum, design for these roles:

* `admin`
* `inspector`

Later roles may include:

* supervisor;
* reviewer;
* client manager.

Authorization must protect:

* user management;
* assignment management;
* inspection records;
* reports;
* exports;
* upload access;
* destructive actions;
* backup/restore operations where exposed;
* admin configuration.

## Sync Endpoint Rules

Sync endpoints must be safe for unstable mobile networks.

Required properties:

1. Client sends stable UUIDs or mutation IDs.
2. Server enforces uniqueness using database constraints.
3. Retrying the same operation must not create duplicate rows.
4. Server returns exact accepted IDs.
5. Server returns exact duplicate/idempotent-success IDs.
6. Server returns exact failed IDs with error codes.
7. Client must not mark all pending records synced after a generic HTTP 200.
8. Partial success must be supported.
9. Network timeout must be treated as unknown result; client should retry safely.
10. Server must validate ownership and permission for every synced entity.

Suggested response shape:

```json
{
  "acceptedIds": ["uuid-1"],
  "duplicateIds": ["uuid-2"],
  "failed": [
    {
      "id": "uuid-3",
      "code": "VALIDATION_ERROR",
      "message": "Required field is missing"
    }
  ]
}
```

## Input Validation

Validate every request body.

Validation must check:

* required fields;
* field types;
* string length;
* enum values;
* UUID format;
* timestamp format;
* file metadata;
* ownership and assignment access;
* maximum batch size;
* maximum upload size.

Reject unknown or unsafe fields where appropriate.

Do not trust client-side validation.

## Upload Security

For future photo/file upload routes:

1. Validate authentication.
2. Validate assignment/record ownership.
3. Validate file size.
4. Validate MIME type and extension.
5. Store files outside container filesystem using the approved uploads bind mount.
6. Generate safe server filenames.
7. Do not trust user-provided filenames as storage paths.
8. Prevent path traversal.
9. Store file metadata in PostgreSQL.
10. Use checksums where practical.
11. Make retries idempotent.

## CORS Rules

Development CORS may be limited to local origins.

Production CORS must be explicit.

Do not use unrestricted production CORS such as:

```ts
cors({ origin: "*" })
```

unless there is a documented and approved reason.

For same-origin deployment through Caddy, frontend and API should normally share the same origin:

```text
https://inspection.example.com
https://inspection.example.com/api
```

This reduces CORS complexity.

## Secrets Handling

Never commit:

* `.env`
* database passwords;
* API keys;
* JWT secrets;
* session secrets;
* private keys;
* certificates;
* tunnel tokens;
* public IPs;
* client production domains;
* client-specific credentials.

Use:

* `.env.example` for placeholders;
* local `.env` for development;
* documented client deployment secret setup;
* restricted file permissions where possible.

## Audit Logging

Audit logs are required for:

* login;
* logout;
* failed login;
* sync writes;
* upload writes;
* destructive actions;
* user/admin changes;
* permission changes;
* backup/restore operations;
* configuration changes where practical.

Audit logs should include:

* actor user ID where available;
* action;
* entity type;
* entity ID;
* timestamp;
* result;
* reason/error code where applicable;
* request correlation ID where available.

Do not log sensitive payloads unnecessarily.

## Health Checks

Health endpoints must be minimal.

Allowed:

* API process alive;
* database reachable;
* version/build identifier;
* timestamp.

Do not expose:

* database credentials;
* environment variables;
* stack traces;
* internal file paths;
* detailed server configuration;
* user data.

## Error Handling

Do not leak stack traces in production responses.

Return safe error codes and messages.

Log internal details server-side with appropriate protection.

Use request IDs or correlation IDs where practical.

## Database Security

Use parameterized queries or a safe query builder/ORM.

Do not concatenate untrusted input into SQL.

Use database constraints for:

* unique client UUIDs;
* unique mutation IDs;
* required foreign keys;
* valid statuses where practical.

Migrations must be reviewed before running against production data.

## Public Deployment Gate

Before enabling public domain/router forwarding:

* authentication implemented;
* authorization implemented;
* CORS production-safe;
* PostgreSQL not public;
* destructive endpoints protected;
* audit logging in place;
* backup and restore tested;
* HTTPS valid;
* health check safe;
* default/admin credentials changed;
* secrets stored outside Git;
* dependency vulnerabilities reviewed;
* Windows firewall/router exposure reviewed.

## Acceptance Tests

For backend/API security changes, test:

1. Unauthenticated request to protected route is rejected.
2. Authenticated request succeeds.
3. User cannot access another user’s unauthorized records.
4. Invalid sync payload is rejected.
5. Duplicate sync UUID does not create duplicate rows.
6. Partial sync success returns exact accepted and failed IDs.
7. Destructive action requires proper role.
8. PostgreSQL is not reachable from host/public network.
9. Health check reveals no secrets.
10. Production CORS is not wildcard unless explicitly approved.

