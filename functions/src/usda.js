/**
 * USDA FOODDATA CENTRAL GROUNDING — Chafed & Jacked
 *
 * A vision model is good at identifying food and estimating portion mass, and
 * unreliable at recalling macro density from memory. So we split the job: the
 * model reports what it sees and how much of it there is, and USDA supplies the
 * per-100g macros. Where a confident database match exists, its numbers replace
 * the model's; where none does, the model's estimate stands and the item is
 * marked as such.
 *
 * FoodData Central nutrient IDs:
 *   1008 Energy (kcal) · 1003 Protein · 1005 Carbohydrate · 1004 Total fat
 *
 * API key lives in the function environment, never in the client bundle.
 */

const FDC_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search'

const NUTRIENT_IDS = { kcal: 1008, protein_g: 1003, carbs_g: 1005, fat_g: 1004 }

/**
 * Data types in preference order. Foundation and SR Legacy are laboratory
 * analyses of generic foods; Branded is manufacturer-submitted and noisier, so
 * it is only consulted when nothing better matches.
 */
const DATA_TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded']

function extractMacros(food) {
  const out = {}
  for (const [key, id] of Object.entries(NUTRIENT_IDS)) {
    const nutrient = (food.foodNutrients || []).find(
      (n) => n.nutrientId === id || n.nutrientNumber === String(id)
    )
    if (!nutrient || typeof nutrient.value !== 'number') return null
    out[key] = nutrient.value
  }
  return out
}

/**
 * Look up per-100g macros for a single food name.
 *
 * @returns {Promise<{ per100g: Object, description: string, dataType: string } | null>}
 */
export async function lookupFood(name, { apiKey, fetchImpl = fetch, signal } = {}) {
  if (!apiKey || !name) return null

  const url = new URL(FDC_SEARCH_URL)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('query', name)
  url.searchParams.set('pageSize', '5')
  url.searchParams.set('dataType', DATA_TYPES.join(','))

  let payload
  try {
    const res = await fetchImpl(url.toString(), { signal })
    if (!res.ok) return null
    payload = await res.json()
  } catch {
    // Grounding is an enhancement, never a hard dependency — a USDA outage
    // must not take meal logging down with it.
    return null
  }

  const foods = payload?.foods || []
  if (foods.length === 0) return null

  // Prefer the highest-quality data type available among the hits.
  const ranked = [...foods].sort(
    (a, b) => DATA_TYPES.indexOf(a.dataType) - DATA_TYPES.indexOf(b.dataType)
  )

  for (const food of ranked) {
    const per100g = extractMacros(food)
    if (per100g) {
      return {
        per100g,
        description: food.description,
        dataType: food.dataType,
        fdcId: food.fdcId,
      }
    }
  }
  return null
}

/**
 * How far the model's own estimate may sit from USDA before we distrust the
 * match rather than the model. A chicken breast and "chicken breast, breaded,
 * fried" differ legitimately; a 5x gap means the search matched the wrong food.
 */
const MAX_KCAL_RATIO = 3

/**
 * Re-derive each item's macros from USDA per-100g values and the model's
 * estimated mass. Items with no match, or a match that disagrees wildly, keep
 * the model's numbers.
 */
export async function groundItems(items, { apiKey, fetchImpl = fetch } = {}) {
  if (!apiKey) return items.map((item) => ({ ...item, source: 'model' }))

  const results = await Promise.all(
    items.map(async (item) => {
      const match = await lookupFood(item.name, { apiKey, fetchImpl })
      if (!match || !(item.grams > 0)) return { ...item, source: 'model' }

      const scale = item.grams / 100
      const grounded = {
        kcal: match.per100g.kcal * scale,
        protein_g: match.per100g.protein_g * scale,
        carbs_g: match.per100g.carbs_g * scale,
        fat_g: match.per100g.fat_g * scale,
      }

      // Sanity-check the match against the model before trusting it.
      const modelKcal = Number(item.kcal) || 0
      if (modelKcal > 0 && grounded.kcal > 0) {
        const ratio = Math.max(grounded.kcal / modelKcal, modelKcal / grounded.kcal)
        if (ratio > MAX_KCAL_RATIO) return { ...item, source: 'model' }
      }

      return {
        ...item,
        ...grounded,
        source: 'usda',
        usdaDescription: match.description,
      }
    })
  )

  return results
}
