# Automatic Sprinkler - paper form transcription

Source: `SERVICE REPORT SAMPLE.pdf` p.2 (blank master); `ZONE 1_HOKUDEN SDN BHD.pdf` p.3,
`ZONE 2_HOKUDEN SDN BHD.pdf` p.3, `ZONE 3_HOKUDEN SDN BHD.pdf` p.3 (filled, Hokuden (Malaysia) Sdn.Bhd.);
`MAK SITI PRODUCTS (M) SDN BHD_ SERVICE REPORT.pdf` p.2 (filled, Mak Siti Products (M) Sdn Bhd — whole page struck through and marked "NA").

Page title: **AUTOMATIC SPRINKLER SYSTEM**

Revision differences (Hokuden / Revision B vs blank master):
- Adds a block **TEST RUN FIRE PUMP 30 MINUTES** with rows `Jockey Pump`, `Duty Pump`,
  `Standby Pump` (each with a Result oval), placed after MAIN ALARM VALVE and before Comments.
- No other structural change. Row set of WATER TANK / PUMP HOUSE / MAIN ALARM VALVE is
  identical.

## Header fields

Uses the common cover page only (see [README](README.md)). This page has no header fields
of its own; the only column headers are `Result` and `Remarks :-`.

## Blocks

### WATER TANK — checklist

Layout: one printed item per row; a `Result` oval; a `Remarks :-` ruled line.

| key | printed label | control | allowed values | required? | notes |
|---|---|---|---|---|---|
| wt_saj_main_supply | S.A.J Main Water Supply | result oval + remarks line | hand mark in oval (see Result legend); free text remark | not indicated on form | |
| wt_water_level | Water Level | result oval + remarks line | as above | not indicated on form | |
| wt_auto_refilling | Automatic Refilling Facilities | result oval + remarks line | as above | not indicated on form | |
| wt_drain_valve | Drain Valve In Close Position And All Stop Valve In Open Position | result oval + remarks line | as above | not indicated on form | |

### PUMP HOUSE — checklist

| key | printed label | control | allowed values | required? | notes |
|---|---|---|---|---|---|
| ph_keep_clean | Keep Clean In Pump House | result oval + remarks line | hand mark; free text | not indicated on form | |
| ph_manual_start | Manual Start Jockey Pump, Duty Pump & Stand-by Pump | result oval + remarks line | as above | not indicated on form | |
| ph_jockey_cut_in_out | Jockey correct Cut In At ____ PSI Cut Out At ____ PSI | two inline write-in blanks (PSI) + result oval + remarks line | numeric PSI values, hand-written; hand mark in oval | not indicated on form | two blanks on one line |
| ph_duty_cut_in | Correct Duty Pump Cut In At ____ PSI | inline write-in blank (PSI) + result oval + remarks line | numeric PSI; hand mark | not indicated on form | |
| ph_standby_cut_in | Correct Stand-By Pump Cut In At ____ PSI | inline write-in blank (PSI) + result oval + remarks line | numeric PSI; hand mark | not indicated on form | |
| ph_standby_fluids | Stand-By Pump Water, Oil, Fuel, Belt and etc | result oval + remarks line | hand mark; free text | not indicated on form | |
| ph_batt_charging_alt | Correct Operation Of Battery Charging Alternator | result oval + remarks line | as above | not indicated on form | |
| ph_battery_serviceable | Battery In Good Serviceable | result oval + remarks line | as above | not indicated on form | |
| ph_pump_run_phase_fail | Pump Run / Phase Failure Alarm Signal To Main Alarm Panel | result oval + remarks line | as above | not indicated on form | |
| ph_auto_start_position | Jockey Duty And Stand-By Pump In Auto Start Position | result oval + remarks line | as above | not indicated on form | |
| ph_test_valve | Test Valve In Close Position And All Gate Valve In Open Position | result oval + remarks line | as above | not indicated on form | |

### MAIN ALARM VALVE — checklist

| key | printed label | control | allowed values | required? | notes |
|---|---|---|---|---|---|
| mav_breaching_inlet | Breaching Inlet In Good Serviceable | result oval + remarks line | hand mark; free text | not indicated on form | |
| mav_alarm_gong | Alarm Gong In Function | result oval + remarks line | as above | not indicated on form | |
| mav_water_supply_gauge | Water Supply Gauge At ____ PSI | inline write-in blank (PSI) + result oval + remarks line | numeric PSI; hand mark | not indicated on form | |
| mav_installation_gauge | Installation Gauge At ____ PSI | inline write-in blank (PSI) + result oval + remarks line | numeric PSI; hand mark | not indicated on form | |
| mav_flow_meter_valve | Flow Meter Valve In Close Position And All Valve In Open Position | result oval + remarks line | hand mark; free text | not indicated on form | |

### TEST RUN FIRE PUMP 30 MINUTES — checklist *(Revision B / Hokuden only)*

| key | printed label | control | allowed values | required? | notes |
|---|---|---|---|---|---|
| trfp_jockey_pump | Jockey Pump | result oval + remarks line | hand mark; free text | not indicated on form | not on blank master |
| trfp_duty_pump | Duty Pump | result oval + remarks line | as above | not indicated on form | not on blank master |
| trfp_standby_pump | Standby Pump | result oval + remarks line | as above | not indicated on form | not on blank master |

### Comments — free text

`Comments :` followed by ~12 ruled lines spanning the page width.

## Result legend

**Blank master p.2, verbatim (page footer):**

```
Remarks :-  ( / )  In Good Working Condition                             ( X )  In Poor Working Condition
```

**Hokuden Zone 1/2/3 p.3, verbatim (page footer):**

```
Remarks :-  ( / )  In Good Working Condition                     ( X )  In Poor Working Condition
```

(Same wording on this page in both revisions; no `(Red)` on the sprinkler page. See
[README](README.md) for the separate Hokuden cover legend sheet, which conflicts.)

## Ambiguities

- No field is marked mandatory on the form.
- The Result oval accepts any hand mark; the legend only names `( / )` and `( X )`.
  MAK SITI and Hokuden technicians also use `N/A` inside the oval (e.g. Hokuden p.3
  `Stand-By Pump ...`, `Correct Operation Of Battery Charging Alternator`,
  `Battery In Good Serviceable` all marked `N/A`), which the page legend does not define.
- Whether the entire page can be voided (MAK SITI struck the page through and wrote "NA")
  is not a printed control.
- The PSI write-in blanks have no unit validation printed beyond the literal "PSI".
