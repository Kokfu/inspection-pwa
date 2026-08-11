import type { AuthProbeResult } from "./authApi";
import type { CachedIdentity } from "./authStateRepository";
import type { ClientAuthState } from "./authStateTypes";

export type AuthRestorationDecision =
  | { kind: "verified"; user: Extract<AuthProbeResult, { status: "authenticated" }>["user"] }
  | { kind: "offline-unverified"; identity: CachedIdentity }
  | { kind: "online-unavailable"; identity?: CachedIdentity }
  | { kind: "logged-out"; clearIdentity: boolean };

export function decideAuthRestoration(
  cachedIdentity: CachedIdentity | undefined,
  probe: AuthProbeResult | undefined
): AuthRestorationDecision {
  if (!probe) return { kind: "online-unavailable", identity: cachedIdentity };
  if (probe.status === "authenticated") {
    return { kind: "verified", user: probe.user };
  }
  if (probe.status === "unauthenticated") {
    return { kind: "logged-out", clearIdentity: true };
  }
  if (probe.status === "transport-unavailable" && cachedIdentity) {
    return { kind: "offline-unverified", identity: cachedIdentity };
  }
  return { kind: "online-unavailable", identity: cachedIdentity };
}

export function beginAuthVerificationState(state: ClientAuthState): ClientAuthState {
  if (state.status === "verified" || state.status === "offline-unverified") {
    return { status: "verifying", user: state.user, lastVerifiedAt: state.lastVerifiedAt };
  }
  if (state.status === "online-unavailable") {
    return { status: "verifying", user: state.user, lastVerifiedAt: state.lastVerifiedAt };
  }
  return state;
}
