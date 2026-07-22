/**
 * The Cloud Function re-derives the hamstring rehab stage because it cannot
 * import the client's strength engine. These tests compare the two directly:
 * if the client's staging changes and the server's copy doesn't, the build
 * fails here rather than the coach quietly recommending a movement the app
 * would have blocked.
 */
import { describe, it, expect } from 'vitest'

import {
  HAMSTRING_STAGES as SERVER_STAGES,
  hamstringStageFor as serverStageFor,
  getBlockWeek as serverBlockWeek,
  deriveGuardrails,
  DEFAULT_INJURY_FLAGS,
  BLOCKABLE_MOVEMENTS,
  isMovementAllowed,
  findBlockedMovements,
} from '../src/coach/guardrails.js'

import {
  HAMSTRING_STAGES as CLIENT_STAGES,
  hamstringStageFor as clientStageFor,
  isExerciseAllowed,
} from '../../src/lib/strength/injuryGuardrails.js'
import { getBlockWeek as clientBlockWeek } from '../../src/lib/strength/strengthPeriodization.js'
import { defaultStrengthSettings } from '../../src/lib/appMode.js'
import { STRENGTH_EXERCISES } from '../../src/lib/strength/exercises.js'

describe('hamstring staging parity', () => {
  it('has identical stage boundaries', () => {
    expect(SERVER_STAGES).toEqual(CLIENT_STAGES)
  })

  it('resolves the same stage at every week of a 22-week block', () => {
    for (let week = 1; week <= 22; week++) {
      expect(serverStageFor(week)).toEqual(clientStageFor(week))
    }
  })

  it('agrees at the boundaries specifically', () => {
    for (const week of [1, 4, 5, 12, 13]) {
      expect(serverStageFor(week).stage).toBe(clientStageFor(week).stage)
    }
  })
})

describe('block week parity', () => {
  const START = '2026-07-20'

  it('agrees across the block', () => {
    for (let offset = 0; offset < 160; offset += 3) {
      const d = new Date(`${START}T00:00:00`)
      d.setDate(d.getDate() + offset)
      expect(serverBlockWeek(START, d)).toBe(clientBlockWeek(START, d))
    }
  })

  it('agrees on the first day', () => {
    const d = new Date(`${START}T00:00:00`)
    expect(serverBlockWeek(START, d)).toBe(1)
    expect(clientBlockWeek(START, d)).toBe(1)
  })
})

describe('default injury flags parity', () => {
  it('matches the client defaults', () => {
    expect(DEFAULT_INJURY_FLAGS).toEqual(defaultStrengthSettings().injuryFlags)
  })
})

describe('blockable movement parity', () => {
  /** Every flag combination that can actually refuse a movement. */
  const FLAG_SETS = [
    [],
    ['highHamstring'],
    ['knee'],
    ['lowBack'],
    ['highHamstring', 'knee'],
    ['highHamstring', 'knee', 'tightHips', 'ankleMobility'],
    ['highHamstring', 'knee', 'lowBack', 'shoulder', 'tightHips', 'ankleMobility'],
  ]

  const isBlockable = (e) => {
    const d = e.demands || {}
    return ['moderate', 'high'].includes(d.hamstringStretch) || d.kneeFlexion === 'high' || d.axialLoad === 'high'
  }

  it('vendors exactly the catalogue entries that some flag can refuse', () => {
    const fromCatalogue = Object.values(STRENGTH_EXERCISES).filter(isBlockable).map((e) => e.id).sort()
    const vendored = BLOCKABLE_MOVEMENTS.map((m) => m.id).sort()
    expect(vendored).toEqual(fromCatalogue)
  })

  it('copies each entry\'s blocking demands verbatim from the catalogue', () => {
    for (const m of BLOCKABLE_MOVEMENTS) {
      const e = STRENGTH_EXERCISES[m.id]
      expect(e, `${m.id} missing from catalogue`).toBeTruthy()
      expect(m.shortName).toBe(e.shortName)
      expect(m.demands.hamstringStretch).toBe(e.demands.hamstringStretch ?? 'low')
      expect(m.demands.kneeFlexion).toBe(e.demands.kneeFlexion ?? 'low')
      expect(m.demands.axialLoad).toBe(e.demands.axialLoad ?? 'low')
    }
  })

  it('reaches the same verdict as the client engine at every week, for every flag set', () => {
    for (const injuryFlags of FLAG_SETS) {
      for (let blockWeek = 1; blockWeek <= 22; blockWeek++) {
        for (const m of BLOCKABLE_MOVEMENTS) {
          const client = isExerciseAllowed(STRENGTH_EXERCISES[m.id], { injuryFlags, blockWeek })
          const server = isMovementAllowed({ ...m.demands, shortName: m.shortName }, { injuryFlags, blockWeek })
          expect(
            server.allowed,
            `${m.id} @ week ${blockWeek} flags=[${injuryFlags}] — server ${server.allowed}, client ${client.allowed}`
          ).toBe(client.allowed)
        }
      }
    }
  })

  it('never refuses a movement the client engine permits', () => {
    for (const injuryFlags of FLAG_SETS) {
      for (let blockWeek = 1; blockWeek <= 22; blockWeek++) {
        for (const e of Object.values(STRENGTH_EXERCISES)) {
          if (isExerciseAllowed(e, { injuryFlags, blockWeek }).allowed === false) continue
          const hits = findBlockedMovements(e.name, { injuryFlags, blockWeek })
          expect(hits, `${e.name} @ week ${blockWeek} flags=[${injuryFlags}]`).toEqual([])
        }
      }
    }
  })
})

