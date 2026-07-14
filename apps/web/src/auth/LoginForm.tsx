import { useState } from "react";

type LoginFormProps = {
  onLogin: (username: string, password: string) => Promise<void>;
};

export function LoginForm({ onLogin }: LoginFormProps) {
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
      <h2>Sign In</h2>
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
        Login
      </button>
      {error ? <p className="error-text">{error}</p> : null}
    </section>
  );
}

