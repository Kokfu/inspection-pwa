import { Router, type ErrorRequestHandler } from "express";
import { pool } from "../db/pool.js";
import { requireRoleAudited } from "../middleware/requireRole.js";
import { listRepairServices, mutateRepairWorkOrder, readRepairService, repairUuid, reviewRepairFinding, type Database } from "../repairs/repairFoundation.js";
import { readBeforeBytes, type BeforePhoto } from "../repairs/acceptedSource.js";
import { RepairError, record } from "../repairs/findingReaders.js";
import { decideRepair, readSubmittedRepair, stageRepairPhoto, submitRepairBatch } from "../repairs/repairSubmission.js";
import { repairMultipart } from "../repairs/repairMultipart.js";
import { previewRepairExport, issueRepairExport, repairExportHistory, downloadRepairExport } from "../repairs/repairExports.js";

/** Repair authority stays separate from inspection job ownership and report approvals. */
export function createRepairsRouter(database: Database = pool) {
  const router = Router(); const roles = (...r: Array<"admin" | "supervisor" | "inspector">) => requireRoleAudited(database,...r);
  router.use("/repairs",roles("admin","supervisor","inspector"),(req,res,next) => {
    res.setHeader("Cache-Control","private, no-store");
    if (Object.keys(req.query).length) { res.status(400).json({error:"INVALID_REPAIR_REQUEST"}); return; }
    const expected = req.header("x-expected-user-id");
    if (expected !== undefined && expected !== String(req.currentUser!.id)) { res.status(409).json({error:"IDENTITY_MISMATCH"}); return; }
    next();
  });
  router.get("/repairs/services",async (req,res,next) => {
    try {
      if (Object.keys(req.query).length) throw new RepairError("INVALID_REPAIR_REQUEST","Query is invalid.",400);
      res.json(await listRepairServices(database,req.currentUser!));
    } catch(e) { next(e); }
  });
  router.get("/repairs/services/:jobId/:systemKey",async (req,res,next) => {
    try { res.json(await readRepairService(database,req.currentUser!,String(req.params.jobId),String(req.params.systemKey))); } catch(e) { next(e); }
  });
  for (const content of [false,true]) router.get(`/repairs/findings/:findingId${content ? "/before/content" : ""}`,async (req,res,next) => {
    try {
      const id = repairUuid(req.params.findingId);
      const found = (await database.query("SELECT job_id,system_key,original_metadata FROM repair_findings WHERE id=$1",[id])).rows[0];
      if (!found) throw new RepairError("REPAIR_NOT_FOUND","Repair finding was not found.",404);
      const service = await readRepairService(database,req.currentUser!,found.job_id,found.system_key);
      const finding = service.findings.find(f => f.findingId === id);
      if (!finding) throw new RepairError("REPAIR_NOT_FOUND","Repair finding was not found.",404);
      if (!content) { res.json(finding); return; }
      if (!record(found.original_metadata.beforePhoto)) throw new RepairError("HISTORICAL_BEFORE_ABSENT","Historical finding has no original Before photo.",404);
      const bytes = await readBeforeBytes(found.original_metadata.beforePhoto as BeforePhoto);
      res.setHeader("Content-Type","image/jpeg"); res.setHeader("X-Content-Type-Options","nosniff"); res.setHeader("Content-Disposition","inline"); res.send(bytes);
    } catch(e) { next(e); }
  });
  router.post("/repairs/work-orders",roles("admin"),async (req,res,next) => {
    try { res.json(await mutateRepairWorkOrder(database,req.currentUser!,req.body,"manager")); } catch(e) { next(e); }
  });
  router.post("/repairs/exports/preview",roles("admin","supervisor"),async(req,res,next)=>{
    try { res.json(await previewRepairExport(database,req.currentUser!,req.body)); } catch(e) { next(e); }
  });
  router.post("/repairs/exports",roles("admin","supervisor"),async(req,res,next)=>{
    try { res.json(await issueRepairExport(database,req.currentUser!,req.body)); } catch(e) { next(e); }
  });
  router.get("/repairs/services/:jobId/:systemKey/exports",roles("admin","supervisor"),async(req,res,next)=>{
    try { res.json(await repairExportHistory(database,req.currentUser!,String(req.params.jobId),String(req.params.systemKey))); } catch(e) { next(e); }
  });
  router.get("/repairs/exports/:exportId/pdf",roles("admin","supervisor"),async(req,res,next)=>{
    try {
      const result=await downloadRepairExport(database,req.currentUser!,String(req.params.exportId));
      res.setHeader("Content-Type","application/pdf");res.setHeader("X-Content-Type-Options","nosniff");
      res.setHeader("Content-Disposition",`attachment; filename="${result.number.replaceAll('/','-')}.pdf"`);res.send(result.bytes);
    } catch(e) { next(e); }
  });
  router.post("/repairs/work-orders/self-start",roles("inspector"),async (req,res,next) => {
    try { res.json(await mutateRepairWorkOrder(database,req.currentUser!,req.body,"self")); } catch(e) { next(e); }
  });
  router.post("/repairs/findings/:findingId/source-review",roles("admin","supervisor"),async (req,res,next) => {
    try { res.json(await reviewRepairFinding(database,req.currentUser!,String(req.params.findingId),req.body)); } catch(e) { next(e); }
  });
  router.post("/repairs/evidence/stage",roles("inspector"),async (req,res,next)=>{
    try {const {input,sourcePath}=await repairMultipart(req);res.json(await stageRepairPhoto(database,req.currentUser!,input,sourcePath));} catch(e) {next(e);}
  });
  router.post("/repairs/submissions",roles("inspector"),async (req,res,next)=>{
    try {res.json(await submitRepairBatch(database,req.currentUser!,req.body));} catch(e) {next(e);}
  });
  router.post("/repairs/records/:clientUuid/decisions",roles("admin","supervisor"),async (req,res,next)=>{
    try {res.json(await decideRepair(database,req.currentUser!,String(req.params.clientUuid),req.body));} catch(e) {next(e);}
  });
  for(const content of [false,true]) router.get(`/repairs/records/:clientUuid${content?"/after/content":""}`,async (req,res,next)=>{
    try {
      const result=await readSubmittedRepair(database,req.currentUser!,String(req.params.clientUuid),content);
      if (content && "bytes" in result) {
        res.setHeader("Content-Type","image/jpeg");res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Content-Disposition","inline");res.send(result.bytes);
      } else res.json(result);
    } catch(e) {next(e);}
  });
  const auditWriteFailure: ErrorRequestHandler = (error,req,_res,next)=>{
    if (req.method!=="POST" || !req.currentUser || !(error instanceof RepairError)
      || !/^\/repairs\/(evidence\/stage|submissions|records\/[^/]+\/decisions)$/.test(req.path)) { next(error);return; }
    void database.query("INSERT INTO audit_events(actor_user_id,action,entity_type,result,reason) VALUES($1,'repair.write','repair','failure',$2)",[req.currentUser.id,error.code])
      .then(()=>next(error),next);
  };
  router.use(auditWriteFailure);
  return router;
}
export const repairsRouter = createRepairsRouter();
