import { EXERCISES, allExercises, bodyPartLabel, goalLabel, type BodyPart, type Equipment, type Exercise, type TrainerGoal } from '../data/exercises'
import type { PlannedExercise } from './types'

/**
 * Home-kit substitutions so exercises from the supplemental library (barbell,
 * cable, kettlebell, …) still match everyday kits: barbell/kettlebell/weights →
 * dumbbells, cable/smith/assisted → bands or tubes.
 */
const EQUIPMENT_SUBSTITUTES: Record<string, Equipment[]> = {
  barbell: ['dumbbells'],
  'olympic barbell': ['dumbbells'],
  'ez barbell': ['dumbbells'],
  kettlebell: ['dumbbells'],
  'medicine ball': ['dumbbells'],
  weighted: ['dumbbells'],
  'trap bar': ['dumbbells'],
  cable: ['bands', 'tubes'],
  'smith machine': ['bands', 'tubes'],
  assisted: ['bands'],
}

function kitHas(kit: Equipment[], needed: Equipment): boolean {
  if (kit.includes(needed)) return true
  if (needed === 'bands' && kit.includes('tubes')) return true
  if (needed === 'tubes' && kit.includes('bands')) return true
  return (EQUIPMENT_SUBSTITUTES[needed] ?? []).some((sub) => kit.includes(sub))
}

export function fitsKit(exercise: Exercise, kit: Equipment[]): boolean {
  if (exercise.isCustom) return true
  const needed = exercise.equipment ?? ['bodyweight']
  if (needed.length === 0) return kit.length > 0
  return needed.every((item) => kitHas(kit, item))
}

function matchesPart(exercise: Exercise, bodyPart: BodyPart): boolean {
  return (exercise.bodyParts ?? []).includes(bodyPart)
}

export function libraryFor(bodyPart: BodyPart, kit: Equipment[]): Exercise[] {
  return allExercises().filter((item) => !item.isCustom && fitsKit(item, kit) && matchesPart(item, bodyPart))
}

/**
 * Curated-only pool for the session suggester — the trainer keeps its
 * hand-tuned pool unchanged; the supplemental library stays a browse/add source.
 */
function curatedFor(bodyPart: BodyPart, kit: Equipment[]): Exercise[] {
  return EXERCISES.filter((item) => !item.isCustom && fitsKit(item, kit) && matchesPart(item, bodyPart))
}

function scoreExercise(exercise: Exercise, bodyPart: BodyPart, goal: TrainerGoal): number {
  const parts = exercise.bodyParts ?? []
  const goals = exercise.goals ?? []
  let score = 0

  if (parts[0] === bodyPart) {
    score += 3
  } else if (parts.includes(bodyPart)) {
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
  const ranked = curatedFor(bodyPart, kit)
    .map((exercise) => ({ exercise, score: scoreExercise(exercise, bodyPart, goal) }))
    .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name))

  return ranked.slice(0, 4).map(({ exercise }) => prescribe(exercise, goal))
}

export function trainerReason(bodyPart: BodyPart, goal: TrainerGoal, count: number): string {
  return `${count} moves scored for ${bodyPartLabel(bodyPart).toLowerCase()} + ${goalLabel(goal).toLowerCase()}`
}

export function sessionTitle(bodyPart: BodyPart, goal: TrainerGoal): string {
  return `${bodyPartLabel(bodyPart)} · ${goalLabel(goal)}`
}
