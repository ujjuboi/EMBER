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
  await CapacitorSQLite.initWebStore()
}

initSqlite().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})