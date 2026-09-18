# MFE Final Service Report — template

| File | What it is |
|---|---|
| [mfe-service-report-template.html](mfe-service-report-template.html) | **The template.** A4 landscape HTML/CSS with sample data. Open in a browser to review, or print to PDF. `data-bind` attributes name the field that fills each value. |
| [mfe-service-report-template.pdf](mfe-service-report-template.pdf) | The same file printed with Chromium (9 pages). This is what the customer receives. |

Status: **v1 APPROVED by owner (2026-09-18)** — layout, wording and page-number footer accepted.
Not wired into the app yet; company details and some per-customer data still pending from the client (see §5).
Format source: [../client-format-request/asiamost-sample-report-format.md](../client-format-request/asiamost-sample-report-format.md) (feature IDs F-D/C/S/P).

---

## 1. How report generation works today (analysis)

`apps/api/src/reports/finalServiceReport.ts`

1. **`loadFinalServiceReport`** reads the closed job, its frozen `configuration_snapshot`, and every
   submitted form instance (`response_payload` + `inspection_snapshot` + photos).
2. For each system unit it runs **`flatten(response_payload)`**. This walks the answer JSON and
   produces a flat list of `{label, value, depth}`, e.g. `Rows 1 - Canvas Hose1Result: Not Good`.
   Labels come from the V7 definition where possible, otherwise from prettifying the JSON key.
3. **`deriveSystemCondition`** turns the flat list into `GOOD CONDITIONS / REFER DETAIL PAGE / FAILED`.
4. **`renderFinalServiceReportPdf`** (PDFKit) writes it as running text: cover lines
   `Customer: …`, a numbered summary, then every field as a `Label: value` paragraph, then photos.

**So there is no template today.** The data is well structured (every V7 system is made of
`checklist`, `measurement`, `repeatable_table`, `quantity_summary` and `comments` blocks with
known columns, units and labels), but the loader flattens it into a list of lines and loses that
structure. That is why the current PDF cannot show tables, columns, units or per-row results.

## 2. Is "fill a template from the fields" better? — Yes, with one adjustment

A fixed form with fixed boxes (fillable-PDF style) **would not work**: row counts change per site
(Hose Reel 4–37 drums, Fire Alarm 1–130 zones), systems appear or not per job, and customers have
label overrides.

What works is the same idea one level up:

- **One fixed page frame**: cover, summary, per-system page title bar, REMARK, photos, inspection
  strip, header/footer. Always the same, so every report looks identical.
- **One table style per V7 block type.** The generator reads the frozen definition (not the
  flattened list) and each block is drawn with its style. A new system or a customer label
  override needs no layout work: it is still made of the same block types.

| V7 block type | Table style in template | Columns |
|---|---|---|
| `checklist` | `.blk-checklist` | No · Inspection & Test · Result · Remarks |
| `checklist` whose items are pumps (Jockey/Duty/Standby) | `.blk-units` | Description · Req/Unit · one column per unit |
| `measurement` / item with a `unit` | `.blk-checklist` + Req/Unit + Reading | No · Item · Req/Unit · Reading · Result · Remarks |
| `repeatable_table` | `.blk-register` | No · Location · one column per component · Remarks (header repeats on overflow) |
| `repeatable_table` with Normal/Test/Isolation columns | `.blk-register` with 2-row header | Zone · Location · N/T/I under each device |
| `quantity_summary` | `.blk-qty` | Type · Quantity · Total |
| `comments` | boxed text | — |

## 3. Page structure (fixed, in this order)

1. **Cover** — letterhead + report no. box, title, client info table, systems serviced
   (ticked / greyed), confirmation line, three sign-off columns, customer satisfaction row, NOTE list.
2. **Summary of Testing** — one row per system unit: No · System · Location/Unit · Page ·
   Frequency · Condition · Main Finding; condition legend; result-symbol legend; advice to customer.
3. **One page frame per system unit** (continues onto more pages as needed, title bar repeats
   with "(continued)"):
   title bar (No · name · location · system condition) → optional advisory notes → blocks →
   **REMARK** (numbered findings, "No defects found." if none) → **Parts / rectification required**
   (only if any) → **Comments** → **Photo evidence** (3 per row, numbered captions) →
   **Inspection strip** (date, technician names, initial boxes).
4. `— END OF REPORT —`.

Every page: header `MFE SERVICES SDN. BHD. · FIRE SYSTEM SERVICE REPORT` (left) and customer name
(right); footer report no. (left), "system-generated" line (centre), `Page N of M` (right).

**Result display rule** (same everywhere): word + symbol, so it still reads in black-and-white print.
`✓ GOOD` · `✗ NOT GOOD` (red, cell tinted) · `◯ COMPLETE REPAIR` (amber) · `– N/A` (grey).

## 4. Field bindings

### Available today (from job + frozen configuration)

| Template field | Source |
|---|---|
| Client | `configuration_snapshot.customer.displayName` |
| Site | `configuration_snapshot.site.displayName` |
| Telephone | `customer.contactPhone` |
| Contact person | `customer.contactPerson` |
| Date of service | `job.service_date` |
| Arrival / Departure | `job.arrival_time` / `job.departure_time` |
| Service call no. | `job.service_call_number` |
| Job ref. | `job.job_reference` |
| Test leader / Serviced by | `job.completed_by_display_name` |
| Systems serviced | `completion.systems[]` (all 12 printed; not-serviced greyed) |
| Condition, main finding | `deriveSystemCondition()` |
| REMARK lines | `sectionRemarkLines()` (reworded to `Block — Row — Item: RESULT — remark`) |
| Photos + captions | existing evidence loaders |
| Block structure, labels, units | frozen `inspection_snapshot.system.definition` + label overrides |

