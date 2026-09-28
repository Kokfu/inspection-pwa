import { Router } from "express";
import type { Pool } from "pg";
import type { UserRole } from "../auth/authTypes.js";
import { pool } from "../db/pool.js";
import { requireRoleAudited } from "../middleware/requireRole.js";

// T7: in-app compliance reminders on Manager Home. "Due soon" is a fixed, easily-widened window
// (not a per-customer or global setting -- the backlog asked for a read-on-request glance, not a
// configurable reminder engine; T16 already owns the configurable email-reminder path). Chosen as
// a reasonable default for a service business checking in on scheduling; changing it is a one-line
// edit, not a migration, since it is never persisted.
const dueSoonWindowDays = 7;

type Database = Pick<Pool, "query">;
type ComplianceCustomerRow = { id: string; code: string; displayName: string; nextServiceDueDate: string; overdue: boolean };

/**
 * Both buckets are computed from ONE "today" value (a single CTE), never two separate `now()`
 * calls -- so a request landing exactly at a day boundary can never see a customer excluded from
 * both lists, or double-counted, due to the two halves of the query disagreeing about what day it
 * is. Time zone matches every other due-date computation in this codebase (`serviceVisits.ts`,
 * T15's recurrence roll-forward, T16's reminder job): `AT TIME ZONE 'Asia/Kuala_Lumpur'`, computed
 * in SQL, never in JS/the browser's own clock.
 */
async function loadComplianceReminders(database: Database) {
  const result = await database.query<ComplianceCustomerRow>(
    `WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS value)
     SELECT customers.id, customers.customer_code AS code, customers.display_name AS "displayName",
       customers.next_service_due_date::text AS "nextServiceDueDate",
       customers.next_service_due_date < today.value AS overdue
     FROM customers, today
     WHERE customers.is_active = true AND customers.is_demo = false
       AND customers.next_service_due_date IS NOT NULL
       AND customers.next_service_due_date <= today.value + $1::int
     ORDER BY customers.next_service_due_date ASC, customers.display_name, customers.id`,
    [dueSoonWindowDays]
  );
  return {
    overdue: result.rows.filter((row) => row.overdue).map(({ overdue, ...row }) => row),
    dueSoon: result.rows.filter((row) => !row.overdue).map(({ overdue, ...row }) => row),
    dueSoonWindowDays
  };
}

export function createManagerComplianceRemindersRouter(database: Database = pool) {
  const router = Router();
  const requireRole = (...roles: UserRole[]) => requireRoleAudited(database, ...roles);

  router.get("/manager/customers/compliance-reminders", requireRole("admin"), async (_request, response, next) => {
    try {
      response.setHeader("Cache-Control", "private, no-store");
      response.json(await loadComplianceReminders(database));
    } catch (error) { next(error); }
  });

  return router;
}

export const managerComplianceRemindersRouter = createManagerComplianceRemindersRouter();
