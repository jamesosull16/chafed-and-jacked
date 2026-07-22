import { describe, it, expect } from 'vitest'
import {
  isExerciseAllowed,
  allowedExercises,
  hamstringStageFor,
  substituteFor,
  activeGuardrails,
} from '../injuryGuardrails'
import { STRENGTH_EXERCISES } from '../exercises'

const HIGH_STRETCH_MOVEMENTS = ['romanianDeadlift', 'goodMorning']
const MODERATE_STRETCH_MOVEMENTS = ['staggeredStanceRDL', 'seatedLegCurl', 'backExtension45']

describe('hamstringStageFor', () => {
  it('is stage 1 for the first four weeks', () => {
    expect(hamstringStageFor(1).stage).toBe(1)
    expect(hamstringStageFor(4).stage).toBe(1)
  })

  it('moves to stage 2 at week 5 and stage 3 at week 13', () => {
    expect(hamstringStageFor(5).stage).toBe(2)
    expect(hamstringStageFor(12).stage).toBe(2)
    expect(hamstringStageFor(13).stage).toBe(3)
    expect(hamstringStageFor(22).stage).toBe(3)
  })
})

describe('high hamstring strain — lengthened loading is blocked early', () => {
  const flags = ['highHamstring']

  it.each(HIGH_STRETCH_MOVEMENTS)('blocks %s in stage 1', (id) => {
    const verdict = isExerciseAllowed(STRENGTH_EXERCISES[id], { injuryFlags: flags, blockWeek: 1 })
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toMatch(/proximal hamstring/i)
  })

  it.each(HIGH_STRETCH_MOVEMENTS)('still blocks %s in stage 2 (week 8)', (id) => {
    expect(
      isExerciseAllowed(STRENGTH_EXERCISES[id], { injuryFlags: flags, blockWeek: 8 }).allowed
    ).toBe(false)
  })

  it.each(HIGH_STRETCH_MOVEMENTS)('permits %s from week 13, with a reintroduction note', (id) => {
    const verdict = isExerciseAllowed(STRENGTH_EXERCISES[id], { injuryFlags: flags, blockWeek: 13 })
    expect(verdict.allowed).toBe(true)
    expect(verdict.modification).toMatch(/60%|build back/i)
  })

  it.each(MODERATE_STRETCH_MOVEMENTS)('blocks %s in stage 1 but allows it from week 5', (id) => {
    expect(
      isExerciseAllowed(STRENGTH_EXERCISES[id], { injuryFlags: flags, blockWeek: 1 }).allowed
    ).toBe(false)
    const later = isExerciseAllowed(STRENGTH_EXERCISES[id], { injuryFlags: flags, blockWeek: 5 })
    expect(later.allowed).toBe(true)
    expect(later.modification).toMatch(/tolerance/i)
  })

  it('allows the low-stretch glute and hamstring work from week 1', () => {
    for (const id of ['barbellHipThrust', 'gluteBridge', 'lyingLegCurl', 'hamstringBridgeIsometric']) {
      expect(
        isExerciseAllowed(STRENGTH_EXERCISES[id], { injuryFlags: flags, blockWeek: 1 }).allowed
      ).toBe(true)
    }
  })

  it('distinguishes lying from seated leg curl — hip position is the whole point', () => {
    const ctx = { injuryFlags: flags, blockWeek: 2 }
    expect(isExerciseAllowed(STRENGTH_EXERCISES.lyingLegCurl, ctx).allowed).toBe(true)
    expect(isExerciseAllowed(STRENGTH_EXERCISES.seatedLegCurl, ctx).allowed).toBe(false)
  })

  it('never surfaces a high-stretch movement in the stage-1 allowed set', () => {
    const allowed = allowedExercises({ injuryFlags: flags, blockWeek: 1 })
    const ids = allowed.map((e) => e.id)
    for (const banned of [...HIGH_STRETCH_MOVEMENTS, ...MODERATE_STRETCH_MOVEMENTS]) {
      expect(ids).not.toContain(banned)
    }
  })

  it('imposes no hamstring restriction when the flag is absent', () => {
    for (const id of HIGH_STRETCH_MOVEMENTS) {
      expect(isExerciseAllowed(STRENGTH_EXERCISES[id], { injuryFlags: [], blockWeek: 1 }).allowed).toBe(
        true
      )
    }
  })
})

describe('knee flag', () => {
  const flags = ['knee']

  it('blocks deep-knee-flexion movements outright', () => {
    expect(
      isExerciseAllowed(STRENGTH_EXERCISES.barbellBackSquat, { injuryFlags: flags }).allowed
    ).toBe(false)
    expect(isExerciseAllowed(STRENGTH_EXERCISES.nordicCurl, { injuryFlags: flags }).allowed).toBe(
      false
    )
  })

  it('keeps leg press and hack squat available with a ROM cap', () => {
    for (const id of ['legPress', 'hackSquat']) {
      const verdict = isExerciseAllowed(STRENGTH_EXERCISES[id], { injuryFlags: flags })
      expect(verdict.allowed).toBe(true)
      expect(verdict.modification).toMatch(/pain-free|depth/i)
    }
  })

  it('leaves the tendon-friendly options unrestricted', () => {
    for (const id of ['spanishSquat', 'legExtension']) {
      expect(isExerciseAllowed(STRENGTH_EXERCISES[id], { injuryFlags: flags }).allowed).toBe(true)
    }
  })
})

describe('ankle and hip flags', () => {
  it('never blocks on ankle mobility — it modifies', () => {
    const verdict = isExerciseAllowed(STRENGTH_EXERCISES.gobletSquat, {
      injuryFlags: ['ankleMobility'],
    })
    expect(verdict.allowed).toBe(true)
    expect(verdict.modification).toMatch(/heel-elevated/i)
  })

  it('adds hip prep to squat and lunge patterns', () => {
    const verdict = isExerciseAllowed(STRENGTH_EXERCISES.bulgarianSplitSquat, {
      injuryFlags: ['tightHips'],
    })
    expect(verdict.allowed).toBe(true)
    expect(verdict.modification).toMatch(/hip flexor/i)
  })
})

describe('substituteFor', () => {
  it('offers a permitted stand-in for a blocked hinge', () => {
    const sub = substituteFor(STRENGTH_EXERCISES.romanianDeadlift, {
      injuryFlags: ['highHamstring'],
      blockWeek: 1,
    })
    expect(sub).toBeTruthy()
    expect(
      isExerciseAllowed(sub, { injuryFlags: ['highHamstring'], blockWeek: 1 }).allowed
    ).toBe(true)
  })

  it('respects equipment limits', () => {
    const sub = substituteFor(STRENGTH_EXERCISES.romanianDeadlift, {
      injuryFlags: ['highHamstring'],
      blockWeek: 1,
      equipment: 'minimal',
    })
    expect(sub.equipmentLevel).toBe('minimal')
  })
})

describe('activeGuardrails', () => {
  it('reports the current hamstring stage and when range progresses', () => {
    const g = activeGuardrails({ injuryFlags: ['highHamstring'], blockWeek: 3 })
    const ham = g.find((x) => x.id === 'highHamstring')
    expect(ham.title).toMatch(/stage 1 of 3/i)
    expect(ham.note).toMatch(/week 5/)
  })

  it('is empty for an athlete with no flags', () => {
    expect(activeGuardrails({ injuryFlags: [], blockWeek: 1 })).toEqual([])
  })
})
