import { describe, it, expect } from 'vitest'
import { calculateProgression } from '../progression'
import { EXERCISES } from '../program'

/**
 * An assisted pull-up carries a negative load: bodyweight minus whatever the
 * machine holds up. The engine was written for plates, where zero is a floor,
 * and clamping there would wipe the assistance he actually needs.
 */
describe('progression with machine assistance', () => {
  const [id, def] = Object.entries(EXERCISES).find(([, d]) => d.bodyweightLoad && d.weightIncrement)
  const [minRep, maxRep] = def.repRange

  it('withdraws assistance when every set hits the top of the range', () => {
    const { nextWeight, direction } = calculateProgression(
      id,
      Array(3).fill(maxRep),
      -60
    )
    expect(direction).toBe('up')
    // Toward zero is toward doing it unassisted.
    expect(nextWeight).toBeGreaterThan(-60)
    expect(nextWeight).toBeLessThanOrEqual(0)
  })

  it('deepens assistance on a missed set instead of clamping it away', () => {
    const { nextWeight, reason } = calculateProgression(
      id,
      [maxRep, minRep - 1],
      -60
    )
    // The bug this covers: Math.max(0, …) turned "he needs more help" into
    // "he now does them unassisted".
    expect(nextWeight).toBeLessThan(-60)
    expect(reason).toMatch(/assistance/)
  })

  it('still floors an ordinary loaded lift at zero', () => {
    const { nextWeight } = calculateProgression(id, [maxRep, minRep - 1], 2)
    expect(nextWeight).toBe(0)
  })
})
