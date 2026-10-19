import { Router, type ErrorRequestHandler } from "express";
import { requireRole } from "../middleware/requireRole.js";
import { pool } from "../db/pool.js";
import { RepairError } from "../repairVisits/fieldCatalogReaders.js";
import { createRepairVisit, stageRepairVisitPhoto, submitRepairVisit, decideRepairVisit, deleteRepairVisit, repairVisitPdf, readRepairVisit, readRepairVisitPhoto, listRepairVisits, type Database } from "../repairVisits/repairVisitWrites.js";
import { repairVisitMultipart } from "../repairVisits/repairVisitMultipart.js";
import { positive } from "../repairVisits/repairVisitWriteContract.js";

/** Wire contract: repairVisits/repairVisitWriteApi.md. */
export function createRepairVisitWritesRouter(database: Database = pool) {
  const router = Router();
  router.use("/repair-visits", requireRole("inspector", "admin", "supervisor"), (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (Object.keys(req.query).length) { res.status(400).json({ error: "INVALID_REPAIR_VISIT_REQUEST" }); return; }
    const expected = req.header("x-expected-user-id");
    if (expected !== undefined && expected !== String(req.currentUser!.id)) { res.status(409).json({ error: "IDENTITY_MISMATCH" }); return; }
    next();
  });
  router.post("/repair-visits", requireRole("inspector"), async (req,res,next) => {
    try { res.json(await createRepairVisit(database,req.currentUser!,req.body)); } catch(e) { next(e); }
  });
  router.post("/repair-visits/:visitId/photos", requireRole("inspector"), async (req,res,next) => {
    try { const upload = await repairVisitMultipart(req); res.json(await stageRepairVisitPhoto(database,req.currentUser!,String(req.params.visitId),upload.input,upload.sourcePath)); } catch(e) { next(e); }
  });
  router.post("/repair-visits/:visitId/submit", requireRole("inspector"), async (req,res,next) => {
    try { res.json(await submitRepairVisit(database,req.currentUser!,String(req.params.visitId),req.body)); } catch(e) { next(e); }
  });
  for (const returning of [true,false]) router.post(`/repair-visits/:visitId/${returning ? "return" : "approve"}`, requireRole("admin","supervisor"), async (req,res,next) => {
    try { res.json(await decideRepairVisit(database,req.currentUser!,String(req.params.visitId),req.body,returning)); } catch(e) { next(e); }
  });
  router.delete("/repair-visits/:visitId", requireRole("inspector"), async (req,res,next) => {
    try { res.json(await deleteRepairVisit(database,req.currentUser!,String(req.params.visitId),req.body)); } catch(e) { next(e); }
  });
  router.get("/repair-visits", async (req,res,next) => {
    try { res.json(await listRepairVisits(database,req.currentUser!)); } catch(e) { next(e); }
  });
  router.get("/repair-visits/:visitId", async (req,res,next) => {
    try { res.json(await readRepairVisit(database,req.currentUser!,String(req.params.visitId))); } catch(e) { next(e); }
  });
  router.get("/repair-visits/:visitId/photos/:photoUuid/content", async (req,res,next) => {
    try {
      const bytes = await readRepairVisitPhoto(database,req.currentUser!,String(req.params.visitId),String(req.params.photoUuid));
      res.setHeader("Content-Type","image/jpeg"); res.setHeader("X-Content-Type-Options","nosniff"); res.send(bytes);
    } catch(e) { next(e); }
  });
  for (const preview of [true,false]) router.get(`/repair-visits/:visitId/revisions/:revision/${preview ? "preview.pdf" : "report.pdf"}`, async (req,res,next) => {
    try {
      const raw = String(req.params.revision);
      const revision = positive(/^[1-9][0-9]*$/.test(raw) ? Number(raw) : null);
      const bytes = await repairVisitPdf(database,req.currentUser!,String(req.params.visitId),preview,revision);
      res.setHeader("Content-Type","application/pdf"); res.setHeader("X-Content-Type-Options","nosniff"); res.send(bytes);
    } catch(e) { next(e); }
  });
  const errors: ErrorRequestHandler = (e,_req,res,next) => {
    if (!(e instanceof RepairError)) { next(e); return; }
    res.status(e.status).json({ error: e.code, message: e.message });
  };
  router.use(errors); return router;
}
export const repairVisitWritesRouter = createRepairVisitWritesRouter();
