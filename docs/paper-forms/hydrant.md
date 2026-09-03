# Hydrant - paper form transcription

Source: `SERVICE REPORT SAMPLE.pdf` p.5 (upper part of page; blank master);
`ZONE 1_HOKUDEN SDN BHD.pdf` p.6, `ZONE 2_HOKUDEN SDN BHD.pdf` p.6, `ZONE 3_HOKUDEN SDN BHD.pdf` p.6 (filled, Hokuden (Malaysia) Sdn.Bhd.);
`MAK SITI PRODUCTS (M) SDN BHD_ SERVICE REPORT.pdf` p.5 (filled, Mak Siti Products (M) Sdn Bhd — hydrant table struck through and marked "NA").

Page title: **HYDRANT SYSTEM**. Shares a physical page with
[portable-fire-extinguisher.md](portable-fire-extinguisher.md) (a boxed section below).

Revision differences (Hokuden / Revision B vs blank master):
- Adds a `Date tested : ____` field, top right.
- Hokuden Zone 1 p.6 is printed with "Zone : 3" in the body regardless of actual zone —
  see [README](README.md).
- No other structural change.

## Header fields

- `Pressurize Hydrant` | `Meter Hydrant` | `Public Hydrant` — three ovals in a row
  (type selector; no printed "choose one" instruction).
- `Date tested : ____` — *(Revision B / Hokuden only)*, write-in.

## Blocks

### HYDRANT SET — repeatable_table

| column key | printed header | control | allowed values | notes |
|---|---|---|---|---|
| no | No. | write-in box | free (e.g. `1`, `1-2`, `H-1`) | |
| location | Location | write-in `( ____ )` | free text | |
| canvas_hose_2 | Canvas hose@2 | **two ovals** | hand mark in each | printed "Canvas" / "hose@2" stacked; two ovals side by side (all other columns have one) |
| diffuser_nozzle | Diffuser Nozzle | oval | hand mark | |
| landing_valve | Landing Valve | oval | hand mark | |
| landing_v_handle | Landing V.Handle | oval | hand mark | |
| hose_cabinet | Hose Cabinet | oval | hand mark | |
| key_lock | Key Lock | oval | hand mark | |
| remarks | Remarks :- | ruled line | free text | |

Row count: blank master prints **6** rows.

### Comments — free text

`Comments :` + ~10 ruled lines.

## Result legend

**Blank master p.5, verbatim (footer of the hydrant section, above the Portable Fire
Extinguisher box):**

```
Remarks :-   ( / )  In Good Working Condition           ( X )  In Poor Working Condition (Red)
```

**Hokuden Zone 1/2/3 p.6, verbatim (page footer):**

```
Remarks :-        ( / )  In Good Working Condition        ( X )  In Poor Working Condition (Red)
```

See [README](README.md) for the conflicting Hokuden cover legend sheet.

## Ambiguities

- `Canvas hose@2` has two ovals per row with no printed explanation (presumably two canvas
  hoses per hydrant, hence "@2"); recorded as a two-oval column, not inferred further.
- `Pressurize / Meter / Public Hydrant` — three ovals, no printed rule on how many to mark.
- No field marked mandatory.
- The `Date tested` field exists only on Revision B; on the blank master the section has
  no date field of its own (only the cover page `Date`).
