/**
 * TRAINING CONTEXT DERIVATION — Chafed & Jacked
 *
 * What the coach knows about training that it must not take the client's word
 * for. Advice about what the athlete did is worthless if the client can claim
 * he did something else, so completed sessions, runs and their rollups are
 * read and derived server-side — the same argument `context.js` already makes
 * for meal ids and `guardrails.js` makes for injury flags.
 *
 * Cloud Functions deploy `functions/` standalone, so `src/lib/**` cannot be
 * imported. The periodisation, scaling-tier and run-calorie logic below is
 * therefore duplicated deliberately, following the precedent set by
 * `guardrails.js`, and pinned by `functions/__tests__/trainingParity.test.js`
 * so drift fails the build rather than quietly giving the coach a different
 * race phase than the dashboard is showing.
 *
 * Everything here is pure. Reads live in `context.js`.
 */

const MS_PER_DAY = 86400000

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback)

/** Parse a stored date, which may be an ISO string, a Date, or a Firestore Timestamp. */
export function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value.toDate === 'function') return value.toDate()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function hoursSince(value, now = new Date()) {
  const d = toDate(value)
  if (!d) return null
  return Math.max(0, (now.getTime() - d.getTime()) / 3600000)
}

// ── Mileage documents ─────────────────────────────────────────
//
// `dailyMileage` has two historical shapes. `useWorkout.addRun()` writes both a
// `runs` array and a denormalised `miles` total, but documents written before
// the runs array existed carry only a bare `miles`. Normalise to the same
// shape the client does, or a legacy day silently reads as zero runs.

/**
 * @returns {{ date, miles, runs: [{ miles, enteredAt?, duration_minutes?, avg_hr_bpm? }] }}
 */
export function normaliseMileageDoc(doc) {
  if (!doc) return null
  if (Array.isArray(doc.runs) && doc.runs.length) {
    const runs = doc.runs.map((r) => ({ ...r, miles: num(r.miles) }))
    return { ...doc, runs, miles: runs.reduce((s, r) => s + r.miles, 0) }
  }
  if (doc.miles) {
    return { ...doc, miles: num(doc.miles), runs: [{ miles: num(doc.miles), enteredAt: doc.enteredAt }] }
  }
  return { ...doc, miles: 0, runs: [] }
}

// ── Run calories ──────────────────────────────────────────────
// Mirrors calculateRunKcal in src/lib/macroCalculator.js.

function keytelKcalPerMin(hr, weightKg, age, sex) {
  if (sex === 'female') {
    return (-20.4022 + 0.4472 * hr - 0.1263 * weightKg + 0.074 * age) / 4.184
  }
  return (-55.0969 + 0.6309 * hr + 0.1988 * weightKg + 0.2017 * age) / 4.184
}

function keytelVO2KcalPerMin(hr, weightKg, age, sex, vo2max) {
  if (sex === 'female') {
    return (-59.3954 + 0.4472 * hr - 0.1263 * weightKg + 0.074 * age + 0.4654 * vo2max) / 4.184
  }
  return (-95.7735 + 0.6309 * hr + 0.1988 * weightKg + 0.2017 * age + 0.6488 * vo2max) / 4.184
}

export function calculateRunKcal(run, profile) {
  if (!run || (!run.miles && !run.duration_minutes)) {
    return { kcal: 0, source: 'distance' }
  }

  const { duration_minutes, avg_hr_bpm } = run
  const { weightKg, weightLbs, age, sex, vo2max } = profile || {}

  if (duration_minutes && avg_hr_bpm) {
    let kcalPerMin, source
    if (vo2max && vo2max > 0) {
      kcalPerMin = keytelVO2KcalPerMin(avg_hr_bpm, weightKg, age, sex, vo2max)
      source = 'keytel_vo2'
    } else {
      kcalPerMin = keytelKcalPerMin(avg_hr_bpm, weightKg, age, sex)
      source = 'keytel'
    }
    return { kcal: Math.max(0, kcalPerMin) * duration_minutes, source }
  }

  return { kcal: (run.miles || 0) * (weightLbs || 0) * 0.63, source: 'distance' }
}

// ── Race periodisation ────────────────────────────────────────
// Mirrors src/lib/periodization.js. The client memoises the built schedule;
// this copy doesn't, because a function invocation builds it at most once and
// the cache would outlive the request in a warm container for no benefit.

export function calculateProgramStart(raceDate) {
  const start = new Date(raceDate)
  start.setDate(start.getDate() - 21 * 7)
  const day = start.getDay()
  if (day === 0) start.setDate(start.getDate() + 1)
  else if (day !== 1) start.setDate(start.getDate() + (8 - day))
  start.setHours(0, 0, 0, 0)
  return start
}

