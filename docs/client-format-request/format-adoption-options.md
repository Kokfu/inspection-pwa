# Applying the Asiamost format to MFE's own services — options

Input: [asiamost-sample-report-format.md](asiamost-sample-report-format.md). Goal: make MFE's
**own** report (its 12 V7 systems, its data, its wording) present the way the client's sample does,
without breaking the proven V7 evidence path.

## Where the format lives today

| Piece | File | State |
|---|---|---|
| Final Report **PDF** | `apps/api/src/reports/finalServiceReport.ts` (548 ln) | builds `sections[]` (label/value fields + photos) in submitted order; **no cover, no summary/index page, no per-system verdict, portrait** |
| Manager Final Report **summary view** | `apps/web/src/manager/ManagerFinalReportView.tsx` (74 ln) | flagged 8e-P1 "too ugly / not clear" (HANDOVER §4) |
| Per-system verdict | — | does not exist; MFE is **4-state per field** (`good`/`not_good`/`complete_repair`/`na`), the sample is **3-state per system** |

## Cross-cutting sub-decision — the 4-state → 3-state mapping (needed by Options 1–4)

The sample's condition column is a whole-system roll-up with the sample's own definitions:
`FAILED` = major defect, system out of order · `REFER DETAIL PAGE` = minor defect, still usable in
a fire · `GOOD CONDITIONS` = all fine. MFE has no major/minor flag, so the closest proxy from
existing data:

```
any field not_good        -> FAILED
else any complete_repair   -> REFER DETAIL PAGE
else (good / na only)      -> GOOD CONDITIONS
```

Ship that as the default, render it derived (not stored), and **flag it for client confirmation**.
It is a one-line rule to change later. Only Option 5 avoids this by making the verdict human input.

---

## Option 1 — Summary index page only, derived verdict  *(smallest)*

- Add a **"Summary of Testing"** page as the first content page of the PDF and mirror the same
  table at the top of `ManagerFinalReportView`. Columns: `No. | System | Locations | Frequency |
  Condition`. Condition = derived (rule above); free-text tail = the system's worst finding remark.
- Render a numbered **`REMARK:`** list under each existing per-system section, built from the
  finding remarks already captured.
- **Touches:** `finalServiceReport.ts` (one new section builder + one PDF page), `ManagerFinalReportView.tsx`.
  No template, migration, schema, or submit-gate change. PDF stays portrait, sections unchanged.
- **Risk:** low. Contract-neutral (derived output only).
- **Effort:** ~2–3 days. **Directly closes 8e-P1.**

## Option 2 — Option 1 + full cosmetic reskin to the sample's house style  *(presentation pass)*

- Everything in Option 1, plus: landscape; running header (customer name) + footer (`n | Page`);
  per-system inspection-date + technician-initials strip; consistent `Label | Value` header grids;
  section titles matching the sample; **cover page** restyled to the sample's cover (client-info
  block, confirmation/signature table, `NOTE :-` list, customer-satisfaction row). Photos kept
  (additive — sample has none).
- **Touches:** `finalServiceReport.ts` layout throughout. No data changes.
- **Risk:** low–medium — large diff in one file; accepted-detail data path untouched, but every
  system's PDF output shifts, so offline/integration snapshot expectations and any PDF golden
  fixtures need a refresh.
- **Effort:** ~1–1.5 weeks. **This is the "ONE polish pass after Fire Rated Roller Shutter" the
  owner already scheduled (HANDOVER §5).**

## Option 3 — Option 2 + adopt the `REQUIRED/UNIT | STATUS` two-column model  *(structural)*

- Render every field as *expected value* beside *observed value*, like the sample's
  `DESCRIPTION | INSPECTION & TEST | REQUIRED/UNIT | STATUS` grid.
- MFE stores only the observed value. Needs an `expected`/`required` string per control — either
  in the V7 template definitions (**contract-affecting**: changes `contractSha256` for every
  accepted record → migration + re-acceptance risk, same class of problem as the hose-reel schema
  note) or a report-only lookup module keyed by system+field (contract-neutral but a large
  hand-authored map across 12 systems to build and keep in sync).
- **Risk:** high in the template, medium as a lookup.
- **Effort:** ~2–4 weeks. Only worth it if the client explicitly wants the "required vs actual"
  column, not just the look.

## Option 4 — Client-facing checklist as a SECOND document  *(isolation)*

- Leave the current Final Report PDF as the evidence-grade internal record, untouched. Add a
  separate **"Fire Protection System Maintenance Checklist"** PDF that follows the Asiamost format
  closely (cover + Summary of Testing + condensed per-system tables + `REMARK` lists, no photos,
  3-state verdicts). New builder module + route + a web download button.
- **Touches:** new `maintenanceChecklistReport.ts` + route + web button. Existing report and its
  tests untouched.
- **Risk:** low blast radius, but doubles the report surface — two documents can drift.
- **Effort:** ~1.5–2 weeks.

## Option 5 — Explicit per-system verdict in the data model  *(deepest — likely over-reach)*

- Add a technician- or manager-set `systemCondition` (`good_conditions` / `refer_detail_page` /
  `failed`) captured at submit or accept, stored on the submission, shown verbatim (no derivation).
- **Touches:** submit-gate, acceptance, schema/migration, web forms, **the V7 contract**.
- **Risk:** high — conflicts with the "don't conflate the 3-state roll-up with the 4-state
  per-field axis" note unless the client actually wants humans grading whole systems.
- **Effort:** 3+ weeks. Not recommended unless the client insists the verdict is human judgement.

---

## Recommendation

1. **Option 1 now.** Closes the live 8e-P1 pain, contract-neutral, no client dependency to start
   (ship the default mapping + flag it), and every other option is a superset of it.
2. **Option 2 as the single post-Roller-Shutter polish pass** already planned in HANDOVER §5 — not
   per-system, not now.
3. **Hold Options 3 and 5** for an explicit client ask (3 = "required vs actual" columns, 5 = human
   whole-system grade). Both carry contract risk.
4. **Option 4** only if the client wants a visually faithful clone *and* the detailed evidence
   report kept separate — otherwise it is double maintenance.
