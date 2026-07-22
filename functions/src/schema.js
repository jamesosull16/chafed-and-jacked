/**
 * MEAL ESTIMATE CONTRACT — Chafed & Jacked
 *
 * The single source of truth for the shape of an estimated meal. Both front
 * doors (the in-app camera/describe control and the MCP server) write exactly
 * this, so a meal logged from a Claude chat is indistinguishable from one
 * logged in the PWA.
 *
 * Pure module — no network, no SDK. Safe to import from tests.
 */

/**
 * JSON Schema handed to the model via `output_config.format`. Structured
 * outputs guarantee the shape, so parsing never has to defend against prose or
 * markdown fences — but they do NOT enforce numeric ranges, which is why
 * `validateEstimate` still exists below.
 */
export const ESTIMATE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: 'One entry per distinct food identified.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Specific food name, e.g. "grilled chicken thigh"' },
          quantity: { type: 'string', description: 'Human-readable portion, e.g. "2 thighs"' },
          grams: { type: 'number', description: 'Estimated edible mass in grams' },
          kcal: { type: 'number' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' },
        },
        required: ['name', 'quantity', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
        additionalProperties: false,
      },
    },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      description:
        'high = packaged food or clearly measured portion; medium = recognisable food, estimated portion; low = obscured, mixed, or ambiguous.',
    },
    assumptions: {
      type: 'array',
      description: 'Every guess that materially affects the numbers.',
      items: { type: 'string' },
    },
  },
  required: ['items', 'confidence', 'assumptions'],
  additionalProperties: false,
}

/** Macro keys, in display order. */
export const MACRO_KEYS = ['kcal', 'protein_g', 'carbs_g', 'fat_g']

const MAX_PER_MEAL = { kcal: 8000, protein_g: 500, carbs_g: 1500, fat_g: 500 }

function round(value, decimals = 0) {
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

/** Sum item macros into a meal total. */
export function totalsFor(items = []) {
  return items.reduce(
    (acc, item) => ({
      kcal: acc.kcal + (Number(item.kcal) || 0),
      protein_g: acc.protein_g + (Number(item.protein_g) || 0),
      carbs_g: acc.carbs_g + (Number(item.carbs_g) || 0),
      fat_g: acc.fat_g + (Number(item.fat_g) || 0),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )
}

/**
 * Validate and normalise a raw model estimate into the stored shape.
 *
 * The model is constrained to the schema but not to physical reality — an
 * item claiming 4000 kcal of broccoli parses fine and would silently wreck the
 * day's totals. Anything out of range is rejected rather than clamped, because
 * a silently-corrected number is worse than a visible failure the athlete can
 * re-shoot.
 *
 * @returns {{ ok: true, estimate: Object } | { ok: false, error: string }}
 */
export function validateEstimate(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Estimate was not an object' }
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    return { ok: false, error: 'Estimate contained no food items' }
  }
  if (raw.items.length > 40) return { ok: false, error: 'Estimate contained too many items' }

  const items = []
  for (const item of raw.items) {
    for (const key of [...MACRO_KEYS, 'grams']) {
      const value = Number(item[key])
      if (!Number.isFinite(value) || value < 0) {
        return { ok: false, error: `Item "${item.name}" has an invalid ${key}` }
      }
    }
    if (!item.name || typeof item.name !== 'string') {
      return { ok: false, error: 'An item is missing a name' }
    }
    items.push({
      name: String(item.name).slice(0, 120),
      quantity: String(item.quantity || '').slice(0, 80),
      grams: round(Number(item.grams), 1),
      kcal: round(Number(item.kcal)),
      protein_g: round(Number(item.protein_g), 1),
      carbs_g: round(Number(item.carbs_g), 1),
      fat_g: round(Number(item.fat_g), 1),
      ...(item.source && { source: item.source }),
      ...(item.usdaDescription && { usdaDescription: item.usdaDescription }),
    })
  }

  const totals = totalsFor(items)
  for (const key of MACRO_KEYS) {
    if (totals[key] > MAX_PER_MEAL[key]) {
      return { ok: false, error: `Estimated ${key} (${round(totals[key])}) is implausibly high` }
    }
  }

  const confidence = ['high', 'medium', 'low'].includes(raw.confidence) ? raw.confidence : 'low'

  return {
    ok: true,
    estimate: {
      items,
      kcal: round(totals.kcal),
      protein_g: round(totals.protein_g, 1),
      carbs_g: round(totals.carbs_g, 1),
      fat_g: round(totals.fat_g, 1),
      confidence,
      assumptions: Array.isArray(raw.assumptions)
        ? raw.assumptions.slice(0, 12).map((a) => String(a).slice(0, 300))
        : [],
    },
  }
}

/**
 * Build the Firestore entry written by both front doors.
 *
 * Field names match what NutritionTracker.jsx already reads (`kcal`, `protein`,
 * `carbs`, `fat`, `label`, `id`, `loggedAt`), so existing entries and estimated
 * ones render through the same code path with no migration.
 */
export function toLogEntry(estimate, { id, description, photoUrl, source, mealType, loggedAt }) {
  return {
    id,
    label: description || estimate.items.map((i) => i.name).join(', ').slice(0, 120) || 'Meal',
    kcal: estimate.kcal,
    protein: estimate.protein_g,
    carbs: estimate.carbs_g,
    fat: estimate.fat_g,
    loggedAt: loggedAt || new Date().toISOString(),
    source: source || 'manual',
    ...(description && { description }),
    ...(photoUrl && { photoUrl }),
    ...(mealType && { mealType }),
    ...(estimate.items?.length && { items: estimate.items }),
    ...(estimate.confidence && { confidence: estimate.confidence }),
    ...(estimate.assumptions?.length && { assumptions: estimate.assumptions }),
  }
}
