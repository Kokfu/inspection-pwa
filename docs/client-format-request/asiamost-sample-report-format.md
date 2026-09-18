# Client-requested report format — Asiamost Engineering sample

> **What this is:** a transcription of `C:\Users\kokfu\Downloads\Project\Sample\PDF Sample Format.pdf`
> (1.0 MB, 14 scanned pages, image-only — no embedded text). It is **not an MFE form** and not
> one of the five paper source reports in [`../paper-forms/`](../paper-forms/README.md). It is a
> **competitor's** service report — *Asiamost Engineering Sdn. Bhd.* — for their customer
> *Super Food Specialist (M) Sdn. Bhd.*, dated **28 January 2026**, report
> `AM/SER/SFSMSB/SHAH/Q170326`.
>
> **Why it is here:** the client handed this over as the **layout / presentation they want MFE's
> own final report to look like**, applied to MFE's existing systems. Use this file as the
> reference when a prompt says "match the sample PDF format". The *data model* stays MFE's V7; only
> the **document structure, ordering, and wording conventions** below are what the client is asking
> for.

---

## 1. Format takeaways (the part that matters for "apply this format")

| Aspect | What the sample does |
|---|---|
| **Orientation** | Landscape, A4. Every system page is a wide table. |
| **Running header** | Customer name, right-aligned, on **every** page (`SUPER FOOD SPECIALIST (M) SDN. BHD.`). |
| **Running footer** | `N | P a g e` bottom-right on every page. |
| **Page 1** | Cover: contractor letterhead + logo, a **label/value client-info block** (11 rows), a 3-column **confirmation & signature** table (Technician / Contractor / Customer), a `NOTE :-` bullet list, and a `Customer satisfaction/comment` row with Excellent / Satisfactory / Not satisfactory cells. |
| **Page 2** | **`SUMMARY OF TESTING`** — a single index table: `NO. | TEST DESCRIPTION | PAGE | FREQUENCY | CONDITION`, one row per system page, followed by a 9-point `REMARK :-` list. The last remark defines the condition vocabulary. |
| **Condition vocabulary** (3-state, whole-system) | `GOOD CONDITIONS` = all in order, ready to use · `REFER DETAIL PAGE` = minor defect, still usable in a fire · `FAILED` = major defect, system out of order. Free-text can be appended (`MAJOR FAILED-MAIN VALVE CLOSED-NO WATER SPRINKLER DURING EMERGENCY`). |
| **Per-system page body** | A `DESCRIPTION | INSPECTION & TEST | REQUIRED/UNIT | STATUS` grid, **or** a purpose-built columnar table (pumps, tanks, hydrant, hose reel, break glass). `REQUIRED/UNIT` states the expected value or the unit; `STATUS` is the measured/observed value — not a tick. Values are literal: `ON`, `OK`, `N/A`, `OPENED`, `SAFETY SEALED`, `25.5`, `1/2`, `FAILED`. |
| **Per-system footer strip** | `INSPECTION DATE : <date>` + a row of technician-name columns (here `FAROUQ | MUSTAKIM | DZUL HANIF | SYAWAL | FAIZUAN` + blanks) for initials, then the **title of the next page** printed at the very bottom. |
| **`REMARK :` block** | Under every system table. Usually a numbered list of **defective-component counts** (`HOSE X 15`, `NOZZLE X 4`, `LOCK SET CABINET X 7`) or short defect notes. This is where technicians dump the detail — same behaviour the MFE paper forms show. |
| **Ratio cells** | Component condition is written as `good/total` per unit (`1/2` = 1 of 2 OK). |
| **Merged cells** | Used freely to say "not applicable to this column" (`NOT REQUIRED FOR ELECTRIC PUMP`, `MANUAL OFF`, `CLEARED`, `N/A`). |

Page numbers on the sample run 1–20 (per the Summary), but **the supplied PDF stops at page 14**
(Manual Break Glass). Pages 15–20 (CO2 ×3, Wet Riser, Fire Roller Shutter, Sprinkler Flow Test)
are referenced but not included.

> **AI reader: you do not need to open the PDF.** §1 + §1A are the format spec, §2 is the
> verbatim content of every page, §3 maps it to MFE's model, §4 is the gap against MFE's current
> generator. The scans were re-checked against this file on 2026-09-17.

---

## 1A. Feature specification — what a "complete, formal" MFE PDF must have

Every feature seen in the sample, with an ID so build prompts and reviews can cite it
(`implement F-C3`). "Sample evidence" names the page(s) in §2. Where MFE differs on purpose
(MFE branding, photos) it says so.

### Document-wide (F-D)

| ID | Feature | Rule | Sample evidence |
|---|---|---|---|
| F-D1 | Paper | A4 **landscape** for all pages, cover included. | all |
| F-D2 | Running header | Customer name, UPPERCASE, right-aligned, light grey, top of **every** page. No contractor name in the running header. | all |
| F-D3 | Running footer | `N \| P a g e` (page number bold, then a vertical bar, then letter-spaced "Page"), bottom-right, every page. | all |
| F-D4 | Grid tables everywhere | All content is ruled tables with 1 px black borders; no free-floating `Label: value` text. Header row bold UPPERCASE. | 3–14 |
| F-D5 | UPPERCASE content | Labels **and** values printed in capitals. | all |
| F-D6 | Merged cells | Allowed both across columns (one value for several units, e.g. `NOT REQUIRED FOR ELECTRIC PUMP`, `MANUAL OFF`, `CLEARED`) and down rows (group label in `DESCRIPTION` spanning its sub-rows). | 3, 6, 10 |
| F-D7 | Literal values | Status cells hold the real reading/word (`ON`, `OK`, `N/A`, `OPENED`, `SAFETY SEAL`, `25.5`, `1/2`, `FAILED`), never a tick mark. Empty/unknown = `-`. | 3–14 |
| F-D8 | Table page flow | A system table may continue on the next page; its header row repeats. A new system always starts on a new page. | 13, 14 |
| F-D9 | Photos (MFE addition) | Sample has none. MFE keeps V7 photo evidence, placed after that system's `REMARK` block, each with a caption. | — |

### Cover page — page 1 (F-C)

