/**
 * MCP TOOL IMPLEMENTATIONS — Chafed & Jacked
 *
 * Full read/write access to the athlete's own data, over the same Firestore
 * documents the PWA reads. A meal logged from a Claude conversation is
 * indistinguishable from one logged in the app, and the same is now true of a
 * session, a run, a weigh-in and a check-in.
 *
 * Every handler is closed over a store bound to one uid at construction. No
 * tool takes a uid, so nothing derived from conversation text — including a
 * prompt-injected instruction — can redirect a read or a write to another
 * user's data.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO — recompute the app's analysis.
 *
 * Macro targets, chain balance and the volume landmarks live in `src/lib`,
 * which the Cloud Functions bundle cannot import: only `functions/` is
 * uploaded on deploy. The coach solves that by keeping server-side copies with
 * parity tests, and that is the right shape for logic the coach needs on every
 * turn. It is the wrong shape here: a second copy of the macro engine, drifting
 * against the first, to answer a question the app has already answered and
 * written down. So the reads return the *stored* figures — the targets the app
 * computed and saved onto the day — and say plainly when a day has none rather
 * than inventing one.
 */

import { randomUUID } from 'node:crypto'
import { validateEstimate, toLogEntry, totalsFor } from '../schema.js'
import {
  libraryKey,
  matchSavedMeal,
  normaliseName,
  normaliseQuantity,
  savedMealToEntry,
  sortSavedMeals,
} from '../savedMeals.js'
import { localDateId } from '../store.js'
import { normaliseMileageDoc, appendRun, summariseSession, toDate } from '../coach/training.js'

const round1 = (n) => Math.round(n * 10) / 10

/** Local YYYY-MM-DD, defaulting to today in the athlete's timezone. */
function dayOf(date, offsetMinutes = 0) {
  if (!date) return localDateId(new Date(), offsetMinutes)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    throw new Error(`Dates must be YYYY-MM-DD; got "${date}".`)
  }
  return String(date)
}

/** The last N local dates, newest first. */
function recentDays(days, offsetMinutes) {
  const out = []
  for (let i = 0; i < days; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    out.push(localDateId(d, offsetMinutes))
  }
  return out
}

function consumedFrom(entries = []) {
  const t = totalsFor(
    entries.map((e) => ({ kcal: e.kcal, protein_g: e.protein, carbs_g: e.carbs, fat_g: e.fat }))
  )
  return {
    kcal: Math.round(t.kcal),
    protein_g: round1(t.protein_g),
    carbs_g: round1(t.carbs_g),
    fat_g: round1(t.fat_g),
  }
}

/**
 * The targets the app stored on a day, in the tools' own naming.
 *
 * Written by the Fuel page and by the coach whenever either logs a meal. Absent
 * on a day with nothing logged yet — reported as null rather than guessed.
 */
function storedTargets(log) {
  if (!log?.targets) return null
  const { kcal, protein, carbs, fat } = log.targets
  if (kcal == null) return null
  return { kcal, protein_g: protein ?? null, carbs_g: carbs ?? null, fat_g: fat ?? null }
}

function remainingFrom(targets, consumed) {
  if (!targets) return null
  return {
    kcal: Math.round(targets.kcal - consumed.kcal),
    protein_g: targets.protein_g == null ? null : round1(targets.protein_g - consumed.protein_g),
    carbs_g: targets.carbs_g == null ? null : round1(targets.carbs_g - consumed.carbs_g),
    fat_g: targets.fat_g == null ? null : round1(targets.fat_g - consumed.fat_g),
  }
}

/**
 * Build the handler map.
 *
 * @param deps.store            uid-bound Firestore accessor
 * @param deps.estimate         the shared meal estimation service
 * @param deps.timezoneOffset   minutes, as Date#getTimezoneOffset reports them
 */
