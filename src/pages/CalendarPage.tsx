import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { Head } from "../components/Head";
import { PeriodNav } from "../components/PeriodNav";
import { Stepper } from "../components/Stepper";
import { saveDay } from "../db";
import { type MessageKey, useI18n } from "../i18n";
import { addDays, ddmm, iso, monthDates, parseIso } from "../lib/date";
import { fmt, fmtInt, monthName, num } from "../lib/format";
import { exerciseName } from "../lib/report";
import { type BpAvg, bpIsHigh, bpPeriod, bpSummary, morningWeight, nextBpSlot, previousBp } from "../lib/stats";
import type { DayEntry, DaysMap, Settings } from "../lib/types";
import { BP_SLOTS, PAIN_AREAS } from "../lib/types";
import { History } from "./History";

type Mode = "activity" | "bp" | "weight";
const MODES: Mode[] = ["activity", "bp", "weight"];

export function CalendarPage({ days, settings }: { days: DaysMap; settings: Settings }) {
  const { t, lang } = useI18n();
  const today = iso(new Date());
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [mode, setMode] = useState<Mode>("activity");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(today);
  const dates = monthDates(offset);
  const lead = (parseIso(dates[0]).getDay() + 6) % 7;
  const mark = settings.bpMark;
  const bpMonth = bpPeriod(days, dates);
  const bpText = (a: BpAvg | null) => (a ? `${a.sys}/${a.dia}` : "—");

  function changeMonth(o: number) {
    setOffset(o);
    const m = monthDates(o);
    setSelected(m.includes(today) ? today : m[0]);
  }

  function cell(date: string) {
    const d = days[date];
    if (!d) return null;
    if (mode === "weight") {
      const w = morningWeight(d);
      return w == null ? null : <span className="cv">{fmt(w, lang)}</span>;
    }
    if (mode === "bp") {
      const s = bpSummary(d);
      if (!s.morning && !s.evening) return null;
      return (
        <>
          <span className={"cv" + (bpIsHigh(s.morning, mark) ? " high" : "")}>{s.morning ? `${s.morning.sys}/${s.morning.dia}` : "·"}</span>
          <span className={"cv" + (bpIsHigh(s.evening, mark) ? " high" : "")}>{s.evening ? `${s.evening.sys}/${s.evening.dia}` : "·"}</span>
        </>
      );
    }
    const moved = !!d.walkMin || !!d.cardioMin;
    return (
      <>
        {d.steps != null && <span className={"cv" + (settings.stepGoal != null && d.steps >= settings.stepGoal ? " good" : "")}>{fmt(d.steps / 1000, lang)}</span>}
        <span className="marks">
          {moved && <i className="m-walk" />}
          {!!d.strength?.length && <i className="m-str" />}
          {!!d.flags?.length && <b className="m-flag">!</b>}
        </span>
      </>
    );
  }

  return (
    <>
      <header className="page-head">
        <h1>{t("cal.title")}</h1>
        <div className="seg full" role="tablist">
          {(["calendar", "list"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>{t(`cal.view.${v}` as MessageKey)}</button>
          ))}
        </div>
      </header>

      {view === "list" ? <History days={days} /> : (
        <>
          <section className="block">
            <PeriodNav label={monthName(dates[0], lang)} offset={offset} onChange={changeMonth}
              prevLabel={t("common.prev")} nextLabel={t("common.next")} nowLabel={t("common.current")} />
            <div className="seg full" role="tablist">
              {MODES.map((m) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{t(`cal.mode.${m}` as MessageKey)}</button>
              ))}
            </div>
            <div className={"cal mode-" + mode}>
              {t("cal.wd").split(",").map((w) => <span key={w} className="cal-wd">{w}</span>)}
              {Array.from({ length: lead }, (_, i) => <span key={"b" + i} />)}
              {dates.map((date) => (
                <button key={date} type="button" disabled={date > today}
                  className={"cal-day" + (date === selected ? " sel" : "") + (date === today ? " today" : "") + (days[date] ? " has" : "")}
                  aria-pressed={date === selected} aria-label={ddmm(date)} onClick={() => setSelected(date)}>
                  <span className="cd">{Number(date.slice(8))}</span>
                  {cell(date)}
                </button>
              ))}
            </div>
            <Head as="label" title={<span className="status">{t(`cal.mode.${mode}` as MessageKey)}</span>} help={t(`cal.legend.${mode}` as MessageKey, mark)} />
            {mode === "bp" && (
              <p className="status" style={{ margin: 0 }}>
                <b>{t("cal.bpMonth")}:</b> {t("cal.morning")} <span className={"num" + (bpIsHigh(bpMonth.morning, mark) ? " high" : "")}>{bpText(bpMonth.morning)}</span>
                {" · "}{t("cal.evening")} <span className={"num" + (bpIsHigh(bpMonth.evening, mark) ? " high" : "")}>{bpText(bpMonth.evening)}</span>
                {" · "}{t("cal.bpDays", { n: bpMonth.daysWith })}
              </p>
            )}
          </section>

          {mode === "bp" && <BpQuickAdd key={selected} date={selected} today={today} days={days} />}
          <DayDetail date={selected} day={days[selected]} settings={settings} />
        </>
      )}
    </>
  );
}

