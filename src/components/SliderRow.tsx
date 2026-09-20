interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

export default function SliderRow({ label, value, min, max, step = 1, onChange }: Props) {
  return (
    <label className="d-flex align-items-center gap-2 small">
      <span style={{ width: 56 }}>{label}</span>
      <input
        type="range"
        className="form-range flex-grow-1"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="text-muted text-end" style={{ width: 36 }}>
        {value}
      </span>
    </label>
  );
}
