import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite } from '@capacitor-community/sqlite'
import type {
  BackupPairing, EmberBackup, HistoryItem, Partner, PartnerActivity, PlannedExercise, PlanSource, SessionProgress, TrainerPhase,
  TrainerProgram, ProgramProgression, Workout, WorkoutSet,
} from '../types'
import { derivePartner } from '../partner'
import type { BodyPart, Equipment, TrainerGoal } from '../../data/exercises'
import type { Exercise } from '../../data/exercises'
import { isoDate } from '../dates'
import { generateSalt, hashPassword, verify as verifyPassword } from '../password'
import { initialProgression } from '../trainer'

const DB_NAME = 'ember_db'

// Dev-only convenience account, provisioned by ensureDevSeed().
const DEV_ACCOUNT_EMAIL = 'dev@ember.app'
const DEV_ACCOUNT_PASSWORD = 'dev1234'

let _ready = false
let _initPromise: Promise<void> | null = null

// Serializes all DB writes so overlapping callers never interleave.
// On web the SQLite engine runs in-memory (sql.js); after each write the
// database is saved back to the IndexedDB web store so a reload restores it.
let _writeQueue: Promise<void> = Promise.resolve()

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = _writeQueue.then(fn, fn)
  _writeQueue = run.then(() =>
    Capacitor.getPlatform() === 'web'
      ? CapacitorSQLite.saveToStore({ database: DB_NAME })
      : undefined,
  )
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
      if (Capacitor.getPlatform() === 'web') {
        await CapacitorSQLite.saveToStore({ database: DB_NAME })
      }
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

// --- Schema (version 8) ---

const SCHEMA_VERSION = 8

const WORKOUT_TABLE = `CREATE TABLE IF NOT EXISTS workout (
  id TEXT PRIMARY KEY,
  account_email TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  title TEXT,
  duration_min INTEGER,
  calories INTEGER,
  body_part TEXT,
  plan_for_date TEXT,
  current_index INTEGER DEFAULT 0,
  current_set INTEGER DEFAULT 0,
  phase TEXT DEFAULT 'work',
  elapsed INTEGER DEFAULT 0,
  kcal INTEGER DEFAULT 0,
  rest_seconds INTEGER DEFAULT 0,
  work_seconds INTEGER DEFAULT 0,
  sets_logged INTEGER DEFAULT 0,
  exercises_json TEXT
)`

const WORKOUT_SET_TABLE = `CREATE TABLE IF NOT EXISTS workout_set (
  id TEXT PRIMARY KEY,
  workout_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  exercise_id TEXT NOT NULL,
  exercise_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  set_no INTEGER NOT NULL,
  reps INTEGER,
  seconds INTEGER,
  weight_kg REAL,
  done INTEGER NOT NULL DEFAULT 1
)`

const PLAN_INDEX = 'CREATE INDEX IF NOT EXISTS idx_plan_account_date ON plan (account_email, for_date)'
const WORKOUT_SET_INDEX = 'CREATE INDEX IF NOT EXISTS idx_workout_set_workout ON workout_set (workout_id)'

const CUSTOM_EXERCISE_TABLE = `CREATE TABLE IF NOT EXISTS custom_exercise (
  account_email TEXT NOT NULL,
  id TEXT NOT NULL,
  exercise_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_email, id)
)`

const PAIRING_TABLE = `CREATE TABLE IF NOT EXISTS pairing (
  account_email TEXT PRIMARY KEY,
  secret_key TEXT NOT NULL,
  public_key TEXT NOT NULL,
  code TEXT,
  peer_public_key TEXT,
  peer_name TEXT,
  peer_email TEXT,
  mutual INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`

// One active program per account (the selected preset + its start/progression).
const PROGRAM_TABLE = `CREATE TABLE IF NOT EXISTS program (
  account_email TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  goal TEXT NOT NULL,
  start TEXT,
  template TEXT NOT NULL,
  progression TEXT NOT NULL
)`

async function getSchemaVersion(): Promise<number> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'PRAGMA user_version',
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  if (!rows || rows.length === 0) return 0
  const version = rows[0].user_version ?? rows[0]['user_version']
  return Number(version) || 0
}

async function setSchemaVersion(version: number): Promise<void> {
  await CapacitorSQLite.run({
    database: DB_NAME,
    statement: `PRAGMA user_version = ${version}`,
  })
}

async function tableExists(table: string): Promise<boolean> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    values: [table],
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  return !!rows && rows.length > 0
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: `PRAGMA table_info(${table})`,
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  return !!rows && rows.some((row) => row.name === column)
}

