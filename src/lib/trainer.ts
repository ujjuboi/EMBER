import { EXERCISES, bodyPartLabel, goalLabel, type BodyPart, type Equipment, type Exercise, type TrainerGoal } from '../data/exercises'
import type { PlannedExercise, ProgramLoad, ProgramProgression, WorkoutSet } from './types'

function kitHas(kit: Equipment[], needed: Equipment): boolean {
  if (kit.includes(needed)) return true
  if (needed === 'bands' && kit.includes('tubes')) return true
  return false
}

export function fitsKit(exercise: Exercise, kit: Equipment[]): boolean {
  if (exercise.isCustom) return true
  const needed = exercise.equipment ?? ['bodyweight']
  if (needed.length === 0) return kit.length > 0
  return needed.every((item) => kitHas(kit, item))
}

function matchesAnyPart(exercise: Exercise, focus: BodyPart[]): boolean {
  return (exercise.bodyParts ?? []).some((part) => focus.includes(part))
}

export function libraryFor(bodyPart: BodyPart, kit: Equipment[]): Exercise[] {
  return EXERCISES.filter((item) => !item.isCustom && fitsKit(item, kit) && (item.bodyParts ?? []).includes(bodyPart))
}

function scoreExercise(exercise: Exercise, focus: BodyPart[], goal: TrainerGoal): number {
  const parts = exercise.bodyParts ?? []
  const goals = exercise.goals ?? []
  const primary = focus[0]
  let score = 0

  if (parts[0] === primary) {
    score += 3
  } else if (parts.some((part) => focus.includes(part))) {
    score += 1
  }

  if (goals.includes(goal)) score += 2
  if (exercise.compound) score += 2
  if (goal === 'fatloss' && (exercise.kind === 'timed' || exercise.compound)) score += 1
  if (goal === 'endurance' && exercise.kind === 'timed') score += 1
  if (goal === 'muscle' && exercise.kind === 'reps') score += 1
  if (goal === 'strength' && exercise.compound) score += 1
  if (goal === 'mobility' && (exercise.kind === 'timed' || (exercise.defaultReps ?? 0) <= 10)) score += 1
  if (goal === 'general') score += 1

  return score
}

function prescribe(exercise: Exercise, goal: TrainerGoal): PlannedExercise {
  const clone: Exercise = { ...exercise }

  if (goal === 'strength') {
    clone.defaultSets = 4
    clone.restSeconds = 60
    if (clone.kind === 'reps') {
      clone.defaultReps = Math.max(6, Math.round((exercise.defaultReps ?? 10) * 0.7))
    } else {
      clone.defaultSeconds = Math.max(20, Math.round((exercise.defaultSeconds ?? 30) * 0.8))
    }
  } else if (goal === 'muscle') {
    clone.defaultSets = 4
    clone.restSeconds = 60
    if (clone.kind === 'reps') {
      clone.defaultReps = Math.min(12, Math.max(8, exercise.defaultReps ?? 10))
    }
  } else if (goal === 'fatloss') {
    clone.defaultSets = 3
    clone.restSeconds = 20
    if (clone.kind === 'timed') {
      clone.defaultSeconds = Math.max(30, exercise.defaultSeconds ?? 30)
    } else {
      clone.defaultReps = Math.round((exercise.defaultReps ?? 12) * 1.15)
    }
  } else if (goal === 'mobility') {
    clone.defaultSets = 3
    clone.restSeconds = 30
    if (clone.kind === 'timed') {
      clone.defaultSeconds = Math.max(30, Math.round((exercise.defaultSeconds ?? 30) * 1.2))
    } else {
      clone.defaultReps = Math.max(8, Math.round((exercise.defaultReps ?? 10) * 0.85))
    }
  } else if (goal === 'general') {
    clone.defaultSets = 3
    clone.restSeconds = 40
  } else {
    clone.defaultSets = 3
    clone.restSeconds = 20
    if (clone.kind === 'timed') {
      clone.defaultSeconds = Math.round((exercise.defaultSeconds ?? 30) * 1.4)
    } else {
      clone.defaultReps = Math.round((exercise.defaultReps ?? 12) * 1.2)
    }
  }

  return {
    uid: `${exercise.id}-${crypto.randomUUID()}`,
    exercise: clone,
    sets: clone.defaultSets,
    reps: clone.kind === 'reps' ? clone.defaultReps : undefined,
    seconds: clone.kind === 'timed' ? clone.defaultSeconds : undefined,
    weightKg: clone.kind === 'reps' ? 5 : undefined,
  }
}

