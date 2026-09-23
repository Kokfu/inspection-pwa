import {
  deriveSystemCondition, sectionRemarkLines, v7DisplayLabelLookup, v7DisplayResponseKeyAliases,
  type FinalReportSection, type FinalReportSystemCondition, type FinalServiceReport
} from "./finalServiceReport.js";
import { companyProfile, type CompanyProfile } from "./companyProfile.js";
export { companyProfile, companyProfileAssetPath, defaultCompanyProfile, loadCompanyProfile, type CompanyProfile } from "./companyProfile.js";

/**
 * R1 — structured Final Service Report view model (docs/report-template/README.md §2–§5).
 *
 * Pure data, no rendering. It keeps the V7 BLOCK structure (checklist / measurement /
 * repeatable_table / quantity_summary / comments) by walking the FROZEN
 * `inspection_snapshot.system.definition` against the accepted `response_payload`
 * carried on each section's non-enumerable `source`, instead of the flattened
 * `fields` list. Records that are not V7 (template version < 7), or whose response
 * cannot be located against the definition at all, fall back to ONE checklist block
 * built from the existing flattened fields.
 *
 * Never invents a value: anything the job did not store is `null` (R4 fills them).
 */

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): string | null => typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/* ------------------------------------------------------------------ results */

export type ReportResultValue = "good" | "not_good" | "complete_repair" | "na" | "poor" | "not_relevant";
export type ReportResultDisplay = "GOOD" | "NOT GOOD" | "COMPLETE REPAIR" | "N/A" | "POOR" | "NOT RELEVANT";
export type ReportResult = { value: ReportResultValue; display: ReportResultDisplay; tone: "good" | "bad" | "repair" | "na"; finding: boolean };

const resultTable: Readonly<Record<ReportResultValue, readonly [ReportResultDisplay, ReportResult["tone"]]>> = {
  good: ["GOOD", "good"], not_good: ["NOT GOOD", "bad"], complete_repair: ["COMPLETE REPAIR", "repair"], na: ["N/A", "na"],
  // Legacy V1–V6 vocabulary.
  poor: ["POOR", "bad"], not_relevant: ["NOT RELEVANT", "na"]
};

export function reportResult(value: unknown): ReportResult | null {
  if (typeof value !== "string" || !Object.hasOwn(resultTable, value)) return null;
  const [display, tone] = resultTable[value as ReportResultValue];
  return { value: value as ReportResultValue, display, tone, finding: value === "not_good" || value === "complete_repair" || value === "poor" };
}

/** The flattened-field display strings emitted by `finalServiceReport.ts` (`scalar` / `v6Result`). */
const flattenedResultTokens: Readonly<Record<string, ReportResultValue>> = {
  "Good": "good", "Not Good": "not_good", "Complete Repair": "complete_repair", "No Need Checking / N.A.": "na", "Poor": "poor", "Not Relevant": "not_relevant"
};

/* ------------------------------------------------------------------ model */

export type ReportCover = {
  reportNumber: string | null; issuedAt: string | null;
  customer: string; site: string; siteAddress: string | null;
  telephone: string | null; fax: string | null; contactPerson: string | null;
  serviceDate: string; arrival: string | null; departure: string | null;
  serviceCallNumber: string | null; jobReference: string;
  contractNumber: string | null; frequency: string | null;
  serviceStatus: "completed"; completedAt: string;
  testLeader: string; technicians: string[]; verifiedBy: string | null;
  systemsServiced: Array<{ systemKey: string; label: string; serviced: boolean }>;
};

export type ReportSummaryRow = {
  no: number; systemKey: string; label: string; location: string | null; frequency: string | null;
  condition: FinalReportSystemCondition; conditionDetail: string;
  /** Worst finding in definition order, with the remaining finding count (R2). */
  mainFinding?: string;
};

export type ChecklistRow = { no: number; key: string; label: string; unit: string | null; reading: string | null; result: ReportResult | null; remark: string | null };
export type UnitColumn = { key: string; label: string; result: ReportResult | null; remark: string | null };
export type RegisterColumn = { key: string; label: string; kind: "text" | "result" | "nti" | "remarks"; subColumns: readonly ["N", "T", "I"] | null };
export type RegisterCell =
  | { kind: "text"; text: string | null }
  | { kind: "result"; result: ReportResult | null; remark: string | null }
  | { kind: "nti"; state: { normal: boolean; test: boolean; isolation: boolean } | null }
  | { kind: "remarks"; text: string | null };