async function createSchema(): Promise<void> {
  const version = await getSchemaVersion()

  if (version === 0) {
    const TABLES = [
      `CREATE TABLE IF NOT EXISTS account (
      email TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      recovery_salt TEXT,
      recovery_hash TEXT
    )`,
      `CREATE TABLE IF NOT EXISTS session (
      id INTEGER PRIMARY KEY DEFAULT 1,
      active_email TEXT
    )`,
      `CREATE TABLE IF NOT EXISTS profile (
      account_email TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT '',
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
      for_date TEXT,
      weight_kg REAL,
      PRIMARY KEY (account_email, uid)
    )`,
      `CREATE TABLE IF NOT EXISTS partner (
      account_email TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      streak INTEGER NOT NULL DEFAULT 0,
      steps INTEGER NOT NULL DEFAULT 0,
      calories INTEGER NOT NULL DEFAULT 0,
      last_workout TEXT NOT NULL DEFAULT '',
      history TEXT NOT NULL DEFAULT '[]',
      partner_linked INTEGER NOT NULL DEFAULT 0,
      partner_since TEXT,
      last_synced_at TEXT
    )`,
      PAIRING_TABLE,
      WORKOUT_TABLE,
      WORKOUT_SET_TABLE,
      CUSTOM_EXERCISE_TABLE,
      PROGRAM_TABLE,
      PLAN_INDEX,
      WORKOUT_SET_INDEX,
    ]

    for (const sql of TABLES) {
      await CapacitorSQLite.execute({ database: DB_NAME, statements: sql })
    }

    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: 'INSERT OR IGNORE INTO session (id, active_email) VALUES (1, NULL)',
    })

    await setSchemaVersion(SCHEMA_VERSION)
    return
  }

  if (version < 3) {
    await migrateV2toV3()
  }

  if (version < 4) {
    await migrateV3toV4()
  }

  // v4 -> v5 only adds an idempotent table, so run it unconditionally: a
  // database whose user_version was already promoted to 5 without the table
  // (e.g. by an intermediate build) must still get custom_exercise created.
  await migrateV4toV5()

  if (version < 6) {
    await migrateV5toV6()
  }

  if (version < 7) {
    await migrateV6toV7()
  }

  if (version < 8) {
    await migrateV7toV8()
  }

  await setSchemaVersion(SCHEMA_VERSION)
}

// Data-preserving v2 -> v3 upgrade. Existing account/session/profile/history/plan/partner
// rows are kept; only new columns + tables are added.
async function migrateV2toV3(): Promise<void> {
  if (await tableExists('plan')) {
    if (!(await columnExists('plan', 'for_date'))) {
      await CapacitorSQLite.execute({
        database: DB_NAME,
        statements: `ALTER TABLE plan ADD COLUMN for_date TEXT`,
      })
    }
    if (!(await columnExists('plan', 'weight_kg'))) {
      await CapacitorSQLite.execute({
        database: DB_NAME,
        statements: `ALTER TABLE plan ADD COLUMN weight_kg REAL`,
      })
    }
    await CapacitorSQLite.execute({
      database: DB_NAME,
      statements: `UPDATE plan SET for_date = COALESCE(for_date, '${isoDate()}')`,
    })
  }

  await CapacitorSQLite.execute({ database: DB_NAME, statements: WORKOUT_TABLE })
  await CapacitorSQLite.execute({ database: DB_NAME, statements: WORKOUT_SET_TABLE })
  await CapacitorSQLite.execute({ database: DB_NAME, statements: PLAN_INDEX })
  await CapacitorSQLite.execute({ database: DB_NAME, statements: WORKOUT_SET_INDEX })

  if (await tableExists('session')) {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: 'INSERT OR IGNORE INTO session (id, active_email) VALUES (1, NULL)',
    })
  }

  await setSchemaVersion(3)
}

// Seed purge v3 -> v4. Removes only unambiguous demo artifacts: the fixed seed
// history ids and the mock partner row. Real account rows pass through untouched.
async function migrateV3toV4(): Promise<void> {
  await CapacitorSQLite.execute({
    database: DB_NAME,
    statements: `DELETE FROM history WHERE id IN ('h1', 'h2', 'h3', 'h4')`,
  })
  await CapacitorSQLite.execute({
    database: DB_NAME,
    statements: `UPDATE partner SET name = '', streak = 0, steps = 0, calories = 0,
      last_workout = '', history = '[]', partner_linked = 0 WHERE name = 'Rae'`,
  })
}

// v4 -> v5. Creates the custom_exercise table for user-defined moves.
async function migrateV4toV5(): Promise<void> {
  await CapacitorSQLite.execute({ database: DB_NAME, statements: CUSTOM_EXERCISE_TABLE })
}

