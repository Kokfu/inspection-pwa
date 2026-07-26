# CO2 Multi-Instance Inspection

## Scope

Phase 5B1 implements the confirmed MFE-FSSR V1 CO2 Fire Extinguisher System
as one complete form per configured location. It does not add locations,
change customer configurations, generate PDFs, or implement another system.

## Runtime Compatibility

The published V1 definition remains unchanged. Runtime code recognizes only:

- template code `MFE-FSSR`;
- template version `1`;
- system key `co2_fire_extinguisher`;
- repetition mode `per_location`.

Unknown combinations fail closed.

## Parent and Child Identity

One parent group represents `jobId + co2_fire_extinguisher`. The frozen job
snapshot supplies the expected configured locations. Each child has a stable
device `clientUuid`, deterministic `location:<configured-location-uuid>`
instance key, separate server database ID, frozen provenance, and independent
lifecycle/outbox operation. Display names are not identity.

## Offline Initialization

The first CO2 open uses one IndexedDB transaction to create or resolve the
local group and one child per configured location. Reopening preserves UUIDs,
responses, and states. Opening creates no outbox item. A new child is Draft
with `startedAt = null`, displayed as Not Started; the first explicit save
sets `startedAt`.

## Response and Validation

The versioned response contains Control Panel Location, stable repeatable
detector rows, three definition-keyed Good/Poor checklist groups, and optional
comments. Detector values are `normal`, `test`, and `isolation`.

Draft saving is permissive. Submit requires Control Panel Location, one to
250 detector rows, Alarm Zone and Location per row, at least one Heat or Smoke
status per row, and every fixed Good/Poor result. Remarks and comments remain
optional. The editable panel response never changes configured provenance.

## Progress

Location progress is derived from `startedAt` and sync state. Parent progress
uses the frozen expected set with precedence: Needs Attention, Syncing,
Pending Sync, all Completed, In Progress, then Not Started. No parent progress
column is persisted.

## Server Authority

The server authenticates the actor, loads the open job, validates the exact
template/configuration and confirmed CO2 system, resolves the configured
location from the frozen job snapshot, and rebuilds canonical identity,
provenance, controls, and accepted snapshot. Client snapshots are not
authority.

Migration 006 already supports the generic parent/child structure. Migrations
001 through 006 remain immutable and Phase 5B1 adds no migration 007.

Each child is suitable for a later page-per-location PDF output. PDF
generation is outside this phase.
