import { useCallback, useEffect, useState } from "react";
import { api, AuthError } from "./api.js";
import Login from "./components/Login.jsx";
import FeedCard from "./components/FeedCard.jsx";
import Schedule from "./components/Schedule.jsx";
import Toast from "./components/Toast.jsx";

export default function App() {
  // "loading" | "login" | "ready"
  const [view, setView] = useState("loading");
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);

  const notify = useCallback((msg, kind = "info") => setToast({ msg, kind, id: Date.now() }), []);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setStatus(await api("/api/status"));
      setError(null);
      setView("ready");
    } catch (e) {
      if (e instanceof AuthError) return setView("login");
      setError(e.message);
      setView("ready");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function logout() {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    setStatus(null);
    setView("login");
  }

  // Any call that comes back 401 drops to the login screen
  const guarded = useCallback(
    async (fn) => {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof AuthError) setView("login");
        throw e;
      }
    },
    []
  );

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>🐾</span>
          <div>
            <h1>Pet Feeder</h1>
            <p>Mirabella Genio · 6 meal</p>
          </div>
        </div>
        {view === "ready" && (
          <button className="ghost small" onClick={logout}>
            Log out
          </button>
        )}
      </header>

      {view === "loading" && <div className="loader" aria-label="Loading" />}

      {view === "login" && <Login onLoggedIn={load} notify={notify} />}

      {view === "ready" && (
        <main className="stack">
          <FeedCard
            status={status}
            error={error}
            refreshing={refreshing}
            onRefresh={load}
            guarded={guarded}
            notify={notify}
          />
          {status && (
            <Schedule meals={status.meals} onSaved={load} guarded={guarded} notify={notify} />
          )}
          {status && (
            <details className="card raw">
              <summary>Raw data points</summary>
              <pre>{JSON.stringify(status.dps, null, 2)}</pre>
            </details>
          )}
        </main>
      )}

      <Toast toast={toast} />
    </div>
  );
}
