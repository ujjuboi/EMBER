import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite } from '@capacitor-community/sqlite'
import { defineCustomElements } from 'jeep-sqlite/loader'
import App from './App.tsx'
import './index.css'

async function initSqlite(): Promise<void> {
  if (Capacitor.getPlatform() !== 'web') return
  await defineCustomElements(window)
  // Early web-store init so jeep-sqlite is ready before mount.
  // initDb re-calls it (idempotent) for non-web entry paths.
  await CapacitorSQLite.initWebStore()
}

initSqlite().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})