import { readFileSync } from "node:fs";
import { reportFontFaceCss } from "../../reports/pdf/reportFonts.js";
import { formatDateOrTimestamp } from "../../reports/malaysiaTime.js";
import { escapeHtml as e, escapeCssString } from "../../reports/template/renderReportHtml.js";
import type { RepairVisitReportItem as Item, RepairVisitReportModel as Model, RepairVisitReportPhoto as Photo } from "./repairVisitReportModel.js";

const baseCss = readFileSync(new URL("../../reports/template/report.css", import.meta.url), "utf8");
const serviceCover = readFileSync(new URL("../../reports/template/cover.html", import.meta.url), "utf8");
const fonts = reportFontFaceCss();
const css = `
@media print{.page{width:273mm}}
body{overflow-wrap:anywhere} .source{margin:0 0 7pt;font-size:8pt}
.summary a{color:inherit}
.evidence{break-inside:avoid;margin-top:7pt}.pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10pt}
.single{grid-template-columns:1fr}.panel{border:.6pt solid #222;min-width:0}
.panel-head{padding:3pt 6pt;background:#eef2f7;border-bottom:.6pt solid #222;font-size:7.5pt}
.panel-head strong{display:block;font-size:8pt;letter-spacing:.04em}
.photo-frame{height:20mm;background:#e6e8eb;display:flex;align-items:center;justify-content:center;text-align:center;color:#606873}
.photo-frame img{width:100%;height:100%;object-fit:contain}.tall .photo-frame{height:55mm}
.photo-remark{padding:4pt 6pt;border-top:.6pt solid #9a9a9a;font-size:7.6pt;min-height:25pt;white-space:pre-wrap}
.caption{margin-top:3pt;font-size:8pt}.long-remark{white-space:pre-wrap;margin:5pt 0;orphans:3;widows:3}
.signs td{height:54pt}.notes{font-size:7pt}.notes ol{line-height:1.25}
.signature{height:22pt;max-width:120pt;object-fit:contain}.signs .line{margin-top:8pt}
.preview{position:fixed;top:44%;left:12%;width:76%;text-align:center;transform:rotate(-18deg);font-size:34pt;font-weight:700;color:rgba(179,22,27,.16);z-index:10;pointer-events:none}
tr{break-inside:avoid} .repair-details tr{break-inside:auto}
`;

// Calendar dates (visit dates) never shift; timestamps (approval, signature) are shown in Malaysia time.
const date = formatDateOrTimestamp;
function image(photo: Photo): string {
  const png = photo.content.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = photo.content[0] === 255 && photo.content[1] === 216;
  if ((!png && !jpeg) || photo.width <= 0 || photo.height <= 0) throw new Error("Invalid report photo");
  return `<img src="data:${png ? "image/png" : "image/jpeg"};base64,${photo.content.toString("base64")}" alt="${e(photo.caption)}">`;
}
function result(value: NonNullable<Item["before"]>["snapshot"]["result"] | null): string {
  if (value === null) return "—";
  const entries = {good:["good","GOOD"],not_good:["bad","NOT GOOD"],complete_repair:["repair","COMPLETE REPAIR"],na:["na","N.A."],done_repair:["repair","DONE REPAIR"],not_done:["bad","NOT DONE"]} as const;
  if (!Object.hasOwn(entries, value)) throw new Error("Invalid report result");
  const entry = entries[value];
  return `<span class="r ${entry[0]}">${entry[1]}</span>`;
}
function groups(vm: Model): Item[][] {
  const grouped = new Map<string, Item[]>();
  for (const item of vm.items) {
    const i = item.identity;
    const key = JSON.stringify([i.systemKey, i.rowUuid, i.locationId, i.zoneId]);
    const list = grouped.get(key) ?? []; list.push(item); grouped.set(key, list);
  }
  return [...grouped.values()];
}
const previous = (vm: Model) => vm.cover.previousVisit ? `${vm.cover.previousVisit.visitNumber} · ${date(vm.cover.previousVisit.visitDate)}` : "None · No previous visit";
const field = (item: Item) => `${item.sectionLabel} / ${item.fieldLabel}`;
const long = (text: string) => text.length > 600 || text.split("\n").length > 8;

