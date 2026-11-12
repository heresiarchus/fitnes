import type { DayEntry, GoalMetric, Settings } from "./types";

export interface GoalDef { metric: GoalMetric; unit: string; step: number; max: number; def: number }

/** Metrics a goal can be set for. "Active time" is walking plus other cardio, from the watch or typed in. */
export const GOAL_DEFS: GoalDef[] = [
  { metric: "steps", unit: "", step: 500, max: 50000, def: 6000 },
  { metric: "activeKcal", unit: "ккал", step: 50, max: 5000, def: 500 },
  { metric: "activeMin", unit: "хв", step: 5, max: 600, def: 90 },
  { metric: "distanceKm", unit: "км", step: 0.5, max: 50, def: 5 },
  { metric: "sleepH", unit: "год", step: 0.5, max: 14, def: 7 },
];

export function goalValue(metric: GoalMetric, d: DayEntry | undefined): number | null {
  if (!d) return null;
  switch (metric) {
    case "steps": return d.steps ?? null;
    case "activeKcal": return d.activeKcal ?? null;
    case "activeMin": return d.walkMin != null || d.cardioMin != null ? (d.walkMin ?? 0) + (d.cardioMin ?? 0) : null;
    case "distanceKm": return d.distanceKm ?? null;
    case "sleepH": return d.sleepMin != null ? Math.round((d.sleepMin / 60) * 10) / 10 : null;
  }
}

export interface GoalProgress { metric: GoalMetric; value: number | null; target: number; pct: number; done: boolean }

/** Enabled goals with today's progress (0–100, capped). */
export function goalProgress(s: Settings, d: DayEntry | undefined): GoalProgress[] {
  return s.goals.filter((g) => g.on && g.target > 0).map((g) => {
    const value = goalValue(g.metric, d);
    const pct = value == null ? 0 : Math.min(100, Math.round((value / g.target) * 100));
    return { metric: g.metric, value, target: g.target, pct, done: value != null && value >= g.target };
  });
}

export const DEFAULT_GOALS: Settings["goals"] = [
  { metric: "steps", target: 6000, on: true },
  { metric: "activeKcal", target: 500, on: true },
  { metric: "activeMin", target: 90, on: true },
  { metric: "distanceKm", target: 5, on: false },
  { metric: "sleepH", target: 7, on: false },
];
