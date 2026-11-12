import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChipScale } from "../components/ChipScale";
import { SyncWarning } from "../components/SyncBadge";
import { Card } from "../components/Card";
import { DiaryAdd, DiaryList } from "../components/Diary";
import { SamsungCard } from "../components/SamsungCard";
import { ChipScale as Scale } from "../components/ChipScale";
import { HabitMarker } from "../components/HabitMarker";
import { Stepper } from "../components/Stepper";
import { WeightPicker } from "../components/WeightPicker";
import { deleteDay, deleteItem, saveDay, saveItem, useItems } from "../db";
import { type MessageKey, useI18n } from "../i18n";
import { addDays, ddmm, iso, parseIso } from "../lib/date";
import { type DayFormState, fromFormState, missingRequired, type SetRow, toFormState } from "../lib/dayForm";
import { fmt, num } from "../lib/format";
import { activeHabits } from "../lib/habits";
import { lastStrengthFor, previousBp, previousWeight, previousWorkout } from "../lib/stats";
import type { BpSlot, DayEntry, DaysMap, Flag, PainArea, Settings, SourceKey } from "../lib/types";
import { fromWatch, SOURCE_KEYS } from "../lib/types";
import { BP_SLOTS, DAY_TYPES, EXERCISES, FLAGS, HEART_FLAGS, PAIN_AREAS } from "../lib/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CARDIO = ["bike", "pool", "elliptical", "rower", "cycle", "run"] as const;
const WALK_QUICK = [10, 15, 20, 30, 45, 60];
const PAIN = Array.from({ length: 11 }, (_, i) => i);

export function DayLog({ days, settings }: { days: DaysMap; settings: Settings }) {
  const [params, setParams] = useSearchParams();
  const today = iso(new Date());
  const q = params.get("date");
  const date = q && DATE_RE.test(q) && q <= today ? q : today;
  // Keyed by date: switching dates remounts the form with that day's data,
  // while live DB updates for the same date don't wipe unsaved edits.
  return (
    <DayForm key={date} date={date} today={today} entry={days[date]} days={days} settings={settings}
      onDate={(d) => setParams(d === today ? {} : { date: d }, { replace: true })} />
  );
}

interface FormProps {
  date: string;
  today: string;
  entry: DayEntry | undefined;
  days: DaysMap;
  settings: Settings;
  onDate: (d: string) => void;
}

const EVENING_HOUR = 17;

function cardioKindOf(what: string, t: (k: MessageKey) => string, hasMinutes: boolean): string {
  const w = what.trim().toLowerCase();
  for (const k of CARDIO) if (w === t(`cardio.${k}` as MessageKey).toLowerCase()) return k;
  return w || hasMinutes ? "other" : "";
}

