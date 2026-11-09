interface Props {
  label: string;
  offset: number;
  onChange: (offset: number) => void;
  prevLabel: string;
  nextLabel: string;
  nowLabel: string;
}

export function PeriodNav({ label, offset, onChange, prevLabel, nextLabel, nowLabel }: Props) {
  return (
    <div className="row between">
      <h2 className="num-h">{label}</h2>
      <div className="weeknav">
        <button type="button" aria-label={prevLabel} onClick={() => onChange(offset - 1)}>‹</button>
        <button type="button" onClick={() => onChange(0)} disabled={offset === 0}>{nowLabel}</button>
        <button type="button" aria-label={nextLabel} onClick={() => onChange(offset + 1)} disabled={offset >= 0}>›</button>
      </div>
    </div>
  );
}
