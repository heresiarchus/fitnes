interface Props {
  value: string;
  onChange: (v: string) => void;
  values: number[];
  label: string;
  /** Tapping the selected chip again clears it. */
  clearable?: boolean;
  suffix?: string;
}

/** Row of tap targets for picking a small number (pain 0–10, quick minutes). */
export function ChipScale({ value, onChange, values, label, clearable = true, suffix }: Props) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {values.map((v) => {
        const on = value !== "" && Number(value) === v;
        return (
          <button key={v} type="button" role="radio" aria-checked={on} className={"chip" + (on ? " on" : "")}
            onClick={() => onChange(on && clearable ? "" : String(v))}>
            {v}{suffix}
          </button>
        );
      })}
    </div>
  );
}
