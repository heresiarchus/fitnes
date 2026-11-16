import { useId } from "react";

/** The app mark: an activity ring with a pulse line, on a teal → blue → violet tile. */
export function Logo({ size = 40 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id={id + "bg"} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14b8a6" /><stop offset="0.5" stopColor="#2563eb" /><stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <radialGradient id={id + "hl"} cx="0.25" cy="0.15" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" /><stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="512" height="512" rx="128" fill={`url(#${id}bg)`} />
      <rect width="512" height="512" rx="128" fill={`url(#${id}hl)`} />
      <LogoMark />
    </svg>
  );
}

/** White mark on its own (also used for the launcher icon foreground). */
export function LogoMark() {
  return (
    <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
      <path d="M 376.3 166.1 A 150 150 0 1 1 300.6 112.8" strokeWidth="38" opacity="0.95" />
      <circle cx="342" cy="133" r="18" fill="#fff" stroke="none" />
      <polyline points="150,262 200,262 228,206 266,320 298,234 318,262 362,262" strokeWidth="30" />
    </g>
  );
}

export type DayPhase = "morning" | "day" | "evening" | "night";
export function dayPhase(d = new Date()): DayPhase {
  const h = d.getHours();
  return h >= 5 && h < 11 ? "morning" : h >= 11 && h < 17 ? "day" : h >= 17 && h < 22 ? "evening" : "night";
}

/** Decorative sky for the "Today" card: sun, setting sun or moon with stars. */
export function SkyArt({ phase }: { phase: DayPhase }) {
  return (
    <svg className="sky-art" viewBox="0 0 160 160" aria-hidden="true">
      {phase === "night" ? (
        <>
          {[[22, 30, 1.6], [60, 16, 1.2], [128, 22, 1.4], [100, 58, 1], [34, 78, 1.1], [142, 92, 1.3], [74, 112, 0.9]].map(([x, y, r], i) => (
            <circle key={i} className="star" cx={x} cy={y} r={r} style={{ animationDelay: `${i * 0.7}s` }} />
          ))}
          <circle className="glow" cx="104" cy="56" r="44" />
          <path className="moon" d="M118 26a34 34 0 1 0 14 54 28 28 0 1 1-14-54z" />
        </>
      ) : phase === "evening" ? (
        <>
          <circle className="glow" cx="100" cy="92" r="58" />
          <circle className="sun set" cx="100" cy="92" r="30" />
          <path className="cloud" d="M28 112h56a12 12 0 0 0-10-18 16 16 0 0 0-30-4 12 12 0 0 0-16 22z" />
          <path className="cloud c2" d="M92 130h50a10 10 0 0 0-8-15 14 14 0 0 0-26-3 10 10 0 0 0-16 18z" />
        </>
      ) : (
        <>
          <circle className="glow" cx="104" cy="54" r="56" />
          <g className="rays">
            {Array.from({ length: 12 }, (_, i) => (
              <line key={i} x1="104" y1="10" x2="104" y2="20" transform={`rotate(${i * 30} 104 54)`} />
            ))}
          </g>
          <circle className="sun" cx="104" cy="54" r="24" />
          <path className="cloud" d="M30 104h60a13 13 0 0 0-11-19 17 17 0 0 0-32-4 13 13 0 0 0-17 23z" />
        </>
      )}
    </svg>
  );
}

/** Colours of each kind of data, as in Samsung Health: one hue per thing, the same everywhere. */
export const HUES: Record<string, [string, string]> = {
  weight: ["#a78bfa", "#7c3aed"],
  steps: ["#4ade80", "#16a34a"],
  move: ["#38bdf8", "#0284c7"],
  activeMin: ["#38bdf8", "#0284c7"],
  activeKcal: ["#fb923c", "#ea580c"],
  distanceKm: ["#2dd4bf", "#0d9488"],
  sleepH: ["#a5b4fc", "#4f46e5"],
};

/** Progress ring with the metric's own gradient; fills in when it appears. */
export function GradientRing({ pct, done, metric, label }: { pct: number; done: boolean; metric: string; label: string }) {
  const id = useId();
  const [a, b] = HUES[metric] ?? ["var(--accent)", "var(--accent-ink)"];
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg className={"ring" + (done ? " done" : "")} viewBox="0 0 64 64" aria-hidden="true" style={{ ["--ring-c" as string]: b }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
      </defs>
      <circle className="ring-bg" cx="32" cy="32" r={r} />
      <circle className="ring-fg" cx="32" cy="32" r={r} style={{ stroke: `url(#${id})` }} strokeDasharray={`${(Math.max(pct, 0.5) / 100) * c} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle">{label}</text>
    </svg>
  );
}
