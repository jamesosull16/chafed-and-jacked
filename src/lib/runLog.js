/**
 * Appending a run to a day's mileage document.
 *
 * Extracted from `useWorkout.addRun` so the Cloud Function's `log_run` tool can
 * be checked against it. A run logged from the dashboard and a run logged by
 * telling the coach have to produce the same document — otherwise one path
 * writes `runs` and the other writes a bare `miles`, and everything downstream
 * (weekly mileage, the coach's context, run calories) silently disagrees
 * depending on how the run was entered.
 *
 * `functions/src/coach/training.js` holds a deliberate duplicate, kept honest
 * by `functions/__tests__/runLogParity.test.js`.
 */

/**
 * @param existing the stored `dailyMileage/{date}` document, or null
 * @param run      `{ miles, enteredAt, duration_minutes?, avg_hr_bpm? }`
 * @returns `{ runs, miles }` — the runs array and the day's new total
 */
export function appendRun(existing, run) {
  let runs = existing?.runs || []

  // Legacy documents carry a bare `miles` and no runs array. Seeding the array
  // from it preserves the earlier run instead of silently discarding it the
  // first time a second run is added to that day.
  if (runs.length === 0 && existing?.miles) {
    runs = [{ miles: existing.miles, enteredAt: existing.enteredAt }]
  }

  const next = [...runs, run]
  return { runs: next, miles: next.reduce((sum, r) => sum + r.miles, 0) }
}

export default appendRun
