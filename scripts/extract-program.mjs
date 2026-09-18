import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as cheerio from 'cheerio'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(root, 'plans', 'extracted')
const MUSCLE_AND_STRENGTH = 'muscleandstrength.com'
const MUSCLE_AND_FITNESS = 'muscleandfitness.com'

const PART_WORDS = [
  [/\bshoulders?\b/, 'arms'],
  [/\bforearms?\b/, 'arms'],
  [/\bbiceps?\b/, 'arms'],
  [/\btriceps?\b/, 'arms'],
  [/\barms?\b/, 'arms'],
  [/\bchest\b/, 'chest'],
  [/\bpecs?\b/, 'chest'],
  [/\blower\s+back\b/, 'back'],
  [/\bback\b/, 'back'],
  [/\blats?\b/, 'back'],
  [/\babs\b/, 'core'],
  [/\babdominals?\b/, 'core'],
  [/\bwaist\b/, 'core'],
  [/\bcore\b/, 'core'],
  [/\bhamstrings?\b/, 'legs'],
  [/\bquads?\b/, 'legs'],
  [/\bglutes?\b/, 'legs'],
  [/\bcalf\b|\bcalves\b/, 'legs'],
  [/\blegs?\b/, 'legs'],
  [/\blower\s+body\b/, 'legs'],
  [/\bfull[- ]?body\b/, 'legs'],
  [/\btotal[- ]?body\b/, 'legs'],
]

const GOAL_MAP = {
  'build muscle': 'muscle',
  'gain muscle': 'muscle',
  'muscle building': 'muscle',
  'lose fat': 'fatloss',
  'fat loss': 'fatloss',
  'weight loss': 'fatloss',
  'cut': 'fatloss',
  'strength': 'strength',
  'powerlifting': 'strength',
  'strongman': 'strength',
  'endurance': 'endurance',
  'cardio': 'endurance',
  'stamina': 'endurance',
  'mobility': 'mobility',
  'flexibility': 'mobility',
  'general fitness': 'general',
  'sports performance': 'general',
  'hybrid athlete': 'general',
}

const METADATA_KEYS = {
  'main goal': 'mainGoal',
  'workout type': 'workoutType',
  'training level': 'trainingLevel',
  'program duration': 'programDuration',
  'days per week': 'daysPerWeek',
  'time per workout': 'timePerWorkout',
  'equipment required': 'equipment',
  'target gender': 'targetGender',
  'recommended supps': 'recommendedSupps',
}

let $ = null

const tag = (name) => (name ?? '').replace(/\s+/g, ' ').trim()

function leadInt(value) {
  const m = String(value).trim().match(/^\d+/)
  return m ? parseInt(m[0], 10) : null
}

function focusFromText(text) {
  const lower = ` ${String(text).toLowerCase()} `
  const found = []
  for (const [re, part] of PART_WORDS) {
    if (re.test(lower) && !found.includes(part)) found.push(part)
  }
  return found
}

function goalFromMainGoal(value) {
  const key = String(value ?? '').toLowerCase()
  for (const [needle, goal] of Object.entries(GOAL_MAP)) {
    if (key.includes(needle)) return goal
  }
  return 'general'
}

