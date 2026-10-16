import { readFileSync } from "node:fs";
import { currentCompanyProfile, resolveCompanyLogoFile } from "../reports/companyProfile.js";
import { escapeHtml as e, escapeCssString } from "../reports/template/renderReportHtml.js";
import { reportFontFaceCss } from "../reports/pdf/reportFonts.js";
import type { R } from "./findingReaders.js";

export type ExportPart = { clientUuid: string; approvalSequence: number; approvalId: string; findingId: string;
  sourceRevision: string; reviewSequence: number; cycle: number; original: R; before: string | null;
  after: string; remark: string; technician: string; performedAt: string; submittedAt: string; reviewer: string; reviewedAt: string };
const date = (v: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" }).format(new Date(v));
const label = (v: unknown): string => typeof v === "object" && v !== null ? String((v as R).displayName ?? "") : String(v ?? "");
export function repairReportHtml(parts: ExportPart[], number: string, issuedAt: string, preview = false) {
  const profile = currentCompanyProfile(), original = parts[0]!.original;
  const logo = resolveCompanyLogoFile(profile.logoFile);
  const logoMarkup = logo ? `<img class="logo" alt="Company logo" src="data:${logo.mime};base64,${readFileSync(logo.path).toString("base64")}">` : '<div class="logo">MFE</div>';
  const css = readFileSync(new URL("../reports/template/report.css", import.meta.url), "utf8")
    .replace("@page {", "@page repair {")
    // Bottom-aligned top margin boxes disappear on forced Chromium pages when
    // the issued report-number footer is present. Keep the shared furniture,
    // but anchor this repair header at the top of its reserved margin.
    .replaceAll("vertical-align: bottom; padding-bottom: 3mm;", "vertical-align: top; padding-top: 3mm; padding-bottom: 0;")
    .replaceAll("{{customer}}", escapeCssString(label(original.customer))).replaceAll("{{reportNumber}}", escapeCssString(number))
    .replaceAll("FIRE SYSTEM SERVICE REPORT", "FIRE SYSTEM REPAIR REPORT").replace("accepted inspection records", "approved repair records");
  const unit = (o: R) => {
    const u = o.unit as R | null, instance = o.instance as R | null;
    return [u?.locationText, u?.location, u?.assetReference, u?.alarmZone, label(u?.zoneSnapshot), label(u?.locationSnapshot),
      label(instance?.zone), label(instance?.location), u?.rowUuid ? `Row ${u.rowUuid}` : ""].filter(Boolean).join(" / ") || String(o.instanceKey);
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${e(number)}</title><style>${reportFontFaceCss()}${css}
    .repair-remarks{white-space:pre-wrap;overflow-wrap:anywhere;margin:6pt 0;line-height:1.5}
    .repair-images{display:flex;gap:12pt;break-inside:avoid}.repair-images figure{margin:0;width:50%}
    .repair-images img{width:100%;height:180pt;object-fit:contain;border:.6pt solid #9a9a9a}
    h2,h3{break-after:avoid}.repair-meta{overflow-wrap:anywhere} .repair-part{break-before:page}.page{page:repair}
    </style></head><body><section class="page"><div class="letterhead">${logoMarkup}<div class="co"><b>${e(profile.legalName)} <small>${e(profile.registrationNo)}</small></b><div>${e(profile.address)}</div><div>Tel: ${e(profile.tel)} · Fax: ${e(profile.fax)} · Email: ${e(profile.email)}</div></div><div class="docid"><div><span>Report No.</span><b>${e(number)}</b></div><div><span>Issued</span><b>${e(date(issuedAt))} MYT</b></div></div></div>
    <div class="doc-title"><h1>FIRE SYSTEM REPAIR REPORT</h1><div>${preview ? "PREVIEW - NOT ISSUED" : "ISSUED APPROVED SUBSET"}</div></div>
    <table class="info"><tr><td class="lbl">Client</td><td>${e(label(original.customer))}</td></tr><tr><td class="lbl">Site</td><td>${e(label(original.site))}</td></tr><tr><td class="lbl">Original Visit</td><td>${e((original.sourceJob as R).reference)} · ${e((original.sourceJob as R).title)}</td></tr><tr><td class="lbl">Service</td><td>${e(original.system)}</td></tr><tr><td class="lbl">Selected Approved Cycles</td><td>${parts.length}</td></tr></table>
    <p>Before always means the ORIGINAL accepted inspection. Each selected cycle is explicitly listed. Pending, rejected and withdrawn parts are outside this document.</p><p>This document records approval at issuance. Later withdrawal or source eligibility changes are shown in issued history; the issued document remains immutable.</p>
    <table><thead><tr><th>Unit / Section / Finding</th><th>Cycle</th><th>Repair UUID</th><th>Approval</th></tr></thead><tbody>${parts.map(p => `<tr><td>${e(unit(p.original))}<br>${e(p.original.sectionLabel)} / ${e(p.original.fieldLabel)}</td><td>${p.cycle}</td><td class="repair-meta">${e(p.clientUuid)}</td><td>${p.approvalSequence}</td></tr>`).join("")}</tbody></table></section>
    ${parts.map(p => `<section class="page repair-part"><div class="sys-title"><div class="no">Cycle ${p.cycle}</div><div class="name"><b>${e(p.original.fieldLabel)}</b><span>${e(p.original.sectionLabel)} · ${e(unit(p.original))}</span></div></div>
    <p class="repair-meta">Repair: ${e(p.clientUuid)} · Original finding: ${e(p.findingId)}</p>
    <p>Technician: ${e(p.technician)} · Performed: ${e(date(p.performedAt))} MYT · Submitted: ${e(date(p.submittedAt))} MYT</p><p>Reviewer: ${e(p.reviewer)} · Approved: ${e(date(p.reviewedAt))} MYT · Approval sequence ${p.approvalSequence}</p>
    <div class="repair-images"><figure><figcaption><b>ORIGINAL Before - ${e(p.original.result === "poor" ? "Poor" : "Not Good")}</b></figcaption>${p.before ? `<img alt="Original accepted Before photo" src="${p.before}">` : '<p>Historical finding: no original Before photo.</p>'}</figure><figure><figcaption><b>Immutable After - Cycle ${p.cycle}</b></figcaption><img alt="Approved repair After photo" src="${p.after}"></figure></div>
    <h3>ORIGINAL Before Remark</h3><p class="repair-remarks">${e(p.original.remark || "No historical remark recorded.")}</p><h3>Immutable Repair Remark</h3><p class="repair-remarks">${e(p.remark)}</p>
    <p class="repair-meta">Source eligibility revision: ${e(p.sourceRevision)} · Review sequence: ${p.reviewSequence}</p></section>`).join("")}</body></html>`;
}
