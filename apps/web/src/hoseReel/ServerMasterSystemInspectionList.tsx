import type { ServerMasterSystemInspectionSummary } from "./serverMasterSystemInspectionApi";

function systemLabel(systemKey: ServerMasterSystemInspectionSummary["systemKey"]) {
  if (systemKey === "co2_fire_extinguisher") return "CO2 Fire Extinguisher System";
  if (systemKey === "wet_chemical") return "Wet Chemical System";
  if (systemKey === "automatic_sprinkler") return "Automatic Sprinkler System";
  if (systemKey === "dry_wet_riser") return "Dry / Wet Riser";
  return "Hose Reel";
}

export function ServerMasterSystemInspectionList({ inspections, canLoad, loading, message, onLoad }: { inspections: ServerMasterSystemInspectionSummary[]; canLoad: boolean; loading: boolean; message: string; onLoad: () => Promise<void> }) {
  return <section className="server-records" aria-labelledby="server-master-system-title"><div className="server-records-heading"><div><p className="eyebrow">Server Verification</p><h2 id="server-master-system-title">Synced Master-System Inspections</h2></div><button type="button" disabled={!canLoad || loading} onClick={() => void onLoad()}>{loading ? "Loading" : "Load Server Inspections"}</button></div>{message ? <p className="server-records-message">{message}</p> : null}{inspections.length === 0 ? <p className="empty-state">No synced Master-system inspections loaded.</p> : <ul className="record-list">{inspections.map((inspection) => <li className="record-item" key={inspection.clientUuid}><h3>{systemLabel(inspection.systemKey)}</h3><p>Job {inspection.jobId}</p><p>{inspection.locationId ? `Location ${inspection.locationId}` : "Primary instance"}</p><p>Instance {inspection.instanceKey}</p><p>Performed {new Date(inspection.performedAt).toLocaleString()}</p><p>{inspection.deviceReportedCreatorUsername ? `Device-reported creator ${inspection.deviceReportedCreatorUsername}` : inspection.verifiedOriginalCreatorUsername ? `Verified creator ${inspection.verifiedOriginalCreatorUsername}` : "Creator unavailable"}; synced by {inspection.syncedByUsername}</p><small>{inspection.clientUuid}</small></li>)}</ul>}</section>;
}
