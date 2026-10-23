export default function Stepper({ value, onChange, min = 1, max = 12, label, size = "" }) {
  return (
    <div className={`stepper ${size}`} role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Decrease">
        −
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Increase">
        +
      </button>
    </div>
  );
}
