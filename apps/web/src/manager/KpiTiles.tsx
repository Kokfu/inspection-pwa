export function KpiTiles({ label, items }: { label: string; items: Array<{ label: string; value: number | string }> }) {
  return <dl className="operations-summary" aria-label={label}>{items.map((item) =>
    <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
  )}</dl>;
}
