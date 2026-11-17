import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { HUES } from "../components/Brand";
import { Icon, type IconName } from "../components/Card";
import { MetricChart } from "../components/MetricChart";
import { MonthGrid } from "../components/MonthGrid";
import { updateSettings } from "../db";
import { type MessageKey, useI18n } from "../i18n";
import {
  type Bucket, type Grouping, type MetricId, VALUE, byWeekday, change, dropSignal, forecast, group, mean, median, present, rolling, series, sleepView, slope,
  streaks, sum, trendLine, weightView, bpWeek, bpClass,
} from "../lib/analytics";
import { ddmm, iso, parseIso } from "../lib/date";
import { fmt, fmtInt, fmtKg, monthName } from "../lib/format";
import { type Span, SPANS, period } from "../lib/periods";
import { bpSummary } from "../lib/stats";
import type { DayEntry, DaysMap, Settings } from "../lib/types";

export type PageId = "steps" | "active" | "weight" | "sleep" | "pulse" | "bp" | "feel";
export const PAGE_IDS: PageId[] = ["steps", "active", "weight", "sleep", "pulse", "bp", "feel"];
export type Area = "move" | "weight" | "sleep" | "health";

interface Cfg { metric: MetricId; second?: MetricId; icon: IconName; hue: [string, string]; kind: "bar" | "line"; agg: "sum" | "mean"; up: boolean; area: Area; unit: MessageKey; zero: boolean }
export const CFG: Record<PageId, Cfg> = {
  steps: { metric: "steps", icon: "watch", hue: HUES.steps, kind: "bar", agg: "sum", up: true, area: "move", unit: "an.u.steps", zero: true },
  active: { metric: "active", icon: "move", hue: HUES.move, kind: "bar", agg: "sum", up: true, area: "move", unit: "an.u.min", zero: true },
  weight: { metric: "weight", icon: "weight", hue: HUES.weight, kind: "line", agg: "mean", up: false, area: "weight", unit: "an.u.kg", zero: false },
  sleep: { metric: "sleep", icon: "moon", hue: HUES.sleepH, kind: "bar", agg: "mean", up: true, area: "sleep", unit: "an.u.h", zero: true },
  pulse: { metric: "pulse", icon: "heart", hue: ["#fda4af", "#e11d48"], kind: "line", agg: "mean", up: false, area: "health", unit: "an.u.bpm", zero: false },
  bp: { metric: "bpSys", second: "bpDia", icon: "heart", hue: ["#fb7185", "#be123c"], kind: "line", agg: "mean", up: false, area: "health", unit: "an.u.mmhg", zero: false },
  feel: { metric: "feel", icon: "diary", hue: ["#fcd34d", "#d97706"], kind: "line", agg: "mean", up: true, area: "health", unit: "an.u.of5", zero: false },
};

/** Days with something worth a star on the chart: pain, warning signs, pressure episodes, a bad night. */
export const hasEvent = (d: DayEntry | undefined) =>
  !!d && (!!d.flags?.length || Object.values(d.pain ?? {}).some((p) => (p ?? 0) > 0) || !!d.bpEpisodes?.length || !!d.nightEpisode);

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className={"mtile" + (tone ? " " + tone : "")}>
      <span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}
    </div>
  );
}

