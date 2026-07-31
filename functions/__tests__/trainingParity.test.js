/**
 * The Cloud Function re-derives race periodisation, lifting load scaling and
 * run calories because it cannot import the client's engines. These tests
 * compare the two directly: if the client's model changes and the server's
 * copy doesn't, the build fails here rather than the coach quietly telling the
 * athlete he's in a build week while the dashboard shows a taper.
 *
 * Same argument and same shape as guardrailParity.test.js.
 */
import { describe, it, expect } from 'vitest'

import {
  buildSchedule as serverBuildSchedule,
  getCurrentWeek as serverCurrentWeek,
  getPerpetualWeek as serverPerpetualWeek,
  calculateProgramStart as serverProgramStart,
  daysUntilRace as serverDaysUntilRace,
  getActiveRace as serverActiveRace,
  getScalingTier as serverScalingTier,
  SCALING_TIERS as SERVER_TIERS,
  calculateRunKcal as serverRunKcal,
  normaliseMileageDoc,
  summariseSession,
  summariseRecentTraining,
} from '../src/coach/training.js'

import {
  getSchedule as clientGetSchedule,
  getCurrentWeek as clientCurrentWeek,
  getPerpetualWeek as clientPerpetualWeek,
  calculateProgramStart as clientProgramStart,
  daysUntilRace as clientDaysUntilRace,
  getActiveRace as clientActiveRace,
} from '../../src/lib/periodization.js'
import {
  getScalingTier as clientScalingTier,
  SCALING_TIERS as CLIENT_TIERS,
} from '../../src/lib/loadScaling.js'
import { calculateRunKcal as clientRunKcal } from '../../src/lib/macroCalculator.js'

const RACE = new Date('2026-11-14T00:00:00')
const START = clientProgramStart(RACE)

describe('program start parity', () => {
  it('agrees for races on every weekday', () => {
    for (let offset = 0; offset < 14; offset++) {
      const race = new Date('2026-11-14T00:00:00')
      race.setDate(race.getDate() + offset)
      expect(serverProgramStart(race).toISOString()).toBe(clientProgramStart(race).toISOString())
    }
  })
})

describe('schedule parity', () => {
  it('builds an identical week-by-week schedule', () => {
    const server = serverBuildSchedule(RACE, serverProgramStart(RACE))
    const client = clientGetSchedule(RACE, clientProgramStart(RACE))

    expect(server).toHaveLength(client.length)
    for (let i = 0; i < client.length; i++) {
      expect(
        {
          ...server[i],
          startDate: server[i].startDate.toISOString(),
          endDate: server[i].endDate.toISOString(),
        },
        `week ${i + 1}`
      ).toEqual({
        ...client[i],
        startDate: client[i].startDate.toISOString(),
        endDate: client[i].endDate.toISOString(),
      })
    }
  })

  it('agrees on the phase at every point across the whole program', () => {
    for (let offset = -14; offset < 170; offset += 1) {
      const d = new Date(START)
      d.setDate(d.getDate() + offset)
      const server = serverCurrentWeek(RACE, serverProgramStart(RACE), d)
      const client = clientCurrentWeek(RACE, clientProgramStart(RACE), d)
      expect(server.type, `day ${offset}`).toBe(client.type)
      expect(server.weekNumber, `day ${offset}`).toBe(client.weekNumber)
      expect(server.mesocycle ?? null, `day ${offset}`).toBe(client.mesocycle ?? null)
    }
  })

  it('crosses into taper and race week on the same days', () => {
    const transitions = (fn, programStart) => {
      const seen = []
      let last = null
      for (let offset = 0; offset < 170; offset++) {
        const d = new Date(START)
        d.setDate(d.getDate() + offset)
        const type = fn(RACE, programStart, d).type
        if (type !== last) {
          seen.push(`${offset}:${type}`)
          last = type
        }
      }
      return seen
    }
    expect(transitions(serverCurrentWeek, serverProgramStart(RACE))).toEqual(
      transitions(clientCurrentWeek, clientProgramStart(RACE))
    )
  })

  it('agrees on the perpetual cycle when no race is configured', () => {
    for (let offset = 0; offset < 120; offset += 3) {
      const d = new Date('2026-02-02T00:00:00')
      d.setDate(d.getDate() + offset)
      const server = serverPerpetualWeek(d)
      const client = clientPerpetualWeek(d)
      expect(server.type, `day ${offset}`).toBe(client.type)
      expect(server.weekInMesocycle, `day ${offset}`).toBe(client.weekInMesocycle)
      expect(server.mesocycle, `day ${offset}`).toBe(client.mesocycle)
    }
    // …and the server falls through to it exactly as the client does.
    const d = new Date('2026-02-02T00:00:00')
    expect(serverCurrentWeek(null, null, d).type).toBe(clientCurrentWeek(null, null, d).type)
  })
})

