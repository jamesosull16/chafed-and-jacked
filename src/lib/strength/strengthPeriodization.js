/**
 * STRENGTH BLOCK PERIODIZATION — Chafed & Jacked
 *
 * Replaces the race-anchored taper model with a block plan for hypertrophy.
 *
 * Structure: stacked mesocycles of 4 accumulation weeks + 1 deload, repeating
 * from `blockStart` until `blockEnd` — 25 weeks by default, which is five whole
 * mesocycles. A length that isn't a multiple of `MESOCYCLE_WEEKS` ends the block
 * mid-cycle on an arbitrary week: 22 weeks ended three weeks into a fifth
 * mesocycle, on an accumulation week, with no deload behind it.
 *
 * Autoregulation is by RIR (reps in reserve) rather than percentage of 1RM:
 * proximity to failure is what drives hypertrophy, and RIR tracks it without
 * needing a maximal test — which would be a poor idea with a hamstring strain
 * and cranky knees anyway.
 *
 *   Accumulation week 1  RIR 3   baseline volume
 *   Accumulation week 2  RIR 2   baseline volume
 *   Accumulation week 3  RIR 2   +~15% sets
 *   Accumulation week 4  RIR 1   +~30% sets
 *   Deload               RIR 4   ~55% sets, ~85% load
 *
 * Pure module. All dates are passed in.
 */

export const ACCUMULATION_WEEKS = 4
export const MESOCYCLE_WEEKS = ACCUMULATION_WEEKS + 1

/** Per-week prescription inside a mesocycle (index 0 = week 1). */
const WEEK_PRESCRIPTION = [
  { rirTarget: 3, volumeMultiplier: 1.0, loadMultiplier: 1.0, phase: 'accumulation' },
  { rirTarget: 2, volumeMultiplier: 1.0, loadMultiplier: 1.0, phase: 'accumulation' },
  { rirTarget: 2, volumeMultiplier: 1.15, loadMultiplier: 1.0, phase: 'accumulation' },
  { rirTarget: 1, volumeMultiplier: 1.3, loadMultiplier: 1.0, phase: 'accumulation' },
  { rirTarget: 4, volumeMultiplier: 0.55, loadMultiplier: 0.85, phase: 'deload' },
]

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function parseDate(value) {
  if (!value) return null
  if (value instanceof Date) return startOfDay(value)
  // Anchor bare YYYY-MM-DD to local midnight, not UTC, so week boundaries don't
  // shift by a day for anyone west of Greenwich.
  return startOfDay(new Date(`${value}T00:00:00`))
}

/** Whole days between two dates, DST-safe (compares calendar days, not ms). */
function daysBetween(from, to) {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.floor((b - a) / 86400000)
}

/**
 * Week indices (1-based from `blockStart`) in which at least one session was
 * completed, plus the earliest week the supplied data can speak to.
 *
 * The second half matters as much as the first. Callers pass a bounded window
 * of recent sessions, so weeks older than that window are *unknown*, not
 * untrained — counting them as skipped would extend the block by however long
 * the query limit happens to be.
 */
function trainedWeekIndices(sessions, blockStart) {
  const start = parseDate(blockStart)
  const weeks = new Set()
  let earliest = null
  if (!start || !Array.isArray(sessions)) return { weeks, earliest }

  for (const session of sessions) {
    if (!session?.date || session.completed === false) continue
    const day = parseDate(String(session.date).slice(0, 10))
    if (!day) continue
    const index = Math.floor(daysBetween(start, day) / 7) + 1
    // Sessions from before the block began belong to whatever came before it.
    if (index < 1) continue
    weeks.add(index)
    if (earliest === null || index < earliest) earliest = index
  }
  return { weeks, earliest }
}

/** 1-indexed block week containing `date`. Returns <1 before the block starts. */
export function getBlockWeek(blockStart, date = new Date()) {
  const start = parseDate(blockStart)
  if (!start) return 1
  return Math.floor(daysBetween(start, startOfDay(date)) / 7) + 1
}

