import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite } from '@capacitor-community/sqlite'
import type {
  HistoryItem, Partner, PlannedExercise, PlanSource, TrainerPhase,
} from '../types'
import type { BodyPart, Equipment, TrainerGoal } from '../../data/exercises'
import type { Exercise } from '../../data/exercises'
import { SEED_HISTORY, SEED_PARTNER } from '../../data/seed'
import { verify as verifyPassword } from '../password'

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
    let opened = false
    try {
      // Idempotent; also primed in main.tsx so the web store is ready before React mounts.
      if (Capacitor.getPlatform() === 'web') {
        await CapacitorSQLite.initWebStore()
      }
      await CapacitorSQLite.createConnection({ database: DB_NAME, readonly: false })
      await CapacitorSQLite.open({ database: DB_NAME })
      opened = true
      if (Capacitor.getPlatform() === 'web') {
        await CapacitorSQLite.checkConnectionsConsistency({ dbNames: [DB_NAME], openModes: ['RW'] })
      }
      await createSchema()
      _ready = true
    } catch (err) {
      console.error('[DB] Failed to initialize:', err)
      _ready = false
      if (opened) {
        try {
          await CapacitorSQLite.close({ database: DB_NAME })
        } catch (closeErr) {
          console.error('[DB] Failed to close connection after init error:', closeErr)
        }
      }
      throw err
    }
  })().catch((err) => {
    // Clear only after the partial connection is torn down, so a retry
    // never calls createConnection for a name that is still open.
    _initPromise = null
    throw err
  })
  await _initPromise
}

// --- Schema (version 2) ---

const SCHEMA_VERSION = 2

async function createSchema(): Promise<void> {
  const isCurrent = await hasSchema()
  if (isCurrent) return

  const drops = ['account', 'session', 'profile', 'history', 'plan', 'partner']
  for (const table of drops) {
    await CapacitorSQLite.execute({
      database: DB_NAME,
      statements: `DROP TABLE IF EXISTS ${table}`,
    })
  }

  const TABLES = [
    `CREATE TABLE IF NOT EXISTS account (
      email TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS session (
      id INTEGER PRIMARY KEY DEFAULT 1,
      active_email TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS profile (
      account_email TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT 'Umair',
      weight_kg REAL NOT NULL DEFAULT 72,
      height_ft INTEGER NOT NULL DEFAULT 5,
      height_in INTEGER NOT NULL DEFAULT 9,
      step_goal INTEGER NOT NULL DEFAULT 8000,
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
      account_email TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      date_label TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      calories INTEGER NOT NULL,
      body_part TEXT,
      rest INTEGER,
      sessions INTEGER,
      PRIMARY KEY (account_email, date)
    )`,
    `CREATE TABLE IF NOT EXISTS plan (
      account_email TEXT NOT NULL,
      uid TEXT NOT NULL,
      exercise TEXT NOT NULL,
      sets INTEGER NOT NULL,
      reps INTEGER,
      seconds INTEGER,
      PRIMARY KEY (account_email, uid)
    )`,
    `CREATE TABLE IF NOT EXISTS partner (
      account_email TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Rae',
      streak INTEGER NOT NULL DEFAULT 0,
      steps INTEGER NOT NULL DEFAULT 0,
      calories INTEGER NOT NULL DEFAULT 0,
      last_workout TEXT NOT NULL DEFAULT '',
      history TEXT NOT NULL DEFAULT '[]',
      partner_linked INTEGER NOT NULL DEFAULT 0,
      partner_since TEXT
    )`,
  ]

  for (const sql of TABLES) {
    await CapacitorSQLite.execute({ database: DB_NAME, statements: sql })
  }

  await CapacitorSQLite.run({
    database: DB_NAME,
    statement: 'INSERT OR IGNORE INTO session (id, active_email) VALUES (1, NULL)',
  })

  await CapacitorSQLite.run({
    database: DB_NAME,
    statement: `PRAGMA user_version = ${SCHEMA_VERSION}`,
  })
}

