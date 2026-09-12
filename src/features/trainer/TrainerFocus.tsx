import { ChipRow } from '../../components/ui/ChipRow'
import { Section } from '../../components/ui/Section'
import { BODY_PARTS, TRAINER_GOALS, type BodyPart, type Equipment, type TrainerGoal } from '../../data/exercises'
import { KitChips } from './KitChips'

type Props = {
  bodyPart: BodyPart
  goal: TrainerGoal
  equipment: Equipment[]
  onChange: (input: { bodyPart: BodyPart; goal: TrainerGoal }) => void
  onEquipment: (id: Equipment) => void
  onAddEquipment?: (id: Equipment) => void
}

export function TrainerFocus({ bodyPart, goal, equipment, onChange, onEquipment, onAddEquipment }: Props) {
  return (
    <div className="space-y-3">
      <Section title="Focus">
        <ChipRow options={BODY_PARTS} value={bodyPart} onSelect={(id) => onChange({ bodyPart: id, goal })} />
      </Section>
      <Section title="Goal">
        <ChipRow options={TRAINER_GOALS} value={goal} onSelect={(id) => onChange({ bodyPart, goal: id })} />
      </Section>
      <Section title="Equipment">
        <KitChips value={equipment} onToggle={onEquipment} onAdd={onAddEquipment} />
      </Section>
    </div>
  )
}
