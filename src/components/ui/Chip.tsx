import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
  dashed?: boolean
  children: ReactNode
}

export function Chip({ active, dashed, className = '', children, type = 'button', ...rest }: Props) {
  const tone = dashed
    ? 'border-dashed border-line text-muted hover:border-orange/50'
    : active
      ? 'border-orange text-orange'
      : 'border-line text-muted hover:border-orange/50'

  return (
    <button
      type={type}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs ${tone} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
