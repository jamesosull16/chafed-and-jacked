/**
 * The arithmetic between a typed ingredient list and a stored meal.
 *
 * The cases that matter are the ones where the batch and the plate are not the
 * same thing, and the ones where a correction is made on top of a lookup — that
 * is where a wrong number would be invisible on screen and permanent in the
 * day's totals.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  blankRow,
  rowsFromItems,
  isStale,
  pendingRows,
  applyResolved,
  rowItem,
  resolvedItems,
  canResize,
  resizeItem,
  repriceItem,
  scaleItems,
  itemTotals,
  entryTotals,
  normaliseServings,
  recipeFromEntry,
  recipeNotes,
  buildRecipeMeal,
  recipeToSavedMeal,
  mealWithMacros,
} from '../recipe'

let nextKey = 0
beforeEach(() => {
  nextKey = 0
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `k${++nextKey}`)
})

const BEANS = {
  input: '2 cans of 15 oz garbanzo beans',
  name: 'chickpeas, canned, drained',
  quantity: '2 × 15 oz can, drained',
  grams: 510,
  kcal: 709,
  protein_g: 38,
  carbs_g: 119,
  fat_g: 7,
  note: '2 × 425g net, ~255g drained each',
  confidence: 'high',
  source: 'usda',
}

const OIL = {
  input: '2 tbsp olive oil',
  name: 'olive oil',
  quantity: '2 tbsp',
  grams: 28,
  kcal: 248,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 28,
  confidence: 'medium',
  source: 'usda',
}

/** An item with no weight behind it — nothing to take a proportion of. */
const DRIZZLE = { name: 'olive oil', quantity: 'a drizzle', kcal: 80, protein_g: 0, carbs_g: 0, fat_g: 9 }

describe('rows', () => {
  it('is stale until the text that produced it is the text on screen', () => {
    const row = { key: 'k', input: BEANS.input, item: BEANS }
    expect(isStale(row)).toBe(false)
    expect(isStale({ ...row, input: '1 can of garbanzo beans' })).toBe(true)
    // A blank row is not stale — it is a row he has not filled in yet, and
    // offering to look it up would be offering to look up nothing.
    expect(isStale({ key: 'k', input: '  ', item: null })).toBe(false)
    expect(pendingRows([row, blankRow('1 tin of tuna')])).toHaveLength(1)
  })

  it('seeds rows from a breakdown so a photo estimate can be re-looked-up', () => {
    const rows = rowsFromItems([DRIZZLE])
    expect(rows[0].input).toBe('olive oil, a drizzle')
    expect(rows[0].item).toMatchObject(DRIZZLE)
    // The reconstructed line is stamped on the item too, or the row opens
    // already stale and the ingredient reads as never looked up.
    expect(isStale(rows[0])).toBe(false)
    // A line the athlete actually typed is left as he typed it.
    expect(rowsFromItems([BEANS])[0].input).toBe('2 cans of 15 oz garbanzo beans')
    expect(rowsFromItems([BEANS])[0].item).toBe(BEANS)
  })

  it('always offers at least one row to type into', () => {
    expect(rowsFromItems([])).toHaveLength(1)
    expect(rowsFromItems([])[0].item).toBe(null)
  })

  /**
   * The lookup runs on the rows that need it, so its answers are indexed
   * against that subset. Matching them back by position in the full list is how
   * every ingredient's macros end up on the wrong row.
   */
  it('puts answers back on rows by key, not position', () => {
    const rows = [
      { key: 'a', input: '2 tbsp olive oil', item: null },
      { key: 'b', input: 'chicken', item: BEANS },
      { key: 'c', input: '2 cans of 15 oz garbanzo beans', item: null },
    ]
    const next = applyResolved(rows, new Map([['c', BEANS], ['a', OIL]]))
    expect(next[0].item.name).toBe('olive oil')
    expect(next[2].item.name).toBe('chickpeas, canned, drained')
    expect(next[1].item).toBe(BEANS)
  })

  it('drops a row correction when the row is looked up again', () => {
    const rows = [{ key: 'a', input: '2 cans of 15 oz garbanzo beans', item: OIL, grams: '100', macros: { kcal: '5' } }]
    const [next] = applyResolved(rows, { a: BEANS })
    expect(next.grams).toBeUndefined()
    expect(next.macros).toBeUndefined()
    expect(rowItem(next).kcal).toBe(709)
  })
})

