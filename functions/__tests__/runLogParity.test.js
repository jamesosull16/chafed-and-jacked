/**
 * A run can now be logged two ways: from the running dashboard, and by telling
 * the coach. Both must produce the same `dailyMileage` document.
 *
 * If they drift, nothing throws — the day just gets a document in the other
 * shape, and weekly mileage, the coach's own context, and run calories all
 * quietly disagree depending on how the run happened to be entered. That is
 * the class of bug this file exists to make impossible.
 *
 * Same argument and same shape as guardrailParity.test.js.
 */
import { describe, it, expect } from 'vitest'

import { appendRun as serverAppendRun } from '../src/coach/training.js'
import { appendRun as clientAppendRun } from '../../src/lib/runLog.js'

const RUN = { miles: 5, enteredAt: '2026-07-31T12:00:00.000Z' }

describe('appendRun parity', () => {
  it('agrees on the first run of a day', () => {
    expect(serverAppendRun(null, RUN)).toEqual(clientAppendRun(null, RUN))
    expect(serverAppendRun(null, RUN)).toEqual({ runs: [RUN], miles: 5 })
  })

  it('agrees when appending to a day that already has runs', () => {
    const existing = { date: '2026-07-31', runs: [{ miles: 3, enteredAt: 'x' }], miles: 3 }
    expect(serverAppendRun(existing, RUN)).toEqual(clientAppendRun(existing, RUN))
    expect(serverAppendRun(existing, RUN).miles).toBe(8)
  })

  it('agrees on normalising a legacy bare-miles document', () => {
    // Documents written before the runs array existed carry only `miles`.
    // Dropping that instead of seeding from it loses a real run.
    const legacy = { date: '2026-07-31', miles: 4, enteredAt: 'earlier' }
    const server = serverAppendRun(legacy, RUN)

    expect(server).toEqual(clientAppendRun(legacy, RUN))
    expect(server.runs).toHaveLength(2)
    expect(server.runs[0]).toEqual({ miles: 4, enteredAt: 'earlier' })
    expect(server.miles).toBe(9)
  })

  it('agrees that an empty document is not a legacy one', () => {
    const empty = { date: '2026-07-31', runs: [], miles: 0 }
    expect(serverAppendRun(empty, RUN)).toEqual(clientAppendRun(empty, RUN))
    expect(serverAppendRun(empty, RUN).runs).toEqual([RUN])
  })

  it('does not mutate the stored document either side', () => {
    // addRun used to push into the array it read back from Firestore. Both
    // copies now build a new one; a shared mutation would be invisible here
    // but corrupt the caller's cached copy in the app.
    const existing = { date: '2026-07-31', runs: [{ miles: 3, enteredAt: 'x' }], miles: 3 }
    const before = JSON.stringify(existing)

    serverAppendRun(existing, RUN)
    clientAppendRun(existing, RUN)

    expect(JSON.stringify(existing)).toBe(before)
  })
})
