import { useMemo } from "react";
import { beforeResultLabel, groupCatalog, identityKey, needsRepair } from "./repairVisitPresentation";
import type { RepairCatalogField } from "./repairVisitTypes";

const badgeText = (field: RepairCatalogField) => field.before?.result === "not_done" ? "Not Done" : "Not Good";

/**
 * System -> Unit -> Section -> Field. Fields that need repair (Not Good, or Not Done at the previous repair visit)
 * carry a text badge and come first. The server's field list is authoritative; this only chooses from it.
 */
export function RepairFieldPicker({ fields, selected, onToggle, onSelectAllNeedingRepair, disabled, idPrefix }: {
  fields: RepairCatalogField[]; selected: ReadonlySet<string>; onToggle: (key: string) => void;
  onSelectAllNeedingRepair?: () => void; disabled?: boolean; idPrefix: string;
}) {
  const systems = useMemo(() => groupCatalog(fields), [fields]);
  const repairCount = useMemo(() => fields.filter(needsRepair).length, [fields]);
  const collapseQuiet = fields.length > 60;
  return <div className="rv-picker">
    {repairCount > 0 && onSelectAllNeedingRepair
      ? <button type="button" className="secondary-command rv-picker-all" disabled={disabled} onClick={onSelectAllNeedingRepair}>Select all {repairCount} that need repair</button> : null}
    {systems.map((system, systemIndex) => {
      const urgent = system.units.some(unit => unit.sections.some(section => section.fields.some(needsRepair)));
      return <details key={system.key} className="rv-picker-system" open={!collapseQuiet || urgent || systemIndex === 0}>
        <summary>{system.label}{urgent ? <span className="rv-badge rv-badge--repair">Needs repair</span> : null}</summary>
        {system.units.map(unit => <section key={unit.key} className="rv-picker-unit" aria-label={`${system.label}: ${unit.label}`}>
          <h4>{unit.label}</h4>
          {unit.sections.map(section => <fieldset key={section.key} className="rv-picker-section" disabled={disabled}>
            <legend>{section.label}</legend>
            {section.fields.map(field => {
              const key = identityKey(field.identity);
              const checked = selected.has(key);
              const inputId = `${idPrefix}-${key.length}-${hashKey(key)}`;
              return <label key={key} htmlFor={inputId} className={`rv-field-row${checked ? " rv-field-row--selected" : ""}`}>
                <input id={inputId} type="checkbox" checked={checked} onChange={() => onToggle(key)} />
                <span className="rv-field-label">{field.fieldLabel}</span>
                {needsRepair(field) ? <span className="rv-badge rv-badge--repair">{badgeText(field)}</span>
                  : field.before ? <span className="rv-field-before">{beforeResultLabel(field.before.result)}</span> : null}
              </label>;
            })}
          </fieldset>)}
        </section>)}
      </details>;
    })}
  </div>;
}

function hashKey(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
  return (hash >>> 0).toString(36);
}
