import { describe, it, expect } from 'vitest'
import {
  buildSession,
  buildWeek,
  getSplit,
  plannedWeeklySets,
  buildWeekSchedule,
  mergeLoggedExercises,
  CORE_BLOCK_SIZE,
  SPLITS,
} from '../strengthProgram'
import { STRENGTH_EXERCISES } from '../exercises'
import { VOLUME_LANDMARKS } from '../chainBalance'
import { formatLocalDate } from '../../localDate'
import { getBlockStatus } from '../strengthPeriodization'
import { isExerciseAllowed } from '../injuryGuardrails'

const BLOCK_START = '2026-07-20' // a Monday
const BLOCK_END = '2026-12-20'

const ATHLETE = {
  injuryFlags: ['highHamstring', 'knee', 'tightHips', 'ankleMobility'],
  equipment: 'fullGym',
  daysPerWeek: 4,
}

function statusForWeek(week) {
  const date = new Date(`${BLOCK_START}T00:00:00`)
  date.setDate(date.getDate() + (week - 1) * 7)
  return getBlockStatus(BLOCK_START, BLOCK_END, date)
}

describe('split structure', () => {
  it('defaults to the 4-day upper/lower with posterior emphasis', () => {
    expect(getSplit(4)).toEqual(['lowerPosterior', 'upperPush', 'lowerQuad', 'upperPull'])
  })

  it('generalizes to other day counts without A/B/C assumptions', () => {
    expect(getSplit(2)).toHaveLength(2)
    expect(getSplit(3)).toHaveLength(3)
    expect(getSplit(5)).toHaveLength(5)
    expect(getSplit(6)).toHaveLength(6)
  })

  it('builds a full week of sessions', () => {
    const week = buildWeek({ ...ATHLETE, blockStatus: statusForWeek(1) })
    expect(week).toHaveLength(4)
    expect(week.every((s) => s.exercises.length > 0)).toBe(true)
  })
})

describe('injury guardrails are structural, not advisory', () => {
  // Scoped to the main work. The core block deliberately opts out of the
  // guardrails at the athlete's instruction — see the core block tests below,
  // which pin that exemption so it stays a decision rather than a leak.
  it('emits no disallowed movement anywhere in the week, at any block week', () => {
    for (const week of [1, 4, 5, 12, 13, 22]) {
      const blockStatus = statusForWeek(week)
      const sessions = buildWeek({ ...ATHLETE, blockStatus })
      for (const session of sessions) {
        for (const ex of session.exercises.filter((e) => e.group !== 'core')) {
          const verdict = isExerciseAllowed(ex, {
            injuryFlags: ATHLETE.injuryFlags,
            blockWeek: blockStatus.blockWeek,
          })
          expect(
            verdict.allowed,
            `${ex.id} was programmed in block week ${blockStatus.blockWeek}: ${verdict.reason}`
          ).toBe(true)
        }
      }
    }
  })

  it('never programs an RDL or good morning in the early block', () => {
    for (const week of [1, 2, 3, 4, 8]) {
      const sessions = buildWeek({ ...ATHLETE, blockStatus: statusForWeek(week) })
      const ids = sessions.flatMap((s) => s.exercises.map((e) => e.id))
      expect(ids).not.toContain('romanianDeadlift')
      expect(ids).not.toContain('goodMorning')
      expect(ids).not.toContain('seatedLegCurl')
    }
  })

  it('never programs deep-knee-flexion work while the knee flag is set', () => {
    const sessions = buildWeek({ ...ATHLETE, blockStatus: statusForWeek(20) })
    const ids = sessions.flatMap((s) => s.exercises.map((e) => e.id))
    expect(ids).not.toContain('barbellBackSquat')
    expect(ids).not.toContain('nordicCurl')
  })

  it('records what it substituted and why', () => {
    const session = buildSession({
      ...ATHLETE,
      splitIndex: 0,
      blockStatus: statusForWeek(1),
    })
    expect(session.substitutions.length).toBeGreaterThan(0)
    expect(session.substitutions[0].reason).toBeTruthy()
  })

  it('still drives glutes hard in week 1 despite the hamstring restriction', () => {
    const session = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: statusForWeek(1) })
    const glute = session.exercises.filter((e) => e.muscles.primary.includes('glutes'))
    expect(glute.length).toBeGreaterThanOrEqual(2)
    expect(session.exercises[0].id).toBe('barbellHipThrust')
  })

  it('opens the healthy athlete to the full catalogue', () => {
    const sessions = buildWeek({
      ...ATHLETE,
      injuryFlags: [],
      blockStatus: statusForWeek(1),
    })
    const ids = sessions.flatMap((s) => s.exercises.map((e) => e.id))
    expect(ids).toContain('romanianDeadlift')
  })
})