function samePartSet(a, b) {
  if (a.length !== b.length) return false
  return a.every((part) => b.includes(part))
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function extractMetadata() {
  const summary = {}
  let pdfUrl = null
  $('.node-stats-block ul > li').each((_, li) => {
    const $li = $(li)
    const label = tag($li.children('span.row-label').first().text()).toLowerCase()
    if (!label) return
    const key = METADATA_KEYS[label]
    if (!key) return
    const fieldItem = tag($li.find('.field-items .field-item').first().text())
    const listText = tag($li.find('.field-type-list-text').first().text())
    const raw = tag(rawLiText($li))
    const value = fieldItem || listText || raw || null
    if (key === 'equipment') {
      summary[key] = String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    } else if (key === 'recommendedSupps') {
      const supps = []
      $li.find('.supplement a').each((_, a) => supps.push(tag($(a).text())))
      summary[key] = supps.length
        ? supps
        : String(value)
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
    } else {
      summary[key] = value
    }
  })
  const download = $('.node-stats-block a.btn[download]').first().attr('href')
  if (download) pdfUrl = download
  return { summary, pdfUrl }
}

function rawLiText($li) {
  const clone = $li.clone()
  clone.children().remove()
  return clone.text()
}

function extractGroups() {
  const body = $('.field-name-body').first()
  if (!body.length) return []
  const groups = []
  let group = null
  let lastH4 = null

  body.find('h2, h4, table, ul').each((_, el) => {
    const $el = $(el)
    const elTag = el.tagName?.toLowerCase()
    if (elTag === 'h2') {
      group = { label: tag($el.text()), sections: [], dayLines: [] }
      groups.push(group)
    } else if (elTag === 'h4') {
      lastH4 = tag($el.text())
    } else if (elTag === 'table') {
      if (!group) {
        group = { label: 'Workout', sections: [], dayLines: [] }
        groups.push(group)
      }
      group.sections.push({ label: lastH4 || group.label, table: $el })
      lastH4 = null
    } else if (elTag === 'ul' && group && group.dayLines.length === 0) {
      const lines = []
      $el.find('li').each((_, li) => {
        const $li = $(li)
        const strong = tag($li.find('strong').first().text())
        const m = strong.match(/^day\s+(\d+)/i)
        if (!m) return
        lines.push({
          day: parseInt(m[1], 10),
          parts: focusFromText($li.text().replace(strong, '')),
        })
      })
      if (lines.length) group.dayLines = lines
    }
  })

  return groups.filter((item) => item.sections.length > 0)
}

// muscleandfitness.com is a WordPress gallery: each .ami-gallery-item carries a
// .gallery-item__caption whose body-part slides end in a plain <table> (header
// row is <td><strong>Exercise/Sets/Reps</strong>). There is no stat block, so
// the summary is inferred best-effort, including training days from the
// article's own "double-split" outline where present.
function extractMuscleAndFitnessSummary() {
  const body = $('.post-body').first()
  const lower = tag($('.post-body, .list-gallery_wrapper').text() ?? '').toLowerCase()
  const summary = {
    mainGoal: 'Build Muscle',
    workoutType: 'Split',
    trainingLevel: lower.includes('advanced') ? 'Advanced' : null,
    programDuration: null,
    daysPerWeek: null,
    timePerWorkout: null,
    equipment: null,
    targetGender: null,
    recommendedSupps: null,
  }
  const trainingDays = new Set()
  body.find('h4').each((_, el) => {
    const $h4 = $(el)
    const m = tag($h4.text()).match(/^days?\s+([\d,\s]+)$/i)
    if (!m) return
    const nums = m[1]
      .split(/[,\s]+/)
      .map((n) => parseInt(n, 10))
      .filter(Number.isInteger)
    if (!nums.length) return
    const isRest = tag($h4.next('p').first().text()).toLowerCase().includes('rest')
    if (isRest) return
    nums.forEach((n) => trainingDays.add(n))
  })
  if (trainingDays.size) summary.daysPerWeek = String(trainingDays.size)
  return summary
}

function extractMuscleAndFitnessGroups(pageTitle) {
  const sections = []
  $('.list-gallery_wrapper .ami-gallery-item').each((_, item) => {
    const $item = $(item)
    const caption = $item.find('.gallery-item__caption').first()
    if (!caption.length) return
    let lastHeading = null
    caption.children().each((_, el) => {
      const $el = $(el)
      const elTag = el.tagName?.toLowerCase()
      if (elTag === 'h2') {
        const text = tag($el.text())
        if (!/training tips?/i.test(text)) lastHeading = text
      } else if (elTag === 'table') {
        sections.push({ label: lastHeading || 'Workout', table: $el })
        lastHeading = null
      }
    })
  })
  return sections.length ? [{ label: pageTitle, sections, dayLines: [] }] : []
}

function rowToSet(row, index, bodyParts, goal, idPrefix = 'ms') {
  const cells = row.find('td')
  if (cells.length < 2) return null
  const name = tag(cells.eq(0).text())
  if (!name) return null
  const href = cells.eq(0).find('a[href]').first().attr('href') ?? null
  const rawSets = tag(cells.eq(1).text())
  const rawReps = tag(cells.eq(2).text())

  const baseId = `${idPrefix}-${slugify(name) || 'exercise'}`
  const id = index === 0 ? baseId : `${baseId}-${index + 1}`
  const numSets = leadInt(rawSets) ?? 3
  const minutes = rawReps.match(/(\d+)\s*(?:min|minute|minutes)/i)
  const timed = Boolean(minutes)
  const kind = timed ? 'timed' : 'reps'
  const seconds = timed ? parseInt(minutes[1], 10) * 60 : undefined
  const reps = timed ? undefined : leadInt(rawReps) ?? undefined

  const exercise = {
    id,
    name,
    kind,
    ...(reps != null ? { defaultReps: reps } : {}),
    ...(seconds != null ? { defaultSeconds: seconds } : {}),
    defaultSets: numSets,
    met: 5.0,
    cue: 'As written in the source program',
    restSeconds: 60,
    bodyParts,
    goals: [goal],
    isCustom: true,
  }

  const planned = {
    uid: id,
    exercise,
    sets: numSets,
    ...(reps != null ? { reps } : {}),
    ...(seconds != null ? { seconds } : {}),
  }

  return { sourceName: name, sourceHref: href, rawSets, rawReps, planned }
}

function buildTemplate(dayLines, days) {
  if (!dayLines.length) {
    return days.map((day) => ({ focus: day.focus, pinned: day.exercises.map((e) => e.planned) }))
  }
  const template = []
  for (let day = 1; day <= 7; day++) {
    const line = dayLines.find((item) => item.day === day)
    if (!line) continue
    if (line.parts.length === 0) {
      template.push({ focus: [] })
      continue
    }
    const match = days.find((item) => samePartSet(item.focus, line.parts))
    template.push(
      match
        ? { focus: line.parts, pinned: match.exercises.map((e) => e.planned) }
        : { focus: line.parts }
    )
  }
  if (!template.length) {
    return days.map((day) => ({ focus: day.focus, pinned: day.exercises.map((e) => e.planned) }))
  }
  return template
}

function isExerciseHeaderRow($row) {
  return tag($row.find('td').first().text()).toLowerCase() === 'exercise'
}

// Return the data <tr>s of a workout table, skipping header rows and (for the
// gallery format) structural rows that carry no sets/reps prescription.
function rowsToExtract($table, { skipBlank = false } = {}) {
  return $table
    .find('tr')
    .toArray()
    .filter((tr) => {
      const $tr = $(tr)
      if ($tr.find('th').length > 0) return false
      if (isExerciseHeaderRow($tr)) return false
      const cells = $tr.find('td')
      if (cells.length < 2) return false
      if (!tag(cells.eq(0).text())) return false
      if (skipBlank && !tag(cells.eq(1).text()) && !tag(cells.eq(2).text())) return false
      return true
    })
}

function buildPrograms(pageTitle, groups, summary, options = {}) {
  const { idPrefix = 'ms', skipBlank = false } = options
  const goal = goalFromMainGoal(summary.mainGoal)
  return groups.map((group, index) => {
    const groupFocus = focusFromText(group.label)
    const days = group.sections.map((section) => {
      const fromLabel = focusFromText(section.label)
      const focus = fromLabel.length ? fromLabel : groupFocus
      return {
        label: section.label,
        focus,
        exercises: rowsToExtract(section.table, { skipBlank }).map((tr, rowIndex) =>
          rowToSet($(tr), rowIndex, focus, goal, idPrefix)
        ),
      }
    })
    const variants = groups.length > 1 ? `-${index + 1}` : ''
    return {
      id: `${slugify(pageTitle) || 'program'}${variants}`,
      name: group.label || pageTitle,
      goal,
      days,
      template: buildTemplate(group.dayLines, days),
    }
  })
}

function summarize(programs) {
  const totalExercises = programs.reduce(
    (sum, program) => sum + program.days.reduce((s, day) => s + day.exercises.length, 0),
    0
  )
  console.log(`Programs: ${programs.length}`)
  for (const program of programs) {
    console.log(`  ${program.name} (goal: ${program.goal})`)
    for (const day of program.days) {
      console.log(
        `    ${day.label} [${day.focus.join(', ') || 'unspecified'}] — ${day.exercises.length} exercises`
      )
    }
  }
  console.log(`Total exercises extracted: ${totalExercises}`)
}

const CLOUDFLARE_MARKERS = ['just a moment', 'enable javascript and cookies', 'cf-mitigated']

function isCloudflareChallenge(text, headers) {
  const lower = text.slice(0, 20000).toLowerCase()
  if (headers.get('cf-mitigated')) return true
  return CLOUDFLARE_MARKERS.some((marker) => lower.includes(marker))
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

// muscleandstrength.com sits behind a Cloudflare challenge that reliably drops
// plain HTTP clients; fall back to the Wayback Machine hold of the page.
async function fetchHtml(url) {
  let html
  let challenged = false
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS })
    html = await res.text()
    if (res.ok && !isCloudflareChallenge(html, res.headers)) return html
    challenged = true
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  } catch (err) {
    if (!challenged) throw err
  }

  console.warn('Live fetch blocked by Cloudflare — falling back to the Wayback Machine')

  function isCandidate(text) {
    return isWorkoutPageHtml(text) && text.includes('<table')
  }

  for (const year of ['2025', '2024', '2023', '2022', '2021', '2020', '2019']) {
    try {
      const res = await fetch(`https://web.archive.org/web/${year}id_/${url}`, {
        headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'] },
        redirect: 'follow',
      })
      if (!res.ok) continue
      const text = await res.text()
      if (isCandidate(text)) {
        html = text
        break
      }
    } catch {
      // keep trying older snapshots
    }
  }
  if (!html) throw new Error('No accessible copy found (live fetch blocked and no Wayback snapshot)')
  return html
}

