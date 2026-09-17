export type ExerciseKind = 'reps' | 'timed'
export type BodyPart = 'legs' | 'back' | 'chest' | 'arms' | 'core'
export type ExerciseCategory = 'stretch'
export type TrainerGoal = 'strength' | 'muscle' | 'fatloss' | 'endurance' | 'mobility' | 'general'
export type KnownEquipment = 'bodyweight' | 'dumbbells' | 'bands' | 'bench' | 'pullup' | 'tubes'
export type Equipment = KnownEquipment | (string & {})

export type Exercise = {
  id: string
  name: string
  kind: ExerciseKind
  /** Optional browsing category beyond body part (e.g. 'stretch'). */
  category?: ExerciseCategory
  defaultReps?: number
  defaultSeconds?: number
  defaultSets: number
  met: number
  cue: string
  restSeconds: number
  bodyParts?: BodyPart[]
  goals?: TrainerGoal[]
  equipment?: Equipment[]
  coachId?: string
  isCustom?: boolean
  compound?: boolean
  /** English instructions, kept from the supplemental dataset. Optional. */
  instructions?: string
  /** Ordered English instruction steps from the supplemental dataset. */
  instructionSteps?: string[]
  /** True for records ingested from the 1,324-exercise library. */
  fromLibrary?: boolean
  /** Dataset media attribution (© Gym visual). */
  attribution?: string
}

export const BODY_PARTS: { id: BodyPart; label: string }[] = [
  { id: 'legs', label: 'Legs' },
  { id: 'back', label: 'Back' },
  { id: 'chest', label: 'Chest' },
  { id: 'arms', label: 'Arms' },
  { id: 'core', label: 'Core' },
]

export const TRAINER_GOALS: { id: TrainerGoal; label: string }[] = [
  { id: 'strength', label: 'Strength' },
  { id: 'muscle', label: 'Muscle' },
  { id: 'fatloss', label: 'Fat loss' },
  { id: 'endurance', label: 'Endurance' },
  { id: 'mobility', label: 'Mobility' },
  { id: 'general', label: 'General fitness' },
]

export function normalizeTrainerGoal(id: unknown): TrainerGoal {
  if (id === 'burn') return 'fatloss'
  if (id === 'stamina') return 'endurance'
  if (id === 'bulk' || id === 'tone') return 'muscle'
  if (TRAINER_GOALS.some((item) => item.id === id)) return id as TrainerGoal
  return 'strength'
}

export function normalizeBodyPart(id: unknown): BodyPart {
  if (id === 'push') return 'chest'
  if (id === 'pull') return 'back'
  if (id === 'full') return 'legs'
  if (BODY_PARTS.some((item) => item.id === id)) return id as BodyPart
  return 'legs'
}

/** Names indicating a stretching exercise in the supplemental dataset. */
export const STRETCH_NAME_RE = /\bstretch\b|\bpose\b/i

/** Dataset stretches whose names omit the usual markers (e.g. lying twists). */
export const EXTRA_STRETCH_IDS: ReadonlySet<string> = new Set(['ds-3639', 'ds-2329'])

export function isStretchName(id: unknown, name: string): boolean {
  return STRETCH_NAME_RE.test(name) || EXTRA_STRETCH_IDS.has(String(id))
}

export function isStretch(exercise: Exercise): boolean {
  if (exercise.category === 'stretch') return true
  if (exercise.fromLibrary === true) return isStretchName(exercise.id, exercise.name)
  return false
}

export const EQUIPMENT: { id: KnownEquipment; label: string }[] = [
  { id: 'bodyweight', label: 'Bodyweight' },
  { id: 'dumbbells', label: 'Dumbbells' },
  { id: 'bands', label: 'Bands' },
  { id: 'tubes', label: 'Resistance tubes' },
  { id: 'bench', label: 'Bench' },
  { id: 'pullup', label: 'Pull-up bar' },
]

