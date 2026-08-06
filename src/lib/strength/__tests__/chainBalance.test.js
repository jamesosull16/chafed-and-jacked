import { describe, it, expect } from 'vitest'
import {
  countSets,
  chainRatio,
  assessVolume,
  leftRightBalance,
  pushPullBalance,
  laggingMuscles,
  landmarksFor,
  sessionTonnage,
  CHAIN_RATIO_TARGET,
} from '../chainBalance'
import { STRENGTH_EXERCISES } from '../exercises'

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

  it('credits a per-side exercise once per pair, not once per row', () => {
    // A four-set single-leg hip thrust is logged eight times — left and right
    // for each set — but each leg received four. Counting the rows raw would
    // report double the volume actually trained and trip 'excessive' on a week
    // that was on target.
    const { perMuscle } = countSets([session([['singleLegHipThrust', 8]])], { now: NOW })
    expect(perMuscle.glutes).toBe(4)
  })

  it('matches the bilateral count for the same work per limb', () => {
    // Four sets of a bilateral hip thrust and four sets each side of the
    // single-leg version are the same weekly glute stimulus. The numbers have
    // to agree or the landmarks mean different things per exercise.
    const bilateral = countSets([session([['barbellHipThrust', 4]])], { now: NOW })
    const unilateral = countSets([session([['singleLegHipThrust', 8]])], { now: NOW })
    expect(unilateral.perMuscle.glutes).toBe(bilateral.perMuscle.glutes)
  })

  it('halves an odd number of per-side rows rather than rounding a pair away', () => {
    // Three rows logged out of four is a set and a half per side, not one.
    const { perMuscle } = countSets([session([['singleLegHipThrust', 3]])], { now: NOW })
    expect(perMuscle.glutes).toBe(1.5)
  })

  it('leaves an independently-loaded but simultaneous lift counted in full', () => {
    // A dumbbell incline press is unilateral — the arms load separately — but
    // both press at once, so one row is one set. Only `perSide` halves.
    const { perMuscle } = countSets([session([['inclineDbPress', 4]])], { now: NOW })
    expect(perMuscle.chest).toBe(4)
  })

  it('ignores unknown exercise ids rather than throwing', () => {
    expect(countSets([session([['notARealExercise', 3]])], { now: NOW }).totalSets).toBe(0)
  })

  it('scopes the weekly window to the current calendar week (Mon–Sun)', () => {
    // NOW is a Friday; the week starts Monday. A session from the previous
    // calendar week must fall out of the weekly count (it would have counted
    // under the old rolling-7-day window).
    const thisWeek = session([['barbellHipThrust', 3]], 1) // Thursday, in-week
    const lastWeek = session([['barbellHipThrust', 3]], 6) // Saturday, previous week
    expect(countSets([thisWeek, lastWeek], { weeks: 1, now: NOW }).perMuscle.glutes).toBe(3)
  })
})

