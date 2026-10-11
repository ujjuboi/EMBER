import { Search, X } from 'lucide-react'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchInput({ value, onChange, placeholder = 'Search' }: Props) {
  return (
    <div className="flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 focus-within:border-orange">
      <Search size={16} className="shrink-0 text-muted" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-ink placeholder:text-muted/50 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="shrink-0 p-0.5 text-muted hover:text-ink"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  )
}