export function createHandlers({ store, estimate, timezoneOffset = 0 }) {
  const tz = Number(timezoneOffset) || 0
  const today = (date) => dayOf(date, tz)

  /** Read/modify/write one day's meal list. */
  async function withMeals(dateId, mutate) {
    const log = await store.getDoc('nutritionLogs', dateId)
    const entries = log?.entries || []
    const next = mutate(entries, log)
    await store.setDoc('nutritionLogs', dateId, { date: dateId, entries: next })
    const consumed = consumedFrom(next)
    const targets = storedTargets(log)
    return { entries: next, dayTotals: consumed, remaining: remainingFrom(targets, consumed) }
  }

  /** The saved meal library. Capped — a library this size is already unusable. */
  async function readLibrary() {
    return store.query('savedMeals', { orderField: 'createdAt', direction: 'desc', limit: 200 })
  }

  /**
   * Record that a saved meal was used, so the app's ordering reflects it.
   *
   * Read-modify-write, matching the coach: the store exposes no field
   * transforms, and a lost increment costs a sort position. Swallowed on
   * failure — the meal itself is already on the day.
   */
  async function noteLibraryUse(meal) {
    try {
      await store.setDoc('savedMeals', meal.id, {
        lastUsedAt: new Date().toISOString(),
        useCount: (Number(meal.useCount) || 0) + 1,
      })
    } catch {
      // Ordering falls back to when it was saved.
    }
  }

  /** Read/modify/write one day's run list, keeping `miles` in step. */
  async function withRuns(dateId, mutate) {
    const doc = await store.getDoc('dailyMileage', dateId)
    const runs = normaliseMileageDoc(doc)?.runs || []
    const next = mutate(runs)
    const miles = round1(next.reduce((sum, r) => sum + (Number(r.miles) || 0), 0))
    await store.setDoc('dailyMileage', dateId, { date: dateId, runs: next, miles })
    return { runs: next, dayTotalMiles: miles }
  }

  return {
    // ── Meals ──────────────────────────────────────────────────────

    async log_meal({ description, image, media_type, meal_type, date, label }) {
      if (!description && !image) throw new Error('Provide a description, an image, or both.')

      const raw = await estimate({
        description,
        imageBase64: image,
        mediaType: image ? media_type || 'image/jpeg' : undefined,
      })
      const validated = validateEstimate(raw)
      if (!validated.ok) throw new Error(validated.error)

      const entry = toLogEntry(validated.estimate, {
        id: randomUUID(),
        description: label || description,
        mealType: meal_type,
        source: image ? 'photo' : 'text',
      })

      const dateId = today(date)
      const result = await withMeals(dateId, (entries) => [...entries, entry])
      return {
        date: dateId,
        logged: entry,
        grounded_in_usda: raw.grounded,
        confidence: validated.estimate.confidence,
        assumptions: validated.estimate.assumptions,
        ...result,
      }
    },

    /**
     * Write a meal whose macros are already known — a label, a repeat, a
     * package the athlete read off the box. Skips estimation entirely, which
     * is the point: estimating a number he already has is a way to get a
     * different one.
     */
    async add_meal_manually({ label, kcal, protein_g, carbs_g, fat_g, meal_type, date }) {
      const numbers = { kcal, protein_g, carbs_g, fat_g }
      for (const [key, value] of Object.entries(numbers)) {
        if (!Number.isFinite(Number(value)) || Number(value) < 0) {
          throw new Error(`${key} must be a number of at least 0.`)
        }
      }
      const entry = {
        id: randomUUID(),
        label: String(label || 'Meal').slice(0, 120),
        kcal: Math.round(Number(kcal)),
        protein: round1(Number(protein_g)),
        carbs: round1(Number(carbs_g)),
        fat: round1(Number(fat_g)),
        loggedAt: new Date().toISOString(),
        source: 'manual',
        ...(meal_type && { mealType: meal_type }),
      }
      const dateId = today(date)
      return { date: dateId, logged: entry, ...(await withMeals(dateId, (e) => [...e, entry])) }
    },

    async list_meals({ date, days = 1 }) {
      const window = date ? [today(date)] : recentDays(Math.min(90, Math.max(1, days)), tz)
      const out = []
      for (const dateId of window) {
        const log = await store.getDoc('nutritionLogs', dateId)
        const entries = log?.entries || []
        if (!entries.length && !log) continue
        const consumed = consumedFrom(entries)
        const targets = storedTargets(log)
        out.push({
          date: dateId,
          meals: entries,
          dayTotals: consumed,
          targets,
          remaining: remainingFrom(targets, consumed),
        })
      }
      return { days: window.length, daysWithData: out.length, log: out }
    },

    async update_meal({ id, date, ...patch }) {
      const dateId = today(date)
      const allowed = ['label', 'kcal', 'protein', 'carbs', 'fat', 'mealType', 'description']
      const renamed = {
        label: patch.label,
        kcal: patch.kcal,
        protein: patch.protein_g,
        carbs: patch.carbs_g,
        fat: patch.fat_g,
        mealType: patch.meal_type,
        description: patch.description,
      }
      const updates = Object.fromEntries(
        Object.entries(renamed).filter(([k, v]) => allowed.includes(k) && v !== undefined)
      )
      if (!Object.keys(updates).length) throw new Error('Nothing to update.')

      let updated = null
      const result = await withMeals(dateId, (entries) => {
        const index = entries.findIndex((e) => e.id === id)
        if (index === -1) throw new Error(`No meal with id ${id} on ${dateId}.`)
        const next = [...entries]
        next[index] = { ...next[index], ...updates, editedAt: new Date().toISOString() }
        updated = next[index]
        return next
      })
      return { date: dateId, updated, ...result }
    },

    async delete_meal({ id, date }) {
      const dateId = today(date)
      const result = await withMeals(dateId, (entries) => {
        const next = entries.filter((e) => e.id !== id)
        if (next.length === entries.length) throw new Error(`No meal with id ${id} on ${dateId}.`)
        return next
      })
      return { date: dateId, deleted: id, ...result }
    },

    // ── Saved meals ────────────────────────────────────────────────

    async list_saved_meals() {
      const meals = sortSavedMeals(await readLibrary())
      return {
        count: meals.length,
        savedMeals: meals.map((m) => ({
          name: m.name,
          kcal: m.kcal,
          protein_g: m.protein,
          carbs_g: m.carbs,
          fat_g: m.fat,
          mealType: m.mealType ?? null,
          items: m.items ?? null,
          timesLogged: m.useCount || 0,
          lastUsedAt: m.lastUsedAt ?? null,
        })),
      }
    },

    async log_saved_meal({ name, quantity, meal_type, date }) {
      const meals = await readLibrary()
      const { match, candidates } = matchSavedMeal(meals, name)
      if (!match) {
        if (candidates.length > 1) {
          const names = candidates.map((c) => c.name).join('" and "')
          throw new Error(`"${name}" matches "${names}" — say which one.`)
        }
        throw new Error(
          meals.length
            ? `Nothing saved under "${name}". The library holds: ${meals.map((m) => m.name).join(', ')}.`
            : 'The meal library is empty.'
        )
      }

      const entry = savedMealToEntry(match, {
        quantity,
        mealType: meal_type,
        id: randomUUID(),
      })
      const dateId = today(date)
      const result = await withMeals(dateId, (entries) => [...entries, entry])
      await noteLibraryUse(match)
      return {
        date: dateId,
        logged: entry,
        fromLibrary: match.name,
        quantity: normaliseQuantity(quantity),
        ...result,
      }
    },

    /**
     * Keep a meal, or correct the one already under that name.
     *
     * Name-keyed rather than append-only, matching the app: re-saving with
     * better numbers should fix the meal he already searches for, not leave two
     * with the same name and different macros.
     */
    async save_meal_to_library({ name, kcal, protein_g, carbs_g, fat_g, meal_type }) {
      const numbers = { kcal, protein_g, carbs_g, fat_g }
      for (const [key, value] of Object.entries(numbers)) {
        if (!Number.isFinite(Number(value)) || Number(value) < 0) {
          throw new Error(`${key} must be a number of at least 0.`)
        }
      }
      const clean = normaliseName(name, '')
      if (!clean) throw new Error('A saved meal needs a name — it is what it is found by.')

      const existing = (await readLibrary()).find((m) => libraryKey(m.name) === libraryKey(clean))
      const now = new Date().toISOString()
      const meal = {
        name: clean,
        key: libraryKey(clean),
        kcal: Math.round(Number(kcal)),
        protein: round1(Number(protein_g)),
        carbs: round1(Number(carbs_g)),
        fat: round1(Number(fat_g)),
        ...(meal_type && { mealType: meal_type }),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        // Only on creation. `lastUsedAt` must exist from the start — the app
        // orders the library on it, and Firestore drops documents missing the
        // field it orders by.
        ...(existing ? {} : { useCount: 0, lastUsedAt: null }),
      }
      const id = existing?.id || randomUUID()
      await store.setDoc('savedMeals', id, meal)
      return { saved: { name: clean, ...meal }, replaced: !!existing }
    },

    async delete_saved_meal({ name }) {
      const meals = await readLibrary()
      const { match, candidates } = matchSavedMeal(meals, name)
      if (!match) {
        if (candidates.length > 1) {
          const names = candidates.map((c) => c.name).join('" and "')
          throw new Error(`"${name}" matches "${names}" — say which one.`)
        }
        throw new Error(`Nothing saved under "${name}".`)
      }
      await store.deleteDoc('savedMeals', match.id)
      return {
        deleted: match.name,
        note: 'Days that already logged this meal keep their entries.',
      }
    },

    // ── Runs ───────────────────────────────────────────────────────

    async log_run({ miles, duration_minutes, avg_hr_bpm, date }) {
      const distance = Number(miles)
      if (!Number.isFinite(distance) || distance <= 0) throw new Error('miles must be above 0.')
      if (distance > 200) throw new Error(`${distance} miles doesn't look right — check it.`)

      const run = { miles: distance, enteredAt: new Date().toISOString() }
      const duration = Number(duration_minutes)
      if (Number.isFinite(duration) && duration > 0) run.duration_minutes = duration
      const hr = Number(avg_hr_bpm)
      if (Number.isFinite(hr) && hr > 0) run.avg_hr_bpm = hr

      // Shares appendRun with the coach and the app, so a run logged here is
      // merged into the day exactly as one logged anywhere else.
      const dateId = today(date)
      const doc = await store.getDoc('dailyMileage', dateId)
      const { runs, miles: total } = appendRun(doc, run)
      await store.setDoc('dailyMileage', dateId, { date: dateId, runs, miles: total })
      return { date: dateId, logged: run, runs, dayTotalMiles: round1(total) }
    },

    async list_runs({ date, days = 7 }) {
      const window = date ? [today(date)] : recentDays(Math.min(90, Math.max(1, days)), tz)
      const out = []
      for (const dateId of window) {
        const day = normaliseMileageDoc(await store.getDoc('dailyMileage', dateId))
        if (day?.runs?.length) out.push({ date: dateId, miles: day.miles, runs: day.runs })
      }
      return {
        days: window.length,
        totalMiles: round1(out.reduce((s, d) => s + d.miles, 0)),
        daysRun: out.length,
        log: out,
      }
    },

    /** Runs have no id of their own — they are addressed by position in the day. */
    async update_run({ date, index, miles, duration_minutes, avg_hr_bpm }) {
      const dateId = today(date)
      let updated = null
      const result = await withRuns(dateId, (runs) => {
        if (!runs[index]) throw new Error(`No run at index ${index} on ${dateId}.`)
        const next = [...runs]
        const patch = {}
        if (miles !== undefined) patch.miles = Number(miles)
        if (duration_minutes !== undefined) patch.duration_minutes = Number(duration_minutes)
        if (avg_hr_bpm !== undefined) patch.avg_hr_bpm = Number(avg_hr_bpm)
        if (!Object.keys(patch).length) throw new Error('Nothing to update.')
        next[index] = { ...next[index], ...patch, editedAt: new Date().toISOString() }
        updated = next[index]
        return next
      })
      return { date: dateId, updated, ...result }
    },

    async delete_run({ date, index }) {
      const dateId = today(date)
      const result = await withRuns(dateId, (runs) => {
        if (!runs[index]) throw new Error(`No run at index ${index} on ${dateId}.`)
        return runs.filter((_, i) => i !== index)
      })
      return { date: dateId, deleted: index, ...result }
    },

    // ── Strength sessions ──────────────────────────────────────────

    async log_workout({ name, day_id, exercises, duration_minutes, date, mode = 'strength' }) {
      if (!Array.isArray(exercises) || !exercises.length) {
        throw new Error('Provide at least one exercise with its sets.')
      }
      for (const ex of exercises) {
        if (!ex?.id) throw new Error('Every exercise needs an id, e.g. barbellHipThrust.')
        if (!Array.isArray(ex.sets) || !ex.sets.length) {
          throw new Error(`Exercise "${ex.id}" has no sets.`)
        }
      }

      // `totalVolume` is deliberately not computed here. The app derives it
      // through sessionTonnage, which knows about bodyweight fractions, per-hand
      // multipliers and timed holds — none of which this bundle can import. A
      // number invented here would disagree with every other session on the
      // dashboard, so the field is left for the app to fill.
      const doc = {
        date: date ? `${today(date)}T12:00:00.000Z` : new Date().toISOString(),
        mode,
        ...(name && { name }),
        ...(day_id && { dayId: day_id }),
        exercises: exercises.map((ex) => ({
          id: ex.id,
          sets: ex.sets.map((s) => ({
            weight: Number(s.weight) || 0,
            reps: Number(s.reps) || 0,
            ...(s.rir != null && { rir: Number(s.rir) }),
            ...(s.side && { side: s.side }),
            ...(s.isBodyweight && { isBodyweight: true }),
            ...(s.addedWeight != null && { addedWeight: Number(s.addedWeight) }),
            completed: true,
          })),
        })),
        ...(duration_minutes && { duration: Number(duration_minutes) }),
        completed: true,
        source: 'mcp',
      }
      const saved = await store.addDoc('workoutSessions', doc)
      return {
        logged: { id: saved.id, ...doc },
        note: 'totalVolume is left unset — the app computes it, and a second implementation here would disagree with it.',
      }
    },

    async list_workouts({ days = 28, limit = 20 }) {
      const sessions = await store.query('workoutSessions', {
        orderField: 'date',
        direction: 'desc',
        limit: Math.min(120, Math.max(1, limit) * 3),
      })
      const cutoff = new Date(Date.now() - Math.min(365, Math.max(1, days)) * 86400000)
      const scoped = sessions
        .filter((s) => (toDate(s.date) || 0) >= cutoff)
        .slice(0, Math.min(60, Math.max(1, limit)))
      return {
        days,
        count: scoped.length,
        workouts: scoped.map((s) => ({
          id: s.id,
          ...summariseSession(s, new Date()),
          totalVolume: s.totalVolume ?? null,
          completed: s.completed !== false,
        })),
      }
    },

    async get_workout({ id }) {
      const session = await store.getDoc('workoutSessions', id)
      if (!session) throw new Error(`No workout with id ${id}.`)
      return { workout: session }
    },

    async update_workout({ id, ...patch }) {
      const session = await store.getDoc('workoutSessions', id)
      if (!session) throw new Error(`No workout with id ${id}.`)

      const updates = {}
      if (patch.name !== undefined) updates.name = patch.name
      if (patch.duration_minutes !== undefined) updates.duration = Number(patch.duration_minutes)
      if (patch.completed !== undefined) updates.completed = !!patch.completed
      if (patch.exercises !== undefined) {
        if (!Array.isArray(patch.exercises)) throw new Error('exercises must be an array.')
        updates.exercises = patch.exercises
      }
      if (!Object.keys(updates).length) throw new Error('Nothing to update.')

      updates.editedAt = new Date().toISOString()
      await store.setDoc('workoutSessions', id, updates)
      return { updated: { id, ...session, ...updates } }
    },

    async delete_workout({ id }) {
      const session = await store.getDoc('workoutSessions', id)
      if (!session) throw new Error(`No workout with id ${id}.`)
      await store.deleteDoc('workoutSessions', id)
      return {
        deleted: id,
        note: 'exerciseProgress still carries this session in its history — correct it with update_exercise_progress if the loads matter.',
      }
    },

    // ── Body metrics ───────────────────────────────────────────────

    async log_weigh_in({ weight, body_fat_pct, date }) {
      const lbs = Number(weight)
      if (!Number.isFinite(lbs) || lbs <= 0) throw new Error('weight must be above 0.')
      if (lbs > 700) throw new Error(`${lbs} lbs doesn't look right — check it.`)

      const dateId = today(date)
      const entry = {
        date: `${dateId}T12:00:00.000Z`,
        weight: round1(lbs),
        ...(body_fat_pct != null && { bodyFatPct: round1(Number(body_fat_pct)) }),
      }
      const saved = await store.addDoc('bodyMetrics', entry)
      return { logged: { id: saved.id, ...entry } }
    },

    async list_weigh_ins({ weeks = 8 }) {
      const entries = await store.query('bodyMetrics', {
        orderField: 'date',
        direction: 'desc',
        limit: 60,
      })
      const cutoff = new Date(Date.now() - Math.min(104, Math.max(1, weeks)) * 7 * 86400000)
      const scoped = entries.filter((e) => (toDate(e.date) || 0) >= cutoff)
      return {
        weeks,
        count: scoped.length,
        weighIns: scoped.map((e) => ({
          id: e.id,
          date: String(e.date).slice(0, 10),
          weight: e.weight ?? null,
          bodyFatPct: e.bodyFatPct ?? null,
        })),
      }
    },

    async update_weigh_in({ id, weight, body_fat_pct }) {
      const existing = await store.getDoc('bodyMetrics', id)
      if (!existing) throw new Error(`No weigh-in with id ${id}.`)
      const updates = {}
      if (weight !== undefined) updates.weight = round1(Number(weight))
      if (body_fat_pct !== undefined) updates.bodyFatPct = round1(Number(body_fat_pct))
      if (!Object.keys(updates).length) throw new Error('Nothing to update.')
      await store.setDoc('bodyMetrics', id, updates)
      return { updated: { id, ...existing, ...updates } }
    },

    async delete_weigh_in({ id }) {
      const existing = await store.getDoc('bodyMetrics', id)
      if (!existing) throw new Error(`No weigh-in with id ${id}.`)
      await store.deleteDoc('bodyMetrics', id)
      return { deleted: id }
    },

    // ── Check-ins ──────────────────────────────────────────────────

    async log_check_in({ sleep_hours, soreness, rpe, note, date }) {
      const clamp = (value, lo, hi) => {
        const n = Number(value)
        return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null
      }
      const entry = {}
      const sleep = clamp(sleep_hours, 0, 24)
      if (sleep != null) entry.sleep_hours = round1(sleep)
      const sore = clamp(soreness, 1, 10)
      if (sore != null) entry.soreness = Math.round(sore)
      const effort = clamp(rpe, 1, 10)
      if (effort != null) entry.rpe = Math.round(effort)
      if (note?.trim()) entry.note = String(note).trim().slice(0, 200)
      if (!Object.keys(entry).length) {
        throw new Error('Give at least one of sleep_hours, soreness, rpe or note.')
      }

      // Merged into the day rather than appended, matching the coach: soreness
      // at noon and sleep at night are one check-in, not two conflicting ones.
      const dateId = today(date)
      await store.setDoc('checkIns', dateId, { date: dateId, ...entry })
      return { date: dateId, recorded: entry }
    },

    async list_check_ins({ days = 14 }) {
      const entries = await store.query('checkIns', {
        orderField: 'date',
        direction: 'desc',
        limit: Math.min(90, Math.max(1, days)),
      })
      return { count: entries.length, checkIns: entries }
    },

    async delete_check_in({ date }) {
      const dateId = today(date)
      const existing = await store.getDoc('checkIns', dateId)
      if (!existing) throw new Error(`No check-in on ${dateId}.`)
      await store.deleteDoc('checkIns', dateId)
      return { deleted: dateId }
    },

    // ── Exercise progress ──────────────────────────────────────────

    async get_exercise_progress({ exercise_id }) {
      if (exercise_id) {
        const doc = await store.getDoc('exerciseProgress', exercise_id)
        if (!doc) throw new Error(`No progress recorded for "${exercise_id}".`)
        return { progress: doc }
      }
      const all = await store.query('exerciseProgress')
      return {
        count: all.length,
        exercises: all.map((d) => ({
          id: d.id,
          currentWeight: d.currentWeight ?? null,
          isBodyweight: !!d.isBodyweight,
          currentAddedWeight: d.currentAddedWeight ?? 0,
          lastReps: d.lastReps ?? null,
          lastSessionDate: d.lastSessionDate ?? null,
          sessions: (d.history || []).length,
        })),
      }
    },

    /**
     * Correct what the next session will suggest.
     *
     * The whole document is derived from logged sessions, so this is a repair
     * tool: use it when a bad log has left the next prescription wrong, not as
     * a way to set loads. History is left alone unless explicitly replaced.
     */
    async update_exercise_progress({ exercise_id, current_weight, is_bodyweight, current_added_weight, last_reps }) {
      const existing = await store.getDoc('exerciseProgress', exercise_id)
      if (!existing) throw new Error(`No progress recorded for "${exercise_id}".`)
      const updates = {}
      if (current_weight !== undefined) updates.currentWeight = Number(current_weight)
      if (is_bodyweight !== undefined) updates.isBodyweight = !!is_bodyweight
      if (current_added_weight !== undefined) {
        updates.currentAddedWeight = Number(current_added_weight)
      }
      if (last_reps !== undefined) {
        if (!Array.isArray(last_reps)) throw new Error('last_reps must be an array of numbers.')
        updates.lastReps = last_reps.map(Number)
      }
      if (!Object.keys(updates).length) throw new Error('Nothing to update.')
      await store.setDoc('exerciseProgress', exercise_id, updates)
      return { updated: { id: exercise_id, ...existing, ...updates } }
    },

    async delete_exercise_progress({ exercise_id }) {
      const existing = await store.getDoc('exerciseProgress', exercise_id)
      if (!existing) throw new Error(`No progress recorded for "${exercise_id}".`)
      await store.deleteDoc('exerciseProgress', exercise_id)
      return {
        deleted: exercise_id,
        note: 'The next session will prescribe from scratch until this movement is logged again.',
      }
    },

    // ── Profile and settings ───────────────────────────────────────

    async get_profile() {
      const profile = await store.getProfile()
      if (!profile) throw new Error('No profile on record.')
      return { profile }
    },

    /**
     * Settings only, and by whitelist.
     *
     * A profile document carries auth-adjacent fields alongside training
     * settings. Enumerating what may change keeps a tool that exists to move a
     * block start date from being able to rewrite anything else.
     */
    async update_profile({ mode, strength, profile: personal, onboarding }) {
      const updates = {}
      if (mode !== undefined) {
        if (!['strength', 'running'].includes(mode)) {
          throw new Error('mode must be "strength" or "running".')
        }
        updates.mode = mode
      }

      const pick = (source, keys) =>
        Object.fromEntries(
          Object.entries(source || {}).filter(([k, v]) => keys.includes(k) && v !== undefined)
        )

      const strengthFields = pick(strength, [
        'blockStart',
        'blockEnd',
        'trainingDaysPerWeek',
        'trainingDayIndices',
        'equipment',
        'injuryFlags',
        'bodyCompGoal',
      ])
      if (Object.keys(strengthFields).length) updates.strength = strengthFields

      const personalFields = pick(personal, [
        'heightInches',
        'birthday',
        'biologicalSex',
        'vo2max',
      ])
      if (Object.keys(personalFields).length) updates.profile = personalFields

      const onboardingFields = pick(onboarding, [
        'initialWeight',
        'initialBodyFat',
        'trainingDays',
      ])
      if (Object.keys(onboardingFields).length) updates.onboarding = onboardingFields

      if (!Object.keys(updates).length) {
        throw new Error('Nothing to update. Settable: mode, strength, profile, onboarding.')
      }
      await store.setProfile(updates)
      return { updated: updates }
    },

    // ── Coach thread ───────────────────────────────────────────────

    async list_coach_messages({ limit = 20 }) {
      const messages = await store.query('coachChat', {
        orderField: 'createdAt',
        direction: 'desc',
        limit: Math.min(100, Math.max(1, limit)),
      })
      return {
        count: messages.length,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt?.toDate?.()?.toISOString?.() ?? m.createdAt ?? null,
          ...(m.cards?.length && { cardTypes: m.cards.map((c) => c.type) }),
        })),
      }
    },

    async delete_coach_message({ id }) {
      const existing = await store.getDoc('coachChat', id)
      if (!existing) throw new Error(`No coach message with id ${id}.`)
      await store.deleteDoc('coachChat', id)
      return { deleted: id }
    },
  }
}