describe('chainRatio', () => {
  it('credits glutes from squat-pattern (anterior-tagged) work to the posterior side', () => {
    // legPress is tagged anterior but trains glutes as a secondary mover. The
    // muscle-volume ratio must give the posterior chain that credit — the whole
    // point of the fix, since a squat trains both quads AND glutes.
    const r = chainRatio([session([['legPress', 8]])], { now: NOW })
    expect(r.posterior).toBeGreaterThan(0)
  })

  it('reports on-target when the posterior chain leads', () => {
    const s = session([
      ['barbellHipThrust', 10], // glutes 10 (+ hams 5)
      ['seatedCalfRaise', 10], // calves 10
      ['legPress', 6], // quads 6 (+ glutes 3)
    ])
    // posterior mean = (13 + 5 + 10) / 3 = 9.5 ; anterior (quads) = 6 → 1.58
    const r = chainRatio([s], { now: NOW })
    expect(r.ratio).toBe(1.58)
    expect(r.ratio).toBeGreaterThanOrEqual(CHAIN_RATIO_TARGET)
    expect(r.status).toBe('onTarget')
  })

  it('flags an imbalance when the quads outpace the posterior chain', () => {
    const s = session([
      ['legExtension', 10], // quads 10
      ['legPress', 8], // quads 8 (+ glutes 4)
      ['barbellHipThrust', 4], // glutes 4 (+ hams 2)
    ])
    const r = chainRatio([s], { now: NOW })
    expect(r.status).toBe('imbalanced')
    expect(r.message).toMatch(/glutes, hamstrings and calves/i)
  })

  it('calls out the gap between parity and target', () => {
    const s = session([
      ['barbellHipThrust', 10], // glutes 10 (+ hams 5)
      ['seatedCalfRaise', 8], // calves 8
      ['legPress', 8], // quads 8 (+ glutes 4)
    ])
    // posterior mean = (14 + 5 + 8) / 3 = 9 ; anterior = 8 → 1.13
    const r = chainRatio([s], { now: NOW })
    expect(r.status).toBe('acceptable')
    expect(r.ratio).toBe(1.13)
  })

  it('ignores neutral work that touches neither chain', () => {
    const withCurls = session([
      ['barbellHipThrust', 10],
      ['seatedCalfRaise', 10],
      ['legPress', 6],
      ['barbellCurl', 10], // neutral — biceps only
    ])
    expect(chainRatio([withCurls], { now: NOW }).ratio).toBe(1.58)
  })

  it('reports posteriorOnly when no quad volume is logged', () => {
    const r = chainRatio([session([['barbellHipThrust', 6], ['seatedCalfRaise', 4]])], { now: NOW })
    expect(r.status).toBe('posteriorOnly')
    expect(r.ratio).toBe(Infinity)
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

describe('injury-capped muscles', () => {
  const CAPPED = { injuryFlags: ['highHamstring'], hamstringStage: 1, now: NOW }

  it('counts only lengthened loading against the rehab ceiling', () => {
    // Hip thrusts and lying curls are hamstringStretch 'low' — the guardrail
    // picks them precisely because they don't load the proximal tendon long.
    // They must not consume an allowance that exists to limit that loading.
    const s = session([
      ['barbellHipThrust', 4],
      ['lyingLegCurl', 4],
    ])
    const ham = assessVolume([s], CAPPED).find((v) => v.muscle === 'hamstrings')
    expect(ham.allowanceUsed).toBe(0)
    // The muscle still did the work — a lying curl is four primary hamstring
    // sets whether or not it touches the ceiling, and the card says "sets by
    // muscle". Reporting 0 here was the bug behind the bug.
    expect(ham.sets).toBe(6)
  })

  it('does consume the allowance on lengthened work', () => {
    // seatedLegCurl is 'moderate' — the hip is flexed, so the tendon is long.
    const s = session([['seatedLegCurl', 5]])
    const ham = assessVolume([s], CAPPED).find((v) => v.muscle === 'hamstrings')
    expect(ham.allowanceUsed).toBe(5)
    expect(ham.sets).toBe(5)
    expect(ham.status).toBe('optimal')
  })

  it('never reports a capped muscle as under-trained', () => {
    // The whole failure was here: an empty allowance read as a deficit, which
    // is an instruction to load an injured tendon.
    const ham = assessVolume([], CAPPED).find((v) => v.muscle === 'hamstrings')
    expect(ham.allowanceUsed).toBe(0)
    expect(ham.status).toBe('optimal')
    expect(ham.deficit).toBe(0)
  })

  it('still flags going over the ceiling', () => {
    const s = session([['romanianDeadlift', 12]])
    const ham = assessVolume([s], CAPPED).find((v) => v.muscle === 'hamstrings')
    expect(ham.allowanceUsed).toBe(12)
    expect(ham.status).toBe('excessive')
  })

  it('keeps a capped muscle out of the lagging list', () => {
    // laggingMuscles feeds the +1-set bonus in buildSession. A capped muscle
    // reaching it is the guardrail asking for more of what it restricts.
    expect(laggingMuscles([], CAPPED).map((v) => v.muscle)).not.toContain('hamstrings')
  })

  it('leaves the muscle uncapped once the flag clears', () => {
    const s = session([['lyingLegCurl', 4]])
    const ham = assessVolume([s], { now: NOW }).find((v) => v.muscle === 'hamstrings')
    expect(ham.capped).toBe(false)
    expect(ham.sets).toBe(4)
    expect(ham.status).toBe('under')
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

  it('does not let a per-side row mask a push-heavy week', () => {
    // Eight single-arm row rows is four sets of pulling, not eight. Counted
    // raw it reads as balanced against four presses when the week is in fact
    // pressing twice as much as it pulls.
    const s = session([
      ['barbellBenchPress', 8],
      ['singleArmRow', 8],
    ])
    const r = pushPullBalance([s], { now: NOW })
    expect(r.pull).toBe(4)
    expect(r.push).toBe(8)
    expect(r.status).toBe('pushHeavy')
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

describe('sessionTonnage', () => {
  it('sums reps × load across exercises', () => {
    const tonnage = sessionTonnage([
      { id: 'barbellHipThrust', sets: [{ reps: 10, weight: 225 }, { reps: 8, weight: 225 }] },
    ])
    expect(tonnage).toBe(10 * 225 + 8 * 225)
  })

  it('excludes timed holds, whose reps are seconds', () => {
    // The trap bodyweight logging opens: a 30-second side plank at a 178 lb
    // bodyweight is 5,340 "lbs of volume" from an isometric that moves nothing,
    // which would dwarf the real work on the same session.
    const withPlank = sessionTonnage([
      { id: 'barbellHipThrust', sets: [{ reps: 10, weight: 225 }] },
      { id: 'sidePlank', sets: [{ reps: 30, weight: 178 }, { reps: 30, weight: 178 }] },
    ])
    expect(withPlank).toBe(2250)
  })

  it('is unchanged for the unloaded holds logged before BW existed', () => {
    const before = sessionTonnage([{ id: 'sidePlank', sets: [{ reps: 30, weight: 0 }] }])
    expect(before).toBe(0)
  })

  it('applies the exercise weight multiplier', () => {
    const [id, def] = Object.entries(STRENGTH_EXERCISES).find(
      ([, d]) => d.weightMultiplier && d.weightMultiplier !== 1 && !d.isTimeBased
    )
    expect(sessionTonnage([{ id, sets: [{ reps: 10, weight: 50 }] }])).toBe(
      10 * 50 * def.weightMultiplier
    )
  })

  it('treats an unknown exercise as an ordinary loaded lift', () => {
    expect(sessionTonnage([{ id: 'notAnExercise', sets: [{ reps: 5, weight: 100 }] }])).toBe(500)
  })
})
