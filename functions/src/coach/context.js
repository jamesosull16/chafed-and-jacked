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
  const [profile, log] = await Promise.all([
    store.getProfile(),
    store.getDoc('nutritionLogs', dateId),
  ])

  const entries = log?.entries || []
  const consumed = consumedFrom(entries)
  const targets = macroSet(clientContext.targets)

  const guardrails = deriveGuardrails(profile, now)

  return {
    date: dateId,
    mode: profile?.mode || 'strength',
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
