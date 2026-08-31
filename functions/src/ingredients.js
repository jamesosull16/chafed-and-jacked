/**
 * INGREDIENT RESOLUTION — Chafed & Jacked
 *
 * One typed line in, one priced ingredient out: "2 cans of 15 oz garbanzo
 * beans" becomes 510g of drained chickpeas with USDA macros against it.
 *
 * This is the same two-halves split as `estimator.js` — the model converts
 * human amounts into edible grams, USDA supplies the macro density — pointed at
 * a different question. The estimator answers "what is on this plate"; this
 * answers "what does *this much of this* come to", which is the question a
 * recipe asks, and the one a photo cannot.
 *
 * The hard part is not arithmetic, it is that a label lies about mass. A 15 oz
 * can is 425g of beans *and packing liquid*, and the liquid goes down the sink.
 * Reading the label number as food is a ~40% overcount on every can of beans,
 * every tin of tuna, every jar of olives. So the model is asked for drained,
 * as-eaten mass and made to say so in `note` — the correction has to be visible
 * or it is indistinguishable from a bug.
 *
 * Lines are resolved as a batch in one request. Ten ingredients is one call,
 * not ten: it costs less, and it lets the model see "olive oil" next to "2 cans
 * garbanzo beans" and price the oil as a roasting fat rather than a salad one.
 */

import { INGREDIENT_SCHEMA, validateIngredients } from './schema.js'
import { groundItems } from './usda.js'

export const MODEL = 'claude-opus-4-8'

/** More lines than this in one meal is a paste accident, not a recipe. */
export const MAX_LINES = 40

const MAX_LINE_LENGTH = 200

const SYSTEM_PROMPT = `You convert ingredient lines from a recipe into edible mass in grams, for a strength athlete logging food.

You are given a numbered list of ingredient lines. Return exactly one item per
line, echoing its index. Never merge two lines, never split one, never drop one.
If a line is unintelligible, still return an item for it with your best guess and
say so in the note.

Your primary job is MASS. A nutrition database converts your grams into macros,
so the grams are the answer and the macros you give are a cross-check.

Read the amount exactly as written, then correct it to what is actually eaten:

- MULTIPLY THE COUNT. "2 cans of 15 oz garbanzo beans" is both cans — around
  510g of drained beans in total, not 255g. The count is part of the amount.
- PACKAGE SIZES ARE NET WEIGHT, INCLUDING LIQUID. A 15 oz / 425g can of beans
  yields roughly 250-260g drained. Tinned tuna in water: a 5 oz can is about
  100g drained. Do this correction for anything canned, tinned, jarred, or
  brined whenever the liquid is normally discarded — and do NOT do it for soups,
  coconut milk, tomatoes in a sauce, or anything where the liquid is eaten.
- DRY GOODS ARE AS PURCHASED UNLESS COOKED IS STATED. "100g rice" is 100g of dry
  rice, which the athlete eats as ~300g cooked. Price the dry mass: it is the
  same food and the same calories, and the database has an entry for both. Name
  it so the lookup matches what you weighed — "rice, white, dry" or "rice,
  white, cooked", never ambiguous.
- VOLUME NEEDS A DENSITY. 1 cup of oats is 80g, 1 cup of flour 120g, 1 cup of
  water or milk 240g, 1 tbsp of oil 14g, 1 tbsp of peanut butter 16g. Say which
  density you used in the note when it is not obvious.
- TRIMMING AND BONES. "2 bone-in chicken thighs" is about 190g of edible meat,
  not 300g of thigh. Price what is swallowed.

Name each item the way a nutrition database names it — "chickpeas, canned,
drained" beats "garbanzo beans" — because the name is what gets looked up.

Set \`amount\` to a short human echo of the input as you understood it
("2 × 15 oz can, drained"), and \`note\` to the arithmetic whenever you changed
the number the athlete typed. A silent correction is worse than no correction:
if you turned 850g of label weight into 510g of beans, say so in one line.

Confidence per item: high for a stated weight or a labelled package, medium for
a standard measure you converted, low for a vague amount ("a handful", "some
cheese").`

export class IngredientError extends Error {
  constructor(message, code = 'ingredient-failed') {
    super(message)
    this.name = 'IngredientError'
    this.code = code
  }
}

/**
 * Clean the typed lines into what the model is asked about.
 *
 * Blank lines are dropped here rather than sent — an empty row is a row the
 * athlete has not filled in yet, and the editor keeps plenty of those on screen
 * while he is typing. Indices are assigned after the drop, so the caller must
 * match results back by the returned `index`, not by its own row order.
 */
export function normaliseLines(lines) {
  if (!Array.isArray(lines)) return []
  return lines
    .map((line) => String(line?.text ?? line ?? '').trim().slice(0, MAX_LINE_LENGTH))
    .filter(Boolean)
}

/**
 * Resolve ingredient lines into priced items.
 *
 * @param input.lines    array of strings (or `{ text }`), one ingredient each
 * @param input.context  optional free text about the dish, e.g. "roasted, sheet pan"
 * @param deps.anthropic an Anthropic SDK client
 * @param deps.usdaApiKey FoodData Central key; grounding is skipped without it
 * @returns {Promise<{ items: Array, grounded: boolean, model: string }>}
 */
export async function resolveIngredients(input, { anthropic, usdaApiKey, fetchImpl } = {}) {
  const lines = normaliseLines(input?.lines)

  if (lines.length === 0) {
    throw new IngredientError('No ingredients to look up.', 'invalid-argument')
  }
  if (lines.length > MAX_LINES) {
    throw new IngredientError(`That is more than ${MAX_LINES} ingredients.`, 'invalid-argument')
  }
  if (!anthropic) throw new IngredientError('No Anthropic client configured.', 'internal')

  const context = String(input?.context || '').trim().slice(0, 300)
  const numbered = lines.map((line, i) => `${i}. ${line}`).join('\n')

  let response
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      // Unit conversion and drained yields are recall, not deliberation, and
      // this sits under a cursor in a form — the athlete is waiting on it.
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: INGREDIENT_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content:
            (context ? `The dish: ${context}\n\n` : '') +
            `Convert these ${lines.length} ingredient line(s) to grams:\n\n${numbered}`,
        },
      ],
    })
  } catch (err) {
    throw new IngredientError(`Ingredient lookup failed: ${err.message}`, 'unavailable')
  }

  if (response.stop_reason === 'refusal') {
    throw new IngredientError('The model declined to price these ingredients.', 'failed-precondition')
  }
  if (response.stop_reason === 'max_tokens') {
    throw new IngredientError('Lookup was cut off. Try fewer ingredients at once.', 'internal')
  }

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock) throw new IngredientError('Model returned no items.', 'internal')

  let parsed
  try {
    parsed = JSON.parse(textBlock.text)
  } catch {
    throw new IngredientError('Model returned malformed JSON.', 'internal')
  }

  const result = validateIngredients(parsed, lines)
  if (!result.ok) throw new IngredientError(result.error, 'internal')

  // Ground after validation here, unlike the estimator: validation is what
  // guarantees one item per line with a usable mass, and grounding is a no-op
  // on an item whose grams did not survive that check.
  let items = result.items
  let grounded = false
  if (usdaApiKey) {
    const priced = await groundItems(items, { apiKey: usdaApiKey, fetchImpl })
    // `groundItems` returns the estimator's item shape; the fields this module
    // adds (index, input, amount, note) ride along on the spread.
    items = priced.map((item, i) => ({ ...items[i], ...item }))
    grounded = items.some((i) => i.source === 'usda')
  }

  return { items, grounded, model: MODEL }
}