describe('session shape', () => {
  it('front-loads a mobility block on every session', () => {
    const week = buildWeek({ ...ATHLETE, blockStatus: statusForWeek(1) })
    for (const session of week) {
      expect(session.mobility.drills.length).toBeGreaterThan(0)
    }
  })

  it('prescribes hypertrophy rep ranges and long rests on compounds', () => {
    const session = buildSession({ ...ATHLETE, splitIndex: 1, blockStatus: statusForWeek(1) })
    const primary = session.exercises.find((e) => e.tier === 'primary')
    expect(primary.repRange[0]).toBeGreaterThanOrEqual(5)
    expect(primary.repRange[1]).toBeLessThanOrEqual(12)
    expect(primary.restSeconds).toBeGreaterThanOrEqual(120)
  })

  /**
   * There used to be a time budget, and it took back exactly the work the
   * block had just decided to add: it shaved sets off whichever isolation
   * exercise had the most, which is always the one the lagging-muscle bonus
   * topped up. A lateral raise carried a "+1 set" badge into a session where
   * the clock had cut it from six sets to two.
   */
  it('prescribes the whole session, however long it runs', () => {
    for (let i = 0; i < 4; i++) {
      const status = statusForWeek(4)
      const biased = buildSession({
        ...ATHLETE,
        laggingMuscles: [{ muscle: 'sideDelts' }, { muscle: 'chest' }],
        splitIndex: i,
        blockStatus: status,
      })
      const plain = buildSession({ ...ATHLETE, splitIndex: i, blockStatus: status })

      // Nothing dropped for running long.
      expect(biased.exercises).toHaveLength(plain.exercises.length)

      for (const ex of biased.exercises) {
        const before = plain.exercises.find((e) => e.id === ex.id)
        // The badge is a promise about the set count: one more than the same
        // exercise gets without the bias, never fewer.
        expect(ex.sets).toBe(before.sets + (ex.biasedForLagging ? 1 : 0))
      }
    }
  })

  it('still reports how long a session runs, it just no longer cuts it short', () => {
    const session = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: statusForWeek(4) })
    expect(session.estimatedMinutes).toBeGreaterThan(0)
  })

  it('carries the mesocycle RIR target onto every exercise', () => {
    const status = statusForWeek(4)
    const session = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: status })
    expect(status.rirTarget).toBe(1)
    expect(session.exercises.every((e) => e.rirTarget === 1)).toBe(true)
  })
})

describe('volume progression and bias', () => {
  it('adds sets as the mesocycle accumulates', () => {
    const w1 = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: statusForWeek(1) })
    const w4 = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: statusForWeek(4) })
    const total = (s) => s.exercises.reduce((t, e) => t + e.sets, 0)
    expect(total(w4)).toBeGreaterThan(total(w1))
  })

  it('cuts volume and load on the deload week', () => {
    const w4 = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: statusForWeek(4) })
    const deload = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: statusForWeek(5) })
    const total = (s) => s.exercises.reduce((t, e) => t + e.sets, 0)
    expect(total(deload)).toBeLessThan(total(w4))
    expect(deload.rirTarget).toBe(4)
  })

  it('adds a set to movements training a lagging muscle', () => {
    const base = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: statusForWeek(1) })
    const biased = buildSession({
      ...ATHLETE,
      splitIndex: 0,
      blockStatus: statusForWeek(1),
      laggingMuscles: [{ muscle: 'glutes' }],
    })
    const gluteSets = (s) =>
      s.exercises.filter((e) => e.muscles.primary.includes('glutes')).reduce((t, e) => t + e.sets, 0)
    expect(gluteSets(biased)).toBeGreaterThan(gluteSets(base))
  })

  it('never adds the lagging bonus to a muscle under an injury ceiling', () => {
    // The cap lowers the muscle's MEV, which made it read as behind, which
    // handed it an extra set — the guardrail arguing for more volume on the
    // thing it exists to restrict. On the first day of a week every muscle
    // reads zero, so this fired almost every Monday.
    const base = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: statusForWeek(1) })
    const biased = buildSession({
      ...ATHLETE,
      splitIndex: 0,
      blockStatus: statusForWeek(1),
      hamstringStage: 1,
      laggingMuscles: [{ muscle: 'hamstrings' }],
    })
    const hamSets = (s) =>
      s.exercises
        .filter((e) => e.muscles.primary.includes('hamstrings'))
        .reduce((t, e) => t + e.sets, 0)
    expect(hamSets(biased)).toBe(hamSets(base))
  })

  it('holds the prescription inside what remains of the rehab ceiling', () => {
    // The guardrail governed which movements were allowed, never how many sets
    // of them, so one session could prescribe more than the whole week's cap.
    const spent = buildSession({
      ...ATHLETE,
      splitIndex: 0,
      blockStatus: statusForWeek(1),
      hamstringStage: 1,
      // Most of the week's allowance already used.
      cappedUsage: { hamstrings: 7 },
    })

    const consumed = spent.exercises
      .filter((e) => ['moderate', 'high'].includes(e.demands?.hamstringStretch))
      .reduce((t, e) => {
        if (e.muscles.primary.includes('hamstrings')) return t + e.sets
        if ((e.muscles.secondary || []).includes('hamstrings')) return t + e.sets * 0.5
        return t
      }, 0)

    // Stage-1 ceiling is 8; 7 is already spent, so at most 1 may be prescribed.
    expect(consumed).toBeLessThanOrEqual(1)
  })

  it('plans posterior-priority weekly volume above the anterior', () => {
    const planned = plannedWeeklySets({ ...ATHLETE, blockStatus: statusForWeek(1) })
    expect(planned.glutes).toBeGreaterThan(planned.quads)
    expect(planned.calves).toBeGreaterThan(0)
  })
})

describe('equipment', () => {
  it('only programs what a minimal setup can actually do', () => {
    const session = buildSession({
      ...ATHLETE,
      equipment: 'minimal',
      splitIndex: 0,
      blockStatus: statusForWeek(1),
    })
    expect(session.exercises.every((e) => e.equipmentLevel === 'minimal')).toBe(true)
  })
})

