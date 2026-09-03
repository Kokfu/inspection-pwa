# Paper form transcription — index

Verbatim transcription of the physical MFE **Fire System Service Report** forms that this
PWA digitises. Transcribed from the source PDFs, page by page. This is a record of what is
printed on the paper, not a design for how to implement it.

## Sources

| Short name | File | Type | Notes |
|---|---|---|---|
| blank master | `SERVICE REPORT SAMPLE.pdf` | Blank master, 11 pages, extracts as real text | **The authority for form structure.** |
| MAK SITI | `MAK SITI PRODUCTS (M) SDN BHD_ SERVICE REPORT.pdf` | Filled scan, 5 pages, customer "Mak Siti Products (M) Sdn Bhd", dated 06.07.2026 | Same form revision as the blank master. |
| Hokuden Zone 1 | `ZONE 1_HOKUDEN SDN BHD.pdf` | Filled scan, 16 pages, customer "Hokuden (Malaysia) Sdn.Bhd. (Zone 1)", dated 23.05.2026 | Newer form revision. Has an extra "Symbol Standard Checklist" cover sheet and a Fire Rated Roller Shutter section. Page 16 is a non-standard supplementary detector schedule. |
| Hokuden Zone 2 | `ZONE 2_HOKUDEN SDN BHD.pdf` | Filled scan, 15 pages, "(Zone 2)", dated 20.06.2026 | Newer form revision. |
| Hokuden Zone 3 | `ZONE 3_HOKUDEN SDN BHD.pdf` | Filled scan, 14 pages, "(Zone 3)", dated 25.04.2026 | Newer form revision. Cover lists pages 1–7 only (no roller shutter) but the PDF still carries roller shutter pages. |

The blank master extracts as text; the filled reports are scans and were read as page images.

## Two form revisions

- **Revision A** (blank master, MAK SITI): the 11-page form. No per-report legend sheet.
  No Fire Rated Roller Shutter section.
- **Revision B** (Hokuden Zone 1/2/3): adds a standalone "Symbol Standard Checklist for
  Service Report" cover sheet (Hokuden letterhead, Date + Zone), adds a Fire Rated Roller
  Shutter section, and makes per-system changes recorded in each file below
  (`TEST RUN FIRE PUMP 30 MINUTES` blocks, a flow-switch timer line on Fire Alarm, a
  `Date tested` field on several pages, a three-panel Smoke Ventilation layout, dropped
  `WATER TANK` heading on Hose Reel, "CO2 FIRE **PROTECTION** SYSTEM" title).

Both revisions are recorded. Differences are noted, not reconciled.

## Result legend conflict (do not reconcile — both are recorded)

Every MFE system page (both revisions) carries a footer legend of the form:

> `Remarks :-  ( / )  In Good Working Condition        ( X )  In Poor Working Condition`  (some pages add `(Red)`)

Revision B additionally has a **separate Hokuden cover legend sheet** that reads:

> 1. `( √ )` : Good / Baik
> 2. `( X )` : Noot Good / Tidak Memuaskan
> 3. `( ◯ )` : Complete Repair / Siap Baik Pulih
> 4. `( / )` : No Need Checking *( No Need Write N.A )* / Tidak Berkaitan

These disagree on what `( / )` means: **"In Good Working Condition"** on the MFE system
pages vs **"No Need Checking / N.A."** on the Hokuden cover sheet. The Fire Rated Roller
Shutter page footer uses `( / )` = "In Good Working Condition", which conflicts with the
Hokuden cover sheet on the same report. Recorded in both
[fire-rated-roller-shutter.md](fire-rated-roller-shutter.md) and each system file.

## System files

