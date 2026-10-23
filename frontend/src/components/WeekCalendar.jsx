import { DAYS, byTime, fmtAmPm, fmtClock } from "../schedule.js";

// This week's dates, Monday first
function weekDates(now = new Date()) {
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export default function WeekCalendar({ meals, selected, onSelect, onAdd, canAdd }) {
  const now = new Date();
  const todayIdx = (now.getDay() + 6) % 7;
  const dates = weekDates(now);

  return (
    <div className="week" role="grid" aria-label="Feeding times this week">
      {DAYS.map((day, di) => {
        const items = meals
          .map((m, i) => ({ m, i }))
          .filter(({ m }) => m.days.includes(day))
          .sort((a, b) => byTime(a.m, b.m));
        return (
          <div key={day} className={`week-col ${di === todayIdx ? "today" : ""}`} role="gridcell">
            <div className="week-head">
              <span className="week-day">{day.slice(0, 3)}</span>
              <span className="week-date">{dates[di].getDate()}</span>
            </div>
            <div className="week-items">
              {items.map(({ m, i }) => (
                <button
                  key={i}
                  type="button"
                  className={`pill ${m.enabled ? "" : "off"} ${selected === i ? "sel" : ""}`}
                  onClick={() => onSelect(i)}
                  title={`${fmtClock(m)} ${fmtAmPm(m)} · ${m.portions} portion${m.portions > 1 ? "s" : ""}${m.enabled ? "" : " (off)"}`}
                >
                  <span className="pill-time">{fmtClock(m)}</span>
                  <span className="pill-sub">
                    {fmtAmPm(m)}
                    <span className="pill-portions"> · {m.portions}×</span>
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="week-add"
              onClick={() => onAdd(day)}
              disabled={!canAdd}
              aria-label={`Add a feed on ${day}`}
            >
              +
            </button>
          </div>
        );
      })}
    </div>
  );
}
