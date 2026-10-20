import { useEffect, useRef, useState } from "react";
import { liveQuery } from "dexie";
import { offersAddLocation, type LocationProposal } from "../manager/managerApi";
import { reviewerRoleLabel } from "../manager/roleAccess";
import { loadTechnicianLocationProposals, withdrawTechnicianLocationProposal } from "../referenceData/referenceDataApi";
import { currentWorkspaceUserId, localDatabase } from "../db/localDatabase";
import { SYNC_FINISHED_EVENT } from "../sync/syncEvents";
import { VisitReference } from "./VisitReference";
import "./technicianLocationProposal.css";
import type { InspectionJob } from "./jobTypes";
import { locationNameWarnings } from "../referenceData/locationNameWarnings";
import {
  discardTechnicianLocationProposal, heldLocationProposalMessage, listTechnicianLocationProposalDrafts, locationProposalWithdrawalRequestId, reviseTechnicianLocationProposal,
  isProposalHeldBehindPending, loadLatestAddLocationProposalDraft, loadTechnicianLocationProposalDraft, newAddLocationDraft, queueTechnicianLocationProposal,
  saveTechnicianLocationProposalDraft, syncPendingLocationProposals, type TechnicianLocationProposalDraft
} from "./technicianLocationProposalDraft";

/**
 * Names a brand-new customer location (e.g. a second physical FM200 system: "TNB Room"), reviewed by
 * a Supervisor/Admin. Deliberately lightweight -- no row count, no row content -- because a genuinely
 * new location has no real inspection data yet: that only exists once the NEXT visit (after approval)
 * actually fills in the location's form, at which point "Save as format" (inside
 * `Co2InspectionForm.tsx` / `Fm200InspectionForm.tsx`) captures the real content. Entry point on the
 * job screen (`TechnicianHome.tsx`), always available regardless of the customer's current locations.
 */
