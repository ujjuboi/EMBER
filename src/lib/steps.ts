import { Capacitor } from '@capacitor/core'
import { HealthFitness } from '@capacitor/health-fitness'

/**
 * Real device steps via Health Connect (Android) / HealthKit (iOS).
 *
 * Web is intentionally a no-op: every helper degrades to the caller's fallback
 * so the PWA keeps its workout-derived estimate and never shows a broken 0.
 */

export type StepsPermission = 'unknown' | 'granted' | 'denied'

export function isNative(): boolean {
  return Capacitor.getPlatform() !== 'web'
}

export function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android'
}

export function isIos(): boolean {
  return Capacitor.getPlatform() === 'ios'
}

// The plugin's native date parser only accepts "yyyy-MM-dd'T'HH:mm:ssZ" — a
// fractional-seconds suffix (toISOString()'s default) is rejected/crashes it.
export function toNativeDate(d: Date): string {
  return d.toISOString().split('.')[0] + 'Z'
}

function localMidnight(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

const STEPS_READ_PERMISSION = JSON.stringify([{ Variable: 'STEPS', AccessType: 'READ' }])
const GROUP_OFF = JSON.stringify({ IsActive: false, AccessType: 'READ' })

// A grant hint survives app restarts (unlike the module state below) so we can
// trust a legitimate 0-step morning instead of falling back to the estimate.
const GRANT_HINT_KEY = 'ember:steps:granted'

function readGrantHint(): boolean {
  try {
    return localStorage.getItem(GRANT_HINT_KEY) === '1'
  } catch {
    return false
  }
}

function writeGrantHint(granted: boolean): void {
  try {
    if (granted) localStorage.setItem(GRANT_HINT_KEY, '1')
    else localStorage.removeItem(GRANT_HINT_KEY)
  } catch {
    /* storage unavailable — hint is best-effort only */
  }
}

let permission: StepsPermission = readGrantHint() ? 'granted' : 'unknown'

export function stepsPermission(): StepsPermission {
  return permission
}

function setPermission(next: StepsPermission): void {
  permission = next
  writeGrantHint(next === 'granted')
}

interface QueryBlock {
  values?: number[]
  value?: number
  startDate?: number
  endDate?: number
}

function parseBlocks(raw: string | undefined): QueryBlock[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (Array.isArray(parsed)) return parsed as QueryBlock[]
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { results?: unknown }).results)) {
    return (parsed as { results: QueryBlock[] }).results
  }
  return []
}

function blockTotal(block: QueryBlock): number {
  const values = Array.isArray(block.values) ? block.values : []
  const total = values.reduce((sum, v) => sum + (Number(v) || 0), 0)
  if (values.length > 0) return total
  return Number(block.value) || 0
}

// iOS emits epoch seconds, Android epoch milliseconds — normalise either.
function blockDate(raw: number | undefined): Date | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  const ms = raw > 1e11 ? raw : raw * 1000
  return new Date(ms)
}

async function querySteps(start: Date, end: Date): Promise<number> {
  const { results } = await HealthFitness.getData({
    parameters: JSON.stringify({
      Variable: 'STEPS',
      StartDate: toNativeDate(start),
      EndDate: toNativeDate(end),
      TimeUnit: 'DAY',
      OperationType: 'SUM',
      TimeUnitLength: 1,
      AdvancedQueryReturnType: 'ALL_DATA',
      AdvancedQueryResultType: 'RAW_DATA',
    }),
  })
  return parseBlocks(results).reduce((sum, block) => sum + blockTotal(block), 0)
}

/**
 * Ask the OS for read access to steps. Resolves `true` only when access was
 * actually granted; never rejects (a missing privacy URL, missing Health
 * Connect, or a user "deny" all resolve `false`).
 */
export async function requestStepsPermission(): Promise<boolean> {
  if (!isNative()) return false
  try {
    const result: unknown = await HealthFitness.requestHealthPermissions({
      customPermissions: STEPS_READ_PERMISSION,
      allVariables: GROUP_OFF,
      fitnessVariables: GROUP_OFF,
      healthVariables: GROUP_OFF,
      profileVariables: GROUP_OFF,
      workoutVariables: GROUP_OFF,
    })
    // Android resolves (rather than rejects) with a `{ results: [...] }` error
    // payload when Google Play Services / Health Connect is unavailable.
    if (result && typeof result === 'object' && 'results' in result) {
      setPermission('denied')
      return false
    }
    setPermission('granted')
    return true
  } catch {
    setPermission('denied')
    return false
  }
}

/** Today's steps from local midnight to now. Rejects if the query fails. */
export async function getTodaySteps(): Promise<number> {
  if (!isNative()) return 0
  return querySteps(localMidnight(), new Date())
}

/** Per-day step totals, most recent last. Local ISO dates. */
export async function getStepHistory(days: number): Promise<{ date: string; steps: number }[]> {
  if (!isNative() || days <= 0) return []
  const end = new Date()
  const start = localMidnight(end)
  start.setDate(start.getDate() - (days - 1))
  const { results } = await HealthFitness.getData({
    parameters: JSON.stringify({
      Variable: 'STEPS',
      StartDate: toNativeDate(start),
      EndDate: toNativeDate(end),
      TimeUnit: 'DAY',
      OperationType: 'SUM',
      TimeUnitLength: 1,
      AdvancedQueryReturnType: 'ALL_DATA',
      AdvancedQueryResultType: 'RAW_DATA',
    }),
  })
  return parseBlocks(results).map((block, index) => {
    const at = blockDate(block.startDate) ?? new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    return {
      date: `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`,
      steps: blockTotal(block),
    }
  })
}

/**
 * Steps for the current user. On web (or before access is granted) this is a
 * passthrough of `fallback` — the caller's workout-derived estimate — so no
 * screen ever shows a broken 0. Never rejects.
 */
export async function getOwnSteps(fallback: number): Promise<number> {
  if (!isNative()) return fallback
  try {
    const steps = await getTodaySteps()
    if (steps > 0) {
      setPermission('granted')
      return steps
    }
    // A successful query with no steps only means "today really is 0" once
    // access is known to be granted; otherwise the user was never asked.
    return permission === 'granted' ? steps : fallback
  } catch {
    return fallback
  }
}
