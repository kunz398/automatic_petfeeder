import { useEffect, useState } from "react";
import { api } from "../api.js";

const SIZE = 200;
const C = SIZE / 2;
const R_OUT = 92;
const R_IN = 34;
const STEP = 60; // 6 compartments

// Point on a circle; 90° is straight down (where the feeder's opening is)
const at = (deg, r) => [C + r * Math.cos((deg * Math.PI) / 180), C + r * Math.sin((deg * Math.PI) / 180)];

function wedge(center) {
  const a0 = center - STEP / 2 + 3;
  const a1 = center + STEP / 2 - 3;
  const [x0, y0] = at(a0, R_OUT);
  const [x1, y1] = at(a1, R_OUT);
  const [x2, y2] = at(a1, R_IN);
  const [x3, y3] = at(a0, R_IN);
  return `M${x0},${y0} A${R_OUT},${R_OUT} 0 0 1 ${x1},${y1} L${x2},${y2} A${R_IN},${R_IN} 0 0 0 ${x3},${y3} Z`;
}

export default function TrayCard({ tray, job, feeding, onChanged, guarded, notify }) {
  const [pick, setPick] = useState(null);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const { open, filled, compartments: total, full } = tray;
  const turning = !!job?.running;
  const moving = turning || feeding;
  // Rotate the tray so the open compartment sits at the opening (bottom)
  const rotation = -(open - 1) * STEP;

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  async function call(fn, msg) {
    setBusy(true);
    try {
      await guarded(fn);
      if (msg) notify(msg, "success");
      setPick(null);
      onChanged();
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  const put = (body, msg) => call(() => api("/api/tray", { method: "PUT", body }), msg);

  // Mark every compartment filled or empty; first tap arms, second confirms
  function setAll(isFull) {
    const action = isFull ? "fill" : "empty";
    if (armed !== action) return setArmed(action);
    setArmed(false);
    put(
      { filled: Array(total).fill(isFull) },
      isFull ? "All compartments marked as filled 🍽️" : "All compartments marked as empty"
    );
  }

  const toggleFilled = (n) => put({ filled: filled.map((f, i) => (i === n - 1 ? !f : f)) });
  const goto = (n) =>
    call(() => api("/api/tray/goto", { method: "POST", body: { compartment: n } }), `Turning to compartment ${n}…`);

  const steps = pick ? (pick - open + total) % total : 0;

  return (
    <section className="card">
      <div className="row between">
        <h2>Food tray</h2>
        <div className="row tray-bulk">
          <button className={`ghost small ${armed === "empty" ? "armed-ghost" : ""}`} onClick={() => setAll(false)}
                  disabled={busy || moving || full === 0}>
            {armed === "empty" ? "Tap to confirm" : "Empty all"}
          </button>
          <button className={`ghost small ${armed === "fill" ? "armed-ghost" : ""}`} onClick={() => setAll(true)}
                  disabled={busy || moving}>
            {armed === "fill" ? "Tap to confirm" : "↺ Refilled"}
          </button>
        </div>
      </div>

      <div className="tray-wrap">
        <svg className={`tray ${moving ? "feeding" : ""}`} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img"
             aria-label={`Compartment ${open} of ${total} is at the opening`}>
          <circle cx={C} cy={C} r={R_OUT + 5} className="tray-rim" />
          <g className="tray-spin">
            <g className="tray-rot" style={{ transform: `rotate(${rotation}deg)` }}>
              {filled.map((isFull, i) => {
                const n = i + 1;
                const center = 90 + i * STEP;
                const [lx, ly] = at(center, R_OUT - 15); // number near the rim
                const [kx, ky] = at(center, R_IN + 22); // kibble towards the hub
                return (
                  <g key={n}
                     className={`comp ${isFull ? "full" : "empty"} ${n === open ? "open" : ""} ${pick === n ? "picked" : ""}`}
                     onClick={() => !moving && setPick(pick === n ? null : n)}>
                    <path d={wedge(center)} />
                    {isFull && (
                      <g className="kibble" aria-hidden>
                        {[[-7, -5], [6, -6], [0, 2], [-8, 6], [8, 5]].map(([dx, dy], k) => (
                          <circle key={k} cx={kx + dx} cy={ky + dy} r="3" />
                        ))}
                      </g>
                    )}
                    {/* Counter-rotate the number so it stays upright */}
                    <text x={lx} y={ly} className="comp-num"
                          style={{ transform: `rotate(${-rotation}deg)`, transformOrigin: `${lx}px ${ly}px` }}>
                      {n}
                    </text>
                  </g>
                );
              })}
            </g>
          </g>
          {/* The lid's opening is fixed at the bottom */}
          <path d={wedge(90)} className="tray-opening" />
          <circle cx={C} cy={C} r={R_IN - 6} className="tray-hub" />
          <text x={C} y={C - 3} className="hub-num">{open}</text>
          <text x={C} y={C + 13} className="hub-sub">open</text>
        </svg>

        <div className="tray-info">
          <div>
            <span className="stat-label">At the opening</span>
            <div className="tray-big">Compartment {open}</div>
            <div className="muted small-text">{filled[open - 1] ? "Has food" : "Empty"}</div>
          </div>
          {turning ? (
            <div className="tray-turning">
              Turning… {job.done}/{job.total}
            </div>
          ) : (
            <div className={full === 0 ? "tray-warn" : "muted"}>
              {full === 0 ? "All empty, time to refill" : `${full} of ${total} filled`}
            </div>
          )}
          <div className="legend small-text muted">
            <span><i className="sw full" /> Filled</span>
            <span><i className="sw empty" /> Empty</span>
          </div>
        </div>
      </div>

      {job?.error && !turning && <p className="error-text">{job.error}</p>}

      {pick != null && !moving && (
        <div className="tray-panel">
          <div className="row between">
            <strong>Compartment {pick}</strong>
            <span className={`badge ${filled[pick - 1] ? "on" : ""}`}>{filled[pick - 1] ? "Filled" : "Empty"}</span>
          </div>
          <div className="row tray-actions">
            {pick !== open && (
              <button className="primary" onClick={() => goto(pick)} disabled={busy}>
                Turn to {pick} <span className="muted-on-accent">({steps} step{steps > 1 ? "s" : ""})</span>
              </button>
            )}
            <button className="ghost" onClick={() => toggleFilled(pick)} disabled={busy}>
              Mark {filled[pick - 1] ? "empty" : "filled"}
            </button>
          </div>
          {pick !== open && (
            <>
              <p className="small-text muted tray-hint">
                The feeder only turns forward, one compartment every ~15 seconds. Food in the compartments it passes
                stays inside.
              </p>
              <button className="link" onClick={() => put({ open: pick }, `Compartment ${pick} marked as at the opening`)}>
                The feeder is already at {pick} (fix the app's count)
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
