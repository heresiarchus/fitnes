import type { ReactNode } from "react";
import { iso, parseIso } from "../lib/date";

/** Days of the month containing `month` (an ISO date), Monday first, padded to whole weeks. */
export function monthCells(month: string): (string | null)[] {
  const first = parseIso(month.slice(0, 8) + "01");
  const lead = (first.getDay() + 6) % 7;
  const len = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const out: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= len; d++) out.push(iso(new Date(first.getFullYear(), first.getMonth(), d)));
  while (out.length % 7) out.push(null);
  return out;
}

/** A month as a grid of day buttons; what each day shows and how it looks is up to the caller. */
export function MonthGrid({ month, lang, render, className, onPick, disabled }: {
  month: string; lang: string;
  render: (date: string) => { body?: ReactNode; className?: string; style?: React.CSSProperties; label?: string };
  className?: (date: string) => string;
  onPick: (date: string) => void;
  disabled?: (date: string) => boolean;
}) {
  const loc = lang === "uk" ? "uk-UA" : "en-GB";
  const wd = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(loc, { weekday: "short" }));
  return (
    <div className="mgrid">
      {wd.map((w) => <span key={w} className="mgrid-wd">{w}</span>)}
      {monthCells(month).map((d, i) => {
        if (!d) return <span key={"e" + i} />;
        const r = render(d);
        return (
          <button key={d} type="button" className={"mday " + (r.className ?? "") + " " + (className?.(d) ?? "")} style={r.style}
            disabled={disabled?.(d)} aria-label={r.label ?? d} onClick={() => onPick(d)}>
            <span className="mday-n">{Number(d.slice(8))}</span>
            {r.body}
          </button>
        );
      })}
    </div>
  );
}