| ID | Feature | Rule | Sample evidence |
|---|---|---|---|
| F-C1 | Letterhead | Company legal name + registration no. (bold), full address, `Tel : … Fax : …`, centred, plus the company **logo** centred above/beside it. For MFE: MFE's own name, reg. no., address, logo. | 1 |
| F-C2 | Document title | `FIRE PROTECTION SYSTEM MAINTENANCE CHECKLIST`, bold, centred, under the letterhead. | 1 |
| F-C3 | Client-info table | 2-column label/value table, 11 rows in this order: `CLIENT` (bold) · `ADDRESS` · `PHONE & FAX` · `CONTRACT NO.` · `FREQUENCY` · `DATE OF SERVICE` · `REPORT NO.` · `CONTACT PERSON` · `TEST LEADER` · `FC EXPIRED DATE` · `DELIVERY ORDER`. Blank rows still print. | 1 |
| F-C4 | Confirmation statement | Bold underlined line: `WE HEREBY CONFIRM THAT THE ATTACHED LIST WAS TRUE DURING INSPECTION / TESTING.` | 1 |
| F-C5 | Signature table | 3 equal columns with bold headers: `TECHNICIAN (<CONTRACTOR>)` · `<CONTRACTOR>` · `<CUSTOMER NAME>`. Tall body row: technician names listed in col 1; contractor signature + company stamp + name underlined + company in brackets in col 2; col 3 left empty for customer signature & stamp. MFE can place captured e-signatures here. | 1 |
| F-C6 | `NOTE :-` list | Bulleted standard terms (report delivery, consumables replaced on site, extra work charged separately, no liability for areas not accessible, complaint hotline with name). Text is company-configurable. | 1 |
| F-C7 | Customer satisfaction row | Table: title row `Customer satisfaction/comment`, then 3 equal cells `Excellent` · `Satisfactory` · `Not satisfactory` (tick boxes). | 1 |

### Summary page — page 2 (F-S)

| ID | Feature | Rule | Sample evidence |
|---|---|---|---|
| F-S1 | Title | `SUMMARY OF TESTING`, bold, top-left. | 2 |
| F-S2 | Index table | Columns `NO. \| TEST DESCRIPTION \| PAGE \| FREQUENCY \| CONDITION`. One row **per system instance page** (e.g. `CO2 SYSTEM – 1/2/3` are three rows). `PAGE` = real page number where that system starts (needs two-pass render or pre-computed page map). | 2 |
| F-S3 | Per-row frequency | Each row has its own frequency (`QUARTERLY`, `ANNUALLY`) — not one value for the report. | 2 |
| F-S4 | Condition vocabulary | Exactly `GOOD CONDITIONS` / `REFER DETAIL PAGE` / `FAILED`, optionally followed by a free-text tail (`MAJOR FAILED-MAIN VALVE CLOSED-NO WATER SPRINKLER DURING EMERGENCY`). | 2 |
| F-S5 | FAILED highlighted | On the paper copy every `FAILED` cell is hand-circled. Generator equivalent: `FAILED` bold + red (and `REFER DETAIL PAGE` bold/amber). | 2 |
| F-S6 | `REMARK :-` list | Numbered standing advice for the customer (italic): battery change, CO2 weigh test, don't block equipment/exits, emergency/exit lights, don't use fire water, don't isolate panels, reopen valves after renovation, refill extinguishers. Company-configurable. | 2 |
| F-S7 | Condition legend | Last remark item = `SUMMARY REMARK INDICATOR :` with the 3 definitions (see §2 page 2 item 9). Always printed. | 2 |

### Per-system page — pages 3–14 (F-P)

