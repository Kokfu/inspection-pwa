import { useEffect, useState } from "react";
import type { LegacyDryWetRiserResponses, RiserOutletResultColumn, RiserResult, RiserRow, V7DryWetRiserResponses } from "./dryWetRiserTypes";
import type { ServerDryWetRiserDetail } from "./serverDryWetRiserApi";
import { formatClientDateTime } from "../uiPresentation";
import { dryWetRiserV7AcceptedEvidenceContentUrl, loadDryWetRiserV7AcceptedEvidence, type DryWetRiserV7AcceptedEvidence } from "./dryWetRiserV7AcceptedEvidence";

type Props = { inspection: ServerDryWetRiserDetail; onBack: () => void };
const waterTank = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions"];
const pumpHouse = ["pump_house_clean", "manual_start_pumps", "jockey_pump_pressure", "duty_pump_cut_in", "standby_pump_cut_in", "standby_pump_service_items", "battery_charging_alternator", "battery_charger_failure_alarm", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"];
const v7Checklist = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions", "pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator", "battery_charger_failure_alarm", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"] as const;
const v7RowFields: Record<string, RiserOutletResultColumn> = { "Canvas Hose ×2": "canvasHoseAt2Result", "Diffuser Nozzle": "diffuserNozzleResult", "Landing Valve": "landingValveResult", "Crandle": "crandleResult", "Door": "doorResult" };
const label = (value: RiserResult | null) => value === "good" ? "Good" : value === "poor" ? "Poor" : value === "not_good" ? "Not Good" : value === "complete_repair" ? "Complete Repair" : value === "na" ? "N.A." : "Not recorded";
const isFinding = (value: unknown) => value === "not_good" || value === "complete_repair";
const names: Record<string, string> = { saj_main_water_supply: "SAJ Main Water Supply", water_level: "Water Level", automatic_refilling_facilities: "Automatic Refilling Facilities", drain_and_stop_valve_positions: "Drain and Stop Valve Positions", pump_house_clean: "Pump House Cleanliness", manual_start_pumps: "Manual Start Pumps", jockey_pump_pressure: "Jockey Pump Pressure", duty_pump_cut_in: "Duty Pump Cut-In", standby_pump_cut_in: "Standby Pump Cut-In", standby_pump_service_items: "Standby Pump Service Items", battery_charging_alternator: "Battery Charging Alternator", battery_charger_failure_alarm: "Battery Charger Failure Alarm", battery_serviceable: "Battery Serviceable", pump_phase_failure_alarm: "Pump Phase Failure Alarm", pumps_auto_start: "Pumps Auto Start", test_and_gate_valve_positions: "Test and Gate Valve Positions" };
const name = (value: string) => names[value] ?? value;

function V7Evidence({ path, remark, evidence }: { path: string; remark: string; evidence: DryWetRiserV7AcceptedEvidence[] }) {
  const photo = evidence.find((item) => item.fieldPath === path);
  if (!photo) return <p><strong>Remark:</strong> {remark || "Not recorded"}</p>;
  const url = dryWetRiserV7AcceptedEvidenceContentUrl(photo.photoUuid);
  return <><p><strong>Remark:</strong> {remark || "Not recorded"}</p><a href={url} target="_blank" rel="noreferrer" className="secondary-command">View accepted photo</a><img src={url} alt="Accepted evidence" className="accepted-evidence-photo" /></>;
}