describe('corrections', () => {
  it('carries the macros across when the weight is corrected', () => {
    const half = resizeItem(BEANS, 255)
    expect(half.grams).toBe(255)
    expect(half.kcal).toBe(355)
    expect(half.carbs_g).toBe(59.5)
    expect(half.quantity).toBe('255g')
  })

  it('leaves an item alone when there is nothing to scale by, or the value is junk', () => {
    expect(resizeItem(DRIZZLE, 20)).toBe(DRIZZLE)
    expect(resizeItem(BEANS, '')).toBe(BEANS)
    expect(resizeItem(BEANS, -5)).toBe(BEANS)
    expect(resizeItem(BEANS, 510)).toBe(BEANS)
    expect(canResize(DRIZZLE)).toBe(false)
    expect(canResize(BEANS)).toBe(true)
  })

  it('takes typed macros one field at a time, leaving the rest alone', () => {
    const fixed = repriceItem(BEANS, { protein_g: '44' })
    expect(fixed.protein_g).toBe(44)
    expect(fixed.kcal).toBe(709)
    expect(fixed.source).toBe('manual')
    // A blank field is "you had it right", not zero.
    expect(repriceItem(BEANS, { kcal: '' })).toBe(BEANS)
    expect(repriceItem(BEANS, {})).toBe(BEANS)
  })

  /**
   * Every keystroke is a separate correction, and each one is applied to the
   * item as looked up. Chaining them instead — scaling by the ratio to the
   * previous value and keeping the result — passes through "1", which rounds
   * the protein to nothing, and no later keystroke gets it back.
   */
  it('derives every weight correction from the original, so typing does not erode it', () => {
    const row = { key: 'a', input: BEANS.input, item: BEANS }
    for (const grams of ['5', '51', '510']) {
      expect(rowItem({ ...row, grams }).kcal).toBe(grams === '510' ? 709 : Math.round(709 * (Number(grams) / 510)))
    }
    expect(rowItem({ ...row, grams: '510' })).toEqual(BEANS)
  })

  it('applies a weight and a macro correction together', () => {
    const item = rowItem({ key: 'a', input: BEANS.input, item: BEANS, grams: '255', macros: { kcal: '400' } })
    expect(item.grams).toBe(255)
    expect(item.kcal).toBe(400)
    // Untouched macros still follow the weight.
    expect(item.protein_g).toBe(19)
  })

  it('ignores a row whose text has moved on from its answer', () => {
    expect(rowItem({ key: 'a', input: 'something else', item: BEANS })).toBe(null)
    expect(resolvedItems([{ key: 'a', input: 'something else', item: BEANS }])).toEqual([])
  })
})

describe('totals', () => {
  it('sums a breakdown in both field vocabularies', () => {
    expect(itemTotals([BEANS, OIL])).toEqual({ kcal: 957, protein_g: 38, carbs_g: 119, fat_g: 35 })
    expect(entryTotals([BEANS, OIL])).toEqual({ kcal: 957, protein: 38, carbs: 119, fat: 35 })
    expect(entryTotals()).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
  })

  it('restates a scaled item by weight, dropping the amount it is no longer', () => {
    const [quarter] = scaleItems([BEANS], 0.25)
    expect(quarter.grams).toBe(127.5)
    expect(quarter.kcal).toBe(177)
    expect(quarter.quantity).toBe('127.5g')
    // The note explains a number that is no longer on the card.
    expect(quarter.note).toBeUndefined()
    // At 1× nothing is restated — the amount he typed is still the amount.
    expect(scaleItems([BEANS], 1)[0]).toBe(BEANS)
  })

  it('treats junk servings as one', () => {
    expect(normaliseServings('4')).toBe(4)
    expect(normaliseServings('')).toBe(1)
    expect(normaliseServings(0)).toBe(1)
    expect(normaliseServings(-2)).toBe(1)
    expect(normaliseServings(1000)).toBe(100)
  })
})

