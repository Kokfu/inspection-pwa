import { useEffect, useState } from "react";
import { locationConfigurableSystemKeys } from "../manager/managerApi";
import type { InspectionJob } from "./jobTypes";
import {
  loadTechnicianLocationProposalDraft, newAddLocationDraft, queueTechnicianLocationProposal,
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
  const eligibleSystems = job.configurationSnapshot.enabledSystems.filter((system) => locationConfigurableSystemKeys.has(system.systemKey));
  const [systemKey, setSystemKey] = useState<string | undefined>(eligibleSystems.length === 1 ? eligibleSystems[0]!.systemKey : undefined);
  const [draft, setDraft] = useState<TechnicianLocationProposalDraft>();
  const [zoneChoice, setZoneChoice] = useState<"existing" | "new">("existing");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const customerId = job.configurationSnapshot.customer.id;
  const selectedSystem = eligibleSystems.find((system) => system.systemKey === systemKey);

  useEffect(() => {
    if (!systemKey) return;
    let active = true;
    setDraft(undefined); setError(""); setSaved(false);
    const fresh = newAddLocationDraft(job.id, customerId, systemKey);
    void loadTechnicianLocationProposalDraft(job.id, systemKey, fresh.patch.locationKey).then(async (loaded) => {
      if (!active) return;
      setDraft(loaded ?? fresh);
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
    try { const next = newAddLocationDraft(job.id, customerId, systemKey); await saveTechnicianLocationProposalDraft(next); setDraft(next); setZoneChoice("existing"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "New location draft could not be saved."); }
    finally { setSaving(false); }
  }

  const locked = draft?.status !== "Draft";
  const patch = draft?.patch.kind === "add-location" ? draft.patch : undefined;

  return <section aria-labelledby="technician-location-proposal-title">
    <button type="button" className="secondary-command back-command" onClick={onBack}>Back to Service Visit</button>
    <div className="workspace-heading">
      <div>
        <p className="eyebrow">{job.configurationSnapshot.customer.displayName}</p>
        <h2 id="technician-location-proposal-title">Add a New Location</h2>
        <p>Name a location this customer has that isn't set up yet (e.g. a second FM200 system). A Supervisor or Admin reviews it; once approved, your next visit gets a real form for it.</p>
      </div>
    </div>
    {eligibleSystems.length === 0 ? (
      <p className="empty-state">This service visit has no zone/location-configurable systems (CO2, Wet Chemical, or FM200).</p>
    ) : <>
      <label>System<select value={systemKey ?? ""} onChange={(event) => setSystemKey(event.target.value || undefined)}>
        <option value="">Select a system…</option>
        {eligibleSystems.map((system) => <option key={system.systemKey} value={system.systemKey}>{system.displayName}</option>)}
      </select></label>
      {error ? <p className="form-message" role="alert">{error}</p> : null}
      {saved && !error ? <p role="status">Location draft saved on this device.</p> : null}
      {!systemKey ? null : !draft || !patch ? <p role="status">Loading…</p> : <>
        {draft.status === "Pending" || draft.status === "Failed" ? (
          <div className="report-summary" role="status">
            <p>{draft.status === "Pending" ? "New location saved on this device, pending sync." : `Sync needs attention: ${draft.lastError ?? "Retry the original request."}`}</p>
            <div className="inline-actions">
              <button type="button" disabled={!canUseServer || saving} onClick={() => void synchronize()}>{saving ? "Syncing…" : "Retry Sync"}</button>
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
          <label>Location name<input maxLength={300} disabled={locked || saving}
            value={patch.displayName} onChange={(event) => updatePatch({ displayName: event.target.value })} /></label>
          <fieldset>
            <legend>Zone</legend>
            <label><input type="radio" name="zone-choice" checked={zoneChoice === "existing"} disabled={locked || saving || selectedSystem!.zones.length === 0}
              onChange={() => { setZoneChoice("existing"); updatePatch({ zoneKey: selectedSystem!.zones[0]?.key ?? null, newZone: null }); }} /> Existing zone</label>
            {zoneChoice === "existing" ? (
              selectedSystem!.zones.length === 0
                ? <p className="empty-state">This system has no existing zones yet — name a new one below.</p>
                : <select disabled={locked || saving} value={patch.zoneKey ?? ""} onChange={(event) => updatePatch({ zoneKey: event.target.value, newZone: null })}>
                    {selectedSystem!.zones.map((zone) => <option key={zone.key} value={zone.key}>{zone.displayName}</option>)}
                  </select>
            ) : null}
            <label><input type="radio" name="zone-choice" checked={zoneChoice === "new"} disabled={locked || saving}
              onChange={() => { setZoneChoice("new"); updatePatch({ zoneKey: null, newZone: { key: patch.newZone?.key ?? crypto.randomUUID().replace(/-/g, "").slice(0, 12), displayName: "" } }); }} /> New zone</label>
            {zoneChoice === "new" ? (
              <input maxLength={300} disabled={locked || saving} placeholder="Zone name" value={patch.newZone?.displayName ?? ""}
                onChange={(event) => updatePatch({ newZone: { key: patch.newZone?.key ?? crypto.randomUUID().replace(/-/g, "").slice(0, 12), displayName: event.target.value } })} />
            ) : null}
          </fieldset>
          <div className="inline-actions">
            <button type="button" className="secondary-command" disabled={locked || saving} onClick={() => { setError(""); setSaved(true); }}>Save Draft</button>
            <button type="button" disabled={locked || saving || !patch.displayName.trim() || (!patch.zoneKey && !patch.newZone?.displayName.trim())} onClick={() => void submit()}>{saving ? "Submitting…" : "Submit for Review"}</button>
          </div>
        </>}
      </>}
    </>}
  </section>;
}
