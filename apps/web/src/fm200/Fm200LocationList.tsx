import { deriveFm200InstanceProgress, deriveFm200ParentProgress } from "./fm200Progress";
import type {
  Fm200MasterSystemFormInstanceRecord,
  Fm200MasterSystemInspectionGroupRecord
} from "./fm200Types";
import type { ServerMasterSystemInspectionSummary } from "../hoseReel/serverMasterSystemInspectionApi";
import { inspectionStatusLabel, inspectionStatusTone } from "../uiPresentation";

type Props = {
  group: Fm200MasterSystemInspectionGroupRecord;
  instances: Fm200MasterSystemFormInstanceRecord[];
  serverSummaries: ServerMasterSystemInspectionSummary[];
  onBack: () => void;
  onOpen: (record: Fm200MasterSystemFormInstanceRecord) => void;
};

export function groupFm200InstancesByZone(group: Fm200MasterSystemInspectionGroupRecord) {
  return group.expectedInstances.reduce<Array<{ key: string; name: string }>>((result, instance) => {
    const key = instance.zone ? `zone:${instance.zone.id}` : "zone:unconfigured";
    if (!result.some((zone) => zone.key === key)) {
      result.push({ key, name: instance.zone?.displayName ?? "Locations" });
    }
    return result;
  }, []);
}

export function Fm200LocationList({ group, instances, serverSummaries, onBack, onOpen }: Props) {
  const systemLabel = "FM200 System";
  const byKey = new Map(instances.map((instance) => [instance.instanceKey, instance]));
  const zones = groupFm200InstancesByZone(group);
  const parentProgress = group.expectedInstances.every(expected=>serverSummaries.some(summary=>summary.instanceKey===expected.instanceKey&&summary.locationId===expected.location.id&&summary.zoneId===(expected.zone?.id??null)&&summary.displaySequence===expected.displaySequence)) ? "Completed" : deriveFm200ParentProgress(group, instances);
  return <section className="co2-location-list" aria-labelledby="fm200-locations-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button>
    <div className="workspace-heading">
      <div>
        <p className="eyebrow">{group.jobReference}</p>
        <h2 id="fm200-locations-title">{systemLabel} Locations</h2>
        <p>{group.customer.displayName}</p>
      </div>
      <span className={`status-badge status-badge--${inspectionStatusTone(parentProgress)}`}>{inspectionStatusLabel(parentProgress)}</span>
    </div>
    {zones.map((zone) => (
      <section className="location-group" key={zone.key}>
        <h3>{zone.name}</h3>
        <ul className="navigation-list">
          {group.expectedInstances
            .filter((expected) => (expected.zone ? `zone:${expected.zone.id}` : "zone:unconfigured") === zone.key)
            .map((expected) => {
              const record = byKey.get(expected.instanceKey);
              const accepted=serverSummaries.some(summary=>summary.instanceKey===expected.instanceKey&&summary.locationId===expected.location.id&&summary.zoneId===(expected.zone?.id??null)&&summary.displaySequence===expected.displaySequence);
              return <li key={expected.instanceKey}>
                <button type="button" disabled={!record} onClick={() => record && onOpen(record)}>
                  <span>
                    <strong>{expected.location.displayName}</strong>
                    <small>{expected.zone?.displayName ?? "Unzoned configured location"}</small>
                  </span>
                  {(() => {
                    const progress = accepted ? "Completed" : record ? deriveFm200InstanceProgress(record) : "Not Started";
                    return <span className={`status-badge status-badge--${inspectionStatusTone(progress)}`}>{inspectionStatusLabel(progress)}</span>;
                  })()}
                </button>
              </li>;
            })}
        </ul>
      </section>
    ))}
  </section>;
}
