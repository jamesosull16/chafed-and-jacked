/**
 * ENERGY MODEL — Chafed & Jacked
 *
 * What a session cost and whether the day balances. Grounds fuelling advice in
 * a number the app would also produce, rather than a vibe.
 *
 * Duplicated from src/lib/macroCalculator.js and src/lib/nutritionAdvice.js
 * for the same reason as training.js: Cloud Functions deploy `functions/`
 * standalone. Pinned by functions/__tests__/energyParity.test.js — if the
 * client's model moves and this doesn't, the build fails rather than the coach
 * quoting an expenditure the dashboard disagrees with.
 *
 * There is one TDEE structure, whatever programme planned the day:
 *
 *   BMR x NEAT factor + lifting kcal + net run kcal
 *
 * It used to be two, split on mode, and the split was the bug rather than the
 * safeguard it was written as. Strength mode had no run term at all, so a run
 * logged through `log_run` — which was never mode-gated — landed in Firestore
 * and then failed to move a single number the coach quoted.
 *
 * Run calories are taken net of the resting metabolism those minutes already
 * carried inside the activity factor, which is the double-count the old comment
 * here was really pointing at.
 */

import { calculateRunKcal } from './training.js'

const lbsToKg = (lbs) => lbs / 2.205
const inchesToCm = (inches) => inches * 2.54

// ── BMR ───────────────────────────────────────────────────────

function bmrKatchMcArdle(weightKg, bodyFatPct) {
  return 370 + 21.6 * (weightKg * (1 - bodyFatPct / 100))
}

function bmrMifflinStJeor(weightKg, heightCm, age, sex) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return sex === 'female' ? base - 161 : base + 5
}

/** Katch-McArdle when body fat is known — it works from lean mass. */
export function calculateBMR({ weightKg, heightCm, age, sex, bodyFatPct }) {
  if (bodyFatPct && bodyFatPct > 0) return bmrKatchMcArdle(weightKg, bodyFatPct)
  return bmrMifflinStJeor(weightKg, heightCm, age, sex)
}

// ── TDEE ──────────────────────────────────────────────────────

export const DEFAULT_NEAT_FACTOR = 1.5

/** Kept as an alias — same number, same job. Pinned by energyParity.test.js. */
export const DEFAULT_STRENGTH_ACTIVITY_FACTOR = DEFAULT_NEAT_FACTOR

/** Mirrors netRunKcal in src/lib/macroCalculator.js. */
export function netRunKcal(grossKcal, bmr, durationMinutes) {
  if (!grossKcal) return 0
  if (!bmr || !durationMinutes) return grossKcal
  return Math.max(0, grossKcal - (bmr / 1440) * durationMinutes)
}

/** Mirrors calculateTDEE in src/lib/macroCalculator.js. */
export function calculateTDEE(bmr, runKcal = 0, strengthKcal = 0, neatFactor = DEFAULT_NEAT_FACTOR) {
  return bmr * neatFactor + (runKcal || 0) + (strengthKcal || 0)
}

export function calculateStrengthTDEE(bmr, strengthKcal = 0, activityFactor = DEFAULT_NEAT_FACTOR) {
  return calculateTDEE(bmr, 0, strengthKcal, activityFactor)
}

// ── Session cost ──────────────────────────────────────────────

/** Mirrors estimateStrengthCalories in src/lib/nutritionAdvice.js. */
export function estimateStrengthCalories(liftStats, weightLbs) {
  if (!liftStats) return 0
  const { totalDuration = 0, totalVolume = 0, sessionCount = 0 } = liftStats
  const durationCals = totalDuration * 6 * (weightLbs / 180)
  if (totalDuration > 0) return durationCals
  if (totalVolume > 0) return Math.max(totalVolume * 0.005, sessionCount * 200)
  return sessionCount * 250
}

