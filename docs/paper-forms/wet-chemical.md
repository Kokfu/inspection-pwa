# Wet Chemical - paper form transcription

Source: `SERVICE REPORT SAMPLE.pdf` p.6 (blank master);
`ZONE 1_HOKUDEN SDN BHD.pdf` p.11, `ZONE 2_HOKUDEN SDN BHD.pdf` p.11, `ZONE 3_HOKUDEN SDN BHD.pdf` p.11 (filled, Hokuden (Malaysia) Sdn.Bhd.).

Page title: **WET CHEMICAL SYSTEM**

Revision differences (Hokuden / Revision B vs blank master): none structural observed. The
Hokuden pages also print `Zone : N` under the title.

## Header fields

- `Wet Chemical Control Panel` (section heading)
- `Location` — a second write-in `[ ____ ]`, printed lower on the page (above Charger &
  Batteries). Distinct from the matrix `Location` column.

## Blocks

### Detector matrix — repeatable_table

Blank master prints **2** rows.

| column key | printed header | sub-columns | control | notes |
|---|---|---|---|---|
| alarm_zone | Alarm Zone | — | write-in box | e.g. `1 A`, `1 B` |
| location | Location | — | write-in `( ____ )` | free text |
| heat_detector_1 | Heat Detector | Normal, Test, Isolation | one oval per sub-column | first of two "Heat Detector" groups |
| heat_detector_2 | Heat Detector | Normal, Test, Isolation | one oval per sub-column | second "Heat Detector" group — same printed label |
| remarks | Remarks:- | ruled line | free text | |

So 6 ovals per row (two Heat Detector groups × Normal/Test/Isolation). There is **no Smoke
Detector column** on the wet-chemical matrix.

### Charger & Batteries — checklist

Each row has **two ovals** (side by side) plus a `Remarks :-` ruled line.

| key | printed label |
|---|---|
| cb_main_supply | Main Supply |
| cb_battery | Battery |
| cb_charger | Charger |

### Physical Outlook Checking — checklist

Each row: one oval + ruled line.

| key | printed label |
|---|---|
| poc_wet_chemical_cylinder | Wet Chemical Cylinder |
| poc_electric_actuator | Electric Actuator |
| poc_manual_release_key | Manual Release Key |
| poc_alarm_bell | Alarm Bell |
| poc_twin_flashing_light | Twin Flashing Light |
| poc_manual_pull_station | Manual Pull Station |
| poc_high_pressure_hose | High Pressure Hose |
| poc_discharge_nozzle | Discharge Nozzle | 

### Main Function Key — checklist

Each row: one oval + ruled line.

| key | printed label |
|---|---|
| mfk_main_alarm_reset | Main Alarm Reset |
| mfk_lamp_test | Lamp Test |
| mfk_evacuate | Evacuate |
| mfk_ac_supply | A/C Supply |
| mfk_dc_supply | D/C Supply |
| mfk_signal_alarm_to_mfap | Signal Alarm to MFAP | printed across two lines: "Signal Alarm to" / " MFAP" |

### Comments — free text

`Comments :` + ruled lines.

## Result legend

**Blank master p.6, verbatim (page footer):**

```
Remarks :-  ( / )  In Good Working Condition        ( X )  In Poor Working Condition (Red)
```

**Hokuden Zone 1/2/3 p.11, verbatim (page footer):**

```
Remarks :-        ( / )  In Good Working Condition        ( X )  In Poor Working Condition (Red)
```

See [README](README.md) for the conflicting Hokuden cover legend sheet.

## Ambiguities

- The matrix has **two columns both printed "Heat Detector"** with no distinguishing
  label. What separates them (two detectors per zone? two zones' detectors?) is not on the
  page. Keys `heat_detector_1` / `heat_detector_2` are positional only.
- Charger & Batteries rows have **two ovals each** with no printed explanation of what the
  second oval records. In the Hokuden fills the second oval is sometimes the one marked
  (e.g. Zone 1 p.11 `Battery`, `Charger`), sometimes the first (`Main Supply`).
- The lower `Location` field and the matrix `Location` column are both just "Location".
- No field marked mandatory.
