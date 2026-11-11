import { num } from "./format";
import { movementDetail } from "./habits";
import type { BpSlot, DayEntry, DayType, Flag, Habit, HabitStatus, PainArea, StrengthItem, WalkIntensity, WeightCond } from "./types";
import { BP_SLOTS, EXERCISES, FLAGS, PAIN_AREAS } from "./types";

export interface SetRow { sets: string; reps: string; kg: string }
export interface CustomRow extends SetRow { key: number; name: string }
export interface BpRow { sys: string; dia: string; pulse: string }
export interface HabitRow { status: HabitStatus | ""; detail: string; reason: string; extra: Record<string, string> }
const yn = (v: boolean | undefined): "" | "yes" | "no" => (v == null ? "" : v ? "yes" : "no");

/** Raw (string) state of the day form, mirrors the inputs one to one. */
export interface DayFormState {
  weight: string;
  /**
   * "pending": the drum shows the previous weight but nothing is decided yet;
   * "yes": save the weight; "no": the user said they did not weigh.
   */
  weightChoice: "pending" | "yes" | "no";
  /** "No warning signs" was confirmed. */
  ok: boolean;
  feel: string;
  positive: string;
  weightTime: string;
  habits: Record<string, HabitRow>;
  dayType: DayType | "";
  partnerHere: "" | "yes" | "no";
  nightEpisode: "" | "yes" | "no";
  episodeNote: string;
  energyAm: string;
  energyPm: string;
  weightCond: WeightCond;
  steps: string;
  walk: string;
  walkInt: WalkIntensity;
  cardio: string;
  cardioWhat: string;
  ex: Record<string, SetRow>;
  custom: CustomRow[];
  bp: Record<BpSlot, BpRow>;
  pain: Record<PainArea, string>;
  flags: Flag[];
  note: string;
}

const s = (v: number | null | undefined) => (v == null ? "" : String(v));
const emptySet = (): SetRow => ({ sets: "", reps: "", kg: "" });

export function toFormState(d: DayEntry | undefined, defaultWalk: WalkIntensity, prevWeight: number | null = null, habits: Habit[] = []): DayFormState {
  const habitRows: Record<string, HabitRow> = {};
  for (const h of habits) {
    const m = d?.habitLog?.find((x) => x.habitId === h.id);
    habitRows[h.id] = { status: m?.status ?? "", detail: m?.detail ?? "", reason: m?.reasonIfNo ?? "", extra: { ...(m?.extra ?? {}) } };
  }
  const ex: Record<string, SetRow> = {};
  for (const id of EXERCISES) ex[id] = emptySet();
  const custom: CustomRow[] = [];
  (d?.strength ?? []).forEach((it, i) => {
    const row = { sets: s(it.sets), reps: s(it.reps), kg: s(it.kg) };
    if (it.id && it.id in ex) ex[it.id] = row;
    else custom.push({ key: i + 1, name: it.name ?? "", ...row });
  });
  const bp = {} as Record<BpSlot, BpRow>;
  for (const slot of BP_SLOTS) {
    const v = d?.bp?.[slot];
    bp[slot] = { sys: s(v?.sys), dia: s(v?.dia), pulse: s(v?.pulse) };
  }
  const pain = {} as Record<PainArea, string>;
  for (const a of PAIN_AREAS) pain[a] = s(d?.pain?.[a]);
  return {
    weight: d?.weight != null ? s(d.weight) : s(prevWeight),
    weightChoice: d?.weight != null ? "yes" : d?.noWeight ? "no" : "pending",
    ok: !!d?.ok,
    feel: s(d?.feel),
    positive: d?.positive ?? "",
    weightTime: d?.weightTime ?? "",
    habits: habitRows,
    dayType: d?.dayType ?? "",
    partnerHere: yn(d?.partnerHere),
    nightEpisode: yn(d?.nightEpisode),
    episodeNote: d?.episodeNote ?? "",
    energyAm: s(d?.energyAm),
    energyPm: s(d?.energyPm),
    weightCond: d?.weightCond ?? "morning",
    steps: s(d?.steps),
    walk: s(d?.walkMin),
    walkInt: d?.walkIntensity ?? defaultWalk,
    cardio: s(d?.cardioMin),
    cardioWhat: d?.cardioWhat ?? "",
    ex,
    custom,
    bp,
    pain,
    flags: (d?.flags ?? []).filter((f) => FLAGS.includes(f)),
    note: d?.note ?? "",
  };
}

function setItem(row: SetRow): Omit<StrengthItem, "id" | "name"> | null {
  const reps = num(row.reps);
  if (reps == null || reps <= 0) return null;
  const sets = num(row.sets);
  const kg = num(row.kg);
  const item: Omit<StrengthItem, "id" | "name"> = { sets: sets != null && sets > 0 ? Math.round(sets) : 1, reps: Math.round(reps) };
  if (kg != null && kg >= 0) item.kg = kg;
  return item;
}

/** Converts form state to an entry. Returns null when nothing meaningful was entered. */
export interface FromOptions {
  habits?: Habit[];
  /** Fields the form does not edit; carried over from the saved entry. */
  keep?: DayEntry;
  labels?: { walk: string; strength: string; min: string; auto: string };
}

