import { useCallback, useMemo, useRef, useState, useEffect, type ReactNode } from 'react'
import { bodyPartForDay, toggleEquipment, type Equipment } from '../data/exercises'
import { dateLabel, isoDate, streakFromDates } from './dates'
import { generateSalt, hashPassword } from './password'
import { suggestSession } from './trainer'
import { backupFilename, parseBackup, readTextFile, serializeBackup, shareOrDownload } from './backup'
import type { AppState, HistoryItem, SessionProgress, Workout } from './types'
import { StoreContext, type StoreValue } from './store-hooks'
import * as db from './db'

const seedState = (): AppState => ({
  signedIn: false,
  accountEmail: null,
  onboarded: false,
  displayName: '',
  weightKg: 72,
  heightFt: 5,
  heightIn: 9,
  stepGoal: 8000,
  streak: 0,
  steps: 0,
  calories: 0,
  workoutInProgress: false,
  workingWorkout: null,
  partnerLinked: false,
  partnerSince: null,
  partner: {
    name: '',
    streak: 0,
    steps: 0,
    calories: 0,
    lastWorkout: '',
    history: [],
  },
  history: [],
  equipment: ['bodyweight'],
  plan: [],
  planSource: 'trainer',
  trainerPhase: 'pick',
  trainerDay: new Date().getDay(),
  trainerBodyPart: bodyPartForDay(new Date().getDay()),
  trainerGoal: 'strength',
  toast: null,
})

function workoutTotalsFromHistory(history: HistoryItem[]): { streak: number; steps: number; calories: number; doneToday: boolean } {
  const workouts = history.filter((item) => !item.rest)
  return {
    streak: streakFromDates(workouts.map((item) => item.date)),
    steps: workouts.length * 120,
    calories: workouts.reduce((sum, item) => sum + (item.calories || 0), 0),
    doneToday: workouts.some((item) => item.date === isoDate()),
  }
}

function workoutTitle(plan: AppState['plan']): string {
  if (plan.length === 0) return 'Workout'
  if (plan.length === 1) return plan[0].exercise.name
  return `${plan[0].exercise.name} mix`
}

let _initialState: AppState | null = null
let _initPromise: Promise<void> | null = null

