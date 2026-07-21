# Master Service Report V1

## Status and Authority

`MFE-FSSR` version 1 is the single fixed initial Master Service Report definition. Its sanitized, typed development source of truth is `apps/api/src/inspections/templates/masterServiceReportV1.ts`.

Published template versions are immutable. A wording, structure, response-type, unit, validation, or report-layout change requires a new template version. Customer system, zone, or location changes require a new customer configuration revision. Jobs and inspections retain snapshots of the versions used when they were created.

Completed customer reports are configuration and usage examples. They are not separate templates and their names, contacts, values, signatures, and other report-specific data must not enter tracked definitions or seed data.

## Fixed Catalog

| Order | Stable key | Display name | Definition status |
| --- | --- | --- | --- |
| 1 | `automatic_sprinkler` | Automatic Sprinkler System | Confirmed |
| 2 | `dry_wet_riser` | Dry / Wet Riser System | Confirmed |
| 3 | `hose_reel` | Hose Reel System | Confirmed |
| 4 | `co2_fire_extinguisher` | CO2 Fire Extinguisher System | Confirmed |
| 5 | `fire_alarm_detector` | Fire Alarm / Detector System | Confirmed |
| 6 | `wet_chemical` | Wet Chemical System | Confirmed with noted wording questions |
| 7 | `hydrant` | Hydrant System | Confirmed |
| 8 | `fm200` | FM 200 System | Requires confirmation and cannot be enabled |
| 9 | `portable_fire_extinguisher` | Portable Fire Extinguisher | Confirmed |

Smoke Ventilation, Fire Intercom, and Fire Rated Roller Shutter are explicitly outside this catalog. Adding any of them requires a later catalog-extension decision and a new template version.

## Header Definition

The fixed header defines customer, service date, telephone, contact, service call number, arrival, departure, applicable systems, description, completion status, service technician, technician confirmation date, and customer confirmation. Technician signature and customer signature/stamp are future placeholders only; Phase 5A1 does not capture images or signatures.

Legal conditions, result legend, and report footer identity are template-owned metadata. They are not editable inspection transaction fields.

## System Structure

The schema intentionally supports only five structural blocks: checklist, measurement, repeatable table, quantity summary, and comments. A measurement row preserves one or more numeric values with their units plus the row's Good/Poor result and optional remarks. This keeps combined source rows such as Jockey Pump Cut In/Cut Out together without inventing separate result marks.

- Automatic Sprinkler: Water Tank, Pump House, Main Alarm Valve, PSI measurements, comments.
- Dry/Wet Riser: mode, Water Tank, Pump House, repeatable Riser Outlet rows, comments.
- Hose Reel: Water Tank, Pump House, drum type, repeatable Hose Reel Drum/location rows, comments.
- CO2: control-panel location, repeatable zone/location detector rows, charger/battery, physical outlook, function checks, comments.
- Fire Alarm/Detector: control-panel location, repeatable device rows, charger/battery, function checks, repeatable alarm-device rows, comments.
- Wet Chemical: control-panel location, repeatable detector rows, charger/battery, physical outlook, function checks, comments.
- Hydrant: hydrant type, repeatable Hydrant Set/location rows, comments.
- Portable Fire Extinguisher: total, 9KG Dry Powder, 2KG CO2, Others, comments.
- FM200: catalog identity only; no checklist is defined.

Good/Poor and Normal/Test/Isolation are stored as explicit response values rather than handwritten symbols. Per-row asset references may contain ranges and do not imply that one row always represents one physical asset.

## Client Configuration

The relationship is:

`Customer -> Configuration Revision -> Enabled System -> Optional Zone -> Location / Preset Row`

Enabled systems reference the fixed catalog for the selected template version. PostgreSQL rejects enabling systems whose definition status is not `confirmed`, which blocks FM200 independently of API behavior. The technician selection policy is `preset_only`; Phase 5A1 does not allow technicians to add systems.

Locations carry stable keys, display order, an optional zone, a positive preset row count, and sanitized row preset metadata. The two tracked demo customers contain no real customer information and exist only to prove single-zone and multi-zone configuration shapes.

Inspection jobs retain the legacy Phase 4 template path while Master V1 jobs use a separately constrained Master template identity. Each Master V1 job writes the full enabled-system/zone/location snapshot when created, and PostgreSQL prevents that stored configuration identity or snapshot from being changed later.

## Offline Reference Cache

Dexie schema version 5 adds `referenceData` without upgrading, deleting, or rewriting existing records or outbox items. The catalog, active customers, and active configurations are fetched with authenticated same-origin requests. After every response succeeds, one IndexedDB transaction removes obsolete keys only from the managed catalog/customer/configuration namespaces and writes the complete replacement dataset.

A failed refresh leaves the previous cache untouched and never blocks local Draft entry. Logout does not erase cached reference data or local inspections. The cache is reference data only; business records remain in `inspectionRecords` and retryable writes remain in `syncOutbox`.

## Read API Boundary

Authenticated `admin` and `inspector` sessions may read:

- `GET /api/inspection-catalog`
- `GET /api/customers`
- `GET /api/customers/:id/configuration`

No configuration write endpoint or template editor exists in Phase 5A1. Responses exclude credentials, sessions, audit records, completed client reports, and private source documents.

## Unresolved Source Questions

- The detailed FM200 form is unavailable: `FM200_TEMPLATE_REQUIRES_CONFIRMATION`.
- Wet Chemical repeats the label Heat Detector and shows unlabeled dual charger/battery result marks.
- Confirm whether Dry/Wet Riser modes, Hose Reel drum types, and Hydrant types are mutually exclusive.
- Confirm the source wording `Crandle` and the abbreviation `SPKA`.
- Confirm whether Portable Fire Extinguisher `Others` needs separate description and quantity fields.
- Good/Poor is authoritative for V1; repaired and not-applicable result semantics require a later business decision.

## Future Boundaries

An admin editor may later create draft template versions and customer configuration revisions. It must never mutate published templates, active historical revisions, job snapshots, or inspection snapshots.

Database-level protection against updating or deleting published template definitions and published configuration revisions is required before any future admin or configuration write API is introduced. Phase 5A1 exposes these definitions and configurations as read-only and intentionally defers those write-path immutability guards.

Future attachments may target an inspection, system instance, section, checklist item, or location row using stable UUIDs. Photo, upload, and signature behavior is not implemented in Phase 5A1.
