import { Router } from "express";
import type { Pool } from "pg";
import { pool } from "../db/pool.js";
import { requireRoleAudited } from "../middleware/requireRole.js";

type Database = Pick<Pool, "query">;

/**
 * P4 Photo KPI (read-only). Counts, per uploader, the photos that are part of an accepted record:
 *  - staged_inspection_evidence with status 'accepted' (V6/V7 service-visit evidence), timed by accepted_at;
 *  - inspection_attachments (a row exists only once its form instance is submitted, so every row is accepted), timed by received_at;
 *  - repair_visit_photos with status 'accepted' (the current After photo), timed by accepted_at.
 * 'staged' photos are not part of any record yet; 'superseded' repair photos were replaced by a retake, so counting them would
 * double-count one item. Server times are used (never the client's captured_at, which is the phone's clock).
 * A NULL source (V7 photos from before migration 047) is counted as unknown, never as camera.
 * Months are calendar months in Malaysia time (UTC+8, no daylight saving).
 * Only technician (inspector) accounts are counted: photos uploaded by Manager/Admin accounts are not part of this KPI.
 * An Admin (supervisor) sees only the technicians actively assigned to them, as on the Technician List; a Manager sees all.
 */
const MALAYSIA_OFFSET_HOURS = 8;
const TREND_MONTHS = 6;

export type PhotoCounts = { camera: number; gallery: number; unknown: number };
export type PhotoKpiTrendPoint = PhotoCounts & { month: string };
export type PhotoKpiRow = PhotoCounts & { galleryPercent: number | null; trend: PhotoKpiTrendPoint[] };

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

function monthIndex(month: string): number {
  const match = MONTH_PATTERN.exec(month)!;
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}
function monthFromIndex(index: number): string {
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String(index % 12 + 1).padStart(2, "0")}`;
}
function malaysiaMonth(now: Date): string {
  return new Date(now.getTime() + MALAYSIA_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 7);
}
function galleryPercent(counts: PhotoCounts): number | null {
  const known = counts.camera + counts.gallery;
  return known > 0 ? Math.round(counts.gallery * 1000 / known) / 10 : null;
}

type AggregateRow = { user_id: number; month: string; camera: number; gallery: number; unknown: number };
type UserRow = { id: number; username: string; display_name: string | null; role: string; is_active: boolean; hidden_at: Date | null };

export function createManagerPhotoKpiRouter(database: Database = pool, now: () => Date = () => new Date()) {
  const router = Router();
  const requireManager = requireRoleAudited(database, "admin", "supervisor");

  router.get("/manager/photo-kpi", requireManager, async (request, response, next) => {
    const raw = request.query.period;
    const keys = Object.keys(request.query);
    if (typeof raw !== "string" || keys.length !== 1 || !(raw === "all" || MONTH_PATTERN.test(raw))) {
      response.status(400).json({ error: "INVALID_PERIOD" });
      return;
    }
    try {
      const period = raw;
      const anchor = period === "all" ? malaysiaMonth(now()) : period;
      const months = Array.from({ length: TREND_MONTHS }, (_, offset) => monthFromIndex(monthIndex(anchor) - (TREND_MONTHS - 1) + offset));

      const aggregates = await database.query<AggregateRow>(`
        WITH photos AS (
          SELECT uploader_user_id AS user_id, capture_source, accepted_at AS at
          FROM staged_inspection_evidence WHERE status = 'accepted'
          UNION ALL
          SELECT uploaded_by_user_id, capture_source, received_at FROM inspection_attachments
          UNION ALL
          SELECT uploader_user_id, capture_source, accepted_at FROM repair_visit_photos WHERE status = 'accepted'
        )
        SELECT user_id::int AS user_id,
          to_char((at AT TIME ZONE 'UTC') + interval '${MALAYSIA_OFFSET_HOURS} hours', 'YYYY-MM') AS month,
          (count(*) FILTER (WHERE capture_source = 'camera'))::int AS camera,
          (count(*) FILTER (WHERE capture_source = 'gallery'))::int AS gallery,
          (count(*) FILTER (WHERE capture_source IS NULL OR capture_source NOT IN ('camera','gallery')))::int AS unknown
        FROM photos WHERE at IS NOT NULL
        GROUP BY 1, 2`);
      const users = await database.query<UserRow>(
        `SELECT id::int AS id, username, display_name, role, is_active, hidden_at FROM users`
      );

      const supervisor = request.currentUser!.role === "supervisor";
      const assigned = supervisor
        ? new Set((await database.query<{ technician_id: number }>(
          `SELECT technician_id::int AS technician_id FROM technician_supervisor_assignments WHERE supervisor_id = $1 AND archived_at IS NULL`,
          [request.currentUser!.id])).rows.map((assignment) => assignment.technician_id))
        : undefined;
      const scopedUsers = users.rows.filter((user) => user.role === "inspector" && (!assigned || assigned.has(user.id)));
      const scopedIds = new Set(scopedUsers.map((user) => user.id));

      const byUser = new Map<number, Map<string, PhotoCounts>>();
      for (const row of aggregates.rows) {
        if (!scopedIds.has(row.user_id)) continue;
        const perMonth = byUser.get(row.user_id) ?? new Map<string, PhotoCounts>();
        perMonth.set(row.month, { camera: row.camera, gallery: row.gallery, unknown: row.unknown });
        byUser.set(row.user_id, perMonth);
      }
      const zero = (): PhotoCounts => ({ camera: 0, gallery: 0, unknown: 0 });
      const add = (target: PhotoCounts, source: PhotoCounts) => { target.camera += source.camera; target.gallery += source.gallery; target.unknown += source.unknown; };
      const summarize = (perMonth: Map<string, PhotoCounts> | undefined): PhotoKpiRow => {
        const counts = zero();
        for (const [month, value] of perMonth ?? []) if (period === "all" || month === period) add(counts, value);
        const trend = months.map((month) => ({ month, ...(perMonth?.get(month) ?? zero()) }));
        return { ...counts, galleryPercent: galleryPercent(counts), trend };
      };

      const technicians = scopedUsers.flatMap((user) => {
        const row = summarize(byUser.get(user.id));
        const hasPhotos = row.camera + row.gallery + row.unknown > 0;
        const listed = user.is_active && user.hidden_at === null;
        if (!hasPhotos && !listed) return [];
        return [{
          userId: user.id, username: user.username, displayName: user.display_name,
          hidden: user.hidden_at !== null || !user.is_active, ...row
        }];
      }).sort((left, right) => (left.displayName ?? left.username).localeCompare(right.displayName ?? right.username) || left.userId - right.userId);

      // The period total is the sum of the listed technicians (every uploader with photos in the period is listed).
      const totalCounts = zero();
      const totalPerMonth = new Map<string, PhotoCounts>();
      for (const technician of technicians) add(totalCounts, technician);
      // The trend covers every in-scope technician, so a hidden technician with photos only in an earlier month still counts there.
      for (const perMonth of byUser.values()) {
        for (const month of months) {
          const value = perMonth.get(month);
          if (!value) continue;
          const entry = totalPerMonth.get(month) ?? zero();
          add(entry, value);
          totalPerMonth.set(month, entry);
        }
      }
      response.setHeader("Cache-Control", "private, no-store");
      response.json({
        period, months, technicians,
        total: { ...totalCounts, galleryPercent: galleryPercent(totalCounts), trend: months.map((month) => ({ month, ...(totalPerMonth.get(month) ?? zero()) })) }
      });
    } catch (error) { next(error); }
  });
  return router;
}

export const managerPhotoKpiRouter = createManagerPhotoKpiRouter();
