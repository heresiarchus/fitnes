export type WeightCond = "morning" | "other";
export type WalkIntensity = "light" | "moderate";
export type PainArea = "foot" | "back" | "shoulder";
export type Flag = "chest" | "dizzy" | "breath" | "palp" | "foot";
export type BpSlot = "m1" | "m2" | "e1" | "e2";
export type Phase = "1" | "2" | "3";
export type Lang = "uk" | "en";
export type Theme = "auto" | "light" | "dark";
export type Palette = "mint" | "steel" | "sand" | "graphite" | "gold" | "lavender" | "forest" | "ocean" | "rose" | "coral" | "olive" | "indigo";
export const PALETTES: Palette[] = ["mint", "gold", "steel", "sand", "lavender", "forest", "ocean", "rose", "coral", "olive", "indigo", "graphite"];

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
  /** Local time of the weigh-in, HH:MM. */
  weightTime?: string;
  /** Where an imported historical weight came from. */
  weightOrigin?: string;
  /** Readings taken during a night episode; kept apart from the morning/evening series. */
  bpEpisodes?: BpEpisode[];
  habitLog?: HabitMark[];
  dayType?: DayType;
  partnerHere?: boolean;
  nightEpisode?: boolean;
  episodeNote?: string;
  /** Night sleep ending on this date, from the watch. */
  sleepMin?: number;
  sleepStart?: string;
  sleepEnd?: string;
  /** Active calories and distance for the day, from the watch. */
  activeKcal?: number;
  distanceKm?: number;
  /** Daytime sleep, minutes (kept apart from the night). */
  napMin?: number;
  restingHr?: number;
  /** How the day felt overall, 1 (bad) – 5 (great). */
  feel?: number;
  /** One good thing about the day, in the user's words. */
  positive?: string;
  /** Energy 1–5, morning and evening. */
  energyAm?: number;
  energyPm?: number;
  /** User explicitly said they did not weigh that day. */
  noWeight?: true;
  /** User confirmed there were no warning signs. */
  ok?: true;
  updatedAt: string;
  /** Tombstone: the day was deleted (kept so the deletion syncs to other devices). */
  deleted?: true;
}

export interface Settings {
  phase: Phase;
  /** First day of phase 1; drives the weekly walking target ramp and BP week. */
  startDate: string;
  /** Optional daily steps goal shown on charts; null = no goal line. */
  stepGoal: number | null;
  lang: Lang;
  theme: Theme;
  palette: Palette;
  /** Set by the phone once Samsung Health (via Health Connect) is connected; synced to other devices. */
  healthLinked: boolean;
  /** Bumped when reminder defaults change, to migrate saved settings once. */
  remindersV?: number;
  /** Which fields are filled from Samsung Health (true) or typed by hand (false). */
  sources: Record<SourceKey, boolean>;
  /** Blood pressure at or above this is highlighted in the calendar. */
  bpMark: { sys: number; dia: number };
  /** Daily goals, like the activity targets in Samsung Health. */
  goals: { metric: GoalMetric; target: number; on: boolean }[];
  /** Habit catalogue: habits are data, new ones are added in settings. */
  habits: Habit[];
  /** Hide weight on the home screen. */
  hideWeight: boolean;
  /** Daily reminders (shown by the Android app). */
  reminders: Reminders;
  updatedAt: string;
}

export type ReminderKind = "weigh" | "evening" | "bp" | "review";
export const REMINDER_KINDS: ReminderKind[] = ["weigh", "evening", "bp", "review"];
export interface ReminderCfg { on: boolean; time: string; /** Evening check: last repeat (may be after midnight) and minutes between repeats. */ until?: string; every?: number }
export type Reminders = Record<ReminderKind, ReminderCfg>;

export type SourceKey = "steps" | "exercise" | "weight" | "bp" | "sleep";
export const SOURCE_KEYS: SourceKey[] = ["steps", "exercise", "weight", "bp", "sleep"];

export interface SheetsConfig {
  /** Address of the Apps Script web app bound to the user's Google Sheet. */
  url: string;
  lastSentAt?: string;
  lastError?: string;
}

