import { useCallback, useMemo, useRef, useState, useEffect, type ReactNode } from 'react'
import { bodyPartForDay, toggleEquipment, type BodyPart, type Equipment, type TrainerGoal } from '../data/exercises'
import { programDayForDate, programDaySlot, programWeek, programById } from '../data/programs'
import { dateLabel, isoDate, streakFromDates } from './dates'
import { derivePartner } from './partner'
import { generateSalt, hashPassword } from './password'
import { advanceProgression, initialProgression, suggestDay, suggestSession } from './trainer'
import { backupFilename, parseBackup, readTextFile, serializeBackup, shareOrDownload } from './backup'
import { StoreContext, type StoreValue } from './store-hooks'
import { requestPersistentStorage } from './persist'
import { createSyncSession, storePendingPairCode, type SessionHooks, type SyncSessionLike } from './sync/session'
import { normalizePairingCode, publicKeyFingerprint } from './pairing'
import type { AppState, HistoryItem, Partner, PlannedExercise, SessionProgress, TrainerProgram, Workout } from './types'
import * as db from './db'

function blankPartner(): Partner {
  return { name: '', streak: 0, steps: 0, calories: 0, lastWorkout: '', history: [], lastSyncedAt: null }
}

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
  partner: blankPartner(),
  partnerFingerprint: null,
  pairCode: null,
  pairState: 'idle',
  pendingPeer: null,
  syncError: null,
  history: [],
  equipment: ['bodyweight'],
  plan: [],
  customExercises: [],
  planSource: 'trainer',
  trainerPhase: 'pick',
  trainerDay: new Date().getDay(),
  trainerBodyPart: bodyPartForDay(new Date().getDay()),
  trainerGoal: 'strength',
  program: null,
  progression: initialProgression(),
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

// Ambiguity-free recovery-code alphabet: A-Z + 2-9 minus I, L, O, 0.
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

// 12 chars over a 31-symbol alphabet ≈ 59 bits of entropy — plenty given the
// 100k-iteration PBKDF2 hash an attacker would have to grind through.
function generateRecoveryCode(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]
  return out
}

async function signInState(email: string): Promise<AppState> {
  const [profile, history, plan, partnerData, activeWorkout, customExercises, pairing, programData] = await Promise.all([
    db.loadProfile(email),
    db.loadHistory(email),
    db.loadPlan(email),
    db.loadPartner(email),
    db.loadWorkoutInProgress(email),
    db.loadCustomExercises(email),
    db.loadPairing(email),
    db.loadProgram(email),
  ])
  const totals = workoutTotalsFromHistory(history)
  const next: AppState = {
    signedIn: true,
    accountEmail: email,
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
    partnerFingerprint: pairing?.peerPublicKey ? publicKeyFingerprint(pairing.peerPublicKey) : null,
    pairCode: pairing?.code ?? null,
    pairState: pairing?.mutual ? 'linked' : 'idle',
    pendingPeer: null,
    syncError: null,
    history,
    equipment: profile.equipment,
    plan,
    customExercises,
    planSource: profile.planSource,
    trainerPhase: profile.trainerPhase,
    trainerDay: profile.trainerDay,
    trainerBodyPart: profile.trainerBodyPart,
    trainerGoal: profile.trainerGoal,
    program: programData.program,
    progression: programData.progression,
    toast: null,
  }
  // An active program drives today's session: calendar row -> focus/plan.
  if (programData.program?.start) {
    const program = programData.program
    const day = programDayForDate(program)
    next.trainerGoal = program.goal
    next.trainerDay = new Date().getDay()
    next.trainerBodyPart = day.focus[0] ?? profile.trainerBodyPart
    if (!activeWorkout) {
      next.plan = day.rest
        ? []
        : suggestDay(day.focus, program.goal, next.equipment, {
            pinned: programDaySlot(program).pinned,
            loads: next.progression.loads,
          })
      next.planSource = 'trainer'
      next.trainerPhase = 'review'
    }
  }
  return next
}

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

        _initialState = await signInState(sessionEmail)
        void requestPersistentStorage()
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

