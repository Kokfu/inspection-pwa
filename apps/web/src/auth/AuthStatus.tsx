import type { ClientAuthState } from "./authStateTypes";

type AuthStatusProps = {
  state: ClientAuthState;
  onLogout: () => Promise<void>;
  onRevalidate: () => Promise<void>;
};

export function AuthStatus({ state, onLogout, onRevalidate }: AuthStatusProps) {
  return (
    <section className="auth-panel" aria-label="Authentication status">
      <h2>{state.status === "verified" || state.status === "offline-unverified" ? "Technician" : "Account"}</h2>
      {state.status === "verified" ? (
        <>
          <p>Signed in as <strong>{state.user.username}</strong></p>
          <button type="button" onClick={onLogout}>
            Sign out
          </button>
        </>
      ) : state.status === "offline-unverified" ? (
        <>
          <p>Offline — continuing as <strong>{state.user.username}</strong></p>
          <p>Your jobs and changes remain available on this device.</p>
          <div className="inline-actions">
            <button type="button" onClick={onRevalidate}>Reconnect</button>
            <button type="button" onClick={onLogout}>Sign out</button>
          </div>
        </>
      ) : state.status === "verifying" ? (
        <p>
          Reconnecting{state.user ? <> for <strong>{state.user.username}</strong></> : ""}…
        </p>
      ) : state.status === "online-unavailable" ? (
        <>
          <p>{state.message}</p>
          <p>Your saved work remains protected on this device.</p>
          <div className="inline-actions">
            <button type="button" onClick={onRevalidate}>Try Again</button>
            <button type="button" onClick={onLogout}>Sign out</button>
          </div>
        </>
      ) : state.status === "restoring" ? (
        <p>Preparing your service jobs…</p>
      ) : (
        <p>{state.message}</p>
      )}
    </section>
  );
}

