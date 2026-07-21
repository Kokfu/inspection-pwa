import { useEffect, useRef, useState } from "react";
import { AuthStatus } from "./auth/AuthStatus";
import { getCurrentUser, login, logout, type AuthUser } from "./auth/authApi";
import {
  clearLocalIdentity,
  getDeviceAuthState,
  identityFromDeviceState,
  storeVerifiedIdentity
} from "./auth/authStateRepository";
import { authStateUser, type ClientAuthState } from "./auth/authStateTypes";
import { LoginForm } from "./auth/LoginForm";
import { initializeLocalDatabase, type InspectionRecord } from "./db/localDatabase";
import { InspectionForm } from "./inspections/InspectionForm";
import { InspectionList } from "./inspections/InspectionList";
import {
  listInspectionRecords,
  saveInspectionDraft,
  submitLocalInspection
} from "./inspections/inspectionRepository";
import type { InspectionFormValues } from "./inspections/inspectionTypes";
import {
  loadServerInspections,
  type ServerInspectionSummary
} from "./inspections/serverInspectionApi";
import { ServerInspectionList } from "./inspections/ServerInspectionList";
import { TechnicianHome } from "./jobs/TechnicianHome";
import type { InspectionJob } from "./jobs/jobTypes";
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
import { ReferenceDataStatus } from "./referenceData/ReferenceDataStatus";
import {
  getCachedInspectionJobs,
  getReferenceCacheSummary,
  refreshInspectionReferenceData
} from "./referenceData/referenceDataCache";
import {
  pruneCompletedOutboxItems,
  recoverInterruptedSync,
  syncPendingTestRecords
} from "./sync/syncEngine";

type ApiHealth = "Not checked" | "Reachable" | "Unavailable";

const emptyReferenceCache = {
  catalogAvailable: false,
  systemCount: 0,
  customerCount: 0,
  fetchedAt: undefined as string | undefined
};

