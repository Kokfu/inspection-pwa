import { isGatewayUnreachableStatus } from "../jobs/serverReachability";

export type AuthUser = {
  id: number;
  username: string;
  role: "admin" | "inspector" | "supervisor";
};

/** A user who may be recorded as an inspection's device-reported creator. */
export type InspectionCreatorUser = AuthUser & { role: "admin" | "inspector" };

/** Supervisors review; they never create inspections (T4), so they are never a creator. */
export function inspectionCreatorUser(user: AuthUser | undefined): InspectionCreatorUser | undefined {
  return user && user.role !== "supervisor" ? { id: user.id, username: user.username, role: user.role } : undefined;
}

export type AuthProbeResult =
  | { status: "authenticated"; user: AuthUser }
  | { status: "unauthenticated" }
  // A reachable server responded, but did not provide a usable authenticated
  // response (for example 5xx or malformed JSON).
  | { status: "unavailable" }
  // Fetch did not yield an HTTP response at all. This is deliberately distinct
  // from a reachable-server error so cached offline access can remain usable.
  | { status: "transport-unavailable" };

export const authVerificationTimeoutMs = 5_000;

/** Fail closed on a malformed identity (OA-13): only a positive integer id, a bounded username and a known role count as a user. */
export function parseAuthUser(value: unknown): AuthUser | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { id, username, role } = value as Record<string, unknown>;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) return undefined;
  if (typeof username !== "string" || username.length < 1 || username.length > 128 || username.trim() !== username) return undefined;
  if (role !== "admin" && role !== "inspector" && role !== "supervisor") return undefined;
  return { id, username, role };
}

async function fetchWithAuthTimeout(
  path: string,
  options: RequestInit,
  timeoutMs = authVerificationTimeoutMs
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(path, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getCurrentUser(timeoutMs = authVerificationTimeoutMs) {
  let response: Response;
  try {
    response = await fetchWithAuthTimeout(
      "/api/auth/me",
      { credentials: "same-origin", cache: "no-store" },
      timeoutMs
    );
  } catch {
    return { status: "transport-unavailable" } as const;
  }

  if (response.status === 401 || response.status === 403) {
    return { status: "unauthenticated" } as const;
  }
  // A 502/504 comes from the reverse proxy: the API itself did not answer (restarting or timed out), which is
  // the same as no connection, not a server decision (I-13).
  if (isGatewayUnreachableStatus(response.status)) {
    return { status: "transport-unavailable" } as const;
  }
  if (!response.ok) {
    return { status: "unavailable" } as const;
  }

  try {
    const data = (await response.json()) as { user?: unknown } | null;
    const user = parseAuthUser(data?.user);
    return user
      ? { status: "authenticated", user } as const
      : { status: "unavailable" } as const;
  } catch {
    // An HTTP response existed, so malformed JSON is a server-response failure,
    // not evidence that the device is offline.
    return { status: "unavailable" } as const;
  }
}

export async function login(username: string, password: string) {
  let response: Response;
  try {
    response = await fetchWithAuthTimeout("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ username, password })
    });
  } catch {
    throw new Error("Login is currently unavailable");
  }

  if (!response.ok) {
    if (response.status === 429) {
      const seconds = Number(response.headers.get("Retry-After"));
      const wait = Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 600
        ? ` Try again in ${seconds} seconds.` : " Please wait before trying again.";
      throw new Error(`Too many login attempts.${wait}`);
    }
    throw new Error("Invalid username or password");
  }

  const user = parseAuthUser(((await response.json()) as { user?: unknown } | null)?.user);
  if (!user) throw new Error("Login is currently unavailable");
  return user;
}

export async function logout() {
  try {
    const response = await fetchWithAuthTimeout("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin"
    });
    if (response.ok) return "revoked" as const;
    if (response.status === 401) return "unauthenticated" as const;
    return "unavailable" as const;
  } catch {
    return "unavailable" as const;
  }
}

