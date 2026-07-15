import type { InspectionRecord } from "../db/localDatabase";

type InspectionListProps = {
  records: InspectionRecord[];
  onResumeDraft: (record: InspectionRecord) => void;
};

export function InspectionList({ records, onResumeDraft }: InspectionListProps) {
  if (records.length === 0) {
    return <p className="empty-state">No local inspections yet.</p>;
  }

  return <ul className="record-list">
    {records.map((record) => <li key={record.clientUuid} className="record-item">
      <div>
        <h3>{record.header.title || "Untitled inspection draft"}</h3>
        <p>{record.templateSnapshot.name} / {record.templateSnapshot.section}</p>
        {record.lastSyncError ? <p className="error-text">{record.lastSyncError}</p> : null}
      </div>
      <dl>
        <div><dt>Status</dt><dd>{record.syncStatus}</dd></div>
        <div><dt>UUID</dt><dd>{record.clientUuid}</dd></div>
        <div><dt>Performed</dt><dd>{new Date(record.header.performedAt).toLocaleString()}</dd></div>
      </dl>
      {record.syncStatus === "Draft" ? (
        <button type="button" onClick={() => onResumeDraft(record)}>
          Resume Draft
        </button>
      ) : null}
    </li>)}</ul>;
}
