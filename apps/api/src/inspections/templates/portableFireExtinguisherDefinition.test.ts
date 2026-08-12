import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV4 } from "./masterServiceReportV4.js";
import { masterServiceReportV5, portableFireExtinguisherV5 } from "./masterServiceReportV5.js";
import { classifyPortableUniqueViolationForTest, validatePortableSyncItemForTest } from "../../sync/portableFireExtinguisherSync.js";
import { pool } from "../../db/pool.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function item() {
  const at = "2026-08-11T00:00:00.000Z";
  const jobId=id(1), customerId=id(2), templateId=id(3), revisionId=id(4), enabledSystemId=id(5), clientUuid=id(6);
  return { operationId:id(7), entityType:"masterSystemInspection", entityId:clientUuid, action:"create", payload:{ clientUuid, jobId, systemKey:"portable_fire_extinguisher", instanceKey:"primary", configuredZoneId:null, configuredLocationId:null, displaySequence:1, originalCreatorSnapshot:{source:"device_reported",userId:1,username:"inspector",role:"inspector",capturedAt:at}, masterTemplate:{id:templateId,code:"MFE-FSSR",version:5}, configuration:{revisionId,revisionNumber:1}, inspectionSnapshot:{schemaVersion:1,capturedAt:at,job:{id:jobId,reference:"PORTABLE",title:"Portable"},customer:{id:customerId,code:"TEST",displayName:"Test"},configuration:{revisionId,revisionNumber:1},template:{id:templateId,code:"MFE-FSSR",name:"MFE Fire System Service Report Template",version:5},system:{enabledSystemId,systemKey:"portable_fire_extinguisher",displayName:"Portable Fire Extinguisher",sortOrder:9,definitionStatus:"confirmed",zones:[],locations:[],definition:portableFireExtinguisherV5,repetitionMode:"single_quantity_summary"}}, responses:{schemaVersion:1,total:1,dryPowder9kg:1,co2_2kg:0,others:"",comments:""},performedAt:at} } as any;
}

test("Portable Fire Extinguisher V5 publishes only the authoritative V1 quantity form", () => {
  const prior = masterServiceReportV4.systems.find((system) => system.key === "portable_fire_extinguisher")!;
  assert.equal(prior.definitionStatus, "requires_confirmation");
  assert.equal(masterServiceReportV5.version, 5);
  assert.equal(masterServiceReportV5.systems.find((system) => system.key === "portable_fire_extinguisher"), portableFireExtinguisherV5);
  assert.deepEqual(portableFireExtinguisherV5.configuration, { supportsZones: false, supportsLocations: false, supportsPresetRows: false });
  const quantities = portableFireExtinguisherV5.sections[0]?.blocks[0];
  assert.equal(quantities?.type, "quantity_summary");
  assert.deepEqual(quantities?.type === "quantity_summary" && quantities.items.map((item) => [item.key, item.label, item.control]), [
    ["total", "Total Fire Extinguisher", "count"],
    ["dry_powder_9kg", "9KG Dry Powder Fire Extinguisher", "count"],
    ["co2_2kg", "2KG CO2 Portable Fire Extinguisher", "count"],
    ["others", "Others", "text"]
  ]);
  assert.equal(portableFireExtinguisherV5.sections[0]?.blocks[1]?.type, "comments");
});

test("Portable sync rejects malformed closed envelope, provenance, timestamp, and snapshot shapes before persistence", async (t) => {
  const rejects = [
    ["unknown envelope", (v:any) => v.extra=true], ["unknown payload", (v:any) => v.payload.extra=true],
    ["empty snapshot", (v:any) => v.payload.inspectionSnapshot={}], ["unknown snapshot", (v:any) => v.payload.inspectionSnapshot.extra=true],
    ["unknown provenance", (v:any) => v.payload.originalCreatorSnapshot.extra=true], ["non-positive creator", (v:any) => v.payload.originalCreatorSnapshot.userId=0],
    ["empty username", (v:any) => v.payload.originalCreatorSnapshot.username=""], ["overlong username", (v:any) => v.payload.originalCreatorSnapshot.username="x".repeat(161)],
    ["impossible timestamp", (v:any) => v.payload.performedAt="2026-02-31T00:00:00.000Z"], ["noncanonical timestamp", (v:any) => v.payload.performedAt="2026-08-11T00:00:00Z"],
    ["unknown definition key", (v:any) => v.payload.inspectionSnapshot.system.definition.extra=true]
  ] as const;
  assert.ok(validatePortableSyncItemForTest(item()).payload);
  for (const [name, mutate] of rejects) await t.test(name, () => { const value=item(); mutate(value); assert.equal(validatePortableSyncItemForTest(value).payload, undefined); });
});

test("Portable unique-conflict classifier is deterministic for UUID and authority races", async () => {
  const original=(pool as any).query;
  try {
    (pool as any).query=async()=>({rowCount:1,rows:[{request_fingerprint:"same"}]});
    assert.deepEqual(await classifyPortableUniqueViolationForTest({code:"23505",constraint:"master_system_form_instances_client_uuid_key"},id(6),id(1),"same"),{duplicate:true});
    assert.equal((await classifyPortableUniqueViolationForTest({code:"23505",constraint:"master_system_form_instances_client_uuid_key"},id(6),id(1),"different"))?.failure?.code,"IDEMPOTENCY_CONFLICT");
    (pool as any).query=async(sql:string)=>sql.startsWith("SELECT request_fingerprint")?({rowCount:0,rows:[]}):({rowCount:1,rows:[{}]});
    assert.equal((await classifyPortableUniqueViolationForTest({code:"23505",constraint:"master_system_inspections_job_id_system_key_key"},id(6),id(1),"same"))?.failure?.code,"ACTIVE_INSPECTION_EXISTS");
  } finally { (pool as any).query=original; }
});
