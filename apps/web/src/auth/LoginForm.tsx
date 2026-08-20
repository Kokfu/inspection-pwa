import { useState } from "react";

type LoginFormProps = {
  onLogin: (username: string, password: string) => Promise<void>;
  roleLabel?: "Technician" | "Manager";
};

export function LoginForm({ onLogin, roleLabel = "Technician" }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleLogin() {
    setError("");
    try {
      await onLogin(username, password);
      setPassword("");
    } catch (loginError) {
      setError(
        loginError instanceof Error ? loginError.message : "Login failed"
      );
    }
  }

  return (
    <section className="auth-panel" aria-label="Sign in">
      <p className="eyebrow">{roleLabel} access</p>
      <h2>{roleLabel === "Manager" ? "Sign in to Operations" : "Sign in to your service jobs"}</h2>
      <label>
        <span>Username</span>
        <input
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label>
        <span>Password</span>
        <input
          autoComplete="current-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <button type="button" onClick={handleLogin}>
        Sign in
      </button>
      {error ? <p className="error-text">{error}</p> : null}
    </section>
  );
}

