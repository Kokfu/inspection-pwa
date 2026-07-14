import type { NextFunction, Request, Response } from "express";

export function requireAuthenticated(
  request: Request,
  response: Response,
  next: NextFunction
) {
  if (request.currentUser) {
    next();
    return;
  }

  response.status(401).json({
    error: "AUTH_REQUIRED",
    message: "Sign in required before server sync"
  });
}

export const authRequired = requireAuthenticated;