function cover(vm: Model, sections: Item[][]): string {
  const c = vm.cover;
  // Transform only trusted static markup. Business text is inserted once, afterwards.
  let template = serviceCover.replaceAll("FIRE SYSTEM SERVICE REPORT", "FIRE SYSTEM REPAIR REPORT")
    .replace("MAINTENANCE, INSPECTION &amp; TESTING", "REPAIR RECORD")
    .replace("Date of Service", "Repair Date")
    .replace("Frequency", "Previous Visit").replace("{{frequency}}", "{{previousVisit}}")
    .replace("Service Status", "Approval")
    .replace('<span class="box">&#10003;</span>COMPLETED &nbsp;&nbsp; <span class="box"></span>TO BE CONTINUED', "{{approval}}")
    .replace("Test Leader", "Technician").replace(">Technicians<", ">Repair Visit No.<").replace("{{technicians}}", "{{jobReference}}")
    .replace("Systems Serviced", "Systems Repaired").replace("Serviced By", "Repaired By")
    .replace("INSPECTION / TESTING.", "REPAIR.")
    .replace("All fire systems listed above were tested and inspected on the date of service. Detailed results are recorded on the following pages.", "Repair work on the selected fields is recorded on the following pages. This report does not certify unlisted fields.")
    .replace("during this service", "during this repair visit");
  if (vm.mode === "preview") template = template.replace(/<div><span>Report No\.<\/span>.*?<\/div>/, "");
  const logo = vm.companyLogo;
  if (logo && !["image/png", "image/svg+xml"].includes(logo.mime)) throw new Error("Invalid company logo MIME");
  const team = c.technicians.filter(name => name !== c.technician).join(", ");
  if (!team) template = template.replace(/<div style="font-size:7\.6pt;color:#333">Team: \{\{team\}\}<\/div>/, "");
  const values: Record<string, unknown> = { ...vm.company, registrationNo: vm.company.registrationNo ? `(${vm.company.registrationNo})` : "", companyFax: vm.company.fax,
    reportNumber: vm.reportNumber, jobReference: c.visitNumber, issuedAt: vm.approvedAt ? date(vm.approvedAt) : "", customer: c.customer,
    siteAddress: [c.site, c.siteAddress].filter(Boolean).join(" — "), telephoneFax: [c.telephone,c.fax].filter(Boolean).join(" / "),
    contactPerson: c.contactPerson, serviceDate: date(c.visitDate), arrival: c.arrivalTime, serviceCallNumber: c.serviceCallNumber,
    contractNumber: c.contractNumber, previousVisit: previous(vm), approval: vm.mode === "final" ? `Approved by ${vm.approvedBy} · ${date(vm.approvedAt)}` : "PREVIEW — NOT APPROVED",
    testLeader: c.technician, team, verifiedBy: vm.approvedBy };
  const systems = [...new Set(sections.map(s => s[0].systemLabel))];
  // Separate markup slots before escaping so placeholder-like customer text stays literal.
  return template.split(/(\{\{logoMarkup\}\}|\{\{systemsMarkup\}\})/).map(part => {
    if (part === "{{logoMarkup}}") return logo ? `<img src="data:${logo.mime};base64,${logo.content.toString("base64")}" alt="Company logo" style="width:62pt;height:62pt;object-fit:contain">` : '<div class="logo">MFE</div>';
    if (part === "{{systemsMarkup}}") return `<div class="sys-list">${systems.map(label => `<div><span class="box">✓</span>${e(label)}</div>`).join("")}</div>`;
    return part.replace(/\{\{(\w+)\}\}/g, (_, key: string) => e(values[key]));
  }).join("").replace('<div class="who" data-bind="customer.contactPerson">&nbsp;</div>',
    () => `<div class="who">${e(c.acknowledgement.name)} ${e(c.acknowledgement.designation)}</div>${c.acknowledgement.signature ? image(c.acknowledgement.signature).replace('<img ', '<img class="signature" ') : ""}<div>${e(c.acknowledgement.signedAt ? date(c.acknowledgement.signedAt) : "")}</div>`);
}

