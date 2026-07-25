import type { ResultControlDefinition } from "./definitionTypes";

type Props<T extends string> = {
  definition: ResultControlDefinition;
  value: T | null;
  onChange: (value: T | null) => void;
  readOnly: boolean;
  label: string;
};

export function ResultSelector<T extends string>({
  definition,
  value,
  onChange,
  readOnly,
  label
}: Props<T>) {
  return (
    <div className="result-options" role="group" aria-label={label}>
      {definition.options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            type="button"
            className={`result-option ${selected ? "result-option--selected" : ""}`}
            aria-pressed={selected}
            disabled={readOnly}
            key={option.value}
            onClick={() => onChange(selected ? null : option.value as T)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
