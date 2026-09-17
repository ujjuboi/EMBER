import { registerExercises, type Exercise } from '../exercises'

// The 1,324-exercise dataset is trimmed (en-only) and loaded lazily — it is a
// separate async chunk and never part of the main bundle. Prefer the local
// cache: call ensureLibrary() from TrainPage/onboarding so later renders (and
// offline sessions) hit the in-memory registry synchronously.
let promise: Promise<Exercise[]> | null = null
let loaded = false

export function isLibraryLoaded(): boolean {
  return loaded
}

export function ensureLibrary(): Promise<Exercise[]> {
  if (!promise) {
    promise = import('./exercises.json')
      .then((mod) => {
        const exercises = mod.default as Exercise[]
        registerExercises(exercises)
        loaded = true
        return exercises
      })
      .catch((err) => {
        console.error('[library] Failed to load supplemental exercise library:', err)
        loaded = false
        // Do not cache a rejected import forever (a transient HMR/dev failure
        // would otherwise leave the library empty for the whole session).
        promise = null
        return []
      })
  }
  return promise
}