describe('findBlockedMovements', () => {
  const STAGE_1 = { injuryFlags: ['highHamstring', 'knee'], blockWeek: 1 }

  it('catches the movements the live model actually reached for', () => {
    for (const text of [
      'Add Back Extension (isometric hold)',
      'Glute-focused 45° Back Ext — round-back, hips only',
      'Romanian Deadlift, light',
      'program RDLs back in',
      'seated leg curls, partial range',
      'Good Mornings 3x10',
    ]) {
      expect(findBlockedMovements(text, STAGE_1), text).not.toEqual([])
    }
  })

  it('leaves stage-1-legal movements alone', () => {
    for (const text of [
      'Barbell Hip Thrust 4x8-12',
      'Lying Leg Curl — mid-range only',
      'Single-leg Glute Bridge',
      'Standing Calf Raise',
      'add a set of leg press',
      '+1 set, reduce load 10%',
    ]) {
      expect(findBlockedMovements(text, STAGE_1), text).toEqual([])
    }
  })

  it('does not let a longer name trip the rule for a shorter one nested in it', () => {
    // Staggered Stance RDL is moderate-stretch: legal from week 5, when a plain
    // RDL (high) is still excluded. Naive substring matching would block it.
    const atWeek5 = { injuryFlags: ['highHamstring'], blockWeek: 5 }
    expect(findBlockedMovements('Staggered Stance RDL', atWeek5)).toEqual([])
    expect(findBlockedMovements('Romanian Deadlift', atWeek5)).not.toEqual([])
  })

  it('releases movements as the stage advances, matching the engine', () => {
    const flags = ['highHamstring']
    expect(findBlockedMovements('45° Back Extension', { injuryFlags: flags, blockWeek: 1 })).not.toEqual([])
    expect(findBlockedMovements('45° Back Extension', { injuryFlags: flags, blockWeek: 5 })).toEqual([])
    expect(findBlockedMovements('Romanian Deadlift', { injuryFlags: flags, blockWeek: 5 })).not.toEqual([])
    expect(findBlockedMovements('Romanian Deadlift', { injuryFlags: flags, blockWeek: 13 })).toEqual([])
  })

  it('blocks nothing when no injury flags are set', () => {
    expect(findBlockedMovements('Romanian Deadlift and Good Mornings', { injuryFlags: [], blockWeek: 1 })).toEqual([])
  })
})

describe('deriveGuardrails', () => {
  const at = (weeks) => {
    const d = new Date('2026-07-20T00:00:00')
    d.setDate(d.getDate() + weeks * 7)
    return d
  }

  it('reports the stage matching the block week', () => {
    const profile = { strength: { blockStart: '2026-07-20', injuryFlags: ['highHamstring'] } }
    expect(deriveGuardrails(profile, at(0)).hamstringStage.stage).toBe(1)
    expect(deriveGuardrails(profile, at(5)).hamstringStage.stage).toBe(2)
    expect(deriveGuardrails(profile, at(13)).hamstringStage.stage).toBe(3)
  })

  it('reports no hamstring stage when the flag is absent', () => {
    const profile = { strength: { blockStart: '2026-07-20', injuryFlags: ['knee'] } }
    expect(deriveGuardrails(profile, at(0)).hamstringStage).toBeNull()
  })

  it('falls back to the default flags for a profile with none set', () => {
    expect(deriveGuardrails({}, at(0)).injuryFlags).toEqual(DEFAULT_INJURY_FLAGS)
  })

  it('never reports a block week below 1, even before the block starts', () => {
    const profile = { strength: { blockStart: '2026-07-20' } }
    expect(deriveGuardrails(profile, at(-4)).blockWeek).toBe(1)
  })

  it('reads flags from the profile rather than anything a client sent', () => {
    const profile = { strength: { blockStart: '2026-07-20', injuryFlags: ['lowBack'] } }
    expect(deriveGuardrails(profile, at(0)).injuryFlags).toEqual(['lowBack'])
  })
})
