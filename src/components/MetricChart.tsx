import { useId, useMemo } from "react";
import type { Bucket } from "../lib/analytics";

export interface ChartProps {
  buckets: Bucket[];
  kind: "bar" | "line";
  /** A second line (diastolic pressure) drawn in the same scale. */
  second?: Bucket[];
  /** Smoothed line aligned with the buckets (7-day average or trend weight). */
  smooth?: (number | null)[];
  goal?: number | null;
  /** Events per bucket, shown as stars: 1–2 ★, 3–4 ★★, 5+ ★★★. */
  events?: number[];
  hue: [string, string];
  label: (b: Bucket) => string;
  tick: (b: Bucket) => string;
  picked: number | null;
  onPick: (i: number | null) => void;
  zeroBase: boolean;
}

const W = 720, H = 240, L = 46, R = 12, T = 26, B = 26;
export const stars = (n: number) => (n <= 0 ? "" : n <= 2 ? "★" : n <= 4 ? "★★" : "★★★");

function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo || 1, raw = span / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

/** Bars or a line over day / week / month buckets. Tap a bar or point to pick it. */
export function MetricChart({ buckets, kind, second, smooth, goal, events, hue, label, tick, picked, onPick, zeroBase }: ChartProps) {
  const id = useId();
  const vals = [...buckets, ...(second ?? [])].map((b) => b.v).filter((v): v is number => v != null);
  const sm = (smooth ?? []).filter((v): v is number => v != null);
  const all = [...vals, ...sm, ...(goal != null ? [goal] : [])];
  const { lo, hi, ticks } = useMemo(() => {
    if (!all.length) return { lo: 0, hi: 1, ticks: [0, 1] };
    let lo = zeroBase ? 0 : Math.min(...all), hi = Math.max(...all);
    const pad = (hi - lo) * 0.08 || 1;
    if (!zeroBase) lo -= pad;
    hi += pad;
    const ticks = niceTicks(lo, hi);
    return { lo, hi, ticks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all.join(","), zeroBase]);
  const n = buckets.length;
  const slot = (W - L - R) / Math.max(1, n);
  const X = (i: number) => L + slot * i + slot / 2;
  const Y = (v: number) => T + ((H - T - B) * (hi - v)) / (hi - lo || 1);
  const bw = Math.max(2, Math.min(34, slot * 0.68));
  const every = Math.max(1, Math.ceil(n / 7));
  // Lines join across days without data (pressure and weight aren't measured daily); dots show the real days.
  const path = (vs: (number | null)[]) => {
    let d = "";
    vs.forEach((v, i) => { if (v != null) d += `${d ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)} `; });
    return d;
  };
  const fmt = (v: number) => (Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(+v.toFixed(1)));

  return (
    <div className="mchart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={buckets.map(label).join("; ")} onClick={(e) => { if (e.target === e.currentTarget) onPick(null); }}>
        <defs>
          <linearGradient id={id + "g"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={hue[0]} /><stop offset="1" stopColor={hue[1]} /></linearGradient>
          <linearGradient id={id + "a"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={hue[1]} stopOpacity="0.22" /><stop offset="1" stopColor={hue[1]} stopOpacity="0" /></linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line className="grid" x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} />
            <text className="axis" x={L - 6} y={Y(v) + 4} textAnchor="end">{fmt(v)}</text>
          </g>
        ))}
        {buckets.map((b, i) => (i % every === 0 ? <text key={"x" + b.key} className="axis" x={X(i)} y={H - 7} textAnchor="middle">{tick(b)}</text> : null))}
        {goal != null && <line className="goal" x1={L} x2={W - R} y1={Y(goal)} y2={Y(goal)} />}
        {kind === "bar" && buckets.map((b, i) => b.v == null
          ? <rect key={b.key} className="gap" x={X(i) - bw / 2} y={Y(lo) - 3} width={bw} height={3} rx={1.5} />
          : <rect key={b.key} className={"mbar" + (picked === i ? " on" : "")} x={X(i) - bw / 2} y={Y(b.v)} width={bw} height={Math.max(1, Y(lo) - Y(b.v))} rx={Math.min(7, bw / 2)} style={{ fill: `url(#${id}g)`, animationDelay: `${Math.min(i, 40) * 12}ms` }} />)}
        {kind === "line" && (() => {
          const pts = buckets.map((b) => b.v);
          const first = pts.findIndex((v) => v != null), last = pts.length - 1 - [...pts].reverse().findIndex((v) => v != null);
          const line = path(pts);
          return (
            <>
              {first >= 0 && !smooth && !second && <path d={`${line} L${X(last)} ${Y(lo)} L${X(first)} ${Y(lo)} Z`} style={{ fill: `url(#${id}a)` }} className="marea" />}
              {second && <path className="mline second" d={path(second.map((b) => b.v))} style={{ stroke: hue[0] }} />}
              <path className={"mline" + (smooth ? " thin" : "")} d={line} style={{ stroke: hue[1] }} />
              {buckets.map((b, i) => (b.v == null ? null : <circle key={b.key} className={"mdot" + (picked === i ? " on" : "")} cx={X(i)} cy={Y(b.v)} r={picked === i ? 6 : n > 60 ? 2 : 3.5} style={{ stroke: hue[1] }} />))}
            </>
          );
        })()}
        {smooth && <path className="msmooth" d={path(smooth)} style={{ stroke: hue[1] }} />}
        {events?.map((c, i) => (c > 0 ? <text key={"s" + i} className="mstar" x={X(i)} y={14} textAnchor="middle">{stars(c)}</text> : null))}
        {buckets.map((b, i) => (
          <rect key={"hit" + b.key} className="hit" x={X(i) - slot / 2} y={0} width={slot} height={H} onClick={() => onPick(picked === i ? null : i)}>
            <title>{label(b)}</title>
          </rect>
        ))}
        {picked != null && buckets[picked] && <line className="pickline" x1={X(picked)} x2={X(picked)} y1={T - 6} y2={H - B} />}
      </svg>
    </div>
  );
}
