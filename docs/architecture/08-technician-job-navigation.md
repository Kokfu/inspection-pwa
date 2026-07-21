# Technician Job Navigation

## Scope

Phase 5A2 adds technician job, system, zone, and location navigation. It does not add real system inspection forms, job editing, assignment, PDF output, photos, or signatures.

## Authentication States

The frontend distinguishes `checking`, `verified`, `offline-unverified`, and `unauthenticated`.

Only a successful login or `GET /api/auth/me` response establishes `verified`. IndexedDB stores only the last verified user ID, username, role, verification time, and an optional pending-logout marker. It never stores the HttpOnly cookie, raw session token, token hash, password, or another authentication secret.

If the server is unavailable, a cached identity permits `offline-unverified` access to that user's cached jobs and local data. It is a device-local continuity feature, not authentication proof. Reference refresh, job refresh, server listing, and sync require `verified`.

Authentication uses an operation generation plus a serialized server-auth request queue. Explicit login and logout increment the generation immediately; older reconciliation, login, refresh, and IndexedDB completion paths are ignored once a newer intent exists. A logout queued after a login request remains the final server request, so a late login response cannot leave a usable server session behind.

Startup loads a non-pending cached identity and that user's jobs immediately as `offline-unverified`, then probes `/auth/me` with a five-second timeout. Timeout, network failure, and 5xx retain the offline-unverified workspace. An explicit 401 clears the cached identity but never deletes Draft, Pending, Failed, outbox, reference, or job-cache data. Offline logout clears visible local identity immediately and records that server revocation remains pending. The next online authentication check completes logout before accepting `/auth/me`.

## Job Authority

Technician work is job-driven:

```text
Technician Home
-> inspection job
-> stored configuration snapshot
-> enabled systems
-> configured zones and locations
```

The job snapshot is the authority for that job. The active customer configuration and reference cache must never replace or silently update it.

Master V1 jobs use `master_template_version_id`; legacy Phase 4 jobs continue to use `template_id`. A database constraint requires exactly one valid job source. Master job customer, configuration revision, template identity, and snapshot are validated together and become immutable after insertion.

## Snapshot Shape

Each snapshot includes a schema version, sanitized customer identity, configuration revision identity, Master template identity/version, and ordered enabled systems. Each enabled system includes its stable key, display name, definition status, zones, locations, preset row count, and sanitized row-preset metadata.

FM200 cannot enter a snapshot through the confirmed-system configuration constraint. The technician UI also displays only confirmed snapshot systems.

## Offline Cache

Jobs are cached under a user-specific key. Login as another user reads only that user's key. A refresh fetches all required server data before one transaction replaces the current reference dataset and the current user's job entry. Failed refreshes leave prior cache data intact.

Cached data is not encrypted in Phase 5A2. Shared-device deployments must use separate Windows/browser profiles or another approved device-access policy when local metadata confidentiality requires it.

## Progress

System progress is derived from local inspection records by `jobId + systemKey`. No separate progress table exists. The latest matching record maps Draft, Pending, Syncing, Failed/Conflict, and Synced to the technician labels. With no matching record, the system is Not Started.

Legacy records without `systemKey` remain valid and do not contribute to Master job progress.

## Deferred Boundaries

Real assignment/ownership authorization, job creation, system forms, configuration editors, and approval workflows remain deferred. Database-level protection for published templates and configuration revisions is required before any configuration write API is introduced.

Master-job destructive-write protection is required before future job administration APIs. Phase 5A3 must formally enforce one active inspection per `jobId + systemKey`; that invariant will also resolve equal-timestamp progress selection for real system entry.