describe('core block', () => {
  const week = (n) => statusForWeek(n)
  const coreOf = (session) => session.exercises.filter((e) => e.group === 'core')

  it('gives every session of every split three core movements', () => {
    for (const equipment of ['fullGym', 'homeGym', 'minimal']) {
      for (const days of [2, 3, 4, 5, 6]) {
        for (let i = 0; i < days; i++) {
          const session = buildSession({
            ...ATHLETE,
            equipment,
            daysPerWeek: days,
            splitIndex: i,
            blockStatus: week(1),
          })
          const core = coreOf(session)
          expect(core, `${equipment} ${days}-day #${i}`).toHaveLength(CORE_BLOCK_SIZE)
          // Three distinct movements, not the same one three times.
          expect(new Set(core.map((e) => e.id)).size).toBe(CORE_BLOCK_SIZE)
        }
      }
    }
  })

  it('puts the core block last, after the main work', () => {
    const { exercises } = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: week(1) })
    const firstCore = exercises.findIndex((e) => e.group === 'core')
    expect(firstCore).toBe(exercises.length - CORE_BLOCK_SIZE)
    expect(exercises.slice(firstCore).every((e) => e.group === 'core')).toBe(true)
  })

  it('prescribes core as logged, weighted work rather than a checklist', () => {
    // The whole point of the block being exercises and not drills: they carry
    // sets, a rep range and rest, so they log and progress like any other lift.
    for (const ex of coreOf(buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: week(1) }))) {
      expect(ex.sets).toBeGreaterThan(0)
      expect(ex.repRange).toHaveLength(2)
      expect(ex.restSeconds).toBeGreaterThan(0)
    }
  })

  it('ignores injury flags when choosing core movements', () => {
    // The athlete's explicit call: the guardrails exist for loaded lower-body
    // work, and a hamstring stage should not silently rewrite his core work.
    // Stage 1 would otherwise block the hanging leg raise.
    const injured = buildSession({ ...ATHLETE, splitIndex: 1, blockStatus: week(2) })
    const healthy = buildSession({
      ...ATHLETE,
      injuryFlags: [],
      splitIndex: 1,
      blockStatus: week(2),
    })
    expect(coreOf(injured).map((e) => e.id)).toEqual(coreOf(healthy).map((e) => e.id))
    expect(coreOf(injured).some((e) => e.id === 'hangingLegRaise')).toBe(true)
    // Nothing is hidden by the exemption — the movement still carries its cue.
    expect(coreOf(injured).find((e) => e.id === 'hangingLegRaise').cue).toMatch(/bend the knees/i)
  })

  it('leaves the main work under the guardrails', () => {
    // The exemption must not leak: an RDL is still refused in the early block.
    const session = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: week(2) })
    const main = session.exercises.filter((e) => e.group !== 'core')
    expect(main.some((e) => e.id === 'romanianDeadlift')).toBe(false)
  })

  it('caps core sets so the mesocycle ramp cannot inflate them', () => {
    // Three movements on four days is already ~24 weekly sets. Letting the
    // peak-week multiplier take each to three would reach 36, for work that
    // is not one of the block's objectives.
    const peak = buildSession({ ...ATHLETE, splitIndex: 0, blockStatus: week(4) })
    expect(coreOf(peak).every((e) => e.sets <= 2)).toBe(true)
  })

  it('keeps the block\'s own weekly volume inside the core landmark band', () => {
    // Asserted on what the block prescribes, not on plannedWeeklySets.core —
    // that also carries fractional secondary credit from every compound in the
    // week, which swings with the mesocycle and with what the guardrails
    // substituted, and is not something the core block controls.
    const direct = [0, 1, 2, 3]
      .map((i) => buildSession({ ...ATHLETE, splitIndex: i, blockStatus: week(2) }))
      .flatMap((s) => s.exercises.filter((e) => e.group === 'core'))
      .reduce((total, e) => total + e.sets, 0)

    const [mavMin, mavMax] = VOLUME_LANDMARKS.core.mav
    expect(direct).toBe(24)
    expect(direct).toBeGreaterThanOrEqual(mavMin)
    expect(direct).toBeLessThanOrEqual(mavMax)
  })

  it('finishes every day of the split — core is not the thing that gets cut', () => {
    // It was optional in the first pass, which meant a tight time budget
    // dropped it and "core after every session" quietly became "sometimes".
    // The budget is gone; this holds the guarantee it used to break.
    for (let i = 0; i < 4; i++) {
      expect(coreOf(buildSession({ ...ATHLETE, splitIndex: i, blockStatus: week(1) }))).toHaveLength(
        CORE_BLOCK_SIZE
      )
    }
  })

  /**
   * Three muscles had bands on the dashboard and nothing in the library that
   * trained them as a target: adductors and tibialis had no movement at all,
   * and traps were only ever a passenger on a carry — which is also why traps
   * could never earn the lagging bonus, since that reads `muscles.primary`.
   */
  it('trains every muscle that has a landmark band', () => {
    const trained = new Set()
    for (const meso of [1, 2]) {
      for (let i = 0; i < 4; i++) {
        const session = buildSession({
          ...ATHLETE,
          injuryFlags: [],
          splitIndex: i,
          blockStatus: { ...week(1), mesocycle: meso },
        })
        for (const e of session.exercises) for (const m of e.muscles.primary) trained.add(m)
      }
    }
    for (const muscle of Object.keys(VOLUME_LANDMARKS)) {
      expect(trained.has(muscle), `${muscle} has a band but nothing trains it`).toBe(true)
    }
  })

  describe('mesocycle rotation', () => {
    const lower = (meso) =>
      buildSession({
        ...ATHLETE,
        injuryFlags: [],
        splitIndex: 0,
        blockStatus: { ...week(1), mesocycle: meso },
      }).exercises.filter((e) => e.group !== 'core')

    it('swaps paired movements on even mesocycles, mirroring the running block', () => {
      const odd = lower(1).map((e) => e.id)
      const even = lower(2).map((e) => e.id)
      expect(odd).toContain('romanianDeadlift')
      expect(even).toContain('goodMorning')
      expect(even).not.toContain('romanianDeadlift')
      // Third mesocycle comes back round — A B A, not a one-way walk.
      expect(lower(3).map((e) => e.id)).toEqual(odd)
    })

    /**
     * The barbell hip thrust is the lift the block is measured by, and its only
     * unilateral alternate is accessory-tier — rotating it would drop the heavy
     * glute anchor to 10-15 reps every second mesocycle.
     */
    it('leaves the heavy anchors alone', () => {
      for (const meso of [1, 2, 3, 4]) {
        expect(lower(meso).map((e) => e.id)).toContain('barbellHipThrust')
      }
    })

    it('rotates before the guardrails, so a blocked alternate falls through the list', () => {
      // Nordics are blocked by the knee flag; the eccentric hamstring slot must
      // still resolve to something rather than vanishing.
      const withKnee = buildSession({
        ...ATHLETE,
        injuryFlags: ['knee'],
        splitIndex: 0,
        blockStatus: { ...week(1), mesocycle: 1 },
      })
      const slotRoles = withKnee.exercises.map((e) => e.slotRole)
      expect(slotRoles).toContain('Eccentric hamstring')
      expect(withKnee.exercises.map((e) => e.id)).not.toContain('nordicCurl')
    })
  })

  describe('run-specific loading', () => {
    const lowerDay = () =>
      buildSession({
        ...ATHLETE,
        injuryFlags: [],
        splitIndex: 0,
        blockStatus: { ...week(1), mesocycle: 1 },
      })

    it('keeps the compounds heavy and loads the accessories for endurance', () => {
      const byRole = Object.fromEntries(lowerDay().exercises.map((e) => [e.slotRole, e]))

      // Heavy: hypertrophy reps, long rest.
      expect(byRole['Primary glute'].repRange[1]).toBeLessThanOrEqual(12)
      expect(byRole['Primary glute'].restSeconds).toBeGreaterThanOrEqual(120)
      expect(byRole['Primary glute'].endurance).toBe(false)

      // Endurance: the loading the running programme prescribes for these
      // patterns — ≥12 reps, short rest.
      for (const role of ['Single-leg drive', 'Calf — soleus', 'Hip stability']) {
        expect(byRole[role].repRange).toEqual([12, 20])
        expect(byRole[role].restSeconds).toBeLessThanOrEqual(90)
        expect(byRole[role].endurance).toBe(true)
      }
    })

    it('leaves a timed hold in seconds rather than widening it to a rep range', () => {
      const timed = lowerDay().exercises.filter((e) => e.isTimeBased)
      for (const e of timed) expect(e.repRange).not.toEqual([12, 20])
    })
  })

  it('rotates the core block too, keeping each slot\'s pattern', () => {
    const core = (meso, splitIndex) =>
      buildSession({
        ...ATHLETE,
        injuryFlags: [],
        splitIndex,
        blockStatus: { ...week(1), mesocycle: meso },
      }).exercises.filter((e) => e.group === 'core')

    for (const splitIndex of [0, 1, 2, 3]) {
      const odd = core(1, splitIndex)
      const even = core(2, splitIndex)

      expect(odd).toHaveLength(CORE_BLOCK_SIZE)
      expect(even).toHaveLength(CORE_BLOCK_SIZE)
      expect(even.map((e) => e.id)).not.toEqual(odd.map((e) => e.id))

      // A flexion slot rotates to another flexion movement, not to a plank —
      // the slot role is the prescription, the movement is the variable.
      expect(even.map((e) => e.slotRole)).toEqual(odd.map((e) => e.slotRole))
    }
  })

  it('never prescribes the same movement twice in one session', () => {
    for (const equipment of ['fullGym', 'homeGym', 'minimal']) {
      for (const flags of [[], ['highHamstring'], ATHLETE.injuryFlags]) {
        for (const days of [2, 3, 4, 5, 6]) {
          for (let i = 0; i < days; i++) {
            const { exercises } = buildSession({
              ...ATHLETE,
              equipment,
              injuryFlags: flags,
              daysPerWeek: days,
              splitIndex: i,
              blockStatus: week(1),
            })
            const ids = exercises.map((e) => e.id)
            expect(new Set(ids).size).toBe(ids.length)
          }
        }
      }
    }
  })
})

