# CO2 Fire Extinguisher - paper form transcription

Source: `SERVICE REPORT SAMPLE.pdf` p.7 (blank master);
`ZONE 1_HOKUDEN SDN BHD.pdf` p.7–10, `ZONE 2_HOKUDEN SDN BHD.pdf` p.7–10, `ZONE 3_HOKUDEN SDN BHD.pdf` p.7–10 (filled, Hokuden (Malaysia) Sdn.Bhd. — one page per CO2 panel: Genset Room, TNB Room, Transformer Room, LV Room / "HV Room").

Page title: **CO2 FIRE EXTINGUISHER SYSTEM** (blank master) /
**CO2 FIRE PROTECTION SYSTEM** (Hokuden / Revision B — title reworded).

Revision differences (Hokuden / Revision B vs blank master):
- Page title changed from "CO2 FIRE **EXTINGUISHER** SYSTEM" to "CO2 FIRE **PROTECTION**
  SYSTEM".
- Adds a `Date tested : ____` field, top right.
- Hokuden prints `Zone : N` under the title, and one physical page is used per CO2 panel.
- No other structural change.

## Header fields

- `Co2 Control Panel` (section heading)
- `Location` — write-in `[ ____ ]`
- `Date tested : ____` — *(Revision B / Hokuden only)*

## Blocks

### Detector matrix — repeatable_table

Blank master prints **~14** rows.

| column key | printed header | sub-columns | control | notes |
|---|---|---|---|---|
| alarm_zone | Alarm Zone | — | write-in box | e.g. `A-1`, `B-1`, `Z-1A` |
| location | Location | — | write-in `( ____ )` | free text |
| heat_detector | Heat Detector | Normal, Test, Isolation | one oval per sub-column | 3 ovals |
| smoke_detector | Smoke Detector | Normal, Test, Isolation | one oval per sub-column | 3 ovals |
| remarks | Remarks:- | ruled line | free text | |

### Charger & Batteries — checklist

Each row: one oval + `Remarks :-` ruled line.

| key | printed label |
|---|---|
| cb_main_supply | Main Supply |
| cb_battery | Battery |
| cb_charger | Charger |

### Physical Outlook Checking — checklist

Each row: one oval + ruled line.

| key | printed label |
|---|---|
| poc_co2_cylinder | CO2 Cylinder |
| poc_electric_actuator | Electric Actuator |
| poc_manual_release_key | Manual Release Key |
| poc_alarm_bell | Alarm Bell |
| poc_twin_flashing_light | Twin Flashing Light |
| poc_24v_dc_tripping_device | 24V DC Tripping Device |
| poc_manual_pull_station | Manual Pull Station |
| poc_high_pressure_hose | High Pressure Hose |
| poc_discharge_nozzles | Discharge Nozzles |
| poc_pilot_cylinder | Pilot Cylinder |

### Main Function Key — checklist

Each row: one oval + `Remarks :-` ruled line.

| key | printed label |
|---|---|
| mfk_main_alarm_reset | Main Alarm Reset |
| mfk_lamp_test | Lamp Test |
| mfk_evacuate | Evacuate |
| mfk_ac_supply | A/C Supply |
| mfk_dc_supply | D/C Supply |
| mfk_signal_alarm_to_mfap | Signal Alarm to MFAP | printed across two lines: "Signal Alarm to" / "MFAP" |

### Comments — free text

`Comments :` + ruled lines.

## Result legend

**Blank master p.7, verbatim (page footer):**

```
Remarks :-  ( / )  In Good Working Condition      ( X )  In Poor Working Condition (Red)
```

**Hokuden Zone 1/2/3 p.7–10, verbatim (page footer):**

```
Remarks :-        ( / )  In Good Working Condition        ( X )  In Poor Working Condition (Red)
```

See [README](README.md) for the conflicting Hokuden cover legend sheet.

## Ambiguities

- Blank master p.7 text extraction is noisy (a stray "pp p" fragment near "Co2 Control
  Panel" and a duplicated `Location`); the block layout above is taken from the page image
  and the cleaner Hokuden pages, which agree.
- Detector matrix: 3 ovals per device (Normal / Test / Isolation), no printed rule for how
  many may be marked.
- `CO2 Cylinder` vs blank master's "CO2 Cylinder" — blank master text shows "CO2 Cylinder"
  under "Physical Outlook Checking"; Hokuden shows the same. Retained as printed.
- No field marked mandatory.
