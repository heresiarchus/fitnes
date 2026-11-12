import { addDays, iso } from "./date";
import type { DayEntry, DiaryItem, Habit, Item, MonthItem, TaskItem, WorkoutItem } from "./types";
import { BP_SLOTS } from "./types";

type Cell = string | number;
export interface SheetTable { header: string[]; rows: Cell[][]; /** 1-based columns kept as plain text. */ textCols: number[] }
export interface SheetsPayload { format: "fitnes-sheets"; version: 1; sentAt: string; sheets: Record<string, SheetTable> }

const yn = (v: boolean | undefined): Cell => (v == null ? "" : v ? "yes" : "no");
const c = (v: string | number | null | undefined): Cell => (v == null ? "" : v);

/** Builds a table; columns named in `text` are marked so the sheet keeps them as text. */
function table(header: string[], text: string[], rows: Cell[][]): SheetTable {
  return { header, rows, textCols: text.map((h) => header.indexOf(h) + 1).filter((i) => i > 0) };
}

/**
 * Everything the reporting sheet needs, one table per sheet.
 * Rules: latin column names, fixed order (new columns go to the right),
 * dates YYYY-MM-DD, times HH:MM, numbers as numbers, empty value = empty cell.
 * Diary text is included only for entries the user chose to share.
 */
/** "Дні" keeps the last 90 days; older days go to "Дні-архів". */
export const RECENT_DAYS = 90;