export type RegisterRow = { no: number; cells: RegisterCell[] };
export type QuantityRow = { key: string; label: string; kind: "count" | "text"; value: number | string | null; isTotal: boolean };

type BlockHead = { key: string; sectionKey: string; sectionTitle: string; title: string };
export type ReportBlock =
  | (BlockHead & { kind: "checklist"; rows: ChecklistRow[] })
  | (BlockHead & { kind: "units"; units: UnitColumn[] })
  | (BlockHead & { kind: "register"; columns: RegisterColumn[]; rows: RegisterRow[] })
  | (BlockHead & { kind: "quantity"; rows: QuantityRow[] })
  | (BlockHead & { kind: "comments"; text: string | null });

/** One numbered REMARK line: `Block — Row — Item: RESULT — remark`. */
export type ReportRemark = { no: number; text: string; result: ReportResult | null };
export type PartsTallyLine = { component: string; count: number; text: string };
export type ReportPhoto = { no: number; caption: string | null; field: string; width: number; height: number; content: Buffer };

export type SystemPage = {
  no: number; systemKey: string; title: string; location: string | null;
  condition: FinalReportSystemCondition; conditionDetail: string;
  /** "v7" = blocks from the frozen definition; "legacy" = one checklist block from flattened fields. */
  structure: "v7" | "legacy";
  /** In definition order; `comments` blocks included where the definition places them. */
  blocks: ReportBlock[];
  remarks: ReportRemark[];
  partsTally: PartsTallyLine[];
  /** Convenience copy of the comments block text(s) for the page-level Comments box. */
  comments: string | null;
  photos: ReportPhoto[];
  inspection: { date: string; inspectedBy: string[] };
};

export type ReportViewModel = {
  company: CompanyProfile;
  cover: ReportCover;
  summary: ReportSummaryRow[];
  systemPages: SystemPage[];
};

/** All systems printed on the cover, in template order; not-serviced ones are greyed. */
const coverSystems: ReadonlyArray<readonly [string, string]> = [
  ["automatic_sprinkler", "Automatic Sprinkler System"], ["hose_reel", "Hose Reel System"],
  ["fire_alarm_detector", "Fire Alarm / Detector System"], ["hydrant", "Hydrant System"],
  ["portable_fire_extinguisher", "Portable Fire Extinguisher"], ["dry_wet_riser", "Dry / Wet Riser System"],
  ["co2_fire_extinguisher", "CO2 Fire Extinguisher System"], ["wet_chemical", "Wet Chemical System"],
  ["fm200", "FM 200 System"], ["smoke_ventilation", "Smoke Ventilation System"],
  ["fire_intercom", "Fire Intercom System"], ["fire_rated_roller_shutter", "Fire Rated Roller Shutter"]
];

/* ------------------------------------------------------------------ V7 blocks */

/** Repeatable-table block key -> the response array that carries its rows (default `rows`). */
const registerRowArrayKeys: Readonly<Record<string, string>> = {
  device_rows: "primaryDeviceRows", alarm_device_rows: "secondaryAlarmDeviceRows",
  detector_rows: "detectorRows", riser_outlet_rows: "riserOutlets"
};
const pumpUnitLabel = /^(jockey|duty|stand-?by)\s+pump$/i;
const camel = (key: string) => key.replace(/_([a-z0-9])/g, (_, next: string) => next.toUpperCase());
const prettyToken = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const bySortOrder = (items: readonly unknown[]) => items.filter(isRecord).map((item, index) => ({ item, index }))
  .sort((a, b) => Number(a.item.sortOrder ?? 0) - Number(b.item.sortOrder ?? 0) || a.index - b.index).map(({ item }) => item);

type BuildContext = {
  systemKey: string; response: RecordValue; label: (key: string, fallback: string) => string;
  located: number; remarks: Array<{ text: string; result: ReportResult }>; parts: Map<string, number>;
  /** Page-level Comments text, once per bound field key even when several blocks bind it. */
  comments: Map<string, string | null>;
};

