import { dateLabel, streakFromDates } from './dates'
import type { Partner, PartnerActivity } from './types'

// Partner stats are derived locally from the synced history (mirroring how the
// "you" side derives streak/calories from its own history). Only `steps` is a
// synced scalar — it cannot be derived from workout history alone.
export function derivePartner(input: {
  name: string
  steps: number
  history: PartnerActivity[]
  lastSyncedAt: string | null
}): Partner {
  const { name, steps, history, lastSyncedAt } = input
  const workouts = history.filter((item) => !item.rest)
  const sorted = [...workouts].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1]
  return {
    name,
    streak: streakFromDates(workouts.map((item) => item.date)),
    steps,
    calories: workouts.reduce((sum, item) => sum + (item.calories || 0), 0),
    lastWorkout: latest ? `${latest.name} · ${dateLabel(latest.date)}` : '',
    history,
    lastSyncedAt,
  }
}