describe('bodyweight loading', () => {
  // A side plank, a pull-up, a dip: the load is the athlete. Logging one at
  // BW stores the weigh-in as the set's weight, which the builder must read as
  // a fact rather than as a number to progress from.
  const sessionWith = (history) =>
    buildSession({
      ...ATHLETE,
      splitIndex: 0,
      blockStatus: statusForWeek(1),
      exerciseHistory: history,
    })

  const findCore = (session) => session.exercises.find((e) => e.group === 'core')

  it('prescribes no weight for a movement last logged at bodyweight', () => {
    const core = findCore(sessionWith({}))
    const session = sessionWith({
      [core.id]: { currentWeight: 178, isBodyweight: true, lastReps: [30, 30] },
    })
    const exercise = session.exercises.find((e) => e.id === core.id)

    // Without the flag this would round 178 up to the nearest 5 and put
    // "180 lbs" on the card.
    expect(exercise.recommendedWeight).toBe(0)
    expect(exercise.lastIsBodyweight).toBe(true)
    // The number is still carried, so the row can show what BW resolved to.
    expect(exercise.lastWeight).toBe(178)
  })

  it('prescribes the plate, not the person, when a bodyweight set was loaded', () => {
    const core = findCore(sessionWith({}))
    const session = sessionWith({
      // 174.5 lb athlete with a 45 lb bar: 219.5 effective, 45 on the bar.
      [core.id]: {
        currentWeight: 219.5,
        currentAddedWeight: 45,
        isBodyweight: true,
        lastReps: [20, 20],
      },
    })
    const exercise = session.exercises.find((e) => e.id === core.id)

    // No total prescription — the row stays on BW.
    expect(exercise.recommendedWeight).toBe(0)
    // But the bar carries forward, near what was lifted rather than near 220.
    expect(exercise.recommendedAddedWeight).toBeGreaterThan(0)
    expect(exercise.recommendedAddedWeight).toBeLessThan(60)
    expect(exercise.lastAddedWeight).toBe(45)
    expect(exercise.lastWeight).toBe(219.5)
  })

  it('deepens assistance on a deload rather than withdrawing it', () => {
    const core = findCore(sessionWith({}))
    // Assisted pull-up: 174.5 lb athlete with 60 lbs of machine help, so the
    // effective load is 114.5 and the added figure is negative.
    const history = {
      [core.id]: {
        currentWeight: 114.5,
        currentAddedWeight: -60,
        isBodyweight: true,
        lastReps: [8, 8],
      },
    }

    const normal = sessionWith(history).exercises.find((e) => e.id === core.id)
    const deload = buildSession({
      ...ATHLETE,
      splitIndex: 0,
      blockStatus: statusForWeek(5),
      exerciseHistory: history,
    }).exercises.find((e) => e.id === core.id)

    expect(normal.recommendedAddedWeight).toBe(-60)
    // A deload week must make it easier, which for assisted work means MORE
    // help. Scaling the negative like a plate would have moved it toward zero.
    expect(deload.recommendedAddedWeight).toBeLessThan(-60)
    expect(normal.lastIsBodyweight).toBe(true)
  })

  it('leaves the added load at zero for an unloaded bodyweight movement', () => {
    const core = findCore(sessionWith({}))
    const session = sessionWith({
      [core.id]: { currentWeight: 174.5, isBodyweight: true, lastReps: [30] },
    })
    expect(session.exercises.find((e) => e.id === core.id).recommendedAddedWeight).toBe(0)
  })

  it('still prescribes from a real external load', () => {
    const core = findCore(sessionWith({}))
    const session = sessionWith({
      [core.id]: { currentWeight: 45, isBodyweight: false, lastReps: [12, 12] },
    })
    const exercise = session.exercises.find((e) => e.id === core.id)

    expect(exercise.recommendedWeight).toBeGreaterThan(0)
    expect(exercise.lastIsBodyweight).toBe(false)
  })

  it('treats history predating the flag as an external load', () => {
    const core = findCore(sessionWith({}))
    const session = sessionWith({ [core.id]: { currentWeight: 45, lastReps: [12] } })
    expect(session.exercises.find((e) => e.id === core.id).lastIsBodyweight).toBe(false)
  })
})

