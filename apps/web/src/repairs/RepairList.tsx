import { liveQuery } from "dexie";
import { useEffect, useRef, useState } from "react";
import { localDatabase } from "../db/localDatabase";
import { beginWorkspaceActivity } from "../db/workspaceActivity";
import { clearManagerLeaveGuard, setManagerLeaveGuard } from "../manager/managerLeaveGuard";
import { formatClientDateTime } from "../uiPresentation";
import { canonical, object, uuid } from "./repairContract";
import { createRepairDraft, downloadRepairService, errorMessage, repairContext } from "./repairRepository";
import { isOpenState, latestCycleState, NOT_DONE_PREFIX, parseNotDone, type NotDoneMarker } from "./repairPartState";
import { RepairBefore, RepairEditor, RepairHistoryView } from "./RepairPartView";
import { clearPartNotDone, markPartNotDone, prepareOwnRepairService, refreshRepairList, REPAIR_LIST_CACHE, repairCompareHref, repairRecovery, repairServiceHref, repairUnitLabel, reviewLabel, type RepairServiceSummary } from "./repairUiRepository";
import type { RepairAttachment, RepairFinding, RepairRecord, RepairWorkOrder } from "./repairTypes";

type Snapshot = { findings: RepairFinding[]; orders: RepairWorkOrder[]; records: RepairRecord[]; photos: RepairAttachment[]; services: RepairServiceSummary[]; notDone: Map<string, NotDoneMarker>; fetchedAt?: string; refreshError?: string };
const empty: Snapshot = { findings: [], orders: [], records: [], photos: [], services: [], notDone: new Map() };
type Props = { actorId: number; canUseServer: boolean; suspended?: boolean; jobId?: string; systemKey?: string; findingId?: string; onSync: () => Promise<unknown>; onVerify: () => Promise<unknown> };