export function fromFormState(date: string, f: DayFormState, now = new Date(), opt: FromOptions = {}): DayEntry | null {
  const out: DayEntry = { date, updatedAt: now.toISOString() };
  const w = num(f.weight);
  if (f.weightChoice === "yes" && w != null && w > 0) {
    out.weight = w; out.weightCond = f.weightCond;
    if (f.weightTime) out.weightTime = f.weightTime;
    if (opt.keep?.weightOrigin && opt.keep.weight === w) out.weightOrigin = opt.keep.weightOrigin;
  }
  else if (f.weightChoice === "no") out.noWeight = true;
  const steps = num(f.steps);
  if (steps != null && steps >= 0) out.steps = Math.round(steps);
  const walk = num(f.walk);
  if (walk != null && walk >= 0) { out.walkMin = Math.round(walk); out.walkIntensity = f.walkInt; }
  const cardio = num(f.cardio);
  if (cardio != null && cardio >= 0) {
    out.cardioMin = Math.round(cardio);
    const what = f.cardioWhat.trim();
    if (what) out.cardioWhat = what;
  }
  const strength: StrengthItem[] = [];
  for (const id of EXERCISES) {
    const it = setItem(f.ex[id] ?? emptySet());
    if (it) strength.push({ id, ...it });
  }
  for (const c of f.custom) {
    const name = c.name.trim();
    const it = setItem(c);
    if (name && it) strength.push({ name, ...it });
  }
  if (strength.length) out.strength = strength;
  const bp: DayEntry["bp"] = {};
  for (const slot of BP_SLOTS) {
    const r = f.bp[slot];
    const sys = num(r.sys), dia = num(r.dia), pulse = num(r.pulse);
    if (sys != null || dia != null || pulse != null) bp[slot] = { sys, dia, pulse };
  }
  if (Object.keys(bp).length) out.bp = bp;
  const pain: DayEntry["pain"] = {};
  for (const a of PAIN_AREAS) {
    const v = num(f.pain[a]);
    if (v != null) pain[a] = Math.max(0, Math.min(10, Math.round(v)));
  }
  if (Object.keys(pain).length) out.pain = pain;
  if (f.flags.length) out.flags = FLAGS.filter((x) => f.flags.includes(x));
  else if (f.ok) out.ok = true;
  const feel = num(f.feel);
  if (feel != null && feel >= 1 && feel <= 5) out.feel = Math.round(feel);
  const positive = f.positive.trim();
  if (positive) out.positive = positive;
  const note = f.note.trim();
  if (note) out.note = note;
  if (opt.keep?.bpEpisodes?.length) out.bpEpisodes = opt.keep.bpEpisodes;
  if (f.dayType) out.dayType = f.dayType;
  if (f.partnerHere) out.partnerHere = f.partnerHere === "yes";
  if (f.nightEpisode) {
    out.nightEpisode = f.nightEpisode === "yes";
    const en = f.episodeNote.trim();
    if (out.nightEpisode && en) out.episodeNote = en;
  }
  for (const k of ["energyAm", "energyPm"] as const) {
    const v = num(f[k]);
    if (v != null && v >= 1 && v <= 5) out[k] = Math.round(v);
  }
  const habitLog: NonNullable<DayEntry["habitLog"]> = [];
  for (const h of opt.habits ?? []) {
    const row = f.habits[h.id];
    if (row?.status) {
      const mark: NonNullable<DayEntry["habitLog"]>[number] = { habitId: h.id, status: row.status };
      const detail = row.detail.trim(), reason = row.reason.trim();
      if (detail) mark.detail = detail;
      if (row.status === "no" && reason) mark.reasonIfNo = reason;
      const extra = Object.fromEntries(Object.entries(row.extra).filter(([, v]) => v));
      if (Object.keys(extra).length) mark.extra = extra;
      habitLog.push(mark);
    } else if (h.autoFrom === "movement" && opt.labels) {
      // Movement logged the usual way answers the habit; don't ask twice.
      const detail = movementDetail(out, opt.labels);
      if (detail) habitLog.push({ habitId: h.id, status: "done", detail: `${detail} (${opt.labels.auto})` });
    }
  }
  // Marks for habits that are not on this form (e.g. turned off later) are kept.
  const shown = new Set((opt.habits ?? []).map((h) => h.id));
  for (const m of opt.keep?.habitLog ?? []) if (!shown.has(m.habitId)) habitLog.push(m);
  if (habitLog.length) out.habitLog = habitLog;
  const meaningful = Object.keys(out).some((k) => k !== "date" && k !== "updatedAt");
  return meaningful ? out : null;
}

export type MissingField = "weight" | "feeling";

/** Required answers that are still missing; each takes one tap to give. */
export function missingRequired(f: DayFormState): MissingField[] {
  const out: MissingField[] = [];
  if (f.weightChoice === "pending") out.push("weight");
  // Answered by the 1–5 rating; older entries answered it with "all good" or a warning sign.
  if (!f.feel && !f.ok && !f.flags.length) out.push("feeling");
  return out;
}
