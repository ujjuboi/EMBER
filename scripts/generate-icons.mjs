import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const favicon = readFileSync(join(root, 'public', 'favicon.svg'))
const outDir = join(root, 'public', 'icons')
mkdirSync(outDir, { recursive: true })

const VIEWBOX = 32
const TILE = '#050505'

function svgAt(size) {
  const density = (size / VIEWBOX) * 72
  return sharp(favicon, { density }).png().toBuffer()
}

function blackTile(size) {
  return sharp({ create: { width: size, height: size, channels: 4, background: TILE } })
    .png()
    .toBuffer()
}

async function main() {
  const regular192 = await svgAt(192)
  const regular512 = await svgAt(512)
  const appleTouch = await svgAt(180)

  const maskable = 512
  const safe = Math.round(maskable * 0.8)
  const content = await svgAt(safe)
  const tile = await blackTile(maskable)
  const maskablePng = await sharp(tile)
    .composite([
      { input: content, left: Math.round((maskable - safe) / 2), top: Math.round((maskable - safe) / 2) },
    ])
    .png()
    .toBuffer()

  const writes = [
    ['icon-192.png', regular192],
    ['icon-512.png', regular512],
    ['maskable-512.png', maskablePng],
    ['apple-touch-icon.png', appleTouch],
  ]
  for (const [name, buf] of writes) writeFileSync(join(outDir, name), buf)
  console.log('Wrote', writes.map(([n]) => n).join(', '), 'to public/icons/')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})