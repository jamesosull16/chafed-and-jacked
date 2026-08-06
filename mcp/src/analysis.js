/**
 * LOCAL-ONLY ANALYSIS TOOLS — Chafed & Jacked
 *
 * The five tools the hosted server cannot offer.
 *
 * Everything else this server exposes — all twenty-eight CRUD tools — is
 * imported from `functions/src/mcp/`, so there is exactly one implementation
 * of each and no second copy to drift. What lives here is the genuine
 * asymmetry: a local process can import `src/lib`, and the Cloud Functions
 * bundle cannot, because only `functions/` is uploaded on deploy.
 *
 * That difference is worth something specific. The app's macro engine, its
 * chain-balance analysis and its volume landmarks are real work, and running
 * them live against current data beats reading whatever figure happened to be
 * written onto a day. The hosted server reads the stored ones and says so;
 * this one computes them.
 *
 * Pure of transport — it takes a store and returns handlers, like every other
 * tool module here.
 */

import { getNutritionAdvice } from '../../src/lib/nutritionAdvice.js'
import { assessRateOfGain } from '../../src/lib/macroCalculator.js'
import { normalizeProfile, MODES } from '../../src/lib/appMode.js'
import { calculateAge } from '../../src/lib/bodyMetrics.js'
import {
  getBlockStatus,
  getSplitIndexForDate,
} from '../../src/lib/strength/strengthPeriodization.js'
import { analyzeBalance, laggingMuscles } from '../../src/lib/strength/chainBalance.js'
import { hamstringStageFor, activeGuardrails } from '../../src/lib/strength/injuryGuardrails.js'
import { mobilityAdherence } from '../../src/lib/strength/mobility.js'

const WEEKS = {
  type: 'number',
  description: 'Window in weeks.',
}

export const ANALYSIS_DEFINITIONS = [
  {
    name: 'get_targets',
    description:
      "Compute today's macro targets live from the athlete's current weight, block phase and " +
      'whether it is a training day. Prefer this over the stored figures list_meals returns when ' +
      'the day has not been logged yet, or when a weigh-in has landed since the app last wrote ' +
      'them. Returns the derivation too — BMR, TDEE, and the surplus or deficit applied.',
    inputSchema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'Local YYYY-MM-DD. Defaults to today.' } },
    },
  },
  {
    name: 'get_block_status',
    description:
      'Where the athlete is in the training block — week, mesocycle, phase, target RIR, and the ' +
      'volume and load multipliers that follow from it. Read this before advising on how hard a ' +
      'session should be: a deload week and an accumulation week want opposite answers. Includes ' +
      'the active injury guardrails and the current hamstring rehab stage.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_chain_balance',
    description:
      'Posterior-to-anterior set balance, per-muscle weekly volume against the landmarks, ' +
      'left/right asymmetry and push/pull balance. This is what the block is actually steered ' +
      'by — call it for any question about whether training is balanced, whether a muscle is ' +
      'under- or over-worked, or what to add.',
    inputSchema: { type: 'object', properties: { weeks: { ...WEEKS, description: 'Defaults to 1.' } } },
  },
  {
    name: 'get_training_summary',
    description:
      'Recent sessions in full — every exercise, every set, with block week and target RIR — ' +
      'plus mobility adherence over the window. More detail than list_workouts: use when the ' +
      'answer depends on how individual sets went rather than that a session happened.',
    inputSchema: { type: 'object', properties: { weeks: { ...WEEKS, description: 'Defaults to 2.' } } },
  },
  {
    name: 'get_body_metrics',
    description:
      'Weight and body-fat trend with the weekly rate of change, assessed against the athlete\'s ' +
      'body-composition goal. Enforces the same rule the app does: with fewer than three weeks ' +
      'of weigh-ins it reports the readings and refuses a trend, because a single reading is ' +
      'water rather than tissue. Do not compute a trend yourself when it says it has too few.',
    inputSchema: { type: 'object', properties: { weeks: { ...WEEKS, description: 'Defaults to 8.' } } },
  },
]

/** Local YYYY-MM-DD. */
function localDay(date = new Date()) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

