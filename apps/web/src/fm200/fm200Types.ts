// FM200 is a fully independent system (own systemKey, own groupKey, own
// repository/form/view/evidence modules - see the rest of ./fm200), but it
// deliberately does NOT get its own parallel `MasterSystemFormInstanceRecord`
// nominal type. That record type backs the single generic Dexie
// `masterSystemFormInstances` / `masterSystemInspectionGroups` tables (see
// db/localDatabase.ts) and the shared array-typed state threaded through
// App.tsx / jobs/TechnicianHome.tsx - exactly the same tables and state CO2
// and Wet Chemical already share as two independent systems discriminated
// only by their `systemKey` field. Introducing a second nominal type here
// would need its own parallel EntityTable union and state plumbing across
// those files well beyond this task's scope, for no behavioral benefit: the
// field structure is byte-identical (FM200's form fields mirror CO2's
// exactly - see AGENTS.md's v7-evidence-acceptance skill's "Adding a System"
// recipe). `co2/co2Types.ts`'s `SuppressionSystemKey` union was widened with
// "fm200_fire_suppression" for this reason (see that file), which is what
// makes this re-export type-safe: `MasterSystemFormInstanceRecord.systemKey`
// now legally includes FM200's key.
//
// Every fm200/*.ts(x) file imports its shared record/response shapes from
// here under an Fm200-prefixed alias, so this module is the one place that
// couples to co2Types - callers never import "../co2/co2Types" directly.
export type {
  Co2Result as Fm200Result,
  Co2SyncStatus as Fm200SyncStatus,
  Co2ChecklistResponse as Fm200ChecklistResponse,
  Co2DetectorRow as Fm200DetectorRow,
  Co2Responses as Fm200Responses,
  Co2ConfiguredInstance as Fm200ConfiguredInstance,
  Co2InspectionSnapshot as Fm200InspectionSnapshot,
  MasterSystemInspectionGroupRecord as Fm200MasterSystemInspectionGroupRecord,
  MasterSystemFormInstanceRecord as Fm200MasterSystemFormInstanceRecord,
  DetectorStatus as Fm200DetectorStatus,
  DetectorStatusValue as Fm200DetectorStatusValue
} from "../co2/co2Types";

export type Fm200SystemKey = "fm200_fire_suppression";
