import type { Co2ConfiguredInstance, Co2DetectorRow, Co2Responses } from "./co2Types";
import type { JobSystemSnapshot } from "../jobs/jobTypes";

export function configuredDetectorCount(system: JobSystemSnapshot, instance: Co2ConfiguredInstance): number {
  return Math.max(0, system.locations.find((location) => location.id === instance.location.id)?.presetRowCount ?? 0);
}

export function newDetectorRow(instance: Co2ConfiguredInstance, sequence: number, source: "configured" | "technician"): Co2DetectorRow {
  return {
    rowUuid: crypto.randomUUID(), source, displaySequence: sequence,
    alarmZone: instance.zone?.displayName ?? "", location: instance.location.displayName,
    heatDetectorStatus: null, smokeDetectorStatus: null, remarks: ""
  };
}

/** Existing drafts predate provenance. Their original leading rows remain configured. */
export function normalizeDetectorRows(responses: Co2Responses, system: JobSystemSnapshot, instance: Co2ConfiguredInstance): Co2Responses {
  const rows = responses.detectorRows.slice().sort((a, b) => a.displaySequence - b.displaySequence);
  if (rows.some((row) => row.source !== undefined && row.source !== "configured" && row.source !== "technician")) {
    throw new Error("Stored detector row provenance is invalid");
  }
  const preset = configuredDetectorCount(system, instance);
  const configured = rows.filter((row, index) => (row.source ?? (index < preset ? "configured" : "technician")) === "configured");
  const technician = rows.filter((row, index) => (row.source ?? (index < preset ? "configured" : "technician")) === "technician");
  while (configured.length < preset) configured.push(newDetectorRow(instance, 0, "configured"));
  if (configured.length + technician.length === 0) technician.push(newDetectorRow(instance, 0, "technician"));
  return { ...responses, detectorRows: [...configured, ...technician].map((row, index) => ({ ...row, source: index < configured.length ? "configured" : "technician", displaySequence: index + 1 })) };
}

export function detectorRowHasEnteredData(row: Co2DetectorRow, instance: Co2ConfiguredInstance): boolean {
  return row.alarmZone !== (instance.zone?.displayName ?? "") || row.location !== instance.location.displayName
    || row.heatDetectorStatus !== null || row.smokeDetectorStatus !== null || row.remarks.trim() !== "";
}

export function setDetectorRowCount(responses: Co2Responses, system: JobSystemSnapshot, instance: Co2ConfiguredInstance, requested: number, maximum: number): Co2Responses {
  const current = normalizeDetectorRows(responses, system, instance);
  const configured = current.detectorRows.filter((row) => row.source === "configured");
  const technician = current.detectorRows.filter((row) => row.source === "technician");
  const target = Math.max(configured.length, Math.min(maximum, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 0)));
  while (configured.length + technician.length < target) technician.push(newDetectorRow(instance, 0, "technician"));
  while (configured.length + technician.length > target && !detectorRowHasEnteredData(technician[technician.length - 1]!, instance)) technician.pop();
  return { ...current, detectorRows: [...configured, ...technician].map((row, index) => ({ ...row, displaySequence: index + 1 })) };
}

export function wireDetectorResponses(responses: Co2Responses): Co2Responses {
  return { ...responses, detectorRows: responses.detectorRows.map(({ source: _source, ...row }) => row) };
}
