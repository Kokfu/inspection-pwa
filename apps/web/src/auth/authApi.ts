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
  if (!response.ok) {
    return { status: "unavailable" } as const;
  }

  try {
    const data = (await response.json()) as { user?: AuthUser };
    return data.user
      ? { status: "authenticated", user: data.user } as const
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
    throw new Error("Invalid username or password");
  }

  const data = (await response.json()) as { user: AuthUser };
  return data.user;
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

