// Extract SVG-coach pose loops from dataset GIFs (scripts/extract-poses.mjs)
//
//   npm run poses            # --core: bodyweight/dumbbell/bench/bands/pullup/tubes + cardio
//   npm run poses -- --all   # full set (long-running, best-effort)
//   npm run poses -- --only ds-0001 ds-0043   # specific exercises
//   npm run poses -- --limit 5                # first N of the selected set
//   npm run poses -- --model lite             # torque blazePose accuracy tier
//   npm run poses -- --workers 6              # parallel CPUs (default 4)
//
// Mirrors the plan: decode each GIF to frames (sharp), run BlazePose 33-landmark
// detection (worker pool on the CPU backend — BlazePose preprocessing needs the
// Transform kernel the tfjs-node backend lacks), then retarget the detections
// onto a fixed human-proportioned skeleton via scripts/skeleton.mjs — gated,
// gap-filled, fixed bone lengths, grounded feet, strictly in-bounds. ~8
// keyframes per exercise are written to src/coach/poses/generated/. Any
// missing/failed pose falls back to the idle loop at runtime.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { fillDetections, buildRetargeted, sanityCheck, VIEWBOX_W, VIEWBOX_H } from './skeleton.mjs'

const RAW_URL = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main'
const RAW_JSON_URL = `${RAW_URL}/data/exercises.json`
const INGESTED = fileURLToPath(new URL('../src/data/ingested/exercises.json', import.meta.url))
const OUT_DIR = fileURLToPath(new URL('../src/coach/poses/generated', import.meta.url))

const MAX_FRAMES = 30
const SAMPLE_FRAMES = 8

const CORE_KIT = new Set(['bodyweight', 'dumbbells', 'bands', 'bench', 'pullup', 'tubes'])

function arg(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : null
}
const opts = {
  all: process.argv.includes('--all'),
  limit: Number(arg('--limit') || 0),
  only: process.argv.includes('--only') ? process.argv.slice(process.argv.indexOf('--only') + 1).filter((a) => a.startsWith('ds-')) : [],
  core: !process.argv.includes('--all') && !process.argv.includes('--only'),
  model: arg('--model') ?? 'full', // BlazePose tier: lite | full | heavy
  workers: Math.min(Number(arg('--workers') || 4), Math.max(4, os.availableParallelism?.() ?? 4)),
}

function isCore(record) {
  if ((record.equipment ?? []).some((item) => CORE_KIT.has(item))) return true
  // cardio bucket → timed, legs + core
  if (
    record.kind === 'timed' &&
    (record.bodyParts ?? []).includes('legs') &&
    (record.bodyParts ?? []).includes('core')
  ) return true
  return false
}

function sampleEvenly(poses, n) {
  if (poses.length <= n) return poses
  const step = (poses.length - 1) / (n - 1)
  const out = []
  for (let i = 0; i < n; i += 1) out.push(poses[Math.round(i * step)] ?? poses[poses.length - 1])
  return out
}

async function decodeRaw(buf) {
  let meta
  try {
    meta = await sharp(buf).metadata()
  } catch {
    return []
  }
  const pages = Math.min(meta.pages ?? 0, MAX_FRAMES)
  const chunks = []
  for (let page = 1; page <= pages; page += 1) {
    try {
      const { data, info } = await sharp(buf, { page })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      chunks.push({ data, width: info.width, height: info.height, channels: info.channels })
    } catch {
      // Trailing GIF disposal frames often fail to decode — skip them.
    }
  }
  return chunks
}

// Worker pool wrapping scripts/pose-worker.mjs (one BlazePose detector per
// worker, CPU backend). Chunk ArrayBuffers are transferred to workers to avoid
// copies; a simple FIFO keeps all workers busy across exercises.
class PosePool {
  constructor(size, modelType) {
    this.size = size
    this.queue = []
    this.idle = []
    this.seq = 0
    this.pending = new Map()
    this.workers = []
    for (let i = 0; i < size; i += 1) this.workers.push(this.spawn(modelType))
  }

  spawn(modelType) {
    const worker = new Worker(new URL('./pose-worker.mjs', import.meta.url), {
      workerData: { modelType },
    })
    this.idle.push(worker)
    worker.on('message', ({ id, frames }) => {
      const pending = this.pending.get(id)
      if (!pending) return
      this.pending.delete(id)
      this.idle.push(worker)
      this.pump()
      pending.resolve(frames)
    })
    worker.on('error', (err) => {
      const pending = this.pending.get(this.idle.length) ?? this.pending.values().next().value
      this.pending.delete(pending?.id ?? this.seq)
      if (pending) pending.reject(err)
    })
    worker.on('exit', () => {
      // The main() error handler turns an unexpected exit into a clear failure.
    })
    return worker
  }