function persistProgram(s: AppState): Promise<void> {
  if (!s.accountEmail) return Promise.resolve()
  return db.saveProgram(s.accountEmail, s.program, s.progression)
}

function persistCustomExercises(s: AppState): Promise<void> {
  if (!s.accountEmail) return Promise.resolve()
  return db.saveCustomExercises(s.accountEmail, s.customExercises)
}

function persistPartnerLinked(s: AppState): Promise<void> {
  if (!s.accountEmail) return Promise.resolve()
  return db.updatePartnerLinked(s.accountEmail, s.partnerLinked, s.partnerSince)
}

function persistPartnerData(s: AppState): Promise<void> {
  if (!s.accountEmail) return Promise.resolve()
  return db.savePartner(s.accountEmail, s.partner, s.partnerLinked, s.partnerSince)
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
  if (s.trainerPhase !== 'review') return next
  if (s.program?.start) {
    const day = programDayForDate(s.program)
    next.plan = day.rest
      ? []
      : suggestDay(day.focus, s.program.goal, equipment, {
          pinned: programDaySlot(s.program).pinned,
          loads: s.progression.loads,
        })
    next.planSource = 'trainer'
    return next
  }
  next.plan = suggestSession(s.trainerBodyPart, s.trainerGoal, equipment)
  next.planSource = 'trainer'
  return next
}

// Today's session when a program is active: rest days yield an empty plan.
function programDayPlan(s: AppState): { plan: PlannedExercise[]; focus: BodyPart[] } | null {
  if (!s.program?.start) return null
  const day = programDayForDate(s.program)
  if (day.rest) return { plan: [], focus: [] }
  return {
    focus: day.focus,
    plan: suggestDay(day.focus, s.program.goal, s.equipment, {
      pinned: programDaySlot(s.program).pinned,
      loads: s.progression.loads,
    }),
  }
}

function programAwareNext(s: AppState, patch: { bodyPart?: BodyPart; goal?: TrainerGoal }): AppState {
  const today = programDayPlan(s)
  if (!today) {
    const bodyPart = patch.bodyPart ?? s.trainerBodyPart
    const goal = patch.goal ?? s.trainerGoal
    return {
      ...s,
      trainerBodyPart: bodyPart,
      trainerGoal: goal,
      plan: suggestSession(bodyPart, goal, s.equipment),
      planSource: 'trainer',
      trainerPhase: 'review',
    }
  }
  return {
    ...s,
    plan: today.plan,
    planSource: 'trainer',
    trainerPhase: 'review',
    trainerBodyPart: today.focus[0] ?? (patch.bodyPart ?? s.trainerBodyPart),
    trainerGoal: s.program?.goal ?? (patch.goal ?? s.trainerGoal),
    trainerDay: new Date().getDay(),
  }
}

