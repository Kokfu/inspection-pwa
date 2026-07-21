import type { ClientAuthState } from "./authStateTypes";

type AuthStatusProps = {
  state: ClientAuthState;
  onLogout: () => Promise<void>;
  onRevalidate: () => Promise<void>;
};

export function AuthStatus({ state, onLogout, onRevalidate }: AuthStatusProps) {
  return (
    <section className="auth-panel" aria-label="Authentication status">
      <h2>Server Access</h2>
      {state.status === "verified" ? (
        <>
          <p>
            Signed in as <strong>{state.user.username}</strong> ({state.user.role}) - Verified
          </p>
          <button type="button" onClick={onLogout}>
            Logout
          </button>
        </>
      ) : state.status === "offline-unverified" ? (
        <>
          <p>
            Offline mode - last verified as <strong>{state.user.username}</strong> at {new Date(state.lastVerifiedAt).toLocaleString()}
          </p>
          <p>Reconnect to verify your session before using server actions.</p>
          <div className="inline-actions">
            <button type="button" onClick={onRevalidate}>Verify Session</button>
            <button type="button" onClick={onLogout}>Logout</button>
          </div>
        </>
      ) : state.status === "checking" ? (
        <p>Checking server sign-in</p>
      ) : (
        <p>{state.message}</p>
      )}
    </section>
  );
}

