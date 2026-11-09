import type { Lang } from "./types";

const locale = (lang: Lang) => (lang === "uk" ? "uk-UA" : "en-GB");

export function fmt(n: number | null | undefined, lang: Lang, dec = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  const s = Number(n).toFixed(dec);
  return lang === "uk" ? s.replace(".", ",") : s;
}
export function fmtInt(n: number | null | undefined, lang: Lang): string {
  if (n == null || Number.isNaN(n)) return "—";
  return Math.round(n).toLocaleString(locale(lang));
}
/** Parses user input, accepting both "136,2" and "136.2". */
export function num(v: string | number | null | undefined): number | null {
  if (v === "" || v == null) return null;
  const n = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
export function monthName(isoDate: string, lang: Lang): string {
  const [y, m] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale(lang), { month: "long", year: "numeric" });
}
