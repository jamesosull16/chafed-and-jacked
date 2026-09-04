/**
 * FOOD LOG COMPLETENESS — Chafed & Jacked
 *
 * How much of the last N days the food log can actually speak to.
 *
 * This exists because of a specific failure. Four weeks into a cut the athlete
 * had gained 5.7 lb, and the log said he was averaging 2101 kcal against a
 * maintenance of roughly 2615. Both numbers were true and the conclusion drawn
 * from them would have been wrong, because two days had no document at all and
 * seven more were logged under 1500 kcal — every one of them a Saturday or a
 * Sunday. Roughly 3000 kcal a week was going in that the log never saw.
 *
 * Nothing in the app could see that. The rate-of-gain guardrail would have said
 * "cut a further 150 kcal", adjusting a target he was not eating to in the
 * first place, and the coach reasoned about intake as though the log were
 * complete. A number derived from a log with holes in it is not a smaller
 * number, it is a different question.
 *
 * ── What can and cannot be claimed ──────────────────────────────────
 *
 * "Complete" is not knowable. Nobody can tell a genuinely light day from a
 * half-logged one from the outside, and a classifier that pretends otherwise
 * would just move the false confidence somewhere new.
 *
 * So this only claims what it can defend:
 *
 *   missing      no document, or a document with no entries. Nothing was
 *                logged. Certain.
 *   implausible  logged intake below resting metabolism. Not a claim about
 *                appetite — BMR is what the body spends doing nothing, and a
 *                day below it is a logging gap rather than a diet.
 *   logged       everything else. NOT a claim of completeness.
 *
 * `coverage` is therefore a ceiling on how much of the window is known, never a
 * measure of how accurate it is.
 *
 * Pure module — days are passed in.
 */

/**
 * Below this multiple of BMR, a day is a gap rather than a light day.
 *
 * 1.0 deliberately, not a fraction of the calorie *target*. A target moves with
 * the goal and with the day's training, so a fraction of it would flag hard
 * days and excuse rest days — exactly backwards. BMR is the floor the body
 * spends regardless, and a full day recorded below it did not happen.
 */
export const IMPLAUSIBLE_BMR_MULTIPLE = 1.0

/** Windows shorter than this cannot say anything about a weekly pattern. */
export const MIN_WINDOW_DAYS = 7

const sumKcal = (entries = []) => entries.reduce((total, e) => total + (Number(e?.kcal) || 0), 0)

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * Classify one day.
 *
 * `bmr` is optional. Without it the implausible band cannot be drawn, so days
 * with any entries at all are treated as logged — under-reporting the problem
 * rather than inventing a threshold to detect it with.
 */
export function classifyDay({ dateId, log, bmr = null, isToday = false }) {
  const entries = log?.entries || []
  const kcal = Math.round(sumKcal(entries))
  const date = new Date(`${dateId}T12:00:00`)
  const base = {
    dateId,
    kcal,
    entries: entries.length,
    weekday: Number.isNaN(date.getTime()) ? null : WEEKDAY[date.getDay()],
    isWeekend: Number.isNaN(date.getTime()) ? false : date.getDay() === 0 || date.getDay() === 6,
  }

  // A day still being lived cannot be judged. Today reads as under-logged
  // every morning by construction — at 9am nobody has eaten a day's food — and
  // counting it as a gap would produce a nag that is wrong until dinner.
  if (isToday) return { ...base, status: 'inProgress' }
  if (entries.length === 0) return { ...base, status: 'missing' }
  if (bmr && kcal < bmr * IMPLAUSIBLE_BMR_MULTIPLE) return { ...base, status: 'implausible' }
  return { ...base, status: 'logged' }
}

/**
 * Coverage across a window of days.
 *
 * @param days  [{ dateId, log }] — oldest or newest first, order is preserved
 * @param bmr   resting metabolism, for the implausible band
 */
export function assessLogCoverage(days = [], { bmr = null, todayId = null } = {}) {
  const classified = days.map((d) => classifyDay({ ...d, bmr, isToday: d.dateId === todayId }))
  // Today is excluded from the arithmetic entirely rather than counted either
  // way: it is neither known nor a gap until it is over.
  const judged = classified.filter((d) => d.status !== 'inProgress')
  const known = judged.filter((d) => d.status === 'logged')
  const missing = judged.filter((d) => d.status === 'missing')
  const implausible = judged.filter((d) => d.status === 'implausible')
  const unknown = missing.length + implausible.length

  const total = judged.length
  const coverage = total === 0 ? 0 : known.length / total

  // The pattern worth naming. A gap that lands on the same two days every week
  // is a habit, and telling someone "your log is 60% complete" hides the one
  // fact that would let them fix it.
  const weekendUnknown = judged.filter((d) => d.isWeekend && d.status !== 'logged').length
  const weekendTotal = judged.filter((d) => d.isWeekend).length
  const weekdayUnknown = unknown - weekendUnknown
  const concentratedOnWeekends =
    weekendTotal > 0 && weekendUnknown >= 2 && weekendUnknown > weekdayUnknown

  const meanLoggedKcal = known.length
    ? Math.round(known.reduce((sum, d) => sum + d.kcal, 0) / known.length)
    : null

  return {
    days: classified,
    total,
    known: known.length,
    missing: missing.length,
    implausible: implausible.length,
    unknown,
    coverage: Math.round(coverage * 100) / 100,
    meanLoggedKcal,
    concentratedOnWeekends,
    weekendUnknown,
    // Enough of the window is known to reason about intake at all.
    sufficient: total >= MIN_WINDOW_DAYS && unknown === 0,
    summary: describeCoverage({ total, unknown, missing: missing.length, implausible: implausible.length, concentratedOnWeekends, weekendUnknown }),
  }
}

function describeCoverage({ total, unknown, missing, implausible, concentratedOnWeekends, weekendUnknown }) {
  if (total === 0) return 'No days to check.'
  if (unknown === 0) return `All ${total} days logged.`

  const parts = []
  if (missing) parts.push(`${missing} with nothing logged`)
  if (implausible) parts.push(`${implausible} logged below your resting metabolism`)
  const detail = parts.join(' and ')

  if (concentratedOnWeekends) {
    return `${total - unknown} of ${total} days logged — ${detail}, and ${weekendUnknown} of them fell on a weekend.`
  }
  return `${total - unknown} of ${total} days logged — ${detail}.`
}

/**
 * What the gap is worth, in calories a day.
 *
 * The number that makes the problem concrete. An unlogged day is not zero
 * calories, it is an unknown one, and the honest bound is that it was probably
 * an ordinary day. Spread across the window, that is how far the logged average
 * could be from the real one — and comparing it against the 150 kcal the
 * rate-of-gain guardrail adjusts by is the whole argument for not adjusting.
 */
export function unloggedKcalPerDay({ coverage, meanLoggedKcal }) {
  if (!meanLoggedKcal || coverage == null || coverage >= 1) return 0
  return Math.round(meanLoggedKcal * (1 - coverage))
}