const EQUIPMENT_ALIASES: Record<string, KnownEquipment> = {
  tubes: 'tubes',
  tube: 'tubes',
  'resistance tubes': 'tubes',
  'resistance tube': 'tubes',
  bands: 'bands',
  band: 'bands',
  'resistance bands': 'bands',
  'resistance band': 'bands',
}

export function isKnownEquipment(id: Equipment): id is KnownEquipment {
  return EQUIPMENT.some((item) => item.id === id)
}

export function equipmentLabel(id: Equipment): string {
  return EQUIPMENT.find((item) => item.id === id)?.label ?? id
}

export function normalizeEquipmentName(name: string): Equipment | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  const alias = EQUIPMENT_ALIASES[lower]
  if (alias) return alias
  const preset = EQUIPMENT.find((item) => item.id === lower || item.label.toLowerCase() === lower)
  if (preset) return preset.id
  return trimmed
}

export function toggleEquipment(current: Equipment[], id: Equipment): Equipment[] {
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
}

export function addEquipmentItem(current: Equipment[], name: string): Equipment[] {
  const id = normalizeEquipmentName(name)
  if (!id || current.includes(id)) return current
  return [...current, id]
}

function move(
  id: string,
  name: string,
  kind: ExerciseKind,
  extras: Omit<Exercise, 'id' | 'name' | 'kind'>,
): Exercise {
  return { id, name, kind, ...extras }
}

