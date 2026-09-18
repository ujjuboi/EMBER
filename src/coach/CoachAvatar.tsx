import { useEffect, useId, useRef, useState } from 'react'
import { clampPose, durationFor, posesFor, sampleLoop, type Pose } from './poses'

type Props = {
  exerciseId: string
  playing?: boolean
  phase?: 'work' | 'rest' | 'celebrate'
  className?: string
  hideFloor?: boolean
}

function Limb({ a, b }: { a: { x: number; y: number }; b: { x: number; y: number } }) {
  return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
}

function JointDot({ p, dim }: { p: { x: number; y: number }; dim?: boolean }) {
  return <circle cx={p.x} cy={p.y} r={dim ? 1.8 : 2.5} fill="#FF5A1F" opacity={dim ? 0.45 : 1} />
}

export function CoachAvatar({
  exerciseId,
  playing = true,
  phase = 'work',
  className = '',
  hideFloor = false,
}: Props) {
  const glowId = useId().replace(/:/g, '')
  const [pose, setPose] = useState<Pose>(() =>
    clampPose(posesFor(exerciseId, phase)[0] ?? sampleLoop(posesFor('idle', 'work'), 0)),
  )
  const startRef = useRef(0)

  useEffect(() => {
    startRef.current = performance.now()
  }, [exerciseId, phase])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = (now: number) => {
      const ms = durationFor(exerciseId, phase)
      const t = (now - startRef.current) / ms
      setPose(sampleLoop(posesFor(exerciseId, phase), t))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [exerciseId, phase, playing])

  const p = pose
  const side = p.view === 'side'

  return (
    <svg viewBox="0 0 200 260" className={`overflow-visible ${className}`} role="img" aria-label="Exercise coach">
      <defs>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <line x1="36" y1="246" x2="164" y2="246" stroke="#1F1F1F" strokeWidth="2" opacity={hideFloor ? 0 : 1} />
      <g
        fill="none"
        stroke="#FF5A1F"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${glowId})`}
      >
        <g strokeWidth={side ? 4.6 : 5} opacity={side ? 0.62 : 0.8}>
          <Limb a={p.lShoulder} b={p.lElbow} />
          <Limb a={p.lElbow} b={p.lWrist} />
          <Limb a={p.lHip} b={p.lKnee} />
          <Limb a={p.lKnee} b={p.lAnkle} />
        </g>
        <g strokeWidth="5.5" opacity="1">
          <circle cx={p.head.x} cy={p.head.y} r="14" />
          <Limb a={p.head} b={p.neck} />
          <Limb a={p.lShoulder} b={p.rShoulder} />
          <Limb a={p.neck} b={p.hip} />
          <Limb a={p.lHip} b={p.rHip} />
          <Limb a={p.rShoulder} b={p.rElbow} />
          <Limb a={p.rElbow} b={p.rWrist} />
          <Limb a={p.rHip} b={p.rKnee} />
          <Limb a={p.rKnee} b={p.rAnkle} />
        </g>
      </g>
      <g>
        <JointDot p={p.lShoulder} dim={side} />
        <JointDot p={p.lElbow} dim={side} />
        <JointDot p={p.lKnee} dim={side} />
        <JointDot p={p.rShoulder} />
        <JointDot p={p.rElbow} />
        <JointDot p={p.hip} />
        <JointDot p={p.rKnee} />
      </g>
    </svg>
  )
}
