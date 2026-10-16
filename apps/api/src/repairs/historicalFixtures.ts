

import { randomUUID } from "node:crypto";
import { masterServiceReportV1 } from "../inspections/templates/masterServiceReportV1.js";
import { masterServiceReportV2 } from "../inspections/templates/masterServiceReportV2.js";
import { masterServiceReportV3 } from "../inspections/templates/masterServiceReportV3.js";
import { masterServiceReportV4 } from "../inspections/templates/masterServiceReportV4.js";
import { masterServiceReportV5 } from "../inspections/templates/masterServiceReportV5.js";
import { masterServiceReportV6 } from "../inspections/templates/masterServiceReportV6.js";
import { resolveCo2Controls } from "../inspections/templates/co2DefinitionControls.js";
import { resolveHoseReelControls } from "../inspections/templates/definitionControls.js";
import { resolveAutomaticSprinklerControls } from "../inspections/templates/automaticSprinklerDefinitionControls.js";
import { resolveFireAlarmControls,resolveFireAlarmV6Controls } from "../inspections/templates/fireAlarmDefinitionControls.js";
import { v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";
import { fixture } from "./repairFixtures.js";
import { resolveRepairField, type R } from "./findingReaders.js";

export function historicalFixture(systemKey: string, fireAlarmV6 = false) {
  const f=fixture(systemKey), row=f.row, snapshot=f.snapshot as R;
  if (fireAlarmV6) {
    const definition=JSON.parse(JSON.stringify(masterServiceReportV6.systems.find(s=>s.key==="fire_alarm_detector")));
    snapshot.template={id:masterServiceReportV6.id,code:"MFE-FSSR",version:6};row.templateId=masterServiceReportV6.id;
    (snapshot.system as R).definition=definition;(snapshot.system as R).resolvedControls=resolveFireAlarmV6Controls(definition,6);
    snapshot.contractSha256=v7EvidenceContractSha256(definition);
    for(const group of ["chargerAndBatteries","mainFunctionKeys"]) for(const field of Object.values(f.response[group] as R)) (field as R).result="poor";
    for(const r of f.response.secondaryAlarmDeviceRows as R[]) {r.alarmBell="poor";r.manualCallPoint="poor";}
    for(const r of f.response.primaryDeviceRows as R[]) for(const k of ["manualCallPoint","flowSwitch","heatDetector","smokeDetector"]) r[k]="normal";
    return row;
  }
  const template = systemKey==="dry_wet_riser" ? masterServiceReportV2 : systemKey==="fire_alarm_detector" ? masterServiceReportV3 : systemKey==="wet_chemical" ? masterServiceReportV4 : systemKey==="hydrant" ? masterServiceReportV5 : masterServiceReportV1;
  const definition=template.systems.find(s => s.key===systemKey)!;
  const result=()=>({result:"poor",remarks:"Historical original remark"});
  const system: R={enabledSystemId:randomUUID(),systemKey,displayName:systemKey,sortOrder:1,definitionStatus:"confirmed",zones:[],locations:[],definition};
  const response: R={comments:""};
  let controls: unknown;
  if (["co2_fire_extinguisher","wet_chemical"].includes(systemKey)) {
    controls=resolveCo2Controls(definition,"MFE-FSSR",template.version);
    Object.assign(response,{controlPanelLocation:"Room",detectorRows:[{rowUuid:randomUUID(),displaySequence:1,alarmZone:"Room",location:"Room",heatDetectorStatus:"normal",smokeDetectorStatus:"normal",remarks:""}]});
    for (const group of ["chargerAndBatteries","physicalOutlook","mainFunctionKeys"]) response[group]=Object.fromEntries(((controls as R)[group] as Array<{key:string}>).map(c => [c.key,result()]));
    snapshot.system={key:systemKey,displayName:systemKey,definition,resolvedControls:controls,repetitionMode:"per_location"};
  } else if (systemKey==="hose_reel" || systemKey==="automatic_sprinkler") {
    controls=systemKey==="hose_reel" ? resolveHoseReelControls(definition,"MFE-FSSR",template.version) : resolveAutomaticSprinklerControls(definition,"MFE-FSSR",template.version);
    const checklist=(controls as R).checklist as Record<string,Array<{key:string}>>;
    if (systemKey==="hose_reel") response.checklist=Object.fromEntries(Object.values(checklist).flat().map(c => [c.key,result()]));
    else for (const [group,items] of Object.entries(checklist)) response[group]=Object.fromEntries(items.map(c => [c.key,result()]));
    response.measurements=Object.fromEntries(((controls as R).measurements as Array<{key:string;values:Array<{key:string}>}>).map(m => [m.key,{values:Object.fromEntries(m.values.map(v => [v.key,80])),unit:"PSI",...result()}]));
    if (systemKey==="hose_reel") {
      response.drumTypes={swing:true,fixed:false}; response.rows=structuredClone(f.response.rows);
      for (const r of response.rows as R[]) { delete r.fieldRemarks; for (const k of ["drumResult","hoseResult","nozzleResult","valveResult","nozzleBoxResult"]) r[k]="poor"; }
    } else response.schemaVersion=1;
    system.resolvedControls=controls; snapshot.system=system;
  } else if (systemKey==="hydrant") {
    Object.assign(response,structuredClone(f.response));
    for (const r of response.rows as R[]) { delete r.fieldRemarks; for (const k of ["canvasHose1Result","canvasHose2Result","diffuserNozzleResult","landingValveResult","landingValveHandleResult","hoseCabinetResult","keyLockResult"]) r[k]="poor"; }
    snapshot.system=system;
  } else if (systemKey==="dry_wet_riser") {
    const water=["saj_main_water_supply","water_level","automatic_refilling_facilities","drain_and_stop_valve_positions"];
    const pump=["pump_house_clean","manual_start_pumps","jockey_pump_pressure","duty_pump_cut_in","standby_pump_cut_in","standby_pump_service_items","battery_charging_alternator","battery_charger_failure_alarm","battery_serviceable","pump_phase_failure_alarm","pumps_auto_start","test_and_gate_valve_positions"];
    Object.assign(response,{schemaVersion:1,mode:"wet",waterTank:Object.fromEntries(water.map(k=>[k,result()])),pumpHouse:Object.fromEntries(pump.map(k=>[k,result()])),measurements:{jockeyCutIn:80,jockeyCutOut:100,dutyCutIn:70,standbyCutIn:60,unit:"PSI"},riserOutlets:structuredClone(f.response.riserOutlets)});
    for (const r of response.riserOutlets as R[]) {delete r.fieldRemarks; for(const k of ["canvasHoseAt2Result","diffuserNozzleResult","landingValveResult","crandleResult","doorResult"]) r[k]="poor";}
    system.systemConfiguration={riserMode:"wet"}; snapshot.system=system;
  } else if (systemKey==="fire_alarm_detector") {
    controls=resolveFireAlarmControls(definition,"MFE-FSSR",3); system.resolvedControls=controls; system.repetitionMode="single_with_two_repeatable_tables";
    system.displayName="Fire Alarm / Detector System";system.sortOrder=5;
    Object.assign(response,structuredClone(f.response)); response.schemaVersion=1;
    for (const r of response.primaryDeviceRows as R[]) for (const k of ["manualCallPoint","flowSwitch","heatDetector","smokeDetector"]) r[k]="normal";
    for (const r of response.secondaryAlarmDeviceRows as R[]) {delete r.fieldRemarks; r.alarmBell="poor";r.manualCallPoint="poor";}
    for (const group of ["chargerAndBatteries","mainFunctionKeys"]) for (const r of Object.values(response[group] as R)) (r as R).result="poor";
    snapshot.system=system;
    Object.assign(row,{customerId:f.snapshot.customer.id,customerCode:"fixture",inspectionGroupId:randomUUID(),originalCreatorSnapshot:null});
  }
  snapshot.schemaVersion=1; snapshot.template={id:template.id,code:"MFE-FSSR",version:template.version};
  if (systemKey==="hydrant") (snapshot.template as R).name=template.name;
  delete snapshot.contractSha256;delete snapshot.evidenceManifest;
  if (!["co2_fire_extinguisher","wet_chemical","fire_alarm_detector"].includes(systemKey)) delete snapshot.instance;
  row.templateId=template.id;row.responses=response;row.inspectionSnapshot=snapshot;
  return row;
}


/** Recognized V7 contract frozen before detector multiselect/four-state refinement. */
export function legacyFireAlarmV7Fixture() {
  const f=fixture("fire_alarm_detector");
  const base=structuredClone(masterServiceReportV6.systems.find(s=>s.key==="fire_alarm_detector")!);
  const definition={...base,sections:base.sections.map(section=>({...section,
    blocks:section.blocks.map(block=>block.type!=="checklist" ? block : {...block,
      items:block.items.map(field=>field.control==="good_poor" ? {...field,allowedValues:["good","poor","not_relevant"] as const} : field)
    })
  }))};
  f.snapshot.system.definition=definition;
  f.snapshot.system.resolvedControls=resolveFireAlarmV6Controls(definition,7);
  f.snapshot.contractSha256=v7EvidenceContractSha256(definition);
  for (const group of ["chargerAndBatteries","mainFunctionKeys"]) for (const field of Object.values(f.response[group] as R)) (field as R).result="poor";
  for (const row of f.response.secondaryAlarmDeviceRows as R[]) { row.alarmBell="poor"; row.manualCallPoint="poor"; }
  for (const row of f.response.primaryDeviceRows as R[]) for (const key of ["manualCallPoint","flowSwitch","heatDetector","smokeDetector"]) row[key]="normal";
  // Non-findings have no photo under this frozen contract.
  (f.response.chargerAndBatteries as R).battery={result:"good",remarks:""};
  (f.response.chargerAndBatteries as R).charger={result:"not_relevant",remarks:""};
  (f.response.secondaryAlarmDeviceRows as R[])[0]!.manualCallPoint="not_relevant";
  delete ((f.response.secondaryAlarmDeviceRows as R[])[0]!.fieldRemarks as R).manualCallPoint;
  f.snapshot.evidenceManifest=f.manifest.filter(m=>resolveRepairField("fire_alarm_detector",f.response,m.fieldPath)?.result==="poor");
  return f.row;
}
