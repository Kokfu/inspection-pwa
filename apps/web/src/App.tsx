import { useEffect, useState } from "react";
import { AuthStatus } from "./auth/AuthStatus";
import {
  getCurrentUser,
  login,
  logout,
  type AuthUser
} from "./auth/authApi";
import { LoginForm } from "./auth/LoginForm";
import { initializeLocalDatabase, type InspectionRecord } from "./db/localDatabase";
import { InspectionForm } from "./inspections/InspectionForm";
import { InspectionList } from "./inspections/InspectionList";
import { listInspectionRecords, saveInspectionDraft, submitLocalInspection } from "./inspections/inspectionRepository";
import type { InspectionFormValues } from "./inspections/inspectionTypes";
import { loadServerInspections, type ServerInspectionSummary } from "./inspections/serverInspectionApi";
import { ServerInspectionList } from "./inspections/ServerInspectionList";
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
  pruneCompletedOutboxItems,
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
  const [inspections, setInspections] = useState<Awaited<ReturnType<typeof listInspectionRecords>>>([]);
  const [activeInspectionDraft, setActiveInspectionDraft] = useState<InspectionRecord>();
  const [inspectionSyncMessage, setInspectionSyncMessage] = useState("");
  const [serverInspections, setServerInspections] = useState<ServerInspectionSummary[]>([]);
  const [serverInspectionsMessage, setServerInspectionsMessage] = useState("");
  const [serverInspectionsLoading, setServerInspectionsLoading] = useState(false);

  useEffect(() => {
    void initializeLocalDatabase().then(async () => {
      const recovered = await recoverInterruptedSync();
      setDatabaseReady(true);
      void pruneCompletedOutboxItems().catch(() => undefined);
      setRecords(await listTestRecords());
      setInspections(await listInspectionRecords());
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

  async function refreshInspections() {
    setInspections(await listInspectionRecords());
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
    setServerInspections([]);
    setServerInspectionsMessage("");
  }

  async function handleSaveInspectionDraft(values: InspectionFormValues) {
    const record = await saveInspectionDraft(values, activeInspectionDraft);
    setActiveInspectionDraft(record);
    await refreshInspections();
  }

  async function handleSubmitLocalInspection(values: InspectionFormValues) {
    await submitLocalInspection(values, activeInspectionDraft);
    setActiveInspectionDraft(undefined);
    await refreshInspections();
    setInspectionSyncMessage("Inspection is pending sync");
  }

  async function handleInspectionSync() {
    const result = await syncPendingTestRecords();
    setInspectionSyncMessage(result.message);
    await refreshInspections();
    await refreshRecords();
  }

  async function handleLoadServerInspections() {
    setServerInspectionsLoading(true);
    setServerInspectionsMessage("");
    try {
      setServerInspections(await loadServerInspections());
    } catch (error) {
      setServerInspectionsMessage(error instanceof Error ? error.message : "Server inspections are currently unavailable");
    } finally {
      setServerInspectionsLoading(false);
    }
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
      <section className="workspace" aria-label="Inspection workspace">
        <InspectionForm
          draft={activeInspectionDraft}
          onSaveDraft={handleSaveInspectionDraft}
          onSubmitLocal={handleSubmitLocalInspection}
        />
        <div className="sync-panel">
          <button type="button" onClick={handleInspectionSync}>Sync Pending</button>
          {inspectionSyncMessage ? <p>{inspectionSyncMessage}</p> : null}
        </div>
        <InspectionList
          records={inspections}
          onResumeDraft={setActiveInspectionDraft}
        />
      </section>
      <section className="workspace" aria-label="Read-only server inspections">
        <ServerInspectionList
          inspections={serverInspections}
          loading={serverInspectionsLoading}
          message={serverInspectionsMessage}
          canLoad={Boolean(authUser)}
          onLoad={handleLoadServerInspections}
        />
      </section>
    </main>
  );
}
