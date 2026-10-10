import type { AuthUser } from "../auth/authApi";
import type { ProductRole } from "./RoleSelection";

/** Roles that may use the operations workspace: admin and supervisor (review only, T4). */
export function isManagerRole(role: AuthUser["role"]) {
  return role === "admin" || role === "supervisor";
}

/** Presentation role selection never grants authority; it must match /auth/me. */
export function productRoleMatches(role: ProductRole, user: AuthUser) {
  if (role === "technician") return user.role === "inspector";
  if (role === "manager") return user.role === "admin";
  return user.role === "supervisor";
}

/**
 * Manager screens a supervisor may open (T4): Home, Services (operations), Current Services Done, a
 * visit's detail and its Final Report. Everything else (technician management, customers, customer
 * configuration, the per-service editor, Next Upcoming Service) is admin-only; the server's 403 stays
 * the authority, this only keeps a supervisor off screens that would fail.
 */
const supervisorRoutes: ReadonlySet<string> = new Set([
  "manager-home", "manager-operations", "manager-services-done", "manager-service-visit", "manager-final-report", "manager-correction",
  "manager-location-proposals"
]);
export function supervisorAllowsRoute(routeName: string) {
  return supervisorRoutes.has(routeName);
}

/** User-facing label shared by both existing review roles (CR-11). */
export function reviewerRoleLabel(role: "admin" | "supervisor" | null): string {
  return role === null ? "" : "Admin";
}
