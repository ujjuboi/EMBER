import type { ReactNode } from 'react'

type Props = {
  title: string
  hint?: string
  error?: string
  children: ReactNode
}

export function Section({ title, hint, error, children }: Props) {
  return (
    <section className="rounded-xl border border-line bg-surface px-3.5 py-3">
      <p className="text-[11px] uppercase tracking-[0.22em] text-orange">{title}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
      <div className="mt-2.5 space-y-3">{children}</div>
      {error ? <p className="mt-2 text-xs text-orange">{error}</p> : null}
    </section>
  )
}
