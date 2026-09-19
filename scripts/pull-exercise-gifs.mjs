import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Curated GIF mapping for the extracted workout programs. Key: the exercise
// name as written in the source program (src/data/external/*.json). Value: the
// exercises-dataset id whose animation GIF best matches that move.
// Verified against data/exercises.json (gymvisual naming). Media is
// © Gym visual — https://gymvisual.com/ (180×180, attribution required).
export const GIF_SOURCE_IDS = {
  // Arnold Volume Workout (muscleandstrength)
  'Bench Press': '0025',
  'Incline Bench Press': '0047',
  'Dumbbell Pullovers': '0375',
  'Chin Up': '1326',
  'Bent Over Row': '0027',
  'Deadlift': '0032',
  'Crunches': '0274',
  'Barbell Clean and Press': '0028',
  'Dumbbell Lateral Raise': '0334',
  'Upright Row': '0120',
  'Military Press': '1456',
  'Standing Barbell Curl': '0031',
  'Seated Dumbbell Curl': '0391',
  'Close Grip Bench Press': '0030',
  'Standing Barbell Tricep Extension': '0109',
  'Wrist Curls': '1415',
  'Reverse Wrist Curls': '1441',
  'Reverse Crunch': '0872',
  'Squat': '0043',
  'Lunge': '0054',
  'Leg Curl': '0586',
  'Stiff Leg Deadlift': '0116',
  'Good Mornings': '0044',
  'Standing Calf Raise': '1372',
  'Dumbbell Flye': '0308',
  'Cable Crossovers': '1269',
  'Dips': '0251',
  'Dumbbell Pullover': '0375',
  'Wide Grip Pull Up': '1429',
  'T Bar Row': '0606',
  'Seated Pulley Row': '0861',
  'One Arm Dumbbell Row': '0292',
  'Leg Press': '0739',
  'Leg Extension': '0585',
  'Barbell Lunge': '0054',
  'Seated Calf Raise': '0088',
  'One Leg Dumbbell Calf Raise': '1376',
  'Wrist Curl': '0367',
  'Reverse Barbell Curl': '0080',
  'Wrist Roller Machine': '0859',
  'Non-Stop Abs Training': '0274',
  'Barbell Curl': '0031',
  'Dumbbell Concentration Curl': '0297',
  'Tricep Pushdown': '0201',
  'Barbell French Press': '0060',
  'One Arm Dumbbell Tricep Extension': '0362',
  'Seated Barbell Press': '0091',
  'Lateral Raise': '0334',
  'Rear Delt Lateral Raise': '0383',
  'Cable Lateral Raise': '0178',
  // Muscle & Strength Full Body Workout
  'Squats (Ramped)': '0043',
  'Bench Press (Ramped)': '0025',
  'Barbell Row (Ramped)': '0027',
  'Skullcrushers': '0060',
  'Dumbbell Curls': '0294',
  'Leg Curls': '0586',
  'Ab Wheel Roll Out': '0857',
  'Deadlifts (Ramped)': '0032',
  'Romanian Deadlift': '0085',
  'Seated Overhead Press': '0091',
  'Pull Ups or Inverted Rows': '1429',
  'Barbell Shrugs': '0095',
  'Standing or Seated Calf Raise': '0088',
  'Plank': '2135',
  'Squats': '0043',
  'Incline Dumbbell Bench Press': '0314',
  'Seated Arnold Press': '0287',
  'Cable Tricep Extensions': '1722',
  'Barbell Curls': '0031',
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const datasetArg = process.argv[2]
const dataset =
  datasetArg && !/^https?:/.test(datasetArg)
    ? JSON.parse(readFileSync(datasetArg, 'utf8'))
    : JSON.parse(
        await (
          await fetch(
            datasetArg ??
              'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json',
          )
        ).text(),
      )
const byId = new Map(dataset.map((entry) => [entry.id, entry]))

for (const name of Object.keys(GIF_SOURCE_IDS)) {
  if (!byId.has(GIF_SOURCE_IDS[name])) {
    throw new Error(`Unknown dataset id ${GIF_SOURCE_IDS[name]} for "${name}"`)
  }
}

// Map every exercise id in the extracted program files to its gif file, so the
// runtime can look up by the id the app already uses.
const arnold = JSON.parse(readFileSync(`${root}/src/data/external/arnold-schwarzenegger-volume-workout-routines.json`, 'utf8'))
const fullBody = JSON.parse(readFileSync(`${root}/src/data/external/muscle-strength-full-body-workout-routine.json`, 'utf8'))

const idToGif = new Map()
for (const file of [arnold, fullBody]) {
  for (const program of file.programs) {
    for (const day of program.days) {
      for (const exercise of day.exercises) {
        const sourceId = GIF_SOURCE_IDS[exercise.sourceName]
        if (!sourceId) continue
        const entry = byId.get(sourceId)
        idToGif.set(exercise.planned.exercise.id, entry.gif_url)
      }
    }
  }
}

// --- Download ---
const outDir = `${root}/public/exercises`
mkdirSync(outDir, { recursive: true })

const RAW = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/'
let downloaded = 0
const byGifFile = new Map()
for (const [exerciseId, gifUrl] of idToGif) {
  const fileName = gifUrl.split('/').pop()
  byGifFile.set(fileName, exerciseId)
}
for (const fileName of byGifFile.keys()) {
  const outPath = join(outDir, fileName)
  if (fileName.endsWith('.gif')) {
    const res = await fetch(RAW + `videos/${fileName}`)
    if (!res.ok) throw new Error(`Failed to download ${fileName}: HTTP ${res.status}`)
    writeFileSync(outPath, Buffer.from(await res.arrayBuffer()))
    downloaded += 1
  }
}

// --- Emit runtime map keyed by the app exercise ids ---
const entries = [...idToGif.entries()]
  .map(([exerciseId, gifUrl]) => `  '${exerciseId}': '/exercises/${gifUrl.split('/').pop()}',`)
  .join('\n')
const url = 'https://github.com/hasaneyldrm/exercises-dataset'
const ts = `import type { Exercise } from './exercises'

// Exercise animation GIFs for the extracted workout programs (Arnold Volume +
// Full Body), pulled from the exercises-dataset (${url}).
// Media: © Gym visual — https://gymvisual.com/ (180×180), see NOTICE there.
const GIF_BY_EXERCISE_ID: Record<string, string> = {
${entries}
}

export function exerciseGif(exercise: Pick<Exercise, 'id' | 'coachId'>): string | null {
  return GIF_BY_EXERCISE_ID[exercise.coachId ?? exercise.id] ?? null
}
`
writeFileSync(`${root}/src/data/exercise-gifs.ts`, ts)

console.log(`Downloaded ${downloaded} gifs; mapped ${idToGif.size} app exercise ids.`)