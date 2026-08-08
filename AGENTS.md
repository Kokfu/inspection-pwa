# Inspection PWA — Agent Instructions

## Project Purpose

Build an offline-first field-inspection PWA hosted on the client's Windows
desktop PC through Docker Compose.

The client will own the production domain. External users will access the
system over HTTPS through the client's network and reverse proxy.

---

## Architecture

- Client Windows PC runs Docker Compose.
- PostgreSQL is the central production database.
- Central production data remains on the client PC.
- Uploaded files/photos must persist outside container lifecycle.
- Phone/browser local business data is stored in IndexedDB.
- Service Worker Cache Storage is for app-shell/static assets only.
- IndexedDB is used for drafts, business records, sync queue items, offline
  reference data, and attachment Blobs where applicable.

---

## Project Skills

Read only the skills applicable to the task before modifying related code.

- `.agents/skills/offline-first-pwa/SKILL.md`
  - Offline behavior
  - PWA lifecycle
  - Cache
  - Offline editing and recovery

- `.agents/skills/indexeddb-data-model/SKILL.md`
  - Dexie
  - IndexedDB records
  - Transactions
  - Local persistence
  - Schema decisions

- `.agents/skills/sync-engine/SKILL.md`
  - Outbox
  - Pending / Syncing / Synced / Failed / Conflict
  - Retry
  - Idempotency

- `.agents/skills/backend-api-security/SKILL.md`
  - API routes
  - Authentication / authorization
  - Server authority
  - Validation

- `.agents/skills/pwa-release-testing/SKILL.md`
  - Browser harnesses
  - Regression testing
  - Offline acceptance
  - Release gates

- `.agents/skills/on-premise-windows-deployment/SKILL.md`
  - Docker
  - Caddy
  - Windows deployment
  - Customer-PC deployment

For cross-cutting tasks, load all relevant skills.

Do not load unrelated skills merely because they exist.

---

## Git Ownership

The user handles Git manually.

Never:

- stage files
- commit
- push
- merge
- rebase
- squash
- tag
- reset
- restore
- switch branches
- alter/apply/pop/drop stash entries

Stop before staging.

Do not perform Git history changes unless the user explicitly overrides this
rule.

---

## Protected Scope

Do not modify unless the task explicitly requires it:

- PostgreSQL schema/migrations
- Dexie schema/version/indexes
- package-lock files
- Docker Compose
- Caddy
- `.env`
- runtime directories
- `client-material/`
- production customer/job data
- production domains or IP configuration

Do not introduce a migration merely to simplify an implementation.

---

## Offline Contract

Offline limits synchronization, not data entry.

Never disable because the internet is unavailable:

- form inputs
- local draft save
- camera capture
- local business-record creation

Requirements:

- Store local business data in IndexedDB before synchronization.
- Use stable client-generated UUIDs from `crypto.randomUUID()`.
- Unsynced records must survive refresh, restart, PWA force-close, network
  failure, and API failure.
- Mark a record Synced only when the server confirms that exact UUID.
- API writes must be idempotent and safe to retry.
- Do not infer success from HTTP 200 alone.

---

## Server Authority and Safety

- PostgreSQL/server-owned configuration is authoritative for accepted records.
- Do not trust client snapshots as server authority.
- Fail closed on malformed server or client data.
- Authentication is required for backend production routes.
- Do not silently accept unknown keys, identities, enum values, or malformed
  timestamps where strict validation is expected.
- Never weaken an existing validator/test merely to make it pass.
- Do not silently fall back to stale accepted data after a failed or malformed
  authoritative refresh.
- Existing-system behavior must remain unchanged unless the task explicitly
  changes it.

---

## Development Workflow

For implementation tasks:

1. Inspect the existing implementation first.
2. Read applicable project skills.
3. Reuse a proven existing pattern where appropriate.
4. Make the smallest system-specific change.
5. Avoid unrelated refactoring.
6. Add focused regression coverage for the changed behavior.
7. Run relevant tests/typechecks.
8. Run `git diff --check`.
9. Report:
   - files changed
   - behavior changed
   - tests run
   - P0/P1/P2 findings
   - limitations
   - readiness for the next checkpoint
10. Stop before staging.

---

## Verification Levels

Do not run every release test for every small change.

### Level 1 — Normal code change

Run:

- focused tests
- relevant regression tests
- typecheck
- build when relevant
- `git diff --check`

### Level 2 — High-risk sync/auth/data-integrity change

Also verify relevant:

- idempotency
- stale callers
- concurrency
- transaction rollback
- authentication
- exact UUID confirmation
- server authority
- existing-system regressions

### Level 3 — Release / deployment / final acceptance

Only at an explicit release/acceptance checkpoint, additionally verify:

- Docker Compose build/start
- API health
- PostgreSQL/container restart persistence
- production PWA build
- real offline typing/local save
- browser/PWA force-close and reopen
- reconnect and idempotent sync
- physical phone where required
- HTTPS/deployment behavior where required

Do not claim a real browser restart, PWA force-close, phone test, or offline
test unless it was actually performed.

---

## Secrets and Production Data

Never commit:

- `.env`
- passwords
- API keys
- tokens
- certificates
- private keys
- public production IPs
- client-specific production configuration

Use `.env.example` only for placeholders.

---

## Completion Standard

A task is not complete if there is an open P0 or P1 relevant to its scope.

P2 findings may be deferred only when:

- they are explicitly documented;
- they do not violate the current checkpoint gate;
- the next acceptance/release phase owns them.

Stop before staging and let the user perform Git operations manually.