/**
 * RECIPES — Chafed & Jacked
 *
 * A meal built from its ingredients rather than from a photo or four typed
 * totals: "2 cans of 15 oz garbanzo beans, a tin of tuna, 2 tbsp olive oil —
 * makes 4, I ate 1".
 *
 * Two numbers are being kept apart here, and confusing them is the whole
 * hazard. The BATCH is what went in the pot. The SERVING is what went on the
 * plate. Cooking on Sunday and eating a quarter of it is the normal case, and a
 * batch logged as a meal puts 2400 kcal on Sunday and nothing on Monday.
 *
 * So the stored meal says what was eaten — `items` and the totals are the
 * plate, exactly as they are for a photo-estimated meal, and every existing
 * reader keeps working untouched — and `recipe` hangs off the side holding the
 * pot: the ingredient lines as they were typed, and how many servings they
 * made. That is what the editor reopens. Without it, editing a quarter portion
 * would mean editing "63.8g of chickpeas", which is not a thing anyone typed.
 *
 * The invariants, in one place:
 *
 *   items      what was eaten = batch × (eaten / servings)
 *   kcal…      the sum of `items`, always
 *   recipe     { servings, items: batch } — omitted when servings is 1,
 *              because then the batch and the plate are the same list
 *   quantity   servings eaten — omitted when 1, matching how a scaled saved
 *              meal already records its multiplier
 *
 * Pure module. The lookup that turns a typed line into grams lives in
 * `mealEstimation.js`; the arithmetic either side of it is here.
 */

/** Macro fields on an item, and how far each is rounded. */
export const MACRO_FIELDS = [
  { key: 'kcal', label: 'kcal', dp: 0 },
  { key: 'protein_g', label: 'Protein', dp: 1 },
  { key: 'carbs_g', label: 'Carbs', dp: 1 },
  { key: 'fat_g', label: 'Fat', dp: 1 },
]

const round = (n, dp = 0) => {
  const f = 10 ** dp
  return Math.round((Number(n) || 0) * f) / f
}

const num = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0)

/**
 * A typed number, or null for "he hasn't said".
 *
 * The empty string has to be caught before `Number`, which reads it as 0. An
 * emptied field is the state every number input passes through on the way to a
 * new value, and treating it as zero drops the ingredient's calories out of the
 * meal mid-keystroke.
 */
