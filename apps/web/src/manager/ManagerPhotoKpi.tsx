import { useEffect, useMemo, useRef, useState } from "react";
import { KpiTiles } from "./KpiTiles";
import { ManagerApiError } from "./managerApi";
import { loadPhotoKpi, PHOTO_KPI_MONTH, type PhotoCounts, type PhotoKpi, type PhotoKpiTechnician, type PhotoKpiTotal, type PhotoTrendPoint } from "./photoKpiApi";
import "./managerPhotoKpi.css";

function malaysiaMonth() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}`;
}
const monthName = (month: string, style: "long" | "short" = "long") =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: style, year: "numeric" }).format(new Date(`${month}-01T00:00:00Z`));
const percent = (value: number | null) => value === null ? "—" : `${value.toFixed(1)}%`;
const total = (counts: PhotoCounts) => counts.camera + counts.gallery + counts.unknown;
const technicianName = (technician: PhotoKpiTechnician) => `${technician.displayName ?? technician.username}${technician.hidden ? " (hidden)" : ""}`;
const summary = (counts: PhotoKpiTotal | PhotoCounts & { galleryPercent: number | null }) =>
  `${counts.camera} camera, ${counts.gallery} gallery, ${counts.unknown} unknown, gallery ${counts.galleryPercent === null ? "not applicable" : percent(counts.galleryPercent)}`;

/** Gallery % highest first; people with no camera/gallery photo (no percentage) last. Name breaks ties so the order is stable. */
export function sortByGalleryPercent(technicians: PhotoKpiTechnician[]) {
  return [...technicians].sort((left, right) =>
    (right.galleryPercent ?? -1) - (left.galleryPercent ?? -1) || technicianName(left).localeCompare(technicianName(right)) || left.userId - right.userId);
}

/** Shared SVG pattern: gallery is hatched so the camera/gallery split never depends on colour alone. */
function ChartDefs() {
  return <svg className="photo-kpi-defs" width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <pattern id="photo-kpi-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" className="photo-kpi-hatch-bg" />
        <line x1="0" y1="0" x2="0" y2="6" className="photo-kpi-hatch-line" />
      </pattern>
    </defs>
  </svg>;
}

function Legend() {
  return <ul className="photo-kpi-legend" aria-label="Chart key">
    <li><span className="photo-kpi-key photo-kpi-key--camera" aria-hidden="true" />Camera</li>
    <li><span className="photo-kpi-key photo-kpi-key--gallery" aria-hidden="true" />Gallery (hatched)</li>
    <li><span className="photo-kpi-key photo-kpi-key--unknown" aria-hidden="true" />Unknown</li>
  </ul>;
}

/** One bar per technician (camera solid, gallery hatched), widest total = full width; sorted by gallery %. */
function TechnicianBars({ technicians }: { technicians: PhotoKpiTechnician[] }) {
  const ordered = sortByGalleryPercent(technicians);
  const max = Math.max(1, ...ordered.map(total));
  return <ul className="photo-kpi-bars" aria-label="Photos by technician, highest gallery percentage first">
    {ordered.map((technician) => {
      const camera = technician.camera / max * 100, gallery = technician.gallery / max * 100, unknown = technician.unknown / max * 100;
      return <li key={technician.userId}>
        <span className="photo-kpi-bar-name">{technicianName(technician)}</span>
        <svg className="photo-kpi-bar" height="16" width="100%" role="img" aria-label={`${technicianName(technician)}: ${summary(technician)}`}>
          <rect x="0" y="0" width="100%" height="16" className="photo-kpi-track" />
          <rect x="0%" y="0" width={`${camera}%`} height="16" className="photo-kpi-fill photo-kpi-fill--camera" />
          <rect x={`${camera}%`} y="0" width={`${gallery}%`} height="16" className="photo-kpi-fill photo-kpi-fill--gallery" />
          <rect x={`${camera + gallery}%`} y="0" width={`${unknown}%`} height="16" className="photo-kpi-fill photo-kpi-fill--unknown" />
        </svg>
        <span className="photo-kpi-bar-text">Camera {technician.camera} · Gallery {technician.gallery} · {percent(technician.galleryPercent)}</span>
      </li>;
    })}
  </ul>;
}

function Donut({ counts, label }: { counts: PhotoKpiTotal; label: string }) {
  const sum = total(counts);
  const radius = 46, circumference = 2 * Math.PI * radius;
  const segments = [
    { key: "camera", count: counts.camera }, { key: "gallery", count: counts.gallery }, { key: "unknown", count: counts.unknown }
  ];
  let offset = 0;
  return <svg className="photo-kpi-donut" viewBox="0 0 120 120" role="img" aria-label={`${label}: ${summary(counts)}`}>
    <circle cx="60" cy="60" r={radius} className="photo-kpi-donut-track" />
    {sum > 0 ? segments.map((segment) => {
      const length = segment.count / sum * circumference, start = offset;
      offset += length;
      return segment.count > 0 ? <circle key={segment.key} cx="60" cy="60" r={radius} className={`photo-kpi-donut-segment photo-kpi-donut-segment--${segment.key}`}
        strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-start} /> : null;
    }) : null}
    <text x="60" y="56" textAnchor="middle" dominantBaseline="central" className="photo-kpi-donut-total">{percent(counts.galleryPercent)}</text>
    <text x="60" y="74" textAnchor="middle" dominantBaseline="central" className="photo-kpi-donut-caption">gallery</text>
  </svg>;
}

function Trend({ trend }: { trend: PhotoTrendPoint[] }) {
  const max = Math.max(1, ...trend.map(total));
  const left = 28, right = 296, top = 12, bottom = 124, step = (right - left) / trend.length, barWidth = step * 0.6;
  const height = (value: number) => value / max * (bottom - top);
  return <>
    <svg className="photo-kpi-trend" viewBox="0 0 300 150" role="img" aria-label={`Photos per month, last 6 months. ${trend.map((point) => `${monthName(point.month, "short")}: ${point.camera} camera, ${point.gallery} gallery, ${point.unknown} unknown`).join("; ")}`}>
      <line x1={left} y1={bottom} x2={right} y2={bottom} className="photo-kpi-axis" />
      <text x="2" y={bottom + 4} className="photo-kpi-axis-label">0</text>
      <text x="2" y={top + 4} className="photo-kpi-axis-label">{max}</text>
      {trend.map((point, index) => {
        const x = left + index * step + (step - barWidth) / 2;
        const camera = height(point.camera), gallery = height(point.gallery), unknown = height(point.unknown);
        return <g key={point.month}>
          <rect x={x} y={bottom - camera} width={barWidth} height={camera} className="photo-kpi-fill photo-kpi-fill--camera" />
          <rect x={x} y={bottom - camera - gallery} width={barWidth} height={gallery} className="photo-kpi-fill photo-kpi-fill--gallery" />
          <rect x={x} y={bottom - camera - gallery - unknown} width={barWidth} height={unknown} className="photo-kpi-fill photo-kpi-fill--unknown" />
          <text x={x + barWidth / 2} y="142" textAnchor="middle" className="photo-kpi-axis-label">{monthName(point.month, "short").slice(0, 3)}</text>
        </g>;
      })}
    </svg>
    <div className="photo-kpi-table-wrap">
      <table className="photo-kpi-table">
        <caption>Month by month</caption>
        <thead><tr><th scope="col">Month</th><th scope="col">Camera</th><th scope="col">Gallery</th><th scope="col">Unknown</th></tr></thead>
        <tbody>{trend.map((point) => <tr key={point.month}><th scope="row">{monthName(point.month, "short")}</th><td>{point.camera}</td><td>{point.gallery}</td><td>{point.unknown}</td></tr>)}</tbody>
      </table>
    </div>
  </>;
}

export function ManagerPhotoKpi({ onAuthorityFailure }: { onAuthorityFailure: (error: ManagerApiError) => void }) {
  const currentMonth = useMemo(malaysiaMonth, []);
  const [period, setPeriod] = useState<string>(currentMonth);
  const [data, setData] = useState<PhotoKpi>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const authorityFailure = useRef(onAuthorityFailure);
  authorityFailure.current = onAuthorityFailure;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void loadPhotoKpi(period, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setData(result); setLoading(false);
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      setLoading(false); setData(undefined);
      if (reason instanceof ManagerApiError && reason.kind === "authorization") authorityFailure.current(reason);
      else setError(reason instanceof Error ? reason.message : "Photo KPI cannot be loaded right now.");
    });
    return () => controller.abort();
  }, [period, revision]);

  const selected = data?.technicians.find((technician) => String(technician.userId) === selectedId);
  useEffect(() => { if (data && selectedId && !selected) setSelectedId(""); }, [data, selectedId, selected]);
  const needle = search.trim().toLowerCase();
  const matches = (technician: PhotoKpiTechnician) => !needle || technicianName(technician).toLowerCase().includes(needle) || technician.username.toLowerCase().includes(needle);
  const options = (data?.technicians ?? []).filter((technician) => String(technician.userId) === selectedId || matches(technician));
  const matchCount = (data?.technicians ?? []).filter(matches).length;
  const periodLabel = period === "all" ? "All time" : monthName(period);

  return <section className="manager-photo-kpi" aria-labelledby="photo-kpi-title">
    <div className="workspace-heading"><div><p className="eyebrow">Photo source</p><h2 id="photo-kpi-title">Photo KPI</h2></div></div>
    <p className="photo-kpi-note">Photos in accepted service visits and repair visits, by how they were added. Gallery means not taken with the in-app camera; unknown means the source was not recorded. Months use Malaysia time.</p>

    <div className="photo-kpi-period" role="group" aria-label="Period">
      <label>Month
        <input type="month" value={period === "all" ? "" : period} max={currentMonth} pattern="\d{4}-\d{2}"
          onChange={(event) => { if (PHOTO_KPI_MONTH.test(event.target.value) && event.target.value <= currentMonth) setPeriod(event.target.value); }} />
      </label>
      <button type="button" className="secondary-command" aria-pressed={period === "all"} onClick={() => setPeriod(period === "all" ? currentMonth : "all")}>All time</button>
    </div>

    {loading && !data ? <p className="form-message" role="status">Loading photo counts…</p> : null}
    {error ? <div className="photo-kpi-error" role="alert"><p className="form-message">{error}</p><button type="button" className="secondary-command" onClick={() => setRevision((value) => value + 1)}>Try again</button></div> : null}

    {data ? <div className="photo-kpi-content" aria-busy={loading}>
      <ChartDefs />
      <section className="report-summary" aria-labelledby="photo-kpi-all-title">
        <div className="workspace-heading"><div><p className="eyebrow">{periodLabel}</p><h3 id="photo-kpi-all-title">All technicians</h3></div></div>
        <KpiTiles label={`All technicians, ${periodLabel}`} items={[
          { label: "Camera", value: data.total.camera }, { label: "Gallery", value: data.total.gallery },
          { label: "Gallery %", value: percent(data.total.galleryPercent) }, { label: "Unknown", value: data.total.unknown }
        ]} />
        {data.technicians.length === 0 || total(data.total) === 0
          ? <p className="empty-state">No photos in this period.</p>
          : <><Legend /><TechnicianBars technicians={data.technicians} />
            <div className="photo-kpi-table-wrap">
              <table className="photo-kpi-table">
                <caption>Photos by technician</caption>
                <thead><tr><th scope="col">Technician</th><th scope="col">Camera</th><th scope="col">Gallery</th><th scope="col">Unknown</th><th scope="col">Gallery %</th></tr></thead>
                <tbody>{sortByGalleryPercent(data.technicians).map((technician) => <tr key={technician.userId}>
                  <th scope="row">{technicianName(technician)}</th><td>{technician.camera}</td><td>{technician.gallery}</td><td>{technician.unknown}</td><td>{percent(technician.galleryPercent)}</td>
                </tr>)}</tbody>
              </table>
            </div></>}
      </section>

      <section className="report-summary" aria-labelledby="photo-kpi-one-title">
        <div className="workspace-heading"><div><p className="eyebrow">{periodLabel}</p><h3 id="photo-kpi-one-title">One technician</h3></div></div>
        <div className="photo-kpi-picker">
          <label>Find a technician<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} autoComplete="off" /></label>
          <label>Technician
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              <option value="">Choose a technician</option>
              {options.map((technician) => <option key={technician.userId} value={String(technician.userId)}>{technicianName(technician)}</option>)}
            </select>
          </label>
          {needle && matchCount === 0 ? <p className="photo-kpi-note" role="status">No technician matches “{search.trim()}”.</p> : null}
        </div>
        {selected ? <div className="photo-kpi-one">
          <h4>{technicianName(selected)}</h4>
          <KpiTiles label={`${technicianName(selected)}, ${periodLabel}`} items={[
            { label: "Camera", value: selected.camera }, { label: "Gallery", value: selected.gallery },
            { label: "Gallery %", value: percent(selected.galleryPercent) }, { label: "Unknown", value: selected.unknown }
          ]} />
          {total(selected) === 0 ? <p className="empty-state">No photos from this technician in this period.</p> : <div className="photo-kpi-donut-block">
            <Donut counts={selected} label={`${technicianName(selected)}, ${periodLabel}`} /><Legend />
          </div>}
          <h4>Last 6 months</h4>
          <Legend />
          <Trend trend={selected.trend} />
        </div> : <p className="empty-state">Choose a technician to see their photos.</p>}
      </section>
    </div> : null}
  </section>;
}
