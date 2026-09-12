export function estimateSetSeconds(opts: {
  reps?: number
  seconds?: number
}): number {
  if (opts.seconds != null) return opts.seconds
  return (opts.reps ?? 10) * 2.5
}

export function estimateKcal(opts: {
  met: number
  weightKg: number
  reps?: number
  seconds?: number
  sets?: number
}): number {
  const sets = opts.sets ?? 1
  const perSetSec = estimateSetSeconds(opts)
  const hours = (perSetSec * sets) / 3600
  return Math.max(1, Math.round(opts.met * opts.weightKg * hours))
}