describe('buildWeekSchedule', () => {
  // A Wednesday in block week 1, so "this week" has days either side of today.
  const NOW = new Date('2026-07-22T09:00:00')
  const week = (weekOffset, extra = {}) =>
    buildWeekSchedule({
      trainingDayIndices: [1, 2, 4, 5],
      trainingDaysPerWeek: 4,
      blockStart: BLOCK_START,
      blockEnd: BLOCK_END,
      now: NOW,
      weekOffset,
      ...extra,
    })

  const SPLIT_NAMES = [
    'Lower — Posterior',
    'Upper — Push',
    'Lower — Quad & Glute',
    'Upper — Pull',
  ]
  const DAY_IDS = ['lowerPosterior', 'upperPush', 'lowerQuad', 'upperPull']

  /** A logged strength session, shaped the way saveSession stores one. */
  const logged = (date, splitIndex, id = 'sess1') => ({
    id,
    mode: 'strength',
    completed: true,
    date,
    splitIndex,
    dayId: DAY_IDS[splitIndex],
    name: SPLIT_NAMES[splitIndex],
  })

  const named = (days) => days.map((d) => d.name)

  it('gives one entry per training day, named from the split', () => {
    // A future week has nothing logged and nothing missed, so it is the plan
    // exactly as written.
    const { days } = week(1)
    expect(days).toHaveLength(4)
    expect(days.map((d) => d.splitIndex)).toEqual([0, 1, 2, 3])
    expect(named(days)).toEqual(SPLIT_NAMES)
    expect(days.every((d) => d.focus)).toBe(true)
    expect(days.every((d) => d.status === 'upcoming')).toBe(true)
  })

  it('moves a whole week forward, keeping the same split order', () => {
    const next = week(1)
    const after = week(2)

    expect(after.weekOffset).toBe(2)
    expect(after.isCurrent).toBe(false)
    expect(after.blockWeek).toBe(next.blockWeek + 1)
    expect(named(after.days)).toEqual(named(next.days))
    for (let i = 0; i < 4; i++) {
      expect((after.days[i].date - next.days[i].date) / 86400000).toBe(7)
    }
  })

  it('reports a future deload as a deload rather than as today', () => {
    // Week 5 of the mesocycle is the deload — the reason looking ahead is
    // worth anything, since it changes how the week before it is trained.
    const offsets = [0, 1, 2, 3, 4, 5].map((o) => week(o))
    const deload = offsets.find((w) => w.phase === 'deload')

    expect(deload, 'no deload within six weeks').toBeTruthy()
    expect(deload.isCurrent).toBe(false)
    expect(deload.rirTarget).toBeGreaterThan(offsets[0].rirTarget)
  })

  it('marks today, and only today', () => {
    const today = week(0).days.filter((d) => d.isToday)
    expect(today).toHaveLength(1)
    expect(today[0].dateId).toBe('2026-07-22')
    expect(week(1).days.some((d) => d.isToday)).toBe(false)
  })

  it('pairs a logged session with the day it was trained on', () => {
    const monday = '2026-07-20'
    const { days } = week(0, { sessions: [logged(`${monday}T18:00:00.000Z`, 0)] })

    expect(days[0]).toMatchObject({ dateId: monday, completed: true, sessionId: 'sess1' })
    // Same split index, different week — must not inherit the completion.
    expect(week(1, { sessions: [logged(`${monday}T18:00:00.000Z`, 0)] }).days[0].completed).toBe(
      false
    )
  })

  it('nothing in a future week is complete', () => {
    expect(week(2).days.some((d) => d.completed)).toBe(false)
  })

  describe('the week reflows around what was actually trained', () => {
    it('keeps a session on the day it happened, under its own name', () => {
      // The bug this exists for: Monday's session trained on Tuesday. The old
      // schedule labelled Tuesday "Upper — Push", refused to mark it done, and
      // left Monday waiting for a session that had already happened.
      const { days } = week(0, { sessions: [logged('2026-07-21T12:00:00.000Z', 0)] })
      const tuesday = days.find((d) => d.dateId === '2026-07-21')

      expect(tuesday).toMatchObject({
        status: 'done',
        completed: true,
        name: 'Lower — Posterior',
        sessionId: 'sess1',
      })
    })

    it('slides what is left onto the days that are left', () => {
      const { days } = week(0, { sessions: [logged('2026-07-21T12:00:00.000Z', 0)] })
      const ahead = days.filter((d) => d.status === 'upcoming')

      // Push, Quad, Pull — in order, on the three days the week has left.
      expect(named(ahead)).toEqual(SPLIT_NAMES.slice(1))
      expect(ahead.map((d) => d.dateId)).toEqual(['2026-07-22', '2026-07-23', '2026-07-24'])
    })

    it('offers today a slot even when the plan does not have one', () => {
      // Wednesday is a rest day in the rota. If the week still owes sessions
      // and he is training now, now is where the next one goes — otherwise a
      // makeup session has no row to start from.
      const today = week(0).days.find((d) => d.dateId === '2026-07-22')
      expect(today).toMatchObject({ status: 'upcoming', unscheduled: true })
      expect(today.splitIndex).toBe(0)
    })

    it('uses a spare weekday before it touches the weekend', () => {
      // James's actual week, and the case the first version got wrong. Asked on
      // the Tuesday, with Monday missed and Tuesday trained: the week owes
      // three sessions and has Wednesday, Thursday and Friday to put them on.
      // Wednesday is not a training day in the rota and is not today, so a pool
      // built from "today, then the weekend" could not see it at all — and the
      // week pushed a session onto Saturday while Wednesday sat empty.
      const tuesday = buildWeekSchedule({
        trainingDayIndices: [1, 2, 4, 5],
        trainingDaysPerWeek: 4,
        sessions: [logged('2026-07-21T12:00:00.000Z', 0)],
        now: new Date('2026-07-21T18:00:00'),
        blockStart: BLOCK_START,
        blockEnd: BLOCK_END,
      })
      const ahead = tuesday.days.filter((d) => d.status === 'upcoming')

      expect(ahead.map((d) => d.dateId)).toEqual(['2026-07-22', '2026-07-23', '2026-07-24'])
      expect(named(ahead)).toEqual(SPLIT_NAMES.slice(1))
      // The week finishes inside the working week, so nothing lands on it.
      expect(tuesday.days.some((d) => d.dateId > '2026-07-24')).toBe(false)
      // Only the borrowed day is a catch-up; Thursday and Friday are back on
      // the sessions the rota gives them.
      expect(ahead.filter((d) => d.unscheduled).map((d) => d.dateId)).toEqual(['2026-07-22'])
    })

    it('reaches the weekend only once the weekdays are genuinely gone', () => {
      // Same week, but Wednesday went by untrained too. Now there is no spare
      // weekday left and Saturday is the honest answer.
      const thursday = buildWeekSchedule({
        trainingDayIndices: [1, 2, 4, 5],
        trainingDaysPerWeek: 4,
        sessions: [logged('2026-07-21T12:00:00.000Z', 0)],
        now: new Date('2026-07-23T09:00:00'),
        blockStart: BLOCK_START,
        blockEnd: BLOCK_END,
      })
      const ahead = thursday.days.filter((d) => d.status === 'upcoming')

      expect(ahead.map((d) => d.dateId)).toEqual(['2026-07-23', '2026-07-24', '2026-07-25'])
      expect(ahead.at(-1)).toMatchObject({ unscheduled: true, name: 'Upper — Pull' })
    })

    it('spills onto the weekend once the weekdays run out', () => {
      // Nothing trained by Wednesday: four sessions owed, three weekdays left.
      const { days } = week(0)
      const saturday = days.find((d) => d.dateId === '2026-07-25')

      expect(saturday).toMatchObject({ status: 'upcoming', unscheduled: true })
      expect(saturday.name).toBe('Upper — Pull')
    })

    it('reports a training day that went untrained as missed, carrying no split', () => {
      const { days } = week(0, { sessions: [logged('2026-07-21T12:00:00.000Z', 0)] })
      const monday = days.find((d) => d.dateId === '2026-07-20')

      expect(monday).toMatchObject({ status: 'missed', completed: false, splitIndex: null })
    })

    it('runs out of week rather than inventing a day', () => {
      // Asked on the Sunday, with nothing trained: seven days of rota gone and
      // no date left to put anything on.
      const sunday = buildWeekSchedule({
        trainingDayIndices: [1, 2, 4, 5],
        trainingDaysPerWeek: 4,
        blockStart: BLOCK_START,
        blockEnd: BLOCK_END,
        now: new Date('2026-07-26T09:00:00'),
      })
      const unplaced = sunday.days.filter((d) => d.status === 'unplaced')

      expect(unplaced.length).toBeGreaterThan(0)
      expect(unplaced.every((d) => d.date === null)).toBe(true)
      // Still named, so they can be reported rather than quietly dropped.
      expect(unplaced.every((d) => d.name)).toBe(true)
    })

    it('reassigns the remaining week when a session is relabelled', () => {
      // Same session, same sets, relabelled from posterior to pull. The slot it
      // now pays for is the pull slot, so posterior comes back to the front of
      // what the week still owes.
      const { days } = week(0, { sessions: [logged('2026-07-21T12:00:00.000Z', 3)] })

      expect(days.find((d) => d.dateId === '2026-07-21').name).toBe('Upper — Pull')
      expect(named(days.filter((d) => d.status === 'upcoming'))).toEqual([
        'Lower — Posterior',
        'Upper — Push',
        'Lower — Quad & Glute',
      ])
    })

    it('gives an off-plan session a row without discharging a slot', () => {
      // A sixth session in a four-day split pays for nothing: the week still
      // owes everything it owed.
      const sessions = [
        logged('2026-07-20T12:00:00.000Z', 0, 'a'),
        logged('2026-07-21T12:00:00.000Z', 0, 'b'),
      ]
      const { days } = week(0, { sessions })

      expect(days.filter((d) => d.status === 'done')).toHaveLength(2)
      expect(named(days.filter((d) => d.status !== 'done'))).toEqual(SPLIT_NAMES.slice(1))
    })
  })

  describe('which records the week is willing to read', () => {
    it('files a session on the local day it was trained, not the UTC one', () => {
      // 01:30 UTC. West of Greenwich that is the previous evening, and reading
      // the day off the UTC prefix filed it on a day he was asleep for.
      const iso = '2026-07-23T01:30:00.000Z'
      const done = week(0, { sessions: [logged(iso, 1)] }).days.find((d) => d.status === 'done')

      expect(done.dateId).toBe(formatLocalDate(new Date(iso)))
    })

    it('never lets a running session consume a strength slot', () => {
      // The running block predates this one and its sessions carry no split at
      // all. Letting them in would cancel slots at random.
      const running = [{ id: 'old', date: '2026-07-21T12:00:00.000Z', dayType: 'A' }]
      const { days } = week(0, { sessions: running })

      expect(days.some((d) => d.status === 'done')).toBe(false)
      expect(named(days.filter((d) => d.status === 'upcoming'))).toEqual(SPLIT_NAMES)
    })

    it('ignores a session that was abandoned rather than completed', () => {
      const abandoned = [{ ...logged('2026-07-21T12:00:00.000Z', 0), completed: false }]
      expect(week(0, { sessions: abandoned }).days.some((d) => d.status === 'done')).toBe(false)
    })
  })
})

