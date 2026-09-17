// Pose-QA harness (dev-only) — tools/pose-qa/PoseQAPage.tsx
//
// Renders every generated pose loop (src/coach/poses/generated/*.json) through
// the real CoachAvatar with playback, then lets you hand-correct joints per
// frame and copy the corrected JSON back over the file.
//
//   npm run dev   →  http://127.0.0.1:5173/pose-qa

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CoachAvatar } from '../../src/coach/CoachAvatar'
import { updateGeneratedPose, type GeneratedPoseFile, type Pose } from '../../src/coach/poses'
import { Chip } from '../../src/components/ui/Chip'

const generatedImports = import.meta.glob<GeneratedPoseFile>('../src/coach/poses/generated/*.json')

const JOINTS = [
  'head',
  'neck',
  'lShoulder',
  'rShoulder',
  'lElbow',
  'rElbow',
  'lWrist',
  'rWrist',
  'hip',
  'lHip',
  'rHip',
  'lKnee',
  'rKnee',
  'lAnkle',
  'rAnkle',
] as const

type LoadedPose = { id: string; file: GeneratedPoseFile }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function JointInput({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: number
  max: number
  onChange: (next: number) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-6 text-right text-[10px] text-muted">{label}</span>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={() => onChange(value - 1)}
        className="flex h-6 w-6 items-center justify-center rounded border border-line text-muted hover:border-orange hover:text-orange"
      >
        −
      </button>
      <input
        type="number"
        value={value}
        aria-label={`${label} value`}
        onChange={(event) => onChange(clamp(Number(event.target.value) || 0, 0, max))}
        className="h-6 w-11 rounded border border-line bg-surface text-center text-xs tabular text-ink focus:border-orange [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => onChange(value + 1)}
        className="flex h-6 w-6 items-center justify-center rounded border border-line text-muted hover:border-orange hover:text-orange"
      >
        +
      </button>
    </div>
  )
}

