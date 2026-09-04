/**
 * FOOD LOG COVERAGE — Chafed & Jacked
 *
 * Mirrors src/lib/logCompleteness.js, for the same reason as energy.js and
 * guardrails.js: Cloud Functions deploy `functions/` standalone. Pinned by
 * functions/__tests__/logCoveragePartity.test.js.
 *
 * The coach reasons about intake on nearly every turn — "you're 900 under",
 * "you've got 40g of protein left" — and it did all of that from a single day's
 * document, with no way to know that two other days of the week held nothing at
 * all. A daily average over a window with holes reads as knowledge. The holes
 * have to travel with it.
 */

/** Below resting metabolism is a logging gap, not a light day. */
export const IMPLAUSIBLE_BMR_MULTIPLE = 1.0
export const MIN_WINDOW_DAYS = 7

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const sumKcal = (entries = []) =>
  entries.reduce((total, e) => total + (Number(e?.kcal) || 0), 0)

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

  const weekendUnknown = judged.filter((d) => d.isWeekend && d.status !== 'logged').length
  const weekendTotal = judged.filter((d) => d.isWeekend).length
  const weekdayUnknown = unknown - weekendUnknown
  const concentratedOnWeekends =
    weekendTotal > 0 && weekendUnknown >= 2 && weekendUnknown > weekdayUnknown

  const meanLoggedKcal = known.length
    ? Math.round(known.reduce((sum, d) => sum + d.kcal, 0) / known.length)
    : null

  // The ROUNDED coverage, deliberately. The client's `unloggedKcalPerDay` is
  // handed the rounded figure off the returned object, so computing this from
  // the raw fraction here put the two copies 3 kcal apart — small, meaningless,
  // and exactly the kind of drift the parity test exists to refuse.
  const roundedCoverage = Math.round(coverage * 100) / 100

  return {
    days: classified,
    total,
    known: known.length,
    missing: missing.length,
    implausible: implausible.length,
    unknown,
    coverage: roundedCoverage,
    meanLoggedKcal,
    concentratedOnWeekends,
    weekendUnknown,
    sufficient: total >= MIN_WINDOW_DAYS && unknown === 0,
    // The gap in the same units as everything else the coach quotes.
    gapKcalPerDay:
      meanLoggedKcal && roundedCoverage < 1
        ? Math.round(meanLoggedKcal * (1 - roundedCoverage))
        : 0,
  }
}

/** The last `days` calendar day-ids ending at `dateId`, oldest first. */
export function recentDayIds(dateId, days = MIN_WINDOW_DAYS) {
  const end = new Date(`${dateId}T12:00:00`)
  if (Number.isNaN(end.getTime())) return []
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end)
    d.setDate(d.getDate() - i)
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    )
  }
  return out
}
