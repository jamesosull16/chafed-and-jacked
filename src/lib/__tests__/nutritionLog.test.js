import { describe, it, expect, vi, beforeEach } from 'vitest'

const setDoc = vi.fn().mockResolvedValue(undefined)

vi.mock('firebase/firestore', () => ({
  setDoc: (...args) => setDoc(...args),
  arrayUnion: (value) => ({ union: value }),
  arrayRemove: (value) => ({ remove: value }),
}))

const { replaceLogEntry, findEntryById } = await import('../nutritionLog')

const REF = { path: 'nutritionLogs/2026-08-17' }
const PREVIOUS = { id: 'e1', label: 'Chicken and rice', kcal: 610 }
const NEXT = { id: 'e1', label: 'Chicken and rice', kcal: 480, editedAt: '2026-08-17T12:00:00.000Z' }

beforeEach(() => setDoc.mockClear())

describe('replaceLogEntry', () => {
  /**
   * The order is the whole point. If the second write never lands — a dropped
   * connection in a gym basement — the day shows the meal twice, which is
   * visible and deletable. The other order loses the meal outright.
   */
  it('adds the correction before removing what it replaces', async () => {
    await replaceLogEntry(REF, { previous: PREVIOUS, next: NEXT, dateId: '2026-08-17' })

    expect(setDoc).toHaveBeenCalledTimes(2)
    expect(setDoc.mock.calls[0][1].entries).toEqual({ union: NEXT })
    expect(setDoc.mock.calls[1][1].entries).toEqual({ remove: PREVIOUS })
  })

  // Array transforms, not a rewritten array: this document has two writers.
  it('merges rather than overwriting, and stamps the day', async () => {
    await replaceLogEntry(REF, { previous: PREVIOUS, next: NEXT, dateId: '2026-08-17' })
    expect(setDoc.mock.calls[0][0]).toBe(REF)
    expect(setDoc.mock.calls[0][1].date).toBe('2026-08-17')
    expect(setDoc.mock.calls[0][2]).toEqual({ merge: true })
  })

  /**
   * Writing a null over a stored target set is how a day loses the numbers it
   * was judged against — so targets are only written when there are some.
   */
  it('leaves the day’s targets alone unless given new ones', async () => {
    await replaceLogEntry(REF, { previous: PREVIOUS, next: NEXT, dateId: '2026-08-17' })
    expect(setDoc.mock.calls[0][1]).not.toHaveProperty('targets')

    setDoc.mockClear()
    const targets = { kcal: 2900, protein: 190, carbs: 330, fat: 90 }
    await replaceLogEntry(REF, { previous: PREVIOUS, next: NEXT, dateId: '2026-08-17', targets })
    expect(setDoc.mock.calls[0][1].targets).toEqual(targets)
  })

  it('writes nothing when there is no ref or nothing to replace', async () => {
    await replaceLogEntry(null, { previous: PREVIOUS, next: NEXT })
    await replaceLogEntry(REF, { previous: null, next: NEXT })
    await replaceLogEntry(REF, { previous: PREVIOUS, next: null })
    expect(setDoc).not.toHaveBeenCalled()
  })
})

describe('findEntryById', () => {
  it('finds the stored copy, which is what arrayRemove has to match', () => {
    const entries = [PREVIOUS, { id: 'e2' }]
    expect(findEntryById(entries, 'e1')).toBe(PREVIOUS)
    expect(findEntryById(entries, 'nope')).toBe(null)
    expect(findEntryById(entries, undefined)).toBe(null)
    expect(findEntryById(undefined, 'e1')).toBe(null)
  })
})
