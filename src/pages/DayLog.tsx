import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChipScale } from "../components/ChipScale";
import { SyncBadge } from "../components/SyncBadge";
import { Head } from "../components/Head";
import { Stepper } from "../components/Stepper";
import { WeightPicker } from "../components/WeightPicker";
import { deleteDay, saveDay } from "../db";
import { type MessageKey, useI18n } from "../i18n";
import { addDays, ddmm, iso, parseIso } from "../lib/date";
import { type DayFormState, fromFormState, missingRequired, type SetRow, toFormState } from "../lib/dayForm";
import { fmt, num } from "../lib/format";
import { lastStrengthFor, previousBp, previousWeight, previousWorkout } from "../lib/stats";
import type { BpSlot, DayEntry, DaysMap, Flag, PainArea, Settings } from "../lib/types";
import { BP_SLOTS, EXERCISES, FLAGS, HEART_FLAGS, PAIN_AREAS } from "../lib/types";

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

type Status = { text: string; kind?: "ok" | "err" };

function cardioKindOf(what: string, t: (k: MessageKey) => string, hasMinutes: boolean): string {
  const w = what.trim().toLowerCase();
  for (const k of CARDIO) if (w === t(`cardio.${k}` as MessageKey).toLowerCase()) return k;
  return w || hasMinutes ? "other" : "";
}