async function hasSchema(): Promise<boolean> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'account'`,
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  return !!rows && rows.length > 0
}

// --- Accounts & session ---

export async function accountExists(email: string): Promise<boolean> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT email FROM account WHERE email = ?',
    values: [email],
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  return !!rows && rows.length > 0
}

export async function createAccountRow(email: string, passwordHash: string, salt: string): Promise<void> {
  return enqueue(async () => {
    const now = new Date().toISOString()
    const statements = [
      {
        statement: 'INSERT INTO account (email, password_hash, salt, created_at) VALUES (?, ?, ?, ?)',
        values: [email, passwordHash, salt, now],
      },
      profileInsertStatement(email, defaultProfileData()),
      partnerInsertStatement(email),
    ]
    await CapacitorSQLite.executeSet({
      database: DB_NAME,
      set: statements,
      transaction: true,
    })
  })
}

export async function verifyCredentials(email: string, password: string): Promise<boolean> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT password_hash, salt FROM account WHERE email = ?',
    values: [email],
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  if (!rows || rows.length === 0) return false
  const row = rows[0]
  return verifyPassword(password, String(row.salt ?? ''), String(row.password_hash ?? ''))
}

export async function getSession(): Promise<string | null> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT active_email FROM session WHERE id = 1',
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  if (!rows || rows.length === 0) return null
  return rows[0].active_email ? String(rows[0].active_email) : null
}

export async function setSession(email: string): Promise<void> {
  return enqueue(async () => {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: 'UPDATE session SET active_email = ? WHERE id = 1',
      values: [email],
    })
  })
}

export async function clearSession(): Promise<void> {
  return enqueue(async () => {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: 'UPDATE session SET active_email = NULL WHERE id = 1',
    })
  })
}

// --- Profile ---

export type ProfileData = {
  displayName: string
  weightKg: number
  heightFt: number
  heightIn: number
  stepGoal: number
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
}

function defaultProfileData(): ProfileData {
  return {
    displayName: 'Umair',
    weightKg: 72,
    heightFt: 5,
    heightIn: 9,
    stepGoal: 8000,
    onboarded: false,
    equipment: ['bodyweight'],
    trainerPhase: 'pick',
    trainerDay: new Date().getDay(),
    trainerBodyPart: 'legs',
    trainerGoal: 'strength',
    partnerLinked: false,
    partnerSince: null,
    streak: 0,
    steps: 0,
    calories: 0,
    workoutDoneToday: false,
    workoutInProgress: false,
    planSource: 'trainer',
  }
}

function profileInsertStatement(accountEmail: string, p: ProfileData): { statement: string; values: unknown[] } {
  return {
    statement: `INSERT INTO profile (account_email, display_name, weight_kg, height_ft, height_in, step_goal, onboarded,
      equipment, trainer_phase, trainer_day, trainer_body_part, trainer_goal,
      partner_linked, partner_since, streak, steps, calories, workout_done_today, workout_in_progress, plan_source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values: [
      accountEmail,
      p.displayName,
      p.weightKg,
      p.heightFt,
      p.heightIn,
      p.stepGoal,
      p.onboarded ? 1 : 0,
      JSON.stringify(p.equipment),
      p.trainerPhase,
      p.trainerDay,
      p.trainerBodyPart,
      p.trainerGoal,
      p.partnerLinked ? 1 : 0,
      p.partnerSince,
      p.streak,
      p.steps,
      p.calories,
      p.workoutDoneToday ? 1 : 0,
      p.workoutInProgress ? 1 : 0,
      p.planSource,
      new Date().toISOString(),
    ],
  }
}

async function seedProfileRow(accountEmail: string): Promise<ProfileData> {
  const data = defaultProfileData()
  const insert = profileInsertStatement(accountEmail, data)
  await CapacitorSQLite.run({
    database: DB_NAME,
    statement: insert.statement,
    values: insert.values,
  })
  return data
}

