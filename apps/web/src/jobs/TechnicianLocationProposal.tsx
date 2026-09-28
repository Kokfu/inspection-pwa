import { useEffect, useRef, useState } from "react";
import { locationConfigurableSystemKeys } from "../manager/managerApi";
import type { InspectionJob } from "./jobTypes";
import {
  loadTechnicianLocationProposalDraft, newTechnicianLocationProposalDraft, queueTechnicianLocationProposal,
  saveTechnicianLocationProposalDraft, syncPendingLocationProposals, type TechnicianLocationProposalDraft
} from "./technicianLocationProposalDraft";

type ZoneRow = { localId: string; key: string; displayName: string };
type LocationRow = { localId: string; key: string; displayName: string; zoneLocalId: string; presetRowCount: number };

function newRowKey() {
  const raw = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `k${Date.now()}${Math.random()}`;
  return raw.replace(/[^a-z0-9]/gi, "").slice(0, 12) || `k${Date.now()}`;
}

function rowsFromDraft(draft: TechnicianLocationProposalDraft): { zoneRows: ZoneRow[]; locationRows: LocationRow[] } {
  const zoneRows = draft.zones.map((zone) => ({ localId: zone.key, key: zone.key, displayName: zone.displayName }));
  const locationRows = draft.locations.map((location) => ({
    localId: newRowKey(), key: location.key, displayName: location.displayName,
    zoneLocalId: location.zoneKey, presetRowCount: location.presetRowCount
  }));
  return { zoneRows, locationRows };
}

function draftFieldsFromRows(zoneRows: ZoneRow[], locationRows: LocationRow[]) {
  return {
    zones: zoneRows.map((zone) => ({ key: zone.key, displayName: zone.displayName })),
    locations: locationRows.map((location) => ({
      key: location.key, displayName: location.displayName,
      zoneKey: zoneRows.find((zone) => zone.localId === location.zoneLocalId)?.key ?? "",
      presetRowCount: location.presetRowCount
    }))
  };
}

