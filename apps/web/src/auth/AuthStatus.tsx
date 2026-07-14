import type { AuthUser } from "./authApi";

type AuthStatusProps = {
  user?: AuthUser;
  message: string;
  onLogout: () => Promise<void>;
};

export function AuthStatus({ user, message, onLogout }: AuthStatusProps) {
  return (
    <section className="auth-panel" aria-label="Authentication status">
      <h2>Server Access</h2>
      {user ? (
        <>
          <p>
            Signed in as <strong>{user.username}</strong> ({user.role})
          </p>
          <button type="button" onClick={onLogout}>
            Logout
          </button>
        </>
      ) : (
        <p>{message || "Sign in required before server sync"}</p>
      )}
    </section>
  );
}

