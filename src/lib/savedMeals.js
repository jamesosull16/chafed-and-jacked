/**
 * SAVED MEALS — Chafed & Jacked
 *
 * The meal library: a meal estimated once, kept, and logged again without
 * asking a model to re-derive numbers it already got right. Everything here is
 * pure — the Firestore side lives in `hooks/useSavedMeals.js`.
 *
 * A saved meal stores ONE serving. Quantity is applied at log time rather than
 * baked in, because "the usual, but a double portion" is the common case and
 * saving a second near-identical entry for it is how a library turns into a
 * junk drawer.
 *
 * `functions/src/savedMeals.js` is a copy of the scaling and naming rules for
 * the Cloud Functions bundle, which cannot import this file. The two are held
 * together by `functions/__tests__/savedMealsParity.test.js`.
 */

/** Offered as one-tap chips in the log sheet; any positive number is allowed. */
export const QUANTITY_PRESETS = [0.5, 1, 1.5, 2]

const MAX_NAME = 80

function round(value, decimals = 0) {
  const f = 10 ** decimals
  return Math.round((Number(value) || 0) * f) / f
}

/**
 * The key a saved meal is matched on.
 *
 * Case- and whitespace-insensitive so "Overnight oats" and "overnight  oats"
 * are the same meal — saving the second should update the first, not sit
 * beside it. Also what the coach resolves a spoken name against.
 */
export function libraryKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** Clean a user- or model-supplied name into what gets stored. */
export function normaliseName(name, fallback = 'Meal') {
  const trimmed = String(name || '').trim().replace(/\s+/g, ' ')
  return (trimmed || fallback).slice(0, MAX_NAME)
}

/** A quantity that can safely multiply macros. Anything else falls back to 1×. */
export function normaliseQuantity(quantity) {
  const q = Number(quantity)
  if (!Number.isFinite(q) || q <= 0) return 1
  // 20× a meal is a typo, not a portion; capping beats writing 40,000 kcal.
  return Math.min(20, round(q, 2))
}

/** One serving's macros, multiplied out. Entry field names, not estimate ones. */
export function scaleMacros(meal, quantity = 1) {
  const factor = normaliseQuantity(quantity)
  return {
    kcal: round((meal?.kcal || 0) * factor),
    protein: round((meal?.protein || 0) * factor, 1),
    carbs: round((meal?.carbs || 0) * factor, 1),
    fat: round((meal?.fat || 0) * factor, 1),
  }
}

/**
 * The itemised breakdown, multiplied out.
 *
 * Kept rather than dropped so a scaled meal still explains itself on the card
 * and in history. `quantity` is the human-readable portion string from the
 * original estimate, which no longer describes a scaled item, so it is left
 * alone only at 1× and otherwise annotated.
 */
export function scaleItems(items, quantity = 1) {
  const factor = normaliseQuantity(quantity)
  if (!Array.isArray(items) || items.length === 0) return []
  return items.map((item) => ({
    ...item,
    grams: round((Number(item.grams) || 0) * factor, 1),
    kcal: round((Number(item.kcal) || 0) * factor),
    protein_g: round((Number(item.protein_g) || 0) * factor, 1),
    carbs_g: round((Number(item.carbs_g) || 0) * factor, 1),
    fat_g: round((Number(item.fat_g) || 0) * factor, 1),
    ...(factor !== 1 && item.quantity && { quantity: `${item.quantity} × ${factor}` }),
  }))
}

/** How a scaled meal is labelled on the day's log. */
export function scaledLabel(name, quantity = 1) {
  const factor = normaliseQuantity(quantity)
  const clean = normaliseName(name)
  return factor === 1 ? clean : `${clean} (${factor}×)`
}

/**
 * Turn a saved meal into an entry for `nutritionLogs/{date}.entries`.
 *
 * `macros` overrides the scaled figures — the log sheet lets the numbers be
 * edited after the quantity is set, and a hand-corrected value has to win over
 * the arithmetic that produced it.
 */
export function savedMealToEntry(meal, { quantity = 1, macros, id, loggedAt, mealType } = {}) {
  const factor = normaliseQuantity(quantity)
  const scaled = scaleMacros(meal, factor)
  const items = scaleItems(meal?.items, factor)
  const type = mealType ?? meal?.mealType

  return {
    id,
    label: scaledLabel(meal?.name, factor),
    kcal: round(macros?.kcal ?? scaled.kcal),
    protein: round(macros?.protein ?? scaled.protein, 1),
    carbs: round(macros?.carbs ?? scaled.carbs, 1),
    fat: round(macros?.fat ?? scaled.fat, 1),
    loggedAt: loggedAt || new Date().toISOString(),
    source: 'library',
    ...(meal?.id && { savedMealId: meal.id }),
    ...(factor !== 1 && { quantity: factor }),
    ...(items.length && { items }),
    ...(meal?.confidence && { confidence: meal.confidence }),
    ...(meal?.assumptions?.length && { assumptions: meal.assumptions }),
    ...(type && { mealType: type }),
  }
}

/**
 * Turn a logged entry into the saved shape.
 *
 * Deliberately drops `loggedAt`, `id` and `source`: what is being kept is the
 * meal, not the occasion it was eaten on. A previously scaled entry is stored
 * as-eaten — dividing back out to a notional single serving would invent a
 * portion that was never estimated.
 */
export function entryToSavedMeal(entry, { name } = {}) {
  return {
    name: normaliseName(name || entry?.label),
    kcal: round(entry?.kcal),
    protein: round(entry?.protein, 1),
    carbs: round(entry?.carbs, 1),
    fat: round(entry?.fat, 1),
    ...(entry?.items?.length && { items: entry.items }),
    ...(entry?.confidence && { confidence: entry.confidence }),
    ...(entry?.assumptions?.length && { assumptions: entry.assumptions }),
    ...(entry?.mealType && { mealType: entry.mealType }),
  }
}

/**
 * Library order: what he reaches for most, first.
 *
 * Recently used beats recently saved, and a never-used meal sorts by when it
 * was added — so a meal saved today is visible without having to be logged
 * first, but doesn't outrank the breakfast he has four times a week.
 */
export function sortSavedMeals(meals = []) {
  return [...meals].sort((a, b) => {
    const used = String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || ''))
    if (used !== 0) return used
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  })
}

/**
 * Name search, plus the itemised breakdown.
 *
 * Searching items too is what makes "salmon" find "Tuesday dinner" — the
 * library is named by dish, and the thing remembered about a dish is often
 * what was in it.
 */
export function searchSavedMeals(meals = [], query = '') {
  const q = libraryKey(query)
  if (!q) return meals
  return meals.filter((meal) => {
    if (libraryKey(meal.name).includes(q)) return true
    return (meal.items || []).some((item) => libraryKey(item.name).includes(q))
  })
}