export function createAnalysisHandlers({ store }) {
  /** Latest bodyweight and body fat, falling back to the onboarding figures. */
  async function latestMetrics(profile) {
    const metrics = await store.query('bodyMetrics', {
      orderField: 'date',
      direction: 'desc',
      limit: 1,
    })
    if (metrics.length) {
      return { weightLbs: metrics[0].weight, bodyFatPct: metrics[0].bodyFatPct || null }
    }
    return {
      weightLbs: profile?.onboarding?.initialWeight || null,
      bodyFatPct: profile?.onboarding?.initialBodyFat || null,
    }
  }

  /** Today's logged strength work, in the shape the nutrition engine expects. */
  async function todayLiftStats(dateId) {
    const sessions = await store.query('workoutSessions', {
      orderField: 'date',
      direction: 'desc',
      limit: 10,
    })
    const today = sessions.filter((s) => s.date?.slice(0, 10) === dateId)
    if (!today.length) return null
    return {
      totalVolume: today.reduce((sum, s) => sum + (s.totalVolume || 0), 0),
      totalDuration: today.reduce((sum, s) => sum + (s.duration || 0), 0),
      sessionCount: today.length,
    }
  }

  async function recentSessions(limit = 60) {
    return store.query('workoutSessions', { orderField: 'date', direction: 'desc', limit })
  }

  return {
    async get_targets({ date } = {}) {
      const dateId = date || localDay()
      const profile = normalizeProfile(await store.getProfile())
      const { weightLbs, bodyFatPct } = await latestMetrics(profile)
      if (!weightLbs) {
        throw new Error('No bodyweight on record — log a weigh-in before asking for targets.')
      }

      const isStrength = profile.mode !== MODES.RUNNING
      const days = profile.strength?.trainingDayIndices || [1, 2, 4, 5]
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
          isTrainingDay: getSplitIndexForDate(new Date(`${dateId}T12:00:00`), days) !== null,
        },
      })
      if (!advice) throw new Error('Could not compute targets.')

      return {
        date: dateId,
        mode: profile.mode,
        computedLive: true,
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
    },

    async get_block_status() {
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
    },

    async get_chain_balance({ weeks = 1 } = {}) {
      const profile = normalizeProfile(await store.getProfile())
      const { injuryFlags, blockStart, blockEnd } = profile.strength
      const blockWeek = getBlockStatus(blockStart, blockEnd).blockWeek
      const opts = { weeks, injuryFlags, hamstringStage: hamstringStageFor(blockWeek).stage }

      const sessions = await recentSessions()
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
          ...analysis.leftRight
            .filter((lr) => lr.imbalanced)
            .map((lr) => `${lr.name}: ${lr.deltaPct}% side-to-side gap`),
          ...laggingMuscles(sessions, opts).map((m) => `${m.muscle} is ${m.status} at ${m.sets} sets`),
        ],
      }
    },

    async get_training_summary({ weeks = 2 } = {}) {
      const sessions = await recentSessions()
      const cutoff = new Date(Date.now() - weeks * 7 * 86400000)
      const scoped = sessions.filter((s) => new Date(s.date) >= cutoff)

      return {
        weeks,
        sessionCount: scoped.length,
        sessions: scoped.map((s) => ({
          id: s.id,
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
              isBodyweight: !!set.isBodyweight,
              addedWeight: set.addedWeight ?? 0,
            })),
          })),
        })),
        mobility: mobilityAdherence(scoped, { weeks }),
      }
    },

    async get_body_metrics({ weeks = 8 } = {}) {
      const profile = normalizeProfile(await store.getProfile())
      const entries = await store.query('bodyMetrics', {
        orderField: 'date',
        direction: 'desc',
        limit: 60,
      })
      const cutoff = new Date(Date.now() - weeks * 7 * 86400000)
      const scoped = entries.filter((e) => new Date(e.date) >= cutoff)

      // The weekly rate across the window, from its endpoints. Left null below
      // three weeks of data — the app refuses a trend there and so does this,
      // because a single reading is water rather than tissue.
      let rate = null
      if (scoped.length >= 2) {
        const newest = scoped[0]
        const oldest = scoped[scoped.length - 1]
        const spanWeeks = (new Date(newest.date) - new Date(oldest.date)) / (7 * 86400000)
        if (spanWeeks > 0) {
          rate = assessRateOfGain({
            weeklyChangeLbs: (newest.weight - oldest.weight) / spanWeeks,
            bodyWeightLbs: newest.weight,
            bodyCompGoal: profile.strength.bodyCompGoal,
            currentSurplus: profile.strength.calorieSurplus,
            weeksOfData: Math.round(spanWeeks),
          })
        }
      }

      return {
        weeks,
        readings: scoped.map((e) => ({
          id: e.id,
          date: String(e.date).slice(0, 10),
          weight: e.weight ?? null,
          bodyFatPct: e.bodyFatPct ?? null,
        })),
        latest: scoped[0]
          ? { weight: scoped[0].weight, bodyFatPct: scoped[0].bodyFatPct ?? null }
          : null,
        rate,
        bodyCompGoal: profile.strength.bodyCompGoal ?? null,
      }
    },
  }
}