/** Total planned weeks in the block. */
export function getTotalBlockWeeks(blockStart, blockEnd) {
  const start = parseDate(blockStart)
  const end = parseDate(blockEnd)
  if (!start || !end) return 0
  return Math.max(1, Math.ceil((daysBetween(start, end) + 1) / 7))
}

/**
 * Full status for the week containing `date`.
 *
 * @returns {{
 *   blockWeek: number, totalWeeks: number, weeksRemaining: number,
 *   mesocycle: number, weekInMesocycle: number, phase: 'accumulation'|'deload',
 *   rirTarget: number, volumeMultiplier: number, loadMultiplier: number,
 *   label: string, isBeforeStart: boolean, isComplete: boolean,
 *   weekStart: Date, weekEnd: Date
 * }}
 */
export function getBlockStatus(blockStart, blockEnd, date = new Date(), { sessions } = {}) {
  const start = parseDate(blockStart)
  const totalWeeks = getTotalBlockWeeks(blockStart, blockEnd)
  const rawWeek = getBlockWeek(blockStart, date)

  const isBeforeStart = rawWeek < 1
  const calendarWeek = Math.max(rawWeek, 1)

  // A week in which nothing was trained did not advance the block.
  //
  // The prescription ramps RIR 3 → 2 → 2 → 1 and volume +0/+0/+15%/+30% across
  // a mesocycle, then deloads. That ramp is a fatigue argument, and fatigue
  // does not accumulate on a week off. Left on the calendar, a fortnight away
  // came back to "week 4, RIR 1, +30% sets" — a peak week prescribed on top of
  // a layoff, which is the most reliable way to get hurt in a block.
  //
  // The current week always counts: it is in progress, not skipped.
  let skippedWeeks = 0
  // Consecutive trained weeks up to and including now. The current week counts:
  // it is in progress. Unbounded when no session data was supplied.
  let weeksSinceGap = Infinity
  if (Array.isArray(sessions)) {
    const { weeks: trained, earliest } = trainedWeekIndices(sessions, blockStart)
    // Only weeks the supplied data can actually speak to.
    const from = earliest ?? calendarWeek
    for (let w = from; w < calendarWeek; w++) if (!trained.has(w)) skippedWeeks++

    weeksSinceGap = 1
    for (let w = calendarWeek - 1; w >= from && trained.has(w); w--) weeksSinceGap++
  }

  const progressedWeek = Math.max(1, calendarWeek - skippedWeeks)
  const isComplete = totalWeeks > 0 && progressedWeek > totalWeeks

  // Clamp so the prescription stays sane outside the block window.
  const blockWeek = Math.min(progressedWeek, totalWeeks || progressedWeek)

  // Where in the mesocycle the block *is*, and where it may safely resume.
  //
  // Not advancing through a missed week is only half the fix. Resuming at the
  // position the block had reached is the other half of the problem: three
  // weeks trained, two weeks off, and the block week is 4 — which is RIR 1 at
  // +30% sets, the hardest week of the mesocycle, prescribed on the first day
  // back. The calendar version got this right only by luck, when the layoff
  // happened to straddle a mesocycle boundary.
  //
  // So the ramp restarts after a gap and climbs back to meet the nominal
  // position: first week back is week 1 of the ramp, the next is week 2, and
  // once `weeksSinceGap` catches up the two agree again and this does nothing.
  // A clean run of weeks never touches it, because `weeksSinceGap` is Infinity
  // when no session data was supplied and larger than `idx` when none was
  // missed.
  const nominalIdx = (blockWeek - 1) % MESOCYCLE_WEEKS
  const idx = Math.min(nominalIdx, weeksSinceGap - 1)
  const prescription = WEEK_PRESCRIPTION[idx]
  const mesocycle = Math.floor((blockWeek - 1) / MESOCYCLE_WEEKS) + 1
  const weekInMesocycle = idx + 1
  const resumedAfterGap = idx < nominalIdx

  // Calendar, not block: this is the week `date` actually falls in, and once
  // the two diverge the block week no longer names a range of dates.
  const weekStart = start ? new Date(start) : startOfDay(date)
  if (start) weekStart.setDate(weekStart.getDate() + (calendarWeek - 1) * 7)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  const label =
    prescription.phase === 'deload'
      ? `Deload — Week ${blockWeek} of ${totalWeeks}`
      : `Strength Block — Week ${blockWeek} of ${totalWeeks}`

  return {
    blockWeek,
    // The week the calendar is on, which is what tissue healing runs on —
    // a proximal hamstring does not care how many sessions were logged. Every
    // injury guardrail reads this, never `blockWeek`.
    calendarWeek,
    skippedWeeks,
    // True while the ramp is climbing back after a layoff, so the UI can say
    // why this week is easier than the block week implies.
    resumedAfterGap,
    totalWeeks,
    weeksRemaining: Math.max(0, totalWeeks - blockWeek),
    mesocycle,
    weekInMesocycle,
    ...prescription,
    label,
    isBeforeStart,
    isComplete,
    weekStart,
    weekEnd,
  }
}

