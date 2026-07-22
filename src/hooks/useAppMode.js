import { useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  MODES,
  DEFAULT_MODE,
  BODY_COMP_GOALS,
  defaultStrengthSettings,
  isStrengthMode,
  hasInjury,
} from '../lib/appMode'

/**
 * Single read point for "which mode are we in and what are its settings".
 *
 * Falls back to defaults when the profile hasn't loaded yet, so components can
 * render optimistically without null-guarding every field.
 */
export function useAppMode() {
  const { userProfile, setMode, updateStrengthSettings } = useAuth()

  return useMemo(() => {
    const mode = userProfile?.mode || DEFAULT_MODE
    const strength = { ...defaultStrengthSettings(), ...(userProfile?.strength || {}) }
    const goal = BODY_COMP_GOALS[strength.bodyCompGoal] || BODY_COMP_GOALS.leanBulk

    return {
      mode,
      isStrength: isStrengthMode(mode),
      isRunning: mode === MODES.RUNNING,
      strength,
      goal,
      injuryFlags: strength.injuryFlags || [],
      hasInjury: (flagId) => hasInjury(strength.injuryFlags, flagId),
      setMode,
      updateStrengthSettings,
    }
  }, [userProfile, setMode, updateStrengthSettings])
}

export default useAppMode
