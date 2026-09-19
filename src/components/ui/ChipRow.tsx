import { Chip } from './Chip'

type Props<T extends string> = {
  label?: string
  options: { id: T; label: string }[]
  value: T | ''
  onSelect: (id: T) => void
}

export function ChipRow<T extends string>({ label, options, value, onSelect }: Props<T>) {
  return (
    <div>
      {label ? <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{label}</p> : null}
      <div className={label ? 'mt-2 flex flex-wrap gap-2' : 'flex flex-wrap gap-2'}>
        {options.map((option) => (
          <Chip key={option.id} active={option.id === value} onClick={() => onSelect(option.id)}>
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}
