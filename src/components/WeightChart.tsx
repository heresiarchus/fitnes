import { useI18n } from "../i18n";
import { ddmm } from "../lib/date";
import { fmt } from "../lib/format";
import { weightSeries } from "../lib/stats";
import type { DaysMap } from "../lib/types";

const W = 700, H = 230, L = 44, R = 64, T = 14, B = 28;

export function WeightChart({ days, dates }: { days: DaysMap; dates: string[] }) {
  const { t, lang } = useI18n();
  const pts = weightSeries(days, dates);
  if (pts.length < 2) return <p className="empty">{t("chart.weightEmpty")}</p>;

  const span = Math.max(1, dates.length - 1);
  const vs = pts.flatMap((p) => [p.v, p.avg]);
  let lo = Math.floor(Math.min(...vs) - 0.5);
  let hi = Math.ceil(Math.max(...vs) + 0.5);
  if (hi - lo < 3) hi = lo + 3;
  const X = (i: number) => L + ((W - L - R) * i) / span;
  const Y = (v: number) => T + ((H - T - B) * (hi - v)) / (hi - lo);
  const yStep = hi - lo > 16 ? 4 : hi - lo > 8 ? 2 : 1;
  const yTicks: number[] = [];
  for (let v = lo; v <= hi; v += yStep) yTicks.push(v);
  const xStep = dates.length > 35 ? 14 : 7;
  const xTicks: number[] = [];
  for (let k = 0; k < dates.length; k += xStep) xTicks.push(k);
  const path = pts.map((p, j) => (j ? "L" : "M") + X(p.i).toFixed(1) + " " + Y(p.avg).toFixed(1)).join(" ");
  const last = pts[pts.length - 1];

  return (
    <div className="chart-wrap">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("chart.weightAria", { v: fmt(last.avg, lang) })}>
        {yTicks.map((v) => (
          <g key={v}>
            <line className="grid" x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} />
            <text className="axis" x={L - 6} y={Y(v) + 4} textAnchor="end">{v}</text>
          </g>
        ))}
        {xTicks.map((k) => (
          <text key={k} className="axis" x={X(k)} y={H - 8} textAnchor="middle">{ddmm(dates[k])}</text>
        ))}
        {pts.map((p) => (
          <circle key={p.date} className="dot" cx={X(p.i)} cy={Y(p.v)} r={3.5}>
            <title>{ddmm(p.date)}: {fmt(p.v, lang)}</title>
          </circle>
        ))}
        <path className="avg" d={path} />
        <circle className="end" cx={X(last.i)} cy={Y(last.avg)} r={5} />
        <text className="endlabel" x={X(last.i) + 9} y={Y(last.avg) + 4}>{fmt(last.avg, lang)}</text>
      </svg>
    </div>
  );
}
