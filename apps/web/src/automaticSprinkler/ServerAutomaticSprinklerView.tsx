import { useEffect, useState } from "react";
import type {
  ServerAutomaticSprinklerDetail,
  ServerInspectionAttachment
} from "./serverAutomaticSprinklerApi";
import { serverAttachmentContentUrl } from "./serverAutomaticSprinklerApi";
import {
  automaticSprinklerV7AcceptedEvidenceContentUrl,
  loadAutomaticSprinklerV7AcceptedEvidence,
  type AutomaticSprinklerV7AcceptedEvidence
} from "./automaticSprinklerV7AcceptedEvidence";
import { overriddenLabel } from "../inspections/labelOverrides";
import { formatClientDateTime } from "../uiPresentation";
import type {
  SprinklerMeasurementResponse,
  SprinklerRowResponse,
  V7AutomaticSprinklerResponses
} from "./automaticSprinklerTypes";

type Props = {
  inspection: ServerAutomaticSprinklerDetail;
  onBack: () => void;
};

const resultLabel = (value: string | null | undefined) =>
  value === "good" ? "Good"
    : value === "not_good" ? "Not Good"
      : value === "complete_repair" ? "Complete Repair"
        : value === "na" ? "No Need Checking / N.A."
          : value === "poor" ? "Poor"
            : "Not recorded";

const isFinding = (value: string | null | undefined) => value === "not_good" || value === "complete_repair";

/** Water Tank / Pump House / Main Alarm Valve checklist fields, then the
 * three-row Test Run Fire Pump 30 Minutes block, in paper-form order.
 *
 * Each entry is `[heading, canonical resolved-controls section key, fields]`.
 * The section key builds the canonical `checklist.<section>.<key>` path a
 * Manager's override is stored under - the same grammar the technician form
 * uses - so a renamed field lands on exactly the row it names. */
const v7ChecklistSections: ReadonlyArray<readonly [string, string, ReadonlyArray<readonly [string, string]>]> = [
  ["Water Tank", "waterTank", [
    ["saj_main_water_supply", "S.A.J Main Water Supply"],
    ["water_level", "Water Level"],
    ["automatic_refilling_facilities", "Automatic Refilling Facilities"],
    ["drain_and_stop_valve_positions", "Drain Valve Closed and Stop Valves Open"]
  ]],
  ["Pump House", "pumpHouse", [
    ["pump_house_clean", "Keep Clean in Pump House"],
    ["manual_start_pumps", "Manual Start Jockey, Duty and Stand-by Pumps"],
    ["standby_pump_service_items", "Stand-by Pump Water, Oil, Fuel, Belt and Other Service Items"],
    ["battery_charging_alternator", "Battery Charging Alternator Operation"],
    ["battery_serviceable", "Battery in Good Serviceable Condition"],
    ["pump_phase_failure_alarm", "Pump Run / Phase Failure Alarm Signal to Main Alarm Panel"],
    ["pumps_auto_start", "Jockey, Duty and Stand-by Pumps in Auto Start Position"],
    ["test_and_gate_valve_positions", "Test Valve Closed and Gate Valves Open"]
  ]],
  ["Main Alarm Valve", "mainAlarmValve", [
    ["breaching_inlet", "Breaching Inlet in Good Serviceable Condition"],
    ["alarm_gong", "Alarm Gong in Function"],
    ["flow_meter_valve_positions", "Flow Meter Valve Closed and Other Valves Open"]
  ]],
  ["Test Run Fire Pump 30 Minutes", "testRunFirePump", [
    ["trfp_jockey_pump", "Jockey Pump"],
    ["trfp_duty_pump", "Duty Pump"],
    ["trfp_standby_pump", "Standby Pump"]
  ]]
];
const v7MeasurementSections: ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, string]>]> = [
  ["Pump House", [
    ["jockey_pump_pressure", "Jockey Pump"],
    ["duty_pump_cut_in", "Duty Pump Cut In"],
    ["standby_pump_cut_in", "Stand-by Pump Cut In"]
  ]],
  ["Main Alarm Valve", [
    ["water_supply_gauge", "Water Supply Gauge"],
    ["installation_gauge", "Installation Gauge"]
  ]]
];