// v5 -> v6. Adds per-account recovery-code fields (hashed at rest). Data-preserving.
async function migrateV5toV6(): Promise<void> {
  if (!(await columnExists('account', 'recovery_salt'))) {
    await CapacitorSQLite.execute({
      database: DB_NAME,
      statements: 'ALTER TABLE account ADD COLUMN recovery_salt TEXT',
    })
  }
  if (!(await columnExists('account', 'recovery_hash'))) {
    await CapacitorSQLite.execute({
      database: DB_NAME,
      statements: 'ALTER TABLE account ADD COLUMN recovery_hash TEXT',
    })
  }
}

// v6 -> v7. Adds the per-account `pairing` table (P2P identity/codes) and the
// synced-cache `partner.last_synced_at` column. Data-preserving.
async function migrateV6toV7(): Promise<void> {
  await CapacitorSQLite.execute({ database: DB_NAME, statements: PAIRING_TABLE })
  if (await tableExists('partner')) {
    if (!(await columnExists('partner', 'last_synced_at'))) {
      await CapacitorSQLite.execute({
        database: DB_NAME,
        statements: 'ALTER TABLE partner ADD COLUMN last_synced_at TEXT',
      })
    }
  }
}

// v7 -> v8. Adds the per-account `program` table (selected program preset +
// start/progression). Data-preserving.
async function migrateV7toV8(): Promise<void> {
  await CapacitorSQLite.execute({ database: DB_NAME, statements: PROGRAM_TABLE })
}

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

export async function setRecoveryCode(email: string, code: string | null): Promise<void> {
  return enqueue(async () => {
    if (code) {
      const salt = generateSalt()
      const recoveryHash = await hashPassword(code, salt)
      await CapacitorSQLite.run({
        database: DB_NAME,
        statement: 'UPDATE account SET recovery_salt = ?, recovery_hash = ? WHERE email = ?',
        values: [salt, recoveryHash, email],
      })
    } else {
      await CapacitorSQLite.run({
        database: DB_NAME,
        statement: 'UPDATE account SET recovery_salt = NULL, recovery_hash = NULL WHERE email = ?',
        values: [email],
      })
    }
  })
}

export async function verifyRecoveryCode(email: string, code: string): Promise<boolean> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT recovery_salt, recovery_hash FROM account WHERE email = ?',
    values: [email],
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  if (!rows || rows.length === 0) return false
  const row = rows[0]
  if (!row.recovery_salt || !row.recovery_hash) return false
  return verifyPassword(code, String(row.recovery_salt), String(row.recovery_hash))
}

export async function resetPassword(email: string, newPassword: string): Promise<void> {
  return enqueue(async () => {
    const salt = generateSalt()
    const passwordHash = await hashPassword(newPassword, salt)
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: 'UPDATE account SET password_hash = ?, salt = ? WHERE email = ?',
      values: [passwordHash, salt, email],
    })
  })
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

// Dev-only: on first launch, provision a test account (onboarded, so it skips
// onboarding) and sign in to it. Once the account exists this is a no-op, so a
// manual logout stays logged out and real sessions are never overridden.
export async function ensureDevSeed(): Promise<void> {
  if (await accountExists(DEV_ACCOUNT_EMAIL)) return
  const salt = await generateSalt()
  const hash = await hashPassword(DEV_ACCOUNT_PASSWORD, salt)
  await createAccountRow(DEV_ACCOUNT_EMAIL, hash, salt)
  const profile = await loadProfile(DEV_ACCOUNT_EMAIL)
  await saveProfile(DEV_ACCOUNT_EMAIL, { ...profile, onboarded: true })
  await setSession(DEV_ACCOUNT_EMAIL)
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
  workoutInProgress: boolean
  planSource: PlanSource
}

function defaultProfileData(): ProfileData {
  return {
    displayName: '',
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
    workoutInProgress: false,
    planSource: 'trainer',
  }
}

