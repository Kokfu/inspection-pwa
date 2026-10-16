import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { localDatabase } from "../db/localDatabase";
import { formatClientDateTime } from "../uiPresentation";
import { object, uuid } from "./repairContract";
import { compareAfterSource, compareBadge, NOT_DONE_PREFIX, parseNotDone, type CompareBadge, type NotDoneMarker } from "./repairPartState";
import { LocalAfter } from "./RepairPartView";
import { errorMessage, repairBeforePhotoState, repairContext } from "./repairRepository";
import { REPAIR_LIST_CACHE, repairServiceHref, repairUnitLabel, type RepairServiceSummary } from "./repairUiRepository";
import type { RepairAttachment, RepairFinding, RepairRecord } from "./repairTypes";

type Snapshot = { findings: RepairFinding[]; records: RepairRecord[]; photos: RepairAttachment[]; notDone: Map<string, NotDoneMarker>; service?: RepairServiceSummary };

function PlainPhoto({ blob, alt }: { blob: Blob; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => { const next = URL.createObjectURL(blob); setUrl(next); return () => URL.revokeObjectURL(next); }, [blob]);
  return url ? <img className="repair-compare-photo" src={url} alt={alt} /> : null;
}
function CompareBefore({ finding }: { finding: RepairFinding }) {
  const [state, setState] = useState("loading");
  const [blob, setBlob] = useState<Blob>();
  useEffect(() => {
    let active = true; setBlob(undefined); setState("loading");
    void repairBeforePhotoState(finding.findingId).then(v => { if (active) { setState(v.state); if (v.state === "cached") setBlob(v.photo.blob); } })
      .catch(() => { if (active) setState("corrupt"); });
    return () => { active = false; };
  }, [finding.findingId, finding.sourceFingerprint]);
  return blob ? <PlainPhoto blob={blob} alt="Original Before photo" />
    : <p>{state === "loading" ? "Checking original photo…" : state === "historical_absence" ? "Historical finding: no original Before photo."
      : state === "corrupt" ? "Original Before photo failed its integrity check." : "Original Before photo is not downloaded on this device."}</p>;
}