function BpQuickAdd({ date, today, days }: { date: string; today: string; days: DaysMap }) {
  const { t } = useI18n();
  const prev = previousBp(days, iso(addDays(parseIso(date), 1)));
  const last = prev?.e1 ?? prev?.m1 ?? prev?.m2 ?? prev?.e2;
  const [part, setPart] = useState<"am" | "pm" | "ep">(date === today && new Date().getHours() >= 14 ? "pm" : "am");
  const [sys, setSys] = useState("");
  const [dia, setDia] = useState("");
  const [pulse, setPulse] = useState("");
  const [msg, setMsg] = useState<{ text: string; kind?: "ok" | "err" }>({ text: "" });
  const slot = part === "ep" ? "ep" : nextBpSlot(days[date], part === "am" ? 8 : 20);

  async function add() {
    const s = num(sys), d = num(dia);
    if (s == null || d == null) { setMsg({ text: t("cal.bpNeed"), kind: "err" }); return; }
    if (!slot) return;
    const cur: DayEntry = days[date] ?? { date, updatedAt: "" };
    const reading = { sys: s, dia: d, pulse: num(pulse) };
    const stamp = new Date().toISOString();
    if (slot === "ep") {
      // Readings during a night episode stay out of the morning/evening averages.
      await saveDay({ ...cur, bpEpisodes: [...(cur.bpEpisodes ?? []), { time: new Date().toTimeString().slice(0, 5), ...reading }], nightEpisode: true, updatedAt: stamp });
    } else {
      await saveDay({ ...cur, bp: { ...(cur.bp ?? {}), [slot]: reading }, updatedAt: stamp });
    }
    setMsg({ text: t("cal.bpSaved", { v: `${s}/${d}` }), kind: "ok" });
    setSys(""); setDia(""); setPulse("");
  }

  return (
    <section className="block">
      <Head title={t("cal.bpAddFor", { d: ddmm(date) })} />
      <div>
        <div className="seg full" role="radiogroup">
          {(["am", "pm", "ep"] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={part === p} className={part === p ? "on" : ""} onClick={() => setPart(p)}>{t(p === "am" ? "cal.morning" : p === "pm" ? "cal.evening" : "cal.bpEpisode")}</button>
          ))}
        </div>
      </div>
      {slot ? (
        <>
          <div className="ex-steps">
            <div><span>{t("form.bpSys")}</span><Stepper value={sys} onChange={setSys} step={1} min={60} max={260} start={last?.sys ?? 120} label={t("form.bpSys")} /></div>
            <div><span>{t("form.bpDia")}</span><Stepper value={dia} onChange={setDia} step={1} min={30} max={180} start={last?.dia ?? 80} label={t("form.bpDia")} /></div>
            <div><span>{t("form.bpPulse")}</span><Stepper value={pulse} onChange={setPulse} step={1} min={30} max={220} start={last?.pulse ?? 70} label={t("form.bpPulse")} /></div>
          </div>
          <div className="actions"><button type="button" className="primary" onClick={add}>{t("cal.bpAdd")}</button></div>
          {msg.text && <span className={"status " + (msg.kind ?? "")} role="status">{msg.text}</span>}
        </>
      ) : (
        <p className="status" style={{ margin: 0 }}>{msg.kind === "ok" ? msg.text + " " : ""}{t("cal.bpSlotsFull")}</p>
      )}
    </section>
  );
}

