import { useEffect, useState } from "react";
import { formatClientDateTime } from "../uiPresentation";
import { fireIntercomRowColumns } from "./fireIntercomTypes";
import { fireIntercomV7AcceptedEvidenceContentUrl, loadFireIntercomV7AcceptedEvidence, type FireIntercomV7AcceptedEvidence } from "./fireIntercomV7AcceptedEvidence";
import type { ServerFireIntercomDetail } from "./serverFireIntercomApi";

const resultLabel = (value: unknown) => value === "good" ? "Good" : value === "not_good" ? "Not Good" : value === "complete_repair" ? "Complete Repair" : value === "na" ? "N.A." : "Not recorded";
const isFinding = (value: unknown) => value === "not_good" || value === "complete_repair";

export function ServerFireIntercomView({ inspection, onBack }: { inspection: ServerFireIntercomDetail; onBack: () => void }) {
  const [evidence, setEvidence] = useState<FireIntercomV7AcceptedEvidence[]>([]);
  const [evidenceError, setEvidenceError] = useState("");
  useEffect(() => {
    let current = true;
    void loadFireIntercomV7AcceptedEvidence(inspection.clientUuid).then((items) => {
      if (current) { setEvidence(items); setEvidenceError(""); }
    }, () => { if (current) setEvidenceError("Accepted evidence is unavailable."); });
    return () => { current = false; };
  }, [inspection.clientUuid]);
  return <section className="hose-reel-form server-inspection-detail" aria-labelledby="accepted-fire-intercom-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button>
    <header className="inspection-context"><div><p className="eyebrow">{inspection.jobReference}</p><h2 id="accepted-fire-intercom-title">{inspection.systemLabel}</h2><p><strong>{inspection.customerName}</strong></p><p>{inspection.jobTitle}</p></div><strong className="inspection-status status-synced">Inspection Complete</strong></header>
    <p className="success-message">Submitted {formatClientDateTime(inspection.performedAt)} · Synced by {inspection.syncedByUsername}</p>
    <section><h3>Station Schedule</h3>{inspection.responses.rows.map((row, index) => <article className="accepted-location-row" key={row.rowUuid}>
      <div className="accepted-location-heading"><strong>Station {index + 1}</strong><span><small>Station</small><br />{row.assetReference || "Not recorded"}</span></div>
      <div className="accepted-results" aria-label={`Inspection results for Station ${index + 1}`}>{fireIntercomRowColumns.map(([key, wire, name]) => {
        const finding = isFinding(row[key]);
        const photo = evidence.find((item) => item.fieldPath === `station_schedule.station_schedule_rows.rows.${row.rowUuid}.${wire}`);
        const photoUrl = photo ? fireIntercomV7AcceptedEvidenceContentUrl(photo.photoUuid) : undefined;
        return <div key={key}><p><span>{name}</span>{resultLabel(row[key])}</p>{finding ? <><p><strong>Remark:</strong> {row.fieldRemarks?.[key] || "Not recorded"}</p>{photoUrl ? <><a href={photoUrl} target="_blank" rel="noreferrer" className="secondary-command">View accepted photo</a><img src={photoUrl} alt={`${name} accepted evidence`} className="accepted-evidence-photo" /></> : null}</> : null}</div>;
      })}</div>
      <p className="accepted-remarks"><span>Remarks</span>{row.remarks || "No remarks"}</p>
    </article>)}</section>
    {evidenceError ? <p className="error-text">{evidenceError}</p> : null}
    <section><h3>Comments</h3><p>{inspection.responses.comments || "No comments"}</p></section>
  </section>;
}
