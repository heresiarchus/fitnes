import { Link } from "react-router-dom";
import { type MessageKey, useI18n } from "../i18n";
import { fmt, fmtInt } from "../lib/format";
import { GOAL_DEFS, goalProgress } from "../lib/goals";
import type { DayEntry, Settings } from "../lib/types";

/** Progress ring: the filled share of the circle is the share of the goal reached. */
function Ring({ pct, done }: { pct: number; done: boolean }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg className={"ring" + (done ? " done" : "")} viewBox="0 0 64 64" aria-hidden="true">
      <circle className="ring-bg" cx="32" cy="32" r={r} />
      <circle className="ring-fg" cx="32" cy="32" r={r} strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle">{done ? "✓" : `${pct}%`}</text>
    </svg>
  );
}

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
    <section className="block goals">
      <div className="head-row"><h2>{t("goals.today")}</h2><Link className="link" to="/settings/goals">{t("goals.edit")}</Link></div>
      <div className="goal-grid">
        {goals.map((g) => {
          const def = GOAL_DEFS.find((d) => d.metric === g.metric)!;
          return (
            <div className="goal" key={g.metric}>
              <Ring pct={g.pct} done={g.done} />
              <b>{show(g.metric, g.value)}</b>
              <small>{t(`goal.${g.metric}` as MessageKey)} · {show(g.metric, g.target)}{def.unit ? ` ${def.unit}` : ""}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}
