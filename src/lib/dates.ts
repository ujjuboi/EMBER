import { pad2 } from './format'

export function isoDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function parseIso(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

export function shiftIso(iso: string, days: number): string {
  const next = parseIso(iso)
  next.setDate(next.getDate() + days)
  return isoDate(next)
}

export function daysAgo(days: number): string {
  return shiftIso(isoDate(), -days)
}

export function dateLabel(iso: string): string {
  const today = isoDate()
  if (iso === today) return 'Today'
  if (iso === shiftIso(today, -1)) return 'Yesterday'
  return parseIso(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function weekIsoDates(around = isoDate()): string[] {
  const d = parseIso(around)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start)
    day.setDate(start.getDate() + i)
    return isoDate(day)
  })
}

export function shiftMonth(year: number, month: number, delta: number) {
  const next = new Date(year, month + delta, 1)
  return { year: next.getFullYear(), month: next.getMonth() }
}

export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startPad = first.getDay()
  const cells: (string | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => isoDate(new Date(year, month, i + 1))),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function monthShort(month: number): string {
  return new Date(2000, month, 1).toLocaleDateString('en-US', { month: 'short' })
}

export const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export type Timeline = { start: string; end: string }

export function thisWeekTimeline(): Timeline {
  const days = weekIsoDates()
  return { start: days[0], end: days[6] }
}

export function inclusiveDays(start: string, end: string): number {
  return Math.round((parseIso(end).getTime() - parseIso(start).getTime()) / 86_400_000) + 1
}

export function clampTimeline(start: string, end: string): Timeline {
  return start <= end ? { start, end } : { start: end, end: start }
}

export function moveTimelineEdge(timeline: Timeline, iso: string): Timeline {
  if (timeline.start === timeline.end) return clampTimeline(timeline.start, iso)
  const start = parseIso(timeline.start).getTime()
  const end = parseIso(timeline.end).getTime()
  const tap = parseIso(iso).getTime()
  const moveStart = tap <= start || Math.abs(tap - start) < Math.abs(tap - end)
  return moveStart ? clampTimeline(iso, timeline.end) : clampTimeline(timeline.start, iso)
}

export function timelineCells(start: string, end: string): (string | null)[] {
  const cells: (string | null)[] = Array.from({ length: parseIso(start).getDay() }, () => null)
  let cursor = start
  while (cursor <= end) {
    cells.push(cursor)
    cursor = shiftIso(cursor, 1)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function inTimeline(iso: string, timeline: Timeline): boolean {
  return iso >= timeline.start && iso <= timeline.end
}

export function timelineHeading(timeline: Timeline): string {
  const week = thisWeekTimeline()
  if (timeline.start === week.start && timeline.end === week.end) return 'This week'
  const start = parseIso(timeline.start)
  const from = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (timeline.start === timeline.end) return from
  const end = parseIso(timeline.end)
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  const to = sameMonth ? String(end.getDate()) : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${from}–${to}`
}

export function partnersSinceLabel(iso: string): string {
  const start = parseIso(iso)
  const today = parseIso(isoDate())
  const days = Math.round((today.getTime() - start.getTime()) / 86_400_000)
  if (days <= 0) return 'Partners since today'
  if (days === 1) return 'Partners since yesterday'
  if (days < 14) return `Partners since ${days} days`
  const weeks = Math.floor(days / 7)
  if (days < 60) return `Partners since ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`
  return `Partners since ${start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
}

export function nextMidnightMs(): number {
  const nextMidnight = new Date()
  nextMidnight.setHours(24, 0, 0, 0)
  return nextMidnight.getTime()
}

export function streakDeadlineMs(trainedToday: boolean): number {
  return nextMidnightMs() + (trainedToday ? 86_400_000 : 0)
}

export function streakFromDates(dates: string[]): number {
  const set = new Set(dates)
  const today = isoDate()
  let cursor = set.has(today) ? today : shiftIso(today, -1)
  if (!set.has(cursor)) return 0
  let count = 0
  while (set.has(cursor)) {
    count += 1
    cursor = shiftIso(cursor, -1)
  }
  return count
}
