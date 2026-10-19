import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { AuthUser } from "../../auth/authApi";
import { loadManagerCustomers, loadManagerTechnicians } from "../managerApi";
import { isManagerRole } from "../roleAccess";
import {
  approveRepairVisit, fetchRepairVisitPdf, loadRepairVisit, repairVisitAfterPhotoUrl, repairVisitBeforePhotoUrl, returnRepairVisit,
  RepairVisitsApiError, type RepairVisitDetail, type RepairVisitPdfKind
} from "../repairVisitsApi";
import type { RepairVisitItem } from "../../repairVisits/repairVisitTypes";
import { formatVisitDate, previousVisitSummary, resultLabel, statusLabel, statusTone } from "./repairVisitLabels";
import "./repairVisitReview.css";

type Names = { customer: string; site: string; technician: string };
type Load = { phase: "loading" } | { phase: "failed"; message: string } | { phase: "ready"; detail: RepairVisitDetail; names: Names };

export type RepairVisitReviewProps = {
  visitId: string;
  /** Verified role from /auth/me. Technicians get a refusal screen and no request is made. */
  role: AuthUser["role"];
  onBack: () => void;
  /** Called for a 401/403 so the app can re-verify authority (same contract as the other manager screens). */
  onAuthorityFailure?: (error: unknown) => void;
  /** Called after an approve/return was confirmed by the server so lists can refresh. */
  onDecided?: (event: "approved" | "returned") => void;
};

const MAX_REASON = 4000;

/** `noopener` in the feature string makes window.open return null even on success, so detach afterwards. */
function openDetached(url: string): boolean {
  const opened = window.open(url, "_blank");
  if (!opened) return false;
  opened.opener = null;
  return true;
}

/** A stable operation UUID per intent: an unknown-outcome retry reuses it, a changed intent gets a new one. */
function useOperationUuid() {
  const current = useRef<{ key: string; uuid: string } | null>(null);
  return (key: string) => {
    if (current.current?.key !== key) current.current = { key, uuid: crypto.randomUUID() };
    return current.current.uuid;
  };
}

export function RepairVisitReview({ visitId, role, onBack, onAuthorityFailure, onDecided }: RepairVisitReviewProps) {
  const allowed = isManagerRole(role);
  if (!allowed) return <RepairVisitNoAccess onBack={onBack} />;
  return <ReviewScreen visitId={visitId} onBack={onBack} onAuthorityFailure={onAuthorityFailure} onDecided={onDecided} />;
}

function RepairVisitNoAccess({ onBack }: { onBack: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <section className="rv-review" aria-labelledby="rv-noaccess-title">
      <div ref={ref} tabIndex={-1} role="alert" className="mrv-banner mrv-banner--error">
        <h2 id="rv-noaccess-title">Repair review is not available</h2>
        <p>Repair visit review is only available to Admin and Manager accounts.</p>
      </div>
      <button type="button" className="secondary-command" onClick={onBack}>Back</button>
    </section>
  );
}

