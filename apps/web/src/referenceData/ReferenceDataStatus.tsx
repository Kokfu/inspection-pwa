type ReferenceDataStatusProps = {
  catalogAvailable: boolean;
  systemCount: number;
  customerCount: number;
  fetchedAt?: string;
  canRefresh: boolean;
  loading: boolean;
  message: string;
  onRefresh: () => Promise<void>;
};

export function ReferenceDataStatus({
  catalogAvailable,
  systemCount,
  customerCount,
  fetchedAt,
  canRefresh,
  loading,
  message,
  onRefresh
}: ReferenceDataStatusProps) {
  return (
    <section className="server-records" aria-labelledby="reference-cache-title">
      <div className="server-records-heading">
        <div>
          <p className="eyebrow">Offline reference cache</p>
          <h2 id="reference-cache-title">Master Service Report V1</h2>
        </div>
        <button type="button" disabled={!canRefresh || loading} onClick={() => void onRefresh()}>
          {loading ? "Refreshing" : "Refresh Reference Data"}
        </button>
      </div>
      <dl>
        <div><dt>Catalog</dt><dd>{catalogAvailable ? "Cached" : "Not cached"}</dd></div>
        <div><dt>Systems</dt><dd>{systemCount}</dd></div>
        <div><dt>Customers</dt><dd>{customerCount}</dd></div>
        <div><dt>Last refresh</dt><dd>{fetchedAt ? new Date(fetchedAt).toLocaleString() : "Never"}</dd></div>
      </dl>
      {message ? <p className="form-message">{message}</p> : null}
    </section>
  );
}
