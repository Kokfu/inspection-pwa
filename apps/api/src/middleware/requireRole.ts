import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "../auth/authTypes.js";

export function requireRole(...roles: UserRole[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.currentUser) {
      response.status(401).json({
        error: "AUTH_REQUIRED",
        message: "Sign in required"
      });
      return;
    }

    if (!roles.includes(request.currentUser.role)) {
      response.status(403).json({
        error: "FORBIDDEN",
        message: "You do not have permission for this action"
      });
      return;
    }

    next();
  };
}

