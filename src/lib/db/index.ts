import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite } from '@capacitor-community/sqlite'
import type {
  HistoryItem, Partner, PlannedExercise, PlanSource, TrainerPhase,
} from '../types'
import type { BodyPart, Equipment, TrainerGoal } from '../../data/exercises'
import {
  normalizeBodyPart, normalizeTrainerGoal, type Exercise,
} from '../../data/exercises'
import { SEED_HISTORY, SEED_PARTNER } from '../../data/seed'

const DB_NAME = 'ember_db'

let _ready = false
let _initPromise: Promise<void> | null = null

// Serializes all DB writes so overlapping callers never interleave
let _writeQueue: Promise<void> = Promise.resolve()

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = _writeQueue.then(fn, fn)
  _writeQueue = run.then(() => {})
  return run
}

export function isDbReady(): boolean {
  return _ready
}

export async function initDb(): Promise<void> {
  if (_ready) return
  if (_initPromise) {
    await _initPromise
    return
  }
  _initPromise = (async () => {
    try {
      if (Capacitor.getPlatform() === 'web') {
        await CapacitorSQLite.initWebStore()
      }
      await CapacitorSQLite.createConnection({ database: DB_NAME, readonly: false })
      await CapacitorSQLite.open({ database: DB_NAME })
      if (Capacitor.getPlatform() === 'web') {
        await CapacitorSQLite.checkConnectionsConsistency({ dbNames: [DB_NAME], openModes: ['RW'] })
      }
      await createTables()
      _ready = true
    } catch (err) {
      console.error('[DB] Failed to initialize:', err)
      _ready = false
      _initPromise = null
      throw err
    }
  })()
  await _initPromise
}

async function createTables(): Promise<void> {
  const TABLES = [
    `CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY DEFAULT 1,
      display_name TEXT NOT NULL DEFAULT 'Umair',
      weight_kg REAL NOT NULL DEFAULT 72,
      height_ft INTEGER NOT NULL DEFAULT 5,
      height_in INTEGER NOT NULL DEFAULT 9,
      step_goal INTEGER NOT NULL DEFAULT 8000,
      signed_in INTEGER NOT NULL DEFAULT 0,
      account_email TEXT,
      onboarded INTEGER NOT NULL DEFAULT 0,
      equipment TEXT NOT NULL DEFAULT '["bodyweight"]',
      trainer_phase TEXT NOT NULL DEFAULT 'pick',
      trainer_day INTEGER NOT NULL DEFAULT 0,
      trainer_body_part TEXT NOT NULL DEFAULT 'legs',
      trainer_goal TEXT NOT NULL DEFAULT 'strength',
      partner_linked INTEGER NOT NULL DEFAULT 0,
      partner_since TEXT,
      streak INTEGER NOT NULL DEFAULT 0,
      steps INTEGER NOT NULL DEFAULT 0,
      calories INTEGER NOT NULL DEFAULT 0,
      workout_done_today INTEGER NOT NULL DEFAULT 0,
      workout_in_progress INTEGER NOT NULL DEFAULT 0,
      plan_source TEXT NOT NULL DEFAULT 'trainer',
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      date TEXT NOT NULL UNIQUE,
      date_label TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      calories INTEGER NOT NULL,
      body_part TEXT,
      rest INTEGER,
      sessions INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS plan (
      uid TEXT PRIMARY KEY,
      exercise TEXT NOT NULL,
      sets INTEGER NOT NULL,
      reps INTEGER,
      seconds INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS partner (
      id INTEGER PRIMARY KEY DEFAULT 1,
      name TEXT NOT NULL,
      streak INTEGER NOT NULL,
      steps INTEGER NOT NULL,
      calories INTEGER NOT NULL,
      last_workout TEXT NOT NULL,
      history TEXT NOT NULL DEFAULT '[]',
      partner_linked INTEGER NOT NULL DEFAULT 0,
      partner_since TEXT
    )`,
  ]

  for (const sql of TABLES) {
    await CapacitorSQLite.execute({ database: DB_NAME, statements: sql })
  }

  // Seed profile if empty
  const profileResult = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT * FROM profile',
  })
  const rows = profileResult.values as Record<string, unknown>[] | undefined
  if (!rows || rows.length === 0) {
    await seedProfileRow()
  }
}

