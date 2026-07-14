import { useEffect, useState } from "react";
import { AuthStatus } from "./auth/AuthStatus";
import {
  getCurrentUser,
  login,
  logout,
  type AuthUser
} from "./auth/authApi";
import { LoginForm } from "./auth/LoginForm";
import { initializeLocalDatabase } from "./db/localDatabase";
import { TestRecordForm } from "./records/TestRecordForm";
import { TestRecordList } from "./records/TestRecordList";
import {
  loadServerTestRecords,
  type ServerTestRecord
} from "./records/serverTestRecordApi";
import { ServerTestRecordList } from "./records/ServerTestRecordList";
import {
  listTestRecords,
  saveDraft,
  submitLocal
} from "./records/testRecordRepository";
import type {
  TestRecordFormValues,
  TestRecordView
} from "./records/testRecordTypes";
import {
  recoverInterruptedSync,
  syncPendingTestRecords
} from "./sync/syncEngine";

type ApiHealth = "Not checked" | "Reachable" | "Unavailable";

export function App() {
  const [databaseReady, setDatabaseReady] = useState(false);
  const [apiHealth, setApiHealth] = useState<ApiHealth>("Not checked");
  const [records, setRecords] = useState<TestRecordView[]>([]);
  const [syncMessage, setSyncMessage] = useState("");
  const [authUser, setAuthUser] = useState<AuthUser>();
  const [authMessage, setAuthMessage] = useState("Checking server sign-in");
  const [serverRecords, setServerRecords] = useState<ServerTestRecord[]>([]);
  const [serverRecordsMessage, setServerRecordsMessage] = useState("");
  const [serverRecordsLoading, setServerRecordsLoading] = useState(false);

  useEffect(() => {
    void initializeLocalDatabase().then(async () => {
      const recovered = await recoverInterruptedSync();
      setDatabaseReady(true);
      setRecords(await listTestRecords());
      if (recovered > 0) {
        setSyncMessage("Recovered interrupted sync; record is retryable");
      }

      try {
        const user = await getCurrentUser();
        setAuthUser(user);
        setAuthMessage(user ? "" : "Sign in required before server sync");
      } catch {
        setAuthMessage("Server unavailable; local save still works");
      }
    });
  }, []);

  async function refreshRecords() {
    setRecords(await listTestRecords());
  }

  async function checkApiHealth() {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      setApiHealth(response.ok ? "Reachable" : "Unavailable");
    } catch {
      setApiHealth("Unavailable");
    }
  }

  async function handleSaveDraft(values: TestRecordFormValues) {
    await saveDraft(values);
    await refreshRecords();
  }

  async function handleSubmitLocal(values: TestRecordFormValues) {
    await submitLocal(values);
    await refreshRecords();
    setSyncMessage("Record is pending sync");
  }

  async function handleSync() {
    const result = await syncPendingTestRecords();
    setSyncMessage(result.message);
    await refreshRecords();
  }

  async function handleLogin(username: string, password: string) {
    const user = await login(username, password);
    setAuthUser(user);
    setAuthMessage("");
  }

  async function handleLogout() {
    await logout();
    setAuthUser(undefined);
    setAuthMessage("Signed out. Local records remain on this device.");
    setServerRecords([]);
    setServerRecordsMessage("");
  }

  async function handleLoadServerRecords() {
    setServerRecordsLoading(true);
    setServerRecordsMessage("");

    try {
      setServerRecords(await loadServerTestRecords());
    } catch (error) {
      setServerRecordsMessage(
        error instanceof Error
          ? error.message
          : "Server records are currently unavailable"
      );
    } finally {
      setServerRecordsLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="status-panel" aria-labelledby="app-title">
        <p className="eyebrow">Phase 2 vertical slice</p>
        <h1 id="app-title">Inspection PWA</h1>
        <p>
          Generic test records save to IndexedDB first. Drafts stay local;
          submitted records queue for retryable sync.
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
      <section className="workspace" aria-label="Server sign-in">
        {authUser ? (
          <AuthStatus
            user={authUser}
            message={authMessage}
            onLogout={handleLogout}
          />
        ) : (
          <>
            <AuthStatus message={authMessage} onLogout={handleLogout} />
            <LoginForm onLogin={handleLogin} />
          </>
        )}
      </section>
      <section className="workspace" aria-label="Generic test record workspace">
        <TestRecordForm
          onSaveDraft={handleSaveDraft}
          onSubmitLocal={handleSubmitLocal}
        />
        <div className="sync-panel">
          <button type="button" onClick={handleSync}>
            Sync Pending
          </button>
          {syncMessage ? <p>{syncMessage}</p> : null}
        </div>
        <TestRecordList records={records} />
      </section>
      <section className="workspace" aria-label="Read-only server records">
        <ServerTestRecordList
          records={serverRecords}
          isLoading={serverRecordsLoading}
          message={serverRecordsMessage}
          canLoad={Boolean(authUser)}
          onLoad={handleLoadServerRecords}
        />
      </section>
    </main>
  );
}
