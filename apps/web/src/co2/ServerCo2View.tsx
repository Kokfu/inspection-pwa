import type { ServerCo2Detail } from "./serverCo2Api";
import { formatClientDateTime } from "../uiPresentation";
import { useEffect, useState } from "react";
import { loadV7AcceptedEvidence, v7AcceptedEvidenceContentUrl, type V7AcceptedEvidence } from "./v7AcceptedEvidence";

const label = (value: unknown): string => Array.isArray(value) ? value.map(label).join(", ") : value === "good" ? "Good" : value === "poor" ? "Poor" : value === "not_relevant" ? "Not Relevant"
  : value === "normal" ? "Normal" : value === "test" ? "Test" : value === "isolation" ? "Isolation" : "Not recorded";

export function ServerCo2View({ inspection, onBack }: { inspection: ServerCo2Detail; onBack: () => void }) {
  const responses = inspection.responses;
  const controls = inspection.displayControls;
  const [evidence, setEvidence] = useState<V7AcceptedEvidence[]>([]);
  const [evidenceError, setEvidenceError] = useState("");
  useEffect(() => {
    let current = true;
    if (inspection.template.version !== 7) { setEvidence([]); setEvidenceError(""); return () => { current = false; }; }
    void loadV7AcceptedEvidence(inspection.clientUuid, "co2_fire_extinguisher").then((items) => { if (current) { setEvidence(items); setEvidenceError(""); } }, () => { if (current) setEvidenceError("Accepted evidence is unavailable."); });
    return () => { current = false; };
  }, [inspection.clientUuid, inspection.template.version]);
  const groups: Array<[string, typeof controls.chargerAndBatteries, Record<string, { result: "good" | "poor" | "not_relevant" | null; remarks: string }>]> = [
    ["Charger & Batteries", controls.chargerAndBatteries, responses.chargerAndBatteries],
    ["Physical Outlook Checking", controls.physicalOutlook, responses.physicalOutlook],
    ["Main Function Key", controls.mainFunctionKeys, responses.mainFunctionKeys]
  ];
  return <section className="hose-reel-form server-inspection-detail">
    <button type="button" className="secondary-command" onClick={onBack}>Back to CO2 Locations</button>
    <header className="inspection-context"><div><p className="eyebrow">{inspection.jobReference}</p><h2>{inspection.systemLabel}</h2><p>{inspection.customerName}</p></div><strong className="inspection-status status-synced">Inspection Complete</strong></header>
    <p className="success-message">Submitted {formatClientDateTime(inspection.performedAt)} · Synced by {inspection.syncedByUsername}</p>
    <section><h3>Control Panel</h3><p>{controls.controlPanelLocation.label}: {responses.controlPanelLocation}</p></section>
    <section><h3>Detector Rows</h3>{responses.detectorRows.map((row) => <article className="hose-row-card" key={row.rowUuid}><strong>Row {row.displaySequence}</strong><p>{controls.detectorRows.alarmZone.label}: {row.alarmZone}</p><p>{controls.detectorRows.location.label}: {row.location}</p><p>{controls.detectorRows.heatDetector.label}: {label(row.heatDetectorStatus)}</p><p>{controls.detectorRows.smokeDetector.label}: {label(row.smokeDetectorStatus)}</p><p>Remarks: {row.remarks || "None"}</p></article>)}</section>
    {groups.map(([title, definitions, values]) => <section key={title}><h3>{title}</h3>{definitions.map((item) => { const prefix = title === "Charger & Batteries" ? "charger_batteries.charger_battery_checks" : title === "Physical Outlook Checking" ? "physical_outlook.physical_outlook_checks" : "main_function_key.function_checks"; const photo = evidence.find((candidate) => candidate.fieldPath === `${prefix}.${item.key}`); const photoUrl = photo ? v7AcceptedEvidenceContentUrl(photo.photoUuid) : undefined; return <div key={item.key}><p><strong>{item.label}:</strong> {label(values[item.key]?.result)}{values[item.key]?.remarks ? ` - ${values[item.key]?.remarks}` : ""}</p>{photoUrl ? <><a href={photoUrl} target="_blank" rel="noreferrer" className="secondary-command">View accepted photo</a><img src={photoUrl} alt={`${item.label} accepted evidence`} className="accepted-evidence-photo" /></> : null}</div>; })}</section>)}
    {evidenceError ? <p className="error-text">{evidenceError}</p> : null}
    <section><h3>Comments</h3><p>{responses.comments || "No comments"}</p></section>
  </section>;
}
