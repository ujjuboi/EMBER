import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const dist = join(process.cwd(), 'dist')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.DS_Store') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function contentType(path) {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8'
  if (path.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (path.endsWith('.css')) return 'text/css; charset=utf-8'
  if (path.endsWith('.svg')) return 'image/svg+xml'
  if (path.endsWith('.json')) return 'application/json'
  if (path.endsWith('.ico')) return 'image/x-icon'
  return 'application/octet-stream'
}

const files = walk(dist).map((full) => {
  const buf = readFileSync(full)
  const path = relative(dist, full).replaceAll('\\', '/')
  return {
    path,
    size: buf.length,
    contentType: contentType(path),
    hash: createHash('sha256').update(buf).digest('hex'),
    buf,
  }
})

const createRes = await fetch('https://here.now/api/v1/publish', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'EMBER workout prototype',
    description: 'Clickable UI prototype for the EMBER workout app',
    spaMode: true,
    files: files.map(({ path, size, contentType, hash }) => ({ path, size, contentType, hash })),
  }),
})
const createText = await createRes.text()
if (!createRes.ok) {
  console.error('publish create failed', createRes.status, createText)
  process.exit(1)
}
const created = JSON.parse(createText)
console.log(
  'CREATE',
  JSON.stringify(
    {
      siteUrl: created.siteUrl,
      claimUrl: created.claimUrl,
      slug: created.slug,
      finalizeUrl: created.finalizeUrl || created.upload?.finalizeUrl,
      uploadCount: created.upload?.uploads?.length,
      keys: Object.keys(created),
    },
    null,
    2,
  ),
)

const uploads = created.upload?.uploads ?? created.uploads ?? []
const byPath = Object.fromEntries(files.map((f) => [f.path, f]))

for (const item of uploads) {
  const file = byPath[item.path]
  if (!file) {
    console.error('missing local file for upload', item.path)
    continue
  }
  const url = item.url || item.uploadUrl || item.putUrl
  const put = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.contentType },
    body: file.buf,
  })
  if (!put.ok) {
    console.error('PUT failed', item.path, put.status, await put.text())
    process.exit(1)
  }
  console.log('uploaded', item.path)
}

const finalizeUrl = created.finalizeUrl || created.upload?.finalizeUrl
const versionId = created.versionId || created.upload?.versionId
const claimToken = created.claimToken || created.upload?.claimToken
const finalizeBody = { versionId }
if (claimToken) finalizeBody.claimToken = claimToken

const fin = await fetch(finalizeUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(finalizeBody),
})
const finText = await fin.text()
console.log('FINALIZE', fin.status, finText.slice(0, 4000))
if (created.claimUrl) console.log('CLAIM_URL', created.claimUrl)
if (created.siteUrl) console.log('SITE_URL', created.siteUrl)