describe('buildRecipeMeal', () => {
  const base = { id: 'e1', loggedAt: '2026-08-31T18:00:00.000Z', source: 'manual' }

  it('logs the plate and keeps the pot', () => {
    const meal = buildRecipeMeal({ base, label: 'Chickpea traybake', items: [BEANS, OIL], servings: 4 })
    expect(meal.kcal).toBe(239)
    expect(meal.items[0].grams).toBe(127.5)
    expect(meal.recipe).toEqual({ servings: 4, items: [BEANS, OIL] })
    expect(meal.id).toBe('e1')
    expect(meal.label).toBe('Chickpea traybake')
    // One serving eaten is the default, and a 1× multiplier is not worth
    // storing or printing.
    expect(meal.quantity).toBeUndefined()
  })

  it('logs more than one serving of the same batch', () => {
    const meal = buildRecipeMeal({ base, items: [BEANS, OIL], servings: 4, eaten: 2 })
    // 479, not twice the 239 of one serving: each ingredient is rounded once,
    // at the weight actually eaten. The totals matching the breakdown on the
    // card matters more than two servings matching one doubled.
    expect(meal.kcal).toBe(479)
    expect(meal.quantity).toBe(2)
    expect(meal.recipe.servings).toBe(4)
  })

  /**
   * A meal that makes one serving has no pot to keep separately — its
   * breakdown is the batch. Storing both would be two copies of the same list
   * to keep in step.
   */
  it('keeps no recipe when the batch is the plate', () => {
    const meal = buildRecipeMeal({ base, items: [BEANS] })
    expect(meal.recipe).toBeUndefined()
    expect(meal.items).toEqual([BEANS])
    expect(meal.kcal).toBe(709)
  })

  it('drops a recipe that no longer applies when the yield is edited back to one', () => {
    const four = buildRecipeMeal({ base, items: [BEANS], servings: 4 })
    const one = buildRecipeMeal({ base: four, items: [BEANS], servings: 1 })
    expect(one.recipe).toBeUndefined()
    expect(one.kcal).toBe(709)
  })

  it('carries the arithmetic onto the card and takes the weakest confidence', () => {
    const meal = buildRecipeMeal({ base, items: [BEANS, OIL] })
    expect(meal.assumptions).toEqual(['2 × 425g net, ~255g drained each'])
    expect(meal.confidence).toBe('medium')
    expect(recipeNotes([OIL])).toEqual([])
  })

  /**
   * Nudging one weight on a photo estimate does not overrule what identified
   * the food, so what the estimator assumed stays on the card.
   */
  it('keeps what a meal already assumed when the ingredients say nothing new', () => {
    const photo = { ...base, assumptions: ['Assumed thigh, not breast'], confidence: 'medium' }
    const meal = buildRecipeMeal({ base: photo, items: [DRIZZLE] })
    expect(meal.assumptions).toEqual(['Assumed thigh, not breast'])
    // Confidence is a claim about numbers, and these are his now.
    expect(meal.confidence).toBeUndefined()
  })

  it('stamps an edit when one was made', () => {
    const meal = buildRecipeMeal({ base, items: [BEANS], editedAt: '2026-08-31T19:00:00.000Z' })
    expect(meal.editedAt).toBe('2026-08-31T19:00:00.000Z')
    expect(buildRecipeMeal({ base, items: [BEANS] }).editedAt).toBeUndefined()
  })

  it('round-trips through the editor unchanged', () => {
    const meal = buildRecipeMeal({ base, items: [BEANS, OIL], servings: 4, eaten: 2 })
    const reopened = recipeFromEntry(meal)
    expect(reopened).toEqual({ items: [BEANS, OIL], servings: 4, eaten: 2 })
    expect(buildRecipeMeal({ base: meal, ...reopened })).toEqual(meal)
  })

  it('opens a meal that was never a recipe as a single serving of itself', () => {
    expect(recipeFromEntry({ items: [DRIZZLE], kcal: 80 })).toEqual({
      items: [DRIZZLE],
      servings: 1,
      eaten: 1,
    })
    expect(recipeFromEntry(null)).toEqual({ items: [], servings: 1, eaten: 1 })
  })
})

describe('recipeToSavedMeal', () => {
  it('stores one serving, with the batch underneath it', () => {
    const meal = recipeToSavedMeal({ name: 'Chickpea traybake', items: [BEANS, OIL], servings: 4 })
    expect(meal.name).toBe('Chickpea traybake')
    expect(meal.kcal).toBe(239)
    expect(meal.recipe).toEqual({ servings: 4, items: [BEANS, OIL] })
    expect(meal.assumptions).toEqual(['2 × 425g net, ~255g drained each'])
  })

  /**
   * A saved meal is a meal, not the occasion it was eaten on. A multiplier
   * carried over from the entry it was saved from would double every future log
   * of it, silently and forever.
   */
  it('drops everything about the occasion', () => {
    const meal = recipeToSavedMeal({
      name: 'Traybake',
      items: [BEANS],
      servings: 2,
      base: { id: 'e1', loggedAt: 'yesterday', source: 'manual', quantity: 3, useCount: 9 },
    })
    expect(meal.id).toBeUndefined()
    expect(meal.loggedAt).toBeUndefined()
    expect(meal.source).toBeUndefined()
    expect(meal.quantity).toBeUndefined()
    // What the library itself put there survives.
    expect(meal.useCount).toBe(9)
  })
})

describe('mealWithMacros', () => {
  it('takes the totals as given, for a meal with nothing to resize', () => {
    const at = new Date('2026-08-31T18:00:00.000Z')
    const next = mealWithMacros({ id: 'e2', label: 'Protein shake' }, { kcal: '240', protein: '30' }, at)
    expect(next).toMatchObject({ id: 'e2', kcal: 240, protein: 30, carbs: 0, fat: 0 })
    expect(next.editedAt).toBe(at.toISOString())
  })
})
