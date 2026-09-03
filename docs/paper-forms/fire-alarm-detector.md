# Fire Alarm / Detector - paper form transcription

Source: `SERVICE REPORT SAMPLE.pdf` p.4 (blank master);
`MAK SITI PRODUCTS (M) SDN BHD_ SERVICE REPORT.pdf` p.4 (filled, Mak Siti Products (M) Sdn Bhd);
`ZONE 1_HOKUDEN SDN BHD.pdf` p.5, `ZONE 2_HOKUDEN SDN BHD.pdf` p.5, `ZONE 3_HOKUDEN SDN BHD.pdf` p.5 (filled, Hokuden (Malaysia) Sdn.Bhd.).

Page title: **FIRE ALARM / DETECTOR SYSTEM**

Revision differences (Hokuden / Revision B vs blank master):
- Adds a line above Comments: `Timer for Alarm ringing after detect signal flow switch ____ second`
  (inline write-in blank). Hokuden Zone 1 filled it "30".
- Hokuden prints `Zone : N` under the page title.
- No other structural change.

## Header fields

- `FIRE ALARM CONTROL PANEL` (section heading)
- `Location :` — write-in, printed as `[ ____ ]`

## Blocks

### Detector matrix — repeatable_table

One row per alarm zone. Blank master prints **12** rows.

Columns:

| column key | printed header | sub-columns | control | allowed values | notes |
|---|---|---|---|---|---|
| alarm_zone | Alarm Zone | — | write-in box | free (e.g. `Z-1`) | |
| location | Location | — | write-in `( ____ )` | free text | |
| manual_call_point | Manual Call Point | Normal, Test, Isolation | one oval per sub-column | hand mark | 3 ovals |
| flow_switch | Flow Switch | Normal, Test, Isolation | one oval per sub-column | hand mark | 3 ovals |
| heat_detector | Heat Detector | Normal, Test, Isolation | one oval per sub-column | hand mark | 3 ovals |
| smoke_detector | Smoke Detector | Normal, Test, Isolation | one oval per sub-column | hand mark | 3 ovals |

So 12 ovals per row (4 devices × Normal/Test/Isolation). No Remarks column on this matrix
in the blank master.

### Charger & Batteries — checklist

Each row: one oval + a `Remarks :-` ruled line.

| key | printed label |
|---|---|
| cb_main_supply | Main Supply |
| cb_battery | Battery |
| cb_charger | Charger |

### Main Function Key — checklist

Each row: one oval + ruled line.

| key | printed label |
|---|---|
| mfk_main_alarm_reset | Main Alarm Reset |
| mfk_lamp_test | Lamp Test |
| mfk_evacuate | Evacuate |
| mfk_ac_supply | A/C Supply |
| mfk_dc_supply | D/C Supply |
| mfk_spka_system | SPKA System |
| mfk_alarm_lift_trip | Alarm Lift Trip |
| mfk_signal_gas_discharge | Signal Gas Discharge |

### Bell / call-point schedule — repeatable_table

Right-hand table, printed alongside Charger & Batteries / Main Function Key.

| column key | printed header | control | allowed values | notes |
|---|---|---|---|---|
| no | No. | write-in box | free (e.g. `1`, `2-3`) | |
| location | Location | write-in `( ____ )` | free text | |
| alarm_bell | Alarm Bell | oval | hand mark | |
| manual_call_point | Manual Call Point | oval | hand mark | header prints as "Manual" / "Call Point" stacked |
| remarks | Remarks:- | ruled line | free text | |

Blank master prints ~12 rows.

### Timer line *(Revision B / Hokuden only)*

| key | printed label | control | notes |
|---|---|---|---|
| flow_switch_alarm_timer_s | Timer for Alarm ringing after detect signal flow switch ____ second | inline write-in blank | not on blank master |

### Comments — free text

`Comments :` + ruled lines.

## Result legend

**Blank master p.4, verbatim (page footer):**

```
Remarks :-  ( / )  In Good Working Condition ( X )  In Poor Working Condition (Red)
```

**Hokuden Zone 1/2/3 p.5, verbatim (page footer):**

```
Remarks :-        ( / )  In Good Working Condition        ( X )  In Poor Working Condition (Red)
```

See [README](README.md) for the conflicting Hokuden cover legend sheet.

## Ambiguities

- The detector matrix has 3 ovals (Normal / Test / Isolation) per device with no printed
  rule for how many may be marked. In the filled reports technicians commonly strike a
  single mark spanning all three ovals of one device, or mark them individually — the
  intended semantics of Normal vs Test vs Isolation are not stated on the page.
- No Remarks column on the detector matrix in the blank master (the far-right area is used
  by the separate bell/call-point table).
- No field marked mandatory.
- `Location :` at the top vs `Location` per matrix row — both exist; the top one is the
  panel location, the per-row one is the zone location (inferred from position only; not
  labelled as such).
