// Slim the browsable exercise library to ~100 per body part (scripts/curate.mjs)
//
//   npm run curate          # write trimmed src/data/ingested/exercises.json
//   npm run curate -- --dry # preview only, no write
//
// The supplemental dataset (hasaneyldrm/exercises-dataset) is dominated by
// near-duplicate variants of the same move (dumbbell/barbell/cable/band/lever
// forms, (male)/(female) copies, position variants). `npm run curate` keeps a
// reviewable top-100 per body-part chip so browsing shows canonical exercises
// instead of 453 arm variants.
//
// Selection is deterministic and documented here:
//  - Stretch records are never trimmed (still 56, their own chip).
//  - Each body part keeps up to 100 records.
//    · arms are forced 25 / 25 / 25 / 25 across shoulders, biceps, triceps,
//      forearms.
//  - Records are scored per body part:
//    + canonical movement-family match (regexes below, weights built from the
//      workout-plan research),
//    + isolation/compound boost (compound moves rank first),
//    + home-kit preference — bodyweight/dumbbells/bands/bench/pullup/tubes and
//      their trainer equivalents (barbell→dumbbells, cable/smith/assisted→
//      bands) rank above machine-only work. This is a lean, NOT a ceiling:
//      barbell/cable/lever classics get a gym-classic bonus so gym goers still
//      see the canonical lifts (bench press, lat pulldown, leg press, …).
//    + terse-name bonus (canonical titles beat verbose variants).
//  - Variant caps keep one move from monopolizing a chip: a body part keeps at
//    most 3 records sharing the same normalized base title, and each movement
//    family respects a quota (sums to 100).
//  - Each family fills to its quota by score; the leftover "other" bucket is
//    weighted lowest, so canonical moves crowd out makeweights.
//
// Everything trimmed is restorable by re-running `npm run ingest`; this script
// is idempotent and safe to re-run after an ingest.
//
// Report mode prints kept/dropped tallies and the per-chip composition.

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const INGESTED = fileURLToPath(new URL('../src/data/ingested/exercises.json', import.meta.url))

const BODY_PARTS = ['legs', 'back', 'chest', 'arms', 'core']
const STRETCH = 'stretch'

// Known home kits (src/data/exercises.ts) + the trainer substitutions
// (src/lib/trainer.ts) that make a barbell/cable move home-doable.
const HOME_KITS = new Set(['bodyweight', 'dumbbells', 'bands', 'bench', 'pullup', 'tubes'])
const HOME_SUBSTITUTES = {
  barbell: 'dumbbells',
  'olympic barbell': 'dumbbells',
  'ez barbell': 'dumbbells',
  kettlebell: 'dumbbells',
  'medicine ball': 'dumbbells',
  weighted: 'dumbbells',
  'trap bar': 'dumbbells',
  cable: 'bands',
  'smith machine': 'bands',
  assisted: 'bands',
}
const GYM_CLASSICS = new Set(['barbell', 'olympic barbell', 'ez barbell', 'cable', 'lever', 'smith machine', 'sled'])

