import { Router, type ErrorRequestHandler } from "express";
import { requireRole } from "../middleware/requireRole.js";
import { pool } from "../db/pool.js";
import { catalogUuid, listPreviousVisits, type CatalogDatabase } from "../repairVisits/previousVisits.js";
import { readCatalogBeforePhoto, readCurrentConfigurationCatalog, readPreviousVisitCatalog } from "../repairVisits/fieldCatalog.js";
import { RepairError } from "../repairVisits/fieldCatalogReaders.js";

/** All IDs are route parameters. Unknown query keys are refused. No storage paths leave this API.
 * GET /repair-visits/customers/:customerId/sites/:siteId/previous-visits
 * GET /repair-visits/customers/:customerId/sites/:siteId/catalog
 * GET /repair-visits/customers/:customerId/sites/:siteId/previous-visits/:kind/:visitId/catalog
 * GET /repair-visits/customers/:customerId/sites/:siteId/previous-visits/:kind/:visitId/photos/:photoUuid/content
 */
export function createRepairVisitReadsRouter(database: CatalogDatabase = pool) {
  const router = Router();
  router.use("/repair-visits", requireRole("inspector", "admin", "supervisor"), (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (Object.keys(req.query).length) { res.status(400).json({ error: "INVALID_REPAIR_VISIT_REQUEST" }); return; }
    const expected = req.header("x-expected-user-id");
    if (expected !== undefined && expected !== String(req.currentUser!.id)) { res.status(409).json({ error: "IDENTITY_MISMATCH" }); return; }
    next();
  });
  const base = "/repair-visits/customers/:customerId/sites/:siteId";
  router.get(`${base}/previous-visits`, async (req, res, next) => {
    try { res.json({ visits: await listPreviousVisits(database, req.currentUser!, String(req.params.customerId), String(req.params.siteId)) }); } catch (e) { next(e); }
  });
  router.get(`${base}/catalog`, async (req, res, next) => {
    try { res.json(await readCurrentConfigurationCatalog(database, req.currentUser!, String(req.params.customerId), String(req.params.siteId))); } catch (e) { next(e); }
  });
  for (const content of [false, true]) router.get(`${base}/previous-visits/:kind/:visitId/${content ? "photos/:photoUuid/content" : "catalog"}`, async (req, res, next) => {
    try {
      const kind = req.params.kind;
      if (kind !== "service" && kind !== "repair") throw new RepairError("INVALID_REPAIR_VISIT_REQUEST", "Invalid visit kind.", 400);
      const previous: { kind: "service" | "repair"; visitId: string } = { kind, visitId: catalogUuid(req.params.visitId) };
      if (!content) { res.json({ fields: await readPreviousVisitCatalog(database, req.currentUser!, String(req.params.customerId), String(req.params.siteId), previous) }); return; }
      const bytes = await readCatalogBeforePhoto(database, req.currentUser!, String(req.params.customerId), String(req.params.siteId), previous, catalogUuid((req.params as Record<string, string>).photoUuid));
      res.setHeader("Content-Type", "image/jpeg"); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Content-Disposition", "inline"); res.send(bytes);
    } catch (e) { next(e); }
  });
  const errors: ErrorRequestHandler = (error, _req, res, next) => {
    if (!(error instanceof RepairError)) { next(error); return; }
    res.status(error.status).json({ error: error.code, message: error.message });
  };
  router.use(errors);
  return router;
}
export const repairVisitReadsRouter = createRepairVisitReadsRouter();
