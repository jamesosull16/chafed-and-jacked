/**
 * MCP TOOL IMPLEMENTATIONS — Chafed & Jacked
 *
 * Reads and writes exactly the collections the PWA uses, so a meal logged from
 * a Claude conversation is indistinguishable from one logged in the app.
 *
 * Macro targets and training analysis are computed by importing the app's own
 * pure modules — there is no second copy of the maths to drift out of sync.
 */

import { randomUUID } from 'node:crypto'

import * as store from './firestore.js'
import { toLogEntry, validateEstimate } from '../../functions/src/schema.js'
import { getNutritionAdvice } from '../../src/lib/nutritionAdvice.js'
import { assessRateOfGain } from '../../src/lib/macroCalculator.js'
import { normalizeProfile, MODES } from '../../src/lib/appMode.js'
import { calculateAge } from '../../src/lib/bodyMetrics.js'
import { getBlockStatus, getSplitIndexForDate } from '../../src/lib/strength/strengthPeriodization.js'
import { analyzeBalance, laggingMuscles } from '../../src/lib/strength/chainBalance.js'
import { hamstringStageFor, activeGuardrails } from '../../src/lib/strength/injuryGuardrails.js'
import { mobilityAdherence } from '../../src/lib/strength/mobility.js'

/** Call the deployed Cloud Function so the API keys stay server-side. */
async function callEstimator({ description, imageBase64, mediaType }, config) {
  if (!config.estimatorUrl || !config.sharedSecret) {
    throw new Error(
      'Meal estimation is not configured. Set CJ_ESTIMATOR_URL and CJ_SHARED_SECRET.'
    )
  }
  const res = await fetch(config.estimatorUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cj-secret': config.sharedSecret },
    body: JSON.stringify({ description, imageBase64, mediaType }),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error || `Estimator returned ${res.status}`)
  return payload
}

/** Latest bodyweight + body fat, falling back to onboarding values. */
async function latestMetrics(profile) {
  const metrics = await store.queryCollection('bodyMetrics', {
    orderField: 'date',
    direction: 'desc',
    limit: 1,
  })
  if (metrics.length > 0) {
    return { weightLbs: metrics[0].weight, bodyFatPct: metrics[0].bodyFatPct || null }
  }
  return {
    weightLbs: profile?.onboarding?.initialWeight || null,
    bodyFatPct: profile?.onboarding?.initialBodyFat || null,
  }
}

/** Whether `date` is a scheduled training day for this athlete. */
function isTrainingDay(profile, date = new Date()) {
  const days = profile?.strength?.trainingDayIndices || [1, 2, 4, 5]
  return getSplitIndexForDate(date, days) !== null
}

/** Aggregate today's logged strength sessions, matching useWorkout's shape. */
async function todayLiftStats(dateId) {
  const sessions = await store.queryCollection('workoutSessions', {
    orderField: 'date',
    direction: 'desc',
    limit: 10,
  })
  const today = sessions.filter((s) => s.date?.slice(0, 10) === dateId)
  if (today.length === 0) return null
  return {
    totalVolume: today.reduce((sum, s) => sum + (s.totalVolume || 0), 0),
    totalDuration: today.reduce((sum, s) => sum + (s.duration || 0), 0),
    sessionCount: today.length,
  }
}