// Movement families per body part. `re` is tested against the normalized name;
// `max` caps how many of that family a chip keeps. Weights sum to the family's
// presence in the canonical workout-plan research.
const FAMILIES = {
  legs: [
    { id: 'squat', w: 3, max: 12, re: /\bsquat\b|hack squat|pistol|split squat|sissy|lunge matrix/ },
    { id: 'hinge', w: 3, max: 12, re: /\bdeadlift\b|\brdl\b|romanian|good morning|pull[- ]?through|hyperext/ },
    { id: 'lunge', w: 3, max: 12, re: /\blunge\b|step[- ]?up|curtsy/ },
    { id: 'glute', w: 2.5, max: 10, re: /hip thrust|glute bridge|hip bridge|kickback|back extension|bridge\b/ },
    { id: 'legpress', w: 2, max: 8, re: /leg press|hack squat|sled\b/ },
    { id: 'hamstring', w: 2, max: 8, re: /leg curl|hamstring|nordic/ },
    { id: 'quadiso', w: 2, max: 8, re: /leg extension|s[sc]issor/ },
    { id: 'calf', w: 2, max: 8, re: /\bcalf\b|heel raise|ankle|donkey|calf press/ },
    { id: 'abad', w: 1.5, max: 6, re: /abduct|adduct|clamshell|fire hydrant|side[- ]ly|side hip|leg lift/ },
    { id: 'jump', w: 2, max: 8, re: /\bjump\b|burpee|mountain climber|skater|sprint|high knee|hop\b|speed/ },
    { id: 'other', w: 0.5, max: 8, re: /./ },
  ],
  back: [
    { id: 'vpull', w: 3, max: 20, re: /pull[- ]?up|chin[- ]?up|pulldown|pullup/ },
    { id: 'row', w: 3, max: 24, re: /\brow\b|inverted row|seated row|t[- ]?bar|pendlay|renegade/ },
    { id: 'lowerback', w: 2, max: 12, re: /deadlift|good morning|back extension|superman|reverse hyper/ },
    { id: 'reardelt', w: 2, max: 8, re: /face pull|reverse fly|rear delt|\by[- ]?raise\b|reverse row/ },
    { id: 'traps', w: 1.5, max: 8, re: /\bshrug\b/ },
    { id: 'pullover', w: 1.5, max: 6, re: /pullover|straight[- ]?arm/ },
    { id: 'scap', w: 1.5, max: 6, re: /scapula|shoulder blade|elevation|depression|blade/ },
    { id: 'other', w: 0.5, max: 16, re: /./ },
  ],
  chest: [
    { id: 'bench', w: 3, max: 28, re: /\bbench\b|\bpress\b|push[- ]?press|floor press/ },
    { id: 'pushup', w: 3, max: 20, re: /push[- ]?up|pushup|handstand/ },
    { id: 'dip', w: 2.5, max: 12, re: /\bdips?\b|bench dip/ },
    { id: 'fly', w: 2.5, max: 14, re: /\bfly\b|crossover|pec[- ]?deck|squeeze/ },
    { id: 'pullover', w: 2, max: 8, re: /pullover|hug\b/ },
    { id: 'other', w: 0.5, max: 18, re: /./ },
  ],
  core: [
    { id: 'crunch', w: 3, max: 18, re: /crunch|sit[- ]?up|abdominal|v[- ]?up|\bjacks?\b|toe touch|decline sit/ },
    { id: 'plank', w: 2.5, max: 18, re: /plank|bridge|hollow|dead bug|bird[- ]?dog|stability|fallout/ },
    { id: 'legraise', w: 2.5, max: 18, re: /leg raise|knee raise|flutter|bicycle|reverse crunch|windshield|rollerout|wheel|hanging|raise\b/ },
    { id: 'rotation', w: 2.5, max: 18, re: /twist|rotation|side bend|woodcho|side plank|pallof|roll[- ]?out|windmill|inchworm|cable/ },
    { id: 'lowback', w: 2, max: 10, re: /superman|swimmer|back extension|diagonal|deadlift|good morning|hyperext/ },
    { id: 'climber', w: 2, max: 8, re: /mountain climber|burpee|\bjump\b|skater|climber/ },
    { id: 'other', w: 0.5, max: 10, re: /./ },
  ],
}

