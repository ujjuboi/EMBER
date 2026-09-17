// Extract SVG-coach pose loops from dataset GIFs (scripts/extract-poses.mjs)
//
//   npm run poses            # --core: bodyweight/dumbbell/bench/bands/pullup/tubes + cardio
//   npm run poses -- --all   # full 1,304 (long-running, best-effort)
//   npm run poses -- --only ds-0001 ds-0043   # specific exercises
//   npm run poses -- --limit 5                # first N of the selected set
//
// Mirrors the plan: decode each GIF to frames (sharp), run MoveNet
// (tfjs-node + @tensorflow-models/pose-detection, model downloaded on first
// run), map the 17 keypoints onto the app's Pose model, auto-detect side/front,
// project into the 200×260 viewBox, sample ~8 keyframes, and write one file per
// exercise under src/coach/poses/generated/. Any missing/failed pose falls back
// to the idle loop at runtime.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import util from 'node:util'
import path from 'node:path'
import sharp from 'sharp'

// tfjs-node 4.x still calls util.isNullOrUndefined, removed in newer Node.
util.isNullOrUndefined ??= (v) => v === null || v === undefined

const tf = await import('@tensorflow/tfjs-node')
const poseDetection = await import('@tensorflow-models/pose-detection')
await tf.ready()

const RAW_URL = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main'
const RAW_JSON_URL = `${RAW_URL}/data/exercises.json`
const INGESTED = fileURLToPath(new URL('../src/data/ingested/exercises.json', import.meta.url))
const OUT_DIR = fileURLToPath(new URL('../src/coach/poses/generated', import.meta.url))

const VIEWBOX_W = 200
const VIEWBOX_H = 260
const FLOOR_Y = 232 // just above the floor line CoachAvatar draws at y=246
const MAX_FRAMES = 30
const SAMPLE_FRAMES = 8
const MIN_SCORE = 0.35
const POINT_MIN_SCORE = 0.3

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

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

