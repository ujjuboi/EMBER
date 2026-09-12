export function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

export function pad2(n: number): string {
  return String(Math.max(0, n)).padStart(2, '0')
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${pad2(m)}:${pad2(s)}`
}

export function formatHms(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`
}

export function formatSpan(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  if (hours >= 2) return `${hours} hours`
  if (hours === 1) return minutes >= 10 ? `1 hour ${minutes} min` : '1 hour'
  if (minutes >= 2) return `${minutes} min`
  if (minutes === 1) return '1 min'
  return 'moments'
}