/**
 * Technician-drafted zone/location proposal for a customer's location-dependent system
 * (CO2 / Wet Chemical / FM200), reviewed by a Supervisor/Admin before it becomes the customer's
 * real configuration. Standalone: never wired into the live inspection form -- see
 * `technicianLocationProposalDraft.ts`'s design note. Entry point on the job screen
 * (`TechnicianHome.tsx`), always available regardless of the customer's current locations.
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
  const [zoneRows, setZoneRows] = useState<ZoneRow[]>([]);
  const [locationRows, setLocationRows] = useState<LocationRow[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const writes = useRef<Promise<void>>(Promise.resolve());

  const customerId = job.configurationSnapshot.customer.id;

  useEffect(() => {
    if (!systemKey) return;
    let active = true;
    setDraft(undefined); setError(""); setSaved(false);
    void loadTechnicianLocationProposalDraft(job.id, systemKey, customerId).then(async (loaded) => {
      if (!active) return;
      setDraft(loaded);
      const rows = rowsFromDraft(loaded);
      setZoneRows(rows.zoneRows); setLocationRows(rows.locationRows);
      if (canUseServer && navigator.onLine && (loaded.status === "Pending" || loaded.status === "Failed")) {
        await syncPendingLocationProposals(actorUserId);
        const refreshed = await loadTechnicianLocationProposalDraft(job.id, systemKey, customerId);
        if (active) setDraft(refreshed);
      }
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Location proposal draft could not be loaded."); });
    return () => { active = false; };
  }, [job.id, systemKey, customerId, actorUserId, canUseServer]);

  function persist(nextZoneRows: ZoneRow[], nextLocationRows: LocationRow[]) {
    if (!draft || draft.status !== "Draft") return;
    const next = { ...draft, ...draftFieldsFromRows(nextZoneRows, nextLocationRows) };
    setDraft(next);
    setSaved(false);
    writes.current = writes.current.catch(() => undefined).then(() => saveTechnicianLocationProposalDraft(next));
    void writes.current.catch((reason) => setError(reason instanceof Error ? reason.message : "Location proposal draft could not be saved."));
  }

  const addZone = () => { const next = [...zoneRows, { localId: newRowKey(), key: newRowKey(), displayName: "" }]; setZoneRows(next); persist(next, locationRows); };
  const renameZone = (localId: string, displayName: string) => {
    const next = zoneRows.map((zone) => zone.localId === localId ? { ...zone, displayName } : zone);
    setZoneRows(next); persist(next, locationRows);
  };
  const removeZone = (localId: string) => {
    const nextZones = zoneRows.filter((zone) => zone.localId !== localId);
    const nextLocations = locationRows.map((location) => location.zoneLocalId === localId ? { ...location, zoneLocalId: "" } : location);
    setZoneRows(nextZones); setLocationRows(nextLocations); persist(nextZones, nextLocations);
  };
  const addLocation = () => {
    const next = [...locationRows, { localId: newRowKey(), key: newRowKey(), displayName: "", zoneLocalId: zoneRows[0]?.localId ?? "", presetRowCount: 1 }];
    setLocationRows(next); persist(zoneRows, next);
  };
  const updateLocation = (localId: string, patch: Partial<LocationRow>) => {
    const next = locationRows.map((location) => location.localId === localId ? { ...location, ...patch } : location);
    setLocationRows(next); persist(zoneRows, next);
  };
  const removeLocation = (localId: string) => {
    const next = locationRows.filter((location) => location.localId !== localId);
    setLocationRows(next); persist(zoneRows, next);
  };

  async function synchronize() {
    setSaving(true); setError("");
    try {
      await syncPendingLocationProposals(actorUserId);
      if (systemKey) setDraft(await loadTechnicianLocationProposalDraft(job.id, systemKey, customerId));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Location proposal could not be synced."); }
    finally { setSaving(false); }
  }

  async function submit() {
    if (!draft || saving || draft.status !== "Draft") return;
    setSaving(true); setError("");
    try {
      await writes.current;
      const pending = await queueTechnicianLocationProposal(draft);
      setDraft(pending);
      if (canUseServer && navigator.onLine) {
        await syncPendingLocationProposals(actorUserId);
        if (systemKey) setDraft(await loadTechnicianLocationProposalDraft(job.id, systemKey, customerId));
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Location proposal could not be submitted."); }
    finally { setSaving(false); }
  }

  async function startNewProposal() {
    if (!systemKey) return;
    setSaving(true); setError("");
    try {
      const next = newTechnicianLocationProposalDraft(job.id, customerId, systemKey);
      await saveTechnicianLocationProposalDraft(next);
      setDraft(next);
      setZoneRows([]); setLocationRows([]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "New location proposal draft could not be saved."); }
    finally { setSaving(false); }
  }

  const locked = draft?.status !== "Draft";

  return <section aria-labelledby="technician-location-proposal-title">
    <button type="button" className="secondary-command back-command" onClick={onBack}>Back to Service Visit</button>
    <div className="workspace-heading">
      <div>
        <p className="eyebrow">{job.configurationSnapshot.customer.displayName}</p>
        <h2 id="technician-location-proposal-title">Propose Customer Locations</h2>
        <p>Draft the real zone/location breakdown you find on-site. A Supervisor or Admin reviews it before it becomes this customer's saved configuration.</p>
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
      {saved && !error ? <p role="status">Location proposal draft saved on this device.</p> : null}
      {!systemKey ? null : !draft ? <p role="status">Loading location proposal draft…</p> : <>
        {draft.status === "Pending" || draft.status === "Failed" ? (
          <div className="report-summary" role="status">
            <p>{draft.status === "Pending" ? "Location proposal saved on this device, pending sync." : `Location proposal sync needs attention: ${draft.lastError ?? "Retry the original request."}`}</p>
            <p>The submitted zones and locations are locked so retry uses the same request ID and payload.</p>
            <div className="inline-actions">
              <button type="button" disabled={!canUseServer || saving} onClick={() => void synchronize()}>{saving ? "Syncing…" : "Retry Sync"}</button>
            </div>
          </div>
        ) : draft.status === "Synced" ? (
          <div className="report-summary" role="status">
            <p>Location proposal submitted for review.</p>
            <div className="inline-actions">
              <button type="button" className="secondary-command" disabled={saving} onClick={() => void startNewProposal()}>Start a new proposal for this system</button>
            </div>
          </div>
        ) : <>
          <h4>Zones</h4>
          <ul className="manager-locations-zone-list">
            {zoneRows.map((zone) => (
              <li key={zone.localId}>
                <label>
                  <span className="manager-locations-label">Zone name</span>
                  <input aria-label={`Zone name for ${zone.key}`} maxLength={300} disabled={locked || saving}
                    value={zone.displayName} onChange={(event) => renameZone(zone.localId, event.target.value)} />
                </label>
                <button type="button" className="secondary-command" disabled={locked || saving} onClick={() => removeZone(zone.localId)}>Remove zone</button>
              </li>
            ))}
          </ul>
          <button type="button" disabled={locked || saving} onClick={addZone}>Add zone</button>
          <h4>Locations</h4>
          <ul className="manager-locations-location-list">
            {locationRows.map((location) => (
              <li key={location.localId}>
                <label>
                  <span className="manager-locations-label">Location name</span>
                  <input aria-label={`Location name for ${location.key}`} maxLength={300} disabled={locked || saving}
                    value={location.displayName} onChange={(event) => updateLocation(location.localId, { displayName: event.target.value })} />
                </label>
                <label>
                  <span className="manager-locations-label">Zone</span>
                  <select aria-label={`Zone for ${location.key}`} disabled={locked || saving}
                    value={location.zoneLocalId} onChange={(event) => updateLocation(location.localId, { zoneLocalId: event.target.value })}>
                    <option value="">Select…</option>
                    {zoneRows.map((zone) => <option key={zone.localId} value={zone.localId}>{zone.displayName || zone.key}</option>)}
                  </select>
                </label>
                <label>
                  <span className="manager-locations-label">Preset rows</span>
                  <input type="number" min={1} max={500} disabled={locked || saving}
                    aria-label={`Preset rows for ${location.key}`} value={location.presetRowCount}
                    onChange={(event) => updateLocation(location.localId, { presetRowCount: Math.trunc(Number(event.target.value)) || 1 })} />
                </label>
                <button type="button" className="secondary-command" disabled={locked || saving} onClick={() => removeLocation(location.localId)}>Remove location</button>
              </li>
            ))}
          </ul>
          <button type="button" disabled={locked || saving || zoneRows.length === 0} onClick={addLocation}>Add location</button>
          <div className="inline-actions">
            <button type="button" className="secondary-command" disabled={locked || saving} onClick={() => { if (draft) { writes.current = writes.current.catch(() => undefined).then(() => saveTechnicianLocationProposalDraft(draft)).then(() => { setError(""); setSaved(true); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Location proposal draft could not be saved.")); } }}>Save Draft</button>
            <button type="button" disabled={locked || saving || zoneRows.length === 0 || locationRows.length === 0} onClick={() => void submit()}>{saving ? "Submitting…" : "Submit for Review"}</button>
          </div>
        </>}
      </>}
    </>}
  </section>;
}