describe('mergeLoggedExercises', () => {
  // Review renders the prescription and fills it with the logged sets. That
  // works only while the two describe the same session — and relabelling one
  // points it at a different template entirely, at which point sets logged
  // against a movement the new template never prescribes have nowhere to go.
  const prescription = () =>
    buildSession({ ...ATHLETE, splitIndex: 3, blockStatus: statusForWeek(1) })

  it('leaves a session whose prescription still covers it alone', () => {
    const session = prescription()
    const asLogged = { exercises: session.exercises.slice(0, 3).map((e) => ({ id: e.id, sets: [] })) }

    expect(mergeLoggedExercises(session, asLogged)).toBe(session)
  })

  it('appends logged work the prescription no longer contains', () => {
    const session = prescription()
    // A hip thrust is posterior-day work: relabel a posterior session as a pull
    // session and the prescription stops mentioning it entirely.
    const orphan = { id: 'barbellHipThrust', sets: [{ weight: 155, reps: 10, completed: true }] }
    expect(session.exercises.some((e) => e.id === orphan.id)).toBe(false)

    const merged = mergeLoggedExercises(session, { exercises: [orphan] })
    const added = merged.exercises.find((e) => e.id === orphan.id)

    expect(added).toBeTruthy()
    expect(merged.exercises).toHaveLength(session.exercises.length + 1)
    // Sized by what was performed, not by a prescription that no longer applies.
    expect(added.sets).toBe(1)
    // Nothing to suggest about a session that has already happened.
    expect(added.recommendedWeight).toBe(0)
    expect(added.rirTarget).toBe(session.rirTarget)
  })

  it('counts a per-side movement in prescribed sets, not logged rows', () => {
    const session = prescription()
    const perSide = Object.values(STRENGTH_EXERCISES).find(
      (e) => e.perSide && !session.exercises.some((x) => x.id === e.id)
    )
    const rows = Array.from({ length: 6 }, () => ({ reps: 10, completed: true }))

    const merged = mergeLoggedExercises(session, { exercises: [{ id: perSide.id, sets: rows }] })
    // Six rows is three sets a side, which is what the card has to draw.
    expect(merged.exercises.at(-1).sets).toBe(3)
  })

  it('widens a prescribed exercise to hold every logged set', () => {
    const session = prescription()
    // The lagging-muscle bonus in reverse: the session was trained at five sets
    // because back was behind, and logging it is what cleared the deficit, so
    // the rebuild comes back at four. The fifth set must still have a row.
    const target = session.exercises.find((e) => !e.perSide && e.group !== 'core')
    const rows = Array.from({ length: target.sets + 1 }, () => ({ reps: 10, completed: true }))

    const merged = mergeLoggedExercises(session, { exercises: [{ id: target.id, sets: rows }] })
    const widened = merged.exercises.find((e) => e.id === target.id)

    expect(widened.sets).toBe(target.sets + 1)
    // Widened in place, not appended as a second copy of the same movement.
    expect(merged.exercises).toHaveLength(session.exercises.length)
    expect(merged.exercises.filter((e) => e.id === target.id)).toHaveLength(1)
  })

  it('widens a per-side movement by the set, not by the row', () => {
    const session = prescription()
    const target = session.exercises.find((e) => e.perSide)
    // Four sets a side against a three-set prescription: eight rows, four sets.
    const rows = Array.from({ length: (target.sets + 1) * 2 }, () => ({ reps: 10, completed: true }))

    const merged = mergeLoggedExercises(session, { exercises: [{ id: target.id, sets: rows }] })

    expect(merged.exercises.find((e) => e.id === target.id).sets).toBe(target.sets + 1)
  })

  it('never shrinks a prescription to fit a session that was cut short', () => {
    const session = prescription()
    // The sets he still owes stay on screen — that is what makes them loggable
    // after the fact.
    const target = session.exercises.find((e) => !e.perSide && e.sets > 1)
    const partial = { id: target.id, sets: [{ reps: 10, completed: true }] }

    const merged = mergeLoggedExercises(session, { exercises: [partial] })

    expect(merged).toBe(session)
    expect(merged.exercises.find((e) => e.id === target.id).sets).toBe(target.sets)
  })

  it('ignores an id the catalogue has never heard of', () => {
    const session = prescription()
    const merged = mergeLoggedExercises(session, { exercises: [{ id: 'nope', sets: [{}] }] })
    expect(merged.exercises).toHaveLength(session.exercises.length)
  })

  it('is a no-op when there is nothing logged to merge', () => {
    const session = prescription()
    expect(mergeLoggedExercises(session, null)).toBe(session)
    expect(mergeLoggedExercises(null, { exercises: [] })).toBeNull()
  })
})

