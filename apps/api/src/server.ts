import express from "express";
import { closePdfEngine } from "./reports/pdf/htmlToPdf.js";
import { registerGracefulShutdown } from "./serverShutdown.js";
import { pool } from "./db/pool.js";
import { reconcileAttachmentStorage } from "./attachments/attachmentStorage.js";
import { loadConfig, provisionServiceDueEmailEncryptionKey } from "./config/env.js";
import { runMigrations } from "./db/migrations.js";
import { currentUser } from "./middleware/currentUser.js";
import { requestSecurity } from "./middleware/requestSecurity.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { inspectionsRouter } from "./routes/inspections.js";
import { inspectionReferenceRouter } from "./routes/inspectionReference.js";
import { inspectionJobsRouter } from "./routes/inspectionJobs.js";
import { inspectionAttachmentsRouter } from "./routes/inspectionAttachments.js";
import { stagedEvidenceRouter } from "./routes/stagedEvidence.js";
import { masterSystemInspectionsRouter } from "./routes/masterSystemInspections.js";
import { managerServiceVisitsRouter } from "./routes/managerServiceVisits.js";
import { managerDashboardRouter } from "./routes/managerDashboard.js";
import { managerCustomersRouter } from "./routes/managerCustomers.js";
import { managerCompanyProfileRouter } from "./routes/managerCompanyProfile.js";
import { managerTechniciansRouter } from "./routes/managerTechnicians.js";
import { managerRemindersRouter } from "./routes/managerReminders.js";
import { serviceCommonRemarksRouter } from "./routes/serviceCommonRemarks.js";
import { managerComplianceRemindersRouter } from "./routes/managerComplianceReminders.js";
import { managerCorrectionsRouter } from "./routes/managerCorrections.js";
import { reportApprovalsRouter } from "./routes/reportApprovals.js";
import { locationProposalsRouter } from "./routes/locationProposals.js";
import { sectionRemarksRouter } from "./routes/sectionRemarks.js";
import { siteProposalsRouter } from "./routes/siteProposals.js";
import { syncRouter } from "./routes/sync.js";
import { testRecordsRouter } from "./routes/testRecords.js";

const config = loadConfig();
const app = express();

app.disable("x-powered-by");
app.use(requestSecurity);
app.use(express.json({ limit: "1mb" }));

app.use(healthRouter);
app.use(currentUser);
app.use(authRouter);
app.use(syncRouter);
app.use(testRecordsRouter);
app.use(inspectionsRouter);
app.use(inspectionReferenceRouter);
app.use(inspectionJobsRouter);
app.use(managerServiceVisitsRouter);
app.use(managerDashboardRouter);
// Must precede managerCustomersRouter: its `/manager/customers/:customerId` would otherwise match
// `/manager/customers/compliance-reminders` and answer 400 INVALID_CUSTOMER_ID (I-22).
app.use(managerComplianceRemindersRouter);
app.use(managerCustomersRouter);
app.use(managerCompanyProfileRouter);
app.use(managerTechniciansRouter);
app.use(managerRemindersRouter);
app.use(serviceCommonRemarksRouter);
app.use(sectionRemarksRouter);
app.use(siteProposalsRouter);
app.use(managerCorrectionsRouter);
app.use(reportApprovalsRouter);
app.use(locationProposalsRouter);
app.use(masterSystemInspectionsRouter);
app.use(inspectionAttachmentsRouter);
app.use(stagedEvidenceRouter);

app.use((_request, response) => {
  response.status(404).json({ error: "NOT_FOUND" });
});

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction
  ) => {
    if (
      error instanceof SyntaxError &&
      "status" in error &&
      error.status === 400
    ) {
      response.status(400).json({ error: "INVALID_JSON" });
      return;
    }

    if (error instanceof Error && "status" in error && typeof error.status === "number" && "code" in error && typeof error.code === "string") {
      response.status(error.status).json({ error: error.code, message: error.message });
      return;
    }
    console.error(error);
    response.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
);

await runMigrations();
const storedReminderPassword = (await pool.query("SELECT 1 FROM service_due_email_settings WHERE id=1")).rows.length > 0;
if (!provisionServiceDueEmailEncryptionKey(storedReminderPassword)) {
  console.warn("Service due email is unavailable: encryption key missing or invalid");
}
const attachmentStorage = await reconcileAttachmentStorage();
if (
  attachmentStorage.missingFiles.length > 0
  || attachmentStorage.wrongSizeFiles.length > 0
  || attachmentStorage.wrongHashFiles.length > 0
  || attachmentStorage.orphanFiles.length > 0
  || attachmentStorage.staleTemporaryFiles.length > 0
) {
  console.warn("Attachment storage reconciliation found inconsistencies", {
    missingFileCount: attachmentStorage.missingFiles.length,
    wrongSizeFileCount: attachmentStorage.wrongSizeFiles.length,
    wrongHashFileCount: attachmentStorage.wrongHashFiles.length,
    orphanFileCount: attachmentStorage.orphanFiles.length,
    staleTemporaryFileCount: attachmentStorage.staleTemporaryFiles.length
  });
}

const server = app.listen(config.port, () => {
  console.log(`inspection-api listening on ${config.port}`);
});

registerGracefulShutdown({ server, closePdfEngine, closeDatabase: () => pool.end() });