/** Compute the day's macro targets from the athlete's live profile. */
async function computeTargets(dateId) {
  const profile = normalizeProfile(await store.getProfile())
  const { weightLbs, bodyFatPct } = await latestMetrics(profile)

  if (!weightLbs) {
    return { error: 'No bodyweight on record — log a weigh-in in the app first.' }
  }

  const isStrength = profile.mode !== MODES.RUNNING
  const advice = getNutritionAdvice({
    weightLbs,
    heightInches: profile.profile?.heightInches || 0,
    ageYears: calculateAge(profile.profile?.birthday),
    sex: profile.profile?.biologicalSex || 'male',
    currentBodyFatPct: bodyFatPct,
    todayLiftStats: await todayLiftStats(dateId),
    mode: isStrength ? 'strength' : 'running',
    strength: {
      ...profile.strength,
      isTrainingDay: isTrainingDay(profile, new Date(`${dateId}T12:00:00`)),
    },
  })

  if (!advice) return { error: 'Could not compute targets.' }

  return {
    date: dateId,
    mode: profile.mode,
    targets: {
      kcal: advice.calories.target,
      protein_g: advice.protein.grams,
      carbs_g: Math.round((advice.carbs.lowGrams + advice.carbs.highGrams) / 2),
      fat_g: advice.fat.grams,
    },
    derivation: {
      basis: advice.calories.breakdown,
      bmr: advice.bmr,
      tdee: advice.tdee,
      surplus: advice.surplus ?? null,
      deficit: advice.deficit ?? null,
      bodyCompGoal: advice.bodyCompGoal ?? null,
      proteinRationale: advice.protein.rationale,
      carbGuidance: advice.carbs.guidance,
    },
  }
}

function consumedFrom(entries = []) {
  return entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + (e.kcal || 0),
      protein_g: acc.protein_g + (e.protein || 0),
      carbs_g: acc.carbs_g + (e.carbs || 0),
      fat_g: acc.fat_g + (e.fat || 0),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )
}

const round1 = (n) => Math.round(n * 10) / 10

// ── Tools ────────────────────────────────────────────────────────────

export async function log_meal({ description, image, mediaType, mealType, when }, config) {
  if (!description && !image) {
    throw new Error('Provide a description, an image, or both.')
  }

  const estimate = await callEstimator(
    { description, imageBase64: image, mediaType: mediaType || 'image/jpeg' },
    config
  )

  const validated = validateEstimate(estimate)
  if (!validated.ok) throw new Error(validated.error)

  const dateId = when ? store.localDateId(new Date(when)) : store.localDateId()
  const existing = await store.getDoc('nutritionLogs', dateId)
  const targetsResult = await computeTargets(dateId)

  const entry = toLogEntry(validated.estimate, {
    id: randomUUID(),
    description,
    mealType,
    source: image ? 'photo' : 'text',
    loggedAt: when ? new Date(when).toISOString() : new Date().toISOString(),
  })

  const entries = [...(existing?.entries || []), entry]
  await store.setDoc('nutritionLogs', dateId, {
    date: dateId,
    entries,
    ...(targetsResult.targets && {
      targets: {
        kcal: targetsResult.targets.kcal,
        protein: targetsResult.targets.protein_g,
        carbs: targetsResult.targets.carbs_g,
        fat: targetsResult.targets.fat_g,
      },
    }),
  })

  const consumed = consumedFrom(entries)
  return {
    logged: entry,
    grounded: estimate.grounded,
    confidence: validated.estimate.confidence,
    assumptions: validated.estimate.assumptions,
    dayTotals: consumed,
    remaining: targetsResult.targets
      ? {
          kcal: Math.round(targetsResult.targets.kcal - consumed.kcal),
          protein_g: round1(targetsResult.targets.protein_g - consumed.protein_g),
          carbs_g: round1(targetsResult.targets.carbs_g - consumed.carbs_g),
          fat_g: round1(targetsResult.targets.fat_g - consumed.fat_g),
        }
      : null,
  }
}

export async function get_today_macros({ date } = {}) {
  const dateId = date || store.localDateId()
  const [log, targetsResult] = await Promise.all([
    store.getDoc('nutritionLogs', dateId),
    computeTargets(dateId),
  ])

  const entries = log?.entries || []
  const consumed = consumedFrom(entries)
  const targets = targetsResult.targets

  return {
    date: dateId,
    targets: targets || null,
    consumed: {
      kcal: Math.round(consumed.kcal),
      protein_g: round1(consumed.protein_g),
      carbs_g: round1(consumed.carbs_g),
      fat_g: round1(consumed.fat_g),
    },
    remaining: targets
      ? {
          kcal: Math.round(targets.kcal - consumed.kcal),
          protein_g: round1(targets.protein_g - consumed.protein_g),
          carbs_g: round1(targets.carbs_g - consumed.carbs_g),
          fat_g: round1(targets.fat_g - consumed.fat_g),
        }
      : null,
    entries,
    ...(targetsResult.error && { error: targetsResult.error }),
  }
}

