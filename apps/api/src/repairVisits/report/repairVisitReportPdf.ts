import { readFileSync } from "node:fs";
import { resolveCompanyLogoFile } from "../../reports/companyProfile.js";
import { renderHtmlToPdf, resolveNamedDestinationPages } from "../../reports/pdf/htmlToPdf.js";
import type { RepairVisitReportModel } from "./repairVisitReportModel.js";
import { renderRepairVisitReport } from "./renderRepairVisitReport.js";

/** I/O boundary: resolve the same live company logo as service reports, then use
 * Chromium's actual destinations for summary page numbers (including overflow). */
export async function renderRepairVisitReportPdf(model: RepairVisitReportModel): Promise<Buffer> {
  const logo = model.companyLogo === undefined ? resolveCompanyLogoFile(model.company.logoFile) : undefined;
  const vm: RepairVisitReportModel = { ...model, companyLogo: model.companyLogo ?? (logo ? {
    content: readFileSync(logo.path), mime: logo.mime as "image/png" | "image/svg+xml"
  } : null) };
  let pageMap: Map<string, number> | undefined;
  for (let pass = 0; pass < 4; pass++) {
    const html = renderRepairVisitReport(vm, pageMap);
    const pdf = await renderHtmlToPdf(html);
    const actual = await resolveNamedDestinationPages(pdf);
    for (const anchor of html.matchAll(/id="(rv-\d+)"/g)) {
      if (!actual.has(anchor[1])) throw new Error("Repair report destination missing");
    }
    if (pageMap && [...actual].every(([key, page]) => pageMap!.get(key) === page)) return pdf;
    pageMap = actual;
  }
  throw new Error("Repair report pagination did not converge");
}
