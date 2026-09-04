/**
 * TRAINING LOAD — Chafed & Jacked
 *
 * Session RPE × duration, which is the metric the app's own methodology asks
 * for and the one it had no way to compute.
 *
 *   Session load (AU) = sRPE (1-10) × duration (min)
 *
 * Why this and not miles. Miles cannot tell twenty-five slow returning miles
 * from twenty-five seasoned ones, and they cannot price a lifting session at
 * all — so `loadScaling.js` scales lifting load by weekly mileage and reads
 * "Full Send" through an entire return-to-run build, because its bands start at
 * 40 mpw. sRPE × duration puts a threshold run and a heavy lower day on one
 * scale, which is the comparison the whole question turns on.
 *
 * Two rules from `skills/endurance-running-coach/references/return-to-run.md`
 * §6 that the numbers are worthless without:
 *
 *   Rate the session 20-30 minutes AFTER finishing, not while finishing.
 *   Rate the whole session, not the hardest interval in it.
 *
 * And one that changes the arithmetic: **lifting counts.** Two lifting sessions
 * at RPE 7 × 60 min is 840 AU, which is not a rounding error against a 600-900
 * AU run week. A running build that ignores the strength work under-counts in
 * exactly the weeks the lifting is going well.
 *
 * Pure module. Dates and sessions are passed in.
 */

/** The scale is 1-10; anything outside it is a typo, not a very hard session. */
export const MIN_RPE = 1
export const MAX_RPE = 10

/** Rounded because a load in arbitrary units has no business having decimals. */
export function sessionLoad(sRPE, durationMinutes) {
  const rpe = Number(sRPE)
  const minutes = Number(durationMinutes)
  if (!Number.isFinite(rpe) || !Number.isFinite(minutes)) return null
  if (rpe < MIN_RPE || rpe > MAX_RPE || minutes <= 0) return null
  return Math.round(rpe * minutes)
}

