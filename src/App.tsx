import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './app/Shell'
import { AuthPage } from './features/auth/AuthPage'
import { OnboardingPage } from './features/auth/OnboardingPage'
import { ResetPasswordPage } from './features/auth/ResetPasswordPage'
import { HomePage } from './features/home/HomePage'
import { PartnerPage } from './features/partner/PartnerPage'
import { YouPage } from './features/profile/YouPage'
import { SessionPage } from './features/workout/SessionPage'
import { TrainPage } from './features/workout/TrainPage'
{/* Dev-only pose-QA harness (tools/pose-qa/PoseQAPage.tsx) — kept out of the
    production bundle via ESM: the import only exists when the route renders,
    and the route only exists in dev. See plans/dataset-ingest.md Phase 2. */}
import { PoseQAPage } from '../tools/pose-qa/PoseQAPage'
import { StoreProvider } from './lib/store'
import { useStore } from './lib/store-hooks'

function AppGate({ children }: { children: ReactNode }) {
  const { ready, initError, retryInit } = useStore()

  if (ready) return <>{children}</>

  return (
    <div className="bg-bg mx-auto flex min-h-dvh w-full max-w-[430px] items-center justify-center px-6">
      {initError ? (
        <div className="text-center">
          <p className="text-ink text-base font-semibold">Couldn't open your workout data</p>
          <p className="text-muted mt-1 text-sm">{initError}</p>
          <button
            onClick={retryInit}
            className="bg-orange text-bg mt-5 rounded-full px-6 py-2.5 text-sm font-semibold"
          >
            Try again
          </button>
        </div>
      ) : (
        <p className="text-muted text-sm">Loading…</p>
      )}
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <AppGate>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<AuthPage />} />
            <Route path="/forgot" element={<ResetPasswordPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route element={<Shell />}>
              <Route path="/home" element={<HomePage />} />
              <Route path="/train" element={<TrainPage />} />
              <Route path="/train/go" element={<SessionPage />} />
              <Route path="/partner" element={<PartnerPage />} />
              <Route path="/you" element={<YouPage />} />
              {import.meta.env.DEV ? (
                <Route path="/tools/pose-qa" element={<PoseQAPage />} />
              ) : null}
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AppGate>
    </StoreProvider>
  )
}