import { NewRepairVisit } from "./NewRepairVisit";
import { RepairVisitForm } from "./RepairVisitForm";
import { RepairVisitsPage } from "./RepairVisitsPage";

export type RepairVisitsView = { view: "list" } | { view: "new" } | { view: "visit"; visitId: string };

/** The technician's Repair List area: #/repair-visits, #/repair-visits/new and #/repair-visits/:visitId. */
export function RepairVisitsScreen({ view, actorId, canUseServer, onSync }: {
  view: RepairVisitsView; actorId: number; canUseServer: boolean; onSync: () => Promise<unknown>;
}) {
  if (view.view === "new") return <NewRepairVisit key={`${actorId}:new`} canUseServer={canUseServer} onSync={onSync} />;
  if (view.view === "visit") return <RepairVisitForm key={`${actorId}:${view.visitId}`} visitUuid={view.visitId} canUseServer={canUseServer} onSync={onSync} />;
  return <RepairVisitsPage key={`${actorId}:list`} actorId={actorId} canUseServer={canUseServer} onSync={onSync} />;
}
