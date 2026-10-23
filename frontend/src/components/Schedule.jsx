import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { DAYS, MAX_MEALS, byTime, describeDays, fmtAmPm, fmtClock } from "../schedule.js";
import Stepper from "./Stepper.jsx";
import TimePicker from "./TimePicker.jsx";
import WeekCalendar from "./WeekCalendar.jsx";

const PRESETS = {
  "Every day": DAYS,
  Weekdays: DAYS.slice(0, 5),
  Weekends: DAYS.slice(5),
};

export default function Schedule({ meals: saved, onSaved, guarded, notify }) {
  const [meals, setMeals] = useState(saved);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const itemRefs = useRef({});

  // Reset local edits whenever the feeder reports a new schedule
  useEffect(() => setMeals(saved), [saved]);

  // Bring the meal being edited into view (e.g. after tapping it in the calendar)
  useEffect(() => {
    if (open != null) itemRefs.current[open]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [open]);

  const dirty = useMemo(() => JSON.stringify(meals) !== JSON.stringify(saved), [meals, saved]);
  const sorted = meals.map((m, i) => ({ m, i })).sort((a, b) => byTime(a.m, b.m));
  const canAdd = meals.length < MAX_MEALS;

  const update = (i, patch) => setMeals((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  function add(day) {
    const days = day ? [day] : [...DAYS];
    setMeals((ms) => [...ms, { days, hour: 8, minute: 0, portions: 1, enabled: true }]);
    setOpen(meals.length);
  }

  function remove(i) {
    setMeals((ms) => ms.filter((_, j) => j !== i));
    setOpen(null);
  }

  async function save() {
    if (meals.some((m) => !m.days.length)) return notify("Each meal needs at least one day", "error");
    setBusy(true);
    try {
      await guarded(() => api("/api/meals", { method: "PUT", body: { meals } }));
      notify("Schedule saved ✓", "success");
      setOpen(null);
      onSaved();
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="row between">
        <h2>Meal schedule</h2>
        <span className="muted small-text">
          {meals.length}/{MAX_MEALS} meals
        </span>
      </div>

      <WeekCalendar
        meals={meals}
        selected={open}
        onSelect={(i) => setOpen(open === i ? null : i)}
        onAdd={add}
        canAdd={canAdd}
      />

      {meals.length === 0 && <p className="empty">No meals yet. Tap + on a day, or add one below.</p>}

      <ul className="meals">
        {sorted.map(({ m, i }) => (
          <li
            key={i}
            ref={(el) => (itemRefs.current[i] = el)}
            className={`meal ${m.enabled ? "" : "off"} ${open === i ? "open" : ""}`}
          >
            <div className="meal-head">
              <button className="meal-summary" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                <span className="meal-time">
                  {fmtClock(m)}
                  <small>{fmtAmPm(m)}</small>
                </span>
                <span className="meal-meta">
                  {m.portions} portion{m.portions > 1 ? "s" : ""} · {m.days.length ? describeDays(m.days) : "No days"}
                </span>
              </button>
              <label className="switch" aria-label="Enabled">
                <input type="checkbox" checked={m.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} />
                <span />
              </label>
            </div>

            {open === i && (
              <div className="meal-edit">
                <div className="field-row">
                  <div className="field">
                    <span>Time</span>
                    <TimePicker hour={m.hour} minute={m.minute} onChange={(t) => update(i, t)} />
                  </div>
                  <div className="field">
                    <span>Portions</span>
                    <Stepper value={m.portions} onChange={(portions) => update(i, { portions })} label="Portions" />
                  </div>
                </div>

                <div className="field">
                  <span>Days</span>
                  <div className="chips">
                    {DAYS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={`chip ${m.days.includes(d) ? "on" : ""}`}
                        aria-pressed={m.days.includes(d)}
                        onClick={() =>
                          update(i, {
                            days: m.days.includes(d) ? m.days.filter((x) => x !== d) : DAYS.filter((x) => x === d || m.days.includes(x)),
                          })
                        }
                      >
                        {d.slice(0, 2)}
                      </button>
                    ))}
                  </div>
                  <div className="presets">
                    {Object.entries(PRESETS).map(([name, days]) => (
                      <button key={name} type="button" className="link" onClick={() => update(i, { days: [...days] })}>
                        {name}
                      </button>
                    ))}
                  </div>
                </div>

                <button className="danger-link" onClick={() => remove(i)}>
                  Remove meal
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {!canAdd && <p className="muted small-text">The feeder holds up to {MAX_MEALS} meals.</p>}

      <div className="row actions">
        <button className="ghost" onClick={() => add()} disabled={!canAdd}>
          + Add meal
        </button>
        {dirty && (
          <>
            <button className="ghost" onClick={() => { setMeals(saved); setOpen(null); }} disabled={busy}>
              Discard
            </button>
            <button className="primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
