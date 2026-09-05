import { useEffect, useState } from "react";
import { formatClientDateTime } from "../uiPresentation";
import { smokeVentilationChecklistFields, smokeVentilationRowColumns } from "./smokeVentilationTypes";
import { smokeVentilationV7AcceptedEvidenceContentUrl, loadSmokeVentilationV7AcceptedEvidence, type SmokeVentilationV7AcceptedEvidence } from "./smokeVentilationV7AcceptedEvidence";
import type { ServerSmokeVentilationDetail } from "./serverSmokeVentilationApi";

const resultLabel = (value: unknown) => value === "good" ? "Good" : value === "not_good" ? "Not Good" : value === "complete_repair" ? "Complete Repair" : value === "na" ? "N.A." : "Not recorded";
const isFinding = (value: unknown) => value === "not_good" || value === "complete_repair";

export function ServerSmokeVentilationView({ inspection, onBack }: { inspection: ServerSmokeVentilationDetail; onBack: () => void }) {
  const [evidence, setEvidence] = useState<SmokeVentilationV7AcceptedEvidence[]>([]);
  const [evidenceError, setEvidenceError] = useState("");
  useEffect(() => {
    let current = true;
    void loadSmokeVentilationV7AcceptedEvidence(inspection.clientUuid).then((items) => {
      if (current) { setEvidence(items); setEvidenceError(""); }
    }, () => { if (current) setEvidenceError("Accepted evidence is unavailable."); });
    return () => { current = false; };
  }, [inspection.clientUuid]);
  return <section className="hose-reel-form server-inspection-detail" aria-labelledby="accepted-smoke-ventilation-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button>
    <header className="inspection-context"><div><p className="eyebrow">{inspection.jobReference}</p><h2 id="accepted-smoke-ventilation-title">{inspection.systemLabel}</h2><p><strong>{inspection.customerName}</strong></p><p>{inspection.jobTitle}</p></div><strong className="inspection-status status-synced">Inspection Complete</strong></header>
    <p className="success-message">Submitted {formatClientDateTime(inspection.performedAt)} · Synced by {inspection.syncedByUsername}</p>
    <section><h3>Control Panel</h3><p><span>Control Panel No.</span>{inspection.responses.controlPanelNo || "Not recorded"}</p><p><span>Location</span>{inspection.responses.location || "Not recorded"}</p><p><span>Date Tested</span>{inspection.responses.dateTested || "Not recorded"}</p></section>
    <section><h3>Fan Schedule</h3>{inspection.responses.rows.map((row, index) => <article className="accepted-location-row" key={row.rowUuid}>
      <div className="accepted-location-heading"><strong>Fan {index + 1}</strong><span><small>No.</small><br />{row.assetReference || "Not recorded"}</span></div>
      <div className="accepted-results" aria-label={`Inspection results for Fan ${index + 1}`}>{smokeVentilationRowColumns.map(([key, wire, name]) => {
        const finding = isFinding(row[key]);
        const photo = evidence.find((item) => item.fieldPath === `fan_schedule.fan_schedule_rows.rows.${row.rowUuid}.${wire}`);
        const photoUrl = photo ? smokeVentilationV7AcceptedEvidenceContentUrl(photo.photoUuid) : undefined;
        return <div key={key}><p><span>{name}</span>{resultLabel(row[key])}</p>{finding ? <><p><strong>Remark:</strong> {row.fieldRemarks?.[key] || "Not recorded"}</p>{photoUrl ? <><a href={photoUrl} target="_blank" rel="noreferrer" className="secondary-command">View accepted photo</a><img src={photoUrl} alt={`${name} accepted evidence`} className="accepted-evidence-photo" /></> : null}</> : null}</div>;
      })}</div>
      <p className="accepted-remarks"><span>Remarks</span>{row.remarks || "No remarks"}</p>
    </article>)}</section>
    <section><h3>Power Supply / Charger &amp; Batteries / Main Function Key</h3>{smokeVentilationChecklistFields.map(([key, label]) => {
      const entry = inspection.responses.checklist[key];
      const finding = isFinding(entry?.result);
      const fieldPath = `smoke_ventilation_checks.${key}`;
      const photo = evidence.find((item) => item.fieldPath === fieldPath);
      const photoUrl = photo ? smokeVentilationV7AcceptedEvidenceContentUrl(photo.photoUuid) : undefined;
      return <div key={key}><p><span>{label}</span>{resultLabel(entry?.result)}</p>{finding ? <><p><strong>Remark:</strong> {entry?.remarks || "Not recorded"}</p>{photoUrl ? <><a href={photoUrl} target="_blank" rel="noreferrer" className="secondary-command">View accepted photo</a><img src={photoUrl} alt={`${label} accepted evidence`} className="accepted-evidence-photo" /></> : null}</> : null}</div>;
    })}</section>
    {evidenceError ? <p className="error-text">{evidenceError}</p> : null}
    <section><h3>Comments</h3><p>{inspection.responses.comments || "No comments"}</p></section>
  </section>;
}
