import { useState } from "react";
import { type MessageKey, useI18n } from "../i18n";
import { rowFromMark, type HabitRow } from "../lib/dayForm";
import { defaultMeasure } from "../lib/habits";
import { num } from "../lib/format";
import type { Habit, HabitMeasure, MeasureType } from "../lib/types";
import { MEASURE_TYPES } from "../lib/types";
import { HabitMarker } from "./HabitMarker";

const UNITS = ["раз", "хв", "год", "км", "м", "кроків", "склянок", "мл", "г", "кг", "сторінок", "підходів"];

/** Habit builder: name, minimum version, answer type with its unit and limits, and a live preview. */
export function HabitEditor({ habit, onSave, onDelete }: { habit: Habit; onSave: (h: Habit) => void; onDelete?: () => void }) {
  const { t } = useI18n();
  const [h, setH] = useState<Habit>(habit);
  const [preview, setPreview] = useState<HabitRow>(rowFromMark(undefined));
  const m: HabitMeasure = h.measure ?? { type: "status" };
  const setM = (patch: Partial<HabitMeasure>) => setH((x) => ({ ...x, measure: { ...m, ...patch } }));
  const numField = (key: "min" | "max" | "step" | "target", label: string) => (
    <label className="field"><span>{label}</span>
      <input type="text" inputMode="decimal" value={m[key] ?? ""} onChange={(e) => setM({ [key]: e.target.value === "" ? undefined : num(e.target.value) ?? undefined })} />
    </label>
  );
  const changed = JSON.stringify(h) !== JSON.stringify(habit);

  return (
    <div className="habit-edit">
      <div className="seg full" role="radiogroup" aria-label={h.title}>
        <button type="button" role="radio" aria-checked={h.enabled} className={h.enabled ? "on" : ""} onClick={() => setH({ ...h, enabled: true, activeFrom: h.activeFrom ?? new Date().toISOString().slice(0, 10) })}>{t("habit.on")}</button>
        <button type="button" role="radio" aria-checked={!h.enabled} className={!h.enabled ? "on" : ""} onClick={() => setH({ ...h, enabled: false })}>{t("habit.off")}</button>
      </div>
      <label className="field"><span>{t("habit.name")}</span>
        <input type="text" maxLength={80} value={h.title} onChange={(e) => setH({ ...h, title: e.target.value })} />
      </label>
      <label className="field"><span>{t("habit.minVersion")}</span>
        <input type="text" maxLength={120} value={h.minVersion} onChange={(e) => setH({ ...h, minVersion: e.target.value })} />
      </label>

      <label className="field"><span>{t("hb.type")}</span>
        <select value={m.type} onChange={(e) => setH({ ...h, measure: e.target.value === "status" ? undefined : defaultMeasure(e.target.value as MeasureType) })}>
          {MEASURE_TYPES.map((k) => <option key={k} value={k}>{t(`hb.type.${k}` as MessageKey)}</option>)}
        </select>
      </label>
      {["count", "slider", "drum"].includes(m.type) && (
        <>
          <label className="field"><span>{t("hb.unit")}</span>
            <input type="text" list="hb-units" maxLength={20} value={m.unit ?? ""} onChange={(e) => setM({ unit: e.target.value })} />
            <datalist id="hb-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          </label>
          <div className="fields three">{numField("min", t("hb.min"))}{numField("max", t("hb.max"))}{numField("step", t("hb.step"))}</div>
          {numField("target", t("hb.target"))}
        </>
      )}
      {m.type === "scale" && (
        <label className="field"><span>{t("hb.scaleMax")}</span>
          <select value={m.max ?? 5} onChange={(e) => setM({ max: Number(e.target.value) })}>
            {[3, 4, 5, 7, 10].map((n) => <option key={n} value={n}>1–{n}</option>)}
          </select>
        </label>
      )}
      {m.type === "choice" && (
        <label className="field"><span>{t("habit.fieldOptions")}</span>
          <input type="text" maxLength={300} value={(m.options ?? []).join(", ")} onChange={(e) => setM({ options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })} />
        </label>
      )}

      <span className="sub-h">{t("hb.preview")}</span>
      <div className="preview"><HabitMarker habit={{ ...h, title: h.title || t("habit.name") }} row={preview} onChange={setPreview} /></div>

      <div className="pill-row">
        <button type="button" className="primary compact" disabled={!h.title.trim() || !changed} onClick={() => onSave({ ...h, title: h.title.trim(), minVersion: h.minVersion.trim() })}>{t("common.save")}</button>
        {onDelete && <button type="button" className="danger compact" onClick={() => confirm(t("hb.deleteConfirm")) && onDelete()}>{t("common.delete")}</button>}
      </div>
    </div>
  );
}
