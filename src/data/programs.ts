import type { BodyPart, TrainerGoal } from './exercises'
import { bodyPartLabel, goalLabel } from './exercises'
import type { ExtractedProgramFile, ProgramDay, ProgramDayTemplate, TrainerProgram } from '../lib/types'
import { isoDate, parseIso, shiftIso } from '../lib/dates'
import arnoldVolumeRaw from './external/arnold-schwarzenegger-volume-workout-routines.json'
import fullBodyRaw from './external/muscle-strength-full-body-workout-routine.json'

// A program a user can pick in the Train screen. Presets carry only their
// 7-day template; the active instance (start date, calendar, progression)
// lives in AppState.program / the DB `program` row.
//
// Templates are day-1-first cycles: index 0 = the program's first day (the
// day the user starts it), 6 = the last day of the weekly cycle. The calendar
// indexes them with `daysSinceStart % 7`.
export type ProgramPreset = {
  id: string
  name: string
  goal: TrainerGoal
  source: 'builtin' | 'extracted'
  sourceUrl?: string
  template: ProgramDayTemplate[]
}

const FULL_BODY: BodyPart[] = ['legs', 'back', 'chest', 'arms', 'core']
const UPPER: BodyPart[] = ['chest', 'back', 'arms']
const LOWER: BodyPart[] = ['legs']
const REST = [] as BodyPart[]

function day(focus: BodyPart[]): ProgramDayTemplate {
  return { focus }
}

// One program per goal (plans/workout-programs.md). The library + scoreEngine
// pick the moves at generation time; only the day structure is fixed here.
const builtinTemplates: Record<TrainerGoal, ProgramDayTemplate[]> = {
  strength: [day(UPPER), day(LOWER), day(REST), day(UPPER), day(LOWER), day(REST), day(REST)],
  muscle: [day(['chest']), day(['back']), day(['legs']), day(['arms']), day(['core']), day(['legs']), day(REST)],
  fatloss: [day(FULL_BODY), day(FULL_BODY), day(FULL_BODY), day(FULL_BODY), day(REST), day(REST), day(REST)],
  endurance: [day(FULL_BODY), day(FULL_BODY), day(FULL_BODY), day(FULL_BODY), day(FULL_BODY), day(REST), day(REST)],
  mobility: [day(FULL_BODY), day(FULL_BODY), day(FULL_BODY), day(FULL_BODY), day(FULL_BODY), day(REST), day(REST)],
  general: [day(FULL_BODY), day(FULL_BODY), day(FULL_BODY), day(FULL_BODY), day(REST), day(REST), day(REST)],
}

export function builtinProgramForGoal(goal: TrainerGoal): ProgramPreset {
  return { id: goal, name: goalLabel(goal), goal, source: 'builtin', template: builtinTemplates[goal] }
}

export const BUILTIN_PROGRAMS: ProgramPreset[] = [
  builtinProgramForGoal('strength'),
  builtinProgramForGoal('muscle'),
  builtinProgramForGoal('fatloss'),
  builtinProgramForGoal('endurance'),
  builtinProgramForGoal('mobility'),
  builtinProgramForGoal('general'),
]

const arnoldVolumeFile = arnoldVolumeRaw as unknown as ExtractedProgramFile
const fullBodyFile = fullBodyRaw as unknown as ExtractedProgramFile

// Pad a shorter source cycle to a 7-day week, keeping the day-1-first layout.
// A 3-day split (A/B/C) spreads as A-rest-B-rest-C-rest-rest so a full-body
// program stays a 3x/week split instead of doubling up; other lengths just
// wrap repeats and leave the tail as rest.
function normalizeTemplate(template: ProgramDayTemplate[]): ProgramDayTemplate[] {
  if (template.length === 7) return template
  if (template.length === 3) {
    return [template[0], day(REST), template[1], day(REST), template[2], day(REST), day(REST)]
  }
  return Array.from({ length: 7 }, (_, i) => template[i] ?? day(REST))
}

function extractedPresets(file: ExtractedProgramFile): ProgramPreset[] {
  return file.programs.map((program) => ({
    id: program.id,
    name: program.name,
    goal: program.goal,
    source: 'extracted' as const,
    sourceUrl: file.source.url,
    template: normalizeTemplate(program.template),
  }))
}

export const EXTERNAL_PROGRAMS: ProgramPreset[] = [
  ...extractedPresets(arnoldVolumeFile),
  ...extractedPresets(fullBodyFile),
]

export const ALL_PROGRAMS: ProgramPreset[] = [...BUILTIN_PROGRAMS, ...EXTERNAL_PROGRAMS]

export function programById(id: string): ProgramPreset | undefined {
  return ALL_PROGRAMS.find((item) => item.id === id)
}

// --- Calendar helpers -------------------------------------------------------

function dayOffset(start: string, date: string): number {
  return Math.round((parseIso(date).getTime() - parseIso(start).getTime()) / 86_400_000)
}

// Which slot of the 7-day template a given date lands on (0 = program day 1).
export function programDayIndex(program: TrainerProgram, date: string = isoDate()): number {
  if (!program.start) return 0
  return Math.min(6, Math.max(0, ((dayOffset(program.start, date) % 7) + 7) % 7))
}

export function programDaySlot(program: TrainerProgram, date: string = isoDate()): ProgramDayTemplate {
  return program.template[programDayIndex(program, date)] ?? { focus: [] as BodyPart[] }
}

export function programDayForDate(program: TrainerProgram, date: string = isoDate()): ProgramDay {
  const slot = programDaySlot(program, date)
  return { date, focus: slot.focus, rest: slot.focus.length === 0, completed: false }
}

// The next occurrence of a template slot at or after `from` (i.e. the actual
// calendar date a user can preview for that program day).
export function programDayDate(program: TrainerProgram, index: number, from: string = isoDate()): string {
  if (!program.start || index < 0 || index > 6) return from
  const cycle = ((dayOffset(program.start, from) % 7) + 7) % 7
  const forward = (index - cycle + 7) % 7
  return shiftIso(from, forward)
}

export function programDays(template: ProgramDayTemplate[], start: string, count = 84): ProgramDay[] {
  return Array.from({ length: count }, (_, i) => ({
    date: shiftIso(start, i),
    focus: template[i % 7]?.focus ?? [],
    rest: (template[i % 7]?.focus.length ?? 0) === 0,
    completed: false,
  }))
}

export function programWeek(program: TrainerProgram, date: string = isoDate()): number {
  if (!program.start) return 1
  return Math.min(12, Math.floor(Math.max(0, dayOffset(program.start, date)) / 7) + 1)
}

export function programsRemaining(program: TrainerProgram, date: string = isoDate()): number {
  if (!program.start) return 84
  return Math.max(0, 84 - dayOffset(program.start, date))
}

export function focusLabel(focus: BodyPart[]): string {
  if (focus.length === 0) return 'Rest day'
  const labels = focus.map((part) => bodyPartLabel(part).toLowerCase())
  if (labels.length === 1) return labels[0]
  return `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}`
}