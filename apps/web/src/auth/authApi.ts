export type AuthUser = {
  id: number;
  username: string;
  role: "admin" | "inspector";
};

export async function getCurrentUser() {
  const response = await fetch("/api/auth/me", {
    credentials: "same-origin",
    cache: "no-store"
  });

  if (!response.ok) {
    return undefined;
  }

  const data = (await response.json()) as { user?: AuthUser };
  return data.user;
}

export async function login(username: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    throw new Error("Invalid username or password");
  }

  const data = (await response.json()) as { user: AuthUser };
  return data.user;
}

export async function logout() {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin"
  });
}

