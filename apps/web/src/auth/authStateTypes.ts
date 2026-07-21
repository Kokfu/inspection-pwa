import type { AuthUser } from "./authApi";

export type ClientAuthState =
  | { status: "checking" }
  | { status: "verified"; user: AuthUser; lastVerifiedAt: string }
  | { status: "offline-unverified"; user: AuthUser; lastVerifiedAt: string }
  | { status: "unauthenticated"; message: string };

export function authStateUser(state: ClientAuthState) {
  return state.status === "verified" || state.status === "offline-unverified"
    ? state.user
    : undefined;
}
