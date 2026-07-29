import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { resolveCo2Controls } from "../inspections/templates/co2DefinitionControls.js";
import { syncCo2FormInstances } from "../sync/co2FormInstanceSync.js";

type Any = Record<string, any>;
type Case = { customerId: string; revisionId: string; enabledId: string; jobId: string; templateId: string; snapshot: Any };
const report: Record<string, unknown> = {};
let actorUserId: number | undefined;
const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
const failureCode = (result: any) => result.failed?.[0]?.code;
const sourceJobId = "00000000-0000-4000-8000-000000000679";

async function createCase(): Promise<Case> {
  const base = (await pool.query<any>("SELECT master_template_version_id AS \"templateId\", configuration_snapshot AS snapshot FROM inspection_jobs WHERE id=$1", [sourceJobId])).rows[0];
  assert(base, "CO2 source fixture is unavailable");
  const item: Case = { customerId: randomUUID(), revisionId: randomUUID(), enabledId: randomUUID(), jobId: randomUUID(), templateId: base.templateId, snapshot: structuredClone(base.snapshot) };
  item.snapshot.customer = { id: item.customerId, code: `VALIDATION-CO2-${item.jobId}`, displayName: "Disposable CO2 Validation" };
  item.snapshot.configuration = { revisionId: item.revisionId, revisionNumber: 1 };
  const system = item.snapshot.enabledSystems.find((value: Any) => value.systemKey === "co2_fire_extinguisher");
  assert(system?.locations?.length >= 2, "CO2 fixture does not have two configured locations");
  system.enabledSystemId = item.enabledId;
  const zoneIds = new Map(system.zones.map((zone: Any) => [zone.id, randomUUID()]));
  for (const zone of system.zones) {
    zone.id = zoneIds.get(zone.id);
    zone.enabledSystemId = item.enabledId;
  }
  for (const location of system.locations) {
    location.id = randomUUID();
    location.enabledSystemId = item.enabledId;
    location.zoneId = location.zoneId === null ? null : zoneIds.get(location.zoneId);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO customers(id,customer_code,display_name,is_demo) VALUES($1,$2,$3,true)", [item.customerId, item.snapshot.customer.code, item.snapshot.customer.displayName]);
    await client.query("INSERT INTO customer_configuration_revisions(id,customer_id,template_version_id,revision,status) VALUES($1,$2,$3,1,'active')", [item.revisionId, item.customerId, item.templateId]);
    await client.query("INSERT INTO customer_enabled_systems(id,configuration_revision_id,template_version_id,system_key,sort_order,system_configuration) VALUES($1,$2,$3,'co2_fire_extinguisher',1,'{}'::jsonb)", [item.enabledId, item.revisionId, item.templateId]);
    for (const zone of system.zones) {
      await client.query("INSERT INTO customer_system_zones(id,enabled_system_id,zone_key,display_name,sort_order) VALUES($1,$2,$3,$4,$5)", [zone.id, item.enabledId, zone.key, zone.displayName, zone.sortOrder]);
    }
    for (const location of system.locations) {
      await client.query("INSERT INTO customer_system_locations(id,enabled_system_id,zone_id,location_key,display_name,preset_row_count,row_preset,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [location.id, item.enabledId, location.zoneId, location.key, location.displayName, location.presetRowCount, location.rowPreset, location.sortOrder]);
    }
    await client.query("INSERT INTO inspection_jobs(id,template_id,master_template_version_id,job_reference,title,status,is_sample,customer_id,customer_configuration_revision_id,configuration_snapshot) VALUES($1,NULL,$2,$3,'Disposable CO2 Validation','open',true,$4,$5,$6)", [item.jobId, item.templateId, `VALIDATION-CO2-${item.jobId}`, item.customerId, item.revisionId, item.snapshot]);
    await client.query("COMMIT");
    return item;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function payload(c: Case, locationIndex = 0, clientUuid = randomUUID()) {
  const system = c.snapshot.enabledSystems.find((value: Any) => value.systemKey === "co2_fire_extinguisher");
  const location = system.locations[locationIndex];
  const zone = location.zoneId === null ? null : system.zones.find((value: Any) => value.id === location.zoneId);
  const ordered = system.locations.slice().sort((a: Any, b: Any) => (system.zones.find((z: Any) => z.id === a.zoneId)?.sortOrder ?? Number.MAX_SAFE_INTEGER) - (system.zones.find((z: Any) => z.id === b.zoneId)?.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const definition = (await pool.query<any>("SELECT definition FROM master_service_report_systems WHERE template_version_id=$1 AND system_key='co2_fire_extinguisher'", [c.templateId])).rows[0]?.definition;
  const controls = resolveCo2Controls(definition, "MFE-FSSR", 1);
  const checklist = (items: any[]) => Object.fromEntries(items.map((value) => [value.key, { result: "good", remarks: "" }]));
  return { operationId: randomUUID(), entityType: "masterSystemFormInstance", entityId: clientUuid, action: "create", payload: {
    clientUuid, jobId: c.jobId, systemKey: "co2_fire_extinguisher", instanceKey: `location:${location.id}`,
    configuredZoneId: zone?.id ?? null, configuredLocationId: location.id, displaySequence: ordered.findIndex((value: Any) => value.id === location.id) + 1,
    originalCreatorSnapshot: null, masterTemplate: { id: c.templateId, code: "MFE-FSSR", version: 1 }, configuration: { revisionId: c.revisionId, revisionNumber: 1 },
    inspectionSnapshot: structuredClone(c.snapshot), responses: {
      controlPanelLocation: location.displayName, detectorRows: [{ rowUuid: randomUUID(), displaySequence: 1, alarmZone: zone?.displayName ?? "Unzoned", location: location.displayName, heatDetectorStatus: "normal", smokeDetectorStatus: null, remarks: "" }],
      chargerAndBatteries: checklist(controls.chargerAndBatteries), physicalOutlook: checklist(controls.physicalOutlook), mainFunctionKeys: checklist(controls.mainFunctionKeys), comments: "validation"
    }, performedAt: "2026-07-29T00:00:00.000Z"
  }};
}
const submit = (item: any) => syncCo2FormInstances([item], actorUserId);
async function cleanup() {
  const matching = "customer_code LIKE 'VALIDATION-CO2-%'";
  await pool.query(`DELETE FROM master_system_form_instances WHERE inspection_group_id IN (SELECT i.id FROM master_system_inspections i JOIN inspection_jobs j ON j.id=i.job_id JOIN customers c ON c.id=j.customer_id WHERE ${matching})`);
  await pool.query(`DELETE FROM master_system_inspections WHERE job_id IN (SELECT j.id FROM inspection_jobs j JOIN customers c ON c.id=j.customer_id WHERE ${matching})`);
  await pool.query(`DELETE FROM inspection_jobs WHERE customer_id IN (SELECT id FROM customers WHERE ${matching})`);
  await pool.query(`DELETE FROM customer_system_locations WHERE enabled_system_id IN (SELECT id FROM customer_enabled_systems WHERE configuration_revision_id IN (SELECT id FROM customer_configuration_revisions WHERE customer_id IN (SELECT id FROM customers WHERE ${matching})))`);
  await pool.query(`DELETE FROM customer_system_zones WHERE enabled_system_id IN (SELECT id FROM customer_enabled_systems WHERE configuration_revision_id IN (SELECT id FROM customer_configuration_revisions WHERE customer_id IN (SELECT id FROM customers WHERE ${matching})))`);
  await pool.query(`DELETE FROM customer_enabled_systems WHERE configuration_revision_id IN (SELECT id FROM customer_configuration_revisions WHERE customer_id IN (SELECT id FROM customers WHERE ${matching}))`);
  await pool.query(`DELETE FROM customer_configuration_revisions WHERE customer_id IN (SELECT id FROM customers WHERE ${matching})`);
  await pool.query(`DELETE FROM customers WHERE ${matching}`);
}

async function main() {
  try {
    await cleanup(); actorUserId = (await pool.query<{ id: number }>("SELECT id FROM users WHERE is_active=true ORDER BY id LIMIT 1")).rows[0]?.id; assert(actorUserId, "validation actor is unavailable");
    const firstCase = await createCase(), first = await payload(firstCase), accepted = await submit(first);
    assert(accepted.acceptedIds[0] === first.entityId, `one-location acceptance: ${JSON.stringify(accepted)}`);
    const stored = (await pool.query<any>("SELECT i.job_id, f.instance_key, f.zone_snapshot, f.location_snapshot, f.display_sequence, f.synced_by_user_id, f.inspection_snapshot FROM master_system_form_instances f JOIN master_system_inspections i ON i.id=f.inspection_group_id WHERE f.client_uuid=$1", [first.entityId])).rows[0];
    assert(stored.job_id === firstCase.jobId && stored.instance_key === first.payload.instanceKey && stored.location_snapshot.id === first.payload.configuredLocationId && stored.synced_by_user_id === actorUserId && stored.inspection_snapshot.instance.location.id === first.payload.configuredLocationId, "accepted location was not canonically stored"); report.oneLocationAndCanonicalReadback = true;
    const second = await payload(firstCase, 1); assert((await submit(second)).acceptedIds[0] === second.entityId, "independent second location was not accepted");
    assert((await pool.query("SELECT 1 FROM master_system_inspections WHERE job_id=$1 AND system_key='co2_fire_extinguisher'", [firstCase.jobId])).rowCount === 1 && (await pool.query("SELECT 1 FROM master_system_form_instances f JOIN master_system_inspections i ON i.id=f.inspection_group_id WHERE i.job_id=$1", [firstCase.jobId])).rowCount === 2, "independent locations did not share exactly one parent"); report.independentSecondLocation = true;
    assert((await submit(first)).duplicateIds[0] === first.entityId && (await pool.query("SELECT 1 FROM master_system_form_instances WHERE client_uuid=$1", [first.entityId])).rowCount === 1, "duplicate replay created a row"); report.duplicateReplay = true;
    const changed = structuredClone(first); changed.payload.responses.comments = "changed"; assert(failureCode(await submit(changed)) === "IDEMPOTENCY_CONFLICT", "changed replay did not conflict"); report.changedReplay = true;
    const competitor = await payload(firstCase, 0); assert(failureCode(await submit(competitor)) === "INSTANCE_ALREADY_EXISTS", "competing UUID did not conflict"); report.competingUuid = true;
    const concurrentCase = await createCase(), sameA = await payload(concurrentCase), sameB = await payload(concurrentCase), sameOutcomes = await Promise.all([submit(sameA), submit(sameB)]), sameCodes = sameOutcomes.map((value: any) => value.acceptedIds.length ? "ACCEPTED" : failureCode(value));
    assert(sameCodes.filter((value) => value === "ACCEPTED").length === 1 && sameCodes.filter((value) => value === "INSTANCE_ALREADY_EXISTS").length === 1, `same-location concurrency: ${sameCodes}`); report.concurrentSameLocation = sameCodes;
    const differentCase = await createCase(), differentOutcomes = await Promise.all([payload(differentCase, 0).then(submit), payload(differentCase, 1).then(submit)]);
    assert(differentOutcomes.every((value: any) => value.acceptedIds.length === 1), `different-location concurrency: ${JSON.stringify(differentOutcomes)}`); report.concurrentDifferentLocations = true;
    const partialCase = await createCase(), partialGood = await payload(partialCase, 0), partialBad = await payload(partialCase, 1); (partialBad.payload.responses.detectorRows[0] as any).rowUuid = "bad";
    const partial = await syncCo2FormInstances([partialGood, partialBad], actorUserId); assert(partial.acceptedIds.includes(partialGood.entityId) && failureCode({ failed: partial.failed.filter((value) => value.id === partialBad.entityId) }) === "VALIDATION_ERROR", "partial batch did not preserve exact outcomes"); report.partialBatch = true;
    const provenanceCases: Array<[string, (value: any) => void]> = [
      ["forged location", (v) => { v.payload.configuredLocationId = randomUUID(); }], ["forged zone", (v) => { v.payload.configuredZoneId = randomUUID(); }], ["forged instance key", (v) => { v.payload.instanceKey = `location:${randomUUID()}`; }], ["forged display order", (v) => { v.payload.displaySequence = 99; }], ["unknown response key", (v) => { v.payload.responses.extra = true; }], ["duplicate detector UUID", (v) => { v.payload.responses.detectorRows.push({ ...v.payload.responses.detectorRows[0] }); }], ["invalid detector", (v) => { v.payload.responses.detectorRows[0].heatDetectorStatus = "bad"; }], ["invalid good poor", (v) => { v.payload.responses.chargerAndBatteries[Object.keys(v.payload.responses.chargerAndBatteries)[0]].result = "bad"; }], ["malformed comments", (v) => { v.payload.responses.comments = 42; }]
    ];
    for (const [name, mutate] of provenanceCases) { const c = await createCase(), item = await payload(c); mutate(item); assert(failureCode(await submit(item)) === "VALIDATION_ERROR", `${name} was accepted`); }
    const canonicalCase = await createCase(), forgedSnapshot = await payload(canonicalCase); forgedSnapshot.payload.inspectionSnapshot.enabledSystems[0].locations[0].displayName = "FORGED"; assert((await submit(forgedSnapshot)).acceptedIds[0] === forgedSnapshot.entityId, "forged snapshot was not canonicalized"); const canonical = (await pool.query<any>("SELECT location_snapshot FROM master_system_form_instances WHERE client_uuid=$1", [forgedSnapshot.entityId])).rows[0]; assert(canonical.location_snapshot.displayName !== "FORGED", "server stored client snapshot name"); report.provenanceRejectionsAndCanonicalization = true;
    report.fixtureCompatibility = (await pool.query("SELECT 1 FROM customer_enabled_systems WHERE system_key='co2_fire_extinguisher' AND system_configuration='{}'::jsonb LIMIT 1")).rowCount === 1; assert(report.fixtureCompatibility, "CO2 fixture configuration changed");
    console.log(JSON.stringify({ status: "PASS", ...report }));
  } finally { await cleanup(); await pool.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
