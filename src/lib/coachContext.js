/**
 * The advisory half of the coach's turn context, assembled per mode.
 *
 * Extracted from CoachChat so the mode branch can be tested without a DOM. The
 * property worth pinning is a negative one: in running mode the strength
 * block's week and chain balance must not be sent. Sending them describes a
 * plan the athlete is not following, and that is worse than sending nothing —
 * the server renders a missing section as an explicit gap and a wrong one as
 * fact.
 *
 * Everything security-relevant (uid, injury flags, block week, the meal ids the
 * coach may correct) is re-derived server-side regardless of what goes here.
 * This is advisory and shape-clamped by the function; it is not a trust
 * boundary.
 */

import { DAY_LABELS } from './program'

/**
 * Today's session in whichever mode is active.
 *
 * Running mode returns the mileage-scaled support lift from the running
 * engine, not the hypertrophy split. `show_session` used to refuse to describe
 * anything in running mode rather than fall back to the wrong session — the
 * right call while nothing supplied one, and the wrong outcome now that
 * something does.
 */
export function buildSessionContext({ isStrength, strengthSession, runningSession }) {
  if (isStrength) {
    if (!strengthSession) return null
    return {
      name: strengthSession.name,
      focus: strengthSession.focus,
      isToday: strengthSession.isToday,
      dayLabel: strengthSession.date?.toLocaleDateString('en-US', { weekday: 'long' }),
      rirTarget: strengthSession.rirTarget,
      estimatedMinutes: strengthSession.estimatedMinutes,
      exercises: (strengthSession.exercises || []).map((e) => ({
        id: e.id,
        name: e.name,
        sets: e.sets,
        repRange: e.repRange,
        restSeconds: e.restSeconds,
        modification: e.modification || null,
      })),
      substitutions: strengthSession.substitutions,
    }
  }

  if (!runningSession) return null
  const label = DAY_LABELS[runningSession.dayType] || 'support lift'
  return {
    name: `Day ${runningSession.dayType} — ${label}`,
    focus: label,
    isToday: runningSession.isToday,
    dayLabel: runningSession.date?.toLocaleDateString('en-US', { weekday: 'long' }),
    exercises: (runningSession.exercises || []).map((e) => ({
      id: e.id,
      name: e.name,
      // The running engine scales sets by weekly mileage; `effectiveSets` is
      // what he will actually be asked to do, and the prescribed count is not.
      sets: e.effectiveSets ?? e.sets,
      repRange: e.repRange,
      restSeconds: e.restSeconds,
      modification: e.modification || null,
    })),
    substitutions: [],
  }
}

export function buildCoachContext({ isStrength, targets, advice, session, block }) {
  const context = {
    targets,
    derivation: advice ? { basis: advice.calories.breakdown } : null,
    session,
  }

  // Strength-only. Race context is server-derived from the stored profile, so
  // running mode has no equivalent block to send from here.
  if (isStrength && block) {
    context.block = {
      totalWeeks: block.blockStatus?.totalWeeks,
      mesocycle: block.blockStatus?.mesocycle,
      weekInMesocycle: block.blockStatus?.weekInMesocycle,
      phase: block.blockStatus?.phase,
      rirTarget: block.blockStatus?.rirTarget,
    }
    context.balance = {
      ratio: block.balance?.chain?.ratio,
      posteriorSets: block.balance?.chain?.posteriorSets,
      anteriorSets: block.balance?.chain?.anteriorSets,
      status: block.balance?.chain?.status,
      perMuscle: Object.fromEntries(
        (block.balance?.volume || []).map((v) => [
          v.muscle,
          { sets: v.sets, status: v.status, capped: v.capped },
        ])
      ),
    }
  }

  return context
}
