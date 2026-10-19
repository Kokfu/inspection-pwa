import { pool } from "../db/pool.js";

export const visitNotYetCreated = {
  error: "VISIT_NOT_YET_CREATED",
  message: "Create and confirm this visit before syncing its forms or photos."
} as const;

/** Malformed IDs stay on the existing validation/authorization path. */
export async function visitDoesNotExist(id: unknown) {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return false;
  return (await pool.query("SELECT id FROM inspection_jobs WHERE id=$1", [id])).rows.length === 0;
}