export function TechnicianLocationProposal({ job, actorUserId, canUseServer, onBack }: {
  job: InspectionJob;
  actorUserId: number;
  canUseServer: boolean;
  onBack: () => void;
}) {
  const eligibleSystems = job.configurationSnapshot.enabledSystems.filter(offersAddLocation);
  // The picked system is only a request: it counts only while THIS job still offers it. Route changes between
  // jobs reuse this component instance, so a system chosen for the previous job must never survive the switch.
  const [pickedSystemKey, setPickedSystemKey] = useState<string | undefined>(() => readPickedSystem(job.id));
  const systemKey = pickedSystemKey && eligibleSystems.some((system) => system.systemKey === pickedSystemKey)
    ? pickedSystemKey
    : eligibleSystems.length === 1 ? eligibleSystems[0]!.systemKey : undefined;
  const [loadedDraft, setDraft] = useState<TechnicianLocationProposalDraft>();
  // A draft loaded for another job/system (one render behind a route change) is not this screen's draft.
  const draft = loadedDraft && loadedDraft.jobId === job.id && loadedDraft.systemKey === systemKey ? loadedDraft : undefined;
  const [zoneChoice, setZoneChoice] = useState<"existing" | "new">("existing");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const customerId = job.configurationSnapshot.customer.id;
  const selectedSystem = eligibleSystems.find((system) => system.systemKey === systemKey);

  useEffect(() => {
    if (!systemKey) return;
    let active = true;
    setDraft(undefined); setError(""); setSaved(false); setZoneChoice("existing");
    const zoneKeys = eligibleSystems.find((system) => system.systemKey === systemKey)?.zones.map((zone) => zone.key) ?? [];
    void loadLatestAddLocationProposalDraft(job.id, systemKey).then((loaded) => {
      if (!active) return;
      let resumed = loaded;
      // A draft saved before the zone default existed can have neither zone: start it on the first zone.
      if (resumed && resumed.status === "Draft" && resumed.patch.kind === "add-location" && !resumed.patch.zoneKey && !resumed.patch.newZone && zoneKeys[0]) {
        resumed = { ...resumed, patch: { ...resumed.patch, zoneKey: zoneKeys[0] } };
      }
      const next = resumed ?? newAddLocationDraft(job.id, customerId, systemKey, zoneKeys);
      setZoneChoice(next.patch.kind === "add-location" && next.patch.newZone ? "new" : "existing");
      setDraft(next);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Location proposal draft could not be loaded."); });
    return () => { active = false; };
  }, [job.id, systemKey, customerId]);

  function persist(next: TechnicianLocationProposalDraft) {
    if (next.status !== "Draft") return;
    setDraft(next);
    setSaved(false);
    void saveTechnicianLocationProposalDraft(next).catch((reason) => setError(reason instanceof Error ? reason.message : "Location proposal draft could not be saved."));
  }

  function updatePatch(patch: Partial<Extract<TechnicianLocationProposalDraft["patch"], { kind: "add-location" }>>) {
    if (!draft || draft.patch.kind !== "add-location") return;
    persist({ ...draft, patch: { ...draft.patch, ...patch } });
  }

  async function submit() {
    if (!draft || saving || draft.status !== "Draft") return;
    setSaving(true); setError("");
    try {
      const pending = await queueTechnicianLocationProposal(draft);
      setDraft(pending);
      if (canUseServer && navigator.onLine) {
        await syncPendingLocationProposals(actorUserId);
        if (systemKey) setDraft((await loadTechnicianLocationProposalDraft(job.id, systemKey, pending.patch.locationKey)) ?? pending);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Location proposal could not be submitted."); }
    finally { setSaving(false); }
  }

  async function synchronize() {
    if (!draft) return;
    setSaving(true); setError("");
    try {
      await syncPendingLocationProposals(actorUserId);
      const refreshed = await loadTechnicianLocationProposalDraft(job.id, draft.systemKey, draft.patch.locationKey);
      if (refreshed) setDraft(refreshed);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Location proposal could not be synced."); }
    finally { setSaving(false); }
  }

  async function startAnother() {
    if (!systemKey) return;
    setSaving(true); setError("");
    try {
      const next = newAddLocationDraft(job.id, customerId, systemKey, selectedSystem?.zones.map((zone) => zone.key) ?? []);
      await saveTechnicianLocationProposalDraft(next); setDraft(next); setZoneChoice(next.patch.kind === "add-location" && next.patch.newZone ? "new" : "existing");
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "New location draft could not be saved."); }
    finally { setSaving(false); }
  }

  const locked = draft?.status !== "Draft";
  const patch = draft?.patch.kind === "add-location" ? draft.patch : undefined;
  const candidateZoneId = patch?.newZone?.key ?? selectedSystem?.zones.find((zone) => zone.key === patch?.zoneKey)?.id ?? null;
  const nameWarnings = selectedSystem && patch ? locationNameWarnings(
    [...selectedSystem.zones, ...(patch.newZone ? [patch.newZone] : [])],
    [...(selectedSystem.locations ?? []), { displayName: patch.displayName, zoneId: candidateZoneId }]
  ) : [];

  return <section className="manager-home technician-location-proposal" aria-labelledby="technician-location-proposal-title">
    <button type="button" className="secondary-command back-command" onClick={onBack}>Back to Service Visit</button>
    <div className="workspace-heading">
      <div>
        <p className="eyebrow">{job.configurationSnapshot.customer.displayName}</p>
        <h2 id="technician-location-proposal-title">Add a New Location</h2>
        <p>Name a location for Admin review. Once approved, it gets a form on your next visit.</p>
        {job.reference ? <p className="support-metadata">Visit <VisitReference job={job} /></p> : null}
      </div>
    </div>
    {eligibleSystems.length === 0 ? (
      <p className="empty-state">This service visit has no system that can take a new named location.</p>
    ) : <>
      <p className="offline-notice">You can enter, save and submit on this device without a connection. Requests sync when the server is available.</p>
      <label>1. Choose system<select value={systemKey ?? ""} onChange={(event) => { const value = event.target.value || undefined; setPickedSystemKey(value); rememberPickedSystem(job.id, value); }}>
        <option value="">Select a system…</option>
        {eligibleSystems.map((system) => <option key={system.systemKey} value={system.systemKey}>{system.displayName}</option>)}
      </select></label>
      {error ? <p className="form-message" role="alert">{error}</p> : null}
      {saved && !error ? <p role="status">Location draft saved on this device.</p> : null}
      {!systemKey ? null : !selectedSystem ? <p className="form-message" role="alert">This proposal cannot be opened: the selected system is not part of this service visit. Go back to the service visit and try again.</p>
      : !draft || !patch ? <p role="status">Loading…</p> : <>
        {isProposalHeldBehindPending(draft) ? (
          <div className="report-summary" role="status">
            <p>{draft.lastError}</p>
            <p>{heldLocationProposalMessage(draft, selectedSystem.displayName)}</p>
            <div className="inline-actions">
              <button type="button" className="secondary-command" disabled={saving} onClick={() => void startAnother()}>Add another location</button>
            </div>
          </div>
        ) : draft.status === "Pending" || draft.status === "Failed" ? (
          <div className="report-summary" role="status">
            <p>{draft.status === "Pending" ? "New location saved on this device, pending sync." : `Sync needs attention: ${draft.lastError ?? "Retry the original request."}`}</p>
            <div className="inline-actions">
              <button type="button" disabled={!canUseServer || saving} onClick={() => void synchronize()}>{saving ? "Syncing…" : "Retry Sync"}</button>
              <button type="button" className="secondary-command" disabled={saving} onClick={() => void startAnother()}>Add another location</button>
            </div>
          </div>
        ) : draft.status === "Synced" ? (
          <div className="report-summary" role="status">
            <p>New location submitted for review.</p>
            <div className="inline-actions">
              <button type="button" className="secondary-command" disabled={saving} onClick={() => void startAnother()}>Add another location</button>
            </div>
          </div>
        ) : <>
          <label>2. Location name<input maxLength={300} disabled={locked || saving}
            value={patch.displayName} onChange={(event) => updatePatch({ displayName: event.target.value })} /></label>
          <fieldset>
            <legend>3. Zone</legend>
            <label><input type="radio" name="zone-choice" checked={zoneChoice === "existing"} disabled={locked || saving || selectedSystem.zones.length === 0}
              onChange={() => { setZoneChoice("existing"); updatePatch({ zoneKey: selectedSystem.zones[0]?.key ?? null, newZone: null }); }} /> Existing zone</label>
            {zoneChoice === "existing" ? (
              selectedSystem.zones.length === 0
                ? <p className="empty-state">This system has no existing zones yet — name a new one below.</p>
                : <select aria-label="Existing zone" disabled={locked || saving} value={patch.zoneKey ?? ""} onChange={(event) => updatePatch({ zoneKey: event.target.value, newZone: null })}>
                    {selectedSystem.zones.map((zone) => <option key={zone.key} value={zone.key}>{zone.displayName}</option>)}
                  </select>
            ) : null}
            <label><input type="radio" name="zone-choice" checked={zoneChoice === "new"} disabled={locked || saving}
              onChange={() => { setZoneChoice("new"); updatePatch({ zoneKey: null, newZone: { key: patch.newZone?.key ?? crypto.randomUUID().replace(/-/g, "").slice(0, 12), displayName: "" } }); }} /> New zone</label>
            {zoneChoice === "new" ? (
              <label>Zone name<input maxLength={300} disabled={locked || saving} placeholder="Zone name" value={patch.newZone?.displayName ?? ""}
                onChange={(event) => updatePatch({ newZone: { key: patch.newZone?.key ?? crypto.randomUUID().replace(/-/g, "").slice(0, 12), displayName: event.target.value } })} /></label>
            ) : null}
          </fieldset>
          {nameWarnings.length > 0 ? <div className="offline-notice" role="status">
            <p>{nameWarnings.join(" ")}</p>
            <p>Compared with this visit's saved locations. Repeated names are allowed; consider a distinct name before submitting.</p>
          </div> : null}
          <div className="inline-actions proposal-actions">
            <button type="button" className="secondary-command" disabled={locked || saving} onClick={() => {
              setError(""); setSaved(false);
              void saveTechnicianLocationProposalDraft(draft).then(() => setSaved(true)).catch((reason) => setError(reason instanceof Error ? reason.message : "Draft could not be saved."));
            }}>Save Draft</button>
            <button type="button" disabled={locked || saving || !patch.displayName.trim() || (!patch.zoneKey && !patch.newZone?.displayName.trim())} onClick={() => void submit()}>{saving ? "Submitting…" : "Submit for Review"}</button>
          </div>
        </>}
      </>}
    </>}
    <VisitLocationRequests key={`${actorUserId}:${job.id}`} job={job} actorUserId={actorUserId} canUseServer={canUseServer}
      onDiscard={(id) => { if (draft?.id === id) void startAnother(); }} />
  </section>;
}


/** The system picked on this screen survives the screen being rebuilt by a connection change (this tab only). */
const pickedSystemStorageKey = (jobId: string) => `location-proposal-system:${jobId}`;
function readPickedSystem(jobId: string): string | undefined {
  try { return sessionStorage.getItem(pickedSystemStorageKey(jobId)) ?? undefined; } catch { return undefined; }
}
function rememberPickedSystem(jobId: string, systemKey: string | undefined) {
  try {
    if (systemKey) sessionStorage.setItem(pickedSystemStorageKey(jobId), systemKey);
    else sessionStorage.removeItem(pickedSystemStorageKey(jobId));
  } catch { /* the picker simply starts empty next time */ }
}

/** What the reviewer actually approved, when it differs from what was submitted. A zone this visit does not know
 *  (one that was created or chosen after the visit started) is not named; it is said to have been changed instead. */
function appliedPatchSummary(patch: LocationProposal["payload"], original: LocationProposal["payload"], zones: ReadonlyArray<{ key: string; displayName: string }>) {
  if (patch.kind === "update-format") return `${patch.rows.length} ${patch.rows.length === 1 ? "row" : "rows"} (changed by the reviewer)`;
  const zone = patch.newZone?.displayName ?? zones.find((candidate) => candidate.key === patch.zoneKey)?.displayName;
  if (zone) return `${patch.displayName} in ${zone}`;
  const zoneChanged = original.kind !== "add-location" || original.zoneKey !== patch.zoneKey || original.newZone !== null;
  return zoneChanged ? `${patch.displayName} (zone chosen by the reviewer)` : patch.displayName;
}

/** The first revision row with no location text, which neither the device nor the server accepts. */
function blankRevisionRow(draft: TechnicianLocationProposalDraft) {
  if (draft.patch.kind !== "update-format") return undefined;
  const index = draft.patch.rows.findIndex((row) => typeof row.locationText === "string" && !row.locationText.trim());
  return index < 0 ? undefined : { index, id: `revision-${index}-locationText`, message: `Enter a location for row ${index + 1} before saving or submitting.` };
}

function VisitLocationRequests({ job, actorUserId, canUseServer, onDiscard }: {
  job: InspectionJob; actorUserId: number; canUseServer: boolean; onDiscard: (id: string) => void;
}) {
  const [local, setLocal] = useState<TechnicianLocationProposalDraft[]>([]);
  const [outboxStatuses, setOutboxStatuses] = useState<Record<string, string>>({});
  const [heldTimes, setHeldTimes] = useState<Record<string, string>>({});
  const [server, setServer] = useState<LocationProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [fresh, setFresh] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState("");
  const [localError, setLocalError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState<TechnicianLocationProposalDraft>();
  const [confirmDiscard, setConfirmDiscard] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const connected = online && navigator.onLine && canUseServer && currentWorkspaceUserId() === actorUserId;

  useEffect(() => {
    const database = localDatabase;
    const subscription = liveQuery(() => database.transaction("r", database.drafts, database.syncOutbox, async () => {
      const drafts = await listTechnicianLocationProposalDrafts(job.id);
      const items = await database.syncOutbox.where("entityType").equals("technicianLocationProposal").toArray();
      return { drafts, statuses: Object.fromEntries(items.map((item) => [item.entityId, item.status])),
        times: Object.fromEntries(items.filter((item) => item.completedAt).map((item) => [item.entityId, item.completedAt!])) };
    })).subscribe({
      next: ({ drafts, statuses, times }) => { setLocal(drafts); setOutboxStatuses(statuses); setHeldTimes(times); setLocalError(""); },
      error: () => setLocalError("Saved requests could not be read. They have been preserved on this device.")
    });
    const changed = () => { generation.current++; setFresh(false); setOnline(navigator.onLine); setRefresh((n) => n + 1); };
    window.addEventListener("online", changed);
    window.addEventListener("offline", changed);
    window.addEventListener("focus", changed);
    window.addEventListener(SYNC_FINISHED_EVENT, changed);
    return () => {
      subscription.unsubscribe(); generation.current++;
      window.removeEventListener("online", changed); window.removeEventListener("offline", changed);
      window.removeEventListener("focus", changed); window.removeEventListener(SYNC_FINISHED_EVENT, changed);
    };
  }, [job.id]);

  useEffect(() => {
    const controller = new AbortController();
    const run = ++generation.current;
    setFresh(false); setError("");
    if (!connected) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    void loadTechnicianLocationProposals(job.id, controller.signal).then((result) => {
      if (controller.signal.aborted || generation.current !== run || currentWorkspaceUserId() !== actorUserId) return;
      if (result.proposals.some((p) => p.submittedByUserId !== actorUserId || p.customerId !== job.configurationSnapshot.customer.id)) throw new Error("Request ownership could not be verified.");
      setServer(result.proposals); setFresh(true);
      if (result.unreadable.length) setError("Some requests could not be read. Their decisions are unavailable.");
    }).catch((reason) => {
      if (!controller.signal.aborted && generation.current === run) { setFresh(false); setError(reason instanceof Error ? reason.message : "Request status could not be refreshed."); }
    }).finally(() => { if (!controller.signal.aborted && generation.current === run) setLoading(false); });
    return () => controller.abort();
  }, [job.id, actorUserId, connected, refresh]);

  const authoritative = fresh && connected;
  const shownServer = authoritative ? server : [];
  const localOnly = local.filter((draft) => !shownServer.some((proposal) => proposal.id === draft.id));
  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Request could not be updated."); }
    finally { setBusy(false); }
  }
  /** Typing a revision is local data entry: keep it on this device as it happens, like the main form does,
   *  so a screen refresh or connection change cannot lose it. */
  function editRevision(change: (current: TechnicianLocationProposalDraft) => TechnicianLocationProposalDraft) {
    if (!revision) return;
    const next = change(revision);
    setRevision(next);
    const blank = blankRevisionRow(next);
    if (blank) { setError(blank.message); return; }
    setError("");
    void saveTechnicianLocationProposalDraft(next).catch((reason) => setError(reason instanceof Error ? reason.message : "Revision could not be saved on this device."));
  }
  function requireRevisionLocations(draft: TechnicianLocationProposalDraft) {
    const blank = blankRevisionRow(draft);
    if (!blank) return;
    document.getElementById(blank.id)?.focus();
    throw new Error(blank.message);
  }
  async function revise(proposal: LocationProposal) {
    const next = reviseTechnicianLocationProposal({ ...proposal, patch: proposal.payload });
    await saveTechnicianLocationProposalDraft(next);
    setRevision(next);
  }
  return <section className="proposal-requests" aria-labelledby="visit-location-requests-title">
    <h3 id="visit-location-requests-title">Your location requests for this visit</h3>
    <button type="button" className="secondary-command" disabled={!connected || busy} onClick={() => { generation.current++; setFresh(false); setRefresh((n) => n + 1); }}>Refresh request status</button>
    {!authoritative ? <p className="offline-notice" role="status">Status needs a connection. Local delivery states are shown; review decisions and notes are unavailable until a successful refresh.</p> : null}
    {loading ? <div className="report-summary proposal-skeleton" role="status">Loading request statuses…</div> : null}
    {error || localError ? <p id="visit-location-requests-error" className="form-message" role="alert">{error || localError}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {!loading && !local.length && !shownServer.length ? <p className="empty-state">No location requests available for this visit{authoritative ? "." : " on this device. Connect to check for other requests."}</p> : null}
    <div className="job-card-list">
      {shownServer.map((proposal) => <article className="report-summary proposal-request-card" key={proposal.id}>
        <h4>{proposal.customerDisplayName}</h4>
        <p>{proposal.systemDisplayName ?? job.configurationSnapshot.enabledSystems.find((s) => s.systemKey === proposal.systemKey)?.displayName ?? "Inspection system"}</p>
        <p>{proposal.payload.kind === "add-location" ? `New location: ${proposal.payload.displayName}` : `Saved format: ${proposal.payload.rows.length} rows`}</p>
        <span className={`proposal-status proposal-status-${proposal.status}`}>{proposal.status === "approved" ? proposal.edited ? "Approved with changes" : "Approved" : proposal.status === "pending" ? "Pending review" : proposal.status === "rejected" ? "Rejected" : "Withdrawn"}</span>
        <dl className="job-facts"><div><dt>Submitted</dt><dd>{new Date(proposal.submittedAt).toLocaleString()}</dd></div>
          <div><dt>Visit</dt><dd>{proposal.jobReference ?? (job.reference ? <VisitReference job={job} /> : "This visit")}</dd></div></dl>
        {proposal.status === "withdrawn" ? <p>You withdrew this request.</p>
          : proposal.decision ? <p><strong>{reviewerRoleLabel(proposal.decision.decidedByRole)} note: </strong>{proposal.decision.note || "No note provided."}</p> : null}
        {proposal.status === "approved" && proposal.decision?.appliedPatch ? <p><strong>Approved as: </strong>{appliedPatchSummary(proposal.decision.appliedPatch, proposal.payload, job.configurationSnapshot.enabledSystems.find((s) => s.systemKey === proposal.systemKey)?.zones ?? [])}</p> : null}
        <div className="inline-actions">
          {proposal.status === "pending" ? <button type="button" className="secondary-command" disabled={busy || !authoritative} onClick={() => void act(async () => {
            const requestId = await locationProposalWithdrawalRequestId({ id: proposal.id, jobId: proposal.jobId,
              customerId: proposal.customerId, systemKey: proposal.systemKey, patch: proposal.payload });
            // Invalidate read-back before the POST; only a fresh GET can restore displayed decisions.
            generation.current++; setFresh(false);
            await withdrawTechnicianLocationProposal(proposal.id, requestId, actorUserId);
            setRefresh((n) => n + 1);
          })}>Withdraw</button> : null}
          {proposal.status === "rejected" || proposal.status === "withdrawn" ? <button type="button" disabled={busy} onClick={() => void act(() => revise(proposal))}>Revise and resubmit</button> : null}
        </div>
      </article>)}
      {localOnly.map((draft) => <article className="report-summary proposal-request-card" key={draft.id}>
        <h4>{job.configurationSnapshot.customer.displayName}</h4>
        <p>{job.configurationSnapshot.enabledSystems.find((s) => s.systemKey === draft.systemKey)?.displayName ?? "Inspection system"}</p>
        <p>{draft.patch.kind === "add-location" ? `New location: ${draft.patch.displayName || "Unnamed draft"}` : `Saved format: ${draft.patch.rows.length} rows`}</p>
        <span className="proposal-status">{outboxStatuses[draft.id] === "Syncing" ? "Syncing" : isProposalHeldBehindPending(draft) ? "Not sent — waiting for earlier review" : draft.status === "Synced" ? "Submitted; refresh for review status" : draft.status === "Draft" ? "Draft — saved on this device" : draft.status === "Pending" ? "Pending sync" : "Sync needs attention"}</span>
        {isProposalHeldBehindPending(draft) ? <p>{heldLocationProposalMessage(draft,
          job.configurationSnapshot.enabledSystems.find((s) => s.systemKey === draft.systemKey)?.displayName ?? "Inspection system",
          shownServer.find((p) => p.status === "pending" && p.systemKey === draft.systemKey && p.payload.locationKey === draft.patch.locationKey), heldTimes[draft.id])}</p> : draft.lastError ? <p>{draft.lastError}</p> : null}
        {draft.status === "Draft" && draft.revisionOf ? <button type="button" className="secondary-command" onClick={() => setRevision(draft)}>Continue revision</button> : null}
        {draft.status === "Pending" || draft.status === "Failed" ? <div className="inline-actions">
          {confirmDiscard === draft.id ? <><p>Remove this unsent request and its queue item from this device? This cannot be undone.</p>
            <button type="button" disabled={busy} onClick={() => void act(async () => { await discardTechnicianLocationProposal(draft); setConfirmDiscard(undefined); onDiscard(draft.id); })}>Confirm discard</button>
            <button type="button" className="secondary-command" onClick={() => setConfirmDiscard(undefined)}>Keep request</button></>
            : <button type="button" className="secondary-command" disabled={outboxStatuses[draft.id] === "Syncing"} onClick={() => setConfirmDiscard(draft.id)}>Discard before sync</button>}
        </div> : null}
      </article>)}
    </div>
    {revision ? <section className="report-summary proposal-revision" aria-label="Revise location request">
      <h4>Revise and resubmit</h4><p>Your original request stays unchanged. This revision has a new request reference.</p>
      {revision.patch.kind === "add-location" ? <>
        <label>Location name<input maxLength={300} value={revision.patch.displayName} onChange={(e) => {
          const value = e.target.value; editRevision((r) => r.patch.kind === "add-location" ? { ...r, patch: { ...r.patch, displayName: value } } : r);
        }} /></label>
        {revision.patch.newZone ? <label>Zone name<input maxLength={300} value={revision.patch.newZone.displayName} onChange={(e) => {
          const value = e.target.value; editRevision((r) => r.patch.kind === "add-location" && r.patch.newZone ? { ...r, patch: { ...r.patch, newZone: { ...r.patch.newZone, displayName: value } } } : r);
      }} /></label> : <label>Zone<select value={revision.patch.zoneKey ?? ""} onChange={(e) => {
          const value = e.target.value; editRevision((r) => r.patch.kind === "add-location" ? { ...r, patch: { ...r.patch, zoneKey: value } } : r);
        }}><option value="">Select a zone…</option>{job.configurationSnapshot.enabledSystems.find((s) => s.systemKey === revision.systemKey)?.zones.map((zone) => <option key={zone.key} value={zone.key}>{zone.displayName}</option>)}</select></label>}
      </> : revision.patch.rows.map((row, index) => <fieldset key={index}><legend>Row {index + 1}</legend>{Object.entries(row).map(([key, value]) => <label key={key}>{key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}{key === "drumType" ? <select name={`revision-${index}-${key}`} value={value} onChange={(e) => {
        const text = e.target.value; editRevision((r) => r.patch.kind === "update-format" ? { ...r, patch: { ...r.patch, rows: r.patch.rows.map((v, i) => i === index ? { ...v, [key]: text } : v) } } : r);
      }}><option value="">Not specified</option><option value="swing">Swing</option><option value="fixed">Fixed</option></select> : <input id={`revision-${index}-${key}`} aria-invalid={key === "locationText" && !value.trim()} aria-describedby={key === "locationText" && !value.trim() && error ? "visit-location-requests-error" : undefined} name={`revision-${index}-${key}`} autoComplete="off" maxLength={key === "assetReference" || key === "zoneText" ? 200 : revision.systemKey === "dry_wet_riser" && key === "locationText" ? 250 : 300} value={value} onChange={(e) => {
        const text = e.target.value; editRevision((r) => r.patch.kind === "update-format" ? { ...r, patch: { ...r.patch, rows: r.patch.rows.map((v, i) => i === index ? { ...v, [key]: text } : v) } } : r);
      }} />}</label>)}</fieldset>)}
      <div className="inline-actions proposal-actions">
        <button type="button" className="secondary-command" disabled={busy} onClick={() => void act(async () => { requireRevisionLocations(revision); await saveTechnicianLocationProposalDraft(revision); setNotice("Revision saved on this device."); })}>Save Draft</button>
        <button type="button" disabled={busy} onClick={() => void act(async () => {
          requireRevisionLocations(revision);
          await queueTechnicianLocationProposal(revision); setRevision(undefined);
          if (connected) await syncPendingLocationProposals(actorUserId);
          setRefresh((n) => n + 1);
        })}>Submit for Review</button>
      </div>
    </section> : null}
  </section>;
}