const IMAGE_TIMEOUT_MS = 20000

function extractImageUrlsBing(html) {
  return [...html.matchAll(/murl&quot;:&quot;([^&"]+?)&quot;/g)]
    .map((m) => m[1])
    .filter(
      (u) =>
        /\.(jpe?g|png|webp)([?#]|$)/i.test(u) &&
        !/bing\.net|microsoft/i.test(u) &&
        !/\d+px\./i.test(u)
    )
}

async function searchBing(query) {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&qft=+filterui:imagesize-large`
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  })
  if (!res.ok) return []
  return extractImageUrlsBing(await res.text())
}

async function searchOpenverse(query) {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=5&size=large`
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'] },
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  })
  if (!res.ok) return []
  const data = await res.json()
  return (data.results ?? []).map((r) => r.url).filter(Boolean)
}

async function searchWikimedia(query) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
    `${query} filetype:bitmap`
  )}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|mime&iiurlwidth=1280&format=json`
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'] },
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  })
  if (!res.ok) return []
  const data = await res.json()
  return Object.values(data.query?.pages ?? {})
    .map((p) => p.imageinfo?.[0]?.thumburl)
    .filter((u) => u && /\.(jpe?g|png|webp)/i.test(u))
}

// Google Images renders results with JS only (no murl in the HTML shell), so
// banner search uses Bing Images (server-rendered) with keyless fallbacks.
async function findBannerUrls(query) {
  let urls = await searchBing(query)
  if (urls.length) return { engine: 'bing', urls }
  urls = await searchOpenverse(query)
  if (urls.length) return { engine: 'openverse', urls }
  urls = await searchWikimedia(query)
  if (urls.length) return { engine: 'wikimedia', urls }
  return { engine: null, urls: [] }
}

function extFromContentType(contentType, url) {
  const mime = String(contentType ?? '').split(';')[0].trim().toLowerCase()
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  const ext = new URL(url).pathname.split('.').pop()?.toLowerCase()
  if (ext === 'jpeg') return 'jpg'
  if (ext && ['jpg', 'png', 'webp', 'gif'].includes(ext)) return ext
  return null
}

async function downloadImage(imageUrl, destBasePath) {
  const res = await fetch(imageUrl, {
    headers: BROWSER_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  })
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 5120) return null
  const ext = extFromContentType(res.headers.get('content-type'), res.url)
  if (!ext) return null
  writeFileSync(`${destBasePath}.${ext}`, buf)
  return ext
}

async function installBanner(query, slug) {
  const { engine, urls } = await findBannerUrls(query)
  if (!engine || !urls.length) {
    console.warn('No banner image found for', JSON.stringify(query))
    return null
  }
  const base = join(OUT_DIR, `${slug}.banner`)
  for (const url of urls) {
    try {
      const ext = await downloadImage(url, base)
      if (ext) return { query, engine, url, file: `${slug}.banner.${ext}` }
    } catch {
      // try the next candidate
    }
  }
  console.warn(`Banner candidates unreachable for ${JSON.stringify(query)}`)
  return null
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildPreviewHtml({ title, bannerFile, subject, sourceUrl }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} — preview</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #050505; color: #f5f5f5; font-family: "Space Grotesk", system-ui, sans-serif; }
  .frame { width: min(860px, 92vw); padding: 20px; background: #0d0d0d; border: 1px solid #1f1f1f; border-radius: 14px; }
  h1 { font-size: 18px; margin: 0 0 14px; font-weight: 700; }
  .stage { position: relative; width: 100%; aspect-ratio: 16 / 7; background: #111; overflow: hidden; border-radius: 10px; }
  .slide { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; animation: slidecycle 10s ease-in-out infinite; will-change: transform, opacity; }
  .slide img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .caption { position: absolute; left: 16px; bottom: 14px; margin: 0; padding: 6px 12px; background: rgba(5,5,5,.72); border: 1px solid #1f1f1f; border-radius: 999px; font-size: 13px; color: #8a8a8a; }
  .meta { margin-top: 12px; font-size: 12.5px; color: #8a8a8a; display: flex; gap: 14px; flex-wrap: wrap; justify-content: space-between; }
  .meta a { color: #FF5A1F; text-decoration: none; }
  @keyframes slidecycle {
    0%   { transform: translateX(110%); opacity: 0; }
    10%  { transform: translateX(0); opacity: 1; }
    82%  { transform: translateX(0); opacity: 1; }
    92%  { transform: translateX(-110%); opacity: 0; }
    100% { transform: translateX(-110%); opacity: 0; }
  }
  .stage:hover .slide { animation-play-state: paused; }
  .slide.gone { display: none; }
</style>
</head>
<body>
  <div class="frame">
    <h1>${escapeHtml(title)}</h1>
    <div class="stage">
      <div class="slide"><img src="${escapeHtml(bannerFile)}" alt="${escapeHtml(subject)}" onerror="this.closest('.slide').classList.add('gone')" /></div>
      <p class="caption">${escapeHtml(subject || '')}</p>
    </div>
    <div class="meta">
      <span>banner: ${escapeHtml(bannerFile)}</span>
      <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">source here</a>
    </div>
  </div>
</body>
</html>
`
}

function isWorkoutPageHtml(text) {
  return (
    text.includes('node-stats-block') ||
    (text.includes('list-gallery_wrapper') && text.includes('ami-gallery-item'))
  )
}

export function parseHtml(html, url) {
  $ = cheerio.load(html)

  const title = tag($('h1').first().text()) || new URL(url).pathname.split('/').filter(Boolean).pop()
  if (!title) throw new Error('Could not find an <h1> title — is this a workout page?')

  let site
  let summary
  let pdfUrl = null
  let groups
  let buildOptions = {}
  if ($('.node-stats-block').length) {
    site = MUSCLE_AND_STRENGTH
    const metadata = extractMetadata()
    summary = metadata.summary
    pdfUrl = metadata.pdfUrl
    groups = extractGroups()
  } else if ($('.list-gallery_wrapper .ami-gallery-item .gallery-item__caption table').length) {
    site = MUSCLE_AND_FITNESS
    summary = extractMuscleAndFitnessSummary()
    groups = extractMuscleAndFitnessGroups(title)
    buildOptions = { idPrefix: 'mfs', skipBlank: true }
  } else {
    throw new Error(
      'Unsupported page structure — expected a muscleandstrength.com stat block (.node-stats-block) ' +
        'or a muscleandfitness.com workout gallery (.gallery-item__caption table)'
    )
  }
  if (!Object.keys(summary).length) {
    throw new Error('No workout summary fields extracted — unsupported page structure')
  }
  if (!groups.length) {
    throw new Error('No exercise tables found — unsupported page structure')
  }

  const programs = buildPrograms(title, groups, summary, buildOptions)
  const author =
    tag(
      ($('.author-meta a[href^="/authors/"]').first().text() ||
        $('.post-author__name a').first().text()) || ''
    ) || null
  const publishedAt = $('meta[property="article:published_time"]').attr('content') ?? null

  const slug = slugify(title) || 'workout-plan'
  return {
    app: 'ember',
    kind: 'workout-program',
    schema: 1,
    source: {
      url,
      site,
      title,
      author,
      publishedAt,
      pdfUrl,
      fetchedAt: new Date().toISOString(),
    },
    summary,
    programs,
    slug,
  }
}

function parseArgs(argv) {
  const args = { url: null, subject: null, banner: true }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--no-banner') args.banner = false
    else if (arg === '--url') args.url = argv[++i]
    else if (arg.startsWith('--url=')) args.url = arg.slice('--url='.length)
    else if (arg === '--subject') args.subject = argv[++i]
    else if (arg.startsWith('--subject=')) args.subject = arg.slice('--subject='.length)
    else if (!args.url) args.url = arg
  }
  return args
}

