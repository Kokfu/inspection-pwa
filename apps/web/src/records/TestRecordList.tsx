import type { TestRecordView } from "./testRecordTypes";

type TestRecordListProps = {
  records: TestRecordView[];
};

export function TestRecordList({ records }: TestRecordListProps) {
  if (records.length === 0) {
    return <p className="empty-state">No local test records yet.</p>;
  }

  return (
    <ul className="record-list">
      {records.map((record) => (
        <li key={record.clientUuid} className="record-item">
          <div>
            <h2>{record.title || "Untitled draft"}</h2>
            <p>{record.notes || "No notes"}</p>
            {record.lastSyncError ? (
              <p className="error-text">{record.lastSyncError}</p>
            ) : null}
          </div>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>{record.syncStatus}</dd>
            </div>
            <div>
              <dt>UUID</dt>
              <dd>{record.clientUuid}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{new Date(record.createdAt).toLocaleString()}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
