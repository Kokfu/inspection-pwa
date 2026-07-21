export type AuthUser = {
  id: number;
  username: string;
  role: "admin" | "inspector";
};

export type AuthProbeResult =
  | { status: "authenticated"; user: AuthUser }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

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
  try {
    const response = await fetchWithAuthTimeout(
      "/api/auth/me",
      { credentials: "same-origin", cache: "no-store" },
      timeoutMs
    );

    if (response.status === 401) {
      return { status: "unauthenticated" } as const;
    }
    if (!response.ok) {
      return { status: "unavailable" } as const;
    }

    const data = (await response.json()) as { user?: AuthUser };
    return data.user
      ? { status: "authenticated", user: data.user } as const
      : { status: "unavailable" } as const;
  } catch {
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

