import { num } from "./format";
import type { BpSlot, DayEntry, Flag, PainArea, StrengthItem, WalkIntensity, WeightCond } from "./types";
import { BP_SLOTS, EXERCISES, FLAGS, PAIN_AREAS } from "./types";

export interface SetRow { sets: string; reps: string; kg: string }
export interface CustomRow extends SetRow { key: number; name: string }
export interface BpRow { sys: string; dia: string; pulse: string }

/** Raw (string) state of the day form, mirrors the inputs one to one. */
export interface DayFormState {
  weight: string;
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

export function toFormState(d: DayEntry | undefined, defaultWalk: WalkIntensity): DayFormState {
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
    weight: s(d?.weight),
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
export function fromFormState(date: string, f: DayFormState, now = new Date()): DayEntry | null {
  const out: DayEntry = { date, updatedAt: now.toISOString() };
  const w = num(f.weight);
  if (w != null && w > 0) { out.weight = w; out.weightCond = f.weightCond; }
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
  const note = f.note.trim();
  if (note) out.note = note;
  const meaningful = Object.keys(out).some((k) => k !== "date" && k !== "updatedAt");
  return meaningful ? out : null;
}
