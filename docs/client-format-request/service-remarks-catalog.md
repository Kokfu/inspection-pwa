# Service remarks catalog (client-supplied)

Source: `REMARK.pdf` (client email attachment, provided 2026-09-24). These are the
client's standard "common remarks" for each service system — short defect
descriptions technicians currently hand-write on paper reports. Transcribed
verbatim below (obvious typos flagged, not silently corrected).

Intended use (per client request): each system's **Remarks / Comments** field
should offer a picker seeded from this catalog, instead of a blank free-text
box only. See "Open questions" at the end before building anything — this doc
is transcription only, not an implementation plan.

---

## Automatic Sprinkler System

1. # of battery spoilt
   - 12V x 7AH
   - 12V x 12AH
   - 12V x 40AH
   - 12V x 65AH
   - 12V x 100AH
2. # of lot malfunction charger card, need to repair
   - Starter panel for St/By pump
   - Starter panel for Duty pump *(source has "DUTY PUMP PUMP" — duplicated word, treated as one item)*
3. # of 25mm ball valve spoilt
4. # of packing seal spoilt
5. # of bolt and nut spoilt
6. # of alarm gong spoilt
7. # of lot labelling for pump room
8. # of lot steel arrow & rubber ball
9. # of 25mm float valve spoilt
10. # of pressure switch control with copper tube *(source: "COOPER TUBE" — typo)*
11. # of lot exhaust tape
12. # of OH3 meter for control valve

## Hose Reel System

1. # of hose reel drum spoilt
2. # of hose reel nozzle spoilt
3. # of 25mm ball valve spoilt
4. # pressure gauge spoilt
   - 0~150 PSI
   - 0~300 PSI
5. # of nozzle box spoilt
6. # of glass for nozzle box spoilt
7. # of rubber hose spoilt

## Hydrant System

1. # of landing valve spoilt
2. # of canvas hose spoilt
3. # of hydrant cabinet spoilt
4. # of hose reel nozzle spoilt
5. # of handle landing valve spoilt
6. # keylock for hydrant cabinet spoilt
7. # glass for hydrant cabinet spoilt
8. # of diffuser nozzle spoilt

## Fire Alarm Panel

1. # of battery spoilt
   - 12V x 7AH
   - 12V x 12AH
   - 12V x 40AH
   - 12V x 65AH
   - 12V x 100AH
2. # of lot malfunction charger card, need to repair
3. # of lot fire alarm panel, need to repair
4. # of manual call point spoilt
5. # of alarm bell spoilt
6. # zone card spoilt
7. # of control card spoilt
8. # of glass for manual call point
9. *(source item 9 has no text — blank; see open questions)*

## FM 200 System

1. # of smoke detector spoilt

## CO2 Fire Extinguisher System

1. # of smoke detector spoilt
2. # of heat detector spoilt

---

## Open questions / needs confirmation

1. **Scope of the picker** — is this catalog meant to seed a remarks field on
   every relevant *field* inside each system's form, or one shared
   "system-level" comments box per system (matching the CO2 paper form's
   single `Comments :` block)? The V7 evidence contract already has a
   per-field **Poor** remark (see `.agents/skills/v7-evidence-acceptance/SKILL.md`);
   confirm whether this catalog replaces/feeds that remark text, or is a
   separate manager/reporting-only list.
2. **Three-tier option structure** you described:
   - (a) pick from the common remarks listed here,
   - (b) technician writes their own free text,
   - (c) manager can add new common remarks.
   Confirm this applies uniformly to all six systems above, and confirm who
   can edit the (c) list going forward — is it global (one shared list) or
   per-system, and is it customer-specific or applies to all customers?
3. **Battery-size sub-items** (Automatic Sprinkler #1, Fire Alarm Panel #1,
   Hose Reel #4 PSI ranges) — are these meant as separate selectable remark
   options (e.g. "battery spoilt — 12V x 40AH"), or just reference values the
   technician fills into one generic "battery spoilt" remark?
4. **Fire Alarm Panel item 9** — the source PDF lists a numbered "9" with no
   text under it. Confirm what (if anything) belongs there, or whether it's a
   stray artifact from the original document.
5. **FM 200 / CO2 overlap with detector remarks** — FM 200's only remark
   ("smoke detector spoilt") and CO2's two remarks (smoke/heat detector
   spoilt) look like a subset of a shared detector-remarks list. Confirm
   whether FM 200 and CO2 should literally share the same underlying remark
   entries (relevant given the separate request to make FM 200 reuse the CO2
   system — see item 2 in the same client email).
6. **Typos in the source** — "COOPER TUBE" → copper tube, "DUTY PUMP PUMP" →
   duplicated word. Corrected wording above; confirm before it goes live on
   any client-facing report.
