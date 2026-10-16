// Disposable-test fixtures only. No production seed or backfill entry point.
import { randomUUID } from "node:crypto";
import { masterServiceReportV7 } from "../inspections/templates/masterServiceReportV7.js";
import { resolveCo2Controls } from "../inspections/templates/co2DefinitionControls.js";
import { resolveFm200Controls } from "../inspections/templates/fm200DefinitionControls.js";
import { resolveFireAlarmV6Controls } from "../inspections/templates/fireAlarmDefinitionControls.js";
import { resolveV7EvidenceContract, v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";
import { resolveRepairField, type R } from "./findingReaders.js";
export const systems = ["co2_fire_extinguisher","wet_chemical","fm200_fire_suppression","fire_alarm_detector","hydrant","hose_reel","automatic_sprinkler","dry_wet_riser","smoke_ventilation","fire_intercom","fire_rated_roller_shutter"];
const v = () => ({result:"good",remarks:""});
export function fixture(systemKey: string) {
  const definition = JSON.parse(JSON.stringify(masterServiceReportV7.systems.find(s => s.key===systemKey)!)) as typeof masterServiceReportV7.systems[number];
  const checklist = Object.fromEntries(definition.sections.flatMap(s => s.blocks.flatMap(b => b.type==="checklist" ? b.items.filter(f => f.control==="good_poor").map(f => [f.key,v()]) : [])));
  const measurements = Object.fromEntries(definition.sections.flatMap(s => s.blocks.flatMap(b => b.type==="measurement" ? b.items.map(f => [f.key,{values:Object.fromEntries(f.measurements.map(m => [m.key,80])),unit:"PSI",...v()}]) : [])));
  const baseRow = { rowUuid:randomUUID(),source:"technician",configuredLocationId:null,configuredRowOrdinal:null,zoneSnapshot:null,locationSnapshot:null,assetReference:"",remarks:"",fieldRemarks:{},sortOrder:1 };
  const rows = (keys: string[], location = true) => [{...baseRow,...(location ? {locationText:"Room"} : {}),...Object.fromEntries(keys.map(k => [k,"good"]))}];
  const response: R = {comments:""};
  if (["co2_fire_extinguisher","wet_chemical","fm200_fire_suppression","fire_alarm_detector"].includes(systemKey)) {
    for (const [section,group] of [["charger_batteries","chargerAndBatteries"],["physical_outlook","physicalOutlook"],["main_function_key","mainFunctionKeys"]]) {
      const def = definition.sections.find(s => s.key===section);
      if (def) response[group!] = Object.fromEntries(def.blocks.flatMap(b => b.type==="checklist" ? b.items.filter(f => f.control==="good_poor").map(f => [f.key,v()]) : []));
    }
    if (systemKey==="fire_alarm_detector") Object.assign(response,{schemaVersion:2,controlPanelLocation:"Lobby",primaryDeviceRows:[{rowUuid:randomUUID(),source:"technician",configuredLocationId:null,configuredRowOrdinal:null,zoneSnapshot:null,locationSnapshot:null,displaySequence:1,assetReference:"",alarmZone:"Lobby",location:"Lobby",manualCallPoint:["normal"],flowSwitch:["normal"],heatDetector:["normal"],smokeDetector:["normal"],remarks:""}],secondaryAlarmDeviceRows:[{rowUuid:baseRow.rowUuid,source:"technician",configuredLocationId:null,configuredRowOrdinal:null,zoneSnapshot:null,locationSnapshot:null,displaySequence:1,assetReference:"",location:"Lobby",alarmBell:"good",manualCallPoint:"good",remarks:"",fieldRemarks:{}}]});
  } else {
    if (Object.keys(checklist).length) response.checklist=checklist;
    if (Object.keys(measurements).length) response.measurements=measurements;
    if (systemKey==="hydrant") Object.assign(response,{schemaVersion:1,hydrantType:"pressurize",rows:rows(["canvasHose1Result","canvasHose2Result","diffuserNozzleResult","landingValveResult","landingValveHandleResult","hoseCabinetResult","keyLockResult"])});
    if (systemKey==="hose_reel") {
      const drums=rows(["drumResult","hoseResult","nozzleResult","valveResult","nozzleBoxResult"]);
      delete (drums[0] as R).configuredRowOrdinal;
      Object.assign(response,{schemaVersion:2,drumTypes:{swing:true,fixed:false},rows:drums});
    }
    if (systemKey==="automatic_sprinkler") response.schemaVersion=2;
    if (systemKey==="dry_wet_riser") Object.assign(response,{schemaVersion:2,mode:"wet",riserOutlets:rows(["canvasHoseAt2Result","diffuserNozzleResult","landingValveResult","crandleResult","doorResult"])});
    if (systemKey==="smoke_ventilation") Object.assign(response,{schemaVersion:1,controlPanelNo:"",location:"",dateTested:"",rows:rows(["autoResult","manualResult"],false)});
    if (systemKey==="fire_intercom") Object.assign(response,{schemaVersion:1,rows:rows(["conditionResult"],false)});
    if (systemKey==="fire_rated_roller_shutter") Object.assign(response,{schemaVersion:1,dateTested:"",zone:"",inspectedBy:"",rows:rows(["autoAlarmModeResult","manualModeResult"])});
  }
  const contractSha256 = v7EvidenceContractSha256(definition);
  const adapter = resolveV7EvidenceContract({systemKey,templateId:masterServiceReportV7.id,templateVersion:7,definition,contractSha256})!;
  const paths = adapter.derivePhotoFieldPaths(response)!.optional;
  for (const p of paths) setResult(systemKey,response,p,"not_good");
  const manifest = adapter.derivePoorFieldPaths(response)!.map((fieldPath,index) => ({photoUuid:randomUUID(),fieldPath,sourceSha256:index.toString(16).padStart(64,"0")}));
  const jobId = randomUUID(), revisionId = randomUUID();
  const instance = {instanceKey:"primary",displaySequence:1,zone:null,location:null} as R;
  const system: R = {key:systemKey,systemKey,definition,displayName:systemKey,definitionStatus:"confirmed",repetitionMode:systemKey==="automatic_sprinkler" ? "single" : "single_with_repeatable_rows"};
  const suppression = ["co2_fire_extinguisher","wet_chemical","fm200_fire_suppression"].includes(systemKey);
  if (suppression) {
    Object.assign(response,{controlPanelLocation:"Room",detectorRows:[{rowUuid:randomUUID(),displaySequence:1,alarmZone:"Room",location:"Room",heatDetectorStatus:["normal"],smokeDetectorStatus:["normal"],remarks:""}]});
    delete system.systemKey; delete system.definitionStatus; system.repetitionMode="per_location";
    system.resolvedControls=systemKey==="fm200_fire_suppression" ? resolveFm200Controls(definition,"MFE-FSSR",7) : resolveCo2Controls(definition,"MFE-FSSR",7);
    instance.location={id:randomUUID(),displayName:"Room"}; instance.instanceKey=`location:${(instance.location as R).id}`;
  }
  if (systemKey==="fire_alarm_detector") system.resolvedControls=resolveFireAlarmV6Controls(definition,7);
  if (systemKey==="dry_wet_riser") system.systemConfiguration={riserMode:"wet"};
  const snapshot = {schemaVersion:2,acceptedAt:"2026-10-12T00:00:00.000Z",job:{id:jobId,reference:"fixture",title:"fixture"},customer:{id:randomUUID(),code:"fixture",displayName:"Fixture"},configuration:{revisionId,revisionNumber:1},template:{id:masterServiceReportV7.id,code:"MFE-FSSR",version:7},system,instance,...(suppression ? {} : {contractSha256,evidenceManifest:manifest})};
  const row: R = {clientUuid:randomUUID(),serverFormInstanceId:randomUUID(),jobId,jobReference:"fixture",jobTitle:"fixture",customerName:"Fixture",systemKey,instanceKey:instance.instanceKey,zoneId:null,locationId:suppression ? (instance.location as R).id : null,displaySequence:1,status:"submitted",performedAt:"2026-10-12T00:00:00.000000Z",receivedAt:"2026-10-12T00:00:00.000000Z",templateId:masterServiceReportV7.id,configurationRevisionId:revisionId,inspectionSnapshot:snapshot,responses:response,deviceReportedCreatorUsername:null,verifiedOriginalCreatorUsername:null,syncedByUsername:"fixture"};
  return {row,response,snapshot,manifest,adapter,definition};
}
export function setResult(system: string, response: R, path: string, result: string) {
  const field = resolveRepairField(system,response,path)!;
  const segments=field.responsePath.split("."); let parent: unknown=response;
  for (const segment of segments.slice(0,-1)) parent=Array.isArray(parent) ? parent.find(row => row.rowUuid===segment) : (parent as R)[segment];
  (parent as R)[segments.at(-1)!]=result;
  if (field.rowUuid) ((parent as R).fieldRemarks as R)[segments.at(-1)!]="Own original remark";
  else (parent as R).remarks="Own original remark";
}