export const EXERCISES: Exercise[] = [
  move('squat', 'Squat', 'reps', {
    defaultReps: 12,
    defaultSets: 3,
    met: 5.5,
    cue: 'Sit back, knees track toes',
    restSeconds: 45,
    bodyParts: ['legs'],
    goals: ['strength', 'muscle', 'general'],
    equipment: ['bodyweight'],
    compound: true,
  }),
  move('jump-squat', 'Jump squat', 'reps', {
    defaultReps: 10,
    defaultSets: 3,
    met: 8.0,
    cue: 'Soft land, hips explode',
    restSeconds: 40,
    bodyParts: ['legs'],
    goals: ['fatloss', 'endurance', 'strength'],
    equipment: ['bodyweight'],
    coachId: 'jump-squat',
    compound: true,
  }),
  move('lunge', 'Lunge', 'reps', {
    defaultReps: 10,
    defaultSets: 3,
    met: 5.0,
    cue: 'Back knee drops straight',
    restSeconds: 45,
    bodyParts: ['legs'],
    goals: ['strength', 'mobility', 'general'],
    equipment: ['bodyweight'],
    compound: true,
  }),
  move('glute-bridge', 'Glute bridge', 'reps', {
    defaultReps: 12,
    defaultSets: 3,
    met: 4.0,
    cue: 'Ribs down, squeeze at the top',
    restSeconds: 40,
    bodyParts: ['legs'],
    goals: ['muscle', 'mobility', 'general'],
    equipment: ['bodyweight'],
    coachId: 'bridge',
    compound: true,
  }),
  move('single-leg-rdl', 'Single-leg RDL', 'reps', {
    defaultReps: 8,
    defaultSets: 3,
    met: 4.5,
    cue: 'Hinge, hips square, soft knee',
    restSeconds: 45,
    bodyParts: ['legs'],
    goals: ['strength', 'mobility', 'general'],
    equipment: ['bodyweight'],
    coachId: 'hinge',
    compound: true,
  }),
  move('inverted-row', 'Inverted row', 'reps', {
    defaultReps: 8,
    defaultSets: 3,
    met: 4.0,
    cue: 'Body straight, pull chest to the edge',
    restSeconds: 45,
    bodyParts: ['back'],
    goals: ['strength', 'muscle', 'general'],
    equipment: ['bodyweight'],
    coachId: 'row',
    compound: true,
  }),
  move('superman', 'Superman', 'timed', {
    defaultSeconds: 25,
    defaultSets: 3,
    met: 3.5,
    cue: 'Long arms and legs, squeeze back',
    restSeconds: 30,
    bodyParts: ['back', 'core'],
    goals: ['mobility', 'endurance', 'general'],
    equipment: ['bodyweight'],
    coachId: 'superman',
  }),
  move('push-up', 'Push-up', 'reps', {
    defaultReps: 10,
    defaultSets: 3,
    met: 3.8,
    cue: 'Chest to floor',
    restSeconds: 45,
    bodyParts: ['chest'],
    goals: ['strength', 'muscle', 'general'],
    equipment: ['bodyweight'],
    compound: true,
  }),
  move('pike-push-up', 'Pike push-up', 'reps', {
    defaultReps: 8,
    defaultSets: 3,
    met: 4.5,
    cue: 'Hips high, head between hands',
    restSeconds: 50,
    bodyParts: ['arms'],
    goals: ['strength', 'muscle'],
    equipment: ['bodyweight'],
    coachId: 'pike',
    compound: true,
  }),
  move('diamond-push-up', 'Diamond push-up', 'reps', {
    defaultReps: 8,
    defaultSets: 3,
    met: 4.0,
    cue: 'Hands under chest, elbows close',
    restSeconds: 45,
    bodyParts: ['arms'],
    goals: ['muscle', 'strength'],
    equipment: ['bodyweight'],
    coachId: 'push-up',
  }),
  move('plank', 'Plank', 'timed', {
    defaultSeconds: 30,
    defaultSets: 3,
    met: 4.0,
    cue: 'Ribs in, glutes on',
    restSeconds: 30,
    bodyParts: ['core'],
    goals: ['mobility', 'endurance', 'general'],
    equipment: ['bodyweight'],
  }),
  move('side-plank', 'Side plank', 'timed', {
    defaultSeconds: 25,
    defaultSets: 3,
    met: 4.0,
    cue: 'Hips stacked, long spine',
    restSeconds: 30,
    bodyParts: ['core'],
    goals: ['mobility', 'endurance', 'general'],
    equipment: ['bodyweight'],
    coachId: 'side-plank',
  }),
  move('hollow-hold', 'Hollow hold', 'timed', {
    defaultSeconds: 25,
    defaultSets: 3,
    met: 4.0,
    cue: 'Low back glued, arms long',
    restSeconds: 30,
    bodyParts: ['core'],
    goals: ['strength', 'endurance'],
    equipment: ['bodyweight'],
    coachId: 'hollow',
  }),
  move('dead-bug', 'Dead bug', 'reps', {
    defaultReps: 8,
    defaultSets: 3,
    met: 3.0,
    cue: 'Opposite arm and leg, ribs down',
    restSeconds: 30,
    bodyParts: ['core'],
    goals: ['mobility', 'general', 'endurance'],
    equipment: ['bodyweight'],
    coachId: 'dead-bug',
  }),
  move('sit-up', 'Sit-up', 'reps', {
    defaultReps: 15,
    defaultSets: 3,
    met: 3.8,
    cue: 'Ribs to hips, not momentum',
    restSeconds: 40,
    bodyParts: ['core'],
    goals: ['endurance', 'muscle'],
    equipment: ['bodyweight'],
  }),
  move('jumping-jack', 'Jumping jack', 'timed', {
    defaultSeconds: 45,
    defaultSets: 3,
    met: 8.0,
    cue: 'Soft land, arms to ears',
    restSeconds: 30,
    bodyParts: ['legs'],
    goals: ['fatloss', 'endurance'],
    equipment: ['bodyweight'],
    compound: true,
  }),
  move('burpee', 'Burpee', 'reps', {
    defaultReps: 8,
    defaultSets: 3,
    met: 8.0,
    cue: 'Chest down, hips explode',
    restSeconds: 60,
    bodyParts: ['chest', 'legs', 'arms'],
    goals: ['fatloss', 'strength', 'endurance'],
    equipment: ['bodyweight'],
    compound: true,
  }),
  move('mountain-climber', 'Mountain climber', 'timed', {
    defaultSeconds: 30,
    defaultSets: 3,
    met: 8.0,
    cue: 'Hips level, quick feet',
    restSeconds: 30,
    bodyParts: ['core', 'legs'],
    goals: ['fatloss', 'endurance'],
    equipment: ['bodyweight'],
    compound: true,
  }),
  move('bear-crawl', 'Bear crawl', 'timed', {
    defaultSeconds: 30,
    defaultSets: 3,
    met: 6.5,
    cue: 'Knees hover, opposite limbs',
    restSeconds: 40,
    bodyParts: ['core', 'arms'],
    goals: ['fatloss', 'endurance', 'general'],
    equipment: ['bodyweight'],
    coachId: 'crawl',
    compound: true,
  }),
  move('db-squat', 'Goblet squat', 'reps', {
    defaultReps: 10,
    defaultSets: 3,
    met: 6.0,
    cue: 'Goblet at chest, sit between heels',
    restSeconds: 45,
    bodyParts: ['legs'],
    goals: ['strength', 'muscle', 'general'],
    equipment: ['dumbbells'],
    coachId: 'squat',
    compound: true,
  }),
  move('db-rdl', 'Dumbbell RDL', 'reps', {
    defaultReps: 8,
    defaultSets: 3,
    met: 5.5,
    cue: 'Hinge, bells close, squeeze glutes',
    restSeconds: 50,
    bodyParts: ['legs'],
    goals: ['strength', 'muscle', 'general'],
    equipment: ['dumbbells'],
    coachId: 'hinge',
    compound: true,
  }),
  move('db-lunge', 'Dumbbell lunge', 'reps', {
    defaultReps: 8,
    defaultSets: 3,
    met: 6.0,
    cue: 'Tall torso, back knee drops',
    restSeconds: 45,
    bodyParts: ['legs'],
    goals: ['strength', 'muscle', 'general'],
    equipment: ['dumbbells'],
    coachId: 'lunge',
    compound: true,
  }),
  move('db-split-squat', 'Bulgarian split squat', 'reps', {
    defaultReps: 8,
    defaultSets: 3,
    met: 6.0,
    cue: 'Rear foot light, front heel heavy',
    restSeconds: 50,
    bodyParts: ['legs'],
    goals: ['strength', 'muscle'],
    equipment: ['dumbbells'],
    coachId: 'lunge',
    compound: true,
  }),
  move('db-press', 'Floor press', 'reps', {
    defaultReps: 8,
    defaultSets: 3,
    met: 4.5,
    cue: 'Elbows 45°, pause on the floor',
    restSeconds: 50,
    bodyParts: ['chest'],
    goals: ['strength', 'muscle', 'general'],
    equipment: ['dumbbells'],
    coachId: 'press-floor',
    compound: true,
  }),
  move('db-oh-press', 'Dumbbell press', 'reps', {
    defaultReps: 8,
    defaultSets: 3,
    met: 4.8,
    cue: 'Brace, press over mid-foot',
    restSeconds: 50,
    bodyParts: ['arms'],
    goals: ['strength', 'muscle', 'general'],
    equipment: ['dumbbells'],
    coachId: 'press',
    compound: true,
  }),
  move('db-bench-press', 'Dumbbell bench press', 'reps', {
    defaultReps: 8,
    defaultSets: 3,
    met: 5.0,
    cue: 'Shoulders packed, slight arch',
    restSeconds: 50,
    bodyParts: ['chest'],
    goals: ['strength', 'muscle'],
    equipment: ['dumbbells', 'bench'],
    coachId: 'press-floor',
    compound: true,
  }),
  move('db-row', 'Dumbbell row', 'reps', {
    defaultReps: 10,
    defaultSets: 3,
    met: 4.5,
    cue: 'Hinge, pull elbow to hip',
    restSeconds: 45,
    bodyParts: ['back'],
    goals: ['strength', 'muscle', 'general'],
    equipment: ['dumbbells'],
    coachId: 'hinge-row',
    compound: true,
  }),
  move('db-renegade', 'Renegade row', 'reps', {
    defaultReps: 8,
    defaultSets: 3,
    met: 6.0,
    cue: 'Plank still, row without twist',
    restSeconds: 50,
    bodyParts: ['back', 'core', 'arms'],
    goals: ['strength', 'muscle', 'general'],
    equipment: ['dumbbells'],
    coachId: 'renegade',
    compound: true,
  }),
  move('db-thruster', 'Dumbbell thruster', 'reps', {
    defaultReps: 8,
    defaultSets: 3,
    met: 8.0,
    cue: 'Squat then punch the ceiling',
    restSeconds: 50,
    bodyParts: ['legs', 'arms'],
    goals: ['fatloss', 'strength', 'endurance', 'general'],
    equipment: ['dumbbells'],
    coachId: 'thruster',
    compound: true,
  }),
  move('farmer-carry', 'Farmer carry', 'timed', {
    defaultSeconds: 40,
    defaultSets: 3,
    met: 6.0,
    cue: 'Tall walk, ribs stacked',
    restSeconds: 40,
    bodyParts: ['arms', 'core'],
    goals: ['strength', 'endurance', 'general'],
    equipment: ['dumbbells'],
    coachId: 'carry',
    compound: true,
  }),
  move('band-squat', 'Band squat', 'reps', {
    defaultReps: 12,
    defaultSets: 3,
    met: 5.5,
    cue: 'Stand on the band, sit tall',
    restSeconds: 40,
    bodyParts: ['legs'],
    goals: ['muscle', 'general', 'fatloss'],
    equipment: ['bands'],
    coachId: 'squat',
    compound: true,
  }),
  move('band-rdl', 'Band RDL', 'reps', {
    defaultReps: 10,
    defaultSets: 3,
    met: 5.0,
    cue: 'Hinge against the band',
    restSeconds: 40,
    bodyParts: ['legs'],
    goals: ['strength', 'muscle', 'mobility'],
    equipment: ['bands'],
    coachId: 'hinge',
    compound: true,
  }),
  move('band-press', 'Band chest press', 'reps', {
    defaultReps: 12,
    defaultSets: 3,
    met: 4.0,
    cue: 'Anchor behind, press without shrug',
    restSeconds: 40,
    bodyParts: ['chest'],
    goals: ['muscle', 'general', 'endurance'],
    equipment: ['bands'],
    coachId: 'press-stand',
    compound: true,
  }),
  move('band-oh-press', 'Band overhead press', 'reps', {
    defaultReps: 10,
    defaultSets: 3,
    met: 4.2,
    cue: 'Stand on the band, press stacked',
    restSeconds: 40,
    bodyParts: ['arms'],
    goals: ['strength', 'muscle', 'general'],
    equipment: ['bands'],
    coachId: 'press',
    compound: true,
  }),
  move('band-row', 'Band row', 'reps', {
    defaultReps: 12,
    defaultSets: 3,
    met: 3.5,
    cue: 'Ribs in, pull elbows to ribs',
    restSeconds: 40,
    bodyParts: ['back'],
    goals: ['strength', 'muscle', 'mobility'],
    equipment: ['bands'],
    coachId: 'hinge-row',
    compound: true,
  }),
  move('band-pulldown', 'Band pulldown', 'reps', {
    defaultReps: 10,
    defaultSets: 3,
    met: 4.0,
    cue: 'Anchor high, pull elbows to pockets',
    restSeconds: 40,
    bodyParts: ['back'],
    goals: ['strength', 'muscle', 'general'],
    equipment: ['bands'],
    coachId: 'pulldown',
    compound: true,
  }),
  move('band-pull-apart', 'Band pull-apart', 'reps', {
    defaultReps: 15,
    defaultSets: 3,
    met: 3.0,
    cue: 'Long arms, squeeze shoulder blades',
    restSeconds: 30,
    bodyParts: ['back'],
    goals: ['mobility', 'general'],
    equipment: ['bands'],
    coachId: 'pull-apart',
  }),
  move('pallof-press', 'Pallof press', 'reps', {
    defaultReps: 10,
    defaultSets: 3,
    met: 3.5,
    cue: 'Press out, no twist',
    restSeconds: 30,
    bodyParts: ['core'],
    goals: ['strength', 'mobility', 'general'],
    equipment: ['bands'],
    coachId: 'pallof',
    compound: true,
  }),
  move('band-bridge', 'Band glute bridge', 'reps', {
    defaultReps: 12,
    defaultSets: 3,
    met: 4.0,
    cue: 'Band above knees, drive heels',
    restSeconds: 40,
    bodyParts: ['legs'],
    goals: ['muscle', 'mobility', 'general'],
    equipment: ['bands'],
    coachId: 'bridge',
    compound: true,
  }),
  move('tube-row', 'Tube row', 'reps', {
    defaultReps: 12,
    defaultSets: 3,
    met: 3.5,
    cue: 'Anchor the tube, pull elbows to ribs',
    restSeconds: 40,
    bodyParts: ['back'],
    goals: ['strength', 'muscle', 'mobility'],
    equipment: ['tubes'],
    coachId: 'hinge-row',
    compound: true,
  }),
  move('tube-press', 'Tube chest press', 'reps', {
    defaultReps: 12,
    defaultSets: 3,
    met: 4.0,
    cue: 'Anchor behind, press without shrug',
    restSeconds: 40,
    bodyParts: ['chest'],
    goals: ['muscle', 'general', 'endurance'],
    equipment: ['tubes'],
    coachId: 'press-stand',
    compound: true,
  }),
  move('tube-squat', 'Tube squat', 'reps', {
    defaultReps: 12,
    defaultSets: 3,
    met: 5.5,
    cue: 'Stand on the tube, sit tall',
    restSeconds: 40,
    bodyParts: ['legs'],
    goals: ['muscle', 'general', 'fatloss'],
    equipment: ['tubes'],
    coachId: 'squat',
    compound: true,
  }),
  move('bench-dip', 'Bench dip', 'reps', {
    defaultReps: 10,
    defaultSets: 3,
    met: 4.0,
    cue: 'Shoulders down, hips close to the bench',
    restSeconds: 45,
    bodyParts: ['arms'],
    goals: ['muscle', 'strength'],
    equipment: ['bench'],
    coachId: 'dip',
    compound: true,
  }),
  move('step-up', 'Step-up', 'reps', {
    defaultReps: 10,
    defaultSets: 3,
    met: 5.5,
    cue: 'Drive through the bench foot',
    restSeconds: 40,
    bodyParts: ['legs'],
    goals: ['strength', 'general', 'endurance'],
    equipment: ['bench'],
    coachId: 'step-up',
    compound: true,
  }),
  move('hip-thrust', 'Hip thrust', 'reps', {
    defaultReps: 10,
    defaultSets: 3,
    met: 5.0,
    cue: 'Shoulders on bench, chin tucked',
    restSeconds: 45,
    bodyParts: ['legs'],
    goals: ['muscle', 'strength', 'general'],
    equipment: ['bench'],
    coachId: 'bridge',
    compound: true,
  }),
  move('decline-push-up', 'Decline push-up', 'reps', {
    defaultReps: 8,
    defaultSets: 3,
    met: 4.5,
    cue: 'Feet on bench, body one line',
    restSeconds: 45,
    bodyParts: ['chest'],
    goals: ['strength', 'muscle'],
    equipment: ['bench'],
    coachId: 'push-up',
    compound: true,
  }),
  move('pull-up', 'Pull-up', 'reps', {
    defaultReps: 6,
    defaultSets: 3,
    met: 5.0,
    cue: 'Chest to bar, no kip',
    restSeconds: 60,
    bodyParts: ['back'],
    goals: ['strength', 'muscle', 'general'],
    equipment: ['pullup'],
    coachId: 'pull-up',
    compound: true,
  }),
  move('chin-up', 'Chin-up', 'reps', {
    defaultReps: 6,
    defaultSets: 3,
    met: 5.0,
    cue: 'Palms in, chest to bar',
    restSeconds: 60,
    bodyParts: ['back', 'arms'],
    goals: ['strength', 'muscle', 'general'],
    equipment: ['pullup'],
    coachId: 'pull-up',
    compound: true,
  }),
  move('hanging-knee-raise', 'Hanging knee raise', 'reps', {
    defaultReps: 10,
    defaultSets: 3,
    met: 4.5,
    cue: 'Dead hang, knees to ribs',
    restSeconds: 40,
    bodyParts: ['core'],
    goals: ['muscle', 'endurance', 'general'],
    equipment: ['pullup'],
    coachId: 'hang-raise',
    compound: true,
  }),
]

