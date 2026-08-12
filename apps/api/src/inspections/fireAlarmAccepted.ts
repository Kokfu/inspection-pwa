import { parseFireAlarmRowPreset, parseFireAlarmSystemDefinition, resolveFireAlarmControls } from "./templates/fireAlarmDefinitionControls.js";
import type { FireAlarmResponses, ResolvedFireAlarmControls } from "./templates/fireAlarmTypes.js";

type R = Record<string, unknown>;
type Expected = { table: "primary" | "secondary"; locationId: string; ordinal: number; assetReference: string; zoneSnapshot: { id: string; displayName: string } | null; locationSnapshot: { id: string; displayName: string } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const responseKeys = ["schemaVersion","controlPanelLocation","primaryDeviceRows","chargerAndBatteries","mainFunctionKeys","secondaryAlarmDeviceRows","comments"];
const primaryKeys = ["rowUuid","source","configuredLocationId","configuredRowOrdinal","zoneSnapshot","locationSnapshot","displaySequence","assetReference","alarmZone","location","manualCallPoint","flowSwitch","heatDetector","smokeDetector","remarks"];
const secondaryKeys = ["rowUuid","source","configuredLocationId","configuredRowOrdinal","zoneSnapshot","locationSnapshot","displaySequence","assetReference","location","alarmBell","manualCallPoint","remarks"];
const chargerKeys = ["main_supply","battery","charger"];
const functionKeys = ["main_alarm_reset","lamp_test","evacuate","ac_supply","dc_supply","spka_system","alarm_lift_trip","signal_gas_discharge"];
const rec=(v:unknown):v is R=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const exact=(v:R,k:readonly string[])=>Object.keys(v).length===k.length&&k.every(x=>x in v);
const text=(v:unknown,n:number,required=false):v is string=>typeof v==="string"&&v.length<=n&&(!required||v.trim().length>0);
const stable=(v:unknown):string=>Array.isArray(v)?`[${v.map(stable).join(",")}]`:rec(v)?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`:JSON.stringify(v);
const same=(a:unknown,b:unknown)=>stable(a)===stable(b);
const snapshot=(v:unknown,id:string,max:number)=>rec(v)&&exact(v,["id","displayName"])&&v.id===id&&text(v.displayName,max,true);
function canonicalTime(v:unknown,fractionDigits:3|6=3):v is string {
  if(typeof v!=="string")return false;
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d+)Z$/.exec(v);
  if(!match||match[7].length!==fractionDigits)return false;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const hour=Number(match[4]),minute=Number(match[5]),second=Number(match[6]);
  const leap=year%4===0&&(year%100!==0||year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  return month>=1&&month<=12&&day>=1&&day<=days[month-1]
    &&hour<=23&&minute<=59&&second<=59;
}
function creator(v:unknown){return v===null||rec(v)&&exact(v,["source","userId","username","role","capturedAt"])&&v.source==="device_reported"&&Number.isSafeInteger(v.userId)&&Number(v.userId)>0&&text(v.username,160,true)&&(v.username as string).trim()===v.username&&(v.role==="admin"||v.role==="inspector")&&canonicalTime(v.capturedAt);}

function expectedRows(system:R): Expected[]|undefined {
  if (!Array.isArray(system.zones)||!Array.isArray(system.locations)) return;
  const zones=new Map<string,R>();
  for(const zone of system.zones){if(!rec(zone)||!exact(zone,["id","enabledSystemId","key","displayName","sortOrder"])||!uuid.test(String(zone.id))||zone.enabledSystemId!==system.enabledSystemId||!text(zone.key,128,true)||!text(zone.displayName,200,true)||!Number.isInteger(zone.sortOrder))return; zones.set(zone.id as string,zone);}
  const locations:R[]=[];
  for(const location of system.locations){if(!rec(location)||!exact(location,["id","enabledSystemId","zoneId","key","displayName","presetRowCount","rowPreset","sortOrder"])||!uuid.test(String(location.id))||location.enabledSystemId!==system.enabledSystemId||!(location.zoneId===null||typeof location.zoneId==="string"&&zones.has(location.zoneId))||!text(location.key,128,true)||!text(location.displayName,300,true)||!Number.isInteger(location.presetRowCount)||Number(location.presetRowCount)<0||Number(location.presetRowCount)>250||!Number.isInteger(location.sortOrder)||!parseFireAlarmRowPreset(location.rowPreset))return; locations.push(location);}
  const out:Expected[]=[];
  for(const location of locations.sort((a,b)=>Number(a.sortOrder)-Number(b.sortOrder)||String(a.id).localeCompare(String(b.id)))){const preset=parseFireAlarmRowPreset(location.rowPreset)!;const zone=location.zoneId===null?undefined:zones.get(location.zoneId as string)!;for(let ordinal=1;ordinal<=Number(location.presetRowCount);ordinal++)out.push({table:preset.fireAlarmTable,locationId:location.id as string,ordinal,assetReference:preset.assetReference??"",zoneSnapshot:zone?{id:zone.id as string,displayName:zone.displayName as string}:null,locationSnapshot:{id:location.id as string,displayName:location.displayName as string}});}
  return out;
}
function checklist(v:unknown,keys:string[]){return rec(v)&&exact(v,keys)&&keys.every(k=>rec(v[k])&&exact(v[k] as R,["result","remarks"])&&((v[k] as R).result==="good"||(v[k] as R).result==="poor")&&text((v[k] as R).remarks,2000));}
function responses(v:unknown,expected:Expected[],controls:ResolvedFireAlarmControls):FireAlarmResponses|undefined{
  if(!rec(v)||!exact(v,responseKeys)||v.schemaVersion!==1||!text(v.controlPanelLocation,300,true)||!text(v.comments,4000)||!Array.isArray(v.primaryDeviceRows)||v.primaryDeviceRows.length<1||v.primaryDeviceRows.length>250||!Array.isArray(v.secondaryAlarmDeviceRows)||v.secondaryAlarmDeviceRows.length>250||!checklist(v.chargerAndBatteries,chargerKeys)||!checklist(v.mainFunctionKeys,functionKeys))return;
  const configured=new Map(expected.map(x=>[`${x.table}:${x.locationId}:${x.ordinal}`,x]));const seenConfigured=new Set<string>(),seenUuid=new Set<string>();
  const rows=(items:unknown[],table:"primary"|"secondary")=>{let technician=false;for(let i=0;i<items.length;i++){const row=items[i];if(!rec(row)||!exact(row,table==="primary"?primaryKeys:secondaryKeys)||!uuid.test(String(row.rowUuid))||seenUuid.has(row.rowUuid as string)||row.displaySequence!==i+1||!text(row.assetReference,250)||!text(row.location,300,true)||!text(row.remarks,2000))return false;seenUuid.add(row.rowUuid as string);if(row.source==="configured"){if(technician||!uuid.test(String(row.configuredLocationId))||!Number.isInteger(row.configuredRowOrdinal))return false;const key=`${table}:${row.configuredLocationId}:${row.configuredRowOrdinal}`,authority=configured.get(key);if(!authority||seenConfigured.has(key)||row.assetReference!==authority.assetReference||!snapshot(row.locationSnapshot,authority.locationId,300)||!same(row.locationSnapshot,authority.locationSnapshot)||!same(row.zoneSnapshot,authority.zoneSnapshot)||row.location!==authority.locationSnapshot.displayName)return false;if(table==="primary"&&row.alarmZone!==(authority.zoneSnapshot?.displayName??""))return false;seenConfigured.add(key);}else{technician=true;if(row.source!=="technician"||row.configuredLocationId!==null||row.configuredRowOrdinal!==null||row.zoneSnapshot!==null||row.locationSnapshot!==null)return false;}if(table==="primary"){if(!text(row.alarmZone,200,true)||![row.manualCallPoint,row.flowSwitch,row.heatDetector,row.smokeDetector].every(x=>x==="normal"||x==="test"||x==="isolation"))return false;}else if(![row.alarmBell,row.manualCallPoint].every(x=>x==="good"||x==="poor"))return false;}return true;};
  if(!rows(v.primaryDeviceRows,"primary")||!rows(v.secondaryAlarmDeviceRows,"secondary")||seenConfigured.size!==configured.size)return;
  void controls; return v as unknown as FireAlarmResponses;
}

export type StoredFireAlarmDetail = { responses: FireAlarmResponses; template:{id:string;code:"MFE-FSSR";version:number}; configuration:{revisionId:string;revisionNumber:number} };
export function validateStoredFireAlarmDetail(row:R):StoredFireAlarmDetail|undefined{
  const snap=row.inspectionSnapshot;if(!rec(snap)||!exact(snap,["schemaVersion","acceptedAt","job","customer","configuration","template","system","instance"])||snap.schemaVersion!==1||!rec(snap.job)||!rec(snap.customer)||!rec(snap.configuration)||!rec(snap.template)||!rec(snap.system)||!rec(snap.instance))return;
  if(!canonicalTime(row.performedAt,6)||!canonicalTime(row.receivedAt,6)||!canonicalTime(snap.acceptedAt,3))return;
  if(!exact(snap.job,["id","reference","title"])||snap.job.id!==row.jobId||snap.job.reference!==row.jobReference||snap.job.title!==row.jobTitle||!exact(snap.customer,["id","code","displayName"])||snap.customer.id!==row.customerId||snap.customer.code!==row.customerCode||snap.customer.displayName!==row.customerName)return;
  if(!exact(snap.configuration,["revisionId","revisionNumber"])||snap.configuration.revisionId!==row.configurationRevisionId||!Number.isInteger(snap.configuration.revisionNumber)||Number(snap.configuration.revisionNumber)<1||!exact(snap.template,["id","code","version"])||snap.template.id!==row.templateId||snap.template.code!=="MFE-FSSR"||!Number.isSafeInteger(snap.template.version)||Number(snap.template.version)<1||!creator(row.originalCreatorSnapshot))return;
  if(!exact(snap.instance,["instanceKey","displaySequence","zone","location"])||snap.instance.instanceKey!=="primary"||snap.instance.displaySequence!==1||snap.instance.zone!==null||snap.instance.location!==null)return;
  const system=snap.system;if(!exact(system,["enabledSystemId","systemKey","displayName","sortOrder","definitionStatus","zones","locations","definition","resolvedControls","repetitionMode"])||!uuid.test(String(system.enabledSystemId))||system.systemKey!=="fire_alarm_detector"||system.displayName!=="Fire Alarm / Detector System"||system.sortOrder!==5||system.definitionStatus!=="confirmed"||system.repetitionMode!=="single_with_two_repeatable_tables"||!parseFireAlarmSystemDefinition(system.definition))return;
  let controls:ResolvedFireAlarmControls;try{controls=resolveFireAlarmControls(system.definition,"MFE-FSSR",snap.template.version as number);}catch{return;}if(!same(system.resolvedControls,controls))return;
  const expected=expectedRows(system),parsed=expected&&responses(row.responses,expected,controls);if(!parsed)return;
  return {responses:parsed,template:{id:row.templateId as string,code:"MFE-FSSR",version:snap.template.version as number},configuration:{revisionId:row.configurationRevisionId as string,revisionNumber:snap.configuration.revisionNumber as number}};
}
