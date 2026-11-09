import { useMemo } from "react";
import { useI18n } from "../i18n";
import { num } from "../lib/format";
import { Wheel } from "./Wheel";

const MIN = 30;
const MAX = 250;
const FALLBACK = 100;

/** Two drums — whole kilograms and tenths — like hours and minutes on an alarm. */
export function WeightPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t, lang } = useI18n();
  const ints = useMemo(() => Array.from({ length: MAX - MIN + 1 }, (_, i) => String(MIN + i)), []);
  const decs = useMemo(() => Array.from({ length: 10 }, (_, i) => (lang === "uk" ? "," : ".") + i), [lang]);
  const w = num(value) ?? FALLBACK;
  const whole = Math.min(MAX, Math.max(MIN, Math.floor(w + 1e-9)));
  const tenth = Math.min(9, Math.max(0, Math.round((w - whole) * 10)));
  const emit = (a: number, b: number) => onChange((a + b / 10).toFixed(1));

  return (
    <div className="weight-picker">
      <Wheel items={ints} index={whole - MIN} onChange={(i) => emit(MIN + i, tenth)} label={t("form.weight") + " — " + t("form.weightWhole")} className="w-int" />
      <Wheel items={decs} index={tenth} onChange={(i) => emit(whole, i)} label={t("form.weight") + " — " + t("form.weightTenth")} className="w-dec" />
      <span className="weight-unit">{t("common.kg")}</span>
    </div>
  );
}