export function suggestSession(bodyPart: BodyPart, goal: TrainerGoal, kit: Equipment[]): PlannedExercise[] {
  return suggestDay([bodyPart], goal, kit)
}

// Progressive-overload caps (plans/workout-programs.md: "…capped"). Reps cap
// per goal; timed moves grow by +1 set instead and are capped at SETS_CAP.
const REPS_CAPS: Record<TrainerGoal, number> = {
  strength: 10,
  muscle: 15,
  fatloss: 20,
  endurance: 30,
  mobility: 15,
  general: 20,
}

export const SETS_CAP = 6

export function initialProgression(): ProgramProgression {
  return { week: 1, loads: {}, completedDates: [] }
}

function cloneForUse(pinned: PlannedExercise): PlannedExercise {
  return { ...pinned, exercise: { ...pinned.exercise }, uid: `${pinned.exercise.id}-${crypto.randomUUID()}` }
}

function applyLoad(item: PlannedExercise, load?: ProgramLoad): PlannedExercise {
  if (!load) return item
  const next: PlannedExercise = { ...item }
  if (load.sets !== undefined) next.sets = Math.max(1, load.sets)
  if (load.reps !== undefined && next.exercise.kind === 'reps') next.reps = Math.max(1, load.reps)
  return next
}

// Pins first (extracted plans), otherwise pools the library across every
// focus part, re-using scoreExercise + prescribe. Loads (from progression)
// override the prescribed counts so completed caps carry into the next week.
export function suggestDay(
  focus: BodyPart[],
  goal: TrainerGoal,
  kit: Equipment[],
  opts?: { pinned?: PlannedExercise[]; loads?: Record<string, ProgramLoad>; count?: number },
): PlannedExercise[] {
  const { pinned, loads, count = 4 } = opts ?? {}
  if (pinned && pinned.length > 0) {
    return pinned.map((item) => applyLoad(cloneForUse(item), loads?.[item.exercise.id]))
  }
  const scored = EXERCISES.filter((item) => !item.isCustom && fitsKit(item, kit) && matchesAnyPart(item, focus))
    .map((exercise) => ({ exercise, score: scoreExercise(exercise, focus, goal) }))
    .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name))

  return scored.slice(0, count).map(({ exercise }) => prescribe(exercise, goal))
}

// Bump loads for every exercise whose planned set count was fully logged.
function nextLoads(
  plan: PlannedExercise[],
  logged: WorkoutSet[],
  current: Record<string, ProgramLoad>,
  goal: TrainerGoal,
): Record<string, ProgramLoad> {
  const next: Record<string, ProgramLoad> = { ...current }
  for (const item of plan) {
    const done = logged.filter((set) => set.exerciseId === item.exercise.id && set.done).length
    if (done < item.sets) continue
    const prior = next[item.exercise.id] ?? {}
    if (item.exercise.kind === 'reps') {
      const prescribed = item.reps ?? item.exercise.defaultReps ?? 10
      next[item.exercise.id] = { reps: Math.min(REPS_CAPS[goal], (prior.reps ?? prescribed) + 1) }
    } else {
      next[item.exercise.id] = { sets: Math.min(SETS_CAP, (prior.sets ?? item.sets) + 1) }
    }
  }
  return next
}

export function advanceProgression(
  progression: ProgramProgression,
  goal: TrainerGoal,
  date: string,
  plan: PlannedExercise[],
  workoutSets: WorkoutSet[],
  week: number,
): ProgramProgression {
  if (progression.completedDates.includes(date)) return progression
  return {
    week: Math.min(12, Math.max(1, week)),
    loads: nextLoads(plan, workoutSets, progression.loads, goal),
    completedDates: [...progression.completedDates, date],
  }
}

export function trainerReason(bodyPart: BodyPart, goal: TrainerGoal, count: number): string {
  return `${count} moves scored for ${bodyPartLabel(bodyPart).toLowerCase()} + ${goalLabel(goal).toLowerCase()}`
}

export function sessionTitle(bodyPart: BodyPart, goal: TrainerGoal): string {
  return `${bodyPartLabel(bodyPart)} · ${goalLabel(goal)}`
}
