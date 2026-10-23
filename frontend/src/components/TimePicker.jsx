import { from12, pad, to12 } from "../schedule.js";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

// 12-hour time picker: hour, minute, AM/PM
export default function TimePicker({ hour, minute, onChange }) {
  const { h12, pm } = to12(hour);
  return (
    <div className="timepicker">
      <select aria-label="Hour" value={h12} onChange={(e) => onChange({ hour: from12(Number(e.target.value), pm), minute })}>
        {HOURS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="colon">:</span>
      <select aria-label="Minute" value={minute} onChange={(e) => onChange({ hour, minute: Number(e.target.value) })}>
        {MINUTES.map((m) => (
          <option key={m} value={m}>{pad(m)}</option>
        ))}
      </select>
      <div className="ampm" role="group" aria-label="AM or PM">
        {["AM", "PM"].map((label) => {
          const on = (label === "PM") === pm;
          return (
            <button
              key={label}
              type="button"
              className={on ? "on" : ""}
              aria-pressed={on}
              onClick={() => onChange({ hour: from12(h12, label === "PM"), minute })}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
