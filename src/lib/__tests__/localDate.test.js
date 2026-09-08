/**
 * Which calendar day a stored record belongs to.
 *
 * Both directions of this are a real bug that shipped. Reading a session's day
 * off the UTC prefix of its timestamp files an evening workout on tomorrow for
 * anyone west of Greenwich; handing a bare `YYYY-MM-DD` to `new Date()` parses
 * it as UTC midnight and files it on yesterday. The assertions below are
 * written to hold in every timezone, because that is the only kind that can
 * catch a timezone bug in CI.
 */
import { describe, it, expect } from 'vitest'
import { formatLocalDate, sessionDayId } from '../localDate'

describe('sessionDayId', () => {
  it('resolves a stored timestamp to the local day it happened on', () => {
    const iso = '2026-09-09T01:30:00.000Z'
    expect(sessionDayId(iso)).toBe(formatLocalDate(new Date(iso)))
  })

  it('leaves a bare day id exactly as it is', () => {
    // The date the athlete was on is already encoded. Round-tripping it through
    // `new Date()` reads it as UTC midnight and walks it backwards a day.
    for (const day of ['2026-01-01', '2026-07-22', '2026-12-31']) {
      expect(sessionDayId(day)).toBe(day)
    }
  })

  it('reads midnight-adjacent instants as the day the athlete was in', () => {
    // Every hour of one UTC day maps onto at most two local days, and each one
    // has to agree with the local calendar rather than with the UTC prefix.
    for (let hour = 0; hour < 24; hour++) {
      const at = new Date(Date.UTC(2026, 8, 9, hour, 0, 0))
      expect(sessionDayId(at.toISOString())).toBe(formatLocalDate(at))
    }
  })

  it('returns null rather than a wrong day for something it cannot read', () => {
    expect(sessionDayId(null)).toBeNull()
    expect(sessionDayId(undefined)).toBeNull()
    expect(sessionDayId('')).toBeNull()
    expect(sessionDayId('not a date')).toBeNull()
  })
})
