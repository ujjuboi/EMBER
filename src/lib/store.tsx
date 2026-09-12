import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { bodyPartForDay, normalizeBodyPart, normalizeTrainerGoal, toggleEquipment, type BodyPart, type Equipment, type TrainerGoal } from '../data/exercises'
import { SEED_HISTORY, SEED_PARTNER } from '../data/seed'
import { dateLabel, daysAgo, isoDate, streakFromDates } from './dates'
import { suggestSession } from './trainer'
import type { AppState, HistoryItem, PlannedExercise } from './types'

const STORAGE_KEY = 'ember-prototype-v5'

const seedState = (): AppState => ({
  signedIn: false,
  accountEmail: null,
  onboarded: false,
  displayName: 'Umair',
  weightKg: 72,
  heightFt: 5,
  heightIn: 9,
  stepGoal: 8000,
  streak: streakFromDates(SEED_HISTORY.map((item) => item.date)),
  steps: 6420,
  calories: 284,
  workoutDoneToday: false, // unused; kept for HANDOFF shape compatibility
  workoutInProgress: false,
  partnerLinked: true,
  partnerSince: daysAgo(42),
  partner: SEED_PARTNER,
  history: SEED_HISTORY,
  equipment: ['bodyweight'],
  plan: [],
  planSource: 'trainer',
  trainerPhase: 'pick',
  trainerDay: new Date().getDay(),
  trainerBodyPart: bodyPartForDay(new Date().getDay()),
  trainerGoal: 'strength',
  toast: null,
})

function remapSessionName(name: string): string {
  if (name === 'Push + squat') return 'Chest + squat'
  if (name === 'Full mix') return 'Leg mix'
  if (name === 'Push') return 'Chest'
  if (name === 'Pull') return 'Back'
  if (name === 'Full body') return 'Legs'
  return name.replace(/^Push ·/, 'Chest ·').replace(/^Pull ·/, 'Back ·').replace(/^Full body ·/, 'Legs ·')
}

function loadState(): AppState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return seedState()
    const parsed = JSON.parse(raw) as Partial<AppState>
    const history = (parsed.history ?? seedState().history).map((item) => ({
      ...item,
      name: remapSessionName(item.name),
      bodyPart: item.bodyPart ? normalizeBodyPart(item.bodyPart) : item.bodyPart,
    }))
    const partner = parsed.partner
      ? {
          ...parsed.partner,
          lastWorkout: remapSessionName(parsed.partner.lastWorkout ?? ''),
          history: (parsed.partner.history ?? []).map((item) => ({ ...item, name: remapSessionName(item.name) })),
        }
      : seedState().partner
    return {
      ...seedState(),
      ...parsed,
      history,
      partner,
      trainerGoal: normalizeTrainerGoal(parsed.trainerGoal),
      trainerBodyPart: normalizeBodyPart(parsed.trainerBodyPart ?? seedState().trainerBodyPart),
      toast: null,
    }
  } catch {
    return seedState()
  }
}

function persist(state: AppState) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, toast: null }))
}

function applyEquipment(s: AppState, equipment: Equipment[], commit: (next: AppState) => void) {
  const next: AppState = { ...s, equipment }
  if (s.trainerPhase === 'review') {
    next.plan = suggestSession(s.trainerBodyPart, s.trainerGoal, equipment)
    next.planSource = 'trainer'
  }
  commit(next)
}