export function PoseQAPage() {
  const [all, setAll] = useState<LoadedPose[] | null>(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all(
      Object.entries(generatedImports).map(async ([key, load]) => {
        const file = await load()
        return { id: file.id ?? key.split('/').pop()?.replace('.json', '') ?? key, file }
      }),
    ).then((entries) => {
      if (!alive) return
      entries.sort((a, b) => a.file.name.localeCompare(b.file.name))
      setAll(entries)
      if (entries.length > 0) setSelectedId(entries[0].id)
    })
    return () => {
      alive = false
    }
  }, [])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!all) return []
    if (!term) return all
    return all.filter(
      (entry) =>
        entry.file.name.toLowerCase().includes(term) || entry.id.toLowerCase().includes(term),
    )
  }, [all, query])

  const selected = all?.find((entry) => entry.id === selectedId) ?? null

  return (
    <div className="bg-bg px-5 pb-16 pt-6">
      <p className="text-[11px] uppercase tracking-[0.28em] text-orange">Pose QA · dev tool</p>
      <h1 className="mt-2 text-2xl font-semibold leading-none tracking-tight">Generated loops</h1>
      <p className="mt-1.5 text-sm text-muted">
        {all?.length ?? 0} extracted. Click a card to correct joints, then copy the JSON into
        src/coach/poses/generated/{'<id>'}.json.
      </p>

      {all === null ? (
        <p className="mt-8 border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
          Loading generated poses… (hint: run <span className="text-ink">npm run poses --core</span>{' '}
          first)
        </p>
      ) : all.length === 0 ? (
        <p className="mt-8 border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
          No generated poses found. Run{' '}
          <span className="text-ink">npm run poses --core</span> to extract loops from the dataset
          GIFs.
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-line px-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or id"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted/50 focus:outline-none"
            />
          </div>

          {selected ? (
            <PoseEditor
              key={selected.id}
              entry={selected}
              onClose={() => {
                setSelectedId(null)
                setQuery('')
              }}
            />
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {filtered.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedId(entry.id)}
                  className="rounded-lg border border-line bg-surface px-3 py-3 text-left hover:border-orange/50"
                >
                  <CoachAvatar exerciseId={entry.id} playing className="h-20 w-full" />
                  <p className="mt-1 truncate text-xs leading-tight">{entry.file.name}</p>
                  <p className="mt-0.5 truncate text-[10px] text-muted">
                    {entry.id} · {entry.file.frames.length}f · {entry.file.loopMs}ms
                  </p>
                </button>
              ))}
              {filtered.length === 0 ? (
                <p className="col-span-2 border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
                  No pose matches “{query}”.
                </p>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PoseEditor({
  entry,
  onClose,
}: {
  entry: LoadedPose
  onClose: () => void
}) {
  const { id, file } = entry
  const [frames, setFrames] = useState<Pose[]>(() => file.frames.map((frame) => ({ ...frame })))
  const [loopMs, setLoopMs] = useState(file.loopMs)
  const [playing, setPlaying] = useState(true)
  const [frameIndex, setFrameIndex] = useState(0)
  const [copied, setCopied] = useState(false)

  const frame = frames[frameIndex] ?? frames[0]

  const setJoint = (joint: (typeof JOINTS)[number], coord: 'x' | 'y') => (value: number) => {
    setFrames((current) =>
      current.map((pose, index) =>
        index === frameIndex ? { ...pose, [joint]: { ...pose[joint], [coord]: value } } : pose,
      ),
    )
  }

  useEffect(() => {
    updateGeneratedPose(id, { ...file, loopMs, frames })
  }, [id, file, loopMs, frames])

  const copy = async () => {
    const payload: GeneratedPoseFile = { id, name: file.name, view: file.view, loopMs, frames }
    await navigator.clipboard.writeText(JSON.stringify(payload))
    setCopied(true)
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setCopied(false), 1400)
    }
  }

  return (
    <div className="mt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{file.name}</p>
          <p className="mt-0.5 text-[11px] text-muted">
            {id} · {frame?.view ?? file.view} view · {frames.length} frames
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-sm text-muted hover:text-orange"
        >
          Back to list
        </button>
      </div>

      <div className="mt-3 rounded-lg border border-line bg-surface p-4">
        <CoachAvatar
          exerciseId={id}
          playing={playing}
          phase="work"
          className="mx-auto h-56 w-full max-w-[220px]"
        />
        <div className="mt-2 flex items-center gap-2">
          <Chip active={playing} onClick={() => setPlaying((value) => !value)}>
            {playing ? 'Playing' : 'Paused'}
          </Chip>
          <label className="ml-auto flex items-center gap-2 text-[11px] text-muted">
            Loop ms
            <input
              type="number"
              value={loopMs}
              onChange={(event) => setLoopMs(Math.max(200, Number(event.target.value) || 0))}
              className="h-7 w-16 rounded border border-line bg-bg px-1 text-center text-xs tabular text-ink focus:border-orange [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </label>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Frame</p>
        <Chip
          active={frameIndex === 0}
          onClick={() => setFrameIndex(0)}
        >
          1
        </Chip>
        {frames.slice(1).map((_, index) => (
          <Chip key={index} active={frameIndex === index + 1} onClick={() => setFrameIndex(index + 1)}>
            {index + 2}
          </Chip>
        ))}
      </div>

      <div className="mt-3 space-y-1.5 rounded-lg border border-line bg-surface px-3 py-3">
        {JOINTS.map((joint) => {
          const point = frame?.[joint]
          if (!point) return null
          return (
            <div key={joint} className="flex items-center justify-between gap-2">
              <span className="min-w-[72px] text-[11px] text-muted">{joint}</span>
              <JointInput label="x" value={Math.round(point.x)} max={200} onChange={setJoint(joint, 'x')} />
              <JointInput label="y" value={Math.round(point.y)} max={260} onChange={setJoint(joint, 'y')} />
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => void copy()}
        className="mt-3 block w-full rounded-lg bg-orange py-3 text-sm font-semibold text-bg"
      >
        {copied ? 'Copied — paste over the file' : `Copy corrected JSON (${id}.json)`}
      </button>
      <p className="mt-2 px-1 text-right text-[10px] text-muted">
        Replace <span className="text-ink">src/coach/poses/generated/{id}.json</span> with the
        clipboard, then re-run <span className="text-ink">npm run poses</span> only if you want
        regeneration to keep it.
      </p>
      <div className="mt-3 border-t border-line pt-3">
        <Link to="/train" className="text-xs text-muted underline decoration-muted/40 hover:text-ink">
          Back to Train
        </Link>
      </div>
    </div>
  )
}