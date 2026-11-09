import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { db } from "../db";
import { type MessageKey, useI18n } from "../i18n";
import { addDays, ddmm, iso, parseIso } from "../lib/date";
import { type DayFormState, fromFormState, toFormState } from "../lib/dayForm";
import { lastStrengthFor } from "../lib/stats";
import type { DayEntry, DaysMap, Flag, Settings } from "../lib/types";
import { BP_SLOTS, EXERCISES, FLAGS, HEART_FLAGS, PAIN_AREAS } from "../lib/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function DayLog({ days, settings }: { days: DaysMap; settings: Settings }) {
  const [params, setParams] = useSearchParams();
  const today = iso(new Date());
  const q = params.get("date");
  const date = q && DATE_RE.test(q) ? q : today;
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

type Status = { text: string; kind?: "ok" | "err" };

function DayForm({ date, today, entry, days, settings, onDate }: FormProps) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [f, setF] = useState<DayFormState>(() => toFormState(entry, settings.phase === "1" ? "light" : "moderate"));
  const [status, setStatus] = useState<Status>(entry ? { text: t("form.exists") } : { text: "" });
  const [saving, setSaving] = useState(false);
  const bpWeek = date >= settings.startDate && date < iso(addDays(parseIso(settings.startDate), 7));
  const [bpOpen, setBpOpen] = useState(!!entry?.bp || bpWeek);

  useEffect(() => { if (status.kind === "ok") { const id = setTimeout(() => setStatus({ text: "" }), 4000); return () => clearTimeout(id); } }, [status]);

  const set = <K extends keyof DayFormState>(k: K, v: DayFormState[K]) => setF((p) => ({ ...p, [k]: v }));
  const lastNum = (v: number | undefined) => (v == null ? "" : lang === "uk" ? String(v).replace(".", ",") : String(v));
  const heart = HEART_FLAGS.some((x) => f.flags.includes(x));
  const foot = f.flags.includes("foot");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const data = fromFormState(date, f);
    if (!data) { setStatus({ text: t("form.empty"), kind: "err" }); return; }
    setSaving(true);
    setStatus({ text: t("form.saving") });
    try {
      await db.days.put(data);
      setStatus({ text: t("form.saved", { d: ddmm(date) }), kind: "ok" });
    } catch (err) {
      setStatus({ text: t("form.error", { e: (err as Error).message }), kind: "err" });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm(t("form.deleteConfirm", { d: ddmm(date) }))) return;
    await db.days.delete(date);
    navigate("/history");
  }

  const toggleFlag = (fl: Flag) => set("flags", f.flags.includes(fl) ? f.flags.filter((x) => x !== fl) : [...f.flags, fl]);

  return (
    <section className="block">
      <div className="row between">
        <h2>{t("form.title")}</h2>
        <label className="field date-field">
          <span>{t("form.date")}</span>
          <input type="date" value={date} max={today} onChange={(e) => e.target.value && onDate(e.target.value)} />
        </label>
      </div>
      <form onSubmit={onSubmit} noValidate>
        <fieldset>
          <legend>{t("form.weightSteps")}</legend>
          <div className="fields">
            <label className="field"><span>{t("form.weight")}</span>
              <input type="text" inputMode="decimal" value={f.weight} placeholder={t("form.weightPh")} onChange={(e) => set("weight", e.target.value)} />
            </label>
            <label className="field"><span>{t("form.weightCond")}</span>
              <select value={f.weightCond} onChange={(e) => set("weightCond", e.target.value as DayFormState["weightCond"])}>
                <option value="morning">{t("form.weightCond.morning")}</option>
                <option value="other">{t("form.weightCond.other")}</option>
              </select>
            </label>
            <label className="field"><span>{t("form.steps")}</span>
              <input type="number" min={0} max={100000} step={1} inputMode="numeric" value={f.steps} placeholder={t("form.stepsPh")} onChange={(e) => set("steps", e.target.value)} />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>{t("form.cardioBlock")}</legend>
          <div className="fields">
            <label className="field"><span>{t("form.walk")}</span>
              <input type="number" min={0} max={600} inputMode="numeric" value={f.walk} onChange={(e) => set("walk", e.target.value)} />
            </label>
            <label className="field"><span>{t("form.walkInt")}</span>
              <select value={f.walkInt} onChange={(e) => set("walkInt", e.target.value as DayFormState["walkInt"])}>
                <option value="light">{t("form.walkInt.light")}</option>
                <option value="moderate">{t("form.walkInt.moderate")}</option>
              </select>
            </label>
            <label className="field"><span>{t("form.cardio")}</span>
              <input type="number" min={0} max={600} inputMode="numeric" value={f.cardio} onChange={(e) => set("cardio", e.target.value)} />
            </label>
            <label className="field"><span>{t("form.cardioWhat")}</span>
              <input type="text" maxLength={60} value={f.cardioWhat} placeholder={t("form.cardioWhatPh")} onChange={(e) => set("cardioWhat", e.target.value)} />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>{t("form.strength")}</legend>
          <p className="status" style={{ margin: 0 }}>{t("form.strengthHint")}</p>
          <div className="ex-table">
            <div className="ex ex-head"><span>{t("form.exercise")}</span><span>{t("form.sets")}</span><span>{t("form.reps")}</span><span>{t("form.kg")}</span></div>
            {EXERCISES.map((id) => {
              const name = t(`ex.${id}` as MessageKey);
              const hint = t(`ex.${id}.hint` as MessageKey);
              const last = lastStrengthFor(days, id, date);
              const row = f.ex[id];
              const upd = (k: "sets" | "reps" | "kg", v: string) => set("ex", { ...f.ex, [id]: { ...row, [k]: v } });
              return (
                <div className="ex" key={id}>
                  <label className="name" htmlFor={`s-${id}-reps`}><b>{name}</b>{hint && <small>{hint}</small>}</label>
                  <input type="number" min={0} max={10} inputMode="numeric" aria-label={`${name}: ${t("form.sets")}`} value={row.sets} placeholder={lastNum(last?.sets)} onChange={(e) => upd("sets", e.target.value)} />
                  <input id={`s-${id}-reps`} type="number" min={0} max={200} inputMode="numeric" aria-label={`${name}: ${t("form.reps")}`} value={row.reps} placeholder={lastNum(last?.reps)} onChange={(e) => upd("reps", e.target.value)} />
                  <input type="text" inputMode="decimal" aria-label={`${name}: ${t("form.kg")}`} value={row.kg} placeholder={lastNum(last?.kg)} onChange={(e) => upd("kg", e.target.value)} />
                </div>
              );
            })}
            {f.custom.map((c, i) => {
              const upd = (k: "name" | "sets" | "reps" | "kg", v: string) => set("custom", f.custom.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
              return (
                <div className="ex custom" key={c.key}>
                  <span className="name"><input type="text" maxLength={60} placeholder={t("form.customName")} aria-label={t("form.customName")} value={c.name} onChange={(e) => upd("name", e.target.value)} /></span>
                  <input type="number" min={0} max={10} inputMode="numeric" aria-label={t("form.sets")} value={c.sets} onChange={(e) => upd("sets", e.target.value)} />
                  <input type="number" min={0} max={200} inputMode="numeric" aria-label={t("form.reps")} value={c.reps} onChange={(e) => upd("reps", e.target.value)} />
                  <input type="text" inputMode="decimal" aria-label={t("form.kg")} value={c.kg} onChange={(e) => upd("kg", e.target.value)} />
                </div>
              );
            })}
          </div>
          <div className="row">
            <button type="button" className="link" onClick={() => set("custom", [...f.custom, { key: Date.now(), name: "", sets: "", reps: "", kg: "" }])}>{t("form.addCustom")}</button>
          </div>
        </fieldset>

        <fieldset>
          <legend>{t("form.feeling")}</legend>
          <div className="fields">
            {PAIN_AREAS.map((a) => (
              <label className="field" key={a}><span>{t(`form.pain.${a}` as MessageKey)}</span>
                <input type="number" min={0} max={10} step={1} inputMode="numeric" value={f.pain[a]} onChange={(e) => set("pain", { ...f.pain, [a]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="checks">
            {FLAGS.map((fl) => (
              <label key={fl}><input type="checkbox" checked={f.flags.includes(fl)} onChange={() => toggleFlag(fl)} /> {t(`form.flag.${fl}` as MessageKey)}</label>
            ))}
          </div>
          {heart && <div className="alert" role="alert"><b>{t("form.alertHeartTitle")}</b> {t("form.alertHeart")}</div>}
          {foot && <div className="alert" role="alert"><b>{t("form.alertFootTitle")}</b> {t("form.alertFoot")}</div>}
        </fieldset>

        <details open={bpOpen} onToggle={(e) => setBpOpen((e.target as HTMLDetailsElement).open)}>
          <summary>{t("form.bp")}</summary>
          <div className="bp ex-head"><span /><span>{t("form.bpSys")}</span><span>{t("form.bpDia")}</span><span>{t("form.bpPulse")}</span></div>
          <div className="bp">
            {BP_SLOTS.map((slot) => {
              const label = t(`form.bp.${slot}` as MessageKey);
              const r = f.bp[slot];
              const upd = (k: "sys" | "dia" | "pulse", v: string) => set("bp", { ...f.bp, [slot]: { ...r, [k]: v } });
              return [
                <span key={slot + "l"}>{label}</span>,
                <input key={slot + "s"} type="number" min={60} max={260} inputMode="numeric" aria-label={`${label}: ${t("form.bpSys")}`} value={r.sys} onChange={(e) => upd("sys", e.target.value)} />,
                <input key={slot + "d"} type="number" min={30} max={180} inputMode="numeric" aria-label={`${label}: ${t("form.bpDia")}`} value={r.dia} onChange={(e) => upd("dia", e.target.value)} />,
                <input key={slot + "p"} type="number" min={30} max={220} inputMode="numeric" aria-label={`${label}: ${t("form.bpPulse")}`} value={r.pulse} onChange={(e) => upd("pulse", e.target.value)} />,
              ];
            })}
          </div>
          <p className="status" style={{ margin: "6px 0 0" }}>{t("form.bpHint")}</p>
        </details>

        <label className="field"><span>{t("form.note")}</span>
          <textarea maxLength={1000} value={f.note} placeholder={t("form.notePh")} onChange={(e) => set("note", e.target.value)} />
        </label>

        <div className="row">
          <button type="submit" className="primary" disabled={saving}>{t("form.save")}</button>
          {entry && <button type="button" className="danger" onClick={onDelete}>{t("common.delete")}</button>}
          <span className={"status" + (status.kind ? " " + status.kind : "")} role="status">{status.text}</span>
        </div>
      </form>
    </section>
  );
}
