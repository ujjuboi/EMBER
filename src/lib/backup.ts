import type { EmberBackup } from './types'

export const BACKUP_SCHEMA = 4

export function backupFilename(): string {
  const now = new Date()
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return `ember-backup-${stamp}.json`
}

export function serializeBackup(backup: EmberBackup): string {
  return JSON.stringify(backup, null, 2)
}

export function parseBackup(text: string): EmberBackup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file isn’t valid JSON.')
  }
  const backup = data as Partial<EmberBackup>
  if (backup?.app !== 'ember') {
    throw new Error('That file isn’t an EMBER backup.')
  }
  if (backup.schema !== BACKUP_SCHEMA) {
    throw new Error(`This backup is for an incompatible app version (schema ${backup.schema ?? 'unknown'}).`)
  }
  if (typeof backup?.account?.email !== 'string') {
    throw new Error('That backup is missing its account email.')
  }
  return backup as EmberBackup
}

export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsText(file)
  })
}

export async function shareOrDownload(json: string, filename: string): Promise<'shared' | 'downloaded' | 'copied'> {
  const file = new File([json], filename, { type: 'application/json' })
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'EMBER backup' })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Export cancelled.')
      }
      // Fall through to download/copy if sharing is unavailable.
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(json)
      return 'copied'
    } catch {
      // Fall through to link download below.
    }
  }
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  return 'downloaded'
}