function typed(value) {
  if (value == null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** More servings than this out of one batch is a typo, not a meal prep. */
const MAX_SERVINGS = 100

/** Rows the editor can hold at once, matching the function's own cap. */
export const MAX_ROWS = 40

// ── Rows ─────────────────────────────────────────────────────────────

/**
 * A row in the editor: the line as typed, what came back for it, and any
 * correction made on top.
 *
 * The three are kept apart rather than merged into one edited item, because
 * every override has to be re-derived from the ORIGINAL each time. Scaling an
 * item by the ratio of the new weight to its current one and storing the result
 * looks equivalent, and is not: typing "100" over "200" passes through "1",
 * which rounds 5.2g of protein to 0.1, and no later keystroke gets it back. The
 * pristine item is the only safe basis for the arithmetic, so it is the thing
 * that gets kept.
 *
 *   input   what he typed
 *   item    what the lookup returned for that text
 *   grams   a typed weight, overriding the looked-up mass proportionally
 *   macros  typed macros, overriding whatever the weight implies
 */
export function blankRow(input = '') {
  return { key: crypto.randomUUID(), input, item: null }
}

/**
 * Seed rows from an existing breakdown — a photo estimate, or a meal already
 * saved. The typed line is reconstructed from the item's own portion text, so a
 * row opened from a photo estimate reads "rice, 200g" and can be re-looked-up
 * as if it had been typed that way.
 */
export function rowsFromItems(items = []) {
  const rows = (items || []).map((item) => {
    const input =
      item.input ||
      [item.name, item.quantity || (item.grams > 0 ? `${item.grams}g` : '')]
        .filter(Boolean)
        .join(', ')
    // The reconstructed line is stamped onto the item as well as the row.
    // `isStale` compares the two, so a row seeded from a stored breakdown —
    // which has no typed line behind it — would otherwise open already stale:
    // every ingredient greyed out as "not looked up yet", and an edit that
    // saved the meal with no breakdown at all.
    return { key: crypto.randomUUID(), input, item: item.input ? item : { ...item, input } }
  })
  return rows.length ? rows : [blankRow()]
}

/** Whether a row's text has moved on from the item resolved for it. */
export function isStale(row) {
  const text = String(row?.input || '').trim()
  if (!text) return false
  if (!row?.item) return true
  return text !== String(row.item.input || '').trim()
}

/** Rows with text but no current answer — what a lookup is for. */
export function pendingRows(rows = []) {
  return (rows || []).filter((row) => String(row.input || '').trim() && isStale(row))
}

/**
 * Rescale one ingredient, macros carried across proportionally.
 *
 * The portion text is replaced by the new weight rather than kept, because "2 ×
 * 15 oz can" describes the pot and this may be a quarter of it — leaving it in
 * place puts two cans of beans on a card holding half a cup. The arithmetic
 * note goes the same way and for the same reason: it explains a number that is
 * no longer on screen. Both survive on the batch, which is what the editor
 * reads back.
 */
export function scaleItem(item, factor) {
  if (!item || factor === 1) return item
  const grams = round(num(item.grams) * factor, 1)
  const { note: _note, ...rest } = item
  return {
    ...rest,
    grams,
    quantity: grams > 0 ? `${grams}g` : '',
    kcal: round(num(item.kcal) * factor),
    protein_g: round(num(item.protein_g) * factor, 1),
    carbs_g: round(num(item.carbs_g) * factor, 1),
    fat_g: round(num(item.fat_g) * factor, 1),
  }
}

/** The whole list at a fraction of itself. */
export function scaleItems(items = [], factor) {
  if (!Array.isArray(items)) return []
  return items.map((item) => scaleItem(item, factor))
}

/**
 * One ingredient at a weight he typed.
 *
 * Only meaningful where the lookup produced a mass: an item logged as "a
 * drizzle of olive oil" has no weight for a new one to be a proportion of, so
 * its macros are corrected directly instead.
 */
export function resizeItem(item, grams) {
  const from = num(item?.grams)
  const to = typed(grams)
  if (!item || !(from > 0) || to === null || to === from) return item
  return { ...scaleItem(item, to / from), grams: round(to, 1), quantity: `${round(to, 1)}g` }
}

/** Whether this ingredient can be corrected by weight at all. */
export function canResize(item) {
  return num(item?.grams) > 0
}

/**
 * One ingredient's macros typed over directly, mass left alone.
 *
 * Partial by design — a blank field means "you had it right", not zero — so
 * correcting the protein on a row leaves its calories where the database put
 * them.
 */
export function repriceItem(item, macros) {
  if (!item || !macros) return item
  const out = { ...item }
  let changed = false
  for (const { key, dp } of MACRO_FIELDS) {
    const value = typed(macros[key])
    if (value === null) continue
    const rounded = round(value, dp)
    if (rounded === num(item[key])) continue
    out[key] = rounded
    changed = true
  }
  if (!changed) return item
  // Hand-typed macros are no longer the database's, and saying so stops the
  // row from claiming a USDA match it has been overruled on.
  return { ...out, source: 'manual' }
}

/** The ingredient a row currently describes: what was looked up, as corrected. */
export function rowItem(row) {
  if (!row?.item || isStale(row)) return null
  return repriceItem(resizeItem(row.item, row.grams), row.macros)
}

/** Every ingredient the rows currently describe, in order. */
export function resolvedItems(rows = []) {
  return (rows || []).map(rowItem).filter(Boolean)
}

/**
 * Put looked-up items back on their rows.
 *
 * Matched by row key, not by position: the lookup runs on a subset of the rows
 * and the athlete can keep typing — including adding and deleting rows — while
 * it is in flight. `input` is stamped onto the item so `isStale` can tell later
 * whether the text has moved since. Corrections are cleared, because they were
 * corrections to a different ingredient.
 */
export function applyResolved(rows = [], resolved) {
  return (rows || []).map((row) => {
    const item = resolved?.get ? resolved.get(row.key) : resolved?.[row.key]
    if (!item) return row
    return { key: row.key, input: row.input, item: { ...item, input: row.input.trim() } }
  })
}

// ── Totals ───────────────────────────────────────────────────────────

/** What a list of items adds up to, in the item field names. */
export function itemTotals(items = []) {
  const sum = (items || []).reduce(
    (acc, item) => ({
      kcal: acc.kcal + num(item.kcal),
      protein_g: acc.protein_g + num(item.protein_g),
      carbs_g: acc.carbs_g + num(item.carbs_g),
      fat_g: acc.fat_g + num(item.fat_g),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )
  return {
    kcal: round(sum.kcal),
    protein_g: round(sum.protein_g, 1),
    carbs_g: round(sum.carbs_g, 1),
    fat_g: round(sum.fat_g, 1),
  }
}

/** The same sum in the entry's field names, for anything that stores a meal. */
export function entryTotals(items = []) {
  const totals = itemTotals(items)
  return {
    kcal: totals.kcal,
    protein: totals.protein_g,
    carbs: totals.carbs_g,
    fat: totals.fat_g,
  }
}

// ── Servings ─────────────────────────────────────────────────────────

/** A servings count that can safely divide. Anything else is one serving. */
export function normaliseServings(servings) {
  const n = typed(servings)
  if (n === null || n <= 0) return 1
  return Math.min(MAX_SERVINGS, round(n, 2))
}

/**
 * The batch behind a stored meal, whether or not it was built as one.
 *
 * A photo estimate has no recipe, so its breakdown *is* its batch and it makes
 * one serving — which is right: it was a plate of food, and the plate was
 * eaten. That fallback is what lets one editor open every card.
 */
export function recipeFromEntry(entry) {
  return {
    items: entry?.recipe?.items ?? entry?.items ?? [],
    servings: normaliseServings(entry?.recipe?.servings ?? 1),
    // A saved meal holds a serving and no occasion, so it has no `quantity` to
    // read and falls through to the single serving it stores.
    eaten: normaliseServings(entry?.quantity ?? 1),
  }
}

/** The weakest confidence among the ingredients — a meal is as sure as its least sure part. */
function weakestConfidence(items = []) {
  const levels = (items || []).map((i) => i.confidence).filter(Boolean)
  if (!levels.length) return null
  if (levels.includes('low')) return 'low'
  if (levels.includes('medium')) return 'medium'
  return 'high'
}

/**
 * The arithmetic worth showing on the card.
 *
 * These are the corrections the athlete did not make himself — drained weights,
 * volume densities, bone-in trimming — and they belong on the card for the same
 * reason the estimator's assumptions do: a number that arrived 40% under the
 * label has to explain itself, or it reads as a bug.
 */
export function recipeNotes(items = []) {
  return (items || []).map((item) => item.note).filter(Boolean).slice(0, 12)
}

/**
 * Build the stored meal from a batch and a yield.
 *
 * `base` is whatever is being edited — an existing entry keeps its id, its
 * `loggedAt` and its source; a new one passes the fields it wants. Everything
 * derived from the ingredients is overwritten, so this is also the repair path
 * for a card whose totals drifted from its breakdown.
 */
export function buildRecipeMeal({ base = {}, label, items = [], servings = 1, eaten = 1, editedAt } = {}) {
  const made = normaliseServings(servings)
  const ate = normaliseServings(eaten)
  const plate = scaleItems(items, ate / made)
  const notes = recipeNotes(items)
  const confidence = weakestConfidence(items)

  const meal = {
    ...base,
    ...(label !== undefined && { label }),
    ...entryTotals(plate),
    items: plate,
  }

  // Deletes rather than skipped assignments: this is the edit path as well as
  // the create path, and a meal that used to make four servings and now makes
  // one has to lose the field, not keep a stale copy of it.
  if (made === 1) delete meal.recipe
  else meal.recipe = { servings: made, items }

  if (ate === 1) delete meal.quantity
  else meal.quantity = ate

  if (confidence) meal.confidence = confidence
  else delete meal.confidence

  // Notes win where the ingredients have any, and otherwise whatever the meal
  // already said stands. Clearing them would take "assumed thigh, not breast"
  // off a photo estimate the moment one of its weights was nudged — the
  // estimate is still what identified the food, and the edit did not overrule
  // that part of it.
  if (notes.length) meal.assumptions = notes

  if (editedAt) meal.editedAt = editedAt

  return meal
}

/**
 * One serving of a recipe, for the library.
 *
 * The library stores a serving and applies quantity at log time — see
 * `savedMeals.js` — so a four-serving batch is kept there as a quarter of
 * itself, with the whole pot preserved underneath for editing.
 */
export function recipeToSavedMeal({ name, items = [], servings = 1, base = {} } = {}) {
  const made = normaliseServings(servings)
  const serving = scaleItems(items, 1 / made)
  const notes = recipeNotes(items)
  const confidence = weakestConfidence(items)

  const meal = {
    ...base,
    ...(name !== undefined && { name }),
    ...entryTotals(serving),
    items: serving,
  }

  if (made === 1) delete meal.recipe
  else meal.recipe = { servings: made, items }

  if (confidence) meal.confidence = confidence
  else delete meal.confidence

  if (notes.length) meal.assumptions = notes

  // A saved meal is a stored serving, not an occasion — a multiplier from the
  // entry it was saved from would double every future log of it.
  delete meal.quantity
  delete meal.loggedAt
  delete meal.id
  delete meal.source

  return meal
}

/**
 * A meal whose totals were typed over directly.
 *
 * The path for a card with no breakdown to resize — a protein shake logged as
 * four numbers. `editedAt` is what tells the card, and a later reader, that
 * these numbers were his and not the estimator's.
 */
export function mealWithMacros(entry, macros, now = new Date()) {
  return {
    ...entry,
    kcal: round(macros?.kcal),
    protein: round(macros?.protein, 1),
    carbs: round(macros?.carbs, 1),
    fat: round(macros?.fat, 1),
    editedAt: now.toISOString(),
  }
}
