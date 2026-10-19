import { masterServiceReportV6 } from "../inspections/templates/masterServiceReportV6.js";
import { resolveFireAlarmV6Controls } from "../inspections/templates/fireAlarmDefinitionControls.js";
import { v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";
import { fixture } from "./fieldCatalogFixtures.test-support.js";
import { resolveRepairField, type R } from "./fieldCatalogReaders.js";

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
