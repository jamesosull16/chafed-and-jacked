// @vitest-environment jsdom

/**
 * Mount tests for the week schedule, now that a row is a session rather than a
 * weekday.
 *
 * The card used to render one row per training day and could assume every row
 * had a date, a split and a name. None of that is true any more: a missed day
 * carries no split, a session with nowhere left to go carries no date, and a
 * completed day is named by the session that was logged rather than by the
 * rota. Each of those is a null the old markup would have walked straight into,
 * and this repo has shipped exactly that kind of break before — see the note at
 * the top of loadAndTrend.test.jsx.
 *
 * The first case is the state James actually hit: Monday's session trained on
 * Tuesday, which is what the whole reflow exists for.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import WeekSchedule from '../WeekSchedule'
import { buildWeekSchedule } from '../../../lib/strength/strengthProgram'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const BLOCK = { blockStart: '2026-07-20', blockEnd: '2026-12-20' }
// A Wednesday in block week 1, so the week has days on both sides of today.
const NOW = new Date('2026-07-22T09:00:00')

const DAY_IDS = ['lowerPosterior', 'upperPush', 'lowerQuad', 'upperPull']
const NAMES = ['Lower — Posterior', 'Upper — Push', 'Lower — Quad & Glute', 'Upper — Pull']

const logged = (date, splitIndex, id = 'sess1') => ({
  id,
  mode: 'strength',
  completed: true,
  date: `${date}T12:00:00.000Z`,
  splitIndex,
  dayId: DAY_IDS[splitIndex],
  name: NAMES[splitIndex],
})

const getWeek =
  (sessions = [], now = NOW) =>
  (weekOffset) =>
    buildWeekSchedule({
      trainingDayIndices: [1, 2, 4, 5],
      trainingDaysPerWeek: 4,
      sessions,
      weekOffset,
      now,
      ...BLOCK,
    })

let container
let root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (ui) => act(() => root.render(<MemoryRouter>{ui}</MemoryRouter>))

const rowText = () =>
  [...container.querySelectorAll('a, .divide-y > div')].map((el) => el.textContent)

describe('WeekSchedule', () => {
  it('shows a session on the day it was trained, not the day it was planned', () => {
    // Monday missed, Monday's session done on Tuesday. The old card called
    // Tuesday "Upper — Push" and refused to mark it done.
    render(<WeekSchedule getWeek={getWeek([logged('2026-07-21', 0)])} />)

    const rows = rowText()
    expect(rows[0]).toMatch(/Missed/)
    expect(rows[1]).toMatch(/Lower — Posterior/)
    expect(rows[1]).toMatch(/Done/)
    // And the rest of the week has slid down rather than losing a session.
    expect(rows[2]).toMatch(/Upper — Push/)
    expect(rows[3]).toMatch(/Lower — Quad & Glute/)
    expect(rows[4]).toMatch(/Upper — Pull/)
  })

  it('links a completed day to its own document rather than to a split index', () => {
    render(<WeekSchedule getWeek={getWeek([logged('2026-07-21', 0)])} />)
    const done = [...container.querySelectorAll('a')].find((a) =>
      a.textContent.includes('Done')
    )
    expect(done.getAttribute('href')).toContain('review=1')
    expect(done.getAttribute('href')).toContain('session=sess1')
  })

  it('renders a missed day as dead, with nowhere to tap through to', () => {
    render(<WeekSchedule getWeek={getWeek([logged('2026-07-21', 0)])} />)
    const missed = [...container.querySelectorAll('a')].filter((a) =>
      a.textContent.includes('Missed')
    )
    expect(missed).toHaveLength(0)
    expect(container.textContent).toMatch(/Missed/)
  })

  it('flags a catch-up day so it does not read as a training day he forgot', () => {
    // Nothing trained by Wednesday: four sessions owed, three weekdays left.
    render(<WeekSchedule getWeek={getWeek()} />)
    expect(container.textContent).toMatch(/Catch-up/)
  })

  it('finishes the week inside the working week when it can', () => {
    // James's week: Monday missed, trained Tuesday, three sessions owed and
    // Wednesday free. Nothing should land on the weekend — the earlier build
    // put Upper — Pull on Saturday with Wednesday empty.
    render(
      <WeekSchedule
        getWeek={getWeek([logged('2026-07-21', 0)], new Date('2026-07-21T18:00:00'))}
      />
    )

    const rows = rowText()
    expect(rows).toHaveLength(5)
    expect(rows.at(-1)).toMatch(/Upper — Pull/)
    // One borrowed weekday, and no Saturday or Sunday row at all.
    expect(container.textContent.match(/Catch-up/g)).toHaveLength(1)
    expect(container.textContent).not.toMatch(/Sa|Su/)
  })

  it('survives a session the week has run out of days for', () => {
    // Asked on the Sunday having trained nothing: rows with no date at all,
    // which is the shape most likely to throw on `date.toLocaleDateString`.
    render(<WeekSchedule getWeek={getWeek([], new Date('2026-07-26T09:00:00'))} />)
    expect(container.textContent).toMatch(/No day left/)
  })

  it('marks today and renders a week that has gone entirely to plan', () => {
    const onPlan = [
      logged('2026-07-20', 0, 'a'),
      logged('2026-07-21', 1, 'b'),
    ]
    render(<WeekSchedule getWeek={getWeek(onPlan)} />)

    const rows = rowText()
    expect(rows).toHaveLength(4)
    expect(container.textContent).not.toMatch(/Missed|Catch-up|No day left/)
    // Wednesday is a rest day and the week still has Thursday and Friday, so
    // nothing should have been dragged forward onto it.
    expect(rows[2]).toMatch(/Lower — Quad & Glute/)
    expect(rows[3]).toMatch(/Upper — Pull/)
  })

  it('renders a future week as the plan, with no completion or catch-up on it', () => {
    render(<WeekSchedule getWeek={getWeek([logged('2026-07-21', 0)])} />)
    act(() => {
      container.querySelector('[aria-label="Next week"]').click()
    })

    expect(container.textContent).toMatch(/Next Week/)
    expect(container.textContent).not.toMatch(/Done|Missed|Catch-up/)
    expect(rowText()).toHaveLength(4)
  })
})