| ID | Feature | Rule | Sample evidence |
|---|---|---|---|
| F-P1 | System title | Bold UPPERCASE title with location in brackets, e.g. `MAIN FIRE ALARM PANEL (GUARD HOUSE)`, `DELUGE PREACTION VALVE – 01 (FINISHED GOODS)`. (On the scan this title sits at the bottom of the previous sheet — a Word page-flow artefact; generate it at the **top** of the system's own page.) | 2→3, 6→7 |
| F-P2 | Safety advisory bullets | Optional italic grey `*` bullet lines above the table (e.g. panel: don't isolate switches, don't downsize battery Ah, don't remove cards, no EOL resistor at panel). Per system type. | 3 |
| F-P3 | Layout A — checklist grid | `DESCRIPTION \| INSPECTION & TEST \| REQUIRED/UNIT \| STATUS`. DESCRIPTION = merged group cell; INSPECTION & TEST may split into a nested sub-column (`FAULT TEST` → `AC FAILED / CHARGER FAILED / BATTERY FAILED`). | 3, 4, 8, 9 |
| F-P4 | Required vs actual | `REQUIRED/UNIT` holds the expected value (`ON`, `OK`, `OPENED`, `FULL`) **or** the unit (`VDC`, `AMPERE`, `(psi)`, `BAR`, `UNIT/MIN`, `AH`); printed **bold**. `STATUS` holds the observed value. `-` when neither applies. | 3, 6 |
| F-P5 | Layout B — multi-unit columns | `DESCRIPTION \| REQUIRED/UNIT \| <UNIT 1> \| <UNIT 2> \| <UNIT 3>` (pumps: JOCKEY / DUTY / STANDBY). Rows that don't apply to some units → merged cell with a reason. | 6, 7 |
| F-P6 | Layout C — asset header + valve table | Top label/value block (`TYPE OF TANK`, `DIMENSION OF TANK`, `CAPACITY`), then `NO \| VALVE \| OPENED \| CLOSED \| SEALED/LOCKED \| LEAKAGE STATUS \| REMARK`. Non-valve rows (float valve, water level, ladder) merge the middle columns. | 10, 11 |
| F-P7 | Layout D — device register | One row per point: `NO \| LOCATION \| ACCESSIBLE \| <component columns…> \| REMARK`, with grouped super-headers (`RUBBER INTACT` over `VALVE \| HOSE`). Per-row `REMARK` = row verdict (`GOOD CONDITIONS` / `FAILED` / short text). | 12, 13, 14 |
| F-P8 | Ratio cells | Component condition as `good/total` (`1/2`, `0/1`). | 12 |
| F-P9 | Layout E — two-block page | Several small tables on one page with their own header rows (`POWER SYSTEM \| ACTUAL \| TEST` then `ZONE & LOCATION \| ZONE \| TEST`). | 5 |
| F-P10 | `REMARK :` block | Always printed under the table (blank if nothing). Numbered list of either defect notes/actions (`PLEASE REFILL DIESEL OIL`) or a **parts-needed tally** `<PART> X <qty>` (`HOSE X 15`, `NOZZLE X 4`), alphabetical. | 3–14 |
| F-P11 | Inspection strip | Table at the bottom of every system page: row 1 `INSPECTION DATE :` + date; row 2 = technician name columns (all team members) + spare blank columns for initials. | 3–14 |
| F-P12 | Row numbering | Register tables number rows `1..n` continuously, across page breaks. | 13, 14 |
| F-P13 | Bell-only / N/A rows | Rows that don't apply fill with `-` rather than being omitted, so the register matches the site's device list. | 14 |

---

## 2. Page-by-page transcription

### Page 1 — Cover

**Letterhead:** `ASIAMOST ENGINEERING SDN.BHD. (411425-v)` · `NO. 5 (PLOT 7), JALAN I-PARK SAC2,
KAWASAN PERINDUSTRIAN I-PARK SAC, 81400 SENAI, JOHOR DARUL TAKZIM.` · `(Tel : 07-5959666
Fax : 07-5959628)`. Large stylised "A" logo, centred.

**Title:** `FIRE PROTECTION SYSTEM MAINTENANCE CHECKLIST`

**Client-info block** (label | value):

| Label | Value |
|---|---|
| CLIENT | SUPER FOOD SPECIALIST (M) SDN. BHD. |
| ADDRESS | LOT 7643, MUKIM PLENTONG, 81750 MASAI, JOHOR DARUL TAKZIM. |
| PHONE & FAX | TEL : 07-3862179    FAX : 07-3883573 |
| CONTRACT NO. | AESB/SUPER-SP/SH/C01 |
| FREQUENCY | QUARTERLY |
| DATE OF SERVICE | 28 JANUARY 2026 |
| REPORT NO. | AM/SER/SFSMSB/SHAH/Q170326 |
| CONTACT PERSON | MR. VIKNESVARAN |
| TEST LEADER | MR. WAN MOHAMAD FAROUQ |
| FC EXPIRED DATE | *(blank)* |
| DELIVERY ORDER | 06262 |

**`WE HEREBY CONFIRM THAT THE ATTACHED LIST WAS TRUE DURING INSPECTION / TESTING.`** — 3-column table:

| TECHNICIAN (ASIAMOST ENGINEERING SDN BHD) | ASIAMOST ENGINEERING SDN BHD | SUPERFOOD SPECIALIST (M) SDN BHD |
|---|---|---|
| FAIZUAN · SYAWAL | *(signature + company stamp)* WAN MOHD FAROUQ | *(blank — customer signature & stamp)* |

**`NOTE :-`**
1. CHECKLIST WILL BE SUBMIT TO CLIENT DIRECT TO IN CHARGE PERSONS BY HAND OR BY EMAIL
2. FILAMENT TYPE BULB WILL BE REPLACE IMMEDIATELY FOR PUMP STARTER PANEL, GAS EXTINGUISHING LIGHT BULB, GLASSES FOR BREAK GLASS BRAND DEMCO DURING SERVICE.
3. ALL TYPE OF PIPING, WIRING, CONDUCTIVITI TEST & RECTIFICATION ANY TROUBLE, PARTS REPLACEMENT WILL BE CHARGE SEPARATELY.
4. WE WILL NOT RESPONSIBILITY AFTER THE INSPECTION DATE IF THE COMPANY NOT ALLOWED FOR CHECKING AT ANY ROOM OR AREA AND ALARM BELL TESTING
5. PLEASE CALL 016-7713970 (MOHD SHAFIE) IF FOUND ANY COMPLAINT DURING SERVICING PROGRESS AT YOUR PREMISE

**`Customer satisfaction/comment`** — a single row with three tick cells: `Excellent` | `Satisfactory` | `Not satisfactory` (all blank on this copy).

---

### Page 2 — `SUMMARY OF TESTING`

| NO. | TEST DESCRIPTION | PAGE | FREQUENCY | CONDITION |
|---|---|---|---|---|
| 1 | MAIN FIRE ALARM PANEL | 3 | QUARTERLY | GOOD CONDITIONS |
| 2 | SUB FIRE ALARM PANEL-1 | 4 | QUARTERLY | FAILED |
| 3 | FIREMAN INTERCOM | 5 | QUARTERLY | GOOD CONDITIONS |
| 4 | FIRE PUMP SETS – SPRINKLER | 6 | QUARTERLY | REFER DETAIL PAGE |
| 5 | FIRE PUMP SETS – WET RISER | 7 | QUARTERLY | GOOD CONDITIONS |
| 6 | DELUGE PRE-ACTION SYSTEM 1 | 8 | QUARTERLY | MAJOR FAILED-MAIN VALVE CLOSED-NO WATER SPRINKLER DURING EMERGENCY |
| 7 | DELUGE PRE-ACTION SYSTEM 2 | 9 | QUARTERLY | GOOD CONDITIONS |
| 8 | FIRE TANK - SPRINKLER | 10 | QUARTERLY | GOOD CONDITIONS |
| 9 | FIRE TANK – WET RISER | 11 | QUARTERLY | GOOD CONDITIONS |
| 10 | FIRE HYDRANT | 12 | QUARTERLY | FAILED |
| 11 | HOSE REEL SYSTEM | 13 | QUARTERLY | GOOD CONDITIONS |
| 12 | MANUAL BREAK GLASS | 14 | QUARTERLY | FAILED |
| 13 | CO2 SYSTEM – 1 | 15 | QUARTERLY | FAILED |
| 14 | CO2 SYSTEM – 2 | 16 | QUARTERLY | FAILED |
| 15 | CO2 SYSTEM – 3 | 17 | QUARTERLY | FAILED |
| 16 | WET RISER | 18 | QUARTERLY | GOOD CONDITIONS |
| 17 | FIRE ROLLER SHUTTER | 19 | QUARTERLY | FAILED |
| 18 | SPRINKLER FLOW TEST (YEARLY TEST) | 20 | ANNUALLY | GOOD CONDITIONS |

**`REMARK :-`**
1. PLEASE CHANGE NEW BATTERY AFTER 1 YEAR INSTALLATIONS TO PREVENT LOW VOLTAGE OPERATION DURING PRIMARY POWER SUPPLY FAILURE.
2. RECOMMENDED WEIGH TEST FOR 45KG GAS CYLINDER EVERY 10 YEARS TO ENSURE SUFFICIENT VOLUME OF CARBON DIOXIDE GAS IN EACH CYLINDER.
3. DO NOT BLOCKING FIRE PROTECTION EQUIPMENT, FIRE ALARM DEVICES, EXIT DOOR, BOMBA LIFT LOBBY ENTRANCE, EMERGENCY STAIRCASE, ESCAPE WAY AND PLEASE AVOID USING PADLOCK AT ALL EXIT DOOR.
4. EMERGENCY LIGHT AND EXIT LAMP (KELUAR SIGN) MUST BE GOOD CONDITION.
5. DO NOT USE FIRE PROTECTION SYSTEM WATER SUCH FIRE HOSE REEL WET RISER, FIRE TANK STORAGE AND HYDRANT EXCEPT FOR FIRE EMERGENCY.
6. DO NOT DISABLE OR SWITCH OFF ANY SWITCH AT FIRE ALARM PANEL, GAS EXTINGUISHING PANEL, SMOKE VENTILATION PANEL, FIRE PUMP SET, PRE-ACTION SYSTEM CONTROL PANEL WITHOUT PERMISSION.
7. PLEASE ENSURE ALL CONTROL VALVE OPENED CONDITION AFTER SHUT DOWN FOR RENOVATION WORKS.
8. PLEASE IMMEDIEATLY REFILL ANY PORTABLE TYPE OF FIRE EXTINGUISHER AFTER USE.
9. **SUMMARY REMARK INDICATOR :**
   1. `GOOD CONDITIONS` — ALL SYSTEM IN GOOD CONDITIONS AND READY TO USE
   2. `REFER DETAIL PAGE` — MINOR DEFECT FOUND FROM THE DEVICES OR EQUIPMENT BUT READY TO USE DURING FIRE EMERGENCY
   3. `FAILED` — MAJOR DEFECT FOUND OF DEVICES OR PARTS IN THE GROUP OF SYSTEM OUT OF ORDER AND FAILURE TO USE DURING EMERGENCY

---

### Page 3 — MAIN FIRE ALARM PANEL (GUARD HOUSE)

Faint header bullets: *DO NOT ISOLATE ANY SWITCH AT CONTROL PANEL WITHOUT PERMISSION · DO NOT
CHANGE BATTERY BELOW THAN THE ORIGINAL SIZE OF AMPERE HOUR · DO NOT REMOVE ANY CARD FROM CONTROL
PANEL · DO NOT ALLOW ANY END OF LINE RESISTOR INSTALL AT CONTROL PANEL OUT GOING CONNECTOR.*

| DESCRIPTION | INSPECTION & TEST | REQUIRED/UNIT | STATUS |
|---|---|---|---|
| PANEL | MANUFACTURER | – | PROGRAM ELECTRONIC |
| | TOTAL ZONE | – | 4 ZONE |
| | SPARE | – | 1 ZONE |
| MASTER CONTROL | POWER SUPPLY | – | ON |
| | CHARGER | ON | ON |
| | TEST LAMP/LED | ON | ON |
| | MASTER BELL | ON | ON |
| | FAULT TEST — AC FAILED | OK | OK |
| | FAULT TEST — CHARGER FAILED | OK | OK |
| | FAULT TEST — BATTERY FAILED | OK | OK |
| BATTERY & CHARGING SYSTEM | BATTERY MANUFACTURER / AMPERE HOUR / INSTALL DATE | – | – / – / – |
| | CHARGING VOLT | VDC | 25.5 |
| | CHARGING CURRENT | AMPERE | 0.1 |
| ZONE SWITCH TEST (ALL ZONE) | ISOLATED | OK | OK |
| | FAULT | OK | OK |
| | ALARM | OK | OK |
| AUXILIARY TRIPPING (VOLTAGE TEST) | AHU TRIP | VDC | N/A |
| | LIFT TRIP | VDC | N/A |
| | SMOKE VENTILATION | VDC | N/A |
| FIU SIGNAL TO OTHERS PANEL | | ON | N/A |
| CMS SYSTEM POWER SUPPLY | | ON | N/A |

`REMARK:` *(blank)*
Footer: `INSPECTION DATE : 28 JANUARY 2026` · name row `FAROUQ | MUSTAKIM | DZUL HANIF | SYAWAL | FAIZUAN | – | – | –`.

---

### Page 4 — SUB FIRE ALARM PANEL-1

Same grid as page 3.

| Group | Row | REQUIRED/UNIT | STATUS |
|---|---|---|---|
| PANEL | MANUFACTURER | – | PROGRAM ELECTRONIC |
| | TOTAL ZONE | – | 132 ZONE |
| | SPARE | – | 31 ZONE |
| MASTER CONTROL | POWER SUPPLY | ON | ON |
| | CHARGER | ON | ON |
| | TEST LAMP/LED | ON | ON |
| | MASTER BELL | ON | ON |
| | FAULT TEST — AC FAILED | OK | OK |
| | FAULT TEST — CHARGER FAILED | OK | OK |
| | FAULT TEST — BATTERY FAILED | OK | OK |
| BATTERY & CHARGING SYSTEM | BATTERY (MFG/AH/DATE) | MFG/AH/DATE | SCAREDSUN 45 NOV25 |
| | CHARGING VOLT | VDC | 24.0 |
| | CHARGING CURRENT | AMPERE | 0.1 |
| ZONE SWITCH TEST (ALL ZONE) | ISOLATED | OK | OK |
| | FAULT | OK | OK |
| | ALARM | OK | OK |
| AUXILIARY TRIPPING | AHU TRIP | OK | OK |
| | LIFT TRIP | OK | OK |
| | SMOKE VENTILATION | OK | OK |
| FIU SIGNAL TO MFAP | | ON | ZONE 1 AT GUARD HOUSE |
| SPKA SYSTEM | | ON | ON |

`REMARK:`
1. ALL PUMP SUPERVISORY SIGNAL FAILED – PLEASE REWIRING NEW CABLE TO FIRE PUMP ROOM
2. BUZZER SPOILED

---

### Page 5 — FIREMAN INTERCOM

**Block A — POWER SYSTEM** | ACTUAL | TEST

| Row | ACTUAL | TEST |
|---|---|---|
| A/C SUPPLY | ON | ON |
| D/C | ON | ON |
| BATTERY & CHARGING SYSTEM — CHARGER | ON | ON |
| BATTERY & CHARGING SYSTEM — CHARGING VOLTAGE/CURRENT | VDC/AMPERE | 25.0 |
| BATTERY & CHARGING SYSTEM — BATTERY | MFG/AMPERE HOUR/INSTALL DATE | GENESIS/12/JUL21 |

**Block B — FIREMAN INTERCOM ZONE & LOCATION** | ZONE | TEST

| NO | LOCATION | ZONE | TEST |
|---|---|---|---|
| 1 | FIRE PUMP ROOM | 10 | GOOD CONDITIONS |
| 2 | LIFT LOBBY GROUND FLOOR | 1 | GOOD CONDITIONS |
| 3 | LIFT LOBBY 1 ST FLOOR | 2 | GOOD CONDITIONS |
| 4 | LIFT LOBBY 2ND FLOOR | 3 | GOOD CONDITIONS |
| 5 | LIFT LOBBY (M1) | 4 | GOOD CONDITIONS |
| 6 | LIFT LOBBY (M2) | 5 | GOOD CONDITIONS |
| 7 | LIFT MOTOR ROOM | 6 | GOOD CONDITIONS |
| 8 | LIFT LOBBY (6TH FLOOR) | 7 | GOOD CONDITIONS |
| 9 | LIFT LOBBY (5TH FLOOR) | 8 | GOOD CONDITIONS |
| 10 | LIFT LOBBY (3RD FLOOR) | 9 | GOOD CONDITIONS |

`REMARK :` *(blank)*

---

### Page 6 — FIRE PUMP – SPRINKLER

Columns: **row label | REQUIRED/UNIT | JOCKEY PUMP | DUTY PUMP | STANDBY PUMP**

| Row | REQUIRED/UNIT | JOCKEY PUMP | DUTY PUMP | STANDBY PUMP |
|---|---|---|---|---|
| MANUFACTURER/MODEL | – | CALPEDA | TECO/AEEBKB/100HP | DOOSAN/D034TI(G)/110HP |
| PUMP DRIVEN | – | MVX40-811/5.5HP | EBSRAY 100/20 | EBSRAY 100/20 |
| POWER 'ON' | 'ON' | ON | ON | ON |
| INDOCATOR LIGHT 'ON' *(sic)* | 'ON' | ON | ON | ON |
| CHARGER 1 'ON' | 'ON' | *(merged: NOT REQUIRED FOR ELECTRIC PUMP)* | ON |
| CHARGER 2 'ON' | 'ON' | *(merged)* | ON |
| CHARGING VOLT & CURRENT (BATTERY 1) | VDC/AMPERE | *(merged)* | 13.0/0.1 |
| CHARGING VOLT & CURRENT (BATTERY 2) | VDC/AMPERE | *(merged)* | 13.2/0.1 |
| BATTERY (1) MFG./AMPERE HOUR/INSTALL DATE | AH | *(merged)* | SCAREDSUN/65/MAR25 |
| BATTERY (2) MFG./AMPERE HOUR/INSTALL DATE | AH | *(merged)* | SCAREDSUN/65/MAR25 |
| RADIATOR | FULL | *(merged)* | FULL |
| LUBRICANT OIL | GOOD CONDITIONS | *(merged)* | GOOD CONDITIONS |
| DIESEL OIL LEVEL | FULL | *(merged)* | 1/2 |
| MANUAL TEST | OK | OK | OK | OK |
| CUT – IN PRESSURE | (psi) | 119 | 76 | 54 |
| CUT – OUT PRESSURE | (psi) | 154 | *(merged: MANUAL OFF)* |
| RUNNING TIME – LAST VISIT | UNIT/MIN | 159647 | 6357 | 295 |
| RUNNING TIME – START | UNIT/MIN | 159647 | 6357 | 295 |
| RUNNING TIME – STOP | UNIT/MIN | 159655 | 6362 | 305 |
| LEAKAGE STATUS | NO | NO | NO | NO |
| VALVE OPENED (IN-LET/OUT-LET PUMP) | OPENED | OPENED | OPENED | OPENED |
| VALVE SECURED | SAFETY SEAL/PAD LOCK | SAFETY SEAL | SAFETY SEAL | SAFETY SEAL |
| VENTILATION/OBSTRUCTIONS | CLEAR | *(merged: CLEARED)* |
| SIGNAL TO MFAP (AC FAILED & ALL SIGNAL) | OK | OK | OK | OK |

`REMARK :`
1. NEW FIRE ALARM PANEL INSTALL BY STI AT GUARD HOUSE WITH ALL SUPERVISORY SIGNAL
2. JOCKEY PUMP HAS RUNNING FROM LAST VISIT – 220 UNIT @4 HOUR – DO NOT USING HOSE REEL SYSTEM
3. PLEASE REFILL DIESEL OIL

---

### Page 7 — FIRE PUMP – WET RISER

Same column layout as page 6.

| Row | REQUIRED/UNIT | JOCKEY PUMP | DUTY PUMP | STANDBY PUMP |
|---|---|---|---|---|
| MANUFACTURER/MODEL | – | CALPEDA 5HP | TECO/AEEBKB/60HP | DAEWOO/DB33/72PS |
| PUMP DRIVEN | – | – | EBSRAY 65/32 | EBSRAY 65/32 |
| POWER 'ON' | 'ON' | ON | ON | ON |
| INDOCATOR LIGHT 'ON' | 'ON' | ON | ON | ON |
| CHARGER 1 'ON' | 'ON' | *(merged: N/A)* | ON |
| CHARGER 2 'ON' | 'ON' | *(merged)* | – |
| CHARGING VOLT & CURRENT (BATTERY 1) | VDC/AMPERE | *(merged)* | 13.5/0.1 |
| CHARGING VOLT & CURRENT (BATTERY 2) | VDC/AMPERE | *(merged)* | – |
| BATTERY (1) MFG./AMPERE HOUR/INSTALL DATE | AH | *(merged)* | SCAREDSUN/65/MAR25 |
| BATTERY (2) MFG./AMPERE HOUR/INSTALL DATE | AH | *(merged)* | – |
| RADIATOR | FULL | *(merged)* | FULL |
| LUBRICANT OIL | GOOD CONDITIONS | *(merged)* | GOOD CONDITIONS |
| DIESEL OIL LEVEL | FULL | *(merged)* | FULL |
| MANUAL TEST | OK | OK | OK | OK |
| CUT – IN PRESSURE | (psi) | 100 | 60 | 40 |
| CUT – OUT PRESSURE | (psi) | 145 | *(merged: MANUAL OFF)* |
| RUNNING TIME – LAST VISIT | UNIT/MIN | 2168 | 970 | 437 |
| RUNNING TIME – START | UNIT/MIN | 2168 | 970 | 437 |
| RUNNING TIME – STOP | UNIT/MIN | 2174 | 975 | 442 |
| LEAKAGE STATUS | NO | NO | NO | NO |
| VALVE OPENED (IN-LET/OUT-LET PUMP) | OPENED | OPENED | OPENED | OPENED |
| VALVE SECURED | SAFETY SEAL/PAD LOCK | SAFETY SEAL | SAFETY SEAL | SAFETY SEAL |
| VENTILATION/OBSTRUCTIONS | CLEAR | *(merged: CLEARED)* |
| SIGNAL TO MFAP (AC FAILED & ALL SIGNAL) | OK | OK | OK | OK |

`REMARK :` *(blank)*

---

### Page 8 — DELUGE PREACTION VALVE – 01 (FINISHED GOODS)

| DESCRIPTION | INSPECTION & TEST | REQUIRED/UNIT | STATUS |
|---|---|---|---|
| PANEL | MANUFACTURER | – | PROGRAM ELECTRONIC |
| | TOTAL ZONE | – | 6 ZONE |
| | SPARE | – | 4 ZONE |
| MASTER CONTROL | POWER SUPPLY | ON | ON |
| | CHARGER | ON | ON |
| | TEST LAMP/LED | ON | ON |
| | MASTER BELL | ON | ON |
| | FAULT TEST (3 rows) | OK | OK / OK / OK |
| BATTERY & CHARGING SYSTEM | BATTERY MANUFACTURER / AMPERE HOUR / INSTALL DATE | – | SCARED SUN 7 JUNE 25 |
| | CHARGING VOLT | VDC | 25.0 |
| | CHARGING CURRENT | AMPERE | 0.1 |
| ZONE SWITCH TEST | ISOLATED / FAULT / ALARM | OK | OK / OK / OK |
| AUXILIARY TRIPPING (VOLTAGE TEST) | AHU TRIP | VDC | N/A |
| | LIFT TRIP | VDC | N/A |
| | SMOKE VENTILATION | FAILED | N/A |
| FIU SIGNAL TO OTHERS PANEL | | ON | ON |
| PREACTION VALVE | MAIN VALVE (OPENED/SEALED) | OPENED | OPENED |
| | DELUGE VALVE (CONDITIONS) | GOOD CONDITIONS | GOOD CONDITIONS |
| | ALARM GONG VALVE (OPENED/FUNCTIONED) | OPENED | OPENED/FUNCTIONED |
| | AIR COMPRESSOR POWER SUPPLY (ON) | ON | ON |
| | AIR PRESSURE (BAR) | BAR | – |
| | EMERGENCY RELEASE DEVICES (CONDITIONS/SECURED) | OK | OK |
| | WATER PRESSURE (BAR) | BAR | – |

`REMARK :`
1. DO NOT CLOSE MAIN CONTROL VALVE (VALVE IS SECURE BY ASIAMOST ENGINEERING SAFETY SEAL-PANEL REPAIR BY STI)

---

### Page 9 — DELUGE PREACTION VALVE – 02 (GREEN BEAN)

Same grid as page 8.

| Group | Row | REQUIRED/UNIT | STATUS |
|---|---|---|---|
| PANEL | MANUFACTURER | – | PROGRAM ELECTRONIC |
| | TOTAL ZONE | – | 8 ZONE |
| | SPARE | – | 4 ZONE |
| MASTER CONTROL | POWER SUPPLY / CHARGER / TEST LAMP/LED / MASTER BELL | ON | ON (all) |
| | FAULT TEST (3 rows) | OK | OK / OK / OK |
| BATTERY & CHARGING SYSTEM | BATTERY MANUFACTURER / AMPERE HOUR / INSTALL DATE | – | SCARED SUN 7 JUNE 25 |
| | CHARGING VOLT | VDC | 25.0 |
| | CHARGING CURRENT | AMPERE | 0.1 |
| ZONE SWITCH TEST | ISOLATED / FAULT / ALARM | OK | OK / OK / OK |
| AUXILIARY TRIPPING (VOLTAGE TEST) | AHU TRIP / LIFT TRIP / SMOKE VENTILATION | VDC | N/A / N/A / N/A |
| FIU SIGNAL TO OTHERS PANEL | | ON | ON |
| PREACTION VALVE | MAIN VALVE (OPENED/SEALED) | OPENED | OPENED |
| | DELUGE VALVE (CONDITIONS) | GOOD CONDITIONS | GOOD CONDITIONS |
| | ALARM GONG VALVE (OPENED/FUNCTIONED) | OPENED/FUNCTIONED | OPENED |
| | AIR COMPRESSOR POWER SUPPLY (ON) | ON | ON |
| | AIR PRESSURE (BAR) | – | 0 |
| | EMERGENCY RELEASE DEVICES (CONDITIONS/SECURED) | OK | OK |
| | WATER PRESSURE (BAR) | – | 0 |

`REMARK :`
1. DO NOT CLOSE MAIN CONTROL VALVE (VALVE IS SECURE BY ASIAMOST ENGINEERING SAFETY SEAL-PANEL REPAIR BY STI)

---

### Page 10 — FIRE TANK – SPRINKLER

| TYPE OF TANK | HOT DIPED GALVANISED |
|---|---|
| DIMENSION OF TANK | 40 FT X 24 FT X 12 FT (H) |
| CAPACITY | 86175 GALLONS |

| NO | VALVE | OPENED | CLOSED | SEALED / LOCKED | LEAKAGE STATUS | REMARK |
|---|---|---|---|---|---|---|
| 1 | TANK IN-LET (1) | YES | – | SAFETY SEALED | NO | GOOD CONDITIONS |
| 2 | TANK IN-LET (2) | YES | – | SAFETY SEALED | NO | GOOD CONDITIONS |
| 3 | TANK OUT-LET (1) | YES | – | SAFETY SEALED | NO | GOOD CONDITIONS |
| 4 | TANK OUT-LET (2) | YES | – | SAFETY SEALED | NO | GOOD CONDITIONS |
| 5 | TANK DRAIN (1) | – | YES | SAFETY SEALED | NO | GOOD CONDITIONS |
| 6 | TANK DRAIN (2) | – | YES | SAFETY SEALED | NO | GOOD CONDITIONS |
| 7 | BY-PASS | OPENED | YES | SAFETY SEALED | NO | GOOD CONDITIONS |
| 8 | WATER FLOAT VALVE 1 | *(cells merged)* | | | | GOOD CONDITIONS |
| 9 | WATER FLOAT VALVE 2 | *(merged)* | | | | GOOD CONDITIONS |
| 10 | WATER LEVEL 1 (FEET) | *(merged)* | | | | 11.0 |
| 11 | WATER LEVEL 2 (FEET) | *(merged)* | | | | 11.0 |
| 12 | INSPECTION LADDER 1 | *(merged)* | | | | GOOD CONDITIONS |
| 13 | INSPECTION LADDER 2 | *(merged)* | | | | GOOD CONDITIONS |

`REMARK:` *(blank)*

---

### Page 11 — FIRE TANK – WET RISER

Same layout as page 10.

| TYPE OF TANK | HOT DIPED GALVANISED |
|---|---|
| DIMENSION OF TANK | 24 FT X 8 FT X 12 FT (H) |
| CAPACITY | 17235 GALLONS |

Rows 1–13 identical structure and values to page 10 (all `SAFETY SEALED` / `NO` / `GOOD CONDITIONS`;
`BY-PASS` row 7 = `YES` opened; water levels `11.0` / `11.0`).
`REMARK :` *(blank)*

---

### Page 12 — FIRE HYDRANT

Columns: **NO | ACCESSIBLE | CABINET | LOCKED | HOSE | NOZZLE | VALVE CAP | RUBBER INTACT (VALVE | HOSE) | REMARK**
(component cells are `good/total` ratios)

| NO | ACCESSIBLE | CABINET | LOCKED | HOSE | NOZZLE | VALVE CAP | RUBBER VALVE | RUBBER HOSE | REMARK |
|---|---|---|---|---|---|---|---|---|---|
| 1 | YES | OK | YES | 1/2 | 0/1 | 0/2 | 0/2 | 2/2 | FAILED |
| 2 | YES | OK | YES | 1/2 | 0/1 | 0/2 | 2/2 | 2/2 | FAILED |
| 3 | YES | OK | YES | 0/2 | 1/1 | 0/2 | 2/2 | 2/2 | FAILED |
| 4 | YES | OK | YES | 2/2 | 0/1 | 0/2 | 2/2 | 2/2 | FAILED |
| 5 | YES | OK | YES | 0/2 | 1/1 | 2/2 | 2/2 | 2/2 | FAILED |
| 6 | YES | OK | YES | 0/2 | 0/1 | 2/2 | 2/2 | 2/2 | FAILED |
| 7 | YES | OK | YES | 0/2 | 1/1 | 2/2 | 2/2 | 2/2 | FAILED |
| 8 | YES | MISSING | YES | 2/2 | 0/1 | 2/2 | 1/2 | 2/2 | FAILED |
| 9 | YES | OK | YES | 2/2 | 0/1 | 2/2 | 2/2 | 2/2 | FAILED |
| 10 | YES | OK | YES | 1/2 | 1/1 | 2/2 | 2/2 | 2/2 | FAILED |
| 11 | YES | OK | YES | 1/2 | 1/1 | 2/2 | 2/2 | 2/2 | FAILED |
| 12 | YES | OK | YES | 2/2 | 1/1 | 2/2 | 2/2 | 2/2 | GOOD CONDITIONS |

`REMARK :` *(defective-component shopping list)*
1. HOSE X 15
2. LANDING VALVE X 2
3. LOCK SET CABINET X 7
4. NOZZLE X 4
5. RUBBER INTACT X 3
6. VALVE CAP X 6

---

### Page 13 — HOSE REEL SYSTEM

Columns: **NO | LOCATION | ACCESSIBLE | NOZZLE | HOSE | DRUM | VALVE | REMARK**
37 rows. Every row on this copy: `ACCESSIBLE = YES`, `NOZZLE/HOSE/DRUM/VALVE = OK`,
`REMARK = GOOD CONDITIONS`.

| NO | LOCATION |
|---|---|
| 1–7 | G FLOOR GREEN COFFEE |
| 8–9 | G FLOOR ROASTER |
| 10–11 | G FLOOR EXTRACTION |
| 12 | G FLOOR LIFT LOBBY |
| 13 | G FLOOR PRODUCTION |
| 14–18 | WAREHOUSE |
| 19 | FIRST FLOOR LIFT LOBBY |
| 20–21 | BOILER |
| 22 | SECOND FLOOR LIFT LOBBY |
| 23–25 | SECOND FLOOR PRODUCTION |
| 26 | MEZZ FLOOR 1 LIFT LOBBY |
| 27 | MEZZ FLOOR 1 PRODUCTION |
| 28 | MEZZ FLOOR 2 LIFT LOBBY |
| 29 | MEZZ FLOOR 2 PRODUCTION |
| 30 | THIRD FLOOR LIFT LOBBY |
| 31 | THIRD FLOOR PRODUCTION |
| 32 | FIFTH FLOOR LIFT LOBBY |
| 33 | FIFTH FLOOR PRODUCTION |
| 34 | SIXTH FLOOR LIFT LOBBY |
| 35 | SIXTH FLOOR PRODUCTION |
| 36 | PRAYER ROOM |
| 37 | NEW HR L1 |

`REMARK :` *(blank)*

---

### Page 14 — MANUAL BREAK GLASS

Columns: **NO | LOCATION | ACCESSIBLE | ZONE | ALARM ACTIVATE | BELL | REMARK**
41 rows.

| NO | LOCATION | ZONE | ALARM ACTIVATE | BELL | REMARK |
|---|---|---|---|---|---|
| 1–7 | GROUND FLOOR GREEN COFFEE | 1/1 … 1/7 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 8–9 | GROUND FLOOR ROASTER | 3/1, 3/2 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 10 | GROUND FLOOR EXTRACTION | 4/1 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 11 | GROUND FLOOR EXTRACTION | 4/2 | ACTIVATED | FAILED | FAILED |
| 12 | GROUND FLOOR LIFT LOBBY | 5 | ACTIVATED | FAILED | FAILED |
| 13 | GROUND FLOOR PRODUCTION | 6 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 14–16 | WAREHOUSE | 7/1, 7/2, 7/3 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 17–18 | WAREHOUSE | 8/1, 8/2 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 19 | FIRST FLOOR LIFT LOBBY | 9 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 20–21 | BOILER | 101/1, 101/2 | ACTIVATED | FAILED | FAILED |
| 22 | SECOND FLOOR LIFT LOBBY | 11 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 23 | SECOND FLOOR PRODUCTION | 12/1 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 24–25 | SECOND FLOOR PRODUCTION | 12/2, 12/3 | ACTIVATED | FAILED | FAILED |
| 26 | MEZZ. FLOOR 1 LIFT LOBBY | 13 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 27 | MEZZ. FLOOR 1 PRODUCTION | 14 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 28 | MEZZ FLOOR 2 LIFT LOBBY | 15 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 29 | MEZZ FLOOR 2 PRODUCTION | 16 | FAILED | ACTIVATE | FAILED |
| 30 | THIRD FLOOR LIFT LOBBY | 17 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 31 | THIRD FLOOR PRODUCTION | 18 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 32 | FIFT FLOOR LIFT LOBBY | 21 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 33 | FIFT FLOOR PRODUCTION | 22 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 34 | SIXTH FLOOR LIFT LOBBY | 23 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 35 | SIXTH FLOOR PRODUCTION | 24 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 36 | WAREHOUSE ROOM (BELL ONLY) | – | ACTIVATED | – | – |
| 37 | WAREHOUSE (BELL ONLY) | – | ACTIVATED | – | – |
| 38 | PRAYER ROOM | 10 | ACTIVATED | ACTIVATE | GOOD CONDITIONS |
| 39 | 4TH FLOOR LIFT LOBBY (BELL ONLY) | – | ACTIVATED | – | – |
| 40 | 4TH FLOOR PRODUCTION (BELL ONLY) | – | ACTIVATED | – | – |
| 41 | 2ND FLOOR OFFICE | 12/4 | – | – | PANEL MAJOR FAILURE |

`REMARK :`
1. ALARM SOUNDER X 4
2. ALARM BELL X 2
3. NO.29 WIRING TROUBLE

Footer of page 14 names the next (missing) page: **`GAS EXTINGUISHING SYSTEM – FM200/CARBON DIOXIDE`**.

---

## 3. How this maps onto MFE's current model (notes for the change prompt)

- The sample's **`SUMMARY OF TESTING`** page ≈ MFE's Manager Final Report summary view
  (`apps/api/src/reports/finalServiceReport.ts` / `apps/web/src/manager/ManagerFinalReportView.tsx`).
  The client wants that summary to look like this table: one row per system, page reference,
  frequency, and a single condition verdict with room for a free-text tail.
- The sample uses a **3-state whole-system verdict** (`GOOD CONDITIONS` / `REFER DETAIL PAGE` /
  `FAILED`). MFE's per-field model is **4-state** (`good` / `not_good` / `complete_repair` / `na`)
  since `d7ecc0d`. These are different axes — the sample verdict is a per-*system* roll-up, not a
  per-field state. Do not conflate them; a mapping rule (e.g. any `not_good` ⇒ system `FAILED`,
  any `complete_repair` and no `not_good` ⇒ `REFER DETAIL PAGE`) would need client confirmation.
- The sample's **`REQUIRED/UNIT` vs `STATUS`** two-column idea (expected value beside observed
  value) is not in MFE's V7 layout today.
- The **per-page technician-initial strip** and **"next page title in the footer"** are pure
  presentation.
- Component **`good/total` ratio cells** (hydrant, hose reel) differ from MFE's per-row four-state.
- This sample has **no photos**. MFE V7 embeds offline photo evidence — keep that; it is additive
  to this layout.

## 4. Gap against MFE's current generator (as of 2026-09-17)

Renderer: `renderFinalServiceReportPdf` in `apps/api/src/reports/finalServiceReport.ts`
(PDFKit, DejaVuSans). Data: `FinalServiceReport` type in the same file.

| Feature | Current state | Needed |
|---|---|---|
| F-D1 landscape | Portrait A4, 46 pt margin | `layout: "landscape"` |
| F-D2 / F-D3 header, footer | Repeats `MFE SERVICES SDN. BHD.` + `Field Service Inspection Report` at top; no page numbers | Customer name right-aligned header; `N \| Page` footer (PDFKit `bufferPages: true`, stamp after layout) |
| F-D4 tables | Everything is `Label: value` paragraphs, indented by depth | Table drawing helper (borders, merged cells, header-row repeat, row-height measure) |
| F-C1 letterhead + logo | Text company name only | MFE logo asset, reg. no., address, tel/fax |
| F-C3 client info | Customer, telephone, contact, site, service date, service call no., arrival, departure, job ref, completed date/by, systems | **Missing data:** address, fax, contract no., frequency, report no., test leader, FC expiry date, delivery order |
| F-C4/C5 confirmation + signatures | None | Technician list, MFE signatory, customer sign box (needs signature capture or blank boxes) |
| F-C6 notes, F-S6 remarks | None | Configurable text blocks |
| F-C7 satisfaction | None | Tick row (blank, or captured value) |
| F-S2 summary table | `Summary of Testing` exists as numbered lines `1. <label> — <condition>` + detail line | Real table with PAGE and FREQUENCY columns; per-instance rows |
| F-S4 condition | Done: `deriveSystemCondition` → `GOOD CONDITIONS` / `REFER DETAIL PAGE` / `FAILED` (+ first finding as detail) | Keep; show detail as the free-text tail |
| F-S5 highlight / F-S7 legend | None | Colour FAILED; print indicator legend |
| F-P1 system page | Sections run on continuously, title underlined | New page per system, bold title with location |
| F-P3–P9 layouts | Generic flattened field list for every system | Per-system table layouts (A–E) mapped from V7 templates |
| F-P4 required/unit | No data for it | Needs expected value / unit per template field |
| F-P10 remarks | `Remarks:` only when findings exist (`sectionRemarkLines`) | Always print block; add parts-tally style option |
| F-P11 inspection strip | None | Inspection date + technician names per system page |
| F-D9 photos | Done — evidence image after each section | Keep, move after REMARK block |

## 5. Provenance

- Source file: `C:\Users\kokfu\Downloads\Project\Sample\PDF Sample Format.pdf` (SHA / size:
  1,041,484 bytes, 14 pages, scanned images, rotated 90°).
- Transcribed 2026-09-07 from page renders (OCR-by-eye); handwriting and stamps are best-effort.
  Contractor spellings kept verbatim (`INDOCATOR`, `CONDUCTIVITI`, `IMMEDIEATLY`, `SCAREDSUN`,
  `HOT DIPED`).
