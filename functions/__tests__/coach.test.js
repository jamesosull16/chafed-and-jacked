import { describe, it, expect, vi } from 'vitest'
import { runCoachTurn, CoachError, MAX_ITERATIONS } from '../src/coach/orchestrator.js'
import { createHandlers, TOOL_DEFINITIONS, ToolError } from '../src/coach/tools.js'
import { buildTurnContext } from '../src/coach/context.js'
import { buildContextBlock, buildSystemPrompt, COACH_MODES } from '../src/coach/prompt.js'
import {
  consumeTurn,
  consumeProactive,
  claimWorkout,
  RateLimitError,
  LIMITS,
} from '../src/coach/rateLimit.js'
import { buildWorkoutTrigger } from '../src/coach/trigger.js'

// ── In-memory store, same surface as src/store.js ─────────────────────

function fakeStore(seed = {}) {
  const data = { profile: seed.profile || {}, collections: seed.collections || {} }
  let ids = 0
  return {
    uid: 'test-uid',
    async getProfile() {
      return data.profile
    },
    async getDoc(collection, docId) {
      const doc = data.collections[collection]?.[docId]
      return doc ? { id: docId, ...doc } : null
    },
    async setDoc(collection, docId, value) {
      data.collections[collection] ||= {}
      data.collections[collection][docId] = { ...data.collections[collection][docId], ...value }
      return value
    },
    async addDoc(collection, value) {
      data.collections[collection] ||= {}
      const id = `doc${++ids}`
      data.collections[collection][id] = value
      return { id, ...value }
    },
    // Serves seeded collections so the training reads in buildTurnContext are
    // actually exercised. Returning a bare [] made every context test pass
    // without touching the code it was meant to cover.
    async query(collection, { orderField, direction = 'desc', limit } = {}) {
      let docs = Object.entries(data.collections[collection] || {}).map(([id, d]) => ({ id, ...d }))
      if (orderField) {
        docs.sort((a, b) => {
          const av = a[orderField] ?? ''
          const bv = b[orderField] ?? ''
          return direction === 'desc' ? (av < bv ? 1 : av > bv ? -1 : 0) : av < bv ? -1 : av > bv ? 1 : 0
        })
      }
      return limit ? docs.slice(0, limit) : docs
    },
    async getSystemDoc(collection) {
      return data.collections[collection]?.[this.uid] || null
    },
    async setSystemDoc(collection, value) {
      data.collections[collection] ||= {}
      data.collections[collection][this.uid] = value
      return value
    },
    newId: () => `id${++ids}`,
    _data: data,
  }
}

const TARGETS = { kcal: 3200, protein_g: 175, carbs_g: 420, fat_g: 90 }

const CONTEXT = {
  date: '2026-07-22',
  targets: TARGETS,
  consumed: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  remaining: { ...TARGETS },
  meals: [],
  session: {
    name: 'Lower — Posterior',
    focus: 'Glutes & hamstrings',
    isToday: true,
    rirTarget: 2,
    exercises: [
      { id: 'barbellHipThrust', name: 'Barbell Hip Thrust', sets: 4, repRange: [5, 10] },
      { id: 'lyingLegCurl', name: 'Lying Leg Curl', sets: 4, repRange: [8, 12] },
    ],
    substitutions: [{ replaced: 'RDL', with: 'Lying Leg Curl' }],
  },
  block: { blockWeek: 3, totalWeeks: 22, mesocycle: 1, weekInMesocycle: 3, phase: 'accumulation', rirTarget: 2 },
  balance: { ratio: 1.4, posteriorSets: 14, anteriorSets: 10, status: 'onTarget', perMuscle: {} },
  injuryFlags: ['highHamstring', 'knee'],
  hamstringStage: { stage: 1, label: 'Isometric & mid-range only' },
}

const ESTIMATE = {
  items: [
    { name: 'grilled chicken', quantity: '6 oz', grams: 170, kcal: 280, protein_g: 52, carbs_g: 0, fat_g: 6 },
    { name: 'white rice', quantity: '1 cup', grams: 158, kcal: 205, protein_g: 4, carbs_g: 45, fat_g: 0.4 },
  ],
  kcal: 485,
  protein_g: 56,
  carbs_g: 45,
  fat_g: 6.4,
  confidence: 'medium',
  assumptions: ['Assumed ~5g cooking oil.'],
  grounded: true,
}

/**
 * Scripts a sequence of model responses. Each entry is either a list of tool
 * calls or a final text reply.
 */
function scriptedModel(turns) {
  let i = 0
  return {
    messages: {
      create: vi.fn(async () => {
        const turn = turns[Math.min(i++, turns.length - 1)]
        if (turn.tools) {
          return {
            stop_reason: 'tool_use',
            content: turn.tools.map((t, n) => ({
              type: 'tool_use',
              id: `tu_${i}_${n}`,
              name: t.name,
              input: t.input,
            })),
          }
        }
        return {
          stop_reason: turn.stop_reason || 'end_turn',
          content: [{ type: 'text', text: turn.text ?? '' }],
        }
      }),
    },
  }
}

const deps = (overrides = {}) => ({
  anthropic: overrides.anthropic,
  store: overrides.store || fakeStore(),
  estimate: overrides.estimate || vi.fn().mockResolvedValue(ESTIMATE),
  context: overrides.context || CONTEXT,
  dateId: '2026-07-22',
})

// ── Tool contract ────────────────────────────────────────────────────

describe('tool definitions', () => {
  it('exposes effectful, presentational and bounded-read tools', () => {
    // Reads that are needed on nearly every turn still live in the context
    // block. These are the ones for detail too large to inject every time
    // (every set of a session) or too rare (a 90-day trend).
    const names = TOOL_DEFINITIONS.map((t) => t.name).sort()
    expect(names).toEqual([
      'delete_meal',
      'estimate_meal',
      'estimate_session_cost',
      'get_body_metrics',
      'get_exercise_progress',
      'get_training_history',
      'get_workout',
      'log_meal',
      'propose_adjustment',
      'propose_fuelling',
      'propose_meals',
      'show_session',
      'update_meal',
    ])
  })

  it('gives every tool a schema and a description', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.description.length).toBeGreaterThan(40)
      expect(tool.input_schema.type).toBe('object')
    }
  })

  it('takes no uid on any tool — identity is never model-controlled', () => {
    for (const tool of TOOL_DEFINITIONS) {
      const props = Object.keys(tool.input_schema.properties || {})
      expect(props).not.toContain('uid')
      expect(props).not.toContain('userId')
    }
  })
})

