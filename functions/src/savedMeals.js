/**
 * SAVED MEALS — server copy
 *
 * The scaling and naming rules for the meal library, duplicated from
 * `src/lib/savedMeals.js` because the Cloud Functions bundle uploads only
 * `functions/` and cannot import the client's copy.
 *
 * Same argument as `coach/energy.js` and `coach/guardrails.js`: a copy with a
 * parity test beats a second, quietly diverging implementation. If a saved meal
 * logged from a Claude conversation scaled differently from the same meal
 * logged in the app, the day's totals would depend on which door it came
 * through. `functions/__tests__/savedMealsParity.test.js` fails the build if
 * these drift.
 */

const MAX_NAME = 80

function round(value, decimals = 0) {
  const f = 10 ** decimals
  return Math.round((Number(value) || 0) * f) / f
}

export function libraryKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function normaliseName(name, fallback = 'Meal') {
  const trimmed = String(name || '').trim().replace(/\s+/g, ' ')
  return (trimmed || fallback).slice(0, MAX_NAME)
}

export function normaliseQuantity(quantity) {
  const q = Number(quantity)
  if (!Number.isFinite(q) || q <= 0) return 1
  return Math.min(20, round(q, 2))
}

export function scaleMacros(meal, quantity = 1) {
  const factor = normaliseQuantity(quantity)
  return {
    kcal: round((meal?.kcal || 0) * factor),
    protein: round((meal?.protein || 0) * factor, 1),
    carbs: round((meal?.carbs || 0) * factor, 1),
    fat: round((meal?.fat || 0) * factor, 1),
  }
}

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

export function scaledLabel(name, quantity = 1) {
  const factor = normaliseQuantity(quantity)
  const clean = normaliseName(name)
  return factor === 1 ? clean : `${clean} (${factor}×)`
}

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

export function sortSavedMeals(meals = []) {
  return [...meals].sort((a, b) => {
    const used = String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || ''))
    if (used !== 0) return used
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  })
}

/**
 * Resolve what a model called a meal to a stored one.
 *
 * Exact name first, then a unique substring — "the usual oats" should find
 * "Overnight oats" without a database id changing hands. An ambiguous name
 * resolves to nothing and returns its candidates, so the caller can ask which
 * one rather than logging a coin-flip: silently picking the closer of two
 * breakfasts writes the wrong macros with no sign anything went wrong.
 *
 * @returns {{ match: Object|null, candidates: Object[] }}
 */
export function matchSavedMeal(meals = [], query = '') {
  const key = libraryKey(query)
  if (!key) return { match: null, candidates: [] }

  const exact = meals.filter((m) => libraryKey(m.name) === key)
  if (exact.length === 1) return { match: exact[0], candidates: exact }
  if (exact.length > 1) return { match: null, candidates: exact }

  const partial = meals.filter(
    (m) => libraryKey(m.name).includes(key) || key.includes(libraryKey(m.name))
  )
  if (partial.length === 1) return { match: partial[0], candidates: partial }
  return { match: null, candidates: partial }
}