const dayKey = (value) => {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Every rateable effort in the window, lift and run alike, as one list.
 *
 * `rated` is the half that carries an sRPE. The rest are counted but not
 * costed — a session logged before this field existed, or one the athlete
 * never rated, is *unknown* load rather than zero, and averaging over it as
 * though it were zero would quietly halve a week.
 */
export function collectEfforts({ sessions = [], runs = [] } = {}) {
  const efforts = []

  for (const s of sessions || []) {
    if (!s?.date || s.completed === false) continue
    const day = dayKey(s.date)
    if (!day) continue
    efforts.push({
      day,
      kind: 'lift',
      minutes: Number(s.duration) || 0,
      sRPE: Number(s.sRPE) || null,
      load: sessionLoad(s.sRPE, s.duration),
      label: s.name || 'Lift',
    })
  }

  for (const entry of runs || []) {
    const day = entry?.date ? dayKey(`${entry.date}T12:00:00`) : null
    if (!day) continue
    for (const run of entry.runs || []) {
      efforts.push({
        day,
        kind: 'run',
        minutes: Number(run.duration_minutes) || 0,
        sRPE: Number(run.sRPE) || null,
        load: sessionLoad(run.sRPE, run.duration_minutes),
        miles: Number(run.miles) || 0,
        label: `${Math.round((Number(run.miles) || 0) * 10) / 10} mi`,
      })
    }
  }

  return efforts.sort((a, b) => (a.day < b.day ? -1 : 1))
}

function windowDays(now, days) {
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  const start = new Date(end)
  start.setDate(start.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)
  return { start, end }
}

const inWindow = (day, start, end) => {
  const d = new Date(`${day}T12:00:00`)
  return d >= start && d <= end
}

/**
 * Total load over a rolling window, with the honesty attached.
 *
 * `rated` / `total` is the point of the return value. A 900 AU week built from
 * three rated sessions out of six is not a 900 AU week, it is a lower bound,
 * and anything reading `load` without reading `coverage` will draw the wrong
 * conclusion from it.
 */
export function loadOverWindow(efforts, { days = 7, now = new Date() } = {}) {
  const { start, end } = windowDays(now, days)
  const scoped = efforts.filter((e) => inWindow(e.day, start, end))
  const rated = scoped.filter((e) => e.load != null)

  const load = rated.reduce((sum, e) => sum + e.load, 0)
  return {
    days,
    load,
    sessions: scoped.length,
    ratedSessions: rated.length,
    coverage: scoped.length === 0 ? 1 : rated.length / scoped.length,
    minutes: scoped.reduce((sum, e) => sum + e.minutes, 0),
    byKind: {
      lift: rated.filter((e) => e.kind === 'lift').reduce((s, e) => s + e.load, 0),
      run: rated.filter((e) => e.kind === 'run').reduce((s, e) => s + e.load, 0),
    },
  }
}

/**
 * Acute:chronic workload ratio — and the reasons not to trust it.
 *
 * The claim: this week's load over the rolling 28-day average, with a "sweet
 * spot" around 0.8-1.3 (Gabbett 2016, Hulin et al. 2016).
 *
 * The methodology file is deliberately rude about it, and this implementation
 * carries those caveats rather than burying them:
 *
 *   - It is mathematically coupled. The acute week sits *inside* the chronic
 *     average, which manufactures association independent of any real effect
 *     (Lolli et al. 2019).
 *   - Its foundations and its threshold bins have been substantively
 *     criticised (Impellizzeri et al. 2020).
 *   - It was developed in team sports and has never been validated as a
 *     decision rule for an individual runner returning from a lay-off.
 *   - **It is uninterpretable early.** A 28-day average that includes weeks of
 *     near-zero running is not a chronic load in any meaningful sense: weeks
 *     1-5 of a return produce ratios of 1.3-1.4 that mean nothing at all.
 *
 * So `interpretable` is a first-class part of the return value, and it is false
 * until the chronic window is actually populated. A ratio is still reported
 * when it can be computed, because hiding the number invites recomputing it by
 * hand from the two totals sitting next to it — but it is labelled.
 */
export const ACWR_BANDS = [
  { max: 0.8, id: 'detraining', label: 'Dropping', note: 'Fine for a deliberate down week. Worth asking about otherwise.' },
  { max: 1.3, id: 'working', label: 'Working range', note: 'Progressing at a rate the tissue plausibly tolerates.' },
  { max: 1.5, id: 'watch', label: 'Watch', note: 'Acceptable once. Not two weeks running, and not alongside a new stressor.' },
  { max: Infinity, id: 'warning', label: 'Spike', note: 'Something jumped. Check it was planned, and hold volume flat next week.' },
]

/** Weeks of chronic data below which the ratio means nothing. */
export const MIN_CHRONIC_WEEKS = 4

export function acuteChronicRatio(efforts, { now = new Date() } = {}) {
  const acute = loadOverWindow(efforts, { days: 7, now })
  const chronic28 = loadOverWindow(efforts, { days: 28, now })
  const chronicWeekly = chronic28.load / 4

  // Each of the four weeks inside the chronic window, so "populated" can mean
  // something more than a non-zero total that one big week produced.
  const weeks = [0, 1, 2, 3].map((back) => {
    const end = new Date(now)
    end.setDate(end.getDate() - back * 7)
    return loadOverWindow(efforts, { days: 7, now: end }).load
  })
  const populatedWeeks = weeks.filter((w) => w > 0).length

  const ratio = chronicWeekly > 0 ? Math.round((acute.load / chronicWeekly) * 100) / 100 : null
  const interpretable = populatedWeeks >= MIN_CHRONIC_WEEKS && chronicWeekly > 0

  let reason = null
  if (!interpretable) {
    reason =
      populatedWeeks === 0
        ? 'No rated sessions in the last four weeks.'
        : `Only ${populatedWeeks} of the last 4 weeks carry any load. A chronic average that includes near-empty weeks is not a chronic load — this number will read 1.3-1.4 and mean nothing.`
  }

  const band = ratio == null ? null : ACWR_BANDS.find((b) => ratio < b.max)

  return {
    ratio,
    interpretable,
    reason,
    band: interpretable ? band : null,
    acuteLoad: acute.load,
    chronicWeeklyLoad: Math.round(chronicWeekly),
    populatedWeeks,
    coverage: chronic28.coverage,
  }
}

/**
 * The whole picture for a dashboard card.
 *
 * Deliberately does not return a verdict or a load-scaling multiplier. There is
 * no baseline to band against yet — the first rated week is the first data
 * point this metric has ever had — and inventing thresholds for a number with
 * no history is the same mistake as inventing an activity factor. Report the
 * figures, say what is missing, and let the bands come from data.
 */
export function trainingLoadSummary({ sessions = [], runs = [], now = new Date() } = {}) {
  const efforts = collectEfforts({ sessions, runs })
  const week = loadOverWindow(efforts, { days: 7, now })
  const previous = loadOverWindow(efforts, {
    days: 7,
    now: new Date(new Date(now).setDate(new Date(now).getDate() - 7)),
  })

  return {
    week,
    previous,
    changePct:
      previous.load > 0 ? Math.round(((week.load - previous.load) / previous.load) * 100) : null,
    acwr: acuteChronicRatio(efforts, { now }),
    efforts,
  }
}
