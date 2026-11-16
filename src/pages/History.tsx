import { Fragment, type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { type MessageKey, useI18n } from "../i18n";
import { Icon } from "../components/Card";
import { ddmm } from "../lib/date";
import { fmtInt, fmtKg } from "../lib/format";
import type { DaysMap } from "../lib/types";

const PAGE = 30;

export function History({ days }: { days: DaysMap }) {
  const { t, lang } = useI18n();
  const locale = lang === "uk" ? "uk-UA" : "en-GB";
  const [limit, setLimit] = useState(PAGE);
  const all = Object.keys(days).sort().reverse();
  const dates = all.slice(0, limit);

  return (
    <section className="block">
      {!dates.length ? (
        <p className="empty">{t("history.empty")}</p>
      ) : (
        <div className="hist">
          {dates.map((d, i) => {
            const x = days[d];
            const when = new Date(d + "T12:00:00");
            const month = d.slice(0, 7);
            const chips: ReactNode[] = [];
            if (x.weight != null) chips.push(<span key="w" className="hchip" data-c="weight"><b>{fmtKg(x.weight, lang)}</b> {t("common.kg")}{(x.weightCond ?? "morning") === "morning" ? "" : " · " + t("history.notMorning")}</span>);
            if (x.steps != null) chips.push(<span key="s" className="hchip" data-c="steps"><b>{fmtInt(x.steps, lang)}</b> {t("common.steps")}</span>);
            if (x.walkMin) chips.push(<span key="wk" className="hchip" data-c="move">{t("history.walk", { n: x.walkMin })}</span>);
            if (x.cardioMin) chips.push(<span key="c" className="hchip" data-c="move">{t("history.cardio", { n: x.cardioMin, what: x.cardioWhat || t("history.cardioDefault") })}</span>);
            if (x.strength?.length) chips.push(<span key="st" className="hchip" data-c="strength">{t("history.strength", { n: x.strength.length })}</span>);
            if (x.bp) chips.push(<span key="bp" className="hchip" data-c="heart">{t("history.bp")}</span>);
            if (x.flags?.length) chips.push(<span key="f" className="hchip bad">{x.flags.map((f) => t(`flag.${f}` as MessageKey)).join(", ")}</span>);
            return (
              <Fragment key={d}>
                {(i === 0 || dates[i - 1].slice(0, 7) !== month) && (
                  <h3 className="hmonth">{when.toLocaleDateString(locale, { month: "long", year: "numeric" })}</h3>
                )}
                <div className="hrow">
                  <span className="hday"><b>{when.getDate()}</b><small>{when.toLocaleDateString(locale, { weekday: "short" })}</small></span>
                  <span className="hbody">
                    {chips.length ? <span className="hchips">{chips}</span> : <span className="status">{t("history.noNumbers")}</span>}
                    {x.note && <span className="hnote">{x.note}</span>}
                  </span>
                  <Link className="hedit" to={`/log?date=${d}`} aria-label={`${t("common.edit")} ${ddmm(d)}`}><Icon name="edit" /></Link>
                </div>
              </Fragment>
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
