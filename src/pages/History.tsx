import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { type MessageKey, useI18n } from "../i18n";
import { ddmm } from "../lib/date";
import { fmt, fmtInt } from "../lib/format";
import type { DaysMap } from "../lib/types";

const PAGE = 30;

export function History({ days }: { days: DaysMap }) {
  const { t, lang } = useI18n();
  const [limit, setLimit] = useState(PAGE);
  const all = Object.keys(days).sort().reverse();
  const dates = all.slice(0, limit);

  return (
    <section className="block">
      {!dates.length ? (
        <p className="empty">{t("history.empty")}</p>
      ) : (
        <div className="hist">
          {dates.map((d) => {
            const x = days[d];
            const parts: ReactNode[] = [];
            if (x.weight != null) parts.push(<span key="w"><b>{fmt(x.weight, lang)} {t("common.kg")}</b>{(x.weightCond ?? "morning") === "morning" ? "" : " " + t("history.notMorning")}</span>);
            if (x.steps != null) parts.push(<span key="s">{fmtInt(x.steps, lang)} {t("common.steps")}</span>);
            if (x.walkMin) parts.push(<span key="wk">{t("history.walk", { n: x.walkMin })}</span>);
            if (x.cardioMin) parts.push(<span key="c">{t("history.cardio", { n: x.cardioMin, what: x.cardioWhat || t("history.cardioDefault") })}</span>);
            return (
              <div className="hrow" key={d}>
                <span className="d">{ddmm(d)}<small>{d.slice(0, 4)}</small></span>
                <span className="s">
                  {!!x.strength?.length && <span className="tag">{t("history.strength", { n: x.strength.length })}</span>}
                  {x.bp && <span className="tag">{t("history.bp")}</span>}
                  {!!x.flags?.length && <span className="tag bad">{x.flags.map((f) => t(`flag.${f}` as MessageKey)).join(", ")}</span>}
                  {parts.length ? parts.flatMap((p, i) => (i ? [" · ", p] : [p])) : t("history.noNumbers")}
                  {x.note && <span className="hnote">{x.note}</span>}
                </span>
                <Link className="link" to={`/log?date=${d}`}>{t("common.edit")}</Link>
              </div>
            );
          })}
        </div>
      )}
      {all.length > limit && (
        <div className="row"><button type="button" onClick={() => setLimit(limit + PAGE)}>{t("history.showMore")}</button></div>
      )}
    </section>
  );
}
