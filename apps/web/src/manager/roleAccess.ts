import type { AuthUser } from "../auth/authApi";
import type { ProductRole } from "./RoleSelection";

/** Presentation role selection never grants authority; it must match /auth/me. */
export function productRoleMatches(role: ProductRole, user: AuthUser) {
  return role === "technician" ? user.role === "inspector" : user.role === "admin";
}