/** Percentage of the block completed, for progress bars. */
export function getBlockProgress(blockStart, blockEnd, date = new Date(), opts) {
  const { blockWeek, totalWeeks } = getBlockStatus(blockStart, blockEnd, date, opts)
  if (!totalWeeks) return 0
  return Math.min(100, Math.max(0, Math.round((blockWeek / totalWeeks) * 100)))
}

/** RIR guidance string for display. */
export function rirGuidance(rirTarget) {
  if (rirTarget >= 4) return 'Deload — leave 4+ reps in reserve. Recovery is the work.'
  if (rirTarget >= 3) return 'Leave 3 reps in reserve. Groove the movement, build volume.'
  if (rirTarget === 2) return 'Leave 2 reps in reserve. Hard sets, clean technique.'
  if (rirTarget === 1) return 'Leave 1 rep in reserve. This is the peak week — earn it.'
  return 'Take the last set to technical failure.'
}

/**
 * Which day of the split falls on `date`, given the athlete's training days.
 *
 * @param {number[]} trainingDayIndices weekday numbers, 0=Sun
 * @returns {number|null} 0-based index into the split, or null on a rest day
 */
export function getSplitIndexForDate(date, trainingDayIndices = [1, 2, 4, 5]) {
  const idx = [...trainingDayIndices].sort((a, b) => a - b).indexOf(date.getDay())
  return idx === -1 ? null : idx
}

/** Next (or current) training day, searching forward up to a week. */
export function getNextTrainingDay(trainingDayIndices = [1, 2, 4, 5], fromDate = new Date()) {
  const sorted = [...trainingDayIndices].sort((a, b) => a - b)
  for (let i = 0; i < 7; i++) {
    const check = new Date(fromDate)
    check.setDate(check.getDate() + i)
    const idx = sorted.indexOf(check.getDay())
    if (idx !== -1) {
      return { date: check, splitIndex: idx, isToday: i === 0 }
    }
  }
  return null
}

/** Every training date in the week containing `date`. */
export function trainingDaysInWeek(trainingDayIndices = [1, 2, 4, 5], date = new Date()) {
  const sorted = [...trainingDayIndices].sort((a, b) => a - b)
  const monday = startOfDay(date)
  const day = monday.getDay()
  monday.setDate(monday.getDate() - day + (day === 0 ? -6 : 1))

  return sorted.map((weekday, splitIndex) => {
    const d = new Date(monday)
    // Monday is index 0 of the week; Sunday (0) sits at the end.
    d.setDate(d.getDate() + ((weekday + 6) % 7))
    return { date: d, splitIndex, weekday }
  })
}
