import { type ReactNode, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon, type IconName } from "../components/Card";
import { useItems } from "../db";
import { type MessageKey, useI18n } from "../i18n";
import {
  type MetricId, VALUE, bmi, bmiClass, bpClass, byWeekday, datesBetween, diffMeans, group, kcalPerDay, lagged, linkStrength, mean, present, record,
  series, sleepView, slope, spearman, stepZones, streaks, sum, trendLine, walkEfficiency, walkKcal, weekRhythm, weightView,
} from "../lib/analytics";
import { addDays, ddmm, iso, mondayOf, parseIso } from "../lib/date";
import { fmt, fmtInt, fmtKg, monthName } from "../lib/format";
import { exerciseName } from "../lib/report";
import { bpSummary } from "../lib/stats";
import type { DaysMap, DiaryItem, PainArea, Settings } from "../lib/types";
import { type Area, hasEvent } from "./MetricPage";

const AREAS: Area[] = ["move", "weight", "sleep", "health"];
const AREA_ICON: Record<Area, [IconName, string]> = { move: ["move", "move"], weight: ["weight", "weight"], sleep: ["moon", "moon"], health: ["heart", "heart"] };
const RANGES = [30, 90, 365, 0] as const;

/** Places to compare a walked distance with (km). Small and fixed: nothing is fetched or cached. */
const TRIPS: [number, MessageKey][] = [[180, "trip.sumyKharkiv"], [330, "trip.sumyKyiv"], [475, "trip.kyivOdesa"], [540, "trip.kyivLviv"], [790, "trip.kyivWarsaw"], [1340, "trip.kyivBerlin"], [2400, "trip.kyivParis"], [40075, "trip.equator"]];

