import { deriveCo2InstanceProgress, deriveCo2ParentProgress } from "./co2Progress";
import type {
  MasterSystemFormInstanceRecord,
  MasterSystemInspectionGroupRecord
} from "./co2Types";

type Props = {
  group: MasterSystemInspectionGroupRecord;
  instances: MasterSystemFormInstanceRecord[];
  onBack: () => void;
  onOpen: (record: MasterSystemFormInstanceRecord) => void;
};

export function groupCo2InstancesByZone(group: MasterSystemInspectionGroupRecord) {
  return group.expectedInstances.reduce<Array<{ key: string; name: string }>>((result, instance) => {
    const key = instance.zone ? `zone:${instance.zone.id}` : "zone:unconfigured";
    if (!result.some((zone) => zone.key === key)) {
      result.push({ key, name: instance.zone?.displayName ?? "Locations" });
    }
    return result;
  }, []);
}

export function Co2LocationList({ group, instances, onBack, onOpen }: Props) {
  const byKey = new Map(instances.map((instance) => [instance.instanceKey, instance]));
  const zones = groupCo2InstancesByZone(group);
  return <section className="co2-location-list" aria-labelledby="co2-locations-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button>
    <div className="workspace-heading">
      <div>
        <p className="eyebrow">{group.jobReference}</p>
        <h2 id="co2-locations-title">CO2 Locations</h2>
        <p>{group.customer.displayName}</p>
      </div>
      <span className="status-label">{deriveCo2ParentProgress(group, instances)}</span>
    </div>
    {zones.map((zone) => (
      <section className="location-group" key={zone.key}>
        <h3>{zone.name}</h3>
        <ul className="navigation-list">
          {group.expectedInstances
            .filter((expected) => (expected.zone ? `zone:${expected.zone.id}` : "zone:unconfigured") === zone.key)
            .map((expected) => {
              const record = byKey.get(expected.instanceKey);
              return <li key={expected.instanceKey}>
                <button type="button" disabled={!record} onClick={() => record && onOpen(record)}>
                  <span>
                    <strong>{expected.location.displayName}</strong>
                    <small>{expected.zone?.displayName ?? "Unzoned configured location"}</small>
                  </span>
                  <span className="status-label">{record ? deriveCo2InstanceProgress(record) : "Not Started"}</span>
                </button>
              </li>;
            })}
        </ul>
      </section>
    ))}
  </section>;
}
