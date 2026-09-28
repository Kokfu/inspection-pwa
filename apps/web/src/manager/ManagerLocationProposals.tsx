import { useEffect, useState } from "react";
import {
  decideLocationProposal, loadLocationProposals, ManagerApiError,
  type LocationProposal, type LocationProposalStatus
} from "./managerApi";

/**
 * Review inbox for technician-proposed customer zone/location breakdowns. Approve reuses the exact
 * write path a Manager's own "Zones & locations" edit performs (`applyManagerLocationsUpdate` on the
 * server); Reject is terminal and requires a note. Neither decision may be undone from here.
 */
export function ManagerLocationProposals({ onAuthorityFailure }: {
  onAuthorityFailure: (error: ManagerApiError) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<LocationProposalStatus>("pending");
  const [proposals, setProposals] = useState<LocationProposal[]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [note, setNote] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState("");

  const load = async (status: LocationProposalStatus) => {
    setLoading(true); setError("");
    try { setProposals(await loadLocationProposals(status)); }
    catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setError(reason instanceof Error ? reason.message : "Location proposals could not be loaded.");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(statusFilter); setSelectedId(undefined); setNote(""); setDecisionError(""); }, [statusFilter]);

  const selected = proposals?.find((proposal) => proposal.id === selectedId);

  async function decide(decision: "approved" | "rejected") {
    if (!selected || deciding) return;
    if (decision === "rejected" && note.trim().length < 3) {
      setDecisionError("A note of at least 3 characters is required to reject a proposal.");
      return;
    }
    setDeciding(true); setDecisionError("");
    try {
      await decideLocationProposal(selected.id, {
        requestId: crypto.randomUUID(), decision, ...(note.trim() ? { note: note.trim() } : {})
      });
      setNote(""); setSelectedId(undefined);
      await load(statusFilter);
    } catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setDecisionError(reason instanceof Error ? reason.message : "Decision could not be saved.");
    } finally { setDeciding(false); }
  }

  return <section aria-labelledby="manager-location-proposals-title">
    <div className="workspace-heading">
      <div>
        <p className="eyebrow">Review</p>
        <h2 id="manager-location-proposals-title">Location Proposals</h2>
        <p>Technician-drafted zone/location breakdowns awaiting review. Approve writes them as the customer's real, versioned configuration; Reject is terminal and requires a note.</p>
      </div>
    </div>
    <div className="job-tabs" role="tablist" aria-label="Location proposal status">
      {(["pending", "approved", "rejected"] as const).map((value) => <button
        key={value} type="button" role="tab" aria-selected={statusFilter === value}
        onClick={() => setStatusFilter(value)}
      >{value === "pending" ? "Pending" : value === "approved" ? "Approved" : "Rejected"}</button>)}
    </div>
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    {loading ? <p role="status">Loading location proposals…</p> : null}
    {!loading && proposals && proposals.length === 0 ? <p className="empty-state">No {statusFilter} location proposals.</p> : null}
    {proposals && proposals.length > 0 ? <ul className="record-list">
      {proposals.map((proposal) => (
        <li key={proposal.id}>
          <button type="button" onClick={() => { setSelectedId(proposal.id); setNote(""); setDecisionError(""); }}>
            <span className="navigation-primary">
              <strong>{proposal.customerDisplayName}</strong>
              <small>{proposal.systemKey} · {proposal.zoneCount} zone{proposal.zoneCount === 1 ? "" : "s"}, {proposal.locationCount} location{proposal.locationCount === 1 ? "" : "s"}</small>
            </span>
            <span className="support-metadata">Submitted by {proposal.submittedBy}</span>
          </button>
        </li>
      ))}
    </ul> : null}
    {selected ? <section className="report-summary" aria-labelledby="location-proposal-detail-title">
      <h3 id="location-proposal-detail-title">{selected.customerDisplayName} — {selected.systemKey}</h3>
      <dl className="job-facts">
        <div><dt>Submitted by</dt><dd>{selected.submittedBy}</dd></div>
        <div><dt>Submitted at</dt><dd>{selected.submittedAt}</dd></div>
        {selected.jobId ? <div><dt>Service visit</dt><dd>{selected.jobId}</dd></div> : null}
      </dl>
      <h4>Zones</h4>
      <ul className="manager-locations-zone-list">
        {selected.payload.zones.map((zone) => <li key={zone.key}><strong>{zone.displayName}</strong></li>)}
      </ul>
      <h4>Locations</h4>
      <ul className="manager-locations-location-list">
        {selected.payload.locations.map((location) => {
          const zone = selected.payload.zones.find((candidate) => candidate.key === location.zoneId);
          return <li key={location.key}>
            <strong>{location.displayName}</strong>
            <span>{zone?.displayName ?? location.zoneId}</span>
            <span>{location.presetRowCount} preset row{location.presetRowCount === 1 ? "" : "s"}</span>
          </li>;
        })}
      </ul>
      {selected.decision ? <div className="offline-notice" role="status">
        <p>{selected.decision.decision === "approved" ? "Approved" : "Rejected"} by {selected.decision.decidedBy} ({selected.decision.decidedByRole}) at {selected.decision.decidedAt}.</p>
        {selected.decision.note ? <p>{selected.decision.note}</p> : null}
      </div> : <>
        {decisionError ? <p className="form-message" role="alert">{decisionError}</p> : null}
        <label>Note (required to reject, optional to approve)
          <textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} disabled={deciding} />
        </label>
        <div className="inline-actions">
          <button type="button" disabled={deciding} onClick={() => void decide("approved")}>{deciding ? "Saving…" : "Approve"}</button>
          <button type="button" className="secondary-command" disabled={deciding} onClick={() => void decide("rejected")}>{deciding ? "Saving…" : "Reject"}</button>
          <button type="button" className="secondary-command" disabled={deciding} onClick={() => setSelectedId(undefined)}>Close</button>
        </div>
      </>}
    </section> : null}
  </section>;
}
