import { useCallback, useMemo, useRef, useState, useEffect, type ReactNode } from 'react'
import { bodyPartForDay, toggleEquipment, type Equipment } from '../data/exercises'
import { SEED_HISTORY, SEED_PARTNER } from '../data/seed'
import { dateLabel, daysAgo, isoDate, streakFromDates } from './dates'
import { suggestSession } from './trainer'
import type { AppState, HistoryItem, PlannedExercise } from './types'
import { StoreContext, type StoreValue } from './store-hooks'
import * as db from './db'

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
  workoutDoneToday: false,
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

let _initialState: AppState | null = null
let _initPromise: Promise<void> | null = null

async function loadInitialState(): Promise<AppState> {
  if (_initialState) return _initialState
  if (!_initPromise) {
    _initPromise = (async () => {
      try {
        await db.initDb()
        await db.migrateLegacy()

        const [profile, history, plan, partnerData] = await Promise.all([
          db.loadProfile(),
          db.loadHistory(),
          db.loadPlan(),
          db.loadPartner(),
        ])

        const effectiveHistory = history.length > 0 ? history : SEED_HISTORY
        const effectivePartner = partnerData.partner.name ? partnerData.partner : SEED_PARTNER

        _initialState = {
          signedIn: profile.signedIn,
          accountEmail: profile.accountEmail,
          onboarded: profile.onboarded,
          displayName: profile.displayName,
          weightKg: profile.weightKg,
          heightFt: profile.heightFt,
          heightIn: profile.heightIn,
          stepGoal: profile.stepGoal,
          streak: profile.streak,
          steps: profile.steps,
          calories: profile.calories,
          workoutDoneToday: profile.workoutDoneToday,
          workoutInProgress: profile.workoutInProgress,
          partnerLinked: partnerData.partnerLinked,
          partnerSince: partnerData.partnerSince,
          partner: effectivePartner,
          history: effectiveHistory,
          equipment: profile.equipment,
          plan,
          planSource: profile.planSource,
          trainerPhase: profile.trainerPhase,
          trainerDay: profile.trainerDay,
          trainerBodyPart: profile.trainerBodyPart,
          trainerGoal: profile.trainerGoal,
          toast: null,
        }
      } catch (err) {
        _initPromise = null
        throw err
      }
    })()
  }
  await _initPromise
  return _initialState ?? seedState()
}

function persistProfile(s: AppState): void {
  void db.saveProfile({
    displayName: s.displayName,
    weightKg: s.weightKg,
    heightFt: s.heightFt,
    heightIn: s.heightIn,
    stepGoal: s.stepGoal,
    signedIn: s.signedIn,
    accountEmail: s.accountEmail,
    onboarded: s.onboarded,
    equipment: s.equipment,
    trainerPhase: s.trainerPhase,
    trainerDay: s.trainerDay,
    trainerBodyPart: s.trainerBodyPart,
    trainerGoal: s.trainerGoal,
    partnerLinked: s.partnerLinked,
    partnerSince: s.partnerSince,
    streak: s.streak,
    steps: s.steps,
    calories: s.calories,
    workoutDoneToday: s.workoutDoneToday,
    workoutInProgress: s.workoutInProgress,
    planSource: s.planSource,
  })
}

function persistHistory(history: HistoryItem[]): void {
  void db.saveHistory(history)
}

function persistPlan(plan: PlannedExercise[]): void {
  void db.savePlan(plan)
}

function persistPartnerLinked(linked: boolean, since: string | null): void {
  void db.updatePartnerLinked(linked, since)
}

function applyEquipment(s: AppState, equipment: Equipment[]): AppState {
  const next: AppState = { ...s, equipment }
  if (s.trainerPhase === 'review') {
    next.plan = suggestSession(s.trainerBodyPart, s.trainerGoal, equipment)
    next.planSource = 'trainer'
  }
  return next
}

const COMMIT_DEBOUNCE_MS = 400

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const pendingStateRef = useRef<AppState | null>(null)
  const flushTimerRef = useRef<number | null>(null)

  const hydrate = useCallback(() => {
    void loadInitialState()
      .then((s) => {
        setState(s)
        stateRef.current = s
        setInitError(null)
        setHydrated(true)
      })
      .catch((err) => {
        console.error('[Store] Hydration failed:', err)
        setInitError(err instanceof Error ? err.message : String(err))
      })
  }, [])

  useEffect(() => {
    hydrate()
  }, [hydrate])

  const flushWrites = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    const next = pendingStateRef.current
    pendingStateRef.current = null
    if (!next) return
    persistProfile(next)
    persistHistory(next.history)
    persistPlan(next.plan)
    persistPartnerLinked(next.partnerLinked, next.partnerSince)
  }, [])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushWrites()
    }
    window.addEventListener('pagehide', flushWrites)
    window.addEventListener('beforeunload', flushWrites)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flushWrites)
      window.removeEventListener('beforeunload', flushWrites)
      document.removeEventListener('visibilitychange', onHide)
      flushWrites()
    }
  }, [flushWrites])

  const commit = useCallback((next: AppState) => {
    pendingStateRef.current = next
    stateRef.current = next
    setState(next)
    if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current)
    flushTimerRef.current = window.setTimeout(flushWrites, COMMIT_DEBOUNCE_MS)
  }, [flushWrites])

  const value = useMemo<StoreValue>(() => {
    const base = state ?? seedState()
    const current = () => stateRef.current ?? seedState()
    return {
      ...base,
      ready: hydrated,
      initError,
      retryInit: hydrate,
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
        commit(applyEquipment(s, toggleEquipment(s.equipment, id)))
      },
      addEquipment: (id) => {
        const s = current()
        if (s.equipment.includes(id)) return
        commit(applyEquipment(s, [...s.equipment, id]))
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
          workoutDoneToday: true,
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
        const ref = stateRef.current
        if (!ref) return
        setState({ ...ref, toast: message })
      },
      clearToast: () => {
        const ref = stateRef.current
        if (!ref) return
        setState({ ...ref, toast: null })
      },
      signOut: () => {
        const s = current()
        commit({ ...s, signedIn: false, plan: [], trainerPhase: 'pick' })
      },
    }
  }, [state, hydrated, initError, hydrate, commit])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}