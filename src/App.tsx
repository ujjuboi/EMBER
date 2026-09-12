import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './app/Shell'
import { AuthPage } from './features/auth/AuthPage'
import { OnboardingPage } from './features/auth/OnboardingPage'
import { HomePage } from './features/home/HomePage'
import { PartnerPage } from './features/partner/PartnerPage'
import { YouPage } from './features/profile/YouPage'
import { SessionPage } from './features/workout/SessionPage'
import { TrainPage } from './features/workout/TrainPage'
import { StoreProvider } from './lib/store'

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AuthPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route element={<Shell />}>
            <Route path="/home" element={<HomePage />} />
            <Route path="/train" element={<TrainPage />} />
            <Route path="/train/go" element={<SessionPage />} />
            <Route path="/partner" element={<PartnerPage />} />
            <Route path="/you" element={<YouPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  )
}