export function getExercise(id: string): Exercise | undefined {
  return allExercises().find((item) => item.id === id)
}

function normalizedName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Supplemental library registry. The 1,324-exercise dataset is loaded lazily
 * (never in the main bundle) and registered here so browsing and lookups see
 * the merged catalog — curated entries always win on name/id collisions.
 */
let registered: Exercise[] = []

export function registerExercises(exercises: Exercise[]): void {
  const names = new Set<string>()
  const ids = new Set<string>()
  const take = (items: Exercise[]) => {
    for (const item of items) {
      const name = normalizedName(item.name)
      if (names.has(name) || ids.has(item.id)) continue
      names.add(name)
      ids.add(item.id)
    }
  }
  // Curated first: ingested duplicates by name resolve to the curated entry.
  take(EXERCISES)
  const accepted: Exercise[] = []
  for (const item of exercises) {
    const name = normalizedName(item.name)
    if (!name || names.has(name) || ids.has(item.id)) continue
    names.add(name)
    ids.add(item.id)
    accepted.push(item)
  }
  registered = accepted
}

export function allExercises(): Exercise[] {
  return registered.length === 0 ? EXERCISES : [...EXERCISES, ...registered]
}

export function bodyPartLabel(id: BodyPart): string {
  return BODY_PARTS.find((item) => item.id === id)?.label ?? id
}

export function goalLabel(id: TrainerGoal): string {
  return TRAINER_GOALS.find((item) => item.id === id)?.label ?? id
}

export const WEEK_DAYS: { id: number; label: string; full: string; bodyPart: BodyPart }[] = [
  { id: 0, label: 'Sun', full: 'Sunday', bodyPart: 'core' },
  { id: 1, label: 'Mon', full: 'Monday', bodyPart: 'chest' },
  { id: 2, label: 'Tue', full: 'Tuesday', bodyPart: 'legs' },
  { id: 3, label: 'Wed', full: 'Wednesday', bodyPart: 'back' },
  { id: 4, label: 'Thu', full: 'Thursday', bodyPart: 'arms' },
  { id: 5, label: 'Fri', full: 'Friday', bodyPart: 'legs' },
  { id: 6, label: 'Sat', full: 'Saturday', bodyPart: 'core' },
]

export function bodyPartForDay(day: number): BodyPart {
  return WEEK_DAYS.find((item) => item.id === day)?.bodyPart ?? 'legs'
}

export function dayLabel(day: number): string {
  return WEEK_DAYS.find((item) => item.id === day)?.full ?? 'Today'
}
