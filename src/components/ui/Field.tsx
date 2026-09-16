type Props = {
  label?: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  suffix?: string
  error?: string
  autoFocus?: boolean
  autoCapitalize?: string
  autoComplete?: string
}

export function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  suffix,
  error,
  autoFocus,
  autoCapitalize,
  autoComplete,
}: Props) {
  const input = (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      aria-label={label ?? placeholder}
      autoFocus={autoFocus}
      autoCapitalize={autoCapitalize}
      autoComplete={autoComplete}
      onChange={(e) => onChange(e.target.value)}
      className={
        suffix
          ? 'min-w-0 flex-1 bg-transparent text-ink tabular placeholder:text-muted/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
          : `${label ? 'mt-1.5' : ''} h-10 w-full rounded-lg border border-line bg-surface px-4 text-ink placeholder:text-muted/50 focus:border-orange`
      }
    />
  )

  return (
    <label className="block">
      {label ? <span className="text-[11px] uppercase tracking-[0.22em] text-muted">{label}</span> : null}
      {suffix ? (
        <div
          className={`${label ? 'mt-1.5' : ''} flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 focus-within:border-orange`}
        >
          {input}
          <span className="shrink-0 text-xs uppercase tracking-[0.14em] text-muted">{suffix}</span>
        </div>
      ) : (
        input
      )}
      {error ? <p className="mt-1 text-xs text-orange">{error}</p> : null}
    </label>
  )
}
