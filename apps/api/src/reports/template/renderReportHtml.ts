import { readFileSync, existsSync } from "node:fs";
import { reportFontFaceCss } from "../pdf/reportFonts.js";
import { summaryMainFinding, type ReportViewModel, type ReportBlock, type ReportResult, type SystemPage } from "../reportViewModel.js";

const asset = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const css = asset("./report.css");
const coverTemplate = asset("./cover.html");
const summaryFooter = asset("./summary-footer.html");
const fontCss = reportFontFaceCss();
const logos = new Map<string, string>();
for (const [file, mime] of [["mfe-logo.png", "image/png"], ["mfe-logo.svg", "image/svg+xml"]]) {
  const url = new URL(`../assets/${file}`, import.meta.url);
  if (existsSync(url)) logos.set(file, `data:${mime};base64,${readFileSync(url).toString("base64")}`);
}

/** The only boundary for dynamic text/attributes, including nulls and numeric values. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
// CSS raw-text elements do not decode HTML entities. Convert escaped punctuation to
// CSS hex escapes, keeping both the HTML parser and CSS string parser contained.
export function escapeCssString(value: unknown): string {
  return escapeHtml(String(value ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, "").replace(/\\/g, "\\\\"))
    .replace(/&amp;/g, "\\26 ").replace(/&lt;/g, "\\3c ").replace(/&gt;/g, "\\3e ").replace(/&quot;/g, '\\"').replace(/&#39;/g, "\\27 ");
}
const e = escapeHtml;
const fill = (template: string, values: Record<string, unknown>) => template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => e(values[key]));
const result = (value: ReportResult | null) => value ? `<span class="r ${e(value.tone)}">${e(value.display)}</span>` : "";
const resultCell = (value: ReportResult | null, remark?: string | null) => `<td class="${e(value?.tone === "bad" ? "flag" : "c")}">${result(value)}${remark ? `<div class="rmk">${e(remark)}</div>` : ""}</td>`;
const condition = (value: SystemPage["condition"]) => `<span class="cond-tag ${e(value === "FAILED" ? "failed" : value === "REFER DETAIL PAGE" ? "refer" : "good")}">${e(value)}</span>`;
const blockHead = (block: ReportBlock) => `<div class="blk-h">${e(block.title)}</div>`;

export function checklist(block: Extract<ReportBlock, {kind: "checklist"}>): string {
  const readings = block.rows.some(row => row.unit !== null || row.reading !== null);
  const remarks = block.rows.some(row => !!row.remark);
  return `<div class="blk">${blockHead(block)}<table class="blk-checklist"><thead><tr><th class="c" style="width:26pt">No</th><th>Inspection &amp; Test</th>${readings ? '<th class="c">Req / Unit</th><th class="c">Reading</th>' : ""}<th class="c" style="width:100pt">Result</th>${remarks ? '<th>Remarks</th>' : ""}</tr></thead><tbody>${block.rows.map(row => `<tr><td class="num">${e(row.no)}</td><td>${e(row.label)}</td>${readings ? `<td class="req">${e(row.unit)}</td><td class="c">${e(row.reading)}</td>` : ""}${resultCell(row.result)}${remarks ? `<td class="rmk">${e(row.remark)}</td>` : ""}</tr>`).join("")}</tbody></table></div>`;
}
export function units(block: Extract<ReportBlock, {kind: "units"}>): string {
  const remarks = block.units.some(unit => !!unit.remark);
  return `<div class="blk" style="break-inside:avoid">${blockHead(block)}<table class="blk-units"><thead><tr><th>Description</th><th class="c">Req / Unit</th>${block.units.map(unit => `<th class="c">${e(unit.label)}</th>`).join("")}</tr></thead><tbody><tr><td>${e(block.title)}</td><td></td>${block.units.map(unit => resultCell(unit.result)).join("")}</tr>${remarks ? `<tr><td>Remarks</td><td></td>${block.units.map(unit => `<td>${e(unit.remark)}</td>`).join("")}</tr>` : ""}</tbody></table></div>`;
}
export function register(block: Extract<ReportBlock, {kind: "register"}>): string {
  const grouped = block.columns.some(column => column.kind === "nti");
  const hasIdentity = block.columns.some(column => /^(no\.?|alarm zone|zone)$/i.test(column.label));
  return `<div class="blk">${blockHead(block)}<table class="blk-register"><thead><tr>${hasIdentity ? "" : `<th class="c" rowspan="${e(grouped ? 2 : 1)}">No</th>`}${block.columns.map(column => `<th${column.kind === "nti" ? ' colspan="3"' : ` rowspan="${e(grouped ? 2 : 1)}"`}>${e(column.label)}</th>`).join("")}</tr>${grouped ? `<tr class="sub">${block.columns.filter(column => column.kind === "nti").map(() => '<th class="c">N</th><th class="c">T</th><th class="c">I</th>').join("")}</tr>` : ""}</thead><tbody>${block.rows.map(row => `<tr>${hasIdentity ? "" : `<td class="num">${e(row.no)}</td>`}${row.cells.map(cell => cell.kind === "nti" ? ["normal", "test", "isolation"].map(key => `<td class="c">${e(cell.state?.[key as keyof typeof cell.state] ? "✓" : "")}</td>`).join("") : cell.kind === "result" ? resultCell(cell.result, cell.remark) : `<td>${e(cell.text)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
export function quantity(block: Extract<ReportBlock, {kind: "quantity"}>): string {
  return `<div class="blk">${blockHead(block)}<table class="blk-qty"><thead><tr><th>Type</th><th class="c" style="width:90pt">Quantity</th></tr></thead><tbody>${block.rows.map(row => `<tr><td${row.isTotal ? ' class="lbl"' : ""}>${e(row.label)}</td><td class="c${row.isTotal ? " lbl" : ""}"><b>${e(row.value)}</b></td></tr>`).join("")}</tbody></table></div>`;
}
export function comments(block: Extract<ReportBlock, {kind: "comments"}>): string {
  return `<div class="blk">${blockHead(block)}<div class="remark-box" style="margin:0;min-height:20pt;white-space:pre-wrap">${e(block.text)}</div></div>`;
}
const partial = (block: ReportBlock): string => {
  switch (block.kind) {
    case "checklist": return checklist(block);
    case "units": return units(block);
    case "register": return register(block);
    case "quantity": return quantity(block);
    case "comments": return comments(block);
  }
};
function cover(vm: ReportViewModel): string {
  const c = vm.cover;
  const logo = logos.get(vm.company.logoFile) ?? logos.get("mfe-logo.png") ?? logos.get("mfe-logo.svg");
  const values = { ...vm.company, ...c, registrationNo: vm.company.registrationNo ? `(${vm.company.registrationNo})` : "", companyFax: vm.company.fax,
    siteAddress: [c.site, c.siteAddress].filter(Boolean).join(" — "), telephoneFax: [c.telephone, c.fax].filter(Boolean).join(" / "), arrivalDeparture: [c.arrival, c.departure].filter(Boolean).join(" / "),
    technicians: c.technicians.join(" · "), team: c.technicians.filter(name => name !== c.testLeader).join(", ") };
  // Parse only the static template: interpolated business text is never re-parsed.
  const template = c.reportNumber ? coverTemplate : coverTemplate.replace(/^[ \t]*<div><span>Report No\.<\/span><b data-bind="report\.number">\{\{reportNumber\}\}<\/b><\/div>\r?\n/m, "");
  return template.split(/(\{\{logoMarkup\}\}|\{\{systemsMarkup\}\})/).map(part => {
    if (part === "{{logoMarkup}}") return logo ? `<img src="${e(logo)}" alt="MFE" style="width:62pt;height:62pt;object-fit:contain">` : '<div class="logo">MFE</div>';
    if (part === "{{systemsMarkup}}") return '<div class="sys-list">' + c.systemsServiced.map(system => `<div${system.serviced ? "" : ' class="off"'}><span class="box">${e(system.serviced ? "✓" : "")}</span>${e(system.label)}</div>`).join("") + '</div>';
    return fill(part, values);
  }).join("");
}
function summary(vm: ReportViewModel, pageMap?: Map<string, number>): string {
  return `<section class="page"><div class="sys-title"><div class="no">S</div><div class="name"><b>SUMMARY OF TESTING</b><span>One line per system inspected. The condition is the overall result of that system; details are on the page shown.</span></div><div class="cond"><small>Date of service</small><span class="cond-tag" style="color:#111">${e(vm.cover.serviceDate)}</span></div></div><table class="summary"><thead><tr><th class="c" style="width:30pt">No.</th><th>System / Test Description</th><th>Location / Unit</th><th class="c">Page</th><th class="c">Frequency</th><th>Condition</th><th>Main Finding</th></tr></thead><tbody>${vm.summary.map(row => `<tr><td class="num">${e(row.no)}</td><td class="caps"><a href="#sys-${e(row.no)}" style="color:inherit;text-decoration:none"><b>${e(row.label)}</b></a></td><td>${e(row.location)}</td><td class="pg">${e(pageMap?.get(`sys-${row.no}`))}</td><td class="freq">${e(row.frequency)}</td><td class="cond${row.condition === "FAILED" ? " flag" : ""}">${condition(row.condition)}</td><td>${e(row.mainFinding ?? summaryMainFinding(vm.systemPages.find(page => page.no === row.no)?.remarks ?? []))}</td></tr>`).join("")}</tbody></table>${fill(summaryFooter, {complaintHotline: vm.company.complaintHotline})}</section>`;
}
function blocks(page: SystemPage): string {
  const list = page.blocks.filter(block => block.kind !== "comments");
  const short = (block: ReportBlock) => block.kind === "units" || block.kind === "quantity" || (block.kind === "checklist" && block.rows.length <= 5);
  const parts: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const first = list[i], next = list[i+1], third = list[i+2];
    // The approved Fire Alarm frame stacks charger/timer beside the function keys.
    if (/charger.*batter/i.test(first.title) && next && /timer/i.test(next.title) && third && /main function/i.test(third.title)) {
      parts.push(`<div class="two-col"><div>${partial(first)}${partial(next)}</div>${partial(third)}</div>`); i += 2;
    } else if (next && short(first) && short(next)) { parts.push(`<div class="two-col">${partial(first)}${partial(next)}</div>`); i++; }
    else parts.push(partial(first));
  }
  return parts.join("");
}
function systemTitle(page: SystemPage, continued: boolean, anchor: boolean): string {
  return `<div class="sys-title"${anchor ? ` id="sys-${e(page.no)}"` : ""}><div class="no">${e(page.no)}</div><div class="name"><b>${e(page.title)}${continued ? ' <span class="continued">(continued)</span>' : ""}</b><span>${e(page.location)}</span></div><div class="cond"><small>System condition</small>${condition(page.condition)}</div></div>`;
}
function system(page: SystemPage, last: boolean): string {
  const notes = page.systemKey === "automatic_sprinkler" ? ["Do not close any main control valve. Valves are secured with MFE safety seals."]
    : page.systemKey === "fire_alarm_detector" ? ["Do not isolate any switch at the control panel without permission.", "Do not replace batteries with a lower ampere-hour rating than the original."] : [];
  const advisory = notes.length ? `<ul class="advisory">${notes.map(note => `<li>${e(note)}</li>`).join("")}</ul>` : "";
  // Chromium repeats the outer thead on every fragment. The base title is a
  // first-fragment overlay; later fragments expose the repeated continuation title.
  const firstTitle = systemTitle(page, false, true);
  const continuationTitle = systemTitle(page, true, false);
  const remark = `<div class="remark-box"><h4>REMARK :</h4>${page.remarks.length ? `<ol>${page.remarks.map(line => `<li>${e(line.text)}</li>`).join("")}</ol>` : '<span class="empty">No defects found.</span>'}</div>`;
  const parts = page.partsTally.length ? `<div class="remark-box parts"><h4>PARTS / RECTIFICATION REQUIRED :</h4><ol>${page.partsTally.map(line => `<li>${e(line.text)}</li>`).join("")}</ol></div>` : "";
  const commentBox = comments({kind:"comments", key:"comments", sectionKey:"comments", sectionTitle:"Comments", title:"Comments", text:page.comments});
  const photos = page.photos.length ? `<div class="blk-h" style="margin-bottom:4pt">Photo Evidence</div><div class="photos">${page.photos.map(photo => {
    const mime = photo.content.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : "image/jpeg";
    return `<div class="photo"><div class="img"><img src="${e(`data:${mime};base64,${photo.content.toString("base64")}`)}" alt="${e(photo.caption)}" style="width:100%;height:100%;object-fit:contain"></div><div class="cap"><b>${e(photo.no)}. ${e(photo.caption)}</b></div></div>`;
  }).join("")}</div>` : "";
  const strip = `<table class="strip"><tr><td class="lbl">INSPECTION DATE</td><td style="width:120pt"><b>${e(page.inspection.date)}</b></td><td class="lbl">INSPECTED BY</td>${page.inspection.inspectedBy.map(name => `<td><b>${e(name)}</b></td>`).join("")}<td></td></tr><tr><td class="lbl">INITIAL</td><td></td><td></td>${page.inspection.inspectedBy.map(() => '<td class="sig"></td>').join("")}<td class="sig"></td></tr></table>`;
  return `<section class="page system-page"><div class="system-title-first">${firstTitle}</div><table class="system-flow"><thead><tr><td style="padding:0;border:0">${continuationTitle}</td></tr></thead><tbody><tr style="break-inside:auto"><td style="padding:0;border:0">${advisory}${blocks(page)}${parts ? `<div class="two-col">${remark}${parts}</div>` : remark}${commentBox}${photos}${strip}${last ? '<div style="margin-top:22pt;text-align:center;font-size:7.8pt;color:#555;letter-spacing:.2em">— END OF REPORT —</div>' : ""}</td></tr></tbody></table></section>`;
}
/** Cached assets only; does not mutate vm, consult the clock, or access the network. */
export function renderReportHtml(vm: ReportViewModel, pageMap?: Map<string, number>): string {
  const style = css.replace(/\{\{(customer|reportNumber)\}\}/g, (_, key: string) => escapeCssString(key === "customer" ? vm.cover.customer : vm.cover.reportNumber ? `Report No. ${vm.cover.reportNumber}` : ""));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${e(vm.cover.jobReference)}</title><style>${fontCss}${style}</style></head><body>${cover(vm)}${summary(vm, pageMap)}${vm.systemPages.map((page, index) => system(page, index === vm.systemPages.length - 1)).join("")}</body></html>`;
}
