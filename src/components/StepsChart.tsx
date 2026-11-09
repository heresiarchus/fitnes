import { useI18n } from "../i18n";
import { ddmm } from "../lib/date";
import { fmtInt } from "../lib/format";
import type { DaysMap } from "../lib/types";

const W = 700, H = 200, L = 52, R = 12, T = 12, B = 28;

export function StepsChart({ days, dates, goal }: { days: DaysMap; dates: string[]; goal: number | null }) {
  const { t, lang } = useI18n();
  const vals = dates.map((d) => days[d]?.steps ?? null);
  const present = vals.filter((v): v is number => v != null);
  if (!present.length) return <p className="empty">{t("chart.stepsEmpty")}</p>;

  const raw = Math.max(...present, goal ?? 0, 1000);
  const mag = raw > 20000 ? 5000 : raw > 8000 ? 2000 : 1000;
  const hi = Math.ceil(raw / mag) * mag;
  const slot = (W - L - R) / dates.length;
  const bw = Math.max(2, Math.min(28, slot * 0.7));
  const X = (i: number) => L + slot * i + slot / 2;
  const Y = (v: number) => T + ((H - T - B) * (hi - v)) / hi;
  const ticks: number[] = [];
  for (let v = 0; v <= hi; v += mag) ticks.push(v);
  const labelEvery = dates.length > 10 ? 7 : 1;
  const avg = present.reduce((a, b) => a + b, 0) / present.length;

  return (
    <div className="chart-wrap">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("chart.stepsAria", { v: fmtInt(avg, lang) })}>
        {ticks.map((v) => (
          <g key={v}>
            <line className="grid" x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} />
            <text className="axis" x={L - 6} y={Y(v) + 4} textAnchor="end">{v >= 1000 ? v / 1000 + "k" : v}</text>
          </g>
        ))}
        {vals.map((v, i) =>
          v == null ? null : (
            <rect key={dates[i]} className={"barmark" + (goal != null && v >= goal ? " met" : "")}
              x={X(i) - bw / 2} y={Y(v)} width={bw} height={Math.max(0, Y(0) - Y(v))} rx={2}>
              <title>{ddmm(dates[i])}: {fmtInt(v, lang)}</title>
            </rect>
          ),
        )}
        {goal != null && <line className="goal" x1={L} x2={W - R} y1={Y(goal)} y2={Y(goal)} />}
        {dates.map((d, i) => (i % labelEvery === 0 ? (
          <text key={d} className="axis" x={X(i)} y={H - 8} textAnchor="middle">{ddmm(d)}</text>
        ) : null))}
      </svg>
    </div>
  );
}
