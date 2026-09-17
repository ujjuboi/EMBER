// Annotate the stretch category on the ingested library (scripts/annotate-stretches.mjs)
//
//   npm run categorize
//
// One-time + maintenance pass over src/data/ingested/exercises.json that stamps
// `category: 'stretch'` on every stretch-related exercise (name-based markers
// plus the explicit extras), without re-fetching the source dataset. Future
// `npm run ingest` runs apply the same classification from the raw records.
//
// Idempotent: re-running changes nothing.

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { isStretchName } from '../src/data/exercises.ts'

const INGESTED = fileURLToPath(new URL('../src/data/ingested/exercises.json', import.meta.url))

async function main() {
  const exercises = JSON.parse(await readFile(INGESTED, 'utf8'))
  if (!Array.isArray(exercises)) throw new Error(`Unexpected shape for ${INGESTED}`)

  let added = 0
  for (const record of exercises) {
    if (record.category === 'stretch') continue
    if (isStretchName(record.id, record.name)) {
      record.category = 'stretch'
      added += 1
    }
  }

  if (added === 0) {
    console.log(`No new stretches to categorize (${exercises.length} records already annotated).`)
    return
  }

  await writeFile(INGESTED, `${JSON.stringify(exercises)}\n`, 'utf8')
  console.log(
    `Marked ${added} exercises as 'stretch' (${exercises.length - added} kept in the workout pool).`,
  )
}

main().catch((err) => {
  console.error('[categorize] Failed:', err)
  process.exitCode = 1
})