function ServerV7AutomaticSprinklerView({ inspection, onBack }: Props) {
  const responses = inspection.responses as V7AutomaticSprinklerResponses;
  // Display-only, per NODE: substitute a caption only where this job's FROZEN
  // map actually names that canonical path, exactly like the technician form's
  // `labelAt`. A field the Manager never renamed keeps the caption below
  // untouched, so saving one override cannot reword any other row. The override
  // is applied here and nowhere else, so it can never be applied twice.
  const labelAt = (path: string, definitionLabel: string) =>
    overriddenLabel(inspection.displayLabelOverrides, path, definitionLabel);
  const [evidence, setEvidence] = useState<AutomaticSprinklerV7AcceptedEvidence[]>([]);
  const [evidenceError, setEvidenceError] = useState("");
  useEffect(() => {
    let current = true;
    void loadAutomaticSprinklerV7AcceptedEvidence(inspection.clientUuid).then((items) => {
      if (current) { setEvidence(items); setEvidenceError(""); }
    }, () => { if (current) setEvidenceError("Accepted evidence is unavailable."); });
    return () => { current = false; };
  }, [inspection.clientUuid]);

  const findingPhoto = (fieldPath: string, result: string | null | undefined, remarks: string, name: string) => {
    if (!isFinding(result)) return null;
    const photo = evidence.find((item) => item.fieldPath === fieldPath);
    const photoUrl = photo ? automaticSprinklerV7AcceptedEvidenceContentUrl(photo.photoUuid) : undefined;
    return <>
      <p><strong>Remark:</strong> {remarks || "Not recorded"}</p>
      {photoUrl ? <>
        <a href={photoUrl} target="_blank" rel="noreferrer" className="secondary-command">View accepted photo</a>
        <img src={photoUrl} alt={`${name} accepted evidence`} className="accepted-evidence-photo" />
      </> : null}
    </>;
  };

  return <section className="hose-reel-form sprinkler-form server-inspection-detail" aria-labelledby="server-sprinkler-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button>
    <header className="inspection-context">
      <div>
        <p className="eyebrow">{inspection.jobReference}</p>
        <h2 id="server-sprinkler-title">{inspection.systemLabel}</h2>
        <p><strong>{inspection.customerName}</strong></p>
        <p>{inspection.jobTitle}</p>
      </div>
      <strong className="inspection-status status-synced">Inspection Complete</strong>
    </header>
    <p className="success-message">
      Submitted {formatClientDateTime(inspection.performedAt)} M-BM-7 Synced by {inspection.syncedByUsername}
    </p>
    {v7ChecklistSections.map(([title, section, fields]) => <section key={`checklist-${title}`} aria-label={`${title} checklist`}>
      <h3>{title}</h3>
      {fields.map(([key, fallbackLabel]) => {
        const response = responses.checklist[key as keyof typeof responses.checklist] as SprinklerRowResponse | undefined;
        if (!response) return null;
        const label = labelAt(`checklist.${section}.${key}`, fallbackLabel);
        const path = `automatic_sprinkler_checks.${key}`;
        return <section className="hose-check-row" key={key}>
          <strong>{label}</strong>
          <span>{resultLabel(response.result)}</span>
          {findingPhoto(path, response.result, response.remarks, label)}
        </section>;
      })}
    </section>)}
    {v7MeasurementSections.map(([title, fields]) => <section key={`measurement-${title}`} aria-label={`${title} measurements`}>
      <h3>{title} — Pressure Readings</h3>
      {fields.map(([key, fallbackLabel]) => {
        const response = responses.measurements[key as keyof typeof responses.measurements] as SprinklerMeasurementResponse<string> | undefined;
        if (!response) return null;
        const label = labelAt(`measurements.${key}`, fallbackLabel);
        const path = `automatic_sprinkler_measurements.${key}`;
        return <section className="measurement-card" key={key}>
          <strong>{label}</strong>
          {Object.entries(response.values).map(([valueKey, reading]) => <div className="psi-value-with-evidence" key={valueKey}>
            <div>
              <span className="status-caption">{labelAt(`measurements.${key}.values.${valueKey}`, valueKey === "cut_in" ? "Cut In" : valueKey === "cut_out" ? "Cut Out" : "Reading")}</span>
              <strong>{reading ?? "Not recorded"} {response.unit}</strong>
            </div>
          </div>)}
          <span>{resultLabel(response.result)}</span>
          {findingPhoto(path, response.result, response.remarks, label)}
        </section>;
      })}
    </section>)}
    {evidenceError ? <p className="error-text">{evidenceError}</p> : null}
    <section>
      <h3>Comments</h3>
      <p>{responses.comments || "No comments"}</p>
    </section>
  </section>;
}