describe('tool handlers', () => {
  const build = (store = fakeStore()) =>
    createHandlers({
      store,
      estimate: vi.fn().mockResolvedValue(ESTIMATE),
      photo: null,
      dateId: '2026-07-22',
      context: CONTEXT,
    })

  it('log_meal writes an entry and reports the remaining gap', async () => {
    const store = fakeStore()
    const tooling = build(store)

    const result = await tooling.handlers.log_meal({
      label: 'Chicken and rice',
      meal_type: 'lunch',
      items: ESTIMATE.items,
      confidence: 'medium',
    })

    expect(result.logged).toBe(true)
    expect(result.day_totals.kcal).toBe(485)
    expect(result.remaining.protein_g).toBe(119)
    expect(store._data.collections.nutritionLogs['2026-07-22'].entries).toHaveLength(1)
    expect(tooling.cards[0].type).toBe('food_log')
  })

  it('log_meal marks chat as the source so the tracker can label it', async () => {
    const store = fakeStore()
    await build(store).handlers.log_meal({
      label: 'x',
      items: ESTIMATE.items,
      confidence: 'high',
    })
    expect(store._data.collections.nutritionLogs['2026-07-22'].entries[0].source).toBe('chat_text')
  })

  it('update_meal rewrites the same entry rather than adding one', async () => {
    const store = fakeStore()
    const tooling = build(store)
    const { id } = await tooling.handlers.log_meal({
      label: 'Chicken and rice',
      items: ESTIMATE.items,
      confidence: 'medium',
    })

    await tooling.handlers.update_meal({ id, protein_g: 70 })

    const entries = store._data.collections.nutritionLogs['2026-07-22'].entries
    expect(entries).toHaveLength(1)
    expect(entries[0].protein).toBe(70)
    expect(entries[0].editedAt).toBeTruthy()
  })

  it('update_meal refuses an unknown id instead of creating one', async () => {
    const tooling = build()
    await expect(tooling.handlers.update_meal({ id: 'nope', kcal: 100 })).rejects.toThrow(
      /No meal with id/
    )
  })

  it('delete_meal removes only the named entry', async () => {
    const store = fakeStore()
    const tooling = build(store)
    const a = await tooling.handlers.log_meal({ label: 'A', items: ESTIMATE.items, confidence: 'high' })
    await tooling.handlers.log_meal({ label: 'B', items: ESTIMATE.items, confidence: 'high' })

    await tooling.handlers.delete_meal({ id: a.id })
    const entries = store._data.collections.nutritionLogs['2026-07-22'].entries
    expect(entries).toHaveLength(1)
    expect(entries[0].label).toBe('B')
  })

  it('estimate_meal refuses to guess with neither text nor photo', async () => {
    await expect(build().handlers.estimate_meal({})).rejects.toThrow(/ask James/)
  })

  it('propose_meals renders the options the model authored, capped at three', async () => {
    const tooling = build()
    const options = Array.from({ length: 5 }, (_, i) => ({
      name: `Option ${i}`,
      description: 'stuff',
      kcal: 700,
      protein_g: 50,
      carbs_g: 80,
      fat_g: 20,
    }))
    const result = await tooling.handlers.propose_meals({ options })
    expect(result.shown).toBe(3)
    expect(tooling.cards[0].options).toHaveLength(3)
  })

  it('propose_meals invents no data of its own', async () => {
    const tooling = build()
    await tooling.handlers.propose_meals({
      options: [{ name: 'A', description: 'b', kcal: 700, protein_g: 50, carbs_g: 80, fat_g: 20 }],
    })
    expect(tooling.cards[0].options[0]).toEqual({
      name: 'A',
      description: 'b',
      kcal: 700,
      protein_g: 50,
      carbs_g: 80,
      fat_g: 20,
    })
  })

  it('show_session reports a rest day rather than fabricating a workout', async () => {
    const tooling = createHandlers({
      store: fakeStore(),
      estimate: vi.fn(),
      photo: null,
      dateId: '2026-07-22',
      context: { ...CONTEXT, session: null },
    })
    const result = await tooling.handlers.show_session()
    expect(result.session).toBeNull()
    expect(tooling.cards).toHaveLength(0)
  })

  it('rejects an implausible meal rather than logging it', async () => {
    const tooling = build()
    await expect(
      tooling.handlers.log_meal({
        label: 'x',
        items: [{ ...ESTIMATE.items[0], kcal: 50000 }],
        confidence: 'low',
      })
    ).rejects.toThrow(/implausibly high/)
  })

  // A card is applied in one tap, so a movement named in one has to clear the
  // same bar as one the session generator picked. CONTEXT is week 3 with the
  // hamstring flag set, i.e. rehab stage 1.
  describe('read tools', () => {
    const NOW_DAY = '2026-07-22'
    const seeded = () =>
      fakeStore({
        profile: { weightLbs: 172, heightInches: 71, ageYears: 38, sex: 'male', currentBodyFatPct: 13 },
        collections: {
          workoutSessions: {
            s1: {
              date: '2026-07-22T15:00:00Z',
              dayType: 'Lower — Posterior',
              duration: 62,
              totalVolume: 12400,
              completed: true,
              exercises: [
                {
                  id: 'barbellHipThrust',
                  sets: [
                    { weight: 80, reps: 10, rir: 3 },
                    { weight: 100, reps: 8, rir: 2, side: 'both' },
                  ],
                },
              ],
            },
            s0: { date: '2026-07-15T15:00:00Z', dayType: 'Upper — Push', totalVolume: 9000, completed: true },
          },
          dailyMileage: {
            '2026-07-22': { date: '2026-07-22', runs: [{ miles: 6.2, duration_minutes: 52, avg_hr_bpm: 148 }] },
            '2026-07-16': { date: '2026-07-16', runs: [{ miles: 10 }] },
          },
          exerciseProgress: {
            barbellHipThrust: {
              currentWeight: 100,
              lastReps: [8, 8, 7],
              isBodyweight: false,
              lastSessionDate: '2026-07-22T15:00:00Z',
              history: [
                { date: '2026-07-08T00:00:00Z', weight: 90, reps: [8], pr: null },
                { date: '2026-07-22T00:00:00Z', weight: 100, reps: [8], pr: 'weight' },
              ],
            },
          },
          bodyMetrics: {
            b1: { date: '2026-06-24', weight: 170, bodyFatPct: 13.0 },
            b2: { date: '2026-07-22', weight: 172, bodyFatPct: 13.1 },
          },
        },
      })

    const tooling = (store = seeded(), ctx = CONTEXT) =>
      createHandlers({ store, estimate: vi.fn(), photo: null, dateId: NOW_DAY, context: ctx })

    it('get_workout returns every set, not just the top set', async () => {
      const r = await tooling().handlers.get_workout({ which: 'last' })
      expect(r.found).toBe(true)
      expect(r.session.exercises[0].sets).toHaveLength(2)
      expect(r.session.exercises[0].sets[1]).toMatchObject({ weight: 100, reps: 8, rir: 2, side: 'both' })
    })

    it('get_workout returns the day\'s runs for a date', async () => {
      const r = await tooling().handlers.get_workout({ which: 'today' })
      expect(r.runs[0]).toMatchObject({ miles: 6.2, duration_minutes: 52, avg_hr_bpm: 148 })
    })

    it('get_workout rejects a date query with no date', async () => {
      await expect(tooling().handlers.get_workout({ which: 'date' })).rejects.toThrow(ToolError)
    })

    it('get_workout says nothing is recorded rather than returning an empty shape', async () => {
      const r = await tooling().handlers.get_workout({ which: 'date', date: '2020-01-01' })
      expect(r.found).toBe(false)
      expect(r.note).toMatch(/Nothing recorded/)
    })

    it('get_training_history aggregates into weekly buckets', async () => {
      const r = await tooling().handlers.get_training_history({ days: 28 })
      expect(r.days).toBe(28)
      expect(r.sessions).toBe(2)
      expect(r.totalMiles).toBeCloseTo(16.2)
      expect(r.weekly.length).toBeGreaterThanOrEqual(2)
    })

    it('get_training_history caps the window so a model argument cannot scan forever', async () => {
      expect((await tooling().handlers.get_training_history({ days: 9999 })).days).toBe(90)
      expect((await tooling().handlers.get_training_history({ days: -5 })).days).toBe(1)
      expect((await tooling().handlers.get_training_history({})).days).toBe(28)
    })

    it('get_exercise_progress returns the movement history', async () => {
      const r = await tooling().handlers.get_exercise_progress({ exercise_id: 'barbellHipThrust' })
      expect(r.currentWeight).toBe(100)
      expect(r.history).toHaveLength(2)
      expect(r.history[1].pr).toBe('weight')
    })

    it('get_exercise_progress returns a recoverable error for an unknown id', async () => {
      await expect(
        tooling().handlers.get_exercise_progress({ exercise_id: 'nonsenseLift' })
      ).rejects.toThrow(ToolError)
    })

    it('get_body_metrics enforces the three-week rule', async () => {
      const r = await tooling().handlers.get_body_metrics({ weeks: 8 })
      expect(r.available).toBe(true)
      expect(r.changeLbs).toBe(2)

      const thin = fakeStore({
        collections: { bodyMetrics: { b1: { date: '2026-07-20', weight: 172 } } },
      })
      const t = await tooling(thin).handlers.get_body_metrics({})
      expect(t.available).toBe(false)
      expect(t.reason).toMatch(/water, not tissue/)
    })

    it('estimate_session_cost costs the last session from the app model', async () => {
      const r = await tooling().handlers.estimate_session_cost({ session_id: 'last' })
      expect(r.available).toBe(true)
      expect(r.type).toBe('lift')
      expect(r.kcal).toBeGreaterThan(0)
    })

    it('estimate_session_cost costs a described run and withholds a protocol when short', async () => {
      const long = await tooling().handlers.estimate_session_cost({
        run: { miles: 16, duration_minutes: 150, avg_hr_bpm: 142 },
      })
      expect(long.fuelling.during_carb_g_per_hour).toEqual([30, 60])

      const short = await tooling().handlers.estimate_session_cost({
        run: { miles: 3, duration_minutes: 25 },
      })
      expect(short.fuelling).toBeNull()
    })

    it('estimate_session_cost errors recoverably with neither argument', async () => {
      await expect(tooling().handlers.estimate_session_cost({})).rejects.toThrow(ToolError)
    })

    it('show_session will not call a running-mode gap a rest day', async () => {
      // "Rest day" is a claim about training. With no run session supplied it
      // is unfounded, and in running mode the strength split is not the answer.
      const running = await tooling(seeded(), { ...CONTEXT, mode: 'running', session: null }).handlers.show_session()
      expect(running.note).toMatch(/don't have it/)
      expect(running.note).not.toMatch(/Rest day/)

      const strength = await tooling(seeded(), { ...CONTEXT, mode: 'strength', session: null }).handlers.show_session()
      expect(strength.note).toMatch(/Rest day/)
    })
  })

  describe('propose_adjustment movement screening', () => {
    it('refuses a card naming a movement the current stage excludes', async () => {
      const tooling = build()
      await expect(
        tooling.handlers.propose_adjustment({
          title: 'Thursday · adjust',
          changes: [{ label: 'Add Romanian Deadlift', detail: 'light, 3x10' }],
        })
      ).rejects.toThrow(/RDL/)
      expect(tooling.cards).toHaveLength(0)
    })

    it('refuses the 45° back extension the live model reached for', async () => {
      const tooling = build()
      await expect(
        tooling.handlers.propose_adjustment({
          title: 'Thursday · posterior',
          changes: [{ label: 'Add Back Extension (isometric hold)', detail: 'mid-range, glute-focused' }],
        })
      ).rejects.toThrow(/Back Ext/)
      expect(tooling.cards).toHaveLength(0)
    })

    it('is not fooled by a qualifier that claims the movement is safe', async () => {
      const tooling = build()
      await expect(
        tooling.handlers.propose_adjustment({
          title: 'x',
          changes: [{ label: 'Glute-focused 45° Back Ext', detail: 'round-back, hips only — no hamstring stretch' }],
        })
      ).rejects.toThrow(/Cannot propose this/)
    })

    it('screens the detail field, not just the label', async () => {
      const tooling = build()
      await expect(
        tooling.handlers.propose_adjustment({
          title: 'x',
          changes: [{ label: 'Swap the hinge', detail: 'use a good morning instead' }],
        })
      ).rejects.toThrow(/Good AM/)
    })

    it('rejects the whole card when any one change is blocked', async () => {
      const tooling = build()
      await expect(
        tooling.handlers.propose_adjustment({
          title: 'x',
          changes: [
            { label: 'Barbell Hip Thrust', detail: '4x8-12' },
            { label: 'Seated Leg Curl', detail: '3x12' },
          ],
        })
      ).rejects.toThrow(/Seated Curl/)
      expect(tooling.cards).toHaveLength(0)
    })

    it('tells the model a qualifier will not help, so it re-proposes properly', async () => {
      const tooling = build()
      const err = await tooling.handlers
        .propose_adjustment({ title: 'x', changes: [{ label: 'RDLs' }] })
        .catch((e) => e)
      expect(err.message).toMatch(/isometric hold/)
      expect(err.message).toMatch(/stage 1/)
    })

    it('still allows a card built from stage-1-legal movements', async () => {
      const tooling = build()
      const result = await tooling.handlers.propose_adjustment({
        title: 'Thursday · posterior',
        subtitle: 'Glute-led',
        changes: [
          { label: 'Barbell Hip Thrust', detail: 'primary glute driver', value: '4×8-12' },
          { label: 'Lying Leg Curl', detail: 'mid-range only', value: '3×10-15' },
        ],
      })
      expect(result.shown).toBe(true)
      expect(tooling.cards[0].type).toBe('adjustment')
      expect(tooling.cards[0].changes).toHaveLength(2)
    })

    it('still allows changes that name no movement at all', async () => {
      const tooling = build()
      await tooling.handlers.propose_adjustment({
        title: 'x',
        changes: [{ label: 'Drop to 3 sets', detail: 'RIR 3 this week', value: '-1 set' }],
      })
      expect(tooling.cards).toHaveLength(1)
    })

    it('permits the same movement once the block reaches a stage that allows it', async () => {
      const tooling = createHandlers({
        store: fakeStore(),
        estimate: vi.fn(),
        photo: null,
        dateId: '2026-07-22',
        context: { ...CONTEXT, block: { ...CONTEXT.block, blockWeek: 13 } },
      })
      await tooling.handlers.propose_adjustment({
        title: 'x',
        changes: [{ label: 'Reintroduce Romanian Deadlift', detail: '~60% of previous load' }],
      })
      expect(tooling.cards).toHaveLength(1)
    })
  })
})

// ── Orchestration and routing ────────────────────────────────────────

describe('runCoachTurn', () => {
  it('answers a plain question with no tool calls', async () => {
    const anthropic = scriptedModel([{ text: "You've got 1,230 kcal left." }])
    const result = await runCoachTurn({ message: "what's left today?" }, deps({ anthropic }))

    expect(result.reply).toMatch(/1,230/)
    expect(result.toolsUsed).toEqual([])
    expect(result.cards).toEqual([])
  })

  it('routes a described meal through estimate then log', async () => {
    const anthropic = scriptedModel([
      { tools: [{ name: 'estimate_meal', input: { description: 'chicken and rice' } }] },
      {
        tools: [
          {
            name: 'log_meal',
            input: { label: 'Chicken and rice', items: ESTIMATE.items, confidence: 'medium' },
          },
        ],
      },
      { text: 'Logged ✓ 485 kcal.' },
    ])
    const store = fakeStore()
    const result = await runCoachTurn({ message: 'chicken and rice' }, deps({ anthropic, store }))

    expect(result.toolsUsed).toEqual(['estimate_meal', 'log_meal'])
    expect(result.cards[0].type).toBe('food_log')
    expect(result.logMutated).toBe(true)
    expect(result.dayTotals.kcal).toBe(485)
  })

  it('sends an attached photo as an image block before the text', async () => {
    const anthropic = scriptedModel([{ text: 'ok' }])
    await runCoachTurn(
      { message: 'lunch', photo: { base64: 'AAAA', mediaType: 'image/jpeg' } },
      deps({ anthropic })
    )

    const { messages } = anthropic.messages.create.mock.calls[0][0]
    const content = messages[messages.length - 1].content
    expect(content[0].type).toBe('image')
    expect(content[0].source.data).toBe('AAAA')
    expect(content[1].type).toBe('text')
  })

  it('passes the photo through to the estimator when the model asks for it', async () => {
    const estimate = vi.fn().mockResolvedValue(ESTIMATE)
    const anthropic = scriptedModel([
      { tools: [{ name: 'estimate_meal', input: { use_photo: true } }] },
      { text: 'done' },
    ])
    await runCoachTurn(
      { message: '', photo: { base64: 'IMG', mediaType: 'image/png' } },
      deps({ anthropic, estimate })
    )
    expect(estimate).toHaveBeenCalledWith(
      expect.objectContaining({ imageBase64: 'IMG', mediaType: 'image/png' })
    )
  })

  it('routes a training question to the session tool', async () => {
    const anthropic = scriptedModel([
      { tools: [{ name: 'show_session', input: {} }] },
      { text: "Lower — Posterior today." },
    ])
    const result = await runCoachTurn({ message: "what's today's session?" }, deps({ anthropic }))

    expect(result.toolsUsed).toEqual(['show_session'])
    expect(result.cards[0].type).toBe('session')
    expect(result.cards[0].session.name).toBe('Lower — Posterior')
  })

  it('handles a cross-over turn that touches both domains', async () => {
    const anthropic = scriptedModel([
      {
        tools: [
          { name: 'show_session', input: {} },
          {
            name: 'propose_meals',
            input: {
              options: [
                { name: 'Salmon & rice', description: '8oz salmon', kcal: 700, protein_g: 48, carbs_g: 90, fat_g: 18 },
              ],
            },
          },
        ],
      },
      { text: 'Leg day, so eat the carbs.' },
    ])
    const result = await runCoachTurn(
      { message: 'what do I eat after leg day?' },
      deps({ anthropic })
    )

    expect(result.toolsUsed).toEqual(['show_session', 'propose_meals'])
    expect(result.cards.map((c) => c.type)).toEqual(['session', 'meal_options'])
  })

  it('returns all parallel tool results in a single user message', async () => {
    const anthropic = scriptedModel([
      {
        tools: [
          { name: 'show_session', input: {} },
          { name: 'propose_meals', input: { options: [{ name: 'a', description: 'b', kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1 }] } },
        ],
      },
      { text: 'ok' },
    ])
    await runCoachTurn({ message: 'x' }, deps({ anthropic }))

    const second = anthropic.messages.create.mock.calls[1][0].messages
    const resultsMessage = second[second.length - 1]
    expect(resultsMessage.role).toBe('user')
    expect(resultsMessage.content).toHaveLength(2)
    expect(resultsMessage.content.every((c) => c.type === 'tool_result')).toBe(true)
  })

  it('hands a tool failure back to the model instead of dying', async () => {
    const anthropic = scriptedModel([
      { tools: [{ name: 'update_meal', input: { id: 'ghost', kcal: 1 } }] },
      { text: "I couldn't find that meal — which one did you mean?" },
    ])
    const result = await runCoachTurn({ message: 'make that 600' }, deps({ anthropic }))

    const followUp = anthropic.messages.create.mock.calls[1][0].messages
    const toolResult = followUp[followUp.length - 1].content[0]
    expect(toolResult.is_error).toBe(true)
    expect(toolResult.content).toMatch(/No meal with id/)
    expect(result.reply).toMatch(/couldn't find/)
  })

  it('reports an unknown tool as an error result rather than throwing', async () => {
    const anthropic = scriptedModel([
      { tools: [{ name: 'launch_missiles', input: {} }] },
      { text: 'no' },
    ])
    const result = await runCoachTurn({ message: 'x' }, deps({ anthropic }))
    expect(result.reply).toBe('no')
  })

  it('stops at the iteration cap instead of looping forever', async () => {
    const anthropic = scriptedModel([{ tools: [{ name: 'show_session', input: {} }] }])
    const result = await runCoachTurn({ message: 'x' }, deps({ anthropic }))

    expect(anthropic.messages.create).toHaveBeenCalledTimes(MAX_ITERATIONS)
    expect(result.hitIterationCap).toBe(true)
  })

  it('surfaces a refusal as a readable message', async () => {
    const anthropic = scriptedModel([{ stop_reason: 'refusal', text: '' }])
    await expect(runCoachTurn({ message: 'x' }, deps({ anthropic }))).rejects.toThrow(CoachError)
  })

  it('rejects an empty turn', async () => {
    await expect(runCoachTurn({ message: '  ' }, deps({ anthropic: scriptedModel([]) }))).rejects.toThrow(
      /message or a photo/
    )
  })

  it('caches the persona and leaves the volatile context uncached', async () => {
    const anthropic = scriptedModel([{ text: 'ok' }])
    await runCoachTurn({ message: 'x' }, deps({ anthropic }))

    const { system } = anthropic.messages.create.mock.calls[0][0]
    expect(system[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(system[1].cache_control).toBeUndefined()
    expect(system[1].text).toMatch(/Live app data/)
  })

  it('selects the system prompt from the context mode', async () => {
    const anthropic = scriptedModel([{ text: 'ok' }])
    await runCoachTurn(
      { message: 'how should I fuel tomorrow?' },
      deps({ anthropic, context: { ...CONTEXT, mode: 'running' } })
    )

    const { system } = anthropic.messages.create.mock.calls[0][0]
    expect(system[0].text).toBe(buildSystemPrompt('running'))
    expect(system[0].text).not.toBe(buildSystemPrompt('strength'))
  })

  it('falls back to strength when the context carries no mode', async () => {
    const anthropic = scriptedModel([{ text: 'ok' }])
    await runCoachTurn({ message: 'x' }, deps({ anthropic }))

    const { system } = anthropic.messages.create.mock.calls[0][0]
    expect(system[0].text).toBe(buildSystemPrompt('strength'))
  })

  it('replays prior conversation so corrections have referents', async () => {
    const anthropic = scriptedModel([{ text: 'ok' }])
    await runCoachTurn(
      {
        message: 'make it 600',
        history: [
          { role: 'user', content: 'chicken and rice' },
          { role: 'assistant', content: 'Logged 485 kcal.' },
        ],
      },
      deps({ anthropic })
    )

    const { messages } = anthropic.messages.create.mock.calls[0][0]
    expect(messages).toHaveLength(3)
    expect(messages[0].content).toBe('chicken and rice')
  })
})

// ── Proactive post-workout turn ──────────────────────────────────────

describe('post-workout trigger', () => {
  it('runs a turn with no user message at all', async () => {
    const anthropic = scriptedModel([{ text: '2h10 long run. Eat 90g carbs in the next 45 min.' }])
    const result = await runCoachTurn(
      { trigger: buildWorkoutTrigger({ kind: 'run', summary: '13.1 mi, 115 min' }) },
      deps({ anthropic })
    )
    expect(result.reply).toMatch(/45 min/)

    const { messages } = anthropic.messages.create.mock.calls[0][0]
    expect(messages).toHaveLength(1)
    expect(messages[0].content[0].text).toMatch(/Automatic trigger/)
  })

  it('still rejects a turn with nothing at all', async () => {
    await expect(runCoachTurn({}, deps({ anthropic: scriptedModel([]) }))).rejects.toThrow(CoachError)
  })

  it('returns an empty reply rather than filler when the model stays silent', async () => {
    // This is the whole restraint mechanism: an easy session should produce
    // silence, and a fallback line here would turn every rest day into noise.
    const anthropic = scriptedModel([{ text: '' }])
    const result = await runCoachTurn({ trigger: 'x' }, deps({ anthropic }))
    expect(result.reply).toBe('')
    expect(result.cards).toEqual([])
  })

  it('still gives a user turn a fallback, where silence would look broken', async () => {
    const anthropic = scriptedModel([{ text: '' }])
    const result = await runCoachTurn({ message: 'hi' }, deps({ anthropic }))
    expect(result.reply).toBe('Logged. Anything else?')
  })

  it('tells the model that saying nothing is permitted', () => {
    const trigger = buildWorkoutTrigger({ kind: 'strength', summary: 'Lower — Posterior, 62 min' })
    expect(trigger).toMatch(/has not asked you anything/)
    expect(trigger).toMatch(/empty reply is correct and expected/)
    expect(trigger).toMatch(/Lower — Posterior, 62 min/)
  })

  it('degrades to a neutral description when the summary is missing', () => {
    expect(buildWorkoutTrigger({ kind: 'run' })).toMatch(/logged a run/)
    expect(buildWorkoutTrigger({})).toMatch(/a training session/)
  })

  it('renders a fuelling card the model authored', async () => {
    const anthropic = scriptedModel([
      {
        tools: [
          {
            name: 'propose_fuelling',
            input: {
              window: 'next 45 min',
              rationale: '2h10 at 1,450 kcal — the window matters with a session tomorrow.',
              options: [
                { name: 'Rice & chicken', description: '250g rice, 200g chicken', kcal: 700, protein_g: 55, carbs_g: 90, fat_g: 8 },
              ],
            },
          },
        ],
      },
      { text: 'Eat in the next 45.' },
    ])
    const result = await runCoachTurn({ trigger: 'x' }, deps({ anthropic }))
    expect(result.cards[0]).toMatchObject({ type: 'fuelling', window: 'next 45 min' })
    expect(result.cards[0].options[0].protein_g).toBe(55)
  })

  it('refuses a fuelling card with no window or no options', async () => {
    const tooling = createHandlers({
      store: fakeStore(),
      estimate: vi.fn(),
      photo: null,
      dateId: '2026-07-22',
      context: CONTEXT,
    })
    await expect(tooling.handlers.propose_fuelling({ window: '', options: [{}] })).rejects.toThrow(ToolError)
    await expect(tooling.handlers.propose_fuelling({ window: 'now', options: [] })).rejects.toThrow(ToolError)
  })
})

describe('proactive budget and idempotency', () => {
  it('keeps the proactive budget separate from the conversational one', async () => {
    const store = fakeStore()
    // Exhaust the proactive budget entirely.
    for (let i = 0; i < LIMITS.MAX_PROACTIVE_PER_WINDOW; i++) await consumeProactive(store)
    await expect(consumeProactive(store)).rejects.toThrow(RateLimitError)

    // The conversational allowance must be untouched — the failure mode this
    // prevents is James asking a question and being told he is out of messages
    // because a sync loop spent them.
    const turn = await consumeTurn(store)
    expect(turn.remaining).toBe(LIMITS.MAX_TURNS_PER_WINDOW - 1)
  })

  it('does not let conversation exhaust the proactive budget either', async () => {
    const store = fakeStore()
    for (let i = 0; i < LIMITS.MAX_TURNS_PER_WINDOW; i++) await consumeTurn(store)
    await expect(consumeTurn(store)).rejects.toThrow(RateLimitError)
    await expect(consumeProactive(store)).resolves.toBeTruthy()
  })

  it('claims a workout id once so a retry cannot double-post', async () => {
    const store = fakeStore()
    expect(await claimWorkout(store, 'session-1')).toBe(true)
    expect(await claimWorkout(store, 'session-1')).toBe(false)
    expect(await claimWorkout(store, 'session-2')).toBe(true)
  })

  it('refuses to claim a missing id rather than posting about nothing', async () => {
    expect(await claimWorkout(fakeStore(), undefined)).toBe(false)
    expect(await claimWorkout(fakeStore(), '')).toBe(false)
  })

  it('bounds the remembered ids so the document cannot grow forever', async () => {
    const store = fakeStore()
    for (let i = 0; i < LIMITS.POSTED_HISTORY + 5; i++) await claimWorkout(store, `s${i}`)
    const doc = await store.getSystemDoc('coachUsage')
    expect(doc.postedWorkouts).toHaveLength(LIMITS.POSTED_HISTORY)
    // The oldest ids fall off, so a very old workout could in principle repost.
    // That is the deliberate trade for a bounded document.
    expect(doc.postedWorkouts).toContain(`s${LIMITS.POSTED_HISTORY + 4}`)
  })
})

// ── Context assembly ─────────────────────────────────────────────────

describe('buildTurnContext', () => {
  const store = () =>
    fakeStore({
      profile: {
        mode: 'strength',
        strength: { blockStart: '2026-07-20', injuryFlags: ['highHamstring'] },
      },
      collections: {
        nutritionLogs: {
          '2026-07-22': {
            entries: [{ id: 'm1', label: 'Oats', kcal: 400, protein: 20, carbs: 60, fat: 8 }],
          },
        },
      },
    })

  // ── Server-read training ──
  //
  // The trust argument is the same one that applies to meal ids: advice about
  // what the athlete did is worthless if the client can claim he did something
  // else. These assert the reads happen server-side and survive missing data.

  const NOW = new Date('2026-07-22T18:00:00Z')
  const trainingStore = (extra = {}) =>
    fakeStore({
      profile: {
        mode: 'strength',
        strength: { blockStart: '2026-07-20', injuryFlags: ['highHamstring'] },
        ...extra.profile,
      },
      collections: {
        workoutSessions: {
          s1: {
            date: '2026-07-22T15:00:00Z',
            dayType: 'Lower — Posterior',
            duration: 62,
            totalVolume: 12400,
            completed: true,
            exercises: [
              { id: 'barbellHipThrust', sets: [{ weight: 80, reps: 10, rir: 3 }, { weight: 100, reps: 8, rir: 2 }] },
            ],
          },
          s0: { date: '2026-07-19T15:00:00Z', dayType: 'Upper — Push', totalVolume: 9000, completed: true },
        },
        dailyMileage: {
          '2026-07-22': {
            date: '2026-07-22',
            runs: [{ miles: 6.2, duration_minutes: 52, avg_hr_bpm: 148, enteredAt: '2026-07-22T14:00:00Z' }],
            miles: 6.2,
          },
          '2026-07-18': { date: '2026-07-18', runs: [{ miles: 10 }] },
        },
        ...extra.collections,
      },
    })

  it('reads the last completed session server-side, with hours elapsed', async () => {
    const ctx = await buildTurnContext({ store: trainingStore(), dateId: '2026-07-22', now: NOW })
    expect(ctx.lastSession.dayType).toBe('Lower — Posterior')
    expect(ctx.lastSession.hoursSince).toBeCloseTo(3)
    expect(ctx.lastSession.exercises[0].top).toMatchObject({ weight: 100, reps: 8 })
  })

  it('ignores an uncompleted session when picking the last one', async () => {
    const store = trainingStore({
      collections: {
        workoutSessions: {
          draft: { date: '2026-07-22T17:00:00Z', dayType: 'Abandoned', completed: false },
          done: { date: '2026-07-22T09:00:00Z', dayType: 'Upper — Pull', completed: true },
        },
      },
    })
    const ctx = await buildTurnContext({ store, dateId: '2026-07-22', now: NOW })
    expect(ctx.lastSession.dayType).toBe('Upper — Pull')
  })

  it("surfaces today's runs with duration and HR", async () => {
    const ctx = await buildTurnContext({ store: trainingStore(), dateId: '2026-07-22', now: NOW })
    expect(ctx.todayRuns).toHaveLength(1)
    expect(ctx.todayRuns[0]).toMatchObject({ miles: 6.2, duration_minutes: 52, avg_hr_bpm: 148 })
    expect(ctx.todayMiles).toBeCloseTo(6.2)
  })

  it('normalises a legacy bare-miles mileage doc', async () => {
    const store = trainingStore({
      collections: {
        dailyMileage: { '2026-07-22': { date: '2026-07-22', miles: 4.5, enteredAt: '2026-07-22T13:00:00Z' } },
      },
    })
    const ctx = await buildTurnContext({ store, dateId: '2026-07-22', now: NOW })
    expect(ctx.todayRuns).toHaveLength(1)
    expect(ctx.todayRuns[0].miles).toBe(4.5)
    expect(ctx.todayRuns[0].duration_minutes).toBeNull()
  })

  it('rolls up the 7- and 14-day windows', async () => {
    const ctx = await buildTurnContext({ store: trainingStore(), dateId: '2026-07-22', now: NOW })
    expect(ctx.recentTraining.sessions7).toBe(2)
    expect(ctx.recentTraining.miles7).toBeCloseTo(16.2)
    expect(ctx.recentTraining.longestRun).toBe(10)
  })

  it('reports no race in strength mode even when races are configured', async () => {
    const store = trainingStore({ profile: { races: [{ name: 'Ultra X', date: '2026-11-14', isARace: true }] } })
    const ctx = await buildTurnContext({ store, dateId: '2026-07-22', now: NOW })
    expect(ctx.raceContext).toBeNull()
  })

  it('derives race phase and lifting scaling tier in running mode', async () => {
    const store = trainingStore({
      profile: { mode: 'running', races: [{ name: 'Ultra X', date: '2026-11-14', isARace: true }] },
    })
    const ctx = await buildTurnContext({ store, dateId: '2026-07-22', now: NOW })
    expect(ctx.raceContext.name).toBe('Ultra X')
    expect(ctx.raceContext.daysOut).toBeGreaterThan(100)
    expect(ctx.raceContext.phase).toMatch(/build|deload|taper|race/)
    expect(ctx.raceContext.scalingTier.id).toBe('full')
  })

  it('degrades to empty training rather than throwing when nothing is logged', async () => {
    const ctx = await buildTurnContext({ store: fakeStore(), dateId: '2026-07-22', now: NOW })
    expect(ctx.lastSession).toBeNull()
    expect(ctx.todayRuns).toEqual([])
    expect(ctx.recentTraining.sessions7).toBe(0)
    expect(ctx.raceContext).toBeNull()
  })

  it('reads consumed totals from the server, not the client', async () => {
    const ctx = await buildTurnContext({
      store: store(),
      dateId: '2026-07-22',
      clientContext: { targets: TARGETS, consumed: { kcal: 99999 } },
      now: new Date('2026-07-22T12:00:00'),
    })
    expect(ctx.consumed.kcal).toBe(400)
    expect(ctx.remaining.kcal).toBe(2800)
  })

  it('exposes real meal ids so corrections can address them', async () => {
    const ctx = await buildTurnContext({
      store: store(),
      dateId: '2026-07-22',
      clientContext: { targets: TARGETS },
      now: new Date('2026-07-22T12:00:00'),
    })
    expect(ctx.meals[0].id).toBe('m1')
  })

  it('derives injury flags from the profile, ignoring anything the client sent', async () => {
    const ctx = await buildTurnContext({
      store: store(),
      dateId: '2026-07-22',
      clientContext: { injuryFlags: [], hamstringStage: { stage: 3 } },
      now: new Date('2026-07-22T12:00:00'),
    })
    expect(ctx.injuryFlags).toEqual(['highHamstring'])
    expect(ctx.hamstringStage.stage).toBe(1)
  })

  it('overrides a client-claimed block week with the server derivation', async () => {
    const ctx = await buildTurnContext({
      store: store(),
      dateId: '2026-07-22',
      clientContext: { block: { blockWeek: 99, totalWeeks: 22 } },
      now: new Date('2026-07-22T12:00:00'),
    })
    expect(ctx.block.blockWeek).toBe(1)
  })

  it('drops a malformed session rather than passing it through', async () => {
    const ctx = await buildTurnContext({
      store: store(),
      dateId: '2026-07-22',
      clientContext: { session: { name: 'x' } },
      now: new Date('2026-07-22T12:00:00'),
    })
    expect(ctx.session).toBeNull()
  })

  it('survives a profile with no strength settings', async () => {
    const ctx = await buildTurnContext({
      store: fakeStore(),
      dateId: '2026-07-22',
      clientContext: {},
      now: new Date('2026-07-22T12:00:00'),
    })
    expect(ctx.blockWeek ?? ctx.block.blockWeek).toBe(1)
    expect(ctx.injuryFlags.length).toBeGreaterThan(0)
  })
})

describe('buildContextBlock', () => {
  it('states the hamstring stage so the model cannot miss it', () => {
    const text = buildContextBlock(CONTEXT)
    expect(text).toMatch(/hamstring rehab stage 1 of 3/)
    expect(text).toMatch(/Isometric & mid-range only/)
  })

  it('lists logged meals with their ids', () => {
    const text = buildContextBlock({ ...CONTEXT, meals: [{ id: 'm1', label: 'Oats', kcal: 400 }] })
    expect(text).toMatch(/Oats \(400 kcal, id m1\)/)
  })

  it('says so plainly when nothing is logged', () => {
    expect(buildContextBlock(CONTEXT)).toMatch(/LOGGED TODAY — nothing yet/)
  })

  it('reports a rest day rather than omitting the line', () => {
    expect(buildContextBlock({ ...CONTEXT, session: null })).toMatch(/rest day/)
  })

  it('handles a missing bodyweight without throwing', () => {
    const text = buildContextBlock({ ...CONTEXT, targets: null, consumed: null })
    expect(text).toMatch(/unavailable/)
  })

  it('degrades to a plain statement with no context at all', () => {
    expect(buildContextBlock(null)).toMatch(/No app data/)
  })

  // ── Completed training ──
  //
  // Missing training data has to render as an explicit "none recorded" line.
  // Omitting the line reads to the model as "nothing happened", which is a
  // different claim from "not recorded" — and it's the one that invents
  // sessions.

  const TRAINED = {
    ...CONTEXT,
    lastSession: {
      dayType: 'Lower — Posterior',
      hoursSince: 3.2,
      duration: 62,
      totalVolume: 12400,
      exercises: [
        { id: 'barbellHipThrust', sets: 3, top: { weight: 100, reps: 8, rir: 2, isBodyweight: false } },
        { id: 'pullUp', sets: 3, top: { weight: 0, reps: 8, rir: 1, isBodyweight: true } },
      ],
    },
    todayRuns: [{ miles: 6.2, duration_minutes: 52, avg_hr_bpm: 148, hoursSince: 4 }],
    recentTraining: {
      sessions7: 4, sessions14: 7, volume7: 48200, miles7: 22.5, miles14: 41,
      priorMiles7: 18.5, longestRun: 10.2, restDays7: 1, plannedMiles: 25, trend: 'ramping',
    },
  }

  it('renders the last session with elapsed time and top sets', () => {
    const text = buildContextBlock(TRAINED)
    expect(text).toMatch(/LAST SESSION — Lower — Posterior, 3h ago, 62 min, 12400 volume/)
    expect(text).toMatch(/barbellHipThrust 100x8 @RIR2/)
    expect(text).toMatch(/pullUp BWx8 @RIR1/)
  })

  it('switches to days for a session more than two days back', () => {
    const text = buildContextBlock({ ...TRAINED, lastSession: { ...TRAINED.lastSession, hoursSince: 72 } })
    expect(text).toMatch(/LAST SESSION — .*, 3d ago/)
  })

  it("renders today's runs with duration and heart rate", () => {
    expect(buildContextBlock(TRAINED)).toMatch(/TODAY'S RUNS — 6\.2 mi, 52 min, 148 bpm, 4h ago/)
  })

  it('renders the rollup with the trend and the prior week for comparison', () => {
    const text = buildContextBlock(TRAINED)
    expect(text).toMatch(/RECENT TRAINING — 7d: 4 sessions, 22\.5 mi, 1 rest day; 14d: 7 sessions, 41 mi/)
    expect(text).toMatch(/mileage ramping \(22\.5 vs 18\.5 prior 7d\)/)
    expect(text).toMatch(/plan 25 mi/)
  })

  it('says none recorded rather than omitting the line', () => {
    const text = buildContextBlock(CONTEXT)
    expect(text).toMatch(/LAST SESSION — none recorded/)
    expect(text).toMatch(/TODAY'S RUNS — none recorded/)
  })

  it('renders the race phase and the lifting scaling that follows from it', () => {
    const text = buildContextBlock({
      ...TRAINED,
      mode: 'running',
      raceContext: {
        name: 'Ultra X', date: '2026-11-14', daysOut: 115, phase: 'build', weekNumber: 6,
        scalingTier: { id: 'moderate', label: 'Moderate Volume', loadMultiplier: 0.925, dropSet: false },
      },
    })
    expect(text).toMatch(/RACE — Ultra X, 2026-11-14, 115 days out, build week 6/)
    expect(text).toMatch(/lifting scaled: Moderate Volume, 93% load/)
  })

  it('distinguishes no race configured from no race possible', () => {
    // Running mode with no race is missing data and says so; strength mode has
    // no race by definition, so the line is absent rather than empty.
    expect(buildContextBlock({ ...TRAINED, mode: 'running' })).toMatch(/RACE — none configured/)
    expect(buildContextBlock({ ...TRAINED, mode: 'strength' })).not.toMatch(/RACE —/)
  })
})

describe('buildSystemPrompt', () => {
  const strength = buildSystemPrompt('strength')
  const running = buildSystemPrompt('running')

  it('covers both modes', () => {
    expect([...COACH_MODES].sort()).toEqual(['running', 'strength'])
  })

  it('puts endurance content in running mode and keeps lean bulk out of it', () => {
    expect(running).toMatch(/talk test/)
    expect(running).toMatch(/grade-adjusted pace/)
    expect(running).toMatch(/moderate rut/)
    expect(running).not.toMatch(/Lean bulk/)
    expect(running).not.toMatch(/\+300 kcal/)
  })

  it('puts the hypertrophy block in strength mode and keeps race fuelling out of it', () => {
    expect(strength).toMatch(/Lean bulk/)
    expect(strength).toMatch(/0\.25-0\.5% bodyweight per week/)
    expect(strength).not.toMatch(/glucose and fructose/)
    expect(strength).not.toMatch(/talk test/)
  })

  // These are the specific places the prompt previously contradicted
  // skills/endurance-running-coach. They are asserted by value because a
  // silent drift back to the textbook figure is exactly the failure mode —
  // each of these is a considered departure from the obvious number.
  it('matches the running skill where the skill departs from the textbook', () => {
    // Pyramidal, not strict polarised, for a sub-elite athlete.
    expect(running).toMatch(/Pyramidal is the better default/)
    expect(running).not.toMatch(/80\/20/)

    // The strict 10% rule is explicitly rejected in favour of 5-10% per step
    // measured on a trailing 3-week average.
    expect(running).toMatch(/5-10% per step measured against the trailing 3-week average/)
    expect(running).toMatch(/strict 10% rule has poor evidence/)

    // In-run carbs: 30-60 g/h over ~90 min, 90 g/h only with a trained gut.
    expect(running).toMatch(/over about 90 minutes, 30-60 g of carbohydrate an hour/)
    expect(running).toMatch(/only with a gut that has been trained for it/)
    expect(running).toMatch(/under about 75 minutes need nothing/)

    // Concurrent training concentrates stress on one day rather than spreading it.
    expect(running).toMatch(/same\*\* day rather than adjacent days/)
    expect(running).toMatch(/cut lifting volume, not frequency/)

    // Daily carbs 5-8 g/kg and protein 1.8-2.0, per the nutritionist's
    // running-mode model — not the generic endurance bands.
    expect(running).toMatch(/Carbohydrate 5-8 g\/kg/)
    expect(running).toMatch(/Protein 1\.8-2\.0 g\/kg/)
  })

  it('refuses to clear the return-to-run gate in either mode', () => {
    expect(running).toMatch(/not yours to make in chat/)
    expect(strength).toMatch(/not something to clear in a chat message/)
  })

  it('includes the guardrails in both modes, last', () => {
    for (const prompt of [strength, running]) {
      expect(prompt).toMatch(/Load progresses before range/)
      expect(prompt).toMatch(/seated position flexes the hip/)
      // Last means last: nothing may be appended after the override section,
      // or the "these override everything above" framing stops being true.
      expect(prompt.indexOf('Injury guardrails')).toBeGreaterThan(prompt.indexOf('## The block'))
      expect(prompt.trimEnd().endsWith("Don't lecture.")).toBe(true)
    }
  })

  it('extends the guardrails to running rather than leaving them lifting-only', () => {
    expect(running).toMatch(/These apply to running too/)
    expect(running).toMatch(/Never use running as a way around a movement restriction/)
  })

  it('keeps the mode-independent core in both', () => {
    for (const prompt of [strength, running]) {
      expect(prompt).toMatch(/Never invent a logged meal/)
      expect(prompt).toMatch(/never name which expertise/i)
      expect(prompt).toMatch(/no padding, not no length/)
    }
  })

  it('carries the post-workout restraint rules in both modes', () => {
    // The proactive message is the one place the coach speaks unprompted, so
    // the licence to say nothing has to be explicit — a model that treats an
    // empty reply as failure will pad, and padding is what gets it muted.
    for (const prompt of [strength, running]) {
      expect(prompt).toMatch(/A rest day, or a session logged so long ago the window has closed, gets \*\*nothing\*\*/)
      expect(prompt).toMatch(/25-minute recovery jog/)
      expect(prompt).toMatch(/Silence costs nothing; noise costs you the channel/)
      expect(prompt).toMatch(/Never send the same message twice about the same session/)
    }
  })

  it('falls back to strength for an unknown or missing mode', () => {
    expect(buildSystemPrompt(undefined)).toBe(strength)
    expect(buildSystemPrompt('triathlon')).toBe(strength)
  })

  it('returns a byte-identical string per mode so the cache breakpoint holds', () => {
    expect(buildSystemPrompt('running')).toBe(buildSystemPrompt('running'))
    expect(buildSystemPrompt('running')).not.toBe(strength)
  })
})

// ── Rate limiting ────────────────────────────────────────────────────

describe('consumeTurn', () => {
  it('opens a window on the first turn', async () => {
    const store = fakeStore()
    const { remaining } = await consumeTurn(store, 1000)
    expect(remaining).toBe(LIMITS.MAX_TURNS_PER_WINDOW - 1)
  })

  it('counts down within the window', async () => {
    const store = fakeStore()
    await consumeTurn(store, 1000)
    const { remaining } = await consumeTurn(store, 2000)
    expect(remaining).toBe(LIMITS.MAX_TURNS_PER_WINDOW - 2)
  })

  it('throws once the budget is spent', async () => {
    const store = fakeStore({
      collections: { coachUsage: { 'test-uid': { windowStart: 1000, count: LIMITS.MAX_TURNS_PER_WINDOW } } },
    })
    await expect(consumeTurn(store, 2000)).rejects.toThrow(RateLimitError)
  })

  it('opens a fresh window once the old one expires', async () => {
    const store = fakeStore({
      collections: { coachUsage: { 'test-uid': { windowStart: 0, count: LIMITS.MAX_TURNS_PER_WINDOW } } },
    })
    const { remaining } = await consumeTurn(store, LIMITS.WINDOW_MS + 1)
    expect(remaining).toBe(LIMITS.MAX_TURNS_PER_WINDOW - 1)
  })

  it('reports how long to wait', async () => {
    const store = fakeStore({
      collections: { coachUsage: { 'test-uid': { windowStart: 0, count: LIMITS.MAX_TURNS_PER_WINDOW } } },
    })
    await expect(consumeTurn(store, 1000)).rejects.toThrow(/minutes/)
  })
})