/** Response keys are unique within a system: look in every top-level object group, then at the top level. */
function locate(context: BuildContext, key: string): { found: boolean; value: unknown } {
  const candidates = [...new Set([key, camel(key)])];
  for (const container of Object.values(context.response)) {
    if (!isRecord(container)) continue;
    for (const candidate of candidates) if (Object.hasOwn(container, candidate)) return { found: true, value: container[candidate] };
  }
  for (const candidate of candidates) {
    const value = context.response[candidate];
    if (Object.hasOwn(context.response, candidate) && !isRecord(value) && !Array.isArray(value)) return { found: true, value };
  }
  // Hose Reel's per-drum type lives on the rows (schema 3) or in a swing/fixed map (schema 2).
  if (context.systemKey === "hose_reel" && key === "drum_type") {
    const map = context.response.drumTypes;
    const types = isRecord(map) ? Object.keys(map).filter((type) => map[type] === true)
      : Array.isArray(context.response.rows) ? context.response.rows.filter(isRecord).map((row) => row.drumType).filter((type): type is string => typeof type === "string") : [];
    return { found: true, value: types.length ? [...new Set(types)].map(prettyToken).join(", ") : null };
  }
  return { found: false, value: undefined };
}

function textReading(control: unknown, value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = nonEmpty(value);
  return text === null ? null : control === "select" ? prettyToken(text) : text;
}

function noteFinding(context: BuildContext, parts: Array<string | null>, label: string, result: ReportResult | null, remark: string | null) {
  if (!result?.finding) return;
  const where = parts.filter((part): part is string => part !== null).join(" — ");
  context.remarks.push({ text: `${where ? `${where} — ` : ""}${label}: ${result.display}${remark ? ` — ${remark}` : ""}`, result });
}

function checklistBlock(context: BuildContext, head: BlockHead, items: RecordValue[]): ReportBlock {
  const rows: ChecklistRow[] = items.map((item, index) => {
    const key = String(item.key);
    const label = context.label(key, String(item.label ?? key));
    const { found, value } = locate(context, key);
    if (found) context.located += 1;
    let result: ReportResult | null = null; let remark: string | null = null; let reading: string | null = null;
    if (item.control === "good_poor") {
      result = reportResult(isRecord(value) ? value.result : value);
      remark = isRecord(value) ? nonEmpty(value.remarks) : null;
    } else reading = textReading(item.control, value);
    noteFinding(context, [head.sectionTitle], label, result, remark);
    return { no: index + 1, key, label, unit: nonEmpty(item.unit), reading, result, remark };
  });
  return { kind: "checklist", ...head, rows };
}

function unitsBlock(context: BuildContext, head: BlockHead, items: RecordValue[]): ReportBlock {
  const units = items.map((item) => {
    const key = String(item.key);
    const label = context.label(key, String(item.label ?? key));
    const { found, value } = locate(context, key);
    if (found) context.located += 1;
    const result = reportResult(isRecord(value) ? value.result : value);
    const remark = isRecord(value) ? nonEmpty(value.remarks) : null;
    noteFinding(context, [head.sectionTitle], label, result, remark);
    return { key, label, result, remark };
  });
  return { kind: "units", ...head, units };
}

/** A V7 `measurement` block prints as a checklist with Req/Unit + Reading columns. */
function measurementBlock(context: BuildContext, head: BlockHead, items: RecordValue[]): ReportBlock {
  const rows: ChecklistRow[] = items.map((item, index) => {
    const key = String(item.key);
    const label = context.label(key, String(item.label ?? key));
    const { found, value } = locate(context, key);
    if (found) context.located += 1;
    const measurements = Array.isArray(item.measurements) ? item.measurements.filter(isRecord) : [];
    const values = isRecord(value) && isRecord(value.values) ? value.values : {};
    const present = measurements.map((measurement) => ({ label: context.label(String(measurement.key), String(measurement.label ?? measurement.key)), value: values[String(measurement.key)] }))
      .filter((entry) => typeof entry.value === "number" && Number.isFinite(entry.value));
    const reading = present.length === 0 ? null
      : measurements.length === 1 ? String(present[0]!.value)
        : present.map((entry) => `${entry.label} ${String(entry.value)}`).join(" / ");
    const unit = (isRecord(value) ? nonEmpty(value.unit) : null) ?? nonEmpty(measurements[0]?.unit);
    const result = reportResult(isRecord(value) ? value.result : undefined);
    const remark = isRecord(value) ? nonEmpty(value.remarks) : null;
    noteFinding(context, [head.sectionTitle], label, result, remark);
    return { no: index + 1, key, label, unit, reading, result, remark };
  });
  return { kind: "checklist", ...head, rows };
}

