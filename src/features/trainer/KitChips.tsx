import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import {
  EQUIPMENT,
  addEquipmentItem,
  equipmentLabel,
  isKnownEquipment,
  type Equipment,
} from '../../data/exercises'

type Props = {
  value: Equipment[]
  onToggle: (id: Equipment) => void
  onAdd?: (id: Equipment) => void
  error?: string
}

export function KitChips({ value, onToggle, onAdd, error }: Props) {
  const [adding, setAdding] = useState(false)
  const [custom, setCustom] = useState('')
  const extras = value.filter((id) => !isKnownEquipment(id))

  const addCustom = () => {
    const next = addEquipmentItem(value, custom)
    const added = next.find((id) => !value.includes(id))
    if (added) {
      if (onAdd) onAdd(added)
      else onToggle(added)
    }
    setCustom('')
    setAdding(false)
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {EQUIPMENT.map((option) => (
          <Chip
            key={option.id}
            active={value.includes(option.id)}
            onClick={() => onToggle(option.id)}
          >
            {option.label}
          </Chip>
        ))}
        {extras.map((id) => (
          <Chip key={id} active onClick={() => onToggle(id)}>
            {equipmentLabel(id)}
            <X className="size-3.5" strokeWidth={2} />
          </Chip>
        ))}
        {!adding ? (
          <Chip dashed onClick={() => setAdding(true)}>
            <Plus className="size-3.5" strokeWidth={2} />
            Custom
          </Chip>
        ) : null}
      </div>
      {adding ? (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustom()
              }
              if (e.key === 'Escape') {
                setAdding(false)
                setCustom('')
              }
            }}
            placeholder="Kettlebell, cables…"
            className="h-10 flex-1 rounded-lg border border-line bg-bg px-3 text-sm text-ink placeholder:text-muted/50 focus:border-orange"
          />
          <Button size="sm" variant="line" className="h-10" onClick={addCustom}>
            Add
          </Button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-orange">{error}</p> : null}
    </div>
  )
}
