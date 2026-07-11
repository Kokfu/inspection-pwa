import type { NextFunction, Request, Response } from "express";
import { loadConfig } from "../config/env.js";

const config = loadConfig();

export function authRequired(
  request: Request,
  response: Response,
  next: NextFunction
) {
  if (request.path === "/health") {
    next();
    return;
  }

  if (
    request.path === "/sync" &&
    config.allowPhase2UnauthenticatedSync
  ) {
    next();
    return;
  }

  response.status(501).json({
    error: "AUTH_NOT_IMPLEMENTED",
    message:
      "Production API access is intentionally blocked until Phase 3 authentication is implemented."
  });
}
