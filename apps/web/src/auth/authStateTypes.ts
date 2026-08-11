import type { AuthUser } from "./authApi";

export type ClientAuthState =
  | { status: "restoring" }
  | { status: "verifying"; user?: AuthUser; lastVerifiedAt?: string }
  | { status: "verified"; user: AuthUser; lastVerifiedAt: string }
  | { status: "offline-unverified"; user: AuthUser; lastVerifiedAt: string }
  | { status: "online-unavailable"; user?: AuthUser; lastVerifiedAt?: string; message: string }
  | { status: "logged-out"; message: string };

export function authStateUser(state: ClientAuthState) {
  return state.status === "verified" || state.status === "offline-unverified"
    ? state.user
    : undefined;
}

export function shouldRenderLogin(state: ClientAuthState) {
  return state.status === "logged-out";
}
