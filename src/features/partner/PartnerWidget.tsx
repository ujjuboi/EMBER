import { ChevronRight, Copy } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { isoDate } from '../../lib/dates'
import { useStore } from '../../lib/store-hooks'
import { WhoSwatch } from '../home/MonthCalendar'

export function PartnerWidget() {
  const navigate = useNavigate()
  const {
    partner,
    partnerLinked,
    streak,
    history,
    pairCode,
    pairState,
    pendingPeer,
    syncError,
    startPairing,
    acceptPair,
    declinePair,
    remindPartner,
    showToast,
  } = useStore()

  const today = isoDate()
  const youToday = history.find((item) => item.date === today)
  const partnerToday = partner.history.find((item) => item.date === today)
  const canRemind = partnerLinked && !partnerToday

  if (partnerLinked && partner.name) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <button
          type="button"
          onClick={() => navigate('/partner')}
          className={`w-full px-4 pt-4 text-left ${canRemind ? 'pb-3' : 'pb-4'}`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.22em] text-orange">Partner</p>
            <ChevronRight size={16} strokeWidth={1.6} className="text-muted" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Side title="You" who="you" streak={streak} today={todayLine(youToday, 'you')} />
            <Side title={partner.name} who="partner" streak={partner.streak} today={todayLine(partnerToday, 'partner')} />
          </div>
        </button>
        {canRemind ? (
          <div className="px-4 pb-4">
            <Button block size="sm" variant="line" onClick={() => remindPartner()}>
              Send reminder
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-orange">Partner code</p>
      <p className="mt-1.5 text-sm text-muted">Pair up to see each other's streaks, sessions and stats.</p>

      {pendingPeer ? (
        <div className="mt-4 rounded-lg border border-orange/30 bg-orange/5 px-3 py-3">
          <p className="text-sm font-medium">{pendingPeer.name} · {pendingPeer.fingerprint}</p>
          <p className="mt-0.5 text-xs text-muted">wants to pair with you</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="sm" onClick={() => acceptPair()}>
              Accept
            </Button>
            <Button size="sm" variant="line" onClick={() => declinePair()}>
              Decline
            </Button>
          </div>
        </div>
      ) : null}

      {pairState === 'searching' ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted">
          <span className="inline-block h-2 w-2 rounded-full bg-orange animate-pulse" />
          Waiting for a partner…
        </div>
      ) : null}

      {syncError ? (
        <div className="mt-3 text-xs text-red">{syncError}</div>
      ) : null}

      {pairCode ? (
        <div className="mt-4 rounded-lg border border-line px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Your code</p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <p className="min-w-0 truncate tabular text-3xl leading-none tracking-[0.3em]">{pairCode}</p>
            <Button
              className="mt-0.5 shrink-0"
              size="sm"
              variant="line"
              onClick={() => {
                navigator.clipboard?.writeText(pairCode).then(
                  () => showToast('Code copied'),
                  () => showToast('Could not copy'),
                )
              }}
            >
              <Copy size={14} />
            </Button>
          </div>
        </div>
      ) : null}

      {pairState !== 'linked' ? <PairCodeInput onPair={(code) => startPairing(code)} /> : null}
    </div>
  )
}

function PairCodeInput({ onPair }: { onPair: (code: string) => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  return (
    <div className="mt-4 space-y-3">
      <Field
        value={code}
        onChange={(value) => {
          setCode(value)
          if (error) setError('')
        }}
        placeholder="Enter partner code"
        error={error}
      />
      <Button
        block
        size="sm"
        variant="line"
        onClick={() => {
          const trimmed = code.trim().toUpperCase()
          if (trimmed.length !== 6) {
            setError('Enter a 6-character code')
            return
          }
          setError('')
          onPair(trimmed)
        }}
      >
        Pair
      </Button>
    </div>
  )
}

function todayLine(log: { name: string; durationMin: number; sessions?: number; rest?: boolean } | undefined, who: 'you' | 'partner') {
  if (!log) return who === 'partner' ? "Hasn't trained yet" : 'No session yet'
  if (log.rest) return 'Rest day'
  if (log.sessions && log.sessions > 1) return `${log.sessions} sessions · ${log.durationMin}m`
  return `${log.name} · ${log.durationMin}m`
}

function Side({
  title,
  who,
  streak,
  today,
}: {
  title: string
  who: 'you' | 'partner'
  streak: number
  today: string
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-muted">
        <WhoSwatch who={who} />
        {title}
      </p>
      <p className="mt-1.5 tabular text-sm">Streak {streak}</p>
      <p className="mt-1 text-sm text-muted">{today}</p>
    </div>
  )
}
