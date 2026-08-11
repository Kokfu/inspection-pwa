# Web Tests

Run these browser harnesses through the Vite development server:

- `automatic-sprinkler-concurrent-initialization.html`
- `automatic-sprinkler-photo-evidence.html`
- `auth-offline-restoration.html`
- `dexie-v8-v9-upgrade.html`
- `server-sprinkler-resolution.html`
- `dry-wet-riser-local-and-resolution.html`
- `dry-wet-riser-server-detail.html`
- `hydrant-accepted-detail.html`
- `hydrant-local-sync.html`
- `hose-reel-regression.html`
- `co2-concurrent-initialization.html`
- `server-summary-refresh-authority.html`

The photo harness covers local Blob processing, one-photo concurrency,
replacement identity, atomic submit/outbox creation, interrupted upload
recovery, ordered sync confirmation, local Blob retention, and
evidence-aware completion. It also verifies stale-tab Draft saves cannot
clear a frozen evidence manifest or downgrade a submitted lifecycle, failed
photo and no-photo corrections reuse their operation identities, and obsolete
camera initialization streams are stopped. The upgrade harness creates an
isolated v8 database and proves that Pending inspection/outbox data survives
the additive v9 upgrade.

The auth harness verifies safe identity persistence, transport-failure
restoration, definitive 401/403 logout, explicit logout, business-data
retention, and the RESTORING login gate. The server-resolution harness verifies
read-only exact-UUID resolution, no local record or Blob creation, server-first
Draft prevention, and cross-device progress precedence.

The Dry/Wet Riser harness verifies concurrent initialization, frozen-mode and
stale-write protection, configured-row provenance, atomic parent-outbox
creation, exact-UUID read-only resolution, no-Dexie/no-outbox writes, and
server/local progress precedence. Run it manually through Vite.

The Dry/Wet server-detail harness verifies strict canonical-response parsing,
read-only rendering, and that resolving/rendering a server record does not
create IndexedDB inspection or outbox records. Run it manually through Vite.

The Hose Reel harness verifies local-first initialization, configured-row
provenance, stale-write and outbox safety, offline-safe local Draft behavior,
and progress/server-resolution no-write precedence. Run it manually through Vite.

The CO2 harness verifies frozen configured-location initialization, independent
child Draft and outbox lifecycle, stale-write protection, configured provenance,
offline-safe local behavior, and child/parent progress precedence. It reports
each check independently in its visible result. Run it manually through Vite.

The server-summary refresh-authority harness verifies that a new manual refresh
immediately invalidates accepted Fire Alarm authority, continues onto a successor
token when the refreshed job context changes, and always settles on success,
failure, logout, auth replacement, or supersession. It also covers verified-user
identity replacement, late old-user summary/detail rejection, unchanged-identity
generation stability, and accepted absence resolving to Not Started.

The Hydrant local/sync harness verifies IndexedDB Draft persistence across a
database close/reopen, offline-safe Draft edits, configured and technician-row
identity retention, atomic Pending outbox creation, exact-ID sync confirmation,
and response retention after sync. Run it manually through Vite.

Production PWA, camera permission, physical camera, force-close, and real
offline checks remain manual because development-server behavior is not proof
of service-worker operation.
