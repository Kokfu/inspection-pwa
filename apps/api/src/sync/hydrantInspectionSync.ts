import { createHash, randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import type { SyncFailure, SyncResult } from "./testRecordSync.js";
import { isCompatibleSystemContract } from "../inspections/templates/systemContractCompatibility.js";
type R=Record<string,unknown>;const rec=(x:unknown):x is R=>typeof x==="object"&&x!==null&&!Array.isArray(x);const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;const fail=(id:string,code:string,message:string):SyncFailure=>({id,code,message});
type SyncItem={operationId:unknown;entityType:unknown;entityId:unknown;action:unknown;payload:unknown};
type HydrantPayload=R&{clientUuid:string;jobId:string;systemKey:"hydrant";masterTemplate:R&{id:string;code:"MFE-FSSR";version:number};configuration:R&{revisionId:string;revisionNumber:number};inspectionSnapshot:R;responses:R;performedAt:string;originalCreatorSnapshot:R|null};
const canonicalUtc=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const exactKeys=(value:R,keys:string[])=>Object.keys(value).length===keys.length&&keys.every((key)=>Object.hasOwn(value,key));
const timestamp=(value:unknown):value is string=>typeof value==="string"&&value.length<=24&&canonicalUtc.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString()===value;
function canonicalize(value:unknown):string { if(Array.isArray(value))return `[${value.map(canonicalize).join(",")}]`;if(rec(value))return `{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;return JSON.stringify(value); }
function creator(value:unknown):R|null|undefined{if(value===null)return null;if(!rec(value)||!exactKeys(value,["source","userId","username","role","capturedAt"])||value.source!=="device_reported"||!Number.isSafeInteger(value.userId)||Number(value.userId)<=0||typeof value.username!=="string"||(value.role!=="admin"&&value.role!=="inspector")||!timestamp(value.capturedAt))return undefined;const username=value.username.trim();return username.length>0&&username.length<=160?{...value,username}:undefined;}
function valid(x:unknown){const rowKeys=["rowUuid","source","configuredLocationId","configuredRowOrdinal","zoneSnapshot","locationSnapshot","assetReference","locationText","canvasHose1Result","canvasHose2Result","diffuserNozzleResult","landingValveResult","landingValveHandleResult","hoseCabinetResult","keyLockResult","remarks","sortOrder"];if(!rec(x)||!exactKeys(x,["schemaVersion","hydrantType","rows","comments"])||x.schemaVersion!==1||!["pressurize","meter","public"].includes(String(x.hydrantType))||typeof x.comments!=="string"||x.comments.length>4000||!Array.isArray(x.rows)||x.rows.length<1||x.rows.length>250)return false;const fields=["canvasHose1Result","canvasHose2Result","diffuserNozzleResult","landingValveResult","landingValveHandleResult","hoseCabinetResult","keyLockResult"],ids=new Set<string>();return x.rows.every((r,i)=>rec(r)&&exactKeys(r,rowKeys)&&typeof r.rowUuid==="string"&&uuid.test(r.rowUuid)&&!ids.has(r.rowUuid)&&(ids.add(r.rowUuid),true)&&r.sortOrder===i+1&&typeof r.locationText==="string"&&r.locationText.length>0&&r.locationText.length<=300&&typeof r.assetReference==="string"&&r.assetReference.length<=200&&typeof r.remarks==="string"&&r.remarks.length<=2000&&fields.every(f=>r[f]==="good"||r[f]==="poor")&&(r.source==="technician"?r.configuredLocationId===null&&r.configuredRowOrdinal===null:r.source==="configured"&&typeof r.configuredLocationId==="string"&&uuid.test(r.configuredLocationId)&&Number.isInteger(r.configuredRowOrdinal)&&Number(r.configuredRowOrdinal)>0));}
type ExpectedConfiguredHydrantRow = {
  locationId: string;
  ordinal: number;
  sortOrder: number;
  assetReference: string;
  locationText: string;
  zoneSnapshot: { id: string; displayName: string } | null;
  locationSnapshot: { id: string; displayName: string };
};

function sameSnapshot(value: unknown, expected: { id: string; displayName: string } | null) {
  if (expected === null) return value === null;
  return rec(value)
    && Object.keys(value).length === 2
    && value.id === expected.id
    && value.displayName === expected.displayName;
}

function expectedConfiguredHydrantRows(system: R): ExpectedConfiguredHydrantRow[] | undefined {
  if (!uuid.test(String(system.enabledSystemId)) || !Array.isArray(system.zones) || !Array.isArray(system.locations)) return undefined;

  const enabledSystemId = system.enabledSystemId;
  const zonesById = new Map<string, { id: string; displayName: string }>();
  for (const zone of system.zones) {
    if (!rec(zone) || typeof zone.id !== "string" || !uuid.test(zone.id) || zone.enabledSystemId !== enabledSystemId
      || typeof zone.displayName !== "string" || zone.displayName.length > 200 || zonesById.has(zone.id)) return undefined;
    zonesById.set(zone.id, { id: zone.id, displayName: zone.displayName });
  }

  const locations: Array<{ id: string; zoneId: string | null; displayName: string; presetRowCount: number; assetReference: string; sortOrder: number }> = [];
  const locationIds = new Set<string>();
  const sortOrders = new Set<number>();
  for (const location of system.locations) {
    if (!rec(location) || typeof location.id !== "string" || !uuid.test(location.id) || location.enabledSystemId !== enabledSystemId
      || locationIds.has(location.id) || typeof location.displayName !== "string" || location.displayName.length === 0 || location.displayName.length > 300
      || !Number.isInteger(location.presetRowCount) || Number(location.presetRowCount) < 0 || Number(location.presetRowCount) > 250
      || !Number.isInteger(location.sortOrder) || Number(location.sortOrder) < 1 || sortOrders.has(Number(location.sortOrder))
      || !(location.zoneId === null || typeof location.zoneId === "string" && uuid.test(location.zoneId))
      || location.zoneId !== null && !zonesById.has(location.zoneId)) return undefined;
    const assetReference = rec(location.rowPreset) && typeof location.rowPreset.assetReference === "string"
      ? location.rowPreset.assetReference
      : "";
    if (assetReference.length > 200) return undefined;
    locationIds.add(location.id);
    sortOrders.add(Number(location.sortOrder));
    locations.push({
      id: location.id,
      zoneId: location.zoneId,
      displayName: location.displayName,
      presetRowCount: Number(location.presetRowCount),
      assetReference,
      sortOrder: Number(location.sortOrder)
    });
  }

  const expected: ExpectedConfiguredHydrantRow[] = [];
  for (const location of locations.sort((left, right) => left.sortOrder - right.sortOrder)) {
    for (let ordinal = 1; ordinal <= location.presetRowCount; ordinal += 1) {
      expected.push({
        locationId: location.id,
        ordinal,
        sortOrder: expected.length + 1,
        assetReference: location.assetReference,
        locationText: location.displayName,
        zoneSnapshot: location.zoneId === null ? null : zonesById.get(location.zoneId) ?? null,
        locationSnapshot: { id: location.id, displayName: location.displayName }
      });
    }
  }
  return expected.length <= 250 ? expected : undefined;
}

function configuredHydrantRowsMatch(responses: unknown, expected: ExpectedConfiguredHydrantRow[]) {
  if (!rec(responses) || !Array.isArray(responses.rows)) return false;
  const expectedByIdentity = new Map(expected.map((row) => [`${row.locationId}:${row.ordinal}`, row]));
  if (expectedByIdentity.size !== expected.length) return false;

  const seen = new Set<string>();
  let technicianRowsStarted = false;
  for (const row of responses.rows) {
    if (!rec(row)) return false;
    if (row.source === "configured") {
      if (technicianRowsStarted || typeof row.configuredLocationId !== "string" || !Number.isInteger(row.configuredRowOrdinal)) return false;
      const identity = `${row.configuredLocationId}:${row.configuredRowOrdinal}`;
      const authoritative = expectedByIdentity.get(identity);
      if (!authoritative || seen.has(identity)
        || row.sortOrder !== authoritative.sortOrder
        || row.assetReference !== authoritative.assetReference
        || row.locationText !== authoritative.locationText
        || !sameSnapshot(row.zoneSnapshot, authoritative.zoneSnapshot)
        || !sameSnapshot(row.locationSnapshot, authoritative.locationSnapshot)) return false;
      seen.add(identity);
      continue;
    }

    technicianRowsStarted = true;
    if (row.source !== "technician" || row.configuredLocationId !== null || row.configuredRowOrdinal !== null
      || row.zoneSnapshot !== null || row.locationSnapshot !== null) return false;
  }

  return seen.size === expectedByIdentity.size;
}

/** Read-only report adapter which reuses Hydrant's accepted response and frozen-row validators. */
export function validateHydrantHistoricalPayload(response: unknown, snapshot: unknown) {
  if (!validClientSnapshot(snapshot) || !rec(snapshot) || !rec(snapshot.system)) return false;
  const expected = expectedConfiguredHydrantRows(snapshot.system);
  return isCompatibleSystemContract("hydrant", snapshot.system.definitionStatus, snapshot.system.definition)
    && valid(response) && !!expected && configuredHydrantRowsMatch(response, expected);
}

function validClientSnapshot(value: unknown) {
  if (!rec(value) || !exactKeys(value, ["schemaVersion", "capturedAt", "job", "customer", "configuration", "template", "system"])
    || value.schemaVersion !== 1 || !timestamp(value.capturedAt)
    || !rec(value.job) || !exactKeys(value.job, ["id", "reference", "title"])
    || typeof value.job.id !== "string" || typeof value.job.reference !== "string" || typeof value.job.title !== "string"
    || !rec(value.customer) || !rec(value.configuration) || !rec(value.template) || !rec(value.system)) return false;
  return validCustomer(value.customer) && validConfiguration(value.configuration) && validTemplate(value.template);
}

function validCustomer(value: unknown) {
  return rec(value) && exactKeys(value, ["id", "code", "displayName"])
    && typeof value.id === "string" && uuid.test(value.id)
    && typeof value.code === "string" && value.code.length > 0 && value.code.length <= 200
    && typeof value.displayName === "string" && value.displayName.length > 0 && value.displayName.length <= 300;
}

function validConfiguration(value: unknown) {
  return rec(value) && exactKeys(value, ["revisionId", "revisionNumber"])
    && typeof value.revisionId === "string" && uuid.test(value.revisionId)
    && Number.isInteger(value.revisionNumber) && Number(value.revisionNumber) > 0;
}

function validTemplate(value: unknown) {
  return rec(value) && exactKeys(value, ["id", "code", "name", "version"])
    && typeof value.id === "string" && uuid.test(value.id)
    && value.code === "MFE-FSSR" && typeof value.name === "string" && value.name.length > 0 && value.name.length <= 300
    && Number.isSafeInteger(value.version) && Number(value.version) > 0;
}

function isExpectedUniqueViolation(error: unknown) {
  if (!rec(error) || error.code !== "23505" || typeof error.constraint !== "string") return false;
  return error.constraint === "master_system_form_instances_client_uuid_key"
    || error.constraint === "master_system_inspections_job_id_system_key_key"
    || error.constraint === "master_system_form_instances_inspection_group_id_instance_key_key";
}

export async function syncHydrantInspections(
  items: SyncItem[],
  actorUserId?: number
): Promise<SyncResult> {
  const out: SyncResult = { acceptedIds: [], duplicateIds: [], failed: [] };

  for (const item of items) {
    const id = typeof item.entityId === "string" ? item.entityId : "unknown";
    if (typeof item.operationId !== "string" || !uuid.test(item.operationId) || item.entityType !== "masterSystemInspection" || item.action !== "create"
      || typeof item.entityId !== "string" || !uuid.test(item.entityId) || !rec(item.payload)) {
      out.failed.push(fail(id, "VALIDATION_ERROR", "Hydrant sync operation is invalid"));
      continue;
    }
    const candidate = item.payload;
    const originalCreatorSnapshot = creator(candidate.originalCreatorSnapshot);

    if (
      !exactKeys(candidate, ["clientUuid", "jobId", "systemKey", "instanceKey", "configuredZoneId", "configuredLocationId", "displaySequence", "originalCreatorSnapshot", "masterTemplate", "configuration", "inspectionSnapshot", "responses", "performedAt"])
      || originalCreatorSnapshot === undefined
      || candidate.clientUuid !== id
      || !uuid.test(id)
      || candidate.systemKey !== "hydrant"
      || typeof candidate.jobId !== "string"
      || !uuid.test(candidate.jobId)
      || candidate.instanceKey !== "primary"
      || candidate.configuredZoneId !== null
      || candidate.configuredLocationId !== null
      || candidate.displaySequence !== 1
      || !rec(candidate.masterTemplate)
      || !exactKeys(candidate.masterTemplate, ["id", "code", "version"])
      || typeof candidate.masterTemplate.id !== "string"
      || !uuid.test(candidate.masterTemplate.id)
      || candidate.masterTemplate.code !== "MFE-FSSR"
      || !Number.isSafeInteger(candidate.masterTemplate.version) || Number(candidate.masterTemplate.version) < 1
      || !rec(candidate.configuration)
      || !exactKeys(candidate.configuration, ["revisionId", "revisionNumber"])
      || typeof candidate.configuration.revisionId !== "string"
      || !uuid.test(candidate.configuration.revisionId)
      || !Number.isInteger(candidate.configuration.revisionNumber)
      || !rec(candidate.inspectionSnapshot)
      || !validClientSnapshot(candidate.inspectionSnapshot)
      || !valid(candidate.responses)
      || !timestamp(candidate.performedAt)
    ) {
      out.failed.push(fail(id, "VALIDATION_ERROR", "Hydrant inspection payload is invalid"));
      continue;
    }
    const p = { ...candidate, originalCreatorSnapshot } as HydrantPayload;

    const client = await pool.connect();
    let fingerprint = "";

    try {
      await client.query("BEGIN");

      const job = await client.query<{ configuration_snapshot: R; status: string; job_reference: string; title: string }>(
        "SELECT configuration_snapshot,status,job_reference,title FROM inspection_jobs WHERE id=$1 FOR UPDATE",
        [p.jobId]
      );
      const j = job.rows[0];
      const jobSnapshot = j && rec(j.configuration_snapshot) ? j.configuration_snapshot : undefined;
      const systems = jobSnapshot && Array.isArray(jobSnapshot.enabledSystems)
        ? jobSnapshot.enabledSystems.filter(rec)
        : [];
      const hydrantSystems = systems.filter((system) => system.systemKey === "hydrant" && system.definitionStatus === "confirmed");
      const configuration = jobSnapshot && rec(jobSnapshot.configuration) ? jobSnapshot.configuration : undefined;
      const template = jobSnapshot && rec(jobSnapshot.template) ? jobSnapshot.template : undefined;
      const customer = jobSnapshot && rec(jobSnapshot.customer) ? jobSnapshot.customer : undefined;
      if (!j || hydrantSystems.length !== 1
        || !configuration || configuration.revisionId !== p.configuration.revisionId || configuration.revisionNumber !== p.configuration.revisionNumber
        || !template || template.id !== p.masterTemplate.id || template.code !== "MFE-FSSR" || template.version !== p.masterTemplate.version
        || !validCustomer(customer) || !validConfiguration(configuration) || !validTemplate(template)) {
        await client.query("ROLLBACK");
        out.failed.push(fail(id, "VALIDATION_ERROR", "Hydrant job configuration is unavailable"));
        continue;
      }

      const definition = await client.query<{ definition: R; definition_status: string }>(
        "SELECT definition, definition_status FROM master_service_report_systems WHERE template_version_id=$1 AND system_key='hydrant'",
        [p.masterTemplate.id]
      );
      if (definition.rowCount !== 1 || !isCompatibleSystemContract("hydrant", definition.rows[0].definition_status, definition.rows[0].definition)) {
        await client.query("ROLLBACK");
        out.failed.push(fail(id, "VALIDATION_ERROR", "Hydrant definition is unavailable"));
        continue;
      }

      const expectedRows = expectedConfiguredHydrantRows(hydrantSystems[0]);
      if (!expectedRows || !configuredHydrantRowsMatch(p.responses, expectedRows)) {
        await client.query("ROLLBACK");
        out.failed.push(fail(id, "VALIDATION_ERROR", "Hydrant configured row identity is invalid"));
        continue;
      }

      const authority = {
        job: { id: p.jobId, reference: j.job_reference, title: j.title },
        customer,
        configuration,
        template,
        system: {
          ...hydrantSystems[0],
          definition: definition.rows[0].definition,
          repetitionMode: "single_with_repeatable_rows"
        }
      };
      const clientSnapshot = {
        schemaVersion: 1,
        capturedAt: p.inspectionSnapshot.capturedAt,
        ...authority
      };
      if (canonicalize(p.inspectionSnapshot) !== canonicalize(clientSnapshot)) {
        await client.query("ROLLBACK");
        out.failed.push(fail(id, "VALIDATION_ERROR", "Hydrant inspection snapshot does not match the authoritative job configuration"));
        continue;
      }

      fingerprint = createHash("sha256")
        .update(canonicalize(p))
        .digest("hex");
      const old = await client.query<{ request_fingerprint: string }>(
        "SELECT request_fingerprint FROM master_system_form_instances WHERE client_uuid=$1",
        [id]
      );
      if (old.rowCount) {
        await client.query("ROLLBACK");
        if (old.rows[0].request_fingerprint === fingerprint) out.duplicateIds.push(id);
        else out.failed.push(fail(id, "IDEMPOTENCY_CONFLICT", "This UUID was already accepted with different Hydrant data"));
        continue;
      }
      if (j.status !== "open") {
        await client.query("ROLLBACK");
        out.failed.push(fail(id, "JOB_CLOSED", "Inspection job is completed"));
        continue;
      }

      const existing = await client.query(
        "SELECT 1 FROM master_system_inspections WHERE job_id=$1 AND system_key='hydrant' FOR UPDATE",
        [p.jobId]
      );
      if (existing.rowCount) {
        await client.query("ROLLBACK");
        out.failed.push(fail(id, "ACTIVE_INSPECTION_EXISTS", "This job already has a Hydrant inspection"));
        continue;
      }

      const gid = randomUUID();
      const iid = randomUUID();
      const snapshot = {
        acceptedAt: new Date().toISOString(),
        schemaVersion: 1,
        ...authority
      };

      await client.query(
        "INSERT INTO master_system_inspections(id,job_id,system_key,created_by_user_id)VALUES($1,$2,'hydrant',$3)",
        [gid, p.jobId, actorUserId ?? null]
      );
      await client.query(
        "INSERT INTO master_system_form_instances(id,inspection_group_id,client_uuid,instance_key,display_sequence,master_template_version_id,customer_configuration_revision_id,snapshot_schema_version,inspection_snapshot,response_schema_version,response_payload,request_fingerprint,status,performed_at,original_creator_snapshot,synced_by_user_id)VALUES($1,$2,$3,'primary',1,$4,$5,1,$6,1,$7,$8,'submitted',$9,$10,$11)",
        [
          iid,
          gid,
          id,
          p.masterTemplate.id,
          p.configuration.revisionId,
          snapshot,
          p.responses,
          fingerprint,
          p.performedAt,
          p.originalCreatorSnapshot ?? null,
          actorUserId
        ]
      );
      await client.query("COMMIT");
      out.acceptedIds.push(id);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (!isExpectedUniqueViolation(error) || !fingerprint) {
        out.failed.push(fail(id, "SERVER_ERROR", "Hydrant inspection could not be saved"));
      } else {
        const old = await pool.query<{ request_fingerprint: string }>(
          "SELECT request_fingerprint FROM master_system_form_instances WHERE client_uuid=$1",
          [id]
        );
        if (old.rowCount && old.rows[0].request_fingerprint === fingerprint) out.duplicateIds.push(id);
        else if (old.rowCount) out.failed.push(fail(id, "IDEMPOTENCY_CONFLICT", "This UUID was already accepted with different Hydrant data"));
        else out.failed.push(fail(id, "ACTIVE_INSPECTION_EXISTS", "This job already has a Hydrant inspection"));
      }
    } finally {
      client.release();
    }
  }

  return out;
}
