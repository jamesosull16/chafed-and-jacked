/**
 * COACH TOOLS — Chafed & Jacked
 *
 * The model's action surface. Two categories:
 *
 *   Effectful — write to Firestore (log/update/delete a meal). These are the
 *   only tools that change anything.
 *
 *   Presentational — validate a structure the model authored and hand it back
 *   for the UI to render as a card (meal options, session adjustments). These
 *   deliberately invent no data: the model is the author, the tool is the
 *   rendering channel. Making them "return suggestions" would let a tool
 *   fabricate numbers that look database-backed.
 *
 * Read-only context (targets, intake, session, chain balance) is injected into
 * the prompt rather than exposed as tools — it is needed on nearly every turn,
 * and a tool round-trip per message would double latency for no benefit.
 *
 * Every handler is closed over a fixed uid. No tool takes a uid argument, so a
 * prompt-injected instruction cannot redirect a read or write to another user.
 */

import { validateEstimate, toLogEntry, totalsFor } from '../schema.js'

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'preWorkout', 'postWorkout']

export const TOOL_DEFINITIONS = [
  {
    name: 'estimate_meal',
    description:
      'Estimate the macros of a meal from a description and/or the photo attached to this ' +
      "turn. Call this first whenever James says what he ate. Returns an itemised breakdown " +
      'with a confidence rating. Does not save anything — follow with log_meal.',
    input_schema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description:
            "What he ate, in his words plus any portion detail you can infer from the " +
            'conversation. Leave empty to estimate purely from the attached photo.',
        },
        use_photo: {
          type: 'boolean',
          description: 'Use the photo attached to this turn. Only true when one was attached.',
        },
      },
    },
  },
  {
    name: 'log_meal',
    description:
      "Save a meal to today's nutrition log. Call this straight after estimate_meal — do not " +
      'ask permission first. The UI renders the breakdown as a card with an edit affordance.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Short dish name, e.g. "Chicken burrito bowl".' },
        meal_type: { type: 'string', enum: MEAL_TYPES },
        items: {
          type: 'array',
          description: 'The itemised breakdown, straight from estimate_meal.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              quantity: { type: 'string' },
              grams: { type: 'number' },
              kcal: { type: 'number' },
              protein_g: { type: 'number' },
              carbs_g: { type: 'number' },
              fat_g: { type: 'number' },
            },
            required: ['name', 'quantity', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
          },
        },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        assumptions: { type: 'array', items: { type: 'string' } },
      },
      required: ['label', 'items', 'confidence'],
    },
  },
  {
    name: 'update_meal',
    description:
      'Correct a meal already logged today. Use this when James adjusts a portion or a number ' +
      'after the fact — never log a second entry for the same meal.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entry id, from the LOGGED TODAY context line.' },
        label: { type: 'string' },
        kcal: { type: 'number' },
        protein_g: { type: 'number' },
        carbs_g: { type: 'number' },
        fat_g: { type: 'number' },
        meal_type: { type: 'string', enum: MEAL_TYPES },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_meal',
    description:
      'Remove a meal from today\'s log entirely. Use only when James says he did not eat it or ' +
      'that it was logged by mistake — if he is correcting a portion or a number, use ' +
      'update_meal instead so the entry keeps its history.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'propose_meals',
    description:
      'Show 1-3 meal options as tappable cards, each sized to close the remaining macro gap. ' +
      'You author the options; this renders them and lets James log one in a tap. Use real ' +
      'foods with realistic portions that actually add up to the macros you claim.',
    input_schema: {
      type: 'object',
      properties: {
        options: {
          type: 'array',
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'e.g. "Salmon, sweet potato & rice"' },
              description: {
                type: 'string',
                description: 'Portions, e.g. "8oz salmon, 250g sweet potato, 1 cup rice, greens"',
              },
              kcal: { type: 'number' },
              protein_g: { type: 'number' },
              carbs_g: { type: 'number' },
              fat_g: { type: 'number' },
            },
            required: ['name', 'description', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
          },
        },
      },
      required: ['options'],
    },
  },
  {
    name: 'show_session',
    description:
      "Render today's session as a card — the exercise list with sets, reps, RIR and any " +
      'guardrail notes. Use when James asks what he is training.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'propose_adjustment',
    description:
      'Propose changes to an upcoming session as a card James can apply in one tap. Use for ' +
      'swaps, load changes, or added mobility. Every change must respect the active injury ' +
      'guardrails — never propose a movement the current hamstring stage or the knee flag ' +
      'excludes.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'e.g. "Tomorrow · adjust"' },
        subtitle: { type: 'string', description: 'e.g. "Lower A — knee-friendly"' },
        changes: {
          type: 'array',
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'e.g. "Swap Leg Press"' },
              detail: { type: 'string', description: 'e.g. "pain-free ROM, +tempo"' },
              value: { type: 'string', description: 'e.g. "3 × 20s" or "apply"' },
            },
            required: ['label'],
          },
        },
      },
      required: ['title', 'changes'],
    },
  },
]