// --- Profile ---

export async function loadProfile(): Promise<{
  displayName: string
  weightKg: number
  heightFt: number
  heightIn: number
  stepGoal: number
  signedIn: boolean
  accountEmail: string | null
  onboarded: boolean
  equipment: Equipment[]
  trainerPhase: TrainerPhase
  trainerDay: number
  trainerBodyPart: BodyPart
  trainerGoal: TrainerGoal
  partnerLinked: boolean
  partnerSince: string | null
  streak: number
  steps: number
  calories: number
  workoutDoneToday: boolean
  workoutInProgress: boolean
  planSource: PlanSource
}> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT * FROM profile WHERE id = 1',
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  if (!rows || rows.length === 0) {
    await seedProfileRow()
    return loadProfile()
  }
  const row = rows[0]
  return {
    displayName: String(row.display_name || 'Umair'),
    weightKg: Number(row.weight_kg) || 72,
    heightFt: Number(row.height_ft) || 5,
    heightIn: Number(row.height_in) || 9,
    stepGoal: Number(row.step_goal) || 8000,
    signedIn: !!(row.signed_in as number),
    accountEmail: row.account_email ? String(row.account_email) : null,
    onboarded: !!(row.onboarded as number),
    equipment: JSON.parse(String(row.equipment || '["bodyweight"]')) as Equipment[],
    trainerPhase: (row.trainer_phase as TrainerPhase) || 'pick',
    trainerDay: Number(row.trainer_day) || new Date().getDay(),
    trainerBodyPart: (row.trainer_body_part as BodyPart) || 'legs',
    trainerGoal: (row.trainer_goal as TrainerGoal) || 'strength',
    partnerLinked: !!(row.partner_linked as number),
    partnerSince: row.partner_since ? String(row.partner_since) : null,
    streak: Number(row.streak) || 0,
    steps: Number(row.steps) || 0,
    calories: Number(row.calories) || 0,
    workoutDoneToday: !!(row.workout_done_today as number),
    workoutInProgress: !!(row.workout_in_progress as number),
    planSource: (row.plan_source as PlanSource) || 'trainer',
  }
}

async function seedProfileRow(): Promise<void> {
  await CapacitorSQLite.run({
    database: DB_NAME,
    statement: `INSERT INTO profile (display_name, weight_kg, height_ft, height_in, step_goal, signed_in, onboarded,
      equipment, trainer_phase, trainer_day, trainer_body_part, trainer_goal,
      partner_linked, streak, steps, calories, workout_done_today, workout_in_progress, plan_source, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?, 'pick', ?, 'legs', 'strength', 0, 0, 0, 0, 0, 0, 'trainer', ?)`,
    values: ['Umair', 72, 5, 9, 8000, JSON.stringify(['bodyweight']), new Date().getDay(), new Date().toISOString()],
  })
}

export async function saveProfile(profile: {
  displayName: string
  weightKg: number
  heightFt: number
  heightIn: number
  stepGoal: number
  signedIn: boolean
  accountEmail: string | null
  onboarded: boolean
  equipment: Equipment[]
  trainerPhase: TrainerPhase
  trainerDay: number
  trainerBodyPart: BodyPart
  trainerGoal: TrainerGoal
  partnerLinked: boolean
  partnerSince: string | null
  streak: number
  steps: number
  calories: number
  workoutDoneToday: boolean
  workoutInProgress: boolean
  planSource: PlanSource
}): Promise<void> {
  return enqueue(async () => {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: `UPDATE profile SET
        display_name = ?, weight_kg = ?, height_ft = ?, height_in = ?, step_goal = ?,
        signed_in = ?, account_email = ?, onboarded = ?, equipment = ?,
        trainer_phase = ?, trainer_day = ?, trainer_body_part = ?, trainer_goal = ?,
        partner_linked = ?, partner_since = ?,
        streak = ?, steps = ?, calories = ?,
        workout_done_today = ?, workout_in_progress = ?, plan_source = ?, updated_at = ?
      WHERE id = 1`,
      values: [
        profile.displayName,
        profile.weightKg,
        profile.heightFt,
        profile.heightIn,
        profile.stepGoal,
        profile.signedIn ? 1 : 0,
        profile.accountEmail,
        profile.onboarded ? 1 : 0,
        JSON.stringify(profile.equipment),
        profile.trainerPhase,
        profile.trainerDay,
        profile.trainerBodyPart,
        profile.trainerGoal,
        profile.partnerLinked ? 1 : 0,
        profile.partnerSince,
        profile.streak,
        profile.steps,
        profile.calories,
        profile.workoutDoneToday ? 1 : 0,
        profile.workoutInProgress ? 1 : 0,
        profile.planSource,
        new Date().toISOString(),
      ],
    })
  })
}

