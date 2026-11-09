import { useEffect, useLayoutEffect, useRef } from "react";

export const WHEEL_ITEM = 40;

interface Props {
  items: string[];
  index: number;
  onChange: (index: number) => void;
  label: string;
  className?: string;
}

/**
 * Drum-style picker (like an alarm clock): scroll or flick the column,
 * it snaps to the centre value. Arrow keys and taps on a value work too.
 */
export function Wheel({ items, index, onChange, label, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrolling = useRef(false);
  const indexRef = useRef(index);
  indexRef.current = index;

  // Follow external value changes without fighting the user's finger.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || scrolling.current) return;
    const target = index * WHEEL_ITEM;
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
  }, [index]);

  useEffect(() => () => clearTimeout(settle.current), []);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    scrolling.current = true;
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      scrolling.current = false;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / WHEEL_ITEM)));
      if (i !== indexRef.current) {
        onChange(i);
        navigator.vibrate?.(8);
      }
    }, 110);
  }

  const go = (i: number) => {
    const c = Math.max(0, Math.min(items.length - 1, i));
    ref.current?.scrollTo({ top: c * WHEEL_ITEM, behavior: "smooth" });
  };

  return (
    <div
      ref={ref}
      className={"wheel" + (className ? " " + className : "")}
      tabIndex={0}
      role="spinbutton"
      aria-label={label}
      aria-valuenow={index}
      aria-valuetext={items[index]}
      onScroll={onScroll}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") { e.preventDefault(); go(indexRef.current - 1); }
        if (e.key === "ArrowDown") { e.preventDefault(); go(indexRef.current + 1); }
      }}
    >
      <div className="wheel-pad" aria-hidden="true" />
      {items.map((s, i) => (
        <div key={i} className={"wheel-item" + (i === index ? " on" : "")} aria-hidden="true" onClick={() => go(i)}>{s}</div>
      ))}
      <div className="wheel-pad" aria-hidden="true" />
    </div>
  );
}
