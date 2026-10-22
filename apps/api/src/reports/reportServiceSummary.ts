import type { FinalReportSystemCondition } from "./finalServiceReport.js";
import type { ReportBlock, ReportResult, SystemPage } from "./reportViewModel.js";

/**
 * Compact, JSON-safe per-service summary for the on-screen Final Report (technician + manager).
 * It is derived from the same structured page the PDF uses, so the screen and the PDF agree on
 * what is a finding. Findings are listed first with their own remark; everything that passed is
 * kept as a flat "checked" list the page collapses. Legacy (pre-V7) pages return undefined and
 * the screen keeps its existing field list for them.
 */
export type ServiceSummaryItem = { where: string | null; label: string; result: ReportResult["display"]; tone: ReportResult["tone"]; remark: string | null };
export type ServiceSummaryReading = { label: string; value: string };
export type ServiceSummary = {
  condition: FinalReportSystemCondition;
  counts: { checked: number; good: number; notRelevant: number; findings: number };
  findings: ServiceSummaryItem[];
  checked: ServiceSummaryItem[];
  readings: ServiceSummaryReading[];
  comments: string | null;
};

const dataBlocks = (blocks: readonly ReportBlock[]) => blocks.filter((block) => block.kind !== "comments");
const joinWhere = (...parts: Array<string | null>) => {
  const text = parts.filter((part): part is string => part !== null && part !== "").join(" — ");
  return text === "" ? null : text;
};

export function buildServiceSummary(page: SystemPage): ServiceSummary | undefined {
  if (page.structure !== "v7") return undefined;
  const findings: ServiceSummaryItem[] = [];
  const checked: ServiceSummaryItem[] = [];
  const readings: ServiceSummaryReading[] = [];
  const multiBlock = dataBlocks(page.blocks).length > 1;
  const record = (where: string | null, label: string, result: ReportResult | null, remark: string | null) => {
    if (!result) return;
    (result.finding ? findings : checked).push({ where, label, result: result.display, tone: result.tone, remark });
  };
  for (const block of page.blocks) {
    // Same heading the PDF REMARK lines use (the definition section title).
    const blockWhere = multiBlock ? block.sectionTitle : null;
    if (block.kind === "checklist") {
      for (const row of block.rows) {
        record(blockWhere, row.label, row.result, row.remark);
        if (row.reading !== null) readings.push({ label: row.unit ? `${row.label} (${row.unit})` : row.label, value: row.reading });
      }
    } else if (block.kind === "units") {
      for (const unit of block.units) record(blockWhere, unit.label, unit.result, unit.remark);
    } else if (block.kind === "register") {
      const locationIndex = block.columns.findIndex((column) => column.key === "location" || column.key === "locationText");
      for (const row of block.rows) {
        const locationCell = locationIndex >= 0 ? row.cells[locationIndex] : undefined;
        const location = locationCell?.kind === "text" ? locationCell.text : null;
        const where = joinWhere(blockWhere, `No. ${row.no}${location ? ` (${location})` : ""}`);
        row.cells.forEach((cell, index) => { if (cell.kind === "result") record(where, block.columns[index]!.label, cell.result, cell.remark); });
      }
    } else if (block.kind === "quantity") {
      for (const row of block.rows) if (row.value !== null && row.value !== "") readings.push({ label: row.label, value: String(row.value) });
    }
  }
  const good = checked.filter((item) => item.tone === "good").length;
  return {
    condition: page.condition,
    counts: { checked: findings.length + checked.length, good, notRelevant: checked.length - good, findings: findings.length },
    findings, checked, readings, comments: page.comments
  };
}
