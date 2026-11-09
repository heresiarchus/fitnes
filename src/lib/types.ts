export type WeightCond = "morning" | "other";
export type WalkIntensity = "light" | "moderate";
export type PainArea = "foot" | "back" | "shoulder";
export type Flag = "chest" | "dizzy" | "breath" | "palp" | "foot";
export type BpSlot = "m1" | "m2" | "e1" | "e2";
export type Phase = "1" | "2" | "3";
export type Lang = "uk" | "en";
export type Theme = "auto" | "light" | "dark";

export interface StrengthItem {
  /** Preset exercise id; absent for custom exercises. */
  id?: string;
  /** Name for custom exercises (presets are translated by id). */
  name?: string;
  sets: number;
  reps: number;
  kg?: number;
}

export interface BpReading {
  sys: number | null;
  dia: number | null;
  pulse: number | null;
}

export interface DayEntry {
  date: string; // YYYY-MM-DD
  weight?: number;
  weightCond?: WeightCond;
  steps?: number;
  walkMin?: number;
  walkIntensity?: WalkIntensity;
  cardioMin?: number;
  cardioWhat?: string;
  strength?: StrengthItem[];
  bp?: Partial<Record<BpSlot, BpReading>>;
  pain?: Partial<Record<PainArea, number>>;
  flags?: Flag[];
  note?: string;
  updatedAt: string;
}

export interface Settings {
  phase: Phase;
  /** First day of phase 1; drives the weekly walking target ramp and BP week. */
  startDate: string;
  /** Optional daily steps goal shown on charts; null = no goal line. */
  stepGoal: number | null;
  lang: Lang;
  theme: Theme;
}

export type DaysMap = Record<string, DayEntry>;

export const PAIN_AREAS: PainArea[] = ["foot", "back", "shoulder"];
export const FLAGS: Flag[] = ["chest", "dizzy", "breath", "palp", "foot"];
export const HEART_FLAGS: Flag[] = ["chest", "dizzy", "breath", "palp"];
export const BP_SLOTS: BpSlot[] = ["m1", "m2", "e1", "e2"];
export const EXERCISES = ["chair", "bridge", "press", "row", "curl", "triceps", "deadbug", "crunch"] as const;
export type ExerciseId = (typeof EXERCISES)[number];
