import { Router } from "express";
import { requireRole } from "../middleware/requireRole.js";

/** Foundation only. Later write handlers belong here, before this fallback. */
export const repairVisitWritesRouter = Router();
repairVisitWritesRouter.all(["/repair-visits", "/repair-visits/*"], requireRole("inspector", "admin", "supervisor"), (_request, response) => {
  response.status(404).json({ error: "NOT_FOUND" });
});
