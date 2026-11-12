import { type ReactNode, useId, useState } from "react";

interface Props {
  title: ReactNode;
  /** Explanation hidden behind the "?" button. */
  help?: ReactNode;
  /** Text for the help button instead of "?" (e.g. "How to connect"). */
  helpLabel?: string;
  /** A short always-visible line under the title (preferred over hidden help). */
  sub?: ReactNode;
  /** Extra content on the right side of the heading row. */
  right?: ReactNode;
  as?: "h1" | "h2" | "legend" | "label";
}

/** Heading with optional help text that stays hidden until asked for. */
export function Head({ title, help, helpLabel, right, sub, as = "h2" }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const btn = help ? (
    <button type="button" className={helpLabel ? "help-link" : "help-btn"} aria-expanded={open} aria-controls={id}
      aria-label={helpLabel ? undefined : "?"} onClick={() => setOpen(!open)}>
      {helpLabel ?? "?"}
    </button>
  ) : null;
  const panel = help && open ? <div className="help-text" id={id}>{help}</div> : null;

  if (as === "legend") {
    return (
      <>
        <legend><span className="head-line">{title}{!helpLabel && btn}</span></legend>
        {helpLabel && btn}
        {panel}
      </>
    );
  }
  if (as === "label") {
    return (
      <>
        <span className="head-line label-line">{title}{btn}</span>
        {sub && <small className="head-sub">{sub}</small>}
        {panel}
      </>
    );
  }
  return (
    <>
      <div className="head-row">
        <span className="head-line">{as === "h1" ? <h1>{title}</h1> : <h2>{title}</h2>}{!helpLabel && btn}</span>
        {right}
      </div>
      {sub && <small className="head-sub">{sub}</small>}
      {helpLabel && btn}
      {panel}
    </>
  );
}
