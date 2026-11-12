import type { ReactNode } from "react";

const ICONS = {
  weight: "M6 4h12l2 16H4zM9 9a3 3 0 0 1 6 0M12 9l1.5-2",
  watch: "M8 3h8l1 4H7zM7 17h10l-1 4H8zM12 9v3l2 1M6 7h12v10H6z",
  habits: "M4 12l5 5L20 6",
  move: "M13 4a2 2 0 1 0 0 .01M10 21l2-7 3 3v4M9 11l3-3 3 2 3 1M8 14l-2 3",
  strength: "M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10zM5 12h3l2-3 2 5 2-2h5",
  moon: "M20 14a8 8 0 1 1-10-10 6 6 0 0 0 10 10z",
  diary: "M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM9 9h6M9 13h6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  sync: "M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5",
  palette: "M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-1.2 1-2 2-2h1a4 4 0 0 0 4-4c0-5.5-4-10-9-10zM7.5 11h.01M10 7h.01M15 7h.01",
  data: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  table: "M4 5h16v14H4zM4 10h16M10 5v14",
  task: "M9 11l3 3 8-8M20 12v7H4V5h11",
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[name]} /></svg>;
}

interface Props {
  icon: IconName;
  title: ReactNode;
  /** One short line under the title. */
  sub?: ReactNode;
  /** Small chip on the right: what is done or still to do. */
  status?: { text: string; tone?: "ok" | "todo" };
  /** Collapsible card (closed unless `open`). */
  fold?: boolean;
  open?: boolean;
  children?: ReactNode;
  id?: string;
}

/** A section of the screen: icon, title, status chip, then its content. */
export function Card({ icon, title, sub, status, fold, open, children, id }: Props) {
  const head = (
    <div className="card-h">
      <span className="card-ic"><Icon name={icon} /></span>
      <span className="card-t"><h2>{title}</h2>{sub && <small>{sub}</small>}</span>
      {status && <span className={"card-st" + (status.tone ? " " + status.tone : "")}>{status.text}</span>}
      {fold && <svg className="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>}
    </div>
  );
  if (fold) {
    return (
      <section className="block fold" id={id}>
        <details open={open}>
          <summary>{head}</summary>
          <div className="card-b">{children}</div>
        </details>
      </section>
    );
  }
  return <section className="block" id={id}>{head}{children}</section>;
}