function profileInsertStatement(accountEmail: string, p: ProfileData): { statement: string; values: unknown[] } {
  return {
    statement: `INSERT INTO profile (account_email, display_name, weight_kg, height_ft, height_in, step_goal, onboarded,
      equipment, trainer_phase, trainer_day, trainer_body_part, trainer_goal,
      partner_linked, partner_since, streak, steps, calories, workout_in_progress, plan_source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      p.workoutInProgress ? 1 : 0,
      p.planSource,
      new Date().toISOString(),
    ],
  }
}

async function seedProfileRow(accountEmail: string): Promise<ProfileData> {
  return enqueue(async () => {
    const data = defaultProfileData()
    const insert = profileInsertStatement(accountEmail, data)
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: insert.statement,
      values: insert.values,
    })
    return data
  })
}

function rowToProfile(row: Record<string, unknown>): ProfileData {
  return {
    displayName: String(row.display_name || ''),
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
        workout_in_progress = ?, plan_source = ?, updated_at = ?
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
  if (!rows || rows.length === 0) return []
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

// --- Custom exercises ---

async function ensureCustomExerciseTable(): Promise<void> {
  await CapacitorSQLite.execute({ database: DB_NAME, statements: CUSTOM_EXERCISE_TABLE })
}

export async function loadCustomExercises(accountEmail: string): Promise<Exercise[]> {
  await ensureCustomExerciseTable()
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT exercise_json FROM custom_exercise WHERE account_email = ? ORDER BY created_at ASC',
    values: [accountEmail],
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  if (!rows || rows.length === 0) return []
  return rows.map((row) => JSON.parse(String(row.exercise_json)) as Exercise)
}

function customExerciseInsertStatement(email: string, exercise: Exercise): { statement: string; values: unknown[] } {
  return {
    statement: `INSERT INTO custom_exercise (account_email, id, exercise_json, created_at) VALUES (?, ?, ?, ?)`,
    values: [email, exercise.id, JSON.stringify(exercise), new Date().toISOString()],
  }
}

export async function saveCustomExercises(accountEmail: string, exercises: Exercise[]): Promise<void> {
  return enqueue(async () => {
    await ensureCustomExerciseTable()
    const statements = [
      { statement: 'DELETE FROM custom_exercise WHERE account_email = ?', values: [accountEmail] },
      ...exercises.map((exercise) => customExerciseInsertStatement(accountEmail, exercise)),
    ]
    await CapacitorSQLite.executeSet({
      database: DB_NAME,
      set: statements,
      transaction: true,
    })
  })
}

// --- Workout ---

function rowToWorkout(row: Record<string, unknown>): Workout {
  const phase = row.phase as Workout['phase']
  return {
    id: String(row.id),
    accountEmail: String(row.account_email),
    date: String(row.date),
    status: String(row.status) as Workout['status'],
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    title: row.title ? String(row.title) : null,
    durationMin: row.duration_min != null ? Number(row.duration_min) : null,
    calories: row.calories != null ? Number(row.calories) : null,
    bodyPart: row.body_part ? (String(row.body_part) as BodyPart) : null,
    planForDate: row.plan_for_date ? String(row.plan_for_date) : null,
    currentIndex: Number(row.current_index) || 0,
    currentSet: Number(row.current_set) || 0,
    phase: phase === 'rest' || phase === 'done' ? phase : 'work',
    elapsed: Number(row.elapsed) || 0,
    kcal: Number(row.kcal) || 0,
    restSeconds: Number(row.rest_seconds) || 0,
    workSeconds: Number(row.work_seconds) || 0,
    setsLogged: Number(row.sets_logged) || 0,
    exercises: row.exercises_json ? (JSON.parse(String(row.exercises_json)) as PlannedExercise[]) : null,
  }
}

export async function loadWorkoutInProgress(accountEmail: string): Promise<Workout | null> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT * FROM workout WHERE account_email = ? AND status = ? ORDER BY started_at DESC LIMIT 1',
    values: [accountEmail, 'in_progress'],
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  if (!rows || rows.length === 0) return null
  return rowToWorkout(rows[0])
}

function mapWorkoutSetRow(row: Record<string, unknown>): WorkoutSet {
  return {
    id: String(row.id),
    workoutId: String(row.workout_id),
    position: Number(row.position) || 0,
    exerciseId: String(row.exercise_id),
    exerciseName: String(row.exercise_name),
    kind: String(row.kind) as WorkoutSet['kind'],
    setNo: Number(row.set_no) || 1,
    reps: row.reps != null ? Number(row.reps) : undefined,
    seconds: row.seconds != null ? Number(row.seconds) : undefined,
    weightKg: row.weight_kg != null ? Number(row.weight_kg) : undefined,
    done: !!row.done,
  }
}

export async function loadWorkoutSets(workoutId: string): Promise<WorkoutSet[]> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: `SELECT id, workout_id, position, exercise_id, exercise_name, kind, set_no,
      reps, seconds, weight_kg, done FROM workout_set WHERE workout_id = ? ORDER BY position, set_no`,
    values: [workoutId],
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  if (!rows) return []
  return rows.map(mapWorkoutSetRow)
}

export async function saveWorkout(workout: Workout): Promise<void> {
  return enqueue(async () => {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: `INSERT INTO workout (
        id, account_email, date, status, started_at, finished_at, title, duration_min,
        calories, body_part, plan_for_date, current_index, current_set, phase, elapsed,
        kcal, rest_seconds, work_seconds, sets_logged, exercises_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values: [
        workout.id,
        workout.accountEmail,
        workout.date,
        workout.status,
        workout.startedAt,
        workout.finishedAt,
        workout.title,
        workout.durationMin,
        workout.calories,
        workout.bodyPart,
        workout.planForDate,
        workout.currentIndex,
        workout.currentSet,
        workout.phase,
        workout.elapsed,
        workout.kcal,
        workout.restSeconds,
        workout.workSeconds,
        workout.setsLogged,
        workout.exercises ? JSON.stringify(workout.exercises) : null,
      ],
    })
  })
}

