import { Link } from "react-router-dom";
import { GradientRing } from "./Brand";
import { Icon } from "./Card";
import { type MessageKey, useI18n } from "../i18n";
import { fmt, fmtInt } from "../lib/format";
import { GOAL_DEFS, goalProgress } from "../lib/goals";
import type { DayEntry, Settings } from "../lib/types";

/** Today's goals, like the activity rings in Samsung Health. */
export function GoalsCard({ settings, day }: { settings: Settings; day: DayEntry | undefined }) {
  const { t, lang } = useI18n();
  const goals = goalProgress(settings, day);
  if (!goals.length) return null;
  const show = (metric: string, v: number | null) => {
    if (v == null) return "—";
    const def = GOAL_DEFS.find((g) => g.metric === metric)!;
    return def.step < 1 ? fmt(v, lang) : fmtInt(v, lang);
  };
  return (
    <section className="block goals" data-c="move">
      <div className="head-row"><span className="head-line"><span className="card-ic"><Icon name="move" /></span><h2>{t("goals.today")}</h2></span><Link className="link" to="/settings/goals">{t("goals.edit")}</Link></div>
      <div className="goal-grid">
        {goals.map((g) => {
          const def = GOAL_DEFS.find((d) => d.metric === g.metric)!;
          return (
            <Link className={"goal" + (g.done ? " done" : "")} key={g.metric} data-c={g.metric} to={`/m/${g.metric === "steps" ? "steps" : g.metric === "sleepH" ? "sleep" : "active"}`}>
              <GradientRing pct={g.pct} done={g.done} metric={g.metric} label={g.done ? "✓" : `${g.pct}%`} />
              <b>{show(g.metric, g.value)}</b>
              <small>{t(`goal.${g.metric}` as MessageKey)} · {show(g.metric, g.target)}{def.unit ? ` ${def.unit}` : ""}</small>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
