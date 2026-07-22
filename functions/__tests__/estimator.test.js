import { describe, it, expect, vi } from 'vitest'
import { estimateMeal, EstimationError, MODEL } from '../src/estimator.js'
import { validateEstimate, totalsFor, toLogEntry, ESTIMATE_SCHEMA } from '../src/schema.js'
import { groundItems, lookupFood } from '../src/usda.js'

// ── Fakes ────────────────────────────────────────────────────────────

const MODEL_ITEMS = [
  {
    name: 'grilled chicken breast',
    quantity: '1 breast',
    grams: 170,
    kcal: 280,
    protein_g: 52,
    carbs_g: 0,
    fat_g: 6,
  },
  { name: 'white rice', quantity: '1 cup', grams: 158, kcal: 205, protein_g: 4, carbs_g: 45, fat_g: 0.4 },
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

const MODEL_RESPONSE = {
  items: MODEL_ITEMS,
  confidence: 'medium',
  assumptions: ['Assumed the chicken was cooked in ~5g of oil.'],
}

/** USDA search response shaped like the real FoodData Central payload. */
function fdcResponse(description, per100g, dataType = 'Foundation') {
  return {
    foods: [
      {
        fdcId: 1,
        description,
        dataType,
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

// ── Schema contract ──────────────────────────────────────────────────

describe('estimate schema', () => {
  it('constrains output to an object with no extra properties', () => {
    expect(ESTIMATE_SCHEMA.type).toBe('object')
    expect(ESTIMATE_SCHEMA.additionalProperties).toBe(false)
    expect(ESTIMATE_SCHEMA.required).toEqual(['items', 'confidence', 'assumptions'])
  })

  it('requires a gram mass on every item — the whole grounding step depends on it', () => {
    expect(ESTIMATE_SCHEMA.properties.items.items.required).toContain('grams')
  })

  it('avoids numeric constraints, which structured outputs do not enforce', () => {
    const itemProps = ESTIMATE_SCHEMA.properties.items.items.properties
    for (const prop of Object.values(itemProps)) {
      expect(prop.minimum).toBeUndefined()
      expect(prop.maximum).toBeUndefined()
    }
  })
})

describe('validateEstimate', () => {
  it('sums item macros into meal totals', () => {
    const { ok, estimate } = validateEstimate(MODEL_RESPONSE)
    expect(ok).toBe(true)
    expect(estimate.kcal).toBe(485)
    expect(estimate.protein_g).toBe(56)
    expect(estimate.carbs_g).toBe(45)
    expect(estimate.fat_g).toBe(6.4)
  })

  it('rejects an empty item list', () => {
    expect(validateEstimate({ items: [], confidence: 'low', assumptions: [] }).ok).toBe(false)
  })

  it('rejects negative or non-numeric macros', () => {
    const bad = { ...MODEL_RESPONSE, items: [{ ...MODEL_ITEMS[0], protein_g: -5 }] }
    expect(validateEstimate(bad).ok).toBe(false)
    const nan = { ...MODEL_RESPONSE, items: [{ ...MODEL_ITEMS[0], kcal: 'lots' }] }
    expect(validateEstimate(nan).ok).toBe(false)
  })

  it('rejects a physically implausible total rather than silently clamping it', () => {
    const absurd = {
      ...MODEL_RESPONSE,
      items: [{ ...MODEL_ITEMS[0], kcal: 40000 }],
    }
    const result = validateEstimate(absurd)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/implausibly high/i)
  })

  it('falls back to low confidence when the value is unrecognised', () => {
    const { estimate } = validateEstimate({ ...MODEL_RESPONSE, confidence: 'certain' })
    expect(estimate.confidence).toBe('low')
  })

  it('caps runaway strings and assumption lists', () => {
    const { estimate } = validateEstimate({
      ...MODEL_RESPONSE,
      assumptions: Array.from({ length: 50 }, () => 'x'.repeat(1000)),
    })
    expect(estimate.assumptions).toHaveLength(12)
    expect(estimate.assumptions[0].length).toBeLessThanOrEqual(300)
  })

  it('handles a null or non-object input', () => {
    expect(validateEstimate(null).ok).toBe(false)
    expect(validateEstimate('nope').ok).toBe(false)
  })
})

describe('totalsFor', () => {
  it('treats missing macros as zero rather than NaN', () => {
    expect(totalsFor([{ kcal: 100 }]).protein_g).toBe(0)
  })

  it('returns zeroes for no items', () => {
    expect(totalsFor([])).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })
  })
})

// ── USDA grounding ───────────────────────────────────────────────────

describe('USDA grounding', () => {
  const usdaApiKey = 'test-key'

  it('recomputes macros from per-100g values and the estimated mass', async () => {
    const fetchImpl = fakeFetch({
      'grilled chicken breast': fdcResponse('Chicken, breast, grilled', {
        kcal: 165,
        protein_g: 31,
        carbs_g: 0,
        fat_g: 3.6,
      }),
    })
    const [item] = await groundItems([MODEL_ITEMS[0]], { apiKey: usdaApiKey, fetchImpl })

    expect(item.source).toBe('usda')
    expect(item.kcal).toBeCloseTo(165 * 1.7, 1)
    expect(item.protein_g).toBeCloseTo(31 * 1.7, 1)
    expect(item.usdaDescription).toBe('Chicken, breast, grilled')
  })

  it('keeps the model estimate when nothing matches', async () => {
    const [item] = await groundItems([MODEL_ITEMS[0]], { apiKey: usdaApiKey, fetchImpl: fakeFetch({}) })
    expect(item.source).toBe('model')
    expect(item.kcal).toBe(280)
  })

  it('distrusts a match that disagrees wildly with the model', async () => {
    // "chicken breast" matching a 900 kcal/100g item means the search went wrong.
    const fetchImpl = fakeFetch({
      'grilled chicken breast': fdcResponse('Chicken fat', {
        kcal: 900,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 100,
      }),
    })
    const [item] = await groundItems([MODEL_ITEMS[0]], { apiKey: usdaApiKey, fetchImpl })
    expect(item.source).toBe('model')
    expect(item.kcal).toBe(280)
  })

  it('survives a USDA outage without failing the estimate', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
    const [item] = await groundItems([MODEL_ITEMS[0]], { apiKey: usdaApiKey, fetchImpl })
    expect(item.source).toBe('model')
  })

  it('skips grounding entirely without an API key', async () => {
    const fetchImpl = vi.fn()
    const items = await groundItems(MODEL_ITEMS, { fetchImpl })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(items.every((i) => i.source === 'model')).toBe(true)
  })

  it('prefers laboratory data types over branded submissions', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        foods: [
          fdcResponse('Branded thing', { kcal: 400, protein_g: 1, carbs_g: 1, fat_g: 1 }, 'Branded')
            .foods[0],
          fdcResponse('Rice, white, cooked', { kcal: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 })
            .foods[0],
        ],
      }),
    }))
    const match = await lookupFood('white rice', { apiKey: usdaApiKey, fetchImpl })
    expect(match.dataType).toBe('Foundation')
  })

  it('returns null on a non-ok HTTP response', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    expect(await lookupFood('anything', { apiKey: usdaApiKey, fetchImpl })).toBeNull()
  })
})

