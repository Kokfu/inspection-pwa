import type { AuthProbeResult } from "./authApi";
import type { CachedIdentity } from "./authStateRepository";

export type AuthRestorationDecision =
  | { kind: "verified"; user: Extract<AuthProbeResult, { status: "authenticated" }>["user"] }
  | { kind: "offline-unverified"; identity: CachedIdentity }
  | { kind: "logged-out"; clearIdentity: boolean };

export function decideAuthRestoration(
  cachedIdentity: CachedIdentity | undefined,
  probe: AuthProbeResult
): AuthRestorationDecision {
  if (probe.status === "authenticated") {
    return { kind: "verified", user: probe.user };
  }
  if (probe.status === "unauthenticated") {
    return { kind: "logged-out", clearIdentity: true };
  }
  if (cachedIdentity) {
    return { kind: "offline-unverified", identity: cachedIdentity };
  }
  return { kind: "logged-out", clearIdentity: false };
}