function title(vm: Model, no: number | "S", name: string, location: string, detail: string): string {
  return `<div class="sys-title"><div class="no">${e(no)}</div><div class="name"><b>${e(name)}</b><span>${e(location)}</span></div><div class="cond"><small>Repair visit</small><span class="cond-tag">${e(vm.cover.visitNumber)}</span><span style="font-size:7pt">${e(detail)}</span></div></div>`;
}
function evidence(vm: Model, item: Item, tall: boolean): string {
  const panel = (before: boolean) => {
    const snapshot = item.before?.snapshot;
    const remark = before ? snapshot!.remark : item.remark;
    const photo = before ? item.before!.photo : item.afterPhoto;
    return `<div class="panel"><div class="panel-head"><strong>${before ? "BEFORE" : "AFTER REPAIR"}</strong>${e(before ? snapshot!.visitNumber : vm.cover.visitNumber)} · ${e(date(before ? snapshot!.visitDate : vm.cover.visitDate))}<br>Result: ${result(before ? snapshot!.result : item.outcome)}</div><div class="photo-frame">${photo ? image(photo) : "No photo recorded at previous visit"}</div><div class="photo-remark"><b>Remark:</b> ${e(long(remark) ? "See full remark below." : remark || "— (no remark recorded)")}</div></div>`;
  };
  return `<div class="evidence${tall ? " tall" : ""}"><div class="pair${item.before ? "" : " single"}">${item.before ? panel(true) : ""}${panel(false)}</div><div class="caption"><b>${e(item.no)}. ${e(field(item))}</b></div></div>${[["Before", item.before?.snapshot.remark], ["After repair", item.remark]].map(([label, text]) => text && long(text) ? `<div class="long-remark"><b>${e(item.no)}. ${e(field(item))} — ${e(label)} remark:</b><br>${e(text)}</div>` : "").join("")}`;
}

/** Pure HTML transformation: no clock, network, database, disk lookup or model mutation.
 * Caller supplies ONLY server-resolved frozen Before data and bound After photo bytes.
 * pageMap comes from Chromium destinations, never a guessed page count. */