export function buildSchedule(raceDate, programStart) {
  if (!raceDate || !programStart) return []
  const weeks = []
  const current = new Date(programStart)
  let weekNum = 1

  const taperStart = new Date(raceDate)
  taperStart.setDate(taperStart.getDate() - 21)

  const raceWeekStart = new Date(raceDate)
  raceWeekStart.setDate(
    raceWeekStart.getDate() - (raceDate.getDay() === 0 ? 6 : raceDate.getDay() - 1)
  )

  while (current < raceWeekStart) {
    const weekEnd = new Date(current)
    weekEnd.setDate(weekEnd.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    let type, mesocycle, weekInMeso
    const weeksFromStart = weekNum - 1

    if (current >= taperStart) {
      type = 'taper'
      mesocycle = null
      if (!weeks.length || weeks[weeks.length - 1].type !== 'taper') {
        weekInMeso = 1
      } else {
        weekInMeso = weeks[weeks.length - 1].weekInMesocycle + 1
      }
    } else {
      mesocycle = Math.floor(weeksFromStart / 5) + 1
      weekInMeso = (weeksFromStart % 5) + 1
      type = weekInMeso === 5 ? 'deload' : 'build'
    }

    weeks.push({
      weekNumber: weekNum,
      startDate: new Date(current),
      endDate: weekEnd,
      type,
      mesocycle,
      weekInMesocycle: weekInMeso,
    })

    current.setDate(current.getDate() + 7)
    weekNum++
  }

  const raceWeekEnd = new Date(raceDate)
  raceWeekEnd.setHours(23, 59, 59, 999)
  weeks.push({
    weekNumber: weekNum,
    startDate: new Date(raceWeekStart),
    endDate: raceWeekEnd,
    type: 'race',
    mesocycle: null,
    weekInMesocycle: null,
  })

  return weeks
}

export function getPerpetualWeek(date) {
  const epoch = new Date('2026-01-05')
  const msPerWeek = 7 * MS_PER_DAY
  const weeksFromEpoch = Math.floor((date - epoch) / msPerWeek)
  const weekInCycle = (((weeksFromEpoch % 5) + 5) % 5) + 1
  const mesocycle = Math.floor(weeksFromEpoch / 5) + 1

  const weekStart = new Date(epoch)
  weekStart.setDate(weekStart.getDate() + weeksFromEpoch * 7)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  return {
    weekNumber: weeksFromEpoch + 1,
    startDate: weekStart,
    endDate: weekEnd,
    type: weekInCycle === 5 ? 'deload' : 'build',
    mesocycle,
    weekInMesocycle: weekInCycle,
  }
}

export function getCurrentWeek(raceDate, programStart, date = new Date()) {
  if (!raceDate || !programStart) return getPerpetualWeek(date)

  const schedule = buildSchedule(raceDate, programStart)
  for (const week of schedule) {
    if (date >= week.startDate && date <= week.endDate) return week
  }
  if (date < programStart) return { ...schedule[0], isFuture: true }

  const raceWeek = schedule[schedule.length - 1]
  if (date > raceWeek.endDate) return { ...raceWeek, isPast: true }
  for (const week of schedule) {
    if (date < week.endDate) return week
  }
  return raceWeek
}

export function daysUntilRace(raceDate, date = new Date()) {
  if (!raceDate) return 0
  return Math.max(0, Math.ceil((raceDate - date) / MS_PER_DAY))
}

export function getActiveRace(races, now = new Date()) {
  if (!races || races.length === 0) return null
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const futureRaces = races
    .filter((r) => new Date(r.date + 'T00:00:00') >= today)
    .sort((a, b) => new Date(a.date + 'T00:00:00') - new Date(b.date + 'T00:00:00'))

  return futureRaces.find((r) => r.isARace) || futureRaces[0] || null
}

// ── Lifting load scaling ──────────────────────────────────────
// Mirrors SCALING_TIERS in src/lib/loadScaling.js. Only the fields the coach
// reasons about are carried; the display-only colour and badge fields are not.

export const SCALING_TIERS = [
  { id: 'full', label: 'Full Send', minMiles: 0, maxMiles: 39.9, loadMultiplier: 1.0, dropSet: false },
  { id: 'moderate', label: 'Moderate Volume', minMiles: 40, maxMiles: 54.9, loadMultiplier: 0.925, dropSet: false },
  { id: 'high', label: 'High Mileage', minMiles: 55, maxMiles: 69.9, loadMultiplier: 0.825, dropSet: true },
  { id: 'survival', label: 'Survival Mode', minMiles: 70, maxMiles: Infinity, loadMultiplier: 0.725, dropSet: true },
]

export function getScalingTier(weeklyMiles) {
  if (weeklyMiles == null || weeklyMiles < 0) return SCALING_TIERS[0]
  return (
    SCALING_TIERS.find((t) => weeklyMiles >= t.minMiles && weeklyMiles <= t.maxMiles) ||
    SCALING_TIERS[0]
  )
}

// ── Session summarising ───────────────────────────────────────
// Server-only: there is no client counterpart, so nothing to keep parity with.

/** The heaviest working set of an exercise — what "how did it go" actually means. */
function topSet(sets = []) {
  if (!sets.length) return null
  const working = sets.filter((s) => num(s.reps) > 0)
  if (!working.length) return null
  return working.reduce((best, s) =>
    num(s.weight) > num(best.weight) ? s : best
  )
}

export function summariseSession(session, now = new Date()) {
  if (!session) return null
  const date = toDate(session.date)
  return {
    id: session.id || null,
    date: date ? date.toISOString() : null,
    hoursSince: hoursSince(session.date, now),
    dayType: session.dayType || null,
    week: session.week ?? null,
    weekType: session.weekType || null,
    duration: num(session.duration) || null,
    totalVolume: num(session.totalVolume) || null,
    exercises: (session.exercises || []).slice(0, 12).map((e) => {
      const top = topSet(e.sets)
      return {
        id: e.id || null,
        sets: (e.sets || []).length,
        top: top
          ? {
              weight: num(top.weight),
              reps: num(top.reps),
              rir: top.rir == null ? null : num(top.rir),
              isBodyweight: !!top.isBodyweight,
            }
          : null,
      }
    }),
  }
}

/**
 * A 7- and 14-day rollup of what actually happened.
 *
 * The trend line compares the last 7 days against the 7 before it. The band is
 * deliberately wide: the endurance methodology treats 5-10% steps as normal
 * progression, so anything inside ±15% is noise rather than a signal worth
 * naming, and calling it "ramping" would train the athlete to ignore the word.
 */
export function summariseRecentTraining({ sessions = [], mileageDocs = [], plans = [], now = new Date() }) {
  const since = (days) => new Date(now.getTime() - days * MS_PER_DAY)
  const day7 = since(7)
  const day14 = since(14)

  const inWindow = (value, from) => {
    const d = toDate(value)
    return d ? d >= from && d <= now : false
  }

  const runs = mileageDocs.map(normaliseMileageDoc).filter(Boolean)
  const runsIn = (from) => runs.filter((r) => inWindow(`${r.date}T12:00:00`, from))

  const milesIn = (from) => runsIn(from).reduce((s, r) => s + r.miles, 0)
  const sessionsIn = (from) => sessions.filter((s) => inWindow(s.date, from))

  const last7Miles = milesIn(day7)
  const prior7Miles = milesIn(day14) - last7Miles

  const allRuns7 = runsIn(day7).flatMap((d) => d.runs)
  const longestRun = allRuns7.reduce((m, r) => Math.max(m, num(r.miles)), 0)

  const sessions7 = sessionsIn(day7)
  const volume7 = sessions7.reduce((s, x) => s + num(x.totalVolume), 0)

  // Rest days: days in the last 7 with neither a session nor a run.
  const activeDays = new Set()
  for (const s of sessions7) {
    const d = toDate(s.date)
    if (d) activeDays.add(d.toISOString().slice(0, 10))
  }
  for (const r of runsIn(day7)) {
    if (r.miles > 0) activeDays.add(r.date)
  }

  let trend = 'flat'
  if (prior7Miles > 0) {
    const change = (last7Miles - prior7Miles) / prior7Miles
    if (change > 0.15) trend = 'ramping'
    else if (change < -0.15) trend = 'cut'
  } else if (last7Miles > 0) {
    trend = 'ramping'
  }

  const plan = plans.find((p) => p.plannedMiles != null) || null

  return {
    sessions7: sessions7.length,
    sessions14: sessionsIn(day14).length,
    volume7: Math.round(volume7) || 0,
    miles7: Math.round(last7Miles * 10) / 10,
    miles14: Math.round(milesIn(day14) * 10) / 10,
    priorMiles7: Math.round(prior7Miles * 10) / 10,
    longestRun: Math.round(longestRun * 10) / 10,
    restDays7: Math.max(0, 7 - activeDays.size),
    plannedMiles: plan ? num(plan.plannedMiles) : null,
    trend,
  }
}

/**
 * Race phase and the lifting scaling that follows from current mileage.
 * Running mode only — there is no race in a strength block.
 */
export function buildRaceContext(profile, weeklyMiles, now = new Date()) {
  const race = getActiveRace(profile?.races, now)
  if (!race) return null

  const raceDate = new Date(race.date + 'T00:00:00')
  const programStart = calculateProgramStart(raceDate)
  const week = getCurrentWeek(raceDate, programStart, now)
  const tier = getScalingTier(weeklyMiles)

  return {
    name: race.name || 'race',
    date: race.date,
    daysOut: daysUntilRace(raceDate, now),
    isARace: !!race.isARace,
    phase: week?.type || null,
    weekNumber: week?.weekNumber ?? null,
    mesocycle: week?.mesocycle ?? null,
    weekInMesocycle: week?.weekInMesocycle ?? null,
    scalingTier: { id: tier.id, label: tier.label, loadMultiplier: tier.loadMultiplier, dropSet: tier.dropSet },
  }
}
