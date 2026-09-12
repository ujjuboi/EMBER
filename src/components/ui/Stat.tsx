type Props = {
  label: string
  value: string
  hint?: string
  wrap?: boolean
}

export function Stat({ label, value, hint, wrap }: Props) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{label}</p>
      <p
        className={`mt-1 tabular text-2xl font-semibold tracking-tight text-ink ${
          wrap ? 'leading-tight' : 'truncate'
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}
