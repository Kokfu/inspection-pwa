import { useEffect, useState } from "react";
import { formatClientDateTime } from "../uiPresentation";
import { fireRatedRollerShutterRowColumns } from "./fireRatedRollerShutterTypes";
import { fireRatedRollerShutterV7AcceptedEvidenceContentUrl, loadFireRatedRollerShutterV7AcceptedEvidence, type FireRatedRollerShutterV7AcceptedEvidence } from "./fireRatedRollerShutterV7AcceptedEvidence";
import type { ServerFireRatedRollerShutterDetail } from "./serverFireRatedRollerShutterApi";

const resultLabel = (value: unknown) => value === "good" ? "Good" : value === "not_good" ? "Not Good" : value === "complete_repair" ? "Complete Repair" : value === "na" ? "N.A." : "Not recorded";
const isFinding = (value: unknown) => value === "not_good" || value === "complete_repair";

export function ServerFireRatedRollerShutterView({ inspection, onBack }: { inspection: ServerFireRatedRollerShutterDetail; onBack: () => void }) {
  const [evidence, setEvidence] = useState<FireRatedRollerShutterV7AcceptedEvidence[]>([]);
  const [evidenceError, setEvidenceError] = useState("");
  useEffect(() => {
    let current = true;
    void loadFireRatedRollerShutterV7AcceptedEvidence(inspection.clientUuid).then((items) => {
      if (current) { setEvidence(items); setEvidenceError(""); }
    }, () => { if (current) setEvidenceError("Accepted evidence is unavailable."); });
    return () => { current = false; };
  }, [inspection.clientUuid]);
  return <section className="hose-reel-form server-inspection-detail" aria-labelledby="accepted-roller-shutter-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button>
    <header className="inspection-context"><div><p className="eyebrow">{inspection.jobReference}</p><h2 id="accepted-roller-shutter-title">{inspection.systemLabel}</h2><p><strong>{inspection.customerName}</strong></p><p>{inspection.jobTitle}</p></div><strong className="inspection-status status-synced">Inspection Complete</strong></header>
    <p className="success-message">Submitted {formatClientDateTime(inspection.performedAt)} · Synced by {inspection.syncedByUsername}</p>
    <section><h3>Inspection Details</h3><p>Date Tested: {inspection.responses.dateTested || "Not recorded"}</p><p>Zone: {inspection.responses.zone || "Not recorded"}</p><p>Inspected By: {inspection.responses.inspectedBy || "Not recorded"}</p></section>
    <section><h3>Roller Shutter Schedule</h3>{inspection.responses.rows.map((row, index) => <article className="accepted-location-row" key={row.rowUuid}>
      <div className="accepted-location-heading"><strong>No. {index + 1}</strong><span><small>Location</small><br />{row.locationText}</span></div>
      <div className="accepted-results" aria-label={`Inspection results for Shutter ${index + 1}`}>{fireRatedRollerShutterRowColumns.map(([key, wire, name]) => {
        const finding = isFinding(row[key]);
        const photo = evidence.find((item) => item.fieldPath === `roller_shutter_schedule.roller_shutter_schedule_rows.rows.${row.rowUuid}.${wire}`);
        const photoUrl = photo ? fireRatedRollerShutterV7AcceptedEvidenceContentUrl(photo.photoUuid) : undefined;
        return <div key={key}><p><span>{name}</span>{resultLabel(row[key])}</p>{finding ? <><p><strong>Remark:</strong> {row.fieldRemarks?.[key] || "Not recorded"}</p>{photoUrl ? <><a href={photoUrl} target="_blank" rel="noreferrer" className="secondary-command">View accepted photo</a><img src={photoUrl} alt={`${name} accepted evidence`} className="accepted-evidence-photo" /></> : null}</> : null}</div>;
      })}</div>
      <p className="accepted-remarks"><span>Remarks</span>{row.remarks || "No remarks"}</p>
    </article>)}</section>
    {evidenceError ? <p className="error-text">{evidenceError}</p> : null}
    <section><h3>Comments</h3><p>{inspection.responses.comments || "No comments"}</p></section>
  </section>;
}