function registerBlock(context: BuildContext, head: BlockHead, blockKey: string, columnDefinitions: RecordValue[]): ReportBlock {
  const aliases = v7DisplayResponseKeyAliases[context.systemKey] ?? {};
  const columns: RegisterColumn[] = columnDefinitions.map((column) => {
    const key = String(column.key);
    const kind = column.control === "good_poor" ? "result"
      : column.control === "normal_test_isolation" || column.control === "normal_test_isolation_multi" ? "nti"
        : column.control === "remarks" ? "remarks" : "text";
    return { key, label: context.label(key, String(column.label ?? key)), kind, subColumns: kind === "nti" ? ["N", "T", "I"] as const : null };
  });
  const source = context.response[registerRowArrayKeys[blockKey] ?? "rows"];
  if (Array.isArray(source)) context.located += 1;
  const responseKey = (row: RecordValue, column: RegisterColumn) => {
    const base = camel(column.key);
    const candidates = [
      ...(aliases[column.key] ?? []).filter((alias) => !alias.includes(" ")),
      ...(column.kind === "result" ? [`${base}Result`] : []), ...(column.kind === "nti" ? [`${base}Status`] : []),
      base, column.key, ...(column.key === "location" ? ["locationText"] : [])
    ];
    return candidates.find((candidate) => Object.hasOwn(row, candidate));
  };
  const rows: RegisterRow[] = (Array.isArray(source) ? source : []).filter(isRecord).map((row, index) => {
    const no = index + 1;
    const fieldRemarks = isRecord(row.fieldRemarks) ? row.fieldRemarks : {};
    const locationColumn = columns.findIndex((column) => column.key === "location" || column.key === "locationText");
    const location = locationColumn >= 0 ? nonEmpty(row[responseKey(row, columns[locationColumn]!) ?? ""]) : null;
    const rowLabel = `No. ${no}${location ? ` (${location})` : ""}`;
    const cells = columns.map((column): RegisterCell => {
      const key = responseKey(row, column);
      const value = key === undefined ? undefined : row[key];
      if (column.kind === "remarks") return { kind: "remarks", text: nonEmpty(value) };
      if (column.kind === "text") return { kind: "text", text: textReading("text", value) };
      if (column.kind === "nti") {
        const states = Array.isArray(value) ? value : typeof value === "string" ? [value] : null;
        return { kind: "nti", state: states && states.every((state) => state === "normal" || state === "test" || state === "isolation")
          ? { normal: states.includes("normal"), test: states.includes("test"), isolation: states.includes("isolation") } : null };
      }
      const result = reportResult(value);
      const remark = key === undefined ? null : nonEmpty(fieldRemarks[key]);
      noteFinding(context, [head.sectionTitle, rowLabel], column.label, result, remark);
      if (result?.value === "not_good") context.parts.set(column.label.toUpperCase(), (context.parts.get(column.label.toUpperCase()) ?? 0) + 1);
      return { kind: "result", result, remark };
    });
    return { no, cells };
  });
  return { kind: "register", ...head, columns, rows };
}

function quantityBlock(context: BuildContext, head: BlockHead, items: RecordValue[]): ReportBlock {
  const rows: QuantityRow[] = items.map((item) => {
    const key = String(item.key);
    const { found, value } = locate(context, key);
    if (found) context.located += 1;
    const kind = item.control === "count" ? "count" as const : "text" as const;
    return {
      key, label: context.label(key, String(item.label ?? key)), kind,
      value: kind === "count" ? (Number.isSafeInteger(value) ? value as number : null) : nonEmpty(value),
      isTotal: key === "total"
    };
  });
  return { kind: "quantity", ...head, rows };
}

function commentsBlock(context: BuildContext, head: BlockHead, field: unknown): ReportBlock {
  const key = isRecord(field) && typeof field.key === "string" ? field.key : "comments";
  const { found, value } = locate(context, key);
  if (found) context.located += 1;
  const text = nonEmpty(value);
  if (!context.comments.has(key)) context.comments.set(key, text);
  return { kind: "comments", ...head, text };
}

