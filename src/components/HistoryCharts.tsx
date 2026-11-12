import { useItems } from "../db";
import { useI18n } from "../i18n";
import { fmt } from "../lib/format";
import { monthlyWeights } from "../lib/history";
import type { DaysMap } from "../lib/types";
import { Head } from "./Head";

const W = 700, H = 240, L = 46, R = 16, T = 14, B = 30;
const mm = (m: string) => m.slice(5) + "." + m.slice(2, 4);
const monthIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5)) - 1;

/** All-time view: monthly weight and monthly kilometres from imported history plus logged days. */
export function HistoryCharts({ days }: { days: DaysMap }) {
  const { t, lang } = useI18n();
  const weights = monthlyWeights(days);
  const months = [...(useItems("hmonth") ?? [])].sort((a, b) => a.month.localeCompare(b.month));
  if (weights.length < 2 && !months.length) return <section className="block"><p className="empty">{t("hist.empty")}</p></section>;

  const wChart = () => {
    const i0 = monthIndex(weights[0].month), span = Math.max(1, monthIndex(weights[weights.length - 1].month) - i0);
    const vs = weights.map((w) => w.kg);
    const lo = Math.floor((Math.min(...vs) - 2) / 5) * 5, hi = Math.ceil((Math.max(...vs) + 2) / 5) * 5;
    const X = (m: string) => L + ((W - L - R) * (monthIndex(m) - i0)) / span;
    const Y = (v: number) => T + ((H - T - B) * (hi - v)) / (hi - lo);
    const step = hi - lo > 40 ? 10 : 5;
    const ticks: number[] = []; for (let v = lo; v <= hi; v += step) ticks.push(v);
    const years: string[] = []; for (let y = Number(weights[0].month.slice(0, 4)); y <= Number(weights[weights.length - 1].month.slice(0, 4)); y++) years.push(String(y));
    // Break the line where more than a year passed without a weigh-in.
    let d = "";
    weights.forEach((w, i) => { const gap = i > 0 && monthIndex(w.month) - monthIndex(weights[i - 1].month) > 12; d += (i === 0 || gap ? "M" : "L") + X(w.month).toFixed(1) + " " + Y(w.kg).toFixed(1) + " "; });
    const last = weights[weights.length - 1];
    return (
      <div className="chart-wrap">
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t("hist.weight")}: ${fmt(last.kg, lang)}`}>
          {ticks.map((v) => <g key={v}><line className="grid" x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} /><text className="axis" x={L - 6} y={Y(v) + 4} textAnchor="end">{v}</text></g>)}
          {years.filter((y) => monthIndex(y + "-01") >= i0).map((y) => <text key={y} className="axis" x={X(y + "-01")} y={H - 8} textAnchor="middle">{y}</text>)}
          <path className="avg" d={d} />
          {weights.map((w) => <circle key={w.month} className="dot" cx={X(w.month)} cy={Y(w.kg)} r={3}><title>{mm(w.month)}: {fmt(w.kg, lang)}</title></circle>)}
          <circle className="end" cx={X(last.month)} cy={Y(last.kg)} r={5} />
        </svg>
      </div>
    );
  };

  const aChart = () => {
    const i0 = monthIndex(months[0].month), n = monthIndex(months[months.length - 1].month) - i0 + 1;
    const max = Math.max(...months.map((m) => m.walkKm + m.runKm + m.bikeKm), 10);
    const hi = Math.ceil(max / 25) * 25;
    const slot = (W - L - R) / n, bw = Math.max(2, slot * 0.72);
    const Y = (v: number) => T + ((H - T - B) * (hi - v)) / hi;
    const ticks: number[] = []; for (let v = 0; v <= hi; v += hi > 100 ? 50 : 25) ticks.push(v);
    const years: string[] = []; for (let y = Number(months[0].month.slice(0, 4)); y <= Number(months[months.length - 1].month.slice(0, 4)); y++) years.push(String(y));
    return (
      <>
        <div className="chart-wrap">
          <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("hist.activity")}>
            {ticks.map((v) => <g key={v}><line className="grid" x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} /><text className="axis" x={L - 6} y={Y(v) + 4} textAnchor="end">{v}</text></g>)}
            {months.map((m) => {
              const x = L + slot * (monthIndex(m.month) - i0) + (slot - bw) / 2;
              const parts: [string, number][] = [["k-walk", m.walkKm], ["k-run", m.runKm], ["k-bike", m.bikeKm]];
              let base = 0;
              return (
                <g key={m.id}>
                  <title>{mm(m.month)}: {t("hist.walk")} {fmt(m.walkKm, lang)}, {t("hist.run")} {fmt(m.runKm, lang)}, {t("hist.bike")} {fmt(m.bikeKm, lang)}</title>
                  {parts.map(([cls, v]) => { const y = Y(base + v); const h = Y(base) - y; base += v; return v > 0 ? <rect key={cls} className={cls} x={x} y={y} width={bw} height={h} /> : null; })}
                </g>
              );
            })}
            {years.filter((y) => monthIndex(y + "-01") >= i0).map((y) => <text key={y} className="axis" x={L + slot * (monthIndex(y + "-01") - i0)} y={H - 8} textAnchor="start">{y}</text>)}
          </svg>
        </div>
        <div className="legend"><span><i className="k-walk" />{t("hist.walk")}</span><span><i className="k-run" />{t("hist.run")}</span><span><i className="k-bike" />{t("hist.bike")}</span></div>
      </>
    );
  };

  return (
    <>
      {weights.length >= 2 && <section className="block"><Head title={t("hist.weight")} sub={t("hist.weightHelp")} />{wChart()}</section>}
      {months.length > 0 && <section className="block"><Head title={t("hist.activity")} sub={t("hist.activityHelp")} />{aChart()}</section>}
    </>
  );
}
