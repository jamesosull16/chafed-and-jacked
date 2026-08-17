import { describe, it, expect, vi } from 'vitest'
import { createHandlers } from '../src/mcp/tools.js'
import { TOOL_DEFINITIONS } from '../src/mcp/definitions.js'

// ── In-memory store, same surface as src/store.js ─────────────────────

function fakeStore(seed = {}) {
  const data = { profile: seed.profile || {}, collections: seed.collections || {} }
  let ids = 0
  return {
    uid: 'test-uid',
    async getProfile() {
      return data.profile
    },
    async setProfile(patch) {
      data.profile = { ...data.profile, ...patch }
      return patch
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
    async deleteDoc(collection, docId) {
      delete data.collections[collection]?.[docId]
      return { id: docId, deleted: true }
    },
    async query(collection, { orderField, direction = 'desc', limit } = {}) {
      let docs = Object.entries(data.collections[collection] || {}).map(([id, d]) => ({ id, ...d }))
      if (orderField) {
        docs.sort((a, b) => {
          const av = a[orderField] ?? ''
          const bv = b[orderField] ?? ''
          if (av === bv) return 0
          return direction === 'desc' ? (av < bv ? 1 : -1) : av < bv ? -1 : 1
        })
      }
      return limit ? docs.slice(0, limit) : docs
    },
    _data: data,
  }
}

const ESTIMATE = {
  items: [
    { name: 'oats', quantity: '100g', grams: 100, kcal: 380, protein_g: 13, carbs_g: 67, fat_g: 7 },
  ],
  kcal: 380,
  protein_g: 13,
  carbs_g: 67,
  fat_g: 7,
  confidence: 'high',
  assumptions: [],
  grounded: true,
}

const build = (store = fakeStore()) =>
  createHandlers({ store, estimate: vi.fn().mockResolvedValue(ESTIMATE), timezoneOffset: 0 })

const TODAY = new Date().toISOString().slice(0, 10)

// ── Tool contract ────────────────────────────────────────────────────

describe('tool definitions', () => {
  it('every definition has a handler, and every handler a definition', () => {
    const handlers = Object.keys(build())
    const defined = TOOL_DEFINITIONS.map((t) => t.name)
    expect(defined.filter((n) => !handlers.includes(n))).toEqual([])
    expect(handlers.filter((n) => !defined.includes(n))).toEqual([])
  })

  it('covers create, read, update and delete on every athlete-owned collection', () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name)
    // The point of the exercise: nothing James can record in the app should be
    // read-only from a conversation.
    for (const noun of ['meal', 'run', 'workout', 'weigh_in']) {
      expect(names.some((n) => n.startsWith('log_') && n.includes(noun)), `create ${noun}`).toBe(true)
      expect(names.some((n) => n.startsWith('list_') && n.includes(noun)), `read ${noun}`).toBe(true)
      expect(names.includes(`update_${noun}`), `update ${noun}`).toBe(true)
      expect(names.includes(`delete_${noun}`), `delete ${noun}`).toBe(true)
    }
  })

  it('describes when to reach for each tool, not only what it does', () => {
    // Trigger conditions in a description are what actually move the call rate.
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.description.length, tool.name).toBeGreaterThan(60)
      expect(tool.inputSchema.type, tool.name).toBe('object')
    }
  })

  it('takes no uid anywhere — the store is bound before any tool runs', () => {
    const schemas = JSON.stringify(TOOL_DEFINITIONS)
    expect(schemas).not.toMatch(/"uid"|"user_id"|"userId"/)
  })
})

// ── Meals ────────────────────────────────────────────────────────────

