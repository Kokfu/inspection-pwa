import type { PoolClient } from "pg";
import { readBeforeBytes } from "./fieldCatalogSource.js";
import { currentCompanyProfile } from "../reports/companyProfile.js";
import { isRepairVisitBeforeSnapshot, isRepairVisitFieldIdentity } from "./repairVisitContract.js";
import { refuse } from "./repairVisitWriteContract.js";
import { day, photoBytes, previousOf, type VisitRow } from "./repairVisitWrites.js";
import type { RepairVisitReportModel, RepairVisitReportItem } from "./report/repairVisitReportModel.js";

/** Only submitted items and their bound photos enter preview/final reports. */
export async function buildRepairVisitReport(db: PoolClient, v: VisitRow,
  approval?: { reportNumber: string; approvedBy: string; approvedAt: string }): Promise<RepairVisitReportModel> {
  if (v.status !== "awaiting_approval") return refuse("VISIT_NOT_AWAITING_APPROVAL");
  const header = (await db.query(`SELECT c.display_name AS customer,s.display_name AS site,s.address,c.contact_person,c.contact_phone,c.fax,c.contract_number,u.username
    FROM customers c JOIN customer_sites s ON s.customer_id=c.id JOIN users u ON u.id=$3 WHERE c.id=$1 AND s.id=$2`, [v.customer_id,v.site_id,v.created_by_user_id])).rows[0];
  if (!header) return refuse("REPAIR_SOURCE_INVALID");
  const rows = (await db.query(`SELECT i.*,p.photo_uuid,p.visit_uuid AS photo_visit_uuid,p.item_uuid,p.revision,p.uploader_user_id,
    p.request_fingerprint,p.source_sha256,p.stored_sha256,p.storage_relative_path,p.size_bytes,p.width,p.height,p.status AS photo_status
    FROM repair_visit_items i LEFT JOIN repair_visit_photos p ON p.bound_item_uuid=i.client_uuid AND p.visit_uuid=i.visit_uuid AND p.status='accepted'
    WHERE i.visit_uuid=$1 ORDER BY i.sort_order,i.client_uuid`, [v.client_uuid])).rows;
  if (!rows.length) return refuse("REPAIR_SOURCE_INVALID");
  const items: RepairVisitReportItem[] = [];
  for (const row of rows) {
    const identity = { systemKey: row.system_key, rowUuid: row.row_uuid, locationId: row.location_id, zoneId: row.zone_id, sectionKey: row.section_key, fieldKey: row.field_key };
    if (!isRepairVisitFieldIdentity(identity) || !["done_repair","not_done"].includes(row.outcome) || !row.remark?.trim()
      || !row.photo_uuid || Number(row.uploader_user_id) !== Number(v.created_by_user_id)) return refuse("REPAIR_SOURCE_INVALID");
    const bytes = await photoBytes({ ...row, visit_uuid: row.photo_visit_uuid, status: row.photo_status });
    const snap: unknown = row.before_snapshot;
    if (snap !== null && !isRepairVisitBeforeSnapshot(snap)) return refuse("REPAIR_SOURCE_INVALID");
    if (Boolean(snap) !== Boolean(previousOf(v))) return refuse("REPAIR_SOURCE_INVALID");
    let before: RepairVisitReportItem["before"] = null;
    if (isRepairVisitBeforeSnapshot(snap)) {
      const expected = previousOf(v)!;
      if (snap.previousVisit.kind !== expected.kind || snap.previousVisit.visitId !== expected.visitId) return refuse("REPAIR_SOURCE_INVALID");
      let beforePhoto = null;
      if (snap.photo) {
        // Locate immutable bytes by the frozen UUID and verify against the frozen metadata.
        const result = await db.query(`SELECT storage_relative_path FROM staged_inspection_evidence WHERE photo_uuid=$1 AND status='accepted'
          UNION ALL SELECT storage_relative_path FROM repair_visit_photos WHERE photo_uuid=$1 AND status='accepted'`, [snap.photo.photoUuid]);
        if (result.rows.length !== 1) return refuse("REPAIR_EVIDENCE_INVALID");
        const relative = result.rows[0].storage_relative_path;
        const content = await readBeforeBytes({ ...snap.photo, fieldPath: row.field_key, storageRelativePath: relative });
        beforePhoto = { content, width: snap.photo.width, height: snap.photo.height, caption: null };
      }
      before = { snapshot: snap, photo: beforePhoto };
    }
    items.push({ no: items.length+1, clientUuid: row.client_uuid, identity, systemLabel: row.system_label, unitLabel: row.unit_label,
      sectionLabel: row.section_label, fieldLabel: row.field_label, before, outcome: row.outcome, remark: row.remark,
      afterPhoto: { content: bytes, width: row.width, height: row.height, caption: null } });
  }
  const snap = items[0].before?.snapshot;
  return { company: currentCompanyProfile(), cover: { visitUuid: v.client_uuid, visitNumber: v.visit_number, visitDate: day(v.visit_date),
    arrivalTime: v.arrival_time.slice(0,5), customer: header.customer, site: header.site, siteAddress: header.address,
    contactPerson: header.contact_person, telephone: header.contact_phone, fax: header.fax, contractNumber: header.contract_number,
    serviceCallNumber: v.service_call_number, technician: header.username, technicians: [header.username],
    previousVisit: snap ? { kind: snap.previousVisit.kind, visitNumber: snap.visitNumber, visitDate: snap.visitDate } : null,
    acknowledgement: { name: null, designation: null, signedAt: null, signature: null } }, items,
    ...(approval ? { mode: "final" as const, ...approval } : { mode: "preview" as const, reportNumber: null, approvedBy: null, approvedAt: null }) };
}
