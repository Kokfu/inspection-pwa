import { Router } from "express";
import { requireRole } from "../middleware/requireRole.js";

/** Foundation only. No catalog or business data is exposed yet. */
export const repairVisitReadsRouter = Router();
repairVisitReadsRouter.get(["/repair-visits", "/repair-visits/*"], requireRole("inspector", "admin", "supervisor"), (_request, response) => {
  response.status(404).json({ error: "NOT_FOUND" });
});
