import { useEffect, useRef } from "react";
import { num } from "../lib/format";

interface Props {
  value: string;
  onChange: (v: string) => void;
  step: number;
  min?: number;
  max?: number;
  /** Value to start from when the field is empty (e.g. last session); shown as placeholder. */
  start?: number | null;
  decimals?: number;
  label: string;
  inputMode?: "numeric" | "decimal";
  id?: string;
  className?: string;
}

const REPEAT_DELAY = 400;
const REPEAT_EVERY = 90;

/** Number field with − / + buttons. Holding a button repeats; typing still works. */
export function Stepper({ value, onChange, step, min = 0, max = Infinity, start, decimals = 0, label, inputMode = "numeric", id, className }: Props) {
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const repeated = useRef(false);

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const fmt = (v: number) => (decimals ? v.toFixed(decimals).replace(/\.?0+$/, "") : String(Math.round(v)));

  function bump(dir: 1 | -1) {
    const cur = num(valueRef.current);
    let next: number;
    if (cur == null) {
      // First tap on an empty field picks the suggested value, so "+" means "same as last time".
      if (start != null) next = start;
      else if (dir < 0) return;
      else next = min > 0 ? min : step;
    } else {
      next = Math.round((cur + dir * step) / step) * step;
    }
    const v = fmt(clamp(next));
    valueRef.current = v;
    onChangeRef.current(v);
  }

  const stop = () => { clearTimeout(timer.current); timer.current = undefined; };
  useEffect(() => stop, []);

  function press(dir: 1 | -1) {
    repeated.current = false;
    stop();
    timer.current = setTimeout(function tick() {
      repeated.current = true;
      bump(dir);
      timer.current = setTimeout(tick, REPEAT_EVERY);
    }, REPEAT_DELAY);
  }

  const btn = (dir: 1 | -1) => (
    <button
      type="button"
      className="step-btn"
      aria-label={(dir > 0 ? "+" : "−") + " " + label}
      tabIndex={-1}
      onPointerDown={() => press(dir)}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (!repeated.current) bump(dir); repeated.current = false; }}
    >
      {dir > 0 ? "+" : "−"}
    </button>
  );

  return (
    <div className={"stepper" + (className ? " " + className : "")}>
      {btn(-1)}
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        aria-label={label}
        value={value}
        placeholder={start != null ? fmt(start) : ""}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") { e.preventDefault(); bump(1); }
          if (e.key === "ArrowDown") { e.preventDefault(); bump(-1); }
        }}
      />
      {btn(1)}
    </div>
  );
}
