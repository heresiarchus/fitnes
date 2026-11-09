import { addDays, daysBetween, iso, mondayOf, parseIso } from "./date";
import type { DayEntry, DaysMap, Flag, PainArea, Phase } from "./types";
import { PAIN_AREAS } from "./types";

export const PHASES: Record<Phase, { strength: number; walk?: [number, number] }> = {
  "1": { strength: 2 },
  "2": { strength: 3, walk: [150, 150] },
  "3": { strength: 3, walk: [225, 250] },
};

export function morningWeight(d: DayEntry | undefined): number | null {
  if (!d || d.weight == null) return null;
  return (d.weightCond ?? "morning") === "morning" ? d.weight : null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export interface PeriodStats {
  days: number;
  logged: number;
  weights: number[];
  avgWeight: number | null;
  minWeight: number | null;
  maxWeight: number | null;
  steps: number[];
  avgSteps: number | null;
  totalSteps: number;
  walk: number;
  walkLight: number;
  walkMod: number;
  cardio: number;
  strengthDays: number;
  painMax: Record<PainArea, number | null>;
  flags: { date: string; flag: Flag }[];
  notes: { date: string; note: string }[];
}

export function periodStats(days: DaysMap, dates: string[]): PeriodStats {
  const s: PeriodStats = {
    days: dates.length, logged: 0, weights: [], avgWeight: null, minWeight: null, maxWeight: null,
    steps: [], avgSteps: null, totalSteps: 0, walk: 0, walkLight: 0, walkMod: 0, cardio: 0,
    strengthDays: 0, painMax: { foot: null, back: null, shoulder: null }, flags: [], notes: [],
  };
  for (const d of dates) {
    const x = days[d];
    if (!x) continue;
    s.logged += 1;
    const w = morningWeight(x);
    if (w != null) s.weights.push(w);
    if (x.steps != null) { s.steps.push(x.steps); s.totalSteps += x.steps; }
    if (x.walkMin) {
      s.walk += x.walkMin;
      if (x.walkIntensity === "moderate") s.walkMod += x.walkMin; else s.walkLight += x.walkMin;
    }
    if (x.cardioMin) s.cardio += x.cardioMin;
    if (x.strength?.length) s.strengthDays += 1;
    for (const k of PAIN_AREAS) {
      const p = x.pain?.[k];
      if (p != null) s.painMax[k] = Math.max(s.painMax[k] ?? 0, p);
    }
    for (const f of x.flags ?? []) s.flags.push({ date: d, flag: f });
    if (x.note) s.notes.push({ date: d, note: x.note });
  }
  s.avgWeight = mean(s.weights);
  s.minWeight = s.weights.length ? Math.min(...s.weights) : null;
  s.maxWeight = s.weights.length ? Math.max(...s.weights) : null;
  s.avgSteps = mean(s.steps);
  return s;
}

/**
 * Weekly walking + cardio target in minutes [min, max].
 * Phase 1 ramps from 10–15 min/day in week 1 by +5 min/day per week, capped at week 4.
 */
export function walkTarget(phase: Phase, mondayIso: string, startIso: string): [number, number] {
  const fixed = PHASES[phase].walk;
  if (fixed) return fixed;
  const fromStart = daysBetween(iso(mondayOf(parseIso(startIso))), mondayIso);
  const w = Math.min(4, Math.max(1, Math.floor(fromStart / 7) + 1));
  return [(10 + 5 * (w - 1)) * 7, (15 + 5 * (w - 1)) * 7];
}

/** Mean of morning weights over the `window` days ending at `dateIso`. */
export function rollingAvg(days: DaysMap, dateIso: string, window = 7): number | null {
  const vals: number[] = [];
  const end = parseIso(dateIso);
  for (let i = 0; i < window; i++) {
    const w = morningWeight(days[iso(addDays(end, -i))]);
    if (w != null) vals.push(w);
  }
  return mean(vals);
}

export interface WeightPoint { i: number; date: string; v: number; avg: number }

export function weightSeries(days: DaysMap, dates: string[]): WeightPoint[] {
  const out: WeightPoint[] = [];
  dates.forEach((date, i) => {
    const v = morningWeight(days[date]);
    if (v != null) out.push({ i, date, v, avg: rollingAvg(days, date) ?? v });
  });
  return out;
}

/** Most recent strength entry for an exercise strictly before `before`. */
export function lastStrengthFor(days: DaysMap, exId: string, before: string) {
  const dates = Object.keys(days).filter((d) => d < before).sort().reverse();
  for (const d of dates) {
    const hit = days[d].strength?.find((s) => s.id === exId && s.reps);
    if (hit) return hit;
  }
  return null;
}

/** Latest recorded weight strictly before `before` (any time of day), with its date. */
export function previousWeight(days: DaysMap, before: string): { date: string; weight: number } | null {
  const dates = Object.keys(days).filter((d) => d < before && days[d].weight != null).sort();
  const d = dates[dates.length - 1];
  return d ? { date: d, weight: days[d].weight! } : null;
}

/** Latest day before `before` that has a strength session. */
export function previousWorkout(days: DaysMap, before: string): DayEntry | null {
  const dates = Object.keys(days).filter((d) => d < before && days[d].strength?.length).sort();
  return dates.length ? days[dates[dates.length - 1]] : null;
}

/** Latest blood-pressure readings before `before`, per slot (falls back to any slot). */
export function previousBp(days: DaysMap, before: string): DayEntry["bp"] | null {
  const dates = Object.keys(days).filter((d) => d < before && days[d].bp).sort();
  return dates.length ? days[dates[dates.length - 1]].bp! : null;
}
