import { useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { Stat } from '../../components/ui/Stat'
import { dateLabel, isoDate } from '../../lib/dates'
import { fmt } from '../../lib/format'
import { useStore } from '../../lib/store-hooks'
import { LogCalendar, WhoSwatch } from '../home/MonthCalendar'

export function PartnerPage() {
  const {
    partner,
    partnerLinked,
    streak,
    steps,
    calories,
    history,
    pairCode,
    pairState,
    pendingPeer,
    syncError,
    startPairing,
    acceptPair,
    declinePair,
    refreshPartner,
    remindPartner,
  } = useStore()
  const [selected, setSelected] = useState(isoDate)
  const syncedNote = useMemo(() => syncedLabel(partner.lastSyncedAt), [partner.lastSyncedAt])

  if (!partnerLinked || !partner.name) {
    return (
      <div className="px-5 pb-28 pt-8">
        <p className="text-[11px] uppercase tracking-[0.28em] text-orange">Partner</p>
        <h1 className="mt-2 text-3xl font-semibold leading-none tracking-tight">Share the flame</h1>
        <p className="mt-1.5 text-sm text-muted">
          Pair up to see each other's streaks, sessions and stats.
        </p>

        <div className="mt-6 rounded-xl border border-line bg-surface px-4 py-4">
          <LogCalendar
            yourLogs={[]}
            partnerLogs={[]}
            selected={isoDate()}
            insight={
              <div className="border border-dashed border-line px-4 py-3">
                <p className="text-xs text-muted">Today</p>
                <p className="mt-1 text-sm text-muted">Your sessions and theirs show up here</p>
              </div>
            }
          />
        </div>

        <div className="mt-8 rounded-xl border border-line bg-surface px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-orange">Pair with your partner</p>
          <p className="mt-1.5 text-sm text-muted">Enter their code, or share yours below.</p>

          {pendingPeer ? (
            <div className="mt-4 rounded-lg border border-orange/30 bg-orange/5 px-3 py-3">
              <p className="text-sm font-medium">{pendingPeer.name} · {pendingPeer.fingerprint}</p>
              <p className="mt-0.5 text-xs text-muted">
                {pendingPeer.email || 'A fellow member'} wants to pair with you
              </p>
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

          {syncError ? <div className="mt-3 text-xs text-red">{syncError}</div> : null}

          {pairCode ? (
            <div className="mt-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Your code</p>
              <div className="mt-1.5 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
                <p className="min-w-0 truncate tabular text-2xl leading-none tracking-[0.3em]">{pairCode}</p>
                <Button size="sm" variant="line" onClick={() => navigator.clipboard?.writeText(pairCode)}>
                  Copy
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <PairInput onPair={(code) => startPairing(code)} />
          </div>
        </div>
      </div>
    )
  }

  const yours = history[0]
  const partnerLast = splitLast(partner.lastWorkout)

  return (
    <div className="px-5 pb-28 pt-8">
      <p className="text-[11px] uppercase tracking-[0.28em] text-orange">Partner</p>
      <h1 className="mt-2 text-3xl font-semibold leading-none tracking-tight">You vs {partner.name}</h1>

      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.22em] text-orange">Live stats</p>
          <p className="mt-0.5 truncate text-xs text-muted">{syncedNote}</p>
        </div>
        <Button size="sm" variant="line" onClick={() => refreshPartner()}>
          Refresh
        </Button>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        <div className="grid grid-cols-2 gap-px bg-line">
          <CompareCol
            title="You"
            who="you"
            streak={streak}
            steps={steps}
            calories={calories}
            last={yours?.rest ? 'Rest day' : yours?.name ?? 'No session yet'}
            lastWhen={yours?.dateLabel}
          />
          <CompareCol
            title={partner.name}
            who="partner"
            streak={partner.streak}
            steps={partner.steps}
            calories={partner.calories}
            last={partnerLast.name}
            lastWhen={partnerLast.when}
          />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-line bg-surface px-4 py-4">
        <LogCalendar
          yourLogs={history}
          partnerLogs={partner.history}
          selected={selected}
          onSelect={setSelected}
          onRemindPartner={() => remindPartner()}
        />
      </div>
    </div>
  )
}

function PairInput({ onPair }: { onPair: (code: string) => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  return (
    <div className="space-y-3">
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

function syncedLabel(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return 'Not synced yet'
  const diff = Date.now() - new Date(lastSyncedAt).getTime()
  const seconds = Math.max(0, Math.floor(diff / 1000))
  if (seconds < 5) return 'Synced just now'
  if (seconds < 60) return `Synced ${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `Synced ${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Synced ${hours}h ago`
  return `Last synced ${dateLabel(lastSyncedAt.slice(0, 10))}`
}

function splitLast(value: string): { name: string; when?: string } {
  const [name, when] = value.split(' · ')
  return { name, when }
}

function CompareCol({
  title,
  who,
  streak,
  steps,
  calories,
  last,
  lastWhen,
}: {
  title: string
  who: 'you' | 'partner'
  streak: number
  steps: number
  calories: number
  last: string
  lastWhen?: string
}) {
  return (
    <div className="bg-bg px-4 py-5">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-muted">
        <WhoSwatch who={who} />
        {title}
      </p>
      <div className="mt-5 space-y-5">
        <Stat label="Streak" value={String(streak)} />
        <Stat label="Steps" value={fmt(steps)} />
        <Stat label="Kcal" value={fmt(calories)} />
        <Stat label="Last" value={last} wrap hint={lastWhen} />
      </div>
    </div>
  )
}