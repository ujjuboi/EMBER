import sharp from 'sharp'
import { fillDetections, buildRetargeted } from './scripts/skeleton.mjs'
import { Worker } from 'node:worker_threads'

const RAW_URL = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main'
const MAX_FRAMES = 30

async function decodeRaw(buf) {
  const meta = await sharp(buf).metadata()
  const pages = Math.min(meta.pages ?? 0, MAX_FRAMES)
  const chunks = []
  for (let page = 1; page <= pages; page += 1) {
    try {
      const { data, info } = await sharp(buf, { page }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
      chunks.push({ data, width: info.width, height: info.height, channels: info.channels })
    } catch {}
  }
  return chunks
}

const worker = new Worker(new URL('./scripts/pose-worker.mjs', import.meta.url), { workerData: { modelType: process.env.POSE_MODEL ?? 'full' } })
let seq = 0
const pending = new Map()
worker.on('message', (m) => { const p = pending.get(m.id); pending.delete(m.id); p.resolve(m.frames) })
const run = (chunks) => {
  const id = ++seq
  return new Promise((resolve) => {
    pending.set(id, { resolve })
    worker.postMessage({ id, chunks: chunks.map((c) => ({ data: Buffer.from(c.data), width: c.width, height: c.height, channels: c.channels })) })
  })
}

const [ingested, raw] = await Promise.all([
  import('node:fs/promises').then(({ readFile }) => readFile('./src/data/ingested/exercises.json', 'utf8')).then(JSON.parse),
  fetch(`${RAW_URL}/data/exercises.json`).then((r) => r.json()),
])
const gifBy = new Map(raw.map((r) => [`ds-${r.id}`, `${RAW_URL}/${r.gif_url}`]))
const ids = process.argv.slice(2)
const names = new Map(ingested.map((r) => [r.id, r.name]))

for (const id of ids) {
  const url = gifBy.get(id)
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
  const chunks = await decodeRaw(buf)
  const detections = await run(chunks)
  const filled = fillDetections(detections)
  if (!filled) { console.log(id.padEnd(7), names.get(id)?.padEnd(34), 'no-pose'); continue }
  const clip = buildRetargeted(filled)
  if (!clip) { console.log(id.padEnd(7), names.get(id)?.padEnd(34), 'no-pose'); continue }
  const clamped = clip.frames.map((f) => f.clamped)
  const bad = clip.frames.filter(({ clamped }) => clamped > 6).length
  const all = clip.frames.flatMap(({ frame }) => Object.entries(frame).filter(([k]) => k !== 'view').map(([, v]) => v))
  const xs = all.map((p) => p.x); const ys = all.map((p) => p.y)
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys)
  console.log(
    id.padEnd(7), names.get(id)?.slice(0, 32).padEnd(34),
    'view', clip.view.padEnd(5), 'facing', String(clip.facing).padEnd(5),
    'v', clip.meanVis.toFixed(2), 'clamp>6', `${bad}/${clip.frames.length}`,
    'x', `${minX}..${maxX}`, 'y', `${minY}..${maxY}`,
  )
}
await worker.terminate()