describe('days-until-race parity', () => {
  it('agrees across the run-in', () => {
    for (let offset = 0; offset < 200; offset += 7) {
      const d = new Date(START)
      d.setDate(d.getDate() + offset)
      expect(serverDaysUntilRace(RACE, d)).toBe(clientDaysUntilRace(RACE, d))
    }
  })
})

describe('active race parity', () => {
  // getActiveRace reads "now" internally on the client, so parity is only
  // testable against the real current date — hence relative offsets.
  const iso = (days) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d.toISOString().slice(0, 10)
  }

  const CASES = [
    [],
    [{ name: 'past', date: iso(-30) }],
    [{ name: 'soon', date: iso(20) }, { name: 'later', date: iso(90) }],
    [{ name: 'soon', date: iso(20) }, { name: 'A', date: iso(90), isARace: true }],
    [{ name: 'pastA', date: iso(-5), isARace: true }, { name: 'future', date: iso(40) }],
  ]

  it('picks the same race in every ordering case', () => {
    for (const races of CASES) {
      expect(serverActiveRace(races)?.name ?? null).toBe(clientActiveRace(races)?.name ?? null)
    }
  })
})

describe('scaling tier parity', () => {
  it('carries the same boundaries and multipliers', () => {
    expect(SERVER_TIERS.map((t) => t.id)).toEqual(CLIENT_TIERS.map((t) => t.id))
    for (const server of SERVER_TIERS) {
      const client = CLIENT_TIERS.find((t) => t.id === server.id)
      expect(server.minMiles).toBe(client.minMiles)
      expect(server.maxMiles).toBe(client.maxMiles)
      expect(server.loadMultiplier).toBe(client.loadMultiplier)
      expect(server.dropSet).toBe(client.dropSet)
      expect(server.label).toBe(client.label)
    }
  })

  it('resolves the same tier at every mileage including the boundaries', () => {
    const points = [null, -1, 0, 39.9, 40, 54.9, 55, 69.9, 70, 120]
    for (let m = 0; m <= 100; m += 0.5) points.push(m)
    for (const miles of points) {
      expect(serverScalingTier(miles).id, `at ${miles} mi`).toBe(clientScalingTier(miles).id)
    }
  })
})

describe('run calorie parity', () => {
  const PROFILES = [
    { weightKg: 78, weightLbs: 172, age: 38, sex: 'male' },
    { weightKg: 78, weightLbs: 172, age: 38, sex: 'male', vo2max: 58 },
    { weightKg: 62, weightLbs: 137, age: 31, sex: 'female' },
    { weightKg: 62, weightLbs: 137, age: 31, sex: 'female', vo2max: 51 },
  ]

  const RUNS = [
    { miles: 6.2 },
    { miles: 6.2, duration_minutes: 52 },
    { miles: 6.2, duration_minutes: 52, avg_hr_bpm: 148 },
    { miles: 20, duration_minutes: 210, avg_hr_bpm: 132 },
    { duration_minutes: 45, avg_hr_bpm: 90 }, // low HR — the negative-kcal edge case
    {},
  ]

  it('agrees on kcal and on which method was used', () => {
    for (const profile of PROFILES) {
      for (const run of RUNS) {
        const server = serverRunKcal(run, profile)
        const client = clientRunKcal(run, profile)
        const label = `${JSON.stringify(run)} / ${profile.sex}${profile.vo2max ? '+vo2' : ''}`
        expect(server.source, label).toBe(client.source)
        expect(server.kcal, label).toBeCloseTo(client.kcal, 9)
      }
    }
  })
})

/**
 * useWorkout.js normalises dailyMileage inline inside a React hook, so there is
 * nothing importable to compare against. These fixtures pin the three shapes it
 * handles (src/hooks/useWorkout.js — the loadWeekData normaliser and addRun).
 */