type StoreValue = AppState & {
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

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState)
  const stateRef = useRef(state)
  stateRef.current = state

  const commit = (next: AppState) => {
    persist(next)
    stateRef.current = next
    setState(next)
  }

  const value = useMemo<StoreValue>(() => {
    const current = () => stateRef.current
    return {
      ...state,
      createAccount: (email, password) => {
        const s = current()
        const trimmed = email.trim().toLowerCase()
        if (!trimmed.includes('@')) return { ok: false, error: 'Enter a valid email' }
        if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters' }
        if (s.accountEmail && s.accountEmail !== trimmed) {
          return { ok: false, error: 'An account already exists. Log in instead.' }
        }
        if (s.accountEmail === trimmed && s.onboarded) {
          return { ok: false, error: 'That email is taken. Log in.' }
        }
        commit({ ...s, accountEmail: trimmed, signedIn: true })
        return { ok: true }
      },
      logIn: (email, password) => {
        const s = current()
        const trimmed = email.trim().toLowerCase()
        if (!trimmed.includes('@')) return { ok: false, error: 'Enter a valid email' }
        if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters' }
        if (!s.accountEmail) {
          return { ok: false, error: 'No account yet. Create one to start.' }
        }
        if (s.accountEmail !== trimmed) {
          return { ok: false, error: 'No account for that email. Create one.' }
        }
        commit({ ...s, signedIn: true })
        return { ok: true, dest: s.onboarded ? '/home' : '/onboarding' }
      },
      continueWithGoogle: () => {
        const s = current()
        const email = s.accountEmail ?? 'google@ember.app'
        commit({ ...s, accountEmail: email, signedIn: true })
        return { dest: s.onboarded ? '/home' : '/onboarding' }
      },
      completeOnboarding: ({ displayName, weightKg, heightFt, heightIn, stepGoal, partnerCode, equipment, trainerGoal }) => {
        const s = current()
        const linked = partnerCode.trim().length === 6
        commit({
          ...s,
          onboarded: true,
          signedIn: true,
          displayName: displayName.trim() || 'Umair',
          weightKg,
          heightFt,
          heightIn,
          stepGoal,
          equipment,
          trainerGoal,
          partnerLinked: linked,
          partnerSince: linked ? isoDate() : null,
          plan: [],
          planSource: 'trainer',
          trainerPhase: 'pick',
        })
      },
      updateProfile: ({ weightKg, heightFt, heightIn, stepGoal, equipment, trainerGoal }) => {
        const s = current()
        const next: AppState = {
          ...s,
          weightKg,
          heightFt,
          heightIn,
          stepGoal,
          equipment: equipment ?? s.equipment,
          trainerGoal: trainerGoal ?? s.trainerGoal,
        }
        if (s.trainerPhase === 'review' && (equipment ?? s.equipment).length > 0) {
          next.plan = suggestSession(s.trainerBodyPart, next.trainerGoal, next.equipment)
          next.planSource = 'trainer'
        }
        commit(next)
      },
      setEquipment: (id) => {
        const s = current()
        applyEquipment(s, toggleEquipment(s.equipment, id), commit)
      },
      addEquipment: (id) => {
        const s = current()
        if (s.equipment.includes(id)) return
        applyEquipment(s, [...s.equipment, id], commit)
      },
      addToPlan: (item) => {
        const s = current()
        commit({ ...s, plan: [...s.plan, item], planSource: 'custom' })
      },
      updatePlan: (uid, patch) => {
        const s = current()
        commit({
          ...s,
          plan: s.plan.map((item) => {
            if (item.uid !== uid) return item
            const sets = patch.sets ?? item.sets
            const reps = patch.reps ?? item.reps
            const seconds = patch.seconds ?? item.seconds
            return {
              ...item,
              sets: Math.max(1, sets),
              reps: reps !== undefined ? Math.max(1, reps) : undefined,
              seconds: seconds !== undefined ? Math.max(5, seconds) : undefined,
            }
          }),
        })
      },
      removeFromPlan: (uid) => {
        const s = current()
        commit({
          ...s,
          plan: s.plan.filter((item) => item.uid !== uid),
          planSource: 'custom',
        })
      },
      clearPlan: () => {
        const s = current()
        commit({ ...s, plan: [], planSource: 'custom', workoutInProgress: false })
      },
      beginWorkout: () => {
        const s = current()
        commit({ ...s, workoutInProgress: true })
      },
      setTrainerFocus: ({ bodyPart, goal }) => {
        const s = current()
        commit({
          ...s,
          trainerBodyPart: bodyPart,
          trainerGoal: goal,
          plan: suggestSession(bodyPart, goal, s.equipment),
          planSource: 'trainer',
        })
      },
      setTrainerDay: (day) => {
        const s = current()
        const bodyPart = bodyPartForDay(day)
        const next: AppState = {
          ...s,
          trainerDay: day,
          trainerBodyPart: bodyPart,
        }
        if (s.trainerPhase === 'review') {
          next.plan = suggestSession(bodyPart, s.trainerGoal, s.equipment)
          next.planSource = 'trainer'
        }
        commit(next)
      },
      applyTrainerPlan: () => {
        const s = current()
        commit({
          ...s,
          plan: suggestSession(s.trainerBodyPart, s.trainerGoal, s.equipment),
          planSource: 'trainer',
        })
      },
      beginTrainerReview: () => {
        const s = current()
        commit({
          ...s,
          plan: suggestSession(s.trainerBodyPart, s.trainerGoal, s.equipment),
          planSource: 'trainer',
          trainerPhase: 'review',
        })
      },
      backToTrainerPick: () => {
        const s = current()
        commit({ ...s, trainerPhase: 'pick' })
      },
      finishWorkout: ({ title, durationMin, calories, bodyPart }) => {
        const s = current()
        const date = isoDate()
        const existing = s.history.find((item) => item.date === date)
        const merge = existing && !existing.rest
        const historyItem: HistoryItem = merge
          ? {
              ...existing,
              rest: undefined,
              durationMin: existing.durationMin + durationMin,
              calories: existing.calories + calories,
              sessions: (existing.sessions ?? 1) + 1,
            }
          : {
              id: `w-${Date.now()}`,
              name: title,
              date,
              dateLabel: dateLabel(date),
              durationMin,
              calories,
              sessions: 1,
              bodyPart: bodyPart ?? s.trainerBodyPart,
            }
        const history = [historyItem, ...s.history.filter((item) => item.date !== date)]
        commit({
          ...s,
          calories: s.calories + calories,
          steps: s.steps + 120,
          streak: streakFromDates(history.filter((item) => !item.rest).map((item) => item.date)),
          workoutDoneToday: true, // dead state; no consumer
          workoutInProgress: false,
          history,
          plan: [],
          planSource: 'trainer',
          trainerPhase: 'pick',
        })
      },
      logRestDay: () => {
        const s = current()
        const date = isoDate()
        if (s.history.some((item) => item.date === date && !item.rest)) return
        if (s.history.some((item) => item.date === date && item.rest)) return
        const historyItem: HistoryItem = {
          id: `rest-${Date.now()}`,
          name: 'Rest day',
          date,
          dateLabel: dateLabel(date),
          durationMin: 0,
          calories: 0,
          rest: true,
        }
        commit({
          ...s,
          history: [historyItem, ...s.history.filter((item) => item.date !== date)],
          workoutInProgress: false,
          plan: [],
          planSource: 'trainer',
          trainerPhase: 'pick',
        })
      },
      unlinkPartner: () => {
        const s = current()
        commit({ ...s, partnerLinked: false, partnerSince: null })
      },
      linkPartner: (code) => {
        const s = current()
        const trimmed = code.trim().toUpperCase()
        if (trimmed.length !== 6) {
          return { ok: false, error: 'Enter a 6-character code' }
        }
        commit({ ...s, partnerLinked: true, partnerSince: s.partnerSince ?? isoDate() })
        return { ok: true }
      },
      showToast: (message) => {
        setState({ ...stateRef.current, toast: message })
      },
      clearToast: () => {
        setState({ ...stateRef.current, toast: null })
      },
      signOut: () => {
        const s = current()
        commit({ ...s, signedIn: false, plan: [], trainerPhase: 'pick' })
      },
    }
  }, [state])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