function DayDetail({ date, day, settings }: { date: string; day: DayEntry | undefined; settings: Settings }) {
  const { t, lang } = useI18n();
  const rows: [string, ReactNode][] = [];
  if (day) {
    if (day.weight != null) rows.push([t("cal.day.weight"), `${fmt(day.weight, lang)} ${t("common.kg")}${(day.weightCond ?? "morning") === "morning" ? "" : " " + t("history.notMorning")}`]);
    if (day.steps != null) rows.push([t("cal.day.steps"), fmtInt(day.steps, lang)]);
    if (day.walkMin) rows.push([t("cal.day.walk"), `${day.walkMin} ${t("common.min")} · ${t(`form.walkInt.${day.walkIntensity ?? "light"}` as MessageKey)}`]);
    if (day.cardioMin) rows.push([t("cal.day.cardio"), `${day.cardioMin} ${t("common.min")}${day.cardioWhat ? " · " + day.cardioWhat : ""}`]);
    if (day.strength?.length) rows.push([t("cal.day.strength"), (
      <ul className="plain">{day.strength.map((e, i) => <li key={i}>{exerciseName(t, e)} {e.sets}×{e.reps}{e.kg != null ? ` · ${fmt(e.kg, lang)} ${t("common.kg")}` : ""}</li>)}</ul>
    )]);
    if (day.bp) rows.push([t("cal.day.bp"), (
      <ul className="plain">{BP_SLOTS.filter((s) => day.bp?.[s]).map((s) => {
        const v = day.bp![s]!;
        const high = v.sys != null && v.dia != null && bpIsHigh({ sys: v.sys, dia: v.dia, pulse: null }, settings.bpMark);
        return <li key={s}>{t(`form.bp.${s}` as MessageKey)}: <span className={"num" + (high ? " high" : "")}>{v.sys ?? "?"}/{v.dia ?? "?"}</span>{v.pulse != null ? " · " + t("cal.pulse", { p: v.pulse }) : ""}</li>;
      })}</ul>
    )]);
    if (day.pain && Object.keys(day.pain).length) rows.push([t("cal.day.pain"), PAIN_AREAS.map((a) => day.pain?.[a] ?? "—").join(" / ")]);
    if (day.flags?.length) rows.push([t("cal.day.flags"), <span className="high">{day.flags.map((f) => t(`flag.${f}` as MessageKey)).join(", ")}</span>]);
    if (day.bpEpisodes?.length) rows.push([t("cal.day.bpEpisodes"), (
      <ul className="plain">{day.bpEpisodes.map((v, i) => <li key={i}>{v.time}: <span className="num">{v.sys ?? "?"}/{v.dia ?? "?"}</span>{v.pulse != null ? " · " + t("cal.pulse", { p: v.pulse }) : ""}</li>)}</ul>
    )]);
    if (day.habitLog?.length) rows.push([t("cal.day.habits"), (
      <ul className="plain">{day.habitLog.map((m) => {
        const h = settings.habits.find((x) => x.id === m.habitId);
        return <li key={m.habitId}>{h?.title ?? m.habitId}: {t(`habit.status.${m.status}`)}{m.detail ? ` · ${m.detail}` : ""}{m.reasonIfNo ? ` · ${m.reasonIfNo}` : ""}</li>;
      })}</ul>
    )]);
    const ctx = [
      day.dayType ? t(`ctx.dayType.${day.dayType}` as MessageKey) : "",
      day.partnerHere != null ? `${t("ctx.partner").toLowerCase()}: ${t(day.partnerHere ? "ctx.yes" : "ctx.no")}` : "",
      day.nightEpisode ? t("ctx.episode").toLowerCase() + (day.episodeNote ? ` (${day.episodeNote})` : "") : "",
    ].filter(Boolean);
    if (ctx.length) rows.push([t("cal.day.context"), ctx.join(" · ")]);
    if (day.energyAm != null || day.energyPm != null) rows.push([t("cal.day.energy"), `${day.energyAm ?? "—"} / ${day.energyPm ?? "—"}`]);
    if (day.sleepMin) rows.push([t("cal.day.sleep"), `${Math.floor(day.sleepMin / 60)}:${String(day.sleepMin % 60).padStart(2, "0")}${day.sleepStart && day.sleepEnd ? ` · ${day.sleepStart}–${day.sleepEnd}` : ""}`]);
    if (day.restingHr) rows.push([t("cal.day.restingHr"), String(day.restingHr)]);
    if (day.feel != null) rows.push([t("form.feel"), `${day.feel} / 5`]);
    if (day.positive) rows.push([t("form.positive"), day.positive]);
    if (day.note) rows.push([t("cal.day.note"), day.note]);
  }
  return (
    <section className="block">
      <Head title={<span className="num-h">{ddmm(date)}.{date.slice(0, 4)}</span>} />
      {rows.length ? (
        <dl className="detail">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      ) : <p className="empty">{t("cal.noEntry")}</p>}
      <Link className="btn block" to={`/log?date=${date}`}>{day ? t("cal.openDay") : t("cal.addEntry")}</Link>
    </section>
  );
}
