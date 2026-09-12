import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Toast } from '../components/ui/Toast'
import { useStore } from '../lib/store'
import { BottomNav } from './BottomNav'

export function Shell() {
  const { signedIn, onboarded, toast, clearToast } = useStore()
  const location = useLocation()

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(clearToast, 2800)
    return () => window.clearTimeout(id)
  }, [toast, clearToast])

  if (!signedIn) return <Navigate to="/" replace />
  if (!onboarded) return <Navigate to="/onboarding" replace />

  const hideNav = location.pathname.startsWith('/train/go')

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[430px] border-line md:border-x">
      <Outlet />
      {hideNav ? null : <BottomNav />}
      <Toast message={toast} onDismiss={clearToast} />
    </div>
  )
}
