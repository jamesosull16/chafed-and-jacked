import { useState, useEffect, useCallback, useMemo } from 'react'
import { useFirestore, getWeekStart, formatLocalDate } from './useFirestore'
import { useAuth } from '../contexts/AuthContext'
import { appendRun } from '../lib/runLog'
import { notifyWorkoutLogged } from '../lib/coachTrigger'

/**
 * Run logging, owned by neither mode.
 *
 * Lifted out of `useWorkout` because a run is a run. The strength block now
 * carries runs too, and the alternative was either importing the whole
 * endurance engine — race periodisation, mileage-scaled lifting loads, the
 * perpetual build/deload cycle — to get at `addRun`, or writing a second
 * implementation of the same append. This repo has already paid for parallel
 * implementations of one thing more than once.
 *
 * `useWorkout` consumes this rather than duplicating it, so running mode reads
 * exactly the same data through exactly the same code path it always did.
 *
 * The append itself lives in `src/lib/runLog.js`, shared with the coach's
 * `log_run` tool and pinned by a parity test — two writers, one shape.
 */
export function useRunLog() {
  const { user } = useAuth()
  const { getDocument, getCollection, setDocument } = useFirestore()

  const [loading, setLoading] = useState(true)
  const [allDailyMiles, setAllDailyMiles] = useState([])

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const all = await getCollection('dailyMileage', 'date', 'desc')
      // Legacy docs held a single `miles`; current ones hold a `runs` array.
      // Normalising on read means nothing downstream has to know which is which,
      // and no migration has to run over historical mileage.
      setAllDailyMiles(
        all.map((d) => {
          if (d.runs) return { ...d, miles: d.runs.reduce((s, r) => s + r.miles, 0) }
          if (d.miles) return { ...d, runs: [{ miles: d.miles, enteredAt: d.enteredAt }] }
          return { ...d, runs: [] }
        })
      )
    } catch (err) {
      console.error('Failed to load run log:', err)
    } finally {
      setLoading(false)
    }
  }, [user, getCollection])

  useEffect(() => {
    load()
  }, [load])

  const today = formatLocalDate()

  const todayEntry = useMemo(
    () => allDailyMiles.find((d) => d.date === today) || null,
    [allDailyMiles, today]
  )

  /** Today's individual runs, with duration and HR where they were logged. */
  const todayRuns = useMemo(() => todayEntry?.runs || [], [todayEntry])

  const todayMiles = todayEntry?.miles ?? null

  const weekDailyMiles = useMemo(() => {
    const start = getWeekStart()
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    return allDailyMiles.filter((d) => {
      const date = new Date(`${d.date}T00:00:00`)
      return date >= start && date <= end
    })
  }, [allDailyMiles])

  const weekDailySum = useMemo(
    () => weekDailyMiles.reduce((sum, d) => sum + (d.miles || 0), 0),
    [weekDailyMiles]
  )

  /** Total logged run minutes this week — the load unit miles can't express. */
  const weekDailyMinutes = useMemo(
    () =>
      weekDailyMiles.reduce(
        (sum, d) => sum + (d.runs || []).reduce((s, r) => s + (r.duration_minutes || 0), 0),
        0
      ),
    [weekDailyMiles]
  )

  /**
   * Add a run to a day.
   *
   * @param {number} miles
   * @param {string|null} dateStr  YYYY-MM-DD, defaults to today
   * @param {Object} opts          { duration_minutes, avg_hr_bpm }
   */
  const addRun = useCallback(
    async (miles, dateStr = null, opts = {}) => {
      if (!user) return
      const date = dateStr || formatLocalDate()
      const existing = await getDocument(`dailyMileage/${date}`)

      const run = { miles, enteredAt: new Date().toISOString() }
      if (opts.duration_minutes) run.duration_minutes = opts.duration_minutes
      if (opts.avg_hr_bpm) run.avg_hr_bpm = opts.avg_hr_bpm

      const { runs, miles: total } = appendRun(existing, run)
      await setDocument(`dailyMileage/${date}`, { date, runs, miles: total })
      await load()

      // Fire-and-forget, and only for a run logged today — back-filling last
      // Tuesday should not open a fuelling window that closed days ago. The id
      // is the day plus the run's index, so each run triggers once and a
      // re-save of the same run does not.
      if (date === formatLocalDate()) {
        notifyWorkoutLogged({ workoutId: `${date}#${runs.length - 1}`, kind: 'run' })
      }
    },
    [user, getDocument, setDocument, load]
  )

  const deleteRun = useCallback(
    async (dateStr, runIndex) => {
      if (!user) return
      const existing = await getDocument(`dailyMileage/${dateStr}`)
      if (!existing) return
      let runs = existing.runs || []
      if (runs.length === 0 && existing.miles) {
        runs = [{ miles: existing.miles, enteredAt: existing.enteredAt }]
      }
      runs.splice(runIndex, 1)
      const total = runs.reduce((s, r) => s + r.miles, 0)
      await setDocument(`dailyMileage/${dateStr}`, { date: dateStr, runs, miles: total })
      await load()
    },
    [user, getDocument, setDocument, load]
  )

  return {
    loading,
    allDailyMiles,
    todayRuns,
    todayMiles,
    weekDailyMiles,
    weekDailySum,
    weekDailyMinutes,
    addRun,
    deleteRun,
    refreshRuns: load,
  }
}

export default useRunLog
