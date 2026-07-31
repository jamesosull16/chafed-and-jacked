/**
 * TURN CONTEXT — Chafed & Jacked
 *
 * Assembles what the coach knows about the athlete for one turn, from two
 * sources with different trust levels:
 *
 *   Server-derived (authoritative) — the profile document, today's nutrition
 *   log, and the injury guardrails. Identity, meal ids and anything that gates
 *   a safety decision comes from here.
 *
 *   Client-supplied (advisory) — macro targets, today's session, chain balance.
 *   The client already computes these for the dashboard, and they only ever
 *   inform advice given back to the same person who sent them. Shape-validated
 *   and clamped, never trusted for identity or writes.
 */

import { deriveGuardrails } from './guardrails.js'
import {
  summariseSession,
  summariseRecentTraining,
  buildRaceContext,
  normaliseMileageDoc,
  hoursSince,
} from './training.js'

/**
 * How much history to pull for the rollup. 30 sessions and 21 mileage docs
 * comfortably cover a 14-day window even in a heavy week, and both collections
 * are small enough that a tighter limit would save nothing measurable.
 */
const SESSION_SCAN = 30
const MILEAGE_SCAN = 21

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback)

function macroSet(input) {
  if (!input) return null
  return {
    kcal: num(input.kcal),
    protein_g: num(input.protein_g ?? input.protein),
    carbs_g: num(input.carbs_g ?? input.carbs),
    fat_g: num(input.fat_g ?? input.fat),
  }
}

function sanitizeSession(session) {
  if (!session?.name || !Array.isArray(session.exercises)) return null
  return {
    name: String(session.name).slice(0, 80),
    focus: session.focus ? String(session.focus).slice(0, 120) : null,
    isToday: !!session.isToday,
    dayLabel: session.dayLabel ? String(session.dayLabel).slice(0, 20) : null,
    rirTarget: num(session.rirTarget, 2),
    estimatedMinutes: num(session.estimatedMinutes, 0),
    exercises: session.exercises.slice(0, 12).map((e) => ({
      id: String(e.id || '').slice(0, 60),
      name: String(e.name || '').slice(0, 80),
      sets: num(e.sets, 3),
      repRange: Array.isArray(e.repRange) ? [num(e.repRange[0], 8), num(e.repRange[1], 12)] : [8, 12],
      restSeconds: num(e.restSeconds, 90),
      modification: e.modification ? String(e.modification).slice(0, 240) : null,
    })),
    substitutions: Array.isArray(session.substitutions)
      ? session.substitutions.slice(0, 6).map((s) => ({
          replaced: String(s.replaced || '').slice(0, 60),
          with: String(s.with || '').slice(0, 60),
        }))
      : [],
  }
}

function sanitizeBalance(balance) {
  if (!balance) return null
  return {
    ratio: balance.ratio == null ? null : num(balance.ratio),
    posteriorSets: num(balance.posteriorSets),
    anteriorSets: num(balance.anteriorSets),
    status: String(balance.status || 'noData').slice(0, 24),
    perMuscle:
      balance.perMuscle && typeof balance.perMuscle === 'object'
        ? Object.fromEntries(
            Object.entries(balance.perMuscle)
              .slice(0, 16)
              .map(([k, v]) => [
                String(k).slice(0, 20),
                { sets: num(v?.sets), status: String(v?.status || '').slice(0, 16), capped: !!v?.capped },
              ])
          )
        : null,
  }
}

function consumedFrom(entries = []) {
  return entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + num(e.kcal),
      protein_g: acc.protein_g + num(e.protein),
      carbs_g: acc.carbs_g + num(e.carbs),
      fat_g: acc.fat_g + num(e.fat),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )
}

/**
 * @param store        uid-bound Firestore accessor
 * @param dateId       local YYYY-MM-DD
 * @param clientContext the advisory half, from the app
 */
export async function buildTurnContext({ store, dateId, clientContext = {}, now = new Date() }) {
  // Training reads are server-side and unconditional: advice about what the
  // athlete did is worthless if the client can claim he did something else.
  const [profile, log, sessions, mileageDocs, plans] = await Promise.all([
    store.getProfile(),
    store.getDoc('nutritionLogs', dateId),
    store.query('workoutSessions', { orderField: 'date', direction: 'desc', limit: SESSION_SCAN }),
    store.query('dailyMileage', { orderField: 'date', direction: 'desc', limit: MILEAGE_SCAN }),
    store.query('mileageLogs', { orderField: 'weekStart', direction: 'desc', limit: 2 }),
  ])

  const entries = log?.entries || []
  const consumed = consumedFrom(entries)
  const targets = macroSet(clientContext.targets)

  const guardrails = deriveGuardrails(profile, now)
  const mode = profile?.mode || 'strength'

  const completed = (sessions || []).filter((s) => s.completed !== false)
  const recentTraining = summariseRecentTraining({
    sessions: completed,
    mileageDocs: mileageDocs || [],
    plans: plans || [],
    now,
  })

  const todayMileage = normaliseMileageDoc(
    (mileageDocs || []).find((d) => d.date === dateId) || null
  )

  return {
    date: dateId,
    mode,
    // Most recent completed session, with hours elapsed — the difference
    // between "you lifted" and "you finished lifting two hours ago".
    lastSession: summariseSession(completed[0], now),
    todayRuns: (todayMileage?.runs || []).map((r) => ({
      miles: r.miles,
      duration_minutes: r.duration_minutes ?? null,
      avg_hr_bpm: r.avg_hr_bpm ?? null,
      hoursSince: r.enteredAt ? hoursSince(r.enteredAt, now) : null,
    })),
    todayMiles: todayMileage?.miles ?? 0,
    recentTraining,
    // Running mode only — there is no race in a strength block.
    raceContext: mode === 'running' ? buildRaceContext(profile, recentTraining.miles7, now) : null,
    targets,
    consumed,
    remaining: targets
      ? {
          kcal: targets.kcal - consumed.kcal,
          protein_g: targets.protein_g - consumed.protein_g,
          carbs_g: targets.carbs_g - consumed.carbs_g,
          fat_g: targets.fat_g - consumed.fat_g,
        }
      : null,
    derivation: clientContext.derivation || null,
    // Server-read: the model must cite real ids when correcting a meal.
    meals: entries.map((e) => ({
      id: e.id,
      label: e.label,
      kcal: num(e.kcal),
      protein: num(e.protein),
      mealType: e.mealType || null,
    })),
    session: sanitizeSession(clientContext.session),
    block: clientContext.block
      ? {
          blockWeek: guardrails.blockWeek,
          totalWeeks: num(clientContext.block.totalWeeks, 22),
          mesocycle: num(clientContext.block.mesocycle, 1),
          weekInMesocycle: num(clientContext.block.weekInMesocycle, 1),
          phase: clientContext.block.phase === 'deload' ? 'deload' : 'accumulation',
          rirTarget: num(clientContext.block.rirTarget, 2),
        }
      : { blockWeek: guardrails.blockWeek },
    balance: sanitizeBalance(clientContext.balance),
    metrics: clientContext.metrics || null,
    // Always server-derived — never taken from the client.
    injuryFlags: guardrails.injuryFlags,
    hamstringStage: guardrails.hamstringStage,
  }
}
