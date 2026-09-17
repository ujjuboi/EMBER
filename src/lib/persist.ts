// Persistent-storage helper: requests that the browser treat this origin's
// web storage (IndexedDB, which backs the SQLite store on web) as persistent,
// so it is not evicted by Safari's 7-day non-use rule or low-storage pressure.
//
// Feature-detected and fire-and-forget: never blocks startup, no-op where the
// Storage API is unavailable (including future Capacitor native builds).

function storageAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'storage' in navigator
}

let _pending: Promise<boolean> | null = null
let _result: boolean | null = null

export async function isStoragePersisted(): Promise<boolean> {
  if (!storageAvailable()) return false
  try {
    return await navigator.storage.persisted()
  } catch (err) {
    console.error('[persist] persisted() failed:', err)
    return false
  }
}

// persist() is called at most once per session (Safari's permission prompt
// only fires once), regardless of how many callers / triggers request it.
export async function requestPersistentStorage(): Promise<boolean> {
  if (!storageAvailable()) return false
  if (_result !== null) return _result
  if (!_pending) {
    _pending = (async () => {
      try {
        _result = await navigator.storage.persist()
        if (!_result) {
          const persisted = await navigator.storage.persisted()
          _result = persisted
        }
      } catch (err) {
        console.error('[persist] persist() failed:', err)
        _result = false
      }
      return _result
    })()
  }
  return _pending
}