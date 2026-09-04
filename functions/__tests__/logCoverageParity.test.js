/**
 * The Cloud Function re-derives food-log coverage because it cannot import the
 * client's copy. Same argument, and same shape, as energyParity.test.js: if one
 * side's classifier moves and the other doesn't, the build fails here rather
 * than the coach telling him his log is complete while the Fuel page says three
 * days are missing.
 */
import { describe, it, expect } from 'vitest'

import {
  classifyDay as serverClassify,
  assessLogCoverage as serverCoverage,
  recentDayIds,
  IMPLAUSIBLE_BMR_MULTIPLE as SERVER_MULTIPLE,
  MIN_WINDOW_DAYS as SERVER_WINDOW,
} from '../src/coach/logCoverage.js'

import {
  classifyDay as clientClassify,
  assessLogCoverage as clientCoverage,
  unloggedKcalPerDay,
  IMPLAUSIBLE_BMR_MULTIPLE as CLIENT_MULTIPLE,
  MIN_WINDOW_DAYS as CLIENT_WINDOW,
} from '../../src/lib/logCompleteness.js'

import { buildEnergyProfile, ageFromBirthday, athleteFrom } from '../src/coach/energy.js'

const BMR = 1743
const meal = (kcal) => ({ kcal })

const WEEK = [
  { dateId: '2026-08-24', log: { entries: [meal(1565)] } },
  { dateId: '2026-08-25', log: { entries: [meal(2332)] } },
  { dateId: '2026-08-26', log: { entries: [meal(2838)] } },
  { dateId: '2026-08-27', log: { entries: [meal(2552)] } },
  { dateId: '2026-08-28', log: { entries: [meal(1786)] } },
  { dateId: '2026-08-29', log: null },
  { dateId: '2026-08-30', log: { entries: [meal(1176)] } },
]

describe('coverage parity', () => {
  it('uses the same thresholds', () => {
    expect(SERVER_MULTIPLE).toBe(CLIENT_MULTIPLE)
    expect(SERVER_WINDOW).toBe(CLIENT_WINDOW)
  })

  it('classifies every day identically', () => {
    for (const day of WEEK) {
      expect(serverClassify({ ...day, bmr: BMR }), day.dateId).toEqual(
        clientClassify({ ...day, bmr: BMR })
      )
    }
  })

  it('agrees with no BMR to draw the implausible band with', () => {
    for (const day of WEEK) {
      expect(serverClassify(day).status, day.dateId).toBe(clientClassify(day).status)
    }
  })

  it('produces the same coverage summary numbers', () => {
    const server = serverCoverage(WEEK, { bmr: BMR })
    const client = clientCoverage(WEEK, { bmr: BMR })
    for (const key of [
      'total',
      'known',
      'missing',
      'implausible',
      'unknown',
      'coverage',
      'meanLoggedKcal',
      'concentratedOnWeekends',
      'weekendUnknown',
      'sufficient',
    ]) {
      expect(server[key], key).toEqual(client[key])
    }
  })

  it('prices the gap the same way the client guardrail does', () => {
    const server = serverCoverage(WEEK, { bmr: BMR })
    expect(server.gapKcalPerDay).toBe(unloggedKcalPerDay(clientCoverage(WEEK, { bmr: BMR })))
  })
})

describe('in-progress day parity', () => {
  it('both copies exclude today from the judgement', () => {
    const opts = { bmr: BMR, todayId: '2026-08-30' }
    const server = serverCoverage(WEEK, opts)
    const client = clientCoverage(WEEK, opts)
    expect(server.total).toBe(client.total)
    expect(server.total).toBe(6)
    expect(server.days.at(-1).status).toBe('inProgress')
    expect(client.days.at(-1).status).toBe('inProgress')
    expect(server.unknown).toBe(client.unknown)
  })
})

describe('recentDayIds', () => {
  it('returns the window ending on the given day, oldest first', () => {
    const ids = recentDayIds('2026-08-30', 7)
    expect(ids).toHaveLength(7)
    expect(ids[0]).toBe('2026-08-24')
    expect(ids[6]).toBe('2026-08-30')
  })

  it('crosses a month boundary without inventing a date', () => {
    expect(recentDayIds('2026-09-02', 4)).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ])
  })
})

describe('buildEnergyProfile', () => {
  // Regression: `athleteFrom` reads flat fields and the stored user document
  // nests them, so passing the raw document produced null on every turn and the
  // coach silently never had an expenditure figure at all.
  const STORED = {
    profile: { heightInches: 72, biologicalSex: 'male', birthday: '1984-10-16', vo2max: 62 },
    onboarding: { initialWeight: 175, initialBodyFat: 20 },
  }

  it('produces a shape athleteFrom can actually read', () => {
    const built = buildEnergyProfile(STORED, { weight: 180.2, bodyFatPct: 22.2 })
    const athlete = athleteFrom(built)
    expect(athlete).not.toBeNull()
    expect(athlete.weightLbs).toBe(180.2)
    expect(athlete.bodyFatPct).toBe(22.2)
    expect(athlete.heightCm).toBeCloseTo(72 * 2.54, 6)
  })

  it('refuses to read the raw document, which is the bug this replaced', () => {
    expect(athleteFrom(STORED)).toBeNull()
  })

  it('falls back to onboarding when no weigh-in exists yet', () => {
    const built = buildEnergyProfile(STORED, null)
    expect(built.weightLbs).toBe(175)
    expect(built.currentBodyFatPct).toBe(20)
  })

  it('returns null weight rather than zero when nothing is known', () => {
    expect(buildEnergyProfile({}, null).weightLbs).toBeNull()
    expect(athleteFrom(buildEnergyProfile({}, null))).toBeNull()
  })
})

describe('ageFromBirthday', () => {
  it('reads whole years', () => {
    const twoYearsAgo = new Date()
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 30)
    twoYearsAgo.setDate(twoYearsAgo.getDate() - 1)
    expect(ageFromBirthday(twoYearsAgo.toISOString().slice(0, 10))).toBe(30)
  })

  it('has not had this year\'s birthday yet', () => {
    const nearlyThirty = new Date()
    nearlyThirty.setFullYear(nearlyThirty.getFullYear() - 30)
    nearlyThirty.setDate(nearlyThirty.getDate() + 2)
    expect(ageFromBirthday(nearlyThirty.toISOString().slice(0, 10))).toBe(29)
  })

  it('returns null for anything unusable rather than a number', () => {
    expect(ageFromBirthday(null)).toBeNull()
    expect(ageFromBirthday('not a date')).toBeNull()
    expect(ageFromBirthday('1850-01-01')).toBeNull()
  })
})
