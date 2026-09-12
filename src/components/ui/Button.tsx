import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'ghost' | 'line'
type Size = 'md' | 'sm'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  children: ReactNode
  block?: boolean
}

const styles: Record<Variant, string> = {
  primary: 'bg-orange text-bg hover:brightness-110 active:brightness-95',
  ghost: 'bg-transparent text-ink hover:bg-white/5',
  line: 'bg-transparent text-ink border border-line hover:border-orange/50',
}

const sizes: Record<Size, string> = {
  md: 'h-12 px-5',
  sm: 'h-9 px-3',
}

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  className = '',
  children,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`rounded-lg text-sm font-semibold leading-none transition-transform duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${sizes[size]} ${styles[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
