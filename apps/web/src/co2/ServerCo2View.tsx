import type { ServerCo2Detail } from "./serverCo2Api";

const label = (value: unknown) => value === "good" ? "Good" : value === "poor" ? "Poor"
  : value === "normal" ? "Normal" : value === "test" ? "Test" : value === "isolation" ? "Isolation" : "Not recorded";

export function ServerCo2View({ inspection, onBack }: { inspection: ServerCo2Detail; onBack: () => void }) {
  const responses = inspection.responses;
  const controls = inspection.displayControls;
  const groups: Array<[string, typeof controls.chargerAndBatteries, Record<string, { result: "good" | "poor" | null; remarks: string }>]> = [
    ["Charger & Batteries", controls.chargerAndBatteries, responses.chargerAndBatteries],
    ["Physical Outlook Checking", controls.physicalOutlook, responses.physicalOutlook],
    ["Main Function Key", controls.mainFunctionKeys, responses.mainFunctionKeys]
  ];
  return <section className="hose-reel-form server-inspection-detail">
    <button type="button" className="secondary-command" onClick={onBack}>Back to CO2 Locations</button>
    <header className="inspection-context"><div><p className="eyebrow">{inspection.jobReference}</p><h2>{inspection.systemLabel}</h2><p>{inspection.customerName}</p></div><strong className="inspection-status status-synced">Inspection Complete</strong></header>
    <p>Submitted {new Date(inspection.performedAt).toLocaleString()} - Synced by {inspection.syncedByUsername}</p>
    <section><h3>Control Panel</h3><p>{controls.controlPanelLocation.label}: {responses.controlPanelLocation}</p></section>
    <section><h3>Detector Rows</h3>{responses.detectorRows.map((row) => <article className="hose-row-card" key={row.rowUuid}><strong>Row {row.displaySequence}</strong><p>{controls.detectorRows.alarmZone.label}: {row.alarmZone}</p><p>{controls.detectorRows.location.label}: {row.location}</p><p>{controls.detectorRows.heatDetector.label}: {label(row.heatDetectorStatus)}</p><p>{controls.detectorRows.smokeDetector.label}: {label(row.smokeDetectorStatus)}</p><p>Remarks: {row.remarks || "None"}</p></article>)}</section>
    {groups.map(([title, definitions, values]) => <section key={title}><h3>{title}</h3>{definitions.map((item) => <p key={item.key}><strong>{item.label}:</strong> {label(values[item.key]?.result)}{values[item.key]?.remarks ? ` - ${values[item.key]?.remarks}` : ""}</p>)}</section>)}
    <section><h3>Comments</h3><p>{responses.comments || "No comments"}</p></section>
  </section>;
}
