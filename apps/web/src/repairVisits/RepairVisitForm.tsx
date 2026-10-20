import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isServerUnreachable } from "../jobs/serverReachability";
import { formatClientDate } from "../uiPresentation";
import { RepairFieldPicker } from "./RepairFieldPicker";
import { RepairItemCard, type ItemRegistry } from "./RepairItemCard";
import { fetchFinalReport, RepairVisitApiError, sendDelete } from "./repairVisitApi";
import { loadCatalog } from "./repairVisitOffline";
import { identityKey, isEditable, isUnstarted, presentRepairVisit, submitReadiness, visibleActionNotice, visitNumberText } from "./repairVisitPresentation";
import { refreshRepairVisitsFromServer } from "./repairVisitRefresh";
import {
  addItem, discardRefusedRepairVisit, prepareDeleteRepairVisit, removeLocalVisitConfirmedDeleted, reopenForEdit, requeueRepairVisit, submitRepairVisitLocal
} from "./repairVisitRepository";
import type { RepairCatalogField } from "./repairVisitTypes";
import { useBrowserConnected, useLocalRepairVisit } from "./useRepairVisits";

const text = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

export function RepairVisitForm({ visitUuid, canUseServer, onSync }: { visitUuid: string; canUseServer: boolean; onSync: () => Promise<unknown> }) {
  const { visit, items, photos, loaded, failed } = useLocalRepairVisit(visitUuid);
  const browserConnected = useBrowserConnected();
  const connected = canUseServer && browserConnected;
  const [attempted, setAttempted] = useState(false);
  const [notice, setNotice] = useState("");
  const [deliveryNotice, setDeliveryNotice] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [adding, setAdding] = useState(false);
  const flushers = useRef(new Map<string, () => Promise<void>>());
  const registry = useMemo<ItemRegistry>(() => ({
    register: (id, flush) => { flushers.current.set(id, flush); },
    unregister: id => { flushers.current.delete(id); }
  }), []);

  const refresh = useCallback(async () => {
    setRefreshError("");
    try { await refreshRepairVisitsFromServer(); }
    catch (caught) { setRefreshError(isServerUnreachable(caught) ? "The server could not be reached." : text(caught, "The visit could not be refreshed.")); }
  }, []);
  // Opening the visit asks the server whether it was returned or approved. A failure is shown, not hidden.
  useEffect(() => { if (connected && visit?.createConfirmed) void refresh(); }, [connected, visit?.createConfirmed, refresh]);

  if (!loaded) return <section className="rv-page"><p role="status">Loading repair visit…</p></section>;
  if (failed) return <section className="rv-page"><p className="rv-error" role="alert">This repair visit could not be read from the device.</p><a className="secondary-command" href="#/repair-visits">Back to Repair List</a></section>;
  if (!visit) return <section className="rv-page" aria-labelledby="rv-missing"><h2 id="rv-missing">Repair visit not found</h2>
    <p>It is not on this device. It may have been deleted, or it belongs to another technician.</p><a className="secondary-command" href="#/repair-visits">Back to Repair List</a></section>;

  const editable = isEditable(visit);
  const state = presentRepairVisit(visit);
  const readiness = submitReadiness(items, photos);
  const started = !isUnstarted(items) || photos.size > 0;
  const canDelete = visit.origin !== "server" && visit.status === "draft" && !visit.frozen && !started;

  async function submit() {
    setNotice(""); setDeliveryNotice(false); setError(""); setAttempted(true);
    setBusy(true);
    try {
      await Promise.all([...flushers.current.values()].map(flush => flush()));
      await submitRepairVisitLocal(visitUuid);
      setAttempted(false);
      setNotice(connected ? "Submitted. Sending to the server…" : "Submitted on this device. It will be sent when you are connected.");
      setDeliveryNotice(true);
      if (canUseServer) void onSync().catch(() => undefined);
    } catch (caught) {
      setError(text(caught, "The repair visit could not be submitted."));
      const first = document.querySelector<HTMLElement>(".rv-item--incomplete h3");
      first?.focus();
    } finally { setBusy(false); }
  }

  async function retry() {
    setError("");
    try { await requeueRepairVisit(visitUuid); if (canUseServer) await onSync(); }
    catch (caught) { setError(text(caught, "The repair visit could not be queued again.")); }
  }
  async function reopen() {
    setError("");
    try { await reopenForEdit(visitUuid); setDeliveryNotice(false); setNotice("You can edit this repair visit again. Submit it when it is complete."); }
    catch (caught) { setError(text(caught, "The repair visit could not be reopened.")); }
  }
  async function remove() {
    setError("");
    if (!window.confirm("Delete this repair visit? Nothing has been recorded on it.")) return;
    try {
      const outcome = await prepareDeleteRepairVisit(visitUuid);
      if (outcome.kind !== "deleted-local") {
        if (!connected) { setError("This repair visit may already be on the server. Connect to delete it."); return; }
        try { await sendDelete(visitUuid, outcome.revision); }
        catch (caught) {
          // The server never received the create, so there is nothing there to delete.
          if (!(outcome.kind === "maybe-on-server" && caught instanceof RepairVisitApiError && caught.code === "VISIT_NOT_YET_CREATED")) throw caught;
        }
        await removeLocalVisitConfirmedDeleted(visitUuid);
      }
      window.location.hash = "#/repair-visits";
    } catch (caught) { setError(text(caught, "The repair visit could not be deleted.")); }
  }
  async function discard() {
    setError("");
    if (!window.confirm("Discard this repair visit? Everything entered on it will be removed from this device.")) return;
    try { await discardRefusedRepairVisit(visitUuid); window.location.hash = "#/repair-visits"; }
    catch (caught) { setError(text(caught, "The repair visit could not be discarded.")); }
  }
  async function openReport() {
    setError("");
    try {
      const blob = await fetchFinalReport(visitUuid, visit!.revision);
      const url = URL.createObjectURL(blob);
      // A download link works in an installed PWA and on a phone, where a pop-up window with a blob PDF often does not.
      const link = document.createElement("a");
      link.href = url; link.download = `${(visit!.reportNumber ?? visit!.visitNumber ?? "repair-report").replaceAll("/", "-")}.pdf`;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) { setError(text(caught, "The report could not be downloaded.")); }
  }

  return <section className="rv-page" aria-labelledby="rv-form-title">
    <a className="secondary-command rv-back" href="#/repair-visits">← Back to Repair List</a>
    <header className="rv-form-header">
      <div><p className="eyebrow">Repair visit</p><h2 id="rv-form-title">{visit.customerName ?? "Customer"}{visit.siteName ? ` — ${visit.siteName}` : ""}</h2></div>
      <span className={`status-badge status-badge--${state.tone === "approved" ? "complete" : state.tone === "attention" ? "attention" : state.tone === "syncing" ? "syncing" : state.tone === "draft" ? "draft" : "waiting"}`}>{state.label}</span>
    </header>
    <dl className="rv-summary">
      <div><dt>Repair visit</dt><dd>{visitNumberText(visit)}</dd></div>
      <div><dt>Date</dt><dd>{formatClientDate(visit.visitDate)} · {visit.arrivalTime}</dd></div>
      <div><dt>Service call no</dt><dd>{visit.serviceCallNumber ?? "—"}</dd></div>
      <div><dt>Previous visit</dt><dd>{visit.previousVisitLabel ?? (visit.previousVisit ? `${visit.previousVisit.kind === "repair" ? "Repair" : "Service"} visit` : "None")}</dd></div>
      {visit.reportNumber ? <div><dt>Report</dt><dd>{visit.reportNumber}</dd></div> : null}
    </dl>

    {visit.status === "returned" && !visit.frozen ? <section className="rv-banner rv-banner--returned" role="status" aria-labelledby="rv-returned-title">
      <h3 id="rv-returned-title">Returned to you</h3>
      <p className="rv-remark">{visit.returnReason?.trim() ? visit.returnReason : "No reason was given."}</p>
      <p>{visit.origin === "server" ? "This visit was created on another device. Open it there to edit and submit it again." : "Change what is needed below, then submit it again. Nothing has to be entered from the start."}</p>
    </section> : null}
    {visit.status === "awaiting_approval" ? <p className="operational-message" role="status">Sent to the server. Waiting for Admin or Manager approval.</p> : null}
    {visit.status === "approved" ? <section className="rv-banner rv-banner--approved" role="status" aria-labelledby="rv-approved-title">
      <h3 id="rv-approved-title">Approved</h3><p>Report {visit.reportNumber}. This repair visit is locked.</p>
      <button type="button" disabled={!connected} onClick={() => void openReport()}>Download report (PDF)</button>
      {!connected ? <p className="rv-help">Connect to download the report.</p> : null}
    </section> : null}
    {state.tone === "attention" ? <section className="rv-banner rv-banner--attention" role="alert" aria-labelledby="rv-attention-title">
      <h3 id="rv-attention-title">Needs attention</h3><p>{state.reason}</p><p>Everything you entered is kept on this device.</p>
      <div className="rv-actions">
        <button type="button" onClick={() => void retry()}>Retry sync</button>
        {visit.frozen && visit.createConfirmed ? <button type="button" className="secondary-command" onClick={() => void reopen()}>Edit and submit again</button> : null}
        {!visit.createConfirmed ? <button type="button" className="secondary-command" onClick={() => void discard()}>Discard this repair visit</button> : null}
      </div>
    </section> : null}
    {state.tone === "pending" || state.tone === "syncing" ? <p className="operational-message" role="status">{state.label === "Syncing" ? "Sending to the server…" : (visit.frozen ? "Submitted and waiting to sync. It will be sent when you are connected." : "Saved on this device. It will be sent when you are connected.")}{state.reason && state.label === "Pending sync" ? ` ${state.reason}` : ""}</p> : null}
    {refreshError ? <p className="operational-message operational-message--warning" role="alert">Could not check the server: {refreshError} What you see is the last known state on this device.</p> : null}
    {!connected ? <p className="offline-notice" role="status">Offline — everything you enter is saved on this device and sent when you reconnect.</p> : null}
    <p className="rv-help" role="status" aria-live="polite">{visibleActionNotice(notice, deliveryNotice, state.tone)}</p>
    {error ? <p className="rv-error" role="alert">{error}</p> : null}

    <div className="rv-items">
      {items.map((item, index) => <RepairItemCard key={item.clientUuid} visit={visit} item={item} photo={item.photoUuid ? photos.get(item.photoUuid) : undefined}
        editable={editable} canRemove={editable && visit.status === "returned" && items.length > 1} attempted={attempted} position={index + 1} total={items.length}
        connected={connected} registry={registry} />)}
    </div>

    {editable && visit.status === "returned" ? <section className="rv-add" aria-labelledby="rv-add-title">
      <h3 id="rv-add-title">Add a field</h3>
      {adding ? <AddFields visitUuid={visitUuid} customerId={visit.customerId} siteId={visit.siteId} previous={visit.previousVisit}
        existing={new Set(items.map(item => identityKey(item.identity)))} connected={connected} onDone={() => setAdding(false)} />
        : <button type="button" className="secondary-command" onClick={() => setAdding(true)}>Add a field from the list</button>}
    </section> : null}

    {editable ? <div className="rv-submit-bar">
      <p id="rv-submit-hint" className="rv-help" role="status">{readiness.ready ? "Every field is complete." : `${readiness.incomplete} of ${readiness.total} ${readiness.total === 1 ? "field needs" : "fields need"} a result, a remark and a photo.`}</p>
      <button type="button" className="rv-submit" disabled={busy} aria-describedby="rv-submit-hint" onClick={() => void submit()}>{busy ? "Submitting…" : visit.status === "returned" ? "Submit again" : "Submit"}</button>
    </div> : null}
    {canDelete ? <button type="button" className="secondary-command rv-delete" onClick={() => void remove()}>Delete this repair visit</button> : null}
  </section>;
}