type Tone = "good" | "bad" | undefined;
function Row({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return <div className={"mrow" + (tone ? " " + tone : "")}><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>;
}
function Sec({ title, c, children }: { title: string; c: string; children: ReactNode }) {
  return <section className="block" data-c={c}><h2>{title}</h2><div className="mrows">{children}</div></section>;
}

export function MorePage({ days, settings }: { days: DaysMap; settings: Settings }) {
  const { area: raw } = useParams();
  const { t, lang } = useI18n();
  const loc = lang === "uk" ? "uk-UA" : "en-GB";
  const workouts = useItems("workout") ?? [];
  const diaryItems = useItems("diary") ?? [];
  const [range, setRange] = useState<(typeof RANGES)[number]>(90);
  const all = useMemo(() => Object.keys(days).filter((d) => !days[d].deleted).sort(), [days]);
  const today = iso(new Date());

  if (!raw || !AREAS.includes(raw as Area)) {
    return (
      <>
        <header className="page-head"><Link className="back" to="/">{t("an.back")}</Link><h1>{t("more.allTitle")}</h1></header>
        <section className="block menu">
          {(["steps", "active", "weight", "sleep", "pulse", "bp", "feel"] as const).map((m) => (
            <Link key={m} className="menu-row" to={`/m/${m}`} data-c={m === "steps" ? "steps" : m === "active" ? "move" : m === "weight" ? "weight" : m === "sleep" ? "moon" : m === "feel" ? "habits" : "heart"}>
              <span className="card-ic"><Icon name={m === "steps" ? "watch" : m === "active" ? "move" : m === "weight" ? "weight" : m === "sleep" ? "moon" : m === "feel" ? "diary" : "heart"} /></span>
              <span className="menu-t"><b>{t(`an.m.${m}` as MessageKey)}</b></span><span className="menu-go" aria-hidden="true">›</span>
            </Link>
          ))}
        </section>
        <section className="block menu">
          {AREAS.map((a) => (
            <Link key={a} className="menu-row" to={`/more/${a}`} data-c={AREA_ICON[a][1]}>
              <span className="card-ic"><Icon name={AREA_ICON[a][0]} /></span>
              <span className="menu-t"><b>{t(`an.more.${a}` as MessageKey)}</b></span><span className="menu-go" aria-hidden="true">›</span>
            </Link>
          ))}
        </section>
      </>
    );
  }
  const area = raw as Area;
  const start = range ? iso(addDays(new Date(), -(range - 1))) : all[0] ?? today;
  const dates = datesBetween(start < today ? start : today, today);
  const v = (m: MetricId) => series(days, m, dates);
  const dl = (d: string) => parseIso(d).toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" });
  const few = (have: number, need: number) => t("more.few", { have, need });

  // —— Links between metrics, worded for people ——
  const corr = (title: string, a: MetricId, b: MetricId, lag: number, up: MessageKey, down: MessageKey) => {
    const [x, y] = lagged(days, dates, a, b, lag);
    const r = spearman(x, y);
    const n = x.filter((q, i) => q != null && y[i] != null).length;
    if (!r) return <Row key={title} label={title} value="—" sub={few(n, 21)} />;
    const s = linkStrength(r.rho);
    if (!r.sure || s === "none") return <Row key={title} label={title} value={t("more.noLink")} sub={t("more.rho", { r: fmt(r.rho, lang, 2), n: r.n })} />;
    return <Row key={title} label={title} value={`${t(`more.str.${s}` as MessageKey)}: ${t(r.rho > 0 ? up : down)}`} sub={`${t("more.rho", { r: fmt(r.rho, lang, 2), n: r.n })} · ${t("more.notCause")}`} />;
  };
  const diff = (title: string, a: number[], b: number[], unit: string, f: (x: number) => string, more: MessageKey, less: MessageKey) => {
    const r = diffMeans(a, b);
    if (!r) return <Row key={title} label={title} value="—" sub={t("more.fewGroups", { a: a.length, b: b.length })} />;
    const range = `${f(r.lo)}…${f(r.hi)} ${unit}`;
    if (!r.sure) return <Row key={title} label={title} value={t("more.noDiff")} sub={range} />;
    return <Row key={title} label={title} value={`${t(r.diff > 0 ? more : less, { v: `${f(Math.abs(r.diff))} ${unit}` })}`} sub={`${range} · ${t("more.notCause")}`} tone={undefined} />;
  };
  const next = (d: string, k = 1) => iso(addDays(parseIso(d), k));

  const sections: ReactNode[] = [];
  if (area === "move") {
    const steps = v("steps");
    const best = record(dates, steps);
    const weeks = group(dates, steps, "week", "sum").map((w) => ({ ...w, total: sum(present(steps.slice(dates.indexOf(w.start), dates.indexOf(w.end) + 1))) }));
    const bestWeek = weeks.reduce<typeof weeks[number] | null>((m, w) => (w.total > (m?.total ?? 0) ? w : m), null);
    const months = group(dates, steps, "month", "mean");
    const bestMonth = months.reduce<typeof months[number] | null>((m, x) => (x.v != null && x.v > (m?.v ?? 0) ? x : m), null);
    sections.push(
      <Sec key="rec" title={t("more.records")} c="steps">
        <Row label={t("more.bestDay")} value={best ? fmtInt(best.v, lang) : "—"} sub={best ? dl(best.date) : undefined} />
        <Row label={t("more.bestWeek")} value={bestWeek?.total ? fmtInt(bestWeek.total, lang) : "—"} sub={bestWeek?.total ? `${ddmm(bestWeek.start)}–${ddmm(bestWeek.end)}` : undefined} />
        <Row label={t("more.bestMonth")} value={bestMonth?.v ? `${fmtInt(bestMonth.v, lang)} ${t("more.perDay")}` : "—"} sub={bestMonth?.v ? monthName(bestMonth.start, lang) : undefined} />
      </Sec>,
    );
    const z = stepZones(steps);
    sections.push(
      <Sec key="zones" title={t("more.zones")} c="steps">
        <div className="zbar" aria-hidden="true">{z.map((p, i) => <i key={i} className={"z" + i} style={{ flex: p || 0.0001 }} />)}</div>
        {["< 5 000", "5 000–7 499", "7 500–9 999", "≥ 10 000"].map((l, i) => <Row key={l} label={`${l} · ${t(`more.zone${i}` as MessageKey)}`} value={`${Math.round(z[i] * 100)}%`} />)}
      </Sec>,
    );
    const wd = byWeekday(dates, steps);
    const types = (["normal", "duty", "postduty", "off"] as const).map((k) => [k, mean(present(dates.map((d) => (days[d]?.dayType === k ? days[d]?.steps ?? null : null))))] as const).filter(([, x]) => x != null);
    sections.push(
      <Sec key="wk" title={t("more.weekdays")} c="steps">
        <Row label={t("more.workdays")} value={fmtInt(mean(present(wd.slice(0, 5))), lang)} />
        <Row label={t("more.weekend")} value={fmtInt(mean(present(wd.slice(5))), lang)} />
        {types.map(([k, x]) => <Row key={k} label={t(`ctx.dayType.${k}` as MessageKey)} value={fmtInt(x, lang)} />)}
      </Sec>,
    );
    const kcal = v("kcal"), km = v("distance");
    const totalKm = sum(present(km)), allKm = sum(present(series(days, "distance", all)));
    const trip = [...TRIPS].reverse().find(([k]) => allKm >= k);
    const nextTrip = TRIPS.find(([k]) => allKm < k);
    const active = v("active");
    const s30 = streaks(all, series(days, "active", all), (x) => x >= 30);
    sections.push(
      <Sec key="act" title={t("more.activity")} c="move">
        <Row label={t("more.kcal")} value={present(kcal).length ? `${fmtInt(mean(present(kcal)), lang)} ${t("more.perDay")}` : "—"} sub={present(kcal).length ? t("more.kcalSub", { max: fmtInt(record(dates, kcal)!.v, lang), sum: fmtInt(sum(present(kcal)), lang) }) : undefined} />
        <Row label={t("more.distance")} value={`${fmt(totalKm, lang)} км`} sub={t("more.distAll", { km: fmt(allKm, lang, 0) })} />
        {trip && <Row label={t("more.distLike")} value={t(trip[1])} sub={nextTrip ? t("more.distNext", { km: fmt(nextTrip[0] - allKm, lang, 0), to: t(nextTrip[1]) }) : undefined} tone="good" />}
        <Row label={t("more.activeStreak")} value={t("an.t.days", { n: s30.current })} sub={t("an.t.longest", { n: s30.longest.length })} />
        <Row label={t("more.activeAvg")} value={present(active).length ? `${fmtInt(mean(present(active)), lang)} ${t("an.u.min")}` : "—"} />
      </Sec>,
    );
    const ws = workouts.filter((w) => !w.deleted && w.date >= dates[0]);
    const eff = walkEfficiency(workouts.filter((w) => !w.deleted));
    const effHalf = Math.floor(eff.length / 2);
    const effChange = eff.length >= 6 ? ((mean(eff.slice(effHalf).map((e) => e.v))! / mean(eff.slice(0, effHalf).map((e) => e.v))!) - 1) * 100 : null;
    const longest = ws.reduce<typeof ws[number] | null>((m, w) => (w.durationMin > (m?.durationMin ?? 0) ? w : m), null);
    sections.push(
      <Sec key="wo" title={t("more.workouts")} c="watch">
        <Row label={t("more.woCount")} value={String(ws.length)} sub={ws.length ? t("more.woSub", { min: fmtInt(sum(ws.map((w) => w.durationMin)), lang), hr: fmtInt(mean(ws.map((w) => w.avgHr).filter((x): x is number => x != null)), lang) }) : t("more.woNone")} />
        {longest && <Row label={t("more.woLongest")} value={`${fmtInt(longest.durationMin, lang)} ${t("an.u.min")}`} sub={`${longest.type} · ${dl(longest.date)}${longest.distanceKm ? ` · ${fmt(longest.distanceKm, lang)} км` : ""}`} />}
        <Row label={t("more.eff")} value={effChange == null ? "—" : `${effChange > 0 ? "+" : "−"}${fmt(Math.abs(effChange), lang, 0)}%`} sub={effChange == null ? few(eff.length, 6) : t("more.effSub")} tone={effChange == null ? undefined : effChange > 0 ? "good" : "bad"} />
      </Sec>,
    );
    // Strength: days per week, records per exercise, pain on strength days.
    const weeksStr = Array.from({ length: 4 }, (_, k) => {
      const mon = addDays(mondayOf(new Date()), -7 * k);
      return datesBetween(iso(mon), iso(addDays(mon, 6))).filter((d) => days[d]?.strength?.length).length;
    });
    const recs = new Map<string, { reps: number; sets: number; kg: number; date: string; name: string }>();
    all.forEach((d) => days[d].strength?.forEach((e) => {
      const key = e.id ?? e.name ?? "?";
      const r = recs.get(key) ?? { reps: 0, sets: 0, kg: 0, date: d, name: exerciseName(t, e) };
      if (e.reps * e.sets > r.reps * r.sets) Object.assign(r, { reps: e.reps, sets: e.sets, date: d });
      if ((e.kg ?? 0) > r.kg) r.kg = e.kg ?? 0;
      recs.set(key, r);
    }));
    const painOn = (area: PainArea, str: boolean) => present(dates.filter((d) => !!days[d]?.strength?.length === str).map((d) => days[d]?.pain?.[area] ?? null));
    sections.push(
      <Sec key="str" title={t("more.strength")} c="strength">
        <Row label={t("more.strWeeks")} value={weeksStr.slice().reverse().join(" · ")} sub={t("more.strWho")} tone={weeksStr[0] >= 2 ? "good" : undefined} />
        {[...recs.values()].map((r) => <Row key={r.name} label={r.name} value={`${r.sets}×${r.reps}${r.kg ? ` · ${fmt(r.kg, lang)} кг` : ""}`} sub={dl(r.date)} />)}
        {(["back", "foot", "shoulder"] as PainArea[]).map((a) => {
          const on = painOn(a, true), off = painOn(a, false);
          if (!on.length || !off.length) return null;
          return <Row key={a} label={t("more.painStr", { area: t(`form.pain.${a}` as MessageKey).split(",")[0] })} value={`${fmt(mean(on), lang)} / ${fmt(mean(off), lang)}`} sub={t("more.painStrSub")} tone={mean(on)! > mean(off)! + 1 ? "bad" : undefined} />;
        })}
      </Sec>,
    );
    const goalSteps = settings.goals.find((g) => g.metric === "steps" && g.on)?.target ?? 7000;
    const sleepAfter = (ok: boolean) => present(dates.filter((d) => days[d]?.steps != null && (days[d]!.steps! >= goalSteps) === ok).map((d) => VALUE.sleep(days[next(d)])));
    const strWeeks = group(dates, dates.map((d) => (days[d]?.strength?.length ? 1 : 0)), "week", "sum");
    sections.push(
      <Sec key="links" title={t("more.links")} c="table">
        {diff(t("more.l.stepsSleep"), sleepAfter(true).map((h) => h * 60), sleepAfter(false).map((h) => h * 60), t("an.u.min"), (x) => fmt(x, lang, 0), "more.longer", "more.shorter")}
        {corr(t("more.l.stepsFeel"), "steps", "feel", 0, "more.l.moreBetter", "more.l.moreWorse")}
        {corr(t("more.l.stepsWeight"), "steps", "weight", 7, "more.l.moreHeavier", "more.l.moreLighter")}
        {(() => {
          const wv = trendLine(series(days, "weight", dates));
          const deltas = strWeeks.map((w) => {
            const i0 = dates.indexOf(w.start), i1 = dates.indexOf(w.end);
            return wv[i1] != null && wv[i0] != null ? { str: (w.v ?? 0) * 7 >= 2, d: wv[i1]! - wv[i0]! } : null;
          }).filter((x): x is { str: boolean; d: number } => x != null);
          return diff(t("more.l.strWeight"), deltas.filter((x) => x.str).map((x) => x.d), deltas.filter((x) => !x.str).map((x) => x.d), "кг", (x) => fmt(x, lang, 2), "more.l.heavier", "more.l.lighter");
        })()}
      </Sec>,
    );
  }

  if (area === "weight") {
    const w = v("weight");
    const allW = series(days, "weight", all);
    const wv = weightView(allW);
    const cur = present(wv.trend).at(-1);
    const rhythm = weekRhythm(all.slice(-90), allW.slice(-90));
    const monday = rhythm[0], mid = mean(present(rhythm.slice(2, 5)));
    const wdName = (i: number) => new Date(2024, 0, 1 + i).toLocaleDateString(loc, { weekday: "long" });
    const peak = present(rhythm).length ? rhythm.indexOf(Math.max(...present(rhythm))) : -1;
    sections.push(
      <Sec key="plat" title={t("more.plateau")} c="weight">
        <Row label={t("more.plateauNow")} value={wv.plateau ? t("more.yes") : t("more.no")} sub={wv.plateau ? t("an.t.plateauV") : t("more.plateauNo")} tone={wv.plateau ? "bad" : "good"} />
        <Row label={t("more.rhythm")} value={peak >= 0 ? t("more.rhythmPeak", { day: wdName(peak) }) : "—"} sub={monday != null && mid != null ? t("more.rhythmSub", { d: `${monday - mid > 0 ? "+" : "−"}${fmt(Math.abs(monday - mid), lang, 2)}` }) : few(present(allW.slice(-90)).length, 14)} />
      </Sec>,
    );
    const h = settings.heightCm;
    const b = cur && h ? bmi(cur, h) : null;
    sections.push(
      <Sec key="bmi" title={t("more.bmi")} c="weight">
        {b ? <Row label={t("more.bmiNow")} value={fmt(b, lang)} sub={`${t(`more.bmi.${bmiClass(b)}` as MessageKey)} · ${t("more.bmiWho")}`} /> : <Row label={t("more.bmiNow")} value="—" sub={<Link to="/settings/data">{t("more.needHeight")}</Link>} />}
        {b && present(allW).length > 1 && h && <Row label={t("more.bmiStart")} value={fmt(bmi(present(allW)[0], h), lang)} />}
      </Sec>,
    );
    const weeks = group(all, wv.trend, "week", "mean").map((wk) => {
      const i0 = all.indexOf(wk.start), i1 = all.indexOf(wk.end);
      const t0 = wv.trend[i0], t1 = wv.trend[i1];
      return t0 != null && t1 != null && i1 - i0 >= 5 ? { ...wk, d: t1 - t0 } : null;
    }).filter((x): x is NonNullable<typeof x> => x != null);
    const bestW = weeks.reduce<typeof weeks[number] | null>((m, x) => (x.d < (m?.d ?? Infinity) ? x : m), null);
    const worstW = weeks.reduce<typeof weeks[number] | null>((m, x) => (x.d > (m?.d ?? -Infinity) ? x : m), null);
    const ctx = (wk: { start: string; end: string }) => {
      const ds = datesBetween(wk.start, wk.end);
      return t("more.weekCtx", { steps: fmtInt(mean(present(series(days, "steps", ds))), lang), sleep: fmt(mean(present(series(days, "sleep", ds))), lang), str: ds.filter((d) => days[d]?.strength?.length).length });
    };
    sections.push(
      <Sec key="weeks" title={t("more.weeksBW")} c="weight">
        <Row label={t("more.bestWeekW")} value={bestW ? `${fmtKg(bestW.d, lang, 2)} кг` : "—"} sub={bestW ? `${ddmm(bestW.start)}–${ddmm(bestW.end)} · ${ctx(bestW)}` : few(weeks.length, 2)} tone="good" />
        <Row label={t("more.worstWeekW")} value={worstW ? `${worstW.d > 0 ? "+" : ""}${fmtKg(worstW.d, lang, 2)} кг` : "—"} sub={worstW ? `${ddmm(worstW.start)}–${ddmm(worstW.end)} · ${ctx(worstW)}` : undefined} tone="bad" />
      </Sec>,
    );
    const kw = wv.kgWeek28;
    sections.push(
      <Sec key="energy" title={t("more.energy")} c="strength">
        <Row label={t("more.deficit")} value={kw != null && kw < 0 ? `≈ ${fmtInt(kcalPerDay(kw), lang)} ${t("more.kcalDay")}` : "—"} sub={t("more.deficitSub")} />
        {cur && <Row label={t("more.whatIf")} value={`≈ ${fmtInt(walkKcal(2000, cur, h ?? undefined) * 7, lang)} ${t("more.kcalWeek")}`} sub={t("more.whatIfSub", { kg: fmt((walkKcal(2000, cur, h ?? undefined) * 7) / 7700 * 4.3, lang, 1) })} />}
      </Sec>,
    );
    const sleepWeeks = group(dates, v("sleep"), "week", "mean");
    const trendW = trendLine(w);
    const pairs = sleepWeeks.map((sw) => {
      const i0 = dates.indexOf(sw.start), i1 = dates.indexOf(sw.end);
      return sw.v != null && trendW[i0] != null && trendW[i1] != null && i1 - i0 >= 5 ? { s: sw.v, d: trendW[i1]! - trendW[i0]! } : null;
    }).filter((x): x is { s: number; d: number } => x != null);
    sections.push(
      <Sec key="links" title={t("more.links")} c="table">
        {diff(t("more.l.sleepWeight"), pairs.filter((x) => x.s < 6.5).map((x) => x.d), pairs.filter((x) => x.s >= 7).map((x) => x.d), "кг", (x) => fmt(x, lang, 2), "more.l.heavier", "more.l.lighter")}
        {corr(t("more.l.stepsWeight"), "steps", "weight", 7, "more.l.moreHeavier", "more.l.moreLighter")}
      </Sec>,
    );
  }

  if (area === "sleep") {
    const s = v("sleep");
    const longest = record(dates, s);
    const sv = sleepView(days, dates);
    const bed = dates.filter((d) => days[d]?.sleepStart).map((d) => ({ d, m: ((parseInt(days[d]!.sleepStart!.slice(-5, -3), 10) * 60 + parseInt(days[d]!.sleepStart!.slice(-2), 10)) - 18 * 60 + 1440) % 1440 }));
    const earliest = bed.reduce<{ d: string; m: number } | null>((m, x) => (x.m < (m?.m ?? Infinity) ? x : m), null);
    const s7 = streaks(all, series(days, "sleep", all), (x) => x >= 7);
    const hm = (m: number) => { const x = (m + 18 * 60) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
    sections.push(
      <Sec key="best" title={t("more.bestSleep")} c="moon">
        <Row label={t("more.longestNight")} value={longest ? `${fmt(longest.v, lang)} ${t("an.u.h")}` : "—"} sub={longest ? dl(longest.date) : undefined} />
        <Row label={t("more.earliestBed")} value={earliest ? hm(earliest.m) : "—"} sub={earliest ? dl(earliest.d) : undefined} />
        <Row label={t("more.sleepStreak")} value={t("an.t.days", { n: s7.current })} sub={t("an.t.longest", { n: s7.longest.length })} />
      </Sec>,
      <Sec key="rhythm" title={t("more.sleepRhythm")} c="moon">
        <Row label={t("more.jetlag")} value={sv.jetlagMin == null ? "—" : `${sv.jetlagMin > 0 ? "+" : "−"}${fmtInt(Math.abs(sv.jetlagMin), lang)} ${t("an.u.min")}`} sub={t("more.jetlagSub")} tone={sv.jetlagMin != null && Math.abs(sv.jetlagMin) > 60 ? "bad" : undefined} />
        <Row label={t("more.debt")} value={sv.debt7 == null ? "—" : `${fmt(sv.debt7, lang)} ${t("an.u.h")}`} sub={t("more.debtSub")} tone={sv.debt7 != null && sv.debt7 >= 3 ? "bad" : undefined} />
        <Row label={t("an.t.regular")} value={sv.bedSd == null ? "—" : t("an.t.regularV", { b: Math.round(sv.bedSd), w: Math.round(sv.wakeSd ?? 0) })} sub={t("more.regSub")} />
      </Sec>,
    );
    const goalSteps = settings.goals.find((g) => g.metric === "steps" && g.on)?.target ?? 7000;
    const after = (ok: boolean) => present(dates.filter((d) => days[d]?.steps != null && (days[d]!.steps! >= goalSteps) === ok).map((d) => VALUE.sleep(days[next(d)]))).map((h) => h * 60);
    sections.push(
      <Sec key="links" title={t("more.links")} c="table">
        {diff(t("more.l.stepsSleep"), after(true), after(false), t("an.u.min"), (x) => fmt(x, lang, 0), "more.longer", "more.shorter")}
        {corr(t("more.l.sleepFeel"), "sleep", "feel", 0, "more.l.longerBetter", "more.l.longerWorse")}
        {corr(t("more.l.sleepEnergy"), "sleep", "energyAm", 0, "more.l.longerBetter", "more.l.longerWorse")}
      </Sec>,
    );
  }

  if (area === "health") {
    const hr = v("pulse");
    const short = dates.filter((d) => (VALUE.sleep(days[d]) ?? 99) < 6), normal = dates.filter((d) => (VALUE.sleep(days[d]) ?? 0) >= 7);
    const busy = dates.filter((d) => (days[d]?.steps ?? 0) >= 10000), calm = dates.filter((d) => days[d]?.steps != null && days[d]!.steps! < 5000);
    sections.push(
      <Sec key="hr" title={t("an.m.pulse")} c="heart">
        <Row label={t("more.hr90")} value={present(hr).length ? `${fmtInt(mean(present(hr)), lang)} ${t("an.u.bpm")}` : "—"} sub={(() => { const s = slope(hr); return s && s.n >= 10 ? t("an.t.per30v", { v: `${s.perDay > 0 ? "+" : "−"}${fmt(Math.abs(s.perDay * 30), lang)}` }) : undefined; })()} />
        {diff(t("more.l.sleepHr"), present(short.map((d) => days[d]?.restingHr ?? null)), present(normal.map((d) => days[d]?.restingHr ?? null)), t("an.u.bpm"), (x) => fmt(x, lang, 1), "more.higher", "more.lower")}
        {diff(t("more.l.loadHr"), present(busy.map((d) => days[next(d)]?.restingHr ?? null)), present(calm.map((d) => days[next(d)]?.restingHr ?? null)), t("an.u.bpm"), (x) => fmt(x, lang, 1), "more.higher", "more.lower")}
      </Sec>,
    );
    const sys = v("bpSys"), dia = v("bpDia");
    const firstHalf = Math.floor(dates.length / 2);
    const s0 = mean(present(sys.slice(0, firstHalf))), s1 = mean(present(sys.slice(firstHalf)));
    const w0 = mean(present(v("weight").slice(0, firstHalf))), w1 = mean(present(v("weight").slice(firstHalf)));
    const episodes = dates.reduce((n, d) => n + (days[d]?.bpEpisodes?.length ?? 0), 0);
    const epHours = dates.flatMap((d) => (days[d]?.bpEpisodes ?? []).map((e) => e.time?.slice(0, 2))).filter(Boolean);
    sections.push(
      <Sec key="bp" title={t("an.m.bp")} c="heart">
        <Row label={t("more.bpTrend")} value={present(sys).length ? `${fmtInt(mean(present(sys)), lang)}/${fmtInt(mean(present(dia)), lang)}` : "—"} sub={(() => { const s = slope(sys); return s && s.n >= 10 ? t("more.bpSlope", { v: `${s.perDay > 0 ? "+" : "−"}${fmt(Math.abs(s.perDay * 30), lang)}` }) : few(present(sys).length, 10); })()} />
        <Row label={t("more.bpWeight")} value={s0 != null && s1 != null && w0 != null && w1 != null ? t("more.bpWeightV", { exp: fmt((w1 - w0) * 1.05, lang), act: fmt(s1 - s0, lang) }) : "—"} sub={t("more.bpWeightSub")} />
        {diff(t("more.l.sleepBp"), present(short.map((d) => bpSummary(days[d]).morning?.sys ?? null)), present(normal.map((d) => bpSummary(days[d]).morning?.sys ?? null)), "мм", (x) => fmt(x, lang, 0), "more.higher", "more.lower")}
        <Row label={t("more.bpEpisodes")} value={String(episodes)} sub={epHours.length ? t("more.bpEpHours", { h: [...new Set(epHours)].sort().join(", ") }) : undefined} />
        <Row label={t("more.bpShare")} value={(() => {
          const c = { ok: 0, elevated: 0, high: 0 };
          dates.forEach((d) => { const s = bpSummary(days[d]); [s.morning, s.evening].forEach((a) => { if (a) c[bpClass(a.sys, a.dia)]++; }); });
          const n = c.ok + c.elevated + c.high;
          return n ? `${Math.round((c.ok / n) * 100)}% · ${Math.round((c.elevated / n) * 100)}% · ${Math.round((c.high / n) * 100)}%` : "—";
        })()} sub={t("an.t.catsV")} />
      </Sec>,
    );
    const am = v("energyAm"), pm = v("energyPm");
    const flags = dates.flatMap((d) => days[d]?.flags ?? []);
    const flagCounts = [...new Set(flags)].map((f) => `${t(`flag.${f}` as MessageKey)} ×${flags.filter((x) => x === f).length}`);
    const painFree = streaks(all, all.map((d) => (hasEvent(days[d]) ? 0 : 1)), (x) => x === 1);
    const good = dates.filter((d) => (days[d]?.feel ?? 0) >= 4), bad = dates.filter((d) => days[d]?.feel != null && days[d]!.feel! <= 2);
    const prevSleep = (ds: string[]) => present(ds.map((d) => VALUE.sleep(days[d]))).map((h) => h * 60);
    const prevSteps = (ds: string[]) => present(ds.map((d) => days[next(d, -1)]?.steps ?? null));
    sections.push(
      <Sec key="feel" title={t("more.feelTitle")} c="habits">
        <Row label={t("more.energy2")} value={`${fmt(mean(present(am)), lang)} / ${fmt(mean(present(pm)), lang)}`} sub={t("more.energySub")} />
        <Row label={t("more.flags")} value={flags.length ? String(flags.length) : "0"} sub={flagCounts.join(" · ") || t("more.noFlags")} tone={flags.length ? "bad" : "good"} />
        <Row label={t("more.painFree")} value={t("an.t.days", { n: painFree.current })} sub={t("an.t.longest", { n: painFree.longest.length })} />
        {diff(t("more.l.goodSleep"), prevSleep(good), prevSleep(bad), t("an.u.min"), (x) => fmt(x, lang, 0), "more.longer", "more.shorter")}
        {diff(t("more.l.goodSteps"), prevSteps(good), prevSteps(bad), t("an.u.steps"), (x) => fmtInt(x, lang), "more.moreSteps", "more.fewerSteps")}
      </Sec>,
    );
    const diary = diaryRatings(diaryItems, dates);
    sections.push(
      <Sec key="diary" title={t("more.diary")} c="diary">
        <Row label={t("more.diaryAvg")} value={diary.avg == null ? "—" : `${fmt(diary.avg, lang)} / 10`} sub={diary.n ? t("more.diaryN", { n: diary.n }) : undefined} />
        {diary.best && <Row label={t("more.diaryBest")} value={`${diary.best.rating}/10`} sub={`${diary.best.event} · ${dl(diary.best.date)}`} tone="good" />}
        {diary.worst && <Row label={t("more.diaryWorst")} value={`${diary.worst.rating}/10`} sub={`${diary.worst.event} · ${dl(diary.worst.date)}`} tone="bad" />}
        {(() => {
          const r = spearman(dates.map((d) => diary.byDay.get(d) ?? null), v("sleep"));
          return <Row label={t("more.l.diarySleep")} value={r && r.sure ? t(`more.str.${linkStrength(r.rho)}` as MessageKey) : r ? t("more.noLink") : "—"} sub={r ? t("more.rho", { r: fmt(r.rho, lang, 2), n: r.n }) : few(diary.byDay.size, 21)} />;
        })()}
        {(() => {
          const r = spearman(dates.map((d) => diary.byDay.get(d) ?? null), v("steps"));
          return <Row label={t("more.l.diarySteps")} value={r && r.sure ? t(`more.str.${linkStrength(r.rho)}` as MessageKey) : r ? t("more.noLink") : "—"} sub={r ? t("more.rho", { r: fmt(r.rho, lang, 2), n: r.n }) : few(diary.byDay.size, 21)} />;
        })()}
      </Sec>,
    );
    // L11: every pair, only links that hold on these days.
    const PAIRS: [MetricId, MetricId, number][] = [
      ["steps", "sleep", 1], ["sleep", "steps", 0], ["sleep", "feel", 0], ["sleep", "energyAm", 0], ["steps", "feel", 0], ["active", "feel", 0],
      ["sleep", "pulse", 0], ["active", "pulse", 1], ["sleep", "bpSys", 0], ["steps", "bpSys", 1], ["pulse", "feel", 0], ["weight", "bpSys", 0],
    ];
    const rows = PAIRS.map(([a, b, lag]) => ({ a, b, lag, r: spearman(...lagged(days, dates, a, b, lag)) }))
      .filter((x) => x.r && x.r.sure && linkStrength(x.r.rho) !== "none")
      .sort((x, y) => Math.abs(y.r!.rho) - Math.abs(x.r!.rho));
    sections.push(
      <Sec key="table" title={t("more.table")} c="table">
        {rows.length ? rows.map((x) => (
          <Row key={x.a + x.b + x.lag} label={`${t(`more.m.${x.a}` as MessageKey)} → ${t(`more.m.${x.b}` as MessageKey)}${x.lag ? ` ${t("more.nextDay")}` : ""}`}
            value={`${t(`more.str.${linkStrength(x.r!.rho)}` as MessageKey)} ${x.r!.rho > 0 ? "↑↑" : "↑↓"}`} sub={t("more.rho", { r: fmt(x.r!.rho, lang, 2), n: x.r!.n })} />
        )) : <Row label={t("more.tableNone")} value="" sub={t("more.tableNoneSub")} />}
        <p className="status" style={{ margin: 0 }}>{t("more.tableHelp")}</p>
      </Sec>,
    );
  }

  return (
    <>
      <header className="page-head">
        <Link className="back" to="/more">{t("more.back")}</Link>
        <div className="head-line mhead" data-c={AREA_ICON[area][1]}><span className="card-ic"><Icon name={AREA_ICON[area][0]} /></span><h1>{t(`an.more.${area}` as MessageKey)}</h1></div>
        <div className="seg full" role="radiogroup" aria-label={t("an.period")}>
          {RANGES.map((r) => <button key={r} type="button" role="radio" aria-checked={range === r} className={range === r ? "on" : ""} onClick={() => setRange(r)}>{r ? t("more.days", { n: r === 365 ? t("an.span.year") : r }) : t("an.span.all")}</button>)}
        </div>
      </header>
      {!dates.some((d) => days[d]) ? <section className="block"><p className="empty">{t("an.noData")}</p></section> : sections}
    </>
  );
}

/** Diary ratings by day (the mean of that day's entries). */
function diaryRatings(items: DiaryItem[], dates: string[]) {
  const inRange = items.filter((x) => !x.deleted && x.rating != null && x.date >= dates[0] && x.date <= dates[dates.length - 1]);
  const byDay = new Map<string, number>();
  const groups = new Map<string, number[]>();
  inRange.forEach((x) => groups.set(x.date, [...(groups.get(x.date) ?? []), x.rating!]));
  groups.forEach((rs, d) => byDay.set(d, mean(rs)!));
  const sorted = [...inRange].sort((a, b) => a.rating! - b.rating!);
  return { avg: mean(inRange.map((x) => x.rating!)), n: inRange.length, best: sorted.at(-1), worst: sorted[0], byDay };
}

