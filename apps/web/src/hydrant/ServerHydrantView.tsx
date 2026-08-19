import { formatClientDateTime } from "../uiPresentation";
import type { ServerHydrantDetail } from "./serverHydrantApi";

const labels = [["Canvas Hose 1", "canvasHose1Result"], ["Canvas Hose 2", "canvasHose2Result"], ["Diffuser Nozzle", "diffuserNozzleResult"], ["Landing Valve", "landingValveResult"], ["Landing Valve Handle", "landingValveHandleResult"], ["Hose Cabinet", "hoseCabinetResult"], ["Key Lock", "keyLockResult"]] as const;
const resultLabel = (value: unknown) => value === "good" ? "Good" : value === "poor" ? "Poor" : "Not recorded";

export function ServerHydrantView({ inspection, onBack }: { inspection: ServerHydrantDetail; onBack: () => void }) {
  return <section className="hose-reel-form server-inspection-detail" aria-labelledby="accepted-hydrant-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button>
    <header className="inspection-context"><div><p className="eyebrow">{inspection.jobReference}</p><h2 id="accepted-hydrant-title">{inspection.systemLabel}</h2><p><strong>{inspection.customerName}</strong></p><p>{inspection.jobTitle}</p></div><strong className="inspection-status status-synced">Inspection Complete</strong></header>
    <p className="success-message">Submitted {formatClientDateTime(inspection.performedAt)} · Synced by {inspection.syncedByUsername}</p>
    <section><h3>Hydrant Type</h3><p>{inspection.responses.hydrantType === "pressurize" ? "Pressurize" : inspection.responses.hydrantType}</p></section>
    <section><h3>Hydrant Locations</h3>{inspection.responses.rows.map((row, index) => <article className="accepted-location-row" key={row.rowUuid}>
      <div className="accepted-location-heading"><strong>Location {index + 1}</strong><span><small>Location</small><br />{row.locationText}</span><span><small>No. / Reference</small><br />{row.assetReference || "Not recorded"}</span></div>
      <div className="accepted-results" aria-label={`Inspection results for ${row.locationText}`}>{labels.map(([name, key]) => <p key={key}><span>{name}</span>{resultLabel(row[key])}</p>)}</div>
      <p className="accepted-remarks"><span>Remarks</span>{row.remarks || "No remarks"}</p>
    </article>)}</section>
    <section><h3>Comments</h3><p>{inspection.responses.comments || "No comments"}</p></section>
  </section>;
}
