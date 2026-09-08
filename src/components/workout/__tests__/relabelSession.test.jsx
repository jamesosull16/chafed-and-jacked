// @vitest-environment jsdom

/**
 * The relabel control, and the review render it sits on.
 *
 * Two things here have never been exercised together. Review now resolves the
 * logged document by id and builds its prescription from that document's own
 * split rather than from the `day` in the URL — those disagree the moment a
 * session is relabelled, which is the entire point. And a relabel can leave the
 * prescription describing a different session than the one that was logged, so
 * the sets have to survive it: silently dropping logged work off the screen is
 * the one failure a review screen cannot have.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { buildSession, getSplitLabels } from '../../../lib/strength/strengthProgram'
import { getBlockStatus } from '../../../lib/strength/strengthPeriodization'

const BLOCK = { blockStart: '2026-07-20', blockEnd: '2026-12-20' }
const STATUS = getBlockStatus(BLOCK.blockStart, BLOCK.blockEnd, new Date('2026-07-22T09:00:00'))
const ATHLETE = { injuryFlags: [], equipment: 'fullGym', daysPerWeek: 4 }

const build = (splitIndex) => buildSession({ ...ATHLETE, splitIndex, blockStatus: STATUS })

const relabelSession = vi.fn()
let block

vi.mock('../../../hooks/useStrengthBlock', () => ({
  useStrengthBlock: () => block,
}))

const { default: StrengthSession } = await import('../StrengthSession')

/** A posterior session as saveSession stores one, with two exercises logged. */
function loggedPosterior() {
  const prescribed = build(0)
  return {
    id: 'sess1',
    mode: 'strength',
    completed: true,
    date: '2026-07-21T12:00:00.000Z',
    splitIndex: 0,
    dayId: 'lowerPosterior',
    name: 'Lower — Posterior',
    exercises: prescribed.exercises.slice(0, 2).map((ex) => ({
      id: ex.id,
      sets: [{ weight: 155, reps: 10, rir: 3, completed: true }],
    })),
  }
}

function setBlock({ session = loggedPosterior(), splitIndex = 0 } = {}) {
  block = {
    loading: false,
    todaysSession: null,
    getSession: (i) => build(i),
    saveSession: vi.fn(),
    updateSession: vi.fn(),
    relabelSession,
    splitLabels: getSplitLabels(4),
    weekSchedule: [],
    getWeekSchedule: () => ({ days: [] }),
    sessions: [{ ...session, splitIndex }],
    bodyMetrics: [{ weight: 178 }],
  }
}

let container
let root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  relabelSession.mockClear()
  setBlock()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const review = (query = 'day=0&review=1&session=sess1') =>
  act(() =>
    root.render(
      <MemoryRouter>
        <StrengthSession searchParams={new URLSearchParams(query)} />
      </MemoryRouter>
    )
  )

const chips = () =>
  [...container.querySelectorAll('button')].filter((b) =>
    getSplitLabels(4).some((l) => l.name === b.textContent)
  )

describe('reviewing a logged session', () => {
  it('opens the session named in the URL, with its logged sets on screen', () => {
    review()
    expect(container.querySelector('h1').textContent).toBe('Lower — Posterior')
    expect(container.textContent).toMatch(/Counts as/)
    // An exercise reporting rows done. Review used to open as an empty form:
    // the prescription rendered with `readOnly` set and no sets ever loaded, so
    // every counter read 0.
    expect(container.textContent).toMatch(/1\/[1-9]/)
    expect(container.textContent).toMatch(/Save changes/)
  })

  it('follows the document rather than the day param when they disagree', () => {
    // A relabelled session: stored as pull, still reached through a link that
    // was built when it was a posterior day. The document wins.
    setBlock({ splitIndex: 3 })
    review('day=0&review=1&session=sess1')
    expect(container.querySelector('h1').textContent).toBe('Upper — Pull')
  })

  it('keeps every logged set visible after a relabel', () => {
    // A pull day prescribes none of the posterior work that was actually
    // logged. Those sets must still be on screen and still editable — dropping
    // them is the one failure a review screen cannot have.
    const session = loggedPosterior()
    setBlock({ session, splitIndex: 3 })
    review('day=0&review=1&session=sess1')

    const posterior = build(0)
    for (const logged of session.exercises) {
      const name = posterior.exercises.find((e) => e.id === logged.id).name
      expect(container.textContent, `${name} vanished off the review`).toContain(name)
    }
    // And the pull prescription it now counts as is there alongside them.
    expect(container.textContent).toContain(build(3).exercises[0].name)
  })
})

describe('the relabel control', () => {
  it('offers every session in the split, with the current one held down', () => {
    review()
    expect(chips().map((b) => b.textContent)).toEqual(getSplitLabels(4).map((l) => l.name))

    const active = chips().filter((b) => b.getAttribute('aria-pressed') === 'true')
    expect(active).toHaveLength(1)
    expect(active[0].textContent).toBe('Lower — Posterior')
    expect(active[0].disabled).toBe(true)
  })

  it('relabels the logged document, not the day in the URL', () => {
    review()
    act(() => chips().find((b) => b.textContent === 'Upper — Pull').click())
    expect(relabelSession).toHaveBeenCalledWith('sess1', 3)
  })

  it('says what a relabel does and does not touch', () => {
    review()
    expect(container.textContent).toMatch(/The sets stay as logged/)
  })

  it('is absent when there is nothing logged to relabel', () => {
    block.sessions = []
    review('day=0')
    expect(container.textContent).not.toMatch(/Counts as/)
    expect(chips()).toHaveLength(0)
  })
})
