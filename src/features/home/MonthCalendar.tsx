import { Calendar, ChevronLeft, ChevronRight, Heart, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { isRestLog, isWorkoutLog } from '../../lib/activity'
import {
  inTimeline,
  isoDate,
  monthGrid,
  monthLabel,
  moveTimelineEdge,
  parseIso,
  shiftMonth,
  thisWeekTimeline,
  timelineCells,
  timelineHeading,
  WEEKDAYS,
  type Timeline,
} from '../../lib/dates'
import type { HistoryItem, PartnerActivity } from '../../lib/types'

type SharedProps = {
  yourLogs: HistoryItem[]
  partnerLogs: PartnerActivity[]
  selected: string
  onSelect?: (iso: string) => void
  insight?: ReactNode
  action?: ReactNode
  emptyDetail?: ReactNode
  meta?: ReactNode
  onRemindPartner?: () => void
}

export function WhoSwatch({ who }: { who: 'you' | 'partner' }) {
  return who === 'you' ? (
    <span className="h-3 w-3 shrink-0 rounded-sm bg-orange/20" />
  ) : (
    <Heart size={10} strokeWidth={1.6} fill="currentColor" className="shrink-0 text-orange" />
  )
}

export function LogCalendar({
  yourLogs,
  partnerLogs,
  selected,
  onSelect,
  insight,
  action,
  emptyDetail,
  meta,
  onRemindPartner,
}: SharedProps) {
  const [timeline, setTimeline] = useState<Timeline>(thisWeekTimeline)
  const [open, setOpen] = useState(false)
  const interactive = Boolean(onSelect)
  const today = isoDate()
  const yourByDate = new Map(yourLogs.map((item) => [item.date, item]))
  const partnerByDate = new Map(partnerLogs.map((item) => [item.date, item]))
  const yours = yourByDate.get(selected)
  const theirs = partnerByDate.get(selected)
  const selectedLabel = parseIso(selected).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  const apply = (next: Timeline) => {
    setTimeline(next)
    const inRange = selected >= next.start && selected <= next.end
    onSelect?.(inRange ? selected : next.start)
    setOpen(false)
  }

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[11px] uppercase tracking-[0.22em] text-muted"
      >
        <Calendar size={14} strokeWidth={1.6} />
        {timelineHeading(timeline)}
        <ChevronRight size={14} strokeWidth={1.6} className={`-ml-1 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      <DayGrid
        cells={timelineCells(timeline.start, timeline.end)}
        selected={selected}
        today={today}
        yourByDate={yourByDate}
        partnerByDate={partnerByDate}
        interactive={interactive}
        onSelect={onSelect}
      />

      {insight !== undefined ? (
        <div className="mt-4">{insight}</div>
      ) : (
        <div className="mt-4 border border-line px-4 py-3">
          <p className="text-xs text-muted">{selectedLabel}</p>
          {yours ? (
            isRestLog(yours) ? (
              <p className="mt-1 text-sm">You · Rest day</p>
            ) : (
              <p className="mt-1 text-sm">
                You · {yours.sessions && yours.sessions > 1 ? `${yours.sessions} sessions` : yours.name} ·{' '}
                {yours.durationMin}m · {yours.calories} kcal
              </p>
            )
          ) : emptyDetail ? (
            emptyDetail
          ) : (
            <p className="mt-1 text-sm text-muted">No session logged</p>
          )}
          {partnerLogs.length === 0 ? null : isRestLog(theirs) ? (
            <p className="mt-1 text-sm text-muted">Partner rest day</p>
          ) : theirs ? (
            <p className="mt-1 text-sm text-muted">
              Partner · {theirs.name} · {theirs.durationMin}m
            </p>
          ) : (
            <div className="mt-1">
              <p className="text-sm text-muted">Partner hasn't trained yet</p>
              {selected === today && onRemindPartner ? (
                <Button className="mt-3" size="sm" variant="line" onClick={onRemindPartner}>
                  Send reminder
                </Button>
              ) : null}
            </div>
          )}
          {meta ? <div className="mt-3">{meta}</div> : null}
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      )}

      {open ? (
        <TimelinePicker timeline={timeline} onClose={() => setOpen(false)} onApply={apply} />
      ) : null}
    </section>
  )
}

function DayGrid({
  cells,
  selected,
  today,
  yourByDate,
  partnerByDate,
  interactive,
  onSelect,
}: {
  cells: (string | null)[]
  selected: string
  today: string
  yourByDate: Map<string, HistoryItem>
  partnerByDate: Map<string, PartnerActivity>
  interactive: boolean
  onSelect?: (iso: string) => void
}) {
  return (
    <>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-[0.14em] text-muted">
        {WEEKDAYS.map((label, i) => (
          <span key={`${label}-${i}`}>{label}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((iso, i) => {
          if (!iso) return <span key={`empty-${i}`} />
          const day = parseIso(iso).getDate()
          const you = isWorkoutLog(yourByDate.get(iso))
          const partner = isWorkoutLog(partnerByDate.get(iso))
          const partnerRest = isRestLog(partnerByDate.get(iso))
          const isSelected = iso === selected
          const isToday = iso === today
          const className = interactive
            ? `relative flex h-10 items-center justify-center rounded-lg text-sm tabular ${
                isSelected ? 'border border-orange text-orange' : 'border border-transparent text-ink'
              } ${you ? 'bg-orange/20' : ''} ${isToday && !isSelected ? 'text-orange' : ''}`
            : `relative flex h-10 items-center justify-center rounded-lg border border-dashed text-sm tabular ${
                isToday ? 'border-orange/40 text-orange' : 'border-line text-muted/50'
              }`

          if (!onSelect) {
            return (
              <div key={iso} className={className}>
                {day}
              </div>
            )
          }

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(iso)}
              className={className}
              aria-label={`${iso}${you ? ', your workout' : ''}${partner ? ', partner workout' : ''}${partnerRest ? ', partner rest day' : ''}`}
            >
              {day}
              {partner ? (
                <Heart
                  size={8}
                  strokeWidth={1.6}
                  fill="currentColor"
                  className="absolute bottom-0.5 text-orange"
                />
              ) : null}
            </button>
          )
        })}
      </div>
    </>
  )
}

function TimelinePicker({
  timeline,
  onClose,
  onApply,
}: {
  timeline: Timeline
  onClose: () => void
  onApply: (timeline: Timeline) => void
}) {
  const [draft, setDraft] = useState(timeline)
  const [year, setYear] = useState(parseIso(timeline.start).getFullYear())
  const [month, setMonth] = useState(parseIso(timeline.start).getMonth())
  const cells = monthGrid(year, month)
  const today = isoDate()

  const shift = (delta: number) => {
    const next = shiftMonth(year, month, delta)
    setYear(next.year)
    setMonth(next.month)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-[430px] rounded-t-lg border-t border-line bg-bg px-5 pb-8 pt-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.22em] text-orange">Select timeline</p>
          <button
            type="button"
            aria-label="Close timeline"
            onClick={onClose}
            className="-mr-2 flex h-10 w-10 items-center justify-center text-muted hover:text-orange"
          >
            <X size={18} strokeWidth={1.6} />
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => shift(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-muted hover:border-orange hover:text-orange"
          >
            <ChevronLeft size={16} strokeWidth={1.6} />
          </button>
          <p className="text-sm">{monthLabel(year, month)}</p>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => shift(1)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-muted hover:border-orange hover:text-orange"
          >
            <ChevronRight size={16} strokeWidth={1.6} />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-[0.14em] text-muted">
          {WEEKDAYS.map((label, i) => (
            <span key={`${label}-${i}`}>{label}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((iso, i) => {
            if (!iso) return <span key={`empty-${i}`} />
            const inRange = inTimeline(iso, draft)
            const isStart = iso === draft.start
            const isEnd = iso === draft.end
            const isToday = iso === today
            return (
              <button
                key={iso}
                type="button"
                aria-label={
                  isStart ? `Start ${parseIso(iso).getDate()}` : isEnd ? `End ${parseIso(iso).getDate()}` : undefined
                }
                aria-pressed={inRange}
                onClick={() => setDraft(moveTimelineEdge(draft, iso))}
                className={`flex h-10 items-center justify-center rounded-lg text-sm tabular ${
                  isStart || isEnd
                    ? 'bg-orange text-bg'
                    : inRange
                      ? 'bg-orange/20 text-orange'
                      : 'border border-transparent text-ink'
                } ${isToday && !inRange ? 'text-orange' : ''}`}
              >
                {parseIso(iso).getDate()}
              </button>
            )
          })}
        </div>

        <Button className="mt-5" block onClick={() => onApply(draft)}>
          Proceed
        </Button>
      </div>
    </div>
  )
}

export function WeekStrip(props: SharedProps) {
  return <LogCalendar {...props} />
}

export function MonthCalendar(props: SharedProps) {
  return <LogCalendar {...props} />
}
