import { useMemo } from "react";
import { useI18n } from "../i18n";
import { num } from "../lib/format";
import { Wheel } from "./Wheel";

const MIN = 30;
const MAX = 250;
const FALLBACK = 100;
/** The fraction drum steps by 0.05 kg, like the scale (135,40 · 135,45 · 135,50). */
const STEPS = 20;

/** Two drums — whole kilograms and hundredths in 0.05 steps — like hours and minutes on an alarm. */
export function WeightPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t, lang } = useI18n();
  const ints = useMemo(() => Array.from({ length: MAX - MIN + 1 }, (_, i) => String(MIN + i)), []);
  const decs = useMemo(() => Array.from({ length: STEPS }, (_, i) => (lang === "uk" ? "," : ".") + String(i * 5).padStart(2, "0")), [lang]);
  const w = num(value) ?? FALLBACK;
  const whole = Math.min(MAX, Math.max(MIN, Math.floor(w + 1e-9)));
  const part = Math.min(STEPS - 1, Math.max(0, Math.round((w - whole) * STEPS)));
  const emit = (a: number, b: number) => onChange(String(Math.round((a + b / STEPS) * 100) / 100));

  return (
    <div className="weight-picker">
      <Wheel items={ints} index={whole - MIN} onChange={(i) => emit(MIN + i, part)} label={t("form.weight") + " — " + t("form.weightWhole")} className="w-int" />
      <Wheel items={decs} index={part} onChange={(i) => emit(whole, i)} label={t("form.weight") + " — " + t("form.weightTenth")} className="w-dec" />
      <span className="weight-unit">{t("common.kg")}</span>
    </div>
  );
}
