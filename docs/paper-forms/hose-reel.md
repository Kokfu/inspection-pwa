# Hose Reel - paper form transcription

Source: `SERVICE REPORT SAMPLE.pdf` p.3 (blank master);
`MAK SITI PRODUCTS (M) SDN BHD_ SERVICE REPORT.pdf` p.3 (filled, Mak Siti Products (M) Sdn Bhd);
`ZONE 1_HOKUDEN SDN BHD.pdf` p.4, `ZONE 2_HOKUDEN SDN BHD.pdf` p.4, `ZONE 3_HOKUDEN SDN BHD.pdf` p.4 (filled, Hokuden (Malaysia) Sdn.Bhd.).

Page title: **HOSE REEL SYSTEM**

Revision differences (Hokuden / Revision B vs blank master):
- The **`WATER TANK` sub-heading is removed**. The four water-tank rows print directly
  under the page title with no group heading. (Blank master and MAK SITI print `WATER TANK`.)
- Adds a block **TEST RUN FIRE PUMP 30 MINUTES** with rows `Duty Pump`, `Standby Pump`
  (each a Result oval), after PUMP HOUSE and before HOSE REEL DRUM. Note: no `Jockey Pump`
  row here (unlike the sprinkler page's equivalent block).
- Hokuden Zone 1 p.4 and Zone 3 p.4 are printed with "Zone : 3" in the body regardless of
  the report's actual zone — see [README](README.md).

## Header fields

Common cover page only. Column headers on this page: `Result`, `Remarks :-`.

## Blocks

### WATER TANK — checklist *(heading present in blank master / MAK SITI; dropped in Hokuden)*

| key | printed label | control | allowed values | required? | notes |
|---|---|---|---|---|---|
| wt_saj_main_supply | S.A.J Main Water Supply | result oval + remarks line | hand mark (see Result legend); free text | not indicated on form | |
| wt_water_level | Water Level | result oval + remarks line | as above | not indicated on form | |
| wt_auto_refilling | Automatic Refilling Facilities | result oval + remarks line | as above | not indicated on form | |
| wt_drain_valve | Drain Valve In Close Position And All Stop Valve | result oval + remarks line | as above | not indicated on form | shorter wording than the sprinkler page's equivalent row |

### PUMP HOUSE — checklist

| key | printed label | control | allowed values | required? | notes |
|---|---|---|---|---|---|
| ph_keep_clean | Keep Clean In Pump House | result oval + remarks line | hand mark; free text | not indicated on form | |
| ph_jockey_cut_in_out | Jockey correct Cut In At ____ PSI Cut Out At ____ PSI | two inline write-in blanks (PSI) + result oval + remarks line | numeric PSI; hand mark | not indicated on form | |
| ph_standby_cut_in | Correct Stand-By Pump Cut In At ____ PSI | inline write-in blank (PSI) + result oval + remarks line | numeric PSI; hand mark | not indicated on form | |
| ph_standby_fluids | Stand-By Pump Oil, Fuel and etc | result oval + remarks line | hand mark; free text | not indicated on form | |
| ph_batt_charger_power_fail | Battery Charger Power Failure Alarm | result oval + remarks line | as above | not indicated on form | |
| ph_battery_serviceable | Battery In Good Serviceable / Function | result oval + remarks line | as above | not indicated on form | |
| ph_pump_run_fail | Pump Run / Failure Alarm To Fire Alarm Panel | result oval + remarks line | as above | not indicated on form | |
| ph_auto_start_position | Jockey And Stand-By Pump In Auto Start Position | result oval + remarks line | as above | not indicated on form | |
| ph_test_valve | Test Valve In Close Position And All Gate Valve In Open Position | result oval + remarks line | as above | not indicated on form | |

### TEST RUN FIRE PUMP 30 MINUTES — checklist *(Revision B / Hokuden only)*

| key | printed label | control | allowed values | required? | notes |
|---|---|---|---|---|---|
| trfp_duty_pump | Duty Pump | result oval + remarks line | hand mark; free text | not indicated on form | not on blank master |
| trfp_standby_pump | Standby Pump | result oval + remarks line | as above | not indicated on form | not on blank master |

### HOSE REEL DRUM — repeatable_table

Type selector above the table: `Swing Type` (oval) / `Fixed Type` (oval) — pick one.

Table columns, left to right:

| column key | printed header | control | allowed values | notes |
|---|---|---|---|---|
| no | No. | write-in box | free (e.g. `1`, `2 - 3`) | technicians group multiple units per row |
| location | Location | write-in, printed as `( ____ )` | free text | |
| drum | Drum | oval | hand mark | |
| hose | Hose | oval | hand mark | |
| nozzle | Nozzle | oval | hand mark | |
| valve | Valve | oval | hand mark | |
| nozzle_box | Nozzle Box | oval | hand mark | header prints as "Nozzle" over "Box" |
| remarks | Remarks:- | ruled line | free text | |

Row count: blank master prints **12** empty rows. MAK SITI used 7; Hokuden Zone 1 used 4,
Zone 2 rows numbered 8–17, Zone 3 rows numbered 18–32.

### Comments — free text

`Comments :` + ~5 ruled lines. MAK SITI overflowed into the margin below the legend.

## Result legend

**Blank master p.3, verbatim (page footer):**

```
Remarks :-      ( / )  In Good Working Condition                   ( X )  In Poor Working Condition
```

**Hokuden Zone 1/2/3 p.4, verbatim (page footer):**

```
Remarks :-        ( / )  In Good Working Condition                    ( X )  In Poor Working Condition
```

No `(Red)` on the hose reel page in either revision. See [README](README.md) for the
conflicting Hokuden cover legend sheet.

## Ambiguities

- Whether "Nozzle Box" is one column or two ("Nozzle" / "Box") — it prints as two stacked
  words above a single oval; transcribed here as one column `nozzle_box`.
- No field marked mandatory.
- `Swing Type` / `Fixed Type` is drawn as two ovals with no printed instruction that
  exactly one must be chosen.
- MAK SITI wrote `N/A` inside the `Nozzle Box` ovals for several rows; not defined by the
  page legend.
- Blank master's PUMP HOUSE row set is shorter than the sprinkler page's (no
  "Manual Start ...", no "Correct Duty Pump Cut In At", no "Correct Operation Of Battery
  Charging Alternator", no "Pump Run / Phase Failure ..."). Transcribed as printed; no
  attempt to reconcile with the sprinkler page.
