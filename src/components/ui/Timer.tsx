import { formatClock } from '../../lib/format'

type Props = {
  seconds: number
  label?: string
  pulse?: boolean
  large?: boolean
}

export function Timer({ seconds, label, pulse, large }: Props) {
  return (
    <div className={`text-center ${pulse ? 'pulse-zero rounded-lg' : ''}`}>
      {label ? (
        <p className="mb-1 text-[11px] uppercase tracking-[0.22em] text-muted">{label}</p>
      ) : null}
      <p
        className={`tabular font-semibold tracking-tight text-ink ${large ? 'text-6xl' : 'text-4xl'}`}
      >
        {formatClock(seconds)}
      </p>
    </div>
  )
}
