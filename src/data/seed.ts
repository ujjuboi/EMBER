import type { HistoryItem, Partner } from '../lib/types'
import { dateLabel, daysAgo } from '../lib/dates'

export const SEED_HISTORY: HistoryItem[] = [
  {
    id: 'h1',
    name: 'Chest + squat',
    date: daysAgo(1),
    dateLabel: dateLabel(daysAgo(1)),
    durationMin: 24,
    calories: 186,
    bodyPart: 'chest',
  },
  {
    id: 'h2',
    name: 'Core hold',
    date: daysAgo(3),
    dateLabel: dateLabel(daysAgo(3)),
    durationMin: 16,
    calories: 112,
    bodyPart: 'core',
  },
  {
    id: 'h3',
    name: 'Jack + lunge',
    date: daysAgo(5),
    dateLabel: dateLabel(daysAgo(5)),
    durationMin: 28,
    calories: 240,
    bodyPart: 'legs',
  },
  {
    id: 'h4',
    name: 'Leg mix',
    date: daysAgo(6),
    dateLabel: dateLabel(daysAgo(6)),
    durationMin: 32,
    calories: 271,
    bodyPart: 'legs',
  },
]

export const SEED_PARTNER: Partner = {
  name: 'Rae',
  streak: 9,
  steps: 7110,
  calories: 190,
  lastWorkout: 'Legs · yesterday',
  history: [
    { date: daysAgo(1), name: 'Legs', durationMin: 22 },
    { date: daysAgo(2), name: 'Core', durationMin: 14 },
    { date: daysAgo(4), name: 'Rest day', durationMin: 0, rest: true },
    { date: daysAgo(6), name: 'Chest', durationMin: 20 },
  ],
}
