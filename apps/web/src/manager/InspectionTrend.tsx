type DayCount = { day: string; count: number };

export function InspectionTrend({ from, to, days }: { from: string; to: string; days: DayCount[] }) {
  const counts = new Map(days.map((row) => [row.day, row.count]));
  const dates: string[] = [];
  for (let time = Date.parse(`${from}T00:00:00Z`); time <= Date.parse(`${to}T00:00:00Z`); time += 86_400_000) {
    dates.push(new Date(time).toISOString().slice(0, 10));
  }
  const values = dates.map((day) => counts.get(day) ?? 0);
  const max = Math.max(1, ...values);
  const left = 34, right = 580, top = 16, bottom = 148;
  const x = (index: number) => left + (dates.length === 1 ? (right - left) / 2 : index * (right - left) / (dates.length - 1));
  const y = (value: number) => bottom - value * (bottom - top) / max;
  const path = values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
  const total = values.reduce((sum, value) => sum + value, 0);
  const labels = [...new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1])];
  return <section className="dashboard-trend report-summary" aria-labelledby="dashboard-trend-title">
    <div className="workspace-heading"><div><p className="eyebrow">This month</p><h3 id="dashboard-trend-title">Inspections per day</h3></div><span>{total} scheduled</span></div>
    <svg viewBox="0 0 620 184" role="img" aria-label={`Inspections per day from ${from} to ${to}; ${total} scheduled`} preserveAspectRatio="xMidYMid meet">
      <line x1={left} y1={bottom} x2={right} y2={bottom} className="trend-grid" />
      <line x1={left} y1={top} x2={right} y2={top} className="trend-grid" />
      <text x="4" y={bottom + 4} className="trend-label">0</text>
      <text x="4" y={top + 4} className="trend-label">{max}</text>
      <path d={path} className="trend-line" />
      {values.map((value, index) => <circle key={dates[index]} cx={x(index)} cy={y(value)} r="3" className="trend-point" />)}
      {labels.map((index) => <text key={index} x={x(index)} y="174" textAnchor="middle" className="trend-label">{dates[index]!.slice(5)}</text>)}
    </svg>
    {total === 0 ? <p className="empty-state">No inspections scheduled in this period.</p> : null}
  </section>;
}