describe('splits nest as training days come off', () => {
  // Written after the three-day split was found to contain no pulling at all:
  // `lowerPosterior, upperPush, lowerQuad`, while the TWO-day split below it
  // kept `upperPull`. Walking 4 → 3 → 2 lost the pull day and then got it back.
  it('each split from 2 to 5 days is a subset of the next one up', () => {
    for (const days of [2, 3, 4]) {
      const smaller = SPLITS[days]
      const larger = new Set(SPLITS[days + 1])
      for (const template of smaller) {
        expect(larger.has(template), `${template} missing from the ${days + 1}-day split`).toBe(true)
      }
    }
  })

  it('the six-day split repeats the four-day one rather than extending it', () => {
    // Six is a different shape — 4 plus two repeats — so the nesting rule above
    // deliberately stops at five. Every day still has to come from the core set.
    const four = new Set(SPLITS[4])
    for (const template of SPLITS[6]) expect(four.has(template)).toBe(true)
  })

  it('every split trains something that pulls', () => {
    // The one that actually bit. Pressing with no pulling, for an athlete whose
    // chain-balance target is a deliberate pull bias and whose posture is a
    // runner's, is the wrong session to have dropped.
    for (const days of [2, 3, 4, 5, 6]) {
      const pulls = SPLITS[days].some((id) => id === 'upperPull' || id === 'fullBody')
      expect(pulls, `${days}-day split has no pulling day`).toBe(true)
    }
  })

  it('drops the quad day before the pull day, not the other way round', () => {
    expect(SPLITS[3]).toContain('upperPull')
    expect(SPLITS[3]).not.toContain('lowerQuad')
  })

  it('never puts two lower-body days back to back', () => {
    const isLower = (id) => id === 'lowerPosterior' || id === 'lowerQuad'
    for (const days of [2, 3, 4, 5]) {
      const split = SPLITS[days]
      for (let i = 1; i < split.length; i++) {
        expect(isLower(split[i]) && isLower(split[i - 1]), `${days}-day split, index ${i}`).toBe(false)
      }
    }
  })
})
