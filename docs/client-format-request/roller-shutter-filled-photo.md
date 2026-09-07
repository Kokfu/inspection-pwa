# Filled sample page — "FIRE RATED ROLLER SHUTTER" (photo)

> **Owner uploaded this on 2026-09-07 and labelled it "FM200 sample."** The page itself is
> titled **`FIRE RATED ROLLER SHUTTER`**, not FM200. Its contents (title, columns, the
> "1 lot motor Roller Shutter spoilt for no.11" comment, and the yellow *"Harga"* sticky note over
> rows 13–14) match **Hokuden Zone 1, page 13** exactly — see
> [`../paper-forms/fire-rated-roller-shutter.md`](../paper-forms/fire-rated-roller-shutter.md).
>
> Two ways to read the "FM200 sample" label — resolve with the owner before building:
> 1. **It was a mis-label** and this is simply a filled Fire Rated Roller Shutter example
>    (STEP 2.4), useful as the concrete data shape for that still-blocked system.
> 2. **The owner wants FM200 (STEP 2.1) built with this same minimal table shape** — pre-printed
>    `No. / Location` rows + two hand-marked result columns under a Good/Poor legend — as the
>    client's answer to the FM200 "no paper page exists" problem. If so, that is a *new* client
>    instruction and needs a dated, attributed note (STEP 2.1 is explicitly blocked pending exactly
>    that; the FM200 stub's `confirmationNotes` forbids inferring fields from other systems).

## Transcription

**Page title:** `FIRE RATED ROLLER SHUTTER`

**Header fields**

| Field | Value (handwritten) |
|---|---|
| Date tested | `23/5/26` |
| Zone | *(printed label, left blank — prints immediately before "Inspected By")* |
| Inspected By | `Fadil, Din, Haziq (R)` |

**Schedule** — columns: `No. | Location | Auto Alarm Mode | Manual Mode`
Locations are **pre-printed on the form**; result columns are hand-marked. Legend (page footer):
`( / )` = In Good Working Condition, `( X )` = In Poor Working Condition.

| No. | Location | Auto Alarm Mode | Manual Mode |
|---|---|---|---|
| 1 | 1st Floor Admin Office | / | / |
| 2 | Finger Print | / | / |
| 3 | CNC Drill | / | / |
| 4 | CNC Drill | / | / |
| 5 | CNC Drill | / | / |
| 6 | CNC Drill | / | / |
| 7 | CNC Drill | / | / |
| 8 | Corridor Design | / | / |
| 9 | Packing | / | / |
| 10 | QA Outgoing | / | / |
| 11 | QA Outgoing | **X** | *(blank / not marked)* |
| 12 | Measurement | / | / |
| 13 | Measurement | *(obscured by "Harga" sticky note)* | *(obscured)* |
| 14 | QA Office | *(obscured by "Harga" sticky note)* | *(obscured)* |
| 15 | Measurement | / | / |
| 16 | Copper Coat | / | / |
| 17 | Copper Coat | / | / |

A yellow sticky note reading **"Harga"** (Malay: *price*) covers the result cells for rows 13–14.

**Comments:**
- `1 lot motor Roller Shutter spoilt for no.11`
- `refer ms7027... - 04050mpc` *(quotation / reference number, handwritten, partly illegible)*

**Footer legend (verbatim):**
`Remarks :-    ( / )  In Good Working Condition       ( X )  In Poor Working Condition`
*(No `(Red)` on this page.)* Note this conflicts with the Hokuden "Symbol Standard Checklist"
cover sheet, which defines `( / )` as "No Need Checking / N.A." — the conflict is already recorded
in [`../paper-forms/fire-rated-roller-shutter.md`](../paper-forms/fire-rated-roller-shutter.md).

## Why it's useful

- Confirms row 11's `X` (poor) lines up with the "motor spoilt for no.11" comment — the mark
  convention on this form is `( / )` good / `( X )` poor, per-cell, one mark per result column.
- Shows the real per-site row set is **pre-printed and fixed** for a customer (17 rows here,
  45 rows in the full Hokuden set) — i.e. a Manager-configured location list, not a blank
  repeatable table, exactly as `fire-rated-roller-shutter.md` and the Fire Intercom build (2.3)
  concluded.
- `Auto Alarm Mode` and `Manual Mode` are **two independent results per row** under one Good/Poor
  legend — the same modelling question flagged for Smoke Ventilation (2.2).
