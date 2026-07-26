# Automatic Sprinkler Inspection

## Scope

Phase 5B2 implements only the confirmed MFE-FSSR V1 Automatic Sprinkler
System. It is one fixed form with 20 result rows, six PSI values, and optional
remarks/comments. It does not add valve/location rows, zones, N/A values,
range evaluation, or PDF output.

## Runtime Compatibility

The published V1 definition remains immutable. Runtime code recognizes only:

- template code `MFE-FSSR`;
- template version `1`;
- system key `automatic_sprinkler`;
- repetition mode `single`;
- primary instance with sequence 1 and null zone/location provenance.

Unknown or incompatible definitions and configurations fail closed.

## Form Contract

Water Tank contains four fixed Good/Poor rows. Pump House contains eight
fixed Good/Poor rows and three measurement rows. The Jockey row has Cut In
and Cut Out values; Duty and Stand-by rows each have one Cut In value. Main
Alarm Valve contains three fixed Good/Poor rows and Water Supply and
Installation gauge measurements. Every measurement is PSI and has its own
Good/Poor result. Comments and all row remarks are optional.

The Pump House UI preserves the paper order by interleaving its checklist and
measurement rows. Stable keys are response authority; the frozen resolved
controls own labels, units, allowed values, requiredness, ordering, and text
limits.

## Offline And Identity

One local record uses `jobId:automatic_sprinkler` as its unique job/system
identity and a stable device UUID. Opening creates or resolves the Draft but
does not create an outbox item. Save Draft is permissive and local. Submit
requires all 20 results and all six finite PSI values, then atomically changes
the same record to Pending and creates one active
`masterSystemInspection/create` operation.

The server stores one `master_system_inspections` parent and one
`master_system_form_instances` child with `instance_key = primary`.
Database ID and client UUID remain distinct.

## Server Authority

The server authenticates the actor, loads the open job, verifies the immutable
template/configuration and confirmed system, resolves the published
definition, validates exact response keys and values, and builds the accepted
snapshot from server-owned data. Client snapshot content is not authoritative.

Exact replay is duplicate success, changed replay is an idempotency conflict,
and another UUID for the same job/system is an active-inspection conflict.

## Deferred Confirmation

The source does not specify PSI ranges, N/A handling, mandatory Poor remarks,
or a repeatable alarm-valve business model. Those require client confirmation
and, if they alter the contract, a later template/response version.
