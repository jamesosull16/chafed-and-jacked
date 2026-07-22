import { describe, it, expect } from 'vitest'
import {
  countSets,
  chainRatio,
  assessVolume,
  leftRightBalance,
  pushPullBalance,
  laggingMuscles,
  landmarksFor,
  CHAIN_RATIO_TARGET,
} from '../chainBalance'

const NOW = new Date('2026-07-24T12:00:00')

const set = (overrides = {}) => ({ weight: 100, reps: 10, rir: 2, completed: true, ...overrides })

function session(exercises, daysAgo = 1) {
  const d = new Date(NOW)
  d.setDate(d.getDate() - daysAgo)
  return {
    date: d.toISOString(),
    exercises: exercises.map(([id, count, setOverrides = {}]) => ({
      id,
      sets: Array.from({ length: count }, () => set(setOverrides)),
    })),
  }
}

describe('countSets', () => {
  it('counts primary muscles fully and secondaries at half', () => {
    // barbellHipThrust: primary glutes, secondary hamstrings
    const { perMuscle } = countSets([session([['barbellHipThrust', 4]])], { now: NOW })
    expect(perMuscle.glutes).toBe(4)
    expect(perMuscle.hamstrings).toBe(2)
  })

  it('ignores sets that were not completed', () => {
    const s = session([['barbellHipThrust', 3]])
    s.exercises[0].sets[0].completed = false
    expect(countSets([s], { now: NOW }).perMuscle.glutes).toBe(2)
  })

  it('excludes warm-up sets taken far from failure', () => {
    const s = session([['barbellHipThrust', 3]])
    s.exercises[0].sets[0].rir = 8
    expect(countSets([s], { now: NOW }).perMuscle.glutes).toBe(2)
  })

  it('counts sets with no RIR recorded — absence is not evidence of a warm-up', () => {
    const s = session([['barbellHipThrust', 3, { rir: undefined }]])
    expect(countSets([s], { now: NOW }).perMuscle.glutes).toBe(3)
  })

  it('honours the lookback window', () => {
    const sessions = [session([['barbellHipThrust', 3]], 2), session([['barbellHipThrust', 3]], 20)]
    expect(countSets(sessions, { weeks: 1, now: NOW }).perMuscle.glutes).toBe(3)
    expect(countSets(sessions, { weeks: 4, now: NOW }).perMuscle.glutes).toBe(6)
  })

  it('ignores unknown exercise ids rather than throwing', () => {
    expect(countSets([session([['notARealExercise', 3]])], { now: NOW }).totalSets).toBe(0)
  })
})

describe('chainRatio', () => {
  it('reports on-target when posterior leads by the target margin', () => {
    const s = session([
      ['barbellHipThrust', 6], // posterior
      ['legPress', 4], // anterior
    ])
    const r = chainRatio([s], { now: NOW })
    expect(r.ratio).toBe(1.5)
    expect(r.ratio).toBeGreaterThanOrEqual(CHAIN_RATIO_TARGET)
    expect(r.status).toBe('onTarget')
  })

  it('flags an imbalance when anterior outpaces posterior', () => {
    const s = session([
      ['barbellHipThrust', 3],
      ['legPress', 6],
    ])
    const r = chainRatio([s], { now: NOW })
    expect(r.status).toBe('imbalanced')
    expect(r.message).toMatch(/glutes, hamstrings and back/i)
  })

  it('calls out the gap between parity and target', () => {
    const s = session([
      ['barbellHipThrust', 5],
      ['legPress', 5],
    ])
    expect(chainRatio([s], { now: NOW }).status).toBe('acceptable')
  })

  it('excludes neutral-chain work from the ratio', () => {
    const withCurls = session([
      ['barbellHipThrust', 6],
      ['legPress', 4],
      ['barbellCurl', 10], // neutral
    ])
    expect(chainRatio([withCurls], { now: NOW }).ratio).toBe(1.5)
  })

  it('reports noData rather than dividing by zero', () => {
    expect(chainRatio([], { now: NOW }).status).toBe('noData')
  })
})

