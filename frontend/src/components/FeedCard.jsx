import { useEffect, useState } from "react";
import { api } from "../api.js";
import { fmtTime, nextMeal, relative } from "../schedule.js";
import Stepper from "./Stepper.jsx";

export default function FeedCard({ status, error, refreshing, onRefresh, guarded, notify, onFeeding }) {
  const [portions, setPortions] = useState(1);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  // Keep the "next meal in …" text fresh
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // A first tap arms the button; it disarms itself after a few seconds
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  async function feed() {
    if (!armed) return setArmed(true);
    setArmed(false);
    setBusy(true);
    onFeeding?.(true);
    try {
      await guarded(() => api("/api/feed", { method: "POST", body: { portions } }));
      notify(trigger ? "Fed: the tray turned to the next compartment 🍽️" : `Dispensing ${portions} portion${portions > 1 ? "s" : ""} 🍽️`, "success");
      onRefresh();
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
      onFeeding?.(false);
    }
  }

  const online = !error && status;
  // Tray feeders (Genio): one press turns to the next compartment, so no portion count
  const trigger = status?.feed_mode === "trigger";
  const turning = !!status?.job?.running;
  const next = status ? nextMeal(status.meals) : null;
  const fault = status?.fault && status.fault !== 0 && status.fault !== "0" ? status.fault : null;

  return (
    <section className="card hero">
      <div className="row between">
        <span className={`status ${online ? (fault ? "warn" : "ok") : "bad"}`}>
          <span className="dot" />
          {online ? (fault ? `Fault: ${fault}` : "Online") : "Offline"}
        </span>
        <button className="ghost small" onClick={onRefresh} disabled={refreshing}>
          <span className={refreshing ? "spin" : ""}>↻</span> Refresh
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="stats">
        <div className="stat">
          <span className="stat-label">Next meal</span>
          <span className="stat-value">{next ? fmtTime(next.meal) : "—"}</span>
          <span className="stat-sub">
            {next ? `${relative(next.at)} · ${next.meal.portions} portion${next.meal.portions > 1 ? "s" : ""}` : "Nothing scheduled"}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Last feed</span>
          <span className="stat-value">{status?.last_feed_portions ?? "—"}</span>
          <span className="stat-sub">
            {status?.last_feed_portions != null
              ? `portion${status.last_feed_portions > 1 ? "s" : ""}${status.last_feed_source ? ` · ${status.last_feed_source}` : ""}`
              : "No report yet"}
          </span>
        </div>
      </div>

      <div className="feed-row">
        {!trigger && <Stepper value={portions} onChange={setPortions} label="Portions" size="large" />}
        <button
          className={`primary feed-btn ${armed ? "armed" : ""}`}
          onClick={feed}
          disabled={busy || !online || turning}
        >
          {busy ? "Feeding… waiting for the tray" : armed ? (trigger ? "Tap to confirm" : `Tap to confirm (${portions})`) : "Feed now"}
        </button>
      </div>
    </section>
  );
}
