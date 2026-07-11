import { Router } from "express";
import { syncTestRecords } from "../sync/testRecordSync.js";

export const syncRouter = Router();

syncRouter.post("/sync", async (request, response, next) => {
  try {
    const { items } = request.body as { items?: unknown };

    if (!Array.isArray(items)) {
      response.status(400).json({
        acceptedIds: [],
        duplicateIds: [],
        failed: [
          {
            id: "unknown",
            code: "VALIDATION_ERROR",
            message: "items must be an array"
          }
        ]
      });
      return;
    }

    if (items.length > 25) {
      response.status(400).json({
        acceptedIds: [],
        duplicateIds: [],
        failed: [
          {
            id: "unknown",
            code: "VALIDATION_ERROR",
            message: "items batch limit is 25"
          }
        ]
      });
      return;
    }

    response.json(await syncTestRecords(items));
  } catch (error) {
    next(error);
  }
});