// Arms chips are forced to 25 per subgroup. Ordered by priority so an exercise
// that matches several patterns lands in the most specific bucket.
const ARM_GROUPS = [
  {
    id: 'shoulders',
    quota: 25,
    re: /overhead press|shoulder press|lateral raise|front raise|rear delt|reverse fly|face pull|upright row|arnold|shrug|side raise|\braise\b|clean and jerk|\bsnatch\b|handstand push|y[- ]?raise|external rotation/,
  },
  {
    id: 'forearms',
    quota: 25,
    re: /wrist|pronat|supinat|farmer|finger grenade|hand strength|roller\b|plate pin/,
  },
  {
    id: 'triceps',
    quota: 25,
    re: /triceps|tricep|extension|skull|pushdown|pressdown|close[- ]grip|\bdips?\b|bench dip|floor press|french press|kickback|lockout/,
  },
  {
    id: 'biceps',
    quota: 25,
    re: /\bcurl\b|concentration|preacher|spider|hammer|drag|towel|arm blaster/,
  },
]

// Strip dataset noise so variant titles collapse ("barbell bench press (male)",
// "dumbbell bench press v.2" → "barbell bench press").
function normalizeName(name) {
  return String(name)
    .toLowerCase()
    .replace(/\s*\(male\)/g, '')
    .replace(/\s*\(female\)/g, '')
    .replace(/\s*\(pavilion[^)]*\)/g, '')
    .replace(/\s*\(with[^)]*\)/g, '')
    .replace(/\s*\([^)]*attachment[^)]*\)/g, '')
    .replace(/[ -]v\.?\s?\d+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Collapse equipment/agency prefixes so variant caps group them, but keep
// position/angle words (incline/decline/standing/seated/one-arm) — those are
// distinct movements gym goers care about.
function baseTitle(name) {
  const norm = normalizeName(name)
  const prefix =
    /^(dumbbells?|barbell|ez[- ]?barbell|olympic barbell|cable|lever|smith|band|resistance (band|tube)|kettlebell|medicine ball|weighted|assisted|bosu ball|stability ball|exercise ball|trap bar|sled|roller|wheel)\s+/
  return norm.replace(prefix, '')
}

function homeCompatible(record) {
  const needed = record.equipment ?? []
  if (needed.length === 0) return true
  return needed.every((item) => HOME_KITS.has(item) || HOME_SUBSTITUTES[item] != null)
}

function isGymClassic(record) {
  return (record.equipment ?? []).some((item) => GYM_CLASSICS.has(item))
}

function pickFamily(norm, bodyPartName) {
  for (const family of FAMILIES[bodyPartName]) {
    if (family.re.test(norm)) return family
  }
  return null
}

function scoreFor(record, bodyPartName) {
  const norm = normalizeName(record.name)
  let family = null
  if (bodyPartName === 'arms') {
    family = ARM_GROUPS.find((group) => group.re.test(norm)) ?? null
  } else {
    family = pickFamily(norm, bodyPartName)
  }
  if (!family) return { family: null, score: 0 }
  let score = family.w ?? 1
  if (record.compound) score += 1
  if (homeCompatible(record)) score += 1.5
  else if (isGymClassic(record)) score += 0.8
  if (norm.length <= 40) score += 0.3
  return { family, score }
}

function nameTokens(name) {
  return normalizeName(name).split(' ').length
}

// Select up to quota records for one body part. Families are allocated in
// round-robin rounds so a dominant pool (e.g. 71 squats) can't swamp a chip;
// family `max` quotas then only leave slack when a pool is genuinely small.
function selectFor(records, bodyPartName, quota) {
  const familyQueues = new Map()
  for (const record of records) {
    const { family } = scoreFor(record, bodyPartName)
    const familyId = family ? family.id : 'other'
    if (!familyQueues.has(familyId)) familyQueues.set(familyId, [])
    familyQueues.get(familyId).push(record)
  }
  // Each family sorted best-first; used tracking for the base-title cap.
  const queues = []
  for (const [familyId, members] of familyQueues) {
    const family = bodyPartName === 'arms' ? null : FAMILIES[bodyPartName].find((f) => f.id === familyId)
    const scored = members
      .map((record) => ({ record, ...scoreFor(record, bodyPartName) }))
      .sort((a, b) => b.score - a.score || nameTokens(a.record.name) - nameTokens(b.record.name))
    queues.push({ familyId, family, pending: scored, i: 0 })
  }

  const kept = []
  const familyCounts = {}
  const baseCounts = {}
  const seen = new Set()

  const take = (q, loosen) => {
    while (q.i < q.pending.length) {
      const item = q.pending[q.i]
      const cap = q.family ? q.family.max : 25
      // Park (don't advance) at the first family-capped item: the loosened fill
      // pass must still be able to reconsider it once caps are relaxed.
      if (!loosen && (familyCounts[q.familyId] ?? 0) >= cap) return false
      q.i += 1
      if (seen.has(item.record.id)) continue
      const base = baseTitle(item.record.name)
      if ((baseCounts[base] ?? 0) >= (loosen ? 5 : 3)) continue
      familyCounts[q.familyId] = (familyCounts[q.familyId] ?? 0) + 1
      baseCounts[base] = (baseCounts[base] ?? 0) + 1
      seen.add(item.record.id)
      kept.push(item.record)
      return true
    }
    return false
  }

  // Round-robin: one pass per round gives small pools their share before a big
  // pool eats the quota.
  let progressed = true
  while (kept.length < quota && progressed) {
    progressed = false
    for (const q of queues) {
      if (kept.length >= quota) break
      if (take(q, false)) progressed = true
    }
  }
  // Slack from small pools: fill remaining from the highest-scoring leftovers,
  // looping queues like the round robin so every family gets a turn.
  progressed = true
  while (kept.length < quota && progressed) {
    progressed = false
    for (const q of queues) {
      if (kept.length >= quota) break
      if (take(q, true)) progressed = true
    }
  }
  return { kept, familyCounts, total: kept.length }
}

// Arms: exact 25/25/25/25 split. Each record is assigned to the first group
// whose pattern matches (priority order), so an exercise lands in one bucket.
function selectArms(records) {
  const buckets = ARM_GROUPS.map((group) => ({ group, members: [] }))
  for (const record of records) {
    const norm = normalizeName(record.name)
    const holder = ARM_GROUPS.find((group) => group.re.test(norm))
    if (!holder) continue
    buckets.find((b) => b.group === holder).members.push(record)
  }
  const groups = buckets.map(({ group, members }) => {
    const scored = members
      .map((record) => ({ record, ...scoreFor(record, 'arms') }))
      .sort((a, b) => b.score - a.score)
    const kept = []
    const baseCounts = {}
    for (const item of scored) {
      if (kept.length >= group.quota) break
      const base = baseTitle(item.record.name)
      if ((baseCounts[base] ?? 0) >= 3) continue
      baseCounts[base] = (baseCounts[base] ?? 0) + 1
      kept.push(item.record)
    }
    return { id: group.id, kept, count: kept.length }
  })
  const kept = groups.flatMap((g) => g.kept)
  const familyCounts = Object.fromEntries(groups.map((g) => [g.id, g.count]))
  return { kept, familyCounts, total: kept.length }
}

function reportSection(label, selected, records, familyCounts) {
  const names = selected.map((r) => r.name)
  console.log(`\n=== ${label} (kept ${selected.length}) ===`)
  console.log(`  per-family: ${JSON.stringify(familyCounts)}`)
  console.log(`  home-kit: ${selected.filter(homeCompatible).length}  gym-classic: ${selected.filter(isGymClassic).length}`)
  console.log(`  samples: ${names.slice(0, 12).map((n) => `\`${n}\``).join(' ')}`)
  console.log(`  dropped ${records.length - selected.length}`)
}

async function main() {
  const dry = process.argv.includes('--dry')
  const ingested = await readFile(INGESTED, 'utf8').then(JSON.parse)

  const stretch = ingested.filter((r) => r.category === STRETCH)
  const library = ingested.filter((r) => r.category !== STRETCH)

  // The dataset tags cardio-style moves with both legs AND core (23 records).
  // Those consume one slot in each chip, so a fixed shared budget keeps both
  // chips at exactly 100 once the union is assembled.
  const isOverlap = (r) => {
    const parts = (r.bodyParts ?? []).filter((p) => p !== 'core' && p !== 'legs')
    return parts.length === 0 && (r.bodyParts ?? []).includes('legs') && (r.bodyParts ?? []).includes('core')
  }
  const OVERLAP_BUDGET = 15
  const overlapPool = library.filter(isOverlap)
  const coreOverlapIds = new Set(overlapPool.map((r) => r.id))

  const perPart = {}
  const consumed = (bodyPartName) =>
    bodyPartName === 'legs' || bodyPartName === 'core' ? 100 - OVERLAP_BUDGET : 100
  for (const bodyPartName of BODY_PARTS) {
    const pool = library
      .filter((r) => (r.bodyParts ?? []).includes(bodyPartName))
      .filter((r) => !(bodyPartName === 'legs' ? coreOverlapIds.has(r.id) : isOverlap(r)))
    const quota = consumed(bodyPartName)
    const selected =
      bodyPartName === 'arms' ? selectArms(pool) : selectFor(pool, bodyPartName, quota)
    perPart[bodyPartName] = { selected: new Set(selected.kept.map((r) => r.id)), counts: selected.familyCounts, total: selected.total }
  }

  // The core+legs overlap rides into both chips via one shared budget.
  const overlap = selectFor(overlapPool, 'core', OVERLAP_BUDGET)
  perPart.legs.selected = new Set([...perPart.legs.selected, ...overlap.kept.map((r) => r.id)])
  perPart.core.selected = new Set([...perPart.core.selected, ...overlap.kept.map((r) => r.id)])

  // Union: any record is stored once in the file even when it shows up in two
  // chips (only the core+legs overlap is shared).
  const keptIds = new Set(stretch.map((r) => r.id))
  for (const part of BODY_PARTS) for (const id of perPart[part].selected) keptIds.add(id)
  const kept = ingested.filter((r) => keptIds.has(r.id))
  const dropped = ingested.filter((r) => !keptIds.has(r.id))

  if (dry) {
    for (const bodyPartName of BODY_PARTS) {
      const pool = library.filter((r) => (r.bodyParts ?? []).includes(bodyPartName))
      reportSection(
        bodyPartName,
        ingested.filter((r) => perPart[bodyPartName].selected.has(r.id)),
        pool,
        perPart[bodyPartName].counts,
      )
    }
    console.log(`\n[dry-run] ${ingested.length} → ${kept.length} records (${dropped.length} dropped, stretch ${stretch.length} kept); nothing written.`)
    return
  }

  // Chip-size sanity: each body-part chip must be ≤100. Stretch records are
  // their own chip, so they're excluded here exactly like the AddSheet filter
  // (TrainPage pulls stretches out of the body-part lists).
  for (const bodyPartName of BODY_PARTS) {
    const chip = kept.filter((r) => r.category !== STRETCH && (r.bodyParts ?? []).includes(bodyPartName))
    if (chip.length > 100) {
      console.error(`[curate] ${bodyPartName} chip would be ${chip.length} — aborting, report and adjust quotas.`)
      process.exitCode = 1
      return
    }
  }

  await writeFile(INGESTED, `${JSON.stringify(kept)}\n`, 'utf8')

  const bytes = Buffer.byteLength(JSON.stringify(kept), 'utf8')
  console.log(`Trimmed ${ingested.length} → ${kept.length} records (${(bytes / 1024 / 1024).toFixed(2)} MB); dropped ${dropped.length} + stretch kept ${stretch.length}.`)
  for (const bodyPartName of BODY_PARTS) {
    const chip = kept.filter((r) => r.category !== STRETCH && (r.bodyParts ?? []).includes(bodyPartName))
    console.log(`  ${bodyPartName}: ${chip.length}`)
  }
}

main().catch((err) => {
  console.error('[curate] Failed:', err)
  process.exitCode = 1
})