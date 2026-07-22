/**
 * MEAL ESTIMATION SERVICE — Chafed & Jacked
 *
 * Accepts a text description, a photo, or both, and returns estimated macros
 * with an itemised breakdown and a confidence rating.
 *
 * Design: the model identifies foods and estimates portion MASS; USDA
 * FoodData Central supplies macro density. Vision models judge "how much food
 * is on this plate" far better than they recall "how many grams of protein are
 * in 100g of this", so each half does what it is good at.
 *
 * The Anthropic client and USDA fetch are injected so this module is testable
 * without network access or an API key.
 */

import { ESTIMATE_SCHEMA, validateEstimate } from './schema.js'
import { groundItems } from './usda.js'

export const MODEL = 'claude-opus-4-8'

const SYSTEM_PROMPT = `You estimate the macronutrient content of meals for a strength athlete logging food.

Your job has two halves, and the second matters most:
1. Identify every distinct food present.
2. Estimate the edible MASS IN GRAMS of each one. Portion mass is the single
   biggest driver of accuracy — a downstream nutrition database converts your
   gram estimates into macros, so a wrong mass is a wrong meal.

How to estimate mass from a photo:
- Anchor on reference objects with known dimensions: standard dinner plate 26-28cm,
  fork 19cm, a can 66mm across, a chicken breast 150-200g, a slice of bread 30-40g.
- Account for what you cannot see. Sauces, cooking oil, butter, and dressings are
  calorie-dense and frequently invisible. A restaurant portion of vegetables has
  typically been cooked in 10-15g of fat.
- Food depth is systematically underestimated in photos taken from above. A bowl
  is deeper than it looks.

Also give per-item macro estimates. These act as a cross-check on the database
lookup, so make them your genuine best guess rather than a placeholder.

Confidence:
- high   — packaged food with a visible label, or an explicitly stated weight.
- medium — clearly identifiable food, portion estimated from visual cues.
- low    — obscured, mixed, or ambiguous (stews, sauces, layered dishes, poor lighting).

List every assumption that materially moves the numbers, especially invisible
fats and any portion you had to guess. Never refuse to estimate because the
photo is imperfect — estimate, lower the confidence, and say what you assumed.`

/** Media types the vision API accepts. */
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export class EstimationError extends Error {
  constructor(message, code = 'estimation-failed') {
    super(message)
    this.name = 'EstimationError'
    this.code = code
  }
}

function buildUserContent({ description, imageBase64, mediaType }) {
  const content = []

  if (imageBase64) {
    if (!ALLOWED_MEDIA_TYPES.includes(mediaType)) {
      throw new EstimationError(
        `Unsupported image type "${mediaType}". Use JPEG, PNG, GIF, or WebP.`,
        'invalid-argument'
      )
    }
    // Base64 payloads must be newline-free for the API.
    const data = imageBase64.replace(/\s/g, '')
    if (data.length * 0.75 > MAX_IMAGE_BYTES) {
      throw new EstimationError('Image is larger than 5MB.', 'invalid-argument')
    }
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } })
  }

  content.push({
    type: 'text',
    text: description
      ? `Estimate the macros for this meal.\n\nWhat I ate: ${description}`
      : 'Estimate the macros for the meal in this photo.',
  })

  return content
}

/**
 * Estimate a meal.
 *
 * @param input.description  free-text description (optional if an image is given)
 * @param input.imageBase64  base64 image data, no data: prefix (optional)
 * @param input.mediaType    e.g. 'image/jpeg', required alongside imageBase64
 * @param deps.anthropic     an Anthropic SDK client
 * @param deps.usdaApiKey    FoodData Central key; grounding is skipped without it
 * @param deps.fetchImpl     injectable fetch, for tests
 *
 * @returns {Promise<{ items, kcal, protein_g, carbs_g, fat_g, confidence, assumptions, grounded }>}
 */
export async function estimateMeal(input, { anthropic, usdaApiKey, fetchImpl } = {}) {
  const { description, imageBase64, mediaType } = input || {}

  if (!description && !imageBase64) {
    throw new EstimationError('Provide a description, a photo, or both.', 'invalid-argument')
  }
  if (imageBase64 && !mediaType) {
    throw new EstimationError('mediaType is required when sending an image.', 'invalid-argument')
  }
  if (!anthropic) throw new EstimationError('No Anthropic client configured.', 'internal')

  const content = buildUserContent({ description, imageBase64, mediaType })

  let response
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      // Portion estimation benefits from deliberation, but this sits in front of
      // a "snap and log" interaction — medium keeps it responsive.
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESTIMATE_SCHEMA } },
      messages: [{ role: 'user', content }],
    })
  } catch (err) {
    throw new EstimationError(`Estimation request failed: ${err.message}`, 'unavailable')
  }

  if (response.stop_reason === 'refusal') {
    throw new EstimationError(
      'The model declined to estimate this image. Try describing the meal in text instead.',
      'failed-precondition'
    )
  }
  if (response.stop_reason === 'max_tokens') {
    throw new EstimationError('Estimate was cut off. Try a simpler meal or fewer items.', 'internal')
  }

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock) throw new EstimationError('Model returned no estimate.', 'internal')

  let parsed
  try {
    parsed = JSON.parse(textBlock.text)
  } catch {
    throw new EstimationError('Model returned malformed JSON.', 'internal')
  }

  // Ground against USDA before validating, so range checks run on final numbers.
  let items = parsed.items || []
  let grounded = false
  if (usdaApiKey && items.length > 0) {
    items = await groundItems(items, { apiKey: usdaApiKey, fetchImpl })
    grounded = items.some((i) => i.source === 'usda')
  }

  const result = validateEstimate({ ...parsed, items })
  if (!result.ok) throw new EstimationError(result.error, 'internal')

  return { ...result.estimate, grounded, model: MODEL }
}
