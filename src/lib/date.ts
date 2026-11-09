const pad = (n: number) => (n < 10 ? "0" : "") + n;

export function iso(d: Date): string {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
export function parseIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}
export function mondayOf(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}
export function ddmm(s: string): string {
  const p = s.split("-");
  return p[2] + "." + p[1];
}
export function daysBetween(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 864e5);
}
export function rangeDates(startIso: string, count: number): string[] {
  const start = parseIso(startIso);
  return Array.from({ length: count }, (_, i) => iso(addDays(start, i)));
}
/** Monday–Sunday of the week `offset` weeks from the week containing `today`. */
export function weekDates(offset: number, today = new Date()): string[] {
  return rangeDates(iso(addDays(mondayOf(today), offset * 7)), 7);
}
/** All days of the month `offset` months from the month containing `today`. */
export function monthDates(offset: number, today = new Date()): string[] {
  const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const len = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return rangeDates(iso(first), len);
}
