/**
 * The meal library has two front doors — the Fuel page and the coach/MCP tools
 * — and each scales a saved meal with its own copy of the same arithmetic,
 * because the Cloud Functions bundle cannot import `src/lib`. If the copies
 * drift, the same saved meal logged from a chat and from the app writes
 * different macros into the same day, and nothing in either surface would show
 * it. These tests fail the build instead.
 *
 * Same argument and same shape as energyParity.test.js.
 */
import { describe, it, expect } from 'vitest'

import {
  libraryKey as serverKey,
  normaliseName as serverName,
  normaliseQuantity as serverQuantity,
  scaleMacros as serverScaleMacros,
  scaleItems as serverScaleItems,
  scaledLabel as serverLabel,
  savedMealToEntry as serverToEntry,
  entryToSavedMeal as serverToSaved,
  sortSavedMeals as serverSort,
  matchSavedMeal,
} from '../src/savedMeals.js'

import {
  libraryKey as clientKey,
  normaliseName as clientName,
  normaliseQuantity as clientQuantity,
  scaleMacros as clientScaleMacros,
  scaleItems as clientScaleItems,
  scaledLabel as clientLabel,
  savedMealToEntry as clientToEntry,
  entryToSavedMeal as clientToSaved,
  sortSavedMeals as clientSort,
} from '../../src/lib/savedMeals.js'

const MEALS = [
  {
    id: 'a',
    name: 'Overnight oats',
    kcal: 512,
    protein: 28.4,
    carbs: 61.2,
    fat: 16.7,
    confidence: 'high',
    assumptions: ['Whole milk'],
    items: [
      { name: 'oats', quantity: '100g', grams: 100, kcal: 379, protein_g: 13.2, carbs_g: 67.7, fat_g: 6.5 },
      { name: 'whey', quantity: '1 scoop', grams: 30, kcal: 120, protein_g: 24, carbs_g: 3, fat_g: 1.5 },
    ],
  },
  { id: 'b', name: 'Chicken & rice', kcal: 730, protein: 62, carbs: 84, fat: 12, mealType: 'dinner' },
  { id: 'c', name: 'Black coffee', kcal: 3, protein: 0.3, carbs: 0, fat: 0 },
]

const QUANTITIES = [0.25, 0.5, 1, 1.5, 2, 3, 0.333, 7.77, 0, -2, null, undefined, 'two', 100]

const NAMES = ['  Overnight   Oats ', 'CHICKEN & RICE', '', null, 'x'.repeat(200), 'Salade Niçoise']

describe('naming parity', () => {
  it('agrees on the library key', () => {
    for (const name of NAMES) expect(serverKey(name)).toBe(clientKey(name))
  })

  it('agrees on the stored name, including trimming and truncation', () => {
    for (const name of NAMES) expect(serverName(name)).toBe(clientName(name))
  })

  it('agrees on the scaled label at every quantity', () => {
    for (const name of NAMES) {
      for (const q of QUANTITIES) expect(serverLabel(name, q)).toBe(clientLabel(name, q))
    }
  })
})

describe('scaling parity', () => {
  it('agrees on quantity normalisation, including the junk cases', () => {
    for (const q of QUANTITIES) expect(serverQuantity(q)).toBe(clientQuantity(q))
  })

  it('agrees on scaled macros for every meal and quantity', () => {
    for (const meal of MEALS) {
      for (const q of QUANTITIES) {
        expect(serverScaleMacros(meal, q)).toEqual(clientScaleMacros(meal, q))
      }
    }
  })

  it('agrees on the scaled itemised breakdown', () => {
    for (const meal of MEALS) {
      for (const q of QUANTITIES) {
        expect(serverScaleItems(meal.items, q)).toEqual(clientScaleItems(meal.items, q))
      }
    }
  })
})

describe('entry parity', () => {
  const fixed = { id: 'entry-1', loggedAt: '2026-08-10T12:00:00.000Z' }

  it('writes the same log entry from every meal and quantity', () => {
    for (const meal of MEALS) {
      for (const q of QUANTITIES) {
        expect(serverToEntry(meal, { ...fixed, quantity: q })).toEqual(
          clientToEntry(meal, { ...fixed, quantity: q })
        )
      }
    }
  })

  it('honours edited macros identically', () => {
    const macros = { kcal: 600, protein: 40, carbs: 50, fat: 20 }
    expect(serverToEntry(MEALS[0], { ...fixed, quantity: 2, macros })).toEqual(
      clientToEntry(MEALS[0], { ...fixed, quantity: 2, macros })
    )
  })

  it('saves the same library shape from a logged entry', () => {
    const entry = serverToEntry(MEALS[0], { ...fixed, quantity: 1.5 })
    expect(serverToSaved(entry, { name: 'Big oats' })).toEqual(
      clientToSaved(entry, { name: 'Big oats' })
    )
    expect(serverToSaved(entry)).toEqual(clientToSaved(entry))
  })
})

describe('library ordering parity', () => {
  const library = [
    { name: 'A', createdAt: '2026-08-01T00:00:00Z', lastUsedAt: null },
    { name: 'B', createdAt: '2026-08-02T00:00:00Z', lastUsedAt: '2026-08-09T00:00:00Z' },
    { name: 'C', createdAt: '2026-08-03T00:00:00Z' },
    { name: 'D', createdAt: '2026-08-04T00:00:00Z', lastUsedAt: '2026-08-10T00:00:00Z' },
  ]

  it('agrees on order', () => {
    expect(serverSort(library).map((m) => m.name)).toEqual(clientSort(library).map((m) => m.name))
  })

  it('puts the most recently used first, then the most recently saved', () => {
    expect(serverSort(library).map((m) => m.name)).toEqual(['D', 'B', 'C', 'A'])
  })
})

/**
 * Server-only: the app resolves a saved meal by tapping it, so name matching
 * exists purely for the model-facing tools.
 */
describe('matchSavedMeal', () => {
  it('resolves an exact name regardless of case and spacing', () => {
    expect(matchSavedMeal(MEALS, '  overnight   OATS ').match?.id).toBe('a')
  })

  it('resolves a unique substring in either direction', () => {
    expect(matchSavedMeal(MEALS, 'oats').match?.id).toBe('a')
    expect(matchSavedMeal(MEALS, 'my usual black coffee').match?.id).toBe('c')
  })

  it('refuses to guess between candidates and hands them back', () => {
    const ambiguous = [
      { id: '1', name: 'Chicken salad' },
      { id: '2', name: 'Chicken curry' },
    ]
    const result = matchSavedMeal(ambiguous, 'chicken')
    expect(result.match).toBeNull()
    expect(result.candidates).toHaveLength(2)
  })

  it('returns nothing for an empty or unknown name', () => {
    expect(matchSavedMeal(MEALS, '').match).toBeNull()
    expect(matchSavedMeal(MEALS, 'lasagne').match).toBeNull()
  })
})