describe('mileage document normalisation', () => {
  it('sums a runs array into the miles total', () => {
    const doc = normaliseMileageDoc({
      date: '2026-07-31',
      runs: [{ miles: 4 }, { miles: 2.2 }],
    })
    expect(doc.miles).toBeCloseTo(6.2)
    expect(doc.runs).toHaveLength(2)
  })

  it('expands a legacy bare-miles doc into a single run', () => {
    const doc = normaliseMileageDoc({ date: '2026-07-31', miles: 5, enteredAt: '2026-07-31T08:00:00Z' })
    expect(doc.runs).toEqual([{ miles: 5, enteredAt: '2026-07-31T08:00:00Z' }])
    expect(doc.miles).toBe(5)
  })

  it('prefers the runs array when a doc carries both', () => {
    // addRun writes both, and the denormalised total is the one that can go stale.
    const doc = normaliseMileageDoc({ date: '2026-07-31', miles: 99, runs: [{ miles: 3 }, { miles: 4 }] })
    expect(doc.miles).toBe(7)
  })

  it('handles an empty or absent doc without throwing', () => {
    expect(normaliseMileageDoc(null)).toBeNull()
    expect(normaliseMileageDoc({ date: '2026-07-31' }).runs).toEqual([])
    expect(normaliseMileageDoc({ date: '2026-07-31' }).miles).toBe(0)
  })
})

describe('summariseSession', () => {
  const NOW = new Date('2026-07-31T18:00:00Z')
  const SESSION = {
    id: 's1',
    date: '2026-07-31T15:00:00Z',
    dayType: 'Lower — Posterior',
    duration: 62,
    totalVolume: 12400,
    exercises: [
      {
        id: 'barbellHipThrust',
        sets: [
          { weight: 80, reps: 10, rir: 3 },
          { weight: 100, reps: 8, rir: 2 },
          { weight: 90, reps: 9, rir: 2 },
        ],
      },
      { id: 'pullUp', sets: [{ weight: 0, reps: 8, rir: 1, isBodyweight: true }] },
    ],
  }

  it('picks the heaviest working set as the top set', () => {
    const s = summariseSession(SESSION, NOW)
    expect(s.exercises[0].top).toEqual({ weight: 100, reps: 8, rir: 2, isBodyweight: false })
    expect(s.exercises[0].sets).toBe(3)
  })

  it('reports hours elapsed', () => {
    expect(summariseSession(SESSION, NOW).hoursSince).toBeCloseTo(3)
  })

  it('ignores sets with no reps rather than calling them the top set', () => {
    const s = summariseSession(
      { ...SESSION, exercises: [{ id: 'x', sets: [{ weight: 200, reps: 0 }, { weight: 50, reps: 5 }] }] },
      NOW
    )
    expect(s.exercises[0].top.weight).toBe(50)
  })

  it('returns null for no session at all', () => {
    expect(summariseSession(null, NOW)).toBeNull()
  })
})

describe('summariseRecentTraining', () => {
  const NOW = new Date('2026-07-31T12:00:00Z')
  const dayAgo = (n) => {
    const d = new Date(NOW.getTime() - n * 86400000)
    return d.toISOString().slice(0, 10)
  }

  it('splits the 7- and 14-day windows', () => {
    const t = summariseRecentTraining({
      sessions: [{ date: dayAgo(1), totalVolume: 10000 }, { date: dayAgo(9), totalVolume: 8000 }],
      mileageDocs: [
        { date: dayAgo(2), runs: [{ miles: 6 }] },
        { date: dayAgo(10), runs: [{ miles: 4 }] },
      ],
      now: NOW,
    })
    expect(t.sessions7).toBe(1)
    expect(t.sessions14).toBe(2)
    expect(t.miles7).toBe(6)
    expect(t.miles14).toBe(10)
    expect(t.volume7).toBe(10000)
  })

  it('calls a big jump ramping and a big drop a cut', () => {
    const build = (recent, prior) =>
      summariseRecentTraining({
        mileageDocs: [
          { date: dayAgo(2), runs: [{ miles: recent }] },
          { date: dayAgo(10), runs: [{ miles: prior }] },
        ],
        now: NOW,
      }).trend

    expect(build(30, 20)).toBe('ramping')
    expect(build(20, 30)).toBe('cut')
    expect(build(21, 20)).toBe('flat')
  })

  it('counts rest days from days with neither a run nor a session', () => {
    const t = summariseRecentTraining({
      sessions: [{ date: `${dayAgo(1)}T10:00:00Z` }],
      mileageDocs: [{ date: dayAgo(2), runs: [{ miles: 5 }] }],
      now: NOW,
    })
    expect(t.restDays7).toBe(5)
  })

  it('degrades to zeros with no data at all rather than throwing', () => {
    const t = summariseRecentTraining({ now: NOW })
    expect(t).toMatchObject({ sessions7: 0, miles7: 0, restDays7: 7, trend: 'flat', plannedMiles: null })
  })

  it('reports the longest single run, not the biggest day', () => {
    const t = summariseRecentTraining({
      mileageDocs: [{ date: dayAgo(1), runs: [{ miles: 5 }, { miles: 6 }] }],
      now: NOW,
    })
    expect(t.longestRun).toBe(6)
    expect(t.miles7).toBe(11)
  })
})
