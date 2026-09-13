import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { isoDate } from '../../lib/dates'
import { useStore } from '../../lib/store-hooks'
import { WhoSwatch } from '../home/MonthCalendar'

export const INVITE_CODE = 'EMBER9'

export function PairPanel() {
  const { linkPartner, showToast } = useStore()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-orange">Partner code</p>
      <p className="mt-2 text-sm text-muted">Pair profiles to track stats together.</p>

      <div className="mt-4 space-y-4">
        <Field value={code} onChange={setCode} placeholder="Enter code" error={error} />
        <Button
          block
          onClick={() => {
            const result = linkPartner(code)
            if (!result.ok) {
              setError(result.error ?? 'Invalid code')
              return
            }
            setError('')
            showToast('Prototype — linking comes later')
          }}
        >
          Pair
        </Button>
      </div>

      <div className="mt-8 rounded-lg border border-line px-4 py-5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Your code</p>
        <div className="mt-2 flex items-start justify-between gap-3">
          <p className="min-w-0 truncate tabular text-3xl leading-none tracking-[0.3em]">{INVITE_CODE}</p>
          <Button
            className="mt-0.5 shrink-0"
            size="sm"
            variant="line"
            onClick={() => showToast('Prototype — linking comes later')}
          >
            Share
          </Button>
        </div>
      </div>
    </div>
  )
}

export function PartnerWidget() {
  const navigate = useNavigate()
  const { partner, partnerLinked, streak, history, showToast } = useStore()
  const today = isoDate()
  const youToday = history.find((item) => item.date === today)
  const raeToday = partner.history.find((item) => item.date === today)
  const canRemind = !raeToday

  if (!partnerLinked) {
    return <HomePairTeaser />
  }

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
          <Side title={partner.name} who="partner" streak={partner.streak} today={todayLine(raeToday, 'partner')} />
        </div>
      </button>
      {canRemind ? (
        <div className="px-4 pb-4">
          <Button
            block
            size="sm"
            variant="line"
            onClick={() => showToast(`Reminder sent to ${partner.name} — keep the streak going`)}
          >
            Send reminder
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function todayLine(log: { name: string; durationMin: number; sessions?: number; rest?: boolean } | undefined, who: 'you' | 'partner') {
  if (!log) return who === 'partner' ? "Hasn't trained yet" : 'No session yet'
  if (log.rest) return 'Rest day'
  if (log.sessions && log.sessions > 1) return `${log.sessions} sessions · ${log.durationMin}m`
  return `${log.name} · ${log.durationMin}m`
}

function HomePairTeaser() {
  const { showToast } = useStore()

  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-orange">Partner code</p>
      <p className="mt-1.5 text-sm text-muted">Pair profiles to track stats together.</p>
      <p className="mt-5 text-[11px] uppercase tracking-[0.22em] text-muted">Your code</p>
      <div className="mt-2 flex items-start justify-between gap-3">
        <p className="min-w-0 truncate tabular text-3xl leading-none tracking-[0.3em]">{INVITE_CODE}</p>
        <Button
          className="mt-0.5 shrink-0"
          size="sm"
          variant="line"
          onClick={() => showToast('Prototype — linking comes later')}
        >
          Share
        </Button>
      </div>
    </div>
  )
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
