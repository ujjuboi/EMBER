export function isRestLog(item?: { rest?: boolean } | null): boolean {
  return Boolean(item?.rest)
}

export function isWorkoutLog(item?: { rest?: boolean } | null): boolean {
  return Boolean(item) && !item?.rest
}