function AddFields({ visitUuid, customerId, siteId, previous, existing, connected, onDone }: {
  visitUuid: string; customerId: string; siteId: string; previous: { kind: "service" | "repair"; visitId: string } | null; existing: ReadonlySet<string>;
  connected: boolean; onDone: () => void;
}) {
  const [fields, setFields] = useState<RepairCatalogField[]>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    loadCatalog(customerId, siteId, previous, connected).then(source => { if (active) setFields(source.fields); })
      .catch(caught => { if (active) setError(text(caught, "The field list could not be loaded.")); });
    return () => { active = false; };
  }, [customerId, siteId, previous?.kind, previous?.visitId, connected]);
  const available = useMemo(() => (fields ?? []).filter(field => !existing.has(identityKey(field.identity))), [fields, existing]);
  async function add() {
    setBusy(true); setError("");
    try { for (const field of available.filter(candidate => selected.has(identityKey(candidate.identity)))) await addItem(visitUuid, field); onDone(); }
    catch (caught) { setError(text(caught, "The fields could not be added.")); }
    finally { setBusy(false); }
  }
  return <div>
    {error ? <p className="rv-error" role="alert">{error}</p> : null}
    {!fields && !error ? <p role="status">Loading the field list…</p> : null}
    {fields && available.length === 0 ? <p role="status">Every field of this list is already on the repair visit.</p> : null}
    {available.length ? <RepairFieldPicker idPrefix="rv-add" fields={available} selected={selected} disabled={busy}
      onToggle={key => setSelected(current => { const next = new Set(current); if (!next.delete(key)) next.add(key); return next; })} /> : null}
    <div className="rv-actions">
      <button type="button" disabled={busy || selected.size === 0} onClick={() => void add()}>Add {selected.size || ""} selected</button>
      <button type="button" className="secondary-command" disabled={busy} onClick={onDone}>Cancel</button>
    </div>
  </div>;
}
