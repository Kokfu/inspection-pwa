import type { RiserRow } from "./dryWetRiserTypes";
import type { ServerDryWetRiserDetail } from "./serverDryWetRiserApi";

type Props = { inspection: ServerDryWetRiserDetail; onBack: () => void };
const waterTank = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions"];
const pumpHouse = ["pump_house_clean", "manual_start_pumps", "jockey_pump_pressure", "duty_pump_cut_in", "standby_pump_cut_in", "standby_pump_service_items", "battery_charging_alternator", "battery_charger_failure_alarm", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"];
const label = (value: "good" | "poor" | null) => value === "good" ? "Good" : value === "poor" ? "Poor" : "Not recorded";
const name = (value: string) => value.replaceAll("_", " ");

export function ServerDryWetRiserView({ inspection, onBack }: Props) {
  const checklist = (keys: string[], source: Record<string, RiserRow>) => keys.map((key) => <section className="hose-check-row" key={key}><strong>{name(key)}</strong><span>{label(source[key].result)}</span><p>{source[key].remarks || "No remarks"}</p></section>);
  return <section className="hose-reel-form" aria-labelledby="server-riser-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button>
    <header className="inspection-context"><div><p className="eyebrow">{inspection.jobReference}</p><h2 id="server-riser-title">{inspection.jobTitle}</h2><p>{inspection.customer.displayName}</p><p className="secondary-metadata">Inspection UUID: {inspection.clientUuid}</p></div><div><span className="status-caption">{inspection.systemLabel}</span><strong className="inspection-status status-synced">Completed</strong></div></header>
    <p className="success-message">Submitted {new Date(inspection.performedAt).toLocaleString()} · Synced by {inspection.syncedByUsername}</p>
    <p>Template {inspection.template.code} v{inspection.template.version} · Configuration revision {inspection.configuration.revisionNumber}</p>
    <section><h3>Frozen Riser Mode</h3><p>{inspection.systemConfiguration.riserMode === "dry" ? "Dry" : "Wet"}</p></section>
    <section><h3>Water Tank</h3>{checklist(waterTank, inspection.responses.waterTank)}</section>
    <section><h3>Pump House</h3>{checklist(pumpHouse, inspection.responses.pumpHouse)}</section>
    <section><h3>PSI Measurements</h3>{[["Jockey Cut In", inspection.responses.measurements.jockeyCutIn], ["Jockey Cut Out", inspection.responses.measurements.jockeyCutOut], ["Duty Pump Cut In", inspection.responses.measurements.dutyCutIn], ["Stand-by Pump Cut In", inspection.responses.measurements.standbyCutIn]].map(([title, value]) => <section className="measurement-card" key={title as string}><strong>{title}</strong><p>{value} PSI</p></section>)}</section>
    <section><h3>Riser Outlet</h3>{[...inspection.responses.riserOutlets].sort((left, right) => left.sortOrder - right.sortOrder).map((row, index) => <section className="hose-check-row" key={row.rowUuid}><strong>#{index + 1}</strong>{row.assetReference ? <p>No. {row.assetReference}</p> : null}<p>Location: {row.locationText}</p><p>Canvas hose@2: {label(row.canvasHoseAt2Result)}</p><p>Diffuser Nozzle: {label(row.diffuserNozzleResult)}</p><p>Landing Valve: {label(row.landingValveResult)}</p><p>Crandle: {label(row.crandleResult)}</p><p>Door: {label(row.doorResult)}</p><p>{row.remarks || "No remarks"}</p></section>)}</section>
    <section><h3>Comments</h3><p>{inspection.responses.comments || "No comments"}</p></section>
  </section>;
}