type StructuredResult = { blocks: ReportBlock[]; remarks: Array<{ text: string; result: ReportResult }>; parts: Map<string, number>; comments: string[] };

function structuredBlocks(section: FinalReportSection): StructuredResult | undefined {
  const source = section.source;
  const snapshot = source?.snapshot;
  if (!source || !isRecord(snapshot) || !isRecord(snapshot.template) || snapshot.template.version !== 7
    || !isRecord(snapshot.system) || !isRecord(snapshot.system.definition) || !Array.isArray(snapshot.system.definition.sections)
    || !isRecord(source.response)) return undefined;
  const lookup = v7DisplayLabelLookup(section.systemKey, snapshot, source.frozenSystem)?.display;
  const context: BuildContext = {
    systemKey: section.systemKey, response: source.response,
    label: (key, fallback) => lookup?.get(key) ?? fallback,
    located: 0, remarks: [], parts: new Map(), comments: new Map()
  };
  const blocks: ReportBlock[] = [];
  for (const definitionSection of bySortOrder(snapshot.system.definition.sections)) {
    const sectionTitle = String(definitionSection.title ?? definitionSection.key);
    const definitionBlocks = bySortOrder(Array.isArray(definitionSection.blocks) ? definitionSection.blocks : []);
    const dataBlocks = definitionBlocks.filter((block) => block.type !== "comments").length;
    for (const block of definitionBlocks) {
      const head: BlockHead = {
        key: String(block.key), sectionKey: String(definitionSection.key), sectionTitle,
        title: block.type === "comments" ? String(block.title ?? "Comments") : dataBlocks === 1 ? sectionTitle : String(block.title ?? block.key)
      };
      const items = Array.isArray(block.items) ? block.items.filter(isRecord) : [];
      if (block.type === "checklist") {
        blocks.push(items.length >= 2 && items.every((item) => item.control === "good_poor" && pumpUnitLabel.test(String(item.label)))
          ? unitsBlock(context, head, items) : checklistBlock(context, head, items));
      } else if (block.type === "measurement") blocks.push(measurementBlock(context, head, items));
      else if (block.type === "repeatable_table") blocks.push(registerBlock(context, head, String(block.key), Array.isArray(block.columns) ? block.columns.filter(isRecord) : []));
      else if (block.type === "quantity_summary") blocks.push(quantityBlock(context, head, items));
      else if (block.type === "comments") blocks.push(commentsBlock(context, head, block.field));
    }
  }
  // Nothing in the response lines up with the definition: never print an all-blank page.
  if (context.located === 0) return undefined;
  const comments = [...context.comments.values()].filter((text): text is string => text !== null);
  return { blocks, remarks: context.remarks, parts: context.parts, comments };
}

/* ------------------------------------------------------------------ legacy */

function legacyPage(section: FinalReportSection): Pick<SystemPage, "blocks" | "remarks" | "comments"> {
  const isComments = (field: FinalReportSection["fields"][number]) => field.depth === 0 && field.label === "Comments";
  const rows: ChecklistRow[] = section.fields.filter((field) => !isComments(field)).map((field, index) => {
    const token = Object.hasOwn(flattenedResultTokens, field.value) ? flattenedResultTokens[field.value] : undefined;
    return { no: index + 1, key: field.label, label: field.label, unit: null, reading: token ? null : field.value, result: token ? reportResult(token) : null, remark: null };
  });
  const comments = nonEmpty(section.fields.find(isComments)?.value);
  const head = { key: "legacy", sectionKey: "legacy", sectionTitle: section.label };
  const blocks: ReportBlock[] = [{ kind: "checklist", ...head, title: section.label, rows }];
  if (comments !== null) blocks.push({ kind: "comments", ...head, key: "comments", title: "Comments", text: comments });
  // sectionRemarkLines emits one line per finding field, in field order.
  const findings = section.fields.filter((field) => field.value === "Not Good" || field.value === "Poor" || field.value === "Complete Repair");
  const remarks = sectionRemarkLines(section).map((line, index) => ({
    no: index + 1, text: line.replace(/^\d+\.\s/, ""), result: reportResult(flattenedResultTokens[findings[index]?.value ?? ""])
  }));
  return { blocks, remarks, comments };
}

/* ------------------------------------------------------------------ build */

