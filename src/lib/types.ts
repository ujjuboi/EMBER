import type { BodyPart, Equipment, Exercise, TrainerGoal } from '../data/exercises'

export type PlanSource = 'trainer' | 'custom'
export type TrainerPhase = 'pick' | 'review'

export type HistoryItem = {
  id: string
  name: string
  date: string
  dateLabel: string
  durationMin: number
  calories: number
  sessions?: number
  rest?: boolean
  bodyPart?: BodyPart
}

export type PartnerActivity = {
  date: string
  name: string
  durationMin: number
  rest?: boolean
}

export type Partner = {
  name: string
  streak: number
  steps: number
  calories: number
  lastWorkout: string
  history: PartnerActivity[]
}

export type PlannedExercise = {
  uid: string
  exercise: Exercise
  sets: number
  reps?: number
  seconds?: number
}

export type AppState = {
  signedIn: boolean
  accountEmail: string | null
  onboarded: boolean
  displayName: string
  weightKg: number
  heightFt: number
  heightIn: number
  stepGoal: number
  streak: number
  steps: number
  calories: number
  workoutDoneToday: boolean // unused; kept for HANDOFF shape compatibility
  workoutInProgress: boolean
  partnerLinked: boolean
  partnerSince: string | null
  partner: Partner
  history: HistoryItem[]
  equipment: Equipment[]
  plan: PlannedExercise[]
  planSource: PlanSource
  trainerPhase: TrainerPhase
  trainerDay: number
  trainerBodyPart: BodyPart
  trainerGoal: TrainerGoal
  toast: string | null
}
