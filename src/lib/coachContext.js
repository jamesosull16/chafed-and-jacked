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

import { DAY_LABELS, TRAINING_SCHEDULES, DAY_TYPE_ORDER } from './program'
import { getSplitLabels } from './strength/strengthProgram'
import { getBlockStatus } from './strength/strengthPeriodization'

/** How far ahead the coach can see. Two weeks covers any shopping trip. */
export const UPCOMING_DAYS = 14

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const isoDay = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * The training days ahead, so the coach can plan food against them.
 *
 * Meal prep is a forward-looking question and every training read the coach
 * had was backward-looking: completed sessions, logged runs, today's plan. Ask
 * it what to cook on Sunday for the week and it had nothing to answer with —
 * it could see that Monday existed only once Monday arrived.
 *
 * Projected on the client because the schedule comes from the same engine the
 * athlete is looking at, and Cloud Functions cannot import `src/lib/**`. That
 * is a different trust question from the completed-session reads, which are
 * server-side precisely because a claim about what you *did* must not be
 * client-assertable. This is a plan, not a claim — the worst a wrong one can
 * do is have the coach suggest the wrong quantity of rice.
 *
 * Deload weeks are carried through because they change the answer: a week at
 * 55% volume does not need the same food as a peak week.
 */
export function buildUpcomingSessions({
  isStrength,
  days = UPCOMING_DAYS,
  now = new Date(),
  strength = {},
  blockStart,
  blockEnd,
  runningTrainingDays = 'mon-wed-fri',
  runningWeeklyMiles = null,
}) {
  const out = []
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)

  const liftDays = isStrength
    ? [...(strength.trainingDayIndices || [1, 2, 4, 5])].sort((a, b) => a - b)
    : TRAINING_SCHEDULES[runningTrainingDays]?.days || TRAINING_SCHEDULES['mon-wed-fri'].days

  const labels = isStrength ? getSplitLabels(strength.trainingDaysPerWeek || 4) : null

  for (let i = 0; i < days; i++) {
    const date = new Date(start)
    date.setDate(date.getDate() + i)
    const splitIndex = liftDays.indexOf(date.getDay())

    const day = {
      date: isoDay(date),
      weekday: WEEKDAY[date.getDay()],
      daysFromNow: i,
      training: splitIndex !== -1,
    }

    if (splitIndex !== -1) {
      if (isStrength) {
        const label = labels[splitIndex % labels.length]
        day.name = label?.name || null
        day.focus = label?.focus || null
      } else {
        const dayType = DAY_TYPE_ORDER[splitIndex % DAY_TYPE_ORDER.length]
        day.name = `Day ${dayType} — ${DAY_LABELS[dayType] || 'support lift'}`
        day.focus = DAY_LABELS[dayType] || null
      }
    }

    if (isStrength && blockStart && blockEnd) {
      const status = getBlockStatus(blockStart, blockEnd, date)
      day.blockWeek = status.blockWeek
      day.phase = status.phase
    }

    out.push(day)
  }

  return {
    days: out,
    // Running mode plans by weekly volume rather than by session, so the
    // week's mileage is the number that drives fuelling, not the lift split.
    weeklyMiles: isStrength ? null : runningWeeklyMiles,
  }
}

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

/**
 * Strip the numbers JSON has no spelling for, so the turn can be sent at all.
 *
 * Firebase's callable encoder walks the payload and throws on any non-finite
 * number — `Data cannot be encoded in JSON: Infinity` — before the request
 * leaves the device. It fires on the whole payload, so one unrepresentable
 * number three levels down takes the entire message with it, photo and all.
 *
 * The one that actually fired was the chain ratio: `chainRatio` returns
 * Infinity for posterior volume against zero quad volume, which is a real
 * training week, not a bad state. Nothing is lost by sending null — the
 * accompanying `status` is 'posteriorOnly' and the set counts are right there,
 * so the server renders "n/a:1 posterior:anterior (14 vs 0 sets)", which is
 * what an infinite ratio means anyway.
 *
 * Applied to the whole context rather than to that one field, because the
 * failure mode is what makes this worth generalising: any future ratio or
 * average that divides by an empty week breaks chat entirely, and does it with
 * an error message that says nothing about training.
 */
export function jsonSafe(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map(jsonSafe)
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonSafe(v)]))
  }
  return value
}

export function buildCoachContext({ isStrength, targets, advice, session, block, upcoming }) {
  const context = {
    targets,
    derivation: advice ? { basis: advice.calories.breakdown } : null,
    session,
    // Carried in the context object but deliberately not rendered into the
    // per-turn context block — it is a fortnight of schedule, and only a
    // planning question needs it. The get_upcoming_sessions tool reads it, so
    // it costs payload rather than tokens on every turn.
    upcoming,
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

  return jsonSafe(context)
}
