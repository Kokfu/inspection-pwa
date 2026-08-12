import type { ServerHoseReelDetail } from "./serverHoseReelApi";

const resultLabel = (value: unknown) => value === "good" ? "Good" : "Poor";
const rowFields = {
  drum: "drumResult",
  hose: "hoseResult",
  nozzle: "nozzleResult",
  valve: "valveResult",
  nozzle_box: "nozzleBoxResult"
} as const;

export function ServerHoseReelView({ inspection, onBack }: { inspection: ServerHoseReelDetail; onBack: () => void }) {
  const controls = inspection.displayControls;
  const responses = inspection.responses;
  return <section className="hose-reel-form server-inspection-detail">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button>
    <header className="inspection-context"><div><p className="eyebrow">{inspection.jobReference}</p><h2>{inspection.systemLabel}</h2><p>{inspection.customerName}</p></div><strong className="inspection-status status-synced">Accepted</strong></header>
    <p>Submitted {new Date(inspection.performedAt).toLocaleString()} - Synced by {inspection.syncedByUsername}</p>
    {([['Water Tank', controls.checklist.waterTank], ['Pump House', controls.checklist.pumpHouse]] as const).map(([title, items]) => <section key={title}><h3>{title}</h3>{items.map((item) => <p key={item.key}><strong>{item.label}:</strong> {resultLabel(responses.checklist[item.key]?.result)}{responses.checklist[item.key]?.remarks ? ` - ${responses.checklist[item.key]?.remarks}` : ''}</p>)}</section>)}
    <section><h3>Measurements</h3>{controls.measurements.map((item) => {
      const value = responses.measurements[item.key as keyof typeof responses.measurements];
      return <article className="hose-row-card" key={item.key}><strong>{item.label}</strong><p>{Object.entries(value.values).map(([key, number]) => `${item.values.find((entry) => entry.key === key)?.label}: ${number} ${value.unit}`).join(' - ')}</p><p>Result: {resultLabel(value.result)}{value.remarks ? ` - ${value.remarks}` : ''}</p></article>;
    })}</section>
    <section><h3>Hose Reel Drum</h3><p>Drum Type: {[responses.drumTypes.swing && 'Swing', responses.drumTypes.fixed && 'Fixed'].filter(Boolean).join(', ') || 'Not selected'}</p>{responses.rows.map((row) => <article className="hose-row-card" key={row.rowUuid}><strong>{row.assetReference || `Row ${row.sortOrder}`} - {row.locationText}</strong>{controls.repeatableRows.resultColumns.map((column) => {
      const field = rowFields[column.key as keyof typeof rowFields];
      return <p key={column.key}>{column.label}: {resultLabel(row[field])}</p>;
    })}<p>Remarks: {row.remarks || 'None'}</p></article>)}</section>
    <section><h3>Comments</h3><p>{responses.comments || 'No comments'}</p></section>
  </section>;
}
