/**
 * The ingredient lookup: typed lines in, priced grams out.
 *
 * The failure that matters most here is silent misalignment — an answer landing
 * on the wrong line, or a line quietly getting no answer at all. Either one
 * writes a wrong number into the day with nothing on screen to show for it, so
 * the validator is strict about coverage and these tests are about that as much
 * as about the arithmetic.
 */
import { describe, it, expect, vi } from 'vitest'
import { resolveIngredients, IngredientError, normaliseLines, MAX_LINES } from '../src/ingredients.js'
import { INGREDIENT_SCHEMA, validateIngredients } from '../src/schema.js'

const LINES = ['2 cans of 15 oz garbanzo beans', '2 tbsp olive oil']

const MODEL_ITEMS = [
  {
    index: 0,
    name: 'chickpeas, canned, drained',
    amount: '2 × 15 oz can, drained',
    grams: 510,
    kcal: 700,
    protein_g: 38,
    carbs_g: 119,
    fat_g: 7,
    note: 'A 15 oz can is 425g net including liquid, about 255g drained.',
    confidence: 'high',
  },
  {
    index: 1,
    name: 'olive oil',
    amount: '2 tbsp',
    grams: 28,
    kcal: 248,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 28,
    note: '1 tbsp of oil is 14g.',
    confidence: 'high',
  },
]

function fakeAnthropic(payload, overrides = {}) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        ...overrides,
      }),
    },
  }
}

function fdcResponse(description, per100g) {
  return {
    foods: [
      {
        fdcId: 1,
        description,
        dataType: 'Foundation',
        foodNutrients: [
          { nutrientId: 1008, value: per100g.kcal },
          { nutrientId: 1003, value: per100g.protein_g },
          { nutrientId: 1005, value: per100g.carbs_g },
          { nutrientId: 1004, value: per100g.fat_g },
        ],
      },
    ],
  }
}

function fakeFetch(byQuery) {
  return vi.fn(async (url) => {
    const query = new URL(url).searchParams.get('query')
    const payload = byQuery[query]
    if (!payload) return { ok: true, json: async () => ({ foods: [] }) }
    return { ok: true, json: async () => payload }
  })
}

// ── Contract ─────────────────────────────────────────────────────────

describe('ingredient schema', () => {
  it('makes the line index part of every answer', () => {
    const item = INGREDIENT_SCHEMA.properties.items.items
    expect(item.required).toContain('index')
    expect(item.additionalProperties).toBe(false)
  })

  it('requires the arithmetic to be stated rather than left optional', () => {
    expect(INGREDIENT_SCHEMA.properties.items.items.required).toContain('note')
  })
})

describe('validateIngredients', () => {
  it('lands each answer on the line it was asked about', () => {
    const { ok, items } = validateIngredients({ items: [MODEL_ITEMS[1], MODEL_ITEMS[0]] }, LINES)
    expect(ok).toBe(true)
    expect(items[0].name).toBe('chickpeas, canned, drained')
    expect(items[0].input).toBe(LINES[0])
    expect(items[1].name).toBe('olive oil')
  })

  /**
   * A dropped line would reach the editor as a row that simply stayed blank
   * while the others filled in — easy to miss, and it undercounts the meal by
   * exactly one ingredient.
   */
  it('refuses an answer set that misses a line', () => {
    const result = validateIngredients({ items: [MODEL_ITEMS[0]] }, LINES)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('2 tbsp olive oil')
  })

  it('refuses an answer for a line that was never asked about', () => {
    const result = validateIngredients({ items: [...MODEL_ITEMS, { ...MODEL_ITEMS[0], index: 7 }] }, LINES)
    expect(result.ok).toBe(false)
  })

  it('keeps the first answer when the model repeats an index', () => {
    const repeat = { ...MODEL_ITEMS[0], name: 'chickpeas, dry', kcal: 1800 }
    const { items } = validateIngredients({ items: [...MODEL_ITEMS, repeat] }, LINES)
    expect(items[0].name).toBe('chickpeas, canned, drained')
  })

  it('rejects numbers that are not physically possible rather than clamping them', () => {
    const mad = { ...MODEL_ITEMS[0], kcal: 40000 }
    expect(validateIngredients({ items: [mad, MODEL_ITEMS[1]] }, LINES).ok).toBe(false)
    const negative = { ...MODEL_ITEMS[0], grams: -5 }
    expect(validateIngredients({ items: [negative, MODEL_ITEMS[1]] }, LINES).ok).toBe(false)
  })

  it('speaks the same item shape as a photo estimate', () => {
    const { items } = validateIngredients({ items: MODEL_ITEMS }, LINES)
    expect(items[0]).toMatchObject({
      name: expect.any(String),
      quantity: '2 × 15 oz can, drained',
      grams: 510,
      kcal: 700,
      protein_g: 38,
      carbs_g: 119,
      fat_g: 7,
    })
  })
})