function ReviewScreen({ visitId, onBack, onAuthorityFailure, onDecided }: Omit<RepairVisitReviewProps, "role">) {
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [error, setError] = useState<{ id: number; message: string } | null>(null);
  const [busy, setBusy] = useState<null | "approve" | "return" | "preview" | "final">(null);
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [notice, setNotice] = useState("");
  const [popupBlockedUrl, setPopupBlockedUrl] = useState<string | null>(null);
  const operationUuid = useOperationUuid();
  const errorRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const failedRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const requestId = useRef(0);
  const objectUrls = useRef<string[]>([]);
  const reasonId = useId();
  const reasonErrorId = useId();

  const handleFailure = useCallback((caught: unknown): string => {
    if (caught instanceof RepairVisitsApiError) {
      if (caught.kind === "authorization") onAuthorityFailure?.(caught);
      return caught.message;
    }
    return "Repair visit data is currently unavailable. Check the connection and try again.";
  }, [onAuthorityFailure]);

  /** Refresh is authoritative: on any failure the previous detail is dropped, never shown as current. */
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const id = ++requestId.current;
    setLoad({ phase: "loading" });
    try {
      const [detail, customers, technicians] = await Promise.all([
        loadRepairVisit(visitId, signal), loadManagerCustomers(signal), loadManagerTechnicians(signal)
      ]);
      if (signal?.aborted || id !== requestId.current) return;
      const customer = customers.find(row => row.customer.id === detail.visit.customerId);
      const site = customer?.sites.find(row => row.id === detail.visit.siteId);
      const technician = technicians.find(row => row.id === detail.visit.createdByUserId);
      setLoad({ phase: "ready", detail, names: {
        customer: customer?.customer.displayName ?? "Unknown customer",
        site: site?.displayName ?? "Unknown site",
        technician: technician ? technician.displayName || technician.username : `Unknown technician (ID ${detail.visit.createdByUserId})`
      } });
    } catch (caught) {
      if (signal?.aborted || id !== requestId.current || (caught instanceof DOMException && caught.name === "AbortError")) return;
      setLoad({ phase: "failed", message: handleFailure(caught) });
    }
  }, [visitId, handleFailure]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => { controller.abort(); requestId.current += 1; };
  }, [refresh]);

  useEffect(() => () => { objectUrls.current.forEach(url => URL.revokeObjectURL(url)); objectUrls.current = []; }, []);

  // Focus follows the outcome: errors first, then the loaded heading, so keyboard and screen-reader users land on the news.
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (load.phase === "failed") failedRef.current?.focus(); }, [load]);
  useEffect(() => { if (load.phase === "ready" && !error) titleRef.current?.focus({ preventScroll: true }); }, [load.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (confirmingApprove) confirmRef.current?.focus(); }, [confirmingApprove]);

  const fail = (caught: unknown) => setError(previous => ({ id: (previous?.id ?? 0) + 1, message: handleFailure(caught) }));

  const openPdf = async (kind: RepairVisitPdfKind, revision: number) => {
    setBusy(kind); setError(null); setNotice(""); setPopupBlockedUrl(null);
    try {
      const blob = await fetchRepairVisitPdf(visitId, revision, kind);
      const url = URL.createObjectURL(blob);
      objectUrls.current.push(url);
      if (kind === "final") {
        const link = document.createElement("a");
        link.href = url; link.download = "repair-visit-report.pdf"; link.rel = "noopener";
        document.body.append(link); link.click(); link.remove();
        setNotice("Final report download started.");
      } else if (!openDetached(url)) {
        setPopupBlockedUrl(url);
        setNotice("Preview ready. Use the link below to open it.");
      } else setNotice("Preview PDF opened in a new tab. It is marked PREVIEW — NOT APPROVED.");
    } catch (caught) { fail(caught); } finally { setBusy(null); }
  };

  const decide = async (detail: RepairVisitDetail, kind: "approve" | "return") => {
    const revision = detail.visit.revision;
    setBusy(kind); setError(null); setNotice("");
    try {
      if (kind === "approve") {
        await approveRepairVisit(visitId, { operationUuid: operationUuid(`approve:${revision}`), expectedRevision: revision });
      } else {
        const trimmed = reason.trim();
        await returnRepairVisit(visitId, { operationUuid: operationUuid(`return:${revision}:${trimmed}`), expectedRevision: revision, reason: trimmed });
      }
      setConfirmingApprove(false); setReason("");
      setNotice(kind === "approve" ? "Repair visit approved. The report number has been issued." : "Repair visit returned to the technician.");
      onDecided?.(kind === "approve" ? "approved" : "returned");
      await refresh();
    } catch (caught) { fail(caught); } finally { setBusy(null); }
  };

  const submitReturn = (detail: RepairVisitDetail) => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError("Enter the reason for returning this visit to the technician.");
      reasonRef.current?.focus();
      return;
    }
    if (trimmed.length > MAX_REASON) {
      setReasonError(`The reason must be ${MAX_REASON} characters or fewer.`);
      reasonRef.current?.focus();
      return;
    }
    setReasonError("");
    void decide(detail, "return");
  };

  if (load.phase === "loading") {
    return (
      <section className="rv-review" aria-busy="true" aria-labelledby="rv-loading-title">
        <h2 id="rv-loading-title" className="rv-visually-hidden">Loading repair visit</h2>
        <p role="status" className="operational-message">Loading repair visit…</p>
        <div className="rv-skeleton" aria-hidden="true" />
      </section>
    );
  }
  if (load.phase === "failed") {
    return (
      <section className="rv-review" aria-labelledby="rv-failed-title">
        <div ref={failedRef} tabIndex={-1} role="alert" className="mrv-banner mrv-banner--error">
          <h2 id="rv-failed-title">Repair visit could not be refreshed</h2>
          <p>{load.message}</p>
          <p>Nothing is shown until the latest version loads. No approval or return can be made from old data.</p>
        </div>
        <div className="rv-actions-row">
          <button type="button" onClick={() => { setError(null); void refresh(); }}>Try again</button>
          <button type="button" className="secondary-command" onClick={onBack}>Back</button>
        </div>
      </section>
    );
  }

  const { detail, names } = load;
  const { visit, items, events } = detail;
  const returnedEvent = [...events].reverse().find(event => event.type === "returned");
  const awaiting = visit.status === "awaiting_approval";

  return (
    <section className="rv-review" aria-labelledby="rv-title">
      <button type="button" className="secondary-command mrv-back" onClick={onBack}>← Back</button>
      <header className="mrv-header">
        <h2 id="rv-title" ref={titleRef} tabIndex={-1}>Repair visit {visit.visitNumber}</h2>
        <span className={`status-badge status-badge--${statusTone[visit.status]}`}>{statusLabel[visit.status]}</span>
        <dl className="rv-facts">
          <div><dt>Customer</dt><dd>{names.customer}</dd></div>
          <div><dt>Site</dt><dd>{names.site}</dd></div>
          <div><dt>RV number</dt><dd>{visit.visitNumber}</dd></div>
          <div><dt>Technician</dt><dd>{names.technician}</dd></div>
          <div><dt>Date</dt><dd>{formatVisitDate(visit.visitDate)}, arrived {visit.arrivalTime}</dd></div>
          <div><dt>Previous visit</dt><dd>{previousVisitSummary(visit, items.map(item => item.before))}</dd></div>
          {visit.serviceCallNumber ? <div><dt>Service call no.</dt><dd>{visit.serviceCallNumber}</dd></div> : null}
          {visit.reportNumber ? <div><dt>Report no.</dt><dd>{visit.reportNumber}</dd></div> : null}
        </dl>
      </header>

      {error ? (
        <div ref={errorRef} tabIndex={-1} role="alert" className="mrv-banner mrv-banner--error">
          <p>{error.message}</p>
          <button type="button" className="secondary-command" onClick={() => { setError(null); void refresh(); }}>Refresh visit</button>
        </div>
      ) : null}
      {notice ? <p role="status" className="mrv-banner mrv-banner--ok">{notice}</p> : null}
      {popupBlockedUrl ? <p><a href={popupBlockedUrl} target="_blank" rel="noopener">Open preview PDF</a></p> : null}

      {visit.status === "returned" ? (
        <div className="mrv-banner mrv-banner--warn">
          <strong>Returned to the technician.</strong>
          {returnedEvent?.reason ? <p>Reason: {returnedEvent.reason}</p> : null}
          <p>It can be reviewed again after the technician resubmits.</p>
        </div>
      ) : null}
      {visit.status === "draft" ? <p className="operational-message">The technician has not submitted this visit yet.</p> : null}

      <ol className="mrv-items" aria-label="Repair fields">
        {items.map((item, index) => <RepairItemCard key={item.clientUuid} item={item} index={index} visit={visit} />)}
      </ol>

      {awaiting ? (
        <div className="rv-decision" role="group" aria-label="Review decision">
          <div className="rv-actions-row">
            <button type="button" className="secondary-command" disabled={busy !== null} onClick={() => void openPdf("preview", visit.revision)}>
              {busy === "preview" ? "Preparing preview…" : "Preview PDF"}
            </button>
          </div>
          <p className="rv-hint">The preview is marked PREVIEW — NOT APPROVED and has no report number.</p>

          <div className="rv-return">
            <label htmlFor={reasonId}>Reason for returning to the technician (required to return)</label>
            <textarea
              id={reasonId} ref={reasonRef} value={reason} rows={4} maxLength={MAX_REASON + 1}
              aria-required="true" aria-invalid={reasonError ? true : undefined} aria-describedby={reasonError ? reasonErrorId : undefined}
              onChange={event => { setReason(event.target.value); if (reasonError) setReasonError(""); }}
            />
            {reasonError ? <p id={reasonErrorId} className="rv-field-error" role="alert">{reasonError}</p> : null}
            <button type="button" className="danger-command" disabled={busy !== null} onClick={() => submitReturn(detail)}>
              {busy === "return" ? "Returning…" : "Return to technician"}
            </button>
          </div>

          {confirmingApprove ? (
            <div className="rv-confirm" role="group" aria-label="Confirm approval">
              <p>Approve this repair visit? A report number is issued and the visit is locked. This cannot be undone.</p>
              <div className="rv-actions-row">
                <button type="button" ref={confirmRef} disabled={busy !== null} onClick={() => void decide(detail, "approve")}>
                  {busy === "approve" ? "Approving…" : "Confirm approval"}
                </button>
                <button type="button" className="secondary-command" disabled={busy !== null} onClick={() => setConfirmingApprove(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" className="rv-approve" disabled={busy !== null} onClick={() => { setError(null); setConfirmingApprove(true); }}>Approve</button>
          )}
        </div>
      ) : null}

      {visit.status === "approved" ? (
        <div className="rv-decision">
          <p>Approved{visit.reportNumber ? ` as ${visit.reportNumber}` : ""}{visit.approvedAt ? ` on ${formatVisitDate(visit.approvedAt.slice(0, 10))}` : ""}. The visit is locked.</p>
          <button type="button" disabled={busy !== null} onClick={() => void openPdf("final", visit.revision)}>
            {busy === "final" ? "Preparing download…" : "Download final PDF"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function RepairItemCard({ item, index, visit }: { item: RepairVisitItem; index: number; visit: RepairVisitDetail["visit"] }) {
  const headingId = useId();
  const { before } = item;
  return (
    <li className="mrv-item" aria-labelledby={headingId}>
      <h3 id={headingId}>
        <span className="mrv-item-no">{index + 1}.</span> {item.systemLabel} › {item.unitLabel} › {item.sectionLabel} › {item.fieldLabel}
      </h3>
      <div className="rv-panels">
        <section className="mrv-panel" aria-label={`Before, ${item.fieldLabel}`}>
          <h4>Before</h4>
          {before ? (
            <>
              <p className="rv-source">{before.visitNumber} · {formatVisitDate(before.visitDate)}</p>
              <p><span className="mrv-label">Result</span> <strong className={`rv-result${before.result === "not_good" || before.result === "not_done" ? " rv-result--bad" : ""}`}>{resultLabel(before.result)}</strong></p>
              {before.photo && visit.previousVisit
                ? <Photo src={repairVisitBeforePhotoUrl(visit.customerId, visit.siteId, before.previousVisit, before.photo.photoUuid)} alt={`Before photo, ${item.fieldLabel}`} width={before.photo.width} height={before.photo.height} />
                : <p className="mrv-empty">No photo recorded at previous visit</p>}
              <p className="rv-remark"><span className="mrv-label">Remark</span> {before.remark || "No remark recorded"}</p>
            </>
          ) : <p className="mrv-empty">No previous visit</p>}
        </section>
        <section className="mrv-panel" aria-label={`After repair, ${item.fieldLabel}`}>
          <h4>After repair</h4>
          <p className="rv-source">{visit.visitNumber} · {formatVisitDate(visit.visitDate)}</p>
          <p><span className="mrv-label">Result</span> <strong className={`rv-result${item.outcome === "not_done" ? " rv-result--bad" : ""}`}>{resultLabel(item.outcome)}</strong></p>
          {item.photoUuid
            ? <Photo src={repairVisitAfterPhotoUrl(visit.clientUuid, item.photoUuid)} alt={`After photo, ${item.fieldLabel}`} />
            : <p className="mrv-empty">No photo submitted</p>}
          <p className="rv-remark"><span className="mrv-label">Repair remark</span> {item.remark || "No remark recorded"}</p>
        </section>
      </div>
    </li>
  );
}

function Photo({ src, alt, width, height }: { src: string; alt: string; width?: number; height?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="mrv-empty" role="status">Photo could not be loaded</p>;
  return (
    <a className="mrv-photo" href={src} target="_blank" rel="noopener" aria-label={`Open full size: ${alt}`}>
      <img src={src} alt={alt} loading="lazy" decoding="async" width={width} height={height} onError={() => setFailed(true)} />
    </a>
  );
}