async function loadInitialState(): Promise<AppState> {
  if (_initialState) return _initialState
  if (!_initPromise) {
    _initPromise = (async () => {
      try {
        await db.initDb()

        // Dev convenience: provision a test account + session on first load.
        if (import.meta.env.DEV) {
          await db.ensureDevSeed()
        }

        const sessionEmail = await db.getSession()
        if (!sessionEmail) {
          _initialState = seedState()
          return
        }

        const [profile, history, plan, partnerData, activeWorkout] = await Promise.all([
          db.loadProfile(sessionEmail),
          db.loadHistory(sessionEmail),
          db.loadPlan(sessionEmail),
          db.loadPartner(sessionEmail),
          db.loadWorkoutInProgress(sessionEmail),
        ])

        const totals = workoutTotalsFromHistory(history)

        _initialState = {
          signedIn: true,
          accountEmail: sessionEmail,
          onboarded: profile.onboarded,
          displayName: profile.displayName,
          weightKg: profile.weightKg,
          heightFt: profile.heightFt,
          heightIn: profile.heightIn,
          stepGoal: profile.stepGoal,
          streak: totals.streak,
          steps: totals.steps,
          calories: totals.calories,
          workoutInProgress: !!activeWorkout,
          workingWorkout: activeWorkout,
          partnerLinked: partnerData.partnerLinked,
          partnerSince: partnerData.partnerSince,
          partner: partnerData.partner,
          history,
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

function persistProfile(s: AppState): Promise<void> {
  if (!s.accountEmail) return Promise.resolve()
  return db.saveProfile(s.accountEmail, {
    displayName: s.displayName,
    weightKg: s.weightKg,
    heightFt: s.heightFt,
    heightIn: s.heightIn,
    stepGoal: s.stepGoal,
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
    workoutInProgress: s.workoutInProgress,
    planSource: s.planSource,
  })
}

function persistHistory(s: AppState): Promise<void> {
  if (!s.accountEmail) return Promise.resolve()
  return db.saveHistory(s.accountEmail, s.history)
}

function persistPlan(s: AppState): Promise<void> {
  if (!s.accountEmail) return Promise.resolve()
  return db.savePlan(s.accountEmail, s.plan)
}

function persistPartnerLinked(s: AppState): Promise<void> {
  if (!s.accountEmail) return Promise.resolve()
  return db.updatePartnerLinked(s.accountEmail, s.partnerLinked, s.partnerSince)
}

function persistWorkout(s: AppState): Promise<void> {
  if (!s.accountEmail || !s.workingWorkout) return Promise.resolve()
  return db.updateWorkoutProgress(s.workingWorkout.id, {
    currentIndex: s.workingWorkout.currentIndex,
    currentSet: s.workingWorkout.currentSet,
    phase: s.workingWorkout.phase,
    elapsed: s.workingWorkout.elapsed,
    kcal: s.workingWorkout.kcal,
    restSeconds: s.workingWorkout.restSeconds,
    workSeconds: s.workingWorkout.workSeconds,
    setsLogged: s.workingWorkout.setsLogged,
  })
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
const PERSIST_RETRY_MS = 4000

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

  const flushWrites = useCallback(function flushWrites(): Promise<void> {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    const next = pendingStateRef.current
    pendingStateRef.current = null
    if (!next) return Promise.resolve()
    const flush = Promise.allSettled([
      persistProfile(next),
      persistHistory(next),
      persistPlan(next),
      persistPartnerLinked(next),
      persistWorkout(next),
    ]).then((results) => {
      const failed = results.some((r) => r.status === 'rejected')
      results.forEach((r, i) => {
        if (r.status === 'rejected') console.error('[Store] Persist failed:', i, r.reason)
      })
      if (failed && !pendingStateRef.current && flushTimerRef.current === null) {
        pendingStateRef.current = next
        flushTimerRef.current = window.setTimeout(() => void flushWrites(), PERSIST_RETRY_MS)
      }
    })
    return flush
  }, [])

  useEffect(() => {
    const onFlush = () => void flushWrites()
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flushWrites()
    }
    window.addEventListener('pagehide', onFlush)
    window.addEventListener('beforeunload', onFlush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onFlush)
      window.removeEventListener('beforeunload', onFlush)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [flushWrites])

  const commit = useCallback((next: AppState, opts?: { immediate?: boolean }) => {
    pendingStateRef.current = next
    stateRef.current = next
    setState(next)
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    if (opts?.immediate) {
      void flushWrites()
    } else {
      flushTimerRef.current = window.setTimeout(() => void flushWrites(), COMMIT_DEBOUNCE_MS)
    }
  }, [flushWrites])

  const value = useMemo<StoreValue>(() => {
    const base = state ?? seedState()
    const current = () => stateRef.current ?? seedState()
    return {
      ...base,
      ready: hydrated,
      initError,
      retryInit: hydrate,
      createAccount: async (email, password) => {
        const trimmed = email.trim().toLowerCase()
        if (!trimmed.includes('@')) return { ok: false, error: 'Enter a valid email' }
        if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters' }
        if (await db.accountExists(trimmed)) {
          return { ok: false, error: 'An account already exists. Log in instead.' }
        }
        const salt = generateSalt()
        const hash = await hashPassword(password, salt)
        await db.createAccountRow(trimmed, hash, salt)
        await db.setSession(trimmed)
        const base = seedState()
        commit({ ...base, signedIn: true, accountEmail: trimmed, onboarded: false })
        return { ok: true }
      },
      logIn: async (email, password) => {
        const trimmed = email.trim().toLowerCase()
        if (!trimmed.includes('@')) return { ok: false, error: 'Enter a valid email' }
        if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters' }
        const verified = await db.verifyCredentials(trimmed, password)
        if (!verified) {
          return { ok: false, error: 'No account for that email, or wrong password.' }
        }
        await db.setSession(trimmed)
        const [profile, history, plan, partnerData, activeWorkout] = await Promise.all([
          db.loadProfile(trimmed),
          db.loadHistory(trimmed),
          db.loadPlan(trimmed),
          db.loadPartner(trimmed),
          db.loadWorkoutInProgress(trimmed),
        ])
        const totals = workoutTotalsFromHistory(history)
        const next: AppState = {
          signedIn: true,
          accountEmail: trimmed,
          onboarded: profile.onboarded,
          displayName: profile.displayName,
          weightKg: profile.weightKg,
          heightFt: profile.heightFt,
          heightIn: profile.heightIn,
          stepGoal: profile.stepGoal,
          streak: totals.streak,
          steps: totals.steps,
          calories: totals.calories,
          workoutInProgress: !!activeWorkout,
          workingWorkout: activeWorkout,
          partnerLinked: partnerData.partnerLinked,
          partnerSince: partnerData.partnerSince,
          partner: partnerData.partner,
          history,
          equipment: profile.equipment,
          plan,
          planSource: profile.planSource,
          trainerPhase: profile.trainerPhase,
          trainerDay: profile.trainerDay,
          trainerBodyPart: profile.trainerBodyPart,
          trainerGoal: profile.trainerGoal,
          toast: null,
        }
        commit(next)
        return { ok: true, dest: next.onboarded ? '/home' : '/onboarding' }
      },
      completeOnboarding: ({ displayName, weightKg, heightFt, heightIn, stepGoal, partnerCode, equipment, trainerGoal }) => {
        const s = current()
        const linked = partnerCode.trim().length === 6
        commit({
          ...s,
          onboarded: true,
          signedIn: true,
          displayName: displayName.trim(),
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
        const name = item.exercise.name.trim().toLowerCase()
        // The exercise name is the unique key within a plan: two exercises with
        // the same name cannot coexist, no matter how they entered the plan.
        if (s.plan.some((existing) => existing.exercise.name.trim().toLowerCase() === name)) {
          return false
        }
        commit({ ...s, plan: [...s.plan, item], planSource: 'custom' })
        return true
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
              weightKg: patch.weightKg !== undefined ? Math.max(0, patch.weightKg) : item.weightKg,
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
        commit({ ...s, plan: [], planSource: 'custom', workoutInProgress: false, workingWorkout: null }, { immediate: true })
      },
      beginWorkout: () => {
        const s = current()
        if (!s.accountEmail || s.plan.length === 0) return
        const workout: Workout = {
          id: crypto.randomUUID(),
          accountEmail: s.accountEmail,
          date: isoDate(),
          status: 'in_progress',
          startedAt: new Date().toISOString(),
          finishedAt: null,
          title: workoutTitle(s.plan),
          durationMin: null,
          calories: null,
          bodyPart: s.trainerBodyPart,
          planForDate: isoDate(),
          currentIndex: 0,
          currentSet: 0,
          phase: 'work',
          elapsed: 0,
          kcal: 0,
          restSeconds: 0,
          workSeconds: 0,
          setsLogged: 0,
          exercises: s.plan,
        }
        const workingWorkout = workout
        commit({ ...s, workingWorkout, workoutInProgress: true }, { immediate: true })
        void (async () => {
          try {
            await db.abandonWorkouts(workout.accountEmail)
            await db.saveWorkout(workout)
            await db.savePlan(workout.accountEmail, workout.exercises ?? [], workout.planForDate ?? isoDate())
            // Re-read so rapid progress made during the await is not overwritten.
            const persisted = await db.loadWorkoutInProgress(workout.accountEmail)
            const latest = current()
            if (latest.workingWorkout?.id === workout.id && persisted?.id === workout.id) {
              commit(
                { ...latest, workingWorkout: { ...workout, ...persisted, exercises: persisted.exercises ?? workout.exercises } },
                { immediate: true },
              )
            }
          } catch (err) {
            console.error('[Store] beginWorkout persist failed:', err)
          }
        })()
      },
      persistSessionProgress: (progress: SessionProgress) => {
        const s = current()
        if (!s.workingWorkout || !s.accountEmail) return
        const workingWorkout: Workout = { ...s.workingWorkout, ...progress }
        commit(
          { ...s, workingWorkout, workoutInProgress: true },
          { immediate: true },
        )
      },
      abandonWorkout: (workoutId: string) => {
        const s = current()
        void db.abandonWorkout(workoutId).catch((err) => {
          console.error('[Store] abandonWorkout failed:', err)
        })
        commit({ ...s, workingWorkout: null, workoutInProgress: false })
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
      finishWorkout: ({ workoutId, title, durationMin, calories, bodyPart, workoutSets }) => {
        const s = current()
        if (!s.accountEmail) return
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
        const totals = workoutTotalsFromHistory(history)
        void (async () => {
          try {
            await db.abandonWorkouts(s.accountEmail!)
            await db.finalizeWorkout(workoutId, { title, durationMin, calories, bodyPart: bodyPart ?? s.trainerBodyPart })
            if (workoutSets.length > 0) {
              await db.insertWorkoutSets(workoutId, workoutSets)
            }
          } catch (err) {
            console.error('[Store] finishWorkout persist failed:', err)
          }
        })()
        commit({
          ...s,
          calories: totals.calories,
          steps: totals.steps,
          streak: totals.streak,
          workoutInProgress: false,
          workingWorkout: null,
          history,
          plan: [],
          planSource: 'trainer',
          trainerPhase: 'pick',
        }, { immediate: true })
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
          workingWorkout: null,
          plan: [],
          planSource: 'trainer',
          trainerPhase: 'pick',
        }, { immediate: true })
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
      signOut: async () => {
        try {
          await db.clearSession()
        } catch (err) {
          console.error('[Store] Failed to clear session:', err)
        }
        commit({ ...seedState() })
      },
      exportData: async () => {
        const s = current()
        if (!s.accountEmail) return { ok: false, error: 'Log in first' }
        try {
          const backup = await db.exportAccount(s.accountEmail)
          const json = serializeBackup(backup)
          const result = await shareOrDownload(json, backupFilename())
          const message =
            result === 'shared'
              ? 'Backup exported — keep it somewhere safe'
              : result === 'copied'
                ? 'Backup copied to clipboard'
                : 'Backup saved'
          commit({ ...current(), toast: message })
          return { ok: true }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not export'
          commit({ ...current(), toast: message })
          return { ok: false, error: message }
        }
      },
      importData: async (file, opts) => {
        let backup
        try {
          const text = await readTextFile(file)
          backup = parseBackup(text)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not read that backup'
          return { ok: false, error: message }
        }
        const s = current()
        const matters = s.accountEmail && opts?.intoEmail !== undefined
        if (!matters && (await db.accountExists(backup.account.email))) {
          return {
            ok: false,
            error: `An account already exists for ${backup.account.email}. Log in instead.`,
          }
        }
        try {
          await db.importAccount(backup, { newAccount: !matters })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not restore that backup'
          return { ok: false, error: message }
        }
        _initialState = null
        _initPromise = null
        const fresh = await loadInitialState()
        commit({ ...fresh, toast: 'Backup restored' })
        const dest = backup.profile.onboarded ? '/home' : '/onboarding'
        return { ok: true, dest }
      },
    }
  }, [state, hydrated, initError, hydrate, commit])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}