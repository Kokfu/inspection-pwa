import test from "node:test";
import assert from "node:assert/strict";
import {historicalFixture,legacyFireAlarmV7Fixture} from "./historicalFixtures.js";
import {fixture} from "./repairFixtures.js";
import {readFindingParts,resolveRepairField,type R} from "./findingReaders.js";
for (const system of ["co2_fire_extinguisher","wet_chemical","hose_reel","automatic_sprinkler","dry_wet_riser","hydrant","fire_alarm_detector"]) test(`${system}: historical Poor without a required Before photo`,()=>{
  const extracted=readFindingParts(historicalFixture(system));
  assert.ok(extracted.parts.length>0);
  assert.ok(extracted.parts.every(p => p.result==="poor"));
  assert.equal(extracted.requiredPaths.length,0);
  assert.deepEqual(extracted.manifest,[]);
});
test("Fire Alarm V6 never receives the pre-V6 missing-photo exception",()=>{
  const row=historicalFixture("fire_alarm_detector",true);
  const source=readFindingParts(row);assert.equal(source.requiredPaths.length,source.parts.length);assert.ok(source.parts.length>0);
  const badState=structuredClone(row);(((badState.responses as Record<string,unknown>).primaryDeviceRows) as Record<string,unknown>[])[0]!.smokeDetector=["normal"];
  assert.throws(()=>readFindingParts(badState),/invalid/);
  (row.inspectionSnapshot as Record<string,unknown>).evidenceManifest=[];
  assert.throws(()=>readFindingParts(row),/invalid/);
});


test("frozen legacy Fire Alarm V7: scalar states, exact Poor findings and immutable source",()=>{
  const row=legacyFireAlarmV7Fixture(), original=structuredClone(row), snapshot=row.inspectionSnapshot as R;
  const source=readFindingParts(row);
  const manifest=snapshot.evidenceManifest as Array<{fieldPath:string}>;
  assert.equal(source.parts.length,10);
  assert.deepEqual(source.parts.map(p=>p.fieldPath).sort(),manifest.map(m=>m.fieldPath).sort());
  assert.deepEqual(source.requiredPaths.slice().sort(),manifest.map(m=>m.fieldPath).sort());
  assert.ok(source.parts.every(p=>p.result==="poor"&&p.remark==="Own original remark"));
  for(const p of source.parts) assert.equal(resolveRepairField("fire_alarm_detector",row.responses as R,p.fieldPath)?.result,"poor");
  assert.ok(source.parts.some(p=>p.rowUuid&&p.responsePath.startsWith("secondaryAlarmDeviceRows.")));
  assert.deepEqual(row,original,"validation must not upgrade frozen detector states or result values");
});

test("frozen legacy Fire Alarm V7 rejects changed controls, malformed scalar states and manifests",()=>{
  const bad=(change:(row:R)=>void)=>{const row=legacyFireAlarmV7Fixture();change(row);assert.throws(()=>readFindingParts(row),/invalid/);};
  bad(row=>{((row.responses as R).primaryDeviceRows as R[])[0]!.smokeDetector=["normal"];});
  bad(row=>{((row.responses as R).primaryDeviceRows as R[])[0]!.smokeDetector="unknown";});
  bad(row=>{((row.responses as R).chargerAndBatteries as R).main_supply={result:"not_good",remarks:"forged"};});
  bad(row=>{((row.responses as R).chargerAndBatteries as R).main_supply={result:"complete_repair",remarks:"forged"};});
  bad(row=>{((row.responses as R).secondaryAlarmDeviceRows as R[])[0]!.fieldRemarks={alarmBell:""};});
  bad(row=>{(row.inspectionSnapshot as R).evidenceManifest=[];});
  bad(row=>{const manifest=(row.inspectionSnapshot as R).evidenceManifest as R[];manifest[0]!.fieldPath="foreign.path";});
  bad(row=>{const manifest=(row.inspectionSnapshot as R).evidenceManifest as R[];manifest[1]!.photoUuid=manifest[0]!.photoUuid;});
  bad(row=>{const manifest=(row.inspectionSnapshot as R).evidenceManifest as R[];manifest[1]!.sourceSha256=manifest[0]!.sourceSha256;});
  bad(row=>{const manifest=(row.inspectionSnapshot as R).evidenceManifest as R[];manifest[0]!.extra=true;});
  bad(row=>{const definition=((row.inspectionSnapshot as R).system as R).definition as R;definition.displayName="Unrecognized contract";});
});

test("legacy V7 non-findings remain excluded and current V7 still requires multiselect detector states",()=>{
  for(const state of ["good","not_relevant"]) {
    const row=legacyFireAlarmV7Fixture(), response=row.responses as R;
    for(const group of ["chargerAndBatteries","mainFunctionKeys"]) for(const field of Object.values(response[group] as R)) Object.assign(field as R,{result:state,remarks:""});
    for(const item of response.secondaryAlarmDeviceRows as R[]) Object.assign(item,{alarmBell:state,manualCallPoint:state,fieldRemarks:{}});
    (row.inspectionSnapshot as R).evidenceManifest=[];
    assert.equal(readFindingParts(row).parts.length,0);
  }
  const current=fixture("fire_alarm_detector").row;
  ((current.responses as R).primaryDeviceRows as R[])[0]!.smokeDetector="normal";
  assert.throws(()=>readFindingParts(current),/invalid/);
});
