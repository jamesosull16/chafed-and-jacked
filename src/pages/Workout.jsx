import { useSearchParams } from 'react-router-dom'
import { useAppMode } from '../hooks/useAppMode'
import StrengthSession from '../components/workout/StrengthSession'
import RunningWorkout from '../components/workout/RunningWorkout'

/**
 * Route shell. Each mode has its own session UI — strength logs RIR and side
 * per set, running logs the endurance program unchanged.
 */
export default function Workout() {
  const { isStrength } = useAppMode()
  const [searchParams] = useSearchParams()

  return isStrength ? (
    <StrengthSession searchParams={searchParams} />
  ) : (
    <RunningWorkout searchParams={searchParams} />
  )
}