export function buildSheets(days: DayEntry[], items: Item[], habits: Habit[], now = new Date()): SheetsPayload {
  // Newest first everywhere, so a reader that sees only the first rows sees the recent ones.
  const live = days.filter((d) => !d.deleted).sort((a, b) => b.date.localeCompare(a.date));
  const recentFrom = iso(addDays(now, -(RECENT_DAYS - 1)));
  const liveItems = items.filter((i) => !i.deleted);

  // The day's "good thing" is diary text: it leaves the device only if that diary entry is shared.
  const sharedPositive = new Set(liveItems.filter((i) => i.kind === "diary" && i.share && i.id.startsWith("dd-")).map((i) => i.id.slice(3)));
  const dayRows = live.map((d): Cell[] => [
    d.date, c(d.weight), c(d.weightCond), c(d.weightTime), c(d.steps), c(d.walkMin), c(d.walkIntensity), c(d.cardioMin), c(d.cardioWhat),
    c(d.pain?.foot), c(d.pain?.back), c(d.pain?.shoulder), (d.flags ?? []).join(" "), c(d.feel), sharedPositive.has(d.date) ? c(d.positive) : "", c(d.note),
    c(d.dayType), yn(d.partnerHere), yn(d.nightEpisode), c(d.episodeNote), c(d.energyAm), c(d.energyPm), d.noWeight ? "yes" : "", d.updatedAt,
    c(d.sleepMin), c(d.sleepStart), c(d.sleepEnd), c(d.restingHr), c(d.napMin),
  ]);

  const strength: Cell[][] = [];
  const bp: Cell[][] = [];
  const habitRows: Cell[][] = [];
  const extraKeys = [...new Set(habits.flatMap((h) => (h.fields ?? []).map((f) => f.key)))];
  for (const d of live) {
    for (const e of d.strength ?? []) strength.push([d.date, e.id ?? e.name ?? "", e.sets, e.reps, c(e.kg)]);
    for (const slot of BP_SLOTS) {
      const v = d.bp?.[slot];
      if (v) bp.push([d.date, slot, "", c(v.sys), c(v.dia), c(v.pulse), ""]);
    }
    for (const v of d.bpEpisodes ?? []) bp.push([d.date, "", v.time, c(v.sys), c(v.dia), c(v.pulse), "yes"]);
    for (const m of d.habitLog ?? []) {
      const unit = habits.find((h) => h.id === m.habitId)?.measure?.unit;
      habitRows.push([d.date, m.habitId, m.status, c(m.detail), c(m.reasonIfNo), ...extraKeys.map((k) => c(m.extra?.[k])), c(m.value), c(unit)]);
    }
  }

  const tasks = liveItems.filter((i): i is TaskItem => i.kind === "task").sort((a, b) => (b.dueDate ?? "").localeCompare(a.dueDate ?? "") || b.id.localeCompare(a.id));
  const diary = liveItems.filter((i): i is DiaryItem => i.kind === "diary").sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const months = liveItems.filter((i): i is MonthItem => i.kind === "hmonth").sort((a, b) => b.month.localeCompare(a.month));
  const workouts = liveItems.filter((i): i is WorkoutItem => i.kind === "workout").sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start));
  const dayHeader = ["date", "weight", "weightCond", "weightTime", "steps", "walkMin", "walkIntensity", "cardioMin", "cardioWhat",
    "painFoot", "painBack", "painShoulder", "flags", "feel", "positive", "note",
    "dayType", "partnerHere", "nightEpisode", "episodeNote", "energyAm", "energyPm", "noWeight", "updatedAt",
    "sleepMin", "sleepStart", "sleepEnd", "restingHr", "napMin"];
  const dayText = ["date", "weightTime", "cardioWhat", "flags", "positive", "note", "episodeNote", "updatedAt", "sleepStart", "sleepEnd"];
  const counts = new Map<string, number>();
  for (const e of diary) counts.set(e.date, (counts.get(e.date) ?? 0) + 1);

  return {
    format: "fitnes-sheets", version: 1, sentAt: now.toISOString(),
    sheets: {
      "Дні": table(dayHeader, dayText, dayRows.filter((r) => String(r[0]) >= recentFrom)),
      "Дні-архів": table(dayHeader, dayText, dayRows.filter((r) => String(r[0]) < recentFrom)),
      "Годинник-дні": table(["date", "stepsTotal", "sleepStart", "sleepEnd", "sleepMin", "napMin", "restingHr", "noWatch"], ["date", "sleepStart", "sleepEnd"],
        live.map((d) => {
          const none = d.steps == null && d.sleepMin == null && d.restingHr == null;
          return [d.date, c(d.steps), c(d.sleepStart), c(d.sleepEnd), c(d.sleepMin), c(d.napMin), c(d.restingHr), none ? "yes" : ""];
        })),
      "Годинник-тренування": table(["sessionId", "date", "type", "start", "end", "durationMin", "distanceKm", "avgHr", "maxHr", "kcal", "source"], ["sessionId", "date", "type", "start", "end", "source"],
        workouts.map((w) => [w.id, w.date, w.type, w.start, w.end, w.durationMin, c(w.distanceKm), c(w.avgHr), c(w.maxHr), c(w.kcal), c(w.source)])),
      "Історія-вага": table(["date", "kg", "cond", "time", "origin"], ["date", "time", "origin"],
        live.filter((d) => d.weight != null).map((d) => [d.date, d.weight!, c(d.weightCond), c(d.weightTime), c(d.weightOrigin)])),
      "Силова": table(["date", "exercise", "sets", "reps", "kg"], ["date", "exercise"], strength),
      "Тиск": table(["date", "slot", "time", "sys", "dia", "pulse", "episode"], ["date", "time"], bp),
      "Звички": table(["date", "habitId", "status", "detail", "reasonIfNo", ...extraKeys, "value", "unit"], ["date", "detail", "reasonIfNo", ...extraKeys, "unit"], habitRows),
      "Довідник звичок": table(["id", "title", "minVersion", "enabled", "activeFrom", "activeTo"], ["id", "title", "minVersion", "activeFrom", "activeTo"],
        habits.map((h) => [h.id, h.title, h.minVersion, h.enabled ? "yes" : "no", c(h.activeFrom), c(h.activeTo)])),
      "Справи": table(["id", "title", "dueDate", "doneDate", "note", "updatedAt"], ["id", "title", "dueDate", "doneDate", "note", "updatedAt"],
        tasks.map((x) => [x.id, x.title, c(x.dueDate), c(x.doneDate), c(x.note), x.updatedAt])),
      "Щоденник": table(["id", "date", "event", "feeling", "tag", "createdAt", "rating"], ["id", "date", "event", "feeling", "createdAt"],
        diary.filter((e) => e.share).map((e) => [e.id, e.date, e.event, c(e.feeling), c(e.tag), e.createdAt, c(e.rating)])),
      "Щоденник-лічильник": table(["date", "entries"], ["date"], [...counts.entries()].map(([d, k]) => [d, k])),
      "Історія-рух": table(["month", "tracker", "run_km", "walk_km", "bike_km", "runs"], ["month"],
        months.map((m) => [m.month, m.tracker, m.runKm, m.walkKm, m.bikeKm, m.runs])),
    },
  };
}

/** A web-app address from Apps Script looks like https://script.google.com/macros/s/…/exec */
export function isScriptUrl(url: string): boolean {
  return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url.trim());
}