function ServerPhoto({
  attachment
}: {
  attachment: ServerInspectionAttachment;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentUrl = serverAttachmentContentUrl(attachment.photoUuid);
  const source = attachment.captureSource === "camera"
    ? "Camera"
    : attachment.captureSource === "gallery"
      ? "Gallery"
      : "Photo";
  return <div className="photo-evidence-field">
    <button
      type="button"
      className="photo-thumbnail"
      onClick={() => setExpanded(true)}
      aria-label={`View ${source} photo`}
    >
      <img src={contentUrl} alt={`${source} inspection evidence`} />
    </button>
    <p className="secondary-metadata">
      {source} attachment M-BM-7 {formatClientDateTime(attachment.capturedAt)}
    </p>
    {expanded ? <div className="photo-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Inspection photo">
      <section className="photo-dialog photo-full-view">
        <img src={contentUrl} alt={`${source} inspection evidence full size`} />
        <button type="button" onClick={() => setExpanded(false)}>Close</button>
      </section>
    </div> : null}
  </div>;
}

export function ServerAutomaticSprinklerView({ inspection, onBack }: Props) {
  if (inspection.templateVersion === 7) {
    return <ServerV7AutomaticSprinklerView inspection={inspection} onBack={onBack} />;
  }
  const { displayControls: controls, responses } = inspection;
  if (!controls || responses.schemaVersion !== 1) {
    return <section className="hose-reel-form sprinkler-form server-inspection-detail">
      <button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button>
      <h2>Automatic Sprinkler inspection unavailable</h2>
      <p>This accepted inspection could not be displayed.</p>
    </section>;
  }
  const legacyResponses = responses;
  const attachmentsByPath = new Map(
    inspection.attachments.map((attachment) => [attachment.fieldPath, attachment])
  );

  function checklistRow(
    section: "waterTank" | "pumpHouse" | "mainAlarmValve",
    key: string
  ) {
    const definition = controls!.checklist[section].find((item) => item.key === key);
    const response = (legacyResponses[section] as Record<string, SprinklerRowResponse>)[key];
    if (!definition || !response) return null;
    return <section className="hose-check-row" key={key}>
      <strong>{definition.label}</strong>
      <span>{resultLabel(response.result)}</span>
      <p>{response.remarks || "No remarks"}</p>
    </section>;
  }

  function measurementRow(key: string) {
    const definition = controls!.measurements.find((item) => item.key === key);
    const response = (
      legacyResponses.measurements as unknown as
        Record<string, SprinklerMeasurementResponse<string>>
    )[key];
    if (!definition || !response) return null;
    return <section className="measurement-card" key={key}>
      <strong>{definition.label}</strong>
      {definition.values.map((value) => {
        const fieldPath = `measurements.${key}.${value.key}`;
        const attachment = attachmentsByPath.get(fieldPath);
        return <div className="psi-value-with-evidence" key={value.key}>
          <div>
            <span className="status-caption">{value.label}</span>
            <strong>{response.values[value.key] ?? "Not recorded"} {value.unit}</strong>
          </div>
          {attachment ? <ServerPhoto attachment={attachment} /> : null}
        </div>;
      })}
      <span>{resultLabel(response.result)}</span>
      <p>{response.remarks || "No remarks"}</p>
    </section>;
  }

  function sectionRows(section: "waterTank" | "pumpHouse" | "mainAlarmValve") {
    return controls!.layout[section].map((row) =>
      row.kind === "measurement"
        ? measurementRow(row.key)
        : checklistRow(section, row.key)
    );
  }

  return <section className="hose-reel-form sprinkler-form server-inspection-detail" aria-labelledby="server-sprinkler-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button>
    <header className="inspection-context">
      <div>
        <p className="eyebrow">{inspection.jobReference}</p>
        <h2 id="server-sprinkler-title">{inspection.systemLabel}</h2>
        <p><strong>{inspection.customerName}</strong></p>
        <p>{inspection.jobTitle}</p>
      </div>
      <strong className="inspection-status status-synced">Inspection Complete</strong>
    </header>
    <p className="success-message">
      Submitted {formatClientDateTime(inspection.performedAt)} M-BM-7 Synced by {inspection.syncedByUsername}
    </p>
    <section aria-labelledby="server-water-tank-title">
      <h3 id="server-water-tank-title">Water Tank</h3>
      {sectionRows("waterTank")}
    </section>
    <section aria-labelledby="server-pump-house-title">
      <h3 id="server-pump-house-title">Pump House</h3>
      {sectionRows("pumpHouse")}
    </section>
    <section aria-labelledby="server-main-valve-title">
      <h3 id="server-main-valve-title">Main Alarm Valve</h3>
      {sectionRows("mainAlarmValve")}
    </section>
    <section>
      <h3>Comments</h3>
      <p>{legacyResponses.comments || "No comments"}</p>
    </section>
  </section>;
}
