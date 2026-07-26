# Sync API

Phase 2 will implement a minimal idempotent sync endpoint that confirms exact client-generated UUIDs.

Do not mark local records synced unless the API confirms the exact UUID.

`masterSystemInspection/create` dispatches by payload system key. Hose Reel
retains its existing validator. MFE-FSSR V1 Automatic Sprinkler uses a
separate strict single-instance validator and stores one `primary` child with
null zone/location provenance.
