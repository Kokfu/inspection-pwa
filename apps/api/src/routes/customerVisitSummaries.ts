import { Router } from "express";
import type { Pool } from "pg";
import { pool } from "../db/pool.js";
import { requireRole } from "../middleware/requireRole.js";
import { listVisitSummaries, parseVisitSummaryFilters, VisitSummaryError } from "../visits/visitSummaries.js";

/** GET /customers/:customerId/visit-summaries?kind=&status=&dateFrom=&dateTo=&siteId=&cursor=&limit=
 * Dates are inclusive YYYY-MM-DD. Status uses the source visit's enum. Limit defaults to 50 (max 100).
 * This endpoint is summary-only for every role. Detail authorization remains separate.
 */
export function createCustomerVisitSummariesRouter(database: Pick<Pool, "query"> = pool) {
  const router = Router();
  router.get("/customers/:customerId/visit-summaries", requireRole("admin", "inspector"), async (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const expected = req.header("x-expected-user-id");
      if (expected !== undefined && expected !== String(req.currentUser!.id)) {
        res.status(409).json({ error: "IDENTITY_MISMATCH" }); return;
      }
      const customerId = String(req.params.customerId);
      const filters = parseVisitSummaryFilters(customerId, req.query);
      res.json(await listVisitSummaries(database, req.currentUser!, customerId, filters));
    } catch (error) {
      if (error instanceof VisitSummaryError) { res.status(error.status).json({ error: error.code }); return; }
      next(error);
    }
  });
  return router;
}
export const customerVisitSummariesRouter = createCustomerVisitSummariesRouter();
