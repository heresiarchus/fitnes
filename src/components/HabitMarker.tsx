import { useI18n } from "../i18n";
import type { HabitRow } from "../lib/dayForm";
import { fmt } from "../lib/format";
import type { Habit } from "../lib/types";
import { HABIT_STATUSES } from "../lib/types";
import { ChipScale } from "./ChipScale";
import { Head } from "./Head";
import { Stepper } from "./Stepper";
import { Wheel } from "./Wheel";

interface Props {
  habit: Habit;
  row: HabitRow;
  onChange: (row: HabitRow) => void;
  /** Shown instead of the buttons' feedback, e.g. "taken from logged movement". */
  note?: string;
}

/** One habit, answered with the control chosen in the habit builder. No streaks, no counters. */
export function HabitMarker({ habit, row, onChange, note }: Props) {
  const { t, lang } = useI18n();
  const m = habit.measure;
  const type = m?.type ?? "status";
  const did = row.status === "done" || row.status === "min";
  const setValue = (v: string) => onChange({ ...row, value: v, status: row.status === "rest" ? "" : row.status });
  const unit = m?.unit ? ` ${m.unit}` : "";
  const min = m?.min ?? 0, max = m?.max ?? 10, step = m?.step || 1;

  let control;
  if (type === "status") {
    control = (
      <div className="seg full" role="radiogroup" aria-label={habit.title}>
        {HABIT_STATUSES.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={row.status === s} className={row.status === s ? "on" : ""}
            onClick={() => onChange({ ...row, status: row.status === s ? "" : s })}>{t(`habit.status.${s}`)}</button>
        ))}
      </div>
    );
  } else if (type === "yesno") {
    control = (
      <div className="seg full" role="radiogroup" aria-label={habit.title}>
        {(["yes", "no"] as const).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={row.value === v} className={row.value === v ? "on" : ""}
            onClick={() => setValue(row.value === v ? "" : v)}>{t(v === "yes" ? "ctx.yes" : "ctx.no")}</button>
        ))}
      </div>
    );
  } else if (type === "count") {
    control = <div className="measure-row"><Stepper value={row.value} onChange={setValue} step={step} min={min} max={max} decimals={step < 1 ? 1 : 0} label={habit.title} />{unit && <span className="unit">{m!.unit}</span>}</div>;
  } else if (type === "slider") {
    const v = row.value === "" ? min : Number(row.value);
    control = (
      <div className="rate">
        <input type="range" min={min} max={max} step={step} value={v} aria-label={habit.title}
          style={{ ["--p" as string]: `${((v - min) / Math.max(1, max - min)) * 100}%` }} onChange={(e) => setValue(e.target.value)} />
        <output>{row.value === "" ? "—" : fmt(v, lang, step < 1 ? 1 : 0)}<small>{unit}</small></output>
      </div>
    );
  } else if (type === "drum") {
    const items: string[] = [];
    for (let x = min; x <= max + 1e-9 && items.length < 500; x += step) items.push(fmt(x, lang, step < 1 ? 1 : 0));
    const idx = row.value === "" ? 0 : Math.round((Number(row.value) - min) / step);
    control = (
      <div className={"measure-drum" + (row.value === "" ? " pending" : "")}>
        <Wheel items={items} index={Math.max(0, Math.min(items.length - 1, idx))} onChange={(i) => setValue(String(Math.round((min + i * step) * 100) / 100))} label={habit.title} />
        {unit && <span className="unit">{m!.unit}</span>}
      </div>
    );
  } else if (type === "scale") {
    const n = Math.max(2, Math.min(10, m?.max ?? 5));
    control = <ChipScale value={row.value} onChange={setValue} values={Array.from({ length: n }, (_, i) => i + 1)} label={habit.title} />;
  } else {
    control = (
      <div className="choice-row" role="radiogroup" aria-label={habit.title}>
        {(m?.options ?? []).map((o) => (
          <button key={o} type="button" role="radio" aria-checked={row.value === o} className={"chip" + (row.value === o ? " on" : "")} onClick={() => setValue(row.value === o ? "" : o)}>{o}</button>
        ))}
      </div>
    );
  }

  return (
    <div className={"habit" + (row.status ? " marked s-" + row.status : "")}>
      <Head as="label" title={<b className="habit-title">{habit.title}</b>} help={habit.minVersion ? t("habit.min", { min: habit.minVersion }) : undefined} />
      {control}
      {type !== "status" && (
        <div className="pill-row">
          <button type="button" className={"pill" + (row.status === "rest" ? " on" : "")} onClick={() => onChange({ ...row, value: "", status: row.status === "rest" ? "" : "rest" })}>{t("habit.status.rest")}</button>
          {m?.target ? <span className="status">{t("habit.target", { n: m.target, unit })}</span> : null}
        </div>
      )}
      {row.status === "rest" ? <span className="status">{t("habit.say.rest")}</span> : type === "status" && row.status ? <span className="status">{t(`habit.say.${row.status}`)}</span> : note ? <span className="status">{note}</span> : null}
      {did && type === "status" && !!habit.fields?.length && (
        <div className="fields two">
          {habit.fields.map((f) => (
            <label className="field" key={f.key}><span>{f.label}</span>
              <select value={row.extra[f.key] ?? ""} onChange={(e) => onChange({ ...row, extra: { ...row.extra, [f.key]: e.target.value } })}>
                <option value="">—</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      {row.status === "no" && type === "status" && (
        <input key="r" type="text" maxLength={120} placeholder={t("habit.reason")} aria-label={t("habit.reason")}
          defaultValue={row.reason} onBlur={(e) => e.target.value !== row.reason && onChange({ ...row, reason: e.target.value })} />
      )}
    </div>
  );
}
