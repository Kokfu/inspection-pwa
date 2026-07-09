import { Router } from "express";

export const syncRouter = Router();

syncRouter.post("/sync", (_request, response) => {
  response.status(501).json({
    error: "SYNC_NOT_IMPLEMENTED",
    message:
      "Phase 2 will add idempotent UUID-confirming sync. This route is blocked in the foundation phase."
  });
});

