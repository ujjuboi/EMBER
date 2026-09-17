import { Button } from './Button'

function grouped(code: string): string {
  return code.match(/.{1,4}/g)?.join(' ') ?? code
}

type Props = {
  code: string
  onDone: () => void
}

export function RecoveryCodeModal({ code, onDone }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
      <button
        type="button"
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        aria-label="Close"
        onClick={onDone}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-title"
        className="relative z-10 w-full max-w-[430px] rounded-xl border border-line bg-bg px-5 py-6"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] uppercase tracking-[0.28em] text-orange">Recovery code</p>
        <h2 id="recovery-title" className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
          Save this code
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          It's shown once and never stored in plain text. If you ever forget your password, this code plus your
          email restores access. Store it somewhere safe — losing it means a restore can't touch your password.
        </p>
        <div className="mt-4 rounded-lg border border-line bg-surface px-3 py-4 text-center text-2xl font-semibold tracking-[0.3em]">
          {grouped(code)}
        </div>
        <Button block className="mt-6" onClick={onDone}>
          I saved it
        </Button>
      </div>
    </div>
  )
}