/**
 * Monday summary: last week (Mon–Sun) against the week before, in a few lines with numbers,
 * plus warning signals, milestones, an explained weight jump and a step-goal suggestion.
 * Texts are built by the caller from these facts, so this stays testable.
 */
import { change, datesBetween, mean, present, record, series, streaks, sum, trendLine } from "./analytics";
import { addDays, iso, mondayOf, parseIso } from "./date";
import { bpSummary } from "./stats";
import type { DaysMap, Settings } from "./types";

export type Fact =
  | { k: "steps"; avg: number; pct: number | null }
  | { k: "active"; min: number; goal: number }
  | { k: "weight"; d: number }
  | { k: "sleep"; avg: number; ok: number; n: number }
  | { k: "pulse"; avg: number; d: number | null }
  | { k: "bp"; sys: number; dia: number }
  | { k: "sig.stepsDrop"; pct: number }
  | { k: "sig.shortSleep" }
  | { k: "sig.weightUp"; d: number }
  | { k: "sig.pulse"; d: number }
  | { k: "sig.bp"; sys: number; dia: number }
  | { k: "win.stepRecord"; v: number; date: string }
  | { k: "win.streak"; n: number }
  | { k: "win.milestone"; pct: number }
  | { k: "win.who" }
  | { k: "jump"; date: string; d: number; causes: ("weekend" | "shortSleep" | "noSteps" | "spread")[] }
  | { k: "goalUp"; met: number; of: number; from: number; to: number };

export function weeklySummary(days: DaysMap, s: Settings, today = new Date()): { monday: string; week: [string, string]; facts: Fact[] } {
  const thisMon = mondayOf(today);
  const start = iso(addDays(thisMon, -7)), end = iso(addDays(thisMon, -1));
  const week = datesBetween(start, end), before = datesBetween(iso(addDays(thisMon, -14)), iso(addDays(thisMon, -8)));
  const all = Object.keys(days).filter((d) => d <= end).sort();
  const facts: Fact[] = [];
  const stepGoal = s.goals.find((g) => g.metric === "steps" && g.on)?.target ?? s.stepGoal ?? 7000;

  const st = present(series(days, "steps", week)), stPrev = present(series(days, "steps", before));
  if (st.length) facts.push({ k: "steps", avg: mean(st)!, pct: change(mean(st), mean(stPrev)) });
  const act = sum(present(series(days, "active", week))), actGoal = s.activeWeekGoal ?? 150;
  if (present(series(days, "active", week)).length) facts.push({ k: "active", min: act, goal: actGoal });
  const wAll = series(days, "weight", all), trend = trendLine(wAll);
  const tEnd = trend[all.indexOf(end)] ?? trend[all.length - 1], tStartIdx = all.findIndex((d) => d >= start) - 1;
  const tStart = tStartIdx >= 0 ? trend[tStartIdx] : null;
  if (tEnd != null && tStart != null) facts.push({ k: "weight", d: tEnd - tStart });
  const sl = present(series(days, "sleep", week));
  if (sl.length) facts.push({ k: "sleep", avg: mean(sl)!, ok: sl.filter((h) => h >= 7).length, n: sl.length });
  const hr = present(series(days, "pulse", week)), hrPrev = present(series(days, "pulse", before));
  if (hr.length) facts.push({ k: "pulse", avg: mean(hr)!, d: hrPrev.length ? mean(hr)! - mean(hrPrev)! : null });
  const bps = week.flatMap((d) => { const b = bpSummary(days[d]); return [b.morning, b.evening].filter((x) => x != null); });
  if (bps.length) facts.push({ k: "bp", sys: Math.round(mean(bps.map((b) => b.sys))!), dia: Math.round(mean(bps.map((b) => b.dia))!) });

  // Signals
  const base = present(series(days, "steps", datesBetween(iso(addDays(thisMon, -35)), iso(addDays(thisMon, -8)))));
  const drop = change(mean(st), mean(base));
  if (drop != null && drop <= -20 && st.length >= 4) facts.push({ k: "sig.stepsDrop", pct: drop });
  const sleepRun = streaks(week, series(days, "sleep", week), (h) => h < 6, end);
  if (sleepRun.longest.length >= 3) facts.push({ k: "sig.shortSleep" });
  if (tEnd != null && tStart != null && tEnd - tStart >= 1) facts.push({ k: "sig.weightUp", d: tEnd - tStart });
  const hrAll = series(days, "pulse", all), hrBase = mean(present(hrAll.slice(-32, -2)));
  const last2 = hrAll.slice(-2);
  if (hrBase != null && last2.length === 2 && last2.every((x) => x != null && x >= hrBase + 7)) facts.push({ k: "sig.pulse", d: last2[1]! - hrBase });
  const bpFact = facts.find((f) => f.k === "bp") as Extract<Fact, { k: "bp" }> | undefined;
  if (bpFact && (bpFact.sys >= 135 || bpFact.dia >= 85)) facts.push({ k: "sig.bp", sys: bpFact.sys, dia: bpFact.dia });

  // Milestones
  const stAll = series(days, "steps", all);
  const rec = record(all, stAll);
  if (rec && rec.date >= start) facts.push({ k: "win.stepRecord", v: rec.v, date: rec.date });
  const streak = streaks(all, stAll, (x) => x >= stepGoal, iso(today));
  if (streak.longest.end != null && streak.longest.end >= start && streak.longest.length >= 5) facts.push({ k: "win.streak", n: streak.longest.length });
  const first = present(wAll)[0];
  if (first && tStart != null && tEnd != null) {
    const crossed = [10, 5, 3].find((m) => (first - tEnd) / first >= m / 100 && (first - tStart) / first < m / 100);
    if (crossed) facts.push({ k: "win.milestone", pct: crossed });
  }
  if (act >= 150) {
    const earlier = Array.from({ length: 8 }, (_, k) => sum(present(series(days, "active", datesBetween(iso(addDays(thisMon, -14 - 7 * k)), iso(addDays(thisMon, -8 - 7 * k)))))));
    if (earlier.every((m) => m < 150)) facts.push({ k: "win.who" });
  }

  // A weight jump: a morning at least 1 kg above the trend, with possible causes from the data.
  week.forEach((d) => {
    const i = all.indexOf(d);
    const w = wAll[i], tr = i > 0 ? trend[i - 1] : null;
    if (w == null || tr == null || w - tr < 1) return;
    const prev = iso(addDays(parseIso(d), -1));
    const causes: ("weekend" | "shortSleep" | "noSteps" | "spread")[] = [];
    if ([0, 1].includes(parseIso(d).getDay())) causes.push("weekend");
    if ((days[d]?.sleepMin ?? 999) < 390) causes.push("shortSleep");
    if (days[prev]?.steps != null && days[prev]!.steps! < 3000) causes.push("noSteps");
    if (!causes.length) causes.push("spread");
    if (!facts.some((f) => f.k === "jump")) facts.push({ k: "jump", date: d, d: w - tr, causes });
  });

  // Step goal met on 80%+ of the last 14 days: suggest +500.
  const two = series(days, "steps", datesBetween(iso(addDays(thisMon, -14)), end));
  const met = present(two).filter((x) => x >= stepGoal).length;
  if (present(two).length >= 10 && met / 14 >= 0.8) facts.push({ k: "goalUp", met, of: 14, from: stepGoal, to: stepGoal + 500 });

  return { monday: iso(thisMon), week: [start, end], facts };
}
