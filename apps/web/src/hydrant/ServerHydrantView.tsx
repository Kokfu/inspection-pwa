import { useEffect, useState } from "react";
import { formatClientDateTime } from "../uiPresentation";
import { hydrantV7AcceptedEvidenceContentUrl, loadHydrantV7AcceptedEvidence, type HydrantV7AcceptedEvidence } from "./hydrantV7AcceptedEvidence";
import type { ServerHydrantDetail } from "./serverHydrantApi";

const labels = [["Canvas Hose 1", "canvasHose1Result", "canvas_hose_1"], ["Canvas Hose 2", "canvasHose2Result", "canvas_hose_2"], ["Diffuser Nozzle", "diffuserNozzleResult", "diffuser_nozzle"], ["Landing Valve", "landingValveResult", "landing_valve"], ["Landing Valve Handle", "landingValveHandleResult", "landing_valve_handle"], ["Hose Cabinet", "hoseCabinetResult", "hose_cabinet"], ["Key Lock", "keyLockResult", "key_lock"]] as const;
const resultLabel = (value: unknown) => value === "good" ? "Good" : value === "not_good" ? "Not Good" : value === "complete_repair" ? "Complete Repair" : value === "na" ? "N.A." : value === "poor" ? "Poor" : "Not recorded";

export function ServerHydrantView({ inspection, onBack }: { inspection: ServerHydrantDetail; onBack: () => void }) {
  const [evidence, setEvidence] = useState<HydrantV7AcceptedEvidence[]>([]);
  const [evidenceError, setEvidenceError] = useState("");
  useEffect(() => {
    let current = true;
    if (inspection.templateVersion !== 7) { setEvidence([]); setEvidenceError(""); return () => { current = false; }; }
    void loadHydrantV7AcceptedEvidence(inspection.clientUuid).then((items) => {
      if (current) { setEvidence(items); setEvidenceError(""); }
    }, () => { if (current) setEvidenceError("Accepted evidence is unavailable."); });
    return () => { current = false; };
  }, [inspection.clientUuid, inspection.templateVersion]);
  return <section className="hose-reel-form server-inspection-detail" aria-labelledby="accepted-hydrant-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button>
    <header className="inspection-context"><div><p className="eyebrow">{inspection.jobReference}</p><h2 id="accepted-hydrant-title">{inspection.systemLabel}</h2><p><strong>{inspection.customerName}</strong></p><p>{inspection.jobTitle}</p></div><strong className="inspection-status status-synced">Inspection Complete</strong></header>
    <p className="success-message">Submitted {formatClientDateTime(inspection.performedAt)} · Synced by {inspection.syncedByUsername}</p>
    <section><h3>Hydrant Type</h3><p>{inspection.responses.hydrantType === "pressurize" ? "Pressurize" : inspection.responses.hydrantType}</p></section>
    <section><h3>Hydrant Locations</h3>{inspection.responses.rows.map((row, index) => <article className="accepted-location-row" key={row.rowUuid}>
      <div className="accepted-location-heading"><strong>Location {index + 1}</strong><span><small>Location</small><br />{row.locationText}</span><span><small>No. / Reference</small><br />{row.assetReference || "Not recorded"}</span></div>
      <div className="accepted-results" aria-label={`Inspection results for ${row.locationText}`}>{labels.map(([name, key, wire]) => {
        if (inspection.templateVersion !== 7) return <p key={key}><span>{name}</span>{resultLabel(row[key])}</p>;
        const finding = inspection.templateVersion === 7 && (row[key] === "not_good" || row[key] === "complete_repair");
        const photo = evidence.find((item) => item.fieldPath === `hydrant_set.hydrant_rows.rows.${row.rowUuid}.${wire}`);
        const photoUrl = photo ? hydrantV7AcceptedEvidenceContentUrl(photo.photoUuid) : undefined;
        return <div key={key}><p><span>{name}</span>{resultLabel(row[key])}</p>{finding ? <><p><strong>Remark:</strong> {row.fieldRemarks?.[key] || "Not recorded"}</p>{photoUrl ? <><a href={photoUrl} target="_blank" rel="noreferrer" className="secondary-command">View accepted photo</a><img src={photoUrl} alt={`${name} accepted evidence`} className="accepted-evidence-photo" /></> : null}</> : null}</div>;
      })}</div>
      <p className="accepted-remarks"><span>Remarks</span>{row.remarks || "No remarks"}</p>
    </article>)}</section>
    {evidenceError ? <p className="error-text">{evidenceError}</p> : null}
    <section><h3>Comments</h3><p>{inspection.responses.comments || "No comments"}</p></section>
  </section>;
}
