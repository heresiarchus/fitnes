interface Props {
  label: string;
  offset: number;
  onChange: (offset: number) => void;
  prevLabel: string;
  nextLabel: string;
  nowLabel: string;
}

/** ‹ label › on one line; a "back to current" link appears only when you've moved away. */
export function PeriodNav({ label, offset, onChange, prevLabel, nextLabel, nowLabel }: Props) {
  return (
    <div className="pnav">
      <button type="button" aria-label={prevLabel} onClick={() => onChange(offset - 1)}>‹</button>
      <div className="pnav-mid">
        <h2 className="num-h">{label}</h2>
        {offset !== 0 && <button type="button" className="link" onClick={() => onChange(0)}>{nowLabel}</button>}
      </div>
      <button type="button" aria-label={nextLabel} onClick={() => onChange(offset + 1)} disabled={offset >= 0}>›</button>
    </div>
  );
}