export async function updateWorkoutProgress(workoutId: string, progress: SessionProgress): Promise<void> {
  return enqueue(async () => {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: `UPDATE workout SET
        current_index = ?, current_set = ?, phase = ?, elapsed = ?, kcal = ?,
        rest_seconds = ?, work_seconds = ?, sets_logged = ?
      WHERE id = ? AND status = 'in_progress'`,
      values: [
        progress.currentIndex,
        progress.currentSet,
        progress.phase,
        progress.elapsed,
        progress.kcal,
        progress.restSeconds,
        progress.workSeconds,
        progress.setsLogged,
        workoutId,
      ],
    })
  })
}

export async function finalizeWorkout(workoutId: string, input: {
  title: string
  durationMin: number
  calories: number
  bodyPart: BodyPart
}): Promise<void> {
  return enqueue(async () => {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: `UPDATE workout SET
        status = 'completed', finished_at = ?, title = ?, duration_min = ?,
        calories = ?, body_part = ?
      WHERE id = ?`,
      values: [new Date().toISOString(), input.title, input.durationMin, input.calories, input.bodyPart, workoutId],
    })
  })
}

export async function abandonWorkouts(accountEmail: string): Promise<void> {
  return enqueue(async () => {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: `UPDATE workout SET status = 'abandoned' WHERE account_email = ? AND status = 'in_progress'`,
      values: [accountEmail],
    })
  })
}

export async function abandonWorkout(workoutId: string): Promise<void> {
  return enqueue(async () => {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: `UPDATE workout SET status = 'abandoned' WHERE id = ? AND status = 'in_progress'`,
      values: [workoutId],
    })
  })
}