// ── Estimation service ───────────────────────────────────────────────

describe('estimateMeal', () => {
  it('estimates from a text description', async () => {
    const anthropic = fakeAnthropic(MODEL_RESPONSE)
    const result = await estimateMeal({ description: 'chicken and rice' }, { anthropic })

    expect(result.kcal).toBe(485)
    expect(result.items).toHaveLength(2)
    expect(result.confidence).toBe('medium')
    expect(result.model).toBe(MODEL)
  })

  it('sends the image as a base64 block before the text', async () => {
    const anthropic = fakeAnthropic(MODEL_RESPONSE)
    await estimateMeal(
      { imageBase64: 'AAAA', mediaType: 'image/jpeg', description: 'lunch' },
      { anthropic }
    )

    const { content } = anthropic.messages.create.mock.calls[0][0].messages[0]
    expect(content[0].type).toBe('image')
    expect(content[0].source).toEqual({
      type: 'base64',
      media_type: 'image/jpeg',
      data: 'AAAA',
    })
    expect(content[1].type).toBe('text')
    expect(content[1].text).toMatch(/lunch/)
  })

  it('strips whitespace from base64 payloads', async () => {
    const anthropic = fakeAnthropic(MODEL_RESPONSE)
    await estimateMeal({ imageBase64: 'AA\nAA\n', mediaType: 'image/png' }, { anthropic })
    const { content } = anthropic.messages.create.mock.calls[0][0].messages[0]
    expect(content[0].source.data).toBe('AAAA')
  })

  it('requests structured output so parsing never sees prose', async () => {
    const anthropic = fakeAnthropic(MODEL_RESPONSE)
    await estimateMeal({ description: 'x' }, { anthropic })
    const params = anthropic.messages.create.mock.calls[0][0]
    expect(params.output_config.format.type).toBe('json_schema')
    expect(params.output_config.format.schema).toBe(ESTIMATE_SCHEMA)
    expect(params.model).toBe('claude-opus-4-8')
  })

  it('grounds against USDA when a key is available', async () => {
    const anthropic = fakeAnthropic(MODEL_RESPONSE)
    const fetchImpl = fakeFetch({
      'grilled chicken breast': fdcResponse('Chicken, breast', {
        kcal: 165,
        protein_g: 31,
        carbs_g: 0,
        fat_g: 3.6,
      }),
      'white rice': fdcResponse('Rice, white, cooked', {
        kcal: 130,
        protein_g: 2.7,
        carbs_g: 28,
        fat_g: 0.3,
      }),
    })

    const result = await estimateMeal(
      { description: 'chicken and rice' },
      { anthropic, usdaApiKey: 'k', fetchImpl }
    )

    expect(result.grounded).toBe(true)
    expect(result.items.every((i) => i.source === 'usda')).toBe(true)
    // 165*1.7 + 130*1.58 = 280.5 + 205.4
    expect(result.kcal).toBe(486)
  })

  it('reports grounded=false when USDA contributed nothing', async () => {
    const anthropic = fakeAnthropic(MODEL_RESPONSE)
    const result = await estimateMeal(
      { description: 'x' },
      { anthropic, usdaApiKey: 'k', fetchImpl: fakeFetch({}) }
    )
    expect(result.grounded).toBe(false)
  })

  it('rejects a request with neither description nor image', async () => {
    await expect(estimateMeal({}, { anthropic: fakeAnthropic(MODEL_RESPONSE) })).rejects.toThrow(
      EstimationError
    )
  })

  it('rejects an image with no media type', async () => {
    await expect(
      estimateMeal({ imageBase64: 'AAAA' }, { anthropic: fakeAnthropic(MODEL_RESPONSE) })
    ).rejects.toThrow(/mediaType is required/)
  })

  it('rejects an unsupported image format', async () => {
    await expect(
      estimateMeal(
        { imageBase64: 'AAAA', mediaType: 'image/tiff' },
        { anthropic: fakeAnthropic(MODEL_RESPONSE) }
      )
    ).rejects.toThrow(/Unsupported image type/)
  })

  it('rejects an oversized image before spending a token', async () => {
    const anthropic = fakeAnthropic(MODEL_RESPONSE)
    const huge = 'A'.repeat(8 * 1024 * 1024)
    await expect(
      estimateMeal({ imageBase64: huge, mediaType: 'image/jpeg' }, { anthropic })
    ).rejects.toThrow(/larger than 5MB/)
    expect(anthropic.messages.create).not.toHaveBeenCalled()
  })

  it('surfaces a model refusal as an actionable message', async () => {
    const anthropic = fakeAnthropic(MODEL_RESPONSE, { stop_reason: 'refusal', content: [] })
    await expect(estimateMeal({ description: 'x' }, { anthropic })).rejects.toThrow(
      /declined to estimate/
    )
  })

  it('surfaces a truncated response rather than logging a partial meal', async () => {
    const anthropic = fakeAnthropic(MODEL_RESPONSE, { stop_reason: 'max_tokens' })
    await expect(estimateMeal({ description: 'x' }, { anthropic })).rejects.toThrow(/cut off/)
  })

  it('surfaces malformed JSON', async () => {
    const anthropic = {
      messages: {
        create: vi.fn().mockResolvedValue({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'not json' }],
        }),
      },
    }
    await expect(estimateMeal({ description: 'x' }, { anthropic })).rejects.toThrow(/malformed/)
  })

  it('wraps a transport failure', async () => {
    const anthropic = { messages: { create: vi.fn().mockRejectedValue(new Error('socket hang up')) } }
    await expect(estimateMeal({ description: 'x' }, { anthropic })).rejects.toThrow(/socket hang up/)
  })
})

