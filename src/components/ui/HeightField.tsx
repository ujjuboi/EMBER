type Props = {
  feet: string
  inches: string
  onFeet: (value: string) => void
  onInches: (value: string) => void
  error?: string
}

export function parseHeight(feet: string, inches: string):
  | { ok: true; heightFt: number; heightIn: number }
  | { ok: false; error: string } {
  const heightFt = Number(feet)
  const heightIn = Number(inches)
  if (!Number.isInteger(heightFt) || heightFt < 4 || heightFt > 7) {
    return { ok: false, error: 'Enter height in feet (4–7)' }
  }
  if (!Number.isInteger(heightIn) || heightIn < 0 || heightIn > 11) {
    return { ok: false, error: 'Inches should be 0–11' }
  }
  return { ok: true, heightFt, heightIn }
}

export function HeightField({ feet, inches, onFeet, onInches, error }: Props) {
  return (
    <div className="min-w-0">
      <span className="text-[11px] uppercase tracking-[0.22em] text-muted">Height</span>
      <div
        className={`mt-1.5 flex h-10 overflow-hidden rounded-lg border bg-surface focus-within:border-orange ${
          error ? 'border-orange' : 'border-line'
        }`}
      >
        <label className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5">
          <input
            type="number"
            inputMode="numeric"
            value={feet}
            onChange={(e) => onFeet(e.target.value)}
            aria-label="Feet"
            className="min-w-0 flex-1 bg-transparent text-ink tabular [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="shrink-0 text-xs uppercase tracking-[0.14em] text-muted">ft</span>
        </label>
        <div className="w-px self-stretch bg-line" aria-hidden />
        <label className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5">
          <input
            type="number"
            inputMode="numeric"
            value={inches}
            onChange={(e) => onInches(e.target.value)}
            aria-label="Inches"
            className="min-w-0 flex-1 bg-transparent text-ink tabular [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="shrink-0 text-xs uppercase tracking-[0.14em] text-muted">in</span>
        </label>
      </div>
      {error ? <p className="mt-1 text-xs text-orange">{error}</p> : null}
    </div>
  )
}
