import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const README_PATH = resolve(process.cwd(), 'README.md')
const SECTION = '## File map'

const repo = process.env.GITHUB_REPOSITORY
const prNumber = process.env.PR_NUMBER
const token = process.env.GH_TOKEN

if (!repo || !prNumber || !token) {
  throw new Error('GITHUB_REPOSITORY, PR_NUMBER and GH_TOKEN are required')
}

async function fetchPrFiles() {
  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const files = []
  let page = 1
  for (;;) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`,
      { headers }
    )
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
    const batch = await res.json()
    files.push(...batch)
    const link = res.headers.get('link') ?? ''
    if (!/rel="next"/.test(link) || batch.length === 0) break
    page += 1
  }
  return files
}

// Which table a file belongs to, the key used in its first cell, and how many
// columns its row has. Returns null for untracked paths (non-src files, etc).
function classify(path) {
  if (
    path === 'src/main.tsx' ||
    path === 'src/index.css' ||
    path === 'src/App.tsx' ||
    path.startsWith('src/app/')
  ) {
    return { group: 'appChrome', key: path, cols: 2 }
  }
  if (path.startsWith('src/components/ui/')) {
    return { group: 'primitives', key: path.split('/').pop(), cols: 2 }
  }
  if (path.startsWith('src/coach/')) {
    return { group: 'coach', key: path, cols: 2 }
  }
  if (path.startsWith('src/features/')) {
    return { group: 'screens', key: path.slice('src/features/'.length), cols: 3 }
  }
  if (path.startsWith('src/lib/') || path.startsWith('src/data/')) {
    return { group: 'domain', key: path.slice('src/'.length), cols: 2 }
  }
  return null
}

const GROUP_FOR = {
  appChrome: 'App chrome',
  primitives: 'Primitives',
  screens: 'Screens',
  coach: 'Coach',
  domain: 'Domain',
}

const readme = readFileSync(README_PATH, 'utf8')
const lines = readme.split('\n')

const start = lines.findIndex((l) => l.trim() === SECTION)
if (start === -1) {
  console.log('File map section not found; nothing to update')
  process.exit(0)
}
let end = lines.length
for (let i = start + 1; i < end; i++) {
  if (/^## /.test(lines[i])) {
    end = i
    break
  }
}

const region = lines.slice(start, end)

function groupRange(name) {
  let head = -1
  for (let i = 0; i < region.length; i++) {
    if (region[i].startsWith('### ') && region[i].includes(GROUP_FOR[name])) {
      head = i
      break
    }
  }
  if (head === -1) return null
  const isSectionOver = (i) => i >= region.length || /^### /.test(region[i])
  const header = region.findIndex((_, i) => i > head && /^\| File \|/.test(region[i]))
  const sep = region.findIndex((_, i) => i > header && /^\| ---/.test(region[i]))
  const data = []
  for (let i = sep + 1; i < region.length && !isSectionOver(i); i++) {
    if (/^\| `/.test(region[i])) data.push(i)
  }
  return { head, header, sep, data }
}

function parseCells(line) {
  return line
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

function rowLine(key, cols, tail) {
  const cells = [`\`${key}\``, ...(tail ?? Array(cols - 1).fill('—'))]
  return `| ${cells.join(' | ')} |`
}

function removeRow(name, key) {
  const range = groupRange(name)
  if (!range) return null
  for (let i = range.data.length - 1; i >= 0; i--) {
    const line = region[range.data[i]]
    const first = parseCells(line)[0]
    if (first === `\`${key}\``) {
      const cells = parseCells(line)
      region.splice(range.data[i], 1)
      return cells
    }
  }
  return null
}

function addRow(name, key, cols, tail) {
  const range = groupRange(name)
  if (!range) throw new Error(`No "${GROUP_FOR[name]}" table in the file map`)
  for (const i of range.data) {
    if (parseCells(region[i])[0] === `\`${key}\``) return false
  }
  const idx = range.data.length ? range.data[range.data.length - 1] + 1 : range.sep + 1
  region.splice(idx, 0, rowLine(key, cols, tail))
  return true
}

const files = await fetchPrFiles()
let changed = 0

for (const f of files) {
  if (f.status === 'removed') {
    const c = classify(f.filename)
    if (c && removeRow(c.group, c.key)) changed++
    continue
  }
  if (f.status === 'renamed') {
    const oldC = f.previous_filename ? classify(f.previous_filename) : null
    let tail = null
    if (oldC) {
      const cells = removeRow(oldC.group, oldC.key)
      if (cells) {
        changed++
        tail = cells.slice(1)
      }
    }
    const c = classify(f.filename)
    if (c) {
      if (c.group !== oldC?.group) tail = null
      if (addRow(c.group, c.key, c.cols, tail)) changed++
    }
    continue
  }
  if (f.status === 'added') {
    const c = classify(f.filename)
    if (c && addRow(c.group, c.key, c.cols, null)) changed++
  }
}

if (changed === 0) {
  console.log('No file map changes for this PR')
  process.exit(0)
}

lines.splice(start, end - start, ...region)
writeFileSync(README_PATH, lines.join('\n'), 'utf8')
console.log(`Updated file map for PR #${prNumber} (${changed} rows touched)`)