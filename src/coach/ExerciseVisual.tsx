import { exerciseGif } from '../data/exercise-gifs'
import type { Exercise } from '../data/exercises'
import { CoachAvatar } from './CoachAvatar'

type Props = {
  exercise: Pick<Exercise, 'id' | 'coachId' | 'name'>
  playing?: boolean
  phase?: 'work' | 'rest' | 'celebrate'
  className?: string
  hideFloor?: boolean
}

// The animation GIF is the default visual when one exists; the animated SVG
// coach is the fallback for moves without a dataset clip.
export function ExerciseVisual({
  exercise,
  playing = true,
  phase = 'work',
  className = '',
  hideFloor = false,
}: Props) {
  const gif = exerciseGif(exercise)
  if (gif) {
    return (
      <img
        src={gif}
        alt={`${exercise.name} animation`}
        className={`${className} rounded-2xl bg-white object-contain`.trim()}
        draggable={false}
      />
    )
  }
  return (
    <CoachAvatar
      exerciseId={exercise.coachId ?? exercise.id}
      phase={phase}
      playing={playing}
      className={className}
      hideFloor={hideFloor}
    />
  )
}