### Not stored yet (print blank until added)

| Template field | Needed |
|---|---|
| Report no. | Numbering rule (e.g. `MFE/SR/<year>/<seq>`), assigned at completion |
| Site address, fax | Customer/site fields |
| Contract no., frequency | Customer or contract record |
| Technician team (all names) | Job assignment already has technicians — confirm it is frozen at completion |
| Verified-by signatory | MFE supervisor name (optional) |
| Signatures | Blank boxes for wet signature, unless e-signature is added later |
| Customer satisfaction | Blank tick boxes, unless captured in the app |
| Parts / rectification list | Either a new "parts needed" input, or derived from NOT GOOD components |
| Advisory notes per system | Static text per system type (config) |
| MFE logo | Logo file (template uses an "MFE" placeholder circle) |

## 5. Pending client details — where to put them when they arrive

The client has not supplied these yet. The report must still generate without them: every
missing value prints as a blank ruled cell (never "undefined", never a made-up value).

### 5a. MFE company details and logo — files you drop in (once, for all reports)

Folder: **`apps/api/src/reports/assets/`** (already copied into the Docker image by
`apps/api/Dockerfile`, so anything placed here ships with the server).

| What | File | Format / notes |
|---|---|---|
| Logo | `mfe-logo.png` (or `mfe-logo.svg`) | PNG ≥ 600 px wide with transparent background, or SVG. Square-ish; printed ~22 mm tall at the top-left of the cover. Until it exists, the "MFE" circle placeholder prints. |
| Company details | `company-profile.json` | Created by the implementation with the values below, marked unconfirmed. Edit the text, save, restart/redeploy the API. |
| Company stamp / authorised signature (optional) | `mfe-stamp.png`, `mfe-signature.png` | PNG, transparent background. Printed in the "Verified by" box only if present. |

`company-profile.json` shape (current values are from the MFE paper-form footer — **unconfirmed**):

```json
{
  "confirmed": false,
  "legalName": "MFE SERVICES SDN. BHD.",
  "registrationNo": "952723-P",
  "address": "No. 2339, Jalan Raja, Mukim Sungai Raya, 84300 Muar, Johor Darul Ta'zim.",
  "tel": "06-985 6988 / 985 8709",
  "fax": "06-985 9806",
  "email": "mfetsb@gmail.com",
  "complaintHotline": "06-985 6988",
  "logoFile": "mfe-logo.png",
  "verifiedBy": { "name": "", "title": "" },
  "reportNumberFormat": "MFE/SR/{YYYY}/{SEQ4}"
}
```

When the client confirms the details: edit the values, set `"confirmed": true`, drop the logo file.
No code change needed.

### 5b. Per-customer / per-visit data — entered in the app, not files

These change per customer or per visit, so they belong in the database and the manager screens,
not in files.

| Report field | Where it will be entered | Until then |
|---|---|---|
| Site address | Manager → Customer → Site form (new field) | blank |
| Fax | Manager → Customer form (new field, next to Telephone) | blank |
| Contract no. | Manager → Customer form (new field) | blank |
| Frequency (Monthly / Quarterly / Half-yearly / Annually) | Manager → Customer form, default for all systems (new field) | blank |
| Report no. | **Automatic** — assigned once when the job is completed, using `reportNumberFormat`. Never typed. | — |
| Technician team | **Automatic** — from the job's assigned technicians, frozen at completion | test leader only |
| Parts / rectification required | **Automatic** — tallied from NOT GOOD components (`HOSE X 1`) | — |
| Customer satisfaction, signatures | Printed as blank boxes for wet signature on the printed copy | blank boxes |

Adding the 4 customer/site fields is one small migration + form fields; it can be done now (fields
stay empty) or when the client sends the data.

## 6. Implementation plan

**Engine:** render this HTML template to PDF with headless Chromium on the API server.
The template relies on things PDFKit does not do: `@page` header/footer with `Page N of M`,
table headers that repeat when a table runs onto the next page, and automatic wrapping.
The API image is `node:22-alpine`, so: `apk add chromium` in the Dockerfile + `puppeteer-core`
pointed at `/usr/bin/chromium` (≈150–300 MB larger image). The font is bundled as a file
(`@font-face` from `reports/assets/`) so output never depends on server-installed fonts.

**Phases** (each is one agent task, reviewed before the next):

| Phase | Scope | Result |
|---|---|---|
| R1 — Report model | New `buildReportViewModel(report)` that keeps V7 **block structure** (checklist / measurement / repeatable_table / quantity_summary / comments → rows & columns) instead of `flatten()`. Loads `company-profile.json`. Existing `loadFinalServiceReport` validation untouched. Unit tests per block type. | Structured data, no visual change |
| R2 — HTML renderer | `renderReportHtml(viewModel)` producing exactly the approved template markup (template CSS copied into `reports/template/report.css`). Pure function, HTML-escaped, snapshot-tested against the approved PDF look. | HTML identical to the approved design |
| R3 — PDF engine swap | Chromium renderer behind the same `renderFinalServiceReportPdf` signature; two-pass render fills the Summary **PAGE** column; Dockerfile update; PDFKit path kept behind a flag for one release as fallback. | "Generate report" button produces the new PDF |
| R4 — Pending fields | Migration for site address / fax / contract no. / frequency; manager form fields; auto report number at completion; technician team frozen at completion. | Blank cells start filling in |

The route (`createFinalReportPdfHandler` in `apps/api/src/routes/inspectionJobs.ts`) and the
"Generate report" button do not change — only what the renderer produces.