export function RepairList({ actorId, canUseServer, suspended = false, jobId, systemKey, findingId, onSync, onVerify }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCompleted, setShowCompleted] = useState(false);
  const [notDoneFor, setNotDoneFor] = useState<string | undefined>();
  const [notDoneReason, setNotDoneReason] = useState("");
  const mounted = useRef(true), running = useRef(false);
  const unsavedParts = useRef(new Set<string>());
  function onDirty(clientUuid: string, dirty: boolean) {
    if (dirty) unsavedParts.current.add(clientUuid); else unsavedParts.current.delete(clientUuid);
  }
  useEffect(() => {
    const hash = window.location.hash;
    // Reuse the App's existing hash/sign-out guard, once for the entire repair page.
    setManagerLeaveGuard({ hash, confirmLeave: () => !unsavedParts.current.size || window.confirm("Repair edits have not saved on this device. Stay here and retry Save Draft to keep them. Leave anyway?") });
    return () => clearManagerLeaveGuard(hash);
  }, []);
  const validRoute = (!jobId || uuid(jobId) && !!systemKey && /^[a-z0-9_]{1,80}$/.test(systemKey)) && (!findingId || uuid(findingId));
  useEffect(() => {
    mounted.current = true;
    const db = localDatabase;
    const sub = liveQuery(async () => {
      const ctx = await repairContext();
      const [findings, orders, records, photos, cache, markerRows] = await Promise.all([
        db.repairFindings.toArray(), db.repairWorkOrders.toArray(), db.repairRecords.toArray(), db.repairAttachments.toArray(), db.referenceData.get(REPAIR_LIST_CACHE),
        db.referenceData.where("key").startsWith(NOT_DONE_PREFIX).toArray()
      ]);
      await ctx.assert();
      const payload = cache && object(cache.payload) ? cache.payload : {};
      // Not Done markers are local to this actor; a marker written for another account is ignored.
      const notDone = new Map<string, NotDoneMarker>();
      for (const row of markerRows) {
        const findingId = row.key.slice(NOT_DONE_PREFIX.length), marker = parseNotDone(row.payload, actorId, findingId);
        if (marker) notDone.set(findingId, marker);
      }
      return { findings, orders, records: records.filter(r => r.actorId === actorId), photos, notDone,
        services: Array.isArray(payload.services) ? payload.services as RepairServiceSummary[] : [], fetchedAt: cache?.fetchedAt,
        refreshError: typeof payload.refreshError === "string" ? payload.refreshError : undefined };
    }).subscribe({ next(v) { if (mounted.current) { setSnapshot(v); setLoaded(true); } }, error(e) { if (mounted.current) { setError(errorMessage(e)); setLoaded(true); } } });
    return () => { mounted.current = false; sub.unsubscribe(); };
  }, [actorId]);

  async function run(action: () => Promise<unknown>, success: string) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); if (mounted.current) setMessage(success); }
    catch (e) { if (mounted.current) setError(errorMessage(e)); }
    finally { running.current = false; if (mounted.current) { setBusy(false); setRefreshKey(v => v + 1); } }
  }
  // Route refresh downloads authority only; saved work is always loaded from IndexedDB.
  useEffect(() => {
    if (canUseServer && validRoute) void run(() => jobId && systemKey ? downloadRepairService(jobId, systemKey, false) : refreshRepairList(), "Authority refreshed. Use Download for Offline to prepare original photos.");
  }, [canUseServer, jobId, systemKey]);

  const services = new Map(snapshot.services.map(s => [`${s.jobId}/${s.systemKey}`, s]));
  for (const f of snapshot.findings) {
    const key = `${f.original.jobId}/${f.original.systemKey}`;
    if (!services.has(key)) services.set(key, { jobId: f.original.jobId, systemKey: f.original.systemKey,
      sourceJob: f.original.sourceJob as RepairServiceSummary["sourceJob"], customer: f.original.customer as RepairServiceSummary["customer"], site: f.original.site as RepairServiceSummary["site"], systemLabel: String(f.original.system) });
  }
  const selected = jobId && systemKey ? services.get(`${jobId}/${systemKey}`) : undefined;
  const serviceFindings = snapshot.findings.filter(f => f.original.jobId === jobId && f.original.systemKey === systemKey && (!findingId || f.findingId === findingId));
  const recordsOf = (f: RepairFinding) => snapshot.records.filter(r => r.findingId === f.findingId);
  const openOf = (f: RepairFinding) => isOpenState(latestCycleState(f, recordsOf(f)));
  const openCount = serviceFindings.filter(openOf).length;
  // A deep link to one part always shows it; otherwise completed parts are behind the toggle.
  const findings = serviceFindings.filter(f => findingId || showCompleted || openOf(f));
  const orders = snapshot.orders.filter(w => w.jobId === jobId && w.systemKey === systemKey && w.assignedToUserId === actorId);
  // Only an active order may create NEW drafts; a revoked one would 403/404 on sync. Existing local work stays editable.
  const activeOrder = orders.find(w => w.status === "active");
  const revokedOrder = activeOrder ? undefined : orders.find(w => w.status === "revoked");
  const groups = new Map<string, { label: string; parts: RepairFinding[] }>();
  for (const f of findings) {
    const key = canonical([f.original.locationId, f.original.zoneId, f.original.instanceKey, f.original.unit, f.original.sectionLabel]);
    const label = `${repairUnitLabel(f)} · ${f.original.sectionLabel}`;
    groups.set(key, { label, parts: [...(groups.get(key)?.parts ?? []), f] });
  }
  const customers = new Map<string, RepairServiceSummary[]>();
  for (const s of services.values()) customers.set(s.customer.id, [...(customers.get(s.customer.id) ?? []), s]);
  const hasRefreshFailure = !!error || !!snapshot.refreshError || findings.some(f => !!f.refreshError);
  return <section className="repair-page" aria-labelledby="repair-title">
    <header><p className="eyebrow">Technician</p><h2 id="repair-title">Repair List</h2>
      <p>Follow up on accepted failed parts. Each part keeps its original Before, own After photo and repair remark.</p>
      {jobId ? <a className="repair-link" href="#/repair-list">Back to Repair List</a> : null}
    </header>
    <div className="repair-actions">
      <button type="button" className="secondary-command" disabled={busy || !validRoute} onClick={() => void run(() => jobId && systemKey ? downloadRepairService(jobId, systemKey, false) : refreshRepairList(), "Authority refreshed.")}>Refresh Authority</button>
      <button type="button" className="secondary-command" disabled={busy} onClick={() => void run(onVerify, "Sign-in verification requested. Refresh authority before retrying Sync.")}>Verify Sign-in</button>
      <button type="button" disabled={busy} onClick={() => void run(onSync, "Sync attempt finished. Check each part's local sync state and retained error below.")}>Sync / Retry</button>
    </div>
    <p role="status">{busy ? "Loading repair authority…" : <>
      {!canUseServer ? "Offline or unverified: local typing, capture, Save Draft and Submit Locally remain available for downloaded work. " : ""}
      {message || (canUseServer ? "Download your service and Before photos before leaving coverage." : "")}
    </>}</p>
    {hasRefreshFailure ? <p role="alert" className="error-text">Authority refresh failed: {error || snapshot.refreshError || findings.find(f => f.refreshError)?.refreshError}. Cached authority is informational. {repairRecovery(error || snapshot.refreshError || findings.find(f => f.refreshError)?.refreshError || "")}</p> : null}
    {!validRoute ? <p role="alert">Invalid repair deep link. Return to Repair List to select an authorized service.</p>
      : !loaded ? <p role="status">Loading saved repairs…</p>
        : jobId && systemKey ? <>
          <h3>{selected?.customer.displayName ?? "Service not downloaded"}</h3>
          <p>{selected ? `${selected.sourceJob.reference} · ${selected.systemLabel} · ${selected.site?.displayName ?? "No site label"}` : "Reconnect and refresh this service to download its authorized findings."}</p>
          <div className="repair-actions">
            <button type="button" disabled={busy} onClick={() => void run(() => downloadRepairService(jobId, systemKey, true), "Service authority and original Before photos downloaded. Local work is retained.")}>Download for Offline</button>
            {!activeOrder ? <button type="button" disabled={busy} onClick={() => void run(() => prepareOwnRepairService(jobId, systemKey), "Repairs started for you. You can now repair parts offline.")}>Start Repairs</button> : null}
            {serviceFindings.length ? <a className="repair-link" href={repairCompareHref(jobId, systemKey)}>Before / After Comparison (Print / PDF)</a> : null}
          </div>
          {activeOrder || revokedOrder ? (o => <p>Work order assigned to Technician #{o.assignedToUserId}: {o.status}, revision {o.revision}. Cached {o.fetchedAt ? formatClientDateTime(o.fetchedAt) : "date unavailable"}.</p>)((activeOrder ?? revokedOrder)!)
            : <p>Start Repairs once while online to take this service for yourself. A Manager may still assign it to you instead. Starting cannot be done offline.</p>}
          {revokedOrder ?<p role="alert">Cached assignment is revoked. Ask Manager to restore access, then refresh and retry Sync. If it was only reassigned, Start Repairs takes the service back for you. Local work remains editable.</p> : null}
          {serviceFindings.length && !findingId ? <div className="repair-actions"><label className="repair-filter"><input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} /> Show completed</label>
            <span role="status">Open parts: {openCount} of {serviceFindings.length}{showCompleted ? "" : "; approved and awaiting-approval parts are hidden"}.</span></div> : null}
          {!serviceFindings.length ? <p>{findingId ? "This failed part is not downloaded or no longer authorized. Refresh authority; retained work is not deleted." : "No failed parts downloaded for this service."}</p> : !findings.length ? <p>All parts are repaired and awaiting or past approval. Turn on Show completed to review them.</p> : null}
          {[...groups].map(([key, { label, parts }]) => <section key={key} className="repair-group"><h3>{label}</h3>
            {parts.map(f => {
              const records = recordsOf(f);
              const marker = snapshot.notDone.get(f.findingId);
              const current = records.find(r => r.syncStatus !== "Synced");
              const last = f.history.at(-1);
              const record = current ?? records.slice().sort((a, b) => b.cycleSequence - a.cycleSequence)[0];
              const waiting = last?.review_state === "awaiting_approval";
              const unrefreshedSubmission = records.some(r => r.syncStatus === "Synced" && !f.history.some(h => h.client_uuid === r.clientUuid));
              return <article key={f.findingId} className="repair-part" aria-label={`Failed part: ${f.original.fieldLabel}`}>
                <h4><a href={repairServiceHref(jobId, systemKey, f.findingId)}>{String(f.original.fieldLabel)}</a></h4>
                <p className="repair-visit">Original visit: {String((f.original.sourceJob as { reference?: unknown } | undefined)?.reference ?? selected?.sourceJob.reference ?? "unavailable")}{selected?.visitDate ? ` · ${selected.visitDate}` : ""}</p>
                <p>Source eligibility: {f.eligibility === "needs_review" ? "Needs Review" : f.eligibility === "not_required" ? "Not Required" : "Eligible"}. {last ? `Server history: ${reviewLabel(last.review_state)}.` : "Open failed part."}</p>
                <p className="secondary-metadata">Cached authority: {f.fetchedAt ? formatClientDateTime(f.fetchedAt) : "date unavailable"}. {f.expiresAt && Date.parse(f.expiresAt) <= Date.now() ? "Cache expired; refresh before server confirmation." : "Server rechecks assignment and source on Sync."}</p>
                {f.eligibility !== "eligible" ? <p>Ask Admin or Manager to review source eligibility. Local drafts can still be saved and submitted on this device; server confirmation requires current authority.</p> : null}
                <div className="repair-comparison"><RepairBefore finding={f} refreshKey={refreshKey} />
                  {record ? <RepairEditor key={record.clientUuid} record={record} onDirty={onDirty} suspended={suspended} photo={snapshot.photos.find(p => p.photoUuid === record.photoUuid)} /> : <section className="repair-after" aria-label="Latest repair"><h4>After</h4>{last ? <><p>Latest repair: cycle {last.cycle_sequence} — {reviewLabel(last.review_state)}.</p><p className="repair-remark">{last.remark}</p></> : <p>Start a repair to add this part's own After photo and remark.</p>}</section>}
                </div>
                {marker && openOf(f) ? <p className="repair-not-done" role="status"><strong>Not Done</strong> — {marker.reason || "no reason given"} ({formatClientDateTime(marker.markedAt)}). Saved on this device only; the part stays Open.</p> : null}
                {!current && !waiting && !unrefreshedSubmission && activeOrder ? <div className="repair-actions">
                  <button type="button" disabled={busy} onClick={() => void run(async () => {
                    const finish = beginWorkspaceActivity();
                    try { await createRepairDraft(f.findingId, activeOrder.workOrderId); await clearPartNotDone(f.findingId); } finally { finish(); }
                  }, "New repair draft saved on this device. Add this part's own After photo and remark.")}>{last ? "Start Another Repair" : "Start Repair"}</button>
                  {marker ? <button type="button" className="secondary-command" disabled={busy} onClick={() => void run(() => clearPartNotDone(f.findingId), "Not Done mark cleared.")}>Clear Not Done</button>
                    : <button type="button" className="secondary-command" disabled={busy} aria-expanded={notDoneFor === f.findingId} onClick={() => { setNotDoneFor(notDoneFor === f.findingId ? undefined : f.findingId); setNotDoneReason(""); }}>Not Done</button>}
                </div> : null}
                {!current && !waiting && !unrefreshedSubmission && activeOrder ? <p className="secondary-metadata">Done: Start Repair, then add the After photo and remark. Not Done: record why it was not repaired (kept on this device).</p> : null}
                {notDoneFor === f.findingId && !marker ? <div className="repair-not-done-form">
                  <label htmlFor={`not-done-${f.findingId}`}>Reason not repaired (optional)</label>
                  <textarea id={`not-done-${f.findingId}`} rows={3} maxLength={500} autoComplete="off" value={notDoneReason} onChange={e => setNotDoneReason(e.target.value)} />
                  <div className="repair-actions"><button type="button" disabled={busy} onClick={() => void run(async () => { await markPartNotDone(f.findingId, notDoneReason); setNotDoneFor(undefined); setNotDoneReason(""); }, "Marked Not Done on this device. The part stays Open.")}>Save Not Done</button>
                    <button type="button" className="secondary-command" onClick={() => { setNotDoneFor(undefined); setNotDoneReason(""); }}>Cancel</button></div>
                </div> : null}
                {waiting ? <p>A repair is awaiting a reviewer decision. Refresh history after the decision to start another repair.</p> : null}
                {unrefreshedSubmission ? <p>Refresh server history to confirm the latest submitted cycle before starting another repair.</p> : null}
                {last?.review_state === "rejected" ? <p>The rejected repair stays immutable. Start Another Repair creates a new UUID linked to the rejected cycle, with a new own After photo.</p> : null}
                <RepairHistoryView finding={f} records={records} photos={snapshot.photos} />
              </article>;
            })}
          </section>)}
        </> : <>
          <p>{snapshot.fetchedAt ? `Service list cached ${formatClientDateTime(snapshot.fetchedAt)}. Refresh for current authorization.` : "No service list downloaded yet."}</p>
          {!customers.size ? <p>No authorized repair services are available on this device. Refresh online; ask Manager about assignments if a service is missing.</p> : null}
          {[...customers].map(([customerId, list]) => <section key={customerId} className="repair-group"><h3>{list[0].customer.displayName}</h3>
            {[...new Set(list.map(s => s.jobId))].map(id => <section key={id}><h4>Original Visit: {list.find(s => s.jobId === id)!.sourceJob.reference}</h4>
              {list.filter(s => s.jobId === id).map(s => {
                const cardFindings = snapshot.findings.filter(f => f.original.jobId === s.jobId && f.original.systemKey === s.systemKey);
                const stateOf = (f: RepairFinding) => latestCycleState(f, snapshot.records.filter(r => r.findingId === f.findingId));
                const serviceRecords = snapshot.records.filter(r => r.jobId === s.jobId && r.systemKey === s.systemKey);
                return <article key={s.systemKey} className="repair-service-card"><h5>{s.systemLabel}</h5><p>{s.site?.displayName ?? "No site label"}</p>
                <p>{snapshot.services.some(v => v.jobId === id && v.systemKey === s.systemKey) ? "Authorized on last successful list refresh." : "Retained local service; current access needs refresh."}</p>
                {cardFindings.length ? <p>Open: {cardFindings.filter(f => isOpenState(stateOf(f))).length} of {cardFindings.length} · Not Done: {cardFindings.filter(f => snapshot.notDone.has(f.findingId) && isOpenState(stateOf(f))).length} · Draft: {serviceRecords.filter(r => r.syncStatus === "Draft").length} · Pending Sync: {serviceRecords.filter(r => r.syncStatus === "Pending" || r.syncStatus === "Syncing").length} · Failed / Conflict: {serviceRecords.filter(r => r.syncStatus === "Failed" || r.syncStatus === "Conflict").length} · Awaiting Approval: {cardFindings.filter(f => stateOf(f) === "awaiting_approval").length} · Needs Review: {cardFindings.filter(f => f.eligibility === "needs_review").length} · Rejected: {cardFindings.filter(f => stateOf(f) === "rejected").length} · Approved: {cardFindings.filter(f => stateOf(f) === "approved").length}</p> : <p>Download the service to see its failed parts and history.</p>}
                <a className="repair-link" href={repairServiceHref(id, s.systemKey)}>Open {s.systemLabel} Repairs</a>
              </article>; })}
            </section>)}
          </section>)}
        </>}
  </section>;
}
