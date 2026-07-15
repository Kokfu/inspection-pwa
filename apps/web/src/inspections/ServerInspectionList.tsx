import type { ServerInspectionSummary } from "./serverInspectionApi";

type Props = {
  inspections: ServerInspectionSummary[];
  loading: boolean;
  message: string;
  canLoad: boolean;
  onLoad: () => Promise<void>;
};

export function ServerInspectionList({ inspections, loading, message, canLoad, onLoad }: Props) {
  return <section className="server-records" aria-labelledby="server-inspections-title">
    <div className="server-records-heading">
      <div><p className="eyebrow">Read-only shared data</p><h2 id="server-inspections-title">Server Inspections</h2></div>
      {canLoad ? <button type="button" onClick={onLoad} disabled={loading}>{loading ? "Loading" : "Load Server Inspections"}</button> : null}
    </div>
    {message ? <p className="server-records-message">{message}</p> : null}
    {inspections.length === 0 && !loading ? <p className="empty-state">{canLoad ? "No server inspections loaded yet." : "Sign in to load server inspections."}</p> : null}
    {inspections.length > 0 ? <ul className="record-list">{inspections.map((inspection) => <li key={inspection.clientUuid} className="record-item">
      <div><h3>{inspection.inspectionTitle}</h3><p>{inspection.jobReference}: {inspection.jobTitle}</p></div>
      <dl><div><dt>UUID</dt><dd>{inspection.clientUuid}</dd></div><div><dt>Performed</dt><dd>{new Date(inspection.performedAt).toLocaleString()}</dd></div></dl>
    </li>)}</ul> : null}
  </section>;
}
