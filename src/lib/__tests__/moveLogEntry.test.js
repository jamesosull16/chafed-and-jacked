/**
 * Moving a logged meal to the day it was actually eaten.
 *
 * The case that prompted it: a sandwich eaten on the 4th looked like it had
 * failed to log, so it was logged again and landed on the 5th. Correcting that
 * means moving an entry between two documents, which is a different and more
 * dangerous operation than editing one in place.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const batchOps = []
const commit = vi.fn(async () => {})

vi.mock('firebase/firestore', () => ({
  setDoc: vi.fn(async () => {}),
  writeBatch: vi.fn(() => ({
    set: (ref, data, opts) => batchOps.push({ ref: ref.path, data, opts }),
    commit,
  })),
  arrayUnion: (v) => ({ __op: 'arrayUnion', value: v }),
  arrayRemove: (v) => ({ __op: 'arrayRemove', value: v }),
}))

const { moveLogEntry, retimeEntryTo, logDateIdFor } = await import('../nutritionLog')

const ref = (path) => ({ path, firestore: {} })
const ENTRY = {
  id: 'e1',
  label: 'The Kind 12"',
  kcal: 950,
  // 7:15pm on the 5th, local.
  loggedAt: new Date(2026, 8, 5, 19, 15, 0).toISOString(),
}

beforeEach(() => {
  batchOps.length = 0
  commit.mockClear()
})

describe('retimeEntryTo', () => {
  it('moves the date and keeps the time of day', () => {
    const moved = retimeEntryTo(ENTRY, '2026-09-04')
    const at = new Date(moved.loggedAt)
    expect(at.getFullYear()).toBe(2026)
    expect(at.getMonth()).toBe(8)
    expect(at.getDate()).toBe(4)
    // A meal eaten at 7:15pm was still eaten at 7:15pm.
    expect(at.getHours()).toBe(19)
    expect(at.getMinutes()).toBe(15)
  })

  it('makes the entry resolve to its new day', () => {
    // The whole reason `loggedAt` has to move: this is what every lookup uses.
    expect(logDateIdFor(ENTRY)).toBe('2026-09-05')
    expect(logDateIdFor(retimeEntryTo(ENTRY, '2026-09-04'))).toBe('2026-09-04')
  })

  it('uses noon when the entry has no time to keep', () => {
    // Midnight-adjacent times are the ones that land on the wrong day under a
    // timezone or DST shift, so an entry with nothing to preserve gets noon.
    const moved = retimeEntryTo({ id: 'x' }, '2026-09-04')
    expect(new Date(moved.loggedAt).getHours()).toBe(12)
    expect(logDateIdFor(moved)).toBe('2026-09-04')
  })

  it('survives a stored time that is not a date', () => {
    const moved = retimeEntryTo({ id: 'x', loggedAt: 'not a date' }, '2026-09-04')
    expect(logDateIdFor(moved)).toBe('2026-09-04')
  })

  it('crosses a month boundary without drifting', () => {
    const endOfMonth = { id: 'x', loggedAt: new Date(2026, 8, 1, 8, 30, 0).toISOString() }
    expect(logDateIdFor(retimeEntryTo(endOfMonth, '2026-08-31'))).toBe('2026-08-31')
  })

  it('leaves the entry alone given a malformed target day', () => {
    expect(retimeEntryTo(ENTRY, 'yesterday')).toBe(ENTRY)
  })

  it('keeps everything else about the meal', () => {
    const moved = retimeEntryTo(ENTRY, '2026-09-04')
    expect(moved.id).toBe('e1')
    expect(moved.kcal).toBe(950)
    expect(moved.label).toBe('The Kind 12"')
    expect(moved.movedAt).toBeTruthy()
  })
})

describe('moveLogEntry', () => {
  it('writes both days in one batch', () => {
    // Atomic on purpose. Sequencing by hand leaves a phone that loses signal
    // mid-move holding the meal on two days, and across two days a duplicate
    // is far harder to notice than the same-document case.
    return moveLogEntry({
      fromRef: ref('nutritionLogs/2026-09-05'),
      toRef: ref('nutritionLogs/2026-09-04'),
      entry: ENTRY,
      toDateId: '2026-09-04',
    }).then(() => {
      expect(commit).toHaveBeenCalledTimes(1)
      expect(batchOps).toHaveLength(2)
    })
  })

  it('adds to the destination before removing from the source', async () => {
    await moveLogEntry({
      fromRef: ref('nutritionLogs/2026-09-05'),
      toRef: ref('nutritionLogs/2026-09-04'),
      entry: ENTRY,
      toDateId: '2026-09-04',
    })
    expect(batchOps[0].data.entries.__op).toBe('arrayUnion')
    expect(batchOps[1].data.entries.__op).toBe('arrayRemove')
  })

  it('removes exactly what was stored, not the re-dated copy', async () => {
    // `arrayRemove` matches whole objects. Removing the moved copy would leave
    // the original on the old day and duplicate the meal.
    await moveLogEntry({
      fromRef: ref('nutritionLogs/2026-09-05'),
      toRef: ref('nutritionLogs/2026-09-04'),
      entry: ENTRY,
      toDateId: '2026-09-04',
    })
    expect(batchOps[1].data.entries.value).toBe(ENTRY)
    expect(batchOps[0].data.entries.value.loggedAt).not.toBe(ENTRY.loggedAt)
  })

  it('names the destination day and merges, so a day with no document gets one', async () => {
    await moveLogEntry({
      fromRef: ref('nutritionLogs/2026-09-05'),
      toRef: ref('nutritionLogs/2026-09-04'),
      entry: ENTRY,
      toDateId: '2026-09-04',
    })
    expect(batchOps[0].data.date).toBe('2026-09-04')
    expect(batchOps[0].opts).toEqual({ merge: true })
  })

  it('never stamps targets onto the destination day', async () => {
    // A past day's targets depend on that day's weight and training. Copying
    // today's across would invent a number the day was never judged against.
    await moveLogEntry({
      fromRef: ref('nutritionLogs/2026-09-05'),
      toRef: ref('nutritionLogs/2026-09-04'),
      entry: ENTRY,
      toDateId: '2026-09-04',
    })
    expect(batchOps[0].data.targets).toBeUndefined()
  })

  it('does nothing when the day has not actually changed', async () => {
    const result = await moveLogEntry({
      fromRef: ref('nutritionLogs/2026-09-05'),
      toRef: ref('nutritionLogs/2026-09-05'),
      entry: ENTRY,
      toDateId: '2026-09-05',
    })
    expect(result).toBeNull()
    expect(commit).not.toHaveBeenCalled()
  })

  it('does nothing when anything it needs is missing', async () => {
    const base = {
      fromRef: ref('a'),
      toRef: ref('b'),
      entry: ENTRY,
      toDateId: '2026-09-04',
    }
    for (const missing of ['fromRef', 'toRef', 'entry', 'toDateId']) {
      expect(await moveLogEntry({ ...base, [missing]: null })).toBeNull()
    }
    expect(commit).not.toHaveBeenCalled()
  })
})
