# Fire Rated Roller Shutter - paper form transcription

Source: **not in the blank master.** Only in the Hokuden reports (Revision B):
`ZONE 1_HOKUDEN SDN BHD.pdf` p.13–15, `ZONE 2_HOKUDEN SDN BHD.pdf` p.13–15,
`ZONE 3_HOKUDEN SDN BHD.pdf` p.13–14 (filled, Hokuden (Malaysia) Sdn.Bhd.).

Page title: **FIRE RATED ROLLER SHUTTER**

Revision differences: this is a **Revision-B-only section** — there is no blank-master
equivalent to compare against. Within Revision B the three zones' pages are identical in
layout.

## Header fields

- `Date tested : ____` — write-in
- `Zone` — printed label; appears **not filled** on any examined page (the word "Zone"
  prints immediately before "Inspected By")
- `Inspected By : ____` — write-in (e.g. "Fadil, Din, Haziq (R)")

## Blocks

### Roller shutter schedule — repeatable_table

| column key | printed header | control | allowed values | notes |
|---|---|---|---|---|
| no | No. | pre-printed number | `1`–`45` across three pages (p.1 = 1–17, p.2 = 18–34, p.3 = 35–45) | |
| location | Location | write-in `( ____ )` | free text (e.g. "1st Floor Admin Office", "CNC Drill", "Copper Coat") | some rows print the location pre-filled on the form itself |
| auto_alarm_mode | Auto Alarm Mode | box | hand mark | |
| manual_mode | Manual Mode | box | hand mark | Zone 3's pages have this column entirely blank |

Note: on the Hokuden pages the `Location` values (and the row count of 45) are already
printed on the form — this section is effectively a fixed per-site checklist, not a blank
repeatable table, for this customer.

### Comments — free text

`Comments :` + ruled lines. (Zone 1 p.1: "1 lot motor Roller Shutter spoilt for no.11" and
a quotation reference; a yellow sticky note "Harga" covers rows 13–14 in that scan.)

## Result legend

**Hokuden Zone 1/2/3, verbatim (page footer, every roller-shutter page):**

```
Remarks :-        ( / )  In Good Working Condition           ( X )  In Poor Working Condition
```

Note: **no `(Red)`** on this page (unlike Fire Alarm / Hydrant / Wet Chemical / CO2 /
Smoke Ventilation footers, which do carry `(Red)`).

### Legend conflict (recorded, not reconciled)

The **same Hokuden report** begins with a separate "Symbol Standard Checklist for Service
Report" sheet whose legend reads, verbatim:

```
1. ( √ )  : Good / Baik
2. ( X )  : Noot Good / Tidak Memuaskan
3. ( ◯ )  : Complete Repair / Siap Baik Pulih
4. ( / )  : No Need Checking ( No Need Write N.A )  / Tidak Berkaitan
```

So on this report `( / )` is defined two different ways:

| Where | `( / )` means |
|---|---|
| Fire Rated Roller Shutter page footer (and every other MFE system page) | **In Good Working Condition** |
| Hokuden "Symbol Standard Checklist" cover sheet | **No Need Checking / N.A. (Tidak Berkaitan)** |

Both are recorded here; they are not merged. The task brief flagged this conflict
specifically (phrasing it as the "Roller Shutter page vs Hokuden cover"); the roller
shutter page footer does use `( / )` = "In Good Working Condition".

## Ambiguities

- The `Zone` header label is printed but never filled on any examined page.
- `Auto Alarm Mode` / `Manual Mode` are boxes with no printed instruction on what mark to
  use; the footer legend (`( / )` / `( X )`) is presumably intended but conflicts with the
  cover sheet as above.
- Zone 3's roller-shutter pages leave the entire `Manual Mode` column blank and its page
  set looks incomplete (rows 1–17 on p.13 and 35–45 on p.14 were seen; an 18–34 page was
  not). Zone 3's cover page does not list roller shutter at all, yet the pages are in the
  PDF.
- Row `11` on Zone 1 p.13 `Auto Alarm Mode` is marked `X`; comments note the motor is
  spoilt — consistent with `( X )` = "In Poor Working Condition".
- No field marked mandatory.