const COMMIT_DEBOUNCE_MS = 400
const PERSIST_RETRY_MS = 4000

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const current = () => stateRef.current ?? seedState()

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
      persistProgram(next),
      persistCustomExercises(next),
      persistPartnerLinked(next),
      persistPartnerData(next),
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

  const sessionRef = useRef<SyncSessionLike | null>(null)

  const sessionHooks = useMemo<SessionHooks>(
    () => ({
      getOwnSnapshot: () => {
        const s = current()
        return {
          name: s.displayName,
          history: s.history
            .filter((item) => item && typeof item.date === 'string')
            .map((item) => ({
              date: item.date,
              name: item.name,
              durationMin: item.durationMin,
              calories: item.calories ?? 0,
              rest: item.rest,
            }))
            .sort((a, b) => a.date.localeCompare(b.date)),
          steps: s.steps,
          lastSyncedAt: new Date().toISOString(),
        }
      },
      onPairPatch: (patch) => commit({ ...current(), ...patch }),
      onPairLinked: (peer) => {
        const s = current()
        commit(
          {
            ...s,
            partnerLinked: true,
            partnerSince: s.partnerSince ?? isoDate(),
            partner: { ...blankPartner(), name: peer.name },
            partnerFingerprint: peer.fingerprint,
          },
          { immediate: true },
        )
      },
      applyPartnerPush: (push) => {
        const s = current()
        const partner = derivePartner({
          name: push.name,
          steps: push.steps,
          history: push.history,
          lastSyncedAt: new Date().toISOString(),
        })
        commit(
          {
            ...s,
            partnerLinked: true,
            partnerSince: s.partnerSince ?? isoDate(),
            partner,
          },
          { immediate: true },
        )
      },
      onReminder: (fromName) => commit({ ...current(), toast: `Reminder from ${fromName} — let's go` }),
      onUnpaired: (message) => {
        const s = current()
        commit({
          ...s,
          partnerLinked: false,
          partnerSince: null,
          partner: blankPartner(),
          partnerFingerprint: null,
          toast: message,
        })
      },
      notify: (message) => commit({ ...current(), toast: message }),
    }),
    [commit],
  )

  useEffect(() => {
    if (!hydrated) return
    const email = state?.accountEmail
    if (!email) return
    sessionRef.current?.stop()
    const session = createSyncSession()
    sessionRef.current = session
    void session.configure(email, sessionHooks)
    return () => {
      if (sessionRef.current === session) {
        session.stop()
        sessionRef.current = null
      }
    }
  }, [hydrated, state?.accountEmail, sessionHooks])

  const notifySyncChanged = useCallback(() => {
    sessionRef.current?.notifyChanged()
  }, [])

  const value = useMemo<StoreValue>(() => {
    const base = state ?? seedState()
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
        const recoveryCode = generateRecoveryCode()
        await db.setRecoveryCode(trimmed, recoveryCode)
        await db.setSession(trimmed)
        const next = await signInState(trimmed)
        commit(next)
        void requestPersistentStorage()
        return { ok: true, recoveryCode }
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
        const next = await signInState(trimmed)
        commit(next)
        void requestPersistentStorage()
        return { ok: true, dest: next.onboarded ? '/home' : '/onboarding' }
      },
      resetPassword: async (email, recoveryCode, newPassword) => {
        const trimmed = email.trim().toLowerCase()
        if (!trimmed.includes('@')) return { ok: false, error: 'Enter a valid email' }
        if (newPassword.length < 6) return { ok: false, error: 'Password must be at least 6 characters' }
        const normalized = recoveryCode.trim().toUpperCase().replace(/[^A-Z2-9]/g, '')
        if (normalized.length < 12) return { ok: false, error: 'Enter your 12-character recovery code' }
        const verified = await db.verifyRecoveryCode(trimmed, normalized)
        if (!verified) {
          return { ok: false, error: 'No account for that email, or wrong code.' }
        }
        await db.resetPassword(trimmed, newPassword)
        return { ok: true }
      },
      generateRecoveryCode: async () => {
        const s = current()
        if (!s.accountEmail) return null
        const recoveryCode = generateRecoveryCode()
        await db.setRecoveryCode(s.accountEmail, recoveryCode)
        return recoveryCode
      },
      completeOnboarding: ({ displayName, weightKg, heightFt, heightIn, stepGoal, partnerCode, equipment, trainerGoal }) => {
        const s = current()
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
          partnerLinked: false,
          partnerSince: null,
          plan: [],
          planSource: 'trainer',
          trainerPhase: 'pick',
        })
        const linkCode = normalizePairingCode(partnerCode)
        if (linkCode.length === 6 && s.accountEmail) {
          storePendingPairCode(linkCode)
          void sessionRef.current?.configure(s.accountEmail, sessionHooks)
        }
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
          if (s.program?.start) {
            const day = programDayForDate(s.program)
            next.plan = day.rest
              ? []
              : suggestDay(day.focus, s.program.goal, next.equipment, {
                  pinned: programDaySlot(s.program).pinned,
                  loads: next.progression.loads,
                })
            next.planSource = 'trainer'
          } else {
            next.plan = suggestSession(next.trainerBodyPart, next.trainerGoal, next.equipment)
            next.planSource = 'trainer'
          }
        }
        commit(next)
        notifySyncChanged()
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
      saveCustomExercise: (exercise) => {
        const s = current()
        const name = exercise.name.trim().toLowerCase()
        if (s.customExercises.some((item) => item.name.trim().toLowerCase() === name)) {
          return false
        }
        commit({ ...s, customExercises: [...s.customExercises, exercise] })
        return true
      },
      deleteCustomExercise: (id) => {
        const s = current()
        commit({ ...s, customExercises: s.customExercises.filter((item) => item.id !== id) })
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
              // Start from the newest in-memory state and only fill in exercises
              // from the persisted row, so a newer currentIndex/currentSet/kcal
              // saved while the re-read was in flight is never regressed.
              const merged: Workout = {
                ...latest.workingWorkout,
                exercises: latest.workingWorkout.exercises ?? persisted.exercises ?? workout.exercises,
              }
              commit({ ...latest, workingWorkout: merged }, { immediate: true })
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
      recordSet: (workoutId, set) => {
        void db.insertWorkoutSets(workoutId, [set]).catch((err) => {
          console.error('[Store] recordSet failed:', err)
        })
      },
      loadWorkoutSets: (workoutId) => db.loadWorkoutSets(workoutId),
      setTrainerFocus: ({ bodyPart, goal }) => {
        const s = current()
        commit(programAwareNext(s, { bodyPart, goal }))
      },
      setTrainerDay: (day) => {
        const s = current()
        if (s.program?.start) {
          commit(programAwareNext(s, {}))
          return
        }
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
        commit(programAwareNext(s, { bodyPart: s.trainerBodyPart, goal: s.trainerGoal }))
      },
      beginTrainerReview: () => {
        const s = current()
        commit(programAwareNext(s, { bodyPart: s.trainerBodyPart, goal: s.trainerGoal }))
      },
      selectProgram: (id) => {
        const s = current()
        if (s.workoutInProgress) return
        const preset = programById(id)
        if (!preset) return
        const program: TrainerProgram = {
          id: preset.id,
          name: preset.name,
          goal: preset.goal,
          start: isoDate(),
          template: preset.template,
        }
        const progressed: AppState = { ...s, program, progression: initialProgression() }
        commit(programAwareNext(progressed, { bodyPart: progressed.trainerBodyPart, goal: preset.goal }), { immediate: true })
      },
      clearProgram: () => {
        const s = current()
        commit(
          {
            ...s,
            program: null,
            progression: initialProgression(),
            plan: [],
            planSource: 'trainer',
            trainerPhase: s.workoutInProgress ? s.trainerPhase : 'pick',
            trainerBodyPart: bodyPartForDay(new Date().getDay()),
            trainerDay: new Date().getDay(),
          },
          { immediate: true },
        )
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
        let next: AppState = {
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
        }
        if (s.program?.start) {
          const day = programDayForDate(s.program, date)
          if (!day.rest) {
            next = {
              ...next,
              progression: advanceProgression(
                s.progression,
                s.program.goal,
                date,
                s.workingWorkout?.exercises ?? s.plan,
                workoutSets,
                programWeek(s.program, date),
              ),
            }
          }
        }
        commit(next, { immediate: true })
        notifySyncChanged()
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
        notifySyncChanged()
      },
      unlinkPartner: () => {
        const s = current()
        commit({
          ...s,
          partnerLinked: false,
          partnerSince: null,
          partner: blankPartner(),
          partnerFingerprint: null,
        }, { immediate: true })
        sessionRef.current?.unlink()
      },
      startPairing: (code) => {
        sessionRef.current?.startPairing(code)
      },
      acceptPair: () => {
        sessionRef.current?.acceptPeer()
      },
      declinePair: () => {
        sessionRef.current?.declinePeer()
      },
      refreshPartner: () => {
        sessionRef.current?.refreshPartner()
      },
      remindPartner: () => {
        sessionRef.current?.remindPartner()
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
          await db.importAccount(backup, { newAccount: !matters, intoEmail: opts?.intoEmail })
          if (opts?.newPassword) {
            const target = opts.intoEmail ?? backup.account.email
            await db.resetPassword(target, opts.newPassword)
          }
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
  }, [state, hydrated, initError, hydrate, commit, sessionHooks, notifySyncChanged])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}