function DayForm({ date, today, entry, days, settings, onDate }: FormProps) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const prevW = previousWeight(days, date);
  const [f, setF] = useState<DayFormState>(() => toFormState(entry, settings.phase === "1" ? "light" : "moderate", prevW?.weight ?? null));
  const [cardioKind, setCardioKind] = useState(() => cardioKindOf(entry?.cardioWhat ?? "", t, entry?.cardioMin != null));
  const [status, setStatus] = useState<Status>(entry ? { text: t("form.exists") } : { text: "" });
  const [saving, setSaving] = useState(false);
  const bpWeek = date >= settings.startDate && date < iso(addDays(parseIso(settings.startDate), 7));
  const [bpOpen, setBpOpen] = useState(!!entry?.bp || bpWeek);
  const lastWorkout = previousWorkout(days, date);
  const lastBp = previousBp(days, date);

  useEffect(() => {
    if (status.kind !== "ok") return;
    const id = setTimeout(() => setStatus({ text: "" }), 4000);
    return () => clearTimeout(id);
  }, [status]);

  const set = <K extends keyof DayFormState>(k: K, v: DayFormState[K]) => setF((p) => ({ ...p, [k]: v }));
  const setEx = (id: string, k: keyof SetRow, v: string) => setF((p) => ({ ...p, ex: { ...p.ex, [id]: { ...p.ex[id], [k]: v } } }));
  const setCustom = (i: number, k: "name" | keyof SetRow, v: string) => setF((p) => ({ ...p, custom: p.custom.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  const setBp = (slot: BpSlot, k: "sys" | "dia" | "pulse", v: string) => setF((p) => ({ ...p, bp: { ...p.bp, [slot]: { ...p.bp[slot], [k]: v } } }));
  const setPain = (a: PainArea, v: string) => setF((p) => ({ ...p, pain: { ...p.pain, [a]: v } }));
  const toggleFlag = (fl: Flag) => setF((p) => ({ ...p, ok: false, flags: p.flags.includes(fl) ? p.flags.filter((x) => x !== fl) : [...p.flags, fl] }));
  /** One tap: no warning signs, and pain 0 wherever it wasn't set. */
  const allOk = () => setF((p) => ({
    ...p, ok: true, flags: [],
    pain: Object.fromEntries(PAIN_AREAS.map((a) => [a, p.pain[a] === "" ? "0" : p.pain[a]])) as DayFormState["pain"],
  }));
  const weightRef = useRef<HTMLFieldSetElement>(null);
  const feelingRef = useRef<HTMLFieldSetElement>(null);
  const [checked, setChecked] = useState(false);
  const missing = checked ? missingRequired(f) : [];

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const miss = missingRequired(f);
    if (miss.length) {
      setChecked(true);
      setStatus({ text: t(miss[0] === "weight" ? "form.needWeight" : "form.needFeeling"), kind: "err" });
      (miss[0] === "weight" ? weightRef : feelingRef).current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const data = fromFormState(date, f);
    if (!data) { setStatus({ text: t("form.empty"), kind: "err" }); return; }
    setSaving(true);
    try {
      await saveDay(data);
      setStatus({ text: t("form.saved", { d: ddmm(date) }), kind: "ok" });
    } catch (err) {
      setStatus({ text: t("form.error", { e: (err as Error).message }), kind: "err" });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm(t("form.deleteConfirm", { d: ddmm(date) }))) return;
    await deleteDay(date);
    navigate("/history");
  }

  const shift = (n: number) => onDate(iso(addDays(parseIso(date), n)));

  return (
    <section className="block">
      <Head title={t("form.title")} help={t("help.save")} />
      <div className="pnav">
        <button type="button" aria-label={t("form.prevDay")} onClick={() => shift(-1)}>‹</button>
        <div className="pnav-mid">
          <input type="date" aria-label={t("form.date")} value={date} max={today} onChange={(e) => e.target.value && onDate(e.target.value)} />
          {date !== today && <button type="button" className="link" onClick={() => onDate(today)}>{t("form.today")}</button>}
        </div>
        <button type="button" aria-label={t("form.nextDay")} onClick={() => shift(1)} disabled={date >= today}>›</button>
      </div>
      <form onSubmit={onSubmit} noValidate>
        <fieldset ref={weightRef} className={missing.includes("weight") ? "need" : ""}>
          <Head as="legend" title={<>{t("form.weight")}<span className="req">{t("form.required")}</span></>} help={t("help.weight")} />
          <div className={"weight-box" + (f.weightChoice === "yes" ? "" : " pending")}>
            <WeightPicker value={f.weight} onChange={(v) => setF((p) => ({ ...p, weight: v, weightChoice: "yes" }))} />
            <div className="weight-side">
              {f.weightChoice === "yes" && (
                <>
                  <span className="status ok">✓ {t("form.weightWillSave")}{settings.sources.weight && entry?.weight != null ? " · " + t("form.fromSamsung") : ""}</span>
                  <button type="button" className="link" onClick={() => set("weightChoice", "no")}>{t("form.weightRemove")}</button>
                </>
              )}
              {f.weightChoice === "no" && (
                <>
                  <span className="status ok">✓ {t("form.noWeightChosen")}</span>
                  <button type="button" className="link" onClick={() => set("weightChoice", "yes")}>{t("form.weighAfterAll")}</button>
                </>
              )}
              {f.weightChoice === "pending" && (
                <>
                  <span className="status">{prevW ? t("form.weightPrefill", { d: ddmm(prevW.date) }) : t("form.weightFirst")}</span>
                  <div className="actions">
                    {prevW && <button type="button" className="primary" onClick={() => setF((p) => ({ ...p, weight: p.weight || String(prevW.weight), weightChoice: "yes" }))}>{t("form.weightSame")} {fmt(num(f.weight) ?? prevW.weight, lang)}</button>}
                    <button type="button" onClick={() => set("weightChoice", "no")}>{t("form.weightRemove")}</button>
                  </div>
                </>
              )}
              <label className="field"><span>{t("form.weightCond")}</span>
                <select value={f.weightCond} onChange={(e) => set("weightCond", e.target.value as DayFormState["weightCond"])}>
                  <option value="morning">{t("form.weightCond.morning")}</option>
                  <option value="other">{t("form.weightCond.other")}</option>
                </select>
              </label>
            </div>
          </div>
          {missing.includes("weight") && <p className="status err" style={{ margin: 0 }}>{t("form.needWeight")}</p>}
        </fieldset>

        <fieldset>
          <Head as="legend" title={<>{t("form.steps")}{settings.sources.steps && <span className="src-tag">{t("form.fromSamsung")}</span>}</>} help={settings.sources.steps ? t("form.stepsHint") : undefined} />
          <Stepper value={f.steps} onChange={(v) => set("steps", v)} step={500} max={100000} label={t("form.steps")} />
        </fieldset>

        <fieldset>
          <Head as="legend" title={<>{t("form.cardioBlock")}{settings.sources.exercise && <span className="src-tag">{t("form.fromSamsung")}</span>}</>} />
          <div className="fields">
            <div className="field"><span>{t("form.walk")}</span>
              <Stepper value={f.walk} onChange={(v) => set("walk", v)} step={5} max={600} label={t("form.walk")} />
            </div>
            <label className="field"><span>{t("form.walkInt")}</span>
              <select value={f.walkInt} onChange={(e) => set("walkInt", e.target.value as DayFormState["walkInt"])}>
                <option value="light">{t("form.walkInt.light")}</option>
                <option value="moderate">{t("form.walkInt.moderate")}</option>
              </select>
            </label>
          </div>
          <ChipScale value={f.walk} onChange={(v) => set("walk", v)} values={WALK_QUICK} label={t("form.walk")} />
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
        </fieldset>

        <fieldset>
          <Head as="legend" title={t("form.strength")} help={t("form.strengthHint")} />
          {lastWorkout && (
            <div className="actions"><button type="button" onClick={repeatWorkout}>↻ {t("form.repeatWorkout", { d: ddmm(lastWorkout.date) })}</button></div>
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
          <div className="row">
            <button type="button" className="link" onClick={() => set("custom", [...f.custom, { key: Date.now(), name: "", sets: "", reps: "", kg: "" }])}>{t("form.addCustom")}</button>
          </div>
        </fieldset>

        <fieldset ref={feelingRef} className={missing.includes("feeling") ? "need" : ""}>
          <Head as="legend" title={<>{t("form.feeling")}<span className="req">{t("form.required")}</span></>} />
          <div className="actions">
            <button type="button" className={f.ok && !f.flags.length ? "primary" : ""} aria-pressed={f.ok && !f.flags.length} onClick={allOk}>✓ {t("form.allOk")}</button>
          </div>
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
          {missing.includes("feeling") && <p className="status err" style={{ margin: 0 }}>{t("form.needFeeling")}</p>}
          {heart && <div className="alert" role="alert"><b>{t("form.alertHeartTitle")}</b> {t("form.alertHeart")}</div>}
          {foot && <div className="alert" role="alert"><b>{t("form.alertFootTitle")}</b> {t("form.alertFoot")}</div>}
        </fieldset>

        <details open={bpOpen} onToggle={(e) => setBpOpen((e.target as HTMLDetailsElement).open)}>
          <summary>{t("form.bp")}</summary>
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
          <p className="help-text" style={{ marginTop: 8 }}>{t("form.bpHint")}</p>
        </details>

        <label className="field"><span>{t("form.note")}</span>
          <textarea maxLength={1000} value={f.note} placeholder={t("form.notePh")} onChange={(e) => set("note", e.target.value)} />
        </label>

        <div className="savebar">
          <button type="submit" className="primary" disabled={saving}>{t("form.save")}</button>
          {entry && <button type="button" className="danger" onClick={onDelete}>{t("common.delete")}</button>}
          <span className={"status" + (status.kind ? " " + status.kind : "")} role="status">{status.text}</span>
        </div>
        <SyncBadge />
      </form>
    </section>
  );
}