export class ToolError extends Error {}

const round1 = (n) => Math.round(n * 10) / 10

/**
 * Build the handler map for one authenticated turn.
 *
 * @param deps.store        Firestore accessor bound to a single uid
 * @param deps.estimate     the shared estimation service
 * @param deps.photo        { base64, mediaType } attached to this turn, if any
 * @param deps.dateId       local YYYY-MM-DD for today
 * @param deps.context      the same context block handed to the model
 */
export function createHandlers({ store, estimate, photo, dateId, context }) {
  /** Cards accumulated across the turn, in the order the model produced them. */
  const cards = []
  /** Set when the log changes, so the caller knows to recompute totals. */
  let logMutated = false

  async function readLog() {
    const doc = await store.getDoc('nutritionLogs', dateId)
    return doc?.entries || []
  }

  async function writeLog(entries) {
    await store.setDoc('nutritionLogs', dateId, {
      date: dateId,
      entries,
      ...(context?.targets && {
        targets: {
          kcal: context.targets.kcal,
          protein: context.targets.protein_g,
          carbs: context.targets.carbs_g,
          fat: context.targets.fat_g,
        },
      }),
    })
    logMutated = true
  }

  const handlers = {
    async estimate_meal({ description, use_photo }) {
      if (!description && !(use_photo && photo)) {
        throw new ToolError(
          'No description and no photo attached — ask James what he ate rather than guessing.'
        )
      }
      const result = await estimate({
        description,
        imageBase64: use_photo && photo ? photo.base64 : undefined,
        mediaType: use_photo && photo ? photo.mediaType : undefined,
      })
      return {
        items: result.items,
        kcal: result.kcal,
        protein_g: result.protein_g,
        carbs_g: result.carbs_g,
        fat_g: result.fat_g,
        confidence: result.confidence,
        assumptions: result.assumptions,
        grounded_in_usda: result.grounded,
      }
    },

    async log_meal({ label, meal_type, items, confidence, assumptions }) {
      const validated = validateEstimate({ items, confidence, assumptions: assumptions || [] })
      if (!validated.ok) throw new ToolError(validated.error)

      const entry = toLogEntry(validated.estimate, {
        id: store.newId(),
        description: label,
        mealType: meal_type,
        source: photo ? 'chat_photo' : 'chat_text',
      })

      const entries = [...(await readLog()), entry]
      await writeLog(entries)

      cards.push({ type: 'food_log', entry })
      return {
        logged: true,
        id: entry.id,
        totals: { kcal: entry.kcal, protein_g: entry.protein, carbs_g: entry.carbs, fat_g: entry.fat },
        day_totals: dayTotals(entries),
        remaining: remainingFrom(entries),
      }
    },

    async update_meal({ id, label, kcal, protein_g, carbs_g, fat_g, meal_type }) {
      const entries = await readLog()
      const index = entries.findIndex((e) => e.id === id)
      if (index === -1) {
        throw new ToolError(
          `No meal with id ${id} logged today. Check the LOGGED TODAY line for valid ids.`
        )
      }

      const patch = {
        ...(label !== undefined && { label }),
        ...(kcal !== undefined && { kcal }),
        ...(protein_g !== undefined && { protein: protein_g }),
        ...(carbs_g !== undefined && { carbs: carbs_g }),
        ...(fat_g !== undefined && { fat: fat_g }),
        ...(meal_type !== undefined && { mealType: meal_type }),
      }

      const next = [...entries]
      next[index] = { ...entries[index], ...patch, editedAt: new Date().toISOString() }
      await writeLog(next)

      cards.push({ type: 'food_log', entry: next[index], corrected: true })
      return { updated: true, entry: next[index], day_totals: dayTotals(next), remaining: remainingFrom(next) }
    },

    async delete_meal({ id }) {
      const entries = await readLog()
      const next = entries.filter((e) => e.id !== id)
      if (next.length === entries.length) throw new ToolError(`No meal with id ${id} logged today.`)
      await writeLog(next)
      return { deleted: true, day_totals: dayTotals(next), remaining: remainingFrom(next) }
    },

    async propose_meals({ options }) {
      if (!Array.isArray(options) || options.length === 0) {
        throw new ToolError('Provide at least one option.')
      }
      const cleaned = options.slice(0, 3).map((o) => ({
        name: String(o.name).slice(0, 120),
        description: String(o.description).slice(0, 240),
        kcal: Math.round(Number(o.kcal) || 0),
        protein_g: round1(Number(o.protein_g) || 0),
        carbs_g: round1(Number(o.carbs_g) || 0),
        fat_g: round1(Number(o.fat_g) || 0),
      }))
      cards.push({ type: 'meal_options', options: cleaned })
      return { shown: cleaned.length }
    },

    async show_session() {
      if (!context?.session) {
        return { session: null, note: 'Rest day — no session scheduled.' }
      }
      cards.push({ type: 'session', session: context.session })
      return { shown: true, name: context.session.name }
    },

    async propose_adjustment({ title, subtitle, changes }) {
      if (!Array.isArray(changes) || changes.length === 0) {
        throw new ToolError('Provide at least one change.')
      }
      cards.push({
        type: 'adjustment',
        title: String(title).slice(0, 80),
        subtitle: subtitle ? String(subtitle).slice(0, 120) : null,
        changes: changes.slice(0, 5).map((c) => ({
          label: String(c.label).slice(0, 120),
          detail: c.detail ? String(c.detail).slice(0, 160) : null,
          value: c.value ? String(c.value).slice(0, 40) : null,
        })),
      })
      return { shown: true }
    },
  }

  function dayTotals(entries) {
    const t = totalsFor(
      entries.map((e) => ({
        kcal: e.kcal,
        protein_g: e.protein,
        carbs_g: e.carbs,
        fat_g: e.fat,
      }))
    )
    return {
      kcal: Math.round(t.kcal),
      protein_g: round1(t.protein_g),
      carbs_g: round1(t.carbs_g),
      fat_g: round1(t.fat_g),
    }
  }

  function remainingFrom(entries) {
    if (!context?.targets) return null
    const consumed = dayTotals(entries)
    return {
      kcal: Math.round(context.targets.kcal - consumed.kcal),
      protein_g: round1(context.targets.protein_g - consumed.protein_g),
      carbs_g: round1(context.targets.carbs_g - consumed.carbs_g),
      fat_g: round1(context.targets.fat_g - consumed.fat_g),
    }
  }

  return {
    handlers,
    cards,
    get logMutated() {
      return logMutated
    },
    dayTotals,
    remainingFrom,
    readLog,
  }
}