describe('assessVolume', () => {
  it('marks a muscle under its MEV', () => {
    const r = assessVolume([session([['barbellHipThrust', 2]])], { now: NOW })
    expect(r.find((m) => m.muscle === 'glutes').status).toBe('under')
  })

  it('marks a muscle inside its MAV band as optimal', () => {
    const r = assessVolume([session([['barbellHipThrust', 18]])], { now: NOW })
    expect(r.find((m) => m.muscle === 'glutes').status).toBe('optimal')
  })

  it('flags volume past MRV as excessive', () => {
    const r = assessVolume([session([['barbellHipThrust', 30]])], { now: NOW })
    expect(r.find((m) => m.muscle === 'glutes').status).toBe('excessive')
  })

  it('sorts priority muscles first', () => {
    const r = assessVolume([], { now: NOW })
    expect(r[0].priority).toBe(1)
  })

  it('caps the hamstring target while the strain is being managed', () => {
    const capped = landmarksFor('hamstrings', {
      injuryFlags: ['highHamstring'],
      hamstringStage: 1,
    })
    expect(capped.capped).toBe(true)
    expect(capped.mav[1]).toBeLessThan(12)

    const uncapped = landmarksFor('hamstrings', { injuryFlags: [] })
    expect(uncapped.capped).toBeUndefined()
  })

  it('does not scream under-trained at an athlete respecting the injury cap', () => {
    const sessions = [session([['lyingLegCurl', 5]])]
    const capped = assessVolume(sessions, {
      now: NOW,
      injuryFlags: ['highHamstring'],
      hamstringStage: 1,
    })
    expect(capped.find((m) => m.muscle === 'hamstrings').status).not.toBe('under')
  })
})

describe('leftRightBalance', () => {
  it('detects an asymmetry beyond the threshold', () => {
    const s = {
      date: NOW.toISOString(),
      exercises: [
        {
          id: 'singleArmRow',
          sets: [
            set({ side: 'left', weight: 60, reps: 10 }),
            set({ side: 'right', weight: 80, reps: 10 }),
          ],
        },
      ],
    }
    const [row] = leftRightBalance([s], { now: NOW })
    expect(row.imbalanced).toBe(true)
    expect(row.strongerSide).toBe('right')
    expect(row.deltaPct).toBeGreaterThan(10)
  })

  it('treats matched sides as balanced', () => {
    const s = {
      date: NOW.toISOString(),
      exercises: [
        {
          id: 'singleArmRow',
          sets: [set({ side: 'left', weight: 70, reps: 10 }), set({ side: 'right', weight: 70, reps: 10 })],
        },
      ],
    }
    expect(leftRightBalance([s], { now: NOW })[0].imbalanced).toBe(false)
  })

  it('ignores unilateral work logged without sides rather than guessing', () => {
    expect(leftRightBalance([session([['singleArmRow', 4]])], { now: NOW })).toEqual([])
  })

  it('ignores bilateral exercises entirely', () => {
    const s = {
      date: NOW.toISOString(),
      exercises: [{ id: 'barbellBenchPress', sets: [set({ side: 'left' })] }],
    }
    expect(leftRightBalance([s], { now: NOW })).toEqual([])
  })
})

describe('pushPullBalance', () => {
  it('reports balance around 1:1', () => {
    const s = session([
      ['barbellBenchPress', 4],
      ['latPulldown', 4],
    ])
    const r = pushPullBalance([s], { now: NOW })
    expect(r.status).toBe('balanced')
  })

  it('flags a pressing bias', () => {
    const s = session([
      ['barbellBenchPress', 8],
      ['latPulldown', 2],
    ])
    const r = pushPullBalance([s], { now: NOW })
    expect(r.status).toBe('pushHeavy')
    expect(r.message).toMatch(/rows or pulldowns/i)
  })

  it('does not count leg work as push or pull', () => {
    const r = pushPullBalance([session([['legPress', 6]])], { now: NOW })
    expect(r.status).toBe('noData')
  })
})

describe('laggingMuscles', () => {
  it('surfaces the priority muscles that are behind', () => {
    const lagging = laggingMuscles([session([['barbellHipThrust', 2]])], { now: NOW })
    expect(lagging.length).toBeGreaterThan(0)
    expect(lagging.length).toBeLessThanOrEqual(4)
    expect(lagging[0].priority).toBe(1)
  })

  it('returns nothing when every muscle is in range', () => {
    const s = session([
      ['barbellHipThrust', 18],
      ['lyingLegCurl', 14],
      ['seatedCalfRaise', 14],
      ['legPress', 12],
      ['latPulldown', 16],
      ['barbellBenchPress', 12],
      ['lateralRaise', 14],
      ['rearDeltFly', 10],
      ['barbellCurl', 10],
      ['triceptPushdown', 10],
      ['farmersCarry', 6],
      ['cableCrunch', 8],
      ['bulgarianSplitSquat', 6],
    ])
    expect(laggingMuscles([s], { now: NOW })).toEqual([])
  })
})