/**
 * Build the energy-maths shape from the stored documents.
 *
 * `athleteFrom` reads flat fields — `weightLbs`, `heightInches`, `ageYears` —
 * and the user document nests them under `profile` and keeps bodyweight in the
 * `bodyMetrics` collection entirely. Passing the raw document in therefore
 * produced `null`, silently, and `estimateEnergyBalance` returned null on every
 * turn: the coach has never once had an expenditure figure to reason from.
 * Nothing errored, the ENERGY TODAY line simply never rendered.
 */
export function buildEnergyProfile(profile, latestMetrics = null) {
  const p = profile?.profile || {}
  const onboarding = profile?.onboarding || {}
  return {
    weightLbs: Number(latestMetrics?.weight) || Number(onboarding.initialWeight) || null,
    heightInches: Number(p.heightInches) || null,
    ageYears: ageFromBirthday(p.birthday),
    sex: p.biologicalSex || 'male',
    currentBodyFatPct:
      Number(latestMetrics?.bodyFatPct) || Number(onboarding.initialBodyFat) || null,
    vo2max: Number(p.vo2max) || null,
  }
}

/** Whole years, from a YYYY-MM-DD birthday. */
export function ageFromBirthday(birthday) {
  if (!birthday) return null
  const born = new Date(`${birthday}T00:00:00`)
  if (Number.isNaN(born.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const monthDelta = now.getMonth() - born.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) age--
  return age > 0 && age < 120 ? age : null
}

/**
 * Normalise the stored profile into the shape the energy maths wants.
 * Returns null when bodyweight is missing, which is the one field nothing here
 * can be derived without.
 */
export function athleteFrom(profile) {
  const weightLbs = Number(profile?.weightLbs)
  if (!weightLbs) return null
  return {
    weightLbs,
    weightKg: lbsToKg(weightLbs),
    heightCm: profile?.heightInches ? inchesToCm(Number(profile.heightInches)) : null,
    age: Number(profile?.ageYears) || null,
    sex: profile?.sex || 'male',
    bodyFatPct: Number(profile?.currentBodyFatPct) || null,
    vo2max: Number(profile?.vo2max) || null,
  }
}

/**
 * Energy cost of one completed session.
 *
 * Carbohydrate is reported as the in-run fuelling requirement rather than an
 * oxidation share of the kcal figure. Converting kcal to grams needs an
 * assumed carbohydrate contribution, and that number would be invented — the
 * 30-60 g/h band is the one the methodology actually stands behind, so the
 * tool reports what to eat during rather than a fabricated substrate split.
 */
export function estimateSessionCost({ session, run, profile }) {
  const athlete = athleteFrom(profile)
  if (!athlete) {
    return { available: false, reason: 'No bodyweight on record, so energy cost cannot be estimated.' }
  }

  if (run) {
    const { kcal, source } = calculateRunKcal(run, athlete)
    const minutes = Number(run.duration_minutes) || 0
    return {
      available: true,
      type: 'run',
      kcal: Math.round(kcal),
      method: source,
      duration_minutes: minutes || null,
      miles: run.miles ?? null,
      // Only sessions long enough to warrant fuelling get a range at all.
      fuelling: minutes > 90
        ? {
            during_carb_g_per_hour: [30, 60],
            total_carb_g: [Math.round((30 * minutes) / 60), Math.round((60 * minutes) / 60)],
            note: 'Up to 90 g/h with a glucose:fructose mix for a long or racing effort, and only with a trained gut.',
          }
        : null,
    }
  }

  if (session) {
    let method = 'flat'
    if (session.duration) method = 'duration'
    else if (session.totalVolume) method = 'volume'

    const kcal = estimateStrengthCalories(
      {
        totalDuration: Number(session.duration) || 0,
        totalVolume: Number(session.totalVolume) || 0,
        sessionCount: 1,
      },
      athlete.weightLbs
    )
    return {
      available: true,
      type: 'lift',
      kcal: Math.round(kcal),
      method,
      duration_minutes: Number(session.duration) || null,
      fuelling: null,
    }
  }

  return { available: false, reason: 'No session or run supplied.' }
}

/**
 * Today's estimated expenditure against today's intake.
 *
 * Deliberately reports both halves and their difference rather than a verdict:
 * the coach should say "you're 900 under" and reason about it, not be handed a
 * pass/fail it would then have to justify.
 */
export function estimateEnergyBalance({ profile, lastSession, todayRuns = [], consumed, dateId }) {
  const athlete = athleteFrom(profile)
  if (!athlete) return null
  if (!athlete.heightCm && !athlete.bodyFatPct) return null

  const bmr = calculateBMR(athlete)

  // Only sessions from today count toward today's expenditure.
  const sessionToday = lastSession?.date?.slice(0, 10) === dateId ? lastSession : null
  const strengthKcal = sessionToday
    ? estimateStrengthCalories(
        { totalDuration: sessionToday.duration || 0, totalVolume: sessionToday.totalVolume || 0, sessionCount: 1 },
        athlete.weightLbs
      )
    : 0

  // Gross from Keytel, then net of the resting metabolism those minutes already
  // carried inside the activity factor.
  const runMinutes = todayRuns.reduce((s, r) => s + (Number(r.duration_minutes) || 0), 0)
  const runKcalGross = todayRuns.reduce((sum, run) => sum + calculateRunKcal(run, athlete).kcal, 0)
  const runKcal = netRunKcal(runKcalGross, bmr, runMinutes)

  const expenditure = calculateTDEE(bmr, runKcal, strengthKcal)

  const intake = Math.round(consumed?.kcal || 0)
  return {
    bmr: Math.round(bmr),
    strengthKcal: Math.round(strengthKcal),
    runKcal: Math.round(runKcal),
    runKcalGross: Math.round(runKcalGross),
    runMinutes: Math.round(runMinutes),
    // Always, now. The field is kept so nothing reading it has to guess.
    runInTotal: true,
    expenditure: Math.round(expenditure),
    intake,
    balance: intake - Math.round(expenditure),
    basis: 'BMR x1.5 + lifting + run (net of resting)',
  }
}

// ── Weight trend ──────────────────────────────────────────────

/**
 * The app refuses to act on fewer than three weeks of weigh-ins, because a
 * single reading is water rather than tissue and reacting to it sends the
 * surplus oscillating. Mirrors MIN_TREND_WEEKS in src/lib/macroCalculator.js.
 */
export const MIN_TREND_WEEKS = 3

export function summariseBodyMetrics(entries = [], weeks = 8) {
  const sorted = [...entries]
    .filter((e) => e.date && Number(e.weight))
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  if (!sorted.length) {
    return { available: false, reason: 'No weigh-ins recorded.', entries: 0 }
  }

  const first = sorted[0]
  const last = sorted.at(-1)
  const spanDays = (new Date(last.date) - new Date(first.date)) / 86400000
  const weeksOfData = spanDays / 7

  const base = {
    entries: sorted.length,
    weeksOfData: Math.round(weeksOfData * 10) / 10,
    latest: {
      date: last.date,
      weight: Number(last.weight),
      bodyFatPct: last.bodyFatPct == null ? null : Number(last.bodyFatPct),
      leanMass: last.leanMass == null ? null : Number(last.leanMass),
    },
  }

  if (weeksOfData < MIN_TREND_WEEKS || sorted.length < 2) {
    return {
      ...base,
      available: false,
      reason: `Need ${MIN_TREND_WEEKS} weeks of weigh-ins before reading a trend — a single reading is water, not tissue.`,
    }
  }

  const changeLbs = Number(last.weight) - Number(first.weight)
  const weeklyChangeLbs = changeLbs / weeksOfData
  return {
    ...base,
    available: true,
    windowWeeks: weeks,
    changeLbs: Math.round(changeLbs * 10) / 10,
    weeklyChangeLbs: Math.round(weeklyChangeLbs * 100) / 100,
    weeklyChangePct: Math.round((weeklyChangeLbs / Number(first.weight)) * 10000) / 100,
    bodyFatChange:
      first.bodyFatPct != null && last.bodyFatPct != null
        ? Math.round((Number(last.bodyFatPct) - Number(first.bodyFatPct)) * 10) / 10
        : null,
  }
}
