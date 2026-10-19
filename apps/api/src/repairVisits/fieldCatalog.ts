import { createHash } from "node:crypto";
import { extractRepairSource, readBeforeBytes, type BeforePhoto } from "./fieldCatalogSource.js";
import { record, invalidSource, type R } from "./fieldCatalogReaders.js";
import { catalogActor, catalogNotFound, catalogUuid, requirePreviousVisit, type CatalogDatabase, type PreviousVisit } from "./previousVisits.js";
import { isRepairVisitFieldIdentity, isRepairVisitPhoto, repairVisitSystems, type RepairVisitBeforeSnapshot, type RepairVisitFieldIdentity, type RepairVisitPhoto, type RepairVisitPrevious, type RepairVisitSystem } from "./repairVisitContract.js";
import type { CurrentUser } from "../auth/authTypes.js";
import { resolveV7EvidenceContract, v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";
import { savedLayoutRows } from "../inspections/savedLayoutRows.js";
import { parseFireAlarmRowPreset } from "../inspections/templates/fireAlarmDefinitionControls.js";
import { v7DisplayLabelLookup } from "../reports/finalServiceReport.js";

export type CatalogField = {
  identity: RepairVisitFieldIdentity; systemLabel: string; unitLabel: string; sectionLabel: string; fieldLabel: string;
  before: RepairVisitBeforeSnapshot | null;
};
type InternalField = CatalogField & { sourcePhoto: BeforePhoto | null };
type CatalogLayoutRow = { assetReference: string; locationText: string; zoneText?: string };
const photoMetadata = (photo: BeforePhoto): RepairVisitPhoto => {
  const { photoUuid, sourceSha256, storedSha256, sizeBytes, width, height } = photo;
  const value = { photoUuid, sourceSha256, storedSha256, sizeBytes, width, height };
  if (!isRepairVisitPhoto(value)) return invalidSource();
  return value;
};
const before = (visit: PreviousVisit, result: RepairVisitBeforeSnapshot["result"], remark: string, photo: RepairVisitPhoto | null): RepairVisitBeforeSnapshot => ({
  previousVisit: { kind: visit.kind, visitId: visit.visitId }, visitNumber: visit.visitNumber, visitDate: visit.visitDate, result, remark, photo
});
export function orderCatalog<T extends CatalogField>(fields: T[]): T[] {
  const priority = (f: CatalogField) => ["not_good", "not_done"].includes(f.before?.result ?? "") ? 0 : 1;
  const seen = new Set<string>();
  for (const field of fields) {
    if (!isRepairVisitFieldIdentity(field.identity)) return invalidSource();
    const key = JSON.stringify(field.identity);
    if (seen.has(key)) return invalidSource();
    seen.add(key);
  }
  return fields.sort((a, b) => priority(a) - priority(b));
}

/** Paths originate in the version-specific adapter, never a recursive result-string search. */
export function serviceCatalogFields(row: R, parts: Array<{ fieldPath: string; result: "good" | "not_good" | "na"; remark: string; rowUuid: string | null; unit: R | null; sectionLabel: string; fieldLabel: string; beforePhoto: BeforePhoto | null }>, visit: PreviousVisit): InternalField[] {
  const snapshot = row.inspectionSnapshot;
  if (!record(snapshot) || !record(snapshot.system) || !record(snapshot.system.definition)) return invalidSource();
  const system = snapshot.system;
  const sections = snapshot.system.definition.sections;
  if (!Array.isArray(sections)) return invalidSource();
  return parts.flatMap(part => {
    const path = part.fieldPath.split(".");
    const fieldKey = path.at(-1)!;
    const section = sections.find(s => record(s) && (path.length === 2
      ? Array.isArray(s.blocks) && s.blocks.some(b => record(b) && Array.isArray(b.items) && b.items.some(f => record(f) && f.key === fieldKey))
      : s.key === path[0]));
    const block = record(section) && Array.isArray(section.blocks) ? section.blocks.find(b => record(b) && (path.length === 2
      ? Array.isArray(b.items) && b.items.some(f => record(f) && f.key === fieldKey) : b.key === path[1])) : undefined;
    // Measurement result toggles are excluded along with their numeric readings.
    if (!record(block) || block.type === "measurement") return [];
    const identity: RepairVisitFieldIdentity = { systemKey: row.systemKey as RepairVisitSystem, rowUuid: part.rowUuid,
      locationId: part.unit?.configuredLocationId as string | null ?? row.locationId as string | null,
      zoneId: record(part.unit?.zoneSnapshot) ? part.unit.zoneSnapshot.id as string : row.zoneId as string | null,
      sectionKey: String((section as R).key), fieldKey };
    const instance = record(snapshot.instance) ? snapshot.instance : {};
    const location = record(instance.location) ? instance.location.displayName : null;
    const rowLocation = record(part.unit?.locationSnapshot) ? part.unit.locationSnapshot.displayName : null;
    const rowZone = record(part.unit?.zoneSnapshot) ? part.unit.zoneSnapshot.displayName
      : row.systemKey === "fire_rated_roller_shutter" ? part.unit?.zoneText : null;
    const unitLabel = [rowZone, part.unit?.assetReference, part.unit?.locationText ?? part.unit?.location ?? rowLocation ?? location, part.unit?.alarmZone]
      .filter(v => typeof v === "string" && v.trim()).join(" / ") || (part.rowUuid ? `Unit ${part.rowUuid}` : "General");
    return [{ identity, systemLabel: String(system.displayName ?? row.systemKey), unitLabel,
      sectionLabel: part.sectionLabel, fieldLabel: part.fieldLabel,
      before: before(visit, part.result, part.remark, part.beforePhoto ? photoMetadata(part.beforePhoto) : null), sourcePhoto: part.beforePhoto }];
  });
}

async function previousCatalog(db: CatalogDatabase, actor: CurrentUser, customerId: string, siteId: string, previous: RepairVisitPrevious): Promise<InternalField[]> {
  const visit = await requirePreviousVisit(db, actor, customerId, siteId, previous);
  if (previous.kind === "service") {
    const forms = await db.query(`SELECT f.id FROM master_system_form_instances f JOIN master_system_inspections p ON p.id=f.inspection_group_id
      WHERE p.job_id=$1 AND f.status='submitted' AND p.system_key=ANY($2::text[]) ORDER BY p.system_key,f.display_sequence,f.id`, [previous.visitId, [...repairVisitSystems]]);
    const fields: InternalField[] = [];
    for (const form of forms.rows) {
      const source = await extractRepairSource(db, form.id);
      fields.push(...serviceCatalogFields(source.row, source.parts, visit));
    }
    return orderCatalog(fields);
  }
  const result = await db.query(`SELECT i.*,p.photo_uuid AS "photoUuid",p.source_sha256 AS "sourceSha256",p.stored_sha256 AS "storedSha256",
    p.size_bytes AS "sizeBytes",p.width,p.height,p.storage_relative_path AS "storageRelativePath"
    FROM repair_visit_items i LEFT JOIN repair_visit_photos p ON p.bound_item_uuid=i.client_uuid AND p.visit_uuid=i.visit_uuid AND p.status='accepted'
    WHERE i.visit_uuid=$1 ORDER BY i.sort_order,i.client_uuid`, [previous.visitId]);
  return orderCatalog(result.rows.map(row => {
    if (!["done_repair", "not_done"].includes(row.outcome) || typeof row.remark !== "string" || !row.remark.trim()) return invalidSource();
    const sourcePhoto: BeforePhoto = { photoUuid: row.photoUuid, sourceSha256: row.sourceSha256, storedSha256: row.storedSha256,
      sizeBytes: row.sizeBytes, width: row.width, height: row.height, storageRelativePath: row.storageRelativePath, fieldPath: row.field_key };
    return { identity: { systemKey: row.system_key, rowUuid: row.row_uuid, locationId: row.location_id, zoneId: row.zone_id, sectionKey: row.section_key, fieldKey: row.field_key },
      systemLabel: row.system_label, unitLabel: row.unit_label, sectionLabel: row.section_label, fieldLabel: row.field_label,
      before: before(visit, row.outcome, row.remark, photoMetadata(sourcePhoto)), sourcePhoto };
  }));
}

export async function readPreviousVisitCatalog(db: CatalogDatabase, actor: CurrentUser, customerId: string, siteId: string, previous: RepairVisitPrevious): Promise<CatalogField[]> {
  return (await previousCatalog(db, actor, customerId, siteId, previous)).map(({ sourcePhoto: _private, ...field }) => field);
}
export async function readCatalogBeforePhoto(db: CatalogDatabase, actor: CurrentUser, customerId: string, siteId: string, previous: RepairVisitPrevious, photoUuid: string) {
  catalogUuid(photoUuid);
  const field = (await previousCatalog(db, actor, customerId, siteId, previous)).find(f => f.sourcePhoto?.photoUuid === photoUuid);
  if (!field?.sourcePhoto) return catalogNotFound();
  return readBeforeBytes(field.sourcePhoto);
}

/** Content-derived identity: never use array position, sort order, or configured ordinal. */
export function layoutRowUuid(revisionId: string, locationId: string, assetReference: string, locationText: string, duplicateSlot?: number, zoneText?: string) {
  const identity: (string | number)[] = [revisionId, locationId, assetReference, locationText];
  if (duplicateSlot !== undefined) identity.push(duplicateSlot);
  if (zoneText) identity.push("zoneText", zoneText);
  const hex = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function configurationCatalogFields(system: R, locations: R[], zones: R[], revisionId: string, templateId: string): CatalogField[] {
  if (system.systemKey === "portable_fire_extinguisher") return [];
  if (!repairVisitSystems.includes(system.systemKey as RepairVisitSystem)) return invalidSource();
  if (!record(system.definition) || !Array.isArray(system.definition.sections)) return invalidSource();
  const adapter = resolveV7EvidenceContract({ systemKey: system.systemKey, templateId, templateVersion: 7,
    definition: system.definition, contractSha256: v7EvidenceContractSha256(system.definition) });
  if (!adapter) return invalidSource();
  const displayLabels = v7DisplayLabelLookup(String(system.systemKey), { schemaVersion: 2, template: { version: 7 }, system: { definition: system.definition } }, system);
  const fields: CatalogField[] = [];
  const perLocation = ["co2_fire_extinguisher", "wet_chemical", "fm200_fire_suppression"].includes(String(system.systemKey));
  for (const section of system.definition.sections) {
    if (!record(section) || !Array.isArray(section.blocks)) return invalidSource();
    for (const block of section.blocks) {
      if (!record(block) || !["checklist", "repeatable_table"].includes(String(block.type))) continue;
      const columns = block.type === "checklist" ? block.items : block.columns;
      if (!Array.isArray(columns)) return invalidSource();
      const repeated = block.type === "repeatable_table";
      const units: Array<{ rowUuid: string | null; locationId: string | null; zoneId: string | null; label: string }> = [];
      if (repeated || perLocation) for (const location of locations) {
        const locationId = catalogUuid(location.id), zoneId = location.zoneId === null ? null : catalogUuid(location.zoneId);
        if (zoneId && !zones.some(z => z.id === zoneId)) return invalidSource();
        if (typeof location.displayName !== "string" || !location.displayName.trim()) return invalidSource();
        if (repeated) {
          const preset = record(location.rowPreset) ? location.rowPreset : {};
          if (system.systemKey === "fire_alarm_detector") {
            const { rows: _saved, ...routePreset } = preset;
            const routing = parseFireAlarmRowPreset(routePreset);
            if (!routing) return invalidSource();
            // Primary detector mode controls are not result fields. Never turn
            // primary saved rows into secondary Alarm Bell / MCP fields.
            if (routing.fireAlarmTable === "primary") continue;
          }
          let rows: CatalogLayoutRow[] | undefined = savedLayoutRows(location);
          if (["smoke_ventilation", "fire_intercom", "fire_alarm_detector", "hose_reel", "fire_rated_roller_shutter"].includes(String(system.systemKey)) && Array.isArray(preset.rows)) {
            const expected = system.systemKey === "fire_alarm_detector" ? ["assetReference", "location"]
              : system.systemKey === "hose_reel" ? ["assetReference", "locationText", "drumType"]
              : system.systemKey === "fire_rated_roller_shutter" ? ["assetReference", "locationText"] : ["assetReference"];
            const valid = preset.rows.length === location.presetRowCount && preset.rows.every(r => record(r)
              && expected.every(k => typeof r[k] === "string" && String(r[k]).length <= 300)
              && (system.systemKey !== "hose_reel" || ["", "swing", "fixed"].includes(String(r.drumType)))
              && (!Object.hasOwn(r, "zoneText") || typeof r.zoneText === "string" && r.zoneText.length <= 200)
              && Object.keys(r).every(k => expected.includes(k) || system.systemKey === "fire_rated_roller_shutter" && k === "zoneText"));
            if (!valid) return invalidSource();
            rows = preset.rows.map(r => ({ assetReference: String((r as R).assetReference),
              locationText: String((r as R).locationText ?? (r as R).location ?? location.displayName),
              ...(system.systemKey === "fire_rated_roller_shutter" && typeof (r as R).zoneText === "string"
                ? { zoneText: String((r as R).zoneText).trim() } : {}) }));
          }
          if (Object.hasOwn(preset, "rows") && !rows) return invalidSource();
          const count = location.presetRowCount;
          if (!Number.isInteger(count) || Number(count) < 1 || Number(count) > 250) return invalidSource();
          const sourceRows: CatalogLayoutRow[] = rows ?? Array.from({ length: Number(count) }, () => ({ assetReference: record(location.rowPreset) && typeof location.rowPreset.assetReference === "string" ? location.rowPreset.assetReference : "", locationText: String(location.displayName) }));
          // Treat indistinguishable configured units as a multiset. Its UUID set
          // depends on content and multiplicity, never the saved array position.
          const groups = new Map<string, { row: typeof sourceRows[number]; count: number }>();
          for (const row of sourceRows) {
            const key = JSON.stringify([row.assetReference, row.locationText, row.zoneText ?? ""]);
            const group = groups.get(key);
            if (group) group.count++;
            else groups.set(key, { row, count: 1 });
          }
          for (const { row, count: copies } of groups.values()) for (let slot = 1; slot <= copies; slot++) {
            units.push({ rowUuid: layoutRowUuid(revisionId, locationId, row.assetReference, row.locationText, copies > 1 ? slot : undefined, row.zoneText),
              locationId, zoneId, label: [row.zoneText, row.assetReference, row.locationText, copies > 1 ? `Unit ${slot}` : ""].filter(Boolean).join(" / ") });
          }
        } else units.push({ rowUuid: null, locationId, zoneId, label: location.displayName });
      }
      if (!repeated && (!perLocation || !locations.length)) units.push({ rowUuid: null, locationId: null, zoneId: null, label: "General" });
      for (const column of columns) {
        if (!record(column) || column.control !== "good_poor") continue;
        for (const unit of units) {
          const flat = ["hose_reel", "automatic_sprinkler", "dry_wet_riser", "smoke_ventilation"].includes(String(system.systemKey));
          const path = flat && !repeated ? `${system.systemKey}_checks.${column.key}`
            : `${section.key}.${block.key}.${repeated ? `rows.${unit.rowUuid}.` : ""}${column.key}`;
          if (!adapter.isCanonicalFieldPath(path)) return invalidSource();
          const resultKey = `${String(column.key).replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())}Result`;
          fields.push({ identity: { systemKey: system.systemKey as RepairVisitSystem, rowUuid: unit.rowUuid, locationId: unit.locationId, zoneId: unit.zoneId, sectionKey: String(section.key), fieldKey: String(column.key) },
            systemLabel: String(system.displayName), unitLabel: unit.label, sectionLabel: String(section.title),
            fieldLabel: displayLabels?.display.get(String(column.key)) ?? displayLabels?.display.get(resultKey) ?? String(column.label), before: null });
        }
      }
    }
  }
  return orderCatalog(fields);
}

export async function readCurrentConfigurationCatalog(db: CatalogDatabase, actor: CurrentUser, customerId: string, siteId: string) {
  catalogUuid(customerId); catalogUuid(siteId); await catalogActor(db, actor);
  const config = (await db.query(`SELECT r.id,t.id AS "templateId" FROM customer_configuration_revisions r
    JOIN customers c ON c.id=r.customer_id JOIN customer_sites s ON s.customer_id=c.id
    JOIN master_service_report_templates t ON t.id=r.template_version_id
    WHERE c.id=$1 AND s.id=$2 AND c.is_active=true AND s.is_active=true AND r.status='active' AND t.version=7`, [customerId, siteId])).rows[0];
  if (!config) return catalogNotFound();
  const systems = await db.query(`SELECT e.id,e.system_key AS "systemKey",e.label_overrides AS "labelOverrides",s.display_name AS "displayName",s.definition
    FROM customer_enabled_systems e JOIN master_service_report_systems s ON s.template_version_id=e.template_version_id AND s.system_key=e.system_key
    WHERE e.configuration_revision_id=$1 AND s.definition_status='confirmed' ORDER BY e.sort_order,e.system_key`, [config.id]);
  const fields: CatalogField[] = [];
  for (const system of systems.rows) {
    const locations = await db.query(`SELECT id,zone_id AS "zoneId",display_name AS "displayName",preset_row_count AS "presetRowCount",row_preset AS "rowPreset"
      FROM customer_system_locations WHERE enabled_system_id=$1 ORDER BY sort_order,id`, [system.id]);
    const zones = await db.query("SELECT id FROM customer_system_zones WHERE enabled_system_id=$1", [system.id]);
    fields.push(...configurationCatalogFields(system, locations.rows, zones.rows, config.id, config.templateId));
  }
  return { configurationRevisionId: config.id as string, fields: orderCatalog(fields) };
}
