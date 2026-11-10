import { createContext, useContext, type ReactNode } from "react";
import type { Lang } from "../lib/types";
import { en } from "./en";
import { uk, type MessageKey } from "./uk";

export type { MessageKey };
export type Vars = Record<string, string | number>;
export type TFn = (key: MessageKey, vars?: Vars) => string;

const dicts: Record<Lang, Record<MessageKey, string>> = { uk, en };

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  let s = dicts[lang][key] ?? uk[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split("{" + k + "}").join(String(v));
  return s;
}

export const makeT = (lang: Lang): TFn => (key, vars) => translate(lang, key, vars);

const I18nContext = createContext<{ lang: Lang; t: TFn }>({ lang: "uk", t: makeT("uk") });

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <I18nContext.Provider value={{ lang, t: makeT(lang) }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
