// Prune core exercises that failed pose extraction (scripts/prune-no-poses.mjs)
//
//   npm run prune
//
// The core pose batch (see scripts/extract-poses.mjs) is the set we commit to
// generating loops for. This removes any *core* record from
// src/data/ingested/exercises.json that still has no file under
// src/coach/poses/generated/ (rewritten after a build, a scratched file, or a
// MoveNet miss), so the browsable library never surfaces a move whose coach
// would stay on the idle loop.
//
// Non-core records (barbell/cable/smith/…) are left untouched: they target the
// future `--all` batch and fall back to idle in the meantime. Everything the
// prune removes is restorable by re-running `npm run ingest`.
//
// Idempotent: re-running after a successful rescue/`--all` is a no-op for
// records already pruned, and only drops newly-failing core records.

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const INGESTED = fileURLToPath(new URL('../src/data/ingested/exercises.json', import.meta.url))
const GENERATED_DIR = fileURLToPath(new URL('../src/coach/poses/generated', import.meta.url))

// Must mirror the core filter in scripts/extract-poses.mjs.
const CORE_KIT = new Set(['bodyweight', 'dumbbells', 'bands', 'bench', 'pullup', 'tubes'])

function isCore(record) {
  if ((record.equipment ?? []).some((item) => CORE_KIT.has(item))) return true
  // cardio bucket → timed, legs + core
  return (
    record.kind === 'timed' &&
    (record.bodyParts ?? []).includes('legs') &&
    (record.bodyParts ?? []).includes('core')
  )
}

async function main() {
  const [ingested, files] = await Promise.all([
    readFile(INGESTED, 'utf8').then(JSON.parse),
    readdir(GENERATED_DIR),
  ])
  if (files.length === 0) {
    console.log('No generated poses found — refusing to prune the whole library. Nothing to do.')
    return
  }
  const generated = new Set(files.map((file) => file.replace(/\.json$/, '')))
  const before = ingested.length
  const removed = ingested.filter((record) => isCore(record) && !generated.has(record.id))
  if (removed.length === 0) {
    console.log(`No core records missing a pose (${ingested.length} records kept). Nothing to do.`)
    return
  }

  const keep = ingested.filter((record) => !(isCore(record) && !generated.has(record.id)))
  await writeFile(INGESTED, `${JSON.stringify(keep)}\n`, 'utf8')

  const bytes = Buffer.byteLength(JSON.stringify(keep), 'utf8')
  console.log(`Removed ${removed.length} core exercises without a pose (${before} → ${keep.length}, ${(bytes / 1024 / 1024).toFixed(2)} MB):`)
  for (const record of removed.sort((a, b) => a.id.localeCompare(b.id))) {
    console.log(`  ${record.id}  ${record.name}`)
  }
}

main().catch((err) => {
  console.error('[prune] Failed:', err)
  process.exitCode = 1
})