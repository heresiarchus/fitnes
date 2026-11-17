import { addDays, iso, monthDates, parseIso, rangeDates, weekDates } from "./date";
import { datesBetween } from "./analytics";

/** Calendar periods for the metric screens; arrows step a whole period back or forward. */
export type Span = "week" | "month" | "quarter" | "year" | "all" | "custom";
export const SPANS: Span[] = ["week", "month", "quarter", "year", "all", "custom"];

export interface Period { span: Span; dates: string[]; prev: string[]; from: string; to: string }

const clip = (dates: string[], today: string) => dates.filter((d) => d <= today);

/**
 * The days of the period `offset` steps back (0 = the current one, cut at today) and the whole
 * period before it, for the comparison.
 */
export function period(span: Span, offset: number, opts: { today?: Date; first?: string; from?: string; to?: string } = {}): Period {
  const now = opts.today ?? new Date();
  const today = iso(now);
  let full: string[], prev: string[];
  if (span === "week") {
    full = weekDates(-offset, now); prev = weekDates(-offset - 1, now);
  } else if (span === "month") {
    full = monthDates(-offset, now); prev = monthDates(-offset - 1, now);
  } else if (span === "quarter") {
    full = [-2, -1, 0].flatMap((k) => monthDates(-offset * 3 + k, now));
    prev = [-2, -1, 0].flatMap((k) => monthDates(-offset * 3 - 3 + k, now));
  } else if (span === "year") {
    const y = now.getFullYear() - offset;
    full = datesBetween(`${y}-01-01`, `${y}-12-31`); prev = datesBetween(`${y - 1}-01-01`, `${y - 1}-12-31`);
  } else if (span === "all") {
    full = datesBetween(opts.first && opts.first < today ? opts.first : iso(addDays(now, -29)), today); prev = [];
  } else {
    const from = opts.from ?? iso(addDays(now, -29)), to = opts.to && opts.to >= from ? opts.to : today;
    const len = datesBetween(from, to).length;
    const shift = offset * len;
    full = rangeDates(iso(addDays(parseIso(from), -shift)), len);
    prev = rangeDates(iso(addDays(parseIso(from), -shift - len)), len);
  }
  const dates = clip(full, today);
  return { span, dates, prev, from: full[0], to: full[full.length - 1] };
}
