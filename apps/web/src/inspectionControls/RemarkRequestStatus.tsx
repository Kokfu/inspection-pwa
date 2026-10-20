import { useEffect, useRef, useState } from "react";
import { reviewerRoleLabel } from "../manager/roleAccess";
import { SYNC_FINISHED_EVENT } from "../sync/syncEvents";
import { discardRefusedRemarkRequest, loadRemarkRequestRows, onRemarkRequestsChanged, refreshOwnRemarkRequests, type RemarkRequestRow } from "./remarkRequests";
import { sectionDisplayLabel } from "./remarkSectionLabels";
import type { SectionRemarkSystemKey } from "./remarkSections";

const stateText: Record<RemarkRequestRow["state"], string> = {
  waiting: "Waiting to send", sending: "Sending", failed: "Not accepted", pending: "Waiting for approval", approved: "Approved", rejected: "Rejected"
};
const when = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

/**
 * R3 technician read-back (the counterpart of the location-proposal list in `TechnicianLocationProposal.tsx`): at the foot of the
 * Automatic Sprinkler form, every remark request this technician made for this customer, with its delivery state while it is
 * on this device and, once the server has it, the reviewer's decision and note. It never changes the visit text: a rejected
 * request only tells the technician that the wording is not offered to others.
 */
export function RemarkRequestStatus({ customerId, systemKey }: { customerId: string; systemKey: SectionRemarkSystemKey }) {
  const [rows, setRows] = useState<RemarkRequestRow[]>([]);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState<string>();
  const generation = useRef(0);

  useEffect(() => {
    let active = true;
    const load = () => {
      const run = ++generation.current;
      void loadRemarkRequestRows(customerId, systemKey).then((next) => { if (active && run === generation.current) { setRows(next); setError(""); } })
        .catch(() => { if (active && run === generation.current) { setRows([]); setError("Saved remark requests could not be read on this device."); } });
    };
    // Decisions live on the server: refresh them when a connection exists; the last good read-back stays visible otherwise.
    const refresh = () => {
      if (!navigator.onLine) { setStale(true); return; }
      void refreshOwnRemarkRequests().then(() => { if (active) setStale(false); }).catch(() => { if (active) setStale(true); });
    };
    load(); refresh();
    const unsubscribe = onRemarkRequestsChanged(load);
    window.addEventListener(SYNC_FINISHED_EVENT, refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false; unsubscribe();
      window.removeEventListener(SYNC_FINISHED_EVENT, refresh); window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh);
    };
  }, [customerId, systemKey]);

  if (rows.length === 0 && !error) return null;
  return <section className="remark-request-status" aria-labelledby="remark-request-status-title">
    <h3 id="remark-request-status-title">Your remark requests</h3>
    {stale ? <p className="offline-notice" role="status">Decisions need a connection. Showing what this device last received.</p> : null}
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    <ul className="remark-request-list">{rows.map((row) => <li key={row.id} className="remark-request-item">
      <strong>{sectionDisplayLabel(row.sectionKey, systemKey)}</strong>
      <p className="remark-request-wording">{row.wording}</p>
      <span className={`remark-request-state remark-request-state-${row.state}`}>{stateText[row.state]}</span>
      <small>Sent {when(row.createdAt)}{row.jobReference ? ` · Visit ${row.jobReference}` : ""}</small>
      {row.state === "failed" ? <p role="status">{row.error}</p> : null}
      {row.state === "approved" ? <p>{row.approvedWording && row.approvedWording !== row.wording ? `Approved as: ${row.approvedWording}. ` : ""}It is now offered in this row for every customer.</p> : null}
      {row.state === "rejected" ? <p><strong>{reviewerRoleLabel(row.reviewerRole)} note: </strong>{row.note || "No note provided."} Your visit keeps the text you typed.</p> : null}
      {row.state === "approved" && row.note ? <p><strong>{reviewerRoleLabel(row.reviewerRole)} note: </strong>{row.note}</p> : null}
      {row.state === "failed" ? <div className="remark-request-actions">
        {confirmDiscard === row.id
          ? <><button type="button" onClick={() => void discardRefusedRemarkRequest(row.id).then(() => setConfirmDiscard(undefined))}>Confirm remove</button>
            <button type="button" className="secondary-command" onClick={() => setConfirmDiscard(undefined)}>Keep request</button></>
          : <button type="button" className="secondary-command" onClick={() => setConfirmDiscard(row.id)}>Remove this request</button>}
      </div> : null}
    </li>)}</ul>
  </section>;
}
