import { useState } from "react";
import { api } from "../api.js";

export default function Login({ onLoggedIn, notify }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/login", { method: "POST", body: { password } });
      setPassword("");
      onLoggedIn();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card login" onSubmit={submit}>
      <div className="login-icon" aria-hidden>🔒</div>
      <h2>Welcome back</h2>
      <p className="muted">Enter your password to manage the feeder.</p>
      <input
        type="password"
        placeholder="Password"
        autoComplete="current-password"
        autoFocus
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="primary block" disabled={busy || !password}>
        {busy ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}
