import { createContext, useContext } from 'react'
import type { BodyPart, Equipment, TrainerGoal } from '../data/exercises'
import type { AppState, PlannedExercise } from './types'

export type StoreValue = AppState & {
  ready: boolean
  initError: string | null
  retryInit: () => void
  createAccount: (email: string, password: string) => { ok: boolean; error?: string }
  logIn: (email: string, password: string) => { ok: boolean; error?: string; dest?: '/home' | '/onboarding' }
  continueWithGoogle: () => { dest: '/home' | '/onboarding' }
  completeOnboarding: (input: {
    displayName: string
    weightKg: number
    heightFt: number
    heightIn: number
    stepGoal: number
    partnerCode: string
    equipment: Equipment[]
    trainerGoal: TrainerGoal
  }) => void
  updateProfile: (input: {
    weightKg: number
    heightFt: number
    heightIn: number
    stepGoal: number
    equipment?: Equipment[]
    trainerGoal?: TrainerGoal
  }) => void
  setEquipment: (id: Equipment) => void
  addEquipment: (id: Equipment) => void
  addToPlan: (item: PlannedExercise) => void
  updatePlan: (uid: string, patch: { sets?: number; reps?: number; seconds?: number }) => void
  removeFromPlan: (uid: string) => void
  clearPlan: () => void
  beginWorkout: () => void
  setTrainerFocus: (input: { bodyPart: BodyPart; goal: TrainerGoal }) => void
  setTrainerDay: (day: number) => void
  applyTrainerPlan: () => void
  beginTrainerReview: () => void
  backToTrainerPick: () => void
  finishWorkout: (input: { title: string; durationMin: number; calories: number; bodyPart?: BodyPart }) => void
  logRestDay: () => void
  unlinkPartner: () => void
  linkPartner: (code: string) => { ok: boolean; error?: string }
  showToast: (message: string) => void
  clearToast: () => void
  signOut: () => void
}

export const StoreContext = createContext<StoreValue | null>(null)

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}

export function useDbReady(): boolean {
  const ctx = useContext(StoreContext)
  return ctx?.ready ?? false
}