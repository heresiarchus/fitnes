import type { TFn } from "../i18n";
import type { DayEntry } from "./types";
import { BP_SLOTS, PAIN_AREAS } from "./types";

const cell = (v: unknown): string => {
  if (v == null) return "";
  const s = String(v);
  return /[",;\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export const CSV_COLUMNS = [
  "date", "weight", "weight_cond", "steps", "walk_min", "walk_intensity", "cardio_min", "cardio_what",
  "strength", ...PAIN_AREAS.map((a) => "pain_" + a), ...BP_SLOTS.map((s) => "bp_" + s), "flags", "note",
  "weight_time", "day_type", "partner_here", "night_episode", "energy_am", "energy_pm", "habits", "feel", "positive",
];

export function daysToCsv(days: DayEntry[], t: TFn): string {
  const rows = [...days].sort((a, b) => a.date.localeCompare(b.date)).map((d) => [
    d.date, d.weight, d.weightCond, d.steps, d.walkMin, d.walkIntensity, d.cardioMin, d.cardioWhat,
    (d.strength ?? []).map((e) => (e.id ? t(("ex." + e.id) as never) : e.name) + " " + e.sets + "x" + e.reps + (e.kg != null ? "@" + e.kg : "")).join("; "),
    ...PAIN_AREAS.map((a) => d.pain?.[a]),
    ...BP_SLOTS.map((s) => {
      const v = d.bp?.[s];
      return v ? (v.sys ?? "") + "/" + (v.dia ?? "") + (v.pulse != null ? " p" + v.pulse : "") : "";
    }),
    (d.flags ?? []).join(" "),
    d.note,
    d.weightTime, d.dayType, d.partnerHere == null ? "" : d.partnerHere ? "yes" : "no", d.nightEpisode == null ? "" : d.nightEpisode ? "yes" : "no",
    d.energyAm, d.energyPm,
    (d.habitLog ?? []).map((m) => m.habitId + "=" + m.status + (m.reasonIfNo ? " (" + m.reasonIfNo + ")" : "")).join("; "),
    d.feel, d.positive,
  ]);
  // BOM so Excel opens UTF-8 (Cyrillic) correctly.
  return "﻿" + [CSV_COLUMNS, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