async function main() {
  const { url, subject, banner: wantBanner } = parseArgs(process.argv.slice(2))
  if (!url || !/^https?:\/\//i.test(url)) {
    console.error('Usage: npm run plan -- <workout-page-url> [--subject "Name"] [--no-banner]')
    process.exit(1)
  }

  const html = await fetchHtml(url)
  const { slug, ...doc } = parseHtml(html, url)
  const programs = doc.programs

  if (wantBanner) {
    const banner = await installBanner(subject || doc.source.title || slug, slug)
    doc.source.banner = banner
    if (banner) {
      writeFileSync(
        join(OUT_DIR, `${slug}.preview.html`),
        buildPreviewHtml({
          title: doc.source.title,
          bannerFile: banner.file,
          subject: banner.query,
          sourceUrl: doc.source.url,
        })
      )
      console.log(`Banner installed: ${banner.file} (via ${banner.engine})`)
      console.log(`Preview (slide in/out): ${slug}.preview.html`)
    }
  } else {
    doc.source.banner = null
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const outPath = join(OUT_DIR, `${slug}.json`)
  writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`)
  console.log(`Wrote ${outPath}`)
  summarize(programs)
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntry) {
  main().catch((err) => {
    console.error(err.message ?? err)
    process.exit(1)
  })
}