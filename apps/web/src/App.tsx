import { useEffect, useState } from "react";
import { initializeLocalDatabase } from "./db/localDatabase";

type ApiHealth = "Not checked" | "Reachable" | "Unavailable";

export function App() {
  const [databaseReady, setDatabaseReady] = useState(false);
  const [apiHealth, setApiHealth] = useState<ApiHealth>("Not checked");

  useEffect(() => {
    void initializeLocalDatabase().then(() => setDatabaseReady(true));
  }, []);

  async function checkApiHealth() {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      setApiHealth(response.ok ? "Reachable" : "Unavailable");
    } catch {
      setApiHealth("Unavailable");
    }
  }

  return (
    <main className="app-shell">
      <section className="status-panel" aria-labelledby="app-title">
        <p className="eyebrow">Phase 1 foundation</p>
        <h1 id="app-title">Inspection PWA</h1>
        <p>
          This skeleton proves the application shell, local database bootstrap,
          and internal API boundary. Real inspection workflows begin in Phase 2.
        </p>
        <dl>
          <div>
            <dt>Local database</dt>
            <dd>{databaseReady ? "Ready" : "Starting"}</dd>
          </div>
          <div>
            <dt>API health</dt>
            <dd>{apiHealth}</dd>
          </div>
        </dl>
        <button type="button" onClick={checkApiHealth}>
          Check API
        </button>
      </section>
    </main>
  );
}