export async function insertWorkoutSets(workoutId: string, sets: WorkoutSet[]): Promise<void> {
  return enqueue(async () => {
    const statements = sets.map((set) => ({
      statement: `INSERT OR REPLACE INTO workout_set (
        id, workout_id, position, exercise_id, exercise_name, kind,
        set_no, reps, seconds, weight_kg, done
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values: [
        set.id,
        workoutId,
        set.position,
        set.exerciseId,
        set.exerciseName,
        set.kind,
        set.setNo,
        set.reps ?? null,
        set.seconds ?? null,
        set.weightKg ?? null,
        set.done ? 1 : 0,
      ],
    }))
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
    weightKg: row.weight_kg != null ? Number(row.weight_kg) : undefined,
  }))
}

export async function savePlan(accountEmail: string, plan: PlannedExercise[], forDate = isoDate()): Promise<void> {
  return enqueue(async () => {
    const statements = [
      { statement: 'DELETE FROM plan WHERE account_email = ?', values: [accountEmail] },
      ...plan.map((item) => ({
        statement: `INSERT INTO plan (account_email, uid, exercise, sets, reps, seconds, for_date, weight_kg)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          accountEmail,
          item.uid,
          JSON.stringify(item.exercise),
          item.sets,
          item.reps || null,
          item.seconds || null,
          forDate,
          item.weightKg ?? null,
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

// --- Program ---

export type ProgramRow = {
  program: TrainerProgram | null
  progression: ProgramProgression
}

export async function loadProgram(accountEmail: string): Promise<ProgramRow> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT * FROM program WHERE account_email = ?',
    values: [accountEmail],
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  if (!rows || rows.length === 0) return { program: null, progression: initialProgression() }
  const row = rows[0]
  const program: TrainerProgram = {
    id: String(row.id),
    name: String(row.name),
    goal: String(row.goal) as TrainerGoal,
    start: row.start ? String(row.start) : null,
    template: JSON.parse(String(row.template)),
  }
  return {
    program,
    progression: JSON.parse(String(row.progression)) as ProgramProgression,
  }
}

// Passing a null program clears the active program row for the account.
export async function saveProgram(
  accountEmail: string,
  program: TrainerProgram | null,
  progression: ProgramProgression,
): Promise<void> {
  return enqueue(async () => {
    if (!program) {
      await CapacitorSQLite.run({
        database: DB_NAME,
        statement: 'DELETE FROM program WHERE account_email = ?',
        values: [accountEmail],
      })
      return
    }
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: `INSERT OR REPLACE INTO program
        (account_email, id, name, goal, start, template, progression)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      values: [
        accountEmail,
        program.id,
        program.name,
        program.goal,
        program.start,
        JSON.stringify(program.template),
        JSON.stringify(progression),
      ],
    })
  })
}

// --- Partner ---

function partnerInsertStatement(accountEmail: string): { statement: string; values: unknown[] } {
  return {
    statement: `INSERT OR REPLACE INTO partner (account_email, name, streak, steps, calories, last_workout, history, partner_linked, partner_since, last_synced_at)
     VALUES (?, '', 0, 0, 0, '', '[]', 0, NULL, NULL)`,
    values: [accountEmail],
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
    await enqueue(async () => {
      const insert = partnerInsertStatement(accountEmail)
      await CapacitorSQLite.run({
        database: DB_NAME,
        statement: insert.statement,
        values: insert.values,
      })
    })
    return loadPartner(accountEmail)
  }
  const row = rows[0]
  const history = JSON.parse(String(row.history || '[]')) as PartnerActivity[]
  const partner = derivePartner({
    name: String(row.name || ''),
    steps: Number(row.steps) || 0,
    history,
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
  })
  return {
    partner,
    partnerLinked: !!(row.partner_linked as number),
    partnerSince: row.partner_since ? String(row.partner_since) : null,
  }
}

export async function savePartner(
  accountEmail: string,
  partner: Partner,
  linked: boolean,
  since: string | null,
): Promise<void> {
  return enqueue(async () => {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: `UPDATE partner SET
        name = ?, steps = ?, history = ?, partner_linked = ?, partner_since = ?, last_synced_at = ?
      WHERE account_email = ?`,
      values: [
        partner.name,
        partner.steps,
        JSON.stringify(partner.history),
        linked ? 1 : 0,
        since,
        partner.lastSyncedAt,
        accountEmail,
      ],
    })
  })
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

// --- Pairing (P2P identity) ---

export type PairingData = {
  secretKey: string
  publicKey: string
  code: string | null
  peerPublicKey: string | null
  peerName: string | null
  peerEmail: string | null
  mutual: boolean
  createdAt: string
}

export async function loadPairing(accountEmail: string): Promise<PairingData | null> {
  const result = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT * FROM pairing WHERE account_email = ?',
    values: [accountEmail],
  })
  const rows = result.values as Record<string, unknown>[] | undefined
  if (!rows || rows.length === 0) return null
  const row = rows[0]
  return {
    secretKey: String(row.secret_key),
    publicKey: String(row.public_key),
    code: row.code ? String(row.code) : null,
    peerPublicKey: row.peer_public_key ? String(row.peer_public_key) : null,
    peerName: row.peer_name ? String(row.peer_name) : null,
    peerEmail: row.peer_email ? String(row.peer_email) : null,
    mutual: !!(row.mutual as number),
    createdAt: String(row.created_at),
  }
}

export async function savePairing(accountEmail: string, pairing: PairingData): Promise<void> {
  return enqueue(async () => {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: `INSERT OR REPLACE INTO pairing (
        account_email, secret_key, public_key, code, peer_public_key, peer_name, peer_email, mutual, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values: [
        accountEmail,
        pairing.secretKey,
        pairing.publicKey,
        pairing.code,
        pairing.peerPublicKey,
        pairing.peerName,
        pairing.peerEmail,
        pairing.mutual ? 1 : 0,
        pairing.createdAt,
        new Date().toISOString(),
      ],
    })
  })
}

// --- Backup / restore ---

function workoutInsertStatement(w: Workout): { statement: string; values: unknown[] } {
  return {
    statement: `INSERT INTO workout (
      id, account_email, date, status, started_at, finished_at, title, duration_min,
      calories, body_part, plan_for_date, current_index, current_set, phase, elapsed,
      kcal, rest_seconds, work_seconds, sets_logged, exercises_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values: [
      w.id,
      w.accountEmail,
      w.date,
      w.status,
      w.startedAt,
      w.finishedAt,
      w.title,
      w.durationMin,
      w.calories,
      w.bodyPart,
      w.planForDate,
      w.currentIndex,
      w.currentSet,
      w.phase,
      w.elapsed,
      w.kcal,
      w.restSeconds,
      w.workSeconds,
      w.setsLogged,
      w.exercises ? JSON.stringify(w.exercises) : null,
    ],
  }
}

function workoutSetInsertStatement(ws: WorkoutSet): { statement: string; values: unknown[] } {
  return {
    statement: `INSERT INTO workout_set (
      id, workout_id, position, exercise_id, exercise_name, kind,
      set_no, reps, seconds, weight_kg, done
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values: [
      ws.id,
      ws.workoutId,
      ws.position,
      ws.exerciseId,
      ws.exerciseName,
      ws.kind,
      ws.setNo,
      ws.reps ?? null,
      ws.seconds ?? null,
      ws.weightKg ?? null,
      ws.done ? 1 : 0,
    ],
  }
}

function planInsertStatement(accountEmail: string, item: PlannedExercise, forDate: string): { statement: string; values: unknown[] } {
  return {
    statement: `INSERT INTO plan (account_email, uid, exercise, sets, reps, seconds, for_date, weight_kg)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    values: [
      accountEmail,
      item.uid,
      JSON.stringify(item.exercise),
      item.sets,
      item.reps || null,
      item.seconds || null,
      forDate,
      item.weightKg ?? null,
    ],
  }
}

function historyInsertStatement(accountEmail: string, item: HistoryItem): { statement: string; values: unknown[] } {
  return {
    statement: `INSERT INTO history (account_email, id, name, date, date_label, duration_min, calories, body_part, rest, sessions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values: [
      accountEmail, item.id, item.name, item.date, item.dateLabel,
      item.durationMin, item.calories,
      item.bodyPart || null,
      item.rest ? 1 : 0,
      item.sessions || null,
    ],
  }
}

function partnerInsertFullStatement(accountEmail: string, p: Partner, linked: boolean, since: string | null): { statement: string; values: unknown[] } {
  return {
    statement: `INSERT OR REPLACE INTO partner (account_email, name, streak, steps, calories, last_workout, history, partner_linked, partner_since, last_synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values: [accountEmail, p.name, p.streak, p.steps, p.calories, p.lastWorkout, JSON.stringify(p.history), linked ? 1 : 0, since, p.lastSyncedAt],
  }
}

export async function exportAccount(accountEmail: string): Promise<EmberBackup> {
  const accountResult = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT email, password_hash, salt, created_at, recovery_salt, recovery_hash FROM account WHERE email = ?',
    values: [accountEmail],
  })
  const accountRows = accountResult.values as Record<string, unknown>[] | undefined
  const accountRow = accountRows?.[0]
  if (!accountRow) throw new Error('Account not found')

  const workoutResult = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT * FROM workout WHERE account_email = ? ORDER BY started_at',
    values: [accountEmail],
  })
  const workoutRows = workoutResult.values as Record<string, unknown>[] | undefined ?? []
  const workouts = workoutRows.map(rowToWorkout)

  let workoutSets: WorkoutSet[] = []
  if (workouts.length > 0) {
    const workoutIds = workouts.map((w) => w.id)
    const placeholders = workoutIds.map(() => '?').join(', ')
    const setResult = await CapacitorSQLite.query({
      database: DB_NAME,
      statement: `SELECT id, workout_id, position, exercise_id, exercise_name, kind, set_no,
        reps, seconds, weight_kg, done FROM workout_set
        WHERE workout_id IN (${placeholders}) ORDER BY workout_id, position, set_no`,
      values: workoutIds,
    })
    workoutSets = (setResult.values as Record<string, unknown>[] | undefined ?? []).map(mapWorkoutSetRow)
  }

  const planResult = await CapacitorSQLite.query({
    database: DB_NAME,
    statement: 'SELECT * FROM plan WHERE account_email = ? ORDER BY for_date',
    values: [accountEmail],
  })
  const planRows = planResult.values as Record<string, unknown>[] | undefined ?? []
  const planByDate = new Map<string, PlannedExercise[]>()
  for (const row of planRows) {
    const forDate = String(row.for_date ?? isoDate())
    const items = planByDate.get(forDate) ?? []
    items.push({
      uid: String(row.uid),
      exercise: JSON.parse(String(row.exercise)) as Exercise,
      sets: Number(row.sets) || 1,
      reps: row.reps ? Number(row.reps) : undefined,
      seconds: row.seconds ? Number(row.seconds) : undefined,
      weightKg: row.weight_kg != null ? Number(row.weight_kg) : undefined,
    })
    planByDate.set(forDate, items)
  }

  const [profile, history, partnerData, customExercises, pairing] = await Promise.all([
    loadProfile(accountEmail),
    loadHistory(accountEmail),
    loadPartner(accountEmail),
    loadCustomExercises(accountEmail),
    loadPairing(accountEmail),
  ])

  const programRow = await loadProgram(accountEmail)

  return {
    app: 'ember',
    schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    account: {
      email: String(accountRow.email),
      passwordHash: String(accountRow.password_hash),
      salt: String(accountRow.salt),
      createdAt: String(accountRow.created_at),
      recoverySalt: accountRow.recovery_salt ? String(accountRow.recovery_salt) : null,
      recoveryHash: accountRow.recovery_hash ? String(accountRow.recovery_hash) : null,
    },
    pairing: pairing
      ? {
          secretKey: pairing.secretKey,
          publicKey: pairing.publicKey,
          code: pairing.code,
          peerPublicKey: pairing.peerPublicKey,
          peerName: pairing.peerName,
          peerEmail: pairing.peerEmail,
          mutual: pairing.mutual,
          createdAt: pairing.createdAt,
        }
      : null,
    profile,
    history,
    plan: Array.from(planByDate.entries()).map(([forDate, items]) => ({ forDate, items })),
    program: programRow.program ? programRow : null,
    partner: partnerData.partner,
    partnerLinked: partnerData.partnerLinked,
    partnerSince: partnerData.partnerSince,
    workouts,
    workoutSets,
    customExercises,
  }
}

function pairingInsertStatement(email: string, pairing: BackupPairing): { statement: string; values: unknown[] } {
  return {
    statement: `INSERT INTO pairing (
      account_email, secret_key, public_key, code, peer_public_key, peer_name, peer_email, mutual, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values: [
      email,
      pairing.secretKey,
      pairing.publicKey,
      pairing.code,
      pairing.peerPublicKey,
      pairing.peerName,
      pairing.peerEmail,
      pairing.mutual ? 1 : 0,
      pairing.createdAt,
      new Date().toISOString(),
    ],
  }
}

function replaceAccountStatements(backup: EmberBackup, email: string): { statement: string; values: unknown[] }[] {
  const planStatements = backup.plan.flatMap(({ forDate, items }) =>
    items.map((item) => planInsertStatement(email, item, forDate)),
  )
  return [
    {
      statement: `DELETE FROM workout_set WHERE workout_id IN (SELECT id FROM workout WHERE account_email = ?)`,
      values: [email],
    },
    { statement: 'DELETE FROM workout WHERE account_email = ?', values: [email] },
    { statement: 'DELETE FROM plan WHERE account_email = ?', values: [email] },
    { statement: 'DELETE FROM history WHERE account_email = ?', values: [email] },
    { statement: 'DELETE FROM partner WHERE account_email = ?', values: [email] },
    { statement: 'DELETE FROM pairing WHERE account_email = ?', values: [email] },
    { statement: 'DELETE FROM program WHERE account_email = ?', values: [email] },
    { statement: 'DELETE FROM profile WHERE account_email = ?', values: [email] },
    { statement: 'DELETE FROM custom_exercise WHERE account_email = ?', values: [email] },
    profileInsertStatement(email, backup.profile),
    partnerInsertFullStatement(email, backup.partner, backup.partnerLinked, backup.partnerSince),
    ...(backup.pairing ? [pairingInsertStatement(email, backup.pairing)] : []),
    ...(backup.program?.program
      ? [
          {
            statement: `INSERT INTO program (account_email, id, name, goal, start, template, progression)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
            values: [
              email,
              backup.program.program.id,
              backup.program.program.name,
              backup.program.program.goal,
              backup.program.program.start,
              JSON.stringify(backup.program.program.template),
              JSON.stringify(backup.program.progression),
            ],
          },
        ]
      : []),
    ...backup.history.map((item) => historyInsertStatement(email, item)),
    ...(backup.customExercises ?? []).map((exercise) => customExerciseInsertStatement(email, exercise)),
    ...planStatements,
    ...backup.workouts.map((w) => workoutInsertStatement({ ...w, accountEmail: email })),
    ...backup.workoutSets.map(workoutSetInsertStatement),
  ]
}

export async function importAccount(backup: EmberBackup, opts: { newAccount: boolean; intoEmail?: string }): Promise<void> {
  const email = opts.intoEmail ?? backup.account.email
  return enqueue(async () => {
    await ensureCustomExerciseTable()
    const set = replaceAccountStatements(backup, email)
    if (opts.newAccount) {
      set.unshift({
        statement: 'INSERT OR IGNORE INTO account (email, password_hash, salt, created_at, recovery_salt, recovery_hash) VALUES (?, ?, ?, ?, ?, ?)',
        values: [backup.account.email, backup.account.passwordHash, backup.account.salt, backup.account.createdAt, backup.account.recoverySalt, backup.account.recoveryHash],
      })
      set.push({ statement: 'UPDATE session SET active_email = ? WHERE id = 1', values: [backup.account.email] })
    }
    await CapacitorSQLite.executeSet({
      database: DB_NAME,
      set,
      transaction: true,
    })
  })
}