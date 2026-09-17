import { createContext, useContext } from 'react'
import type { BodyPart, Equipment, Exercise, TrainerGoal } from '../data/exercises'
import type { AppState, PlannedExercise, SessionProgress, WorkoutSet } from './types'

export type StoreValue = AppState & {
  ready: boolean
  initError: string | null
  retryInit: () => void
  createAccount: (email: string, password: string) => Promise<{ ok: boolean; error?: string; recoveryCode?: string }>
  logIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string; dest?: '/home' | '/onboarding' }>
  resetPassword: (
    email: string,
    recoveryCode: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; error?: string }>
  generateRecoveryCode: () => Promise<string | null>
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
  addToPlan: (item: PlannedExercise) => boolean
  saveCustomExercise: (exercise: Exercise) => boolean
  deleteCustomExercise: (id: string) => void
  updatePlan: (uid: string, patch: { sets?: number; reps?: number; seconds?: number; weightKg?: number }) => void
  removeFromPlan: (uid: string) => void
  clearPlan: () => void
  beginWorkout: () => void
  persistSessionProgress: (progress: SessionProgress) => void
  abandonWorkout: (workoutId: string) => void
  recordSet: (workoutId: string, set: WorkoutSet) => void
  loadWorkoutSets: (workoutId: string) => Promise<WorkoutSet[]>
  setTrainerFocus: (input: { bodyPart: BodyPart; goal: TrainerGoal }) => void
  setTrainerDay: (day: number) => void
  applyTrainerPlan: () => void
  beginTrainerReview: () => void
  backToTrainerPick: () => void
  finishWorkout: (input: {
    workoutId: string
    title: string
    durationMin: number
    calories: number
    bodyPart?: BodyPart
    workoutSets: WorkoutSet[]
  }) => void
  logRestDay: () => void
  unlinkPartner: () => void
  startPairing: (code: string) => void
  acceptPair: () => void
  declinePair: () => void
  refreshPartner: () => void
  remindPartner: () => void
  showToast: (message: string) => void
  clearToast: () => void
  signOut: () => Promise<void>
  exportData: () => Promise<{ ok: boolean; error?: string }>
  importData: (
    file: File,
    opts?: { intoEmail?: string; newPassword?: string },
  ) => Promise<{ ok: boolean; error?: string; dest?: '/home' | '/onboarding' }>
}

export const StoreContext = createContext<StoreValue | null>(null)

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