export interface SyncConfig {
  provider: "github";
  /** "owner/name" of a private repository. */
  repo: string;
  token: string;
  path: string;
  lastSyncAt?: string;
}

export type DaysMap = Record<string, DayEntry>;

export const PAIN_AREAS: PainArea[] = ["foot", "back", "shoulder"];
export const FLAGS: Flag[] = ["chest", "dizzy", "breath", "palp", "foot"];
export const HEART_FLAGS: Flag[] = ["chest", "dizzy", "breath", "palp"];
export const BP_SLOTS: BpSlot[] = ["m1", "m2", "e1", "e2"];
export const EXERCISES = ["chair", "bridge", "press", "row", "curl", "triceps", "deadbug", "crunch"] as const;
export type ExerciseId = (typeof EXERCISES)[number];

export interface BpEpisode { time: string; sys: number | null; dia: number | null; pulse: number | null }

export type DayType = "normal" | "duty" | "postduty" | "off";
export const DAY_TYPES: DayType[] = ["normal", "duty", "postduty", "off"];

export type HabitStatus = "done" | "min" | "rest" | "no";
export const HABIT_STATUSES: HabitStatus[] = ["done", "min", "rest", "no"];

export interface HabitField { key: string; label: string; options: string[] }

export interface Habit {
  id: string;
  title: string;
  /** The smallest version that still counts, for a bad day. */
  minVersion: string;
  enabled: boolean;
  activeFrom?: string;
  activeTo?: string;
  /** Repeating reminder window; null = no reminder. */
  remind: { from: string; until: string; everyMin: number } | null;
  /** Extra one-tap details asked once the habit is marked. */
  fields?: HabitField[];
  /** "movement": marked done automatically when a walk or strength session is logged. */
  autoFrom?: "movement";
  /** How the answer is given; absent = the four statuses. */
  measure?: HabitMeasure;
}

/**
 * Answer types from the habit builder:
 * status — done / minimum / rest / no; yesno — two buttons; count — − / + stepper;
 * slider; drum — scroll wheel; scale — 1…N buttons; choice — one of the user's options.
 */
export type MeasureType = "status" | "yesno" | "count" | "slider" | "drum" | "scale" | "choice";
export const MEASURE_TYPES: MeasureType[] = ["status", "yesno", "count", "slider", "drum", "scale", "choice"];
export interface HabitMeasure {
  type: MeasureType;
  /** What is counted: раз, хв, км, склянок… */
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  /** For numbers: at or above → done, above zero → minimum. */
  target?: number;
}

export interface HabitMark {
  habitId: string;
  status: HabitStatus;
  /** The answer itself for habits with a measure (number, scale point or chosen option). */
  value?: number | string;
  detail?: string;
  reasonIfNo?: string;
  extra?: Record<string, string>;
}

/** Records other than days; synced one by one by id. */
interface ItemBase { id: string; updatedAt: string; deleted?: true }
export interface TaskItem extends ItemBase { kind: "task"; title: string; dueDate?: string; doneDate?: string; note?: string }
export interface DiaryItem extends ItemBase { kind: "diary"; date: string; event: string; /** How good it was, 0–10. */ rating?: number; feeling?: string; tag?: string; share: boolean; createdAt: string }
export interface MonthItem extends ItemBase { kind: "hmonth"; month: string; tracker: string; runKm: number; walkKm: number; bikeKm: number; runs: number }
/** One workout from the watch, stored as-is so it can be listed and reported. */
export interface WorkoutItem extends ItemBase {
  kind: "workout"; date: string; type: string; start: string; end: string; durationMin: number;
  distanceKm?: number; avgHr?: number; maxHr?: number; kcal?: number; source?: string;
}
export type Item = TaskItem | DiaryItem | MonthItem | WorkoutItem;

export const DIARY_TAGS = ["move", "food", "work", "study", "people", "other"] as const;

/** A field comes from the watch only when Samsung Health is actually connected and the user chose it. */
export const fromWatch = (s: Pick<Settings, "healthLinked" | "sources">, k: SourceKey) => s.healthLinked && s.sources[k];

export type GoalMetric = "steps" | "activeKcal" | "activeMin" | "distanceKm" | "sleepH";
