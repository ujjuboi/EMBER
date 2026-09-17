// Ingest scripts/ingest-exercises.mjs
// Fetches the 1,324-exercise public dataset (hasaneyldrm/exercises-dataset),
// maps records onto the app Exercise shape, and writes the trimmed en-only
// JSON asset consumed lazily by src/data/ingested/loadLibrary.ts.
//
//   npm run ingest
//
// The raw exercises.json is ~17 MB (10 languages); the trimmed output keeps
// only English instructions (~1–1.5 MB) and drops media fields.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXERCISES } from '../src/data/exercises.ts'

const SOURCE_URL = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json'
const OUT_FILE = fileURLToPath(new URL('../src/data/ingested/exercises.json', import.meta.url))

const BODY_PART_PARTS = {
  'upper arms': ['arms'],
  'lower arms': ['arms'],
  shoulders: ['arms'],
  'upper legs': ['legs'],
  'lower legs': ['legs'],
  back: ['back'],
  chest: ['chest'],
  waist: ['core'],
  neck: ['core'],
  cardio: ['legs', 'core'],
}

const PER_CATEGORY = {
  'upper arms': { met: 4.0, reps: 12, rest: 40, goals: ['muscle', 'strength', 'general'] },
  'lower arms': { met: 3.0, reps: 15, rest: 30, goals: ['muscle', 'strength', 'endurance'] },
  shoulders: { met: 4.5, reps: 12, rest: 40, goals: ['muscle', 'strength', 'general', 'mobility'] },
  'upper legs': { met: 5.5, reps: 10, rest: 50, goals: ['strength', 'muscle', 'general'] },
  'lower legs': { met: 4.5, reps: 15, rest: 40, goals: ['endurance', 'muscle', 'general'] },
  back: { met: 4.5, reps: 10, rest: 50, goals: ['strength', 'muscle', 'general'] },
  chest: { met: 4.5, reps: 10, rest: 50, goals: ['strength', 'muscle', 'general'] },
  waist: { met: 4.0, reps: 15, rest: 30, goals: ['endurance', 'mobility', 'general'] },
  neck: { met: 3.0, reps: 10, rest: 30, goals: ['mobility', 'general'] },
  cardio: { met: 8.0, seconds: 30, rest: 30, goals: ['fatloss', 'endurance'] },
}

// Map known dataset equipment onto the app's Kit ids; everything else is kept
// as a custom string (barbell, cable, smith, kettlebell, …) and resolved at
// match time via the substitution map in src/lib/trainer.ts.
const EQUIPMENT_MAP = {
  'body weight': 'bodyweight',
  dumbbell: 'dumbbells',
  band: 'bands',
  'resistance band': 'bands',
}

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function mapEquipment(raw) {
  const key = String(raw ?? '').trim().toLowerCase()
  return EQUIPMENT_MAP[key] ?? key
}

function firstStep(record) {
  const steps = record.instruction_steps?.en
  if (Array.isArray(steps) && steps.length > 0 && steps[0]) return steps[0]
  return record.instructions?.en ?? ''
}

function mapRecord(record) {
  const parts = BODY_PART_PARTS[record.category] ?? ['legs']
  const preset = PER_CATEGORY[record.category] ?? PER_CATEGORY['upper legs']
  const kind = record.category === 'cardio' ? 'timed' : 'reps'
  const cue = String(firstStep(record)).slice(0, 120)
  return {
    id: `ds-${record.id}`,
    name: record.name,
    kind,
    defaultSets: 3,
    ...(kind === 'timed' ? { defaultSeconds: preset.seconds } : { defaultReps: preset.reps }),
    met: preset.met,
    cue,
    restSeconds: preset.rest,
    bodyParts: parts,
    goals: preset.goals,
    equipment: [mapEquipment(record.equipment)],
    compound: Array.isArray(record.secondary_muscles) && record.secondary_muscles.length > 0,
    instructions: record.instructions?.en,
    instructionSteps: Array.isArray(record.instruction_steps?.en) ? record.instruction_steps.en : undefined,
    fromLibrary: true,
    attribution: record.attribution,
  }
}

async function main() {
  const res = await fetch(SOURCE_URL)
  if (!res.ok) {
    throw new Error(`Failed to fetch dataset: ${res.status} ${res.statusText}`)
  }
  const raw = await res.json()
  console.log(`Fetched ${raw.length} records from ${SOURCE_URL}`)

  const curatedNames = new Set(EXERCISES.map((item) => normalizeName(item.name)))
  const seenNames = new Set()
  const seenIds = new Set()
  const out = []
  let dropped = 0

  for (const record of raw) {
    const name = normalizeName(record.name)
    const id = `ds-${record.id}`
    if (!name) continue
    if (curatedNames.has(name)) {
      // Duplicate of a curated move — resolve to the curated entry.
      dropped += 1
      continue
    }
    if (seenNames.has(name) || seenIds.has(id)) {
      dropped += 1
      continue
    }
    seenNames.add(name)
    seenIds.add(id)
    out.push(mapRecord(record))
  }

  out.sort((a, b) => a.name.localeCompare(b.name))
  await mkdir(dirname(OUT_FILE), { recursive: true })
  await writeFile(OUT_FILE, `${JSON.stringify(out)}\n`, 'utf8')

  const bytes = Buffer.byteLength(JSON.stringify(out), 'utf8')
  console.log(`Wrote ${out.length} exercises to ${OUT_FILE} (${(bytes / 1024 / 1024).toFixed(2)} MB); dropped ${dropped} (curated dupes + name/id dupes)`)
}

main().catch((err) => {
  console.error('[ingest] Failed:', err)
  process.exitCode = 1
})