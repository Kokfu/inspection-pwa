import { ManagerApiError } from "./managerApi";

/**
 * P4: client for GET /api/manager/photo-kpi (apps/api/src/routes/managerPhotoKpi.ts). The reply is validated strictly and
 * cross-checked (period echoed, six consecutive months, percentages recomputed, totals equal to the listed rows); anything
 * malformed is "unavailable", never a partial chart.
 */
export type PhotoCounts = { camera: number; gallery: number; unknown: number };
export type PhotoTrendPoint = PhotoCounts & { month: string };
export type PhotoKpiTotal = PhotoCounts & { galleryPercent: number | null; trend: PhotoTrendPoint[] };
export type PhotoKpiTechnician = PhotoKpiTotal & { userId: number; username: string; displayName: string | null; hidden: boolean };
export type PhotoKpi = { period: string; months: string[]; technicians: PhotoKpiTechnician[]; total: PhotoKpiTotal };
export type PhotoKpiPeriod = "all" | string;

export const PHOTO_KPI_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
};
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const unavailable = (): never => { throw new ManagerApiError("Photo KPI data is currently unavailable.", "unavailable"); };

export function photoGalleryPercent(counts: PhotoCounts): number | null {
  const known = counts.camera + counts.gallery;
  return known > 0 ? Math.round(counts.gallery * 1000 / known) / 10 : null;
}

function monthNumber(month: string) { return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1; }

function isTrend(value: unknown, months: string[]): value is PhotoTrendPoint[] {
  return Array.isArray(value) && value.length === months.length && value.every((point, index) =>
    isRecord(point) && hasExactKeys(point, ["month", "camera", "gallery", "unknown"]) && point.month === months[index]
    && count(point.camera) && count(point.gallery) && count(point.unknown));
}

function isTotal(value: unknown, months: string[]): boolean {
  return isRecord(value) && Object.hasOwn(value, "trend") && count(value.camera) && count(value.gallery) && count(value.unknown)
    && (value.galleryPercent === null || typeof value.galleryPercent === "number")
    && value.galleryPercent === photoGalleryPercent(value as unknown as PhotoCounts) && isTrend(value.trend, months);
}

export function parsePhotoKpi(data: unknown, period: PhotoKpiPeriod): PhotoKpi {
  if (!isRecord(data) || !hasExactKeys(data, ["period", "months", "technicians", "total"]) || data.period !== period
    || !Array.isArray(data.months) || data.months.length !== 6 || !data.months.every((month) => typeof month === "string" && PHOTO_KPI_MONTH.test(month))
    || !data.months.every((month, index, all) => index === 0 || monthNumber(month) === monthNumber(all[index - 1]) + 1)
    || (period !== "all" && data.months[5] !== period)
    || !Array.isArray(data.technicians) || data.technicians.length > 5000) return unavailable();
  const months = data.months as string[];
  const ids = new Set<number>();
  const sum = { camera: 0, gallery: 0, unknown: 0 };
  for (const item of data.technicians as unknown[]) {
    if (!isRecord(item)) return unavailable();
    const row: Record<string, unknown> = item;
    if (!hasExactKeys(row, ["userId", "username", "displayName", "hidden", "camera", "gallery", "unknown", "galleryPercent", "trend"])
      || typeof row.userId !== "number" || !Number.isSafeInteger(row.userId) || row.userId < 1 || ids.has(row.userId)
      || typeof row.username !== "string" || !row.username.trim()
      || !(row.displayName === null || (typeof row.displayName === "string" && row.displayName.trim().length > 0))
      || typeof row.hidden !== "boolean" || !isTotal(row, months)) return unavailable();
    ids.add(row.userId);
    sum.camera += row.camera as number; sum.gallery += row.gallery as number; sum.unknown += row.unknown as number;
  }
  if (!isRecord(data.total) || !hasExactKeys(data.total, ["camera", "gallery", "unknown", "galleryPercent", "trend"]) || !isTotal(data.total, months) || data.total.camera !== sum.camera || data.total.gallery !== sum.gallery || data.total.unknown !== sum.unknown) return unavailable();
  return data as unknown as PhotoKpi;
}

export async function loadPhotoKpi(period: PhotoKpiPeriod, signal?: AbortSignal): Promise<PhotoKpi> {
  if (period !== "all" && !PHOTO_KPI_MONTH.test(period)) throw new ManagerApiError("Choose a month or All time.", "domain");
  let response: Response;
  try {
    response = await fetch(`/api/manager/photo-kpi?period=${encodeURIComponent(period)}`, { credentials: "same-origin", cache: "no-store", signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ManagerApiError("Photo KPI cannot be loaded right now.", "unavailable");
  }
  if (response.status === 401 || response.status === 403) throw new ManagerApiError("Manager access requires a verified Manager or Admin account.", "authorization");
  let data: unknown;
  try { data = await response.json(); } catch { return unavailable(); }
  if (!response.ok) return unavailable();
  return parsePhotoKpi(data, period);
}