/** Technician comparison sheet. Built only from IndexedDB, so it works with no network. Print / Save as PDF uses the browser. */
export function RepairCompare({ actorId, jobId, systemKey }: { actorId: number; jobId: string; systemKey: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const valid = uuid(jobId) && /^[a-z0-9_]{1,80}$/.test(systemKey);
  useEffect(() => {
    // Lets the print stylesheet hide the app header and navigation for this page only.
    document.body.classList.add("print-repair-compare");
    return () => document.body.classList.remove("print-repair-compare");
  }, []);
  useEffect(() => {
    if (!valid) return;
    let active = true;
    const sub = liveQuery(async () => {
      const ctx = await repairContext(), db = localDatabase;
      const [findings, records, photos, cache, markerRows] = await Promise.all([
        db.repairFindings.toArray(), db.repairRecords.toArray(), db.repairAttachments.toArray(), db.referenceData.get(REPAIR_LIST_CACHE),
        db.referenceData.where("key").startsWith(NOT_DONE_PREFIX).toArray()
      ]);
      await ctx.assert();
      const notDone = new Map<string, NotDoneMarker>();
      for (const row of markerRows) {
        const findingId = row.key.slice(NOT_DONE_PREFIX.length), marker = parseNotDone(row.payload, actorId, findingId);
        if (marker) notDone.set(findingId, marker);
      }
      const services = cache && object(cache.payload) && Array.isArray(cache.payload.services) ? cache.payload.services as RepairServiceSummary[] : [];
      return { findings: findings.filter(f => f.original.jobId === jobId && f.original.systemKey === systemKey),
        records: records.filter(r => r.actorId === actorId && r.jobId === jobId && r.systemKey === systemKey), photos, notDone,
        service: services.find(s => s.jobId === jobId && s.systemKey === systemKey) } satisfies Snapshot;
    }).subscribe({ next(v) { if (active) setSnapshot(v); }, error(e) { if (active) setError(errorMessage(e)); } });
    return () => { active = false; sub.unsubscribe(); };
  }, [actorId, jobId, systemKey, valid]);

  if (!valid) return <section className="repair-page"><p role="alert">Invalid comparison link. Return to the Repair List.</p></section>;
  const first = snapshot?.findings[0];
  const sourceJob = snapshot?.service?.sourceJob ?? (first?.original.sourceJob as RepairServiceSummary["sourceJob"] | undefined);
  const customer = snapshot?.service?.customer ?? (first?.original.customer as RepairServiceSummary["customer"] | undefined);
  const site = snapshot?.service ? snapshot.service.site : (first?.original.site as RepairServiceSummary["site"] | undefined);
  const selected = snapshot?.findings.filter(f => !excluded.has(f.findingId)) ?? [];
  return <section className="repair-page repair-compare" aria-labelledby="repair-compare-title">
    <div className="no-print repair-compare-controls">
      <a className="repair-link" href={repairServiceHref(jobId, systemKey)}>Back to Repairs</a>
      <button type="button" disabled={!selected.length} onClick={() => window.print()}>Print / Save as PDF</button>
      <p>Built from this device only; no internet needed. Choose Save as PDF in the print dialog. Choose the parts to include:</p>
      <ul className="repair-compare-select">
        {snapshot?.findings.map(f => <li key={f.findingId}><label><input type="checkbox" checked={!excluded.has(f.findingId)}
          onChange={e => setExcluded(prev => { const next = new Set(prev); if (e.target.checked) next.delete(f.findingId); else next.add(f.findingId); return next; })} /> {repairUnitLabel(f)} · {String(f.original.fieldLabel)}</label></li>)}
      </ul>
    </div>
    <header><h2 id="repair-compare-title">Repair Comparison — Before / After</h2>
      {customer ? <p><strong>{customer.displayName}</strong>{site ? ` · ${site.displayName}` : ""}</p> : null}
      <p>{snapshot?.service?.systemLabel ?? String(first?.original.system ?? systemKey)} · Original visit {sourceJob?.reference ?? "unavailable"}{snapshot?.service?.visitDate ? ` · ${snapshot.service.visitDate}` : ""}</p>
      <p className="secondary-metadata">Printed from the technician device. Status reflects the last data stored on this device.</p>
    </header>
    {error ? <p role="alert" className="error-text">{error}</p> : !snapshot ? <p role="status">Loading from this device…</p>
      : !snapshot.findings.length ? <p>No parts are stored on this device for this service. Open the service online and use Download for Offline.</p>
        : !selected.length ? <p>No parts selected.</p> : null}
    {snapshot ? selected.map(f => {
      const records = snapshot.records.filter(r => r.findingId === f.findingId).sort((a, b) => b.cycleSequence - a.cycleSequence);
      const last = f.history.at(-1), marker = snapshot.notDone.get(f.findingId);
      const badge: CompareBadge = compareBadge(f, records);
      const after = compareAfterSource(f, records);
      const photo = after.kind === "local" && after.record.photoUuid ? snapshot.photos.find(p => p.photoUuid === after.record.photoUuid) : undefined;
      const afterRemark = after.kind === "local" ? after.record.remark : after.kind === "server" ? after.history.remark : undefined;
      return <article key={f.findingId} className="repair-compare-part" aria-label={`Comparison: ${String(f.original.fieldLabel)}`}>
        <h3>{repairUnitLabel(f)} · {String(f.original.sectionLabel ?? "")} — {String(f.original.fieldLabel)}</h3>
        <p><span className="repair-badge" data-badge={badge}>{badge}</span></p>
        <div className="repair-compare-columns">
          <section aria-label="Before (original visit)"><h4>Before — original visit</h4>
            <p>Original result: {f.original.result === "poor" ? "Poor" : "Not Good"}</p>
            <CompareBefore finding={f} />
            <p className="repair-remark">{f.original.remark ? `Original remark: ${f.original.remark}` : "No original remark recorded."}</p>
          </section>
          <section aria-label="After (latest repair)"><h4>After — latest repair</h4>
            {badge === "Not repaired" ? <>
              <p><strong>Not repaired</strong></p>
              <p className="repair-remark">{marker ? `Reason: ${marker.reason || "no reason given"} (${formatClientDateTime(marker.markedAt)})` : last?.review_state === "rejected" ? "The last repair was rejected and has not been redone." : "No repair has been recorded yet."}</p>
            </> : <>
              {photo ? <LocalAfter photo={photo} /> : <p>After photo is not stored on this device.</p>}
              <p className="repair-remark">{afterRemark ? `Repair remark: ${afterRemark}` : "No repair remark."}</p>
              {after.kind === "local" ? <p className="secondary-metadata">Cycle {after.record.cycleSequence} · {formatClientDateTime(after.record.performedAt)}</p>
                : after.kind === "server" ? <p className="secondary-metadata">Cycle {after.history.cycle_sequence} · {formatClientDateTime(after.history.performed_at)}</p> : null}
            </>}
          </section>
        </div>
      </article>;
    }) : null}
  </section>;
}
