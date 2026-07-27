# Web Tests

Run these browser harnesses through the Vite development server:

- `automatic-sprinkler-concurrent-initialization.html`
- `automatic-sprinkler-photo-evidence.html`
- `auth-offline-restoration.html`
- `dexie-v8-v9-upgrade.html`
- `server-sprinkler-resolution.html`

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

Production PWA, camera permission, physical camera, force-close, and real
offline checks remain manual because development-server behavior is not proof
of service-worker operation.
