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
} from '../src/coach/guardrails.js'

import {
  HAMSTRING_STAGES as CLIENT_STAGES,
  hamstringStageFor as clientStageFor,
} from '../../src/lib/strength/injuryGuardrails.js'
import { getBlockWeek as clientBlockWeek } from '../../src/lib/strength/strengthPeriodization.js'
import { defaultStrengthSettings } from '../../src/lib/appMode.js'

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