| File | Blank master page | In filled reports |
|---|---|---|
| [automatic-sprinkler.md](automatic-sprinkler.md) | p.2 | Hokuden Zn1/2/3; MAK SITI (struck out "NA") |
| [hose-reel.md](hose-reel.md) | p.3 | MAK SITI; Hokuden Zn1/2/3 |
| [fire-alarm-detector.md](fire-alarm-detector.md) | p.4 | MAK SITI; Hokuden Zn1/2/3 |
| [hydrant.md](hydrant.md) | p.5 (upper) | Hokuden Zn1/2/3; MAK SITI (struck out "NA") |
| [portable-fire-extinguisher.md](portable-fire-extinguisher.md) | p.5 (lower box) | MAK SITI |
| [wet-chemical.md](wet-chemical.md) | p.6 | Hokuden Zn1/2/3 |
| [co2-fire-extinguisher.md](co2-fire-extinguisher.md) | p.7 | Hokuden Zn1/2/3 (4 panels each) |
| [dry-wet-riser.md](dry-wet-riser.md) | p.8 | not present in any filled report examined |
| [smoke-ventilation.md](smoke-ventilation.md) | p.9 | Hokuden Zn1/2/3 (revised layout) |
| [fire-intercom.md](fire-intercom.md) | p.10 | not present in any filled report examined |
| [fire-rated-roller-shutter.md](fire-rated-roller-shutter.md) | — (Hokuden only) | Hokuden Zn1 (p.13–15), Zn2 (p.13–15), Zn3 (p.13–14) |
| [fm200.md](fm200.md) | — (cover checkbox only) | not present in any filled report examined |

Blank master p.11 is a blank ruled continuation page (no fields).

## Common cover page ("FIRE SYSTEM SERVICE REPORT")

Header: `MFE SERVICES SDN. BHD. (952723-P)` / `FIRE SYSTEM SERVICE REPORT`.

Header fields: `Customer`, `Date`, `Telephone No`, `Contact`, `Service Call No`,
`Arrival`, `Departure`.

`FIRE FIGHTING & PROTECTION SYSTEM :` — a set of ticked ovals, printed in two columns:

- left: Automatic Sprinkler System; Hose Reel System; Fire Alarm / Detector System; Hydrant System; Portable Fire Extinguisher
- right: Dry / Wet Riser Ssytem *(sic)*; CO2 Fire Extinguisher System; Wet Chemical System; FM 200 System

`Description :` — free-text, many ruled lines (technicians use it as a page index,
e.g. "HOSE REEL SYSTEM → LOOK AT PAGE 1").

`To be continued` / `Completed` — two ovals.

`Remarks :-`
1. All fire systems are tested and inspected.
2. Should any abnormal condition occur which might cause further damages to "customer systems" or threats to human safety or the environment, customer agrees to call us immediately for necessary action.
3. `( √ )  In Good Working Condition      ( X )  In Poor Working Condition`

`Service By:` — `Name: ____`, `Date: ____`. `Confirmed By :` — `Customer signature & stamp`.

Footer: `No.2339, Jalan Raja, Mukim Sungai Raya,84300 Muar,Johor. Tel:06-9856988 /9858709 Fax:06-9859806` / `Email : mfetsb@gmail.com`

Revision B adds `(Zone N)` after the customer name on this page, and is preceded by the
separate "Symbol Standard Checklist for Service Report" sheet (Hokuden letterhead, with
`Date :` and `Zone :`).

## Cross-cutting ambiguities

- The forms do not mark any field as mandatory. "required?" is recorded as
  "not indicated on form" throughout.
- Result ovals are filled by hand; the mark used (`/`, `√`, `X`, `N/A`, circle) is at the
  technician's discretion and is only partially governed by the page legend.
- Hokuden Zone 1 p.4 (Hose Reel) and p.6 (Hydrant) are printed with "Zone : 3" in the
  body even though the report is Zone 1 — the zone sub-labels in the Hokuden bundle are
  not reliable.
- Hokuden Zone 3's cover lists only pages 1–7 (no roller shutter) yet the PDF still
  contains roller shutter pages; the roller-shutter page set there also looks incomplete
  (numbers 1–17 and 35–45 seen; 18–34 page not seen).
