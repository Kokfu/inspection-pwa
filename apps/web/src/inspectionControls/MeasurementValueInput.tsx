import type { ResolvedMeasurementValue } from "./definitionTypes";

type Props = {
  definition: ResolvedMeasurementValue;
  value: number | null;
  onChange: (value: number | null) => void;
  readOnly: boolean;
};

export function MeasurementValueInput({ definition, value, onChange, readOnly }: Props) {
  return (
    <label>
      {definition.label} ({definition.unit})
      <input
        type="number"
        inputMode="decimal"
        value={value ?? ""}
        disabled={readOnly}
        aria-required={definition.required}
        onChange={(event) => onChange(
          event.target.value === "" ? null : Number(event.target.value)
        )}
      />
    </label>
  );
}
