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


/**
 * `requireRole` for the Manager routers: identical decision, and a supervisor who is refused leaves an
 * `authz.denied` row in `audit_events` (method + route pattern only, never the body or params). The row
 * is written through the router's own database; an audit failure never changes the 403.
 */
export function requireRoleAudited(database: { query: (text: string, values?: unknown[]) => Promise<unknown> }, ...roles: UserRole[]) {
  const decide = requireRole(...roles);
  return async (request: Request, response: Response, next: NextFunction) => {
    const user = request.currentUser;
    if (user?.role === "supervisor" && !roles.includes("supervisor")) {
      const pattern = `${request.method} ${request.baseUrl}${typeof request.route?.path === "string" ? request.route.path : ""}`;
      await database.query(
        `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, result, reason) VALUES ($1,'authz.denied','route',NULL,'failure',$2)`,
        [user.id, pattern]
      ).catch(() => undefined);
    }
    decide(request, response, next);
  };
}