export async function get_targets({ date } = {}) {
  return computeTargets(date || store.localDateId())
}

export async function list_recent_meals({ days = 7 } = {}) {
  const out = []
  for (let i = 0; i < days; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateId = store.localDateId(d)
    const log = await store.getDoc('nutritionLogs', dateId)
    if (log?.entries?.length) {
      out.push({ date: dateId, totals: consumedFrom(log.entries), entries: log.entries })
    }
  }
  return { days, logged: out.length, meals: out }
}

export async function update_meal({ id, date, ...patch }) {
  const dateId = date || store.localDateId()
  const log = await store.getDoc('nutritionLogs', dateId)
  if (!log?.entries) throw new Error(`No meals logged on ${dateId}.`)

  const index = log.entries.findIndex((e) => e.id === id)
  if (index === -1) throw new Error(`No meal with id ${id} on ${dateId}.`)

  const allowed = ['label', 'kcal', 'protein', 'carbs', 'fat', 'mealType', 'description']
  const updates = Object.fromEntries(
    Object.entries(patch).filter(([k, v]) => allowed.includes(k) && v !== undefined)
  )

  const entries = [...log.entries]
  entries[index] = { ...entries[index], ...updates, editedAt: new Date().toISOString() }
  await store.setDoc('nutritionLogs', dateId, { date: dateId, entries })

  return { updated: entries[index], dayTotals: consumedFrom(entries) }
}

export async function delete_meal({ id, date }) {
  const dateId = date || store.localDateId()
  const log = await store.getDoc('nutritionLogs', dateId)
  if (!log?.entries) throw new Error(`No meals logged on ${dateId}.`)

  const entries = log.entries.filter((e) => e.id !== id)
  if (entries.length === log.entries.length) throw new Error(`No meal with id ${id} on ${dateId}.`)

  await store.setDoc('nutritionLogs', dateId, { date: dateId, entries })
  return { deleted: id, remaining: entries.length, dayTotals: consumedFrom(entries) }
}

export async function get_block_status() {
  const profile = normalizeProfile(await store.getProfile())
  const { blockStart, blockEnd, injuryFlags } = profile.strength
  const status = getBlockStatus(blockStart, blockEnd)

  return {
    mode: profile.mode,
    blockWeek: status.blockWeek,
    totalWeeks: status.totalWeeks,
    weeksRemaining: status.weeksRemaining,
    mesocycle: status.mesocycle,
    weekInMesocycle: status.weekInMesocycle,
    phase: status.phase,
    rirTarget: status.rirTarget,
    volumeMultiplier: status.volumeMultiplier,
    loadMultiplier: status.loadMultiplier,
    label: status.label,
    blockStart,
    blockEnd,
    injuryFlags,
    hamstringStage: injuryFlags.includes('highHamstring')
      ? hamstringStageFor(status.blockWeek)
      : null,
    guardrails: activeGuardrails({ injuryFlags, blockWeek: status.blockWeek }),
  }
}

export async function get_training_summary({ weeks = 2 } = {}) {
  const sessions = await store.queryCollection('workoutSessions', {
    orderField: 'date',
    direction: 'desc',
    limit: 60,
  })
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - weeks * 7)
  const scoped = sessions.filter((s) => new Date(s.date) >= cutoff)

  return {
    weeks,
    sessionCount: scoped.length,
    sessions: scoped.map((s) => ({
      date: s.date,
      dayId: s.dayId || s.dayType || null,
      name: s.name || null,
      durationMinutes: s.duration || null,
      totalVolume: s.totalVolume || 0,
      blockWeek: s.blockWeek ?? null,
      rirTarget: s.rirTarget ?? null,
      exercises: (s.exercises || []).map((ex) => ({
        exerciseId: ex.id,
        sets: (ex.sets || []).map((set) => ({
          weight: set.weight,
          reps: set.reps,
          rir: set.rir ?? null,
          side: set.side ?? null,
        })),
      })),
    })),
    mobility: mobilityAdherence(scoped, { weeks }),
  }
}