/** One day at a glance (tap a day in the calendar view). */
function DayCard({ date, entry, lang, onOpen }: { date: string; entry: DayEntry | undefined; lang: "uk" | "en"; onOpen: () => void }) {
  const { t } = useI18n();
  const b = bpSummary(entry);
  const rows: [string, string | null][] = [
    [t("an.m.steps"), entry?.steps != null ? fmtInt(entry.steps, lang) : null],
    [t("an.m.active"), VALUE.active(entry) != null ? `${VALUE.active(entry)} ${t("an.u.min")}` : null],
    [t("an.m.weight"), VALUE.weight(entry) != null ? `${fmtKg(VALUE.weight(entry), lang)} ${t("an.u.kg")}` : null],
    [t("an.m.sleep"), entry?.sleepMin != null ? `${fmt(entry.sleepMin / 60, lang)} ${t("an.u.h")}` : null],
    [t("an.m.pulse"), entry?.restingHr != null ? `${entry.restingHr} ${t("an.u.bpm")}` : null],
    [t("an.m.bp"), b.morning || b.evening ? [b.morning, b.evening].filter(Boolean).map((x) => `${x!.sys}/${x!.dia}`).join(" · ") : null],
    [t("an.m.feel"), entry?.feel != null ? `${entry.feel} / 5` : null],
  ];
  const have = rows.filter((r) => r[1] != null);
  return (
    <div className="daycard">
      <b>{parseIso(date).toLocaleDateString(lang === "uk" ? "uk-UA" : "en-GB", { weekday: "long", day: "numeric", month: "long" })}</b>
      {have.length ? <dl>{have.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl> : <p className="status" style={{ margin: 0 }}>{t("an.noDay")}</p>}
      {hasEvent(entry) && <small>★ {t("an.dayEvent")}</small>}
      <button type="button" className="compact primary" onClick={onOpen}>{t("an.open.day")}</button>
    </div>
  );
}

export function MetricPage({ days, settings }: { days: DaysMap; settings: Settings }) {
  const { id = "steps" } = useParams();
  const pid = (PAGE_IDS.includes(id as PageId) ? id : "steps") as PageId;
  const c = CFG[pid];
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const loc = lang === "uk" ? "uk-UA" : "en-GB";
  const [span, setSpan] = useState<Span>("month");
  const [offset, setOffset] = useState(0);
  const [custom, setCustom] = useState({ from: iso(new Date(Date.now() - 29 * 864e5)), to: iso(new Date()) });
  const [grouping, setGrouping] = useState<Grouping | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [view, setView] = useState<"chart" | "cal">("chart");
  const [day, setDay] = useState<string | null>(null);
  const [rangeMonth, setRangeMonth] = useState(() => iso(new Date()).slice(0, 7) + "-01");
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const first = useMemo(() => Object.keys(days).sort()[0], [days]);
  const p = period(span, offset, { first, ...custom });
  const g: Grouping = grouping ?? (p.dates.length <= 35 ? "day" : p.dates.length <= 200 ? "week" : "month");
  const v = series(days, c.metric, p.dates);
  const prevV = series(days, c.metric, p.prev);
  const buckets = group(p.dates, v, g, c.agg);
  const second = c.second ? group(p.dates, series(days, c.second, p.dates), g, "mean") : undefined;
  // Stars: how many days in each bucket had an episode (pain, warning signs, pressure, a bad night).
  const events = buckets.map((b) => p.dates.filter((d) => d >= b.start && d <= b.end && hasEvent(days[d])).length);
  const smooth = g === "day" ? (pid === "weight" ? trendLine(v) : c.kind === "bar" ? rolling(v, 7) : undefined) : undefined;
  const xs = present(v);
  const goal = pid === "steps" ? settings.goals.find((x) => x.metric === "steps" && x.on)?.target ?? settings.stepGoal
    : pid === "active" ? settings.goals.find((x) => x.metric === "activeMin" && x.on)?.target ?? null
    : pid === "sleep" ? 7 : pid === "weight" ? settings.weightGoal ?? null : null;

  const num = (x: number | null | undefined) => (x == null ? "—" : pid === "steps" ? fmtInt(x, lang) : pid === "weight" ? fmtKg(x, lang) : pid === "bp" || pid === "pulse" || pid === "active" ? fmtInt(x, lang) : fmt(x, lang));
  const unit = t(c.unit);
  const short = (x: number, d: string) => pid === "steps" ? (x >= 1000 ? `${fmt(x / 1000, lang)}k` : String(x)) : pid === "bp" ? `${x}/${VALUE.bpDia(days[d]) ?? "—"}` : pid === "weight" ? fmt(x, lang) : pid === "sleep" ? fmt(x, lang) : String(Math.round(x));
  const dayLabel = (d: string) => parseIso(d).toLocaleDateString(loc, { day: "numeric", month: "short" });
  const bucketName = (b: Bucket) => (g === "day" ? dayLabel(b.start) : g === "week" ? `${ddmm(b.start)}–${ddmm(b.end)}` : monthName(b.start, lang));
  const bucketValue = (b: Bucket, i: number) => (pid === "bp" ? `${num(b.v)}/${num(second?.[i]?.v)}` : `${num(b.v)} ${unit}`);
  const tick = (b: Bucket) => (g === "day" ? b.start.slice(8).replace(/^0/, "") : g === "week" ? ddmm(b.start) : parseIso(b.start).toLocaleDateString(loc, { month: "short" }));

  // Headline and comparison with the previous period.
  const headline = pid === "weight" ? present(trendLine(series(days, "weight", [...p.prev, ...p.dates]))).at(-1) ?? null : mean(xs);
  const prevHead = pid === "weight" ? present(trendLine(series(days, "weight", p.prev))).at(-1) ?? null : mean(present(prevV));
  const pct = change(headline, prevHead);
  const better = (d: number) => (c.up ? d > 0 : d < 0);
  const cmp = pid === "weight"
    ? headline != null && prevHead != null ? Math.abs(headline - prevHead) < 0.05 ? { text: t("an.same"), good: null } : { text: `${headline - prevHead > 0 ? "+" : "−"}${fmtKg(Math.abs(headline - prevHead), lang)} ${unit}`, good: better(headline - prevHead) } : null
    : pct != null ? Math.abs(pct) < 0.5 ? { text: t("an.same"), good: null } : { text: `${pct > 0 ? "+" : "−"}${fmt(Math.abs(pct), lang, 0)}%`, good: better(pct) } : null;

  const tiles = useMemo(() => tilesFor(), // eslint-disable-next-line react-hooks/exhaustive-deps
    [pid, p.from, p.to, days, settings, lang]);
  function tilesFor() {
    const out: { label: string; value: string; sub?: string; tone?: "good" | "bad" }[] = [];
    const longDates = Object.keys(days).sort();
    if (pid === "steps") {
      const goalV = goal ?? 7000;
      const met = xs.filter((x) => x >= goalV).length;
      out.push({ label: t("an.t.median"), value: num(median(xs)), sub: `${t("an.t.total")}: ${fmtInt(sum(xs), lang)}` });
      out.push({ label: t("an.t.goalDays", { g: fmtInt(goalV, lang) }), value: xs.length ? `${met} / ${xs.length}` : "—", sub: xs.length ? `${Math.round((met / xs.length) * 100)}%` : undefined });
      const all = series(days, "steps", longDates);
      const sg = streaks(longDates, all, (x) => x >= goalV), s7 = streaks(longDates, all, (x) => x >= 7000);
      out.push({ label: t("an.t.streakGoal"), value: t("an.t.days", { n: sg.current }), sub: t("an.t.longest", { n: sg.longest.length }) });
      out.push({ label: t("an.t.streak7k"), value: t("an.t.days", { n: s7.current }), sub: t("an.t.longest", { n: s7.longest.length }) });
      const sl = slope(v);
      if (sl && sl.n >= 14) out.push({ label: t("an.t.trend"), value: `${sl.perDay > 0 ? "+" : "−"}${fmtInt(Math.abs(sl.perDay * 7), lang)}`, sub: t("an.t.perWeek"), tone: sl.perDay > 0 ? "good" : "bad" });
      const drop = dropSignal(series(days, "steps", longDates.slice(-35)));
      if (drop && offset === 0) out.push({ label: t("an.t.drop"), value: `${fmt(drop.pct, lang, 0)}%`, sub: t("an.t.dropV"), tone: "bad" });
    } else if (pid === "active") {
      const wk = period("week", 0).dates, wsum = sum(present(series(days, "active", wk)));
      const wGoal = settings.activeWeekGoal ?? 150;
      out.push({ label: t("an.t.week"), value: `${fmtInt(wsum, lang)} / ${wGoal} ${unit}`, sub: t("an.t.who"), tone: wsum >= wGoal ? "good" : undefined });
      if (goal) { const met = xs.filter((x) => x >= goal).length; out.push({ label: t("an.t.dayGoal", { g: goal }), value: xs.length ? `${met} / ${xs.length}` : "—" }); }
      out.push({ label: t("an.t.median"), value: `${num(median(xs))} ${unit}`, sub: `${t("an.t.total")}: ${fmtInt(sum(xs), lang)} ${unit}` });
    } else if (pid === "weight") {
      const allW = series(days, "weight", longDates);
      const w = weightView(allW);
      const z = w.kgWeek28 == null ? null : w.kgWeek28 > 0.05 ? "gain" : w.kgWeek28 > -0.5 ? "slow" : w.kgWeek28 >= -1 ? "good" : "fast";
      if (w.kgWeek14 != null || w.kgWeek28 != null) out.push({ label: t("an.t.pace"), value: `${fmt(w.kgWeek28 ?? w.kgWeek14, lang, 2)} ${t("an.u.kgWeek")}`, sub: z ? t(`an.zone.${z}` as MessageKey) : undefined, tone: z === "good" ? "good" : z === "gain" ? "bad" : undefined });
      const trend = present(w.trend), cur = trend.at(-1), start = present(allW)[0], max = Math.max(...present(allW));
      if (cur != null && start != null) {
        const lostPct = ((start - cur) / start) * 100;
        const reached = [3, 5, 10].filter((m) => lostPct >= m);
        out.push({ label: t("an.t.lost"), value: `${fmtKg(start - cur, lang)} ${unit}`, sub: `${fmt(lostPct, lang, 1)}% · ${t("an.t.fromMax")} ${fmtKg(max - cur, lang)}`, tone: lostPct > 0 ? "good" : undefined });
        out.push({ label: t("an.t.milestones"), value: [3, 5, 10].map((m) => (reached.includes(m) ? `✓−${m}%` : `−${m}%`)).join("  "), sub: reached.length < 3 ? t("an.t.nextMilestone", { kg: fmtKg(start * (1 - [3, 5, 10].find((m) => !reached.includes(m))! / 100), lang) }) : undefined });
      }
      if (settings.weightGoal) {
        const f = forecast(allW, settings.weightGoal);
        const d = (x: string) => parseIso(x).toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" });
        out.push({ label: t("an.t.forecast"), value: f ? d(f.date) : "—", sub: f ? t("an.t.between", { a: d(f.early), b: d(f.late) }) : t("an.t.noForecast") });
      }
      if (w.plateau) out.push({ label: t("an.t.plateau"), value: "≈", sub: t("an.t.plateauV"), tone: "bad" });
    } else if (pid === "sleep") {
      const ok = xs.filter((x) => x >= 7).length;
      out.push({ label: t("an.t.sleep7"), value: xs.length ? `${ok} / ${xs.length}` : "—", sub: xs.length ? `${Math.round((ok / xs.length) * 100)}%` : undefined, tone: xs.length && ok / xs.length >= 0.7 ? "good" : undefined });
      const s = sleepView(days, p.dates);
      if (s.bedSd != null) {
        const lvl = s.bedSd <= 30 ? "good" : s.bedSd <= 60 ? "ok" : "bad";
        out.push({ label: t("an.t.regular"), value: t(`an.reg.${lvl}` as MessageKey), sub: t("an.t.regularV", { b: Math.round(s.bedSd), w: Math.round(s.wakeSd ?? 0) }), tone: lvl === "good" ? "good" : lvl === "bad" ? "bad" : undefined });
      }
      out.push({ label: t("an.t.median"), value: `${num(median(xs))} ${unit}` });
    } else if (pid === "pulse") {
      const all = series(days, "pulse", longDates);
      const last2 = all.slice(-2), base = mean(present(all.slice(-32, -2)));
      if (base != null && last2.every((x) => x != null && x >= base + 7)) out.push({ label: t("an.t.alert"), value: `+${fmtInt(last2[1]! - base, lang)}`, sub: t("an.t.alertV"), tone: "bad" });
      const s = slope(v);
      if (s && s.n >= 10) out.push({ label: t("an.t.trend"), value: `${s.perDay > 0 ? "+" : "−"}${fmt(Math.abs(s.perDay * 30), lang)} ${unit}`, sub: t("an.t.per30"), tone: s.perDay < 0 ? "good" : "bad" });
      const r = Math.min(...xs);
      if (xs.length) out.push({ label: t("an.t.lowest"), value: `${fmtInt(r, lang)} ${unit}` });
    } else if (pid === "bp") {
      const wk = bpWeek(days, p.dates[p.dates.length - 1] ?? iso(new Date()));
      if (wk.morning) out.push({ label: t("an.t.morning"), value: `${wk.morning.sys}/${wk.morning.dia}`, sub: t("an.t.readings", { n: wk.morning.n }) });
      if (wk.evening) out.push({ label: t("an.t.evening"), value: `${wk.evening.sys}/${wk.evening.dia}`, sub: t("an.t.readings", { n: wk.evening.n }) });
      const cls = { ok: 0, elevated: 0, high: 0 };
      p.dates.forEach((d) => { const s = bpSummary(days[d]); [s.morning, s.evening].forEach((a) => { if (a) cls[bpClass(a.sys, a.dia)]++; }); });
      const total = cls.ok + cls.elevated + cls.high;
      if (total) out.push({ label: t("an.t.cats"), value: `${Math.round((cls.ok / total) * 100)}% · ${Math.round((cls.elevated / total) * 100)}% · ${Math.round((cls.high / total) * 100)}%`, sub: t("an.t.catsV") });
    } else if (pid === "feel") {
      const good = xs.filter((x) => x >= 4).length;
      out.push({ label: t("an.t.goodDays"), value: xs.length ? `${good} / ${xs.length}` : "—", tone: xs.length && good / xs.length >= 0.5 ? "good" : undefined });
      const s = slope(v);
      if (s && s.n >= 10) out.push({ label: t("an.t.trend"), value: s.perDay > 0.005 ? "↑" : s.perDay < -0.005 ? "↓" : "→", sub: t("an.t.per30v", { v: fmt(s.perDay * 30, lang) }), tone: s.perDay > 0.005 ? "good" : s.perDay < -0.005 ? "bad" : undefined });
    }
    return out;
  }

  const wd = byWeekday(p.dates, v);
  const wdPresent = present(wd);
  const best = wdPresent.length ? (c.up ? Math.max : Math.min)(...wdPresent) : null;
  const worst = wdPresent.length ? (c.up ? Math.min : Math.max)(...wdPresent) : null;
  const monday = new Date(2024, 0, 1);
  const wdName = (i: number) => new Date(monday.getTime() + i * 864e5).toLocaleDateString(loc, { weekday: "short" });

  const label = span === "week" ? `${ddmm(p.from)}–${ddmm(p.to)}` : span === "month" ? monthName(p.from, lang)
    : span === "quarter" ? `${parseIso(p.from).toLocaleDateString(loc, { month: "short" })} – ${monthName(p.to, lang)}`
    : span === "year" ? p.from.slice(0, 4) : span === "all" ? t("an.allTime") : `${ddmm(p.from)}–${ddmm(p.to)}`;
  const choose = (s: Span) => { setSpan(s); setOffset(0); setGrouping(null); setPicked(null); setDay(null); if (s !== "month") setView("chart"); };
  const pick = picked != null ? buckets[picked] : null;

  return (
    <>
      <header className="page-head">
        <Link className="back" to="/">{t("an.back")}</Link>
        <div className="head-line mhead" data-c={pid === "weight" ? "weight" : pid === "steps" ? "steps" : pid === "active" ? "move" : pid === "sleep" ? "moon" : pid === "feel" ? "habits" : "heart"}>
          <span className="card-ic"><Icon name={c.icon} /></span><h1>{t(`an.m.${pid}` as MessageKey)}</h1>
        </div>
      </header>

      <section className="block mperiod">
        <div className="seg full spans" role="radiogroup" aria-label={t("an.period")}>
          {SPANS.map((s) => <button key={s} type="button" role="radio" aria-checked={span === s} className={span === s ? "on" : ""} onClick={() => choose(s)}>{t(`an.span.${s}` as MessageKey)}</button>)}
        </div>
        {span === "custom" && (
          <div className="rangepick">
            <div className="pnav">
              <button type="button" aria-label={t("an.older")} onClick={() => setRangeMonth(iso(new Date(+rangeMonth.slice(0, 4), +rangeMonth.slice(5, 7) - 2, 1)))}>‹</button>
              <div className="pnav-mid"><h2>{monthName(rangeMonth, lang)}</h2></div>
              <button type="button" aria-label={t("an.newer")} onClick={() => setRangeMonth(iso(new Date(+rangeMonth.slice(0, 4), +rangeMonth.slice(5, 7), 1)))}>›</button>
            </div>
            <MonthGrid month={rangeMonth} lang={lang} disabled={(d) => d > iso(new Date())}
              render={(d) => {
                const a = rangeStart ?? custom.from, b = rangeStart ? rangeStart : custom.to;
                const lo = a < b ? a : b, hi = a < b ? b : a;
                return { className: d === lo || d === hi ? "r-end" : d > lo && d < hi ? "r-in" : "" };
              }}
              onPick={(d) => {
                if (!rangeStart) { setRangeStart(d); setCustom({ from: d, to: d }); return; }
                const [from, to] = d < rangeStart ? [d, rangeStart] : [rangeStart, d];
                setCustom({ from, to }); setRangeStart(null); setOffset(0); setPicked(null);
              }} />
            <p className="status" style={{ margin: 0 }}>{rangeStart ? t("an.pickEnd") : t("an.rangeIs", { from: ddmm(custom.from), to: ddmm(custom.to) })}</p>
          </div>
        )}
        {span !== "all" && (
          <div className="pnav">
            <button type="button" aria-label={t("an.older")} onClick={() => { setOffset(offset + 1); setPicked(null); }}>‹</button>
            <div className="pnav-mid"><h2>{label}</h2>{offset > 0 && <button type="button" className="link" onClick={() => setOffset(0)}>{t("an.now")}</button>}</div>
            <button type="button" aria-label={t("an.newer")} disabled={offset === 0} onClick={() => { setOffset(offset - 1); setPicked(null); }}>›</button>
          </div>
        )}
      </section>

      <section className="block mmain" data-c={pid === "weight" ? "weight" : pid === "steps" ? "steps" : pid === "active" ? "move" : pid === "sleep" ? "moon" : "heart"}>
        {!xs.length ? <p className="empty">{t("an.noData")}</p> : (
          <>
            <div className="mbig">
              <b>{pid === "bp" ? (() => { const w = bpWeek(days, p.dates[p.dates.length - 1]); return w.all ? `${w.all.sys}/${w.all.dia}` : "—"; })() : num(headline)}</b>
              <span>{pid === "bp" ? t("an.u.mmhg") : unit} · {t(`an.h.${pid}` as MessageKey)}</span>
              {cmp && <em className={cmp.good == null ? "same" : cmp.good ? "good" : "bad"}>{cmp.text} {t("an.vsPrev")}</em>}
            </div>
            <div className="seg grp" role="radiogroup" aria-label={t("an.view")}>
              <button type="button" role="radio" aria-checked={view === "chart"} className={view === "chart" ? "on" : ""} onClick={() => setView("chart")}>{t("an.view.chart")}</button>
              <button type="button" role="radio" aria-checked={view === "cal"} className={view === "cal" ? "on" : ""} onClick={() => { if (span !== "month") { setSpan("month"); setOffset(0); setGrouping(null); } setView("cal"); setPicked(null); }}>{t("an.view.cal")}</button>
            </div>
            {view === "cal" ? (
              <>
                <MonthGrid month={p.from} lang={lang} disabled={(d) => d > iso(new Date())}
                  render={(d) => {
                    const x = VALUE[c.metric](days[d]);
                    const today = d === iso(new Date());
                    const ev = hasEvent(days[d]) ? <i className="mday-star">★</i> : null;
                    if (x == null) return { className: today ? "today" : "", body: ev };
                    const heat = pid === "bp" ? null : goal ? Math.min(1, x / goal) : xs.length > 1 ? (x - Math.min(...xs)) / ((Math.max(...xs) - Math.min(...xs)) || 1) : 0.6;
                    const cls = pid === "bp" ? "bp-" + bpClass(x, VALUE.bpDia(days[d]) ?? 0) : heat != null && goal && x >= goal ? "met" : "";
                    return {
                      className: `has ${cls} ${today ? "today" : ""} ${day === d ? "sel" : ""}`,
                      style: heat != null ? { ["--heat" as string]: String(0.18 + heat * 0.62), ["--hue" as string]: c.hue[1] } : undefined,
                      body: <><span className="mday-v">{short(x, d)}</span>{ev}</>,
                      label: `${d}: ${num(x)}`,
                    };
                  }}
                  onPick={(d) => setDay(day === d ? null : d)} />
                {day && <DayCard date={day} entry={days[day]} lang={lang} onOpen={() => nav(`/log?date=${day}`)} />}
              </>
            ) : (<>
            <div className="seg grp" role="radiogroup" aria-label={t("an.grouping")}>
              {(["day", "week", "month"] as Grouping[]).map((x) => <button key={x} type="button" role="radio" aria-checked={g === x} className={g === x ? "on" : ""} onClick={() => { setGrouping(x); setPicked(null); }}>{t(`an.group.${x}` as MessageKey)}</button>)}
            </div>
            <div className="mchart-wrap">
              <MetricChart buckets={buckets} kind={c.kind} second={second} smooth={smooth ?? undefined} goal={goal} events={events} hue={c.hue}
                label={(b) => `${bucketName(b)}: ${b.v == null ? "—" : num(b.v)}`} tick={tick} picked={picked} onPick={setPicked} zeroBase={c.zero} />
              {pick && (
                <div className="mpop" role="dialog" aria-label={bucketName(pick)} style={{ left: `${Math.min(80, Math.max(20, ((picked! + 0.5) / buckets.length) * 100))}%` }}>
                  <span>{bucketName(pick)}</span>
                  <b>{pick.v == null ? t("an.noDay") : bucketValue(pick, picked!)}</b>
                  {g !== "day" && pick.v != null && <small>{t("an.perDayAvg")}</small>}
                  {events[picked!] > 0 && <small>{t("an.eventsN", { n: events[picked!] })}</small>}
                  <button type="button" className="compact primary" onClick={() => {
                    if (g === "day") nav(`/log?date=${pick.start}`);
                    else if (g === "month") nav(`/history?month=${pick.start.slice(0, 7)}`);
                    else { setSpan("custom"); setOffset(0); setCustom({ from: pick.start, to: pick.end }); setGrouping("day"); setPicked(null); }
                  }}>{t(g === "day" ? "an.open.day" : g === "month" ? "an.open.month" : "an.open.week")}</button>
                </div>
              )}
            </div>
            <p className="mlegend">{smooth && <span><i className="lg-smooth" style={{ background: c.hue[1] }} />{t(pid === "weight" ? "an.lg.trend" : "an.lg.avg7")}</span>}{goal != null && <span><i className="lg-goal" />{t("an.lg.goal")}</span>}{events.some((x) => x > 0) && <span>{t("an.lg.stars")}</span>}</p>
            </>)}
          </>
        )}
      </section>

      {tiles.length > 0 && <section className="mtiles">{tiles.map((x) => <Tile key={x.label} {...x} />)}</section>}

      {pid === "weight" && (
        <section className="block">
          <label className="field"><span>{t("an.t.goalWeight")}</span>
            <input type="number" inputMode="decimal" step="0.5" min="40" max="300" defaultValue={settings.weightGoal ?? ""} placeholder={t("an.t.goalWeightPh")}
              onBlur={(e) => { const x = parseFloat(e.target.value.replace(",", ".")); void updateSettings({ weightGoal: Number.isFinite(x) ? x : null }); }} />
          </label>
        </section>
      )}
      {pid === "active" && (
        <section className="block">
          <span className="sub-h">{t("an.t.weekGoal")}</span>
          <div className="seg full" role="radiogroup" aria-label={t("an.t.weekGoal")}>
            {[150, 200, 250, 300].map((m) => <button key={m} type="button" role="radio" aria-checked={(settings.activeWeekGoal ?? 150) === m} className={(settings.activeWeekGoal ?? 150) === m ? "on" : ""} onClick={() => void updateSettings({ activeWeekGoal: m })}>{m} {t("an.u.min")}</button>)}
          </div>
        </section>
      )}

      {xs.length > 0 && (
        <section className="block">
          <span className="sub-h">{t("an.weekday")}</span>
          <div className="wdbars">
            {wd.map((x, i) => {
              const h = x == null || !wdPresent.length ? 0 : c.zero ? x / Math.max(...wdPresent) : 0.25 + (0.75 * (x - Math.min(...wdPresent))) / ((Math.max(...wdPresent) - Math.min(...wdPresent)) || 1);
              return (
                <div key={i} className={"wd" + (x != null && x === best ? " best" : x != null && x === worst ? " worst" : "")}>
                  <small>{x == null ? "—" : num(x)}</small>
                  <i style={{ height: `${Math.round(h * 100)}%`, background: `linear-gradient(${c.hue[0]}, ${c.hue[1]})` }} />
                  <span>{wdName(i)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <Link className="btn block more-btn" to={`/more/${c.area}`}>{t(`an.more.${c.area}` as MessageKey)} →</Link>
    </>
  );
}
