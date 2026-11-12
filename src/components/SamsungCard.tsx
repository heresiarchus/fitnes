import { pullHealth } from "../health";
import { useHealthState } from "../db";
import { useI18n } from "../i18n";
import { fmt, fmtInt } from "../lib/format";
import { bpSummary } from "../lib/stats";
import type { DayEntry, Settings } from "../lib/types";
import { fromWatch } from "../lib/types";
import { isNative } from "../native";
import { Card } from "./Card";

/** Everything that came from Samsung Health for one day, in one block. */
export function SamsungCard({ entry, settings, onNoWeight }: { entry: DayEntry | undefined; settings: Settings; onNoWeight?: () => void }) {
  const { t, lang } = useI18n();
  const health = useHealthState();
  if (!settings.healthLinked || !Object.values(settings.sources).some(Boolean)) return null;
  const on = (k: Parameters<typeof fromWatch>[1]) => fromWatch(settings, k);
  const wait = t("watch.waitShort");
  const b = bpSummary(entry);
  const bpText = [b.morning, b.evening].filter(Boolean).map((x) => `${x!.sys}/${x!.dia}`).join(" · ");
  const tiles: [string, string | null][] = [];
  if (on("steps")) tiles.push([t("cal.day.steps"), entry?.steps != null ? fmtInt(entry.steps, lang) : null]);
  if (on("exercise")) {
    tiles.push([t("cal.day.walk"), entry?.walkMin ? `${entry.walkMin} ${t("common.min")}` : null]);
    if (entry?.cardioMin) tiles.push([entry.cardioWhat || t("cal.day.cardio"), `${entry.cardioMin} ${t("common.min")}`]);
  }
  if (on("weight")) tiles.push([t("cal.day.weight"), entry?.weight != null ? `${fmt(entry.weight, lang)} ${t("common.kg")}` : entry?.noWeight ? t("form.noWeightChosen") : null]);
  if (on("bp")) tiles.push([t("cal.day.bp"), bpText || null]);
  if (on("sleep")) {
    tiles.push([t("cal.day.sleep"), entry?.sleepMin ? `${Math.floor(entry.sleepMin / 60)}:${String(entry.sleepMin % 60).padStart(2, "0")}` : null]);
    if (entry?.restingHr) tiles.push([t("cal.day.restingHr"), String(entry.restingHr)]);
  }
  const updated = health?.lastPullAt ? new Date(health.lastPullAt).toTimeString().slice(0, 5) : null;
  return (
    <Card icon="watch" title="Samsung Health" sub={t("watch.note")} status={{ text: "SH" }}>
      <div className="sh-tiles">
        {tiles.map(([label, v]) => (
          <div className={"sh-tile" + (v == null ? " wait" : "")} key={label}><span>{label}</span><b>{v ?? wait}</b></div>
        ))}
      </div>
      <div className="sh-note">
        <span>{updated ? t("watch.updated", { t: updated }) : isNative ? "" : t("watch.viaPhone")}</span>
        {on("weight") && entry?.weight == null && !entry?.noWeight && onNoWeight && <button type="button" className="pill" onClick={onNoWeight}>{t("form.weightRemove")}</button>}
        {isNative && <button type="button" className="pill" onClick={() => void pullHealth(7)}>{t("watch.refresh")}</button>}
      </div>
    </Card>
  );
}