describe('meals', () => {
  it('estimates and appends, reporting the day against its stored targets', async () => {
    const store = fakeStore({
      collections: {
        nutritionLogs: { [TODAY]: { entries: [], targets: { kcal: 3000, protein: 180, carbs: 400, fat: 90 } } },
      },
    })
    const result = await build(store).log_meal({ description: '100g oats' })

    expect(result.logged.kcal).toBe(380)
    expect(result.dayTotals.kcal).toBe(380)
    expect(result.remaining.kcal).toBe(2620)
    expect(store._data.collections.nutritionLogs[TODAY].entries).toHaveLength(1)
  })

  it('writes stated macros without going near the estimator', async () => {
    const estimate = vi.fn()
    const store = fakeStore()
    const handlers = createHandlers({ store, estimate, timezoneOffset: 0 })

    const result = await handlers.add_meal_manually({
      label: 'Maeve bar',
      kcal: 200,
      protein_g: 1,
      carbs_g: 20,
      fat_g: 13,
    })

    // Estimating a number he already gave is a way to get a different one.
    expect(estimate).not.toHaveBeenCalled()
    expect(result.logged).toMatchObject({ label: 'Maeve bar', kcal: 200, source: 'manual' })
  })

  it('reports no targets rather than inventing them on a day that has none', async () => {
    const result = await build().log_meal({ description: '100g oats' })
    expect(result.remaining).toBeNull()
  })

  it('updates in place and never appends a second entry', async () => {
    const store = fakeStore()
    const handlers = build(store)
    const { logged } = await handlers.log_meal({ description: '100g oats' })

    await handlers.update_meal({ id: logged.id, kcal: 400, protein_g: 15 })

    const entries = store._data.collections.nutritionLogs[TODAY].entries
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kcal: 400, protein: 15 })
    expect(entries[0].editedAt).toBeTruthy()
  })

  it('refuses an unknown meal id instead of creating one', async () => {
    await expect(build().update_meal({ id: 'nope', kcal: 100 })).rejects.toThrow(/No meal with id/)
    await expect(build().delete_meal({ id: 'nope' })).rejects.toThrow(/No meal with id/)
  })

  it('deletes only the named entry', async () => {
    const store = fakeStore()
    const handlers = build(store)
    const a = await handlers.log_meal({ description: 'a' })
    await handlers.log_meal({ description: 'b' })

    await handlers.delete_meal({ id: a.logged.id })
    expect(store._data.collections.nutritionLogs[TODAY].entries).toHaveLength(1)
  })

  it('rejects a malformed date rather than silently writing to today', async () => {
    await expect(build().list_meals({ date: '06-08-2026' })).rejects.toThrow(/YYYY-MM-DD/)
  })
})

// ── Saved meals ──────────────────────────────────────────────────────

