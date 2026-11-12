import { useI18n } from "../i18n";
import type { HabitRow } from "../lib/dayForm";
import type { Habit } from "../lib/types";
import { HABIT_STATUSES } from "../lib/types";
import { Head } from "./Head";

interface Props {
  habit: Habit;
  row: HabitRow;
  onChange: (row: HabitRow) => void;
  /** Shown instead of the buttons' feedback, e.g. "taken from logged movement". */
  note?: string;
}

/** One habit: four one-tap statuses, then optional details. No streaks, no counters. */
export function HabitMarker({ habit, row, onChange, note }: Props) {
  const { t } = useI18n();
  const did = row.status === "done" || row.status === "min";
  return (
    <div className={"habit" + (row.status ? " marked s-" + row.status : "")}>
      <Head as="label" title={<b className="habit-title">{habit.title}</b>} help={t("habit.min", { min: habit.minVersion })} />
      <div className="seg full" role="radiogroup" aria-label={habit.title}>
        {HABIT_STATUSES.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={row.status === s} className={row.status === s ? "on" : ""}
            onClick={() => onChange({ ...row, status: row.status === s ? "" : s })}>
            {t(`habit.status.${s}`)}
          </button>
        ))}
      </div>
      {row.status ? <span className="status">{t(`habit.say.${row.status}`)}</span> : note ? <span className="status">{note}</span> : null}
      {did && !!habit.fields?.length && (
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
      {did && (
        <input key={"d" + row.status} type="text" maxLength={120} placeholder={t("habit.detail")} aria-label={t("habit.detail")}
          defaultValue={row.detail} onBlur={(e) => e.target.value !== row.detail && onChange({ ...row, detail: e.target.value })} />
      )}
      {row.status === "no" && (
        <input key="r" type="text" maxLength={120} placeholder={t("habit.reason")} aria-label={t("habit.reason")}
          defaultValue={row.reason} onBlur={(e) => e.target.value !== row.reason && onChange({ ...row, reason: e.target.value })} />
      )}
    </div>
  );
}