export async function get_chain_balance({ weeks = 1 } = {}) {
  const profile = normalizeProfile(await store.getProfile())
  const { injuryFlags, blockStart, blockEnd } = profile.strength
  const blockWeek = getBlockStatus(blockStart, blockEnd).blockWeek
  const hamstringStage = hamstringStageFor(blockWeek).stage

  const sessions = await store.queryCollection('workoutSessions', {
    orderField: 'date',
    direction: 'desc',
    limit: 60,
  })

  const opts = { weeks, injuryFlags, hamstringStage }
  const analysis = analyzeBalance(sessions, opts)

  return {
    weeks,
    ratio: analysis.chain.ratio,
    posteriorSets: analysis.chain.posteriorSets,
    anteriorSets: analysis.chain.anteriorSets,
    status: analysis.chain.status,
    message: analysis.chain.message,
    perMuscle: Object.fromEntries(
      analysis.volume.map((v) => [
        v.muscle,
        { sets: v.sets, target: v.target, status: v.status, capped: v.capped },
      ])
    ),
    leftRight: analysis.leftRight.map((lr) => ({
      exerciseId: lr.exerciseId,
      name: lr.name,
      leftVolume: Math.round(lr.left),
      rightVolume: Math.round(lr.right),
      deltaPct: lr.deltaPct,
      strongerSide: lr.strongerSide,
      imbalanced: lr.imbalanced,
    })),
    pushPull: analysis.pushPull,
    flags: [
      ...(analysis.chain.status === 'imbalanced' ? [analysis.chain.message] : []),
      ...analysis.leftRight.filter((lr) => lr.imbalanced).map((lr) => `${lr.name}: ${lr.deltaPct}% side-to-side gap`),
      ...laggingMuscles(sessions, opts).map((m) => `${m.muscle} is ${m.status} at ${m.sets} sets`),
    ],
  }
}

export async function get_body_metrics({ weeks = 8 } = {}) {
  const profile = normalizeProfile(await store.getProfile())
  const entries = await store.queryCollection('bodyMetrics', {
    orderField: 'date',
    direction: 'desc',
    limit: 60,
  })
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - weeks * 7)
  const scoped = entries.filter((e) => new Date(e.date) >= cutoff)

  // Weekly rate over the window, from the endpoints of the trend.
  let rate = null
  if (scoped.length >= 2) {
    const newest = scoped[0]
    const oldest = scoped[scoped.length - 1]
    const spanWeeks = (new Date(newest.date) - new Date(oldest.date)) / (7 * 86400000)
    if (spanWeeks > 0) {
      const weeklyChangeLbs = (newest.weight - oldest.weight) / spanWeeks
      rate = assessRateOfGain({
        weeklyChangeLbs,
        bodyWeightLbs: newest.weight,
        bodyCompGoal: profile.strength.bodyCompGoal,
        currentSurplus: profile.strength.calorieSurplus,
        weeksOfData: Math.round(spanWeeks),
      })
    }
  }

  return {
    weeks,
    entries: scoped.map((e) => ({
      date: e.date,
      weight: e.weight,
      bodyFatPct: e.bodyFatPct ?? null,
      leanMass: e.leanMass ?? null,
      fatMass: e.fatMass ?? null,
    })),
    rateOfGain: rate,
    bodyCompGoal: profile.strength.bodyCompGoal,
    currentSurplus: profile.strength.calorieSurplus,
  }
}
