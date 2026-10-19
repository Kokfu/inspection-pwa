import { createHash } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import type { Pool, PoolClient } from "pg";
import type { CurrentUser } from "../auth/authTypes.js";
import { loadConfig } from "../config/env.js";
import { moveNormalizedAttachment, normalizeAttachmentImage } from "../attachments/attachmentStorage.js";
import { readBeforeBytes } from "./fieldCatalogSource.js";
import { catalogActor } from "./previousVisits.js";
import { readCurrentConfigurationCatalog, readPreviousVisitCatalog, type CatalogField } from "./fieldCatalog.js";
import { parseRepairVisit, parseRepairVisitItem, parseRepairVisitEvent, type RepairVisitPrevious, type RepairVisitFieldIdentity } from "./repairVisitContract.js";
import { parseCreate, parseSubmit, parsePhoto, parseDecision, keys, uuid, positive, fingerprint, fieldKey, refuse } from "./repairVisitWriteContract.js";
import { buildRepairVisitReport } from "./repairVisitReportAuthority.js";
import { renderRepairVisitReportPdf } from "./report/repairVisitReportPdf.js";

export type Database = Pick<Pool, "connect">;
export type VisitRow = {
  client_uuid: string; visit_number: string; customer_id: string; site_id: string; created_by_user_id: string;
  configuration_revision_id: string; service_call_number: string | null; arrival_time: string; visit_date: Date | string;
  created_on_device_at: Date; previous_visit_kind: "service" | "repair" | null; previous_service_visit_id: string | null;
  previous_repair_visit_id: string | null; status: string; revision: number; request_fingerprint: string;
  report_number: string | null; approved_by_user_id: string | null; approved_at: Date | null;
  final_pdf: Buffer | null; final_pdf_sha256: string | null;
  created_at: Date; updated_at: Date;
};
export const day = (v: Date | string) => v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,"0")}-${String(v.getDate()).padStart(2,"0")}` : v.slice(0,10);
export const malaysiaDay = (v: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(v);
export const previousOf = (v: VisitRow): RepairVisitPrevious | null => v.previous_visit_kind
  ? { kind: v.previous_visit_kind, visitId: (v.previous_visit_kind === "service" ? v.previous_service_visit_id : v.previous_repair_visit_id)! } : null;
export async function transaction<T>(database: Database, work: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await database.connect();
  try { await db.query("BEGIN"); const result = await work(db); await db.query("COMMIT"); return result; }
  catch (e) {
    await db.query("ROLLBACK");
    if (typeof e === "object" && e !== null && "code" in e && ["23505", "40001", "40P01"].includes(String(e.code))) return refuse("WRITE_CONFLICT");
    throw e;
  } finally { db.release(); }
}
export async function lockedVisit(db: PoolClient, actor: CurrentUser, id: string, technician = false): Promise<VisitRow> {
  uuid(id); await catalogActor(db, actor);
  if (technician && actor.role !== "inspector") return refuse("FORBIDDEN", 403);
  const v = (await db.query<VisitRow>("SELECT * FROM repair_visits WHERE client_uuid=$1 FOR UPDATE", [id])).rows[0];
  if (!v) return refuse("VISIT_NOT_YET_CREATED", 404);
  if ((technician || actor.role === "inspector") && Number(v.created_by_user_id) !== actor.id) return refuse("FORBIDDEN", 403);
  return v;
}
export async function audit(db: PoolClient, actor: CurrentUser, action: string, id: string, fp: string) {
  await db.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,result,reason) VALUES($1,$2,'repair_visit',$3,'success',$4)", [actor.id, action, id, fp]);
}
async function configuration(db: PoolClient, customer: string, site: string, revision: string) {
  const c = (await db.query("SELECT is_active FROM customers WHERE id=$1 FOR SHARE", [customer])).rows[0];
  if (!c) return refuse("CUSTOMER_NOT_FOUND", 404);
  if (!c.is_active) return refuse("CUSTOMER_INACTIVE");
  const s = (await db.query("SELECT is_active FROM customer_sites WHERE id=$1 AND customer_id=$2 FOR SHARE", [site, customer])).rows[0];
  if (!s?.is_active) return refuse("SITE_INACTIVE");
  const r = (await db.query(`SELECT r.id FROM customer_configuration_revisions r JOIN master_service_report_templates t ON t.id=r.template_version_id
    WHERE r.customer_id=$1 AND r.status='active' AND t.version=7 FOR SHARE OF r`, [customer])).rows[0];
  if (!r || r.id !== revision) return refuse("CONFIGURATION_CHANGED");
}
async function catalog(db: PoolClient, actor: CurrentUser, v: { customer_id: string; site_id: string; previous: RepairVisitPrevious | null }) {
  if (v.previous) {
    if (v.previous.kind === "service") {
      // Share the writers' locks before checking approval or reading effective
      // responses. A correction to any form invalidates the visit's approval.
      await db.query("SELECT pg_advisory_xact_lock(hashtext('report_approvals:' || $1))", [v.previous.visitId]);
      const forms = await db.query<{ id: string }>(`SELECT f.id FROM master_system_form_instances f
        JOIN master_system_inspections p ON p.id=f.inspection_group_id WHERE p.job_id=$1 ORDER BY f.id`, [v.previous.visitId]);
      for (const form of forms.rows) {
        await db.query("SELECT pg_advisory_xact_lock(hashtext('inspection_corrections:' || $1))", [form.id]);
      }
    }
    // Always enforce the technician owner even when an admin reads for review.
    const fields = await readPreviousVisitCatalog(db, actor, v.customer_id, v.site_id, v.previous);
    return fields;
  }
  return (await readCurrentConfigurationCatalog(db, actor, v.customer_id, v.site_id)).fields;
}
function selected(fields: CatalogField[], items: { clientUuid: string; identity: RepairVisitFieldIdentity }[]) {
  const map = new Map(fields.map(f => [fieldKey(f.identity), f]));
  return items.map(i => { const f = map.get(fieldKey(i.identity)); if (!f) return refuse("FIELD_NOT_AVAILABLE"); return f; });
}
function createReceipt(v: VisitRow) {
  return { clientUuid: v.client_uuid, visitNumber: v.visit_number, configurationRevisionId: v.configuration_revision_id,
    deviceCreatedAt: v.created_on_device_at.toISOString(), visitDate: day(v.visit_date), arrivalTime: v.arrival_time.slice(0,5), requestFingerprint: v.request_fingerprint };
}
async function upsertItem(db: PoolClient, visit: string, id: string, field: CatalogField, sort: number, outcome: string | null, remark: string) {
  const i = field.identity;
  const existing = (await db.query("SELECT visit_uuid FROM repair_visit_items WHERE client_uuid=$1", [id])).rows[0];
  if (existing && existing.visit_uuid !== visit) return refuse("IDEMPOTENCY_CONFLICT");
  const saved = await db.query(`INSERT INTO repair_visit_items(client_uuid,visit_uuid,system_key,row_uuid,location_id,zone_id,section_key,field_key,
    system_label,unit_label,section_label,field_label,before_snapshot,outcome,remark,sort_order)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    ON CONFLICT(client_uuid) DO UPDATE SET system_key=EXCLUDED.system_key,row_uuid=EXCLUDED.row_uuid,location_id=EXCLUDED.location_id,
    zone_id=EXCLUDED.zone_id,section_key=EXCLUDED.section_key,field_key=EXCLUDED.field_key,system_label=EXCLUDED.system_label,
    unit_label=EXCLUDED.unit_label,section_label=EXCLUDED.section_label,field_label=EXCLUDED.field_label,
    before_snapshot=EXCLUDED.before_snapshot,outcome=EXCLUDED.outcome,remark=EXCLUDED.remark,sort_order=EXCLUDED.sort_order
    WHERE repair_visit_items.visit_uuid=EXCLUDED.visit_uuid RETURNING client_uuid`,
  [id, visit, i.systemKey, i.rowUuid, i.locationId, i.zoneId, i.sectionKey, i.fieldKey, field.systemLabel, field.unitLabel,
    field.sectionLabel, field.fieldLabel, field.before, outcome, remark, sort]);
  if (saved.rowCount !== 1) return refuse("IDEMPOTENCY_CONFLICT");
}
export async function createRepairVisit(database: Database, actor: CurrentUser, value: unknown, now = new Date()) {
  const b = parseCreate(value), fp = fingerprint({ actorId: actor.id, ...b });
  return transaction(database, async db => {
    await catalogActor(db, actor); if (actor.role !== "inspector") return refuse("FORBIDDEN", 403);
    await db.query("SELECT pg_advisory_xact_lock(hashtext('rv:create:' || $1))", [b.clientUuid]);
    const old = (await db.query<VisitRow>("SELECT * FROM repair_visits WHERE client_uuid=$1 FOR UPDATE", [b.clientUuid])).rows[0];
    if (old) { if (Number(old.created_by_user_id) !== actor.id) return refuse("FORBIDDEN", 403);
      if (old.request_fingerprint !== fp) return refuse("IDEMPOTENCY_CONFLICT"); return createReceipt(old); }
    if ((await db.query("SELECT 1 FROM audit_events WHERE entity_id=$1 AND action='repair_visit.deleted'", [b.clientUuid])).rows.length) return refuse("VISIT_DELETED");
    const visitDate = b.deviceCreatedAt === null ? malaysiaDay(now) : b.visitDate;
    if (b.deviceCreatedAt !== null) {
      const age = (Date.parse(visitDate) - Date.parse(malaysiaDay(now))) / 86400000;
      const deviceAge = (Date.parse(malaysiaDay(new Date(b.deviceCreatedAt))) - Date.parse(malaysiaDay(now))) / 86400000;
      if (age > 1 || age < -30 || deviceAge > 1 || deviceAge < -30) return refuse("DEVICE_DATE_OUT_OF_WINDOW");
      if (malaysiaDay(new Date(b.deviceCreatedAt)) !== visitDate) return refuse("DEVICE_DATE_MISMATCH");
    }
    await configuration(db, b.customerId, b.siteId, b.configurationRevisionId);
    const fields = selected(await catalog(db, actor, { customer_id: b.customerId, site_id: b.siteId, previous: b.previousVisit }), b.items);
    // Draft Before stays empty. Submit re-reads and freezes authoritative Before.
    const sequence = (await db.query("SELECT nextval('repair_visit_reference_sequence') AS n")).rows[0].n;
    const v = (await db.query<VisitRow>(`INSERT INTO repair_visits(client_uuid,visit_number,customer_id,site_id,created_by_user_id,
      configuration_revision_id,service_call_number,arrival_time,visit_date,created_on_device_at,previous_visit_kind,previous_service_visit_id,previous_repair_visit_id,request_fingerprint)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [b.clientUuid, `RV-${visitDate.replaceAll("-", "")}-${sequence}`, b.customerId, b.siteId, actor.id, b.configurationRevisionId,
      b.serviceCallNumber, b.arrivalTime, visitDate, b.deviceCreatedAt ?? now.toISOString(), b.previousVisit?.kind ?? null,
      b.previousVisit?.kind === "service" ? b.previousVisit.visitId : null, b.previousVisit?.kind === "repair" ? b.previousVisit.visitId : null, fp])).rows[0]!;
    for (let n = 0; n < b.items.length; n++) await upsertItem(db, v.client_uuid, b.items[n].clientUuid, { ...fields[n], before: null }, n, null, "");
    await audit(db, actor, "repair_visit.created", v.client_uuid, fp); return createReceipt(v);
  });
}
type PhotoRow = { photo_uuid: string; visit_uuid: string; item_uuid: string; revision: number; uploader_user_id: string;
  request_fingerprint: string; source_sha256: string; stored_sha256: string; storage_relative_path: string;
  size_bytes: number; width: number; height: number; status: string };
