import { describe, it, expect } from 'vitest'
import { getMobilityBlock, BASE_TARGETS, MOBILITY_DRILLS } from '../mobility'

const names = (block) => block.drills.map((d) => d.name)

describe('getMobilityBlock', () => {
  /**
   * Selection came only from the injury flags, so an athlete with none got a
   * single thoracic rotation — the hips and ankles a runner actually needs
   * dropped out, and so did the cossack squat.
   */
  it('prescribes real mobility work for an athlete with no flags', () => {
    const block = getMobilityBlock({ injuryFlags: [], emphasis: 'hipRotation' })
    expect(block.drills.length).toBeGreaterThanOrEqual(3)

    const covered = new Set(block.drills.flatMap((d) => d.targets))
    expect(covered.has('hipRotation')).toBe(true)
  })

  it('rotates weekly rather than per mesocycle', () => {
    const week = (blockWeek) =>
      names(getMobilityBlock({ injuryFlags: [], emphasis: 'hipRotation', blockWeek }))

    expect(week(1)).not.toEqual(week(2))
    // Two weeks inside one mesocycle already differ — the point of the change.
    expect(week(2)).not.toEqual(week(3))
  })

  it('leads with the day’s emphasis', () => {
    const ankleDay = getMobilityBlock({ injuryFlags: [], emphasis: 'ankleDorsiflexion' })
    expect(ankleDay.drills[0].targets).toContain('ankleDorsiflexion')

    const tSpineDay = getMobilityBlock({ injuryFlags: [], emphasis: 'tSpine' })
    expect(tSpineDay.drills[0].targets).toContain('tSpine')
  })

  it('still weights the targets a flag argues for', () => {
    const block = getMobilityBlock({ injuryFlags: ['ankleMobility'], emphasis: null })
    const covered = new Set(block.drills.flatMap((d) => d.targets))
    expect(covered.has('ankleDorsiflexion')).toBe(true)
  })

  it('stays inside its time budget and never repeats a drill', () => {
    for (let blockWeek = 1; blockWeek <= 12; blockWeek++) {
      for (const emphasis of [...BASE_TARGETS, null]) {
        const block = getMobilityBlock({ injuryFlags: [], emphasis, minutes: 8, blockWeek })
        expect(block.totalSeconds).toBeLessThanOrEqual(8 * 60)
        const ids = block.drills.map((d) => d.id)
        expect(new Set(ids).size).toBe(ids.length)
      }
    }
  })

  it('offers a second drill for every target a warm-up can cover', () => {
    // Rotation is only rotation where the pool has somewhere to go. `tSpine`
    // and `hipFlexors` each had exactly one warm-up drill before this.
    for (const target of BASE_TARGETS) {
      const pool = Object.values(MOBILITY_DRILLS).filter(
        (d) => d.slot === 'warmup' && d.targets.includes(target)
      )
      expect(pool.length, `${target} has nothing to rotate to`).toBeGreaterThanOrEqual(2)
    }
  })
})
