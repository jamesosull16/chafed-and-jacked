/**
 * PERIODIZATION ENGINE — Chafed & Jacked
 *
 * Manages the mesocycle calendar from program start → race day.
 * Structure: 4-week build + 1-week deload, repeating.
 * Final 3 weeks before race = progressive taper.
 *
 * All date-dependent functions accept raceDate/programStart as parameters
 * so the engine works with any user-configured race.
 */

// Memoization cache for built schedules (keyed by "raceDate-programStart")
const scheduleCache = new Map()

/**
 * Get (or build and cache) the mesocycle schedule for a given race.
 */
export function getSchedule(raceDate, programStart) {
  if (!raceDate || !programStart) return []
  const key = `${raceDate.getTime()}-${programStart.getTime()}`
  if (scheduleCache.has(key)) return scheduleCache.get(key)
  const schedule = buildSchedule(raceDate, programStart)
  scheduleCache.set(key, schedule)
  return schedule
}

function buildSchedule(raceDate, programStart) {
  const weeks = []
  let current = new Date(programStart)
  let weekNum = 1

  // Taper starts 3 weeks before race
  const taperStart = new Date(raceDate)
  taperStart.setDate(taperStart.getDate() - 21)

  // Race week starts Monday before race
  const raceWeekStart = new Date(raceDate)
  raceWeekStart.setDate(raceWeekStart.getDate() - (raceDate.getDay() === 0 ? 6 : raceDate.getDay() - 1))

  while (current < raceWeekStart) {
    const weekEnd = new Date(current)
    weekEnd.setDate(weekEnd.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    let type, mesocycle, weekInMeso

    if (current >= taperStart) {
      const taperWeekNum = Math.floor((current - taperStart) / (7 * 86400000)) + 1
      type = 'taper'
      mesocycle = null
      weekInMeso = taperWeekNum
    } else {
      const weeksFromStart = Math.floor((current - programStart) / (7 * 86400000))
      mesocycle = Math.floor(weeksFromStart / 5) + 1
      weekInMeso = (weeksFromStart % 5) + 1
      type = weekInMeso === 5 ? 'deload' : 'build'
    }

    weeks.push({
      weekNumber: weekNum,
      startDate: new Date(current),
      endDate: weekEnd,
      type,
      mesocycle,
      weekInMesocycle: weekInMeso,
    })

    current.setDate(current.getDate() + 7)
    weekNum++
  }

  // Race week
  const raceWeekEnd = new Date(raceDate)
  raceWeekEnd.setHours(23, 59, 59, 999)
  weeks.push({
    weekNumber: weekNum,
    startDate: new Date(raceWeekStart),
    endDate: raceWeekEnd,
    type: 'race',
    mesocycle: null,
    weekInMesocycle: null,
  })

  return weeks
}

/**
 * Get the current week's schedule info.
 * If no race is configured, returns a perpetual build/deload cycle.
 */
export function getCurrentWeek(raceDate, programStart, date = new Date()) {
  if (!raceDate || !programStart) {
    return getPerpetualWeek(date)
  }

  const schedule = getSchedule(raceDate, programStart)

  for (const week of schedule) {
    if (date >= week.startDate && date <= week.endDate) {
      return week
    }
  }

  // Before program start
  if (date < programStart) {
    return { ...schedule[0], isFuture: true }
  }
  // After race
  return { ...schedule[schedule.length - 1], isPast: true }
}

/**
 * Perpetual build/deload cycle when no race is configured.
 * 4-week build + 1-week deload, repeating from a fixed epoch.
 */
function getPerpetualWeek(date) {
  // Use a fixed Monday as epoch for consistent cycling
  const epoch = new Date('2026-01-05') // A Monday
  const msPerWeek = 7 * 86400000
  const weeksFromEpoch = Math.floor((date - epoch) / msPerWeek)
  const weekInCycle = (((weeksFromEpoch % 5) + 5) % 5) + 1
  const mesocycle = Math.floor(weeksFromEpoch / 5) + 1

  const weekStart = new Date(epoch)
  weekStart.setDate(weekStart.getDate() + weeksFromEpoch * 7)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  return {
    weekNumber: weeksFromEpoch + 1,
    startDate: weekStart,
    endDate: weekEnd,
    type: weekInCycle === 5 ? 'deload' : 'build',
    mesocycle,
    weekInMesocycle: weekInCycle,
  }
}

/** Get deload modifications for sets and load */
export function getDeloadModifiers() {
  return { setReduction: 1, loadMultiplier: 0.875 }
}

/**
 * Get taper modifications based on taper week number (1, 2, or 3).
 */
export function getTaperModifiers(taperWeek) {
  const modifiers = {
    1: { setReduction: 1, loadMultiplier: 0.90, label: 'Taper Week 1 — Reduce load 10%' },
    2: { setReduction: 1, loadMultiplier: 0.85, label: 'Taper Week 2 — Movement focus, -15% load' },
    3: { setReduction: 2, loadMultiplier: 0.75, label: 'Taper Week 3 — Activation only, -25% load' },
  }
  return modifiers[taperWeek] || modifiers[1]
}

/**
 * Calculate the effective sets and load multiplier for the current week.
 */
export function getWeekModifiers(weekInfo) {
  if (!weekInfo) return { setReduction: 0, loadMultiplier: 1.0, label: 'Build Phase — Full Load' }

  switch (weekInfo.type) {
    case 'deload':
      return { ...getDeloadModifiers(), label: 'DELOAD WEEK — Recovery is training' }
    case 'taper':
      return getTaperModifiers(weekInfo.weekInMesocycle)
    case 'race':
      return { setReduction: 99, loadMultiplier: 0, label: 'RACE WEEK — Rest & light mobility only' }
    default:
      return {
        setReduction: 0,
        loadMultiplier: 1.0,
        label: weekInfo.mesocycle
          ? `Build Phase — Mesocycle ${weekInfo.mesocycle}, Week ${weekInfo.weekInMesocycle}`
          : 'Build Phase — Full Load',
      }
  }
}

/** Days until race from a given date */
export function daysUntilRace(raceDate, date = new Date()) {
  if (!raceDate) return 0
  const diff = raceDate - date
  return Math.max(0, Math.ceil(diff / 86400000))
}

/** Get total weeks in program */
export function getTotalWeeks(raceDate, programStart) {
  if (!raceDate || !programStart) return 0
  return getSchedule(raceDate, programStart).length
}

/**
 * Calculate program start date from a race date.
 * Snaps to Monday approximately 21 weeks before race.
 */
export function calculateProgramStart(raceDate) {
  const start = new Date(raceDate)
  start.setDate(start.getDate() - 21 * 7)
  // Snap to Monday
  const day = start.getDay()
  if (day === 0) start.setDate(start.getDate() + 1)
  else if (day !== 1) start.setDate(start.getDate() + (8 - day))
  start.setHours(0, 0, 0, 0)
  return start
}

/**
 * Find the active race from a user's race array.
 * Prefers nearest future A-race; falls back to nearest future race.
 */
export function getActiveRace(races) {
  if (!races || races.length === 0) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const futureRaces = races
    .filter((r) => new Date(r.date + 'T00:00:00') >= now)
    .sort((a, b) => new Date(a.date + 'T00:00:00') - new Date(b.date + 'T00:00:00'))

  const aRace = futureRaces.find((r) => r.isARace)
  return aRace || futureRaces[0] || null
}

/**
 * Determine which day type (A/B/C) should be trained on a given date.
 */
export function getDayTypeForDate(date, trainingDays = 'mon-wed-fri') {
  const { days } = trainingDays === 'tue-thu-sat'
    ? { days: [2, 4, 6] }
    : { days: [1, 3, 5] }

  const dayOfWeek = date.getDay()
  const dayIndex = days.indexOf(dayOfWeek)

  if (dayIndex === -1) return null
  return ['A', 'B', 'C'][dayIndex]
}

/**
 * Get the next upcoming training session date and type.
 */
export function getNextSession(trainingDays = 'mon-wed-fri', fromDate = new Date()) {
  const { days } = trainingDays === 'tue-thu-sat'
    ? { days: [2, 4, 6] }
    : { days: [1, 3, 5] }

  const current = new Date(fromDate)
  for (let i = 0; i < 7; i++) {
    const check = new Date(current)
    check.setDate(check.getDate() + i)
    const dayOfWeek = check.getDay()
    const dayIndex = days.indexOf(dayOfWeek)
    if (dayIndex !== -1) {
      return {
        date: check,
        dayType: ['A', 'B', 'C'][dayIndex],
        isToday: i === 0,
      }
    }
  }
  return null
}
