/** 0–10 rating as one slider with the number beside it (not eleven buttons). */
export function Rating({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="rate">
      <input type="range" min={0} max={10} step={1} value={value} aria-label={label}
        style={{ ["--p" as string]: `${value * 10}%` }} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{value}<small>/10</small></output>
    </div>
  );
}
