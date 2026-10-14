import { useEffect } from 'react'
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from '../../data/privacy'
import { Button } from './Button'

type Props = {
  onClose: () => void
}

export function PrivacyDialog({ onClose }: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
      <button
        type="button"
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-title"
        className="relative z-10 max-h-[85dvh] w-full max-w-[430px] overflow-y-auto rounded-xl border border-line bg-bg px-5 py-6"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] uppercase tracking-[0.28em] text-orange">Privacy</p>
        <h2 id="privacy-title" className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
          Privacy policy
        </h2>
        <p className="mt-1.5 text-xs text-muted">Last updated: {PRIVACY_UPDATED}</p>
        <div className="mt-5 space-y-4">
          {PRIVACY_SECTIONS.map((section) => (
            <div key={section.heading}>
              <h3 className="text-[11px] uppercase tracking-[0.22em] text-orange">{section.heading}</h3>
              <p className="mt-1.5 text-sm text-muted">{section.body}</p>
            </div>
          ))}
        </div>
        <Button block className="mt-6" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}
