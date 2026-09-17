import type { ReactNode } from 'react'
import { Button } from './Button'

type Props = {
  title: string
  body: string
  confirm: string
  onCancel: () => void
  onConfirm: () => void
  children?: ReactNode
}

export function Confirm({ title, body, confirm, onCancel, onConfirm, children }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
      <button
        type="button"
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        aria-label="Close"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative z-10 w-full max-w-[430px] rounded-xl border border-line bg-bg px-5 py-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-3xl font-semibold leading-tight tracking-tight">
          {title}
        </h2>
        <p className="mt-1.5 text-sm text-muted">{body}</p>
        {children}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="line" block onClick={onCancel}>
            Cancel
          </Button>
          <Button block onClick={onConfirm}>
            {confirm}
          </Button>
        </div>
      </div>
    </div>
  )
}
