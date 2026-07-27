import express from "express";
import { reconcileAttachmentStorage } from "./attachments/attachmentStorage.js";
import { loadConfig } from "./config/env.js";
import { runMigrations } from "./db/migrations.js";
import { currentUser } from "./middleware/currentUser.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { inspectionsRouter } from "./routes/inspections.js";
import { inspectionReferenceRouter } from "./routes/inspectionReference.js";
import { inspectionJobsRouter } from "./routes/inspectionJobs.js";
import { inspectionAttachmentsRouter } from "./routes/inspectionAttachments.js";
import { masterSystemInspectionsRouter } from "./routes/masterSystemInspections.js";
import { syncRouter } from "./routes/sync.js";
import { testRecordsRouter } from "./routes/testRecords.js";

const config = loadConfig();
const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.use(healthRouter);
app.use(currentUser);
app.use(authRouter);
app.use(syncRouter);
app.use(testRecordsRouter);
app.use(inspectionsRouter);
app.use(inspectionReferenceRouter);
app.use(inspectionJobsRouter);
app.use(masterSystemInspectionsRouter);
app.use(inspectionAttachmentsRouter);

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

    console.error(error);
    response.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
);

await runMigrations();
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

app.listen(config.port, () => {
  console.log(`inspection-api listening on ${config.port}`);
});
