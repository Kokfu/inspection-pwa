import "./managerServiceEditor.css";
import {
  evidencePolicyAssignableSystemKeys,
  labelOverrideSystemKeys,
  locationConfigurableSystemKeys,
  systemConfigurationSystemKeys,
  type ManagerCustomer
} from "./managerApi";

export type ManagerServiceTab = "wording" | "presets" | "settings";

export type ManagerServiceEntry = {
  key: string;
  displayName: string;
  sortOrder: number;
  /** In the customer's active configuration (vs. only in the supported catalog). */
  enabled: boolean;
  enabledSystem?: ManagerCustomer["configuration"]["enabledSystems"][number];
};

export const managerServiceTabLabels: Record<ManagerServiceTab, string> = { wording: "Form wording", presets: "Preset rows", settings: "Settings" };
export const isManagerServiceTab = (value: unknown): value is ManagerServiceTab =>
  value === "wording" || value === "presets" || value === "settings";

/**
 * The customer's services as the Services area lists them: every enabled system,
 * plus any location-dependent system that is not enabled yet — defining its
 * zones & locations is what makes it assignable, so it must stay reachable.
 */
export function managerServiceEntries(customer: ManagerCustomer): ManagerServiceEntry[] {
  const enabled = customer.configuration.enabledSystems
    .slice().sort((left, right) => left.sortOrder - right.sortOrder)
    .map((system) => ({ key: system.key, displayName: system.displayName, sortOrder: system.sortOrder, enabled: true, enabledSystem: system }));
  const enabledKeys = new Set(enabled.map((entry) => entry.key));
  const pending = customer.supportedSystems
    .filter((system) => locationConfigurableSystemKeys.has(system.key) && !enabledKeys.has(system.key))
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((system) => ({ key: system.key, displayName: system.displayName, sortOrder: system.sortOrder, enabled: false }));
  return [...enabled, ...pending];
}

/** Tabs that apply to one service. The wording / settings GETs require an enabled system. */
export function managerServiceTabs(entry: ManagerServiceEntry): ManagerServiceTab[] {
  const tabs: ManagerServiceTab[] = [];
  if (entry.enabled) tabs.push("wording");
  if (locationConfigurableSystemKeys.has(entry.key)) tabs.push("presets");
  if (entry.enabled && (systemConfigurationSystemKeys.has(entry.key) || evidencePolicyAssignableSystemKeys.has(entry.key))) tabs.push("settings");
  return tabs;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type Chip = { label: string; tone: "set" | "unset" | "na" | "attention" };

/**
 * Summary chips for one service card, read straight off the customer payload
 * (no extra fetch): custom label count, preset rows, settings state.
 */
export function managerServiceChips(entry: ManagerServiceEntry): Chip[] {
  const system = entry.enabledSystem;
  const chips: Chip[] = [];
  if (entry.enabled) {
    if (labelOverrideSystemKeys.has(entry.key)) {
      const overrides = (system as { labelOverrides?: unknown } | undefined)?.labelOverrides;
      const count = isPlainRecord(overrides) ? Object.values(overrides).filter((value) => typeof value === "string" && value.trim()).length : 0;
      chips.push(count > 0 ? { label: `${count} custom ${count === 1 ? "label" : "labels"}`, tone: "set" } : { label: "Standard wording", tone: "unset" });
    } else {
      chips.push({ label: "Wording not customisable", tone: "na" });
    }
  }
  if (locationConfigurableSystemKeys.has(entry.key)) {
    const zones = system?.zones.length ?? 0;
    const locations = system?.locations.length ?? 0;
    chips.push(locations > 0
      ? { label: `${locations} ${locations === 1 ? "location" : "locations"} set`, tone: "set" }
      : { label: `${zones > 0 ? `${zones} ${zones === 1 ? "zone" : "zones"}, ` : ""}General location in new visits`, tone: "unset" });
  }
  if (entry.enabled && systemConfigurationSystemKeys.has(entry.key)) {
    const configuration = system?.systemConfiguration;
    const configured = isPlainRecord(configuration) && Object.keys(configuration).length > 0;
    chips.push(configured ? { label: "Settings set", tone: "set" } : { label: "Settings need attention", tone: "attention" });
  }
  if (entry.enabled && evidencePolicyAssignableSystemKeys.has(entry.key)) {
    const assigned = typeof system?.evidencePolicyId === "string" && system.evidencePolicyId.length > 0;
    chips.push(assigned ? { label: "Evidence policy set", tone: "set" } : { label: "Default evidence handling", tone: "unset" });
  }
  return chips;
}

/** The customer page's Services area: one card per service, each opening its editor. */
export function ManagerCustomerServices({ customer, onOpenService }: {
  customer: ManagerCustomer; onOpenService?: (systemKey: string) => void;
}) {
  const entries = managerServiceEntries(customer);
  return <section className="report-summary manager-services" aria-labelledby="manager-services-title">
    <h3 id="manager-services-title">Services</h3>
    <p className="support-metadata">Open a service to change the wording a technician sees on its form, its preset rows and its settings. Saving creates a new configuration version; existing service visits keep the wording and settings they were created with, new visits use the new ones.</p>
    <p className="support-metadata">Version {customer.configuration.revision}</p>
    {entries.length ? <ul className="job-card-list manager-service-cards">
      {entries.map((entry) => {
        const chips = managerServiceChips(entry);
        return <li key={entry.key}>
          <button type="button" className="job-card manager-service-card" onClick={() => onOpenService?.(entry.key)}>
            <div className="job-card-heading">
              <div><span className="job-card-label">Service</span><strong>{entry.displayName}</strong></div>
              <span className={`status-badge ${entry.enabled ? "status-badge--complete" : "status-badge--waiting"}`}>{entry.enabled ? "Assigned" : "Not assigned yet"}</span>
            </div>
            <span className="manager-per-service-summary-flags">
              {chips.map((chip) => <span key={chip.label} className={`manager-config-flag manager-config-flag--${chip.tone}`}>{chip.label}</span>)}
            </span>
            <span className="job-reference">{managerServiceTabs(entry).map((tab) => managerServiceTabLabels[tab]).join(" · ")}</span>
          </button>
        </li>;
      })}
    </ul> : <p className="empty-state">No services are assigned yet.</p>}
  </section>;
}
