# Repeatable Row Model (C3)

## Purpose

Four services already carry a "No. / Location / per-column result" table, and three more are
coming. Today each one re-implements the same row envelope, the same configured-row builder and
the same provenance validation. This skill defines the **one** shared contract so the next
service adds result columns and nothing else.

Read together with `.agents/skills/v7-evidence-acceptance/SKILL.md` (evidence and acceptance)
and `.agents/skills/codex-task-brief/SKILL.md` (task conventions).

---

## The de-facto model (already shipped, three times)

`HydrantRow` and `RiserOutlet` are byte-for-byte the same envelope, differing only in result
columns:

```
rowUuid                string          crypto.randomUUID()
source                 "configured" | "technician"
configuredLocationId   string | null   set iff source === "configured"
configuredRowOrdinal   number | null   set iff source === "configured"
zoneSnapshot           { id, displayName } | null
locationSnapshot       { id, displayName } | null
assetReference         string          from location.rowPreset.assetReference
locationText           string          defaults to location.displayName
<result columns>       Result | null   per-system
remarks                string
sortOrder              number          1-based, must equal index + 1
```

`FireAlarmPrimaryDeviceRow` is the same envelope with three naming divergences:
`displaySequence` (not `sortOrder`), and `alarmZone` + `location` (not `locationText`).

**These three shapes are frozen.** Hydrant V1, Dry/Wet Riser V2 and Fire Alarm V1-V7 have
accepted production data in these exact shapes. The shared model is adopted **forward-only**:
new services use it from the start; existing services adopt it only when they are rewritten for
their own V7 upgrade, and even then the *serialized* shape must not change.

---

## Canonical contract for new services

Use `sortOrder` and `locationText`. Do not invent per-system names.

```ts
export type RepeatableRowProvenance = {
  rowUuid: string;
  source: "configured" | "technician";
  configuredLocationId: string | null;
  configuredRowOrdinal: number | null;
  zoneSnapshot: { id: string; displayName: string } | null;
  locationSnapshot: { id: string; displayName: string } | null;
  assetReference: string;
  locationText: string;
  remarks: string;
  sortOrder: number;
};
export type RepeatableRow<TResults> = RepeatableRowProvenance & TResults;
```

Result columns are `good | poor | not_relevant | null` under V7 and are named `<thing>Result`.

---

## The four invariants (all three existing services enforce these; do not weaken them)

1. **Configured rows are retained.** Every `location.id` × `presetRowCount` pair from the frozen
   snapshot must appear exactly once. Dropping one is a submission error.
2. **Provenance is exclusive.** `source === "configured"` requires both `configuredLocationId`
   and `configuredRowOrdinal`; `source === "technician"` requires both to be `null`.
3. **Ordering is dense and 1-based.** `sortOrder === index + 1`. No gaps, no duplicates.
4. **`rowUuid` is unique within the table.**

A technician may add rows beyond the configured set, and may not delete configured ones.

---

## V7 evidence on rows

Row-scoped field paths already exist — Fire Alarm's alarm-device rows use:

```
alarm_devices.alarm_device_rows.rows.<rowUuid>.<column_key>
```

New services follow the same shape: `<section>.<block>.rows.<rowUuid>.<column_key>`.
A Poor result on a row column requires that column's **own** remark and **own** photo, keyed by
that path. Stale evidence (the column no longer Poor) is excluded from the frozen manifest —
this is the shared V7 authority, not per-system logic.

Per-row `remarks` is the row's general note. It is **not** the per-Poor remark, which is
field-owned and lives under the field path above.

---

## Template definition

Rows are a `repeatable_table` block:

```
{ key, type: "repeatable_table", title, sortOrder,
  supportsZones: boolean, supportsLocations: boolean,
  columns: [{ key, label, control, required, sortOrder, allowedValues?, remarksPolicy? }] }
```

`control` is `text` for identity/location columns, `good_poor` (V7: three values) for results,
`normal_test_isolation_multi` for V7 detector state, `remarks` for the row note.

---

## Services on this model

| Service | Table | Status |
|---|---|---|
| Hydrant | hydrant set (7 result columns) | frozen V1 shape; adopt at STEP 1.1 |
| Dry / Wet Riser | riser outlets (5 result columns) | frozen V2 shape; adopt at STEP 1.4 |
| Hose Reel | hose reel drum (5 result columns) | STEP 1.2 |
| Fire Alarm | primary + alarm-device rows | frozen, divergent names; leave as is |
| Fire Rated Roller Shutter | No. / Location / Auto Alarm Mode / Manual Mode | **new — first consumer** |
| Smoke Ventilation | per-zone rows, Auto / Manual | new |
| Fire Intercom | floor rows, Yes/No × 2 | new — column meaning unconfirmed |

---

## Rules

- Forward-only. Never change a serialized row shape that has accepted data.
- Extract for new consumers; do not refactor frozen services just to share code.
- The shared helpers must be parameterized over result columns, never normalize names for a
  service whose shape is already frozen.
- Every new table gets the four invariants under test, not by inspection.