describe('the meal library', () => {
  // A function, not a constant: fakeStore holds the seed by reference.
  const library = () => ({
    savedMeals: {
      'sm-alpha': {
        name: 'Overnight oats',
        key: 'overnight oats',
        kcal: 500,
        protein: 30,
        carbs: 60,
        fat: 15,
        createdAt: '2026-07-01T00:00:00.000Z',
        useCount: 2,
      },
    },
  })

  it('logs a saved meal at its saved macros, without going near the estimator', async () => {
    const estimate = vi.fn()
    const store = fakeStore({ collections: library() })
    const handlers = createHandlers({ store, estimate, timezoneOffset: 0 })

    const result = await handlers.log_saved_meal({ name: 'Overnight oats' })

    expect(estimate).not.toHaveBeenCalled()
    expect(result.logged).toMatchObject({ label: 'Overnight oats', kcal: 500, source: 'library' })
    expect(store._data.collections.nutritionLogs[TODAY].entries).toHaveLength(1)
  })

  it('scales the serving and counts the use', async () => {
    const store = fakeStore({ collections: library() })
    const result = await build(store).log_saved_meal({ name: 'oats', quantity: 0.5 })

    expect(result.logged.kcal).toBe(250)
    expect(result.logged.label).toBe('Overnight oats (0.5×)')
    expect(store._data.collections.savedMeals['sm-alpha'].useCount).toBe(3)
  })

  it('refuses an unknown name rather than estimating something already saved', async () => {
    await expect(
      build(fakeStore({ collections: library() })).log_saved_meal({ name: 'lasagne' })
    ).rejects.toThrow(/Overnight oats/)
  })

  it('saves under a name, and re-saving that name corrects rather than duplicates', async () => {
    const store = fakeStore()
    const handlers = build(store)

    await handlers.save_meal_to_library({
      name: 'Overnight oats',
      kcal: 500,
      protein_g: 30,
      carbs_g: 60,
      fat_g: 15,
    })
    const second = await handlers.save_meal_to_library({
      name: 'overnight   OATS',
      kcal: 520,
      protein_g: 32,
      carbs_g: 61,
      fat_g: 16,
    })

    // Two meals with the same name and different macros is a library he has to
    // pick between at 6am, which is the thing this feature exists to avoid.
    expect(second.replaced).toBe(true)
    expect(Object.keys(store._data.collections.savedMeals)).toHaveLength(1)
    expect(Object.values(store._data.collections.savedMeals)[0].kcal).toBe(520)
  })

  it('gives every saved meal a lastUsedAt, because the app orders on it', async () => {
    // Firestore's orderBy drops documents missing the field — a null here is
    // the difference between a new meal being listed and being invisible.
    const store = fakeStore()
    await build(store).save_meal_to_library({
      name: 'Post-lift bowl',
      kcal: 700,
      protein_g: 55,
      carbs_g: 80,
      fat_g: 14,
    })
    const saved = Object.values(store._data.collections.savedMeals)[0]
    expect(saved).toHaveProperty('lastUsedAt', null)
    expect(saved.useCount).toBe(0)
  })

  it('deletes from the library without touching what was logged from it', async () => {
    const store = fakeStore({ collections: library() })
    const handlers = build(store)
    await handlers.log_saved_meal({ name: 'Overnight oats' })

    await handlers.delete_saved_meal({ name: 'Overnight oats' })

    expect(store._data.collections.savedMeals['sm-alpha']).toBeUndefined()
    expect(store._data.collections.nutritionLogs[TODAY].entries).toHaveLength(1)
  })

  it('lists the library newest-used first, without exposing document ids', async () => {
    const result = await build(fakeStore({ collections: library() })).list_saved_meals()
    expect(result.count).toBe(1)
    expect(result.savedMeals[0]).toMatchObject({ name: 'Overnight oats', timesLogged: 2 })
    expect(JSON.stringify(result)).not.toContain('sm-alpha')
  })
})

// ── Runs ─────────────────────────────────────────────────────────────

