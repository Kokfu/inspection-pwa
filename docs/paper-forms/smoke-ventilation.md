# Smoke Ventilation - paper form transcription

Source: `SERVICE REPORT SAMPLE.pdf` p.9 (blank master);
`ZONE 1_HOKUDEN SDN BHD.pdf` p.12, `ZONE 2_HOKUDEN SDN BHD.pdf` p.12, `ZONE 3_HOKUDEN SDN BHD.pdf` p.12 (filled, Hokuden (Malaysia) Sdn.Bhd. — revised layout).

Page title: **SMOKE VENTILATION SYSTEM**

Revision differences (Hokuden / Revision B vs blank master): **this page was substantially
re-laid-out.** Both layouts are recorded below.

## Header fields

- `Date tested : ____` — write-in (present in both revisions).

### Revision A (blank master)

- `Smoke Ventilation Control Panel No. ( ____ )   Location ____` — one panel-number
  write-in and one location write-in.

### Revision B (Hokuden)

- Three stacked rows:
  `Smoke Ventilation Control Panel No. ( 1 )   Zone 1 ____`
  `Smoke Ventilation Control Panel No. ( 2 )   Zone 2 ____`
  `Smoke Ventilation Control Panel No. ( 3 )   Zone 3 ____`
  (panel-number pre-printed 1/2/3; a write-in line beside each).

## Blocks

### Fan schedule — repeatable_table

**Revision A:** single table.

| column key | printed header | control | notes |
|---|---|---|---|
| no | No | pre-printed `1`–`10` | 10 rows |
| auto | Auto | oval | |
| manual | Manual | oval | |
| remarks | *(unlabelled)* | ruled line | free text to the right of each row |

**Revision B:** three side-by-side tables headed `Zone (1)`, `Zone (2)`, `Zone (3)`, each:

| column key | printed header | control | notes |
|---|---|---|---|
| no | No | pre-printed `1`–`8` | 8 rows per zone |
| auto | Auto | oval | |
| manual | Manual | oval | |
| remarks | *(unlabelled)* | ruled line | |

Each Revision-B zone table also has a `Remarks :` line beneath it.

### Power supply

**Revision A:**

| key | printed label | control |
|---|---|---|
| main_power_supply_ac | Main Power Supply (AC) | result oval |
| secondary_essential_supply_dc | Secondary Essential Supply (DC) | result oval |

**Revision B:**

| key | printed label | control | notes |
|---|---|---|---|
| main_power_supply_ac | Main Power Supply (AC) — `____ (AC)` | write-in line | heading "Main Power Supply (AC)" over two write-in lines |
| main_power_supply_dc | `____ (DC)` | write-in line | second line under the same heading |

### Charger & Batteries — checklist (both revisions)

Each row: one oval + `Remarks :-` ruled line.

| key | printed label |
|---|---|
| cb_battery | Battery |
| cb_charger | Charger |

### Main Function Key — checklist

Each row: one oval + `Remarks :-` ruled line.

**Revision A:**

| key | printed label |
|---|---|
| mfk_main_alarm_reset | Main Alarm Reset |
| mfk_lamp_test | Lamp Test |
| mfk_evacuate | Evacuate |
| mfk_signal_alarm_to_mfap | Signal Alarm to MFAP |

**Revision B:**

| key | printed label | notes |
|---|---|---|
| mfk_main_alarm_key | Main Alarm Key | reworded from "Main Alarm Reset" |
| mfk_lamp_test | Lamp Test | |
| mfk_evacuate | Evacuate | |
| mfk_signal_alarm_to_mfap | Signal Alarm To MFAP | printed "Signal Alarm To" / "MFAP" |

### Comments — free text

`Comments :` + ruled lines.

## Result legend

**Blank master p.9, verbatim (page footer):**

```
Remarks :- ( / )  In Good Working Condition     ( X )  In Poor Working Condition (Red)
```

**Hokuden Zone 1/2/3 p.12, verbatim (page footer):**

```
Remarks(:⁄)  In Good Working Condition                ( X )  In Poor Working Condition (Red)
```

(The Hokuden footer prints the `( / )` glyph merged into "Remarks(:⁄)". Recorded as seen;
not normalised.) See [README](README.md) for the conflicting Hokuden cover legend sheet.

## Ambiguities

- Revision A "No" runs 1–10; Revision B runs 1–8 per zone. Recorded as printed.
- Revision A `Main Power Supply (AC)` / `Secondary Essential Supply (DC)` are result ovals;
  Revision B replaces them with two write-in lines `____ (AC)` / `____ (DC)` under a single
  "Main Power Supply (AC)" heading — the "(AC)" in the heading vs the "(DC)" second line is
  as printed and not reconciled.
- Revision B "Main Alarm Key" vs Revision A "Main Alarm Reset" — different printed labels
  for the same row position.
- No field marked mandatory.