// --- History ---

export async function loadHistory(): Promise<HistoryItem[]> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT * FROM history ORDER BY date DESC',
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  if (!rows) return SEED_HISTORY
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    date: String(row.date),
    dateLabel: String(row.date_label),
    durationMin: Number(row.duration_min) || 0,
    calories: Number(row.calories) || 0,
    bodyPart: row.body_part ? String(row.body_part) as BodyPart : undefined,
    rest: !!(row.rest as number),
    sessions: row.sessions ? Number(row.sessions) : undefined,
  }))
}

export async function saveHistory(history: HistoryItem[]): Promise<void> {
  return enqueue(async () => {
    const statements = [
      { statement: 'DELETE FROM history', values: [] as unknown[] },
      ...history.map((item) => ({
        statement: `INSERT INTO history (id, name, date, date_label, duration_min, calories, body_part, rest, sessions)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          item.id, item.name, item.date, item.dateLabel,
          item.durationMin, item.calories,
          item.bodyPart || null,
          item.rest ? 1 : 0,
          item.sessions || null,
        ],
      })),
    ]
    await CapacitorSQLite.executeSet({
      database: DB_NAME,
      set: statements,
      transaction: true,
    })
  })
}

// --- Plan ---

export async function loadPlan(): Promise<PlannedExercise[]> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT * FROM plan',
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  if (!rows) return []
  return rows.map((row) => ({
    uid: String(row.uid),
    exercise: JSON.parse(String(row.exercise)) as Exercise,
    sets: Number(row.sets) || 1,
    reps: row.reps ? Number(row.reps) : undefined,
    seconds: row.seconds ? Number(row.seconds) : undefined,
  }))
}

export async function savePlan(plan: PlannedExercise[]): Promise<void> {
  return enqueue(async () => {
    const statements = [
      { statement: 'DELETE FROM plan', values: [] as unknown[] },
      ...plan.map((item) => ({
        statement: `INSERT INTO plan (uid, exercise, sets, reps, seconds) VALUES (?, ?, ?, ?, ?)`,
        values: [
          item.uid,
          JSON.stringify(item.exercise),
          item.sets,
          item.reps || null,
          item.seconds || null,
        ],
      })),
    ]
    await CapacitorSQLite.executeSet({
      database: DB_NAME,
      set: statements,
      transaction: true,
    })
  })
}

// --- Partner ---

export async function loadPartner(): Promise<{ partner: Partner; partnerLinked: boolean; partnerSince: string | null }> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT * FROM partner WHERE id = 1',
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  if (!rows || rows.length === 0) {
    await seedPartnerRow()
    return loadPartner()
  }
  const row = rows[0]
  return {
    partner: {
      name: String(row.name || 'Rae'),
      streak: Number(row.streak) || 0,
      steps: Number(row.steps) || 0,
      calories: Number(row.calories) || 0,
      lastWorkout: String(row.last_workout || ''),
      history: JSON.parse(String(row.history || '[]')),
    },
    partnerLinked: !!(row.partner_linked as number),
    partnerSince: row.partner_since ? String(row.partner_since) : null,
  }
}

async function seedPartnerRow(): Promise<void> {
  await CapacitorSQLite.run({
    database: DB_NAME,
    statement: `INSERT INTO partner (id, name, streak, steps, calories, last_workout, history, partner_linked, partner_since)
     VALUES (1, 'Rae', 9, 7110, 190, 'Legs · yesterday', ?, 0, NULL)`,
    values: [JSON.stringify(SEED_PARTNER.history)],
  })
}

export async function savePartner(partner: Partner): Promise<void> {
  return enqueue(async () => {
    const historyJson = JSON.stringify(partner.history)
    await CapacitorSQLite.executeSet({
      database: DB_NAME,
      transaction: true,
      set: [
        { statement: 'DELETE FROM partner WHERE id = 1', values: [] },
        {
          statement: `INSERT INTO partner (id, name, streak, steps, calories, last_workout, history, partner_linked, partner_since)
           VALUES (1, ?, ?, ?, ?, ?, ?, 0, NULL)`,
          values: [partner.name, partner.streak, partner.steps, partner.calories, partner.lastWorkout, historyJson],
        },
      ],
    })
  })
}

export async function updatePartnerLinked(linked: boolean, since: string | null): Promise<void> {
  return enqueue(async () => {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: `UPDATE partner SET partner_linked = ?, partner_since = ? WHERE id = 1`,
      values: [linked ? 1 : 0, since],
    })
  })
}

// --- Migration ---

const STORAGE_KEY = 'ember-prototype-v5'

export async function migrateLegacy(): Promise<boolean> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed.onboarded) return false

    const history = ((parsed.history as unknown[]) ?? []).map((item: unknown) => {
      const i = item as Record<string, unknown>
      return {
        ...i,
        name: remapSessionName(String(i.name)),
        bodyPart: i.bodyPart ? normalizeBodyPart(i.bodyPart) : i.bodyPart,
      }
    })
    const partnerRaw = parsed.partner as Record<string, unknown> | undefined
    const partner = partnerRaw
      ? {
          ...partnerRaw,
          lastWorkout: remapSessionName(String(partnerRaw.lastWorkout || '')),
          history: ((partnerRaw.history as unknown[]) ?? []).map((item: unknown) => {
            const i = item as Record<string, unknown>
            return { ...i, name: remapSessionName(String(i.name)) }
          }),
        }
      : SEED_PARTNER
    const plan = (parsed.plan as unknown[]) ?? []
    const equipment = (parsed.equipment as string[]) ?? ['bodyweight']
    const trainerGoal = normalizeTrainerGoal(parsed.trainerGoal ?? 'strength')
    const trainerBodyPart = normalizeBodyPart(parsed.trainerBodyPart ?? 'legs')

    await saveProfile({
      displayName: String(parsed.displayName || 'Umair'),
      weightKg: Number(parsed.weightKg) || 72,
      heightFt: Number(parsed.heightFt) || 5,
      heightIn: Number(parsed.heightIn) || 9,
      stepGoal: Number(parsed.stepGoal) || 8000,
      signedIn: !!parsed.signedIn,
      accountEmail: parsed.accountEmail ? String(parsed.accountEmail) : null,
      onboarded: !!parsed.onboarded,
      equipment: equipment as Equipment[],
      trainerPhase: String(parsed.trainerPhase || 'pick') as TrainerPhase,
      trainerDay: Number(parsed.trainerDay) || new Date().getDay(),
      trainerBodyPart: trainerBodyPart as BodyPart,
      trainerGoal: trainerGoal as TrainerGoal,
      partnerLinked: !!parsed.partnerLinked,
      partnerSince: parsed.partnerSince ? String(parsed.partnerSince) : null,
      streak: Number(parsed.streak) || 0,
      steps: Number(parsed.steps) || 0,
      calories: Number(parsed.calories) || 0,
      workoutDoneToday: !!parsed.workoutDoneToday,
      workoutInProgress: !!parsed.workoutInProgress,
      planSource: String(parsed.planSource || 'trainer') as PlanSource,
    })

    await saveHistory(history as HistoryItem[])
    await savePlan(plan as PlannedExercise[])
    await savePartner(partner as Partner)

    await updatePartnerLinked(!!parsed.partnerLinked, parsed.partnerSince ? String(parsed.partnerSince) : null)

    sessionStorage.removeItem(STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

function remapSessionName(name: string): string {
  if (name === 'Push + squat') return 'Chest + squat'
  if (name === 'Full mix') return 'Leg mix'
  if (name === 'Push') return 'Chest'
  if (name === 'Pull') return 'Back'
  if (name === 'Full body') return 'Legs'
  return name.replace(/^Push ·/, 'Chest ·').replace(/^Pull ·/, 'Back ·').replace(/^Full body ·/, 'Legs ·')
}