export function App() {
  const [databaseReady, setDatabaseReady] = useState(false);
  const [apiHealth, setApiHealth] = useState<ApiHealth>("Not checked");
  const [authState, setAuthState] = useState<ClientAuthState>({ status: "checking" });
  const [jobs, setJobs] = useState<InspectionJob[]>([]);
  const [jobMessage, setJobMessage] = useState("");
  const [jobLoading, setJobLoading] = useState(false);
  const [records, setRecords] = useState<TestRecordView[]>([]);
  const [syncMessage, setSyncMessage] = useState("");
  const [serverRecords, setServerRecords] = useState<ServerTestRecord[]>([]);
  const [serverRecordsMessage, setServerRecordsMessage] = useState("");
  const [serverRecordsLoading, setServerRecordsLoading] = useState(false);
  const [inspections, setInspections] = useState<Awaited<ReturnType<typeof listInspectionRecords>>>([]);
  const [activeInspectionDraft, setActiveInspectionDraft] = useState<InspectionRecord>();
  const [inspectionSyncMessage, setInspectionSyncMessage] = useState("");
  const [serverInspections, setServerInspections] = useState<ServerInspectionSummary[]>([]);
  const [serverInspectionsMessage, setServerInspectionsMessage] = useState("");
  const [serverInspectionsLoading, setServerInspectionsLoading] = useState(false);
  const [referenceCache, setReferenceCache] = useState(emptyReferenceCache);
  const [referenceCacheMessage, setReferenceCacheMessage] = useState("");
  const [referenceCacheLoading, setReferenceCacheLoading] = useState(false);
  const authOperationGeneration = useRef(0);
  const activeExplicitAuthOperation = useRef<number | undefined>(undefined);
  const authRequestQueue = useRef<Promise<void>>(Promise.resolve());

  function beginExplicitAuthOperation() {
    authOperationGeneration.current += 1;
    const operation = authOperationGeneration.current;
    activeExplicitAuthOperation.current = operation;
    return operation;
  }

  function finishExplicitAuthOperation(operation: number) {
    if (activeExplicitAuthOperation.current === operation) {
      activeExplicitAuthOperation.current = undefined;
    }
  }

  function isCurrentAuthOperation(operation: number) {
    return authOperationGeneration.current === operation;
  }

  function enqueueAuthRequest<T>(
    operation: number,
    request: () => Promise<T>
  ) {
    const queuedRequest = authRequestQueue.current.then(async () => {
      if (!isCurrentAuthOperation(operation)) return undefined;
      return request();
    });
    authRequestQueue.current = queuedRequest.then(
      () => undefined,
      () => undefined
    );
    return queuedRequest;
  }

  async function loadCachedJobs(userId: number, operation: number) {
    const cachedJobs = await getCachedInspectionJobs(userId);
    if (!isCurrentAuthOperation(operation)) return undefined;
    setJobs(cachedJobs);
    return cachedJobs;
  }

  async function refreshServerWorkspace(user: AuthUser, operation: number) {
    if (!isCurrentAuthOperation(operation)) return;
    setJobLoading(true);
    setReferenceCacheLoading(true);
    setJobMessage("");
    setReferenceCacheMessage("");
    try {
      await refreshInspectionReferenceData(
        user.id,
        () => isCurrentAuthOperation(operation)
      );
      if (!isCurrentAuthOperation(operation)) return;
      const cachedJobs = await loadCachedJobs(user.id, operation);
      if (!isCurrentAuthOperation(operation) || !cachedJobs) return;
      const summary = await getReferenceCacheSummary();
      if (!isCurrentAuthOperation(operation)) return;
      setReferenceCache(summary);
      setJobMessage(`${cachedJobs.length} technician jobs cached for offline use`);
      setReferenceCacheMessage("Reference data cached for offline use");
    } catch (error) {
      if (!isCurrentAuthOperation(operation)) return;
      const message = error instanceof Error ? error.message : "Server data is currently unavailable";
      await loadCachedJobs(user.id, operation);
      if (!isCurrentAuthOperation(operation)) return;
      setJobMessage(`${message}; existing cached jobs remain available`);
      setReferenceCacheMessage("Reference refresh failed; existing offline cache remains available");
    } finally {
      if (!isCurrentAuthOperation(operation)) return;
      setJobLoading(false);
      setReferenceCacheLoading(false);
    }
  }

  async function resolvePendingServerLogout(operation: number) {
    const result = await enqueueAuthRequest(operation, logout);
    if (!isCurrentAuthOperation(operation) || result === undefined) return "stale" as const;
    if (result === "unavailable") return "unavailable" as const;

    await clearLocalIdentity();
    return isCurrentAuthOperation(operation) ? "resolved" as const : "stale" as const;
  }

  async function reconcileAuthentication() {
    if (activeExplicitAuthOperation.current !== undefined) return;
    const operation = authOperationGeneration.current;
    const deviceState = await getDeviceAuthState();
    if (!isCurrentAuthOperation(operation)) return;

    if (deviceState?.serverLogoutPending) {
      setJobs([]);
      setAuthState({
        status: "unauthenticated",
        message: "Signed out locally. Completing server logout when available."
      });
      const logoutResult = await resolvePendingServerLogout(operation);
      if (!isCurrentAuthOperation(operation)) return;
      setAuthState({
        status: "unauthenticated",
        message: logoutResult === "unavailable"
          ? "Signed out locally. Server logout will complete after reconnecting."
          : "Signed out. Sign in to prepare offline work."
      });
      return;
    }

    const cachedIdentity = identityFromDeviceState(deviceState);
    if (cachedIdentity) {
      await loadCachedJobs(cachedIdentity.user.id, operation);
      if (!isCurrentAuthOperation(operation)) return;
      setAuthState({
        status: "offline-unverified",
        user: cachedIdentity.user,
        lastVerifiedAt: cachedIdentity.lastVerifiedAt
      });
      setJobMessage("Using jobs previously cached for this user while verifying the session");
    }

    const probe = await getCurrentUser();
    if (!isCurrentAuthOperation(operation)) return;
    if (probe.status === "authenticated") {
      const lastVerifiedAt = await storeVerifiedIdentity(probe.user);
      if (!isCurrentAuthOperation(operation)) return;
      setAuthState({ status: "verified", user: probe.user, lastVerifiedAt });
      await loadCachedJobs(probe.user.id, operation);
      await refreshServerWorkspace(probe.user, operation);
      return;
    }

    if (probe.status === "unauthenticated") {
      await clearLocalIdentity();
      if (!isCurrentAuthOperation(operation)) return;
      setJobs([]);
      setAuthState({
        status: "unauthenticated",
        message: "Sign in required before server actions"
      });
      return;
    }

    if (cachedIdentity) {
      return;
    }

    setAuthState({
      status: "unauthenticated",
      message: "Server unavailable. Sign in online once to prepare offline technician access."
    });
  }

  useEffect(() => {
    void initializeLocalDatabase().then(async () => {
      const recovered = await recoverInterruptedSync();
      setDatabaseReady(true);
      void pruneCompletedOutboxItems().catch(() => undefined);
      setRecords(await listTestRecords());
      setInspections(await listInspectionRecords());
      setReferenceCache(await getReferenceCacheSummary());
      if (recovered > 0) {
        setSyncMessage("Recovered interrupted sync; record is retryable");
      }
      await reconcileAuthentication();
    });

    const handleOnline = () => void reconcileAuthentication();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  const currentUser = authStateUser(authState);
  const canUseServer = authState.status === "verified";

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
    if (!canUseServer) {
      setSyncMessage("Reconnect to verify your session before syncing");
      return;
    }
    const result = await syncPendingTestRecords();
    setSyncMessage(result.message);
    await refreshRecords();
  }

  async function handleLogin(username: string, password: string) {
    const operation = beginExplicitAuthOperation();
    try {
      const user = await enqueueAuthRequest(operation, async () => {
        const deviceState = await getDeviceAuthState();
        if (!isCurrentAuthOperation(operation)) return undefined;
        if (deviceState?.serverLogoutPending) {
          const logoutResult = await logout();
          if (!isCurrentAuthOperation(operation)) return undefined;
          if (logoutResult === "unavailable") {
            throw new Error("Reconnect to complete the previous server logout before signing in");
          }
          await clearLocalIdentity();
          if (!isCurrentAuthOperation(operation)) return undefined;
        }
        return login(username, password);
      });
      if (!isCurrentAuthOperation(operation) || !user) return;
      const lastVerifiedAt = await storeVerifiedIdentity(user);
      if (!isCurrentAuthOperation(operation)) return;
      setAuthState({ status: "verified", user, lastVerifiedAt });
      await loadCachedJobs(user.id, operation);
      await refreshServerWorkspace(user, operation);
    } finally {
      finishExplicitAuthOperation(operation);
    }
  }

  async function handleLogout() {
    const operation = beginExplicitAuthOperation();
    try {
      await clearLocalIdentity(true);
      if (!isCurrentAuthOperation(operation)) return;
      setAuthState({ status: "unauthenticated", message: "Signed out locally" });
      setJobs([]);
      setServerRecords([]);
      setServerRecordsMessage("");
      setServerInspections([]);
      setServerInspectionsMessage("");
      const result = await resolvePendingServerLogout(operation);
      if (!isCurrentAuthOperation(operation)) return;
      if (result === "resolved") {
        setAuthState({ status: "unauthenticated", message: "Signed out. Local records remain on this device." });
      } else {
        setAuthState({
          status: "unauthenticated",
          message: "Signed out locally. Server logout will complete after reconnecting."
        });
      }
    } finally {
      finishExplicitAuthOperation(operation);
    }
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
    if (!canUseServer) {
      setInspectionSyncMessage("Reconnect to verify your session before syncing");
      return;
    }
    const result = await syncPendingTestRecords();
    setInspectionSyncMessage(result.message);
    await refreshInspections();
    await refreshRecords();
  }

  async function handleLoadServerInspections() {
    if (!canUseServer) return;
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
    if (!canUseServer) return;
    setServerRecordsLoading(true);
    setServerRecordsMessage("");
    try {
      setServerRecords(await loadServerTestRecords());
    } catch (error) {
      setServerRecordsMessage(error instanceof Error ? error.message : "Server records are currently unavailable");
    } finally {
      setServerRecordsLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="app-header" aria-labelledby="app-title">
        <div>
          <p className="eyebrow">Field Inspection</p>
          <h1 id="app-title">Inspection PWA</h1>
        </div>
        <dl>
          <div><dt>Local database</dt><dd>{databaseReady ? "Ready" : "Starting"}</dd></div>
          <div><dt>API health</dt><dd>{apiHealth}</dd></div>
        </dl>
        <button type="button" onClick={checkApiHealth}>Check API</button>
      </section>

      <section className="workspace" aria-label="Server sign-in">
        <AuthStatus state={authState} onLogout={handleLogout} onRevalidate={reconcileAuthentication} />
        {authState.status === "unauthenticated" ? <LoginForm onLogin={handleLogin} /> : null}
      </section>

      <TechnicianHome
        authState={authState}
        jobs={jobs}
        inspections={inspections}
        loading={jobLoading}
        message={jobMessage}
        onRefresh={async () => {
          if (currentUser && canUseServer) {
            await refreshServerWorkspace(currentUser, authOperationGeneration.current);
          }
        }}
      />

      <details className="development-tools">
        <summary>Development / Regression Tools</summary>
        <div className="development-tools-content">
          <section className="workspace" aria-label="Generic test record workspace">
            <TestRecordForm onSaveDraft={handleSaveDraft} onSubmitLocal={handleSubmitLocal} />
            <div className="sync-panel">
              <button type="button" disabled={!canUseServer} onClick={handleSync}>Sync Pending</button>
              {syncMessage ? <p>{syncMessage}</p> : null}
            </div>
            <TestRecordList records={records} />
          </section>
          <section className="workspace" aria-label="Inspection reference data">
            <ReferenceDataStatus
              {...referenceCache}
              canRefresh={canUseServer}
              loading={referenceCacheLoading}
              message={referenceCacheMessage}
              onRefresh={async () => {
                if (currentUser && canUseServer) {
                  await refreshServerWorkspace(currentUser, authOperationGeneration.current);
                }
              }}
            />
          </section>
          <section className="workspace" aria-label="Read-only server records">
            <ServerTestRecordList
              records={serverRecords}
              isLoading={serverRecordsLoading}
              message={serverRecordsMessage}
              canLoad={canUseServer}
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
              <button type="button" disabled={!canUseServer} onClick={handleInspectionSync}>Sync Pending</button>
              {inspectionSyncMessage ? <p>{inspectionSyncMessage}</p> : null}
            </div>
            <InspectionList records={inspections} onResumeDraft={setActiveInspectionDraft} />
          </section>
          <section className="workspace" aria-label="Read-only server inspections">
            <ServerInspectionList
              inspections={serverInspections}
              loading={serverInspectionsLoading}
              message={serverInspectionsMessage}
              canLoad={canUseServer}
              onLoad={handleLoadServerInspections}
            />
          </section>
        </div>
      </details>
    </main>
  );
}
