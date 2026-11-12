import { useEffect, useState } from "react";
import { saveDay } from "../db";
import { useI18n } from "../i18n";
import { ddmm, iso } from "../lib/date";
import { dueItems, type DueItem } from "../lib/due";
import { fmt, num } from "../lib/format";
import { withMark } from "../lib/habits";
import { previousBp, previousWeight } from "../lib/stats";
import type { DayEntry, DaysMap, Habit, Settings } from "../lib/types";
import { Card, Icon } from "./Card";
import { HabitMarker } from "./HabitMarker";
import { type HabitRow, markFromRow, rowFromMark } from "../lib/dayForm";
import { ChipScale } from "./ChipScale";
import { Stepper } from "./Stepper";
import { WeightPicker } from "./WeightPicker";

const SNOOZE_KEY = "fitnes.dueSnoozeUntil";
const SNOOZE_MIN = 30;
const getSnooze = () => { try { return Number(localStorage.getItem(SNOOZE_KEY) || 0); } catch { return 0; } };

/**
 * Reminder screen in the spirit of medication apps: once a reminder time has
 * passed and something is still missing, it covers the app and asks for exactly
 * those answers. It has no close button — only "remind me in 30 minutes" — and
 * disappears by itself when everything is answered.
 */
export function DueScreen({ days, settings }: { days: DaysMap; settings: Settings }) {
  const { t, lang } = useI18n();
  const [now, setNow] = useState(() => new Date());
  const [snooze, setSnooze] = useState(getSnooze);
  useEffect(() => {
    const tick = () => { setNow(new Date()); setSnooze(getSnooze()); };
    const id = setInterval(tick, 60 * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, []);

  const due = dueItems(settings, days, now);
  const today = due?.date ?? iso(now);
  const items = due?.items ?? [];
  const day: DayEntry = days[today] ?? { date: today, updatedAt: "" };
  const prevW = previousWeight(days, today);
  const [w, setW] = useState("");
  const [bp, setBp] = useState({ sys: "", dia: "", pulse: "" });
  const lastBp = previousBp(days, today);
  const last = lastBp?.e1 ?? lastBp?.m1;

  if (!items.length || now.getTime() < snooze) return null;
  const save = (patch: Partial<DayEntry>) => saveDay({ ...day, ...patch, updatedAt: new Date().toISOString() });
  const later = () => {
    const until = Date.now() + SNOOZE_MIN * 60 * 1000;
    try { localStorage.setItem(SNOOZE_KEY, String(until)); } catch { /* private mode */ }
    setSnooze(until);
  };

  const render = (it: DueItem) => {
    if (it.kind === "weight") {
      const value = w || String(prevW?.weight ?? "");
      return (
        <Card key="w" icon="weight" title={t("form.weight")}>
          <WeightPicker value={value} onChange={setW} />
          <div className="pill-row">
            <button type="button" className="primary compact" onClick={() => { const v = num(value); if (v) void save({ weight: v, weightCond: "other" }); }}>
              {t("due.save")} {value ? fmt(num(value), lang) : ""}
            </button>
            <button type="button" className="pill" onClick={() => void save({ noWeight: true })}>{t("form.weightRemove")}</button>
          </div>
        </Card>
      );
    }
    if (it.kind === "feel") {
      return (
        <Card key="f" icon="moon" title={t("form.feel")}>
          <ChipScale value="" onChange={(v) => v && void save({ feel: Number(v) })} values={[1, 2, 3, 4, 5]} label={t("form.feel")} clearable={false} />
          <div className="scale-ends"><span>{t("form.feel.1")}</span><span>{t("form.feel.5")}</span></div>
        </Card>
      );
    }
    if (it.kind === "bp") {
      const ok = num(bp.sys) && num(bp.dia);
      return (
        <Card key="bp" icon="heart" title={t("cal.bpAdd")}>
          <div className="ex-steps">
            <div><span>{t("form.bpSys")}</span><Stepper value={bp.sys} onChange={(v) => setBp((p) => ({ ...p, sys: v }))} step={1} min={60} max={260} start={last?.sys ?? 120} label={t("form.bpSys")} /></div>
            <div><span>{t("form.bpDia")}</span><Stepper value={bp.dia} onChange={(v) => setBp((p) => ({ ...p, dia: v }))} step={1} min={30} max={180} start={last?.dia ?? 80} label={t("form.bpDia")} /></div>
            <div><span>{t("form.bpPulse")}</span><Stepper value={bp.pulse} onChange={(v) => setBp((p) => ({ ...p, pulse: v }))} step={1} min={30} max={220} start={last?.pulse ?? 70} label={t("form.bpPulse")} /></div>
          </div>
          <div className="pill-row"><button type="button" className="primary compact" disabled={!ok} onClick={() => void save({ bp: { ...(day.bp ?? {}), [day.bp?.e1 ? "e2" : "e1"]: { sys: num(bp.sys), dia: num(bp.dia), pulse: num(bp.pulse) } } })}>{t("due.save")}</button></div>
        </Card>
      );
    }
    return <DueHabit key={it.habit.id} habit={it.habit} day={day} />;
  };

  return (
    <div className="due-screen" role="dialog" aria-modal="true" aria-labelledby="due-title">
      <div className="due-sheet">
        <div className="due-top">
          <span className="card-ic"><Icon name="bell" /></span>
          <div><h2 id="due-title">{t("due.title")}</h2><p>{today !== iso(now) ? t("due.forDay", { d: ddmm(today) }) : t("due.sub", { n: items.length })}</p></div>
        </div>
        {items.map(render)}
        <button type="button" onClick={later}>{t("due.later")}</button>
      </div>
    </div>
  );
}

/** One habit on the reminder screen: statuses save on tap, measured answers on "Save". */
function DueHabit({ habit, day }: { habit: Habit; day: DayEntry }) {
  const { t } = useI18n();
  const [row, setRow] = useState<HabitRow>(() => rowFromMark(undefined));
  const measured = (habit.measure?.type ?? "status") !== "status";
  const save = (r: HabitRow) => { const mk = markFromRow(habit, r); if (mk) void saveDay(withMark(day, habit.id, mk)); };
  return (
    <Card icon="habits" title={habit.title}>
      <HabitMarker habit={{ ...habit, title: "" }} row={row} onChange={(r) => { setRow(r); if (!measured || r.status === "rest") save(r); }} />
      {measured && <div className="pill-row"><button type="button" className="primary compact" disabled={row.value === ""} onClick={() => save(row)}>{t("due.save")}</button></div>}
    </Card>
  );
}
