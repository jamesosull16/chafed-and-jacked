import { describe, it, expect } from 'vitest'
import {
  itemGrams,
  hasWeighedItems,
  resizeItem,
  totalsFromItems,
  entryWithPortions,
  entryWithMacros,
} from '../portions'

const RICE = { name: 'rice', quantity: '200g', grams: 200, kcal: 260, protein_g: 5, carbs_g: 56, fat_g: 1 }
const CHICKEN = {
  name: 'chicken thigh',
  quantity: '150g',
  grams: 150,
  kcal: 270,
  protein_g: 38,
  carbs_g: 0,
  fat_g: 13,
}
const OIL = { name: 'olive oil', quantity: 'a drizzle', kcal: 80, protein_g: 0, carbs_g: 0, fat_g: 9 }

const ENTRY = {
  id: 'e1',
  label: 'Chicken and rice',
  kcal: 610,
  protein: 43,
  carbs: 56,
  fat: 23,
  items: [RICE, CHICKEN, OIL],
}

const AT = new Date('2026-08-17T12:00:00Z')

describe('itemGrams', () => {
  it('only counts a positive weight as one', () => {
    expect(itemGrams(RICE)).toBe(200)
    expect(itemGrams(OIL)).toBe(null)
    expect(itemGrams({ grams: 0 })).toBe(null)
    expect(itemGrams({ grams: 'a lot' })).toBe(null)
  })
})

describe('resizeItem', () => {
  it('carries the macros across proportionally', () => {
    const half = resizeItem(RICE, 100)
    expect(half.grams).toBe(100)
    expect(half.kcal).toBe(130)
    expect(half.carbs_g).toBe(28)
  })

  // The old string described a portion that no longer exists, and annotating it
  // instead would compound on the next edit.
  it('restates the quantity as the new weight', () => {
    expect(resizeItem(RICE, 100).quantity).toBe('100g')
  })

  it('leaves an item alone when it has no weight to scale by, or the value is junk', () => {
    expect(resizeItem(OIL, 20)).toBe(OIL)
    expect(resizeItem(RICE, '')).toBe(RICE)
    expect(resizeItem(RICE, -5)).toBe(RICE)
    expect(resizeItem(RICE, 200)).toBe(RICE)
  })
})

describe('totalsFromItems', () => {
  it('sums the breakdown into entry field names', () => {
    expect(totalsFromItems([RICE, CHICKEN, OIL])).toEqual({
      kcal: 610,
      protein: 43,
      carbs: 56,
      fat: 23,
    })
  })

  it('is zero for a meal with no breakdown', () => {
    expect(totalsFromItems()).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
  })
})

describe('entryWithPortions', () => {
  it('recomputes the totals from the corrected items', () => {
    const next = entryWithPortions(ENTRY, [100, '', ''], AT)
    expect(next.kcal).toBe(480)
    expect(next.carbs).toBe(28)
    expect(next.items[0].grams).toBe(100)
    // Untouched items are the same objects, not rebuilt copies.
    expect(next.items[1]).toBe(CHICKEN)
    expect(next.items[2]).toBe(OIL)
    expect(next.editedAt).toBe(AT.toISOString())
  })

  /**
   * A half-typed field is the state every number input passes through on its
   * way to a new value. Treating that as zero would drop the item's calories
   * out of the day mid-keystroke.
   */
  it('leaves an item alone while its field is empty', () => {
    expect(entryWithPortions(ENTRY, ['', '', ''], AT).kcal).toBe(610)
  })

  it('keeps everything about the entry that is not a number', () => {
    const next = entryWithPortions(ENTRY, [100, '', ''], AT)
    expect(next.id).toBe('e1')
    expect(next.label).toBe('Chicken and rice')
  })
})

describe('entryWithMacros', () => {
  it('takes the totals as given, for a meal with nothing to resize', () => {
    const next = entryWithMacros({ id: 'e2', label: 'Protein shake' }, { kcal: '240', protein: '30' }, AT)
    expect(next).toMatchObject({ id: 'e2', kcal: 240, protein: 30, carbs: 0, fat: 0 })
    expect(next.editedAt).toBe(AT.toISOString())
  })
})

describe('hasWeighedItems', () => {
  it('is true when at least one item can be resized', () => {
    expect(hasWeighedItems(ENTRY)).toBe(true)
    expect(hasWeighedItems({ items: [OIL] })).toBe(false)
    expect(hasWeighedItems({})).toBe(false)
  })
})
