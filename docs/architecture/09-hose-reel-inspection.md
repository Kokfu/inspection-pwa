# Hose Reel Inspection Vertical Slice

Phase 5A3 implements the first Master Service Report V1 inspection: Hose Reel System.

## Group and instance identity

One active Master-system inspection group exists for each `jobId + systemKey`. The group has stable server identity and contains stable form instances. Hose Reel uses one `primary` instance with repeatable internal location rows. Future systems may use multiple zone- or location-scoped form instances without becoming unrelated top-level inspections. Form-instance server IDs are distinct from stable client UUIDs; nullable future `zone_id` and `location_id` columns supplement the frozen snapshots.

## Offline record

`masterSystemInspections` is a dedicated Dexie v7 store. It has unique `clientUuid` and unique `jobSystemKey`. Draft creation freezes the job/customer/configuration/template identity, canonical Hose Reel definition, configured zones/locations, and the temporary independent Swing/Fixed rule. Existing Drafts always render from their stored snapshot.

Configured locations prepopulate rows once. Technician rows are inspection-only and never modify customer configuration or the job snapshot. Every repeatable row has a stable UUID separate from its display order. On sync, configured row provenance is rebuilt from the frozen server job snapshot; client-supplied nested zone/location objects are not authoritative.

## Submit and sync

Drafts may be incomplete. Local submission requires every fixed Good/Poor result, both required PSI measurements and results, and at least one complete location row. Remarks and drum-type selections remain optional.

Submit writes the inspection and `masterSystemInspection:create:<clientUuid>` outbox item in one IndexedDB transaction. Only exact `acceptedIds` or `duplicateIds` confirmations mark the record Synced.

The API rebuilds its canonical snapshot from the stored job snapshot and published Master V1 definition. It rejects unknown keys, invalid values, malformed PSI values, duplicate row UUIDs, incomplete submissions, incompatible job identity, and duplicate active job/system groups.

## Idempotency and attribution

The fingerprint is SHA-256 over a canonical JSON representation of client UUID, job/system identity, template/configuration identities, response payload, performed time, and original creator identity. It excludes local timestamps, outbox operation IDs, and other retry-transient values.

The same UUID and fingerprint is an idempotent duplicate. The same UUID with changed authoritative payload is `IDEMPOTENCY_CONFLICT`. A different UUID for an existing job/Hose Reel group is `ACTIVE_INSPECTION_EXISTS`.

The authenticated session user is always the authoritative syncing actor. The locally captured creator is stored separately as a clearly labelled `device_reported` snapshot, not as a verified server user attribution; the two identities may differ in this phase. Server acceptance time is server-generated; `performedAt` remains the business inspection timestamp.

## Definition-driven controls

Phase 5A4 keeps the Hose Reel form as a system-specific composition while resolving its repeated controls from the immutable published definition. `ResultSelector`, `MeasurementValueInput`, and `RemarksField` consume typed runtime metadata and contain no Hose Reel response schema logic.

Published MFE-FSSR V1 JSON remains unchanged. Its ordered `allowedValues` are resolved through an immutable V1 compatibility adapter:

* `good` is stored as the stable machine value and displayed as `Good`;
* `poor` is stored as the stable machine value and displayed as `Poor`;
* unanswered Draft results remain `null`;
* unknown V1 values fail closed.

The adapter also supplies the existing Phase 5A3 submission requiredness and protocol text limits without altering the published seed. New Draft snapshots freeze the resolved options, labels, measurement definitions and units, and remarks metadata beside the original published definition. Existing snapshots without resolved metadata are interpreted locally from their frozen V1 definition and are not rewritten merely by opening them. Old cached catalog data uses the same local fallback and therefore does not require an online refresh.

Local submission validates against the frozen snapshot controls. Server sync independently resolves controls from the authoritative published definition stored in PostgreSQL; client snapshot metadata is never server authority. Runtime display metadata is excluded from the established request fingerprint, so pre-5A4 Pending payloads retain their Phase 5A3 idempotency semantics.

Future result options require a new published template version and a version-specific compatibility rule or native explicit option metadata. MFE-FSSR V1 does not support N/A.