describe('normaliseLines', () => {
  it('drops the rows he has not filled in yet', () => {
    expect(normaliseLines(['  beans ', '', '   ', 'oil'])).toEqual(['beans', 'oil'])
    expect(normaliseLines(null)).toEqual([])
  })
})

// ── The service ──────────────────────────────────────────────────────

describe('resolveIngredients', () => {
  const deps = (anthropic, extra = {}) => ({ anthropic, ...extra })

  it('prices each line from USDA against the mass the model worked out', async () => {
    const anthropic = fakeAnthropic({ items: MODEL_ITEMS })
    const fetchImpl = fakeFetch({
      'chickpeas, canned, drained': fdcResponse('Chickpeas, canned, drained', {
        kcal: 139,
        protein_g: 7.4,
        carbs_g: 23.3,
        fat_g: 1.4,
      }),
    })

    const result = await resolveIngredients(
      { lines: LINES },
      deps(anthropic, { usdaApiKey: 'k', fetchImpl })
    )

    // 510g at 139 kcal/100g.
    expect(result.items[0].kcal).toBeCloseTo(708.9, 1)
    expect(result.items[0].source).toBe('usda')
    expect(result.grounded).toBe(true)
    // The line, the human amount and the arithmetic all survive grounding —
    // they are what the row shows, and USDA has an opinion on none of them.
    expect(result.items[0].input).toBe(LINES[0])
    expect(result.items[0].quantity).toBe('2 × 15 oz can, drained')
    expect(result.items[0].note).toContain('425g net')
    expect(result.items[0].index).toBe(0)
  })

  it('keeps the model’s own numbers where the database has no match', async () => {
    const anthropic = fakeAnthropic({ items: MODEL_ITEMS })
    const result = await resolveIngredients(
      { lines: LINES },
      deps(anthropic, { usdaApiKey: 'k', fetchImpl: fakeFetch({}) })
    )
    expect(result.items[0].kcal).toBe(700)
    expect(result.items[0].source).toBe('model')
    expect(result.grounded).toBe(false)
  })

  it('works with no USDA key at all — the lookup is grounding, not a dependency', async () => {
    const anthropic = fakeAnthropic({ items: MODEL_ITEMS })
    const result = await resolveIngredients({ lines: LINES }, deps(anthropic))
    expect(result.items).toHaveLength(2)
    expect(result.grounded).toBe(false)
  })

  it('numbers the lines for the model so the answers can be matched back', async () => {
    const anthropic = fakeAnthropic({ items: MODEL_ITEMS })
    await resolveIngredients({ lines: LINES, context: 'sheet pan dinner' }, deps(anthropic))
    const { messages } = anthropic.messages.create.mock.calls[0][0]
    expect(messages[0].content).toContain('0. 2 cans of 15 oz garbanzo beans')
    expect(messages[0].content).toContain('1. 2 tbsp olive oil')
    expect(messages[0].content).toContain('sheet pan dinner')
  })

  it('refuses an empty or oversized list before spending a request', async () => {
    const anthropic = fakeAnthropic({ items: [] })
    await expect(resolveIngredients({ lines: [] }, deps(anthropic))).rejects.toThrow(IngredientError)
    await expect(
      resolveIngredients({ lines: new Array(MAX_LINES + 1).fill('rice') }, deps(anthropic))
    ).rejects.toThrow(/more than/)
    expect(anthropic.messages.create).not.toHaveBeenCalled()
  })

  it('surfaces a cut-off or refused answer rather than a half-priced meal', async () => {
    await expect(
      resolveIngredients({ lines: LINES }, deps(fakeAnthropic({ items: MODEL_ITEMS }, { stop_reason: 'max_tokens' })))
    ).rejects.toThrow(/cut off/)
    await expect(
      resolveIngredients({ lines: LINES }, deps(fakeAnthropic({ items: MODEL_ITEMS }, { stop_reason: 'refusal' })))
    ).rejects.toThrow(/declined/)
  })

  it('reports a missing line as a failure, not a blank row', async () => {
    const anthropic = fakeAnthropic({ items: [MODEL_ITEMS[0]] })
    await expect(resolveIngredients({ lines: LINES }, deps(anthropic))).rejects.toThrow(
      /Nothing came back/
    )
  })
})
