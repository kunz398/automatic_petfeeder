export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const MAX_MEALS = 5;

export const pad = (n) => String(n).padStart(2, "0");

// 24h hour -> { h12: 1-12, pm: bool } and back
export const to12 = (hour) => ({ h12: hour % 12 || 12, pm: hour >= 12 });
export const from12 = (h12, pm) => (h12 % 12) + (pm ? 12 : 0);

export const fmtClock = (m) => `${to12(m.hour).h12}:${pad(m.minute)}`;
export const fmtAmPm = (m) => (m.hour >= 12 ? "pm" : "am");
export const fmtTime = (m) => `${fmtClock(m)} ${fmtAmPm(m)}`;

export const byTime = (a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute);

export function describeDays(days) {
  if (days.length === 7) return "Every day";
  if (days.length === 5 && !days.includes("Sat") && !days.includes("Sun")) return "Weekdays";
  if (days.length === 2 && days.includes("Sat") && days.includes("Sun")) return "Weekends";
  return days.join(", ");
}

// Next time an enabled meal will run, using the browser's clock
export function nextMeal(meals, now = new Date()) {
  let best = null;
  for (const m of meals) {
    if (!m.enabled) continue;
    for (let offset = 0; offset <= 7; offset++) {
      const d = new Date(now);
      d.setDate(now.getDate() + offset);
      d.setHours(m.hour, m.minute, 0, 0);
      const day = DAYS[(d.getDay() + 6) % 7]; // JS Sunday=0 -> our Mon=0
      if (d > now && m.days.includes(day)) {
        if (!best || d < best.at) best = { meal: m, at: d };
        break;
      }
    }
  }
  return best;
}

export function relative(at, now = new Date()) {
  const mins = Math.round((at - now) / 60000);
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `in ${h}h ${mins % 60}m`;
  return `on ${at.toLocaleDateString(undefined, { weekday: "long" })}`;
}