function DayForm({ date, today, entry, days, settings, onDate }: FormProps) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const prevW = previousWeight(days, date);
  const habits = activeHabits(settings.habits, date);
  const diary = useItems("diary");
  const [f, setF] = useState<DayFormState>(() => toFormState(entry, settings.phase === "1" ? "light" : "moderate", prevW?.weight ?? null, habits));
  const nowHm = () => new Date().toTimeString().slice(0, 5);
  /** Confirms the weight; for today's entry also notes the time of the weigh-in. */
  const weighed = (p: DayFormState, weight: string): DayFormState => ({ ...p, weight, weightChoice: "yes", weightTime: p.weightTime || (date === today ? nowHm() : "") });
  const [cardioKind, setCardioKind] = useState(() => cardioKindOf(entry?.cardioWhat ?? "", t, entry?.cardioMin != null));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState("");
  const watch: SourceKey[] = SOURCE_KEYS.filter((k) => fromWatch(settings, k));
  const isWatch = (k: SourceKey) => watch.includes(k);
  const bpOpen = !!entry?.bp;
  const lastWorkout = previousWorkout(days, date);
  const lastBp = previousBp(days, date);

  const set = <K extends keyof DayFormState>(k: K, v: DayFormState[K]) => setF((p) => ({ ...p, [k]: v }));
  const setEx = (id: string, k: keyof SetRow, v: string) => setF((p) => ({ ...p, ex: { ...p.ex, [id]: { ...p.ex[id], [k]: v } } }));
  const setCustom = (i: number, k: "name" | keyof SetRow, v: string) => setF((p) => ({ ...p, custom: p.custom.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  const setBp = (slot: BpSlot, k: "sys" | "dia" | "pulse", v: string) => setF((p) => ({ ...p, bp: { ...p.bp, [slot]: { ...p.bp[slot], [k]: v } } }));
  const setPain = (a: PainArea, v: string) => setF((p) => ({ ...p, pain: { ...p.pain, [a]: v } }));
  const toggleFlag = (fl: Flag) => setF((p) => ({ ...p, ok: false, flags: p.flags.includes(fl) ? p.flags.filter((x) => x !== fl) : [...p.flags, fl] }));
  const watchWeight = isWatch("weight") && entry?.weight != null;
  const evening = date < today || new Date().getHours() >= EVENING_HOUR;
  const left = missingRequired(f, watchWeight).filter((m) => m === "weight" || evening);

  const [openEx, setOpenEx] = useState<string | null>(null);
  /** "2×15 · 7,5 кг" */
  const summary = (sets: string, reps: string, kg: string) =>
    reps ? `${sets || 1}×${reps}${kg ? ` · ${lang === "uk" ? kg.replace(".", ",") : kg} ${t("common.kg")}` : ""}` : "";
  const heart = HEART_FLAGS.some((x) => f.flags.includes(x));
  const foot = f.flags.includes("foot");

  function repeatWorkout() {
    if (!lastWorkout?.strength) return;
    setF((p) => {
      const ex = { ...p.ex };
      const custom = [...p.custom];
      for (const it of lastWorkout.strength!) {
        const row = { sets: String(it.sets), reps: String(it.reps), kg: it.kg == null ? "" : String(it.kg) };
        if (it.id && it.id in ex) { if (!ex[it.id].reps) ex[it.id] = row; }
        else if (it.name && !custom.some((c) => c.name.trim() === it.name)) custom.push({ key: Date.now() + custom.length, name: it.name, ...row });
      }
      return { ...p, ex, custom };
    });
  }

  function pickCardio(kind: string) {
    setCardioKind(kind);
    if (kind === "") setF((p) => ({ ...p, cardio: "", cardioWhat: "" }));
    else if (kind === "other") set("cardioWhat", "");
    else set("cardioWhat", t(`cardio.${kind}` as MessageKey));
  }

  // Autosave: every change is written shortly after it is made; nothing waits for an evening "save".
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const fRef = useRef(f);
  const dirty = useRef(false);
  const firstRender = useRef(true);

  async function persist() {
    if (!dirty.current) return;
    dirty.current = false;
    const keep = entryRef.current;
    const data = fromFormState(date, fRef.current, new Date(), {
      habits, keep, watch,
      labels: { walk: t("cal.day.walk").toLowerCase(), strength: t("cal.day.strength").toLowerCase(), min: t("common.min"), auto: t("habit.auto") },
    });
    if (!data) return;
    try {
      await saveDay(data);
      // The day's good thing also lives in the diary, so it reaches the therapist export.
      const id = "dd-" + date;
      const existing = diary?.find((x) => x.id === id);
      if (data.positive) {
        if (existing?.event !== data.positive) await saveItem({ id, kind: "diary", date, event: data.positive, share: existing?.share ?? false, createdAt: existing?.createdAt ?? new Date().toISOString(), updatedAt: "" });
      } else if (existing) await deleteItem(existing);
      setSavedAt(new Date().toTimeString().slice(0, 5));
      setSaveErr("");
    } catch (err) {
      setSaveErr(t("form.error", { e: (err as Error).message }));
    }
  }

  useEffect(() => {
    fRef.current = f;
    if (firstRender.current) { firstRender.current = false; return; }
    dirty.current = true;
    const id = setTimeout(() => void persist(), 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f]);
  // Leaving the screen saves what is pending.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { void persist(); }, []);

  async function onDelete() {
    if (!confirm(t("form.deleteConfirm", { d: ddmm(date) }))) return;
    await deleteDay(date);
    navigate("/history");
  }

  const shift = (n: number) => onDate(iso(addDays(parseIso(date), n)));

  const todayDiary = (diary ?? []).filter((x) => x.date === date);
  const habitsDone = habits.filter((h) => f.habits[h.id]?.status).length;
  const strengthDone = EXERCISES.filter((id) => f.ex[id].reps).length + f.custom.filter((c) => c.reps).length;
  const bpCount = BP_SLOTS.filter((sl) => f.bp[sl].sys && f.bp[sl].dia).length;
  const okChip = (text: string) => ({ text, tone: "ok" as const });
  const todoChip = (text: string) => ({ text, tone: "todo" as const });

  return (
    <>
      <section className="block">
        <div className="pnav">
          <button type="button" aria-label={t("form.prevDay")} onClick={() => shift(-1)}>‹</button>
          <div className="pnav-mid">
            <input type="date" aria-label={t("form.date")} value={date} max={today} onChange={(e) => e.target.value && onDate(e.target.value)} />
            {date !== today && <button type="button" className="link" onClick={() => onDate(today)}>{t("form.today")}</button>}
          </div>
          <button type="button" aria-label={t("form.nextDay")} onClick={() => shift(1)} disabled={date >= today}>›</button>
        </div>
        <p className={"day-left" + (left.length ? "" : " done")}>
          {left.length ? t("day.left", { list: left.map((m) => t(m === "weight" ? "day.left.weight" : "day.left.feel")).join(", ") }) : evening || f.feel ? t("day.allDone") : t("day.morningDone")}
          <small className={saveErr ? "err" : ""}>{saveErr || (savedAt ? t("day.saved", { t: savedAt }) : t("day.autosave"))}</small>
        </p>
      </section>
      <SyncWarning />

      <SamsungCard entry={entry} settings={settings} onNoWeight={() => set("weightChoice", "no")} />

      {!isWatch("weight") && (
        <Card icon="weight" title={t("form.weight")}
          status={f.weightChoice === "yes" ? okChip(`${fmt(num(f.weight), lang)} ${t("common.kg")}`) : f.weightChoice === "no" ? okChip(t("form.noWeightChosen")) : todoChip(t("form.required"))}>
          <div className={"weight-box" + (f.weightChoice === "yes" ? "" : " pending")}>
            <WeightPicker value={f.weight} onChange={(v) => setF((p) => weighed(p, v))} />
            <div className="weight-side">
              {f.weightChoice === "pending" ? (
                <div className="pill-row">
                  {prevW && <button type="button" className="primary compact" onClick={() => setF((p) => weighed(p, p.weight || String(prevW.weight)))}>{t("form.weightSame")} {fmt(num(f.weight) ?? prevW.weight, lang)}</button>}
                  <button type="button" className="pill" onClick={() => set("weightChoice", "no")}>{t("form.weightRemove")}</button>
                </div>
              ) : (
                <div className="pill-row">
                  {f.weightChoice === "yes"
                    ? <button type="button" className="pill" onClick={() => set("weightChoice", "no")}>{t("form.weightRemove")}</button>
                    : <button type="button" className="pill" onClick={() => setF((p) => weighed(p, p.weight))}>{t("form.weighAfterAll")}</button>}
                </div>
              )}
              <div className="seg full" role="radiogroup" aria-label={t("form.weightCond")}>
                {(["morning", "other"] as const).map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={f.weightCond === c} className={f.weightCond === c ? "on" : ""} onClick={() => set("weightCond", c)}>{t(c === "morning" ? "form.cond.morning" : "form.cond.other")}</button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {habits.length > 0 && (
        <Card icon="habits" title={t("habit.title")} status={habitsDone === habits.length ? okChip("✓") : todoChip(`${habitsDone}/${habits.length}`)}>
          {habits.map((h) => (
            <HabitMarker key={h.id} habit={h} row={f.habits[h.id] ?? { status: "", detail: "", reason: "", extra: {} }}
              onChange={(row) => setF((p) => ({ ...p, habits: { ...p.habits, [h.id]: row } }))} />
          ))}
        </Card>
      )}

      {(!isWatch("steps") || !isWatch("exercise")) && (
        <Card icon="move" title={t("form.cardioBlock")}>
          {!isWatch("steps") && (
            <div className="field"><span>{t("form.steps")}</span>
              <Stepper value={f.steps} onChange={(v) => set("steps", v)} step={500} max={100000} label={t("form.steps")} />
            </div>
          )}
          {!isWatch("exercise") && (
            <>
              <div className="field"><span>{t("form.walk")}</span>
                <Stepper value={f.walk} onChange={(v) => set("walk", v)} step={5} max={600} label={t("form.walk")} />
              </div>
              <ChipScale value={f.walk} onChange={(v) => set("walk", v)} values={WALK_QUICK} label={t("form.walk")} />
              <div className="seg full" role="radiogroup" aria-label={t("form.walkInt")}>
                {(["light", "moderate"] as const).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={f.walkInt === k} className={f.walkInt === k ? "on" : ""} onClick={() => set("walkInt", k)}>{t(`form.pace.${k}` as MessageKey)}</button>
                ))}
              </div>
              <div className="fields">
                <label className="field"><span>{t("form.cardioType")}</span>
                  <select value={cardioKind} onChange={(e) => pickCardio(e.target.value)}>
                    <option value="">{t("form.cardioNone")}</option>
                    {CARDIO.map((k) => <option key={k} value={k}>{t(`cardio.${k}` as MessageKey)}</option>)}
                    <option value="other">{t("cardio.other")}</option>
                  </select>
                </label>
                {cardioKind !== "" && (
                  <div className="field"><span>{t("form.cardioMin")}</span>
                    <Stepper value={f.cardio} onChange={(v) => set("cardio", v)} step={5} max={600} label={t("form.cardio")} />
                  </div>
                )}
                {cardioKind === "other" && (
                  <label className="field"><span>{t("form.cardioWhat")}</span>
                    <input type="text" maxLength={60} value={f.cardioWhat} placeholder={t("form.cardioOtherPh")} onChange={(e) => set("cardioWhat", e.target.value)} />
                  </label>
                )}
              </div>
            </>
          )}
        </Card>
      )}

      <Card icon="strength" title={t("form.strength")} fold open={strengthDone > 0} status={strengthDone ? okChip(String(strengthDone)) : undefined}>
        {lastWorkout && (
          <div className="pill-row"><button type="button" className="pill" onClick={repeatWorkout}>↻ {t("form.repeatWorkout", { d: ddmm(lastWorkout.date) })}</button></div>
        )}
        <div className="ex-list">
          {EXERCISES.map((id) => {
            const name = t(`ex.${id}` as MessageKey);
            const hint = t(`ex.${id}.hint` as MessageKey);
            const last = lastStrengthFor(days, id, date);
            const row = f.ex[id];
            const now = summary(row.sets, row.reps, row.kg);
            const before = last ? summary(String(last.sets), String(last.reps), last.kg == null ? "" : String(last.kg)) : "";
            return (
              <details className={"ex-card" + (row.reps ? " done" : "")} key={id} open={openEx === id} onToggle={(e) => { const o = (e.target as HTMLDetailsElement).open; setOpenEx((cur) => (o ? id : cur === id ? null : cur)); }}>
                <summary>
                  <span className="ex-name"><b>{name}</b>{hint && <small>{hint}</small>}</span>
                  <span className={"ex-sum" + (now ? " set" : "")}>{now || before || "+"}</span>
                </summary>
                <div className="ex-steps">
                  <div><span>{t("form.sets")}</span><Stepper value={row.sets} onChange={(v) => setEx(id, "sets", v)} step={1} max={10} start={last?.sets} label={`${name}: ${t("form.sets")}`} /></div>
                  <div><span>{t("form.reps")}</span><Stepper value={row.reps} onChange={(v) => setEx(id, "reps", v)} step={1} max={200} start={last?.reps} label={`${name}: ${t("form.reps")}`} /></div>
                  <div><span>{t("form.kg")}</span><Stepper value={row.kg} onChange={(v) => setEx(id, "kg", v)} step={0.5} max={200} decimals={1} inputMode="decimal" start={last?.kg} label={`${name}: ${t("form.kg")}`} /></div>
                </div>
              </details>
            );
          })}
          {f.custom.map((c, i) => (
            <div className={"ex-card custom" + (c.reps ? " done" : "")} key={c.key}>
              <div className="ex-name"><input type="text" maxLength={60} placeholder={t("form.customName")} aria-label={t("form.customName")} value={c.name} onChange={(e) => setCustom(i, "name", e.target.value)} /></div>
              <div className="ex-steps">
                <div><span>{t("form.sets")}</span><Stepper value={c.sets} onChange={(v) => setCustom(i, "sets", v)} step={1} max={10} label={t("form.sets")} /></div>
                <div><span>{t("form.reps")}</span><Stepper value={c.reps} onChange={(v) => setCustom(i, "reps", v)} step={1} max={200} label={t("form.reps")} /></div>
                <div><span>{t("form.kg")}</span><Stepper value={c.kg} onChange={(v) => setCustom(i, "kg", v)} step={0.5} max={200} decimals={1} inputMode="decimal" label={t("form.kg")} /></div>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="link" onClick={() => set("custom", [...f.custom, { key: Date.now(), name: "", sets: "", reps: "", kg: "" }])}>{t("form.addCustom")}</button>
      </Card>

      {!isWatch("bp") && (
        <Card icon="heart" title={t("form.bp")} fold open={bpOpen} status={bpCount ? okChip(String(bpCount)) : undefined}>
          <div className="bp-list">
            {BP_SLOTS.map((slot) => {
              const label = t(`form.bp.${slot}` as MessageKey);
              const r = f.bp[slot];
              const prev = lastBp?.[slot] ?? lastBp?.m1 ?? lastBp?.e1;
              return (
                <div className="bp-card" key={slot}>
                  <b>{label}</b>
                  <div className="ex-steps">
                    <div><span>{t("form.bpSys")}</span><Stepper value={r.sys} onChange={(v) => setBp(slot, "sys", v)} step={1} min={60} max={260} start={prev?.sys ?? 120} label={`${label}: ${t("form.bpSys")}`} /></div>
                    <div><span>{t("form.bpDia")}</span><Stepper value={r.dia} onChange={(v) => setBp(slot, "dia", v)} step={1} min={30} max={180} start={prev?.dia ?? 80} label={`${label}: ${t("form.bpDia")}`} /></div>
                    <div><span>{t("form.bpPulse")}</span><Stepper value={r.pulse} onChange={(v) => setBp(slot, "pulse", v)} step={1} min={30} max={220} start={prev?.pulse ?? 70} label={`${label}: ${t("form.bpPulse")}`} /></div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="status" style={{ margin: 0 }}>{t("form.bpHint")}</p>
        </Card>
      )}

      <Card icon="moon" title={t("day.evening")} fold open={evening || !!f.feel || todayDiary.length > 0}
        sub={!evening && !f.feel ? t("day.eveningLater") : undefined}
        status={f.feel ? okChip(`${f.feel}/5`) : evening ? todoChip(t("form.required")) : undefined}>
        <span className="sub-h">{t("form.feel")}</span>
        <ChipScale value={f.feel} onChange={(v) => set("feel", v)} values={[1, 2, 3, 4, 5]} label={t("form.feel")} clearable={false} />
        <div className="scale-ends"><span>{t("form.feel.1")}</span><span>{t("form.feel.5")}</span></div>
        <span className="sub-h">{t("diary.title")}</span>
        <DiaryList entries={todayDiary} showDate={false} />
        <DiaryAdd date={date} compact />
      </Card>

      <Card icon="more" title={t("day.more")} fold sub={t("day.moreSub")}>
        <span className="sub-h">{t("form.body")}</span>
        {PAIN_AREAS.map((a) => (
          <div className="field" key={a}>
            <span>{t(`form.pain.${a}` as MessageKey)}</span>
            <ChipScale value={f.pain[a]} onChange={(v) => setPain(a, v)} values={PAIN} label={t(`form.pain.${a}` as MessageKey)} />
          </div>
        ))}
        <div className="checks">
          {FLAGS.map((fl) => (
            <label key={fl}><input type="checkbox" checked={f.flags.includes(fl)} onChange={() => toggleFlag(fl)} /> {t(`form.flag.${fl}` as MessageKey)}</label>
          ))}
        </div>
        {heart && <div className="alert" role="alert"><b>{t("form.alertHeartTitle")}</b> {t("form.alertHeart")}</div>}
        {foot && <div className="alert" role="alert"><b>{t("form.alertFootTitle")}</b> {t("form.alertFoot")}</div>}

        <span className="sub-h">{t("ctx.title")}</span>
        <label className="field"><span>{t("ctx.dayType")}</span>
          <select value={f.dayType} onChange={(e) => set("dayType", e.target.value as DayFormState["dayType"])}>
            <option value="">{t("ctx.dayType.none")}</option>
            {DAY_TYPES.map((k) => <option key={k} value={k}>{t(`ctx.dayType.${k}` as MessageKey)}</option>)}
          </select>
        </label>
        {(["partnerHere", "nightEpisode"] as const).map((k) => (
          <div className="field" key={k}><span>{t(k === "partnerHere" ? "ctx.partner" : "ctx.episode")}</span>
            <div className="seg full" role="radiogroup">
              {(["yes", "no"] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={f[k] === v} className={f[k] === v ? "on" : ""} onClick={() => set(k, f[k] === v ? "" : v)}>{t(v === "yes" ? "ctx.yes" : "ctx.no")}</button>
              ))}
            </div>
          </div>
        ))}
        {f.nightEpisode === "yes" && (
          <input type="text" maxLength={200} placeholder={t("ctx.episodeNote")} aria-label={t("ctx.episodeNote")} value={f.episodeNote} onChange={(e) => set("episodeNote", e.target.value)} />
        )}
        <div className="field"><span>{t("ctx.energyAm")}</span><Scale value={f.energyAm} onChange={(v) => set("energyAm", v)} values={[1, 2, 3, 4, 5]} label={t("ctx.energyAm")} /></div>
        <div className="field"><span>{t("ctx.energyPm")}</span><Scale value={f.energyPm} onChange={(v) => set("energyPm", v)} values={[1, 2, 3, 4, 5]} label={t("ctx.energyPm")} /></div>

        <label className="field"><span>{t("form.note")}</span>
          <textarea className="short" maxLength={1000} value={f.note} placeholder={t("form.notePh")} onChange={(e) => set("note", e.target.value)} />
        </label>
        {entry && <div className="pill-row"><button type="button" className="danger compact" onClick={onDelete}>{t("form.deleteDay")}</button></div>}
      </Card>
    </>
  );
}
