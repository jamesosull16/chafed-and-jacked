/**
 * PERIODIZATION ENGINE — Chafed & Jacked
 *
 * Manages the mesocycle calendar from program start → race day.
 * Structure: 4-week build + 1-week deload, repeating.
 * Final 3 weeks before race = progressive taper.
 *
 * Race: July 17, 2026
 * Program start: Feb 23, 2026 (first Monday after app creation)
 */

const RACE_DATE = new Date('2026-07-17')
const PROGRAM_START = new Date('2026-02-23') // First training Monday

/**
 * Full mesocycle calendar. Each entry = one week.
 * Type: 'build' | 'deload' | 'taper' | 'race'
 */
export const SCHEDULE = buildSchedule()

function buildSchedule() {
  const weeks = []
  let current = new Date(PROGRAM_START)
  let weekNum = 1

  // Taper starts 3 weeks before race (June 26, 2026)
  const taperStart = new Date(RACE_DATE)
  taperStart.setDate(taperStart.getDate() - 21)

  // Race week starts Monday before race
  const raceWeekStart = new Date(RACE_DATE)
  raceWeekStart.setDate(raceWeekStart.getDate() - (RACE_DATE.getDay() === 0 ? 6 : RACE_DATE.getDay() - 1))

  while (current < raceWeekStart) {
    const weekEnd = new Date(current)
    weekEnd.setDate(weekEnd.getDate() + 6)

    let type, mesocycle, weekInMeso

    if (current >= taperStart) {
      // Taper weeks
      const taperWeekNum = Math.floor((current - taperStart) / (7 * 86400000)) + 1
      type = 'taper'
      mesocycle = null
      weekInMeso = taperWeekNum
    } else {
      // Build/deload cycles (5-week mesocycles: 4 build + 1 deload)
      const weeksFromStart = Math.floor((current - PROGRAM_START) / (7 * 86400000))
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
  weeks.push({
    weekNumber: weekNum,
    startDate: new Date(raceWeekStart),
    endDate: new Date(RACE_DATE),
    type: 'race',
    mesocycle: null,
    weekInMesocycle: null,
  })

  return weeks
}

/** Get the current week's schedule info based on today's date */
export function getCurrentWeek(date = new Date()) {
  for (const week of SCHEDULE) {
    if (date >= week.startDate && date <= week.endDate) {
      return week
    }
  }
  // Before program start
  if (date < PROGRAM_START) {
    return { ...SCHEDULE[0], isFuture: true }
  }
  // After race
  return { ...SCHEDULE[SCHEDULE.length - 1], isPast: true }
}

/** Get deload modifications for sets and load */
export function getDeloadModifiers() {
  return { setReduction: 1, loadMultiplier: 0.875 } // Drop 1 set, reduce load ~12.5%
}

/**
 * Get taper modifications based on taper week number (1, 2, or 3).
 * Progressive reduction in both volume and intensity.
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
 * Accounts for build (full), deload, and taper phases.
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
        label: `Build Phase — Mesocycle ${weekInfo.mesocycle}, Week ${weekInfo.weekInMesocycle}`,
      }
  }
}

/** Days until race from a given date */
export function daysUntilRace(date = new Date()) {
  const diff = RACE_DATE - date
  return Math.max(0, Math.ceil(diff / 86400000))
}

/** Get the race date */
export function getRaceDate() {
  return new Date(RACE_DATE)
}

/** Get total weeks in program */
export function getTotalWeeks() {
  return SCHEDULE.length
}

/**
 * Determine which day type (A/B/C) should be trained on a given date,
 * based on the user's training schedule preference.
 */
export function getDayTypeForDate(date, trainingDays = 'mon-wed-fri') {
  const { days } = trainingDays === 'tue-thu-sat'
    ? { days: [2, 4, 6] }
    : { days: [1, 3, 5] }

  const dayOfWeek = date.getDay()
  const dayIndex = days.indexOf(dayOfWeek)

  if (dayIndex === -1) return null // Not a training day
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
