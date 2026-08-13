import type { JobSystemSnapshot } from "./jobTypes";
import type { SystemProgress } from "./jobProgress";
import { inspectionStatusLabel, inspectionStatusTone } from "../uiPresentation";

type SystemNavigatorProps = {
  system: JobSystemSnapshot;
  progress: SystemProgress;
  onBack: () => void;
  onOpenHoseReel?: () => void;
  onOpenSuppressionLocations?: () => void;
  onOpenPortableFireExtinguisher?: () => void;
};

function presetDescription(rowPreset: unknown) {
  if (
    typeof rowPreset === "object"
    && rowPreset !== null
    && "assetReference" in rowPreset
    && typeof rowPreset.assetReference === "string"
  ) {
    return rowPreset.assetReference;
  }
  return undefined;
}

export function SystemNavigator({ system, progress, onBack, onOpenHoseReel, onOpenSuppressionLocations, onOpenPortableFireExtinguisher }: SystemNavigatorProps) {
  const zones = system.zones.slice().sort((left, right) => left.sortOrder - right.sortOrder);
  const locations = system.locations.slice().sort((left, right) => left.sortOrder - right.sortOrder);
  const unzonedLocations = locations.filter((location) => location.zoneId === null);

  function locationList(zoneId: string | null) {
    const matching = locations.filter((location) => location.zoneId === zoneId);
    if (matching.length === 0) return <p className="empty-state">No configured locations.</p>;
    return <ul className="location-list">
      {matching.map((location) => {
        const preset = presetDescription(location.rowPreset);
        return <li key={location.id}>
          <strong>{location.displayName}</strong>
          <span>{location.presetRowCount} preset row{location.presetRowCount === 1 ? "" : "s"}</span>
          {preset ? <span>{preset}</span> : null}
        </li>;
      })}
    </ul>;
  }

  return <section className="system-overview" aria-labelledby="selected-system-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button>
    <div className="workspace-heading">
      <div>
        <p className="eyebrow">System Overview</p>
        <h3 id="selected-system-title">{system.displayName}</h3>
      </div>
      <span className={`status-badge status-badge--${inspectionStatusTone(progress)}`}>{inspectionStatusLabel(progress)}</span>
    </div>
    {zones.length > 0 ? zones.map((zone) => (
      <section className="location-group" key={zone.id}>
        <h4>{zone.displayName}</h4>
        {locationList(zone.id)}
      </section>
    )) : null}
    {zones.length > 0 && unzonedLocations.length > 0 ? (
      <section className="location-group">
        <h4>Locations</h4>
        {locationList(null)}
      </section>
    ) : null}
    {zones.length === 0 && locations.length > 0 ? (
      <section className="location-group">
        <h4>Locations</h4>
        {locationList(null)}
      </section>
    ) : null}
    {zones.length === 0 && locations.length === 0 ? (
      <p className="empty-state">This system has no configured zones or locations.</p>
    ) : null}
    {system.systemKey === "hose_reel" && onOpenHoseReel ? <button type="button" onClick={onOpenHoseReel}>Open Hose Reel Inspection</button>
      : (system.systemKey === "co2_fire_extinguisher" || system.systemKey === "wet_chemical") && onOpenSuppressionLocations ? <button type="button" onClick={onOpenSuppressionLocations}>Open {system.systemKey === "wet_chemical" ? "Wet Chemical" : "CO2"} Locations</button>
        : system.systemKey === "portable_fire_extinguisher" && onOpenPortableFireExtinguisher ? <button type="button" onClick={onOpenPortableFireExtinguisher}>Open Portable Fire Extinguisher Inspection</button>
        : <p className="form-message">Detailed inspection entry is not available for this system yet.</p>}
  </section>;
}