  pump() {
    while (this.queue.length > 0 && this.idle.length > 0) {
      const worker = this.idle.shift()
      const job = this.queue.shift()
      this.pending.set(job.id, job)
      const copies = job.chunks.map((c) => Buffer.from(c.data))
      worker.postMessage(
        {
          id: job.id,
          chunks: copies.map((buf, i) => ({ data: buf, width: job.chunks[i].width, height: job.chunks[i].height, channels: job.chunks[i].channels })),
        },
        copies.map((buf) => buf.buffer),
      )
    }
  }

  run(chunks) {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      this.queue.push({ id, chunks, resolve, reject })
      this.pump()
    })
  }

  async dispose() {
    await Promise.all(this.workers.map((w) => new Promise((res) => w.once('exit', res) && w.terminate())))
  }
}

let pool

async function runPose(chunks) {
  return pool.run(chunks)
}

function frameReport(clip) {
  const total = clip.frames.length * 15
  const clamped = clip.frames.reduce((sum, f) => sum + f.clamped, 0)
  return `ok${clamped > 0 ? ` (clamped ${clamped}/${total})` : ''}`
}

async function processExercise(record) {
  const gifUrl = rawGif.get(record.id)
  if (!gifUrl) return 'no-gif'
  const res = await fetch(`${RAW_URL}/${gifUrl}`)
  if (!res.ok) return 'fetch-fail'
  const buf = Buffer.from(await res.arrayBuffer())
  const chunks = await decodeRaw(buf)
  if (chunks.length < 2) return 'frames-too-few'

  const detections = await runPose(chunks)
  const filled = fillDetections(detections)
  if (!filled) return 'no-pose'
  const clip = buildRetargeted(filled)
  if (!clip) return 'no-pose'

  const reason = sanityCheck(clip)
  if (reason) return reason

  const loopMs = clip.frames.length > 1 ? 1400 : 2200
  const file = {
    id: record.id,
    name: record.name,
    view: clip.view,
    loopMs,
    frames: sampleEvenly(clip.frames.map((f) => f.frame), SAMPLE_FRAMES),
  }
  await writeFile(path.join(OUT_DIR, `${record.id}.json`), `${JSON.stringify(file)}\n`, 'utf8')
  return frameReport(clip)
}

let rawGif = new Map()

async function main() {
  const [ingested, raw] = await Promise.all([
    readFile(INGESTED, 'utf8').then(JSON.parse),
    fetch(RAW_JSON_URL).then((r) => {
      if (!r.ok) throw new Error(`Failed to fetch raw dataset: ${r.status}`)
      return r.json()
    }),
  ])
  for (const r of raw) rawGif.set(`ds-${r.id}`, r.gif_url)

  let selected = ingested
  if (!opts.all && opts.only.length === 0) {
    selected = selected.filter((record) => isCore(record))
  }
  if (opts.only.length > 0) selected = selected.filter((record) => opts.only.includes(record.id))
  if (opts.limit > 0) selected = selected.slice(0, opts.limit)

  console.log(`Processing ${selected.length} exercises (${opts.all ? 'all' : opts.only.length ? opts.only.join(',') : 'core'}) model=${opts.model} workers=${opts.workers}`)
  pool = new PosePool(opts.workers, opts.model)
  await mkdir(OUT_DIR, { recursive: true })

  const tally = { ok: 0, skip: 0 }
  const reasons = {}
  try {
    for (const [index, record] of selected.entries()) {
      const status = await processExercise(record)
      if (status.startsWith('ok')) tally.ok += 1
      else {
        tally.skip += 1
        reasons[status] = (reasons[status] ?? 0) + 1
      }
      console.log(`  [${index + 1}/${selected.length}] ${record.id} ${record.name} → ${status}`)
    }
  } finally {
    await pool.dispose()
  }

  console.log(`Done. wrote ${tally.ok}, skipped ${tally.skip} ${JSON.stringify(reasons)}`)
  console.log(`viewBox ${VIEWBOX_W}×${VIEWBOX_H}: any leftover out-of-bounds frame fails the sanity gate and is dropped.`)
}

main().catch((err) => {
  console.error('[poses] Failed:', err)
  process.exitCode = 1
})