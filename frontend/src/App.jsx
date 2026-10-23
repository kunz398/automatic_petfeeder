import { useCallback, useEffect, useState } from "react";
import { api, AuthError } from "./api.js";
import Login from "./components/Login.jsx";
import FeedCard from "./components/FeedCard.jsx";
import Schedule from "./components/Schedule.jsx";
import TrayCard from "./components/TrayCard.jsx";
import Toast from "./components/Toast.jsx";
import CatIcon from "./components/CatIcon.jsx";

export default function App() {
  // "loading" | "login" | "ready"
  const [view, setView] = useState("loading");
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);
  const [feeding, setFeeding] = useState(false);

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

  // Follow the tray while it turns, then report how it went
  const turning = !!status?.job?.running;
  const [wasTurning, setWasTurning] = useState(false);
  useEffect(() => {
    if (turning) {
      setWasTurning(true);
      const t = setTimeout(load, 3000);
      return () => clearTimeout(t);
    }
    if (wasTurning) {
      setWasTurning(false);
      if (status?.job?.error) notify(status.job.error, "error");
      else notify("Tray is in position ✓", "success");
    }
  }, [status, turning, wasTurning, load, notify]);

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
          <span className="brand-mark"><CatIcon /></span>
          <div>
            <h1>Pet Feeder</h1>
            <p>Knight</p>
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
            onFeeding={setFeeding}
          />
          {status?.tray && (
            <TrayCard
              tray={status.tray}
              job={status.job}
              feeding={feeding}
              onChanged={load}
              guarded={guarded}
              notify={notify}
            />
          )}
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