export function renderRepairVisitReport(vm: Model, pageMap?: ReadonlyMap<string, number>): string {
  if (!["preview", "final"].includes(vm.mode) || vm.items.length === 0) throw new Error("Invalid repair report");
  if (vm.mode === "preview" && (vm.reportNumber !== null || vm.approvedBy !== null || vm.approvedAt !== null)) throw new Error("Preview cannot contain approval authority");
  if (vm.mode === "final" && (!vm.reportNumber?.trim() || !vm.approvedBy?.trim() || !vm.approvedAt)) throw new Error("Final repair report needs approval authority");
  for (const item of vm.items) {
    if (!!item.before !== !!vm.cover.previousVisit) throw new Error("Inconsistent previous visit");
    if (item.before) {
      const s = item.before.snapshot, p = vm.cover.previousVisit!;
      if (s.visitNumber !== p.visitNumber || s.visitDate !== p.visitDate || s.previousVisit.kind !== p.kind || (!!s.photo !== !!item.before.photo)) throw new Error("Unresolved or inconsistent Before authority");
    }
  }
  const sections = groups(vm);
  const summary = `<section class="page">${title(vm,"S","Summary of Repair",`${vm.cover.customer} · ${vm.cover.site}`,date(vm.cover.visitDate))}<table class="summary"><thead><tr><th>No</th><th>System</th><th>Location / Unit</th><th>Item</th><th>Previous Result</th><th>After Repair</th><th>Page</th></tr></thead><tbody>${sections.flatMap((items,index) => items.map(item => `<tr><td class="num">${e(item.no)}</td><td><b>${e(item.systemLabel)}</b></td><td>${e(item.unitLabel)}</td><td>${e(item.fieldLabel)}</td><td>${result(item.before?.snapshot.result ?? null)}</td><td>${result(item.outcome)}</td><td class="pg"><a href="#rv-${index + 1}">${e(pageMap?.get(`rv-${index+1}`))}</a></td></tr>`)).join("")}</tbody></table><div class="legend"><div><h4>AFTER REPAIR</h4><table><tr><td>${result("done_repair")}</td><td>Repair carried out; see the field remark and After photo.</td></tr><tr><td>${result("not_done")}</td><td>Repair not carried out; the required remark gives the reason.</td></tr></table></div><div><h4>BEFORE EVIDENCE</h4><table><tr><td>Previous service visit</td><td>Previous result, remark and photo.</td></tr><tr><td>Previous repair visit</td><td>That visit’s After result, remark and photo.</td></tr><tr><td>No previous visit</td><td>Previous Result: —. After photo alone, full width.</td></tr></table></div></div></section>`;
  const details = sections.map((items,index) => `<section class="page" id="rv-${index+1}">${title(vm,index+1,items[0].systemLabel,`${items[0].unitLabel} · ${vm.cover.site}`,`${items.length} selected field${items.length===1 ? "" : "s"}`)}<div class="source"><b>Previous visit:</b> ${e(previous(vm))}${vm.cover.previousVisit?.kind === "repair" ? " · Before uses that repair visit’s After evidence." : ""}</div><table class="repair-details"><thead><tr><th style="width:26pt">No</th><th>Section / Item</th><th style="width:100pt">Previous Result</th><th style="width:100pt">After Repair</th><th style="width:230pt">Repair Remark</th></tr></thead><tbody>${items.map(item => `<tr><td class="num">${e(item.no)}</td><td>${e(field(item))}</td><td>${result(item.before?.snapshot.result ?? null)}</td><td>${result(item.outcome)}</td><td style="white-space:pre-wrap">${e(long(item.remark) ? "See full repair remark below the photo evidence." : item.remark)}</td></tr>`).join("")}</tbody></table><div class="blk-h" style="margin-top:8pt">Photo Evidence — ${vm.cover.previousVisit ? "Before / " : ""}After Repair</div>${items.map(item=>evidence(vm,item,items.length===1)).join("")}<table class="strip"><tr><td class="lbl">REPAIR DATE</td><td><b>${e(date(vm.cover.visitDate))}</b></td><td class="lbl">TECHNICIAN</td><td><b>${e(vm.cover.technician)}</b></td></tr><tr><td class="lbl">INITIAL</td><td class="sig"></td><td></td><td class="sig"></td></tr></table></section>`).join("");
  const style = baseCss.replace("FIRE SYSTEM SERVICE REPORT", "FIRE SYSTEM REPAIR REPORT").replace("System-generated from accepted inspection records", vm.mode === "final" ? "System-generated from approved repair records" : "PREVIEW — NOT APPROVED")
    .replace(/\{\{(customer|reportNumber)\}\}/g, (_, key: string) => escapeCssString(key === "customer" ? vm.cover.customer : vm.mode === "final" ? `Report No. ${vm.reportNumber}` : "PREVIEW — NOT APPROVED"));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${e(vm.cover.visitNumber)}</title><style>${fonts}${style}${css}</style></head><body>${vm.mode === "preview" ? '<div class="preview">PREVIEW — NOT APPROVED</div>' : ""}${cover(vm,sections)}${summary}${details}</body></html>`;
}
