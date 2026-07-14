import type { ServerTestRecord } from "./serverTestRecordApi";

type ServerTestRecordListProps = {
  records: ServerTestRecord[];
  isLoading: boolean;
  message: string;
  canLoad: boolean;
  onLoad: () => Promise<void>;
};

export function ServerTestRecordList({
  records,
  isLoading,
  message,
  canLoad,
  onLoad
}: ServerTestRecordListProps) {
  return (
    <section className="server-records" aria-labelledby="server-records-title">
      <div className="server-records-heading">
        <div>
          <p className="eyebrow">Read-only shared data</p>
          <h2 id="server-records-title">Server Records</h2>
        </div>
        {canLoad ? (
          <button type="button" onClick={onLoad} disabled={isLoading}>
            {isLoading ? "Loading" : "Load Server Records"}
          </button>
        ) : null}
      </div>
      {message ? <p className="server-records-message">{message}</p> : null}
      {records.length === 0 && !isLoading ? (
        <p className="empty-state">
          {canLoad ? "No server records loaded yet." : "Sign in to load server records."}
        </p>
      ) : null}
      {records.length > 0 ? (
        <ul className="record-list">
          {records.map((record) => (
            <li key={record.clientUuid} className="record-item">
              <div>
                <h3>{record.title}</h3>
                <p>{record.notes || "No notes"}</p>
              </div>
              <dl>
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
      ) : null}
    </section>
  );
}