function rowToProfile(row: Record<string, unknown>): ProfileData {
  return {
    displayName: String(row.display_name || 'Umair'),
    weightKg: Number(row.weight_kg) || 72,
    heightFt: Number(row.height_ft) || 5,
    heightIn: Number(row.height_in) || 9,
    stepGoal: Number(row.step_goal) || 8000,
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

export async function loadProfile(accountEmail: string): Promise<ProfileData> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT * FROM profile WHERE account_email = ?',
    values: [accountEmail],
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  if (!rows || rows.length === 0) {
    return seedProfileRow(accountEmail)
  }
  return rowToProfile(rows[0])
}

export async function saveProfile(accountEmail: string, profile: ProfileData): Promise<void> {
  return enqueue(async () => {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: `UPDATE profile SET
        display_name = ?, weight_kg = ?, height_ft = ?, height_in = ?, step_goal = ?,
        onboarded = ?, equipment = ?,
        trainer_phase = ?, trainer_day = ?, trainer_body_part = ?, trainer_goal = ?,
        partner_linked = ?, partner_since = ?,
        streak = ?, steps = ?, calories = ?,
        workout_done_today = ?, workout_in_progress = ?, plan_source = ?, updated_at = ?
      WHERE account_email = ?`,
      values: [
        profile.displayName,
        profile.weightKg,
        profile.heightFt,
        profile.heightIn,
        profile.stepGoal,
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
        accountEmail,
      ],
    })
  })
}

// --- History ---

export async function loadHistory(accountEmail: string): Promise<HistoryItem[]> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT * FROM history WHERE account_email = ? ORDER BY date DESC',
    values: [accountEmail],
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  if (!rows || rows.length === 0) return SEED_HISTORY
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

export async function saveHistory(accountEmail: string, history: HistoryItem[]): Promise<void> {
  return enqueue(async () => {
    const statements = [
      { statement: 'DELETE FROM history WHERE account_email = ?', values: [accountEmail] },
      ...history.map((item) => ({
        statement: `INSERT INTO history (account_email, id, name, date, date_label, duration_min, calories, body_part, rest, sessions)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          accountEmail, item.id, item.name, item.date, item.dateLabel,
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

export async function loadPlan(accountEmail: string): Promise<PlannedExercise[]> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT * FROM plan WHERE account_email = ?',
    values: [accountEmail],
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

export async function savePlan(accountEmail: string, plan: PlannedExercise[]): Promise<void> {
  return enqueue(async () => {
    const statements = [
      { statement: 'DELETE FROM plan WHERE account_email = ?', values: [accountEmail] },
      ...plan.map((item) => ({
        statement: `INSERT INTO plan (account_email, uid, exercise, sets, reps, seconds) VALUES (?, ?, ?, ?, ?, ?)`,
        values: [
          accountEmail,
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

function partnerInsertStatement(accountEmail: string): { statement: string; values: unknown[] } {
  return {
    statement: `INSERT OR REPLACE INTO partner (account_email, name, streak, steps, calories, last_workout, history, partner_linked, partner_since)
     VALUES (?, 'Rae', 9, 7110, 190, 'Legs · yesterday', ?, 0, NULL)`,
    values: [accountEmail, JSON.stringify(SEED_PARTNER.history)],
  }
}

export async function loadPartner(accountEmail: string): Promise<{ partner: Partner; partnerLinked: boolean; partnerSince: string | null }> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT * FROM partner WHERE account_email = ?',
    values: [accountEmail],
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  if (!rows || rows.length === 0) {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: partnerInsertStatement(accountEmail).statement,
      values: partnerInsertStatement(accountEmail).values,
    })
    return loadPartner(accountEmail)
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

export async function updatePartnerLinked(accountEmail: string, linked: boolean, since: string | null): Promise<void> {
  return enqueue(async () => {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: 'UPDATE partner SET partner_linked = ?, partner_since = ? WHERE account_email = ?',
      values: [linked ? 1 : 0, since, accountEmail],
    })
  })
}