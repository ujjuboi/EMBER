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
  loadKg?: number
  reps?: number
  seconds?: number
  sets?: number
}): number {
  const sets = opts.sets ?? 1
  const perSetSec = estimateSetSeconds(opts)
  const hours = (perSetSec * sets) / 3600
  const load = opts.loadKg ?? 0
  const met = opts.weightKg > 0 ? opts.met * (1 + 0.28 * (load / opts.weightKg)) : opts.met
  return Math.max(1, Math.round(met * opts.weightKg * hours))
}