function frameScore(frame) {
  const m = Object.fromEntries(frame.keypoints.map((kp) => [kp.name, kp]))
  const needed = [
    'nose', 'left_shoulder', 'right_shoulder', 'left_hip', 'right_hip',
    'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist',
    'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
  ]
  const scores = needed.map((name) => m[name]?.score ?? 0)
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

function detectView(m) {
  const s = m.left_shoulder; const r = m.right_shoulder
  const lh = m.left_hip; const rh = m.right_hip
  if (!s || !r || !lh || !rh) return 'side'
  const shoulderMid = mid(s, r)
  const hipMid = mid(lh, rh)
  const torsoH = Math.hypot(hipMid.x - shoulderMid.x, hipMid.y - shoulderMid.y) || 1
  const spread = Math.max(Math.abs(s.x - r.x), Math.abs(lh.x - rh.x))
  return spread / torsoH > 0.5 ? 'front' : 'side'
}

function detectFacing(m) {
  const s = m.left_shoulder; const r = m.right_shoulder
  const nose = m.nose
  if (!s || !r || !nose) return null
  const midX = (s.x + r.x) / 2
  return nose.x < midX ? 'left' : 'right' // nose toward viewer-left ⇒ figure faces left
}

function projectFrames(frames) {
  const usable = frames.filter((frame) => frameScore(frame) >= MIN_SCORE)
  if (usable.length === 0) return null
  const anchor = usable.reduce((a, b) => (frameScore(a) >= frameScore(b) ? a : b))
  const anchorMap = Object.fromEntries(anchor.keypoints.map((kp) => [kp.name, kp]))
  const view = detectView(anchorMap)
  const facing = view === 'side' ? detectFacing(anchorMap) : null

  const kps = usable.flatMap((frame) => frame.keypoints.filter((kp) => (kp.score ?? 0) >= POINT_MIN_SCORE))
  if (kps.length === 0) return null
  const minX = Math.min(...kps.map((p) => p.x))
  const maxX = Math.max(...kps.map((p) => p.x))
  const minY = Math.min(...kps.map((p) => p.y))
  const maxY = Math.max(...kps.map((p) => p.y))
  const w = maxX - minX || 1
  const h = maxY - minY || 1
  const scale = Math.min((VIEWBOX_W - 16) / w, (VIEWBOX_H - 56) / h)
  const offsetX = VIEWBOX_W / 2 - (scale * (minX + maxX)) / 2
  const offsetY = FLOOR_Y - scale * maxY

  const project = (p) => {
    let x = p.x * scale + offsetX
    if (facing === 'left') x = VIEWBOX_W - x
    return { x: Math.round(x), y: Math.round(p.y * scale + offsetY) }
  }

  const poses = []
  for (const frame of frames) {
    const m = Object.fromEntries(frame.keypoints.map((kp) => [kp.name, kp]))
    const s = m.left_shoulder; const r = m.right_shoulder
    const lh = m.left_hip; const rh = m.right_hip
    if (!s || !r || !lh || !rh) continue
    const neck = mid(s, r)
    const hip = mid(lh, rh)
    poses.push({
      view,
      head: project(m.nose ?? neck),
      neck: project(neck),
      lShoulder: project(s),
      rShoulder: project(r),
      lElbow: project(m.left_elbow ?? s),
      rElbow: project(m.right_elbow ?? r),
      lWrist: project(m.left_wrist ?? s),
      rWrist: project(m.right_wrist ?? r),
      hip: project(hip),
      lHip: project(lh),
      rHip: project(rh),
      lKnee: project(m.left_knee ?? lh),
      rKnee: project(m.right_knee ?? rh),
      lAnkle: project(m.left_ankle ?? lh),
      rAnkle: project(m.right_ankle ?? rh),
    })
  }
  if (poses.length === 0) return null
  return { view, frames: poses }
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

// MoveNet keypoints are backed by the inference tensor's memory — snapshot them
// into plain {name,x,y,score} objects before the tensor is disposed, and only
// then free the tensor.
async function runMoveNet(chunks) {
  const results = []
  for (const chunk of chunks) {
    const tensor = tf.tensor3d(new Uint8Array(chunk.data), [chunk.height, chunk.width, chunk.channels])
    try {
      const poses = await detector.estimatePoses(tensor)
      const det = poses[0]
      if (!det) {
        results.push(null)
        continue
      }
      const keypoints = det.keypoints.map((kp) => ({
        name: kp.name,
        x: Number(kp.x),
        y: Number(kp.y),
        score: Number(kp.score ?? 0),
      }))
      results.push({ keypoints })
    } finally {
      tensor.dispose()
    }
  }
  return results
}

async function processExercise(record) {
  const gifUrl = rawGif.get(record.id)
  if (!gifUrl) return 'no-gif'
  const res = await fetch(`${RAW_URL}/${gifUrl}`)
  if (!res.ok) return 'fetch-fail'
  const buf = Buffer.from(await res.arrayBuffer())
  const chunks = await decodeRaw(buf)
  if (chunks.length < 2) return 'frames-too-few'
  const detections = await runMoveNet(chunks)
  const frames = detections.filter(Boolean)
  const projected = projectFrames(frames)
  if (!projected || projected.frames.length === 0) return 'no-pose'
  const loopMs = projected.frames.length > 1 ? 1400 : 2200
  const file = {
    id: record.id,
    name: record.name,
    view: projected.view,
    loopMs,
    frames: sampleEvenly(projected.frames, SAMPLE_FRAMES),
  }
  await writeFile(path.join(OUT_DIR, `${record.id}.json`), `${JSON.stringify(file)}\n`, 'utf8')
  return 'ok'
}

let detector
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

  console.log(`Processing ${selected.length} exercises (${opts.all ? 'all' : opts.only.length ? opts.only.join(',') : 'core'})`)
  detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
  })
  await mkdir(OUT_DIR, { recursive: true })

  const tally = { ok: 0, skip: 0 }
  const reasons = {}
  for (const [index, record] of selected.entries()) {
    const status = await processExercise(record)
    if (status === 'ok') tally.ok += 1
    else {
      tally.skip += 1
      reasons[status] = (reasons[status] ?? 0) + 1
    }
    console.log(`  [${index + 1}/${selected.length}] ${record.id} ${record.name} → ${status}`)
  }

  console.log(`Done. wrote ${tally.ok}, skipped ${tally.skip} ${JSON.stringify(reasons)}`)
}

main().catch((err) => {
  console.error('[poses] Failed:', err)
  process.exitCode = 1
})