// ── Shared write shape ───────────────────────────────────────────────

describe('toLogEntry — both front doors write the same schema', () => {
  const estimate = validateEstimate(MODEL_RESPONSE).estimate

  it('maps macros onto the field names the tracker already reads', () => {
    const entry = toLogEntry(estimate, { id: 'abc', description: 'lunch', source: 'photo' })
    expect(entry).toMatchObject({
      id: 'abc',
      label: 'lunch',
      kcal: 485,
      protein: 56,
      carbs: 45,
      fat: 6.4,
      source: 'photo',
    })
    expect(entry.loggedAt).toBeTruthy()
  })

  it('produces an identical entry from either front door', () => {
    const common = { id: 'abc', description: 'lunch', loggedAt: '2026-07-22T12:00:00.000Z' }
    const fromApp = toLogEntry(estimate, { ...common, source: 'photo' })
    const fromMcp = toLogEntry(estimate, { ...common, source: 'photo' })
    expect(fromApp).toEqual(fromMcp)
  })

  it('falls back to item names when no description was given', () => {
    const entry = toLogEntry(estimate, { id: 'abc', source: 'photo' })
    expect(entry.label).toBe('grilled chicken breast, white rice')
  })

  it('omits optional fields rather than writing undefined into Firestore', () => {
    const entry = toLogEntry(estimate, { id: 'abc', source: 'text' })
    expect('photoUrl' in entry).toBe(false)
    expect('mealType' in entry).toBe(false)
  })

  it('carries the breakdown and confidence through for later review', () => {
    const entry = toLogEntry(estimate, { id: 'abc', source: 'photo' })
    expect(entry.items).toHaveLength(2)
    expect(entry.confidence).toBe('medium')
    expect(entry.assumptions[0]).toMatch(/oil/)
  })
})