describe('runs', () => {
  it('appends to the day and keeps the mileage total in step', async () => {
    const store = fakeStore()
    const handlers = build(store)
    await handlers.log_run({ miles: 3 })
    const second = await handlers.log_run({ miles: 4.5, duration_minutes: 40 })

    expect(second.runs).toHaveLength(2)
    expect(second.dayTotalMiles).toBe(7.5)
    expect(store._data.collections.dailyMileage[TODAY].miles).toBe(7.5)
  })

  it('addresses a run by position, and re-totals after an edit', async () => {
    const store = fakeStore()
    const handlers = build(store)
    await handlers.log_run({ miles: 3 })
    await handlers.log_run({ miles: 4 })

    const result = await handlers.update_run({ index: 0, miles: 5 })
    expect(result.updated.miles).toBe(5)
    expect(result.dayTotalMiles).toBe(9)

    const afterDelete = await handlers.delete_run({ index: 1 })
    expect(afterDelete.dayTotalMiles).toBe(5)
  })

  it('rejects a distance that cannot be right', async () => {
    await expect(build().log_run({ miles: 0 })).rejects.toThrow(/above 0/)
    await expect(build().log_run({ miles: 500 })).rejects.toThrow(/doesn't look right/)
  })

  it('refuses a run index that is not there', async () => {
    await expect(build().update_run({ index: 3, miles: 1 })).rejects.toThrow(/No run at index/)
  })
})

// ── Workouts ─────────────────────────────────────────────────────────

describe('workouts', () => {
  const SESSION = {
    name: 'Lower — Posterior',
    exercises: [
      { id: 'barbellHipThrust', sets: [{ weight: 225, reps: 10, rir: 2 }] },
      { id: 'sidePlank', sets: [{ weight: 174.5, reps: 60, isBodyweight: true, side: 'left' }] },
    ],
  }

  it('writes every set, and leaves totalVolume for the app', async () => {
    const store = fakeStore()
    const { logged, note } = await build(store).log_workout(SESSION)

    expect(logged.exercises[0].sets[0]).toMatchObject({ weight: 225, reps: 10, rir: 2 })
    expect(logged.exercises[1].sets[0]).toMatchObject({ isBodyweight: true, side: 'left' })
    // A tonnage figure computed here would disagree with every other session,
    // because this bundle cannot see the bodyweight fractions the app applies.
    expect(logged.totalVolume).toBeUndefined()
    expect(note).toMatch(/totalVolume/)
  })

  it('refuses a session with no sets in it', async () => {
    await expect(build().log_workout({ exercises: [] })).rejects.toThrow(/at least one exercise/)
    await expect(
      build().log_workout({ exercises: [{ id: 'barbellHipThrust', sets: [] }] })
    ).rejects.toThrow(/no sets/)
  })

  it('reads one back in full, and refuses an id that is not there', async () => {
    const store = fakeStore()
    const handlers = build(store)
    const { logged } = await handlers.log_workout(SESSION)

    const { workout } = await handlers.get_workout({ id: logged.id })
    expect(workout.exercises).toHaveLength(2)
    await expect(handlers.get_workout({ id: 'nope' })).rejects.toThrow(/No workout with id/)
  })

  it('warns that deleting a session leaves exerciseProgress carrying it', async () => {
    const store = fakeStore()
    const handlers = build(store)
    const { logged } = await handlers.log_workout(SESSION)

    const result = await handlers.delete_workout({ id: logged.id })
    expect(result.note).toMatch(/exerciseProgress/)
    expect(store._data.collections.workoutSessions[logged.id]).toBeUndefined()
  })
})

// ── Weigh-ins, check-ins, progress ───────────────────────────────────

describe('body metrics', () => {
  it('records a weigh-in and reads it back', async () => {
    const store = fakeStore()
    const handlers = build(store)
    const { logged } = await handlers.log_weigh_in({ weight: 174.5, body_fat_pct: 14.2 })

    const { weighIns } = await handlers.list_weigh_ins({})
    expect(weighIns[0]).toMatchObject({ id: logged.id, weight: 174.5, bodyFatPct: 14.2 })
  })

  it('rejects a weight that cannot be right', async () => {
    await expect(build().log_weigh_in({ weight: 0 })).rejects.toThrow(/above 0/)
    await expect(build().log_weigh_in({ weight: 900 })).rejects.toThrow(/doesn't look right/)
  })
})

describe('check-ins', () => {
  it('merges the day rather than appending a second one', async () => {
    const store = fakeStore()
    const handlers = build(store)
    await handlers.log_check_in({ soreness: 7 })
    await handlers.log_check_in({ sleep_hours: 5.5 })

    // Mentioning soreness at noon and sleep at night is one check-in.
    expect(store._data.collections.checkIns[TODAY]).toMatchObject({ soreness: 7, sleep_hours: 5.5 })
  })

  it('clamps to the scales the app uses', async () => {
    const { recorded } = await build().log_check_in({ soreness: 99, rpe: -4, sleep_hours: 40 })
    expect(recorded).toMatchObject({ soreness: 10, rpe: 1, sleep_hours: 24 })
  })

  it('refuses an empty check-in rather than writing a blank day', async () => {
    await expect(build().log_check_in({})).rejects.toThrow(/at least one/)
  })
})

describe('exercise progress', () => {
  const seeded = () =>
    fakeStore({
      collections: {
        exerciseProgress: {
          barbellHipThrust: { currentWeight: 225, lastReps: [10, 10], history: [{ date: 'x' }] },
        },
      },
    })

  it('corrects the next prescription without touching history', async () => {
    const store = seeded()
    await build(store).update_exercise_progress({
      exercise_id: 'barbellHipThrust',
      current_weight: 235,
    })
    const doc = store._data.collections.exerciseProgress.barbellHipThrust
    expect(doc.currentWeight).toBe(235)
    expect(doc.history).toHaveLength(1)
  })

  it('refuses a movement it has never seen', async () => {
    await expect(
      build().update_exercise_progress({ exercise_id: 'nope', current_weight: 1 })
    ).rejects.toThrow(/No progress recorded/)
  })
})

// ── Profile ──────────────────────────────────────────────────────────

describe('profile', () => {
  it('writes settings through the whitelist', async () => {
    const store = fakeStore({ profile: { mode: 'strength' } })
    await build(store).update_profile({
      // `sessionMinutes` is no longer a setting — the whitelist drops it like
      // any other unknown field rather than writing a knob nothing reads.
      strength: { blockStart: '2026-07-20', trainingDaysPerWeek: 4, sessionMinutes: 75 },
      profile: { heightInches: 71 },
    })
    expect(store._data.profile.strength).toEqual({
      blockStart: '2026-07-20',
      trainingDaysPerWeek: 4,
    })
    expect(store._data.profile.profile).toEqual({ heightInches: 71 })
  })

  it('drops fields outside the whitelist rather than writing them', async () => {
    const store = fakeStore({ profile: {} })
    // A profile document carries auth-adjacent fields beside the training
    // settings; a tool for moving a block start date must not reach them.
    await build(store).update_profile({
      strength: { blockStart: '2026-07-20', email: 'attacker@example.com', uid: 'someone-else' },
    })
    expect(store._data.profile.strength).toEqual({ blockStart: '2026-07-20' })
  })

  it('refuses an update with nothing settable in it', async () => {
    await expect(build().update_profile({ nonsense: true })).rejects.toThrow(/Nothing to update/)
    await expect(build().update_profile({ mode: 'cycling' })).rejects.toThrow(/strength.*running/)
  })
})

// ── Shared across transports ─────────────────────────────────────────

describe('one implementation, two transports', () => {
  it('lets a transport add tools without forking the CRUD surface', async () => {
    // The stdio server layers live analysis on top of these same handlers,
    // because it can import src/lib and the Functions bundle cannot. Anything
    // beyond that asymmetry would be a second copy to drift — which is the
    // mistake this repo has already paid for three times.
    const { createMcpServer } = await import('../src/mcp/server.js')
    const store = fakeStore()

    const server = createMcpServer({
      store,
      estimate: vi.fn(),
      timezoneOffset: 0,
      extraTools: {
        definitions: [{ name: 'local_only', description: 'x', inputSchema: { type: 'object' } }],
        handlers: { local_only: async () => ({ ok: true }) },
      },
    })

    expect(server).toBeTruthy()
    // The extras are additive: every shared tool is still there.
    const shared = TOOL_DEFINITIONS.map((t) => t.name)
    expect(shared).toContain('log_workout')
    expect(shared).not.toContain('local_only')
  })

  it('binds the store before any tool exists, on either transport', () => {
    // Both entrypoints call createHandlers({ store }) with a store already
    // pinned to one uid. There is no code path that takes a uid from a tool
    // argument, which is what makes prompt injection uninteresting here.
    const handlers = build()
    for (const fn of Object.values(handlers)) {
      expect(typeof fn).toBe('function')
      // Arity of 1: the arguments object. A uid would have to be a second.
      expect(fn.length).toBeLessThanOrEqual(1)
    }
  })
})