export function ServerDryWetRiserView({ inspection, onBack }: Props) {
  const [evidence, setEvidence] = useState<DryWetRiserV7AcceptedEvidence[]>([]);
  const [evidenceError, setEvidenceError] = useState("");
  useEffect(() => {
    let current = true;
    if (inspection.templateVersion !== 7) { setEvidence([]); setEvidenceError(""); return () => { current = false; }; }
    void loadDryWetRiserV7AcceptedEvidence(inspection.clientUuid).then((items) => { if (current) { setEvidence(items); setEvidenceError(""); } }, () => { if (current) setEvidenceError("Accepted evidence is unavailable."); });
    return () => { current = false; };
  }, [inspection.clientUuid, inspection.templateVersion]);

  if (inspection.templateVersion === 7) {
    const responses = inspection.responses as V7DryWetRiserResponses;
    return <section className="hose-reel-form server-inspection-detail" aria-labelledby="server-riser-title">
      <button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button>
      <header className="inspection-context"><div><p className="eyebrow">{inspection.jobReference}</p><h2 id="server-riser-title">{inspection.systemLabel}</h2><p><strong>{inspection.customer.displayName}</strong></p><p>{inspection.jobTitle}</p></div><strong className="inspection-status status-synced">Inspection Complete</strong></header>
      <p className="success-message">Submitted {formatClientDateTime(inspection.performedAt)} · Synced by {inspection.syncedByUsername}</p>
      <section><h3>Riser Type</h3><p><strong>{inspection.systemConfiguration.riserMode === "dry" ? "Dry Riser System" : "Wet Riser System"}</strong></p><p className="field-help">Frozen with this service visit.</p></section>
      <section><h3>Water Tank &amp; Pump House</h3>{v7Checklist.map((key) => { const item = responses.checklist[key]; const path = `dry_wet_riser_checks.${key}`; return <article key={key}><p><strong>{name(key)}:</strong> {label(item?.result ?? null)}</p>{isFinding(item?.result) ? <V7Evidence path={path} remark={item?.remarks ?? ""} evidence={evidence} /> : null}</article>; })}</section>
      <section><h3>Pump House Measurements</h3>{([["jockey_psi", "Jockey Pump Pressure"], ["duty_psi", "Duty Pump Cut In"], ["standby_psi", "Stand-by Pump Cut In"]] as const).map(([key, title]) => { const item = responses.measurements[key]; return <article className="measurement-card" key={key}><strong>{title}</strong><p>{Object.entries(item.values).map(([field, value]) => `${field.replace("_", " ")}: ${value ?? "—"} ${item.unit}`).join(" · ")}</p><p>Result: {label(item.result)}</p>{isFinding(item.result) ? <V7Evidence path={`dry_wet_riser_measurements.${key}`} remark={item.remarks} evidence={evidence} /> : null}</article>; })}</section>
      <section><h3>Riser Outlet</h3><div className="riser-outlet-table riser-outlet-table--readonly" role="table" aria-label="Accepted riser outlet inspection rows"><div className="riser-outlet-table__header" role="row"><span role="columnheader">Outlet</span><span role="columnheader">Reference &amp; location</span><span role="columnheader">Inspection results</span><span role="columnheader">Remarks</span></div>{[...responses.riserOutlets].sort((left, right) => left.sortOrder - right.sortOrder).map((row, index) => <section className="riser-outlet-table__row" role="row" key={row.rowUuid}>
        <div className="riser-outlet-table__identity" role="cell"><strong>Outlet {index + 1}</strong><small>{row.source === "configured" ? "Configured" : "Added by technician"}</small></div>
        <div className="riser-outlet-table__location" role="cell"><p><span>Reference</span>{row.assetReference || "Not recorded"}</p><p><span>Location</span>{row.locationText}</p></div>
        <div className="riser-outlet-table__results" role="cell">{Object.entries(v7RowFields).map(([columnLabel, field]) => <div key={field}><p><span>{columnLabel}</span>{label(row[field])}</p>{isFinding(row[field]) ? <V7Evidence path={`riser_outlet.riser_outlet_rows.rows.${row.rowUuid}.${field}`} remark={row.fieldRemarks?.[field] ?? ""} evidence={evidence} /> : null}</div>)}</div>
        <div className="riser-outlet-table__remarks" role="cell"><p>{row.remarks || "No remarks"}</p></div>
      </section>)}</div></section>
      {evidenceError ? <p className="error-text">{evidenceError}</p> : null}
      <section><h3>Comments</h3><p>{responses.comments || "No comments"}</p></section>
    </section>;
  }

  const legacyResponses = inspection.responses as LegacyDryWetRiserResponses;
  const checklist = (keys: string[], source: Record<string, RiserRow>) => keys.map((key) => <section className="hose-check-row" key={key}><strong>{name(key)}</strong><span>{label(source[key].result)}</span><p>{source[key].remarks || "No remarks"}</p></section>);
  return <section className="hose-reel-form server-inspection-detail" aria-labelledby="server-riser-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button>
    <header className="inspection-context"><div><p className="eyebrow">{inspection.jobReference}</p><h2 id="server-riser-title">{inspection.systemLabel}</h2><p><strong>{inspection.customer.displayName}</strong></p><p>{inspection.jobTitle}</p></div><strong className="inspection-status status-synced">Inspection Complete</strong></header>
    <p className="success-message">Submitted {formatClientDateTime(inspection.performedAt)} · Synced by {inspection.syncedByUsername}</p>
    <section><h3>Riser Type</h3><p><strong>{inspection.systemConfiguration.riserMode === "dry" ? "Dry Riser System" : "Wet Riser System"}</strong></p><p className="field-help">Frozen with this historical service visit.</p></section>
    <section><h3>Water Tank</h3>{checklist(waterTank, legacyResponses.waterTank)}</section>
    <section><h3>Pump House</h3>{checklist(pumpHouse, legacyResponses.pumpHouse)}</section>
    <section><h3>PSI Measurements</h3>{[["Jockey Cut In", legacyResponses.measurements.jockeyCutIn], ["Jockey Cut Out", legacyResponses.measurements.jockeyCutOut], ["Duty Pump Cut In", legacyResponses.measurements.dutyCutIn], ["Stand-by Pump Cut In", legacyResponses.measurements.standbyCutIn]].map(([title, value]) => <section className="measurement-card" key={title as string}><strong>{title}</strong><p>{value} PSI</p></section>)}</section>
    <section><h3>Riser Outlet</h3><div className="riser-outlet-table riser-outlet-table--readonly" role="table" aria-label="Accepted riser outlet inspection rows"><div className="riser-outlet-table__header" role="row"><span role="columnheader">Outlet</span><span role="columnheader">Reference &amp; location</span><span role="columnheader">Inspection results</span><span role="columnheader">Remarks</span></div>{[...legacyResponses.riserOutlets].sort((left, right) => left.sortOrder - right.sortOrder).map((row, index) => <section className="riser-outlet-table__row" role="row" key={row.rowUuid}><div className="riser-outlet-table__identity" role="cell"><strong>Outlet {index + 1}</strong><small>{row.source === "configured" ? "Configured" : "Added by technician"}</small></div><div className="riser-outlet-table__location" role="cell"><p><span>Reference</span>{row.assetReference || "Not recorded"}</p><p><span>Location</span>{row.locationText}</p></div><div className="riser-outlet-table__results" role="cell"><p><span>Canvas Hose ×2</span>{label(row.canvasHoseAt2Result)}</p><p><span>Diffuser Nozzle</span>{label(row.diffuserNozzleResult)}</p><p><span>Landing Valve</span>{label(row.landingValveResult)}</p><p><span>Crandle</span>{label(row.crandleResult)}</p><p><span>Door</span>{label(row.doorResult)}</p></div><div className="riser-outlet-table__remarks" role="cell"><p>{row.remarks || "No remarks"}</p></div></section>)}</div></section>
    <section><h3>Comments</h3><p>{legacyResponses.comments || "No comments"}</p></section>
  </section>;
}
