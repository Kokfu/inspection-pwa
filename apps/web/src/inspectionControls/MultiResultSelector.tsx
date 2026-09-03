import type { ResultControlDefinition } from "./definitionTypes";

type Props<T extends string> = {
  definition: ResultControlDefinition;
  value: T[] | null;
  onChange: (value: T[]) => void;
  readOnly: boolean;
  label: string;
};

/** Definition-order toggles for V7 detector state.  The emitted array is
 * canonical before it reaches IndexedDB or an outbox fingerprint. */
export function MultiResultSelector<T extends string>({ definition, value, onChange, readOnly, label }: Props<T>) {
  const selected = Array.isArray(value) ? value : [];
  return <div className="result-options" role="group" aria-label={label}>
    {definition.options.map((option) => {
      const active = selected.includes(option.value as T);
      return <button type="button" className={`result-option ${active ? "result-option--selected" : ""}`}
        aria-pressed={active} disabled={readOnly} key={option.value}
        onClick={() => onChange(definition.options.filter((candidate) => active
          ? candidate.value !== option.value && selected.includes(candidate.value as T)
          : candidate.value === option.value || selected.includes(candidate.value as T)).map((candidate) => candidate.value as T))}>
        <span aria-hidden="true">{active ? "✓" : ""}</span>{option.label}
      </button>;
    })}
  </div>;
}
