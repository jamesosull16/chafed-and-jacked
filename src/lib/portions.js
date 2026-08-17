/**
 * Correcting the amounts behind a logged meal.
 *
 * A photo estimate is rarely wrong about *what* was eaten — it is wrong about
 * how much of one thing. So the unit of correction here is the item, not the
 * meal: change the rice from 200g to 100g and the meal's totals fall out of the
 * items rather than being typed over. Scaling the whole meal by a multiplier
 * lives in `savedMeals.js` and answers a different question ("two of these").
 *
 * An item is only correctable if it was estimated in grams. Items without a
 * weight pass through untouched, and a meal with no weighed items at all has
 * nothing to resize — the sheet edits its totals directly instead.
 */

const round = (n, dp = 0) => {
  const factor = 10 ** dp
  return Math.round((Number(n) || 0) * factor) / factor
}

const num = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0)

/** The weight an item was estimated at, or null if it never had one. */
export function itemGrams(item) {
  const grams = Number(item?.grams)
  return Number.isFinite(grams) && grams > 0 ? grams : null
}

/**
 * A typed amount, or null for "he hasn't said".
 *
 * The empty string has to be caught before `Number`, which reads it as 0 — an
 * emptied field is the state every number input passes through on the way to a
 * new value, and treating it as zero drops the item's calories out of the day
 * mid-keystroke.
 */
function parsedAmount(value) {
  if (value == null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const grams = Number(value)
  return Number.isFinite(grams) && grams >= 0 ? grams : null
}

/** Whether this entry has anything worth resizing. */
export function hasWeighedItems(entry) {
  return (entry?.items || []).some((item) => itemGrams(item) !== null)
}

/**
 * One item at a new weight, its macros carried across proportionally.
 *
 * The human-readable `quantity` ("1/4 of a 12in quiche") is replaced with the
 * new weight rather than annotated, because annotating compounds on the second
 * edit and because the weight is now the thing he actually said.
 */
export function resizeItem(item, grams) {
  const from = itemGrams(item)
  const to = parsedAmount(grams)
  if (from === null || to === null || to === from) return item

  const factor = to / from
  return {
    ...item,
    grams: round(to, 1),
    quantity: `${round(to, 1)}g`,
    kcal: round(num(item.kcal) * factor),
    protein_g: round(num(item.protein_g) * factor, 1),
    carbs_g: round(num(item.carbs_g) * factor, 1),
    fat_g: round(num(item.fat_g) * factor, 1),
  }
}

/** What the items add up to, in entry field names rather than estimate ones. */
export function totalsFromItems(items = []) {
  const sum = items.reduce(
    (acc, item) => ({
      kcal: acc.kcal + num(item.kcal),
      protein: acc.protein + num(item.protein_g),
      carbs: acc.carbs + num(item.carbs_g),
      fat: acc.fat + num(item.fat_g),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  )
  return {
    kcal: round(sum.kcal),
    protein: round(sum.protein, 1),
    carbs: round(sum.carbs, 1),
    fat: round(sum.fat, 1),
  }
}

/**
 * The entry as corrected, ready to replace the stored one.
 *
 * `amounts` is one weight per item, positionally. Blank and unparseable values
 * leave their item alone — `resizeItem` decides that, so there is one rule
 * about what counts as an amount rather than one per caller. `editedAt` is what
 * tells the card, and a later reader, that these numbers were his and not the
 * estimator's.
 */
export function entryWithPortions(entry, amounts = [], now = new Date()) {
  const items = (entry?.items || []).map((item, i) => resizeItem(item, amounts[i]))
  return {
    ...entry,
    items,
    ...totalsFromItems(items),
    editedAt: now.toISOString(),
  }
}

/** The same correction for a meal with no weighed breakdown: the totals alone. */
export function entryWithMacros(entry, macros, now = new Date()) {
  return {
    ...entry,
    kcal: round(macros?.kcal),
    protein: round(macros?.protein, 1),
    carbs: round(macros?.carbs, 1),
    fat: round(macros?.fat, 1),
    editedAt: now.toISOString(),
  }
}
