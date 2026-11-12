import { Link } from "react-router-dom";
import { saveDay } from "../db";
import { useI18n } from "../i18n";
import { addDays, iso } from "../lib/date";
import type { HabitRow } from "../lib/dayForm";
import { activeHabits, markOf, movementDetail, withMark } from "../lib/habits";
import type { DaysMap, Settings } from "../lib/types";
import { HabitMarker } from "./HabitMarker";
import { Head } from "./Head";

/** Today's habits on the home screen: a tap saves the mark straight away. */
export function HabitsToday({ days, settings }: { days: DaysMap; settings: Settings }) {
  const { t } = useI18n();
  const today = iso(new Date());
  const yesterday = iso(addDays(new Date(), -1));
  const habits = activeHabits(settings.habits, today);
  if (!habits.length) return null;
  const day = days[today];

  function save(habitId: string, row: HabitRow) {
    const base = days[today] ?? { date: today, updatedAt: "" };
    const extra = Object.fromEntries(Object.entries(row.extra).filter(([, v]) => v));
    void saveDay(withMark(base, habitId, row.status ? {
      status: row.status,
      ...(row.detail.trim() ? { detail: row.detail.trim() } : {}),
      ...(row.status === "no" && row.reason.trim() ? { reasonIfNo: row.reason.trim() } : {}),
      ...(Object.keys(extra).length ? { extra } : {}),
    } : null));
  }

  return (
    <section className="block">
      <Head title={t("habit.title")} />
      {habits.map((h) => {
        const m = markOf(day, h.id);
        const row: HabitRow = { status: m?.status ?? "", detail: m?.detail ?? "", reason: m?.reasonIfNo ?? "", extra: { ...(m?.extra ?? {}) } };
        const moved = h.autoFrom === "movement" && day ? movementDetail(day, { walk: t("cal.day.walk").toLowerCase(), strength: t("cal.day.strength").toLowerCase(), min: t("common.min") }) : null;
        // A gentle nudge only when yesterday existed for this habit and was left empty.
        const missedYesterday = !m && activeHabits([h], yesterday).length > 0 && !markOf(days[yesterday], h.id);
        return (
          <div key={h.id} className="habit-wrap">
            <HabitMarker habit={h} row={row} onChange={(r) => save(h.id, r)}
              note={moved ? `${moved} — ${t("habit.auto")}` : missedYesterday ? t("habit.yesterday") : undefined} />
            {(m?.status === "done" || m?.status === "min") && (
              <Link className="link" to={`/diary?event=${encodeURIComponent(h.title)}`}>{t("habit.toDiary")} →</Link>
            )}
          </div>
        );
      })}
    </section>
  );
}