export async function photoBytes(p: PhotoRow) {
  if (p.storage_relative_path !== `repairs/${p.visit_uuid}/${p.photo_uuid}.jpg`) return refuse("REPAIR_EVIDENCE_INVALID");
  return readBeforeBytes({ photoUuid: p.photo_uuid, fieldPath: p.item_uuid, sourceSha256: p.source_sha256,
    storedSha256: p.stored_sha256, storageRelativePath: p.storage_relative_path, sizeBytes: p.size_bytes, width: p.width, height: p.height });
}
const photoReceipt = (p: PhotoRow) => ({ photoUuid: p.photo_uuid, clientUuid: p.visit_uuid, itemUuid: p.item_uuid,
  revision: p.revision, requestFingerprint: p.request_fingerprint, sourceSha256: p.source_sha256, storedSha256: p.stored_sha256 });
export async function stageRepairVisitPhoto(database: Database, actor: CurrentUser, visit: string, value: unknown, sourcePath: string) {
  try {
    const b = parsePhoto(value), fp = fingerprint({ actorId: actor.id, clientUuid: uuid(visit), ...b });
    return await transaction(database, async db => {
      const v = await lockedVisit(db, actor, visit, true);
      await db.query("SELECT pg_advisory_xact_lock(hashtext('rv:photo:' || $1))", [b.photoUuid]);
      let image;
      try { image = await normalizeAttachmentImage(sourcePath); } catch { return refuse("INVALID_PHOTO", 400); }
      if (image.sourceSha256 !== b.sourceSha256 || image.sourceSizeBytes !== b.sizeBytes || image.sourceWidth !== b.width || image.sourceHeight !== b.height) return refuse("PHOTO_METADATA_MISMATCH");
      const old = (await db.query<PhotoRow>("SELECT * FROM repair_visit_photos WHERE photo_uuid=$1", [b.photoUuid])).rows[0];
      if (old) { if (old.request_fingerprint !== fp || old.visit_uuid !== visit || Number(old.uploader_user_id) !== actor.id) return refuse("IDEMPOTENCY_CONFLICT");
        await photoBytes(old); return photoReceipt(old); }
      if (!["draft", "returned"].includes(v.status)) return refuse("VISIT_LOCKED");
      if (b.revision !== v.revision + (v.status === "returned" ? 1 : 0)) return refuse("STALE_REVISION");
      // New item UUIDs are allowed here: Submit validates their full catalog identity.
      const relative = `repairs/${visit}/${b.photoUuid}.jpg`;
      // A failed DB insert leaves an orphan for the existing reconciler, never removes committed evidence.
      await moveNormalizedAttachment(image.normalizedTempPath, path.resolve(loadConfig().uploadsPath, ...relative.split("/")));
      const p = (await db.query<PhotoRow>(`INSERT INTO repair_visit_photos(photo_uuid,visit_uuid,item_uuid,revision,uploader_user_id,
        request_fingerprint,source_sha256,stored_sha256,storage_relative_path,mime_type,size_bytes,width,height,capture_source,captured_at,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'image/jpeg',$10,$11,$12,$13,$14,'staged') RETURNING *`,
      [b.photoUuid, visit, b.itemUuid, b.revision, actor.id, fp, b.sourceSha256, image.storedSha256, relative,
        image.storedSizeBytes, image.width, image.height, b.captureSource, b.capturedAt])).rows[0]!;
      await audit(db, actor, "repair_visit.photo_staged", b.photoUuid, fp); return photoReceipt(p);
    });
  } finally { await unlink(sourcePath).catch(() => undefined); await unlink(`${sourcePath}.jpg`).catch(() => undefined); }
}
type EventRow = { client_uuid: string; visit_uuid: string; revision: number; event_type: string; actor_user_id: string; reason: string | null; request_fingerprint: string; occurred_at: Date };
function eventReceipt(e: EventRow) {
  return { operationUuid: e.client_uuid, clientUuid: e.visit_uuid, revision: e.revision, event: e.event_type,
    requestFingerprint: e.request_fingerprint, occurredAt: e.occurred_at.toISOString() };
}
async function retry(db: PoolClient, actor: CurrentUser, visit: string, operation: string, fp: string) {
  const e = (await db.query<EventRow>("SELECT * FROM repair_visit_events WHERE client_uuid=$1", [operation])).rows[0];
  if (!e) return null;
  if (e.visit_uuid !== visit || Number(e.actor_user_id) !== actor.id || e.request_fingerprint !== fp) return refuse("IDEMPOTENCY_CONFLICT");
  return eventReceipt(e);
}
async function event(db: PoolClient, actor: CurrentUser, visit: string, operation: string, revision: number, type: string, reason: string | null, fp: string) {
  const e = (await db.query<EventRow>(`INSERT INTO repair_visit_events(client_uuid,visit_uuid,revision,event_type,actor_user_id,reason,request_fingerprint)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [operation, visit, revision, type, actor.id, reason, fp])).rows[0]!;
  await audit(db, actor, `repair_visit.${type}`, visit, fp); return eventReceipt(e);
}
export async function submitRepairVisit(database: Database, actor: CurrentUser, visit: string, value: unknown) {
  const b = parseSubmit(value), fp = fingerprint({ action: "submit", actorId: actor.id, clientUuid: uuid(visit), ...b });
  return transaction(database, async db => {
    const v = await lockedVisit(db, actor, visit, true);
    const old = await retry(db, actor, visit, b.operationUuid, fp); if (old) return old;
    if (!["draft", "returned"].includes(v.status)) return refuse("VISIT_LOCKED");
    if (v.revision !== b.expectedRevision || b.revision !== v.revision + (v.status === "returned" ? 1 : 0)) return refuse("STALE_REVISION");
    // Previous-visit fields intentionally remain repairable after configuration changes (A12).
    if (!previousOf(v)) await configuration(db, v.customer_id, v.site_id, v.configuration_revision_id);
    const fields = selected(await catalog(db, actor, { ...v, previous: previousOf(v) }), b.items);
    const photos: PhotoRow[] = [];
    for (const item of b.items) {
      const p = (await db.query<PhotoRow>("SELECT * FROM repair_visit_photos WHERE photo_uuid=$1 FOR UPDATE", [item.photoUuid])).rows[0];
      if (!p || p.visit_uuid !== visit || p.item_uuid !== item.clientUuid || Number(p.uploader_user_id) !== actor.id || p.source_sha256 !== item.sourceSha256
        || !(p.status === "staged" && p.revision === b.revision || p.status === "accepted" && p.revision <= b.revision)) return refuse("EVIDENCE_NOT_STAGED");
      await photoBytes(p); photos.push(p);
    }
    for (let n = 0; n < photos.length; n++) for (let m = 0; m < n; m++) {
      if (b.items[n].identity.systemKey === b.items[m].identity.systemKey
        && (photos[n].source_sha256 === photos[m].source_sha256 || photos[n].stored_sha256 === photos[m].stored_sha256)) return refuse("DUPLICATE_ITEM_EVIDENCE");
    }
    // Cannot repurpose an item UUID to a different field, even on a returned revision.
    const existing = (await db.query("SELECT * FROM repair_visit_items WHERE visit_uuid=$1", [visit])).rows;
    for (const row of existing) {
      const item = b.items.find(i => i.clientUuid === row.client_uuid);
      if (item && fieldKey(item.identity) !== fieldKey({ systemKey: row.system_key, rowUuid: row.row_uuid, locationId: row.location_id, zoneId: row.zone_id, sectionKey: row.section_key, fieldKey: row.field_key })) return refuse("ITEM_IDENTITY_CHANGED");
    }
    const keep = b.items.map(i => i.clientUuid);
    // Restrictive FK: discarded items' photo metadata is removed first. Files are left for reconciliation.
    await db.query("DELETE FROM repair_visit_photos WHERE visit_uuid=$1 AND NOT(item_uuid=ANY($2::uuid[]))", [visit, keep]);
    await db.query("DELETE FROM repair_visit_items WHERE visit_uuid=$1 AND NOT(client_uuid=ANY($2::uuid[]))", [visit, keep]);
    for (let n = 0; n < b.items.length; n++) {
      const item = b.items[n], p = photos[n];
      await upsertItem(db, visit, item.clientUuid, fields[n], n, item.outcome, item.remark);
      await db.query("UPDATE repair_visit_photos SET status='superseded' WHERE visit_uuid=$1 AND item_uuid=$2 AND status='accepted' AND photo_uuid<>$3", [visit, item.clientUuid, p.photo_uuid]);
      await db.query("UPDATE repair_visit_photos SET status='accepted',bound_item_uuid=item_uuid,accepted_at=COALESCE(accepted_at,now()) WHERE photo_uuid=$1", [p.photo_uuid]);
    }
    await db.query("UPDATE repair_visits SET status='awaiting_approval',revision=$2,updated_at=now() WHERE client_uuid=$1", [visit, b.revision]);
    return event(db, actor, visit, b.operationUuid, b.revision, v.status === "draft" ? "submitted" : "resubmitted", null, fp);
  });
}
export async function decideRepairVisit(database: Database, actor: CurrentUser, visit: string, value: unknown, returning: boolean) {
  const b = parseDecision(value, returning), fp = fingerprint({ action: returning ? "return" : "approve", actorId: actor.id, clientUuid: uuid(visit), ...b });
  return transaction(database, async db => {
    const v = await lockedVisit(db, actor, visit);
    if (actor.role === "inspector") return refuse("FORBIDDEN", 403);
    const old = await retry(db, actor, visit, b.operationUuid, fp);
    if (old) return returning ? old : { ...old, reportNumber: v.report_number };
    if (v.revision !== b.expectedRevision) return refuse("STALE_REVISION");
    if (v.status !== "awaiting_approval") return refuse("VISIT_NOT_AWAITING_APPROVAL");
    if (returning) await db.query("UPDATE repair_visits SET status='returned',updated_at=now() WHERE client_uuid=$1", [visit]);
    else {
      const now = new Date(), year = Number(malaysiaDay(now).slice(0,4));
      const n = (await db.query(`INSERT INTO repair_report_number_year_counters(report_year,last_sequence) VALUES($1,1)
        ON CONFLICT(report_year) DO UPDATE SET last_sequence=repair_report_number_year_counters.last_sequence+1 RETURNING last_sequence`, [year])).rows[0].last_sequence;
      const report = `MFE/RR/${year}/${String(n).padStart(4,"0")}`;
      const model = await buildRepairVisitReport(db, v, { reportNumber: report, approvedBy: actor.username, approvedAt: now.toISOString() });
      const bytes = await renderRepairVisitReportPdf(model);
      await db.query(`UPDATE repair_visits SET status='approved',report_number=$2,approved_by_user_id=$3,approved_at=$4,
        final_pdf=$5,final_pdf_sha256=$6,updated_at=now() WHERE client_uuid=$1`, [visit, report, actor.id, now, bytes, createHash("sha256").update(bytes).digest("hex")]);
      v.report_number = report;
    }
    const receipt = await event(db, actor, visit, b.operationUuid, v.revision, returning ? "returned" : "approved", b.reason, fp);
    return returning ? receipt : { ...receipt, reportNumber: v.report_number };
  });
}
export async function repairVisitPdf(database: Database, actor: CurrentUser, visit: string, preview: boolean, expectedRevision: number) {
  return transaction(database, async db => {
    const v = await lockedVisit(db, actor, visit);
    if (v.revision !== expectedRevision) return refuse("STALE_REVISION");
    if (preview) {
      if (actor.role === "inspector") return refuse("FORBIDDEN", 403);
      if (v.status !== "awaiting_approval") return refuse("VISIT_NOT_AWAITING_APPROVAL");
      return renderRepairVisitReportPdf(await buildRepairVisitReport(db, v));
    }
    if (v.status !== "approved" || !v.final_pdf || createHash("sha256").update(v.final_pdf).digest("hex") !== v.final_pdf_sha256) return refuse("FINAL_REPORT_UNAVAILABLE");
    return v.final_pdf;
  });
}
export async function deleteRepairVisit(database: Database, actor: CurrentUser, visit: string, value: unknown) {
  const b = keys(value, ["expectedRevision"]), revision = positive(b.expectedRevision);
  return transaction(database, async db => {
    uuid(visit); await catalogActor(db, actor);
    if (actor.role !== "inspector") return refuse("FORBIDDEN", 403);
    await db.query("SELECT pg_advisory_xact_lock(hashtext('rv:create:' || $1))", [visit]);
    if (!(await db.query("SELECT 1 FROM repair_visits WHERE client_uuid=$1", [visit])).rows.length) {
      const prior = await db.query("SELECT 1 FROM audit_events WHERE actor_user_id=$1 AND entity_id=$2 AND action='repair_visit.deleted' AND reason=$3", [actor.id, visit, fingerprint({ revision })]);
      if (prior.rows.length) return { clientUuid: visit, deleted: true };
      return refuse("VISIT_NOT_YET_CREATED", 404);
    }
    const v = await lockedVisit(db, actor, visit, true);
    if (v.revision !== revision) return refuse("STALE_REVISION");
    const started = await db.query(`SELECT 1 FROM repair_visit_photos WHERE visit_uuid=$1 UNION ALL
      SELECT 1 FROM repair_visit_events WHERE visit_uuid=$1 UNION ALL SELECT 1 FROM repair_visit_items WHERE visit_uuid=$1 AND (outcome IS NOT NULL OR remark<>'')`, [visit]);
    if (v.status !== "draft" || started.rows.length) return refuse("VISIT_ALREADY_STARTED");
    await db.query("DELETE FROM repair_visit_items WHERE visit_uuid=$1", [visit]);
    await db.query("DELETE FROM repair_visits WHERE client_uuid=$1", [visit]);
    await audit(db, actor, "repair_visit.deleted", visit, fingerprint({ revision }));
    return { clientUuid: visit, deleted: true };
  });
}

/** Authoritative review/form read; private disk paths and PDF bytes stay server-side. */
export async function readRepairVisit(database: Database, actor: CurrentUser, visit: string) {
  return transaction(database, async db => {
    const v = await lockedVisit(db, actor, visit);
    const items = (await db.query(`SELECT i.*,p.photo_uuid FROM repair_visit_items i LEFT JOIN repair_visit_photos p
      ON p.visit_uuid=i.visit_uuid AND p.bound_item_uuid=i.client_uuid AND p.status='accepted' WHERE i.visit_uuid=$1 ORDER BY i.sort_order,i.client_uuid`, [visit])).rows;
    const events = (await db.query("SELECT * FROM repair_visit_events WHERE visit_uuid=$1 ORDER BY occurred_at,client_uuid", [visit])).rows;
    return { visit: wireVisit(v), items: items.map(i => parseRepairVisitItem({ clientUuid: i.client_uuid, visitUuid: i.visit_uuid,
      identity: { systemKey: i.system_key, rowUuid: i.row_uuid, locationId: i.location_id, zoneId: i.zone_id, sectionKey: i.section_key, fieldKey: i.field_key },
      systemLabel: i.system_label, unitLabel: i.unit_label, sectionLabel: i.section_label, fieldLabel: i.field_label, before: i.before_snapshot,
      outcome: i.outcome, remark: i.remark, photoUuid: i.photo_uuid, sortOrder: i.sort_order })),
      events: events.map(e => parseRepairVisitEvent({ clientUuid: e.client_uuid, visitUuid: e.visit_uuid, revision: e.revision,
        type: e.event_type, actorUserId: Number(e.actor_user_id), reason: e.reason, occurredAt: e.occurred_at.toISOString(), requestFingerprint: e.request_fingerprint })) };
  });
}
function wireVisit(v: VisitRow) {
  return parseRepairVisit({ clientUuid: v.client_uuid, visitNumber: v.visit_number, customerId: v.customer_id, siteId: v.site_id,
    createdByUserId: Number(v.created_by_user_id), configurationRevisionId: v.configuration_revision_id, serviceCallNumber: v.service_call_number,
    arrivalTime: v.arrival_time.slice(0,5), visitDate: day(v.visit_date), deviceCreatedAt: v.created_on_device_at.toISOString(), previousVisit: previousOf(v),
    status: v.status, revision: v.revision, reportNumber: v.report_number, approvedByUserId: v.approved_by_user_id === null ? null : Number(v.approved_by_user_id),
    approvedAt: v.approved_at?.toISOString() ?? null, createdAt: v.created_at.toISOString(), updatedAt: v.updated_at.toISOString() });
}
export async function listRepairVisits(database: Database, actor: CurrentUser) {
  return transaction(database, async db => {
    await catalogActor(db, actor);
    const rows = (await db.query<VisitRow>("SELECT * FROM repair_visits WHERE ($1::bigint IS NULL OR created_by_user_id=$1) ORDER BY visit_date DESC,created_at DESC", [actor.role === "inspector" ? actor.id : null])).rows;
    return { visits: rows.map(wireVisit) };
  });
}
export async function readRepairVisitPhoto(database: Database, actor: CurrentUser, visit: string, photo: string) {
  uuid(photo);
  return transaction(database, async db => {
    await lockedVisit(db, actor, visit);
    const p = (await db.query<PhotoRow>("SELECT * FROM repair_visit_photos WHERE visit_uuid=$1 AND photo_uuid=$2", [visit, photo])).rows[0];
    if (!p || actor.role !== "inspector" && p.status !== "accepted") return refuse("PHOTO_NOT_FOUND", 404);
    return photoBytes(p);
  });
}
