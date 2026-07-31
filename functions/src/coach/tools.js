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
import { findBlockedMovements } from './guardrails.js'
import { normaliseMileageDoc, summariseSession, toDate, appendRun } from './training.js'
import { estimateSessionCost, summariseBodyMetrics } from './energy.js'

/** Reads are capped so a model-chosen argument can't pull an unbounded scan. */
const MAX_HISTORY_DAYS = 90
const MAX_METRIC_WEEKS = 52

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
    name: 'propose_fuelling',
    description:
      'Render a fuelling-window card — a labelled window ("next 45 min") and 2-3 concrete ' +
      'options with macros, each loggable in one tap. Use after a session that genuinely ' +
      'warrants a window: a long run, a depleting interval session, or a hard lift with ' +
      'another session close behind. Do NOT use it after an easy or short session — a 25-minute ' +
      'recovery jog needs a normal meal, and a card there is noise. You author the numbers from ' +
      'the context block and tool results; this validates and renders them.',
    input_schema: {
      type: 'object',
      properties: {
        window: {
          type: 'string',
          description: 'The window label, e.g. "next 45 min" or "within 2 hours".',
        },
        rationale: {
          type: 'string',
          description: 'One line on why this window and this size, grounded in the actual session.',
        },
        options: {
          type: 'array',
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string', description: 'Portions, in real food.' },
              kcal: { type: 'number' },
              protein_g: { type: 'number' },
              carbs_g: { type: 'number' },
              fat_g: { type: 'number' },
            },
            required: ['name', 'description', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
          },
        },
      },
      required: ['window', 'options'],
    },
  },

  // ── Reads ──
  //
  // The context block already carries what is needed on nearly every turn.
  // These are for detail too large to inject every time (every set of a
  // session), or too rare (one exercise's history, a 90-day trend). Call them
  // when the answer actually depends on the detail — not to confirm something
  // the context line already says.
  {
    name: 'get_workout',
    description:
      'Full detail of one session — every set, weight, reps and RIR — or a given day\'s runs ' +
      'with duration and heart rate. More than the LAST SESSION context line carries. Use when ' +
      'the answer depends on how individual sets actually went, not just that a session happened.',
    input_schema: {
      type: 'object',
      properties: {
        which: {
          type: 'string',
          enum: ['last', 'today', 'date'],
          description: 'Which workout. Use "date" with the date field for a specific day.',
        },
        date: { type: 'string', description: 'YYYY-MM-DD. Required when which is "date".' },
      },
      required: ['which'],
    },
  },
  {
    name: 'get_training_history',
    description:
      'Sessions and runs over a window, with weekly aggregates. Use for "how has my volume ' +
      'trended", "am I ramping too fast", or any question about a pattern across weeks rather ' +
      'than a single session. Never answer a trend question from memory — call this.',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'How many days back, 1-90. Defaults to 28.',
        },
      },
    },
  },
  {
    name: 'get_exercise_progress',
    description:
      'Load and rep history for one movement, for "am I progressing on hip thrusts". Takes the ' +
      'app\'s exercise id, e.g. barbellHipThrust or lyingLegCurl — the ids shown in the LAST ' +
      'SESSION context line.',
    input_schema: {
      type: 'object',
      properties: {
        exercise_id: { type: 'string', description: 'The app exercise id.' },
      },
      required: ['exercise_id'],
    },
  },
  {
    name: 'get_body_metrics',
    description:
      'Weight, body-fat and lean-mass trend. Enforces the same rule the app does: with fewer ' +
      'than three weeks of weigh-ins it reports the readings but refuses a trend, because a ' +
      'single reading is water rather than tissue. Do not compute a trend yourself from the ' +
      'raw entries when it says it has too few.',
    input_schema: {
      type: 'object',
      properties: {
        weeks: { type: 'number', description: 'Window in weeks, 1-52. Defaults to 8.' },
      },
    },
  },
  {
    name: 'estimate_session_cost',
    description:
      'Energy cost of a specific session or run, from the same model the app uses, so fuelling ' +
      'advice rests on a number rather than a guess. Call before giving a recovery or refuelling ' +
      'answer that depends on how depleting the session actually was.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'A workoutSessions id, or "last" for the most recent completed session.',
        },
        run: {
          type: 'object',
          description: 'A run to cost instead of a session. Use for a run just described to you.',
          properties: {
            miles: { type: 'number' },
            duration_minutes: { type: 'number' },
            avg_hr_bpm: { type: 'number' },
          },
        },
      },
    },
  },
  {
    name: 'log_run',
    description:
      'Log a run James tells you he did. Only ever for a run he states as completed — never ' +
      'log one he is planning, considering, or asking about, and never infer a distance he ' +
      'did not give. If he says how long it took or what his heart rate averaged, include ' +
      'those; they make the calorie and fuelling maths real rather than assumed. After ' +
      'logging, answer in the same turn — do not wait for anything else to comment on it.',
    input_schema: {
      type: 'object',
      properties: {
        miles: { type: 'number', description: 'Distance in miles. Required.' },
        duration_minutes: { type: 'number' },
        avg_hr_bpm: { type: 'number' },
        date: {
          type: 'string',
          description: 'YYYY-MM-DD. Defaults to today; use only when he says it was another day.',
        },
      },
      required: ['miles'],
    },
  },
  {
    name: 'log_subjective',
    description:
      'Record how James says he is feeling — sleep, soreness, how hard a session felt, or a ' +
      'short note. Use it when he volunteers that kind of thing in passing ("slept badly", ' +
      '"legs are wrecked"), so it is still known tomorrow rather than scrolling out of the ' +
      'conversation. Do not interrogate him for the fields; log whatever he actually said.',
    input_schema: {
      type: 'object',
      properties: {
        sleep_hours: { type: 'number' },
        soreness: {
          type: 'number',
          description: '1-10, where 10 is the worst. Only if he gives a sense of severity.',
        },
        rpe: { type: 'number', description: '1-10 perceived exertion for the last session.' },
        note: { type: 'string', description: 'His words, condensed. Max ~200 chars.' },
      },
    },
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

    /**
     * Writes the same document `useWorkout.addRun` writes, via the same
     * append logic — see the parity test. Deliberately does not fire the
     * proactive post-workout message: the coach is already mid-conversation
     * here, and a second unprompted message about the run it just logged is
     * exactly what "never send the same message twice about the same session"
     * exists to prevent. It answers in this turn instead.
     */
    async log_run({ miles, duration_minutes, avg_hr_bpm, date }) {
      const distance = Number(miles)
      if (!Number.isFinite(distance) || distance <= 0) {
        throw new ToolError('How far was it? I need the distance in miles to log a run.')
      }
      if (distance > 200) {
        throw new ToolError(`${distance} miles doesn't look right — check the distance with him.`)
      }
      if (date != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
        throw new ToolError('Dates must be YYYY-MM-DD.')
      }

      const day = date ? String(date) : dateId
      const existing = await store.getDoc('dailyMileage', day)

      const run = { miles: distance, enteredAt: new Date().toISOString() }
      const duration = Number(duration_minutes)
      if (Number.isFinite(duration) && duration > 0) run.duration_minutes = duration
      const hr = Number(avg_hr_bpm)
      if (Number.isFinite(hr) && hr > 0) run.avg_hr_bpm = hr

      const { runs, miles: total } = appendRun(existing, run)
      await store.setDoc('dailyMileage', day, { date: day, runs, miles: total })

      return {
        logged: true,
        date: day,
        miles: distance,
        day_total_miles: round1(total),
        runs_logged_today: runs.length,
      }
    },

    /**
     * How a session felt, kept somewhere it survives the conversation.
     *
     * Lives under the user subtree, so unlike `coachMemory` it needs no
     * firestore.rules change — the recursive wildcard already covers it, and
     * unlike remembered facts this is James's own record of his own body,
     * which he should be able to correct.
     */
    async log_subjective({ sleep_hours, soreness, rpe, note }) {
      const entry = {}
      const clamp = (value, lo, hi) => {
        const n = Number(value)
        return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null
      }

      const sleep = clamp(sleep_hours, 0, 24)
      if (sleep != null) entry.sleep_hours = round1(sleep)
      const sore = clamp(soreness, 1, 10)
      if (sore != null) entry.soreness = Math.round(sore)
      const effort = clamp(rpe, 1, 10)
      if (effort != null) entry.rpe = Math.round(effort)
      if (note?.trim()) entry.note = String(note).trim().slice(0, 200)

      if (!Object.keys(entry).length) {
        throw new ToolError('Nothing to record — give at least one of sleep, soreness, RPE or a note.')
      }

      // Merged into the day rather than appended, so mentioning soreness at
      // noon and sleep at night is one check-in and not two conflicting ones.
      await store.setDoc('checkIns', dateId, { date: dateId, ...entry })
      return { recorded: true, date: dateId, ...entry }
    },

    async show_session() {
      if (!context?.session) {
        // Mode matters here. In strength mode a missing session means a rest
        // day, which is a real answer. In running mode it means the run
        // session wasn't supplied — saying "rest day" would be a claim about
        // training that nothing has established.
        return context?.mode === 'running'
          ? {
              session: null,
              note: "No run session available for today. Say you don't have it rather than describing one.",
            }
          : { session: null, note: 'Rest day — no session scheduled.' }
      }
      cards.push({ type: 'session', session: context.session, mode: context?.mode || 'strength' })
      return { shown: true, name: context.session.name, mode: context?.mode || 'strength' }
    },

    async propose_fuelling({ window, rationale, options }) {
      if (!window?.trim()) throw new ToolError('Give the window a label, e.g. "next 45 min".')
      if (!Array.isArray(options) || options.length === 0) {
        throw new ToolError('Provide at least one fuelling option.')
      }
      const cleaned = options.slice(0, 3).map((o) => ({
        name: String(o.name).slice(0, 120),
        description: String(o.description).slice(0, 240),
        kcal: Math.round(Number(o.kcal) || 0),
        protein_g: round1(Number(o.protein_g) || 0),
        carbs_g: round1(Number(o.carbs_g) || 0),
        fat_g: round1(Number(o.fat_g) || 0),
      }))
      cards.push({
        type: 'fuelling',
        window: String(window).slice(0, 60),
        rationale: rationale ? String(rationale).slice(0, 200) : null,
        options: cleaned,
      })
      return { shown: cleaned.length }
    },

    // ── Reads ──

    async get_workout({ which, date }) {
      if (which === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
        throw new ToolError('For which="date", supply date as YYYY-MM-DD.')
      }
      let day = null
      if (which === 'today') day = dateId
      else if (which === 'date') day = date

      const sessions = await store.query('workoutSessions', {
        orderField: 'date',
        direction: 'desc',
        limit: 60,
      })
      const completed = sessions.filter((s) => s.completed !== false)
      const session = day
        ? completed.find((s) => toDate(s.date)?.toISOString().slice(0, 10) === day)
        : completed[0]

      const mileage = day ? await store.getDoc('dailyMileage', day) : null
      const runs = normaliseMileageDoc(mileage)?.runs || []

      if (!session && !runs.length) {
        return {
          found: false,
          note: day
            ? `Nothing recorded for ${day}.`
            : 'No completed session recorded. Do not describe one.',
        }
      }

      return {
        found: true,
        session: session
          ? {
              ...summariseSession(session, new Date()),
              // The whole point of this tool over the context line: every set.
              exercises: (session.exercises || []).map((e) => ({
                id: e.id,
                sets: (e.sets || []).map((s) => ({
                  weight: Number(s.weight) || 0,
                  reps: Number(s.reps) || 0,
                  rir: s.rir == null ? null : Number(s.rir),
                  side: s.side || null,
                  isBodyweight: !!s.isBodyweight,
                })),
              })),
            }
          : null,
        runs,
      }
    },

    async get_training_history({ days } = {}) {
      const window = Math.min(Math.max(Math.round(Number(days) || 28), 1), MAX_HISTORY_DAYS)
      const cutoff = new Date(Date.now() - window * 86400000)

      const [sessions, mileage] = await Promise.all([
        store.query('workoutSessions', { orderField: 'date', direction: 'desc', limit: 120 }),
        store.query('dailyMileage', { orderField: 'date', direction: 'desc', limit: 120 }),
      ])

      const inWindow = sessions
        .filter((s) => s.completed !== false)
        .filter((s) => (toDate(s.date) || 0) >= cutoff)
      const runDays = mileage
        .map(normaliseMileageDoc)
        .filter((d) => d && new Date(`${d.date}T12:00:00`) >= cutoff)

      // Weekly buckets, keyed by the Monday of each week.
      const weeks = new Map()
      const bucket = (d) => {
        const monday = new Date(d)
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
        return monday.toISOString().slice(0, 10)
      }
      const touch = (key) =>
        weeks.get(key) || weeks.set(key, { week: key, sessions: 0, volume: 0, miles: 0 }).get(key)

      for (const s of inWindow) {
        const d = toDate(s.date)
        if (!d) continue
        const w = touch(bucket(d))
        w.sessions += 1
        w.volume += Number(s.totalVolume) || 0
      }
      for (const day of runDays) {
        const w = touch(bucket(new Date(`${day.date}T12:00:00`)))
        w.miles += day.miles
      }

      return {
        days: window,
        sessions: inWindow.length,
        totalMiles: round1(runDays.reduce((s, d) => s + d.miles, 0)),
        totalVolume: Math.round(inWindow.reduce((s, x) => s + (Number(x.totalVolume) || 0), 0)),
        weekly: [...weeks.values()]
          .sort((a, b) => (a.week < b.week ? 1 : -1))
          .map((w) => ({ ...w, volume: Math.round(w.volume), miles: round1(w.miles) })),
      }
    },

    async get_exercise_progress({ exercise_id }) {
      if (!exercise_id) throw new ToolError('Supply exercise_id, e.g. barbellHipThrust.')
      const doc = await store.getDoc('exerciseProgress', exercise_id)
      if (!doc) {
        throw new ToolError(
          `No progress recorded for "${exercise_id}". Check the id against the LAST SESSION line — ` +
            'it may be spelled differently or never logged.'
        )
      }
      const history = (doc.history || []).slice(-20)
      return {
        exercise_id,
        currentWeight: doc.currentWeight ?? null,
        lastReps: doc.lastReps ?? null,
        isBodyweight: !!doc.isBodyweight,
        lastSessionDate: doc.lastSessionDate ?? null,
        sessions: history.length,
        history: history.map((h) => ({
          date: h.date,
          weight: h.weight ?? null,
          reps: h.reps ?? null,
          pr: h.pr ?? null,
        })),
      }
    },

    async get_body_metrics({ weeks } = {}) {
      const window = Math.min(Math.max(Math.round(Number(weeks) || 8), 1), MAX_METRIC_WEEKS)
      const cutoff = new Date(Date.now() - window * 7 * 86400000)
      const entries = await store.query('bodyMetrics', {
        orderField: 'date',
        direction: 'desc',
        limit: 60,
      })
      const inWindow = entries.filter((e) => (toDate(e.date) || 0) >= cutoff)
      return summariseBodyMetrics(inWindow, window)
    },

    async estimate_session_cost({ session_id, run } = {}) {
      if (!session_id && !run) {
        throw new ToolError('Supply session_id (or "last") or a run object.')
      }
      const profile = await store.getProfile()

      if (run) return estimateSessionCost({ run, profile })

      const sessions = await store.query('workoutSessions', {
        orderField: 'date',
        direction: 'desc',
        limit: 60,
      })
      const completed = sessions.filter((s) => s.completed !== false)
      const session = session_id === 'last' ? completed[0] : completed.find((s) => s.id === session_id)
      if (!session) throw new ToolError(`No completed session with id ${session_id}.`)

      return estimateSessionCost({ session, profile })
    },

    async propose_adjustment({ title, subtitle, changes }) {
      if (!Array.isArray(changes) || changes.length === 0) {
        throw new ToolError('Provide at least one change.')
      }

      // A card is an action, not prose — James can apply it in one tap. The
      // model authors these movement names freely, so screen them against the
      // same rules the session generator uses before the card can exist. This
      // comes back to the model as a tool error, so it re-proposes rather than
      // the turn dying.
      const guardrails = { injuryFlags: context?.injuryFlags || [], blockWeek: context?.block?.blockWeek || 1 }
      const blocked = changes.flatMap((c) => findBlockedMovements(`${c?.label || ''} ${c?.detail || ''}`, guardrails))
      if (blocked.length) {
        const unique = [...new Map(blocked.map((b) => [b.id, b])).values()]
        const detail = unique.map((b) => `${b.shortName} — ${b.reason}`).join(' ')
        throw new ToolError(
          `Cannot propose this: ${detail} ` +
            'Re-propose using only movements the current stage permits. A qualifier like ' +
            '"isometric hold" or "partial range" does not make an excluded movement permitted.'
        )
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