const locationText = (section: FinalReportSection) => section.location
  ? `${section.location.zoneLabel ? `${section.location.zoneLabel} / ` : ""}${section.location.locationLabel}` : null;

export function summaryMainFinding(remarks: readonly ReportRemark[]): string {
  const findings = remarks.filter(remark => remark.result?.finding);
  const worst = findings.find(remark => remark.result?.tone === "bad") ?? findings[0];
  return worst ? `${worst.text}${findings.length > 1 ? ` (+${findings.length - 1} more)` : ""}` : "—";
}

export function buildReportViewModel(report: FinalServiceReport, options: { company?: CompanyProfile } = {}): ReportViewModel {
  const company = options.company ?? companyProfile;
  const serviced = new Set(report.systems.map((system) => system.systemKey));
  const frequency = report.serviceFrequency ? ({ MONTHLY: "Monthly", QUARTERLY: "Quarterly", HALF_YEARLY: "Half-yearly", ANNUALLY: "Annually" } as const)[report.serviceFrequency as "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "ANNUALLY"] ?? null : null;
  const cover: ReportCover = {
    reportNumber: report.reportNumber ?? null, issuedAt: report.completedAt ? report.completedAt.slice(0, 10) : null,
    customer: report.customer, site: report.site, siteAddress: report.siteAddress ?? null,
    telephone: report.telephone ?? null, fax: report.fax ?? null, contactPerson: report.contact ?? null,
    serviceDate: report.serviceDate, arrival: report.arrival ?? null, departure: report.departure ?? null,
    serviceCallNumber: report.serviceCallNumber ?? null, jobReference: report.jobReference,
    contractNumber: report.contractNumber ?? null, frequency,
    serviceStatus: "completed", completedAt: report.completedAt,
    testLeader: report.completedBy, technicians: report.technicians ?? [report.completedBy],
    verifiedBy: company.verifiedBy.name || null,
    systemsServiced: [
      ...coverSystems.map(([systemKey, label]) => ({ systemKey, label, serviced: serviced.has(systemKey) })),
      ...report.systems.filter((system) => !coverSystems.some(([key]) => key === system.systemKey)).map((system) => ({ systemKey: system.systemKey, label: system.label, serviced: true }))
    ]
  };
  const systemPages: SystemPage[] = report.sections.map((section, index) => {
    const structured = structuredBlocks(section);
    let page: Pick<SystemPage, "blocks" | "remarks" | "comments">;
    let condition: FinalReportSystemCondition; let conditionDetail: string;
    let partsTally: PartsTallyLine[] = [];
    if (structured) {
      page = { blocks: structured.blocks, remarks: structured.remarks.map((remark, remarkIndex) => ({ no: remarkIndex + 1, ...remark })), comments: structured.comments.length ? structured.comments.join("\n") : null };
      // Same 4->3 rule as deriveSystemCondition, over the structured results.
      const failed = structured.remarks.find((remark) => remark.result.tone === "bad");
      const refer = structured.remarks.find((remark) => remark.result.value === "complete_repair");
      condition = failed ? "FAILED" : refer ? "REFER DETAIL PAGE" : "GOOD CONDITIONS";
      conditionDetail = (failed ?? refer)?.text.slice(0, 200) ?? "";
      partsTally = [...structured.parts.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([component, count]) => ({ component, count, text: `${component} X ${count}` }));
    } else {
      page = legacyPage(section);
      ({ condition, conditionDetail } = deriveSystemCondition([section]));
    }
    return {
      no: index + 1, systemKey: section.systemKey, title: section.label, location: locationText(section),
      condition, conditionDetail, structure: structured ? "v7" : "legacy",
      ...page, partsTally,
      photos: section.evidence.map((evidence, photoIndex) => ({ no: photoIndex + 1, caption: evidence.caption ?? null, field: evidence.field, width: evidence.width, height: evidence.height, content: evidence.content })),
      inspection: { date: report.serviceDate, inspectedBy: report.technicians ?? [report.completedBy] }
    };
  });
  const summary: ReportSummaryRow[] = systemPages.map((page) => ({
    no: page.no, systemKey: page.systemKey, label: page.title, location: page.location, frequency,
    condition: page.condition, conditionDetail: page.conditionDetail, mainFinding: summaryMainFinding(page.remarks)
  }));
  return { company, cover, summary, systemPages };
}
