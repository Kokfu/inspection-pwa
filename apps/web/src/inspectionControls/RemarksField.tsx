import type { ResolvedRemarksDefinition } from "./definitionTypes";

type Props = {
  label: string;
  definition: ResolvedRemarksDefinition;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
};

export function RemarksField({ label, definition, value, onChange, readOnly }: Props) {
  if (definition.policy === "none") {
    return null;
  }
  return (
    <label>
      {label}
      <textarea
        value={value}
        maxLength={definition.maxLength}
        disabled={readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
