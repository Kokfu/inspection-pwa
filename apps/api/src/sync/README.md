# Sync API

Phase 2 will implement a minimal idempotent sync endpoint that confirms exact client-generated UUIDs.

Do not mark local records synced unless the API confirms the exact UUID.

`masterSystemInspection/create` dispatches by payload system key. Hose Reel
retains its existing validator. MFE-FSSR V1 Automatic Sprinkler uses a
separate strict single-instance validator and stores one `primary` child with
null zone/location provenance.

Phase 5C1 attachment bytes are excluded from this JSON endpoint. After the
parent form instance is accepted, the client uses authenticated multipart
`/inspection-attachments`. Attachment identity, policy validation,
fingerprinting, and file storage are independent of every inspection request
fingerprint.

The API image installs the exact `package-lock.json` with `npm ci` in build
and production stages so Sharp and its native dependency graph are
reproducible.
