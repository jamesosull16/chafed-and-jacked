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

/**
 * How a logged meal is named to the model.
 *
 * Entries are keyed by uuid in the store, and the context block used to print
 * those uuids so the coach could cite one when correcting a meal. That taught
 * it the exact shape of a confirmation it could author without calling a tool,
 * and on 2026-08-05 it did: three replies claiming a meal was logged, each
 * carrying an invented `id 3e8a1c9f-…`, none of them backed by a write.
 *
 * A handle is short, obviously not a database key, and only meaningful inside
 * the turn that issued it — so a fabricated one resolves to nothing, and any
 * uuid appearing in a reply is now unambiguously made up.
 */
export const mealHandle = (index) => `#${index + 1}`

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

// ── Ingredient lines ─────────────────────────────────────────────────

/**
 * The contract for `ingredients.js`: one item per typed line, in the same
 * order, carrying the arithmetic that got from the line to the grams.
 *
 * `index` is required and load-bearing. The editor holds a row per line and
 * has to put each answer back in the row it came from — matching on array
 * position alone would silently shuffle every ingredient's macros the first
 * time the model returned them out of order.
 */
export const INGREDIENT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: 'Exactly one entry per input line, in the order given.',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: 'The 0-based index of the line this answers.' },
          name: {
            type: 'string',
            description: 'Database-style food name, e.g. "chickpeas, canned, drained"',
          },
          amount: {
            type: 'string',
            description: 'Short echo of the amount as understood, e.g. "2 × 15 oz can, drained"',
          },
          grams: { type: 'number', description: 'Total edible mass for the whole line, in grams' },
          kcal: { type: 'number' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' },
          note: {
            type: 'string',
            description:
              'The arithmetic, whenever the typed number was corrected — drained yields, volume densities, trimming. Empty when the line was taken at face value.',
          },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: [
          'index',
          'name',
          'amount',
          'grams',
          'kcal',
          'protein_g',
          'carbs_g',
          'fat_g',
          'note',
          'confidence',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
}

/** A single ingredient heavier than this, or richer, is a typo not a portion. */
const MAX_PER_ITEM = { grams: 20000, kcal: 8000, protein_g: 800, carbs_g: 2000, fat_g: 900 }

/**
 * Validate resolved ingredients against the lines that were asked about.
 *
 * Coverage is enforced rather than patched. A missing line would land in the
 * editor as a row that simply stayed blank while the others filled in — easy to
 * miss, and it undercounts the meal by exactly one ingredient. A visible
 * failure he can retry is the better outcome.
 */
export function validateIngredients(raw, lines = []) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Lookup was not an object' }
  if (!Array.isArray(raw.items)) return { ok: false, error: 'Lookup contained no items' }

  const slots = new Array(lines.length).fill(null)

  for (const item of raw.items) {
    const index = Number(item?.index)
    if (!Number.isInteger(index) || index < 0 || index >= lines.length) {
      return { ok: false, error: `Lookup returned an item for line ${item?.index}, which was not asked about` }
    }
    // First answer wins. A duplicated index is the model repeating itself, and
    // taking the later one would let a stray repeat overwrite a good answer.
    if (slots[index]) continue
    if (!item.name || typeof item.name !== 'string') {
      return { ok: false, error: `Item for "${lines[index]}" is missing a name` }
    }
    for (const key of [...MACRO_KEYS, 'grams']) {
      const value = Number(item[key])
      if (!Number.isFinite(value) || value < 0) {
        return { ok: false, error: `Item "${item.name}" has an invalid ${key}` }
      }
      if (value > MAX_PER_ITEM[key]) {
        return { ok: false, error: `Item "${item.name}" has an implausible ${key} (${round(value)})` }
      }
    }
    slots[index] = {
      index,
      input: lines[index],
      name: String(item.name).slice(0, 120),
      // `quantity` is the estimator's field name for the human-readable
      // portion, and these items flow into the same `entry.items` array — one
      // shape for a breakdown, whether it came from a photo or a typed line.
      quantity: String(item.amount || '').slice(0, 80),
      grams: round(Number(item.grams), 1),
      kcal: round(Number(item.kcal)),
      protein_g: round(Number(item.protein_g), 1),
      carbs_g: round(Number(item.carbs_g), 1),
      fat_g: round(Number(item.fat_g), 1),
      ...(item.note && { note: String(item.note).slice(0, 300) }),
      confidence: ['high', 'medium', 'low'].includes(item.confidence) ? item.confidence : 'low',
    }
  }

  const missing = slots.findIndex((slot) => slot === null)
  if (missing !== -1) {
    return { ok: false, error: `Nothing came back for "${lines[missing]}"` }
  }

  return { ok: true, items: slots }
}
