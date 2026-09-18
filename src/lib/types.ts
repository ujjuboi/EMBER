import type { BodyPart, Equipment, Exercise, TrainerGoal } from '../data/exercises'
import type { ProfileData } from './db'

export type EmberBackup = {
  app: 'ember'
  schema: number
  exportedAt: string
  account: {
    email: string
    passwordHash: string
    salt: string
    createdAt: string
    recoverySalt: string | null
    recoveryHash: string | null
  }
  pairing: BackupPairing | null
  profile: ProfileData
  history: HistoryItem[]
  plan: { forDate: string; items: PlannedExercise[] }[]
  program: { program: TrainerProgram | null; progression: ProgramProgression } | null
  partner: Partner
  partnerLinked: boolean
  partnerSince: string | null
  workouts: Workout[]
  workoutSets: WorkoutSet[]
  customExercises: Exercise[]
}

export type BackupPairing = {
  secretKey: string
  publicKey: string
  code: string | null
  peerPublicKey: string | null
  peerName: string | null
  peerEmail: string | null
  mutual: boolean
  createdAt: string
}

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
  calories?: number
  rest?: boolean
}

export type Partner = {
  name: string
  streak: number
  steps: number
  calories: number
  lastWorkout: string
  history: PartnerActivity[]
  lastSyncedAt: string | null
}

// P2P partner sync (phase 2)
export type PairState = 'idle' | 'searching' | 'connecting' | 'waiting' | 'linked' | 'error'

export type PendingPeer = {
  name: string
  email: string
  fingerprint: string
}

export type SyncPush = {
  name: string
  history: PartnerActivity[]
  steps: number
  lastSyncedAt: string
}

export type WorkoutStatus = 'in_progress' | 'completed' | 'abandoned'

export type Workout = {
  id: string
  accountEmail: string
  date: string
  status: WorkoutStatus
  startedAt: string
  finishedAt: string | null
  title: string | null
  durationMin: number | null
  calories: number | null
  bodyPart: BodyPart | null
  planForDate: string | null
  currentIndex: number
  currentSet: number
  phase: 'work' | 'rest' | 'done'
  elapsed: number
  kcal: number
  restSeconds: number
  workSeconds: number
  setsLogged: number
  exercises: PlannedExercise[] | null
}

export type WorkoutSet = {
  id: string
  workoutId: string
  position: number
  exerciseId: string
  exerciseName: string
  kind: 'reps' | 'timed'
  setNo: number
  reps?: number
  seconds?: number
  weightKg?: number
  done: boolean
}

export type SessionProgress = {
  currentIndex: number
  currentSet: number
  phase: 'work' | 'rest' | 'done'
  elapsed: number
  kcal: number
  restSeconds: number
  workSeconds: number
  setsLogged: number
}

export type PlannedExercise = {
  uid: string
  exercise: Exercise
  sets: number
  reps?: number
  seconds?: number
  weightKg?: number
}

// Program preset shape (plans/workout-programs.md). Additive type-only for
// now — consumed later by the 12-week program + extracted-plan features.
export type ProgramDayTemplate = {
  focus: BodyPart[]
  pinned?: PlannedExercise[]
}

export type ProgramLoad = {
  sets?: number
  reps?: number
}

export type ProgramProgression = {
  week: number
  loads: Record<string, ProgramLoad>
  completedDates: string[]
}

export type ProgramDay = {
  date: string
  focus: BodyPart[]
  rest: boolean
  completed: boolean
}

export type TrainerProgram = {
  id: string
  name: string
  goal: TrainerGoal
  start: string | null
  template: ProgramDayTemplate[]
  calendar?: ProgramDay[]
}

// Workout plans extracted from a website (scripts/extract-program.mjs). Each
// "planned" object is a wire-ready PlannedExercise; the raw fields keep the
// source faithful for review.
export type ExtractedWorkoutSet = {
  sourceName: string
  sourceHref: string | null
  rawSets: string
  rawReps: string
  planned: PlannedExercise
}

export type ExtractedProgramDay = {
  label: string
  focus: BodyPart[]
  exercises: ExtractedWorkoutSet[]
}

export type ExtractedProgram = {
  id: string
  name: string
  goal: TrainerGoal
  days: ExtractedProgramDay[]
  template: ProgramDayTemplate[]
}

export type ExtractedProgramFile = {
  app: 'ember'
  kind: 'workout-program'
  schema: number
  source: {
    url: string
    site: string
    title: string
    author: string | null
    publishedAt: string | null
    pdfUrl: string | null
    fetchedAt: string
    banner?: {
      query: string
      engine: string
      url: string
      file: string
    } | null
  }
  summary: Record<string, string | string[] | null>
  programs: ExtractedProgram[]
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
  workoutInProgress: boolean
  workingWorkout: Workout | null
  partnerLinked: boolean
  partnerSince: string | null
  partner: Partner
  partnerFingerprint: string | null
  pairCode: string | null
  pairState: PairState
  pendingPeer: PendingPeer | null
  syncError: string | null
  history: HistoryItem[]
  equipment: Equipment[]
  plan: PlannedExercise[]
  customExercises: Exercise[]
  program: TrainerProgram | null
  progression: ProgramProgression
  planSource: PlanSource
  trainerPhase: TrainerPhase
  trainerDay: number
  trainerBodyPart: BodyPart
  trainerGoal: TrainerGoal
  toast: string | null
}
